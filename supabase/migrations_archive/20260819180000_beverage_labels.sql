-- The beverage label moves onto the product, 2026-08-19.
--
-- The Beverage door filtered by history: a saved food counted as a drink only
-- after it had been logged as one, which is circular — you cannot pick a drink
-- from search until you have logged it, and search is the normal way to log
-- it. A brand-new Huel was invisible in the one door built for it.
--
-- Taxonomy replaces history. `saved_foods.beverage_kinds` says what a product
-- IS: null is food, a non-empty array is a drink of those kinds. The same
-- column `meals` already carries, with the same shape and the same check, so a
-- drink is described identically whether it lives as a product or as a library
-- entry.
--
-- One new kind joins the list everywhere: `meal_replacement_shake` — a Huel,
-- a Soylent — the drink that is honestly both. It is what earns a beverage a
-- place in MEAL search (soda and energy drinks stay behind the Beverage door),
-- and it defaults the counts-as-meal switch on.

-- 1. The new kind, in every existing check --------------------------------

ALTER TABLE public.meal_logs DROP CONSTRAINT IF EXISTS meal_logs_beverage_kinds_check;
ALTER TABLE public.meal_logs
  ADD CONSTRAINT meal_logs_beverage_kinds_check CHECK (
    beverage_kinds IS NULL
    OR (
      meal_type = 'beverage'
      AND array_length(beverage_kinds, 1) >= 1
      AND beverage_kinds <@ ARRAY[
        'protein_shake','meal_replacement_shake','weight_gain_shake',
        'smoothie','energy_drink','other'
      ]::text[]
    )
  );

ALTER TABLE public.meals DROP CONSTRAINT IF EXISTS meals_beverage_kinds_check;
ALTER TABLE public.meals
  ADD CONSTRAINT meals_beverage_kinds_check CHECK (
    beverage_kinds IS NULL
    OR (
      array_length(beverage_kinds, 1) >= 1
      AND beverage_kinds <@ ARRAY[
        'protein_shake','meal_replacement_shake','weight_gain_shake',
        'smoothie','energy_drink','other'
      ]::text[]
    )
  );

-- 2. The label on the product ---------------------------------------------

ALTER TABLE public.saved_foods ADD COLUMN IF NOT EXISTS beverage_kinds text[];

ALTER TABLE public.saved_foods DROP CONSTRAINT IF EXISTS saved_foods_beverage_kinds_check;
ALTER TABLE public.saved_foods
  ADD CONSTRAINT saved_foods_beverage_kinds_check CHECK (
    beverage_kinds IS NULL
    OR (
      array_length(beverage_kinds, 1) >= 1
      AND beverage_kinds <@ ARRAY[
        'protein_shake','meal_replacement_shake','weight_gain_shake',
        'smoothie','energy_drink','other'
      ]::text[]
    )
  );

COMMENT ON COLUMN public.saved_foods.beverage_kinds IS
  'What the product is when it is a drink. NULL = food. Drives which log door offers it: any kind = the Beverage door; meal_replacement_shake additionally = meal search.';

-- 3. Backfill: label the drinks already in the library --------------------
--
-- By name, matched case-insensitively and exactly, because this database is
-- not rebuildable from the repo and these are its actual rows (dumped
-- 2026-08-19). A name that has since been edited simply stays unlabeled — the
-- correction modal can tag it — so no match is an acceptable miss, never an
-- error. Everything not named here is food and stays NULL.

UPDATE public.saved_foods SET beverage_kinds = ARRAY['energy_drink']
  WHERE lower(name) IN ('the yellow edition energy drink', 'red bull the blue edition');

UPDATE public.saved_foods SET beverage_kinds = ARRAY['meal_replacement_shake','protein_shake']
  WHERE lower(name) = 'huel black edition';

UPDATE public.saved_foods SET beverage_kinds = ARRAY['protein_shake']
  WHERE lower(name) IN (
    'strawberry protein shake',           -- Huel
    'mixed berry vanilla protein shake',  -- Chobani
    'strawberries & cream (30g)'          -- Chobani's high-protein drink line
  );

UPDATE public.saved_foods SET beverage_kinds = ARRAY['weight_gain_shake']
  WHERE lower(name) IN (
    'creamy strawberry nutritional drink',  -- Boost
    'boost very high calorie',
    'nuts about bulking'                    -- the homemade bulking shake
  );

UPDATE public.saved_foods SET beverage_kinds = ARRAY['smoothie']
  WHERE lower(name) IN (
    'chunky monkey smoothie', 'almond dream smoothie', 'tahini-java smoothie'
  );

-- Drinkable breakfast shakes — "just add mylk" and it replaces the meal.
UPDATE public.saved_foods SET beverage_kinds = ARRAY['meal_replacement_shake']
  WHERE lower(name) IN ('oats over night', 'oats overnight carrot cake');

-- Water, fitness water, milk: drinks with no better kind than 'other'. Milk
-- is an ingredient too, but the meal BUILDER is unaffected by the label —
-- only the quick-log doors read it, and a glass of milk drunk on its own is
-- a beverage by any honest reading.
UPDATE public.saved_foods SET beverage_kinds = ARRAY['other']
  WHERE lower(name) IN (
    'arrowhead water spring', 'propel fitness water',
    'organic milk', 'whole milk (any)'
  );
