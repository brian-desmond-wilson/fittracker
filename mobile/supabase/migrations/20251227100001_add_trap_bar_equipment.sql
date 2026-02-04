-- Migration: Add Trap Bar equipment
-- Description: Adds Trap Bar to the Free Weights equipment category

INSERT INTO equipment (name, category, display_order) VALUES
  ('Trap Bar', 'Free Weights', 4)
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order;
