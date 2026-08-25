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
-- V4: review-queue trigger + lifecycle-CHECK behavior (fixture-based, rolled back — harness stays side-effect-free)
BEGIN;
DO $$
DECLARE
  v_user UUID := gen_random_uuid();
  v_exercise UUID;
  v_observed TEXT;
  v_caught BOOLEAN := false;
BEGIN
  -- V4: raw_name_normalized is trigger-enforced, mirroring the exercise_aliases fix
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'harness-fixture@example.com', 'x', now(), now());

  INSERT INTO public.exercise_match_reviews (user_id, raw_name, raw_name_normalized)
  VALUES (v_user, 'KB Front-Squat!', 'garbage-should-be-overwritten');

  SELECT raw_name_normalized INTO v_observed
    FROM public.exercise_match_reviews WHERE user_id = v_user;

  IF v_observed <> 'kettlebell front squat' THEN
    RAISE EXCEPTION 'V4 FAIL: raw_name_normalized trigger did not overwrite deliberately-wrong value, got %', v_observed;
  END IF;

  -- V4: lifecycle CHECK rejects a status/resolution-field mismatch
  SELECT id INTO v_exercise FROM public.exercises LIMIT 1;
  BEGIN
    INSERT INTO public.exercise_match_reviews (user_id, raw_name, raw_name_normalized, status, resolved_exercise_id)
    VALUES (v_user, 'bad row', 'bad row', 'pending', v_exercise);
  EXCEPTION WHEN check_violation THEN
    v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'V4 FAIL: lifecycle check did not reject pending status with resolved_exercise_id set';
  END IF;
END $$;
ROLLBACK;
DO $$
DECLARE
  v_observed TEXT;
  v_deltype "char";
BEGIN
  -- V5: catalog identity columns exist on exercises
  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises' AND column_name='core_movement_id';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises';
    RAISE EXCEPTION 'V5 FAIL: public.exercises.core_movement_id missing (existing columns: %)', v_observed;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises' AND column_name='identity_fingerprint';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises';
    RAISE EXCEPTION 'V5 FAIL: public.exercises.identity_fingerprint missing (existing columns: %)', v_observed;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises' AND column_name='tier';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises';
    RAISE EXCEPTION 'V5 FAIL: public.exercises.tier missing (existing columns: %)', v_observed;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises' AND column_name='generated_name';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises';
    RAISE EXCEPTION 'V5 FAIL: public.exercises.generated_name missing (existing columns: %)', v_observed;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises' AND column_name='name_is_custom';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises';
    RAISE EXCEPTION 'V5 FAIL: public.exercises.name_is_custom missing (existing columns: %)', v_observed;
  END IF;

  -- V5: core rows must self-reference once backfilled (spec: uniform "has a core")
  IF EXISTS (SELECT 1 FROM public.exercises WHERE is_core AND core_movement_id IS DISTINCT FROM id) THEN
    SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed
      FROM public.exercises WHERE is_core AND core_movement_id IS DISTINCT FROM id;
    RAISE EXCEPTION 'V5 FAIL: core rows not self-referencing core_movement_id: %', v_observed;
  END IF;

  -- V5: core_movement_id FK must be RESTRICT, not SET NULL — a core with dependents must be
  -- repointed explicitly (Stage 3 merge tooling), never silently orphaned.
  SELECT confdeltype INTO v_deltype
  FROM pg_constraint
  WHERE conrelid = 'public.exercises'::regclass AND conname = 'exercises_core_movement_id_fkey';
  IF v_deltype IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'V5 FAIL: exercises_core_movement_id_fkey confdeltype = % (expected r/RESTRICT)', COALESCE(v_deltype, 'null');
  END IF;
END $$;
SELECT 'FOUNDATION VERIFICATION: PASS' AS result;
