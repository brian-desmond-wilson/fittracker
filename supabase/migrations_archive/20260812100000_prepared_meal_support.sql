-- Pre-made meal support (Thistle and anything like it), 2026-08-12.
--
-- A delivered ready-to-eat meal is a different animal from a jar of peanut
-- butter, and three of the differences are structural:
--
--   1. It prints fiber on the box. `food_inventory` carried five nutrition
--      fields and no fiber, even though the Nutrition Facts panel already
--      defines a dietary-fiber daily value and `saved_foods` / `meal_logs`
--      both carry the column. The panel had nothing to feed that row.
--   2. It arrives on a schedule. You never reorder one because you are low,
--      so every restock signal the app can raise about it is a false one.
--      `is_scheduled_supply` is what the demand engine reads to stay quiet.
--   3. It is a MEAL, not an ingredient — and the specific dish rotates every
--      week. A shared "Prepared Meal" concept gives the loop something stable
--      to accumulate history against ("~8 prepared meals a week") while the
--      individual rows churn.
--
-- Additive only: three ADD COLUMN IF NOT EXISTS / INSERT … ON CONFLICT DO
-- NOTHING statements. Nothing is dropped, rewritten or backfilled over.

-- 1. Fiber on inventory items -----------------------------------------------
-- NUMERIC(6,2) matches saved_foods.fiber_g exactly, so a value copied from an
-- inventory row into the saved food a meal points at cannot round on the way.
ALTER TABLE public.food_inventory
  ADD COLUMN IF NOT EXISTS fiber_g NUMERIC(6,2) CHECK (fiber_g >= 0);

COMMENT ON COLUMN public.food_inventory.fiber_g IS
  'Grams of dietary fiber per serving. Feeds the Nutrition Facts panel; daily totals still come from saved_foods via meal logs.';

-- 2. "Arrives on a schedule" ------------------------------------------------
-- NOT NULL DEFAULT false: every existing row is a normal grocery item, and
-- the demand engine must never have to reason about a null here.
ALTER TABLE public.food_inventory
  ADD COLUMN IF NOT EXISTS is_scheduled_supply BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.food_inventory.is_scheduled_supply IS
  'True when stock is resupplied on a delivery cadence rather than bought when low. Suppresses out/low/forecast shopping suggestions and run-out estimates.';

-- 3. A home for fresh prepared breakfasts -----------------------------------
-- "Deli & Prepared Foods" already covers prepared entrees, deli salads,
-- sandwiches and soups, but stops short of breakfast — so a smoothie or an
-- overnight-muesli cup had nowhere to go but "Breakfast Foods", which is
-- shelf-stable cereal territory and carries a 90-day expiry grace. Filing a
-- five-day perishable there would silently disable its expiry warnings.
INSERT INTO public.food_subcategories (category_id, name, slug, display_order)
SELECT id, 'Fresh Prepared Breakfast', 'fresh-prepared-breakfast', 9
FROM public.food_categories
WHERE slug = 'deli-prepared'
ON CONFLICT (category_id, slug) DO NOTHING;

-- 4. The shared concept -----------------------------------------------------
-- Per-item consumption history is worthless for these: the menu rotates, so
-- no single dish is ever seen often enough to estimate a rate. The concept is
-- the level that stays stable. Rating 'like' rather than 'love' so it never
-- outranks a genuinely preferred concept in the recommender; the owner can
-- change it in the app.
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users row found — cannot seed the prepared-meal concept.';
  END IF;

  INSERT INTO public.food_concepts
    (user_id, name, slug, rating, requires_small_pieces, prep_intensive, notes)
  VALUES (
    v_user_id,
    'Prepared Meal',
    'prepared-meal',
    'like',
    false,
    false,
    'Delivered ready-to-eat meals. Shared by every such item so the loop can learn a cadence even though the specific dishes rotate.'
  )
  ON CONFLICT (user_id, slug) DO NOTHING;
END $$;
