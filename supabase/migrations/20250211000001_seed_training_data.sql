-- Seed data for Training Program feature
-- This creates a sample "Project Mass" program with exercises and workouts for testing

-- Note: This uses a placeholder user_id. Replace with actual user ID when needed.
-- For now, we'll leave creator_id as NULL and set is_published = true so everyone can see it.

-- ============================================================================
-- 1. CREATE SAMPLE EXERCISES
-- ============================================================================

INSERT INTO exercises (name, slug, description, category, muscle_groups, equipment) VALUES
-- Compound Exercises
('Barbell Squat', 'barbell-squat', 'The king of leg exercises. Back squat with barbell.', 'Compound', ARRAY['quadriceps', 'glutes', 'hamstrings'], ARRAY['barbell', 'rack']),
('Bench Press', 'bench-press', 'Fundamental horizontal pressing movement.', 'Compound', ARRAY['chest', 'triceps', 'shoulders'], ARRAY['barbell', 'bench']),
('Deadlift', 'deadlift', 'Hip hinge pattern pulling from the floor.', 'Compound', ARRAY['back', 'glutes', 'hamstrings'], ARRAY['barbell']),
('Overhead Press', 'overhead-press', 'Vertical pressing movement for shoulders.', 'Compound', ARRAY['shoulders', 'triceps'], ARRAY['barbell']),
('Barbell Row', 'barbell-row', 'Horizontal pulling movement for back thickness.', 'Compound', ARRAY['back', 'biceps'], ARRAY['barbell']),
('Pull-Up', 'pull-up', 'Vertical pulling bodyweight exercise.', 'Compound', ARRAY['back', 'biceps'], ARRAY['pull-up bar']),

-- Isolation Exercises
('Leg Press', 'leg-press', 'Machine-based leg exercise.', 'Isolation', ARRAY['quadriceps', 'glutes'], ARRAY['leg press machine']),
('Leg Curl', 'leg-curl', 'Hamstring isolation exercise.', 'Isolation', ARRAY['hamstrings'], ARRAY['leg curl machine']),
('Leg Extension', 'leg-extension', 'Quadriceps isolation exercise.', 'Isolation', ARRAY['quadriceps'], ARRAY['leg extension machine']),
('Incline Dumbbell Press', 'incline-dumbbell-press', 'Upper chest pressing movement.', 'Isolation', ARRAY['chest', 'shoulders'], ARRAY['dumbbells', 'bench']),
('Cable Flys', 'cable-flys', 'Chest isolation with constant tension.', 'Isolation', ARRAY['chest'], ARRAY['cable machine']),
('Lateral Raises', 'lateral-raises', 'Side delt isolation.', 'Isolation', ARRAY['shoulders'], ARRAY['dumbbells']),
('Barbell Curl', 'barbell-curl', 'Bicep isolation exercise.', 'Isolation', ARRAY['biceps'], ARRAY['barbell']),
('Tricep Pushdown', 'tricep-pushdown', 'Tricep isolation with cables.', 'Isolation', ARRAY['triceps'], ARRAY['cable machine']),
('Romanian Deadlift', 'romanian-deadlift', 'Hamstring and glute focused hinge pattern.', 'Isolation', ARRAY['hamstrings', 'glutes'], ARRAY['barbell'])
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 2. CREATE PROJECT MASS PROGRAM
-- ============================================================================

INSERT INTO program_templates (
  title,
  slug,
  description,
  creator_name,
  creator_id,
  duration_weeks,
  days_per_week,
  minutes_per_session,
  primary_goal,
  difficulty_level,
  training_style,
  cover_image_url,
  is_published,
  is_featured,
  tags,
  prerequisites,
  equipment_required
) VALUES (
  'Project Mass',
  'project-mass',
  '14-week advanced DUP (Daily Undulating Periodization) program combining heavy strength work with high-volume hypertrophy training. This program is designed to maximize both muscle size and strength through strategic variation of intensity and volume.',
  'Dr. Jacob Wilson',
  NULL,
  14,
  6,
  75,
  'Hybrid',
  'Intermediate',
  'DUP',
  'https://via.placeholder.com/400x250/1a1a1a/ffffff?text=PROJECT+MASS',
  true,
  true,
  ARRAY['compound-focused', 'barbell', 'high-volume', 'progressive-overload'],
  ARRAY['6 months training experience', 'squat 225 lbs', 'bench 185 lbs', 'deadlift 275 lbs'],
  ARRAY['barbell', 'rack', 'bench', 'dumbbells', 'cable machine', 'leg press']
) ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 3. CREATE PROGRAM CYCLES
-- ============================================================================

INSERT INTO program_cycles (program_id, cycle_number, name, description, duration_weeks)
SELECT
  id,
  1,
  'Foundation',
  'Build base strength with progressive overload and focus on movement quality.',
  4
FROM program_templates WHERE slug = 'project-mass'
ON CONFLICT (program_id, cycle_number) DO NOTHING;

INSERT INTO program_cycles (program_id, cycle_number, name, description, duration_weeks)
SELECT
  id,
  2,
  'Accumulation',
  'High-volume hypertrophy phase with increased training frequency.',
  5
FROM program_templates WHERE slug = 'project-mass'
ON CONFLICT (program_id, cycle_number) DO NOTHING;

INSERT INTO program_cycles (program_id, cycle_number, name, description, duration_weeks)
SELECT
  id,
  3,
  'Intensification',
  'Increased intensity with lower volume to peak strength.',
  3
FROM program_templates WHERE slug = 'project-mass'
ON CONFLICT (program_id, cycle_number) DO NOTHING;

INSERT INTO program_cycles (program_id, cycle_number, name, description, duration_weeks)
SELECT
  id,
  4,
  'Realization',
  'Peak strength and test maxes. Reduced volume, maximum intensity.',
  2
FROM program_templates WHERE slug = 'project-mass'
ON CONFLICT (program_id, cycle_number) DO NOTHING;

-- ============================================================================
-- 4. CREATE WEEK 1 WORKOUTS
-- ============================================================================

-- Week 1, Day 1: Leg Strength
INSERT INTO program_workouts (program_id, cycle_id, week_number, day_number, name, workout_type, estimated_duration_minutes)
SELECT
  pt.id,
  pc.id,
  1,
  1,
  'Leg Strength',
  'Strength',
  75
FROM program_templates pt
JOIN program_cycles pc ON pc.program_id = pt.id AND pc.cycle_number = 1
WHERE pt.slug = 'project-mass'
ON CONFLICT (program_id, week_number, day_number) DO NOTHING;

-- Week 1, Day 2: Push Hypertrophy
INSERT INTO program_workouts (program_id, cycle_id, week_number, day_number, name, workout_type, estimated_duration_minutes)
SELECT
  pt.id,
  pc.id,
  1,
  2,
  'Push Hypertrophy',
  'Hypertrophy',
  75
FROM program_templates pt
JOIN program_cycles pc ON pc.program_id = pt.id AND pc.cycle_number = 1
WHERE pt.slug = 'project-mass'
ON CONFLICT (program_id, week_number, day_number) DO NOTHING;

-- Week 1, Day 3: Pull Strength
INSERT INTO program_workouts (program_id, cycle_id, week_number, day_number, name, workout_type, estimated_duration_minutes)
SELECT
  pt.id,
  pc.id,
  1,
  3,
  'Pull Strength',
  'Strength',
  70
FROM program_templates pt
JOIN program_cycles pc ON pc.program_id = pt.id AND pc.cycle_number = 1
WHERE pt.slug = 'project-mass'
ON CONFLICT (program_id, week_number, day_number) DO NOTHING;

-- Week 1, Day 4: Leg Hypertrophy
INSERT INTO program_workouts (program_id, cycle_id, week_number, day_number, name, workout_type, estimated_duration_minutes)
SELECT
  pt.id,
  pc.id,
  1,
  4,
  'Leg Hypertrophy',
  'Hypertrophy',
  80
FROM program_templates pt
JOIN program_cycles pc ON pc.program_id = pt.id AND pc.cycle_number = 1
WHERE pt.slug = 'project-mass'
ON CONFLICT (program_id, week_number, day_number) DO NOTHING;

-- Week 1, Day 5: Push Strength
INSERT INTO program_workouts (program_id, cycle_id, week_number, day_number, name, workout_type, estimated_duration_minutes)
SELECT
  pt.id,
  pc.id,
  1,
  5,
  'Push Strength',
  'Strength',
  75
FROM program_templates pt
JOIN program_cycles pc ON pc.program_id = pt.id AND pc.cycle_number = 1
WHERE pt.slug = 'project-mass'
ON CONFLICT (program_id, week_number, day_number) DO NOTHING;

-- Week 1, Day 6: Pull Hypertrophy
INSERT INTO program_workouts (program_id, cycle_id, week_number, day_number, name, workout_type, estimated_duration_minutes)
SELECT
  pt.id,
  pc.id,
  1,
  6,
  'Pull Hypertrophy',
  'Hypertrophy',
  75
FROM program_templates pt
JOIN program_cycles pc ON pc.program_id = pt.id AND pc.cycle_number = 1
WHERE pt.slug = 'project-mass'
ON CONFLICT (program_id, week_number, day_number) DO NOTHING;

-- Week 1, Day 7: Rest
INSERT INTO program_workouts (program_id, cycle_id, week_number, day_number, name, workout_type, estimated_duration_minutes)
SELECT
  pt.id,
  pc.id,
  1,
  7,
  'Rest Day',
  'Rest',
  NULL
FROM program_templates pt
JOIN program_cycles pc ON pc.program_id = pt.id AND pc.cycle_number = 1
WHERE pt.slug = 'project-mass'
ON CONFLICT (program_id, week_number, day_number) DO NOTHING;

-- ============================================================================
-- 5. ADD EXERCISES TO WORKOUTS (Week 1, Day 1: Leg Strength)
-- ============================================================================

-- Leg Strength Day - Exercise 1: Barbell Squat
INSERT INTO program_workout_exercises (
  program_workout_id,
  exercise_id,
  exercise_order,
  target_sets,
  target_reps_min,
  target_reps_max,
  target_rpe_min,
  target_rpe_max,
  rest_seconds
)
SELECT
  pw.id,
  e.id,
  1,
  4,
  4,
  6,
  8.0,
  9.0,
  240
FROM program_workouts pw
JOIN program_templates pt ON pt.id = pw.program_id
JOIN exercises e ON e.slug = 'barbell-squat'
WHERE pt.slug = 'project-mass' AND pw.week_number = 1 AND pw.day_number = 1
ON CONFLICT (program_workout_id, exercise_order) DO NOTHING;

-- Leg Strength Day - Exercise 2: Romanian Deadlift
INSERT INTO program_workout_exercises (
  program_workout_id,
  exercise_id,
  exercise_order,
  target_sets,
  target_reps_min,
  target_reps_max,
  target_rpe_min,
  target_rpe_max,
  rest_seconds
)
SELECT
  pw.id,
  e.id,
  2,
  3,
  8,
  10,
  7.5,
  8.5,
  180
FROM program_workouts pw
JOIN program_templates pt ON pt.id = pw.program_id
JOIN exercises e ON e.slug = 'romanian-deadlift'
WHERE pt.slug = 'project-mass' AND pw.week_number = 1 AND pw.day_number = 1
ON CONFLICT (program_workout_id, exercise_order) DO NOTHING;

-- Leg Strength Day - Exercise 3: Leg Press
INSERT INTO program_workout_exercises (
  program_workout_id,
  exercise_id,
  exercise_order,
  target_sets,
  target_reps_min,
  target_reps_max,
  target_rpe_min,
  target_rpe_max,
  rest_seconds
)
SELECT
  pw.id,
  e.id,
  3,
  3,
  10,
  12,
  7.0,
  8.0,
  150
FROM program_workouts pw
JOIN program_templates pt ON pt.id = pw.program_id
JOIN exercises e ON e.slug = 'leg-press'
WHERE pt.slug = 'project-mass' AND pw.week_number = 1 AND pw.day_number = 1
ON CONFLICT (program_workout_id, exercise_order) DO NOTHING;

-- ============================================================================
-- 6. ADD EXERCISES TO WORKOUTS (Week 1, Day 2: Push Hypertrophy)
-- ============================================================================

-- Push Hypertrophy - Exercise 1: Bench Press
INSERT INTO program_workout_exercises (
  program_workout_id,
  exercise_id,
  exercise_order,
  target_sets,
  target_reps_min,
  target_reps_max,
  target_rpe_min,
  target_rpe_max,
  rest_seconds
)
SELECT
  pw.id,
  e.id,
  1,
  4,
  8,
  10,
  7.5,
  8.5,
  180
FROM program_workouts pw
JOIN program_templates pt ON pt.id = pw.program_id
JOIN exercises e ON e.slug = 'bench-press'
WHERE pt.slug = 'project-mass' AND pw.week_number = 1 AND pw.day_number = 2
ON CONFLICT (program_workout_id, exercise_order) DO NOTHING;

-- Push Hypertrophy - Exercise 2: Incline Dumbbell Press
INSERT INTO program_workout_exercises (
  program_workout_id,
  exercise_id,
  exercise_order,
  target_sets,
  target_reps_min,
  target_reps_max,
  target_rpe_min,
  target_rpe_max,
  rest_seconds
)
SELECT
  pw.id,
  e.id,
  2,
  3,
  10,
  12,
  7.0,
  8.0,
  150
FROM program_workouts pw
JOIN program_templates pt ON pt.id = pw.program_id
JOIN exercises e ON e.slug = 'incline-dumbbell-press'
WHERE pt.slug = 'project-mass' AND pw.week_number = 1 AND pw.day_number = 2
ON CONFLICT (program_workout_id, exercise_order) DO NOTHING;

-- Push Hypertrophy - Exercise 3: Cable Flys
INSERT INTO program_workout_exercises (
  program_workout_id,
  exercise_id,
  exercise_order,
  target_sets,
  target_reps_min,
  target_reps_max,
  target_rpe_min,
  target_rpe_max,
  rest_seconds
)
SELECT
  pw.id,
  e.id,
  3,
  3,
  12,
  15,
  7.0,
  8.0,
  120
FROM program_workouts pw
JOIN program_templates pt ON pt.id = pw.program_id
JOIN exercises e ON e.slug = 'cable-flys'
WHERE pt.slug = 'project-mass' AND pw.week_number = 1 AND pw.day_number = 2
ON CONFLICT (program_workout_id, exercise_order) DO NOTHING;

-- Push Hypertrophy - Exercise 4: Overhead Press
INSERT INTO program_workout_exercises (
  program_workout_id,
  exercise_id,
  exercise_order,
  target_sets,
  target_reps_min,
  target_reps_max,
  target_rpe_min,
  target_rpe_max,
  rest_seconds
)
SELECT
  pw.id,
  e.id,
  4,
  3,
  8,
  10,
  7.5,
  8.5,
  150
FROM program_workouts pw
JOIN program_templates pt ON pt.id = pw.program_id
JOIN exercises e ON e.slug = 'overhead-press'
WHERE pt.slug = 'project-mass' AND pw.week_number = 1 AND pw.day_number = 2
ON CONFLICT (program_workout_id, exercise_order) DO NOTHING;

-- Push Hypertrophy - Exercise 5: Lateral Raises
INSERT INTO program_workout_exercises (
  program_workout_id,
  exercise_id,
  exercise_order,
  target_sets,
  target_reps_min,
  target_reps_max,
  target_rpe_min,
  target_rpe_max,
  rest_seconds
)
SELECT
  pw.id,
  e.id,
  5,
  3,
  12,
  15,
  7.0,
  8.0,
  90
FROM program_workouts pw
JOIN program_templates pt ON pt.id = pw.program_id
JOIN exercises e ON e.slug = 'lateral-raises'
WHERE pt.slug = 'project-mass' AND pw.week_number = 1 AND pw.day_number = 2
ON CONFLICT (program_workout_id, exercise_order) DO NOTHING;

-- Push Hypertrophy - Exercise 6: Tricep Pushdown
INSERT INTO program_workout_exercises (
  program_workout_id,
  exercise_id,
  exercise_order,
  target_sets,
  target_reps_min,
  target_reps_max,
  target_rpe_min,
  target_rpe_max,
  rest_seconds
)
SELECT
  pw.id,
  e.id,
  6,
  3,
  12,
  15,
  7.0,
  8.0,
  90
FROM program_workouts pw
JOIN program_templates pt ON pt.id = pw.program_id
JOIN exercises e ON e.slug = 'tricep-pushdown'
WHERE pt.slug = 'project-mass' AND pw.week_number = 1 AND pw.day_number = 2
ON CONFLICT (program_workout_id, exercise_order) DO NOTHING;

-- ============================================================================
-- 7. ADD PROGRAM MEDIA
-- ============================================================================

INSERT INTO program_media (program_id, media_type, title, description, external_url, duration_seconds, display_order)
SELECT
  id,
  'video',
  'Program Overview & Introduction',
  'Comprehensive overview of the Project Mass program structure and philosophy.',
  'https://youtube.com/example1',
  754,
  1
FROM program_templates WHERE slug = 'project-mass';

INSERT INTO program_media (program_id, media_type, title, description, external_url, duration_seconds, display_order)
SELECT
  id,
  'video',
  'Exercise Technique Demonstrations',
  'Detailed form breakdowns for all major compound lifts in the program.',
  'https://youtube.com/example2',
  1511,
  2
FROM program_templates WHERE slug = 'project-mass';

INSERT INTO program_media (program_id, media_type, title, description, external_url, duration_seconds, display_order)
SELECT
  id,
  'video',
  'Progressive Overload Strategies',
  'How to properly progress through the program and track your improvements.',
  'https://youtube.com/example3',
  1125,
  3
FROM program_templates WHERE slug = 'project-mass';

INSERT INTO program_media (program_id, media_type, title, description, external_url, file_size_bytes, display_order)
SELECT
  id,
  'pdf',
  'Training Log Template',
  'Printable workout log for tracking sets, reps, and weight.',
  'https://example.com/training-log.pdf',
  250880,
  4
FROM program_templates WHERE slug = 'project-mass';

INSERT INTO program_media (program_id, media_type, title, description, external_url, file_size_bytes, display_order)
SELECT
  id,
  'pdf',
  'Nutrition Guidelines',
  'Recommended nutrition approach to maximize results from this program.',
  'https://example.com/nutrition.pdf',
  1258291,
  5
FROM program_templates WHERE slug = 'project-mass';

INSERT INTO program_media (program_id, media_type, title, description, external_url, file_size_bytes, display_order)
SELECT
  id,
  'pdf',
  'Exercise Library PDF',
  'Complete exercise library with form cues and common mistakes.',
  'https://example.com/exercises.pdf',
  3984384,
  6
FROM program_templates WHERE slug = 'project-mass';
