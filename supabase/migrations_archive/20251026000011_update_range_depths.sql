-- Migration: Update Range Depths
-- Description: Replaces range depths with new comprehensive list

-- Delete all existing range depths
DELETE FROM range_depths;

-- Insert new range depths with descriptions
INSERT INTO range_depths (name, description, display_order) VALUES
  ('Full', 'Complete range of motion through the joint''s full intended path.', 1),
  ('Parallel', 'Movement stops when the working limb or thighs reach parallel to the ground.', 2),
  ('Partial', 'Intentionally shortened range for overload or limited mobility.', 3),
  ('Box', 'Depth controlled or limited by contact with a box or target.', 4),
  ('ATG (Ass to Grass)', 'Maximum depth—below parallel with full joint flexion.', 5),
  ('Quarter', 'Top quarter of the movement range for partial or overload work.', 6),
  ('Three-Quarter', 'Partial range deeper than half but not full depth.', 7),
  ('Lockout Only', 'Focuses solely on the final extension or lockout portion.', 8),
  ('Variable / Custom', 'Range varies by movement or is set to a custom depth.', 9)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;
