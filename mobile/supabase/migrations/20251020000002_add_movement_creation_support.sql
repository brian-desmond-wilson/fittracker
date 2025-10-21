-- ============================================================================
-- Add Movement Creation Support
-- Adds movement categories, scoring types, and user movement creation
-- ============================================================================

-- ============================================================================
-- 1. MOVEMENT CATEGORIES (Weightlifting, Gymnastics, Monostructural, Recovery)
-- ============================================================================

CREATE TABLE IF NOT EXISTS movement_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO movement_categories (name, description, display_order) VALUES
  ('Weightlifting', 'Barbell movements, Olympic lifts, strength work', 1),
  ('Gymnastics', 'Bodyweight movements, gymnastics skills', 2),
  ('Monostructural', 'Cardio: running, rowing, biking, swimming', 3),
  ('Recovery', 'Mobility, stretching, foam rolling, cool-down', 4)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 2. SCORING TYPES (Reps, Rounds, Weight, Time, Distance, Calories, Height, None)
-- ============================================================================

CREATE TABLE IF NOT EXISTS scoring_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO scoring_types (name, description, display_order) VALUES
  ('Reps', 'Number of repetitions', 1),
  ('Rounds', 'Number of rounds completed', 2),
  ('Weight', 'Load in pounds or kilograms', 3),
  ('Time', 'Duration or completion time', 4),
  ('Distance', 'Distance covered', 5),
  ('Calories', 'Calories burned', 6),
  ('Height', 'Height achieved (box jump, wall ball target)', 7),
  ('None', 'No specific scoring', 8)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 3. EXERCISE SCORING TYPES (Junction table for many-to-many relationship)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exercise_scoring_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  scoring_type_id UUID NOT NULL REFERENCES scoring_types(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id, scoring_type_id)
);

DROP INDEX IF EXISTS idx_exercise_scoring_types_exercise;
CREATE INDEX idx_exercise_scoring_types_exercise ON exercise_scoring_types(exercise_id);

-- ============================================================================
-- 4. ALTER EXERCISES TABLE - Add movement creation fields
-- ============================================================================

-- Add new columns for movement creation
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS movement_category_id UUID REFERENCES movement_categories(id);
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT FALSE;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Drop existing indexes if they exist
DROP INDEX IF EXISTS idx_exercises_movement_category;
DROP INDEX IF EXISTS idx_exercises_is_official;
DROP INDEX IF EXISTS idx_exercises_created_by;

-- Create indexes for fast lookups
CREATE INDEX idx_exercises_movement_category ON exercises(movement_category_id);
CREATE INDEX idx_exercises_is_official ON exercises(is_official);
CREATE INDEX idx_exercises_created_by ON exercises(created_by);

-- ============================================================================
-- 5. UPDATE RLS POLICIES - Hybrid approach (official + user custom movements)
-- ============================================================================

-- Users can view official movements + their own custom movements
DROP POLICY IF EXISTS "Exercises are viewable by everyone" ON exercises;
DROP POLICY IF EXISTS "Users can view official and own exercises" ON exercises;
CREATE POLICY "Users can view official and own exercises"
  ON exercises FOR SELECT
  USING (is_official = true OR created_by = auth.uid());

-- Users can insert their own movements
DROP POLICY IF EXISTS "Authenticated users can create exercises" ON exercises;
DROP POLICY IF EXISTS "Authenticated users can create own exercises" ON exercises;
CREATE POLICY "Authenticated users can create own exercises"
  ON exercises FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND created_by = auth.uid());

-- Users can only update their own custom movements (not official ones)
DROP POLICY IF EXISTS "Users can update their own exercises" ON exercises;
DROP POLICY IF EXISTS "Users can update own custom exercises" ON exercises;
CREATE POLICY "Users can update own custom exercises"
  ON exercises FOR UPDATE
  USING (created_by = auth.uid() AND is_official = false);

-- Users can only delete their own custom movements (not official ones)
DROP POLICY IF EXISTS "Users can delete own custom exercises" ON exercises;
CREATE POLICY "Users can delete own custom exercises"
  ON exercises FOR DELETE
  USING (created_by = auth.uid() AND is_official = false);

-- ============================================================================
-- 6. SEED DATA: Official Movements
-- ============================================================================

-- Helper function to get IDs by name
DO $$
DECLARE
  weightlifting_id UUID;
  gymnastics_id UUID;
  monostructural_id UUID;
  recovery_id UUID;
  metcon_id UUID;
  strength_id UUID;
  skill_id UUID;
  recovery_goal_id UUID;
BEGIN
  -- Get category IDs
  SELECT id INTO weightlifting_id FROM movement_categories WHERE name = 'Weightlifting';
  SELECT id INTO gymnastics_id FROM movement_categories WHERE name = 'Gymnastics';
  SELECT id INTO monostructural_id FROM movement_categories WHERE name = 'Monostructural';
  SELECT id INTO recovery_id FROM movement_categories WHERE name = 'Recovery';

  -- Get goal type IDs
  SELECT id INTO metcon_id FROM goal_types WHERE name = 'MetCon';
  SELECT id INTO strength_id FROM goal_types WHERE name = 'Strength';
  SELECT id INTO skill_id FROM goal_types WHERE name = 'Skill';
  SELECT id INTO recovery_goal_id FROM goal_types WHERE name = 'Recovery';

  -- Insert official movements (only if they don't exist)
  -- Weightlifting movements
  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Back Squat', 'Back Squat', true, weightlifting_id, strength_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Back Squat' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Front Squat', 'Front Squat', true, weightlifting_id, strength_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Front Squat' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Overhead Squat', 'Overhead Squat', true, weightlifting_id, strength_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Overhead Squat' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Deadlift', 'Deadlift', true, weightlifting_id, strength_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Deadlift' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Clean', 'Clean', true, weightlifting_id, strength_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Clean' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Snatch', 'Snatch', true, weightlifting_id, strength_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Snatch' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Thruster', 'Thruster', true, weightlifting_id, metcon_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Thruster' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Wall Ball', 'Wall Ball', true, weightlifting_id, metcon_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Wall Ball' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Bench Press', 'Bench Press', true, weightlifting_id, strength_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Bench Press' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Overhead Press', 'Overhead Press', true, weightlifting_id, strength_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Overhead Press' AND is_official = true);

  -- Gymnastics movements
  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Pull-up', 'Pull-up', true, gymnastics_id, skill_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Pull-up' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Chest-to-Bar', 'Chest-to-Bar Pull-up', true, gymnastics_id, skill_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Chest-to-Bar' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Muscle-up', 'Muscle-up', true, gymnastics_id, skill_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Muscle-up' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Push-up', 'Push-up', true, gymnastics_id, skill_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Push-up' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Handstand Push-up', 'Handstand Push-up', true, gymnastics_id, skill_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Handstand Push-up' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Dip', 'Dip', true, gymnastics_id, skill_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Dip' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Toes-to-Bar', 'Toes-to-Bar', true, gymnastics_id, skill_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Toes-to-Bar' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Handstand Walk', 'Handstand Walk', true, gymnastics_id, skill_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Handstand Walk' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Rope Climb', 'Rope Climb', true, gymnastics_id, skill_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Rope Climb' AND is_official = true);

  -- Monostructural movements
  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Run', 'Run', true, monostructural_id, metcon_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Run' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Row', 'Row', true, monostructural_id, metcon_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Row' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Bike', 'Bike (Assault/Echo)', true, monostructural_id, metcon_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Bike' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Ski Erg', 'Ski Erg', true, monostructural_id, metcon_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Ski Erg' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Jump Rope', 'Jump Rope', true, monostructural_id, metcon_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Jump Rope' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Double-Under', 'Double-Under', true, monostructural_id, metcon_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Double-Under' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Swimming', 'Swimming', true, monostructural_id, metcon_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Swimming' AND is_official = true);

  -- Recovery movements
  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Foam Roll', 'Foam Rolling', true, recovery_id, recovery_goal_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Foam Roll' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Stretch', 'Stretching', true, recovery_id, recovery_goal_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Stretch' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Mobility Work', 'Mobility Work', true, recovery_id, recovery_goal_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Mobility Work' AND is_official = true);

  INSERT INTO exercises (name, full_name, is_movement, movement_category_id, goal_type_id, is_official, created_by)
  SELECT 'Cool-Down Walk', 'Cool-Down Walk', true, recovery_id, recovery_goal_id, true, null
  WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE name = 'Cool-Down Walk' AND is_official = true);
END $$;
