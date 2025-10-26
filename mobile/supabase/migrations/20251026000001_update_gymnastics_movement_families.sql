-- Migration: Update Gymnastics Movement Families
-- Description:
--   1. Rename Press → Push/Press with new description
--   2. Rename Jump → Plyometric
--   3. Add new families: Support/Hold, Ring/Bar, Mobility/Control

-- Update existing families
UPDATE movement_families
SET name = 'Push/Press',
    description = 'Bodyweight pressing and handstand-based pushing'
WHERE name = 'Press' AND display_order = 4;

UPDATE movement_families
SET name = 'Plyometric',
    description = 'Explosive lower body movements'
WHERE name = 'Jump' AND display_order = 7;

-- Add new gymnastics-specific families
INSERT INTO movement_families (name, description, display_order) VALUES
  ('Support/Hold', 'Static bodyweight holds and supports', 22),
  ('Ring/Bar', 'Movement on hanging apparatus', 23),
  ('Mobility/Control', 'Controlled skill drills and dynamic mobility patterns', 24)
ON CONFLICT (name) DO NOTHING;
