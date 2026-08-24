-- scripts/movement-model/verify_foundation.sql
-- Foundation verification: raises on any failure, prints PASS at the end.
-- Run: psql "$DB" -v ON_ERROR_STOP=1 -f scripts/movement-model/verify_foundation.sql
DO $$
BEGIN
  -- V0: baseline sanity — catalog present
  IF (SELECT count(*) FROM exercises) < 300 THEN
    RAISE EXCEPTION 'V0 FAIL: exercises table missing or truncated';
  END IF;
END $$;
SELECT 'FOUNDATION VERIFICATION: PASS' AS result;
