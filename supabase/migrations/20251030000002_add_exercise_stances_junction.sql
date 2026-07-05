-- Create junction table for many-to-many relationship between exercises and stances
CREATE TABLE IF NOT EXISTS exercise_stances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  stance_id UUID NOT NULL REFERENCES stances(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id, stance_id)
);

-- Create index for better query performance
CREATE INDEX idx_exercise_stances_exercise ON exercise_stances(exercise_id);
CREATE INDEX idx_exercise_stances_stance ON exercise_stances(stance_id);

-- Enable RLS
ALTER TABLE exercise_stances ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same as exercises - public read, authenticated users can write)
CREATE POLICY "Allow public read access to exercise_stances"
  ON exercise_stances
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert exercise_stances"
  ON exercise_stances
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update exercise_stances"
  ON exercise_stances
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete exercise_stances"
  ON exercise_stances
  FOR DELETE
  TO authenticated
  USING (true);

-- Migrate existing data from exercises.stance_id to junction table
INSERT INTO exercise_stances (exercise_id, stance_id)
SELECT id, stance_id
FROM exercises
WHERE stance_id IS NOT NULL;

-- Note: We keep the stance_id column in exercises for now for backward compatibility
-- It can be removed in a future migration after all code is updated
