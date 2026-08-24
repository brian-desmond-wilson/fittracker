\set ON_ERROR_STOP on
-- scripts/movement-model/verify_foundation.sql
-- Foundation verification: raises on any failure, prints PASS at the end.
-- Run: psql "$DB" -v ON_ERROR_STOP=1 -f scripts/movement-model/verify_foundation.sql
-- Convention: each DO block is self-contained (no state shared between blocks); RAISE messages include the actual value observed.
DO $$
BEGIN
  -- V0: baseline sanity — catalog present
  IF (SELECT count(*) FROM public.exercises) < 300 THEN
    RAISE EXCEPTION 'V0 FAIL: exercises count % below 300', (SELECT count(*) FROM public.exercises);
  END IF;
END $$;
SELECT 'FOUNDATION VERIFICATION: PASS' AS result;
