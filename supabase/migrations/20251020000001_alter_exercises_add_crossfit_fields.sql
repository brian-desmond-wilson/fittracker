-- ============================================================================
-- ALTER EXERCISES TABLE - Add CrossFit-specific fields
-- ============================================================================

-- Add CrossFit-specific columns to existing exercises table
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_movement BOOLEAN DEFAULT FALSE;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS goal_type_id UUID REFERENCES goal_types(id);

-- Drop existing indexes if they exist (to avoid conflicts)
DROP INDEX IF EXISTS idx_exercises_is_movement;
DROP INDEX IF EXISTS idx_exercises_goal_type;

-- Create indexes for fast movement lookups
CREATE INDEX idx_exercises_is_movement ON exercises(is_movement) WHERE is_movement = true;
CREATE INDEX idx_exercises_goal_type ON exercises(goal_type_id);
