-- Migration: Add junction table for exercise movement styles (many-to-many)
-- Description: Allows exercises to have multiple movement styles (e.g., Strict + Pause, Kipping + Unbroken)

-- Create junction table
CREATE TABLE IF NOT EXISTS exercise_movement_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  movement_style_id UUID NOT NULL REFERENCES movement_styles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate entries
  UNIQUE(exercise_id, movement_style_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_exercise_movement_styles_exercise ON exercise_movement_styles(exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_movement_styles_style ON exercise_movement_styles(movement_style_id);

-- Enable RLS
ALTER TABLE exercise_movement_styles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view exercise movement styles"
  ON exercise_movement_styles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own exercise movement styles"
  ON exercise_movement_styles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM exercises
      WHERE exercises.id = exercise_movement_styles.exercise_id
      AND (exercises.created_by = auth.uid() OR exercises.is_official = true)
    )
  );

CREATE POLICY "Users can update their own exercise movement styles"
  ON exercise_movement_styles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM exercises
      WHERE exercises.id = exercise_movement_styles.exercise_id
      AND exercises.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own exercise movement styles"
  ON exercise_movement_styles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM exercises
      WHERE exercises.id = exercise_movement_styles.exercise_id
      AND exercises.created_by = auth.uid()
    )
  );

-- Migrate existing data from movement_style_id to junction table
INSERT INTO exercise_movement_styles (exercise_id, movement_style_id)
SELECT id, movement_style_id
FROM exercises
WHERE movement_style_id IS NOT NULL
ON CONFLICT (exercise_id, movement_style_id) DO NOTHING;

-- Comment for documentation
COMMENT ON TABLE exercise_movement_styles IS 'Junction table linking exercises to multiple movement styles';
