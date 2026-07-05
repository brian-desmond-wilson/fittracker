-- Create junction table for many-to-many relationship between exercises and planes of motion
CREATE TABLE IF NOT EXISTS exercise_planes_of_motion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  plane_of_motion_id UUID NOT NULL REFERENCES planes_of_motion(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id, plane_of_motion_id)
);

-- Create index for better query performance
CREATE INDEX idx_exercise_planes_exercise ON exercise_planes_of_motion(exercise_id);
CREATE INDEX idx_exercise_planes_plane ON exercise_planes_of_motion(plane_of_motion_id);

-- Enable RLS
ALTER TABLE exercise_planes_of_motion ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same as exercises - public read, authenticated users can write)
CREATE POLICY "Allow public read access to exercise_planes_of_motion"
  ON exercise_planes_of_motion
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow authenticated users to insert exercise_planes_of_motion"
  ON exercise_planes_of_motion
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update exercise_planes_of_motion"
  ON exercise_planes_of_motion
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to delete exercise_planes_of_motion"
  ON exercise_planes_of_motion
  FOR DELETE
  TO authenticated
  USING (true);

-- Migrate existing data from exercises.plane_of_motion_id to junction table
INSERT INTO exercise_planes_of_motion (exercise_id, plane_of_motion_id)
SELECT id, plane_of_motion_id
FROM exercises
WHERE plane_of_motion_id IS NOT NULL;

-- Note: We keep the plane_of_motion_id column in exercises for now for backward compatibility
-- It can be removed in a future migration after all code is updated
