-- ============================================
-- Tracking Tables for FitTracker App
-- Created: 2025-02-06
-- Description: Comprehensive tracking system for nutrition, body metrics, and activity
-- ============================================

-- ============================================
-- FOOD INVENTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.food_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  unit TEXT NOT NULL, -- oz, lbs, count, servings, etc.
  category TEXT, -- produce, protein, dairy, grains, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_food_inventory_user_id ON public.food_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_food_inventory_category ON public.food_inventory(category);

-- Enable RLS
ALTER TABLE public.food_inventory ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own food inventory"
  ON public.food_inventory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own food inventory"
  ON public.food_inventory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own food inventory"
  ON public.food_inventory FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own food inventory"
  ON public.food_inventory FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- MEAL LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.meal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'dessert')),
  name TEXT NOT NULL,
  calories INTEGER CHECK (calories >= 0),
  protein DECIMAL(10, 2) CHECK (protein >= 0), -- grams
  carbs DECIMAL(10, 2) CHECK (carbs >= 0), -- grams
  fats DECIMAL(10, 2) CHECK (fats >= 0), -- grams
  sugars DECIMAL(10, 2) CHECK (sugars >= 0), -- grams
  uses_inventory BOOLEAN NOT NULL DEFAULT false,
  inventory_items JSONB, -- [{id: uuid, quantity: number}]
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meal_logs_user_id ON public.meal_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_logs_date ON public.meal_logs(date);
CREATE INDEX IF NOT EXISTS idx_meal_logs_user_date ON public.meal_logs(user_id, date);

-- Enable RLS
ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own meal logs"
  ON public.meal_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own meal logs"
  ON public.meal_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meal logs"
  ON public.meal_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meal logs"
  ON public.meal_logs FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- WATER LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.water_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount_oz DECIMAL(10, 2) NOT NULL CHECK (amount_oz > 0),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_water_logs_user_id ON public.water_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_water_logs_date ON public.water_logs(date);
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON public.water_logs(user_id, date);

-- Enable RLS
ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

-- ============================================
-- WEIGHT LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  weight_lbs DECIMAL(10, 2) NOT NULL CHECK (weight_lbs > 0),
  time_of_day TEXT CHECK (time_of_day IN ('morning', 'evening')),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_id ON public.weight_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_weight_logs_date ON public.weight_logs(date);
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON public.weight_logs(user_id, date);

-- Enable RLS
ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

-- ============================================
-- BODY MEASUREMENTS TABLE
-- ============================================
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_body_measurements_user_id ON public.body_measurements(user_id);
CREATE INDEX IF NOT EXISTS idx_body_measurements_date ON public.body_measurements(date);
CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date ON public.body_measurements(user_id, date);

-- Enable RLS
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own body measurements"
  ON public.body_measurements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own body measurements"
  ON public.body_measurements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own body measurements"
  ON public.body_measurements FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own body measurements"
  ON public.body_measurements FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- PROGRESS PHOTOS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.progress_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  photo_url TEXT NOT NULL, -- Supabase Storage URL
  view_type TEXT CHECK (view_type IN ('front', 'side', 'back')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_progress_photos_user_id ON public.progress_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_photos_date ON public.progress_photos(date);
CREATE INDEX IF NOT EXISTS idx_progress_photos_user_date ON public.progress_photos(user_id, date);

-- Enable RLS
ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own progress photos"
  ON public.progress_photos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress photos"
  ON public.progress_photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress photos"
  ON public.progress_photos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own progress photos"
  ON public.progress_photos FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- WORKOUT LOGS TABLE (with Schedule integration)
-- ============================================
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
  exercises JSONB, -- [{name, sets, reps, weight, notes}]
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_id ON public.workout_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON public.workout_logs(date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date ON public.workout_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_schedule_event ON public.workout_logs(schedule_event_id);

-- Enable RLS
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own workout logs"
  ON public.workout_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own workout logs"
  ON public.workout_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workout logs"
  ON public.workout_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workout logs"
  ON public.workout_logs FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- SLEEP LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.sleep_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL, -- Date user went to bed
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_id ON public.sleep_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sleep_logs_date ON public.sleep_logs(date);
CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_date ON public.sleep_logs(user_id, date);

-- Enable RLS
ALTER TABLE public.sleep_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sleep logs"
  ON public.sleep_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sleep logs"
  ON public.sleep_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sleep logs"
  ON public.sleep_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sleep logs"
  ON public.sleep_logs FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_food_inventory_updated_at
  BEFORE UPDATE ON public.food_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPFUL VIEWS (Optional)
-- ============================================

-- Daily nutrition summary view
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

-- Daily water summary view
CREATE OR REPLACE VIEW public.daily_water_summary AS
SELECT
  user_id,
  date,
  COUNT(*) as log_count,
  SUM(amount_oz) as total_oz
FROM public.water_logs
GROUP BY user_id, date;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE public.food_inventory IS 'Tracks food items available at home for meal planning';
COMMENT ON TABLE public.meal_logs IS 'Logs all meals and snacks with nutritional information';
COMMENT ON TABLE public.water_logs IS 'Tracks water intake throughout the day';
COMMENT ON TABLE public.weight_logs IS 'Daily weight tracking with time of day';
COMMENT ON TABLE public.body_measurements IS 'Body circumference measurements for progress tracking';
COMMENT ON TABLE public.progress_photos IS 'Progress photos with view types and notes';
COMMENT ON TABLE public.workout_logs IS 'Workout logs with schedule integration and exercise details';
COMMENT ON TABLE public.sleep_logs IS 'Sleep tracking with bedtime, wake time, and quality rating';
