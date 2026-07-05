-- Migration: Add Movement Attribute Columns to Exercises Table
-- Description: Adds load_position_id, stance_id, range_depth_id, movement_style_id, symmetry_id to exercises
-- These were missing from the previous migration

-- ============================================================================
-- 1. ADD NEW COLUMNS TO EXERCISES
-- ============================================================================

-- Add load position (how weight is held)
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS load_position_id UUID REFERENCES load_positions(id) ON DELETE SET NULL;

-- Add stance (foot/leg positioning)
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS stance_id UUID REFERENCES stances(id) ON DELETE SET NULL;

-- Add range/depth specification
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS range_depth_id UUID REFERENCES range_depths(id) ON DELETE SET NULL;

-- Add movement style (tempo, execution variation)
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS movement_style_id UUID REFERENCES movement_styles(id) ON DELETE SET NULL;

-- Add symmetry pattern
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS symmetry_id UUID REFERENCES symmetries(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_exercises_load_position ON exercises(load_position_id);
CREATE INDEX IF NOT EXISTS idx_exercises_stance ON exercises(stance_id);
CREATE INDEX IF NOT EXISTS idx_exercises_range_depth ON exercises(range_depth_id);
CREATE INDEX IF NOT EXISTS idx_exercises_movement_style ON exercises(movement_style_id);
CREATE INDEX IF NOT EXISTS idx_exercises_symmetry ON exercises(symmetry_id);

-- ============================================================================
-- 3. ADD COMMENTS
-- ============================================================================

COMMENT ON COLUMN exercises.load_position_id IS 'How external weight is held or positioned (e.g., Overhead, FrontRack, BackRack)';
COMMENT ON COLUMN exercises.stance_id IS 'Foot and leg positioning during movement (e.g., Standard, Wide, Split)';
COMMENT ON COLUMN exercises.range_depth_id IS 'Depth or range of motion specification (e.g., Full, Parallel, Box)';
COMMENT ON COLUMN exercises.movement_style_id IS 'Tempo and execution variation (e.g., Strict, Kipping, Pause, Tempo)';
COMMENT ON COLUMN exercises.symmetry_id IS 'Bilateral vs unilateral loading pattern (e.g., Bilateral, Unilateral, Alternating)';
