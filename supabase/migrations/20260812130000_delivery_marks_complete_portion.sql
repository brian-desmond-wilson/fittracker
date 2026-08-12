-- The delivery writer learns about `meals.is_complete_portion`. 2026-08-12.
--
-- Replaces the body of `create_prepared_meal_delivery` (20260812110000) so new
-- deliveries set the flag 20260812120000 added; that migration backfilled the
-- deliveries already written. Everything else about the function is unchanged
-- and reproduced verbatim — a function body cannot be patched in place, so the
-- whole thing is restated here rather than the earlier file being edited,
-- which would have left this database and a freshly-built one running
-- different code under the same version number.
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

    -- 3. The stock itself. Always a NEW row.
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
    --    food — it would break meal-log resolution.
    INSERT INTO food_concept_links (user_id, concept_id, saved_food_id, matched_by)
    VALUES (v_user_id, v_concept_id, v_saved_id, 'user')
    ON CONFLICT (concept_id, saved_food_id) DO NOTHING;

    INSERT INTO food_concept_links (user_id, concept_id, food_inventory_id, matched_by)
    VALUES (v_user_id, v_concept_id, v_item_id, 'user')
    ON CONFLICT (concept_id, food_inventory_id) DO NOTHING;

    INSERT INTO food_concept_links (user_id, concept_id, food_inventory_id, matched_by)
    VALUES (v_user_id, v_shared_id, v_item_id, 'user')
    ON CONFLICT (concept_id, food_inventory_id) DO NOTHING;

    -- 6. The meal. One item, zero prep, and — new here — flagged as a
    --    finished portion so the calorie ladder stops judging a complete
    --    440-kcal breakfast as an assembly that stopped short.
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
