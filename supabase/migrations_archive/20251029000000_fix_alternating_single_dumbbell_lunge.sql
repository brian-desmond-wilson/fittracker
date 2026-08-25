-- Fix equipment configuration for Alternating Single-Dumbbell Lunge
-- This movement requires a dumbbell but was created before equipment persistence fix

UPDATE exercises
SET
  equipment_types = ARRAY['Dumbbell'],
  requires_weight = true
WHERE name = 'Alternating Single-Dumbbell Lunge'
  AND (equipment_types IS NULL OR requires_weight = false);
