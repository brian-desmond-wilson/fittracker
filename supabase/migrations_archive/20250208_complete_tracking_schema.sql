-- ============================================
-- Complete Tracking Schema - Manual Application Required
-- Created: 2025-02-08
-- Description: Drop and recreate all tracking tables with correct schema
-- IMPORTANT: This will delete existing data in water_logs and weight_logs
-- ============================================

-- Drop existing problematic tables
DROP TABLE IF EXISTS public.water_logs CASCADE;
DROP TABLE IF EXISTS public.weight_logs CASCADE;

-- Recreate all tracking tables with correct schema

-- Water Logs
CREATE TABLE public.water_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount_oz DECIMAL(10, 2) NOT NULL CHECK (amount_oz > 0),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_water_logs_user_id ON public.water_logs(user_id);
CREATE INDEX idx_water_logs_date ON public.water_logs(date);
CREATE INDEX idx_water_logs_user_date ON public.water_logs(user_id, date);

ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own water logs"
  ON public.water_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own water logs"
  ON public.water_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own water logs"
  ON public.water_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own water logs"
  ON public.water_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Weight Logs
CREATE TABLE public.weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_lbs DECIMAL(10, 2) NOT NULL CHECK (weight_lbs > 0),
  time_of_day TEXT CHECK (time_of_day IN ('morning', 'evening')),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weight_logs_user_id ON public.weight_logs(user_id);
CREATE INDEX idx_weight_logs_date ON public.weight_logs(date);
CREATE INDEX idx_weight_logs_user_date ON public.weight_logs(user_id, date);

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own weight logs"
  ON public.weight_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own weight logs"
  ON public.weight_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own weight logs"
  ON public.weight_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own weight logs"
  ON public.weight_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Create remaining tables that may not exist

-- Food Inventory
CREATE TABLE IF NOT EXISTS public.food_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  unit TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_food_inventory_user_id ON public.food_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_food_inventory_category ON public.food_inventory(category);

ALTER TABLE public.food_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own food inventory" ON public.food_inventory;
DROP POLICY IF EXISTS "Users can insert their own food inventory" ON public.food_inventory;
DROP POLICY IF EXISTS "Users can update their own food inventory" ON public.food_inventory;
DROP POLICY IF EXISTS "Users can delete their own food inventory" ON public.food_inventory;

CREATE POLICY "Users can view their own food inventory" ON public.food_inventory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own food inventory" ON public.food_inventory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own food inventory" ON public.food_inventory FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own food inventory" ON public.food_inventory FOR DELETE USING (auth.uid() = user_id);

-- Meal Logs
CREATE TABLE IF NOT EXISTS public.meal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'dessert')),
  name TEXT NOT NULL,
  calories INTEGER CHECK (calories >= 0),
  protein DECIMAL(10, 2) CHECK (protein >= 0),
  carbs DECIMAL(10, 2) CHECK (carbs >= 0),
  fats DECIMAL(10, 2) CHECK (fats >= 0),
  sugars DECIMAL(10, 2) CHECK (sugars >= 0),
  uses_inventory BOOLEAN NOT NULL DEFAULT false,
  inventory_items JSONB,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_logs_user_id ON public.meal_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_logs_date ON public.meal_logs(date);
CREATE INDEX IF NOT EXISTS idx_meal_logs_user_date ON public.meal_logs(user_id, date);

ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own meal logs" ON public.meal_logs;
DROP POLICY IF EXISTS "Users can insert their own meal logs" ON public.meal_logs;
DROP POLICY IF EXISTS "Users can update their own meal logs" ON public.meal_logs;
DROP POLICY IF EXISTS "Users can delete their own meal logs" ON public.meal_logs;

CREATE POLICY "Users can view their own meal logs" ON public.meal_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own meal logs" ON public.meal_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own meal logs" ON public.meal_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own meal logs" ON public.meal_logs FOR DELETE USING (auth.uid() = user_id);

-- Body Measurements
CREATE TABLE IF NOT EXISTS public.body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  biceps_inches DECIMAL(10, 2) CHECK (biceps_inches > 0),
  chest_inches DECIMAL(10, 2) CHECK (chest_inches > 0),
  waist_inches DECIMAL(10, 2) CHECK (waist_inches > 0),
  hips_inches DECIMAL(10, 2) CHECK (hips_inches > 0),
  thighs_inches DECIMAL(10, 2) CHECK (thighs_inches > 0),
  calves_inches DECIMAL(10, 2) CHECK (calves_inches > 0),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_id ON public.body_measurements(user_id);
CREATE INDEX IF NOT EXISTS idx_body_measurements_date ON public.body_measurements(date);
CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date ON public.body_measurements(user_id, date);

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own body measurements" ON public.body_measurements;
DROP POLICY IF EXISTS "Users can insert their own body measurements" ON public.body_measurements;
DROP POLICY IF EXISTS "Users can update their own body measurements" ON public.body_measurements;
DROP POLICY IF EXISTS "Users can delete their own body measurements" ON public.body_measurements;

CREATE POLICY "Users can view their own body measurements" ON public.body_measurements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own body measurements" ON public.body_measurements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own body measurements" ON public.body_measurements FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own body measurements" ON public.body_measurements FOR DELETE USING (auth.uid() = user_id);

-- Progress Photos
CREATE TABLE IF NOT EXISTS public.progress_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  photo_url TEXT NOT NULL,
  view_type TEXT CHECK (view_type IN ('front', 'side', 'back')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_progress_photos_user_id ON public.progress_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_photos_date ON public.progress_photos(date);
CREATE INDEX IF NOT EXISTS idx_progress_photos_user_date ON public.progress_photos(user_id, date);

ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own progress photos" ON public.progress_photos;
DROP POLICY IF EXISTS "Users can insert their own progress photos" ON public.progress_photos;
DROP POLICY IF EXISTS "Users can update their own progress photos" ON public.progress_photos;
DROP POLICY IF EXISTS "Users can delete their own progress photos" ON public.progress_photos;

CREATE POLICY "Users can view their own progress photos" ON public.progress_photos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own progress photos" ON public.progress_photos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own progress photos" ON public.progress_photos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own progress photos" ON public.progress_photos FOR DELETE USING (auth.uid() = user_id);

-- Workout Logs
CREATE TABLE IF NOT EXISTS public.workout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_event_id UUID REFERENCES public.schedule_events(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  workout_type TEXT NOT NULL CHECK (workout_type IN ('bodybuilding', 'crossfit', 'cardio', 'other')),
  name TEXT NOT NULL,
  planned_start_time TIME,
  planned_end_time TIME,
  actual_start_time TIME,
  actual_end_time TIME,
  exercises JSONB,
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_logs_user_id ON public.workout_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON public.workout_logs(date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date ON public.workout_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_schedule_event ON public.workout_logs(schedule_event_id);

ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own workout logs" ON public.workout_logs;
DROP POLICY IF EXISTS "Users can insert their own workout logs" ON public.workout_logs;
DROP POLICY IF EXISTS "Users can update their own workout logs" ON public.workout_logs;
DROP POLICY IF EXISTS "Users can delete their own workout logs" ON public.workout_logs;

CREATE POLICY "Users can view their own workout logs" ON public.workout_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own workout logs" ON public.workout_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own workout logs" ON public.workout_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own workout logs" ON public.workout_logs FOR DELETE USING (auth.uid() = user_id);

-- Sleep Logs
CREATE TABLE IF NOT EXISTS public.sleep_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  bedtime TIMESTAMPTZ NOT NULL,
  wake_time TIMESTAMPTZ NOT NULL,
  hours_slept DECIMAL(10, 2) GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (wake_time - bedtime)) / 3600
  ) STORED,
  quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_sleep_times CHECK (wake_time > bedtime)
);

CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_id ON public.sleep_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sleep_logs_date ON public.sleep_logs(date);
CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date ON public.sleep_logs(user_id, date);

ALTER TABLE public.sleep_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own sleep logs" ON public.sleep_logs;
DROP POLICY IF EXISTS "Users can insert their own sleep logs" ON public.sleep_logs;
DROP POLICY IF EXISTS "Users can update their own sleep logs" ON public.sleep_logs;
DROP POLICY IF EXISTS "Users can delete their own sleep logs" ON public.sleep_logs;

CREATE POLICY "Users can view their own sleep logs" ON public.sleep_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own sleep logs" ON public.sleep_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own sleep logs" ON public.sleep_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own sleep logs" ON public.sleep_logs FOR DELETE USING (auth.uid() = user_id);

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_food_inventory_updated_at ON public.food_inventory;
CREATE TRIGGER update_food_inventory_updated_at
  BEFORE UPDATE ON public.food_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helpful Views
CREATE OR REPLACE VIEW public.daily_nutrition_summary AS
SELECT
  user_id,
  date,
  COUNT(*) as total_meals,
  SUM(calories) as total_calories,
  SUM(protein) as total_protein,
  SUM(carbs) as total_carbs,
  SUM(fats) as total_fats,
  SUM(sugars) as total_sugars
FROM public.meal_logs
GROUP BY user_id, date;

CREATE OR REPLACE VIEW public.daily_water_summary AS
SELECT
  user_id,
  date,
  COUNT(*) as log_count,
  SUM(amount_oz) as total_oz
FROM public.water_logs
GROUP BY user_id, date;
