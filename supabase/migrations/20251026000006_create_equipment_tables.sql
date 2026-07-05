-- Migration: Create Equipment Tables
-- Description: Creates equipment and exercise_equipment junction table

-- Create equipment table
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create junction table for exercise-equipment relationships
CREATE TABLE IF NOT EXISTS exercise_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(exercise_id, equipment_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);
CREATE INDEX IF NOT EXISTS idx_exercise_equipment_exercise_id ON exercise_equipment(exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_equipment_equipment_id ON exercise_equipment(equipment_id);

-- Enable RLS
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_equipment ENABLE ROW LEVEL SECURITY;

-- RLS Policies for equipment (read-only for all authenticated users)
CREATE POLICY "Equipment are viewable by everyone"
  ON equipment FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for exercise_equipment
CREATE POLICY "Exercise equipment viewable by everyone"
  ON exercise_equipment FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own exercise equipment"
  ON exercise_equipment FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM exercises
      WHERE exercises.id = exercise_equipment.exercise_id
      AND exercises.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own exercise equipment"
  ON exercise_equipment FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exercises
      WHERE exercises.id = exercise_equipment.exercise_id
      AND exercises.created_by = auth.uid()
    )
  );

-- Insert equipment data
INSERT INTO equipment (name, category, display_order) VALUES
  -- Free Weights
  ('Barbell', 'Free Weights', 1),
  ('Dumbbell', 'Free Weights', 2),
  ('Kettlebell', 'Free Weights', 3),

  -- Implements
  ('Med Ball', 'Implements', 1),
  ('Plate', 'Implements', 2),
  ('Sandbag', 'Implements', 3),

  -- Machines
  ('Bike', 'Machines', 1),
  ('Rower', 'Machines', 2),
  ('Ski', 'Machines', 3),
  ('Treadmill', 'Machines', 4),

  -- Bodyweight / Apparatus
  ('Bodyweight', 'Bodyweight / Apparatus', 1),
  ('Pull-Up Bar', 'Bodyweight / Apparatus', 2),
  ('Rings', 'Bodyweight / Apparatus', 3),
  ('Rope', 'Bodyweight / Apparatus', 4),

  -- Supports / Surfaces
  ('Bench', 'Supports / Surfaces', 1),
  ('Box', 'Supports / Surfaces', 2),
  ('Floor', 'Supports / Surfaces', 3),
  ('Wall', 'Supports / Surfaces', 4),

  -- Recovery Tools
  ('Bands', 'Recovery Tools', 1),
  ('Foam Roller', 'Recovery Tools', 2),
  ('Massage Ball', 'Recovery Tools', 3),
  ('Mat', 'Recovery Tools', 4),
  ('Stability Ball', 'Recovery Tools', 5),
  ('Yoga Block', 'Recovery Tools', 6)
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order;
