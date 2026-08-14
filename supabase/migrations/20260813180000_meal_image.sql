-- A meal gets a picture of its own.
-- Spec: docs/superpowers/specs/2026-08-13-meal-page-redesign-design.md
--
-- Until now a meal's face was borrowed: `mealFaceUrl` picks the photograph of
-- the first ingredient that has one, ranked by display order and calories. That
-- is a good default and stays the fallback — every meal has a face on the day
-- this lands, and nothing changes for meals you never photograph. But a bowl
-- you assembled does not look like a jar of peanut butter, and there was no way
-- to say so.
--
-- Same column name as `food_inventory.image_primary_url` and the same bucket:
-- one upload path, one public-URL shape, one thing to reason about when an
-- image fails to load.
ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS image_primary_url text;
