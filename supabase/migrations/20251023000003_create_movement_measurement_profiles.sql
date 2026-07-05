-- Migration: Create Movement Measurement Profiles Table
-- Description: Defines how each movement/variation is measured (REPS, TIME, DISTANCE, etc.)
-- Includes validation ranges, units, and automated data migration from scoring_types

-- ============================================================================
-- 1. CREATE MOVEMENT_MEASUREMENT_PROFILES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS movement_measurement_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE,
  variation_option_id UUID REFERENCES variation_options(id) ON DELETE CASCADE,
  measurement_type TEXT NOT NULL CHECK (
    measurement_type IN ('REPS', 'TIME', 'DISTANCE', 'LOAD', 'CALORIES', 'QUALITY', 'HEIGHT')
  ),
  unit_primary TEXT NOT NULL,
  unit_secondary TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  precision INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id, variation_option_id, measurement_type),
  CHECK (exercise_id IS NOT NULL OR variation_option_id IS NOT NULL),
  CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value)
);

CREATE INDEX idx_measurement_profiles_exercise ON movement_measurement_profiles(exercise_id);
CREATE INDEX idx_measurement_profiles_variation ON movement_measurement_profiles(variation_option_id);
CREATE INDEX idx_measurement_profiles_type ON movement_measurement_profiles(measurement_type);

-- ============================================================================
-- 2. AUTOMATED DATA MIGRATION FROM SCORING_TYPES
-- ============================================================================

-- For exercises with REPS scoring type
INSERT INTO movement_measurement_profiles (
  exercise_id,
  measurement_type,
  unit_primary,
  min_value,
  max_value,
  precision
)
SELECT DISTINCT
  ems.exercise_id,
  'REPS',
  'reps',
  1,
  1000,
  0
FROM exercise_scoring_types ems
JOIN scoring_types st ON ems.scoring_type_id = st.id
WHERE st.name = 'REPS'
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

-- For exercises with TIME scoring type
INSERT INTO movement_measurement_profiles (
  exercise_id,
  measurement_type,
  unit_primary,
  unit_secondary,
  min_value,
  max_value,
  precision
)
SELECT DISTINCT
  ems.exercise_id,
  'TIME',
  's',
  'min',
  0,
  3600,
  1
FROM exercise_scoring_types ems
JOIN scoring_types st ON ems.scoring_type_id = st.id
WHERE st.name = 'TIME'
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

-- For exercises with DISTANCE scoring type
INSERT INTO movement_measurement_profiles (
  exercise_id,
  measurement_type,
  unit_primary,
  unit_secondary,
  min_value,
  max_value,
  precision
)
SELECT DISTINCT
  ems.exercise_id,
  'DISTANCE',
  'm',
  'ft',
  0,
  50000,
  1
FROM exercise_scoring_types ems
JOIN scoring_types st ON ems.scoring_type_id = st.id
WHERE st.name = 'DISTANCE'
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

-- For exercises with LOAD scoring type
INSERT INTO movement_measurement_profiles (
  exercise_id,
  measurement_type,
  unit_primary,
  unit_secondary,
  min_value,
  max_value,
  precision
)
SELECT DISTINCT
  ems.exercise_id,
  'LOAD',
  'lb',
  'kg',
  0,
  1000,
  1
FROM exercise_scoring_types ems
JOIN scoring_types st ON ems.scoring_type_id = st.id
WHERE st.name = 'LOAD'
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

-- For exercises with CALORIES scoring type
INSERT INTO movement_measurement_profiles (
  exercise_id,
  measurement_type,
  unit_primary,
  min_value,
  max_value,
  precision
)
SELECT DISTINCT
  ems.exercise_id,
  'CALORIES',
  'cal',
  0,
  10000,
  0
FROM exercise_scoring_types ems
JOIN scoring_types st ON ems.scoring_type_id = st.id
WHERE st.name = 'CALORIES'
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

-- ============================================================================
-- 3. ADD SPECIFIC MEASUREMENT PROFILES FOR KNOWN MOVEMENTS
-- ============================================================================

-- Monostructural movements (Row, Run, Bike, Ski) → TIME, DISTANCE, CALORIES
INSERT INTO movement_measurement_profiles (exercise_id, measurement_type, unit_primary, unit_secondary, min_value, max_value, precision)
SELECT e.id, 'TIME', 's', 'min', 0, 3600, 1
FROM exercises e
WHERE (e.name = 'Row' OR e.name ILIKE '%run%' OR e.name ILIKE '%bike%' OR e.name ILIKE '%ski%')
  AND e.is_movement = true
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

INSERT INTO movement_measurement_profiles (exercise_id, measurement_type, unit_primary, unit_secondary, min_value, max_value, precision)
SELECT e.id, 'DISTANCE', 'm', 'ft', 0, 50000, 1
FROM exercises e
WHERE (e.name = 'Row' OR e.name ILIKE '%run%' OR e.name ILIKE '%bike%' OR e.name ILIKE '%ski%')
  AND e.is_movement = true
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

INSERT INTO movement_measurement_profiles (exercise_id, measurement_type, unit_primary, min_value, max_value, precision)
SELECT e.id, 'CALORIES', 'cal', 0, 10000, 0
FROM exercises e
WHERE (e.name = 'Row' OR e.name ILIKE '%bike%' OR e.name ILIKE '%ski%')
  AND e.is_movement = true
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

-- Weightlifting movements → LOAD + REPS
INSERT INTO movement_measurement_profiles (exercise_id, measurement_type, unit_primary, unit_secondary, min_value, max_value, precision)
SELECT e.id, 'LOAD', 'lb', 'kg', 0, 1000, 1
FROM exercises e
WHERE (
  e.name ILIKE '%squat%'
  OR e.name ILIKE '%deadlift%'
  OR e.name ILIKE '%press%'
  OR e.name ILIKE '%clean%'
  OR e.name ILIKE '%snatch%'
  OR e.name ILIKE '%jerk%'
)
AND e.is_movement = true
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

-- Bodyweight movements → REPS
INSERT INTO movement_measurement_profiles (exercise_id, measurement_type, unit_primary, min_value, max_value, precision)
SELECT e.id, 'REPS', 'reps', 1, 1000, 0
FROM exercises e
WHERE (
  e.name ILIKE '%pull%'
  OR e.name ILIKE '%push%'
  OR e.name ILIKE '%sit%up%'
  OR e.name ILIKE '%burpee%'
  OR e.name ILIKE '%box jump%'
  OR e.name ILIKE '%toes%to%bar%'
  OR e.name ILIKE '%muscle%up%'
  OR e.name ILIKE '%dip%'
  OR e.name ILIKE '%rope climb%'
)
AND e.is_movement = true
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

-- Handstand Walk → DISTANCE
INSERT INTO movement_measurement_profiles (exercise_id, measurement_type, unit_primary, unit_secondary, min_value, max_value, precision)
SELECT e.id, 'DISTANCE', 'ft', 'm', 0, 500, 1
FROM exercises e
WHERE e.name ILIKE '%handstand%walk%'
  AND e.is_movement = true
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

-- Jump movements → HEIGHT
INSERT INTO movement_measurement_profiles (exercise_id, measurement_type, unit_primary, unit_secondary, min_value, max_value, precision)
SELECT e.id, 'HEIGHT', 'in', 'cm', 0, 100, 1
FROM exercises e
WHERE (e.name ILIKE '%box jump%' OR e.name ILIKE '%vertical jump%')
  AND e.is_movement = true
ON CONFLICT (exercise_id, variation_option_id, measurement_type) DO NOTHING;

-- ============================================================================
-- 4. ADD COMMENTS
-- ============================================================================

COMMENT ON TABLE movement_measurement_profiles IS 'Defines how each movement/variation is measured with units and validation ranges';
COMMENT ON COLUMN movement_measurement_profiles.measurement_type IS 'Type of measurement: REPS, TIME, DISTANCE, LOAD, CALORIES, QUALITY, HEIGHT';
COMMENT ON COLUMN movement_measurement_profiles.unit_primary IS 'Primary unit (e.g., reps, s, m, lb, cal)';
COMMENT ON COLUMN movement_measurement_profiles.unit_secondary IS 'Secondary/alternative unit (e.g., min for time, kg for weight)';
COMMENT ON COLUMN movement_measurement_profiles.min_value IS 'Minimum valid value for this measurement';
COMMENT ON COLUMN movement_measurement_profiles.max_value IS 'Maximum valid value for this measurement';
COMMENT ON COLUMN movement_measurement_profiles.precision IS 'Number of decimal places for this measurement';
COMMENT ON COLUMN movement_measurement_profiles.is_default IS 'True if this is the default measurement method for the movement';
