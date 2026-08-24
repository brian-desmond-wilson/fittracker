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
DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
BEGIN
  -- V2: reference seeds applied
  IF EXISTS (SELECT 1 FROM public.muscle_regions WHERE name = 'Back') THEN
    RAISE EXCEPTION 'V2 FAIL: stray Back muscle region still present (id=%)',
      (SELECT id FROM public.muscle_regions WHERE name = 'Back');
  END IF;

  IF EXISTS (SELECT 1 FROM public.muscle_regions WHERE region_group IS NULL) THEN
    SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed
      FROM public.muscle_regions WHERE region_group IS NULL;
    RAISE EXCEPTION 'V2 FAIL: muscle regions without region_group: %', v_observed;
  END IF;

  SELECT count(*) INTO v_count FROM public.movement_family_modalities;
  IF v_count < 29 THEN
    RAISE EXCEPTION 'V2 FAIL: family-modality junction under-seeded, got % rows (need >= 29)', v_count;
  END IF;

  IF EXISTS (  -- every family reachable from at least one modality
    SELECT 1 FROM public.movement_families f
    WHERE NOT EXISTS (SELECT 1 FROM public.movement_family_modalities m WHERE m.movement_family_id = f.id)
  ) THEN
    SELECT string_agg(f.name, ', ' ORDER BY f.name) INTO v_observed
      FROM public.movement_families f
      WHERE NOT EXISTS (SELECT 1 FROM public.movement_family_modalities m WHERE m.movement_family_id = f.id);
    RAISE EXCEPTION 'V2 FAIL: unreachable movement families: %', v_observed;
  END IF;

  SELECT count(*) INTO v_count FROM public.alias_abbreviations;
  IF v_count < 15 THEN
    RAISE EXCEPTION 'V2 FAIL: abbreviation dictionary under-seeded, got % rows (need >= 15)', v_count;
  END IF;
END $$;
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  -- V3: normalizer behavior
  v_observed := public.normalize_alias('KB Front-Squat!');
  IF v_observed <> 'kettlebell front squat' THEN
    RAISE EXCEPTION 'V3 FAIL: abbreviation + punctuation normalization, got %', v_observed;
  END IF;

  v_observed := public.normalize_alias('  Chest–to–Bar  ');
  IF v_observed <> 'chest to bar' THEN
    RAISE EXCEPTION 'V3 FAIL: unicode dash + whitespace, got %', v_observed;
  END IF;

  v_observed := public.normalize_alias('C2B');
  IF v_observed <> 'chest to bar' THEN
    RAISE EXCEPTION 'V3 FAIL: whole-word abbreviation, got %', v_observed;
  END IF;

  -- V3: alias table + uniqueness live from birth
  PERFORM 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'exercise_aliases_normalized_key';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V3 FAIL: unique index public.exercise_aliases_normalized_key missing';
  END IF;
END $$;
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  -- V3: trigger enforces alias_normalized = normalize_alias(alias) regardless of caller input
  INSERT INTO public.exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
  SELECT id, 'KB Swing Test', 'garbage', 'wild', 'capture'
  FROM public.exercises LIMIT 1;

  SELECT alias_normalized INTO v_observed FROM public.exercise_aliases WHERE alias = 'KB Swing Test';
  DELETE FROM public.exercise_aliases WHERE alias = 'KB Swing Test';

  IF v_observed <> 'kettlebell swing test' THEN
    RAISE EXCEPTION 'V3 FAIL: trigger did not overwrite deliberately-wrong alias_normalized, got %', v_observed;
  END IF;
END $$;
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  -- V4: junction + queue exist (junction stays empty until the Stage 3 backfill)
  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='exercise_equipment';
  IF NOT FOUND THEN
    SELECT string_agg(table_schema, ', ') INTO v_observed
      FROM information_schema.tables WHERE table_name='exercise_equipment';
    RAISE EXCEPTION 'V4 FAIL: public.exercise_equipment missing (found in schemas: %)', COALESCE(v_observed, 'none');
  END IF;

  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='exercise_match_reviews';
  IF NOT FOUND THEN
    SELECT string_agg(table_schema, ', ') INTO v_observed
      FROM information_schema.tables WHERE table_name='exercise_match_reviews';
    RAISE EXCEPTION 'V4 FAIL: public.exercise_match_reviews missing (found in schemas: %)', COALESCE(v_observed, 'none');
  END IF;

  -- V4: standing RLS rule — both new tables must have RLS enabled
  SELECT relrowsecurity::TEXT INTO v_observed FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname = 'exercise_equipment';
  IF v_observed IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'V4 FAIL: public.exercise_equipment RLS not enabled (relrowsecurity=%)', COALESCE(v_observed, 'null');
  END IF;

  SELECT relrowsecurity::TEXT INTO v_observed FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname = 'exercise_match_reviews';
  IF v_observed IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'V4 FAIL: public.exercise_match_reviews RLS not enabled (relrowsecurity=%)', COALESCE(v_observed, 'null');
  END IF;
END $$;
SELECT 'FOUNDATION VERIFICATION: PASS' AS result;
