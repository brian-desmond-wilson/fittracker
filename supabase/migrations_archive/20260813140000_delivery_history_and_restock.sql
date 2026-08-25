-- What the last delivery knew, and the rule that stops it piling up. 2026-08-13.
--
-- Two things, both about a delivery that is not the first one.
--
-- THE VIEW. A subscription rotates a fixed menu, so the box that arrives on
-- Thursday is mostly dishes that have arrived before. The entry screen had no
-- way to know that: vendors sat in whatever order preferences gave them, and
-- every dish was typed from scratch. Both answers are already in the
-- inventory — delivered rows carry their vendor and their creation date — so
-- this reads them back rather than recording anything new.
--
-- One view at dish grain, carrying its vendor's totals alongside as window
-- aggregates. The screen loads it once and both uses are filters over rows it
-- already has: group by vendor to order the tiles, filter by vendor to list
-- the dishes.
--
-- THE RESTOCK RULE. The writer has always inserted a fresh inventory row per
-- dish, because last week's leftover portion carries an earlier use-by date
-- and merging would hide old food behind a fresh one. True, but it means a
-- dish that comes round every three weeks leaves a trail of empty rows with
-- its name on them.
--
-- The rule now: a row for the same dish and vendor that is EMPTY or PAST ITS
-- DATE is restocked in place — new quantity, new date, refreshed macros. A row
-- with live, unexpired stock is never touched, so a dish delivered twice in
-- one week still produces two rows with two honest dates.
--
-- The restock SETS the quantity rather than adding to it: an expired portion
-- has been thrown out, and carrying its count forward under a fresh date would
-- inflate the fridge with food that is not in it.

-- ---------------------------------------------------------------------------
-- The view
-- ---------------------------------------------------------------------------

-- A delivered row is one linked to the shared "prepared-meal" concept — the
-- marker the writer puts on the inventory side of every dish it creates. That
-- is a narrower test than is_scheduled_supply, which an ordinary hand-entered
-- subscription item would also pass.
CREATE OR REPLACE VIEW public.prepared_meal_delivery_history AS
WITH delivered AS (
  SELECT
    fi.user_id,
    fi.preferred_vendor_id                   AS vendor_id,
    fi.name,
    public.prepared_meal_slug(fi.name)       AS slug,
    fi.calories,
    fi.protein,
    fi.fiber_g,
    fi.serving_size,
    fi.image_primary_url,
    fi.created_at,
    -- A delivery is a batch written in one go, so its date is the day the
    -- rows were created. Two boxes on one day count as one; that is rare and
    -- the wrong answer is off by one on an ordering key.
    fi.created_at::date                      AS delivered_on
  FROM public.food_inventory fi
  WHERE fi.preferred_vendor_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.food_concept_links fcl
      JOIN public.food_concepts fc ON fc.id = fcl.concept_id
      WHERE fcl.food_inventory_id = fi.id
        AND fc.user_id = fi.user_id
        AND fc.slug = 'prepared-meal'
    )
),
vendor_totals AS (
  SELECT
    user_id,
    vendor_id,
    count(DISTINCT delivered_on) AS delivery_count,
    max(delivered_on)            AS last_delivered_on
  FROM delivered
  GROUP BY user_id, vendor_id
),
-- The newest sighting of each dish: its macros as most recently delivered,
-- not as first delivered, because a vendor that reformulates prints the new
-- numbers on the new lid.
latest AS (
  SELECT DISTINCT ON (user_id, vendor_id, slug)
    user_id, vendor_id, slug, name,
    calories, protein, fiber_g, serving_size, image_primary_url, delivered_on
  FROM delivered
  ORDER BY user_id, vendor_id, slug, created_at DESC
)
SELECT
  l.user_id,
  l.vendor_id,
  l.slug,
  l.name,
  -- The slot lives on the meal the writer created for the dish, keyed by the
  -- same slug. A dish whose meal has since been deleted falls back to lunch,
  -- the same default a blank row starts at.
  COALESCE(m.default_meal_type, 'lunch')  AS slot,
  l.calories,
  l.protein,
  l.fiber_g,
  l.serving_size,
  l.image_primary_url,
  l.delivered_on                          AS last_delivered_on,
  v.delivery_count                        AS vendor_delivery_count,
  v.last_delivered_on                     AS vendor_last_delivered_on
FROM latest l
JOIN vendor_totals v
  ON v.user_id = l.user_id AND v.vendor_id = l.vendor_id
LEFT JOIN public.meals m
  ON m.user_id = l.user_id AND m.slug = l.slug;

-- Without this the view runs as its owner and every user sees every user's
-- deliveries. Same fix 20251031000001 applied to the inventory views.
ALTER VIEW public.prepared_meal_delivery_history SET (security_invoker = true);

GRANT SELECT ON public.prepared_meal_delivery_history TO authenticated;

-- ---------------------------------------------------------------------------
-- The writer, with the restock rule
-- ---------------------------------------------------------------------------
--
-- Replaces the body from 20260812130000. A function body cannot be patched in
-- place, so the whole thing is restated here rather than the earlier file
-- being edited — editing it would leave this database and a freshly-built one
-- running different code under the same version number.
--
-- WHY THE PER-DISH CONCEPT GOES ON THE SAVED FOOD AND THE SHARED ONE DOES
-- NOT: meal logging resolves a saved food to the inventory row it should
-- decrement by looking for rows sharing ANY of its concepts, picking the
-- soonest to expire. If the saved food carried the shared concept, eating
-- Monday's rice bowl would decrement whichever prepared meal in the fridge
-- expired first — possibly the smoothie. The shared concept therefore lives
-- only on the inventory side, where it groups stock without ever standing in
-- as an identity.

CREATE OR REPLACE FUNCTION public.create_prepared_meal_delivery(
  p_vendor_id uuid,
  p_use_by date,
  -- [{ "name": "Ruby Rice Bowl", "slot": "lunch", "quantity": 1,
  --    "calories": 650, "protein": 21, "fiber": 13,
  --    "serving_size": "1 bowl", "image_url": null }]
  p_meals jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_vendor_name  text;
  v_category_id  uuid;
  v_sub_entree   uuid;
  v_sub_break    uuid;
  v_shared_id    uuid;
  v_meal         jsonb;
  v_name         text;
  v_slot         text;
  v_slug         text;
  v_qty          integer;
  v_concept_id   uuid;
  v_saved_id     uuid;
  v_item_id      uuid;
  v_meal_id      uuid;
  v_sub_id       uuid;
  v_loc_id       uuid;
  v_count        integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_meals IS NULL OR jsonb_typeof(p_meals) <> 'array' THEN
    RAISE EXCEPTION 'p_meals must be a JSON array';
  END IF;

  SELECT name INTO v_vendor_name
  FROM nutrition_vendors WHERE id = p_vendor_id AND user_id = v_user_id;

  SELECT id INTO v_category_id FROM food_categories WHERE slug = 'deli-prepared';
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'the Deli & Prepared Foods category is missing';
  END IF;
  SELECT id INTO v_sub_entree FROM food_subcategories
   WHERE category_id = v_category_id AND slug = 'fresh-prepared-entrees';
  SELECT id INTO v_sub_break FROM food_subcategories
   WHERE category_id = v_category_id AND slug = 'fresh-prepared-breakfast';

  SELECT id INTO v_shared_id
  FROM food_concepts WHERE user_id = v_user_id AND slug = 'prepared-meal';
  IF v_shared_id IS NULL THEN
    INSERT INTO food_concepts (user_id, name, slug, rating)
    VALUES (v_user_id, 'Prepared Meal', 'prepared-meal', 'like')
    RETURNING id INTO v_shared_id;
  END IF;

  FOR v_meal IN SELECT * FROM jsonb_array_elements(p_meals)
  LOOP
    v_name := trim(coalesce(v_meal->>'name', ''));
    CONTINUE WHEN v_name = '';
    v_slug := prepared_meal_slug(v_name);
    CONTINUE WHEN v_slug = '';
    v_slot := coalesce(v_meal->>'slot', 'lunch');
    IF v_slot NOT IN ('breakfast','lunch','dinner','snack','dessert') THEN
      v_slot := 'lunch';
    END IF;
    v_qty := greatest(1, coalesce((v_meal->>'quantity')::integer, 1));

    -- 1. The per-dish concept.
    SELECT id INTO v_concept_id
    FROM food_concepts WHERE user_id = v_user_id AND slug = 'meal-' || v_slug;
    IF v_concept_id IS NULL THEN
      INSERT INTO food_concepts (user_id, name, slug, rating, notes)
      VALUES (v_user_id, v_name, 'meal-' || v_slug, 'like',
              'Prepared meal' || coalesce(' from ' || v_vendor_name, '') || '.')
      RETURNING id INTO v_concept_id;
    END IF;

    -- 2. The saved food.
    SELECT id INTO v_saved_id
    FROM saved_foods
    WHERE user_id = v_user_id
      AND lower(name) = lower(v_name)
      AND coalesce(lower(brand), '') = coalesce(lower(v_vendor_name), '')
    LIMIT 1;
    IF v_saved_id IS NULL THEN
      INSERT INTO saved_foods
        (user_id, name, brand, calories, protein, fiber_g, serving_size, image_primary_url)
      VALUES (
        v_user_id, v_name, v_vendor_name,
        (v_meal->>'calories')::integer,
        (v_meal->>'protein')::numeric,
        (v_meal->>'fiber')::numeric,
        coalesce(v_meal->>'serving_size', '1 meal'),
        v_meal->>'image_url'
      )
      RETURNING id INTO v_saved_id;
    ELSE
      UPDATE saved_foods SET
        calories = coalesce((v_meal->>'calories')::integer, calories),
        protein  = coalesce((v_meal->>'protein')::numeric, protein),
        fiber_g  = coalesce((v_meal->>'fiber')::numeric, fiber_g),
        image_primary_url = coalesce(v_meal->>'image_url', image_primary_url),
        updated_at = now()
      WHERE id = v_saved_id;
    END IF;

    -- 3. The stock. A row for this dish from this vendor that is EMPTY or
    --    PAST ITS DATE is dead stock wearing the dish's name; restock it
    --    rather than adding a second row beside it. Anything with live,
    --    unexpired quantity is left alone — see the header.
    --
    --    Ordered by date descending so the candidate chosen is the one
    --    closest to still being food: an empty but in-date row first, then
    --    the most recently expired.
    v_item_id := NULL;
    SELECT fi.id INTO v_item_id
    FROM food_inventory fi
    WHERE fi.user_id = v_user_id
      AND fi.preferred_vendor_id = p_vendor_id
      AND prepared_meal_slug(fi.name) = v_slug
      AND (
        fi.quantity <= 0
        OR (fi.expiration_date IS NOT NULL AND fi.expiration_date < current_date)
      )
    ORDER BY fi.expiration_date DESC NULLS LAST, fi.created_at DESC
    LIMIT 1;

    IF v_item_id IS NULL THEN
      INSERT INTO food_inventory (
        user_id, name, brand, quantity, unit, storage_type, location,
        restock_threshold, requires_refrigeration, is_scheduled_supply,
        calories, protein, fiber_g, serving_size, expiration_date,
        image_primary_url, preferred_vendor_id
      ) VALUES (
        v_user_id, v_name, v_vendor_name, v_qty, 'count', 'single-location', 'fridge',
        0, true, true,
        (v_meal->>'calories')::integer,
        (v_meal->>'protein')::numeric,
        (v_meal->>'fiber')::numeric,
        coalesce(v_meal->>'serving_size', '1 meal'),
        p_use_by,
        v_meal->>'image_url',
        p_vendor_id
      )
      RETURNING id INTO v_item_id;

      INSERT INTO food_inventory_locations
        (food_inventory_id, user_id, location, quantity, is_ready_to_consume)
      VALUES (v_item_id, v_user_id, 'fridge', v_qty, true);
    ELSE
      -- SET, never add: whatever was in the expired row is in the bin.
      -- The name is rewritten because two spellings that slug the same are
      -- the same dish, and the newer one is what the box says today.
      UPDATE food_inventory SET
        name            = v_name,
        brand           = coalesce(v_vendor_name, brand),
        quantity        = v_qty,
        expiration_date = p_use_by,
        calories = coalesce((v_meal->>'calories')::integer, calories),
        protein  = coalesce((v_meal->>'protein')::numeric, protein),
        fiber_g  = coalesce((v_meal->>'fiber')::numeric, fiber_g),
        serving_size = coalesce(v_meal->>'serving_size', serving_size),
        image_primary_url = coalesce(v_meal->>'image_url', image_primary_url),
        is_scheduled_supply = true,
        updated_at = now()
      WHERE id = v_item_id;

      -- The fridge line carries the count the grid reads. Other locations on
      -- a restocked row would be stale by the same argument as the quantity,
      -- so they are zeroed rather than left to imply a freezer stash that was
      -- eaten weeks ago.
      SELECT id INTO v_loc_id
      FROM food_inventory_locations
      WHERE food_inventory_id = v_item_id AND location = 'fridge';

      IF v_loc_id IS NULL THEN
        INSERT INTO food_inventory_locations
          (food_inventory_id, user_id, location, quantity, is_ready_to_consume)
        VALUES (v_item_id, v_user_id, 'fridge', v_qty, true);
      ELSE
        UPDATE food_inventory_locations
        SET quantity = v_qty, is_ready_to_consume = true, updated_at = now()
        WHERE id = v_loc_id;
      END IF;

      UPDATE food_inventory_locations
      SET quantity = 0, updated_at = now()
      WHERE food_inventory_id = v_item_id
        AND location <> 'fridge'
        AND quantity <> 0;
    END IF;

    -- 4. Filed as prepared food, for the five-day perishable grace.
    INSERT INTO food_inventory_category_map (food_inventory_id, category_id, user_id)
    VALUES (v_item_id, v_category_id, v_user_id)
    ON CONFLICT (food_inventory_id, category_id) DO NOTHING;

    v_sub_id := CASE WHEN v_slot = 'breakfast' THEN v_sub_break ELSE v_sub_entree END;
    IF v_sub_id IS NOT NULL THEN
      INSERT INTO food_inventory_subcategory_map (food_inventory_id, subcategory_id, user_id)
      VALUES (v_item_id, v_sub_id, v_user_id)
      ON CONFLICT (food_inventory_id, subcategory_id) DO NOTHING;
    END IF;

    -- 5. Links. See the header before adding the shared concept to the saved
    --    food — it would break meal-log resolution. All three are idempotent,
    --    which is what lets a restocked row reuse the ones it already has.
    INSERT INTO food_concept_links (user_id, concept_id, saved_food_id, matched_by)
    VALUES (v_user_id, v_concept_id, v_saved_id, 'user')
    ON CONFLICT (concept_id, saved_food_id) DO NOTHING;

    INSERT INTO food_concept_links (user_id, concept_id, food_inventory_id, matched_by)
    VALUES (v_user_id, v_concept_id, v_item_id, 'user')
    ON CONFLICT (concept_id, food_inventory_id) DO NOTHING;

    INSERT INTO food_concept_links (user_id, concept_id, food_inventory_id, matched_by)
    VALUES (v_user_id, v_shared_id, v_item_id, 'user')
    ON CONFLICT (concept_id, food_inventory_id) DO NOTHING;

    -- 6. The meal. One item, zero prep, flagged as a finished portion so the
    --    calorie ladder stops judging a complete 440-kcal breakfast as an
    --    assembly that stopped short.
    SELECT id INTO v_meal_id FROM meals WHERE user_id = v_user_id AND slug = v_slug;
    IF v_meal_id IS NULL THEN
      INSERT INTO meals (
        user_id, name, slug, category, default_meal_type, prep_minutes,
        is_complete_portion, notes
      )
      VALUES (
        v_user_id, v_name, v_slug,
        CASE WHEN v_slot = 'dessert' THEN 'snack' ELSE v_slot END,
        v_slot, 0, true,
        'Delivered ready to eat' || coalesce(' by ' || v_vendor_name, '') || '.'
      )
      RETURNING id INTO v_meal_id;
    ELSE
      -- A dish re-filed under a different slot should say so next time the
      -- recents list reads it back; nothing else about the meal is touched.
      UPDATE meals SET default_meal_type = v_slot, updated_at = now()
      WHERE id = v_meal_id AND default_meal_type IS DISTINCT FROM v_slot;
    END IF;

    INSERT INTO meal_items (user_id, meal_id, saved_food_id, servings, display_order)
    VALUES (v_user_id, v_meal_id, v_saved_id, 1, 0)
    ON CONFLICT (meal_id, saved_food_id) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.create_prepared_meal_delivery(uuid, date, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_prepared_meal_delivery(uuid, date, jsonb) TO authenticated;
