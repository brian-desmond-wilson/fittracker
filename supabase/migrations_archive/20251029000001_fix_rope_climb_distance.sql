-- Fix Rope Climb to be a distance-based movement
-- This movement requires distance tracking but was created before requires_distance persistence fix

UPDATE exercises
SET requires_distance = true
WHERE name = 'Rope Climb'
  AND requires_distance = false;
