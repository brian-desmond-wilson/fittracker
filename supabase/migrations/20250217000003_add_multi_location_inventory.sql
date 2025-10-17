-- ============================================
-- Multi-Location Food Inventory Enhancement
-- Created: 2025-02-17
-- Description: Add support for tracking food items across multiple storage locations
--              with separate ready-to-consume and storage quantities
-- ============================================

-- ============================================
-- 1. Create food_inventory_locations table
-- ============================================
CREATE TABLE IF NOT EXISTS public.food_inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_inventory_id UUID NOT NULL REFERENCES public.food_inventory(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location TEXT NOT NULL CHECK (location IN ('fridge', 'freezer', 'pantry')),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  is_ready_to_consume BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for efficient queries
CREATE INDEX idx_food_inventory_locations_food_inventory_id ON public.food_inventory_locations(food_inventory_id);
CREATE INDEX idx_food_inventory_locations_user_id ON public.food_inventory_locations(user_id);
CREATE INDEX idx_food_inventory_locations_location ON public.food_inventory_locations(location);
CREATE INDEX idx_food_inventory_locations_is_ready ON public.food_inventory_locations(is_ready_to_consume);

-- Enable RLS
ALTER TABLE public.food_inventory_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own food inventory locations"
  ON public.food_inventory_locations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own food inventory locations"
  ON public.food_inventory_locations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own food inventory locations"
  ON public.food_inventory_locations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own food inventory locations"
  ON public.food_inventory_locations FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 2. Modify food_inventory table
-- ============================================

-- Add new columns for multi-location support
ALTER TABLE public.food_inventory
  ADD COLUMN IF NOT EXISTS storage_type TEXT NOT NULL DEFAULT 'single-location' CHECK (storage_type IN ('single-location', 'multi-location')),
  ADD COLUMN IF NOT EXISTS requires_refrigeration BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fridge_restock_threshold INTEGER CHECK (fridge_restock_threshold >= 0),
  ADD COLUMN IF NOT EXISTS total_restock_threshold INTEGER CHECK (total_restock_threshold >= 0);

-- Add index on storage_type for filtering
CREATE INDEX IF NOT EXISTS idx_food_inventory_storage_type ON public.food_inventory(storage_type);

-- ============================================
-- 3. Create trigger for updating updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_food_inventory_locations_updated_at ON public.food_inventory_locations;
CREATE TRIGGER update_food_inventory_locations_updated_at
  BEFORE UPDATE ON public.food_inventory_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. Create helper views
-- ============================================

-- View for items with location breakdown
CREATE OR REPLACE VIEW public.food_inventory_with_locations AS
SELECT
  fi.*,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', fil.id,
        'location', fil.location,
        'quantity', fil.quantity,
        'is_ready_to_consume', fil.is_ready_to_consume,
        'notes', fil.notes,
        'created_at', fil.created_at,
        'updated_at', fil.updated_at
      ) ORDER BY fil.is_ready_to_consume DESC, fil.location
    ) FILTER (WHERE fil.id IS NOT NULL),
    '[]'::jsonb
  ) as locations,
  COALESCE(SUM(fil.quantity), fi.quantity) as total_quantity,
  COALESCE(SUM(fil.quantity) FILTER (WHERE fil.is_ready_to_consume = true),
    CASE WHEN fi.storage_type = 'single-location' THEN fi.quantity ELSE 0 END
  ) as ready_quantity,
  COALESCE(SUM(fil.quantity) FILTER (WHERE fil.is_ready_to_consume = false), 0) as storage_quantity
FROM public.food_inventory fi
LEFT JOIN public.food_inventory_locations fil ON fi.id = fil.food_inventory_id
GROUP BY fi.id;

-- Low stock view for multi-location items
CREATE OR REPLACE VIEW public.low_stock_items AS
SELECT fiwl.*
FROM public.food_inventory_with_locations fiwl
WHERE (
  -- Single-location items: use existing logic
  (fiwl.storage_type = 'single-location' AND fiwl.quantity > 0 AND fiwl.quantity <= fiwl.restock_threshold)
  OR
  -- Multi-location items: check both thresholds
  (fiwl.storage_type = 'multi-location' AND (
    (fiwl.ready_quantity > 0 AND fiwl.ready_quantity <= COALESCE(fiwl.fridge_restock_threshold, 0))
    OR
    (fiwl.total_quantity > 0 AND fiwl.total_quantity <= COALESCE(fiwl.total_restock_threshold, 0))
  ))
);

-- Expiring soon items view (within 7 days) - updated to work with new structure
CREATE OR REPLACE VIEW public.expiring_soon_items AS
SELECT fiwl.*
FROM public.food_inventory_with_locations fiwl
WHERE fiwl.expiration_date IS NOT NULL
  AND fiwl.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
  AND fiwl.total_quantity > 0;

-- Out of stock items view - updated to work with new structure
CREATE OR REPLACE VIEW public.out_of_stock_items AS
SELECT fiwl.*
FROM public.food_inventory_with_locations fiwl
WHERE fiwl.total_quantity = 0;

-- ============================================
-- 5. Migration function for existing data
-- ============================================

-- Function to migrate existing single-location items to the new structure
CREATE OR REPLACE FUNCTION migrate_single_location_items()
RETURNS void AS $$
BEGIN
  -- For each existing item with a location, create a location entry
  INSERT INTO public.food_inventory_locations (
    food_inventory_id,
    user_id,
    location,
    quantity,
    is_ready_to_consume,
    notes
  )
  SELECT
    id,
    user_id,
    location,
    quantity,
    CASE
      -- Items in fridge/freezer are considered ready to consume
      WHEN location IN ('fridge', 'freezer') THEN true
      -- Items in pantry could be either, default to ready for backwards compatibility
      ELSE true
    END,
    'Migrated from single-location'
  FROM public.food_inventory
  WHERE location IS NOT NULL
    AND storage_type = 'single-location'
    AND NOT EXISTS (
      SELECT 1 FROM public.food_inventory_locations fil
      WHERE fil.food_inventory_id = food_inventory.id
    );

  RAISE NOTICE 'Migration completed: Existing single-location items have been preserved';
END;
$$ LANGUAGE plpgsql;

-- Run the migration (can be commented out if you want to run it manually)
SELECT migrate_single_location_items();

-- ============================================
-- 6. Comments for documentation
-- ============================================
COMMENT ON TABLE public.food_inventory_locations IS 'Storage locations for food inventory items with multi-location tracking';
COMMENT ON COLUMN public.food_inventory_locations.is_ready_to_consume IS 'True if item is ready to consume (e.g., cold drinks in fridge), false if in storage (e.g., warm drinks in pantry)';
COMMENT ON COLUMN public.food_inventory.storage_type IS 'Determines if item uses single-location or multi-location tracking';
COMMENT ON COLUMN public.food_inventory.requires_refrigeration IS 'True if item must be refrigerated (affects restocking workflow)';
COMMENT ON COLUMN public.food_inventory.fridge_restock_threshold IS 'For multi-location items: threshold for ready-to-consume quantity to trigger internal restocking';
COMMENT ON COLUMN public.food_inventory.total_restock_threshold IS 'For multi-location items: threshold for total quantity to trigger shopping list addition';
COMMENT ON VIEW public.food_inventory_with_locations IS 'Food inventory with aggregated location data and computed quantities';
