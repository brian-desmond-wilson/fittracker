-- Saturated fat and sodium, 2026-08-14.
--
-- Two rows a printed panel always carries and this app could not hold. Sodium
-- was half-built: `saved_foods` and `meal_logs` have carried `sodium_mg` since
-- the Tier 1 meals work, and the daily card has a bar for it — but the food
-- itself had nowhere to put the figure, so the bar only ever filled from meals
-- typed by hand. Saturated fat existed nowhere at all, while the Nutrition
-- Facts card printed it in its "not recorded here" apology.
--
-- The units follow the panel, not convenience: fat in grams, sodium in
-- milligrams, both NUMERIC(6,2) so a value copied between the three tables
-- cannot round on the way.
--
-- Additive only. New nullable columns, plus a restatement of the delivery view
-- and writer that carry the two fields through from a delivered lid.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.food_inventory
  ADD COLUMN IF NOT EXISTS saturated_fat_g NUMERIC(6,2) CHECK (saturated_fat_g >= 0),
  ADD COLUMN IF NOT EXISTS sodium_mg       NUMERIC(6,2) CHECK (sodium_mg >= 0);

COMMENT ON COLUMN public.food_inventory.saturated_fat_g IS
  'Grams of saturated fat per serving, as printed. Feeds the Nutrition Facts panel; daily totals come from saved_foods via meal logs.';
COMMENT ON COLUMN public.food_inventory.sodium_mg IS
  'Milligrams of sodium per serving, as printed. Feeds the Nutrition Facts panel; daily totals come from saved_foods via meal logs.';

ALTER TABLE public.saved_foods
  ADD COLUMN IF NOT EXISTS saturated_fat_g NUMERIC(6,2) CHECK (saturated_fat_g >= 0);

COMMENT ON COLUMN public.saved_foods.saturated_fat_g IS
  'Grams of saturated fat per serving. The sibling of the existing sodium_mg column.';

-- No CHECK here, matching the sodium_mg and fiber_g columns beside it: a meal
-- log is scaled arithmetic over a saved food, and the constraint belongs on
-- the source of the figure rather than on every multiple of it.
ALTER TABLE public.meal_logs
  ADD COLUMN IF NOT EXISTS saturated_fat_g NUMERIC(6,2);

COMMENT ON COLUMN public.meal_logs.saturated_fat_g IS
  'Grams of saturated fat in this logged portion, scaled by servings like every other macro here.';

-- The daily card can only draw a bar against a target. Sodium already had
-- one; this is its pair.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS target_saturated_fat_g INTEGER
    CHECK (target_saturated_fat_g IS NULL OR target_saturated_fat_g > 0);

COMMENT ON COLUMN public.profiles.target_saturated_fat_g IS
  'Daily saturated fat target in grams. Null means the user has not set one, and the card draws no bar.';

-- ---------------------------------------------------------------------------
-- 2. The delivery view and writer
-- ---------------------------------------------------------------------------
--
-- Both are restated in full from 20260813140000 with the two fields threaded
-- through — a view column list and a function body cannot be patched in place,
-- and editing the earlier file would leave this database and a freshly-built
-- one running different code under the same version number.
--
-- A delivered lid prints saturated fat and sodium as readily as it prints
-- fiber, so the menu JSON gains `saturated_fat` and `sodium` keys and both
-- travel the same path: into the saved food, into the stock row, and back out
-- through the history view that pre-fills the next delivery.

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
    fi.saturated_fat_g,
    fi.sodium_mg,
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
    calories, protein, fiber_g, saturated_fat_g, sodium_mg, serving_size, image_primary_url, delivered_on
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
  v.last_delivered_on                     AS vendor_last_delivered_on,
  -- Appended, not slotted in beside fiber where they belong by meaning:
  -- CREATE OR REPLACE VIEW can only add columns at the END of the list, and
  -- inserting them mid-list renames every column after them.
  l.saturated_fat_g,
  l.sodium_mg
FROM latest l
JOIN vendor_totals v
  ON v.user_id = l.user_id AND v.vendor_id = l.vendor_id
LEFT JOIN public.meals m
  ON m.user_id = l.user_id AND m.slug = l.slug;

-- Without this the view runs as its owner and every user sees every user's
-- deliveries. Same fix 20251031000001 applied to the inventory views.
ALTER VIEW public.prepared_meal_delivery_history SET (security_invoker = true);

GRANT SELECT ON public.prepared_meal_delivery_history TO authenticated;

CREATE OR REPLACE FUNCTION public.create_prepared_meal_delivery(
  p_vendor_id uuid,
  p_use_by date,
  -- [{ "name": "Ruby Rice Bowl", "slot": "lunch", "quantity": 1,
  --    "calories": 650, "protein": 21, "fiber": 13,
  --    "saturated_fat": 4.5, "sodium": 620,
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
        (user_id, name, brand, calories, protein, fiber_g, saturated_fat_g, sodium_mg,
         serving_size, image_primary_url)
      VALUES (
        v_user_id, v_name, v_vendor_name,
        (v_meal->>'calories')::integer,
        (v_meal->>'protein')::numeric,
        (v_meal->>'fiber')::numeric,
        (v_meal->>'saturated_fat')::numeric,
        (v_meal->>'sodium')::numeric,
        coalesce(v_meal->>'serving_size', '1 meal'),
        v_meal->>'image_url'
      )
      RETURNING id INTO v_saved_id;
    ELSE
      UPDATE saved_foods SET
        calories = coalesce((v_meal->>'calories')::integer, calories),
        protein  = coalesce((v_meal->>'protein')::numeric, protein),
        fiber_g  = coalesce((v_meal->>'fiber')::numeric, fiber_g),
        saturated_fat_g = coalesce((v_meal->>'saturated_fat')::numeric, saturated_fat_g),
        sodium_mg       = coalesce((v_meal->>'sodium')::numeric, sodium_mg),
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
        calories, protein, fiber_g, saturated_fat_g, sodium_mg, serving_size, expiration_date,
        image_primary_url, preferred_vendor_id
      ) VALUES (
        v_user_id, v_name, v_vendor_name, v_qty, 'count', 'single-location', 'fridge',
        0, true, true,
        (v_meal->>'calories')::integer,
        (v_meal->>'protein')::numeric,
        (v_meal->>'fiber')::numeric,
        (v_meal->>'saturated_fat')::numeric,
        (v_meal->>'sodium')::numeric,
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
        saturated_fat_g = coalesce((v_meal->>'saturated_fat')::numeric, saturated_fat_g),
        sodium_mg       = coalesce((v_meal->>'sodium')::numeric, sodium_mg),
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
