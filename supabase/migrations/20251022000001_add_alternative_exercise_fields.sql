-- Add alternative exercise fields to wod_movements table
-- Allows each scaling level (Rx/L2/L1) to substitute a different movement

-- Rx alternative exercise fields
ALTER TABLE wod_movements
  ADD COLUMN IF NOT EXISTS rx_alternative_exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rx_alternative_exercise_name TEXT;

-- L2 alternative exercise fields
ALTER TABLE wod_movements
  ADD COLUMN IF NOT EXISTS l2_alternative_exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS l2_alternative_exercise_name TEXT;

-- L1 alternative exercise fields
ALTER TABLE wod_movements
  ADD COLUMN IF NOT EXISTS l1_alternative_exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS l1_alternative_exercise_name TEXT;

-- Add comments for documentation
COMMENT ON COLUMN wod_movements.rx_alternative_exercise_id IS 'Alternative movement that replaces the base movement at Rx level';
COMMENT ON COLUMN wod_movements.rx_alternative_exercise_name IS 'Denormalized name of alternative exercise for display purposes';
COMMENT ON COLUMN wod_movements.l2_alternative_exercise_id IS 'Alternative movement that replaces the base movement at L2 level';
COMMENT ON COLUMN wod_movements.l2_alternative_exercise_name IS 'Denormalized name of alternative exercise for display purposes';
COMMENT ON COLUMN wod_movements.l1_alternative_exercise_id IS 'Alternative movement that replaces the base movement at L1 level';
COMMENT ON COLUMN wod_movements.l1_alternative_exercise_name IS 'Denormalized name of alternative exercise for display purposes';
