-- ============================================
-- Add 'cabinet' as a storage location option
-- Created: 2025-02-17
-- Description: Extends food storage locations to include 'cabinet'
--              for items stored in cabinets (e.g., spices, canned goods, etc.)
-- ============================================

-- Update the CHECK constraint on food_inventory table to include 'cabinet'
ALTER TABLE public.food_inventory
  DROP CONSTRAINT IF EXISTS food_inventory_location_check;

ALTER TABLE public.food_inventory
  ADD CONSTRAINT food_inventory_location_check
  CHECK (location IN ('fridge', 'freezer', 'pantry', 'cabinet'));

-- Update the CHECK constraint on food_inventory_locations table to include 'cabinet'
ALTER TABLE public.food_inventory_locations
  DROP CONSTRAINT IF EXISTS food_inventory_locations_location_check;

ALTER TABLE public.food_inventory_locations
  ADD CONSTRAINT food_inventory_locations_location_check
  CHECK (location IN ('fridge', 'freezer', 'pantry', 'cabinet'));

-- Add comment for documentation
COMMENT ON CONSTRAINT food_inventory_location_check ON public.food_inventory IS 'Valid storage locations: fridge, freezer, pantry, cabinet';
COMMENT ON CONSTRAINT food_inventory_locations_location_check ON public.food_inventory_locations IS 'Valid storage locations: fridge, freezer, pantry, cabinet';
