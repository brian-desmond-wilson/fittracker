-- Migration: Add missing columns to program_workout_exercises
-- These columns were supposed to be added by 20251225000000 but that migration
-- was marked as applied without actually running.

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

-- Allow target_sets to be NULL for warmups/cooldowns
ALTER TABLE program_workout_exercises
  ALTER COLUMN target_sets DROP NOT NULL;

-- Add index for section-based queries
CREATE INDEX IF NOT EXISTS idx_program_workout_exercises_section
  ON program_workout_exercises(program_workout_id, section, exercise_order);
