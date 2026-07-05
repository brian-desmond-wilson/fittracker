-- Create junction table for many-to-many relationship between exercises and goal_types
CREATE TABLE IF NOT EXISTS exercise_goal_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  goal_type_id UUID NOT NULL REFERENCES goal_types(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id, goal_type_id)
);

-- Create index for better query performance
CREATE INDEX idx_exercise_goal_types_exercise ON exercise_goal_types(exercise_id);
CREATE INDEX idx_exercise_goal_types_goal_type ON exercise_goal_types(goal_type_id);

-- Enable RLS
ALTER TABLE exercise_goal_types ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same as exercises - public read, authenticated users can write)
CREATE POLICY "Allow public read access to exercise_goal_types"
  ON exercise_goal_types
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert exercise_goal_types"
  ON exercise_goal_types
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update exercise_goal_types"
  ON exercise_goal_types
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete exercise_goal_types"
  ON exercise_goal_types
  FOR DELETE
  TO authenticated
  USING (true);

-- Migrate existing data from exercises.goal_type_id to junction table
INSERT INTO exercise_goal_types (exercise_id, goal_type_id)
SELECT id, goal_type_id
FROM exercises
WHERE goal_type_id IS NOT NULL;

-- Note: We keep the goal_type_id column in exercises for now for backward compatibility
-- It can be removed in a future migration after all code is updated
