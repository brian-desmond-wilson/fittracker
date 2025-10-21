-- ============================================================================
-- CrossFit System Migration
-- Creates tables for Classes, WODs, Movements, and Exercise Variations
-- ============================================================================

-- ============================================================================
-- 1. GOAL TYPES (Reference table for exercise goals)
-- ============================================================================

CREATE TABLE IF NOT EXISTS goal_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert predefined goal types
INSERT INTO goal_types (name, description, display_order) VALUES
  ('MetCon', 'Conditioning / endurance', 1),
  ('Strength', 'Load / power output', 2),
  ('Skill', 'Gymnastics / technique', 3),
  ('Mobility', 'Joint control, dynamic range work', 4),
  ('Stretching', 'Static flexibility work', 5),
  ('Recovery', 'Broader rest, self-care, or passive recovery', 6),
  ('Cool-Down', 'Short, guided transition period post-workout', 7);

-- ============================================================================
-- 2. EXERCISES TABLE (Core movements - extends existing or creates new)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Basic info
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,

  -- CrossFit-specific fields
  is_movement BOOLEAN DEFAULT FALSE, -- True if this is a CrossFit movement
  goal_type_id UUID REFERENCES goal_types(id),

  -- Categorization (from existing training.ts)
  category TEXT, -- 'Compound', 'Isolation', 'Accessory', 'Cardio'
  muscle_groups TEXT[],
  equipment TEXT[],

  -- Media
  demo_video_url TEXT,
  thumbnail_url TEXT,

  -- Instructions
  setup_instructions TEXT,
  execution_cues TEXT[],
  common_mistakes TEXT[]
);

-- Index for fast movement lookups
CREATE INDEX idx_exercises_is_movement ON exercises(is_movement) WHERE is_movement = true;
CREATE INDEX idx_exercises_goal_type ON exercises(goal_type_id);

-- ============================================================================
-- 3. VARIATION CATEGORIES (Predefined categories for exercise variations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS variation_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- 'Position', 'Stance', 'Equipment', 'Style'
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO variation_categories (name, description, display_order) VALUES
  ('Position', 'Body or bar position variants (Front, Back, Overhead, etc.)', 1),
  ('Stance', 'Foot/leg positioning (Sumo, Wide, Narrow, Split, etc.)', 2),
  ('Equipment', 'Loading method (Barbell, Dumbbell, Kettlebell, Bodyweight, etc.)', 3),
  ('Style', 'Movement style (Pause, Tempo, Jump, Eccentric, etc.)', 4);

-- ============================================================================
-- 4. VARIATION OPTIONS (Predefined options within each category)
-- ============================================================================

CREATE TABLE IF NOT EXISTS variation_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES variation_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, name)
);

-- Position variations
INSERT INTO variation_options (category_id, name, display_order)
SELECT id, 'Overhead', 1 FROM variation_categories WHERE name = 'Position'
UNION ALL
SELECT id, 'Front', 2 FROM variation_categories WHERE name = 'Position'
UNION ALL
SELECT id, 'Back', 3 FROM variation_categories WHERE name = 'Position'
UNION ALL
SELECT id, 'Goblet', 4 FROM variation_categories WHERE name = 'Position'
UNION ALL
SELECT id, 'Zercher', 5 FROM variation_categories WHERE name = 'Position';

-- Stance variations
INSERT INTO variation_options (category_id, name, display_order)
SELECT id, 'Sumo', 1 FROM variation_categories WHERE name = 'Stance'
UNION ALL
SELECT id, 'Wide', 2 FROM variation_categories WHERE name = 'Stance'
UNION ALL
SELECT id, 'Narrow', 3 FROM variation_categories WHERE name = 'Stance'
UNION ALL
SELECT id, 'Split', 4 FROM variation_categories WHERE name = 'Stance';

-- Equipment variations
INSERT INTO variation_options (category_id, name, display_order)
SELECT id, 'Barbell', 1 FROM variation_categories WHERE name = 'Equipment'
UNION ALL
SELECT id, 'Dumbbell', 2 FROM variation_categories WHERE name = 'Equipment'
UNION ALL
SELECT id, 'Kettlebell', 3 FROM variation_categories WHERE name = 'Equipment'
UNION ALL
SELECT id, 'Bodyweight', 4 FROM variation_categories WHERE name = 'Equipment';

-- Style variations
INSERT INTO variation_options (category_id, name, display_order)
SELECT id, 'Pause', 1 FROM variation_categories WHERE name = 'Style'
UNION ALL
SELECT id, 'Tempo', 2 FROM variation_categories WHERE name = 'Style'
UNION ALL
SELECT id, 'Jump', 3 FROM variation_categories WHERE name = 'Style'
UNION ALL
SELECT id, 'Eccentric', 4 FROM variation_categories WHERE name = 'Style';

-- ============================================================================
-- 5. EXERCISE VARIATIONS (Links exercises to variation options)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exercise_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  variation_option_id UUID NOT NULL REFERENCES variation_options(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exercise_id, variation_option_id)
);

-- Index for searching variations by exercise
CREATE INDEX idx_exercise_variations_exercise ON exercise_variations(exercise_id);

-- ============================================================================
-- 6. WOD FORMATS (WOD types: AMRAP, EMOM, For Time, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wod_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO wod_formats (name, description) VALUES
  ('AMRAP', 'As Many Rounds (or Reps) As Possible'),
  ('EMOM', 'Every Minute on the Minute'),
  ('For Time', 'Complete prescribed work as fast as possible'),
  ('Chipper', 'Long list of movements done once each'),
  ('Tabata', '20 seconds work, 10 seconds rest, 8 rounds');

-- ============================================================================
-- 7. WOD CATEGORIES (Daily WOD, Heroes, The Girls)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wod_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO wod_categories (name, description, display_order) VALUES
  ('All', 'All WODs', 0),
  ('Daily WOD', 'Custom WODs created by the box', 1),
  ('Heroes', 'Benchmark WODs named after fallen soldiers', 2),
  ('The Girls', 'Classic CrossFit benchmark WODs', 3);

-- ============================================================================
-- 8. WODS (WOD templates - reusable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  description TEXT,

  -- WOD structure
  format_id UUID NOT NULL REFERENCES wod_formats(id),
  category_id UUID NOT NULL REFERENCES wod_categories(id),
  time_cap_minutes INTEGER, -- Optional time cap

  -- Score tracking
  score_type_time BOOLEAN DEFAULT FALSE,
  score_type_rounds BOOLEAN DEFAULT FALSE,
  score_type_reps BOOLEAN DEFAULT FALSE,
  score_type_load BOOLEAN DEFAULT FALSE,
  score_type_distance BOOLEAN DEFAULT FALSE,
  score_type_calories BOOLEAN DEFAULT FALSE,

  -- Notes
  notes TEXT
);

CREATE INDEX idx_wods_user ON wods(user_id);
CREATE INDEX idx_wods_category ON wods(category_id);
CREATE INDEX idx_wods_format ON wods(format_id);

-- ============================================================================
-- 9. WOD SCALING LEVELS (Rx/L2/L1 for each WOD)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wod_scaling_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wod_id UUID NOT NULL REFERENCES wods(id) ON DELETE CASCADE,
  level_name TEXT NOT NULL CHECK (level_name IN ('Rx', 'L2', 'L1')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wod_id, level_name)
);

CREATE INDEX idx_wod_scaling_levels_wod ON wod_scaling_levels(wod_id);

-- ============================================================================
-- 10. WOD MOVEMENTS (Links WODs to exercises/movements with scaling)
-- ============================================================================

CREATE TABLE IF NOT EXISTS wod_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wod_id UUID NOT NULL REFERENCES wods(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id),
  movement_order INTEGER NOT NULL,

  -- Scaling options per movement
  rx_reps INTEGER,
  rx_weight_lbs DECIMAL(10, 2),
  rx_movement_variation TEXT, -- e.g., "Muscle-ups"

  l2_reps INTEGER,
  l2_weight_lbs DECIMAL(10, 2),
  l2_movement_variation TEXT, -- e.g., "Pull-ups"

  l1_reps INTEGER,
  l1_weight_lbs DECIMAL(10, 2),
  l1_movement_variation TEXT, -- e.g., "Ring rows"

  -- Notes
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wod_movements_wod ON wod_movements(wod_id);
CREATE INDEX idx_wod_movements_exercise ON wod_movements(exercise_id);

-- ============================================================================
-- 11. MOVEMENT STANDARDS (Movement-specific performance standards)
-- ============================================================================

CREATE TABLE IF NOT EXISTS movement_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wod_movement_id UUID NOT NULL REFERENCES wod_movements(id) ON DELETE CASCADE,
  scaling_level TEXT NOT NULL CHECK (scaling_level IN ('Rx', 'L2', 'L1')),

  -- Movement standard flags (movement-specific)
  standard_name TEXT NOT NULL, -- e.g., "strict", "kipping", "touch-and-go", "reset"
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wod_movement_id, scaling_level, standard_name)
);

CREATE INDEX idx_movement_standards_wod_movement ON movement_standards(wod_movement_id);

-- ============================================================================
-- 12. CLASSES (Collection of workout parts for a specific date)
-- ============================================================================

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Class info
  class_date DATE NOT NULL,
  name TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 60,

  -- Notes
  notes TEXT
);

CREATE INDEX idx_classes_user ON classes(user_id);
CREATE INDEX idx_classes_date ON classes(class_date);

-- ============================================================================
-- 13. CLASS PARTS (Flexible workout components within a class)
-- ============================================================================

CREATE TABLE IF NOT EXISTS class_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  part_order INTEGER NOT NULL,

  -- Part type
  part_type TEXT NOT NULL, -- 'WOD', 'Strength', 'Skill', 'Warm-up', 'Cool-down', 'Accessory'
  part_name TEXT,

  -- Link to WOD template (if applicable)
  wod_id UUID REFERENCES wods(id),

  -- OR custom content (if not using a WOD template)
  custom_description TEXT,
  duration_minutes INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_class_parts_class ON class_parts(class_id);
CREATE INDEX idx_class_parts_wod ON class_parts(wod_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all user-specific tables
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE wods ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Exercises: Public read, authenticated users can create/update their own
CREATE POLICY "Exercises are viewable by everyone"
  ON exercises FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create exercises"
  ON exercises FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own exercises"
  ON exercises FOR UPDATE
  USING (true); -- Allow all updates for now (exercises are shared)

-- WODs: Users can only see and manage their own WODs
CREATE POLICY "Users can view their own WODs"
  ON wods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own WODs"
  ON wods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own WODs"
  ON wods FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own WODs"
  ON wods FOR DELETE
  USING (auth.uid() = user_id);

-- Classes: Users can only see and manage their own classes
CREATE POLICY "Users can view their own classes"
  ON classes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own classes"
  ON classes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own classes"
  ON classes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own classes"
  ON classes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- SEED DATA: HERO WODs
-- ============================================================================

-- TODO: Add pre-populated Hero WODs (Murph, DT, etc.)
-- This will be done in a follow-up migration or seed script

-- ============================================================================
-- SEED DATA: THE GIRLS
-- ============================================================================

-- TODO: Add pre-populated benchmark WODs (Fran, Cindy, Grace, etc.)
-- This will be done in a follow-up migration or seed script

-- ============================================================================
-- TRIGGERS FOR updated_at TIMESTAMPS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_exercises_updated_at
  BEFORE UPDATE ON exercises
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wods_updated_at
  BEFORE UPDATE ON wods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at
  BEFORE UPDATE ON classes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
