#!/usr/bin/env bash
# ============================================================================
# Capture-resolution staging probe (Stage 5, Task 4)
# ============================================================================
# Proves, over REST as the AUTHENTICATED smoke user (RLS reality, not
# service-role fiction), the exact behaviors mobile/src/lib/supabase/
# {capture,matchReviews}.ts are built on:
#
#   1. alias-hit path         -> "Pullups" resolves through the normalize_alias
#                                RPC + exercise_aliases.alias_normalized to the
#                                Pull-Up row; the capture links it and NO
#                                exercise row is created
#   2. unknown name           -> an exercise_match_reviews INSERT succeeds as
#                                authenticated (status defaults to pending, the
#                                trigger fills raw_name_normalized) and NO
#                                exercise row is created — the auto-create is
#                                dead
#   3. resolution (a) link    -> PATCH to status=linked + resolved_exercise_id
#                                passes the lifecycle CHECK; the review leaves
#                                the pending set
#   4. resolution (b) +alias  -> the wild-alias write (normalize RPC + insert)
#                                works as authenticated, AND a re-capture of
#                                the same wording then resolves on rung 1 —
#                                no new review needed
#   5. resolution (c) create  -> a front-door-style create then PATCH to
#                                status=minted + resolved_exercise_id passes
#                                the lifecycle CHECK
#   6. draft materialization  -> the workout item held in the review draft
#                                inserts into captured_workout_exercises at
#                                its stored order once resolved
#   7. cleanup                -> probe rows deleted (reviews before the minted
#                                exercise: resolved_exercise_id is ON DELETE
#                                RESTRICT), counts restored
#
# Local staging only. Never points at live.
set -euo pipefail

API_URL="http://127.0.0.1:56321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:56322/postgres"
SMOKE_EMAIL="smoke@test.local"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-smoke-probe-password}"
SLUG_PREFIX="zzprobe-cap"
URL_PREFIX="https://zzprobe.example/capture"

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
auth_patch()  { curl -s -X PATCH "$REST/$1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Prefer: return=representation" -d "$2"; }
auth_delete() { curl -s -X DELETE "$REST/$1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Prefer: return=representation"; }
rpc_normalize() { # rpc_normalize '<raw>' -> normalized string
  auth_post "rpc/normalize_alias" "{\"raw\": \"$1\"}" \
    | python3 -c 'import json,sys; v=json.load(sys.stdin); print(v if isinstance(v,str) else "")'
}

cleanup() {
  if [ -n "${TOKEN:-}" ]; then
    # Order matters: reviews hold resolved_exercise_id ON DELETE RESTRICT.
    auth_delete "exercise_match_reviews?raw_name=like.Zzprobe*" >/dev/null || true
    # Stage 5 Task 5: wild aliases taught onto OFFICIAL rows (section 4 lands
    # one on Pull-Up) are INSERT-only for authenticated users — UPDATE/DELETE
    # of official-row aliases is now RLS-locked BY DESIGN (only the kind='wild'
    # INSERT is carved out). Cleanup therefore goes through psql as the
    # curation role, deliberately NOT over REST.
    psql "$DB_URL" -Atc "delete from exercise_aliases where alias like 'Zzprobe%'" >/dev/null || true
    auth_delete "exercises?slug=like.${SLUG_PREFIX}-*" >/dev/null || true
    # Sources cascade their workouts, items and links.
    auth_delete "captured_sources?source_url=like.${URL_PREFIX}*" >/dev/null || true
  fi
}
trap cleanup EXIT

# Pre-clean any leftovers from an earlier aborted run BEFORE the baseline.
cleanup

count() { psql "$DB_URL" -Atc "select count(*) from $1"; }
BASE_EXERCISES="$(count exercises)"
BASE_ALIASES="$(count exercise_aliases)"
BASE_REVIEWS="$(count exercise_match_reviews)"
BASE_SOURCES="$(count captured_sources)"
echo "baseline: exercises=$BASE_EXERCISES aliases=$BASE_ALIASES reviews=$BASE_REVIEWS sources=$BASE_SOURCES"

echo
echo "== 1. alias-hit path: 'Pullups' links to Pull-Up, no exercise created =="
NORM="$(rpc_normalize 'Pullups')"
echo "normalize_alias('Pullups') = '$NORM'"
[ -n "$NORM" ] || fail "normalize_alias returned nothing"
ALIAS_HIT="$(auth_get "exercise_aliases?alias_normalized=eq.$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$NORM")&select=exercise_id")"
PULLUP_ID="$(json_get "$ALIAS_HIT" 0.exercise_id)"
[ -n "$PULLUP_ID" ] || fail "alias lookup found nothing for '$NORM'"
PULLUP_NAME="$(json_get "$(auth_get "exercises?id=eq.$PULLUP_ID&select=name")" 0.name)"
echo "ALIAS HIT: 'Pullups' -> $PULLUP_NAME ($PULLUP_ID)"
[ "$PULLUP_NAME" = "Pull-Up" ] || fail "expected Pull-Up, got '$PULLUP_NAME'"

SRC1_JSON="$(auth_post "captured_sources" "{
  \"user_id\": \"$SMOKE_UID\", \"platform\": \"other\",
  \"source_url\": \"${URL_PREFIX}-1\", \"extraction_status\": \"pending\"
}")"
SRC1_ID="$(json_get "$SRC1_JSON" 0.id)"
[ -n "$SRC1_ID" ] || fail "source 1 insert rejected: $SRC1_JSON"
LINK_JSON="$(auth_post "source_exercises?on_conflict=source_id,exercise_id" "{
  \"source_id\": \"$SRC1_ID\", \"exercise_id\": \"$PULLUP_ID\", \"was_created\": false
}")"
[ -n "$(json_get "$LINK_JSON" 0.id)" ] || fail "source link rejected: $LINK_JSON"
[ "$(count exercises)" = "$BASE_EXERCISES" ] || fail "alias path created an exercise row"
echo "linked via alias; exercises count unchanged ($BASE_EXERCISES)"

echo
echo "== 2. unknown name -> review row, NO exercise row =="
UNKNOWN="Zzprobe Cable Widget Press"
NORM2="$(rpc_normalize "$UNKNOWN")"
MISS="$(auth_get "exercise_aliases?alias_normalized=eq.$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$NORM2")&select=exercise_id")"
[ "$MISS" = "[]" ] || fail "'$UNKNOWN' unexpectedly has an alias: $MISS"
R1_JSON="$(auth_post "exercise_match_reviews" "{
  \"user_id\": \"$SMOKE_UID\", \"source_id\": \"$SRC1_ID\",
  \"raw_name\": \"$UNKNOWN\", \"context\": \"probe workout\",
  \"candidates\": [{\"exerciseId\": \"$PULLUP_ID\", \"name\": \"$PULLUP_NAME\"}],
  \"draft\": {\"draftVersion\": 1, \"exercise\": null, \"capturedWorkoutId\": null, \"items\": []}
}")"
R1_ID="$(json_get "$R1_JSON" 0.id)"
R1_STATUS="$(json_get "$R1_JSON" 0.status)"
R1_NORM="$(json_get "$R1_JSON" 0.raw_name_normalized)"
echo "REVIEW ROW: id=$R1_ID status=$R1_STATUS raw_name_normalized='$R1_NORM'"
[ -n "$R1_ID" ] || fail "review insert rejected as authenticated (RLS?): $R1_JSON"
[ "$R1_STATUS" = "pending" ] || fail "status did not default to pending"
[ "$R1_NORM" = "$NORM2" ] || fail "trigger did not fill raw_name_normalized"
[ "$(count exercises)" = "$BASE_EXERCISES" ] || fail "unknown name created an exercise row"
echo "no exercise row created ($BASE_EXERCISES)"

echo
echo "== 3. resolution (a): link to an existing exercise =="
RES1_JSON="$(auth_patch "exercise_match_reviews?id=eq.$R1_ID&status=eq.pending" "{
  \"status\": \"linked\", \"resolved_exercise_id\": \"$PULLUP_ID\",
  \"resolved_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
}")"
[ "$(json_get "$RES1_JSON" 0.status)" = "linked" ] || fail "link resolution rejected: $RES1_JSON"
PENDING_LEFT="$(auth_get "exercise_match_reviews?status=eq.pending&raw_name=eq.$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$UNKNOWN")&select=id")"
[ "$PENDING_LEFT" = "[]" ] || fail "resolved review still pending: $PENDING_LEFT"
echo "review $R1_ID -> linked; left the pending set"

echo
echo "== 4. resolution (b): link + wild alias; re-capture then resolves alone =="
WILD="Zzprobe Kneeling Widget Curl"
R2_JSON="$(auth_post "exercise_match_reviews" "{
  \"user_id\": \"$SMOKE_UID\", \"source_id\": \"$SRC1_ID\",
  \"raw_name\": \"$WILD\", \"candidates\": [],
  \"draft\": {\"draftVersion\": 1, \"exercise\": null, \"capturedWorkoutId\": null, \"items\": []}
}")"
R2_ID="$(json_get "$R2_JSON" 0.id)"
[ -n "$R2_ID" ] || fail "review 2 insert failed: $R2_JSON"
NORM3="$(rpc_normalize "$WILD")"
ALIAS_JSON="$(auth_post "exercise_aliases" "{
  \"exercise_id\": \"$PULLUP_ID\", \"alias\": \"$WILD\",
  \"alias_normalized\": \"$NORM3\", \"kind\": \"wild\", \"source\": \"curation\"
}")"
[ -n "$(json_get "$ALIAS_JSON" 0.id)" ] || fail "wild alias insert rejected: $ALIAS_JSON"
auth_patch "exercise_match_reviews?id=eq.$R2_ID&status=eq.pending" "{
  \"status\": \"linked\", \"resolved_exercise_id\": \"$PULLUP_ID\",
  \"resolved_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
}" >/dev/null
RECAP="$(auth_get "exercise_aliases?alias_normalized=eq.$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$(rpc_normalize "$WILD")")&select=exercise_id")"
RECAP_ID="$(json_get "$RECAP" 0.exercise_id)"
echo "RE-CAPTURE of '$WILD' resolves to: $RECAP_ID"
[ "$RECAP_ID" = "$PULLUP_ID" ] || fail "re-capture did not resolve via the new alias"
echo "rung-1 hit — a second capture of that wording needs no review"

echo
echo "== 5. resolution (c): create new (front-door shape), review -> minted =="
MINT_JSON="$(auth_post "exercises" "{
  \"name\": \"Zzprobe Minted Widget\", \"name_is_custom\": true,
  \"slug\": \"${SLUG_PREFIX}-mint\", \"core_movement_id\": null,
  \"is_movement\": false, \"is_official\": false, \"created_by\": \"$SMOKE_UID\"
}")"
MINT_ID="$(json_get "$MINT_JSON" 0.id)"
[ -n "$MINT_ID" ] || fail "minted create rejected: $MINT_JSON"
R3_JSON="$(auth_post "exercise_match_reviews" "{
  \"user_id\": \"$SMOKE_UID\", \"source_id\": \"$SRC1_ID\",
  \"raw_name\": \"Zzprobe Minted Widget\", \"candidates\": [],
  \"draft\": {\"draftVersion\": 1, \"exercise\": null, \"capturedWorkoutId\": null, \"items\": []}
}")"
R3_ID="$(json_get "$R3_JSON" 0.id)"
[ -n "$R3_ID" ] || fail "review 3 insert failed: $R3_JSON"
RES3_JSON="$(auth_patch "exercise_match_reviews?id=eq.$R3_ID&status=eq.pending" "{
  \"status\": \"minted\", \"resolved_exercise_id\": \"$MINT_ID\",
  \"resolved_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
}")"
[ "$(json_get "$RES3_JSON" 0.status)" = "minted" ] || fail "minted resolution rejected: $RES3_JSON"
echo "review $R3_ID -> minted ($MINT_ID)"

echo
echo "== 6. draft items materialize into the captured workout at their order =="
WKT_JSON="$(auth_post "captured_workouts" "{
  \"source_id\": \"$SRC1_ID\", \"user_id\": \"$SMOKE_UID\",
  \"name\": \"Zzprobe Workout\"
}")"
WKT_ID="$(json_get "$WKT_JSON" 0.id)"
[ -n "$WKT_ID" ] || fail "captured workout insert failed: $WKT_JSON"
R4_JSON="$(auth_post "exercise_match_reviews" "{
  \"user_id\": \"$SMOKE_UID\", \"source_id\": \"$SRC1_ID\",
  \"raw_name\": \"Zzprobe Draft Item Row\", \"candidates\": [],
  \"draft\": {\"draftVersion\": 1, \"exercise\": null, \"capturedWorkoutId\": \"$WKT_ID\",
              \"items\": [{\"exerciseOrder\": 2, \"sets\": 3, \"reps\": \"10\"}]}
}")"
R4_ID="$(json_get "$R4_JSON" 0.id)"
[ -n "$R4_ID" ] || fail "review 4 insert failed: $R4_JSON"
ITEM_JSON="$(auth_post "captured_workout_exercises" "{
  \"captured_workout_id\": \"$WKT_ID\", \"exercise_id\": \"$PULLUP_ID\",
  \"exercise_order\": 2, \"target_sets\": 3, \"target_reps\": \"10\"
}")"
[ -n "$(json_get "$ITEM_JSON" 0.id)" ] || fail "draft item insert rejected: $ITEM_JSON"
auth_patch "exercise_match_reviews?id=eq.$R4_ID&status=eq.pending" "{
  \"status\": \"linked\", \"resolved_exercise_id\": \"$PULLUP_ID\",
  \"resolved_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
}" >/dev/null
MATERIALIZED="$(auth_get "captured_workout_exercises?captured_workout_id=eq.$WKT_ID&select=exercise_order,target_sets,target_reps")"
echo "MATERIALIZED ITEMS: $MATERIALIZED"
[ "$(json_get "$MATERIALIZED" 0.exercise_order)" = "2" ] || fail "item order lost"
[ "$(json_get "$MATERIALIZED" 0.target_reps)" = "10" ] || fail "item prescription lost"

echo
echo "== 7. cleanup: counts restored =="
cleanup
trap - EXIT
FIN_EXERCISES="$(count exercises)"
FIN_ALIASES="$(count exercise_aliases)"
FIN_REVIEWS="$(count exercise_match_reviews)"
FIN_SOURCES="$(count captured_sources)"
echo "final: exercises=$FIN_EXERCISES aliases=$FIN_ALIASES reviews=$FIN_REVIEWS sources=$FIN_SOURCES"
[ "$FIN_EXERCISES" = "$BASE_EXERCISES" ] || fail "exercises count not restored"
[ "$FIN_ALIASES" = "$BASE_ALIASES" ] || fail "aliases count not restored"
[ "$FIN_REVIEWS" = "$BASE_REVIEWS" ] || fail "reviews count not restored"
[ "$FIN_SOURCES" = "$BASE_SOURCES" ] || fail "sources count not restored"

echo
echo "PROBE PASS: alias-first resolution, review queue, all three resolutions, cleanup clean"
