\set ON_ERROR_STOP on
-- scripts/movement-model/verify_foundation.sql
-- Foundation verification: raises on any failure, prints PASS at the end.
-- Run: psql "$DB" -v ON_ERROR_STOP=1 -f scripts/movement-model/verify_foundation.sql
-- Convention: each DO block is self-contained (no state shared between blocks); RAISE messages include the actual value observed.
DO $$
BEGIN
  -- V0: baseline sanity — catalog present (floor moved 300 -> 287: the Stage 3
  -- catalog pass merged 25 duplicates away, 307 + 5 new cores - 25 = 287)
  IF (SELECT count(*) FROM public.exercises) < 287 THEN
    RAISE EXCEPTION 'V0 FAIL: exercises count % below 287', (SELECT count(*) FROM public.exercises);
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
  -- V8: movement_styles — exactly 12 rows (Stage 3 added Crush); identity flag
  -- on exactly the approved eight (Stage 2 seven + Crush)
  SELECT count(*) INTO v_count FROM public.movement_styles;
  IF v_count <> 12 THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.movement_styles;
    RAISE EXCEPTION 'V8 FAIL: movement_styles count % (expected 12): %', v_count, v_observed;
  END IF;

  SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed FROM public.movement_styles WHERE is_identity;
  IF v_observed IS DISTINCT FROM 'Assisted, Butterfly, Crush, Deficit, Kipping, Plyometric (Explosive), Strict, Weighted' THEN
    RAISE EXCEPTION 'V8 FAIL: identity styles are {%} (expected {Assisted, Butterfly, Crush, Deficit, Kipping, Plyometric (Explosive), Strict, Weighted})',
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

  -- V8: stances — Supine + Prone added, Athletic renamed; Stage 3 added the five
  -- body-base values and retired legacy Supine / Prone (V9 asserts the retirement);
  -- total 17
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
  SELECT count(*) INTO v_count FROM public.stances;
  IF v_count <> 17 THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.stances;
    RAISE EXCEPTION 'V8 FAIL: stances count % (expected 17): %', v_count, v_observed;
  END IF;

  -- V8: equipment — Stage 2's five additions plus Stage 3's four; total 34
  SELECT count(*) INTO v_count FROM public.equipment
    WHERE name IN ('Jump Rope','GHD','Parallettes','Sled','Weight Vest');
  IF v_count <> 5 THEN
    SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed FROM public.equipment
      WHERE name IN ('Jump Rope','GHD','Parallettes','Sled','Weight Vest');
    RAISE EXCEPTION 'V8 FAIL: new equipment (% of 5 present): {%}', v_count, COALESCE(v_observed, 'none');
  END IF;
  SELECT count(*) INTO v_count FROM public.equipment;
  IF v_count <> 34 THEN
    SELECT string_agg(name, ', ' ORDER BY category, display_order) INTO v_observed FROM public.equipment;
    RAISE EXCEPTION 'V8 FAIL: equipment count % (expected 34): %', v_count, v_observed;
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

  -- (the "legacy Supine / Prone is silent" spot check retired with the value
  -- itself in Stage 3 — V9 asserts the row is gone)

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
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  -- V9: Stage 3 catalog-pass structure — the four new attribute dictionaries and
  -- variant_labels exist with RLS enabled (standing rule)
  SELECT string_agg(t.name, ', ' ORDER BY t.name) INTO v_observed
    FROM (VALUES ('directions'), ('support_positions'), ('arm_positions'), ('bench_angles'), ('variant_labels')) t(name)
   WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                      WHERE n.nspname = 'public' AND c.relname = t.name AND c.relrowsecurity);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL: Stage 3 tables missing or without RLS: %', v_observed;
  END IF;

  -- V9: exercises gained the five attribute FKs + core_default_equipment
  SELECT string_agg(t.col, ', ' ORDER BY t.col) INTO v_observed
    FROM (VALUES ('direction_id'), ('support_position_id'), ('arm_position_id'),
                 ('bench_angle_id'), ('variant_label_id'), ('core_default_equipment')) t(col)
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = t.col);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL: exercises columns missing: %', v_observed;
  END IF;

  -- V9: G1/G2 structure — variant labels are reference rows (no free text), each
  -- scoped to exactly one core via a mandatory FK, unique per (core, slug)
  PERFORM 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'variant_labels'
      AND column_name = 'core_movement_id' AND is_nullable = 'NO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V9 FAIL: variant_labels.core_movement_id missing or nullable (G2 requires a mandatory core scope)';
  END IF;
  PERFORM 1 FROM pg_constraint
    WHERE conrelid = 'public.variant_labels'::regclass AND contype = 'f'
      AND confrelid = 'public.exercises'::regclass;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V9 FAIL: variant_labels.core_movement_id is not a FK to exercises';
  END IF;
  PERFORM 1 FROM pg_index i
    JOIN pg_attribute a1 ON a1.attrelid = i.indrelid AND a1.attnum = i.indkey[0]
    JOIN pg_attribute a2 ON a2.attrelid = i.indrelid AND a2.attnum = i.indkey[1]
   WHERE i.indrelid = 'public.variant_labels'::regclass AND i.indisunique AND i.indnkeyatts = 2
     AND a1.attname = 'core_movement_id' AND a2.attname = 'slug';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V9 FAIL: variant_labels lacks the UNIQUE (core_movement_id, slug) constraint';
  END IF;

  -- V9: the identity-recompute trigger fires on the five new identity columns
  SELECT string_agg(t.col, ', ' ORDER BY t.col) INTO v_observed
    FROM (VALUES ('direction_id'), ('support_position_id'), ('arm_position_id'),
                 ('bench_angle_id'), ('variant_label_id')) t(col)
   WHERE NOT EXISTS (SELECT 1 FROM pg_trigger tr
                      JOIN pg_attribute a ON a.attrelid = tr.tgrelid AND a.attname = t.col
                     WHERE tr.tgrelid = 'public.exercises'::regclass
                       AND tr.tgname = 'exercises_identity_recompute'
                       AND a.attnum = ANY (tr.tgattr::int2[]));
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL: exercises_identity_recompute does not fire on: %', v_observed;
  END IF;

  -- V9: grip category guard installed (Stage 2 hand-off)
  PERFORM 1 FROM pg_trigger
    WHERE tgrelid = 'public.exercises'::regclass AND tgname = 'exercises_grip_categories';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V9 FAIL: exercises_grip_categories trigger missing';
  END IF;
END $$;
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  -- V9: dictionary contents — directions (8, all speaking at band 22)
  SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed FROM public.directions;
  IF v_observed IS DISTINCT FROM 'Curtsy, Diagonal, Front, Lateral, Low-to-High, Rear, Reverse, Walking' THEN
    RAISE EXCEPTION 'V9 FAIL: directions are {%}', COALESCE(v_observed, 'none');
  END IF;
  SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed FROM public.directions
   WHERE name_fragment IS DISTINCT FROM name OR name_order IS DISTINCT FROM 22;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL: directions off the fragment=name/22 convention: %', v_observed;
  END IF;

  -- V9: support_positions (3; Forearm is the silent default)
  SELECT string_agg(name || '=' || COALESCE(name_fragment, '~') || '/' || COALESCE(name_order::TEXT, '~'),
                    ', ' ORDER BY display_order) INTO v_observed
    FROM public.support_positions;
  IF v_observed IS DISTINCT FROM 'Forearm=~/~, Hand=High/24, Side=Side/24' THEN
    RAISE EXCEPTION 'V9 FAIL: support_positions = {%} (expected {Forearm=~/~, Hand=High/24, Side=Side/24})',
      COALESCE(v_observed, 'none');
  END IF;

  -- V9: arm_positions (6 at band 26; Across-Body speaks as Cross-Body, Braced as Concentration)
  SELECT string_agg(name || '=' || COALESCE(name_fragment, '~') || '/' || COALESCE(name_order::TEXT, '~'),
                    ', ' ORDER BY display_order) INTO v_observed
    FROM public.arm_positions;
  IF v_observed IS DISTINCT FROM
     'Overhead=Overhead/26, Behind-Body=Behind-Body/26, In-Front=In-Front/26, Across-Body=Cross-Body/26, Braced=Concentration/26, Straight-Arm=Straight-Arm/26' THEN
    RAISE EXCEPTION 'V9 FAIL: arm_positions = {%}', COALESCE(v_observed, 'none');
  END IF;

  -- V9: bench_angles (3 at band 28; Flat silent; Incline/Decline imply Bench)
  SELECT string_agg(name || '=' || COALESCE(name_fragment, '~') || '/' || COALESCE(name_order::TEXT, '~')
                    || '/' || COALESCE((SELECT q.name FROM public.equipment q WHERE q.id = implies_equipment_id), '~'),
                    ', ' ORDER BY display_order) INTO v_observed
    FROM public.bench_angles;
  IF v_observed IS DISTINCT FROM 'Flat=~/~/~, Incline=Incline/28/Bench, Decline=Decline/28/Bench' THEN
    RAISE EXCEPTION 'V9 FAIL: bench_angles = {%} (expected Flat silent, Incline/Decline at 28 implying Bench)',
      COALESCE(v_observed, 'none');
  END IF;

  -- V9: variant_labels — exactly the 17 approved labels, each on its approved core
  SELECT string_agg(c.name || ':' || vl.slug, ', ' ORDER BY c.name, vl.slug) INTO v_observed
    FROM public.variant_labels vl JOIN public.exercises c ON c.id = vl.core_movement_id;
  IF v_observed IS DISTINCT FROM
     'Calf Raise:donkey, Crunch:double, Crunch:elbow-reach, Crunch:toe-tap, Curl:ez-bar, Curl:horn, Jump Rope:double-under, Leg Press:high-stance, Mountain Climber:double-tap, Mountain Climber:spider, Plank:grab-reach-pull, Plank:jacks, Plank:pull-through, Plank:reach, Plank:renegade-row, Pull-Up:chest-to-bar, Push-Up:walkout' THEN
    RAISE EXCEPTION 'V9 FAIL: variant label set diverges: {%}', COALESCE(v_observed, 'none');
  END IF;
  SELECT string_agg(slug, ', ' ORDER BY slug) INTO v_observed FROM public.variant_labels
   WHERE name_order IS DISTINCT FROM 48 OR COALESCE(name_fragment, '') = '';
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL: variant labels off band 48 or fragmentless: %', v_observed;
  END IF;

  -- V9: Cross-Body / Rotational symmetry amendment (speaks at 35)
  SELECT COALESCE(name_fragment, '~') || '/' || COALESCE(name_order::TEXT, '~') INTO v_observed
    FROM public.symmetries WHERE name = 'Cross-Body / Rotational';
  IF v_observed IS DISTINCT FROM 'Cross-Body/35' THEN
    RAISE EXCEPTION 'V9 FAIL: Cross-Body / Rotational fragment/order = % (expected Cross-Body/35)',
      COALESCE(v_observed, 'missing');
  END IF;

  -- V9: legacy 'Supine / Prone' stance retired by the catalog pass
  IF EXISTS (SELECT 1 FROM public.stances WHERE name = 'Supine / Prone') THEN
    RAISE EXCEPTION 'V9 FAIL: legacy Supine / Prone stance still present';
  END IF;
END $$;
DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
BEGIN
  -- V9: post-pass catalog invariants. Cores carry no equipment junction rows —
  -- their default kit lives in core_default_equipment (naming-only)
  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_observed
    FROM public.exercises e
   WHERE e.is_core AND EXISTS (SELECT 1 FROM public.exercise_equipment ee WHERE ee.exercise_id = e.id);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL: cores carrying equipment junction rows: %', v_observed;
  END IF;
  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_observed
    FROM public.exercises e WHERE NOT e.is_core AND e.core_default_equipment IS NOT NULL;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL: non-core rows carrying core_default_equipment: %', v_observed;
  END IF;

  -- V9: the five Stage 3 core rows carry their approved defaults
  SELECT string_agg(e.name || '=' || COALESCE(e.core_default_equipment, '~'), ', ' ORDER BY e.name)
    INTO v_observed
    FROM public.exercises e
   WHERE e.is_core AND e.name IN ('Plank', 'Carry', 'Bent-Over Row', 'Lat Pulldown', 'Raise');
  IF v_observed IS DISTINCT FROM
     'Bent-Over Row=Barbell, Carry=~, Lat Pulldown=Cable, Plank=Bodyweight, Floor, Raise=Dumbbell' THEN
    RAISE EXCEPTION 'V9 FAIL: new-core defaults diverge: {%}', COALESCE(v_observed, 'none');
  END IF;

  -- V9: identity — every row with a core has a fingerprint, and fingerprints are
  -- unique within a core
  SELECT count(*) INTO v_count FROM public.exercises
   WHERE core_movement_id IS NOT NULL AND identity_fingerprint IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'V9 FAIL: % rows with a core but no fingerprint', v_count;
  END IF;
  SELECT string_agg(d.msg, '; ' ORDER BY d.msg) INTO v_observed FROM (
    SELECT 'core ' || c.name || ' x' || count(*) AS msg
      FROM public.exercises e JOIN public.exercises c ON c.id = e.core_movement_id
     GROUP BY c.name, e.core_movement_id, e.identity_fingerprint
    HAVING count(*) > 1
  ) d;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL: duplicate identity fingerprints within a core: %', v_observed;
  END IF;

  -- V9: G2 — a row's variant label must be scoped to that row's own core
  SELECT string_agg(e.name || ' (label ' || vl.slug || ' scoped to ' || c.name || ')', '; ' ORDER BY e.name)
    INTO v_observed
    FROM public.exercises e
    JOIN public.variant_labels vl ON vl.id = e.variant_label_id
    JOIN public.exercises c ON c.id = vl.core_movement_id
   WHERE vl.core_movement_id IS DISTINCT FROM e.core_movement_id;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL (G2): variant labels used outside their core scope: %', v_observed;
  END IF;

  -- V9: G3 ceiling — no core carries more than 6 variant-labelled children
  SELECT string_agg(c.name || ' x' || d.n, '; ' ORDER BY c.name) INTO v_observed
    FROM (SELECT e.core_movement_id, count(*) AS n
            FROM public.exercises e
           WHERE e.variant_label_id IS NOT NULL AND NOT e.is_core
           GROUP BY e.core_movement_id
          HAVING count(*) > 6) d
    JOIN public.exercises c ON c.id = d.core_movement_id;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL (G3): cores exceeding 6 variant-labelled children: %', v_observed;
  END IF;

  -- V9: G3 flag (warning, not failure) — a label pattern used by >= 3 rows across
  -- >= 2 cores suggests a missing shared attribute
  SELECT string_agg(d.slug || ' (' || d.rows || ' rows / ' || d.cores || ' cores)', '; ' ORDER BY d.slug)
    INTO v_observed
    FROM (SELECT vl.slug, count(e.id) AS rows, count(DISTINCT vl.core_movement_id) AS cores
            FROM public.variant_labels vl
            JOIN public.exercises e ON e.variant_label_id = vl.id
           GROUP BY vl.slug
          HAVING count(e.id) >= 3 AND count(DISTINCT vl.core_movement_id) >= 2) d;
  IF v_observed IS NOT NULL THEN
    RAISE WARNING 'V9 FLAG (G3): variant label patterns recurring across cores (candidate shared attributes): %', v_observed;
  END IF;
END $$;
DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
BEGIN
  -- V9: engine spot checks — the blessed generated names that exercise the new
  -- bands (variant 48, arm position 26, Crush style 14, Cross-Body symmetry 35,
  -- core-default equipment suppression)
  SELECT string_agg(bad.v, E'\n') INTO v_observed FROM (
    SELECT 'Double Crunch -> ' || COALESCE(generated_name, 'null') FROM public.exercises
     WHERE id = '8c35133e-f9c9-4b6c-8a25-fb894bcf4201' AND generated_name IS DISTINCT FROM 'Double Crunch'
    UNION ALL
    SELECT 'Cross-Body Elbow-Reach Crunch -> ' || COALESCE(generated_name, 'null') FROM public.exercises
     WHERE id = '47fb4553-1439-437f-b929-da8f132151bd' AND generated_name IS DISTINCT FROM 'Cross-Body Elbow-Reach Crunch'
    UNION ALL
    SELECT 'Crush Alternating Dumbbell Press -> ' || COALESCE(generated_name, 'null') FROM public.exercises
     WHERE id = '98ca656f-c6d2-497e-b734-84e4ce38fa8f' AND generated_name IS DISTINCT FROM 'Crush Alternating Dumbbell Press'
    UNION ALL
    SELECT 'Alternating Dumbbell Grab-Reach-Pull Plank -> ' || COALESCE(generated_name, 'null') FROM public.exercises
     WHERE id = 'ee95e859-8e5e-4346-a3b0-9869a8c7d86b' AND generated_name IS DISTINCT FROM 'Alternating Dumbbell Grab-Reach-Pull Plank'
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL: sampled generated names diverge:\n%', v_observed;
  END IF;

  -- V9: documented Single-Arm Powerbomb suppression — the string aliases
  -- Overhead Extension ONLY, and the Powerbomb row minted no generated alias
  SELECT count(*) INTO v_count FROM public.exercise_aliases
   WHERE alias_normalized = public.normalize_alias('Overhead Dumbbell Triceps Extension');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'V9 FAIL: ''Overhead Dumbbell Triceps Extension'' has % alias rows (expected exactly 1)', v_count;
  END IF;
  PERFORM 1 FROM public.exercise_aliases
   WHERE exercise_id = '730c9097-4ef9-410d-81fc-d0e0d79113ac'          -- Overhead Extension
     AND alias_normalized = public.normalize_alias('Overhead Dumbbell Triceps Extension')
     AND kind = 'generated';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V9 FAIL: ''Overhead Dumbbell Triceps Extension'' does not alias Overhead Extension';
  END IF;
  SELECT string_agg(alias, ', ' ORDER BY alias) INTO v_observed FROM public.exercise_aliases
   WHERE exercise_id = '6dfbc753-9048-4a32-8a9a-3e90d3d24cd3'          -- Single-Arm Overhead Triceps Extension
     AND kind = 'generated';
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL: Powerbomb row carries generated aliases despite the documented suppression: %', v_observed;
  END IF;

  -- V9: grip categories hold at the data level (the behavioral check follows)
  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_observed
    FROM public.exercises e
    LEFT JOIN public.grips go ON go.id = e.grip_orientation_id
    LEFT JOIN public.grips gw ON gw.id = e.grip_width_id
   WHERE (e.grip_orientation_id IS NOT NULL AND go.category IS DISTINCT FROM 'Orientation')
      OR (e.grip_width_id IS NOT NULL AND gw.category IS DISTINCT FROM 'Width');
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V9 FAIL: rows with cross-category grip references: %', v_observed;
  END IF;
END $$;
-- V9: grip category guard behavior (fixture-based, rolled back — harness stays side-effect-free)
BEGIN;
DO $$
DECLARE
  v_exercise UUID;
  v_width UUID;
  v_orientation UUID;
  v_caught BOOLEAN := false;
BEGIN
  SELECT id INTO v_exercise FROM public.exercises ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_width FROM public.grips WHERE category = 'Width' ORDER BY display_order LIMIT 1;
  SELECT id INTO v_orientation FROM public.grips WHERE category = 'Orientation' ORDER BY display_order LIMIT 1;

  BEGIN
    UPDATE public.exercises SET grip_orientation_id = v_width WHERE id = v_exercise;
  EXCEPTION WHEN raise_exception THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'V9 FAIL: grip guard accepted a Width grip in grip_orientation_id';
  END IF;

  v_caught := false;
  BEGIN
    UPDATE public.exercises SET grip_width_id = v_orientation WHERE id = v_exercise;
  EXCEPTION WHEN raise_exception THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'V9 FAIL: grip guard accepted an Orientation grip in grip_width_id';
  END IF;
END $$;
ROLLBACK;
DO $$
DECLARE
  v_def TEXT;
  v_observed TEXT;
BEGIN
  -- V10: Stage 4 fingerprint lock — a DEFERRABLE INITIALLY IMMEDIATE unique
  -- CONSTRAINT on exactly (core_movement_id, identity_fingerprint), and the
  -- plain exercises_fingerprint_idx is gone. Never both.
  SELECT pg_get_indexdef(c.conindid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.exercises'::regclass
     AND c.conname = 'exercises_fingerprint_key'
     AND c.contype = 'u' AND c.condeferrable AND NOT c.condeferred;
  IF v_def IS NULL THEN
    SELECT string_agg(conname || ' (type=' || contype || ', deferrable=' || condeferrable
                      || ', initially_deferred=' || condeferred || ')', '; ' ORDER BY conname)
      INTO v_observed
      FROM pg_constraint WHERE conrelid = 'public.exercises'::regclass AND contype = 'u';
    RAISE EXCEPTION 'V10 FAIL: exercises_fingerprint_key is not a DEFERRABLE INITIALLY IMMEDIATE unique constraint (unique constraints on exercises: %)',
      COALESCE(v_observed, 'none');
  END IF;
  IF v_def NOT LIKE '%UNIQUE INDEX%' OR v_def NOT LIKE '%(core_movement_id, identity_fingerprint)%' THEN
    RAISE EXCEPTION 'V10 FAIL: exercises_fingerprint_key backing index has the wrong shape: %', v_def;
  END IF;
  PERFORM 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'exercises_fingerprint_idx';
  IF FOUND THEN
    RAISE EXCEPTION 'V10 FAIL: plain exercises_fingerprint_idx still present alongside the unique lock (never both)';
  END IF;

  -- V10: the engine runs on the session-variable guard, not the depth guard
  -- (I2), the worklist worker exists, and the core-reference validation
  -- carries its locking reads under definer rights (I3).
  PERFORM 1 FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'recompute_exercise_identity_row';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V10 FAIL: worker function recompute_exercise_identity_row missing';
  END IF;
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_observed
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND ((p.proname IN ('trg_exercise_identity', 'trg_junction_identity', 'recompute_exercise_identity')
           AND (p.prosrc LIKE '%pg_trigger_depth%' OR p.prosrc NOT LIKE '%fittracker.identity_recompute_active%'))
       OR (p.proname = 'recompute_exercise_identity_row' AND p.prosrc LIKE '%pg_trigger_depth%'));
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V10 FAIL: engine functions off the session-variable guard: %', v_observed;
  END IF;
  PERFORM 1 FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'enforce_core_self_reference'
     AND p.prosrc LIKE '%FOR KEY SHARE%' AND p.prosrc LIKE '%FOR UPDATE%'
     AND p.prosecdef
     AND array_to_string(COALESCE(p.proconfig, '{}'), ',') LIKE '%search_path=public%';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'V10 FAIL: enforce_core_self_reference lacks the locking reads or SECURITY DEFINER / search_path=public';
  END IF;
END $$;
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  -- V10: within-core generated-name duplicates limited to EXACTLY the five
  -- declared silent-attribute collisions (Unilateral/Pronated are silent in
  -- names, so the fingerprints differ while the names agree). Tight in both
  -- directions, by core id + string, mirroring the Stage 3 self-verify (15e).
  WITH dupes AS (
    SELECT e.core_movement_id, e.generated_name, count(*) AS n
      FROM public.exercises e
     WHERE e.core_movement_id IS NOT NULL AND NOT e.is_core
     GROUP BY e.core_movement_id, e.generated_name
    HAVING count(*) > 1
  ), declared(core_id, generated_name, n) AS (VALUES
    ('b6879563-ab0d-5bc6-9b44-cab09315d939', 'Kettlebell Bent-Over Row', 2),
    ('80d46a74-c62a-4849-920f-22d326bf7cef', 'Cable Chest Fly', 2),
    ('01f01e3a-393d-4819-8834-cf25ea1ba04a', 'Dumbbell Curl', 2),
    ('90d63ecc-cebe-5ace-806d-45c8560f973f', 'Straight-Arm Lat Pulldown', 2),
    ('cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', 'Overhead Dumbbell Triceps Extension', 2)
  )
  SELECT string_agg(d.msg, '; ' ORDER BY d.msg) INTO v_observed FROM (
    SELECT 'undeclared: ' || dp.generated_name || ' x' || dp.n AS msg
      FROM dupes dp
     WHERE NOT EXISTS (SELECT 1 FROM declared dc
                        WHERE dc.core_id::uuid = dp.core_movement_id
                          AND dc.generated_name = dp.generated_name AND dc.n = dp.n)
    UNION ALL
    SELECT 'missing declared: ' || dc.generated_name
      FROM declared dc
     WHERE NOT EXISTS (SELECT 1 FROM dupes dp
                        WHERE dp.core_movement_id = dc.core_id::uuid
                          AND dp.generated_name = dc.generated_name AND dp.n = dc.n)
  ) d;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V10 FAIL: within-core generated-name duplicates diverge from the declared set: %', v_observed;
  END IF;

  -- V10 (M3/I4): zero-attribute children. The unique lock makes a bare child
  -- collide with its core's own ('') slot, so these are impossible WHILE cores
  -- stay attribute-free — flag (never fail) if either side of that reasoning
  -- drifts.
  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_observed
    FROM public.exercises e
   WHERE e.core_movement_id IS NOT NULL AND NOT e.is_core AND e.identity_fingerprint = '';
  IF v_observed IS NOT NULL THEN
    RAISE WARNING 'V10 FLAG (M3/I4): zero-attribute children present: %', v_observed;
  END IF;
  SELECT string_agg(e.name || ' ("' || e.identity_fingerprint || '")', ', ' ORDER BY e.name) INTO v_observed
    FROM public.exercises e WHERE e.is_core AND e.identity_fingerprint <> '';
  IF v_observed IS NOT NULL THEN
    RAISE WARNING 'V10 FLAG: cores carrying identity attributes (reopens the bare-child window): %', v_observed;
  END IF;
END $$;
-- V10: lock + validation behavior (fixture-based, rolled back — harness stays side-effect-free)
BEGIN;
DO $$
DECLARE
  v_target UUID; v_clone UUID; v_noncore UUID;
  v10_core UUID; v10_a UUID; v10_b UUID;
  st_wide UUID; sy_alt UUID;
  v_caught BOOLEAN := false;
  v_observed TEXT;
  r RECORD;
BEGIN
  -- V10 (exit gate): a duplicate insert — same core, same identity attributes
  -- as an EXISTING derivation — is rejected by exercises_fingerprint_key. The
  -- clone copies the target's scalar attributes at INSERT and then its junction
  -- rows; every write recomputes, so the violation fires no later than the
  -- write that completes the matching attribute set. The target must carry at
  -- least one SCALAR identity attribute: a scalar-free target's clone would
  -- collide with the core's own ('') slot at INSERT — the bare-child path, not
  -- the duplicate path this fixture claims to test. Targets whose scalar-only
  -- subset is unclaimed are preferred so the rejection lands on the final,
  -- complete identity (if the subset happens to be claimed, the rejection just
  -- fires earlier — still a duplicate-of-existing rejection).
  SELECT c.id INTO v_target FROM (
    SELECT e.id, e.core_movement_id,
           cardinality(public.exercise_identity_attrs(e.id)) AS card,
           array_to_string(ARRAY(
             SELECT v::text FROM unnest(ARRAY[e.load_position_id, e.stance_id, e.range_depth_id,
                    e.symmetry_id, e.grip_orientation_id, e.grip_width_id, e.direction_id,
                    e.support_position_id, e.arm_position_id, e.bench_angle_id, e.variant_label_id]) v
              WHERE v IS NOT NULL ORDER BY v), '|') AS scalar_fp
      FROM public.exercises e
     WHERE e.core_movement_id IS NOT NULL AND NOT e.is_core
  ) c
  WHERE c.scalar_fp <> ''
  ORDER BY (NOT EXISTS (SELECT 1 FROM public.exercises x
                         WHERE x.core_movement_id = c.core_movement_id
                           AND x.identity_fingerprint = c.scalar_fp)) DESC,
           c.card ASC, c.id ASC
  LIMIT 1;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'V10 FAIL: no scalar-attribute derivation available to clone for the duplicate fixture';
  END IF;

  BEGIN
    INSERT INTO public.exercises (name, slug, is_official, core_movement_id,
      load_position_id, stance_id, range_depth_id, symmetry_id,
      grip_orientation_id, grip_width_id, direction_id, support_position_id,
      arm_position_id, bench_angle_id, variant_label_id)
    SELECT 'V10 DUP CLONE', 'v10-dup-clone', true, e.core_movement_id,
      e.load_position_id, e.stance_id, e.range_depth_id, e.symmetry_id,
      e.grip_orientation_id, e.grip_width_id, e.direction_id, e.support_position_id,
      e.arm_position_id, e.bench_angle_id, e.variant_label_id
      FROM public.exercises e WHERE e.id = v_target
    RETURNING id INTO v_clone;

    FOR r IN SELECT equipment_id FROM public.exercise_equipment WHERE exercise_id = v_target LOOP
      INSERT INTO public.exercise_equipment (exercise_id, equipment_id) VALUES (v_clone, r.equipment_id);
    END LOOP;
    FOR r IN SELECT movement_style_id FROM public.exercise_movement_styles WHERE exercise_id = v_target LOOP
      INSERT INTO public.exercise_movement_styles (exercise_id, movement_style_id) VALUES (v_clone, r.movement_style_id);
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
    IF SQLERRM NOT LIKE '%exercises_fingerprint_key%' THEN
      RAISE EXCEPTION 'V10 FAIL: duplicate rejected by the wrong constraint: %', SQLERRM;
    END IF;
  END;
  IF NOT v_caught THEN
    SELECT name INTO v_observed FROM public.exercises WHERE id = v_target;
    RAISE EXCEPTION 'V10 FAIL: duplicate of % was NOT rejected by the unique lock', v_observed;
  END IF;

  -- V10 (exit gate): the symmetric core-reference validation rejects a
  -- non-core target (phantom-core insert).
  SELECT id INTO v_noncore FROM public.exercises WHERE NOT is_core ORDER BY id LIMIT 1;
  v_caught := false;
  BEGIN
    INSERT INTO public.exercises (name, slug, is_official, core_movement_id)
    VALUES ('V10 PHANTOM', 'v10-phantom', true, v_noncore);
  EXCEPTION WHEN raise_exception THEN
    v_caught := true;
    IF SQLERRM NOT LIKE '%does not reference a core movement%' THEN
      RAISE EXCEPTION 'V10 FAIL: phantom-core insert raised the wrong error: %', SQLERRM;
    END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'V10 FAIL: phantom-core insert (non-core target) was NOT rejected';
  END IF;

  -- V10 (I5): inserting an intermediate derivation re-parents the existing
  -- superset sibling (sibling recompute on identity change).
  SELECT id INTO st_wide FROM public.stances WHERE name = 'Wide (Sumo)';
  SELECT id INTO sy_alt  FROM public.symmetries WHERE name = 'Alternating';
  INSERT INTO public.exercises (name, slug, is_core, is_official)
    VALUES ('V10FIXTURECORE', 'v10-fixture-core', true, true) RETURNING id INTO v10_core;
  INSERT INTO public.exercises (name, slug, is_official, core_movement_id, stance_id, symmetry_id)
    VALUES ('V10FIXTUREB', 'v10-fixture-b', true, v10_core, st_wide, sy_alt) RETURNING id INTO v10_b;
  IF (SELECT parent_exercise_id FROM public.exercises WHERE id = v10_b) IS DISTINCT FROM v10_core THEN
    RAISE EXCEPTION 'V10 FAIL (I5): fixture B should start parented to the core, got %',
      COALESCE((SELECT parent_exercise_id FROM public.exercises WHERE id = v10_b)::TEXT, 'null');
  END IF;
  INSERT INTO public.exercises (name, slug, is_official, core_movement_id, symmetry_id)
    VALUES ('V10FIXTUREA', 'v10-fixture-a', true, v10_core, sy_alt) RETURNING id INTO v10_a;
  IF (SELECT parent_exercise_id FROM public.exercises WHERE id = v10_b) IS DISTINCT FROM v10_a
     OR (SELECT tier FROM public.exercises WHERE id = v10_b) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'V10 FAIL (I5): after inserting intermediate A, B parent/tier = %/% (expected A/2)',
      COALESCE((SELECT parent_exercise_id FROM public.exercises WHERE id = v10_b)::TEXT, 'null'),
      COALESCE((SELECT tier FROM public.exercises WHERE id = v10_b)::TEXT, 'null');
  END IF;
END $$;
ROLLBACK;
-- V10: Stage 4 review C1 regression — the exact 4-row scenario where the old
-- recursive cascade left a stale tier: E={W,AP}, T1={W,Alt} (lowest id),
-- Q={W,G} (oldest created_at), R={W,Alt,G}. Dropping AP from E must leave
-- R at tier 3 under Q (the recursion reached R via T1 first, read Q's stale
-- tier 1, and the no-revisit ledger froze the wrong answer at tier 2; the
-- worklist's global cardinality-ordered pass settles Q before R).
BEGIN;
DO $$
DECLARE
  st_wide UUID; sy_alt UUID; gw_wide UUID; ap_over UUID;
  c1_core UUID := 'c0000000-0000-4000-8000-0000000000c0';
  c1_e    UUID := 'e0000000-0000-4000-8000-0000000000e0';
  c1_t1   UUID := '10000000-0000-4000-8000-000000000011';
  c1_q    UUID := 'f0000000-0000-4000-8000-0000000000f0';
  c1_r    UUID := 'a0000000-0000-4000-8000-0000000000a0';
  v_observed TEXT;
BEGIN
  SELECT id INTO st_wide FROM public.stances WHERE name = 'Wide (Sumo)';
  SELECT id INTO sy_alt  FROM public.symmetries WHERE name = 'Alternating';
  SELECT id INTO gw_wide FROM public.grips WHERE name = 'Wide' AND category = 'Width';
  SELECT id INTO ap_over FROM public.arm_positions WHERE name = 'Overhead';
  IF st_wide IS NULL OR sy_alt IS NULL OR gw_wide IS NULL OR ap_over IS NULL THEN
    RAISE EXCEPTION 'V10 FAIL (C1): dictionary rows missing (Wide (Sumo)=%, Alternating=%, Wide grip=%, Overhead arm=%)',
      COALESCE(st_wide::TEXT, 'null'), COALESCE(sy_alt::TEXT, 'null'),
      COALESCE(gw_wide::TEXT, 'null'), COALESCE(ap_over::TEXT, 'null');
  END IF;

  INSERT INTO public.exercises (id, name, slug, is_core, is_official)
    VALUES (c1_core, 'V10C1CORE', 'v10-c1-core', true, true);
  INSERT INTO public.exercises (id, name, slug, is_official, core_movement_id, stance_id, arm_position_id)
    VALUES (c1_e, 'V10C1E', 'v10-c1-e', true, c1_core, st_wide, ap_over);
  INSERT INTO public.exercises (id, name, slug, is_official, core_movement_id, stance_id, symmetry_id)
    VALUES (c1_t1, 'V10C1T1', 'v10-c1-t1', true, c1_core, st_wide, sy_alt);
  INSERT INTO public.exercises (id, name, slug, is_official, core_movement_id, stance_id, grip_width_id, created_at)
    VALUES (c1_q, 'V10C1Q', 'v10-c1-q', true, c1_core, st_wide, gw_wide, now() - interval '1 day');
  INSERT INTO public.exercises (id, name, slug, is_official, core_movement_id, stance_id, symmetry_id, grip_width_id)
    VALUES (c1_r, 'V10C1R', 'v10-c1-r', true, c1_core, st_wide, sy_alt, gw_wide);

  -- Sanity on the starting shape: R sits under Q (created_at tiebreak) at tier 2.
  IF (SELECT parent_exercise_id FROM public.exercises WHERE id = c1_r) IS DISTINCT FROM c1_q
     OR (SELECT tier FROM public.exercises WHERE id = c1_r) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'V10 FAIL (C1): starting shape wrong — R parent/tier = %/% (expected Q/2)',
      COALESCE((SELECT parent_exercise_id FROM public.exercises WHERE id = c1_r)::TEXT, 'null'),
      COALESCE((SELECT tier FROM public.exercises WHERE id = c1_r)::TEXT, 'null');
  END IF;

  -- The trigger: drop AP from E. E becomes {W}, the parent of T1 and Q; R must
  -- land at tier 3 under Q.
  UPDATE public.exercises SET arm_position_id = NULL WHERE id = c1_e;

  SELECT string_agg(bad.v, '; ') INTO v_observed FROM (
    SELECT 'E parent/tier=' || COALESCE(parent_exercise_id::TEXT, 'null') || '/' || COALESCE(tier::TEXT, 'null')
      FROM public.exercises WHERE id = c1_e AND (parent_exercise_id IS DISTINCT FROM c1_core OR tier IS DISTINCT FROM 1)
    UNION ALL
    SELECT 'T1 parent/tier=' || COALESCE(parent_exercise_id::TEXT, 'null') || '/' || COALESCE(tier::TEXT, 'null')
      FROM public.exercises WHERE id = c1_t1 AND (parent_exercise_id IS DISTINCT FROM c1_e OR tier IS DISTINCT FROM 2)
    UNION ALL
    SELECT 'Q parent/tier=' || COALESCE(parent_exercise_id::TEXT, 'null') || '/' || COALESCE(tier::TEXT, 'null')
      FROM public.exercises WHERE id = c1_q AND (parent_exercise_id IS DISTINCT FROM c1_e OR tier IS DISTINCT FROM 2)
    UNION ALL
    SELECT 'R parent/tier=' || COALESCE(parent_exercise_id::TEXT, 'null') || '/' || COALESCE(tier::TEXT, 'null')
      FROM public.exercises WHERE id = c1_r AND (parent_exercise_id IS DISTINCT FROM c1_q OR tier IS DISTINCT FROM 3)
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V10 FAIL (C1): stale hierarchy after E''s identity change — % (expected E under core/1, T1 under E/2, Q under E/2, R under Q/3)',
      v_observed;
  END IF;
END $$;
ROLLBACK;
-- V10: Stage 4 review I2 — the lock is deferrable: a two-sibling identity swap
-- fails when checked immediately (default) and succeeds with the constraint
-- deferred, validated before commit via SET CONSTRAINTS ALL IMMEDIATE.
BEGIN;
DO $$
DECLARE
  st_wide UUID; st_stag UUID;
  sw_core UUID; sw_1 UUID; sw_2 UUID;
  v_caught BOOLEAN := false;
  v_observed TEXT;
BEGIN
  SELECT id INTO st_wide FROM public.stances WHERE name = 'Wide (Sumo)';
  SELECT id INTO st_stag FROM public.stances WHERE name = 'Staggered';

  INSERT INTO public.exercises (name, slug, is_core, is_official)
    VALUES ('V10SWAPCORE', 'v10-swap-core', true, true) RETURNING id INTO sw_core;
  INSERT INTO public.exercises (name, slug, is_official, core_movement_id, stance_id)
    VALUES ('V10SWAP1', 'v10-swap-1', true, sw_core, st_wide) RETURNING id INTO sw_1;
  INSERT INTO public.exercises (name, slug, is_official, core_movement_id, stance_id)
    VALUES ('V10SWAP2', 'v10-swap-2', true, sw_core, st_stag) RETURNING id INTO sw_2;

  -- Immediate mode (default): the first leg of the swap collides and rejects.
  BEGIN
    UPDATE public.exercises SET stance_id = st_stag WHERE id = sw_1;
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
    IF SQLERRM NOT LIKE '%exercises_fingerprint_key%' THEN
      RAISE EXCEPTION 'V10 FAIL (I2): immediate swap leg rejected by the wrong constraint: %', SQLERRM;
    END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'V10 FAIL (I2): immediate swap leg was NOT rejected';
  END IF;

  -- Deferred: both legs run, the check passes once at SET CONSTRAINTS ALL
  -- IMMEDIATE because the END state is unique.
  SET CONSTRAINTS public.exercises_fingerprint_key DEFERRED;
  UPDATE public.exercises SET stance_id = st_stag WHERE id = sw_1;
  UPDATE public.exercises SET stance_id = st_wide WHERE id = sw_2;
  SET CONSTRAINTS ALL IMMEDIATE;

  SELECT string_agg(bad.v, '; ') INTO v_observed FROM (
    SELECT 'swap-1 fp=' || COALESCE(identity_fingerprint, 'null') FROM public.exercises
     WHERE id = sw_1 AND identity_fingerprint IS DISTINCT FROM st_stag::TEXT
    UNION ALL
    SELECT 'swap-2 fp=' || COALESCE(identity_fingerprint, 'null') FROM public.exercises
     WHERE id = sw_2 AND identity_fingerprint IS DISTINCT FROM st_wide::TEXT
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'V10 FAIL (I2): deferred swap did not land the exchanged fingerprints — %', v_observed;
  END IF;
END $$;
ROLLBACK;
SELECT 'FOUNDATION VERIFICATION: PASS' AS result;
