-- Two things a meal knows about itself that the library needs and the schema
-- never recorded: whether you like it, and where it came from.
--
-- FAVOURITES. Saved foods have had `is_favorite` since the saved-foods work;
-- meals never did, so the library could rank by score and by history but not
-- by the plainest signal there is. It also feeds the recommender as a taste
-- input the Brian score cannot express — "I reach for this" is not the same
-- claim as "this scores well".
--
-- SOURCE. The library has to say where a meal comes from, and availability
-- has to stop applying to meals that were never in the fridge:
--   home      — assembled from your own ingredients (the default, no subtitle)
--   packaged  — a prepared meal you stock, e.g. Thistle. Availability applies,
--               because a Thistle dish IS an inventory row.
--   out       — a restaurant or delivery meal. NEVER available or unavailable:
--               there is nothing to be in stock. Shown with its venue and
--               excluded from the Available segment entirely.
-- `source_name` is the venue or brand as you'd say it — "Thistle",
-- "DoorDash · Chipotle" — and is meaningless for `home`, which is why the
-- check below forbids naming a source you don't have.

ALTER TABLE public.meals
  ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'home'
    CHECK (source_kind IN ('home', 'packaged', 'out')),
  ADD COLUMN source_name TEXT
    CHECK (source_name IS NULL OR char_length(source_name) BETWEEN 1 AND 60);

-- A home-made meal has no source to name; anything else without one would
-- render a subtitle-shaped hole.
ALTER TABLE public.meals
  ADD CONSTRAINT meals_source_name_matches_kind
  CHECK (
    (source_kind = 'home' AND source_name IS NULL)
    OR (source_kind <> 'home' AND source_name IS NOT NULL)
  );

-- Partial index: the favourites shelf is the library's first read, and it is
-- always a small slice of the table.
CREATE INDEX idx_meals_favorite ON public.meals (user_id) WHERE is_favorite;

-- Backfill the prepared meals the delivery flow created. They are recognisable
-- without guessing: `create_prepared_meal_delivery` is the only writer that
-- marks a meal `is_complete_portion` AND links its single saved food to the
-- shared "Prepared Meal" concept, and it stamps the vendor on the inventory
-- row it creates alongside. Meals that match get their vendor's name; nothing
-- else is touched, so a hand-built meal is never mislabelled as packaged.
UPDATE public.meals m
SET source_kind = 'packaged',
    source_name = v.name
FROM public.meal_items mi
JOIN public.food_concept_links fcl ON fcl.saved_food_id = mi.saved_food_id
JOIN public.food_concepts fc ON fc.id = fcl.concept_id
JOIN public.food_inventory fi ON fi.id = fcl.food_inventory_id
JOIN public.nutrition_vendors v ON v.id = fi.preferred_vendor_id
WHERE mi.meal_id = m.id
  AND m.is_complete_portion
  AND fc.name = 'Prepared Meal'
  AND v.name IS NOT NULL;
