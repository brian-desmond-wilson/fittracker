-- Migration: Add Movement Reference Tables
-- Description: Creates 7 new reference tables for comprehensive movement metadata
-- Tables: movement_families, planes_of_motion, load_positions, stances, range_depths, movement_styles, symmetries

-- ============================================================================
-- 1. MOVEMENT FAMILIES (Functional movement patterns)
-- ============================================================================

CREATE TABLE IF NOT EXISTS movement_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed movement families (19 core patterns)
INSERT INTO movement_families (name, description, display_order) VALUES
  ('Squat', 'Bilateral hip and knee flexion patterns', 1),
  ('Hinge', 'Hip-dominant posterior chain movements', 2),
  ('Lunge', 'Unilateral or split-stance lower body movements', 3),
  ('Press', 'Pushing movements (vertical or horizontal)', 4),
  ('Pull', 'Pulling movements (vertical or horizontal)', 5),
  ('Carry', 'Loaded carries and farmer walks', 6),
  ('Jump', 'Explosive lower body movements', 7),
  ('Throw', 'Ballistic upper body movements', 8),
  ('Core', 'Anti-rotation, anti-extension, and midline stability', 9),
  ('Inversion', 'Handstand and inverted body positions', 10),
  ('Rotation', 'Rotational power and anti-rotation', 11),
  ('Climb', 'Vertical climbing movements (rope, pegboard)', 12),
  ('Swing', 'Ballistic hip extension patterns (kettlebell, slam ball)', 13),
  ('Row', 'Seated or machine-based rowing movements', 14),
  ('Bike', 'Cycling and bike erg movements', 15),
  ('Run', 'Running and sprinting movements', 16),
  ('Ski', 'Ski erg and cross-country ski patterns', 17),
  ('Rope', 'Jump rope and double-under movements', 18),
  ('Swim', 'Swimming movements', 19),
  ('Mobility', 'Dynamic mobility and movement prep', 20);

CREATE INDEX idx_movement_families_display_order ON movement_families(display_order);

-- ============================================================================
-- 2. PLANES OF MOTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS planes_of_motion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed planes of motion (4 values)
INSERT INTO planes_of_motion (name, description, display_order) VALUES
  ('Sagittal', 'Divides body into left and right (forward/backward movements)', 1),
  ('Frontal', 'Divides body into front and back (side-to-side movements)', 2),
  ('Transverse', 'Divides body into top and bottom (rotational movements)', 3),
  ('Multi', 'Combines multiple planes of motion', 4);

CREATE INDEX idx_planes_of_motion_display_order ON planes_of_motion(display_order);

-- ============================================================================
-- 3. LOAD POSITIONS (How weight is held)
-- ============================================================================

CREATE TABLE IF NOT EXISTS load_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed load positions (8 values)
INSERT INTO load_positions (name, description, display_order) VALUES
  ('BackRack', 'Barbell across upper back/traps', 1),
  ('FrontRack', 'Barbell on front of shoulders', 2),
  ('Overhead', 'Weight held overhead', 3),
  ('Goblet', 'Single weight held at chest (DB/KB)', 4),
  ('Zercher', 'Barbell in crook of elbows', 5),
  ('Suitcase', 'Single weight held at side', 6),
  ('Double', 'Two weights (dumbbells, kettlebells)', 7),
  ('Single', 'Single weight (dumbbell, kettlebell)', 8);

CREATE INDEX idx_load_positions_display_order ON load_positions(display_order);

-- ============================================================================
-- 4. STANCES (Foot/leg positioning)
-- ============================================================================

CREATE TABLE IF NOT EXISTS stances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed stances (6 values)
INSERT INTO stances (name, description, display_order) VALUES
  ('Standard', 'Feet shoulder-width or hip-width apart', 1),
  ('Wide/Sumo', 'Feet wider than shoulders', 2),
  ('Narrow', 'Feet closer than hip-width', 3),
  ('Split', 'Feet in split stance (front/back)', 4),
  ('Single-Leg', 'Single leg balance or movement', 5),
  ('Kneeling', 'One or both knees on ground', 6);

CREATE INDEX idx_stances_display_order ON stances(display_order);

-- ============================================================================
-- 5. RANGE DEPTHS (Depth of movement)
-- ============================================================================

CREATE TABLE IF NOT EXISTS range_depths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed range depths (5 values)
INSERT INTO range_depths (name, description, display_order) VALUES
  ('Full', 'Full range of motion', 1),
  ('Parallel', 'Thighs parallel to ground (squats)', 2),
  ('Partial', 'Partial range of motion', 3),
  ('Box', 'To box or platform', 4),
  ('ATG', 'Ass-to-grass (full depth squat)', 5);

CREATE INDEX idx_range_depths_display_order ON range_depths(display_order);

-- ============================================================================
-- 6. MOVEMENT STYLES (Tempo and execution variations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS movement_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed movement styles (8 values)
INSERT INTO movement_styles (name, description, display_order) VALUES
  ('Standard', 'Standard execution without modifications', 1),
  ('Pause', 'Includes pause at specific point', 2),
  ('Tempo', 'Prescribed tempo (e.g., 3-1-3-0)', 3),
  ('Eccentric', 'Emphasized eccentric/lowering phase', 4),
  ('Plyometric', 'Explosive, bounce out of bottom', 5),
  ('Isometric', 'Static hold at specific position', 6),
  ('Strict', 'No momentum, strict form', 7),
  ('Kipping', 'Using momentum/kip', 8);

CREATE INDEX idx_movement_styles_display_order ON movement_styles(display_order);

-- ============================================================================
-- 7. SYMMETRIES (Bilateral vs unilateral)
-- ============================================================================

CREATE TABLE IF NOT EXISTS symmetries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed symmetries (4 values)
INSERT INTO symmetries (name, description, display_order) VALUES
  ('Bilateral', 'Both sides working together', 1),
  ('Unilateral', 'One side at a time', 2),
  ('Alternating', 'Alternating between sides', 3),
  ('Offset', 'Asymmetric load (one side heavier)', 4);

CREATE INDEX idx_symmetries_display_order ON symmetries(display_order);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE movement_families IS 'Functional movement patterns (Squat, Hinge, Press, etc.)';
COMMENT ON TABLE planes_of_motion IS 'Anatomical planes of motion (Sagittal, Frontal, Transverse, Multi)';
COMMENT ON TABLE load_positions IS 'How external weight is held/positioned';
COMMENT ON TABLE stances IS 'Foot and leg positioning during movement';
COMMENT ON TABLE range_depths IS 'Depth or range of motion specifications';
COMMENT ON TABLE movement_styles IS 'Tempo and execution variations (Pause, Tempo, Strict, Kipping)';
COMMENT ON TABLE symmetries IS 'Bilateral vs unilateral loading patterns';
