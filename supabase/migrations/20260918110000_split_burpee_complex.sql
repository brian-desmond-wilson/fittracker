-- Split "Air Squat, Reverse Lunge, And Burpee Complex" into its three real
-- movements and retire the row (user verdict 2026-09-11: split faithfully).
-- A complex is workout programming, not a catalog exercise. Its parts:
--   Air Squat     → the Squat core (its description IS the air squat; it
--                   already answers to the wild alias "Air Squat")
--   Reverse Lunge → created by 20260918100000_reverse_lunge.sql
--   Burpee        → the Burpee core
--
-- The row carries history, all from one capture and one session, and every
-- piece is split rather than dropped:
--   * captured workout "No-Equipment Complex Challenge" (For Time, 50 reps of
--     the complex; 1 rep = 3 air squats + 2 reverse lunges + 1 burpee) becomes
--     50 rounds of Squat ×3, Reverse Lunge ×2, Burpee ×1 — the creator's
--     protocol as written. The source is linked to all three exercises.
--   * the 2026-08-22 logged instance (one completed set of 50, the session's
--     last exercise) becomes three completed instances holding what was
--     actually performed: 150 squats, 100 reverse lunges, 50 burpees. The
--     original instance row is kept (re-pointed to Squat) so its id survives.
--   * the generated session item that served it is split the same way.
-- Anything ordered after the complex in those lists shifts down by two.
-- Idempotent: a second run finds no complex row and does nothing.

DO $$
DECLARE
  v_complex CONSTANT UUID := '9f6fabc9-1edb-4f68-bb95-25cbc62e24d2';
  v_squat   CONSTANT UUID := '1cd3ad50-d9c5-439b-8dcc-590bb1887d50';
  v_burpee  CONSTANT UUID := 'f5bf41cb-7241-4b46-a656-1015ffbddf21';
  v_cw      CONSTANT UUID := 'c0f2e068-5fc1-459c-88c9-9249931a0990';  -- captured workout
  v_source  CONSTANT UUID := '4ebda20f-7f32-44a1-b2e2-9456f8736eca';  -- its captured source
  v_inst    CONSTANT UUID := '5f109cbd-25b6-4ea5-809b-7083e35c7cd0';  -- logged instance
  v_gsi     CONSTANT UUID := '6cc020ac-f7ec-48c1-80b5-0eb46fc56488';  -- generated session item
  v_rl UUID;
  v_inst_rl UUID; v_inst_bp UUID;
  r_cwe RECORD; r_inst RECORD; r_gsi RECORD;
  v_n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exercises
                  WHERE id = v_complex AND name = 'Air Squat, Reverse Lunge, And Burpee Complex') THEN
    RAISE NOTICE 'split_burpee_complex: complex row already gone — nothing to do';
    RETURN;
  END IF;
  SELECT id INTO v_rl FROM public.exercises WHERE slug = 'reverse-lunge';
  IF v_rl IS NULL THEN
    RAISE EXCEPTION 'split_burpee_complex: Reverse Lunge is missing (20260918100000 must run first)';
  END IF;

  -- 1) Captured workout: 50 rounds of 3 / 2 / 1.
  SELECT * INTO r_cwe FROM public.captured_workout_exercises
   WHERE captured_workout_id = v_cw AND exercise_id = v_complex;
  IF FOUND THEN
    UPDATE public.captured_workouts SET rounds = '50' WHERE id = v_cw;
    UPDATE public.captured_workout_exercises
       SET exercise_order = exercise_order + 2
     WHERE captured_workout_id = v_cw AND exercise_order > r_cwe.exercise_order;
    UPDATE public.captured_workout_exercises
       SET exercise_id = v_squat, target_reps = '3', notes = NULL
     WHERE id = r_cwe.id;
    INSERT INTO public.captured_workout_exercises
      (captured_workout_id, exercise_id, exercise_order, target_sets, target_reps,
       rest_seconds, notes, target_weight, target_duration)
    VALUES
      (v_cw, v_rl,     r_cwe.exercise_order + 1, r_cwe.target_sets, '2',
       r_cwe.rest_seconds, NULL, r_cwe.target_weight, r_cwe.target_duration),
      (v_cw, v_burpee, r_cwe.exercise_order + 2, r_cwe.target_sets, '1',
       r_cwe.rest_seconds, NULL, r_cwe.target_weight, r_cwe.target_duration);
  END IF;
  -- The source now links to the three real movements (its link to the complex
  -- cascades away with the row).
  INSERT INTO public.source_exercises (source_id, exercise_id, was_created)
  VALUES (v_source, v_squat, false), (v_source, v_rl, false), (v_source, v_burpee, false)
  ON CONFLICT (source_id, exercise_id) DO NOTHING;

  -- 2) Logged instance: what was performed, as three instances.
  SELECT * INTO r_inst FROM public.exercise_instances WHERE id = v_inst AND exercise_id = v_complex;
  IF FOUND THEN
    UPDATE public.exercise_instances
       SET exercise_order = exercise_order + 2
     WHERE workout_instance_id = r_inst.workout_instance_id AND exercise_order > r_inst.exercise_order;
    UPDATE public.exercise_instances SET exercise_id = v_squat WHERE id = v_inst;
    UPDATE public.set_instances SET actual_reps = 150, target_reps = 150 WHERE exercise_instance_id = v_inst;

    INSERT INTO public.exercise_instances
      (workout_instance_id, program_workout_exercise_id, exercise_id, user_id, exercise_order,
       status, completed_at, notes, form_quality, performed_date, execution_order, difficulty,
       increase_weight_next, workout_session_id, created_at, updated_at)
    VALUES
      (r_inst.workout_instance_id, NULL, v_rl, r_inst.user_id, r_inst.exercise_order + 1,
       r_inst.status, r_inst.completed_at, NULL, r_inst.form_quality, r_inst.performed_date,
       r_inst.execution_order, r_inst.difficulty, r_inst.increase_weight_next,
       r_inst.workout_session_id, r_inst.created_at, r_inst.updated_at)
    RETURNING id INTO v_inst_rl;
    INSERT INTO public.exercise_instances
      (workout_instance_id, program_workout_exercise_id, exercise_id, user_id, exercise_order,
       status, completed_at, notes, form_quality, performed_date, execution_order, difficulty,
       increase_weight_next, workout_session_id, created_at, updated_at)
    VALUES
      (r_inst.workout_instance_id, NULL, v_burpee, r_inst.user_id, r_inst.exercise_order + 2,
       r_inst.status, r_inst.completed_at, NULL, r_inst.form_quality, r_inst.performed_date,
       r_inst.execution_order, r_inst.difficulty, r_inst.increase_weight_next,
       r_inst.workout_session_id, r_inst.created_at, r_inst.updated_at)
    RETURNING id INTO v_inst_bp;

    INSERT INTO public.set_instances
      (exercise_instance_id, user_id, set_number, target_reps, target_weight_lbs, actual_reps,
       actual_weight_lbs, rpe, is_warmup, is_failure, difficulty_rating, increase_weight, difficulty,
       increase_weight_next, rest_duration_seconds, notes, started_at, ended_at, duration_seconds,
       timing_source, created_at)
    SELECT v_inst_rl, user_id, set_number, 100, target_weight_lbs, 100,
           actual_weight_lbs, rpe, is_warmup, is_failure, difficulty_rating, increase_weight, difficulty,
           increase_weight_next, rest_duration_seconds, notes, started_at, ended_at, duration_seconds,
           timing_source, created_at
      FROM public.set_instances WHERE exercise_instance_id = v_inst;
    INSERT INTO public.set_instances
      (exercise_instance_id, user_id, set_number, target_reps, target_weight_lbs, actual_reps,
       actual_weight_lbs, rpe, is_warmup, is_failure, difficulty_rating, increase_weight, difficulty,
       increase_weight_next, rest_duration_seconds, notes, started_at, ended_at, duration_seconds,
       timing_source, created_at)
    SELECT v_inst_bp, user_id, set_number, 50, target_weight_lbs, 50,
           actual_weight_lbs, rpe, is_warmup, is_failure, difficulty_rating, increase_weight, difficulty,
           increase_weight_next, rest_duration_seconds, notes, started_at, ended_at, duration_seconds,
           timing_source, created_at
      FROM public.set_instances WHERE exercise_instance_id = v_inst;
  END IF;

  -- 3) Generated session item that served it.
  SELECT * INTO r_gsi FROM public.generated_session_items WHERE id = v_gsi AND exercise_id = v_complex;
  IF FOUND THEN
    UPDATE public.generated_session_items
       SET item_order = item_order + 2
     WHERE session_id = r_gsi.session_id AND item_order > r_gsi.item_order;
    UPDATE public.generated_session_items SET exercise_id = v_squat, target_reps = '150' WHERE id = v_gsi;
    INSERT INTO public.generated_session_items
      (session_id, exercise_id, item_order, section, target_sets, target_reps, rest_seconds, reason, was_performed)
    VALUES
      (r_gsi.session_id, v_rl,     r_gsi.item_order + 1, r_gsi.section, r_gsi.target_sets, '100',
       r_gsi.rest_seconds, r_gsi.reason, r_gsi.was_performed),
      (r_gsi.session_id, v_burpee, r_gsi.item_order + 2, r_gsi.section, r_gsi.target_sets, '50',
       r_gsi.rest_seconds, r_gsi.reason, r_gsi.was_performed);
  END IF;

  -- 4) The complex goes. Its junction rows and source link cascade; anything
  --    RESTRICT-linked that this file did not account for fails the delete
  --    and rolls the whole transaction back.
  DELETE FROM public.exercises WHERE id = v_complex;

  -- 5) Assert the end state.
  IF EXISTS (SELECT 1 FROM public.exercises WHERE name = 'Air Squat, Reverse Lunge, And Burpee Complex') THEN
    RAISE EXCEPTION 'split_burpee_complex: the complex row survived';
  END IF;
  SELECT count(*) INTO v_n FROM public.captured_workout_exercises
   WHERE captured_workout_id = v_cw AND exercise_id IN (v_squat, v_rl, v_burpee);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'split_burpee_complex: captured workout has % of the 3 split items', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.exercise_instances ei
    JOIN public.set_instances si ON si.exercise_instance_id = ei.id
   WHERE ei.workout_instance_id = 'd2731a21-e915-4c0c-9cae-24eff2ce5886'
     AND ((ei.exercise_id = v_squat  AND si.actual_reps = 150)
       OR (ei.exercise_id = v_rl     AND si.actual_reps = 100)
       OR (ei.exercise_id = v_burpee AND si.actual_reps = 50));
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'split_burpee_complex: logged history has % of the 3 split sets', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.generated_session_items
   WHERE session_id = '116dfebd-7a45-4fb9-8aa4-1764558ccfcc' AND exercise_id IN (v_squat, v_rl, v_burpee);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'split_burpee_complex: generated session has % of the 3 split items', v_n;
  END IF;
END $$;
