#!/usr/bin/env bash
# ============================================================================
# Front-door staging probe (Stage 5, Task 1)
# ============================================================================
# Proves, over REST as the AUTHENTICATED smoke user (RLS reality, not
# service-role fiction), the exact behaviors mobile/src/lib/supabase/
# frontDoor.ts is built on:
#
#   1. create-with-core            -> engine-generated name/tier/fingerprint
#   2. duplicate create            -> raw 23505 on exercises_fingerprint_key
#                                     (the TS mapping to DuplicateExerciseError
#                                      is unit-tested; the shell probes the raw
#                                      REST error the mapper consumes)
#   3. custom name                 -> survives with name_is_custom=true
#   4. update an attribute         -> stored name + fingerprint follow
#   5. equipment junction insert   -> recompute fires (fingerprint gains the id)
#   6. C1 reproduction             -> delete-first equipment swap collides with
#                                     the row's own parent (raw 23505);
#                                     insert-before-delete succeeds — the order
#                                     the front door uses
#   7. cleanup                     -> probe rows deleted, row count restored
#
# Local staging only. Never points at live.
set -euo pipefail

API_URL="http://127.0.0.1:56321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:56322/postgres"
SMOKE_EMAIL="smoke@test.local"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-smoke-probe-password}"
SLUG_PREFIX="zzprobe-fd"

cd "$(dirname "$0")/../.."

fail() { echo "PROBE FAIL: $*" >&2; exit 1; }

json_get() { # json_get '<json>' <dotted.path>  (prints empty for null/missing)
  python3 -c '
import json, sys
doc = json.loads(sys.argv[1])
for part in sys.argv[2].split("."):
    if isinstance(doc, list):
        doc = doc[int(part)]
    else:
        doc = doc.get(part)
    if doc is None:
        break
print("" if doc is None else doc)
' "$1" "$2"
}

echo "== keys from supabase status =="
STATUS_JSON="$(npx supabase status --output json 2>/dev/null)"
ANON_KEY="$(json_get "$STATUS_JSON" ANON_KEY)"
SERVICE_KEY="$(json_get "$STATUS_JSON" SERVICE_ROLE_KEY)"
[ -n "$ANON_KEY" ] && [ -n "$SERVICE_KEY" ] || fail "could not read keys from supabase status"

# Local-staging-only provisioning: pin the smoke user's password so the probe
# can sign in (GoTrue admin API; the smoke user exists on staging only).
SMOKE_UID="$(psql "$DB_URL" -Atc "select id from auth.users where email='${SMOKE_EMAIL}'")"
[ -n "$SMOKE_UID" ] || fail "smoke user ${SMOKE_EMAIL} not found on staging"
curl -sf -X PUT "$API_URL/auth/v1/admin/users/$SMOKE_UID" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$SMOKE_PASSWORD\"}" >/dev/null || fail "could not pin smoke password"

TOKEN="$(curl -sf -X POST "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
[ -n "$TOKEN" ] || fail "smoke sign-in failed"
echo "signed in as $SMOKE_EMAIL ($SMOKE_UID)"

REST="$API_URL/rest/v1"
auth_get()    { curl -s  "$REST/$1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN"; }
auth_post()   { curl -s -X POST "$REST/$1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Prefer: return=representation" -d "$2"; }
auth_patch()  { curl -s -X PATCH "$REST/$1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2"; }
auth_delete() { curl -s -X DELETE "$REST/$1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Prefer: return=representation"; }

cleanup() {
  [ -n "${TOKEN:-}" ] && auth_delete "exercises?slug=like.${SLUG_PREFIX}-*" >/dev/null || true
}
trap cleanup EXIT

echo
echo "== dictionary lookups =="
CORE_ID="$(json_get "$(auth_get 'exercises?slug=eq.bench-press&is_core=eq.true&select=id')" 0.id)"
INCLINE_ID="$(json_get "$(auth_get 'bench_angles?name=eq.Incline&select=id')" 0.id)"
FLAT_ID="$(json_get "$(auth_get 'bench_angles?name=eq.Flat&select=id')" 0.id)"
DECLINE_ID="$(json_get "$(auth_get 'bench_angles?name=eq.Decline&select=id')" 0.id)"
KNEELING_ID="$(json_get "$(auth_get 'stances?name=eq.Kneeling&select=id')" 0.id)"
SPLIT_ID="$(json_get "$(auth_get 'stances?name=eq.Split&select=id')" 0.id)"
BANDS_ID="$(json_get "$(auth_get 'equipment?name=eq.Bands&select=id')" 0.id)"
BAR_ID="$(json_get "$(auth_get 'equipment?name=eq.Bar&select=id')" 0.id)"
for v in CORE_ID INCLINE_ID FLAT_ID DECLINE_ID KNEELING_ID SPLIT_ID BANDS_ID BAR_ID; do
  [ -n "${!v}" ] || fail "$v lookup came back empty"
done
echo "core (Bench Press): $CORE_ID"

# Pre-clean any leftovers from an earlier aborted run BEFORE taking the baseline.
auth_delete "exercises?slug=like.${SLUG_PREFIX}-*" >/dev/null || true

BASELINE_COUNT="$(psql "$DB_URL" -Atc "select count(*) from exercises")"
echo "baseline exercises count: $BASELINE_COUNT"

echo
echo "== 1. create-with-core: engine generates the name =="
ROW_A_JSON="$(auth_post "exercises" "{
  \"name\": \"(pending engine name)\", \"name_is_custom\": false,
  \"slug\": \"${SLUG_PREFIX}-a\",
  \"core_movement_id\": \"$CORE_ID\",
  \"bench_angle_id\": \"$INCLINE_ID\", \"stance_id\": \"$KNEELING_ID\",
  \"is_movement\": false, \"is_official\": false,
  \"created_by\": \"$SMOKE_UID\"
}")"
ROW_A_ID="$(json_get "$ROW_A_JSON" 0.id)"
[ -n "$ROW_A_ID" ] || fail "create A rejected: $ROW_A_JSON"

# The INSERT's RETURNING image predates the AFTER-trigger recompute: re-read.
READ_A="$(auth_get "exercises?id=eq.$ROW_A_ID&select=name,generated_name,identity_fingerprint,tier,name_is_custom")"
A_NAME="$(json_get "$READ_A" 0.name)"
A_GEN="$(json_get "$READ_A" 0.generated_name)"
A_FP="$(json_get "$READ_A" 0.identity_fingerprint)"
A_TIER="$(json_get "$READ_A" 0.tier)"
echo "GENERATED NAME: '$A_GEN' (stored name: '$A_NAME', tier: $A_TIER)"
[ -n "$A_GEN" ] || fail "engine did not generate a name"
[ "$A_NAME" = "$A_GEN" ] || fail "stored name '$A_NAME' != generated '$A_GEN'"
[ "$A_NAME" != "(pending engine name)" ] || fail "placeholder name survived"
[ -n "$A_FP" ] || fail "no identity_fingerprint"
[ "$A_TIER" -ge 1 ] || fail "tier not set"

echo
echo "== 2. duplicate create -> raw 23505 on exercises_fingerprint_key =="
DUP_JSON="$(auth_post "exercises" "{
  \"name\": \"(pending engine name)\", \"name_is_custom\": false,
  \"slug\": \"${SLUG_PREFIX}-dup\",
  \"core_movement_id\": \"$CORE_ID\",
  \"bench_angle_id\": \"$INCLINE_ID\", \"stance_id\": \"$KNEELING_ID\",
  \"is_movement\": false, \"is_official\": false,
  \"created_by\": \"$SMOKE_UID\"
}")"
DUP_CODE="$(json_get "$DUP_JSON" code)"
DUP_MSG="$(json_get "$DUP_JSON" message)"
DUP_DETAILS="$(json_get "$DUP_JSON" details)"
echo "DUPLICATE REJECTION: code=$DUP_CODE message=$DUP_MSG"
echo "                     details=$DUP_DETAILS"
[ "$DUP_CODE" = "23505" ] || fail "expected 23505, got '$DUP_CODE'"
echo "$DUP_MSG" | grep -q "exercises_fingerprint_key" || fail "wrong constraint in message"
# The front door parses this exact detail shape to find the existing row:
echo "$DUP_DETAILS" | grep -q "(core_movement_id, identity_fingerprint)=(" || fail "detail shape changed"

echo
echo "== 3. custom name survives (name_is_custom honored, M4 closed) =="
ROW_B_JSON="$(auth_post "exercises" "{
  \"name\": \"ZZ Probe Custom Name\", \"name_is_custom\": true,
  \"slug\": \"${SLUG_PREFIX}-b\",
  \"core_movement_id\": \"$CORE_ID\",
  \"bench_angle_id\": \"$DECLINE_ID\", \"stance_id\": \"$SPLIT_ID\",
  \"is_movement\": false, \"is_official\": false,
  \"created_by\": \"$SMOKE_UID\"
}")"
ROW_B_ID="$(json_get "$ROW_B_JSON" 0.id)"
[ -n "$ROW_B_ID" ] || fail "create B rejected: $ROW_B_JSON"
READ_B="$(auth_get "exercises?id=eq.$ROW_B_ID&select=name,generated_name,name_is_custom")"
B_NAME="$(json_get "$READ_B" 0.name)"
B_GEN="$(json_get "$READ_B" 0.generated_name)"
B_CUSTOM="$(json_get "$READ_B" 0.name_is_custom)"
echo "custom row: name='$B_NAME' name_is_custom=$B_CUSTOM (engine kept generated_name='$B_GEN' aside)"
[ "$B_NAME" = "ZZ Probe Custom Name" ] || fail "custom name clobbered: '$B_NAME'"
[ "$B_CUSTOM" = "True" ] || [ "$B_CUSTOM" = "true" ] || fail "name_is_custom not true"

echo
echo "== 4. update an attribute -> stored name/tier/fingerprint follow =="
auth_patch "exercises?id=eq.$ROW_A_ID" "{\"bench_angle_id\": \"$FLAT_ID\"}" >/dev/null
READ_A2="$(auth_get "exercises?id=eq.$ROW_A_ID&select=name,generated_name,identity_fingerprint,tier")"
A2_NAME="$(json_get "$READ_A2" 0.name)"
A2_FP="$(json_get "$READ_A2" 0.identity_fingerprint)"
A2_TIER="$(json_get "$READ_A2" 0.tier)"
echo "after Incline->Flat: name='$A2_NAME' tier=$A2_TIER"
[ "$A2_FP" != "$A_FP" ] || fail "fingerprint did not change on attribute update"
[ "$A2_NAME" != "$A_NAME" ] || fail "name did not follow the attribute update"
[ "$A2_NAME" = "$(json_get "$READ_A2" 0.generated_name)" ] || fail "stored name != regenerated name"
[ -n "$A2_TIER" ] || fail "tier lost on update"

echo
echo "== 5. equipment junction insert -> recompute fires =="
JUNC_RESP="$(auth_post "exercise_equipment" "{\"exercise_id\": \"$ROW_A_ID\", \"equipment_id\": \"$BANDS_ID\"}")"
echo "$JUNC_RESP" | grep -q '"code"' && fail "junction insert rejected: $JUNC_RESP"
READ_A3="$(auth_get "exercises?id=eq.$ROW_A_ID&select=name,identity_fingerprint")"
A3_FP="$(json_get "$READ_A3" 0.identity_fingerprint)"
echo "fingerprint after junction insert: $A3_FP"
echo "$A3_FP" | grep -qi "$BANDS_ID" || fail "fingerprint did not pick up the equipment id"

echo
echo "== 6. C1 reproduction: equipment swap vs the parent's identity =="
# Child {Incline, Bands} must be created BEFORE the parent {Incline} exists —
# the child's insert transits the singles-only identity {Incline}.
ROW_C_JSON="$(auth_post "exercises" "{
  \"name\": \"(pending engine name)\", \"name_is_custom\": false,
  \"slug\": \"${SLUG_PREFIX}-c\",
  \"core_movement_id\": \"$CORE_ID\", \"bench_angle_id\": \"$INCLINE_ID\",
  \"is_movement\": false, \"is_official\": false, \"created_by\": \"$SMOKE_UID\"
}")"
ROW_C_ID="$(json_get "$ROW_C_JSON" 0.id)"
[ -n "$ROW_C_ID" ] || fail "create C rejected: $ROW_C_JSON"
C_EQ="$(auth_post "exercise_equipment" "{\"exercise_id\": \"$ROW_C_ID\", \"equipment_id\": \"$BANDS_ID\"}")"
echo "$C_EQ" | grep -q '"code"' && fail "C bands junction rejected: $C_EQ"
ROW_P_JSON="$(auth_post "exercises" "{
  \"name\": \"(pending engine name)\", \"name_is_custom\": false,
  \"slug\": \"${SLUG_PREFIX}-p\",
  \"core_movement_id\": \"$CORE_ID\", \"bench_angle_id\": \"$INCLINE_ID\",
  \"is_movement\": false, \"is_official\": false, \"created_by\": \"$SMOKE_UID\"
}")"
ROW_P_ID="$(json_get "$ROW_P_JSON" 0.id)"
[ -n "$ROW_P_ID" ] || fail "create P rejected: $ROW_P_JSON"
echo "parent {Incline} + child {Incline, Bands} in place"

# Swap Bands -> Bar on the child. DELETE-FIRST must fail: the intermediate
# subset identity {Incline} is exactly the parent (constraint is IMMEDIATE).
DEL_FIRST="$(curl -s -X DELETE "$REST/exercise_equipment?exercise_id=eq.$ROW_C_ID&equipment_id=eq.$BANDS_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN")"
DF_CODE="$(json_get "$DEL_FIRST" code)"
echo "delete-first attempt: code=$DF_CODE ($(json_get "$DEL_FIRST" message))"
[ "$DF_CODE" = "23505" ] || fail "expected delete-first to collide with the parent, got: $DEL_FIRST"
echo "$(json_get "$DEL_FIRST" message)" | grep -q "exercises_fingerprint_key" || fail "wrong constraint"

# INSERT-BEFORE-DELETE (the front door's order): union transient {Incline,
# Bands, Bar} is free, then the delete lands on the final identity.
IB1="$(auth_post "exercise_equipment" "{\"exercise_id\": \"$ROW_C_ID\", \"equipment_id\": \"$BAR_ID\"}")"
echo "$IB1" | grep -q '"code"' && fail "insert-first insert rejected: $IB1"
IB2="$(curl -s -X DELETE "$REST/exercise_equipment?exercise_id=eq.$ROW_C_ID&equipment_id=eq.$BANDS_ID" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN")"
echo "$IB2" | grep -q '"code"' && fail "insert-first delete rejected: $IB2"
READ_C="$(auth_get "exercises?id=eq.$ROW_C_ID&select=name,identity_fingerprint")"
C_FP="$(json_get "$READ_C" 0.identity_fingerprint)"
echo "swap succeeded insert-first: name='$(json_get "$READ_C" 0.name)' fingerprint=$C_FP"
echo "$C_FP" | grep -qi "$BAR_ID" || fail "fingerprint missing the new equipment"
echo "$C_FP" | grep -qi "$BANDS_ID" && fail "fingerprint still holds the removed equipment"

echo
echo "== 7. cleanup: delete probe rows, count restored =="
DELETED="$(auth_delete "exercises?slug=like.${SLUG_PREFIX}-*" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
echo "deleted $DELETED probe row(s)"
[ "$DELETED" = "4" ] || fail "expected to delete 4 probe rows, deleted $DELETED"
FINAL_COUNT="$(psql "$DB_URL" -Atc "select count(*) from exercises")"
echo "final exercises count: $FINAL_COUNT (baseline $BASELINE_COUNT)"
[ "$FINAL_COUNT" = "$BASELINE_COUNT" ] || fail "row count not restored"

echo
echo "FRONT DOOR PROBE: PASS"
