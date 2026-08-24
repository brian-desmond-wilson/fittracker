-- Migration: 20260204000000_project_mass_import_support.sql
-- Created: 2026-02-04 00:00:00 PST
-- Description: Add schema support for FitTracker Project Mass import functionality
-- 
-- This migration adds columns to support:
-- - Split workouts spanning multiple days (workout_instances.end_date)
-- - Per-exercise date tracking (exercise_instances.performed_date)
-- - Subjective difficulty ratings (set_instances.difficulty_rating)
-- - Weight progression markers (set_instances.increase_weight)
-- - Target rep ranges (program_workout_exercise_progressions target_reps_min/max)

BEGIN;

-- 1. Add end_date to workout_instances for split workouts
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'workout_instances' 
        AND column_name = 'end_date'
    ) THEN
        ALTER TABLE workout_instances 
        ADD COLUMN end_date DATE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE constraint_name = 'workout_instances_end_date_check'
    ) THEN
        ALTER TABLE workout_instances 
        ADD CONSTRAINT workout_instances_end_date_check 
        CHECK (end_date IS NULL OR end_date >= scheduled_date);
    END IF;
END $$;

-- 2. Add performed_date to exercise_instances for per-exercise tracking
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'exercise_instances' 
        AND column_name = 'performed_date'
    ) THEN
        ALTER TABLE exercise_instances 
        ADD COLUMN performed_date DATE;
    END IF;
END $$;

-- 3. Add difficulty_rating to set_instances
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'set_instances' 
        AND column_name = 'difficulty_rating'
    ) THEN
        ALTER TABLE set_instances 
        ADD COLUMN difficulty_rating TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE constraint_name = 'set_instances_difficulty_rating_check'
    ) THEN
        ALTER TABLE set_instances 
        ADD CONSTRAINT set_instances_difficulty_rating_check 
        CHECK (difficulty_rating IS NULL OR difficulty_rating IN ('e', 'em', 'm', 'mh', 'h', 'vh'));
    END IF;
END $$;

-- 4. Add increase_weight to set_instances for ^ marker
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'set_instances' 
        AND column_name = 'increase_weight'
    ) THEN
        ALTER TABLE set_instances 
        ADD COLUMN increase_weight BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- 5. Add target_reps_min to program_workout_exercise_progressions
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'program_workout_exercise_progressions' 
        AND column_name = 'target_reps_min'
    ) THEN
        ALTER TABLE program_workout_exercise_progressions 
        ADD COLUMN target_reps_min INTEGER;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE constraint_name = 'prog_target_reps_min_check'
    ) THEN
        ALTER TABLE program_workout_exercise_progressions 
        ADD CONSTRAINT prog_target_reps_min_check 
        CHECK (target_reps_min IS NULL OR target_reps_min > 0);
    END IF;
END $$;

-- 6. Add target_reps_max to program_workout_exercise_progressions
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'program_workout_exercise_progressions' 
        AND column_name = 'target_reps_max'
    ) THEN
        ALTER TABLE program_workout_exercise_progressions 
        ADD COLUMN target_reps_max INTEGER;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE constraint_name = 'prog_target_reps_max_check'
    ) THEN
        ALTER TABLE program_workout_exercise_progressions 
        ADD CONSTRAINT prog_target_reps_max_check 
        CHECK (target_reps_max IS NULL OR target_reps_min IS NULL OR target_reps_max >= target_reps_min);
    END IF;
END $$;

-- RLS: No new policies needed. Existing row-level security on these tables
-- automatically covers the new columns.

COMMIT;
