-- Analysis: Find workout_instances that were done across multiple days (split workouts)
-- Run this BEFORE the backfill to see what we're working with

-- ============================================================
-- 1. Summary: How many split workouts exist?
-- ============================================================

SELECT 
  COUNT(DISTINCT wi.id) as total_workout_instances,
  COUNT(DISTINCT CASE WHEN session_count > 1 THEN wi.id END) as split_workouts,
  COUNT(DISTINCT CASE WHEN session_count = 1 THEN wi.id END) as single_session_workouts
FROM workout_instances wi
LEFT JOIN (
  SELECT 
    workout_instance_id,
    COUNT(DISTINCT performed_date) as session_count
  FROM exercise_instances
  WHERE performed_date IS NOT NULL
  GROUP BY workout_instance_id
) sessions ON sessions.workout_instance_id = wi.id;

-- ============================================================
-- 2. Detail: List all split workouts with their session dates
-- ============================================================

SELECT 
  wi.id as workout_instance_id,
  pis.instance_name as program_instance,
  pw.name as workout_name,
  wi.week_number,
  wi.day_number,
  wi.status,
  COUNT(DISTINCT ei.performed_date) as num_sessions,
  ARRAY_AGG(DISTINCT ei.performed_date ORDER BY ei.performed_date) as session_dates,
  COUNT(ei.id) as total_exercises
FROM workout_instances wi
JOIN program_workouts pw ON wi.program_workout_id = pw.id
JOIN program_instances pis ON wi.program_instance_id = pis.id
JOIN exercise_instances ei ON ei.workout_instance_id = wi.id
WHERE ei.performed_date IS NOT NULL
GROUP BY wi.id, pis.instance_name, pw.name, wi.week_number, wi.day_number, wi.status
HAVING COUNT(DISTINCT ei.performed_date) > 1
ORDER BY MIN(ei.performed_date);

-- ============================================================
-- 3. Breakdown: Exercises per date for each split workout
-- ============================================================

SELECT 
  wi.id as workout_instance_id,
  pw.name as workout_name,
  ei.performed_date,
  COUNT(ei.id) as exercises_on_this_date,
  ARRAY_AGG(e.name ORDER BY ei.exercise_order) as exercise_names
FROM workout_instances wi
JOIN program_workouts pw ON wi.program_workout_id = pw.id
JOIN exercise_instances ei ON ei.workout_instance_id = wi.id
JOIN exercises e ON ei.exercise_id = e.id
WHERE wi.id IN (
  -- Only split workouts
  SELECT workout_instance_id 
  FROM exercise_instances 
  WHERE performed_date IS NOT NULL
  GROUP BY workout_instance_id 
  HAVING COUNT(DISTINCT performed_date) > 1
)
GROUP BY wi.id, pw.name, ei.performed_date
ORDER BY wi.id, ei.performed_date;
