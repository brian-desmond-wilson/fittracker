#!/usr/bin/env bash
# ============================================================================
# Wizard payload staging probe (Stage 5, Task 2)
# ============================================================================
# The UI cannot be driven from here, so this replays the EXACT statement
# sequence CatalogItemWizard -> createCatalogExercise produces for a fully
# loaded derivation (identity singles, equipment, identity style, scoring,
# muscles, goals, classification, compat columns), then proves:
#
#   1. the engine names it and the fingerprint matches the client mirror
#   2. the edit-prefill fetch (fetchCatalogExerciseDetail's embedded select)
#      round-trips every junction exactly as the wizard submitted it
#   3. a wizard-shaped EDIT (attribute change + scoring diff + compat) lands:
#      name/tier/fingerprint follow, requires_distance re-derives
#   4. cleanup restores the row count
#
# Local staging only. Never points at live.
set -euo pipefail

API_URL="http://127.0.0.1:56321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:56322/postgres"
SMOKE_EMAIL="smoke@test.local"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-smoke-probe-password}"
SLUG_PREFIX="zzprobe-wiz"

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
echo "== dictionary lookups (everything the wizard form carries) =="
CORE_ID="$(json_get "$(auth_get 'exercises?slug=eq.bench-press&is_core=eq.true&select=id')" 0.id)"
INCLINE_ID="$(json_get "$(auth_get 'bench_angles?name=eq.Incline&select=id')" 0.id)"
DECLINE_ID="$(json_get "$(auth_get 'bench_angles?name=eq.Decline&select=id')" 0.id)"
KNEELING_ID="$(json_get "$(auth_get 'stances?name=eq.Kneeling&select=id')" 0.id)"
BANDS_ID="$(json_get "$(auth_get 'equipment?name=eq.Bands&select=id')" 0.id)"
STRICT_ID="$(json_get "$(auth_get 'movement_styles?name=eq.Strict&is_identity=eq.true&select=id')" 0.id)"
DISTANCE_ID="$(json_get "$(auth_get 'scoring_types?name=eq.Distance&select=id')" 0.id)"
REPS_ID="$(json_get "$(auth_get 'scoring_types?name=eq.Reps&select=id')" 0.id)"
STRENGTH_ID="$(json_get "$(auth_get 'goal_types?name=eq.Strength&select=id')" 0.id)"
LIFTING_ID="$(json_get "$(auth_get 'movement_categories?name=eq.Weightlifting&select=id')" 0.id)"
PUSH_ID="$(json_get "$(auth_get "movement_families?name=eq.Push%2FPress&select=id")" 0.id)"
CHEST_ID="$(json_get "$(auth_get 'muscle_regions?name=eq.Chest&select=id')" 0.id)"
TRICEPS_ID="$(json_get "$(auth_get 'muscle_regions?name=eq.Triceps&select=id')" 0.id)"
for v in CORE_ID INCLINE_ID DECLINE_ID KNEELING_ID BANDS_ID STRICT_ID DISTANCE_ID REPS_ID STRENGTH_ID LIFTING_ID PUSH_ID CHEST_ID TRICEPS_ID; do
  [ -n "${!v}" ] || fail "$v lookup came back empty"
done

auth_delete "exercises?slug=like.${SLUG_PREFIX}-*" >/dev/null || true
BASELINE_COUNT="$(psql "$DB_URL" -Atc "select count(*) from exercises")"
echo "baseline exercises count: $BASELINE_COUNT"

echo
echo "== 1. wizard-shaped create: the front door's exact statement sequence =="
# Statement 1: coreless insert with every column the wizard form fills.
ROW_JSON="$(auth_post "exercises" "{
  \"name\": \"(pending engine name)\", \"name_is_custom\": false,
  \"slug\": \"${SLUG_PREFIX}-w\",
  \"core_movement_id\": null, \"is_core\": false,
  \"bench_angle_id\": \"$INCLINE_ID\", \"stance_id\": \"$KNEELING_ID\",
  \"movement_family_id\": \"$PUSH_ID\", \"movement_category_id\": \"$LIFTING_ID\",
  \"is_movement\": false, \"is_official\": false,
  \"created_by\": \"$SMOKE_UID\",
  \"description\": \"Wizard probe row\", \"video_url\": \"https://example.com/v\",
  \"skill_level\": \"Intermediate\", \"short_name\": \"WPR\",
  \"equipment_types\": [\"Bands\"], \"requires_weight\": false,
  \"requires_distance\": true, \"goal_type_id\": \"$STRENGTH_ID\"
}")"
ROW_ID="$(json_get "$ROW_JSON" 0.id)"
[ -n "$ROW_ID" ] || fail "wizard-shaped insert rejected: $ROW_JSON"

# Statements 2..6: the junctions, one statement each, order as the front door.
for stmt in \
  "exercise_equipment|{\"exercise_id\": \"$ROW_ID\", \"equipment_id\": \"$BANDS_ID\"}" \
  "exercise_movement_styles|{\"exercise_id\": \"$ROW_ID\", \"movement_style_id\": \"$STRICT_ID\"}" \
  "exercise_muscle_regions|[{\"exercise_id\": \"$ROW_ID\", \"muscle_region_id\": \"$CHEST_ID\", \"is_primary\": true}, {\"exercise_id\": \"$ROW_ID\", \"muscle_region_id\": \"$TRICEPS_ID\", \"is_primary\": false}]" \
  "exercise_goal_types|{\"exercise_id\": \"$ROW_ID\", \"goal_type_id\": \"$STRENGTH_ID\"}" \
  "exercise_scoring_types|[{\"exercise_id\": \"$ROW_ID\", \"scoring_type_id\": \"$DISTANCE_ID\"}, {\"exercise_id\": \"$ROW_ID\", \"scoring_type_id\": \"$REPS_ID\"}]"; do
  table="${stmt%%|*}"; body="${stmt#*|}"
  RESP="$(auth_post "$table" "$body")"
  echo "$RESP" | grep -q '"code"' && fail "$table insert rejected: $RESP"
done

# Statement 7: core-last update — the one recompute that matters.
CORE_SET="$(auth_patch "exercises?id=eq.$ROW_ID" "{\"core_movement_id\": \"$CORE_ID\"}")"
echo "$CORE_SET" | grep -q '"code"' && fail "core-last update rejected: $CORE_SET"

READ="$(auth_get "exercises?id=eq.$ROW_ID&select=name,generated_name,identity_fingerprint,tier,requires_distance,short_name,skill_level")"
W_NAME="$(json_get "$READ" 0.name)"
W_FP="$(json_get "$READ" 0.identity_fingerprint)"
W_TIER="$(json_get "$READ" 0.tier)"
echo "engine named it: '$W_NAME' (tier $W_TIER)"
[ "$W_NAME" != "(pending engine name)" ] || fail "engine did not name the row"
echo "$W_NAME" | grep -q "Bench Press" || fail "generated name does not carry the core noun: '$W_NAME'"
EXPECTED_FP="$(python3 -c 'import sys; print("|".join(sorted(a.lower() for a in sys.argv[1:])))' \
  "$INCLINE_ID" "$KNEELING_ID" "$BANDS_ID" "$STRICT_ID")"
[ "$W_FP" = "$EXPECTED_FP" ] || fail "fingerprint != client mirror: expected $EXPECTED_FP got $W_FP"
[ "$(json_get "$READ" 0.requires_distance)" = "True" ] || fail "requires_distance lost"
[ "$(json_get "$READ" 0.short_name)" = "WPR" ] || fail "short_name lost"

echo
echo "== 2. edit-prefill round-trip: one embedded select == the submitted form =="
DETAIL="$(auth_get "exercises?id=eq.$ROW_ID&select=id,name,name_is_custom,core_movement_id,bench_angle_id,stance_id,movement_family_id,movement_category_id,skill_level,short_name,description,video_url,exercise_equipment(equipment_id),exercise_movement_styles(movement_style_id),exercise_scoring_types(scoring_type_id),exercise_goal_types(goal_type_id),exercise_muscle_regions(muscle_region_id,is_primary)")"
[ "$(json_get "$DETAIL" 0.core_movement_id)" = "$CORE_ID" ] || fail "prefill core mismatch"
[ "$(json_get "$DETAIL" 0.bench_angle_id)" = "$INCLINE_ID" ] || fail "prefill bench angle mismatch"
[ "$(json_get "$DETAIL" 0.stance_id)" = "$KNEELING_ID" ] || fail "prefill stance mismatch"
[ "$(json_get "$DETAIL" 0.movement_family_id)" = "$PUSH_ID" ] || fail "prefill family mismatch"
[ "$(json_get "$DETAIL" 0.movement_category_id)" = "$LIFTING_ID" ] || fail "prefill modality mismatch"
[ "$(json_get "$DETAIL" 0.exercise_equipment.0.equipment_id)" = "$BANDS_ID" ] || fail "prefill equipment mismatch"
[ "$(json_get "$DETAIL" 0.exercise_movement_styles.0.movement_style_id)" = "$STRICT_ID" ] || fail "prefill style mismatch"
SCORING_COUNT="$(python3 -c 'import json,sys; print(len(json.loads(sys.argv[1])[0]["exercise_scoring_types"]))' "$DETAIL")"
[ "$SCORING_COUNT" = "2" ] || fail "prefill scoring count $SCORING_COUNT != 2"
PRIMARY_MUSCLE="$(python3 -c 'import json,sys
rows = json.loads(sys.argv[1])[0]["exercise_muscle_regions"]
print(next(r["muscle_region_id"] for r in rows if r["is_primary"]))' "$DETAIL")"
[ "$PRIMARY_MUSCLE" = "$CHEST_ID" ] || fail "prefill primary muscle mismatch"
echo "prefill select round-trips the exact wizard form (row + all junctions)"

echo
echo "== 3. wizard-shaped edit: attribute + scoring diff + compat =="
# Phase 1: column patch (Incline -> Decline)
E1="$(auth_patch "exercises?id=eq.$ROW_ID" "{\"bench_angle_id\": \"$DECLINE_ID\"}")"
echo "$E1" | grep -q '"code"' && fail "edit column patch rejected: $E1"
# Phase 2: scoring diff — Distance dropped (delete changed row only)
E2="$(auth_delete "exercise_scoring_types?exercise_id=eq.$ROW_ID&scoring_type_id=eq.$DISTANCE_ID")"
echo "$E2" | grep -q '"code"' && fail "scoring diff delete rejected: $E2"
# Phase 3: compat — requires_distance re-derived (no Distance left)
E3="$(auth_patch "exercises?id=eq.$ROW_ID" "{\"requires_distance\": false}")"
echo "$E3" | grep -q '"code"' && fail "compat patch rejected: $E3"

READ2="$(auth_get "exercises?id=eq.$ROW_ID&select=name,identity_fingerprint,tier,requires_distance")"
W2_NAME="$(json_get "$READ2" 0.name)"
W2_FP="$(json_get "$READ2" 0.identity_fingerprint)"
echo "after edit: name='$W2_NAME'"
[ "$W2_NAME" != "$W_NAME" ] || fail "name did not follow the attribute edit"
echo "$W2_FP" | grep -qi "$DECLINE_ID" || fail "fingerprint missing the new attribute"
echo "$W2_FP" | grep -qi "$INCLINE_ID" && fail "fingerprint still holds the old attribute"
[ "$(json_get "$READ2" 0.requires_distance)" = "False" ] || fail "requires_distance did not re-derive"

echo
echo "== 4. cleanup =="
DELETED="$(auth_delete "exercises?slug=like.${SLUG_PREFIX}-*" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')"
[ "$DELETED" = "1" ] || fail "expected to delete 1 probe row, deleted $DELETED"
FINAL_COUNT="$(psql "$DB_URL" -Atc "select count(*) from exercises")"
echo "deleted $DELETED probe row; count $FINAL_COUNT (baseline $BASELINE_COUNT)"
[ "$FINAL_COUNT" = "$BASELINE_COUNT" ] || fail "row count not restored"

echo
echo "WIZARD PAYLOAD PROBE: PASS"
