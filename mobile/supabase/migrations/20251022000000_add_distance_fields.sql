-- ============================================================================
-- Add distance configuration for movements (Run, Row, Bike, Ski, Swim, etc.)
-- Enables configuring distance instead of reps/weight for cardio movements
-- ============================================================================

-- ============================================================================
-- 1. Add requires_distance flag to exercises table
-- ============================================================================

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS requires_distance BOOLEAN DEFAULT false;

COMMENT ON COLUMN exercises.requires_distance IS 'True if movement requires distance configuration (run, row, bike, ski, swim, etc.). Distance movements show distance fields instead of reps/weight.';

-- ============================================================================
-- 2. Add distance fields to wod_movements for each scaling level
-- ============================================================================

-- Rx distance
ALTER TABLE wod_movements
  ADD COLUMN IF NOT EXISTS rx_distance_value NUMERIC,
  ADD COLUMN IF NOT EXISTS rx_distance_unit TEXT DEFAULT 'meters';

-- L2 distance
ALTER TABLE wod_movements
  ADD COLUMN IF NOT EXISTS l2_distance_value NUMERIC,
  ADD COLUMN IF NOT EXISTS l2_distance_unit TEXT DEFAULT 'meters';

-- L1 distance
ALTER TABLE wod_movements
  ADD COLUMN IF NOT EXISTS l1_distance_value NUMERIC,
  ADD COLUMN IF NOT EXISTS l1_distance_unit TEXT DEFAULT 'meters';

-- Add comments
COMMENT ON COLUMN wod_movements.rx_distance_value IS 'Rx distance value (e.g., 400 for 400m)';
COMMENT ON COLUMN wod_movements.rx_distance_unit IS 'Rx distance unit: meters, feet, miles, kilometers';
COMMENT ON COLUMN wod_movements.l2_distance_value IS 'L2 distance value (e.g., 300 for 300m)';
COMMENT ON COLUMN wod_movements.l2_distance_unit IS 'L2 distance unit: meters, feet, miles, kilometers';
COMMENT ON COLUMN wod_movements.l1_distance_value IS 'L1 distance value (e.g., 200 for 200m)';
COMMENT ON COLUMN wod_movements.l1_distance_unit IS 'L1 distance unit: meters, feet, miles, kilometers';

-- ============================================================================
-- 3. Mark distance movements
-- ============================================================================

-- Running
UPDATE exercises
SET requires_distance = true
WHERE name LIKE '%Run%' OR name = 'Running';

-- Rowing
UPDATE exercises
SET requires_distance = true
WHERE name LIKE '%Row%' OR name = 'Rowing';

-- Biking (Assault Bike, Air Bike, etc.)
UPDATE exercises
SET requires_distance = true
WHERE name LIKE '%Bike%' OR name LIKE '%Assault Bike%';

-- Ski Erg
UPDATE exercises
SET requires_distance = true
WHERE name LIKE '%Ski%' OR name = 'Ski Erg';

-- Swimming
UPDATE exercises
SET requires_distance = true
WHERE name LIKE '%Swim%' OR name = 'Swimming';

-- Walking/Farmer Carries (can require both weight AND distance)
UPDATE exercises
SET requires_distance = true
WHERE name LIKE '%Walk%' OR name LIKE '%Farmer%' OR name LIKE '%Carry%';

-- ============================================================================
-- 4. Add check constraints for valid distance units
-- ============================================================================

ALTER TABLE wod_movements
  ADD CONSTRAINT check_rx_distance_unit
    CHECK (rx_distance_unit IS NULL OR rx_distance_unit IN ('meters', 'feet', 'miles', 'kilometers')),
  ADD CONSTRAINT check_l2_distance_unit
    CHECK (l2_distance_unit IS NULL OR l2_distance_unit IN ('meters', 'feet', 'miles', 'kilometers')),
  ADD CONSTRAINT check_l1_distance_unit
    CHECK (l1_distance_unit IS NULL OR l1_distance_unit IN ('meters', 'feet', 'miles', 'kilometers'));

-- ============================================================================
-- 5. Add index for distance movement queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_exercises_requires_distance ON exercises(requires_distance);
