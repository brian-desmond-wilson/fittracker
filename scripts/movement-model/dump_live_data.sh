#!/bin/bash
# Dumps catalog + reference data from live for staging restore and as pre-change backup.
set -euo pipefail
cd "$(dirname "$0")/../.."
LIVE_DB="${1:?usage: dump_live_data.sh <live postgres:// URL>}"  # full postgres:// URL for the live pooler
STAMP=$(date +%Y%m%d%H%M%S)
mkdir -p backups
OUT="backups/catalog_data_${STAMP}.sql"
# --role postgres: assume the postgres role after connecting; no-op for the real
# postgres user, required for supabase CLI temporary login roles (cli_login_postgres.*).
# --strict-names: fail loudly if any -t pattern matches nothing (e.g. a renamed table),
# instead of silently dropping it from the backup.
pg_dump "$LIVE_DB" --data-only --no-owner --role postgres --strict-names \
  -t exercises -t goal_types -t movement_categories -t movement_families \
  -t planes_of_motion -t load_positions -t stances -t range_depths \
  -t movement_styles -t symmetries -t muscle_regions -t equipment -t scoring_types \
  -t variation_categories -t variation_options -t exercise_variations \
  -t exercise_goal_types -t exercise_scoring_types -t exercise_muscle_regions \
  -t exercise_load_positions -t exercise_stances -t exercise_planes_of_motion \
  -t exercise_movement_styles -t movement_scaling_links \
  -t movement_measurement_profiles -t exercise_standards \
  > "${OUT}.tmp"
# Refuse a truncated dump: pg_dump always ends with a completion trailer.
# (tail -10, not -3: pg_dump >= 17.5 appends a \unrestrict line after the trailer.)
if ! tail -10 "${OUT}.tmp" | grep -q "PostgreSQL database dump complete"; then
  echo "ERROR: dump missing completion trailer, refusing to keep ${OUT}.tmp" >&2
  exit 1
fi
mv "${OUT}.tmp" "$OUT"
echo "$OUT"
