-- Migration: Add Athletic / Partial Squat stance
-- Description: Adds new stance option for athletic ready position with bent knees

INSERT INTO stances (name, description, display_order) VALUES
  ('Athletic / Partial Squat', 'Athletic ready position with knees slightly bent, hips back, weight on balls of feet.', 11)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;
