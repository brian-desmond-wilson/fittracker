-- Meals that arrive already portioned. 2026-08-12.
--
-- The Brian Score's calorie component asks "is this a substantial meal", and
-- its ladder is calibrated for meals you ASSEMBLE: at 440 kcal a plate you
-- built yourself really is a partial meal, because you could have put more on
-- it. Full points start at 500.
--
-- A delivered ready-to-eat meal is not that. Its portion was decided by
-- whoever made it and cannot be topped up, so scoring a complete 440-kcal
-- breakfast as 70% of a meal is a category error rather than a judgement — and
-- the same 500 gates the "Brian Approved" badge, which is how every prepared
-- breakfast in the library ended up disqualified for its size.
--
-- This flag says "sold as one whole meal", which is orthogonal to `role`
-- (when you eat it) and to `category`. Additive, defaults false, so every
-- existing meal keeps exactly the score it had.
ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS is_complete_portion BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.meals.is_complete_portion IS
  'True when the meal is sold as one finished portion (a delivered meal), so its calorie band is judged as a whole meal rather than as an assembly you could add to.';

-- Backfill the meals the delivery flow has already written. They are exactly
-- the one-item meals whose single saved food carries a vendor brand and whose
-- inventory rows are scheduled supply — but that join is fragile, so key off
-- the marker the flow itself leaves: a zero-prep meal linked to the shared
-- "Prepared Meal" concept through its inventory rows.
UPDATE public.meals m
SET is_complete_portion = true
WHERE m.prep_minutes = 0
  AND EXISTS (
    SELECT 1
    FROM public.meal_items mi
    JOIN public.food_concept_links sfl ON sfl.saved_food_id = mi.saved_food_id
    JOIN public.food_concepts c ON c.id = sfl.concept_id
    WHERE mi.meal_id = m.id
      AND c.user_id = m.user_id
      AND c.slug LIKE 'meal-%'
  );
