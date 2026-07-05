-- Add exercise group support for OR groups (pick one), supersets, circuits, etc.
-- This allows multiple exercises to be grouped together with shared prescription

-- Add group columns to program_workout_exercises
ALTER TABLE program_workout_exercises
ADD COLUMN IF NOT EXISTS group_id UUID,
ADD COLUMN IF NOT EXISTS group_type TEXT,
ADD COLUMN IF NOT EXISTS group_item_order INTEGER DEFAULT 0;

-- Add constraint for valid group types
ALTER TABLE program_workout_exercises
ADD CONSTRAINT program_workout_exercises_group_type_check
CHECK (group_type IS NULL OR group_type IN ('or', 'superset', 'circuit', 'emom'));

-- Create index for efficient group queries
CREATE INDEX IF NOT EXISTS idx_program_workout_exercises_group_id
ON program_workout_exercises(group_id)
WHERE group_id IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN program_workout_exercises.group_id IS 'UUID linking exercises that belong to the same group (OR, superset, etc.)';
COMMENT ON COLUMN program_workout_exercises.group_type IS 'Type of group: or (pick one), superset, circuit, emom';
COMMENT ON COLUMN program_workout_exercises.group_item_order IS 'Order of exercise within its group (0-indexed)';
