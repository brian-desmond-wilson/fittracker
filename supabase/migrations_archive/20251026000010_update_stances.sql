-- Migration: Update Stances
-- Description: Replaces stances with new comprehensive list

-- Delete all existing stances
DELETE FROM stances;

-- Insert new stances with descriptions
INSERT INTO stances (name, description, display_order) VALUES
  ('Standard', 'Feet hip- to shoulder-width apart in a neutral athletic position.', 1),
  ('Wide (Sumo)', 'Feet set wider than shoulders with toes slightly turned out.', 2),
  ('Narrow', 'Feet placed closer together than hip width for a compact base.', 3),
  ('Split', 'One foot forward and one back in a full lunge-style stance.', 4),
  ('Single-Leg', 'Entire body weight supported on one leg.', 5),
  ('Staggered', 'Slightly offset stance with rear foot behind the front foot.', 6),
  ('Kneeling', 'Both knees on the ground with upright torso.', 7),
  ('Half-Kneeling', 'One knee down and one foot forward for stability.', 8),
  ('Seated', 'Body positioned sitting on a surface or floor.', 9),
  ('Supine / Prone', 'Lying position—on the back (supine) or face down (prone).', 10)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;
