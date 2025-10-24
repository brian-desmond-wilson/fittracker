-- Migration: Enhance Variation Options Table
-- Description: Adds movement metadata foreign keys to variation_options
-- Allows variations to have different families, planes, stances, etc. than their base movement

-- ============================================================================
-- 1. ADD NEW COLUMNS TO VARIATION_OPTIONS
-- ============================================================================

-- Add foreign keys to reference tables (allows variations to override base movement attributes)
ALTER TABLE variation_options
  ADD COLUMN IF NOT EXISTS movement_family_id UUID REFERENCES movement_families(id) ON DELETE SET NULL;

ALTER TABLE variation_options
  ADD COLUMN IF NOT EXISTS plane_of_motion_id UUID REFERENCES planes_of_motion(id) ON DELETE SET NULL;

ALTER TABLE variation_options
  ADD COLUMN IF NOT EXISTS load_position_id UUID REFERENCES load_positions(id) ON DELETE SET NULL;

ALTER TABLE variation_options
  ADD COLUMN IF NOT EXISTS stance_id UUID REFERENCES stances(id) ON DELETE SET NULL;

ALTER TABLE variation_options
  ADD COLUMN IF NOT EXISTS range_depth_id UUID REFERENCES range_depths(id) ON DELETE SET NULL;

ALTER TABLE variation_options
  ADD COLUMN IF NOT EXISTS movement_style_id UUID REFERENCES movement_styles(id) ON DELETE SET NULL;

ALTER TABLE variation_options
  ADD COLUMN IF NOT EXISTS symmetry_id UUID REFERENCES symmetries(id) ON DELETE SET NULL;

-- Add skill level override
ALTER TABLE variation_options
  ADD COLUMN IF NOT EXISTS skill_level TEXT CHECK (skill_level IN ('Beginner', 'Intermediate', 'Advanced'));

-- Add short name and aliases for variations
ALTER TABLE variation_options
  ADD COLUMN IF NOT EXISTS short_name TEXT;

ALTER TABLE variation_options
  ADD COLUMN IF NOT EXISTS aliases TEXT[];

-- Add display_order for better UI sorting
ALTER TABLE variation_options
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_variation_options_movement_family ON variation_options(movement_family_id);
CREATE INDEX IF NOT EXISTS idx_variation_options_plane_of_motion ON variation_options(plane_of_motion_id);
CREATE INDEX IF NOT EXISTS idx_variation_options_load_position ON variation_options(load_position_id);
CREATE INDEX IF NOT EXISTS idx_variation_options_stance ON variation_options(stance_id);
CREATE INDEX IF NOT EXISTS idx_variation_options_range_depth ON variation_options(range_depth_id);
CREATE INDEX IF NOT EXISTS idx_variation_options_movement_style ON variation_options(movement_style_id);
CREATE INDEX IF NOT EXISTS idx_variation_options_symmetry ON variation_options(symmetry_id);
CREATE INDEX IF NOT EXISTS idx_variation_options_skill_level ON variation_options(skill_level);
CREATE INDEX IF NOT EXISTS idx_variation_options_aliases ON variation_options USING GIN(aliases);
CREATE INDEX IF NOT EXISTS idx_variation_options_display_order ON variation_options(display_order);

-- ============================================================================
-- 3. POPULATE VARIATION-SPECIFIC ATTRIBUTES
-- ============================================================================

-- Kipping Pull-up variations get 'Kipping' movement style
UPDATE variation_options
SET movement_style_id = (SELECT id FROM movement_styles WHERE name = 'Kipping')
WHERE name ILIKE '%kipping%'
  AND movement_style_id IS NULL;

-- Strict variations get 'Strict' movement style
UPDATE variation_options
SET movement_style_id = (SELECT id FROM movement_styles WHERE name = 'Strict')
WHERE name ILIKE '%strict%'
  AND movement_style_id IS NULL;

-- Pause variations get 'Pause' movement style
UPDATE variation_options
SET movement_style_id = (SELECT id FROM movement_styles WHERE name = 'Pause')
WHERE name ILIKE '%pause%'
  AND movement_style_id IS NULL;

-- Tempo variations get 'Tempo' movement style
UPDATE variation_options
SET movement_style_id = (SELECT id FROM movement_styles WHERE name = 'Tempo')
WHERE name ILIKE '%tempo%'
  AND movement_style_id IS NULL;

-- Overhead variations get 'Overhead' load position
UPDATE variation_options
SET load_position_id = (SELECT id FROM load_positions WHERE name = 'Overhead')
WHERE name ILIKE '%overhead%'
  AND load_position_id IS NULL;

-- Front Rack variations
UPDATE variation_options
SET load_position_id = (SELECT id FROM load_positions WHERE name = 'FrontRack')
WHERE name ILIKE '%front%rack%'
  AND load_position_id IS NULL;

-- Back Rack variations
UPDATE variation_options
SET load_position_id = (SELECT id FROM load_positions WHERE name = 'BackRack')
WHERE name ILIKE '%back%rack%'
  AND load_position_id IS NULL;

-- Goblet variations
UPDATE variation_options
SET load_position_id = (SELECT id FROM load_positions WHERE name = 'Goblet')
WHERE name ILIKE '%goblet%'
  AND load_position_id IS NULL;

-- Single-leg variations get Single-Leg stance and Unilateral symmetry
UPDATE variation_options
SET stance_id = (SELECT id FROM stances WHERE name = 'Single-Leg'),
    symmetry_id = (SELECT id FROM symmetries WHERE name = 'Unilateral')
WHERE name ILIKE '%single%leg%'
  AND stance_id IS NULL;

-- Split stance variations
UPDATE variation_options
SET stance_id = (SELECT id FROM stances WHERE name = 'Split')
WHERE name ILIKE '%split%'
  AND stance_id IS NULL;

-- Wide/Sumo stance variations
UPDATE variation_options
SET stance_id = (SELECT id FROM stances WHERE name = 'Wide/Sumo')
WHERE (name ILIKE '%wide%' OR name ILIKE '%sumo%')
  AND stance_id IS NULL;

-- ATG (Ass-to-Grass) depth variations
UPDATE variation_options
SET range_depth_id = (SELECT id FROM range_depths WHERE name = 'ATG')
WHERE name ILIKE '%atg%'
  AND range_depth_id IS NULL;

-- Parallel depth variations
UPDATE variation_options
SET range_depth_id = (SELECT id FROM range_depths WHERE name = 'Parallel')
WHERE name ILIKE '%parallel%'
  AND range_depth_id IS NULL;

-- Box variations
UPDATE variation_options
SET range_depth_id = (SELECT id FROM range_depths WHERE name = 'Box')
WHERE name ILIKE '%box%'
  AND range_depth_id IS NULL;

-- ============================================================================
-- 4. SET SKILL LEVELS FOR VARIATIONS
-- ============================================================================

-- Kipping variations are typically easier than strict
UPDATE variation_options
SET skill_level = 'Intermediate'
WHERE name ILIKE '%kipping%'
  AND skill_level IS NULL;

-- Strict variations are typically harder
UPDATE variation_options
SET skill_level = 'Advanced'
WHERE name ILIKE '%strict%'
  AND name NOT ILIKE '%push%up%' -- Push-ups are beginner
  AND skill_level IS NULL;

-- Tempo and pause variations increase difficulty
UPDATE variation_options
SET skill_level = 'Intermediate'
WHERE (name ILIKE '%tempo%' OR name ILIKE '%pause%')
  AND skill_level IS NULL;

-- Single-leg variations increase difficulty
UPDATE variation_options
SET skill_level = 'Advanced'
WHERE name ILIKE '%single%leg%'
  AND skill_level IS NULL;

-- ============================================================================
-- 5. SET SHORT NAMES AND DISPLAY ORDER
-- ============================================================================

-- Set short_name from name if not already set
UPDATE variation_options
SET short_name = name
WHERE short_name IS NULL;

-- Set display_order based on common ordering patterns
-- Strict < Standard < Kipping < Weighted
UPDATE variation_options
SET display_order = CASE
  WHEN name ILIKE '%strict%' THEN 1
  WHEN name ILIKE '%standard%' THEN 2
  WHEN name ILIKE '%kipping%' THEN 3
  WHEN name ILIKE '%butterfly%' THEN 4
  WHEN name ILIKE '%weighted%' THEN 5
  ELSE 0
END
WHERE display_order = 0;

-- ============================================================================
-- 6. ADD COMMON VARIATION ALIASES
-- ============================================================================

-- Kipping Pull-ups
UPDATE variation_options
SET aliases = ARRAY['kipping pullup', 'kip pull-up', 'kip pullup']
WHERE name ILIKE '%kipping%pull%'
  AND aliases IS NULL;

-- Chest-to-Bar
UPDATE variation_options
SET aliases = ARRAY['ctb', 'c2b', 'chest to bar']
WHERE name ILIKE '%chest%to%bar%'
  AND aliases IS NULL;

-- Toes-to-Bar
UPDATE variation_options
SET aliases = ARRAY['ttb', 't2b', 'toes to bar']
WHERE name ILIKE '%toes%to%bar%'
  AND aliases IS NULL;

-- ============================================================================
-- 7. ADD COMMENTS
-- ============================================================================

COMMENT ON COLUMN variation_options.movement_family_id IS 'Override: Movement family for this variation (if different from base exercise)';
COMMENT ON COLUMN variation_options.plane_of_motion_id IS 'Override: Plane of motion for this variation';
COMMENT ON COLUMN variation_options.load_position_id IS 'Load position specific to this variation (e.g., Overhead, FrontRack)';
COMMENT ON COLUMN variation_options.stance_id IS 'Stance specific to this variation (e.g., Single-Leg, Split, Wide)';
COMMENT ON COLUMN variation_options.range_depth_id IS 'Depth specification for this variation (e.g., ATG, Parallel, Box)';
COMMENT ON COLUMN variation_options.movement_style_id IS 'Execution style for this variation (e.g., Strict, Kipping, Pause, Tempo)';
COMMENT ON COLUMN variation_options.symmetry_id IS 'Symmetry pattern for this variation (e.g., Bilateral, Unilateral)';
COMMENT ON COLUMN variation_options.skill_level IS 'Override: Skill level for this variation (if different from base exercise)';
COMMENT ON COLUMN variation_options.short_name IS 'Abbreviated name for UI display';
COMMENT ON COLUMN variation_options.aliases IS 'Alternative names and search terms';
COMMENT ON COLUMN variation_options.display_order IS 'Order for sorting variations in UI (lower numbers first)';
