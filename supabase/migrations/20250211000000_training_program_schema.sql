-- Training Program Management Schema
-- This migration creates all tables needed for training program templates, instances, and workout tracking

-- ============================================================================
-- PROGRAM TEMPLATE TABLES (Read-Only for Users, Admin-Created Content)
-- ============================================================================

-- 1. Program Templates: Main training programs (e.g., Project Mass, PPL Split)
CREATE TABLE IF NOT EXISTS program_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Program Info
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  creator_id UUID REFERENCES auth.users(id),

  -- Program Structure
  duration_weeks INTEGER NOT NULL CHECK (duration_weeks > 0),
  days_per_week INTEGER NOT NULL CHECK (days_per_week > 0 AND days_per_week <= 7),
  minutes_per_session INTEGER NOT NULL CHECK (minutes_per_session > 0),

  -- Program Attributes
  primary_goal TEXT NOT NULL CHECK (primary_goal IN ('Strength', 'Hypertrophy', 'Power', 'Endurance', 'Hybrid')),
  difficulty_level TEXT NOT NULL CHECK (difficulty_level IN ('Beginner', 'Intermediate', 'Advanced')),
  training_style TEXT, -- e.g., 'DUP', 'Linear Progression', 'Block Periodization'

  -- Media
  cover_image_url TEXT,
  video_preview_url TEXT,

  -- Status
  is_published BOOLEAN NOT NULL DEFAULT false,
  is_featured BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  tags TEXT[], -- e.g., ['compound-focused', 'barbell', 'high-volume']
  prerequisites TEXT[], -- e.g., ['6 months training experience', 'squat 225 lbs']
  equipment_required TEXT[] -- e.g., ['barbell', 'rack', 'bench']
);

CREATE INDEX idx_program_templates_slug ON program_templates(slug);
CREATE INDEX idx_program_templates_published ON program_templates(is_published) WHERE is_published = true;
CREATE INDEX idx_program_templates_featured ON program_templates(is_featured) WHERE is_featured = true;

-- 2. Program Cycles: Training phases within a program (e.g., Foundation, Accumulation)
CREATE TABLE IF NOT EXISTS program_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  program_id UUID NOT NULL REFERENCES program_templates(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL CHECK (cycle_number > 0),

  name TEXT NOT NULL,
  description TEXT,
  duration_weeks INTEGER NOT NULL CHECK (duration_weeks > 0),

  UNIQUE(program_id, cycle_number)
);

CREATE INDEX idx_program_cycles_program ON program_cycles(program_id);

-- 3. Exercises: Exercise library (shared across all programs)
CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,

  -- Exercise Properties
  category TEXT NOT NULL CHECK (category IN ('Compound', 'Isolation', 'Accessory', 'Cardio')),
  muscle_groups TEXT[] NOT NULL, -- e.g., ['chest', 'triceps', 'shoulders']
  equipment TEXT[] NOT NULL, -- e.g., ['barbell', 'bench']

  -- Media
  demo_video_url TEXT,
  thumbnail_url TEXT,

  -- Instructions
  setup_instructions TEXT,
  execution_cues TEXT[],
  common_mistakes TEXT[]
);

CREATE INDEX idx_exercises_slug ON exercises(slug);
CREATE INDEX idx_exercises_category ON exercises(category);

-- 4. Program Workouts: Individual workout sessions in a program
CREATE TABLE IF NOT EXISTS program_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  program_id UUID NOT NULL REFERENCES program_templates(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES program_cycles(id) ON DELETE CASCADE,

  -- Position in Program
  week_number INTEGER NOT NULL CHECK (week_number > 0),
  day_number INTEGER NOT NULL CHECK (day_number > 0),

  -- Workout Info
  name TEXT NOT NULL,
  workout_type TEXT NOT NULL CHECK (workout_type IN ('Strength', 'Hypertrophy', 'Power', 'Endurance', 'Rest', 'Deload')),
  estimated_duration_minutes INTEGER CHECK (estimated_duration_minutes > 0),

  -- Instructions
  warmup_instructions TEXT,
  cooldown_instructions TEXT,
  notes TEXT,

  UNIQUE(program_id, week_number, day_number)
);

CREATE INDEX idx_program_workouts_program ON program_workouts(program_id);
CREATE INDEX idx_program_workouts_cycle ON program_workouts(cycle_id);
CREATE INDEX idx_program_workouts_position ON program_workouts(program_id, week_number, day_number);

-- 5. Program Workout Exercises: Exercises within a specific workout (junction table)
CREATE TABLE IF NOT EXISTS program_workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  program_workout_id UUID NOT NULL REFERENCES program_workouts(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,

  exercise_order INTEGER NOT NULL CHECK (exercise_order > 0),

  -- Set/Rep Scheme
  target_sets INTEGER NOT NULL CHECK (target_sets > 0),
  target_reps_min INTEGER CHECK (target_reps_min > 0),
  target_reps_max INTEGER CHECK (target_reps_max >= target_reps_min),
  target_rpe_min NUMERIC(3,1) CHECK (target_rpe_min >= 1 AND target_rpe_min <= 10),
  target_rpe_max NUMERIC(3,1) CHECK (target_rpe_max >= target_rpe_min AND target_rpe_max <= 10),

  -- Rest
  rest_seconds INTEGER CHECK (rest_seconds >= 0),

  -- Notes
  exercise_notes TEXT,
  tempo TEXT, -- e.g., '3-0-1-0' (eccentric-pause-concentric-pause)

  UNIQUE(program_workout_id, exercise_order)
);

CREATE INDEX idx_program_workout_exercises_workout ON program_workout_exercises(program_workout_id);
CREATE INDEX idx_program_workout_exercises_exercise ON program_workout_exercises(exercise_id);

-- 6. Program Workout Exercise Progressions: Week-to-week progression scheme for each exercise
CREATE TABLE IF NOT EXISTS program_workout_exercise_progressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  program_workout_exercise_id UUID NOT NULL REFERENCES program_workout_exercises(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL CHECK (week_number > 0),

  -- Progressive Overload Variables
  intensity_percentage NUMERIC(5,2) CHECK (intensity_percentage > 0 AND intensity_percentage <= 200), -- % of 1RM
  rpe_target NUMERIC(3,1) CHECK (rpe_target >= 1 AND rpe_target <= 10),
  volume_sets INTEGER CHECK (volume_sets > 0),

  -- Notes for this week's variant
  week_notes TEXT,

  UNIQUE(program_workout_exercise_id, week_number)
);

CREATE INDEX idx_progressions_exercise ON program_workout_exercise_progressions(program_workout_exercise_id);

-- 7. Program Media: Videos, PDFs, and resources associated with programs
CREATE TABLE IF NOT EXISTS program_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  program_id UUID NOT NULL REFERENCES program_templates(id) ON DELETE CASCADE,

  media_type TEXT NOT NULL CHECK (media_type IN ('video', 'pdf', 'document', 'image')),
  title TEXT NOT NULL,
  description TEXT,

  -- Storage
  storage_path TEXT, -- Supabase Storage path
  external_url TEXT, -- YouTube, Vimeo, etc.
  file_size_bytes BIGINT,

  -- Video-specific
  duration_seconds INTEGER,
  thumbnail_url TEXT,

  -- Ordering
  display_order INTEGER NOT NULL DEFAULT 0,

  CHECK ((storage_path IS NOT NULL) OR (external_url IS NOT NULL))
);

CREATE INDEX idx_program_media_program ON program_media(program_id);

-- ============================================================================
-- USER PROGRAM INSTANCES (User-Owned Data)
-- ============================================================================

-- 8. Program Instances: User's active/completed program runs
CREATE TABLE IF NOT EXISTS program_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES program_templates(id) ON DELETE RESTRICT,

  -- Instance Info
  instance_name TEXT NOT NULL, -- User's custom name, e.g., "Summer Build 2024"
  start_date DATE NOT NULL,
  expected_end_date DATE NOT NULL,
  actual_end_date DATE,

  -- Progress Tracking
  current_week INTEGER NOT NULL DEFAULT 1,
  current_day INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'abandoned')),

  -- Completion Stats
  workouts_completed INTEGER NOT NULL DEFAULT 0,
  total_workouts INTEGER NOT NULL,

  CONSTRAINT valid_dates CHECK (expected_end_date >= start_date)
);

CREATE INDEX idx_program_instances_user ON program_instances(user_id);
CREATE INDEX idx_program_instances_program ON program_instances(program_id);
CREATE INDEX idx_program_instances_status ON program_instances(user_id, status);

-- 9. Workout Instances: Scheduled workouts for a user's program instance
CREATE TABLE IF NOT EXISTS workout_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  program_instance_id UUID NOT NULL REFERENCES program_instances(id) ON DELETE CASCADE,
  program_workout_id UUID NOT NULL REFERENCES program_workouts(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Scheduling
  scheduled_date DATE NOT NULL,
  week_number INTEGER NOT NULL,
  day_number INTEGER NOT NULL,

  -- Completion
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Performance
  total_duration_minutes INTEGER,
  total_volume_lbs INTEGER, -- Sum of (weight * reps) for all sets

  -- User Notes
  notes TEXT,
  energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10),
  overall_difficulty INTEGER CHECK (overall_difficulty >= 1 AND overall_difficulty <= 10)
);

CREATE INDEX idx_workout_instances_instance ON workout_instances(program_instance_id);
CREATE INDEX idx_workout_instances_user ON workout_instances(user_id);
CREATE INDEX idx_workout_instances_date ON workout_instances(user_id, scheduled_date);
CREATE INDEX idx_workout_instances_status ON workout_instances(user_id, status);

-- 10. Exercise Instances: Exercises within a completed/in-progress workout
CREATE TABLE IF NOT EXISTS exercise_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  workout_instance_id UUID NOT NULL REFERENCES workout_instances(id) ON DELETE CASCADE,
  program_workout_exercise_id UUID NOT NULL REFERENCES program_workout_exercises(id) ON DELETE RESTRICT,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  exercise_order INTEGER NOT NULL,

  -- Completion
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,

  -- User Notes
  notes TEXT,
  form_quality INTEGER CHECK (form_quality >= 1 AND form_quality <= 5) -- 1=poor, 5=excellent
);

CREATE INDEX idx_exercise_instances_workout ON exercise_instances(workout_instance_id);
CREATE INDEX idx_exercise_instances_user ON exercise_instances(user_id);

-- 11. Set Instances: Individual sets performed by user
CREATE TABLE IF NOT EXISTS set_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  exercise_instance_id UUID NOT NULL REFERENCES exercise_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  set_number INTEGER NOT NULL CHECK (set_number > 0),

  -- Target (from program)
  target_reps INTEGER,
  target_weight_lbs NUMERIC(6,2),

  -- Actual Performance
  actual_reps INTEGER NOT NULL CHECK (actual_reps >= 0),
  actual_weight_lbs NUMERIC(6,2) NOT NULL CHECK (actual_weight_lbs >= 0),
  rpe NUMERIC(3,1) CHECK (rpe >= 1 AND rpe <= 10),

  -- Calculated
  volume_lbs NUMERIC(8,2) GENERATED ALWAYS AS (actual_weight_lbs * actual_reps) STORED,

  -- Flags
  is_warmup BOOLEAN NOT NULL DEFAULT false,
  is_failure BOOLEAN NOT NULL DEFAULT false, -- Did they reach muscular failure?

  UNIQUE(exercise_instance_id, set_number)
);

CREATE INDEX idx_set_instances_exercise ON set_instances(exercise_instance_id);
CREATE INDEX idx_set_instances_user ON set_instances(user_id);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_program_templates_updated_at BEFORE UPDATE ON program_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON exercises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_program_instances_updated_at BEFORE UPDATE ON program_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workout_instances_updated_at BEFORE UPDATE ON workout_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exercise_instances_updated_at BEFORE UPDATE ON exercise_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Program Templates: Public read, admin write
ALTER TABLE program_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Program templates are viewable by everyone"
  ON program_templates FOR SELECT
  USING (is_published = true OR auth.uid() = creator_id);

CREATE POLICY "Only creators can insert programs"
  ON program_templates FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Only creators can update their programs"
  ON program_templates FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE POLICY "Only creators can delete their programs"
  ON program_templates FOR DELETE
  USING (auth.uid() = creator_id);

-- Program Cycles: Inherit access from program template
ALTER TABLE program_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Program cycles are viewable if program is viewable"
  ON program_cycles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM program_templates
      WHERE id = program_cycles.program_id
      AND (is_published = true OR creator_id = auth.uid())
    )
  );

-- Exercises: Public read (exercise library)
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Exercises are viewable by everyone"
  ON exercises FOR SELECT
  USING (true);

-- Program Workouts: Inherit access from program template
ALTER TABLE program_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Program workouts are viewable if program is viewable"
  ON program_workouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM program_templates
      WHERE id = program_workouts.program_id
      AND (is_published = true OR creator_id = auth.uid())
    )
  );

-- Program Workout Exercises: Inherit access from workout
ALTER TABLE program_workout_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Program workout exercises are viewable if workout is viewable"
  ON program_workout_exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM program_workouts pw
      JOIN program_templates pt ON pt.id = pw.program_id
      WHERE pw.id = program_workout_exercises.program_workout_id
      AND (pt.is_published = true OR pt.creator_id = auth.uid())
    )
  );

-- Program Workout Exercise Progressions: Inherit access
ALTER TABLE program_workout_exercise_progressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Progressions are viewable if exercise is viewable"
  ON program_workout_exercise_progressions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM program_workout_exercises pwe
      JOIN program_workouts pw ON pw.id = pwe.program_workout_id
      JOIN program_templates pt ON pt.id = pw.program_id
      WHERE pwe.id = program_workout_exercise_progressions.program_workout_exercise_id
      AND (pt.is_published = true OR pt.creator_id = auth.uid())
    )
  );

-- Program Media: Inherit access from program
ALTER TABLE program_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Program media is viewable if program is viewable"
  ON program_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM program_templates
      WHERE id = program_media.program_id
      AND (is_published = true OR creator_id = auth.uid())
    )
  );

-- Program Instances: User owns their data
ALTER TABLE program_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own program instances"
  ON program_instances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own program instances"
  ON program_instances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own program instances"
  ON program_instances FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own program instances"
  ON program_instances FOR DELETE
  USING (auth.uid() = user_id);

-- Workout Instances: User owns their data
ALTER TABLE workout_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own workout instances"
  ON workout_instances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own workout instances"
  ON workout_instances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workout instances"
  ON workout_instances FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workout instances"
  ON workout_instances FOR DELETE
  USING (auth.uid() = user_id);

-- Exercise Instances: User owns their data
ALTER TABLE exercise_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own exercise instances"
  ON exercise_instances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own exercise instances"
  ON exercise_instances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exercise instances"
  ON exercise_instances FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exercise instances"
  ON exercise_instances FOR DELETE
  USING (auth.uid() = user_id);

-- Set Instances: User owns their data
ALTER TABLE set_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own set instances"
  ON set_instances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own set instances"
  ON set_instances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own set instances"
  ON set_instances FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own set instances"
  ON set_instances FOR DELETE
  USING (auth.uid() = user_id);
