-- The delivery function stamps product identity.
-- Spec: docs/superpowers/specs/2026-08-19-product-identity-design.md
--
-- create_prepared_meal_delivery was already the model citizen: one transaction
-- landing stock, saved food, concepts, links, meal and item. What it never
-- wrote was the reference from the stock to the saved food it had just made —
-- the two halves of the same dish were left to find each other by name. Both
-- branches now carry it: a fresh row is born stamped, and a reused expired row
-- is re-stamped alongside the name it is given.
--
-- Body copied verbatim from 20260814200000 with exactly two edits (the insert
-- column and the reuse-branch update) — transformed mechanically, not retyped.

CREATE OR REPLACE FUNCTION public.create_prepared_meal_delivery(
  p_vendor_id uuid,
  p_use_by date,
  -- [{ "name": "Ruby Rice Bowl", "slot": "lunch", "quantity": 1,
  --    "calories": 650, "protein": 21, "carbs": 65, "fats": 24,
  --    "fiber": 13, "sugars": 9, "saturated_fat": 4.5, "sodium": 620,
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

    -- 2. The saved food — the whole panel now, so a logged portion scales
    --    carbohydrate and sugar the way it already scaled protein.
    SELECT id INTO v_saved_id
    FROM saved_foods
    WHERE user_id = v_user_id
      AND lower(name) = lower(v_name)
      AND coalesce(lower(brand), '') = coalesce(lower(v_vendor_name), '')
    LIMIT 1;
    IF v_saved_id IS NULL THEN
      INSERT INTO saved_foods
        (user_id, name, brand, calories, protein, carbs, fats, fiber_g, sugars,
         saturated_fat_g, sodium_mg, serving_size, image_primary_url)
      VALUES (
        v_user_id, v_name, v_vendor_name,
        (v_meal->>'calories')::integer,
        (v_meal->>'protein')::numeric,
        (v_meal->>'carbs')::numeric,
        (v_meal->>'fats')::numeric,
        (v_meal->>'fiber')::numeric,
        (v_meal->>'sugars')::numeric,
        (v_meal->>'saturated_fat')::numeric,
        (v_meal->>'sodium')::numeric,
        coalesce(nullif(trim(coalesce(v_meal->>'serving_size', '')), ''), '1 meal'),
        v_meal->>'image_url'
      )
      RETURNING id INTO v_saved_id;
    ELSE
      UPDATE saved_foods SET
        calories = coalesce((v_meal->>'calories')::integer, calories),
        protein  = coalesce((v_meal->>'protein')::numeric, protein),
        carbs    = coalesce((v_meal->>'carbs')::numeric, carbs),
        fats     = coalesce((v_meal->>'fats')::numeric, fats),
        fiber_g  = coalesce((v_meal->>'fiber')::numeric, fiber_g),
        sugars   = coalesce((v_meal->>'sugars')::numeric, sugars),
        saturated_fat_g = coalesce((v_meal->>'saturated_fat')::numeric, saturated_fat_g),
        sodium_mg       = coalesce((v_meal->>'sodium')::numeric, sodium_mg),
        serving_size = coalesce(nullif(trim(coalesce(v_meal->>'serving_size', '')), ''), serving_size),
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
        -- Identity (2026-08-19 spec): this stock is a package of the saved
        -- food created/reused a few statements up. The one creation path that
        -- was already atomic now also carries the reference.
        saved_food_id,
        calories, protein, carbs, fats, fiber_g, sugars,
        saturated_fat_g, sodium_mg, serving_size, expiration_date,
        image_primary_url, preferred_vendor_id
      ) VALUES (
        v_user_id, v_name, v_vendor_name, v_qty, 'count', 'single-location', 'fridge',
        0, true, true,
        v_saved_id,
        (v_meal->>'calories')::integer,
        (v_meal->>'protein')::numeric,
        (v_meal->>'carbs')::numeric,
        (v_meal->>'fats')::numeric,
        (v_meal->>'fiber')::numeric,
        (v_meal->>'sugars')::numeric,
        (v_meal->>'saturated_fat')::numeric,
        (v_meal->>'sodium')::numeric,
        coalesce(nullif(trim(coalesce(v_meal->>'serving_size', '')), ''), '1 meal'),
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
        saved_food_id   = v_saved_id,
        brand           = coalesce(v_vendor_name, brand),
        quantity        = v_qty,
        expiration_date = p_use_by,
        calories = coalesce((v_meal->>'calories')::integer, calories),
        protein  = coalesce((v_meal->>'protein')::numeric, protein),
        carbs    = coalesce((v_meal->>'carbs')::numeric, carbs),
        fats     = coalesce((v_meal->>'fats')::numeric, fats),
        fiber_g  = coalesce((v_meal->>'fiber')::numeric, fiber_g),
        sugars   = coalesce((v_meal->>'sugars')::numeric, sugars),
        saturated_fat_g = coalesce((v_meal->>'saturated_fat')::numeric, saturated_fat_g),
        sodium_mg       = coalesce((v_meal->>'sodium')::numeric, sodium_mg),
        serving_size = coalesce(nullif(trim(coalesce(v_meal->>'serving_size', '')), ''), serving_size),
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
