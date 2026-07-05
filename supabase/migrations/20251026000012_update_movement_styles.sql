-- Migration: Update Movement Styles
-- Description: Replaces movement styles with new comprehensive categorized list

-- Delete all existing movement styles
DELETE FROM movement_styles;

-- Add category field to movement_styles table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'movement_styles' AND column_name = 'category'
  ) THEN
    ALTER TABLE movement_styles ADD COLUMN category TEXT;
  END IF;
END $$;

-- Insert new movement styles with categories and descriptions
INSERT INTO movement_styles (name, category, description, display_order) VALUES
  -- Execution Control (1-8)
  ('Standard', 'Execution Control', 'Normal movement speed and rhythm with no special modifiers.', 1),
  ('Strict', 'Execution Control', 'Performed without momentum or kipping assistance.', 2),
  ('Pause', 'Execution Control', 'Incorporates a deliberate hold at a specific phase of the movement.', 3),
  ('Tempo', 'Execution Control', 'Performed with prescribed timing for eccentric and concentric phases.', 4),
  ('Eccentric (Negative)', 'Execution Control', 'Emphasizes a slow, controlled lowering phase.', 5),
  ('Isometric (Hold)', 'Execution Control', 'Static contraction or hold with no movement.', 6),
  ('Controlled', 'Execution Control', 'Focus on smooth, precise motion without prescribed tempo.', 7),

  -- Dynamic Power (8-11)
  ('Kipping', 'Dynamic Power', 'Uses body swing or hip drive to generate momentum.', 8),
  ('Plyometric (Explosive)', 'Dynamic Power', 'Involves rapid, explosive, or rebound movements.', 9),
  ('Unbroken', 'Dynamic Power', 'Continuous reps without rest or breaks.', 10),
  ('Alternating', 'Dynamic Power', 'Alternates limbs or sides each repetition.', 11),

  -- Assistance / Load Variant (12-15)
  ('Assisted', 'Assistance / Load Variant', 'Uses external aid to reduce difficulty (bands, machine, partner).', 12),
  ('Weighted', 'Assistance / Load Variant', 'Adds external resistance to a typically bodyweight movement.', 13),
  ('Deficit', 'Assistance / Load Variant', 'Increases range of motion by elevating start position.', 14),
  ('Partial / Range-Limited', 'Assistance / Load Variant', 'Movement performed through a reduced range of motion.', 15)
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;

-- Update categories for movement styles (in case some already exist)
UPDATE movement_styles SET category = 'Execution Control' WHERE display_order BETWEEN 1 AND 7;
UPDATE movement_styles SET category = 'Dynamic Power' WHERE display_order BETWEEN 8 AND 11;
UPDATE movement_styles SET category = 'Assistance / Load Variant' WHERE display_order BETWEEN 12 AND 15;
