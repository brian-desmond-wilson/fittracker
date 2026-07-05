-- Migration: Update Symmetries
-- Description: Replaces symmetries with new comprehensive list

-- Delete all existing symmetries
DELETE FROM symmetries;

-- Insert new symmetries with descriptions
INSERT INTO symmetries (name, description, display_order) VALUES
  ('Bilateral', 'Both sides of the body work together symmetrically.', 1),
  ('Unilateral', 'Only one side or limb works at a time.', 2),
  ('Alternating', 'Sides or limbs alternate with each repetition.', 3),
  ('Offset', 'Uneven load or stance creating asymmetrical balance demand.', 4),
  ('Contralateral', 'Opposite limbs move together (e.g., right arm with left leg).', 5),
  ('Cross-Body / Rotational', 'Movement involves rotation or diagonal loading across the midline.', 6)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;
