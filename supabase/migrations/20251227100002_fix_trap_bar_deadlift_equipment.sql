-- Migration: Fix Trap Bar Deadlift equipment
-- Description: Add Trap Bar to the equipment_types for Trap Bar Deadlift exercise

UPDATE exercises
SET equipment_types = array_append(COALESCE(equipment_types, ARRAY[]::text[]), 'Trap Bar')
WHERE name = 'Trap Bar Deadlift'
  AND (equipment_types IS NULL OR NOT 'Trap Bar' = ANY(equipment_types));
