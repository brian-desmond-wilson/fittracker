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

  -- V5: inverse invariant — every core_movement_id target is itself a core row
  IF EXISTS (SELECT 1 FROM public.exercises e JOIN public.exercises t ON t.id = e.core_movement_id
             WHERE NOT t.is_core) THEN
    SELECT string_agg(DISTINCT e.name || ' -> ' || t.name, '; ' ORDER BY e.name || ' -> ' || t.name)
      INTO v_observed
      FROM public.exercises e JOIN public.exercises t ON t.id = e.core_movement_id
      WHERE NOT t.is_core;
    RAISE EXCEPTION 'V5 FAIL: rows pointing at a non-core as their core: %', v_observed;
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
-- V6: identity engine behavior (fixture-based, rolled back — harness stays side-effect-free)
BEGIN;
DO $$
DECLARE
  eq_barbell UUID; eq_kb UUID;
  lp_back UUID; lp_goblet UUID;
  core_squat UUID; back_squat UUID; kb_goblet UUID;
  wizard_core UUID;
  grip_wide UUID;
  v_caught BOOLEAN := false;
  v_observed TEXT;
BEGIN
  -- Fixture reference values (TB- prefixed so nothing collides with real aliases; isolated from audit outcomes)
  INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)
    VALUES ('TEST Barbell','Free Weights',990,'TB-Barbell',40) RETURNING id INTO eq_barbell;
  INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)
    VALUES ('TEST Kettlebell','Free Weights',991,'TB-Kettlebell',40) RETURNING id INTO eq_kb;
  INSERT INTO public.load_positions (name, display_order, category, name_fragment, name_order, implies_equipment_id)
    VALUES ('TEST Back',990,'Barbell','TB-Back',20,eq_barbell) RETURNING id INTO lp_back;
  INSERT INTO public.load_positions (name, display_order, category, name_fragment, name_order)
    VALUES ('TEST Goblet',991,'Dumbbell / KB','TB-Goblet',20) RETURNING id INTO lp_goblet;

  -- Core movement fixture
  INSERT INTO public.exercises (name, slug, is_core, is_official)
    VALUES ('TESTSquat','test-squat',true,true) RETURNING id INTO core_squat;
  UPDATE public.exercises SET core_movement_id = id WHERE id = core_squat;

  IF (SELECT tier FROM public.exercises WHERE id = core_squat) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'V6 FAIL: core row tier should be 0, got %',
      COALESCE((SELECT tier FROM public.exercises WHERE id = core_squat)::TEXT, 'null');
  END IF;

  -- Derived: core + {barbell, back} → suppressed equipment → 'TB-Back TESTSquat'
  INSERT INTO public.exercises (name, slug, is_official, core_movement_id, load_position_id)
    VALUES ('placeholder','test-back-squat',true,core_squat,lp_back) RETURNING id INTO back_squat;
  INSERT INTO public.exercise_equipment (exercise_id, equipment_id) VALUES (back_squat, eq_barbell);

  SELECT generated_name INTO v_observed FROM public.exercises WHERE id = back_squat;
  IF v_observed IS DISTINCT FROM 'TB-Back TESTSquat' THEN
    RAISE EXCEPTION 'V6 FAIL: implied-equipment suppression, got %', COALESCE(v_observed, 'null');
  END IF;
  IF (SELECT parent_exercise_id FROM public.exercises WHERE id = back_squat) IS DISTINCT FROM core_squat THEN
    RAISE EXCEPTION 'V6 FAIL: parent should be core, got %',
      COALESCE((SELECT parent_exercise_id FROM public.exercises WHERE id = back_squat)::TEXT, 'null');
  END IF;
  IF (SELECT tier FROM public.exercises WHERE id = back_squat) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'V6 FAIL: tier should be 1, got %',
      COALESCE((SELECT tier FROM public.exercises WHERE id = back_squat)::TEXT, 'null');
  END IF;
  IF (SELECT identity_fingerprint FROM public.exercises WHERE id = back_squat) IS NULL THEN
    RAISE EXCEPTION 'V6 FAIL: fingerprint not computed';
  END IF;

  -- Derived: core + {kettlebell, goblet} → no suppression → 'TB-Goblet TB-Kettlebell TESTSquat'
  INSERT INTO public.exercises (name, slug, is_official, core_movement_id, load_position_id)
    VALUES ('placeholder2','test-goblet-squat',true,core_squat,lp_goblet) RETURNING id INTO kb_goblet;
  INSERT INTO public.exercise_equipment (exercise_id, equipment_id) VALUES (kb_goblet, eq_kb);

  SELECT generated_name INTO v_observed FROM public.exercises WHERE id = kb_goblet;
  IF v_observed IS DISTINCT FROM 'TB-Goblet TB-Kettlebell TESTSquat' THEN
    RAISE EXCEPTION 'V6 FAIL: unsuppressed equipment naming, got %', COALESCE(v_observed, 'null');
  END IF;

  -- Stale-alias cleanup: the row-then-junction two-step made 'TB-Goblet TESTSquat' the
  -- intermediate generated name; once the junction changed it, the old alias must be
  -- deleted (debris would squat on a name that rightfully belongs to another exercise).
  IF EXISTS (SELECT 1 FROM public.exercise_aliases
             WHERE exercise_id = kb_goblet AND kind = 'generated'
               AND alias_normalized = public.normalize_alias('TB-Goblet TESTSquat')) THEN
    RAISE EXCEPTION 'V6 FAIL: stale intermediate generated alias not cleaned up';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exercise_aliases
                 WHERE exercise_id = kb_goblet AND kind = 'generated'
                   AND alias_normalized = public.normalize_alias('TB-Goblet TB-Kettlebell TESTSquat')) THEN
    RAISE EXCEPTION 'V6 FAIL: final generated alias missing after junction change';
  END IF;

  -- Grips are identity (Stage 2): setting a width grip must recompute the name (fragment
  -- 'Wide-Grip' lands at order 25, between the load position @20 and the equipment @40)
  -- and fold the grip into the fingerprint. Uses the real seeded 'Wide' width grip, so this
  -- also asserts the dictionary seed and the widened trigger UPDATE OF list.
  SELECT id INTO grip_wide FROM public.grips WHERE name = 'Wide' AND category = 'Width';
  IF grip_wide IS NULL THEN
    RAISE EXCEPTION 'V6 FAIL: seeded Wide width grip missing from public.grips';
  END IF;

  UPDATE public.exercises SET grip_width_id = grip_wide WHERE id = kb_goblet;

  SELECT generated_name INTO v_observed FROM public.exercises WHERE id = kb_goblet;
  IF v_observed IS DISTINCT FROM 'TB-Goblet Wide-Grip TB-Kettlebell TESTSquat' THEN
    RAISE EXCEPTION 'V6 FAIL: grip fragment naming, got %', COALESCE(v_observed, 'null');
  END IF;

  SELECT identity_fingerprint INTO v_observed FROM public.exercises WHERE id = kb_goblet;
  IF position(grip_wide::TEXT IN COALESCE(v_observed, '')) = 0 THEN
    RAISE EXCEPTION 'V6 FAIL: grip % missing from fingerprint, got %', grip_wide, COALESCE(v_observed, 'null');
  END IF;

  -- Non-custom names track the generator; alias rows sync
  SELECT name INTO v_observed FROM public.exercises WHERE id = back_squat AND NOT name_is_custom;
  IF v_observed IS DISTINCT FROM 'TB-Back TESTSquat' THEN
    RAISE EXCEPTION 'V6 FAIL: display name should track generated name when not custom, got %',
      COALESCE(v_observed, 'null');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exercise_aliases
                 WHERE exercise_id = back_squat AND kind = 'generated'
                   AND alias_normalized = public.normalize_alias('TB-Back TESTSquat')) THEN
    RAISE EXCEPTION 'V6 FAIL: generated alias not synced';
  END IF;

  -- Wizard-shaped core insert (is_core=true, core_movement_id NULL — the app predates the
  -- column): the BEFORE trigger must self-reference it and the engine must derive tier 0,
  -- an empty fingerprint, and a generated alias.
  INSERT INTO public.exercises (name, slug, is_core, is_official)
    VALUES ('TESTWizardCore','test-wizard-core',true,true) RETURNING id INTO wizard_core;

  IF (SELECT core_movement_id FROM public.exercises WHERE id = wizard_core) IS DISTINCT FROM wizard_core THEN
    RAISE EXCEPTION 'V6 FAIL: wizard-shaped core insert did not self-reference, got %',
      COALESCE((SELECT core_movement_id FROM public.exercises WHERE id = wizard_core)::TEXT, 'null');
  END IF;
  IF (SELECT tier FROM public.exercises WHERE id = wizard_core) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'V6 FAIL: wizard-shaped core tier should be 0, got %',
      COALESCE((SELECT tier FROM public.exercises WHERE id = wizard_core)::TEXT, 'null');
  END IF;
  IF (SELECT identity_fingerprint FROM public.exercises WHERE id = wizard_core) IS DISTINCT FROM '' THEN
    RAISE EXCEPTION 'V6 FAIL: wizard-shaped core fingerprint should be empty string, got %',
      COALESCE((SELECT identity_fingerprint FROM public.exercises WHERE id = wizard_core), 'null');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exercise_aliases
                 WHERE exercise_id = wizard_core AND kind = 'generated'
                   AND alias_normalized = public.normalize_alias('TESTWizardCore')) THEN
    RAISE EXCEPTION 'V6 FAIL: wizard-shaped core generated alias not synced';
  END IF;

  -- Demotion of a childless core succeeds: self-reference cleared, generated alias deleted
  UPDATE public.exercises SET is_core = false WHERE id = wizard_core;
  IF (SELECT core_movement_id FROM public.exercises WHERE id = wizard_core) IS NOT NULL THEN
    RAISE EXCEPTION 'V6 FAIL: demoted core still self-references, got %',
      (SELECT core_movement_id FROM public.exercises WHERE id = wizard_core)::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM public.exercise_aliases WHERE exercise_id = wizard_core AND kind = 'generated') THEN
    SELECT string_agg(alias_normalized, ', ' ORDER BY alias_normalized) INTO v_observed
      FROM public.exercise_aliases WHERE exercise_id = wizard_core AND kind = 'generated';
    RAISE EXCEPTION 'V6 FAIL: demoted core kept generated alias debris: %', v_observed;
  END IF;

  -- Demoting a core WITH dependents must raise (mirrors the RESTRICT-on-delete precedent)
  BEGIN
    UPDATE public.exercises SET is_core = false WHERE id = core_squat;
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
    IF SQLERRM NOT LIKE '%cannot demote%' THEN
      RAISE EXCEPTION 'V6 FAIL: with-child demotion raised the wrong error: %', SQLERRM;
    END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'V6 FAIL: demoting a core with dependents did not raise';
  END IF;

  RAISE NOTICE 'V6 behavioral assertions passed';
END $$;
ROLLBACK;
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  -- V7 retires at Stage 6 together with the objects it guards.
  -- V7: nothing the app reads was dropped or renamed (drops happen in Stage 6, spec Phase 7)
  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises' AND column_name='goal_type_id';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises';
    RAISE EXCEPTION 'V7 FAIL: legacy goal_type_id dropped early (existing columns: %)', v_observed;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises' AND column_name='equipment_types';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises';
    RAISE EXCEPTION 'V7 FAIL: equipment_types dropped early (existing columns: %)', v_observed;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises' AND column_name='aliases';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises';
    RAISE EXCEPTION 'V7 FAIL: aliases array dropped early (existing columns: %)', v_observed;
  END IF;

  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises' AND column_name='movement_style_id';
  IF NOT FOUND THEN
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_observed
      FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises';
    RAISE EXCEPTION 'V7 FAIL: movement_style_id dropped early (existing columns: %)', v_observed;
  END IF;

  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='variation_options';
  IF NOT FOUND THEN
    SELECT string_agg(table_schema, ', ') INTO v_observed
      FROM information_schema.tables WHERE table_name='variation_options';
    RAISE EXCEPTION 'V7 FAIL: variation_options dropped early (found in schemas: %)', COALESCE(v_observed, 'none');
  END IF;

  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='variation_categories';
  IF NOT FOUND THEN
    SELECT string_agg(table_schema, ', ') INTO v_observed
      FROM information_schema.tables WHERE table_name='variation_categories';
    RAISE EXCEPTION 'V7 FAIL: variation_categories dropped early (found in schemas: %)', COALESCE(v_observed, 'none');
  END IF;

  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='exercise_variations';
  IF NOT FOUND THEN
    SELECT string_agg(table_schema, ', ') INTO v_observed
      FROM information_schema.tables WHERE table_name='exercise_variations';
    RAISE EXCEPTION 'V7 FAIL: exercise_variations dropped early (found in schemas: %)', COALESCE(v_observed, 'none');
  END IF;

  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='exercise_planes_of_motion';
  IF NOT FOUND THEN
    SELECT string_agg(table_schema, ', ') INTO v_observed
      FROM information_schema.tables WHERE table_name='exercise_planes_of_motion';
    RAISE EXCEPTION 'V7 FAIL: exercise_planes_of_motion dropped early (found in schemas: %)', COALESCE(v_observed, 'none');
  END IF;

  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='exercise_load_positions';
  IF NOT FOUND THEN
    SELECT string_agg(table_schema, ', ') INTO v_observed
      FROM information_schema.tables WHERE table_name='exercise_load_positions';
    RAISE EXCEPTION 'V7 FAIL: exercise_load_positions dropped early (found in schemas: %)', COALESCE(v_observed, 'none');
  END IF;

  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='exercise_stances';
  IF NOT FOUND THEN
    SELECT string_agg(table_schema, ', ') INTO v_observed
      FROM information_schema.tables WHERE table_name='exercise_stances';
    RAISE EXCEPTION 'V7 FAIL: exercise_stances dropped early (found in schemas: %)', COALESCE(v_observed, 'none');
  END IF;
END $$;
DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
  v_deltype "char";
BEGIN
  -- V8: grips table exists with the approved 9 values, locked down read-only
  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='grips';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V8 FAIL: public.grips table missing';
  END IF;

  SELECT count(*) INTO v_count FROM public.grips;
  IF v_count <> 9 THEN
    SELECT string_agg(name || ' [' || category || ']', ', ' ORDER BY category, display_order) INTO v_observed
      FROM public.grips;
    RAISE EXCEPTION 'V8 FAIL: grips count % (expected 9): %', v_count, COALESCE(v_observed, 'none');
  END IF;

  SELECT count(*) FILTER (WHERE category = 'Orientation') INTO v_count FROM public.grips;
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'V8 FAIL: grips Orientation count % (expected 6)', v_count;
  END IF;
  SELECT count(*) FILTER (WHERE category = 'Width') INTO v_count FROM public.grips;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'V8 FAIL: grips Width count % (expected 3)', v_count;
  END IF;

  SELECT relrowsecurity::TEXT INTO v_observed FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname = 'grips';
  IF v_observed IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'V8 FAIL: public.grips RLS not enabled (relrowsecurity=%)', COALESCE(v_observed, 'null');
  END IF;

  -- read-only to anon: a SELECT policy exists, and no policy grants any write command
  PERFORM 1 FROM pg_policies WHERE schemaname='public' AND tablename='grips' AND cmd='SELECT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V8 FAIL: public.grips has no SELECT policy';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='grips' AND cmd <> 'SELECT') THEN
    SELECT string_agg(policyname || ' (' || cmd || ')', ', ' ORDER BY policyname) INTO v_observed
      FROM pg_policies WHERE schemaname='public' AND tablename='grips' AND cmd <> 'SELECT';
    RAISE EXCEPTION 'V8 FAIL: public.grips has non-SELECT policies: %', v_observed;
  END IF;

  -- V8: exercises grip columns with FK -> grips ON DELETE SET NULL
  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises' AND column_name='grip_orientation_id';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V8 FAIL: public.exercises.grip_orientation_id missing';
  END IF;
  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercises' AND column_name='grip_width_id';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V8 FAIL: public.exercises.grip_width_id missing';
  END IF;

  SELECT c.confdeltype INTO v_deltype
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
   WHERE c.conrelid = 'public.exercises'::regclass AND c.contype = 'f'
     AND c.confrelid = 'public.grips'::regclass AND a.attname = 'grip_orientation_id';
  IF v_deltype IS DISTINCT FROM 'n' THEN
    RAISE EXCEPTION 'V8 FAIL: grip_orientation_id FK confdeltype = % (expected n/SET NULL)', COALESCE(v_deltype, 'missing');
  END IF;
  SELECT c.confdeltype INTO v_deltype
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
   WHERE c.conrelid = 'public.exercises'::regclass AND c.contype = 'f'
     AND c.confrelid = 'public.grips'::regclass AND a.attname = 'grip_width_id';
  IF v_deltype IS DISTINCT FROM 'n' THEN
    RAISE EXCEPTION 'V8 FAIL: grip_width_id FK confdeltype = % (expected n/SET NULL)', COALESCE(v_deltype, 'missing');
  END IF;
END $$;
DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
BEGIN
  -- V8: movement_styles — exactly 11 rows; identity flag on exactly the approved seven
  SELECT count(*) INTO v_count FROM public.movement_styles;
  IF v_count <> 11 THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.movement_styles;
    RAISE EXCEPTION 'V8 FAIL: movement_styles count % (expected 11): %', v_count, v_observed;
  END IF;

  SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed FROM public.movement_styles WHERE is_identity;
  IF v_observed IS DISTINCT FROM 'Assisted, Butterfly, Deficit, Kipping, Plyometric (Explosive), Strict, Weighted' THEN
    RAISE EXCEPTION 'V8 FAIL: identity styles are {%} (expected {Assisted, Butterfly, Deficit, Kipping, Plyometric (Explosive), Strict, Weighted})',
      COALESCE(v_observed, 'none');
  END IF;

  IF EXISTS (SELECT 1 FROM public.movement_styles
             WHERE name IN ('Standard','Unbroken','Alternating','Partial / Range-Limited','Controlled')) THEN
    SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed FROM public.movement_styles
      WHERE name IN ('Standard','Unbroken','Alternating','Partial / Range-Limited','Controlled');
    RAISE EXCEPTION 'V8 FAIL: dropped/merged styles still present: %', v_observed;
  END IF;

  -- V8: movement_families — Core renamed to Midline, Mobility/Control merged away; total 28
  IF EXISTS (SELECT 1 FROM public.movement_families WHERE name IN ('Core','Mobility/Control')) THEN
    SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed FROM public.movement_families
      WHERE name IN ('Core','Mobility/Control');
    RAISE EXCEPTION 'V8 FAIL: retired families still present: %', v_observed;
  END IF;
  PERFORM 1 FROM public.movement_families WHERE name = 'Midline';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V8 FAIL: Midline family missing';
  END IF;
  SELECT count(*) INTO v_count FROM public.movement_families;
  IF v_count <> 28 THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.movement_families;
    RAISE EXCEPTION 'V8 FAIL: movement_families count % (expected 28): %', v_count, v_observed;
  END IF;

  -- V8: goal_types — Cool-Down merged into Recovery; total 6; no orphaned junction rows
  IF EXISTS (SELECT 1 FROM public.goal_types WHERE name = 'Cool-Down') THEN
    RAISE EXCEPTION 'V8 FAIL: Cool-Down goal type still present (id=%)',
      (SELECT id FROM public.goal_types WHERE name = 'Cool-Down');
  END IF;
  SELECT count(*) INTO v_count FROM public.goal_types;
  IF v_count <> 6 THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.goal_types;
    RAISE EXCEPTION 'V8 FAIL: goal_types count % (expected 6): %', v_count, v_observed;
  END IF;
  SELECT count(*) INTO v_count FROM public.exercise_goal_types x
    WHERE NOT EXISTS (SELECT 1 FROM public.goal_types g WHERE g.id = x.goal_type_id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'V8 FAIL: % exercise_goal_types rows reference a nonexistent goal', v_count;
  END IF;

  -- V8: load_positions — Bodyweight dropped, Double Overhead + Waiter added, Hang recategorized,
  -- barbell group implies Barbell; total 15
  IF EXISTS (SELECT 1 FROM public.load_positions WHERE name = 'Bodyweight') THEN
    RAISE EXCEPTION 'V8 FAIL: Bodyweight load position still present (id=%)',
      (SELECT id FROM public.load_positions WHERE name = 'Bodyweight');
  END IF;
  SELECT count(*) INTO v_count FROM public.load_positions
    WHERE name IN ('Double Overhead','Waiter') AND category = 'Dumbbell / KB';
  IF v_count <> 2 THEN
    SELECT string_agg(name || ' [' || COALESCE(category, 'null') || ']', ', ' ORDER BY name) INTO v_observed
      FROM public.load_positions WHERE name IN ('Double Overhead','Waiter');
    RAISE EXCEPTION 'V8 FAIL: Double Overhead / Waiter as Dumbbell / KB: got %', COALESCE(v_observed, 'neither present');
  END IF;
  SELECT category INTO v_observed FROM public.load_positions WHERE name = 'Hang';
  IF v_observed IS DISTINCT FROM 'Start Position' THEN
    RAISE EXCEPTION 'V8 FAIL: Hang category = % (expected Start Position)', COALESCE(v_observed, 'null');
  END IF;
  SELECT count(*) INTO v_count FROM public.load_positions lp
    WHERE lp.name IN ('Back','Front','Overhead','Zercher')
      AND lp.implies_equipment_id = (SELECT id FROM public.equipment WHERE name = 'Barbell');
  IF v_count <> 4 THEN
    SELECT string_agg(lp.name || '->' || COALESCE(q.name, 'null'), ', ' ORDER BY lp.name) INTO v_observed
      FROM public.load_positions lp LEFT JOIN public.equipment q ON q.id = lp.implies_equipment_id
      WHERE lp.name IN ('Back','Front','Overhead','Zercher');
    RAISE EXCEPTION 'V8 FAIL: barbell-group implies_equipment_id (% of 4 correct): %', v_count, v_observed;
  END IF;
  SELECT count(*) INTO v_count FROM public.load_positions;
  IF v_count <> 15 THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.load_positions;
    RAISE EXCEPTION 'V8 FAIL: load_positions count % (expected 15): %', v_count, v_observed;
  END IF;

  -- V8: range_depths — Variable / Custom dropped; Box implies Box equipment; total 8
  IF EXISTS (SELECT 1 FROM public.range_depths WHERE name = 'Variable / Custom') THEN
    RAISE EXCEPTION 'V8 FAIL: Variable / Custom range depth still present (id=%)',
      (SELECT id FROM public.range_depths WHERE name = 'Variable / Custom');
  END IF;
  SELECT count(*) INTO v_count FROM public.range_depths;
  IF v_count <> 8 THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.range_depths;
    RAISE EXCEPTION 'V8 FAIL: range_depths count % (expected 8): %', v_count, v_observed;
  END IF;
  IF (SELECT implies_equipment_id FROM public.range_depths WHERE name = 'Box')
     IS DISTINCT FROM (SELECT id FROM public.equipment WHERE name = 'Box') THEN
    RAISE EXCEPTION 'V8 FAIL: Box range depth implies_equipment_id = % (expected Box equipment id %)',
      COALESCE((SELECT implies_equipment_id FROM public.range_depths WHERE name = 'Box')::TEXT, 'null'),
      COALESCE((SELECT id FROM public.equipment WHERE name = 'Box')::TEXT, 'missing');
  END IF;

  -- V8: stances — Supine + Prone added, Athletic renamed, legacy Supine / Prone kept; total 13
  SELECT count(*) INTO v_count FROM public.stances WHERE name IN ('Supine','Prone');
  IF v_count <> 2 THEN
    SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed FROM public.stances WHERE name IN ('Supine','Prone');
    RAISE EXCEPTION 'V8 FAIL: Supine/Prone stances: got {%}', COALESCE(v_observed, 'neither');
  END IF;
  PERFORM 1 FROM public.stances WHERE name = 'Athletic';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V8 FAIL: Athletic stance missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stances WHERE name = 'Athletic / Partial Squat') THEN
    RAISE EXCEPTION 'V8 FAIL: Athletic / Partial Squat not renamed';
  END IF;
  PERFORM 1 FROM public.stances WHERE name = 'Supine / Prone';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V8 FAIL: legacy Supine / Prone stance dropped early (retires in Stage 3)';
  END IF;
  SELECT count(*) INTO v_count FROM public.stances;
  IF v_count <> 13 THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.stances;
    RAISE EXCEPTION 'V8 FAIL: stances count % (expected 13): %', v_count, v_observed;
  END IF;

  -- V8: equipment — five additions; total 30
  SELECT count(*) INTO v_count FROM public.equipment
    WHERE name IN ('Jump Rope','GHD','Parallettes','Sled','Weight Vest');
  IF v_count <> 5 THEN
    SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed FROM public.equipment
      WHERE name IN ('Jump Rope','GHD','Parallettes','Sled','Weight Vest');
    RAISE EXCEPTION 'V8 FAIL: new equipment (% of 5 present): {%}', v_count, COALESCE(v_observed, 'none');
  END IF;
  SELECT count(*) INTO v_count FROM public.equipment;
  IF v_count <> 30 THEN
    SELECT string_agg(name, ', ' ORDER BY category, display_order) INTO v_observed FROM public.equipment;
    RAISE EXCEPTION 'V8 FAIL: equipment count % (expected 30): %', v_count, v_observed;
  END IF;
END $$;
DO $$
DECLARE
  v_observed TEXT;
  v_order INTEGER;
BEGIN
  -- V8: naming metadata integrity — a value that speaks (non-null fragment) must know where (order)
  SELECT string_agg(bad.v, ', ' ORDER BY bad.v) INTO v_observed FROM (
    SELECT 'equipment: ' || name AS v FROM public.equipment WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'load_positions: ' || name FROM public.load_positions WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'stances: ' || name FROM public.stances WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'range_depths: ' || name FROM public.range_depths WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'symmetries: ' || name FROM public.symmetries WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'movement_styles: ' || name FROM public.movement_styles WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'grips: ' || name FROM public.grips WHERE name_fragment IS NOT NULL AND name_order IS NULL
  ) bad;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V8 FAIL: values with a fragment but no name_order: %', v_observed;
  END IF;

  -- V8: spot asserts (fragment + order per the decision record)
  SELECT name_fragment, name_order INTO v_observed, v_order FROM public.equipment WHERE name = 'Kettlebell';
  IF v_observed IS DISTINCT FROM 'Kettlebell' OR v_order IS DISTINCT FROM 40 THEN
    RAISE EXCEPTION 'V8 FAIL: equipment Kettlebell fragment/order = %/% (expected Kettlebell/40)',
      COALESCE(v_observed, 'null'), COALESCE(v_order::TEXT, 'null');
  END IF;

  SELECT name_fragment, name_order INTO v_observed, v_order FROM public.load_positions WHERE name = 'Goblet';
  IF v_observed IS DISTINCT FROM 'Goblet' OR v_order IS DISTINCT FROM 45 THEN
    RAISE EXCEPTION 'V8 FAIL: load position Goblet fragment/order = %/% (expected Goblet/45)',
      COALESCE(v_observed, 'null'), COALESCE(v_order::TEXT, 'null');
  END IF;

  SELECT name_fragment, name_order INTO v_observed, v_order FROM public.stances WHERE name = 'Wide (Sumo)';
  IF v_observed IS DISTINCT FROM 'Wide-Stance' OR v_order IS DISTINCT FROM 30 THEN
    RAISE EXCEPTION 'V8 FAIL: stance Wide (Sumo) fragment/order = %/% (expected Wide-Stance/30)',
      COALESCE(v_observed, 'null'), COALESCE(v_order::TEXT, 'null');
  END IF;

  SELECT name_fragment, name_order INTO v_observed, v_order FROM public.movement_styles WHERE name = 'Strict';
  IF v_observed IS DISTINCT FROM 'Strict' OR v_order IS DISTINCT FROM 12 THEN
    RAISE EXCEPTION 'V8 FAIL: style Strict fragment/order = %/% (expected Strict/12)',
      COALESCE(v_observed, 'null'), COALESCE(v_order::TEXT, 'null');
  END IF;

  SELECT name_fragment, name_order INTO v_observed, v_order FROM public.movement_styles WHERE name = 'Plyometric (Explosive)';
  IF v_observed IS DISTINCT FROM 'Plyo' OR v_order IS DISTINCT FROM 14 THEN
    RAISE EXCEPTION 'V8 FAIL: style Plyometric (Explosive) fragment/order = %/% (expected Plyo/14)',
      COALESCE(v_observed, 'null'), COALESCE(v_order::TEXT, 'null');
  END IF;

  -- Modifier styles keep fragments for the prescription renderer but stay non-identity
  -- (they must never enter a catalog name).
  PERFORM 1 FROM public.movement_styles WHERE name = 'Pause' AND name_fragment = 'Pause' AND NOT is_identity;
  IF NOT FOUND THEN
    SELECT COALESCE(name_fragment, 'null') || '/' || is_identity::TEXT INTO v_observed
      FROM public.movement_styles WHERE name = 'Pause';
    RAISE EXCEPTION 'V8 FAIL: style Pause fragment/is_identity = % (expected Pause/false)', COALESCE(v_observed, 'row missing');
  END IF;

  SELECT name_fragment, name_order INTO v_observed, v_order FROM public.equipment WHERE name = 'Weight Vest';
  IF v_observed IS DISTINCT FROM 'Vest' OR v_order IS DISTINCT FROM 40 THEN
    RAISE EXCEPTION 'V8 FAIL: equipment Weight Vest fragment/order = %/% (expected Vest/40)',
      COALESCE(v_observed, 'null'), COALESCE(v_order::TEXT, 'null');
  END IF;

  SELECT name_fragment, name_order INTO v_observed, v_order FROM public.equipment WHERE name = 'Parallettes';
  IF v_observed IS DISTINCT FROM 'Parallette' OR v_order IS DISTINCT FROM 40 THEN
    RAISE EXCEPTION 'V8 FAIL: equipment Parallettes fragment/order = %/% (expected Parallette/40)',
      COALESCE(v_observed, 'null'), COALESCE(v_order::TEXT, 'null');
  END IF;

  SELECT name_fragment INTO v_observed FROM public.equipment WHERE name = 'Jump Rope';
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V8 FAIL: equipment Jump Rope should be silent, fragment = %', v_observed;
  END IF;

  SELECT COALESCE(name_fragment, '') || '/' || COALESCE(name_order::TEXT, '') INTO v_observed
    FROM public.stances WHERE name = 'Supine / Prone';
  IF v_observed IS DISTINCT FROM '/' THEN
    RAISE EXCEPTION 'V8 FAIL: legacy stance Supine / Prone must be silent, fragment/order = %', v_observed;
  END IF;

  SELECT name_fragment, name_order INTO v_observed, v_order FROM public.symmetries WHERE name = 'Alternating';
  IF v_observed IS DISTINCT FROM 'Alternating' OR v_order IS DISTINCT FROM 35 THEN
    RAISE EXCEPTION 'V8 FAIL: symmetry Alternating fragment/order = %/% (expected Alternating/35)',
      COALESCE(v_observed, 'null'), COALESCE(v_order::TEXT, 'null');
  END IF;

  SELECT name_fragment, name_order INTO v_observed, v_order FROM public.grips WHERE name = 'Wide' AND category = 'Width';
  IF v_observed IS DISTINCT FROM 'Wide-Grip' OR v_order IS DISTINCT FROM 25 THEN
    RAISE EXCEPTION 'V8 FAIL: grip width Wide fragment/order = %/% (expected Wide-Grip/25)',
      COALESCE(v_observed, 'null'), COALESCE(v_order::TEXT, 'null');
  END IF;

  -- V8: silent defaults carry NULL fragments
  SELECT string_agg(bad.v, ', ' ORDER BY bad.v) INTO v_observed FROM (
    SELECT 'equipment Bodyweight: ' || name_fragment AS v FROM public.equipment WHERE name = 'Bodyweight' AND name_fragment IS NOT NULL
    UNION ALL SELECT 'stance Standard: ' || name_fragment FROM public.stances WHERE name = 'Standard' AND name_fragment IS NOT NULL
    UNION ALL SELECT 'range Full: ' || name_fragment FROM public.range_depths WHERE name = 'Full' AND name_fragment IS NOT NULL
    UNION ALL SELECT 'symmetry Bilateral: ' || name_fragment FROM public.symmetries WHERE name = 'Bilateral' AND name_fragment IS NOT NULL
  ) bad;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V8 FAIL: silent defaults carrying fragments: %', v_observed;
  END IF;
END $$;
SELECT 'FOUNDATION VERIFICATION: PASS' AS result;
