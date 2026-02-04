-- Create junction table for many-to-many relationship between exercises and load_positions
CREATE TABLE IF NOT EXISTS exercise_load_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  load_position_id UUID NOT NULL REFERENCES load_positions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id, load_position_id)
);

-- Create index for better query performance
CREATE INDEX idx_exercise_load_positions_exercise ON exercise_load_positions(exercise_id);
CREATE INDEX idx_exercise_load_positions_load_position ON exercise_load_positions(load_position_id);

-- Enable RLS
ALTER TABLE exercise_load_positions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same as exercises - public read, authenticated users can write)
CREATE POLICY "Allow public read access to exercise_load_positions"
  ON exercise_load_positions
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert exercise_load_positions"
  ON exercise_load_positions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update exercise_load_positions"
  ON exercise_load_positions
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete exercise_load_positions"
  ON exercise_load_positions
  FOR DELETE
  TO authenticated
  USING (true);

-- Migrate existing data from exercises.load_position_id to junction table
INSERT INTO exercise_load_positions (exercise_id, load_position_id)
SELECT id, load_position_id
FROM exercises
WHERE load_position_id IS NOT NULL;

-- Note: We keep the load_position_id column in exercises for now for backward compatibility
-- It can be removed in a future migration after all code is updated
