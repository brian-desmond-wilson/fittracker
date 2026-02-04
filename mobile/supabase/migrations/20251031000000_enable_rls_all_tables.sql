-- Migration: Enable RLS on all tables missing security policies
-- Description: Fixes 32 RLS errors reported by Supabase Security Advisor
-- All reference tables get public read access
-- Junction tables get public read, authenticated write
-- Child tables inherit access from parent (wods, classes)

-- ============================================================================
-- 1. REFERENCE TABLES (Read-only lookup data - everyone can read)
-- ============================================================================

-- goal_types
ALTER TABLE goal_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Goal types are viewable by everyone" ON goal_types;
CREATE POLICY "Goal types are viewable by everyone"
  ON goal_types FOR SELECT
  TO public
  USING (true);

-- variation_categories
ALTER TABLE variation_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Variation categories are viewable by everyone" ON variation_categories;
CREATE POLICY "Variation categories are viewable by everyone"
  ON variation_categories FOR SELECT
  TO public
  USING (true);

-- variation_options
ALTER TABLE variation_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Variation options are viewable by everyone" ON variation_options;
CREATE POLICY "Variation options are viewable by everyone"
  ON variation_options FOR SELECT
  TO public
  USING (true);

-- wod_formats
ALTER TABLE wod_formats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "WOD formats are viewable by everyone" ON wod_formats;
CREATE POLICY "WOD formats are viewable by everyone"
  ON wod_formats FOR SELECT
  TO public
  USING (true);

-- wod_categories
ALTER TABLE wod_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "WOD categories are viewable by everyone" ON wod_categories;
CREATE POLICY "WOD categories are viewable by everyone"
  ON wod_categories FOR SELECT
  TO public
  USING (true);

-- movement_families
ALTER TABLE movement_families ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Movement families are viewable by everyone" ON movement_families;
CREATE POLICY "Movement families are viewable by everyone"
  ON movement_families FOR SELECT
  TO public
  USING (true);

-- planes_of_motion
ALTER TABLE planes_of_motion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Planes of motion are viewable by everyone" ON planes_of_motion;
CREATE POLICY "Planes of motion are viewable by everyone"
  ON planes_of_motion FOR SELECT
  TO public
  USING (true);

-- load_positions
ALTER TABLE load_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Load positions are viewable by everyone" ON load_positions;
CREATE POLICY "Load positions are viewable by everyone"
  ON load_positions FOR SELECT
  TO public
  USING (true);

-- stances
ALTER TABLE stances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Stances are viewable by everyone" ON stances;
CREATE POLICY "Stances are viewable by everyone"
  ON stances FOR SELECT
  TO public
  USING (true);

-- range_depths
ALTER TABLE range_depths ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Range depths are viewable by everyone" ON range_depths;
CREATE POLICY "Range depths are viewable by everyone"
  ON range_depths FOR SELECT
  TO public
  USING (true);

-- movement_styles
ALTER TABLE movement_styles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Movement styles are viewable by everyone" ON movement_styles;
CREATE POLICY "Movement styles are viewable by everyone"
  ON movement_styles FOR SELECT
  TO public
  USING (true);

-- symmetries
ALTER TABLE symmetries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Symmetries are viewable by everyone" ON symmetries;
CREATE POLICY "Symmetries are viewable by everyone"
  ON symmetries FOR SELECT
  TO public
  USING (true);

-- muscle_regions
ALTER TABLE muscle_regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Muscle regions are viewable by everyone" ON muscle_regions;
CREATE POLICY "Muscle regions are viewable by everyone"
  ON muscle_regions FOR SELECT
  TO public
  USING (true);

-- movement_categories
ALTER TABLE movement_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Movement categories are viewable by everyone" ON movement_categories;
CREATE POLICY "Movement categories are viewable by everyone"
  ON movement_categories FOR SELECT
  TO public
  USING (true);

-- scoring_types
ALTER TABLE scoring_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Scoring types are viewable by everyone" ON scoring_types;
CREATE POLICY "Scoring types are viewable by everyone"
  ON scoring_types FOR SELECT
  TO public
  USING (true);

-- ============================================================================
-- 2. EXERCISE JUNCTION/CHILD TABLES (Public read, authenticated write)
-- ============================================================================

-- exercise_muscle_regions
ALTER TABLE exercise_muscle_regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Exercise muscle regions are viewable by everyone" ON exercise_muscle_regions;
CREATE POLICY "Exercise muscle regions are viewable by everyone"
  ON exercise_muscle_regions FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert exercise muscle regions" ON exercise_muscle_regions;
CREATE POLICY "Authenticated users can insert exercise muscle regions"
  ON exercise_muscle_regions FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update exercise muscle regions" ON exercise_muscle_regions;
CREATE POLICY "Authenticated users can update exercise muscle regions"
  ON exercise_muscle_regions FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete exercise muscle regions" ON exercise_muscle_regions;
CREATE POLICY "Authenticated users can delete exercise muscle regions"
  ON exercise_muscle_regions FOR DELETE
  TO authenticated
  USING (true);

-- exercise_variations
ALTER TABLE exercise_variations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Exercise variations are viewable by everyone" ON exercise_variations;
CREATE POLICY "Exercise variations are viewable by everyone"
  ON exercise_variations FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert exercise variations" ON exercise_variations;
CREATE POLICY "Authenticated users can insert exercise variations"
  ON exercise_variations FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update exercise variations" ON exercise_variations;
CREATE POLICY "Authenticated users can update exercise variations"
  ON exercise_variations FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete exercise variations" ON exercise_variations;
CREATE POLICY "Authenticated users can delete exercise variations"
  ON exercise_variations FOR DELETE
  TO authenticated
  USING (true);

-- movement_measurement_profiles
ALTER TABLE movement_measurement_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Measurement profiles are viewable by everyone" ON movement_measurement_profiles;
CREATE POLICY "Measurement profiles are viewable by everyone"
  ON movement_measurement_profiles FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert measurement profiles" ON movement_measurement_profiles;
CREATE POLICY "Authenticated users can insert measurement profiles"
  ON movement_measurement_profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update measurement profiles" ON movement_measurement_profiles;
CREATE POLICY "Authenticated users can update measurement profiles"
  ON movement_measurement_profiles FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete measurement profiles" ON movement_measurement_profiles;
CREATE POLICY "Authenticated users can delete measurement profiles"
  ON movement_measurement_profiles FOR DELETE
  TO authenticated
  USING (true);

-- exercise_standards
ALTER TABLE exercise_standards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Exercise standards are viewable by everyone" ON exercise_standards;
CREATE POLICY "Exercise standards are viewable by everyone"
  ON exercise_standards FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert exercise standards" ON exercise_standards;
CREATE POLICY "Authenticated users can insert exercise standards"
  ON exercise_standards FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update exercise standards" ON exercise_standards;
CREATE POLICY "Authenticated users can update exercise standards"
  ON exercise_standards FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete exercise standards" ON exercise_standards;
CREATE POLICY "Authenticated users can delete exercise standards"
  ON exercise_standards FOR DELETE
  TO authenticated
  USING (true);

-- movement_scaling_links
ALTER TABLE movement_scaling_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Scaling links are viewable by everyone" ON movement_scaling_links;
CREATE POLICY "Scaling links are viewable by everyone"
  ON movement_scaling_links FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert scaling links" ON movement_scaling_links;
CREATE POLICY "Authenticated users can insert scaling links"
  ON movement_scaling_links FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update scaling links" ON movement_scaling_links;
CREATE POLICY "Authenticated users can update scaling links"
  ON movement_scaling_links FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete scaling links" ON movement_scaling_links;
CREATE POLICY "Authenticated users can delete scaling links"
  ON movement_scaling_links FOR DELETE
  TO authenticated
  USING (true);

-- exercise_scoring_types
ALTER TABLE exercise_scoring_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Exercise scoring types are viewable by everyone" ON exercise_scoring_types;
CREATE POLICY "Exercise scoring types are viewable by everyone"
  ON exercise_scoring_types FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert exercise scoring types" ON exercise_scoring_types;
CREATE POLICY "Authenticated users can insert exercise scoring types"
  ON exercise_scoring_types FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update exercise scoring types" ON exercise_scoring_types;
CREATE POLICY "Authenticated users can update exercise scoring types"
  ON exercise_scoring_types FOR UPDATE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete exercise scoring types" ON exercise_scoring_types;
CREATE POLICY "Authenticated users can delete exercise scoring types"
  ON exercise_scoring_types FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- 3. WOD CHILD TABLES (Inherit from wods - user can only access their own)
-- ============================================================================

-- wod_scaling_levels
ALTER TABLE wod_scaling_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own WOD scaling levels" ON wod_scaling_levels;
CREATE POLICY "Users can view their own WOD scaling levels"
  ON wod_scaling_levels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM wods
      WHERE wods.id = wod_scaling_levels.wod_id
      AND wods.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own WOD scaling levels" ON wod_scaling_levels;
CREATE POLICY "Users can insert their own WOD scaling levels"
  ON wod_scaling_levels FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM wods
      WHERE wods.id = wod_scaling_levels.wod_id
      AND wods.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own WOD scaling levels" ON wod_scaling_levels;
CREATE POLICY "Users can update their own WOD scaling levels"
  ON wod_scaling_levels FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM wods
      WHERE wods.id = wod_scaling_levels.wod_id
      AND wods.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own WOD scaling levels" ON wod_scaling_levels;
CREATE POLICY "Users can delete their own WOD scaling levels"
  ON wod_scaling_levels FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM wods
      WHERE wods.id = wod_scaling_levels.wod_id
      AND wods.user_id = auth.uid()
    )
  );

-- wod_movements
ALTER TABLE wod_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own WOD movements" ON wod_movements;
CREATE POLICY "Users can view their own WOD movements"
  ON wod_movements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM wods
      WHERE wods.id = wod_movements.wod_id
      AND wods.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own WOD movements" ON wod_movements;
CREATE POLICY "Users can insert their own WOD movements"
  ON wod_movements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM wods
      WHERE wods.id = wod_movements.wod_id
      AND wods.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own WOD movements" ON wod_movements;
CREATE POLICY "Users can update their own WOD movements"
  ON wod_movements FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM wods
      WHERE wods.id = wod_movements.wod_id
      AND wods.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own WOD movements" ON wod_movements;
CREATE POLICY "Users can delete their own WOD movements"
  ON wod_movements FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM wods
      WHERE wods.id = wod_movements.wod_id
      AND wods.user_id = auth.uid()
    )
  );

-- movement_standards (child of wod_movements which is child of wods)
ALTER TABLE movement_standards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own movement standards" ON movement_standards;
CREATE POLICY "Users can view their own movement standards"
  ON movement_standards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM wod_movements wm
      JOIN wods ON wods.id = wm.wod_id
      WHERE wm.id = movement_standards.wod_movement_id
      AND wods.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own movement standards" ON movement_standards;
CREATE POLICY "Users can insert their own movement standards"
  ON movement_standards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM wod_movements wm
      JOIN wods ON wods.id = wm.wod_id
      WHERE wm.id = movement_standards.wod_movement_id
      AND wods.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own movement standards" ON movement_standards;
CREATE POLICY "Users can update their own movement standards"
  ON movement_standards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM wod_movements wm
      JOIN wods ON wods.id = wm.wod_id
      WHERE wm.id = movement_standards.wod_movement_id
      AND wods.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own movement standards" ON movement_standards;
CREATE POLICY "Users can delete their own movement standards"
  ON movement_standards FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM wod_movements wm
      JOIN wods ON wods.id = wm.wod_id
      WHERE wm.id = movement_standards.wod_movement_id
      AND wods.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. CLASS CHILD TABLES (Inherit from classes - user can only access their own)
-- ============================================================================

-- class_parts
ALTER TABLE class_parts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own class parts" ON class_parts;
CREATE POLICY "Users can view their own class parts"
  ON class_parts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_parts.class_id
      AND classes.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own class parts" ON class_parts;
CREATE POLICY "Users can insert their own class parts"
  ON class_parts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_parts.class_id
      AND classes.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own class parts" ON class_parts;
CREATE POLICY "Users can update their own class parts"
  ON class_parts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_parts.class_id
      AND classes.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own class parts" ON class_parts;
CREATE POLICY "Users can delete their own class parts"
  ON class_parts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_parts.class_id
      AND classes.user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Goal types are viewable by everyone" ON goal_types IS 'Reference data - public read access';
COMMENT ON POLICY "Variation categories are viewable by everyone" ON variation_categories IS 'Reference data - public read access';
COMMENT ON POLICY "Variation options are viewable by everyone" ON variation_options IS 'Reference data - public read access';
COMMENT ON POLICY "WOD formats are viewable by everyone" ON wod_formats IS 'Reference data - public read access';
COMMENT ON POLICY "WOD categories are viewable by everyone" ON wod_categories IS 'Reference data - public read access';
COMMENT ON POLICY "Movement families are viewable by everyone" ON movement_families IS 'Reference data - public read access';
COMMENT ON POLICY "Planes of motion are viewable by everyone" ON planes_of_motion IS 'Reference data - public read access';
COMMENT ON POLICY "Load positions are viewable by everyone" ON load_positions IS 'Reference data - public read access';
COMMENT ON POLICY "Stances are viewable by everyone" ON stances IS 'Reference data - public read access';
COMMENT ON POLICY "Range depths are viewable by everyone" ON range_depths IS 'Reference data - public read access';
COMMENT ON POLICY "Movement styles are viewable by everyone" ON movement_styles IS 'Reference data - public read access';
COMMENT ON POLICY "Symmetries are viewable by everyone" ON symmetries IS 'Reference data - public read access';
COMMENT ON POLICY "Muscle regions are viewable by everyone" ON muscle_regions IS 'Reference data - public read access';
