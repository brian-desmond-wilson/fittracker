-- Migration: Create saved_foods table for personal food library
-- Allows users to save foods from barcode scans for instant future lookups

-- Create saved_foods table
CREATE TABLE IF NOT EXISTS public.saved_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  calories INTEGER CHECK (calories >= 0),
  protein NUMERIC(6,2) CHECK (protein >= 0),
  carbs NUMERIC(6,2) CHECK (carbs >= 0),
  fats NUMERIC(6,2) CHECK (fats >= 0),
  sugars NUMERIC(6,2) CHECK (sugars >= 0),
  serving_size TEXT,
  image_primary_url TEXT,
  image_front_url TEXT,
  image_back_url TEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique constraint on user_id + barcode (only when barcode is not null)
CREATE UNIQUE INDEX idx_saved_foods_user_barcode
  ON public.saved_foods(user_id, barcode)
  WHERE barcode IS NOT NULL;

-- Create indexes for common queries
CREATE INDEX idx_saved_foods_user_id ON public.saved_foods(user_id);
CREATE INDEX idx_saved_foods_barcode ON public.saved_foods(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_saved_foods_is_favorite ON public.saved_foods(user_id, is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX idx_saved_foods_name ON public.saved_foods(user_id, name);

-- Enable Row Level Security
ALTER TABLE public.saved_foods ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own saved foods"
  ON public.saved_foods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved foods"
  ON public.saved_foods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved foods"
  ON public.saved_foods FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved foods"
  ON public.saved_foods FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_saved_foods_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_saved_foods_updated_at
  BEFORE UPDATE ON public.saved_foods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_saved_foods_updated_at();

-- Add columns to meal_logs for linking to saved foods
ALTER TABLE public.meal_logs
  ADD COLUMN IF NOT EXISTS saved_food_id UUID REFERENCES public.saved_foods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS servings NUMERIC(4,2) DEFAULT 1.0 CHECK (servings > 0);

-- Index for meal_logs -> saved_foods relationship
CREATE INDEX IF NOT EXISTS idx_meal_logs_saved_food_id
  ON public.meal_logs(saved_food_id)
  WHERE saved_food_id IS NOT NULL;

-- Comment on table
COMMENT ON TABLE public.saved_foods IS 'Personal food library for quick meal logging from barcode scans';
