-- Agent gateway read views for the workout library: the captured creator
-- workouts the Training tab lists, flattened the way the workout page reads
-- them (mobile/src/lib/supabase/capture.ts). Same agent_* security_invoker
-- pattern as 20261008110000.

-- One row per catalog workout: provenance from its source row, muscle tags
-- as name arrays, the exercise count. Exercises themselves are the second
-- view, keyed by workout id.
CREATE OR REPLACE VIEW public.agent_workout_library WITH (security_invoker = true) AS
SELECT
  w.id,
  w.user_id,
  w.name,
  w.description,
  w.notes,
  w.format,
  w.score_type,
  w.format_minutes,
  w.est_minutes,
  w.rounds,
  w.raw_protocol,
  w.intensity,
  w.skill_level,
  w.block_roles,
  s.platform,
  s.poster_handle AS creator,
  s.source_url,
  (SELECT array_agg(r.name ORDER BY r.name)
     FROM public.captured_workout_muscles wm
     JOIN public.muscle_regions r ON r.id = wm.muscle_region_id
    WHERE wm.captured_workout_id = w.id AND wm.is_primary)      AS primary_muscles,
  (SELECT array_agg(r.name ORDER BY r.name)
     FROM public.captured_workout_muscles wm
     JOIN public.muscle_regions r ON r.id = wm.muscle_region_id
    WHERE wm.captured_workout_id = w.id AND NOT wm.is_primary)  AS secondary_muscles,
  (SELECT array_agg(DISTINCT e.name ORDER BY e.name)
     FROM public.captured_workout_exercises we
     JOIN public.exercise_equipment xe ON xe.exercise_id = we.exercise_id
     JOIN public.equipment e           ON e.id = xe.equipment_id
    WHERE we.captured_workout_id = w.id)                        AS equipment,
  (SELECT count(*) FROM public.captured_workout_exercises we
    WHERE we.captured_workout_id = w.id)                        AS exercise_count,
  w.classified_at,
  w.created_at
FROM public.captured_workouts w
JOIN public.captured_sources s ON s.id = w.source_id;

-- One row per exercise in a workout, in order, with its prescription and
-- the exercise's name, equipment and primary muscles.
CREATE OR REPLACE VIEW public.agent_workout_library_exercises WITH (security_invoker = true) AS
SELECT
  we.id,
  we.captured_workout_id AS workout_id,
  w.name                 AS workout,
  we.exercise_order,
  we.exercise_id,
  x.name                 AS exercise,
  we.target_sets,
  we.target_reps,
  we.target_weight,
  we.target_duration,
  we.rest_seconds,
  we.notes,
  (SELECT array_agg(e.name ORDER BY e.name)
     FROM public.exercise_equipment xe
     JOIN public.equipment e ON e.id = xe.equipment_id
    WHERE xe.exercise_id = we.exercise_id)                      AS equipment,
  (SELECT array_agg(r.name ORDER BY r.name)
     FROM public.exercise_muscle_regions em
     JOIN public.muscle_regions r ON r.id = em.muscle_region_id
    WHERE em.exercise_id = we.exercise_id AND em.is_primary)    AS primary_muscles
FROM public.captured_workout_exercises we
JOIN public.captured_workouts w ON w.id = we.captured_workout_id
JOIN public.exercises         x ON x.id = we.exercise_id;
