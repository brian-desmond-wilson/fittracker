-- ============================================================================
-- Add equipment metadata to exercises table
-- Enables smart movement configuration (bodyweight vs weighted movements)
-- ============================================================================

-- ============================================================================
-- 1. Add equipment fields to exercises table
-- ============================================================================

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS requires_weight BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS equipment_types TEXT[];

-- Add comments to clarify field usage
COMMENT ON COLUMN exercises.requires_weight IS 'True if movement requires external weight (barbells, dumbbells, kettlebells, wall balls, medicine balls, etc.). False for bodyweight movements (pull-ups, push-ups, toes-to-bar, etc.).';
COMMENT ON COLUMN exercises.equipment_types IS 'Array of equipment types needed: [''barbell'', ''dumbbell'', ''kettlebell'', ''wall_ball'', ''medicine_ball'', ''box'', ''rings'', ''rower'', ''bike'', etc.]';

-- ============================================================================
-- 2. Add per-movement rep scheme override to wod_movements
-- ============================================================================

ALTER TABLE wod_movements
  ADD COLUMN IF NOT EXISTS custom_rep_scheme TEXT,
  ADD COLUMN IF NOT EXISTS follows_wod_scheme BOOLEAN DEFAULT true;

COMMENT ON COLUMN wod_movements.custom_rep_scheme IS 'Override rep scheme for this specific movement (e.g., "10-10-10" when WOD scheme is "21-15-9"). NULL means follow WOD-level rep scheme.';
COMMENT ON COLUMN wod_movements.follows_wod_scheme IS 'True if movement uses WOD rep scheme, false if using custom_rep_scheme. Defaults to true.';

-- ============================================================================
-- 3. Seed common bodyweight movements
-- ============================================================================

-- Mark common bodyweight movements
UPDATE exercises
SET requires_weight = false, equipment_types = ARRAY['bodyweight']
WHERE name IN (
  'Pull-ups',
  'Push-ups',
  'Toes-to-Bar',
  'Air Squats',
  'Burpees',
  'Sit-ups',
  'Handstand Push-ups',
  'Muscle-ups',
  'Ring Dips',
  'Box Jumps',
  'Double-unders',
  'Lunges',
  'Mountain Climbers',
  'Plank',
  'Hollow Hold'
);

-- Mark common weighted movements
UPDATE exercises
SET requires_weight = true, equipment_types = ARRAY['barbell']
WHERE name IN (
  'Deadlift',
  'Back Squat',
  'Front Squat',
  'Overhead Squat',
  'Clean',
  'Snatch',
  'Clean and Jerk',
  'Thruster',
  'Bench Press',
  'Overhead Press',
  'Power Clean',
  'Power Snatch'
);

-- Wall Balls and Medicine Ball movements
UPDATE exercises
SET requires_weight = true, equipment_types = ARRAY['wall_ball', 'medicine_ball']
WHERE name IN (
  'Wall Balls',
  'Wall Ball Shots',
  'Medicine Ball Cleans'
);

-- Kettlebell movements
UPDATE exercises
SET requires_weight = true, equipment_types = ARRAY['kettlebell']
WHERE name IN (
  'Kettlebell Swings',
  'Goblet Squats',
  'Turkish Get-ups'
);

-- Dumbbell movements
UPDATE exercises
SET requires_weight = true, equipment_types = ARRAY['dumbbell']
WHERE name IN (
  'Dumbbell Snatches',
  'Dumbbell Thrusters',
  'Dumbbell Rows'
);

-- Monostructural (cardio) - bodyweight but with equipment
UPDATE exercises
SET requires_weight = false, equipment_types = ARRAY['rower']
WHERE name LIKE '%Row%' OR name = 'Rowing';

UPDATE exercises
SET requires_weight = false, equipment_types = ARRAY['bike', 'assault_bike']
WHERE name LIKE '%Bike%' OR name LIKE '%Assault Bike%';

UPDATE exercises
SET requires_weight = false, equipment_types = ARRAY['ski_erg']
WHERE name LIKE '%Ski%' OR name = 'Ski Erg';

-- Running (pure bodyweight)
UPDATE exercises
SET requires_weight = false, equipment_types = ARRAY['bodyweight']
WHERE name LIKE '%Run%' OR name = 'Running';

-- ============================================================================
-- 4. Add index for equipment queries
-- ============================================================================

-- Index for filtering by requires_weight
CREATE INDEX IF NOT EXISTS idx_exercises_requires_weight ON exercises(requires_weight);

-- GIN index for array queries on equipment_types
CREATE INDEX IF NOT EXISTS idx_exercises_equipment_types ON exercises USING GIN(equipment_types);
