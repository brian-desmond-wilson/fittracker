-- Migration: Add Core Movement Fields to Exercises Table
-- Description: Adds movement_family_id, plane_of_motion_id, skill_level, short_name, aliases to exercises
-- Includes automated data migration for existing 24 official movements

-- ============================================================================
-- 1. ADD NEW COLUMNS
-- ============================================================================

-- Add foreign key to movement_families
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS movement_family_id UUID REFERENCES movement_families(id) ON DELETE SET NULL;

-- Add foreign key to planes_of_motion
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS plane_of_motion_id UUID REFERENCES planes_of_motion(id) ON DELETE SET NULL;

-- Add skill level (TEXT with CHECK constraint)
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS skill_level TEXT CHECK (skill_level IN ('Beginner', 'Intermediate', 'Advanced'));

-- Add short name for UI
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS short_name TEXT;

-- Add aliases array
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS aliases TEXT[];

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_exercises_movement_family ON exercises(movement_family_id);
CREATE INDEX IF NOT EXISTS idx_exercises_plane_of_motion ON exercises(plane_of_motion_id);
CREATE INDEX IF NOT EXISTS idx_exercises_skill_level ON exercises(skill_level);
CREATE INDEX IF NOT EXISTS idx_exercises_aliases ON exercises USING GIN(aliases);

-- ============================================================================
-- 3. AUTOMATED DATA MIGRATION FOR EXISTING MOVEMENTS
-- ============================================================================

-- Set default skill level for all existing movements
UPDATE exercises
SET skill_level = 'Intermediate'
WHERE skill_level IS NULL AND is_movement = true;

-- Set short_name from name if not already set
UPDATE exercises
SET short_name = name
WHERE short_name IS NULL AND is_movement = true;

-- Map movements to movement families based on name patterns
-- Squat family
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Squat')
WHERE name ILIKE '%squat%' AND movement_family_id IS NULL;

-- Hinge family (deadlifts)
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Hinge')
WHERE (name ILIKE '%deadlift%' OR name ILIKE '%rdl%') AND movement_family_id IS NULL;

-- Press family
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Press')
WHERE (name ILIKE '%press%' OR name ILIKE '%push%') AND movement_family_id IS NULL;

-- Pull family
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Pull')
WHERE (name ILIKE '%pull%' OR name ILIKE '%row%') AND movement_family_id IS NULL;

-- Throw family (wall ball, thruster)
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Throw')
WHERE (name ILIKE '%wall ball%' OR name ILIKE '%thruster%') AND movement_family_id IS NULL;

-- Inversion family (handstand)
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Inversion')
WHERE name ILIKE '%handstand%' AND movement_family_id IS NULL;

-- Climb family (rope, muscle-up)
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Climb')
WHERE (name ILIKE '%rope climb%' OR name ILIKE '%muscle%') AND movement_family_id IS NULL;

-- Core family (toes-to-bar)
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Core')
WHERE (name ILIKE '%toes%to%bar%' OR name ILIKE '%sit%up%' OR name ILIKE '%plank%') AND movement_family_id IS NULL;

-- Run family
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Run')
WHERE name ILIKE '%run%' AND movement_family_id IS NULL;

-- Row family (rowing machine)
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Row')
WHERE name = 'Row' AND movement_family_id IS NULL;

-- Bike family
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Bike')
WHERE name ILIKE '%bike%' AND movement_family_id IS NULL;

-- Ski family
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Ski')
WHERE name ILIKE '%ski%' AND movement_family_id IS NULL;

-- Rope family (jump rope, double-unders)
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Rope')
WHERE (name ILIKE '%jump rope%' OR name ILIKE '%double%under%') AND movement_family_id IS NULL;

-- Swim family
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Swim')
WHERE name ILIKE '%swim%' AND movement_family_id IS NULL;

-- Mobility family
UPDATE exercises
SET movement_family_id = (SELECT id FROM movement_families WHERE name = 'Mobility')
WHERE (name ILIKE '%stretch%' OR name ILIKE '%mobility%' OR name ILIKE '%foam roll%') AND movement_family_id IS NULL;

-- Map movements to planes of motion
-- Sagittal plane (most squat, hinge, press patterns)
UPDATE exercises
SET plane_of_motion_id = (SELECT id FROM planes_of_motion WHERE name = 'Sagittal')
WHERE (
  name ILIKE '%squat%'
  OR name ILIKE '%deadlift%'
  OR name ILIKE '%press%'
  OR name ILIKE '%pull%up%'
  OR name ILIKE '%run%'
  OR name ILIKE '%row%'
  OR name ILIKE '%clean%'
  OR name ILIKE '%snatch%'
) AND plane_of_motion_id IS NULL;

-- Frontal plane (rarely pure frontal in CrossFit, mostly lunges)
-- Will leave NULL for now, can be set manually

-- Transverse plane (rotational movements)
-- Will leave NULL for now, can be set manually

-- Multi-plane (complex movements like thrusters, wall balls)
UPDATE exercises
SET plane_of_motion_id = (SELECT id FROM planes_of_motion WHERE name = 'Multi')
WHERE (
  name ILIKE '%thruster%'
  OR name ILIKE '%wall ball%'
  OR name ILIKE '%burpee%'
) AND plane_of_motion_id IS NULL;

-- ============================================================================
-- 4. SET SPECIFIC SKILL LEVELS
-- ============================================================================

-- Beginner movements
UPDATE exercises
SET skill_level = 'Beginner'
WHERE name IN ('Air Squat', 'Push-up', 'Sit-up', 'Ring Row', 'Box Step-up', 'Jump Rope', 'Plank')
  AND skill_level = 'Intermediate';

-- Advanced movements
UPDATE exercises
SET skill_level = 'Advanced'
WHERE name IN ('Muscle-up', 'Handstand Walk', 'Snatch', 'Clean and Jerk', 'Bar Muscle-up', 'Rope Climb')
  AND skill_level = 'Intermediate';

-- ============================================================================
-- 5. ADD COMMENTS
-- ============================================================================

COMMENT ON COLUMN exercises.movement_family_id IS 'Functional movement pattern (Squat, Hinge, Press, Pull, etc.)';
COMMENT ON COLUMN exercises.plane_of_motion_id IS 'Primary anatomical plane of motion';
COMMENT ON COLUMN exercises.skill_level IS 'Skill requirement: Beginner, Intermediate, or Advanced';
COMMENT ON COLUMN exercises.short_name IS 'Abbreviated name for UI display';
COMMENT ON COLUMN exercises.aliases IS 'Alternative names and search terms for this movement';
