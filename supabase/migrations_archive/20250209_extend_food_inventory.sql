-- ============================================
-- Extend Food Inventory Schema
-- Created: 2025-02-09
-- Description: Add comprehensive fields for full food inventory management
-- ============================================

-- Extend food_inventory table with new columns
ALTER TABLE public.food_inventory
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS flavor TEXT,
  ADD COLUMN IF NOT EXISTS calories INTEGER CHECK (calories >= 0),
  ADD COLUMN IF NOT EXISTS protein DECIMAL(10, 2) CHECK (protein >= 0),
  ADD COLUMN IF NOT EXISTS carbs DECIMAL(10, 2) CHECK (carbs >= 0),
  ADD COLUMN IF NOT EXISTS fats DECIMAL(10, 2) CHECK (fats >= 0),
  ADD COLUMN IF NOT EXISTS sugars DECIMAL(10, 2) CHECK (sugars >= 0),
  ADD COLUMN IF NOT EXISTS serving_size TEXT,
  ADD COLUMN IF NOT EXISTS expiration_date DATE,
  ADD COLUMN IF NOT EXISTS location TEXT CHECK (location IN ('fridge', 'freezer', 'pantry')),
  ADD COLUMN IF NOT EXISTS restock_threshold INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS image_primary_url TEXT,
  ADD COLUMN IF NOT EXISTS image_front_url TEXT,
  ADD COLUMN IF NOT EXISTS image_back_url TEXT,
  ADD COLUMN IF NOT EXISTS image_side_url TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add index on barcode for quick lookups
CREATE INDEX IF NOT EXISTS idx_food_inventory_barcode ON public.food_inventory(barcode);

-- Add index on expiration_date for alerts
CREATE INDEX IF NOT EXISTS idx_food_inventory_expiration ON public.food_inventory(expiration_date);

-- Add index on location for filtering
CREATE INDEX IF NOT EXISTS idx_food_inventory_location ON public.food_inventory(location);

-- ============================================
-- Food Categories Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.food_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT, -- Lucide icon name
  color TEXT, -- Hex color code
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_food_categories_user_id ON public.food_categories(user_id);

ALTER TABLE public.food_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own food categories"
  ON public.food_categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own food categories"
  ON public.food_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own food categories"
  ON public.food_categories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own non-default categories"
  ON public.food_categories FOR DELETE
  USING (auth.uid() = user_id AND is_default = false);

-- ============================================
-- Shopping List Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.shopping_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_inventory_id UUID REFERENCES public.food_inventory(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  category TEXT,
  priority INTEGER CHECK (priority >= 1 AND priority <= 3) DEFAULT 2, -- 1=high, 2=medium, 3=low
  is_purchased BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purchased_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_user_id ON public.shopping_list(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_food_inventory_id ON public.shopping_list(food_inventory_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_is_purchased ON public.shopping_list(is_purchased);

ALTER TABLE public.shopping_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own shopping list"
  ON public.shopping_list FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own shopping list items"
  ON public.shopping_list FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shopping list items"
  ON public.shopping_list FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shopping list items"
  ON public.shopping_list FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Insert Default Categories
-- ============================================
-- Note: These will be inserted per-user on first app load
-- This is just the schema definition

-- ============================================
-- Helpful Views
-- ============================================

-- Low stock items view
CREATE OR REPLACE VIEW public.low_stock_items AS
SELECT *
FROM public.food_inventory
WHERE quantity > 0 AND quantity <= restock_threshold;

-- Expiring soon items view (within 7 days)
CREATE OR REPLACE VIEW public.expiring_soon_items AS
SELECT *
FROM public.food_inventory
WHERE expiration_date IS NOT NULL
  AND expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
  AND quantity > 0;

-- Out of stock items view
CREATE OR REPLACE VIEW public.out_of_stock_items AS
SELECT *
FROM public.food_inventory
WHERE quantity = 0;

-- Shopping list active items view
CREATE OR REPLACE VIEW public.shopping_list_active AS
SELECT *
FROM public.shopping_list
WHERE is_purchased = false
ORDER BY priority ASC, created_at ASC;

-- ============================================
-- Comments for Documentation
-- ============================================
COMMENT ON TABLE public.food_categories IS 'User-defined categories for organizing food inventory';
COMMENT ON TABLE public.shopping_list IS 'Shopping list/cart for items to purchase';
COMMENT ON VIEW public.low_stock_items IS 'Items with quantity at or below restock threshold';
COMMENT ON VIEW public.expiring_soon_items IS 'Items expiring within 7 days';
COMMENT ON VIEW public.out_of_stock_items IS 'Items with zero quantity';
COMMENT ON VIEW public.shopping_list_active IS 'Unpurchased shopping list items ordered by priority';
