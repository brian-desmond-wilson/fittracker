-- Meals & Snacks Tier 1: macro goals, additional nutrients (sodium, fiber),
-- and multi-food meal templates.

-- 1. Macro goals on profiles (calories already exists as target_calories).
-- Priority tier A: calories (existing), protein
-- Priority tier B: carbs, sodium
-- Priority tier C: fats, sugars, fiber
ALTER TABLE public.profiles
  ADD COLUMN target_protein_g INTEGER CHECK (target_protein_g IS NULL OR target_protein_g > 0),
  ADD COLUMN target_carbs_g   INTEGER CHECK (target_carbs_g   IS NULL OR target_carbs_g   > 0),
  ADD COLUMN target_sodium_mg INTEGER CHECK (target_sodium_mg IS NULL OR target_sodium_mg > 0),
  ADD COLUMN target_fats_g    INTEGER CHECK (target_fats_g    IS NULL OR target_fats_g    > 0),
  ADD COLUMN target_sugars_g  INTEGER CHECK (target_sugars_g  IS NULL OR target_sugars_g  > 0),
  ADD COLUMN target_fiber_g   INTEGER CHECK (target_fiber_g   IS NULL OR target_fiber_g   > 0);

-- 2. Sodium + fiber columns on meal_logs and saved_foods.
ALTER TABLE public.meal_logs
  ADD COLUMN sodium_mg NUMERIC(6,2),
  ADD COLUMN fiber_g   NUMERIC(6,2);

ALTER TABLE public.saved_foods
  ADD COLUMN sodium_mg NUMERIC(6,2),
  ADD COLUMN fiber_g   NUMERIC(6,2);

-- 3. Meal templates: named collections of saved_foods + servings.
-- Logging a template creates one meal_log per template item (each linked
-- to its saved_food). The default_meal_type pre-selects breakfast/lunch/
-- dinner/snack/dessert when the user logs the template.
CREATE TABLE public.meal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_meal_type TEXT
    CHECK (default_meal_type IN ('breakfast','lunch','dinner','snack','dessert')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meal_templates_user ON public.meal_templates (user_id, name);

CREATE TABLE public.meal_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.meal_templates(id) ON DELETE CASCADE,
  saved_food_id UUID NOT NULL REFERENCES public.saved_foods(id) ON DELETE CASCADE,
  servings NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (servings > 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meal_template_items_template ON public.meal_template_items (template_id, display_order);

ALTER TABLE public.meal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own meal templates"
  ON public.meal_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own meal templates"
  ON public.meal_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own meal templates"
  ON public.meal_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own meal templates"
  ON public.meal_templates FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can read their own template items"
  ON public.meal_template_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.meal_templates t WHERE t.id = template_id AND t.user_id = auth.uid()));
CREATE POLICY "Users can insert their own template items"
  ON public.meal_template_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.meal_templates t WHERE t.id = template_id AND t.user_id = auth.uid()));
CREATE POLICY "Users can update their own template items"
  ON public.meal_template_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.meal_templates t WHERE t.id = template_id AND t.user_id = auth.uid()));
CREATE POLICY "Users can delete their own template items"
  ON public.meal_template_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.meal_templates t WHERE t.id = template_id AND t.user_id = auth.uid()));

-- 4. Tag a meal_log with the template it came from (nullable).
ALTER TABLE public.meal_logs
  ADD COLUMN meal_template_id UUID REFERENCES public.meal_templates(id) ON DELETE SET NULL;

CREATE INDEX idx_meal_logs_template ON public.meal_logs (meal_template_id) WHERE meal_template_id IS NOT NULL;
