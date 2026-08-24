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
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  -- V1: reference structural columns exist
  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='muscle_regions' AND column_name='region_group';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='muscle_regions';
    RAISE EXCEPTION 'V1 FAIL: public.muscle_regions.region_group missing (existing columns: %)', v_observed;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='movement_styles' AND column_name='is_identity';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='movement_styles';
    RAISE EXCEPTION 'V1 FAIL: public.movement_styles.is_identity missing (existing columns: %)', v_observed;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='load_positions' AND column_name='implies_equipment_id';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='load_positions';
    RAISE EXCEPTION 'V1 FAIL: public.load_positions.implies_equipment_id missing (existing columns: %)', v_observed;
  END IF;

  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='movement_family_modalities';
  IF NOT FOUND THEN
    SELECT string_agg(table_schema, ', ') INTO v_observed
      FROM information_schema.tables WHERE table_name='movement_family_modalities';
    RAISE EXCEPTION 'V1 FAIL: public.movement_family_modalities missing (found in schemas: %)', COALESCE(v_observed, 'none');
  END IF;

  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='alias_abbreviations';
  IF NOT FOUND THEN
    SELECT string_agg(table_schema, ', ') INTO v_observed
      FROM information_schema.tables WHERE table_name='alias_abbreviations';
    RAISE EXCEPTION 'V1 FAIL: public.alias_abbreviations missing (found in schemas: %)', COALESCE(v_observed, 'none');
  END IF;

  -- V1: new reference tables have RLS enabled (they hold no per-user data, but every other
  -- table in the schema locks writes down via RLS — these must not be the silent exception).
  SELECT relrowsecurity::TEXT INTO v_observed FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname = 'movement_family_modalities';
  IF v_observed IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'V1 FAIL: public.movement_family_modalities RLS not enabled (relrowsecurity=%)', COALESCE(v_observed, 'null');
  END IF;

  SELECT relrowsecurity::TEXT INTO v_observed FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname = 'alias_abbreviations';
  IF v_observed IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'V1 FAIL: public.alias_abbreviations RLS not enabled (relrowsecurity=%)', COALESCE(v_observed, 'null');
  END IF;
END $$;
SELECT 'FOUNDATION VERIFICATION: PASS' AS result;
