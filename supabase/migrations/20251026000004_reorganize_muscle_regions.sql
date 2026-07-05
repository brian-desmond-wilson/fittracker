-- Migration: Reorganize Muscle Regions
-- Description: Updates muscle regions to match new organization with 4 sections
-- Sections: Upper Body, Core/Midline, Lower Body, Whole Body

-- Delete old/deprecated regions first
DELETE FROM muscle_regions WHERE name IN ('Posterior Chain');

-- Update existing regions that are being renamed
UPDATE muscle_regions SET name = 'Neck / Traps', display_order = 1 WHERE name = 'Traps';
UPDATE muscle_regions SET name = 'Forearms / Grip', display_order = 8 WHERE name = 'Forearms';

-- Update display order for existing regions
UPDATE muscle_regions SET display_order = 2 WHERE name = 'Shoulders';
UPDATE muscle_regions SET display_order = 3 WHERE name = 'Chest';
UPDATE muscle_regions SET display_order = 4 WHERE name = 'Upper Back';
UPDATE muscle_regions SET display_order = 5 WHERE name = 'Lats';
UPDATE muscle_regions SET display_order = 6 WHERE name = 'Biceps';
UPDATE muscle_regions SET display_order = 7 WHERE name = 'Triceps';
UPDATE muscle_regions SET display_order = 9 WHERE name = 'Core';
UPDATE muscle_regions SET display_order = 10 WHERE name = 'Obliques';
UPDATE muscle_regions SET display_order = 11 WHERE name = 'Lower Back';
UPDATE muscle_regions SET display_order = 12 WHERE name = 'Glutes';
UPDATE muscle_regions SET display_order = 13 WHERE name = 'Quads';
UPDATE muscle_regions SET display_order = 14 WHERE name = 'Hamstrings';
UPDATE muscle_regions SET display_order = 15 WHERE name = 'Calves';
UPDATE muscle_regions SET display_order = 16 WHERE name = 'Hip Flexors';
UPDATE muscle_regions SET display_order = 19 WHERE name = 'Full Body';

-- Insert new regions that don't exist yet
INSERT INTO muscle_regions (name, display_order) VALUES
  ('Hip Abductors', 17),
  ('Hip Adductors', 18)
ON CONFLICT (name) DO UPDATE SET display_order = EXCLUDED.display_order;

-- Ensure Neck/Traps exists (in case it wasn't renamed from Traps)
INSERT INTO muscle_regions (name, display_order) VALUES
  ('Neck / Traps', 1)
ON CONFLICT (name) DO UPDATE SET display_order = EXCLUDED.display_order;

-- Ensure Forearms/Grip exists (in case it wasn't renamed from Forearms)
INSERT INTO muscle_regions (name, display_order) VALUES
  ('Forearms / Grip', 8)
ON CONFLICT (name) DO UPDATE SET display_order = EXCLUDED.display_order;
