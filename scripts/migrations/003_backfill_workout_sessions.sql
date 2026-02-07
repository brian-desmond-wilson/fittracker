-- Backfill: Create workout_sessions from historical data
-- Date: 2026-02-06
-- 
-- This creates workout_sessions for all existing workout_instances:
-- 1. Split workouts (25): One session per unique performed_date
-- 2. Single-day workouts (161): One session using scheduled_date

-- ============================================================
-- STEP 1: Create sessions for SPLIT workouts (multiple dates)
-- ============================================================

-- Insert sessions for workouts with multiple performed_dates
INSERT INTO workout_sessions (
  workout_instance_id,
  user_id,
  session_number,
  session_date,
  started_at,
  duration_seconds,
  notes
)
SELECT 
  wi.id as workout_instance_id,
  wi.user_id,
  ROW_NUMBER() OVER (PARTITION BY wi.id ORDER BY ei.performed_date) as session_number,
  ei.performed_date as session_date,
  -- Use first exercise's created_at as approximate started_at
  MIN(ei.created_at) as started_at,
  0 as duration_seconds,  -- We don't have historical duration data
  'Backfilled from historical data' as notes
FROM workout_instances wi
JOIN exercise_instances ei ON ei.workout_instance_id = wi.id
WHERE ei.performed_date IS NOT NULL
GROUP BY wi.id, wi.user_id, ei.performed_date
ON CONFLICT (workout_instance_id, session_number) DO NOTHING;

-- ============================================================
-- STEP 2: Create sessions for SINGLE-DAY workouts (no performed_date)
-- ============================================================

-- Insert one session for workouts where exercises have NULL performed_date
INSERT INTO workout_sessions (
  workout_instance_id,
  user_id,
  session_number,
  session_date,
  started_at,
  duration_seconds,
  notes
)
SELECT DISTINCT
  wi.id as workout_instance_id,
  wi.user_id,
  1 as session_number,
  COALESCE(wi.scheduled_date, wi.created_at::date) as session_date,
  wi.started_at,
  COALESCE(wi.duration_seconds, 0) as duration_seconds,
  'Backfilled - single session workout' as notes
FROM workout_instances wi
WHERE wi.id NOT IN (
  -- Exclude workouts that already have sessions from Step 1
  SELECT DISTINCT workout_instance_id FROM workout_sessions
)
AND EXISTS (
  -- Only include workouts that have exercise_instances
  SELECT 1 FROM exercise_instances ei WHERE ei.workout_instance_id = wi.id
)
ON CONFLICT (workout_instance_id, session_number) DO NOTHING;

-- ============================================================
-- STEP 3: Link exercise_instances to their sessions
-- ============================================================

-- For exercises WITH performed_date: match to session by date
UPDATE exercise_instances ei
SET workout_session_id = ws.id
FROM workout_sessions ws
WHERE ei.workout_instance_id = ws.workout_instance_id
  AND ei.performed_date = ws.session_date
  AND ei.workout_session_id IS NULL;

-- For exercises WITHOUT performed_date: link to session_number = 1
UPDATE exercise_instances ei
SET workout_session_id = ws.id
FROM workout_sessions ws
WHERE ei.workout_instance_id = ws.workout_instance_id
  AND ws.session_number = 1
  AND ei.performed_date IS NULL
  AND ei.workout_session_id IS NULL;

-- ============================================================
-- STEP 4: Verification queries
-- ============================================================

-- Check: How many sessions were created?
SELECT 
  'workout_sessions created' as metric,
  COUNT(*) as count
FROM workout_sessions;

-- Check: How many exercises are now linked to sessions?
SELECT 
  'exercise_instances with session' as metric,
  COUNT(*) FILTER (WHERE workout_session_id IS NOT NULL) as linked,
  COUNT(*) FILTER (WHERE workout_session_id IS NULL) as unlinked,
  COUNT(*) as total
FROM exercise_instances;

-- Check: Sessions per workout breakdown
SELECT 
  num_sessions,
  COUNT(*) as workout_count
FROM (
  SELECT workout_instance_id, COUNT(*) as num_sessions
  FROM workout_sessions
  GROUP BY workout_instance_id
) sub
GROUP BY num_sessions
ORDER BY num_sessions;
