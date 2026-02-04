-- Migration: Update Load Positions
-- Description: Replaces load_positions with new categorized structure

-- Delete all existing load positions
DELETE FROM load_positions;

-- Insert new load positions with categories and descriptions
INSERT INTO load_positions (name, description, display_order) VALUES
  -- Barbell section (1-4)
  ('Back', 'Barbell positioned on upper back/traps (e.g., Back Squat, Good Morning)', 1),
  ('Front', 'Barbell positioned on front deltoids/clavicles (e.g., Front Squat, Front Rack Lunge)', 2),
  ('Overhead', 'Barbell held overhead with locked-out arms (e.g., Overhead Squat, Overhead Lunge)', 3),
  ('Zercher', 'Barbell held in crook of elbows (e.g., Zercher Squat, Zercher Carry)', 4),

  -- Dumbbell/KB section (5-9)
  ('Single Front Rack', 'One dumbbell or kettlebell in front rack position (e.g., Single Arm KB Front Squat)', 5),
  ('Double Front Rack', 'Two dumbbells or kettlebells in front rack position (e.g., Double KB Front Squat)', 6),
  ('Goblet', 'Single dumbbell or kettlebell held at chest (e.g., Goblet Squat)', 7),
  ('Single Overhead', 'One dumbbell or kettlebell held overhead (e.g., Single Arm OH Lunge)', 8),
  ('Suitcase', 'Weight held at side like a suitcase (e.g., Suitcase Carry, Suitcase Lunge)', 9),

  -- Unloaded section (10-11)
  ('Bodyweight', 'No external load, body weight only (e.g., Air Squat, Push-Up)', 10),
  ('Hang', 'Hanging from bar or rings (e.g., Pull-Up, Muscle-Up)', 11),

  -- Odd Object section (12-14)
  ('Bear Hug', 'Object held against chest with arms wrapped around (e.g., Sandbag Bear Hug Carry)', 12),
  ('Carry', 'Object carried in various positions (e.g., Farmer Carry, Waiter Walk)', 13),
  ('Offset', 'Asymmetric loading pattern (e.g., Offset KB Squat)', 14)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;

-- Add category field to load_positions table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'load_positions' AND column_name = 'category'
  ) THEN
    ALTER TABLE load_positions ADD COLUMN category TEXT;
  END IF;
END $$;

-- Update categories for the load positions
UPDATE load_positions SET category = 'Barbell' WHERE display_order BETWEEN 1 AND 4;
UPDATE load_positions SET category = 'Dumbbell / KB' WHERE display_order BETWEEN 5 AND 9;
UPDATE load_positions SET category = 'Unloaded' WHERE display_order BETWEEN 10 AND 11;
UPDATE load_positions SET category = 'Odd Object' WHERE display_order BETWEEN 12 AND 14;
