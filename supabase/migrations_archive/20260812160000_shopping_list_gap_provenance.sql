-- Where a shopping row came from. 2026-08-12.
--
-- A meal gap reaches the list as a bare NAME. `shopping_list.food_inventory_id`
-- is null for it — correctly, because an unresolved ingredient has no
-- inventory row, which is exactly what makes it missing — and nothing else
-- records why the row exists. So the list shows "Korean BBQ Sauce" with no
-- way back to the meal that wanted it, and buying it cannot close the gap it
-- came from: the new inventory item is linked to no concept, so the meal
-- stays un-makeable and suggests the same thing again next time.
--
-- Two nullable columns carry the provenance the suggestion already knew:
--
--   source_meal_id      which meal wanted it, so the row can say so and link
--                       back. ON DELETE SET NULL — deleting a meal must not
--                       take your shopping list with it.
--   source_saved_food_id  which ingredient it was, which is the handle a
--                       future "link what I bought" step needs to attach the
--                       purchased item to the right concept. ON DELETE SET
--                       NULL for the same reason.
--
-- Both null on every existing row and on anything typed by hand, which stays
-- a perfectly good shopping row — this adds provenance where it exists rather
-- than requiring it.
ALTER TABLE public.shopping_list
  ADD COLUMN IF NOT EXISTS source_meal_id UUID
    REFERENCES public.meals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_saved_food_id UUID
    REFERENCES public.saved_foods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shopping_list_source_meal
  ON public.shopping_list(source_meal_id) WHERE source_meal_id IS NOT NULL;

COMMENT ON COLUMN public.shopping_list.source_meal_id IS
  'The meal whose gap produced this row, when it came from one. Null for manual rows and for stock-driven suggestions.';
COMMENT ON COLUMN public.shopping_list.source_saved_food_id IS
  'The meal ingredient this row stands for. The handle for linking a purchase back to the concept that made the meal un-makeable.';
