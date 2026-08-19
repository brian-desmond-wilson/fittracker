-- Beverages become a first-class thing to log (design: 2026-08-18 session).
--
-- A drink is not a meal slot: a 10 AM energy drink must not become "Snack 1"
-- and make the planner think its owner has eaten. So 'beverage' joins
-- meal_type, and two facts ride with it:
--
--   beverage_kinds  what the drink IS — multi-select, because one shake can be
--                   high-protein AND high-calorie at once.
--   counts_as_meal  what the drink DOES to the day — whether it fills the
--                   eating window its time lands in. Pre-set from the kinds
--                   (weight_gain_shake => true), always overridable by hand.
--
-- eating_windows.meal_type is deliberately NOT widened: a beverage never
-- defines a window — floating outside them is the whole point.

-- meal_logs ------------------------------------------------------------------

ALTER TABLE public.meal_logs DROP CONSTRAINT IF EXISTS meal_logs_meal_type_check;
ALTER TABLE public.meal_logs
  ADD CONSTRAINT meal_logs_meal_type_check CHECK (meal_type IN
    ('breakfast','lunch','dinner','snack','dessert','beverage'));

-- NULL for food logs; a beverage log carries at least one kind ('other' when
-- nothing fits). Kept as text[] rather than a join table: kinds are tags on
-- one row, never queried as their own entity.
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS beverage_kinds text[];

-- TRUE for every food log (eating food is eating); a beverage log sets it
-- from the switch. NOT NULL so the planner never has to interpret an absent
-- answer to "did this fill a window".
ALTER TABLE public.meal_logs
  ADD COLUMN IF NOT EXISTS counts_as_meal boolean NOT NULL DEFAULT true;

ALTER TABLE public.meal_logs DROP CONSTRAINT IF EXISTS meal_logs_beverage_kinds_check;
ALTER TABLE public.meal_logs
  ADD CONSTRAINT meal_logs_beverage_kinds_check CHECK (
    beverage_kinds IS NULL
    OR (
      meal_type = 'beverage'
      AND array_length(beverage_kinds, 1) >= 1
      AND beverage_kinds <@ ARRAY[
        'protein_shake','weight_gain_shake','smoothie','energy_drink','other'
      ]::text[]
    )
  );

-- meals ----------------------------------------------------------------------

ALTER TABLE public.meals DROP CONSTRAINT IF EXISTS meals_category_check;
ALTER TABLE public.meals
  ADD CONSTRAINT meals_category_check CHECK (category IN
    ('breakfast','lunch','dinner','snack','dessert','shake','emergency','beverage'));

ALTER TABLE public.meals DROP CONSTRAINT IF EXISTS meals_default_meal_type_check;
ALTER TABLE public.meals
  ADD CONSTRAINT meals_default_meal_type_check CHECK (default_meal_type IN
    ('breakfast','lunch','dinner','snack','dessert','beverage'));

-- The library entry's own kinds — what pre-fills the log sheet's tags (and
-- the counts-as-meal default) when this meal is logged.
ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS beverage_kinds text[];

ALTER TABLE public.meals DROP CONSTRAINT IF EXISTS meals_beverage_kinds_check;
ALTER TABLE public.meals
  ADD CONSTRAINT meals_beverage_kinds_check CHECK (
    beverage_kinds IS NULL
    OR (
      array_length(beverage_kinds, 1) >= 1
      AND beverage_kinds <@ ARRAY[
        'protein_shake','weight_gain_shake','smoothie','energy_drink','other'
      ]::text[]
    )
  );

-- meal_categories ------------------------------------------------------------

ALTER TABLE public.meal_categories DROP CONSTRAINT IF EXISTS meal_categories_category_check;
ALTER TABLE public.meal_categories
  ADD CONSTRAINT meal_categories_category_check CHECK (category IN
    ('breakfast','lunch','dinner','snack','dessert','shake','emergency','beverage'));
