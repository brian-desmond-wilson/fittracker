-- Migration: Update Planes of Motion
-- Description: Replaces planes of motion with new comprehensive list

-- Delete all existing planes of motion
DELETE FROM planes_of_motion;

-- Insert new planes of motion with descriptions
INSERT INTO planes_of_motion (name, description, display_order) VALUES
  ('Sagittal', 'Forward-and-backward movement dividing the body into left/right halves.', 1),
  ('Frontal', 'Side-to-side movement dividing the body into front/back halves.', 2),
  ('Transverse', 'Rotational or twisting movement around the body''s vertical axis.', 3),
  ('Multi-Planar', 'Combines two or more planes in one motion.', 4)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;
