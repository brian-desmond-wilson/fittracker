-- Migration: Add additional fields to program_workout_exercises for structured workout data
-- This enables the Add Workout wizard to capture section groupings, timed exercises,
-- and flexible load configurations.

-- ============================================================================
-- ADD NEW COLUMNS TO program_workout_exercises
-- ============================================================================

-- Section: Groups exercises by workout phase (Warmup, Prehab, Strength, etc.)
ALTER TABLE program_workout_exercises
  ADD COLUMN IF NOT EXISTS section TEXT CHECK (section IN ('Warmup', 'Prehab', 'Strength', 'Accessory', 'Isometric', 'Cooldown'));

-- Time-based exercises (alternative to reps)
ALTER TABLE program_workout_exercises
  ADD COLUMN IF NOT EXISTS target_time_seconds INTEGER CHECK (target_time_seconds > 0);

-- Per-side flag for unilateral exercises (e.g., "8 reps per side")
ALTER TABLE program_workout_exercises
  ADD COLUMN IF NOT EXISTS is_per_side BOOLEAN DEFAULT false;

-- Load type: Clarifies which load field contains the prescription
ALTER TABLE program_workout_exercises
  ADD COLUMN IF NOT EXISTS load_type TEXT CHECK (load_type IN ('rpe', 'percentage_1rm', 'weight', 'notes', 'none'));

-- Percentage of 1RM prescription (e.g., 65% 1RM)
ALTER TABLE program_workout_exercises
  ADD COLUMN IF NOT EXISTS load_percentage_1rm INTEGER CHECK (load_percentage_1rm >= 1 AND load_percentage_1rm <= 100);

-- Absolute weight prescription in lbs
ALTER TABLE program_workout_exercises
  ADD COLUMN IF NOT EXISTS load_weight_lbs INTEGER CHECK (load_weight_lbs > 0);

-- Free text load notes (e.g., "light band", "bodyweight", "moderate")
ALTER TABLE program_workout_exercises
  ADD COLUMN IF NOT EXISTS load_notes TEXT;

-- Estimated duration for this specific exercise
ALTER TABLE program_workout_exercises
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER CHECK (estimated_duration_minutes > 0);

-- Video URL for exercise demonstration
ALTER TABLE program_workout_exercises
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- ============================================================================
-- MODIFY CONSTRAINTS
-- ============================================================================

-- Allow target_sets to be NULL for warmups/cooldowns (need to drop and re-add)
-- First, drop the NOT NULL constraint on target_sets
ALTER TABLE program_workout_exercises
  ALTER COLUMN target_sets DROP NOT NULL;

-- ============================================================================
-- ADD INDEX FOR SECTION-BASED QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_program_workout_exercises_section
  ON program_workout_exercises(program_workout_id, section, exercise_order);

-- ============================================================================
-- ADD RLS POLICIES FOR INSERT/UPDATE/DELETE ON program_workouts
-- (Currently only SELECT policies exist)
-- ============================================================================

-- Program creators can insert workouts into their own programs
CREATE POLICY "Creators can insert workouts into their programs"
  ON program_workouts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM program_templates
      WHERE id = program_workouts.program_id
      AND creator_id = auth.uid()
    )
  );

-- Program creators can update workouts in their own programs
CREATE POLICY "Creators can update their program workouts"
  ON program_workouts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM program_templates
      WHERE id = program_workouts.program_id
      AND creator_id = auth.uid()
    )
  );

-- Program creators can delete workouts from their own programs
CREATE POLICY "Creators can delete their program workouts"
  ON program_workouts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM program_templates
      WHERE id = program_workouts.program_id
      AND creator_id = auth.uid()
    )
  );

-- ============================================================================
-- ADD RLS POLICIES FOR INSERT/UPDATE/DELETE ON program_workout_exercises
-- ============================================================================

-- Program creators can insert exercises into their workout templates
CREATE POLICY "Creators can insert exercises into their workouts"
  ON program_workout_exercises FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM program_workouts pw
      JOIN program_templates pt ON pt.id = pw.program_id
      WHERE pw.id = program_workout_exercises.program_workout_id
      AND pt.creator_id = auth.uid()
    )
  );

-- Program creators can update exercises in their workout templates
CREATE POLICY "Creators can update exercises in their workouts"
  ON program_workout_exercises FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM program_workouts pw
      JOIN program_templates pt ON pt.id = pw.program_id
      WHERE pw.id = program_workout_exercises.program_workout_id
      AND pt.creator_id = auth.uid()
    )
  );

-- Program creators can delete exercises from their workout templates
CREATE POLICY "Creators can delete exercises from their workouts"
  ON program_workout_exercises FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM program_workouts pw
      JOIN program_templates pt ON pt.id = pw.program_id
      WHERE pw.id = program_workout_exercises.program_workout_id
      AND pt.creator_id = auth.uid()
    )
  );
