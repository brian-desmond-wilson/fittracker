#!/usr/bin/env bash
# ============================================================================
# Reads / filters / tier-truth staging probe (Stage 5, Task 3)
# ============================================================================
# Proves, over REST as the AUTHENTICATED smoke user (RLS reality), the exact
# read behaviors the Task 3 client changes are built on:
#
#   1. tier parity        -> stored exercises.tier equals the legacy
#                            get_movement_tier() walk for EVERY row (full
#                            sweep in SQL — same function the RPC exposes —
#                            plus REST RPC spot-checks). This is the invariant
#                            that justified deleting the client-side walker,
#                            fetchTierMap, and the per-detail RPC call.
#   2. tab split          -> is_movement=eq.true (Movements tab) and
#                            is_movement=not.is.true (Exercises tab) counts
#                            match SQL ground truth and sum to the catalog.
#   3. modality pills     -> movement_category_id=eq.<id> counts (per tab
#                            scope) match SQL ground truth for all four
#                            modalities; the Cores pill (is_core=eq.true) too.
#   4. alias search       -> the client's two-leg search (exercise_aliases
#                            ilike -> ids; then name.ilike OR id.in) finds a
#                            row by a wild alias ("Pullups" -> Pull-Up) and by
#                            a generated alias.
#   5. detail embed       -> one select resolves equipment junction names,
#                            alias rows, and the row's stored tier.
#
# Read-only. Local staging only. Never points at live.
set -euo pipefail

API_URL="http://127.0.0.1:56321"
DB_URL="postgresql://postgres:postgres@127.0.0.1:56322/postgres"
SMOKE_EMAIL="smoke@test.local"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-smoke-probe-password}"

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
echo "signed in as $SMOKE_EMAIL"

REST="$API_URL/rest/v1"
auth_get()  { curl -s "$REST/$1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN"; }
auth_rpc()  { curl -s -X POST "$REST/rpc/$1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2"; }
# Exact count without fetching rows: PostgREST puts it in Content-Range.
auth_count() {
  curl -s "$REST/$1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN" \
    -H "Prefer: count=exact" -H "Range: 0-0" -I | tr -d '\r' \
    | awk -F/ 'tolower($0) ~ /^content-range/ {print $2}'
}

echo
echo "== 1. tier parity: stored column vs get_movement_tier, all rows =="
PARITY="$(psql "$DB_URL" -Atc "
  select count(*) || '/' || (select count(*) from exercises)
  from exercises where get_movement_tier(id) = coalesce(tier, 0)")"
TOTAL="$(psql "$DB_URL" -Atc "select count(*) from exercises")"
echo "parity (sql sweep): $PARITY"
[ "$PARITY" = "$TOTAL/$TOTAL" ] || fail "stored tier diverges from get_movement_tier: $PARITY"

# REST spot-checks: the RPC surface agrees with the stored column for one row
# of each shape (core / derivation / outlier).
SPOT_IDS="$(psql "$DB_URL" -Atc "
  (select id from exercises where is_core limit 1)
  union all
  (select id from exercises where tier >= 1 limit 1)
  union all
  (select id from exercises where tier is null limit 1)")"
for ID in $SPOT_IDS; do
  STORED="$(json_get "$(auth_get "exercises?id=eq.$ID&select=tier")" 0.tier)"
  RPC="$(auth_rpc get_movement_tier "{\"exercise_id_param\":\"$ID\"}")"
  [ "${STORED:-0}" = "$RPC" ] || fail "REST spot-check $ID: stored='${STORED:-null->0}' rpc='$RPC'"
  echo "  spot $ID: stored=${STORED:-null} rpc=$RPC ok (null renders as no badge, rpc walks to 0)"
done

echo
echo "== 2. tab split =="
MOV_REST="$(auth_count 'exercises?is_movement=eq.true&select=id')"
EXE_REST="$(auth_count 'exercises?is_movement=not.is.true&select=id')"
read -r MOV_SQL EXE_SQL <<<"$(psql "$DB_URL" -Atc "
  select count(*) filter (where is_movement is true) || ' ' ||
         count(*) filter (where is_movement is not true) from exercises")"
echo "movements tab: rest=$MOV_REST sql=$MOV_SQL ; exercises tab: rest=$EXE_REST sql=$EXE_SQL ; total=$TOTAL"
[ "$MOV_REST" = "$MOV_SQL" ] || fail "movements tab count mismatch"
[ "$EXE_REST" = "$EXE_SQL" ] || fail "exercises tab count mismatch"
[ "$((MOV_REST + EXE_REST))" = "$TOTAL" ] || fail "tab counts do not sum to the catalog"

# Capture vocabulary: CaptureSheet/CaptureFab call
# fetchAllExercises({includeMovements:true}) — no is_movement filter at all —
# so the LLM library index and review chips must see the WHOLE catalog. The
# tab split must never shrink this query (interim until Task 4 rewrites
# capture matching through the alias table).
VOCAB_REST="$(auth_count 'exercises?select=id')"
echo "capture vocabulary (includeMovements): rest=$VOCAB_REST total=$TOTAL"
[ "$VOCAB_REST" = "$TOTAL" ] || fail "capture vocabulary shrank: $VOCAB_REST of $TOTAL rows"

echo
echo "== 3. pill filters vs SQL ground truth =="
for CAT in Weightlifting Gymnastics Monostructural Recovery; do
  CAT_ID="$(json_get "$(auth_get "movement_categories?name=eq.$CAT&select=id")" 0.id)"
  [ -n "$CAT_ID" ] || fail "dictionary lookup for $CAT came back empty"
  for SCOPE in "is_movement=eq.true" "is_movement=not.is.true"; do
    REST_N="$(auth_count "exercises?$SCOPE&movement_category_id=eq.$CAT_ID&select=id")"
    SQL_SCOPE="$([ "$SCOPE" = "is_movement=eq.true" ] && echo "is_movement is true" || echo "is_movement is not true")"
    SQL_N="$(psql "$DB_URL" -Atc "
      select count(*) from exercises
      where $SQL_SCOPE and movement_category_id = '$CAT_ID'")"
    echo "  $CAT [$SCOPE]: rest=$REST_N sql=$SQL_N"
    [ "$REST_N" = "$SQL_N" ] || fail "$CAT pill mismatch under $SCOPE"
  done
done
CORES_REST="$(auth_count 'exercises?is_movement=eq.true&is_core=eq.true&select=id')"
CORES_SQL="$(psql "$DB_URL" -Atc "select count(*) from exercises where is_movement is true and is_core")"
echo "  Cores [movements tab]: rest=$CORES_REST sql=$CORES_SQL"
[ "$CORES_REST" = "$CORES_SQL" ] || fail "Cores pill mismatch"

echo
echo "== 4. alias-aware search (the client's two legs) =="
probe_alias_search() { # probe_alias_search <term> <expected name> <scope filter> <limit>
  local TERM="$1" WANT="$2" SCOPE="$3" LIMIT="$4"
  local IDS ROWS
  IDS="$(auth_get "exercise_aliases?alias=ilike.*${TERM// /%20}*&select=exercise_id&limit=200" \
    | python3 -c 'import json,sys; print(",".join(sorted({r["exercise_id"] for r in json.load(sys.stdin)})))')"
  if [ -n "$IDS" ]; then
    ROWS="$(auth_get "exercises?$SCOPE&or=(name.ilike.*${TERM// /%20}*,id.in.($IDS))&select=name&order=name&limit=$LIMIT")"
  else
    ROWS="$(auth_get "exercises?$SCOPE&name=ilike.*${TERM// /%20}*&select=name&order=name&limit=$LIMIT")"
  fi
  echo "$ROWS" | python3 -c "
import json, sys
rows = json.load(sys.stdin)
names = [r['name'] for r in rows]
assert '$WANT' in names, f'expected $WANT in {names}'
print(f'  \"$TERM\" -> {len(names)} rows incl. \"$WANT\"')"
}
# Wild alias: "Pullups" is nobody's display name. Movements-tab limit is 20.
probe_alias_search "Pullups" "Pull-Up" "is_movement=eq.true" 20
# Generated alias that differs from the display name (custom-named row);
# longest first so the term is distinctive. Exercises-tab limit is 50.
IFS='|' read -r GEN_ALIAS GEN_NAME <<<"$(psql "$DB_URL" -Atc "
  select a.alias || '|' || e.name from exercise_aliases a
  join exercises e on e.id = a.exercise_id
  where a.kind = 'generated' and lower(a.alias) <> lower(e.name)
    and e.is_movement is not true
  order by length(a.alias) desc limit 1")"
if [ -n "${GEN_ALIAS:-}" ]; then
  probe_alias_search "$GEN_ALIAS" "$GEN_NAME" "is_movement=not.is.true" 50
else
  echo "  (no generated alias differs from its display name on staging — wild-alias leg covers the mechanism)"
fi

echo
echo "== 5. detail embed shape (equipment junction + aliases + tier) =="
DETAIL="$(auth_get "exercises?name=eq.Kettlebell%20Bench%20Press&select=name,tier,is_core,equipment_rows:exercise_equipment(equipment:equipment(id,name)),alias_rows:exercise_aliases(alias,kind)")"
echo "$DETAIL" | python3 -c '
import json, sys
row = json.load(sys.stdin)[0]
eq = sorted(r["equipment"]["name"] for r in row["equipment_rows"] if r["equipment"])
aliases = [r["alias"] for r in row["alias_rows"]]
assert row["tier"] == 1, "expected stored tier 1, got %r" % row["tier"]
assert eq, "equipment junction embed came back empty (RLS? equipment select policy is TO authenticated)"
print("  %s: tier=%s equipment=%s aliases=%s" % (row["name"], row["tier"], eq, aliases))'
CORE_DETAIL="$(auth_get "exercises?name=eq.Pull-Up&is_core=eq.true&select=name,tier,core_default_equipment,equipment_rows:exercise_equipment(equipment:equipment(name))")"
echo "$CORE_DETAIL" | python3 -c '
import json, sys
row = json.load(sys.stdin)[0]
assert row["tier"] == 0 and not row["equipment_rows"] and row["core_default_equipment"]
print("  %s (core): tier=0, no junction rows, default equipment: %s" % (row["name"], row["core_default_equipment"]))'

echo
echo "ALL READ PROBES PASSED"
