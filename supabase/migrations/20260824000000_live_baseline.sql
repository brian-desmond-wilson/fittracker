


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."auth_is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  begin
    return exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    );
  end;
  $$;


ALTER FUNCTION "public"."auth_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_inventory_units"("p_inventory_ids" "uuid"[]) RETURNS TABLE("inventory_id" "uuid", "consumed" integer)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
  v_loc_id uuid;
  v_count integer;
begin
  foreach v_id in array p_inventory_ids loop
    v_loc_id := null;
    v_count := 0;

    if exists (select 1 from public.food_inventory_locations l
               where l.food_inventory_id = v_id) then
      select l.id into v_loc_id
      from public.food_inventory_locations l
      where l.food_inventory_id = v_id
        and l.quantity > 0
      order by l.is_ready_to_consume desc, l.quantity desc
      limit 1
      for update;

      if v_loc_id is not null then
        update public.food_inventory_locations
           set quantity = quantity - 1
         where id = v_loc_id;
        v_count := 1;

        update public.food_inventory fi
           set quantity = coalesce((
                 select sum(l2.quantity)
                 from public.food_inventory_locations l2
                 where l2.food_inventory_id = v_id), 0)
         where fi.id = v_id;
      end if;
    else
      update public.food_inventory fi
         set quantity = fi.quantity - 1
       where fi.id = v_id
         and fi.quantity > 0;
      get diagnostics v_count = row_count;
    end if;

    inventory_id := v_id;
    consumed := v_count;
    return next;
  end loop;
end;
$$;


ALTER FUNCTION "public"."consume_inventory_units"("p_inventory_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_one_inventory_unit"("p_inventory_id" "uuid") RETURNS TABLE("consumed" integer, "location_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_loc_id uuid;
  v_count integer := 0;
begin
  if exists (select 1 from public.food_inventory_locations l
             where l.food_inventory_id = p_inventory_id) then
    select l.id into v_loc_id
    from public.food_inventory_locations l
    where l.food_inventory_id = p_inventory_id
      and l.quantity > 0
    order by l.is_ready_to_consume desc, l.quantity desc
    limit 1
    for update;

    if v_loc_id is not null then
      update public.food_inventory_locations
         set quantity = quantity - 1
       where id = v_loc_id;
      v_count := 1;

      update public.food_inventory fi
         set quantity = coalesce((
               select sum(l2.quantity)
               from public.food_inventory_locations l2
               where l2.food_inventory_id = p_inventory_id), 0)
       where fi.id = p_inventory_id;
    end if;
  else
    -- Location-less rows fall back to the legacy quantity column, same as
    -- the plural function. There is no location to report.
    update public.food_inventory fi
       set quantity = fi.quantity - 1
     where fi.id = p_inventory_id
       and fi.quantity > 0;
    get diagnostics v_count = row_count;
  end if;

  consumed := v_count;
  location_id := v_loc_id;
  return next;
end;
$$;


ALTER FUNCTION "public"."consume_one_inventory_unit"("p_inventory_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_meals" "jsonb") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."create_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_meals" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."discard_inventory_units"("p_inventory_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_total integer := 0;
begin
  if exists (select 1 from public.food_inventory_locations l
             where l.food_inventory_id = p_inventory_id) then
    select coalesce(sum(l.quantity), 0) into v_total
    from public.food_inventory_locations l
    where l.food_inventory_id = p_inventory_id;

    update public.food_inventory_locations
       set quantity = 0
     where food_inventory_id = p_inventory_id;

    update public.food_inventory fi
       set quantity = 0
     where fi.id = p_inventory_id;
  else
    select coalesce(fi.quantity, 0) into v_total
    from public.food_inventory fi
    where fi.id = p_inventory_id;

    update public.food_inventory fi
       set quantity = 0
     where fi.id = p_inventory_id;
  end if;

  return v_total;
end;
$$;


ALTER FUNCTION "public"."discard_inventory_units"("p_inventory_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_movement_tier"("exercise_id_param" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
WITH RECURSIVE movement_hierarchy AS (
  -- Base case: the movement itself
  SELECT
    id,
    parent_exercise_id,
    0 AS depth
  FROM public.exercises
  WHERE id = exercise_id_param

  UNION ALL

  -- Recursive case: traverse up to parent
  SELECT
    e.id,
    e.parent_exercise_id,
    mh.depth + 1
  FROM public.exercises e
  INNER JOIN movement_hierarchy mh ON e.id = mh.parent_exercise_id
)
SELECT MAX(depth) FROM movement_hierarchy;
$$;


ALTER FUNCTION "public"."get_movement_tier"("exercise_id_param" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_movement_tier"("exercise_id_param" "uuid") IS 'Computes the tier/depth of a movement in the hierarchy (0 = core, 1-4 = variation tiers)';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."materialize_due_prepared_meal_deliveries"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row     pending_prepared_meal_deliveries%ROWTYPE;
  v_total   integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_row IN
    WITH claimed AS (
      DELETE FROM pending_prepared_meal_deliveries
      WHERE user_id = v_user_id
        AND arrives_at <= now()
      RETURNING *
    )
    -- Oldest first: two boxes of the same dish arriving in order must restock
    -- in that order, or the later use-by loses to the earlier one.
    SELECT * FROM claimed ORDER BY arrives_at
  LOOP
    v_total := v_total + create_prepared_meal_delivery(v_row.vendor_id, v_row.use_by, v_row.meals);
  END LOOP;

  RETURN v_total;
END $$;


ALTER FUNCTION "public"."materialize_due_prepared_meal_deliveries"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."meal_categories_check_set"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  target uuid := COALESCE(NEW.meal_id, OLD.meal_id);
  n_total integer;
  n_emergency integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE category = 'emergency')
    INTO n_total, n_emergency
    FROM public.meal_categories WHERE meal_id = target;

  -- The meal itself is gone (cascade): nothing left to be true about.
  IF NOT EXISTS (SELECT 1 FROM public.meals WHERE id = target) THEN
    RETURN NULL;
  END IF;

  IF n_total = 0 THEN
    RAISE EXCEPTION 'a meal must be filed under at least one category';
  END IF;

  IF n_emergency > 0 AND n_total > 1 THEN
    RAISE EXCEPTION 'emergency calories cannot be combined with another category';
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."meal_categories_check_set"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_single_location_items"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- For each existing item with a location, create a location entry
  INSERT INTO public.food_inventory_locations (
    food_inventory_id,
    user_id,
    location,
    quantity,
    is_ready_to_consume,
    notes
  )
  SELECT
    id,
    user_id,
    location,
    quantity,
    CASE
      -- Items in fridge/freezer are considered ready to consume
      WHEN location IN ('fridge', 'freezer') THEN true
      -- Items in pantry could be either, default to ready for backwards compatibility
      ELSE true
    END,
    'Migrated from single-location'
  FROM public.food_inventory
  WHERE location IS NOT NULL
    AND storage_type = 'single-location'
    AND NOT EXISTS (
      SELECT 1 FROM public.food_inventory_locations fil
      WHERE fil.food_inventory_id = food_inventory.id
    );

  RAISE NOTICE 'Migration completed: Existing single-location items have been preserved';
END;
$$;


ALTER FUNCTION "public"."migrate_single_location_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepared_meal_slug"("p_name" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
$$;


ALTER FUNCTION "public"."prepared_meal_slug"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_circular_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only check if parent_exercise_id is being set
  IF NEW.parent_exercise_id IS NOT NULL THEN
    -- Check if the new parent would create a circular reference
    -- by checking if NEW.id appears anywhere in the ancestor chain of NEW.parent_exercise_id
    IF EXISTS (
      WITH RECURSIVE descendants AS (
        -- Start with the parent's children (excluding self)
        SELECT id, parent_exercise_id
        FROM public.exercises
        WHERE parent_exercise_id = NEW.id

        UNION ALL

        -- Recursive: children of children
        SELECT e.id, e.parent_exercise_id
        FROM public.exercises e
        INNER JOIN descendants d ON e.parent_exercise_id = d.id
      )
      SELECT 1 FROM descendants WHERE id = NEW.parent_exercise_id
    ) THEN
      RAISE EXCEPTION 'Cannot set parent - would create circular reference in movement hierarchy';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_circular_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refund_inventory_units"("p_inventory_ids" "uuid"[]) RETURNS TABLE("inventory_id" "uuid", "refunded" integer)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
  v_loc_id uuid;
  v_count integer;
begin
  foreach v_id in array p_inventory_ids loop
    v_loc_id := null;
    v_count := 0;

    if exists (select 1 from public.food_inventory_locations l
               where l.food_inventory_id = v_id) then
      -- Mirror of consume: credit the ready-to-consume location first.
      -- Units are containers, so "which location" is an approximation and
      -- that is fine (documented v1 semantics).
      select l.id into v_loc_id
      from public.food_inventory_locations l
      where l.food_inventory_id = v_id
      order by l.is_ready_to_consume desc, l.quantity desc
      limit 1
      for update;

      if v_loc_id is not null then
        update public.food_inventory_locations
           set quantity = quantity + 1
         where id = v_loc_id;
        v_count := 1;

        update public.food_inventory fi
           set quantity = coalesce((
                 select sum(l2.quantity)
                 from public.food_inventory_locations l2
                 where l2.food_inventory_id = v_id), 0)
         where fi.id = v_id;
      end if;
    else
      -- No `and fi.quantity > 0` guard here, mirroring the location branch's
      -- lack of a `l.quantity > 0` filter above: refund must be able to credit
      -- an empty row. The asymmetry with consume therefore exists in BOTH
      -- branches — a location-less item at quantity 0 invents a unit exactly
      -- as a location-having item with every location at 0 does. Do not
      -- "simplify" this on the belief that only the location branch is
      -- affected. The caller compensates by refunding only the ids that
      -- actually returned consumed > 0 (see the Task 6/9 plan amendments).
      update public.food_inventory fi
         set quantity = fi.quantity + 1
       where fi.id = v_id;
      get diagnostics v_count = row_count;
    end if;

    inventory_id := v_id;
    refunded := v_count;
    return next;
  end loop;
end;
$$;


ALTER FUNCTION "public"."refund_inventory_units"("p_inventory_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_item_locations"("p_item_id" "uuid", "p_rows" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid;
  r jsonb;
  v_total integer := 0;
  v_qty integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'p_rows must be a non-empty JSON array — an item must keep >= 1 location row';
  end if;

  -- security invoker: RLS on food_inventory scopes this read, so a caller
  -- can only resolve (and therefore only rewrite) their own items.
  select fi.user_id into v_user_id from public.food_inventory fi where fi.id = p_item_id for update;
  if v_user_id is null then
    raise exception 'inventory item % not found', p_item_id;
  end if;

  -- Validate every row up front, so a bad element raises this message
  -- rather than a raw constraint violation once the insert reaches it.
  for r in select * from jsonb_array_elements(p_rows) loop
    if (r->>'location') is null
       or (r->>'location') not in ('fridge','freezer','pantry','cabinet') then
      raise exception 'invalid location: %', r->>'location';
    end if;
    v_qty := (r->>'quantity')::integer;
    if v_qty is null or v_qty < 0 then
      raise exception 'quantity must be a non-negative integer';
    end if;
    if jsonb_typeof(r->'is_ready_to_consume') is distinct from 'boolean' then
      raise exception 'is_ready_to_consume must be a boolean';
    end if;
  end loop;

  delete from public.food_inventory_locations where food_inventory_id = p_item_id;

  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.food_inventory_locations
      (food_inventory_id, user_id, location, quantity, is_ready_to_consume, notes)
    values
      (p_item_id, v_user_id, r->>'location', (r->>'quantity')::integer,
       (r->>'is_ready_to_consume')::boolean, r->>'notes');
    v_total := v_total + (r->>'quantity')::integer;
  end loop;

  update public.food_inventory set quantity = v_total where id = p_item_id;
end;
$$;


ALTER FUNCTION "public"."replace_item_locations"("p_item_id" "uuid", "p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_inventory_unit"("p_inventory_id" "uuid", "p_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_count integer := 0;
begin
  if p_location_id is not null then
    update public.food_inventory_locations
       set quantity = quantity + 1
     where id = p_location_id
       and food_inventory_id = p_inventory_id;
    get diagnostics v_count = row_count;

    if v_count > 0 then
      update public.food_inventory fi
         set quantity = coalesce((
               select sum(l2.quantity)
               from public.food_inventory_locations l2
               where l2.food_inventory_id = p_inventory_id), 0)
       where fi.id = p_inventory_id;
    end if;
  else
    update public.food_inventory fi
       set quantity = fi.quantity + 1
     where fi.id = p_inventory_id;
    get diagnostics v_count = row_count;
  end if;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."restore_inventory_unit"("p_inventory_id" "uuid", "p_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."schedule_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_arrives_at" timestamp with time zone, "p_meals" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_status  text;
  v_meals   integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_meals IS NULL OR jsonb_typeof(p_meals) <> 'array' THEN
    RAISE EXCEPTION 'p_meals must be a JSON array';
  END IF;

  -- One definition, computed once, for both branches: a box that says "7
  -- meals" while it waits must say "7 meals" when it lands. A blank row at the
  -- bottom of the form is not a meal; a missing or unreadable quantity counts
  -- as the one the writer would default it to.
  SELECT coalesce(sum(greatest(1, coalesce((m->>'quantity')::integer, 1))), 0)
    INTO v_meals
  FROM jsonb_array_elements(p_meals) m
  WHERE trim(coalesce(m->>'name', '')) <> '';

  IF p_arrives_at IS NULL OR p_arrives_at <= now() THEN
    -- Already here. The old path, unchanged — its return value is discarded
    -- rather than reported, because it counts dishes.
    PERFORM create_prepared_meal_delivery(p_vendor_id, p_use_by, p_meals);
    v_status := 'delivered';
  ELSE
    INSERT INTO pending_prepared_meal_deliveries (user_id, vendor_id, arrives_at, use_by, meals)
    VALUES (v_user_id, p_vendor_id, p_arrives_at, p_use_by, p_meals);
    v_status := 'scheduled';
  END IF;

  RETURN jsonb_build_object('status', v_status, 'count', v_meals);
END $$;


ALTER FUNCTION "public"."schedule_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_arrives_at" timestamp with time zone, "p_meals" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_active_ramp_level"("p_level_id" "uuid", "p_today" "date") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_level public.calorie_ramp_levels%rowtype;
  v_rows integer;
begin
  select * into v_level
  from public.calorie_ramp_levels
  where id = p_level_id;

  if v_level.id is null then
    raise exception 'Ramp level % not found', p_level_id;
  end if;

  update public.calorie_ramp_levels
     set is_active = false
   where user_id = v_level.user_id
     and is_active
     and id <> p_level_id;

  update public.calorie_ramp_levels
     set is_active = true,
         started_at = p_today
   where id = p_level_id;

  update public.profiles
     set target_calories  = v_level.target_calories,
         target_protein_g = v_level.target_protein_g,
         target_carbs_g   = coalesce(v_level.target_carbs_g, target_carbs_g),
         target_fats_g    = coalesce(v_level.target_fats_g, target_fats_g)
   where id = v_level.user_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'No profiles row for user % — ramp level not applied', v_level.user_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."set_active_ramp_level"("p_level_id" "uuid", "p_today" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_meal_categories"("p_meal_id" "uuid", "p_categories" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  owner uuid;
BEGIN
  IF array_length(p_categories, 1) IS NULL THEN
    RAISE EXCEPTION 'a meal must be filed under at least one category';
  END IF;

  -- RLS-filtered: a meal that is not the caller's is simply not found here.
  SELECT user_id INTO owner FROM public.meals WHERE id = p_meal_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'meal not found';
  END IF;

  DELETE FROM public.meal_categories
    WHERE meal_id = p_meal_id
      AND category <> ALL (p_categories);

  INSERT INTO public.meal_categories (meal_id, user_id, category)
  SELECT p_meal_id, owner, c FROM unnest(p_categories) AS c
  ON CONFLICT (meal_id, category) DO NOTHING;

  -- The primary category — what the default logging slot reads — is the first
  -- one given. Callers pass the set with the primary at its head, so an
  -- unchanged head leaves this a no-op write.
  UPDATE public.meals SET category = p_categories[1], updated_at = now()
    WHERE id = p_meal_id;
END;
$$;


ALTER FUNCTION "public"."set_meal_categories"("p_meal_id" "uuid", "p_categories" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_meal_roles"("p_meal_id" "uuid", "p_roles" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  owner uuid;
  roles text[] := COALESCE(p_roles, ARRAY[]::text[]);
BEGIN
  -- RLS-filtered: a meal that is not the caller's is simply not found here.
  SELECT user_id INTO owner FROM public.meals WHERE id = p_meal_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'meal not found';
  END IF;

  DELETE FROM public.meal_roles
    WHERE meal_id = p_meal_id
      AND role <> ALL (roles);

  INSERT INTO public.meal_roles (meal_id, user_id, role)
  SELECT p_meal_id, owner, r FROM unnest(roles) AS r
  ON CONFLICT (meal_id, role) DO NOTHING;

  -- The legacy single-role column, kept sane rather than kept authoritative —
  -- see the header. Callers pass the set in display order, so this lands on
  -- whichever role sits first in the rail.
  UPDATE public.meals
    SET role = CASE WHEN array_length(roles, 1) IS NULL THEN NULL ELSE roles[1] END,
        updated_at = now()
    WHERE id = p_meal_id;
END;
$$;


ALTER FUNCTION "public"."set_meal_roles"("p_meal_id" "uuid", "p_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_inventory_units"("p_item_id" "uuid", "p_from_location_id" "uuid", "p_to_location_id" "uuid", "p_quantity" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_from public.food_inventory_locations%rowtype;
  v_to public.food_inventory_locations%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'transfer quantity must be positive';
  end if;
  if p_from_location_id is not null and p_from_location_id = p_to_location_id then
    raise exception 'source and target locations must differ';
  end if;

  select * into v_to from public.food_inventory_locations
   where id = p_to_location_id and food_inventory_id = p_item_id
   for update;
  if v_to.id is null then
    raise exception 'target location % not found on item %', p_to_location_id, p_item_id;
  end if;

  if p_from_location_id is not null then
    select * into v_from from public.food_inventory_locations
     where id = p_from_location_id and food_inventory_id = p_item_id
     for update;
    if v_from.id is null then
      raise exception 'source location % not found on item %', p_from_location_id, p_item_id;
    end if;
    if v_from.quantity < p_quantity then
      raise exception 'insufficient stock in source location (% < %)', v_from.quantity, p_quantity;
    end if;
    update public.food_inventory_locations
       set quantity = quantity - p_quantity where id = p_from_location_id;
  end if;

  update public.food_inventory_locations
     set quantity = quantity + p_quantity where id = p_to_location_id;

  update public.food_inventory fi
     set quantity = coalesce((select sum(l.quantity)
                              from public.food_inventory_locations l
                              where l.food_inventory_id = p_item_id), 0)
   where fi.id = p_item_id;
end;
$$;


ALTER FUNCTION "public"."transfer_inventory_units"("p_item_id" "uuid", "p_from_location_id" "uuid", "p_to_location_id" "uuid", "p_quantity" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_exercise_standards_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_exercise_standards_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_morning_routine_completions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_morning_routine_completions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_morning_routine_tasks_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_morning_routine_tasks_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_morning_routine_templates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_morning_routine_templates_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_saved_foods_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_saved_foods_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_workout_sessions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_workout_sessions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_movement_depth"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only validate if parent_exercise_id is being set
  IF NEW.parent_exercise_id IS NOT NULL THEN
    -- Check if adding this movement would exceed max depth
    IF public.get_movement_tier(NEW.parent_exercise_id) >= 4 THEN
      RAISE EXCEPTION 'Movement hierarchy depth cannot exceed 4 tiers (current parent is at tier 4)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_movement_depth"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."body_measurements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "biceps_inches" numeric(10,2),
    "chest_inches" numeric(10,2),
    "waist_inches" numeric(10,2),
    "hips_inches" numeric(10,2),
    "thighs_inches" numeric(10,2),
    "calves_inches" numeric(10,2),
    "logged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "body_measurements_biceps_inches_check" CHECK (("biceps_inches" > (0)::numeric)),
    CONSTRAINT "body_measurements_calves_inches_check" CHECK (("calves_inches" > (0)::numeric)),
    CONSTRAINT "body_measurements_chest_inches_check" CHECK (("chest_inches" > (0)::numeric)),
    CONSTRAINT "body_measurements_hips_inches_check" CHECK (("hips_inches" > (0)::numeric)),
    CONSTRAINT "body_measurements_thighs_inches_check" CHECK (("thighs_inches" > (0)::numeric)),
    CONSTRAINT "body_measurements_waist_inches_check" CHECK (("waist_inches" > (0)::numeric))
);


ALTER TABLE "public"."body_measurements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calorie_ramp_levels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "level" integer NOT NULL,
    "name" "text" NOT NULL,
    "target_calories" integer NOT NULL,
    "target_protein_g" integer NOT NULL,
    "target_carbs_g" integer,
    "target_fats_g" integer,
    "is_active" boolean DEFAULT false NOT NULL,
    "started_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calorie_ramp_levels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."captured_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "source_url" "text" NOT NULL,
    "poster_handle" "text",
    "caption_text" "text",
    "thumbnail_url" "text",
    "raw_extraction" "jsonb",
    "extraction_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "captured_sources_extraction_status_check" CHECK (("extraction_status" = ANY (ARRAY['pending'::"text", 'reviewed'::"text", 'failed'::"text"]))),
    CONSTRAINT "captured_sources_platform_check" CHECK (("platform" = ANY (ARRAY['instagram'::"text", 'tiktok'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."captured_sources" OWNER TO "postgres";


COMMENT ON TABLE "public"."captured_sources" IS 'One row per social post shared into the app. Exercises live in exercises; source_exercises links them.';



CREATE TABLE IF NOT EXISTS "public"."captured_workout_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "captured_workout_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "exercise_order" integer NOT NULL,
    "target_sets" integer,
    "target_reps" "text",
    "rest_seconds" integer,
    "notes" "text",
    "target_weight" "text",
    "target_duration" "text"
);


ALTER TABLE "public"."captured_workout_exercises" OWNER TO "postgres";


COMMENT ON COLUMN "public"."captured_workout_exercises"."target_sets" IS 'Per-exercise sets. NULL for circuit-style workouts — see captured_workouts.rounds. Never inferred.';



CREATE TABLE IF NOT EXISTS "public"."captured_workout_muscles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "captured_workout_id" "uuid" NOT NULL,
    "muscle_region_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."captured_workout_muscles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."captured_workout_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "captured_workout_id" "uuid",
    "performed_date" "date" NOT NULL,
    "block" "text" NOT NULL,
    "muscles" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "session_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "captured_workout_usage_block_check" CHECK (("block" = ANY (ARRAY['warmup'::"text", 'mobility'::"text", 'main'::"text", 'conditioning'::"text", 'bfr'::"text", 'cooldown'::"text"])))
);


ALTER TABLE "public"."captured_workout_usage" OWNER TO "postgres";


COMMENT ON TABLE "public"."captured_workout_usage" IS 'One row per catalog workout actually performed: powers coverage, variety, and the future exercise-level engine.';



CREATE TABLE IF NOT EXISTS "public"."captured_workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rounds" "text",
    "raw_protocol" "text",
    "description" "text",
    "block_roles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "est_minutes" integer,
    "intensity" "text",
    "skill_level" "text",
    "classified_at" timestamp with time zone,
    CONSTRAINT "captured_workouts_block_roles_check" CHECK (("block_roles" <@ ARRAY['warmup'::"text", 'mobility'::"text", 'main'::"text", 'conditioning'::"text", 'cooldown'::"text"])),
    CONSTRAINT "captured_workouts_est_minutes_check" CHECK ((("est_minutes" >= 1) AND ("est_minutes" <= 240))),
    CONSTRAINT "captured_workouts_intensity_check" CHECK (("intensity" = ANY (ARRAY['low'::"text", 'moderate'::"text", 'high'::"text"]))),
    CONSTRAINT "captured_workouts_skill_level_check" CHECK (("skill_level" = ANY (ARRAY['Beginner'::"text", 'Intermediate'::"text", 'Advanced'::"text"])))
);


ALTER TABLE "public"."captured_workouts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."captured_workouts"."rounds" IS 'How many times through the whole list, as the creator said it ("3-4"). NULL when the caption prescribes per-exercise sets instead.';



COMMENT ON COLUMN "public"."captured_workouts"."raw_protocol" IS 'The caption''s prescription lines, verbatim. The lossless record behind the parsed items.';



COMMENT ON COLUMN "public"."captured_workouts"."description" IS 'One-sentence summary of the workout, written at capture and editable after.';



CREATE TABLE IF NOT EXISTS "public"."class_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "part_order" integer NOT NULL,
    "part_type" "text" NOT NULL,
    "part_name" "text",
    "wod_id" "uuid",
    "custom_description" "text",
    "duration_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."class_parts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "duration_minutes" integer DEFAULT 60,
    "notes" "text"
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_checkin_soreness" (
    "checkin_id" "uuid" NOT NULL,
    "muscle_region_id" "uuid" NOT NULL,
    "severity" integer NOT NULL,
    CONSTRAINT "daily_checkin_soreness_severity_check" CHECK ((("severity" >= 1) AND ("severity" <= 3)))
);


ALTER TABLE "public"."daily_checkin_soreness" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "checkin_date" "date" NOT NULL,
    "energy" integer NOT NULL,
    "minutes_available" integer DEFAULT 120 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "override_recovery" boolean DEFAULT false NOT NULL,
    "force_recovery" boolean DEFAULT false NOT NULL,
    CONSTRAINT "daily_checkins_energy_check" CHECK ((("energy" >= 1) AND ("energy" <= 10))),
    CONSTRAINT "daily_checkins_minutes_available_check" CHECK (("minutes_available" > 0))
);


ALTER TABLE "public"."daily_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dev_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "section" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "dev_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "dev_tasks_section_check" CHECK (("section" = ANY (ARRAY['home'::"text", 'schedule'::"text", 'track'::"text", 'progress'::"text", 'profile'::"text", 'settings'::"text", 'training'::"text", 'other'::"text"]))),
    CONSTRAINT "dev_tasks_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'needs_review'::"text", 'done'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."dev_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."eat_next_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "suggested_on" "date" NOT NULL,
    "context" "text" NOT NULL,
    "meal_id" "uuid",
    "meal_name" "text" NOT NULL,
    "rank" integer NOT NULL,
    "assemblable" boolean,
    "acted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."eat_next_suggestions" OWNER TO "postgres";


COMMENT ON TABLE "public"."eat_next_suggestions" IS 'One row per (day, context, meal, rank) the recommender offered. acted_at is set when that meal is logged; null means offered and not taken.';



CREATE TABLE IF NOT EXISTS "public"."eating_windows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "meal_type" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "budget_weight" numeric(4,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "eating_windows_budget_weight_check" CHECK (("budget_weight" > (0)::numeric)),
    CONSTRAINT "eating_windows_label_check" CHECK ((("char_length"("label") >= 1) AND ("char_length"("label") <= 40))),
    CONSTRAINT "eating_windows_meal_type_check" CHECK (("meal_type" = ANY (ARRAY['breakfast'::"text", 'lunch'::"text", 'dinner'::"text", 'snack'::"text", 'dessert'::"text"]))),
    CONSTRAINT "eating_windows_span" CHECK (("end_time" > "start_time"))
);


ALTER TABLE "public"."eating_windows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."equipment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "color" "text" NOT NULL,
    "icon" "text",
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."event_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "category_id" "uuid",
    "title" "text" NOT NULL,
    "default_duration_minutes" integer DEFAULT 30 NOT NULL,
    "is_system_template" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."event_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_goal_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "goal_type_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_goal_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workout_instance_id" "uuid" NOT NULL,
    "program_workout_exercise_id" "uuid",
    "exercise_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "exercise_order" integer NOT NULL,
    "status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "notes" "text",
    "form_quality" integer,
    "performed_date" "date",
    "execution_order" integer,
    "difficulty" "text",
    "increase_weight_next" boolean DEFAULT false,
    "workout_session_id" "uuid",
    CONSTRAINT "exercise_instances_form_quality_check" CHECK ((("form_quality" >= 1) AND ("form_quality" <= 5))),
    CONSTRAINT "exercise_instances_status_check" CHECK (("status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'completed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."exercise_instances" OWNER TO "postgres";


COMMENT ON COLUMN "public"."exercise_instances"."workout_session_id" IS 'Links exercise to specific session (for split workout tracking)';



CREATE TABLE IF NOT EXISTS "public"."exercise_load_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "load_position_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_load_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_movement_styles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "movement_style_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_movement_styles" OWNER TO "postgres";


COMMENT ON TABLE "public"."exercise_movement_styles" IS 'Junction table linking exercises to multiple movement styles';



CREATE TABLE IF NOT EXISTS "public"."exercise_muscle_regions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "muscle_region_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_muscle_regions" OWNER TO "postgres";


COMMENT ON TABLE "public"."exercise_muscle_regions" IS 'Junction table mapping exercises to targeted muscle regions';



COMMENT ON COLUMN "public"."exercise_muscle_regions"."is_primary" IS 'TRUE if primary target, FALSE if secondary/synergist muscle';



CREATE TABLE IF NOT EXISTS "public"."exercise_planes_of_motion" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "plane_of_motion_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_planes_of_motion" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_scoring_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "scoring_type_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_scoring_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_skill_state" (
    "user_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "current_level" "text" DEFAULT 'beginner'::"text" NOT NULL,
    "consecutive_too_easy" integer DEFAULT 0 NOT NULL,
    "last_rating" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exercise_skill_state_current_level_check" CHECK (("current_level" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"]))),
    CONSTRAINT "exercise_skill_state_last_rating_check" CHECK (("last_rating" = ANY (ARRAY['too_easy'::"text", 'right'::"text", 'too_hard'::"text"])))
);


ALTER TABLE "public"."exercise_skill_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_stances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "stance_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_stances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_standards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid",
    "variation_option_id" "uuid",
    "rom_description" "text",
    "rom_start_position" "text",
    "rom_end_position" "text",
    "rom_key_checkpoints" "text"[],
    "setup_cues" "text"[],
    "execution_cues" "text"[],
    "breathing_pattern" "text",
    "common_faults" "text"[],
    "no_rep_conditions" "text"[],
    "judging_notes" "text",
    "competition_standard" "text",
    "is_official_standard" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "exercise_standards_check" CHECK ((("exercise_id" IS NOT NULL) OR ("variation_option_id" IS NOT NULL)))
);


ALTER TABLE "public"."exercise_standards" OWNER TO "postgres";


COMMENT ON TABLE "public"."exercise_standards" IS 'Comprehensive movement standards including ROM, setup, execution, faults, and judging criteria';



COMMENT ON COLUMN "public"."exercise_standards"."rom_description" IS 'Overall description of required range of motion';



COMMENT ON COLUMN "public"."exercise_standards"."rom_start_position" IS 'Description of proper starting position';



COMMENT ON COLUMN "public"."exercise_standards"."rom_end_position" IS 'Description of proper ending/completion position';



COMMENT ON COLUMN "public"."exercise_standards"."rom_key_checkpoints" IS 'Array of key ROM checkpoints that must be achieved';



COMMENT ON COLUMN "public"."exercise_standards"."setup_cues" IS 'Array of setup and positioning cues';



COMMENT ON COLUMN "public"."exercise_standards"."execution_cues" IS 'Array of cues for proper movement execution';



COMMENT ON COLUMN "public"."exercise_standards"."breathing_pattern" IS 'Recommended breathing pattern for the movement';



COMMENT ON COLUMN "public"."exercise_standards"."common_faults" IS 'Array of common movement faults to watch for';



COMMENT ON COLUMN "public"."exercise_standards"."no_rep_conditions" IS 'Array of conditions that result in no-rep (rep does not count)';



COMMENT ON COLUMN "public"."exercise_standards"."judging_notes" IS 'Additional notes for judging in competition context';



COMMENT ON COLUMN "public"."exercise_standards"."competition_standard" IS 'Official competition standard reference (e.g., CrossFit Games rulebook)';



COMMENT ON COLUMN "public"."exercise_standards"."is_official_standard" IS 'True if this follows official CrossFit/competition standards';



CREATE TABLE IF NOT EXISTS "public"."exercise_variations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "variation_option_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."exercise_variations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "is_movement" boolean DEFAULT false,
    "goal_type_id" "uuid",
    "movement_category_id" "uuid",
    "video_url" "text",
    "image_url" "text",
    "is_official" boolean DEFAULT false,
    "created_by" "uuid",
    "requires_weight" boolean DEFAULT false,
    "equipment_types" "text"[],
    "requires_distance" boolean DEFAULT false,
    "movement_family_id" "uuid",
    "plane_of_motion_id" "uuid",
    "skill_level" "text",
    "short_name" "text",
    "aliases" "text"[],
    "load_position_id" "uuid",
    "stance_id" "uuid",
    "range_depth_id" "uuid",
    "movement_style_id" "uuid",
    "symmetry_id" "uuid",
    "is_core" boolean DEFAULT false,
    "parent_exercise_id" "uuid",
    CONSTRAINT "check_core_no_parent" CHECK ((NOT (("is_core" = true) AND ("parent_exercise_id" IS NOT NULL)))),
    CONSTRAINT "exercises_skill_level_check" CHECK (("skill_level" = ANY (ARRAY['Beginner'::"text", 'Intermediate'::"text", 'Advanced'::"text"])))
);


ALTER TABLE "public"."exercises" OWNER TO "postgres";


COMMENT ON COLUMN "public"."exercises"."requires_weight" IS 'True if movement requires external weight (barbells, dumbbells, kettlebells, wall balls, medicine balls, etc.). False for bodyweight movements (pull-ups, push-ups, toes-to-bar, etc.).';



COMMENT ON COLUMN "public"."exercises"."equipment_types" IS 'Array of equipment types needed: [''barbell'', ''dumbbell'', ''kettlebell'', ''wall_ball'', ''medicine_ball'', ''box'', ''rings'', ''rower'', ''bike'', etc.]';



COMMENT ON COLUMN "public"."exercises"."requires_distance" IS 'True if movement requires distance configuration (run, row, bike, ski, swim, etc.). Distance movements show distance fields instead of reps/weight.';



COMMENT ON COLUMN "public"."exercises"."movement_family_id" IS 'Functional movement pattern (Squat, Hinge, Press, Pull, etc.)';



COMMENT ON COLUMN "public"."exercises"."plane_of_motion_id" IS 'Primary anatomical plane of motion';



COMMENT ON COLUMN "public"."exercises"."skill_level" IS 'Skill requirement: Beginner, Intermediate, or Advanced';



COMMENT ON COLUMN "public"."exercises"."short_name" IS 'Abbreviated name for UI display';



COMMENT ON COLUMN "public"."exercises"."aliases" IS 'Alternative names and search terms for this movement';



COMMENT ON COLUMN "public"."exercises"."load_position_id" IS 'How external weight is held or positioned (e.g., Overhead, FrontRack, BackRack)';



COMMENT ON COLUMN "public"."exercises"."stance_id" IS 'Foot and leg positioning during movement (e.g., Standard, Wide, Split)';



COMMENT ON COLUMN "public"."exercises"."range_depth_id" IS 'Depth or range of motion specification (e.g., Full, Parallel, Box)';



COMMENT ON COLUMN "public"."exercises"."movement_style_id" IS 'Tempo and execution variation (e.g., Strict, Kipping, Pause, Tempo)';



COMMENT ON COLUMN "public"."exercises"."symmetry_id" IS 'Bilateral vs unilateral loading pattern (e.g., Bilateral, Unilateral, Alternating)';



COMMENT ON COLUMN "public"."exercises"."is_core" IS 'True if this is a core/base movement, false if it is a variation';



COMMENT ON COLUMN "public"."exercises"."parent_exercise_id" IS 'Reference to parent movement (for variations). NULL for core movements.';



CREATE TABLE IF NOT EXISTS "public"."food_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "icon" "text",
    "color" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text",
    "display_order" integer
);


ALTER TABLE "public"."food_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."food_categories" IS 'User-defined categories for organizing food inventory';



CREATE TABLE IF NOT EXISTS "public"."food_concept_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "concept_id" "uuid" NOT NULL,
    "saved_food_id" "uuid",
    "food_inventory_id" "uuid",
    "matched_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "food_concept_links_check" CHECK (("num_nonnulls"("saved_food_id", "food_inventory_id") = 1)),
    CONSTRAINT "food_concept_links_matched_by_check" CHECK (("matched_by" = ANY (ARRAY['seed'::"text", 'auto_name_match'::"text", 'user'::"text", 'ai'::"text"])))
);


ALTER TABLE "public"."food_concept_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_concepts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "rating" "text" NOT NULL,
    "requires_small_pieces" boolean DEFAULT false NOT NULL,
    "prep_intensive" boolean DEFAULT false NOT NULL,
    "form_note" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rating_confirmed_at" timestamp with time zone,
    CONSTRAINT "food_concepts_rating_check" CHECK (("rating" = ANY (ARRAY['love'::"text", 'like'::"text", 'neutral'::"text", 'dislike'::"text", 'never'::"text"])))
);


ALTER TABLE "public"."food_concepts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."food_concepts"."rating_confirmed_at" IS 'When the owner last confirmed this concept''s rating by hand. Null means the rating is a default or an import — usable, but never asked about.';



CREATE TABLE IF NOT EXISTS "public"."food_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "unit" "text" NOT NULL,
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "brand" "text",
    "flavor" "text",
    "calories" integer,
    "protein" numeric(10,2),
    "carbs" numeric(10,2),
    "fats" numeric(10,2),
    "sugars" numeric(10,2),
    "serving_size" "text",
    "expiration_date" "date",
    "location" "text",
    "restock_threshold" integer DEFAULT 1,
    "barcode" "text",
    "image_primary_url" "text",
    "image_front_url" "text",
    "image_back_url" "text",
    "image_side_url" "text",
    "notes" "text",
    "storage_type" "text" DEFAULT 'single-location'::"text" NOT NULL,
    "requires_refrigeration" boolean DEFAULT false NOT NULL,
    "fridge_restock_threshold" integer,
    "total_restock_threshold" integer,
    "preferred_vendor_id" "uuid",
    "last_verified_at" timestamp with time zone,
    "fiber_g" numeric(6,2),
    "is_scheduled_supply" boolean DEFAULT false NOT NULL,
    "saturated_fat_g" numeric(6,2),
    "sodium_mg" numeric(6,2),
    "saved_food_id" "uuid",
    CONSTRAINT "food_inventory_calories_check" CHECK (("calories" >= 0)),
    CONSTRAINT "food_inventory_carbs_check" CHECK (("carbs" >= (0)::numeric)),
    CONSTRAINT "food_inventory_fats_check" CHECK (("fats" >= (0)::numeric)),
    CONSTRAINT "food_inventory_fiber_g_check" CHECK (("fiber_g" >= (0)::numeric)),
    CONSTRAINT "food_inventory_fridge_restock_threshold_check" CHECK (("fridge_restock_threshold" >= 0)),
    CONSTRAINT "food_inventory_location_check" CHECK (("location" = ANY (ARRAY['fridge'::"text", 'freezer'::"text", 'pantry'::"text", 'cabinet'::"text"]))),
    CONSTRAINT "food_inventory_protein_check" CHECK (("protein" >= (0)::numeric)),
    CONSTRAINT "food_inventory_quantity_check" CHECK (("quantity" >= 0)),
    CONSTRAINT "food_inventory_saturated_fat_g_check" CHECK (("saturated_fat_g" >= (0)::numeric)),
    CONSTRAINT "food_inventory_sodium_mg_check" CHECK (("sodium_mg" >= (0)::numeric)),
    CONSTRAINT "food_inventory_storage_type_check" CHECK (("storage_type" = ANY (ARRAY['single-location'::"text", 'multi-location'::"text"]))),
    CONSTRAINT "food_inventory_sugars_check" CHECK (("sugars" >= (0)::numeric)),
    CONSTRAINT "food_inventory_total_restock_threshold_check" CHECK (("total_restock_threshold" >= 0))
);


ALTER TABLE "public"."food_inventory" OWNER TO "postgres";


COMMENT ON COLUMN "public"."food_inventory"."storage_type" IS 'Determines if item uses single-location or multi-location tracking';



COMMENT ON COLUMN "public"."food_inventory"."requires_refrigeration" IS 'True if item must be refrigerated (affects restocking workflow)';



COMMENT ON COLUMN "public"."food_inventory"."fridge_restock_threshold" IS 'For multi-location items: threshold for ready-to-consume quantity to trigger internal restocking';



COMMENT ON COLUMN "public"."food_inventory"."total_restock_threshold" IS 'For multi-location items: threshold for total quantity to trigger shopping list addition';



COMMENT ON COLUMN "public"."food_inventory"."fiber_g" IS 'Grams of dietary fiber per serving. Feeds the Nutrition Facts panel; daily totals still come from saved_foods via meal logs.';



COMMENT ON COLUMN "public"."food_inventory"."is_scheduled_supply" IS 'True when stock is resupplied on a delivery cadence rather than bought when low. Suppresses out/low/forecast shopping suggestions and run-out estimates.';



COMMENT ON COLUMN "public"."food_inventory"."saturated_fat_g" IS 'Grams of saturated fat per serving, as printed. Feeds the Nutrition Facts panel; daily totals come from saved_foods via meal logs.';



COMMENT ON COLUMN "public"."food_inventory"."sodium_mg" IS 'Milligrams of sodium per serving, as printed. Feeds the Nutrition Facts panel; daily totals come from saved_foods via meal logs.';



COMMENT ON CONSTRAINT "food_inventory_location_check" ON "public"."food_inventory" IS 'Valid storage locations: fridge, freezer, pantry, cabinet';



CREATE TABLE IF NOT EXISTS "public"."food_inventory_category_map" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "food_inventory_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."food_inventory_category_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_inventory_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "food_inventory_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "is_ready_to_consume" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "food_inventory_locations_location_check" CHECK (("location" = ANY (ARRAY['fridge'::"text", 'freezer'::"text", 'pantry'::"text", 'cabinet'::"text"]))),
    CONSTRAINT "food_inventory_locations_quantity_check" CHECK (("quantity" >= 0))
);


ALTER TABLE "public"."food_inventory_locations" OWNER TO "postgres";


COMMENT ON TABLE "public"."food_inventory_locations" IS 'Storage locations for food inventory items with multi-location tracking';



COMMENT ON COLUMN "public"."food_inventory_locations"."is_ready_to_consume" IS 'True if item is ready to consume (e.g., cold drinks in fridge), false if in storage (e.g., warm drinks in pantry)';



COMMENT ON CONSTRAINT "food_inventory_locations_location_check" ON "public"."food_inventory_locations" IS 'Valid storage locations: fridge, freezer, pantry, cabinet';



CREATE TABLE IF NOT EXISTS "public"."food_inventory_subcategory_map" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "food_inventory_id" "uuid" NOT NULL,
    "subcategory_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."food_inventory_subcategory_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_subcategories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."food_subcategories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_session_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "block" "text" NOT NULL,
    "captured_workout_id" "uuid",
    "builtin_key" "text",
    "minutes" integer NOT NULL,
    "rounds_note" "text",
    "reason" "text",
    "name" "text" NOT NULL,
    "locked" boolean DEFAULT false NOT NULL,
    "dismissed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "generated_session_blocks_block_check" CHECK (("block" = ANY (ARRAY['warmup'::"text", 'mobility'::"text", 'main'::"text", 'conditioning'::"text", 'bfr'::"text", 'cooldown'::"text"]))),
    CONSTRAINT "generated_session_blocks_minutes_check" CHECK ((("minutes" >= 1) AND ("minutes" <= 240))),
    CONSTRAINT "generated_session_blocks_source_exclusive" CHECK ((("captured_workout_id" IS NULL) OR ("builtin_key" IS NULL)))
);


ALTER TABLE "public"."generated_session_blocks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."generated_session_blocks"."name" IS 'The block''s display name at compose time, so history survives deleting the workout it came from.';



CREATE TABLE IF NOT EXISTS "public"."generated_session_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "item_order" integer NOT NULL,
    "section" "text" NOT NULL,
    "target_sets" integer,
    "target_reps" "text",
    "rest_seconds" integer,
    "reason" "text",
    "was_performed" boolean,
    CONSTRAINT "generated_session_items_section_check" CHECK (("section" = ANY (ARRAY['warmup'::"text", 'mobility'::"text", 'main'::"text", 'accessory'::"text", 'bfr'::"text", 'cooldown'::"text"])))
);


ALTER TABLE "public"."generated_session_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_date" "date" NOT NULL,
    "gym_profile_id" "uuid",
    "checkin_id" "uuid",
    "split_day" "text",
    "ramp_week" integer NOT NULL,
    "source" "text" NOT NULL,
    "served_captured_workout_id" "uuid",
    "status" "text" DEFAULT 'suggested'::"text" NOT NULL,
    "workout_instance_id" "uuid",
    "inputs_snapshot" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "section_minutes" "jsonb",
    "compose_signature" "text",
    "day_reason" "text",
    CONSTRAINT "generated_sessions_source_check" CHECK (("source" = ANY (ARRAY['ai'::"text", 'rules_fallback'::"text", 'user_pick'::"text"]))),
    CONSTRAINT "generated_sessions_split_day_check" CHECK (("split_day" = ANY (ARRAY['push'::"text", 'pull'::"text", 'legs'::"text"]))),
    CONSTRAINT "generated_sessions_status_check" CHECK (("status" = ANY (ARRAY['suggested'::"text", 'accepted'::"text", 'completed'::"text", 'skipped'::"text", 'rested'::"text"])))
);


ALTER TABLE "public"."generated_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."generated_sessions"."split_day" IS 'push/pull/legs, or NULL for a workout served whole — an unstamped session does not advance the rotation.';



COMMENT ON COLUMN "public"."generated_sessions"."source" IS 'ai | rules_fallback = composed for you. user_pick = you chose a catalog workout yourself.';



COMMENT ON COLUMN "public"."generated_sessions"."section_minutes" IS 'Whole minutes per session section, e.g. {"warmup":12,"main":58}. Null means no stored estimate; the client derives one from the items.';



COMMENT ON COLUMN "public"."generated_sessions"."compose_signature" IS 'The inputs this session was composed from. Written last, so NULL means the compose never finished and the session is still recomposable. A reroll leaves it alone — it modifies a plan built from these inputs, it does not compose a new one.';



CREATE TABLE IF NOT EXISTS "public"."goal_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."goal_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gym_profile_equipment" (
    "gym_profile_id" "uuid" NOT NULL,
    "equipment_id" "uuid" NOT NULL
);


ALTER TABLE "public"."gym_profile_equipment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gym_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "location" "text",
    "preset" "text" DEFAULT 'custom'::"text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gym_profiles_preset_check" CHECK (("preset" = ANY (ARRAY['full_gym'::"text", 'hotel_gym'::"text", 'bodyweight'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."gym_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gyms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "city" "text",
    "state" "text",
    "country" "text" DEFAULT 'USA'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gyms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "food_inventory_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_events_kind_check" CHECK (("kind" = ANY (ARRAY['consume'::"text", 'discard'::"text", 'restore'::"text", 'restock'::"text"]))),
    CONSTRAINT "inventory_events_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."inventory_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."load_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" "text"
);


ALTER TABLE "public"."load_positions" OWNER TO "postgres";


COMMENT ON TABLE "public"."load_positions" IS 'How external weight is held/positioned';



CREATE TABLE IF NOT EXISTS "public"."meal_categories" (
    "meal_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meal_categories_category_check" CHECK (("category" = ANY (ARRAY['breakfast'::"text", 'lunch'::"text", 'dinner'::"text", 'snack'::"text", 'dessert'::"text", 'shake'::"text", 'emergency'::"text", 'beverage'::"text"])))
);


ALTER TABLE "public"."meal_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "meal_id" "uuid" NOT NULL,
    "saved_food_id" "uuid" NOT NULL,
    "servings" numeric(5,2) DEFAULT 1.0 NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "small_pieces_ok" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meal_items_servings_check" CHECK (("servings" > (0)::numeric))
);


ALTER TABLE "public"."meal_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meal_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "meal_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "calories" integer,
    "protein" numeric(10,2),
    "carbs" numeric(10,2),
    "fats" numeric(10,2),
    "sugars" numeric(10,2),
    "uses_inventory" boolean DEFAULT false NOT NULL,
    "inventory_items" "jsonb",
    "logged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "saved_food_id" "uuid",
    "servings" numeric(4,2) DEFAULT 1.0,
    "sodium_mg" numeric(6,2),
    "fiber_g" numeric(6,2),
    "meal_id" "uuid",
    "consumed_inventory_ids" "jsonb",
    "saturated_fat_g" numeric(6,2),
    "beverage_kinds" "text"[],
    "counts_as_meal" boolean DEFAULT true NOT NULL,
    CONSTRAINT "meal_logs_beverage_kinds_check" CHECK ((("beverage_kinds" IS NULL) OR (("meal_type" = 'beverage'::"text") AND ("array_length"("beverage_kinds", 1) >= 1) AND ("beverage_kinds" <@ ARRAY['protein_shake'::"text", 'meal_replacement_shake'::"text", 'weight_gain_shake'::"text", 'smoothie'::"text", 'energy_drink'::"text", 'other'::"text"])))),
    CONSTRAINT "meal_logs_calories_check" CHECK (("calories" >= 0)),
    CONSTRAINT "meal_logs_carbs_check" CHECK (("carbs" >= (0)::numeric)),
    CONSTRAINT "meal_logs_fats_check" CHECK (("fats" >= (0)::numeric)),
    CONSTRAINT "meal_logs_meal_type_check" CHECK (("meal_type" = ANY (ARRAY['breakfast'::"text", 'lunch'::"text", 'dinner'::"text", 'snack'::"text", 'dessert'::"text", 'beverage'::"text"]))),
    CONSTRAINT "meal_logs_protein_check" CHECK (("protein" >= (0)::numeric)),
    CONSTRAINT "meal_logs_servings_check" CHECK (("servings" > (0)::numeric)),
    CONSTRAINT "meal_logs_sugars_check" CHECK (("sugars" >= (0)::numeric))
);


ALTER TABLE "public"."meal_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meal_logs"."consumed_inventory_ids" IS 'Inventory ids the consume RPC confirmed it decremented for this log. NULL = unknown (pre-column or non-decrementing path); [] = ran and took nothing. Distinct from inventory_items, which records intent.';



COMMENT ON COLUMN "public"."meal_logs"."saturated_fat_g" IS 'Grams of saturated fat in this logged portion, scaled by servings like every other macro here.';



CREATE TABLE IF NOT EXISTS "public"."meal_roles" (
    "meal_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meal_roles_role_check" CHECK (("role" = ANY (ARRAY['pre_workout'::"text", 'post_workout'::"text", 'bridge'::"text", 'calorie_booster'::"text", 'emergency_catchup'::"text"])))
);


ALTER TABLE "public"."meal_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "category" "text" NOT NULL,
    "role" "text",
    "default_meal_type" "text",
    "prep_minutes" integer DEFAULT 0 NOT NULL,
    "taste_override" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_complete_portion" boolean DEFAULT false NOT NULL,
    "is_favorite" boolean DEFAULT false NOT NULL,
    "source_kind" "text" DEFAULT 'home'::"text" NOT NULL,
    "source_name" "text",
    "archived_at" timestamp with time zone,
    "image_primary_url" "text",
    "beverage_kinds" "text"[],
    CONSTRAINT "meals_beverage_kinds_check" CHECK ((("beverage_kinds" IS NULL) OR (("array_length"("beverage_kinds", 1) >= 1) AND ("beverage_kinds" <@ ARRAY['protein_shake'::"text", 'meal_replacement_shake'::"text", 'weight_gain_shake'::"text", 'smoothie'::"text", 'energy_drink'::"text", 'other'::"text"])))),
    CONSTRAINT "meals_category_check" CHECK (("category" = ANY (ARRAY['breakfast'::"text", 'lunch'::"text", 'dinner'::"text", 'snack'::"text", 'dessert'::"text", 'shake'::"text", 'emergency'::"text", 'beverage'::"text"]))),
    CONSTRAINT "meals_default_meal_type_check" CHECK (("default_meal_type" = ANY (ARRAY['breakfast'::"text", 'lunch'::"text", 'dinner'::"text", 'snack'::"text", 'dessert'::"text", 'beverage'::"text"]))),
    CONSTRAINT "meals_prep_minutes_check" CHECK (("prep_minutes" >= 0)),
    CONSTRAINT "meals_role_check" CHECK (("role" = ANY (ARRAY['pre_workout'::"text", 'post_workout'::"text", 'bridge'::"text", 'calorie_booster'::"text", 'emergency_catchup'::"text"]))),
    CONSTRAINT "meals_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['home'::"text", 'packaged'::"text", 'out'::"text"]))),
    CONSTRAINT "meals_source_name_check" CHECK ((("source_name" IS NULL) OR (("char_length"("source_name") >= 1) AND ("char_length"("source_name") <= 60)))),
    CONSTRAINT "meals_source_name_matches_kind" CHECK (((("source_kind" = 'home'::"text") AND ("source_name" IS NULL)) OR (("source_kind" <> 'home'::"text") AND ("source_name" IS NOT NULL)))),
    CONSTRAINT "meals_taste_override_check" CHECK (("taste_override" = ANY (ARRAY['love'::"text", 'like'::"text", 'neutral'::"text", 'dislike'::"text", 'never'::"text"])))
);


ALTER TABLE "public"."meals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."meals"."is_complete_portion" IS 'True when the meal is sold as one finished portion (a delivered meal), so its calorie band is judged as a whole meal rather than as an assembly you could add to.';



CREATE TABLE IF NOT EXISTS "public"."morning_routine_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "total_minutes" integer,
    "tasks_completed" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."morning_routine_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."morning_routine_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "title" character varying(100) NOT NULL,
    "description" "text",
    "order_index" integer NOT NULL,
    "estimated_minutes" integer NOT NULL,
    "is_required" boolean DEFAULT true,
    "task_type" character varying(50) DEFAULT 'simple'::character varying,
    "checklist_items" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."morning_routine_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."morning_routine_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "is_default" boolean DEFAULT false,
    "target_completion_time" time without time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."morning_routine_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movement_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."movement_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movement_families" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."movement_families" OWNER TO "postgres";


COMMENT ON TABLE "public"."movement_families" IS 'Functional movement patterns (Squat, Hinge, Press, etc.)';



CREATE TABLE IF NOT EXISTS "public"."movement_measurement_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid",
    "variation_option_id" "uuid",
    "measurement_type" "text" NOT NULL,
    "unit_primary" "text" NOT NULL,
    "unit_secondary" "text",
    "min_value" numeric,
    "max_value" numeric,
    "precision" integer DEFAULT 0,
    "is_default" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "movement_measurement_profiles_check" CHECK ((("exercise_id" IS NOT NULL) OR ("variation_option_id" IS NOT NULL))),
    CONSTRAINT "movement_measurement_profiles_check1" CHECK ((("min_value" IS NULL) OR ("max_value" IS NULL) OR ("min_value" <= "max_value"))),
    CONSTRAINT "movement_measurement_profiles_measurement_type_check" CHECK (("measurement_type" = ANY (ARRAY['REPS'::"text", 'TIME'::"text", 'DISTANCE'::"text", 'LOAD'::"text", 'CALORIES'::"text", 'QUALITY'::"text", 'HEIGHT'::"text"])))
);


ALTER TABLE "public"."movement_measurement_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."movement_measurement_profiles" IS 'Defines how each movement/variation is measured with units and validation ranges';



COMMENT ON COLUMN "public"."movement_measurement_profiles"."measurement_type" IS 'Type of measurement: REPS, TIME, DISTANCE, LOAD, CALORIES, QUALITY, HEIGHT';



COMMENT ON COLUMN "public"."movement_measurement_profiles"."unit_primary" IS 'Primary unit (e.g., reps, s, m, lb, cal)';



COMMENT ON COLUMN "public"."movement_measurement_profiles"."unit_secondary" IS 'Secondary/alternative unit (e.g., min for time, kg for weight)';



COMMENT ON COLUMN "public"."movement_measurement_profiles"."min_value" IS 'Minimum valid value for this measurement';



COMMENT ON COLUMN "public"."movement_measurement_profiles"."max_value" IS 'Maximum valid value for this measurement';



COMMENT ON COLUMN "public"."movement_measurement_profiles"."precision" IS 'Number of decimal places for this measurement';



COMMENT ON COLUMN "public"."movement_measurement_profiles"."is_default" IS 'True if this is the default measurement method for the movement';



CREATE TABLE IF NOT EXISTS "public"."movement_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "rating" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "movement_ratings_rating_check" CHECK (("rating" = ANY (ARRAY['too_easy'::"text", 'right'::"text", 'too_hard'::"text"])))
);


ALTER TABLE "public"."movement_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movement_scaling_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_exercise_id" "uuid" NOT NULL,
    "from_variation_option_id" "uuid",
    "to_exercise_id" "uuid" NOT NULL,
    "to_variation_option_id" "uuid",
    "scaling_type" "text" NOT NULL,
    "difficulty_delta" integer,
    "description" "text",
    "prerequisites" "text"[],
    "display_order" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "movement_scaling_links_check" CHECK ((("from_exercise_id" <> "to_exercise_id") OR ("from_variation_option_id" IS DISTINCT FROM "to_variation_option_id"))),
    CONSTRAINT "movement_scaling_links_scaling_type_check" CHECK (("scaling_type" = ANY (ARRAY['progression'::"text", 'regression'::"text", 'lateral'::"text"])))
);


ALTER TABLE "public"."movement_scaling_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."movement_scaling_links" IS 'Links movements in progression/regression/lateral scaling chains';



COMMENT ON COLUMN "public"."movement_scaling_links"."from_exercise_id" IS 'Source movement in the scaling relationship';



COMMENT ON COLUMN "public"."movement_scaling_links"."from_variation_option_id" IS 'Optional: specific variation of source movement';



COMMENT ON COLUMN "public"."movement_scaling_links"."to_exercise_id" IS 'Target movement (progression, regression, or lateral alternative)';



COMMENT ON COLUMN "public"."movement_scaling_links"."to_variation_option_id" IS 'Optional: specific variation of target movement';



COMMENT ON COLUMN "public"."movement_scaling_links"."scaling_type" IS 'Type of relationship: progression (harder), regression (easier), or lateral (similar difficulty)';



COMMENT ON COLUMN "public"."movement_scaling_links"."difficulty_delta" IS 'Relative difficulty change: negative = easier, 0 = similar, positive = harder';



COMMENT ON COLUMN "public"."movement_scaling_links"."description" IS 'Why this is a good progression/regression/alternative';



COMMENT ON COLUMN "public"."movement_scaling_links"."prerequisites" IS 'Skills or movements that should be mastered before attempting the target movement';



COMMENT ON COLUMN "public"."movement_scaling_links"."display_order" IS 'Order in the progression chain for UI display';



CREATE TABLE IF NOT EXISTS "public"."movement_standards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wod_movement_id" "uuid" NOT NULL,
    "scaling_level" "text" NOT NULL,
    "standard_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "movement_standards_scaling_level_check" CHECK (("scaling_level" = ANY (ARRAY['Rx'::"text", 'L2'::"text", 'L1'::"text"])))
);


ALTER TABLE "public"."movement_standards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."movement_styles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "category" "text"
);


ALTER TABLE "public"."movement_styles" OWNER TO "postgres";


COMMENT ON TABLE "public"."movement_styles" IS 'Tempo and execution variations (Pause, Tempo, Strict, Kipping)';



CREATE TABLE IF NOT EXISTS "public"."muscle_regions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."muscle_regions" OWNER TO "postgres";


COMMENT ON TABLE "public"."muscle_regions" IS 'Reference table for muscle groups and body regions';



CREATE TABLE IF NOT EXISTS "public"."nutrition_constraints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "has_eoe" boolean DEFAULT false NOT NULL,
    "avoids_eating_with_hands" boolean DEFAULT false NOT NULL,
    "prefers_bowls" boolean DEFAULT false NOT NULL,
    "spice_tolerance" "text" DEFAULT 'medium'::"text" NOT NULL,
    "max_prep_minutes" integer DEFAULT 5 NOT NULL,
    "prefers_small_frequent_meals" boolean DEFAULT true NOT NULL,
    "max_leftover_hours" integer DEFAULT 24 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nutrition_constraints_spice_tolerance_check" CHECK (("spice_tolerance" = ANY (ARRAY['none'::"text", 'mild'::"text", 'medium'::"text", 'hot'::"text"])))
);


ALTER TABLE "public"."nutrition_constraints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "meal_type" "text" NOT NULL,
    "food_name" "text" NOT NULL,
    "calories" integer,
    "protein_g" numeric(6,2),
    "carbs_g" numeric(6,2),
    "fat_g" numeric(6,2),
    "logged_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "nutrition_logs_meal_type_check" CHECK (("meal_type" = ANY (ARRAY['breakfast'::"text", 'lunch'::"text", 'dinner'::"text", 'snack'::"text"])))
);


ALTER TABLE "public"."nutrition_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nutrition_vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "app_url" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logo_url" "text"
);


ALTER TABLE "public"."nutrition_vendors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_prepared_meal_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "vendor_id" "uuid" NOT NULL,
    "arrives_at" timestamp with time zone NOT NULL,
    "use_by" "date" NOT NULL,
    "meals" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pending_prepared_meal_deliveries" OWNER TO "postgres";


COMMENT ON TABLE "public"."pending_prepared_meal_deliveries" IS 'Deliveries scheduled for a future arrival. Spent — deleted, and written into inventory — by materialize_due_prepared_meal_deliveries once arrives_at has passed.';



CREATE TABLE IF NOT EXISTS "public"."planes_of_motion" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."planes_of_motion" OWNER TO "postgres";


COMMENT ON TABLE "public"."planes_of_motion" IS 'Anatomical planes of motion (Sagittal, Frontal, Transverse, Multi)';



CREATE OR REPLACE VIEW "public"."prepared_meal_delivery_history" WITH ("security_invoker"='true') AS
 WITH "delivered" AS (
         SELECT "fi"."user_id",
            "fi"."preferred_vendor_id" AS "vendor_id",
            "fi"."name",
            "public"."prepared_meal_slug"("fi"."name") AS "slug",
            "fi"."calories",
            "fi"."protein",
            "fi"."carbs",
            "fi"."fats",
            "fi"."fiber_g",
            "fi"."sugars",
            "fi"."saturated_fat_g",
            "fi"."sodium_mg",
            "fi"."serving_size",
            "fi"."image_primary_url",
            "fi"."created_at",
            ("fi"."created_at")::"date" AS "delivered_on"
           FROM "public"."food_inventory" "fi"
          WHERE (("fi"."preferred_vendor_id" IS NOT NULL) AND (EXISTS ( SELECT 1
                   FROM ("public"."food_concept_links" "fcl"
                     JOIN "public"."food_concepts" "fc" ON (("fc"."id" = "fcl"."concept_id")))
                  WHERE (("fcl"."food_inventory_id" = "fi"."id") AND ("fc"."user_id" = "fi"."user_id") AND ("fc"."slug" = 'prepared-meal'::"text")))))
        ), "vendor_totals" AS (
         SELECT "delivered"."user_id",
            "delivered"."vendor_id",
            "count"(DISTINCT "delivered"."delivered_on") AS "delivery_count",
            "max"("delivered"."delivered_on") AS "last_delivered_on"
           FROM "delivered"
          GROUP BY "delivered"."user_id", "delivered"."vendor_id"
        ), "latest" AS (
         SELECT DISTINCT ON ("delivered"."user_id", "delivered"."vendor_id", "delivered"."slug") "delivered"."user_id",
            "delivered"."vendor_id",
            "delivered"."slug",
            "delivered"."name",
            "delivered"."calories",
            "delivered"."protein",
            "delivered"."carbs",
            "delivered"."fats",
            "delivered"."fiber_g",
            "delivered"."sugars",
            "delivered"."saturated_fat_g",
            "delivered"."sodium_mg",
            "delivered"."serving_size",
            "delivered"."image_primary_url",
            "delivered"."delivered_on"
           FROM "delivered"
          ORDER BY "delivered"."user_id", "delivered"."vendor_id", "delivered"."slug", "delivered"."created_at" DESC
        )
 SELECT "l"."user_id",
    "l"."vendor_id",
    "l"."slug",
    "l"."name",
    COALESCE("m"."default_meal_type", 'lunch'::"text") AS "slot",
    "l"."calories",
    "l"."protein",
    "l"."carbs",
    "l"."fats",
    "l"."fiber_g",
    "l"."sugars",
    "l"."saturated_fat_g",
    "l"."sodium_mg",
    "l"."serving_size",
    "l"."image_primary_url",
    "l"."delivered_on" AS "last_delivered_on",
    "v"."delivery_count" AS "vendor_delivery_count",
    "v"."last_delivered_on" AS "vendor_last_delivered_on"
   FROM (("latest" "l"
     JOIN "vendor_totals" "v" ON ((("v"."user_id" = "l"."user_id") AND ("v"."vendor_id" = "l"."vendor_id"))))
     LEFT JOIN "public"."meals" "m" ON ((("m"."user_id" = "l"."user_id") AND ("m"."slug" = "l"."slug"))));


ALTER VIEW "public"."prepared_meal_delivery_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "height_cm" numeric(5,2),
    "target_weight_kg" numeric(5,2),
    "target_calories" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_admin" boolean DEFAULT false,
    "target_water_oz" integer DEFAULT 64 NOT NULL,
    "quick_add_oz" integer[] DEFAULT ARRAY[8, 12, 16, 20] NOT NULL,
    "water_window_start" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "water_window_end" time without time zone DEFAULT '23:00:00'::time without time zone NOT NULL,
    "water_workout_bonus_oz" integer DEFAULT 0 NOT NULL,
    "water_reminders_enabled" boolean DEFAULT false NOT NULL,
    "water_reminder_times" "text"[] DEFAULT ARRAY['08:00'::"text", '12:00'::"text", '16:00'::"text", '20:00'::"text"] NOT NULL,
    "quick_add_names" "text"[] DEFAULT ARRAY[''::"text", ''::"text", ''::"text", ''::"text"] NOT NULL,
    "quick_add_types" "text"[] DEFAULT ARRAY['water'::"text", 'water'::"text", 'water'::"text", 'water'::"text"] NOT NULL,
    "water_display_unit" "text" DEFAULT 'oz'::"text" NOT NULL,
    "water_only_counts" boolean DEFAULT false NOT NULL,
    "target_protein_g" integer,
    "target_carbs_g" integer,
    "target_sodium_mg" integer,
    "target_fats_g" integer,
    "target_sugars_g" integer,
    "target_fiber_g" integer,
    "breakfast_time" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "lunch_time" time without time zone DEFAULT '12:00:00'::time without time zone NOT NULL,
    "dinner_time" time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    "meal_reminders_enabled" boolean DEFAULT false NOT NULL,
    "meal_reminder_times" "text"[] DEFAULT ARRAY['08:00'::"text", '12:00'::"text", '18:00'::"text"] NOT NULL,
    "meal_reminder_types" "text"[] DEFAULT ARRAY['breakfast'::"text", 'lunch'::"text", 'dinner'::"text"] NOT NULL,
    "eat_nudges_enabled" boolean DEFAULT false NOT NULL,
    "birthdate" "date",
    "sex" "text",
    "health_notes" "text",
    "target_saturated_fat_g" integer,
    "bfr_bands_available" boolean DEFAULT false NOT NULL,
    CONSTRAINT "meal_times_valid" CHECK ((("breakfast_time" < "lunch_time") AND ("lunch_time" < "dinner_time"))),
    CONSTRAINT "profiles_meal_reminder_times_check" CHECK ((("array_length"("meal_reminder_times", 1) >= 1) AND ("array_length"("meal_reminder_times", 1) <= 12))),
    CONSTRAINT "profiles_quick_add_oz_check" CHECK (((("array_length"("quick_add_oz", 1) >= 1) AND ("array_length"("quick_add_oz", 1) <= 6)) AND (0 < ALL ("quick_add_oz")))),
    CONSTRAINT "profiles_sex_check" CHECK (("sex" = ANY (ARRAY['male'::"text", 'female'::"text"]))),
    CONSTRAINT "profiles_target_carbs_g_check" CHECK ((("target_carbs_g" IS NULL) OR ("target_carbs_g" > 0))),
    CONSTRAINT "profiles_target_fats_g_check" CHECK ((("target_fats_g" IS NULL) OR ("target_fats_g" > 0))),
    CONSTRAINT "profiles_target_fiber_g_check" CHECK ((("target_fiber_g" IS NULL) OR ("target_fiber_g" > 0))),
    CONSTRAINT "profiles_target_protein_g_check" CHECK ((("target_protein_g" IS NULL) OR ("target_protein_g" > 0))),
    CONSTRAINT "profiles_target_saturated_fat_g_check" CHECK ((("target_saturated_fat_g" IS NULL) OR ("target_saturated_fat_g" > 0))),
    CONSTRAINT "profiles_target_sodium_mg_check" CHECK ((("target_sodium_mg" IS NULL) OR ("target_sodium_mg" > 0))),
    CONSTRAINT "profiles_target_sugars_g_check" CHECK ((("target_sugars_g" IS NULL) OR ("target_sugars_g" > 0))),
    CONSTRAINT "profiles_target_water_oz_check" CHECK (("target_water_oz" > 0)),
    CONSTRAINT "profiles_water_display_unit_check" CHECK (("water_display_unit" = ANY (ARRAY['oz'::"text", 'L'::"text"]))),
    CONSTRAINT "profiles_water_reminder_times_check" CHECK ((("array_length"("water_reminder_times", 1) >= 1) AND ("array_length"("water_reminder_times", 1) <= 12))),
    CONSTRAINT "profiles_water_workout_bonus_oz_check" CHECK (("water_workout_bonus_oz" >= 0)),
    CONSTRAINT "water_window_valid" CHECK (("water_window_end" > "water_window_start"))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."target_saturated_fat_g" IS 'Daily saturated fat target in grams. Null means the user has not set one, and the card draws no bar.';



CREATE TABLE IF NOT EXISTS "public"."program_cycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "cycle_number" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "duration_weeks" integer NOT NULL,
    CONSTRAINT "program_cycles_cycle_number_check" CHECK (("cycle_number" > 0)),
    CONSTRAINT "program_cycles_duration_weeks_check" CHECK (("duration_weeks" > 0))
);


ALTER TABLE "public"."program_cycles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "instance_name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "expected_end_date" "date" NOT NULL,
    "actual_end_date" "date",
    "current_week" integer DEFAULT 1 NOT NULL,
    "current_day" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "workouts_completed" integer DEFAULT 0 NOT NULL,
    "total_workouts" integer NOT NULL,
    CONSTRAINT "program_instances_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'paused'::"text", 'abandoned'::"text"]))),
    CONSTRAINT "valid_dates" CHECK (("expected_end_date" >= "start_date"))
);


ALTER TABLE "public"."program_instances" OWNER TO "postgres";


COMMENT ON TABLE "public"."program_instances" IS 'Stores user program instances. Sample data includes "Summer Build 2024" (completed) and "Project Mass - Take 1" (incomplete).';



CREATE TABLE IF NOT EXISTS "public"."program_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "media_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "storage_path" "text",
    "external_url" "text",
    "file_size_bytes" bigint,
    "duration_seconds" integer,
    "thumbnail_url" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "program_media_check" CHECK ((("storage_path" IS NOT NULL) OR ("external_url" IS NOT NULL))),
    CONSTRAINT "program_media_media_type_check" CHECK (("media_type" = ANY (ARRAY['video'::"text", 'pdf'::"text", 'document'::"text", 'image'::"text"])))
);


ALTER TABLE "public"."program_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text" NOT NULL,
    "creator_name" "text" NOT NULL,
    "creator_id" "uuid",
    "duration_weeks" integer NOT NULL,
    "days_per_week" integer NOT NULL,
    "minutes_per_session" integer NOT NULL,
    "primary_goal" "text" NOT NULL,
    "difficulty_level" "text" NOT NULL,
    "training_style" "text",
    "cover_image_url" "text",
    "video_preview_url" "text",
    "is_published" boolean DEFAULT false NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "tags" "text"[],
    "prerequisites" "text"[],
    "equipment_required" "text"[],
    "subtitle" "text",
    CONSTRAINT "program_templates_days_per_week_check" CHECK ((("days_per_week" > 0) AND ("days_per_week" <= 7))),
    CONSTRAINT "program_templates_difficulty_level_check" CHECK (("difficulty_level" = ANY (ARRAY['Beginner'::"text", 'Intermediate'::"text", 'Advanced'::"text"]))),
    CONSTRAINT "program_templates_duration_weeks_check" CHECK (("duration_weeks" > 0)),
    CONSTRAINT "program_templates_minutes_per_session_check" CHECK (("minutes_per_session" > 0)),
    CONSTRAINT "program_templates_primary_goal_check" CHECK (("primary_goal" = ANY (ARRAY['Strength'::"text", 'Hypertrophy'::"text", 'Power'::"text", 'Endurance'::"text", 'Hybrid'::"text"])))
);


ALTER TABLE "public"."program_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."program_templates"."subtitle" IS 'Short subtitle/tagline for the program';



CREATE TABLE IF NOT EXISTS "public"."program_workout_exercise_progressions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "program_workout_exercise_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "intensity_percentage" numeric(5,2),
    "rpe_target" numeric(3,1),
    "volume_sets" integer,
    "week_notes" "text",
    "target_reps_min" integer,
    "target_reps_max" integer,
    CONSTRAINT "prog_target_reps_max_check" CHECK ((("target_reps_max" IS NULL) OR ("target_reps_min" IS NULL) OR ("target_reps_max" >= "target_reps_min"))),
    CONSTRAINT "prog_target_reps_min_check" CHECK ((("target_reps_min" IS NULL) OR ("target_reps_min" > 0))),
    CONSTRAINT "program_workout_exercise_progression_intensity_percentage_check" CHECK ((("intensity_percentage" > (0)::numeric) AND ("intensity_percentage" <= (200)::numeric))),
    CONSTRAINT "program_workout_exercise_progressions_rpe_target_check" CHECK ((("rpe_target" >= (1)::numeric) AND ("rpe_target" <= (10)::numeric))),
    CONSTRAINT "program_workout_exercise_progressions_volume_sets_check" CHECK (("volume_sets" > 0)),
    CONSTRAINT "program_workout_exercise_progressions_week_number_check" CHECK (("week_number" > 0))
);


ALTER TABLE "public"."program_workout_exercise_progressions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_workout_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "program_workout_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "exercise_order" integer NOT NULL,
    "target_sets" integer,
    "target_reps_min" integer,
    "target_reps_max" integer,
    "target_rpe_min" numeric(3,1),
    "target_rpe_max" numeric(3,1),
    "rest_seconds" integer,
    "exercise_notes" "text",
    "tempo" "text",
    "section" "text",
    "target_time_seconds" integer,
    "is_per_side" boolean DEFAULT false,
    "load_type" "text",
    "load_percentage_1rm" integer,
    "load_weight_lbs" integer,
    "load_notes" "text",
    "estimated_duration_minutes" integer,
    "video_url" "text",
    "group_id" "uuid",
    "group_type" "text",
    "group_item_order" integer DEFAULT 0,
    "superset_group" integer,
    CONSTRAINT "program_workout_exercises_check" CHECK (("target_reps_max" >= "target_reps_min")),
    CONSTRAINT "program_workout_exercises_check1" CHECK ((("target_rpe_max" >= "target_rpe_min") AND ("target_rpe_max" <= (10)::numeric))),
    CONSTRAINT "program_workout_exercises_estimated_duration_minutes_check" CHECK (("estimated_duration_minutes" > 0)),
    CONSTRAINT "program_workout_exercises_exercise_order_check" CHECK (("exercise_order" > 0)),
    CONSTRAINT "program_workout_exercises_group_type_check" CHECK ((("group_type" IS NULL) OR ("group_type" = ANY (ARRAY['or'::"text", 'superset'::"text", 'circuit'::"text", 'emom'::"text"])))),
    CONSTRAINT "program_workout_exercises_load_percentage_1rm_check" CHECK ((("load_percentage_1rm" >= 1) AND ("load_percentage_1rm" <= 100))),
    CONSTRAINT "program_workout_exercises_load_type_check" CHECK (("load_type" = ANY (ARRAY['rpe'::"text", 'percentage_1rm'::"text", 'weight'::"text", 'notes'::"text", 'none'::"text"]))),
    CONSTRAINT "program_workout_exercises_load_weight_lbs_check" CHECK (("load_weight_lbs" > 0)),
    CONSTRAINT "program_workout_exercises_rest_seconds_check" CHECK (("rest_seconds" >= 0)),
    CONSTRAINT "program_workout_exercises_section_check" CHECK (("section" = ANY (ARRAY['Warmup'::"text", 'Prehab'::"text", 'Strength'::"text", 'Accessory'::"text", 'Isometric'::"text", 'Cooldown'::"text"]))),
    CONSTRAINT "program_workout_exercises_target_reps_min_check" CHECK (("target_reps_min" > 0)),
    CONSTRAINT "program_workout_exercises_target_rpe_min_check" CHECK ((("target_rpe_min" >= (1)::numeric) AND ("target_rpe_min" <= (10)::numeric))),
    CONSTRAINT "program_workout_exercises_target_sets_check" CHECK (("target_sets" > 0)),
    CONSTRAINT "program_workout_exercises_target_time_seconds_check" CHECK (("target_time_seconds" > 0))
);


ALTER TABLE "public"."program_workout_exercises" OWNER TO "postgres";


COMMENT ON COLUMN "public"."program_workout_exercises"."group_id" IS 'UUID linking exercises that belong to the same group (OR, superset, etc.)';



COMMENT ON COLUMN "public"."program_workout_exercises"."group_type" IS 'Type of group: or (pick one), superset, circuit, emom';



COMMENT ON COLUMN "public"."program_workout_exercises"."group_item_order" IS 'Order of exercise within its group (0-indexed)';



CREATE TABLE IF NOT EXISTS "public"."program_workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "program_id" "uuid" NOT NULL,
    "cycle_id" "uuid",
    "week_number" integer NOT NULL,
    "day_number" integer NOT NULL,
    "name" "text" NOT NULL,
    "workout_type" "text" NOT NULL,
    "estimated_duration_minutes" integer,
    "warmup_instructions" "text",
    "cooldown_instructions" "text",
    "notes" "text",
    CONSTRAINT "program_workouts_day_number_check" CHECK (("day_number" > 0)),
    CONSTRAINT "program_workouts_estimated_duration_minutes_check" CHECK (("estimated_duration_minutes" > 0)),
    CONSTRAINT "program_workouts_week_number_check" CHECK (("week_number" > 0)),
    CONSTRAINT "program_workouts_workout_type_check" CHECK (("workout_type" = ANY (ARRAY['Strength'::"text", 'Hypertrophy'::"text", 'Power'::"text", 'Endurance'::"text", 'Rest'::"text", 'Deload'::"text"])))
);


ALTER TABLE "public"."program_workouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."progress_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "photo_url" "text" NOT NULL,
    "view_type" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "progress_photos_view_type_check" CHECK (("view_type" = ANY (ARRAY['front'::"text", 'side'::"text", 'back'::"text"])))
);


ALTER TABLE "public"."progress_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."range_depths" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."range_depths" OWNER TO "postgres";


COMMENT ON TABLE "public"."range_depths" IS 'Depth or range of motion specifications';



CREATE TABLE IF NOT EXISTS "public"."saved_foods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "brand" "text",
    "barcode" "text",
    "calories" integer,
    "protein" numeric(6,2),
    "carbs" numeric(6,2),
    "fats" numeric(6,2),
    "sugars" numeric(6,2),
    "serving_size" "text",
    "image_primary_url" "text",
    "image_front_url" "text",
    "image_back_url" "text",
    "is_favorite" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sodium_mg" numeric(6,2),
    "fiber_g" numeric(6,2),
    "user_corrected" boolean DEFAULT false NOT NULL,
    "auto_scaled" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "saturated_fat_g" numeric(6,2),
    "beverage_kinds" "text"[],
    CONSTRAINT "saved_foods_beverage_kinds_check" CHECK ((("beverage_kinds" IS NULL) OR (("array_length"("beverage_kinds", 1) >= 1) AND ("beverage_kinds" <@ ARRAY['protein_shake'::"text", 'meal_replacement_shake'::"text", 'weight_gain_shake'::"text", 'smoothie'::"text", 'energy_drink'::"text", 'other'::"text"])))),
    CONSTRAINT "saved_foods_calories_check" CHECK (("calories" >= 0)),
    CONSTRAINT "saved_foods_carbs_check" CHECK (("carbs" >= (0)::numeric)),
    CONSTRAINT "saved_foods_fats_check" CHECK (("fats" >= (0)::numeric)),
    CONSTRAINT "saved_foods_protein_check" CHECK (("protein" >= (0)::numeric)),
    CONSTRAINT "saved_foods_saturated_fat_g_check" CHECK (("saturated_fat_g" >= (0)::numeric)),
    CONSTRAINT "saved_foods_sugars_check" CHECK (("sugars" >= (0)::numeric))
);


ALTER TABLE "public"."saved_foods" OWNER TO "postgres";


COMMENT ON TABLE "public"."saved_foods" IS 'Personal food library for quick meal logging from barcode scans';



COMMENT ON COLUMN "public"."saved_foods"."saturated_fat_g" IS 'Grams of saturated fat per serving. The sibling of the existing sodium_mg column.';



COMMENT ON COLUMN "public"."saved_foods"."beverage_kinds" IS 'What the product is when it is a drink. NULL = food. Drives which log door offers it: any kind = the Beverage door; meal_replacement_shake additionally = meal search.';



CREATE TABLE IF NOT EXISTS "public"."schedule_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "title" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "date" "date",
    "is_recurring" boolean DEFAULT false,
    "recurrence_days" integer[],
    "status" "text" DEFAULT 'pending'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "schedule_events_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."schedule_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scoring_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."scoring_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "block" "text",
    "instruction" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_adjustments_block_check" CHECK (("block" = ANY (ARRAY['warmup'::"text", 'mobility'::"text", 'main'::"text", 'conditioning'::"text", 'cooldown'::"text"]))),
    CONSTRAINT "session_adjustments_instruction_check" CHECK ((("char_length"("instruction") >= 1) AND ("char_length"("instruction") <= 500)))
);


ALTER TABLE "public"."session_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_debriefs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "verdict" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_debriefs_note_check" CHECK ((("note" IS NULL) OR ("char_length"("note") <= 500))),
    CONSTRAINT "session_debriefs_verdict_check" CHECK (("verdict" = ANY (ARRAY['too_easy'::"text", 'just_right'::"text", 'too_much'::"text"])))
);


ALTER TABLE "public"."session_debriefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."set_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "exercise_instance_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "set_number" integer NOT NULL,
    "target_reps" integer,
    "target_weight_lbs" numeric(6,2),
    "actual_reps" integer NOT NULL,
    "actual_weight_lbs" numeric(6,2) NOT NULL,
    "rpe" numeric(3,1),
    "volume_lbs" numeric(8,2) GENERATED ALWAYS AS (("actual_weight_lbs" * ("actual_reps")::numeric)) STORED,
    "is_warmup" boolean DEFAULT false NOT NULL,
    "is_failure" boolean DEFAULT false NOT NULL,
    "difficulty_rating" "text",
    "increase_weight" boolean DEFAULT false NOT NULL,
    "difficulty" "text",
    "increase_weight_next" boolean DEFAULT false,
    "rest_duration_seconds" integer,
    "notes" "text",
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "duration_seconds" integer,
    "timing_source" "text",
    CONSTRAINT "set_instances_actual_reps_check" CHECK (("actual_reps" >= 0)),
    CONSTRAINT "set_instances_actual_weight_lbs_check" CHECK (("actual_weight_lbs" >= (0)::numeric)),
    CONSTRAINT "set_instances_difficulty_rating_check" CHECK ((("difficulty_rating" IS NULL) OR ("difficulty_rating" = ANY (ARRAY['e'::"text", 'em'::"text", 'm'::"text", 'mh'::"text", 'h'::"text", 'vh'::"text"])))),
    CONSTRAINT "set_instances_duration_seconds_check" CHECK ((("duration_seconds" IS NULL) OR ("duration_seconds" >= 0))),
    CONSTRAINT "set_instances_rpe_check" CHECK ((("rpe" >= (1)::numeric) AND ("rpe" <= (10)::numeric))),
    CONSTRAINT "set_instances_set_number_check" CHECK (("set_number" > 0)),
    CONSTRAINT "set_instances_timing_source_check" CHECK ((("timing_source" IS NULL) OR ("timing_source" = ANY (ARRAY['measured'::"text", 'entered'::"text"]))))
);


ALTER TABLE "public"."set_instances" OWNER TO "postgres";


COMMENT ON COLUMN "public"."set_instances"."started_at" IS 'When the set began. Measured by the timer in live mode; given or chained from the previous set in backfill.';



COMMENT ON COLUMN "public"."set_instances"."ended_at" IS 'When the set finished. NULL when only a duration is known and no anchor time was ever set.';



COMMENT ON COLUMN "public"."set_instances"."duration_seconds" IS 'How long the set took. Authoritative when entered directly; otherwise ended_at - started_at.';



COMMENT ON COLUMN "public"."set_instances"."timing_source" IS 'measured = the timer ran. entered = you typed it in after the fact. NULL = a set logged before any of this existed.';



CREATE TABLE IF NOT EXISTS "public"."shopping_list" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "food_inventory_id" "uuid",
    "name" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "unit" "text" NOT NULL,
    "priority" integer DEFAULT 2,
    "is_purchased" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purchased_at" timestamp with time zone,
    "vendor_id" "uuid",
    "source_meal_id" "uuid",
    "source_saved_food_id" "uuid",
    CONSTRAINT "shopping_list_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 3))),
    CONSTRAINT "shopping_list_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."shopping_list" OWNER TO "postgres";


COMMENT ON TABLE "public"."shopping_list" IS 'Shopping list/cart for items to purchase';



COMMENT ON COLUMN "public"."shopping_list"."source_meal_id" IS 'The meal whose gap produced this row, when it came from one. Null for manual rows and for stock-driven suggestions.';



COMMENT ON COLUMN "public"."shopping_list"."source_saved_food_id" IS 'The meal ingredient this row stands for. The handle for linking a purchase back to the concept that made the meal un-makeable.';



CREATE TABLE IF NOT EXISTS "public"."source_exercises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "was_created" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."source_exercises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stances" OWNER TO "postgres";


COMMENT ON TABLE "public"."stances" IS 'Foot and leg positioning during movement';



CREATE TABLE IF NOT EXISTS "public"."symmetries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."symmetries" OWNER TO "postgres";


COMMENT ON TABLE "public"."symmetries" IS 'Bilateral vs unilateral loading patterns';



CREATE TABLE IF NOT EXISTS "public"."ticket_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text",
    "mime_type" "text",
    "size_bytes" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ticket_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."todos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "due_date" timestamp with time zone,
    "priority" "text" DEFAULT 'medium'::"text",
    "category" "text" DEFAULT 'personal'::"text",
    "is_completed" boolean DEFAULT false,
    "completed_at" timestamp with time zone,
    "recurrence" "jsonb",
    "cron_job_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."todos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_machine_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "gym_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "seat_position" integer,
    "back_pad_position" integer,
    "rack_height" integer,
    "cable_height" integer,
    "foot_plate_position" integer,
    "grip_width_position" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_machine_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "current_gym_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "weight_lbs" numeric(5,1),
    "goal_weight_lbs" numeric(5,1),
    "height_inches" integer,
    "date_of_birth" "date",
    "gender" "text",
    "training_experience" "text",
    "primary_goal" "text",
    "injuries" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."variation_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."variation_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."variation_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "movement_family_id" "uuid",
    "plane_of_motion_id" "uuid",
    "load_position_id" "uuid",
    "stance_id" "uuid",
    "range_depth_id" "uuid",
    "movement_style_id" "uuid",
    "symmetry_id" "uuid",
    "skill_level" "text",
    "short_name" "text",
    "aliases" "text"[],
    CONSTRAINT "variation_options_skill_level_check" CHECK (("skill_level" = ANY (ARRAY['Beginner'::"text", 'Intermediate'::"text", 'Advanced'::"text"])))
);


ALTER TABLE "public"."variation_options" OWNER TO "postgres";


COMMENT ON COLUMN "public"."variation_options"."display_order" IS 'Order for sorting variations in UI (lower numbers first)';



COMMENT ON COLUMN "public"."variation_options"."movement_family_id" IS 'Override: Movement family for this variation (if different from base exercise)';



COMMENT ON COLUMN "public"."variation_options"."plane_of_motion_id" IS 'Override: Plane of motion for this variation';



COMMENT ON COLUMN "public"."variation_options"."load_position_id" IS 'Load position specific to this variation (e.g., Overhead, FrontRack)';



COMMENT ON COLUMN "public"."variation_options"."stance_id" IS 'Stance specific to this variation (e.g., Single-Leg, Split, Wide)';



COMMENT ON COLUMN "public"."variation_options"."range_depth_id" IS 'Depth specification for this variation (e.g., ATG, Parallel, Box)';



COMMENT ON COLUMN "public"."variation_options"."movement_style_id" IS 'Execution style for this variation (e.g., Strict, Kipping, Pause, Tempo)';



COMMENT ON COLUMN "public"."variation_options"."symmetry_id" IS 'Symmetry pattern for this variation (e.g., Bilateral, Unilateral)';



COMMENT ON COLUMN "public"."variation_options"."skill_level" IS 'Override: Skill level for this variation (if different from base exercise)';



COMMENT ON COLUMN "public"."variation_options"."short_name" IS 'Abbreviated name for UI display';



COMMENT ON COLUMN "public"."variation_options"."aliases" IS 'Alternative names and search terms';



CREATE TABLE IF NOT EXISTS "public"."water_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "amount_oz" numeric(10,2) NOT NULL,
    "logged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "beverage_type" "text" DEFAULT 'water'::"text" NOT NULL,
    CONSTRAINT "water_logs_amount_oz_check" CHECK (("amount_oz" > (0)::numeric)),
    CONSTRAINT "water_logs_beverage_type_check" CHECK (("beverage_type" = ANY (ARRAY['water'::"text", 'coffee'::"text", 'tea'::"text", 'juice'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."water_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weight_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "weight_lbs" numeric(10,2) NOT NULL,
    "time_of_day" "text",
    "logged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "weight_logs_time_of_day_check" CHECK (("time_of_day" = ANY (ARRAY['morning'::"text", 'evening'::"text"]))),
    CONSTRAINT "weight_logs_weight_lbs_check" CHECK (("weight_lbs" > (0)::numeric))
);


ALTER TABLE "public"."weight_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wod_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."wod_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wod_formats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."wod_formats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wod_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wod_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "movement_order" integer NOT NULL,
    "rx_reps" integer,
    "rx_weight_lbs" numeric(10,2),
    "rx_movement_variation" "text",
    "l2_reps" "text",
    "l2_weight_lbs" numeric(10,2),
    "l2_movement_variation" "text",
    "l1_reps" "text",
    "l1_weight_lbs" numeric(10,2),
    "l1_movement_variation" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "rx_distance" numeric(10,2),
    "rx_time" integer,
    "l2_distance" numeric(10,2),
    "l2_time" integer,
    "l1_distance" numeric(10,2),
    "l1_time" integer,
    "rx_weight_men_lbs" numeric(10,2),
    "rx_weight_women_lbs" numeric(10,2),
    "l2_weight_men_lbs" numeric(10,2),
    "l2_weight_women_lbs" numeric(10,2),
    "l1_weight_men_lbs" numeric(10,2),
    "l1_weight_women_lbs" numeric(10,2),
    "custom_rep_scheme" "text",
    "follows_wod_scheme" boolean DEFAULT true,
    "rx_distance_value" numeric,
    "rx_distance_unit" "text" DEFAULT 'meters'::"text",
    "l2_distance_value" numeric,
    "l2_distance_unit" "text" DEFAULT 'meters'::"text",
    "l1_distance_value" numeric,
    "l1_distance_unit" "text" DEFAULT 'meters'::"text",
    "rx_alternative_exercise_id" "uuid",
    "rx_alternative_exercise_name" "text",
    "l2_alternative_exercise_id" "uuid",
    "l2_alternative_exercise_name" "text",
    "l1_alternative_exercise_id" "uuid",
    "l1_alternative_exercise_name" "text",
    CONSTRAINT "check_l1_distance_unit" CHECK ((("l1_distance_unit" IS NULL) OR ("l1_distance_unit" = ANY (ARRAY['meters'::"text", 'feet'::"text", 'miles'::"text", 'kilometers'::"text"])))),
    CONSTRAINT "check_l2_distance_unit" CHECK ((("l2_distance_unit" IS NULL) OR ("l2_distance_unit" = ANY (ARRAY['meters'::"text", 'feet'::"text", 'miles'::"text", 'kilometers'::"text"])))),
    CONSTRAINT "check_rx_distance_unit" CHECK ((("rx_distance_unit" IS NULL) OR ("rx_distance_unit" = ANY (ARRAY['meters'::"text", 'feet'::"text", 'miles'::"text", 'kilometers'::"text"]))))
);


ALTER TABLE "public"."wod_movements" OWNER TO "postgres";


COMMENT ON COLUMN "public"."wod_movements"."rx_weight_lbs" IS 'DEPRECATED: Use rx_weight_men_lbs and rx_weight_women_lbs for gender-specific weights';



COMMENT ON COLUMN "public"."wod_movements"."l2_reps" IS 'L2 reps: can be a number (e.g., "15") or rep scheme pattern (e.g., "15-12-9" for descending scheme)';



COMMENT ON COLUMN "public"."wod_movements"."l2_weight_lbs" IS 'DEPRECATED: Use l2_weight_men_lbs and l2_weight_women_lbs for gender-specific weights';



COMMENT ON COLUMN "public"."wod_movements"."l1_reps" IS 'L1 reps: can be a number (e.g., "15") or rep scheme pattern (e.g., "15-12-9-6-3" for reduced descending scheme)';



COMMENT ON COLUMN "public"."wod_movements"."l1_weight_lbs" IS 'DEPRECATED: Use l1_weight_men_lbs and l1_weight_women_lbs for gender-specific weights';



COMMENT ON COLUMN "public"."wod_movements"."rx_distance" IS 'Distance in meters for Rx scaling (e.g., 400m run)';



COMMENT ON COLUMN "public"."wod_movements"."rx_time" IS 'Time in seconds for Rx scaling (e.g., 60s plank hold)';



COMMENT ON COLUMN "public"."wod_movements"."l2_distance" IS 'Distance in meters for L2 scaling';



COMMENT ON COLUMN "public"."wod_movements"."l2_time" IS 'Time in seconds for L2 scaling';



COMMENT ON COLUMN "public"."wod_movements"."l1_distance" IS 'Distance in meters for L1 scaling';



COMMENT ON COLUMN "public"."wod_movements"."l1_time" IS 'Time in seconds for L1 scaling';



COMMENT ON COLUMN "public"."wod_movements"."rx_weight_men_lbs" IS 'Rx weight in pounds for men (e.g., 95 lbs for Thrusters)';



COMMENT ON COLUMN "public"."wod_movements"."rx_weight_women_lbs" IS 'Rx weight in pounds for women (e.g., 65 lbs for Thrusters)';



COMMENT ON COLUMN "public"."wod_movements"."l2_weight_men_lbs" IS 'L2 (scaled) weight in pounds for men';



COMMENT ON COLUMN "public"."wod_movements"."l2_weight_women_lbs" IS 'L2 (scaled) weight in pounds for women';



COMMENT ON COLUMN "public"."wod_movements"."l1_weight_men_lbs" IS 'L1 (beginner) weight in pounds for men';



COMMENT ON COLUMN "public"."wod_movements"."l1_weight_women_lbs" IS 'L1 (beginner) weight in pounds for women';



COMMENT ON COLUMN "public"."wod_movements"."custom_rep_scheme" IS 'Override rep scheme for this specific movement (e.g., "10-10-10" when WOD scheme is "21-15-9"). NULL means follow WOD-level rep scheme.';



COMMENT ON COLUMN "public"."wod_movements"."follows_wod_scheme" IS 'True if movement uses WOD rep scheme, false if using custom_rep_scheme. Defaults to true.';



COMMENT ON COLUMN "public"."wod_movements"."rx_distance_value" IS 'Rx distance value (e.g., 400 for 400m)';



COMMENT ON COLUMN "public"."wod_movements"."rx_distance_unit" IS 'Rx distance unit: meters, feet, miles, kilometers';



COMMENT ON COLUMN "public"."wod_movements"."l2_distance_value" IS 'L2 distance value (e.g., 300 for 300m)';



COMMENT ON COLUMN "public"."wod_movements"."l2_distance_unit" IS 'L2 distance unit: meters, feet, miles, kilometers';



COMMENT ON COLUMN "public"."wod_movements"."l1_distance_value" IS 'L1 distance value (e.g., 200 for 200m)';



COMMENT ON COLUMN "public"."wod_movements"."l1_distance_unit" IS 'L1 distance unit: meters, feet, miles, kilometers';



COMMENT ON COLUMN "public"."wod_movements"."rx_alternative_exercise_id" IS 'Alternative movement that replaces the base movement at Rx level';



COMMENT ON COLUMN "public"."wod_movements"."rx_alternative_exercise_name" IS 'Denormalized name of alternative exercise for display purposes';



COMMENT ON COLUMN "public"."wod_movements"."l2_alternative_exercise_id" IS 'Alternative movement that replaces the base movement at L2 level';



COMMENT ON COLUMN "public"."wod_movements"."l2_alternative_exercise_name" IS 'Denormalized name of alternative exercise for display purposes';



COMMENT ON COLUMN "public"."wod_movements"."l1_alternative_exercise_id" IS 'Alternative movement that replaces the base movement at L1 level';



COMMENT ON COLUMN "public"."wod_movements"."l1_alternative_exercise_name" IS 'Denormalized name of alternative exercise for display purposes';



CREATE TABLE IF NOT EXISTS "public"."wod_scaling_levels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wod_id" "uuid" NOT NULL,
    "level_name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "wod_scaling_levels_level_name_check" CHECK (("level_name" = ANY (ARRAY['Rx'::"text", 'L2'::"text", 'L1'::"text"])))
);


ALTER TABLE "public"."wod_scaling_levels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "format_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "time_cap_minutes" integer,
    "score_type_time" boolean DEFAULT false,
    "score_type_rounds" boolean DEFAULT false,
    "score_type_reps" boolean DEFAULT false,
    "score_type_load" boolean DEFAULT false,
    "score_type_distance" boolean DEFAULT false,
    "score_type_calories" boolean DEFAULT false,
    "notes" "text",
    "rep_scheme_type" "text",
    "rep_scheme" "text",
    "rep_scheme_rounds" integer,
    "image_url" "text",
    "image_generated_at" timestamp with time zone,
    "image_generation_failed" boolean DEFAULT false,
    CONSTRAINT "wods_rep_scheme_type_check" CHECK (("rep_scheme_type" = ANY (ARRAY['descending'::"text", 'fixed_rounds'::"text", 'chipper'::"text", 'ascending'::"text", 'distance'::"text", 'custom'::"text", '1rm'::"text", '3rm'::"text", '5rm'::"text", '10rm'::"text", '5x5'::"text", '3x3'::"text", 'descending_volume'::"text", 'complex'::"text"])))
);


ALTER TABLE "public"."wods" OWNER TO "postgres";


COMMENT ON COLUMN "public"."wods"."rep_scheme_type" IS 'Type of rep scheme: descending (21-15-9), fixed_rounds (3 RFT), chipper (single pass), ascending (1-2-3-4-5), distance (2000m), custom';



COMMENT ON COLUMN "public"."wods"."rep_scheme" IS 'String representation of rep scheme (e.g., "21-18-15-12-9-6-3" or "3" for fixed rounds)';



COMMENT ON COLUMN "public"."wods"."rep_scheme_rounds" IS 'DEPRECATED: Number of rounds for fixed_rounds type (now stored in rep_scheme as string)';



COMMENT ON COLUMN "public"."wods"."image_url" IS 'URL to generated WOD image in Supabase Storage';



COMMENT ON COLUMN "public"."wods"."image_generated_at" IS 'Timestamp when the image was generated';



COMMENT ON COLUMN "public"."wods"."image_generation_failed" IS 'Flag indicating if image generation failed (for retry logic)';



CREATE TABLE IF NOT EXISTS "public"."workout_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "program_instance_id" "uuid",
    "program_workout_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "week_number" integer NOT NULL,
    "day_number" integer NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "total_duration_minutes" integer,
    "total_volume_lbs" integer,
    "notes" "text",
    "energy_level" integer,
    "overall_difficulty" integer,
    "end_date" "date",
    "completion_status" "text",
    "gym_id" "uuid",
    "difficulty" "text",
    "increase_weight_next" boolean DEFAULT false,
    "total_rest_seconds" integer,
    "duration_seconds" integer DEFAULT 0,
    CONSTRAINT "workout_instances_completion_status_check" CHECK (("completion_status" = ANY (ARRAY['completed'::"text", 'partial'::"text"]))),
    CONSTRAINT "workout_instances_end_date_check" CHECK ((("end_date" IS NULL) OR ("end_date" >= "scheduled_date"))),
    CONSTRAINT "workout_instances_energy_level_check" CHECK ((("energy_level" >= 1) AND ("energy_level" <= 10))),
    CONSTRAINT "workout_instances_overall_difficulty_check" CHECK ((("overall_difficulty" >= 1) AND ("overall_difficulty" <= 10))),
    CONSTRAINT "workout_instances_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'in_progress'::"text", 'completed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."workout_instances" OWNER TO "postgres";


COMMENT ON COLUMN "public"."workout_instances"."program_instance_id" IS 'NULL for standalone daily sessions (see generated_sessions.workout_instance_id).';



CREATE TABLE IF NOT EXISTS "public"."workout_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "schedule_event_id" "uuid",
    "date" "date" NOT NULL,
    "workout_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "planned_start_time" time without time zone,
    "planned_end_time" time without time zone,
    "actual_start_time" time without time zone,
    "actual_end_time" time without time zone,
    "exercises" "jsonb",
    "notes" "text",
    "logged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workout_logs_workout_type_check" CHECK (("workout_type" = ANY (ARRAY['bodybuilding'::"text", 'crossfit'::"text", 'cardio'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."workout_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workout_instance_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_number" integer DEFAULT 1 NOT NULL,
    "session_date" "date" NOT NULL,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "duration_seconds" integer DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workout_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."workout_sessions" IS 'Individual sessions within a workout instance (for split workouts done across multiple days)';



COMMENT ON COLUMN "public"."workout_sessions"."session_number" IS 'Sequential session number within the workout (1, 2, 3...)';



COMMENT ON COLUMN "public"."workout_sessions"."session_date" IS 'The actual date this session was performed';



COMMENT ON COLUMN "public"."workout_sessions"."duration_seconds" IS 'How long this specific session took';



CREATE TABLE IF NOT EXISTS "public"."workouts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "workout_type" "text",
    "duration_minutes" integer,
    "calories_burned" integer,
    "notes" "text",
    "completed_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "workouts_workout_type_check" CHECK (("workout_type" = ANY (ARRAY['strength'::"text", 'cardio'::"text", 'flexibility'::"text", 'sports'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."body_measurements"
    ADD CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calorie_ramp_levels"
    ADD CONSTRAINT "calorie_ramp_levels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calorie_ramp_levels"
    ADD CONSTRAINT "calorie_ramp_levels_user_id_level_key" UNIQUE ("user_id", "level");



ALTER TABLE ONLY "public"."captured_sources"
    ADD CONSTRAINT "captured_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."captured_workout_exercises"
    ADD CONSTRAINT "captured_workout_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."captured_workout_muscles"
    ADD CONSTRAINT "captured_workout_muscles_captured_workout_id_muscle_region__key" UNIQUE ("captured_workout_id", "muscle_region_id");



ALTER TABLE ONLY "public"."captured_workout_muscles"
    ADD CONSTRAINT "captured_workout_muscles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."captured_workout_usage"
    ADD CONSTRAINT "captured_workout_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."captured_workout_usage"
    ADD CONSTRAINT "captured_workout_usage_unique_performance" UNIQUE ("user_id", "captured_workout_id", "performed_date", "block");



ALTER TABLE ONLY "public"."captured_workouts"
    ADD CONSTRAINT "captured_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_parts"
    ADD CONSTRAINT "class_parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_checkin_soreness"
    ADD CONSTRAINT "daily_checkin_soreness_pkey" PRIMARY KEY ("checkin_id", "muscle_region_id");



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_user_id_checkin_date_key" UNIQUE ("user_id", "checkin_date");



ALTER TABLE ONLY "public"."dev_tasks"
    ADD CONSTRAINT "dev_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eat_next_suggestions"
    ADD CONSTRAINT "eat_next_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eating_windows"
    ADD CONSTRAINT "eating_windows_label_unique" UNIQUE ("user_id", "label");



ALTER TABLE ONLY "public"."eating_windows"
    ADD CONSTRAINT "eating_windows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."equipment"
    ADD CONSTRAINT "equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_categories"
    ADD CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_templates"
    ADD CONSTRAINT "event_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_goal_types"
    ADD CONSTRAINT "exercise_goal_types_exercise_id_goal_type_id_key" UNIQUE ("exercise_id", "goal_type_id");



ALTER TABLE ONLY "public"."exercise_goal_types"
    ADD CONSTRAINT "exercise_goal_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_instances"
    ADD CONSTRAINT "exercise_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_load_positions"
    ADD CONSTRAINT "exercise_load_positions_exercise_id_load_position_id_key" UNIQUE ("exercise_id", "load_position_id");



ALTER TABLE ONLY "public"."exercise_load_positions"
    ADD CONSTRAINT "exercise_load_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_movement_styles"
    ADD CONSTRAINT "exercise_movement_styles_exercise_id_movement_style_id_key" UNIQUE ("exercise_id", "movement_style_id");



ALTER TABLE ONLY "public"."exercise_movement_styles"
    ADD CONSTRAINT "exercise_movement_styles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_muscle_regions"
    ADD CONSTRAINT "exercise_muscle_regions_exercise_id_muscle_region_id_key" UNIQUE ("exercise_id", "muscle_region_id");



ALTER TABLE ONLY "public"."exercise_muscle_regions"
    ADD CONSTRAINT "exercise_muscle_regions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_planes_of_motion"
    ADD CONSTRAINT "exercise_planes_of_motion_exercise_id_plane_of_motion_id_key" UNIQUE ("exercise_id", "plane_of_motion_id");



ALTER TABLE ONLY "public"."exercise_planes_of_motion"
    ADD CONSTRAINT "exercise_planes_of_motion_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_scoring_types"
    ADD CONSTRAINT "exercise_scoring_types_exercise_id_scoring_type_id_key" UNIQUE ("exercise_id", "scoring_type_id");



ALTER TABLE ONLY "public"."exercise_scoring_types"
    ADD CONSTRAINT "exercise_scoring_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_skill_state"
    ADD CONSTRAINT "exercise_skill_state_pkey" PRIMARY KEY ("user_id", "exercise_id");



ALTER TABLE ONLY "public"."exercise_stances"
    ADD CONSTRAINT "exercise_stances_exercise_id_stance_id_key" UNIQUE ("exercise_id", "stance_id");



ALTER TABLE ONLY "public"."exercise_stances"
    ADD CONSTRAINT "exercise_stances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_standards"
    ADD CONSTRAINT "exercise_standards_exercise_id_variation_option_id_key" UNIQUE ("exercise_id", "variation_option_id");



ALTER TABLE ONLY "public"."exercise_standards"
    ADD CONSTRAINT "exercise_standards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_variations"
    ADD CONSTRAINT "exercise_variations_exercise_id_variation_option_id_key" UNIQUE ("exercise_id", "variation_option_id");



ALTER TABLE ONLY "public"."exercise_variations"
    ADD CONSTRAINT "exercise_variations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."food_categories"
    ADD CONSTRAINT "food_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_categories"
    ADD CONSTRAINT "food_categories_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."food_concept_links"
    ADD CONSTRAINT "food_concept_links_concept_id_food_inventory_id_key" UNIQUE ("concept_id", "food_inventory_id");



ALTER TABLE ONLY "public"."food_concept_links"
    ADD CONSTRAINT "food_concept_links_concept_id_saved_food_id_key" UNIQUE ("concept_id", "saved_food_id");



ALTER TABLE ONLY "public"."food_concept_links"
    ADD CONSTRAINT "food_concept_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_concepts"
    ADD CONSTRAINT "food_concepts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_concepts"
    ADD CONSTRAINT "food_concepts_user_id_slug_key" UNIQUE ("user_id", "slug");



ALTER TABLE ONLY "public"."food_inventory_category_map"
    ADD CONSTRAINT "food_inventory_category_map_food_inventory_id_category_id_key" UNIQUE ("food_inventory_id", "category_id");



ALTER TABLE ONLY "public"."food_inventory_category_map"
    ADD CONSTRAINT "food_inventory_category_map_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_inventory_locations"
    ADD CONSTRAINT "food_inventory_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_inventory"
    ADD CONSTRAINT "food_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_inventory_subcategory_map"
    ADD CONSTRAINT "food_inventory_subcategory_ma_food_inventory_id_subcategory_key" UNIQUE ("food_inventory_id", "subcategory_id");



ALTER TABLE ONLY "public"."food_inventory_subcategory_map"
    ADD CONSTRAINT "food_inventory_subcategory_map_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_subcategories"
    ADD CONSTRAINT "food_subcategories_category_id_slug_key" UNIQUE ("category_id", "slug");



ALTER TABLE ONLY "public"."food_subcategories"
    ADD CONSTRAINT "food_subcategories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_session_blocks"
    ADD CONSTRAINT "generated_session_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_session_blocks"
    ADD CONSTRAINT "generated_session_blocks_session_id_block_key" UNIQUE ("session_id", "block");



ALTER TABLE ONLY "public"."generated_session_items"
    ADD CONSTRAINT "generated_session_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_sessions"
    ADD CONSTRAINT "generated_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_types"
    ADD CONSTRAINT "goal_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."goal_types"
    ADD CONSTRAINT "goal_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gym_profile_equipment"
    ADD CONSTRAINT "gym_profile_equipment_pkey" PRIMARY KEY ("gym_profile_id", "equipment_id");



ALTER TABLE ONLY "public"."gym_profiles"
    ADD CONSTRAINT "gym_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gyms"
    ADD CONSTRAINT "gyms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_events"
    ADD CONSTRAINT "inventory_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."load_positions"
    ADD CONSTRAINT "load_positions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."load_positions"
    ADD CONSTRAINT "load_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_categories"
    ADD CONSTRAINT "meal_categories_pkey" PRIMARY KEY ("meal_id", "category");



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_meal_id_saved_food_id_key" UNIQUE ("meal_id", "saved_food_id");



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_logs"
    ADD CONSTRAINT "meal_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meal_roles"
    ADD CONSTRAINT "meal_roles_pkey" PRIMARY KEY ("meal_id", "role");



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_id_user_id_key" UNIQUE ("id", "user_id");



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_user_id_slug_key" UNIQUE ("user_id", "slug");



ALTER TABLE ONLY "public"."morning_routine_completions"
    ADD CONSTRAINT "morning_routine_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."morning_routine_completions"
    ADD CONSTRAINT "morning_routine_completions_user_id_date_key" UNIQUE ("user_id", "date");



ALTER TABLE ONLY "public"."morning_routine_tasks"
    ADD CONSTRAINT "morning_routine_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."morning_routine_templates"
    ADD CONSTRAINT "morning_routine_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movement_categories"
    ADD CONSTRAINT "movement_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."movement_categories"
    ADD CONSTRAINT "movement_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movement_families"
    ADD CONSTRAINT "movement_families_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."movement_families"
    ADD CONSTRAINT "movement_families_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movement_measurement_profiles"
    ADD CONSTRAINT "movement_measurement_profiles_exercise_id_variation_option__key" UNIQUE ("exercise_id", "variation_option_id", "measurement_type");



ALTER TABLE ONLY "public"."movement_measurement_profiles"
    ADD CONSTRAINT "movement_measurement_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movement_ratings"
    ADD CONSTRAINT "movement_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movement_ratings"
    ADD CONSTRAINT "movement_ratings_session_id_exercise_id_key" UNIQUE ("session_id", "exercise_id");



ALTER TABLE ONLY "public"."movement_scaling_links"
    ADD CONSTRAINT "movement_scaling_links_from_exercise_id_from_variation_opti_key" UNIQUE ("from_exercise_id", "from_variation_option_id", "to_exercise_id", "to_variation_option_id", "scaling_type");



ALTER TABLE ONLY "public"."movement_scaling_links"
    ADD CONSTRAINT "movement_scaling_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movement_standards"
    ADD CONSTRAINT "movement_standards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."movement_standards"
    ADD CONSTRAINT "movement_standards_wod_movement_id_scaling_level_standard_n_key" UNIQUE ("wod_movement_id", "scaling_level", "standard_name");



ALTER TABLE ONLY "public"."movement_styles"
    ADD CONSTRAINT "movement_styles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."movement_styles"
    ADD CONSTRAINT "movement_styles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."muscle_regions"
    ADD CONSTRAINT "muscle_regions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."muscle_regions"
    ADD CONSTRAINT "muscle_regions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_constraints"
    ADD CONSTRAINT "nutrition_constraints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_constraints"
    ADD CONSTRAINT "nutrition_constraints_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."nutrition_logs"
    ADD CONSTRAINT "nutrition_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_vendors"
    ADD CONSTRAINT "nutrition_vendors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nutrition_vendors"
    ADD CONSTRAINT "nutrition_vendors_user_id_slug_key" UNIQUE ("user_id", "slug");



ALTER TABLE ONLY "public"."pending_prepared_meal_deliveries"
    ADD CONSTRAINT "pending_prepared_meal_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planes_of_motion"
    ADD CONSTRAINT "planes_of_motion_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."planes_of_motion"
    ADD CONSTRAINT "planes_of_motion_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_cycles"
    ADD CONSTRAINT "program_cycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_cycles"
    ADD CONSTRAINT "program_cycles_program_id_cycle_number_key" UNIQUE ("program_id", "cycle_number");



ALTER TABLE ONLY "public"."program_instances"
    ADD CONSTRAINT "program_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_media"
    ADD CONSTRAINT "program_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_templates"
    ADD CONSTRAINT "program_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_templates"
    ADD CONSTRAINT "program_templates_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."program_workout_exercise_progressions"
    ADD CONSTRAINT "program_workout_exercise_prog_program_workout_exercise_id_w_key" UNIQUE ("program_workout_exercise_id", "week_number");



ALTER TABLE ONLY "public"."program_workout_exercise_progressions"
    ADD CONSTRAINT "program_workout_exercise_progressions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_workout_exercises"
    ADD CONSTRAINT "program_workout_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_workout_exercises"
    ADD CONSTRAINT "program_workout_exercises_program_workout_id_exercise_order_key" UNIQUE ("program_workout_id", "exercise_order");



ALTER TABLE ONLY "public"."program_workouts"
    ADD CONSTRAINT "program_workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_workouts"
    ADD CONSTRAINT "program_workouts_program_id_week_number_day_number_key" UNIQUE ("program_id", "week_number", "day_number");



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."range_depths"
    ADD CONSTRAINT "range_depths_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."range_depths"
    ADD CONSTRAINT "range_depths_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_foods"
    ADD CONSTRAINT "saved_foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_events"
    ADD CONSTRAINT "schedule_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scoring_types"
    ADD CONSTRAINT "scoring_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."scoring_types"
    ADD CONSTRAINT "scoring_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_adjustments"
    ADD CONSTRAINT "session_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_debriefs"
    ADD CONSTRAINT "session_debriefs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_debriefs"
    ADD CONSTRAINT "session_debriefs_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."set_instances"
    ADD CONSTRAINT "set_instances_exercise_instance_id_set_number_key" UNIQUE ("exercise_instance_id", "set_number");



ALTER TABLE ONLY "public"."set_instances"
    ADD CONSTRAINT "set_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopping_list"
    ADD CONSTRAINT "shopping_list_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."source_exercises"
    ADD CONSTRAINT "source_exercises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."source_exercises"
    ADD CONSTRAINT "source_exercises_source_id_exercise_id_key" UNIQUE ("source_id", "exercise_id");



ALTER TABLE ONLY "public"."stances"
    ADD CONSTRAINT "stances_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."stances"
    ADD CONSTRAINT "stances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."symmetries"
    ADD CONSTRAINT "symmetries_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."symmetries"
    ADD CONSTRAINT "symmetries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_attachments"
    ADD CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_machine_settings"
    ADD CONSTRAINT "user_machine_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_machine_settings"
    ADD CONSTRAINT "user_machine_settings_user_id_gym_id_exercise_id_key" UNIQUE ("user_id", "gym_id", "exercise_id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."variation_categories"
    ADD CONSTRAINT "variation_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."variation_categories"
    ADD CONSTRAINT "variation_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."variation_options"
    ADD CONSTRAINT "variation_options_category_id_name_key" UNIQUE ("category_id", "name");



ALTER TABLE ONLY "public"."variation_options"
    ADD CONSTRAINT "variation_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."water_logs"
    ADD CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weight_logs"
    ADD CONSTRAINT "weight_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wod_categories"
    ADD CONSTRAINT "wod_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."wod_categories"
    ADD CONSTRAINT "wod_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wod_formats"
    ADD CONSTRAINT "wod_formats_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."wod_formats"
    ADD CONSTRAINT "wod_formats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wod_movements"
    ADD CONSTRAINT "wod_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wod_scaling_levels"
    ADD CONSTRAINT "wod_scaling_levels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wod_scaling_levels"
    ADD CONSTRAINT "wod_scaling_levels_wod_id_level_name_key" UNIQUE ("wod_id", "level_name");



ALTER TABLE ONLY "public"."wods"
    ADD CONSTRAINT "wods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_instances"
    ADD CONSTRAINT "workout_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_workout_instance_id_session_number_key" UNIQUE ("workout_instance_id", "session_number");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "calorie_ramp_levels_one_active" ON "public"."calorie_ramp_levels" USING "btree" ("user_id") WHERE "is_active";



CREATE UNIQUE INDEX "captured_sources_user_url_unique" ON "public"."captured_sources" USING "btree" ("user_id", "source_url");



CREATE INDEX "captured_workout_exercises_workout" ON "public"."captured_workout_exercises" USING "btree" ("captured_workout_id");



CREATE INDEX "captured_workout_usage_user_date" ON "public"."captured_workout_usage" USING "btree" ("user_id", "performed_date");



CREATE UNIQUE INDEX "eat_next_suggestions_daily_unique" ON "public"."eat_next_suggestions" USING "btree" ("user_id", "suggested_on", "context", "meal_id", "rank");



CREATE INDEX "eat_next_suggestions_user_day" ON "public"."eat_next_suggestions" USING "btree" ("user_id", "suggested_on");



CREATE INDEX "food_concept_links_concept_idx" ON "public"."food_concept_links" USING "btree" ("concept_id");



CREATE INDEX "food_concept_links_inventory_idx" ON "public"."food_concept_links" USING "btree" ("food_inventory_id") WHERE ("food_inventory_id" IS NOT NULL);



CREATE INDEX "food_concept_links_saved_food_idx" ON "public"."food_concept_links" USING "btree" ("saved_food_id") WHERE ("saved_food_id" IS NOT NULL);



CREATE INDEX "food_concepts_user_name_idx" ON "public"."food_concepts" USING "btree" ("user_id", "name");



CREATE INDEX "generated_session_items_session" ON "public"."generated_session_items" USING "btree" ("session_id");



CREATE UNIQUE INDEX "generated_sessions_pending_day" ON "public"."generated_sessions" USING "btree" ("user_id", "session_date") WHERE ("status" = ANY (ARRAY['suggested'::"text", 'accepted'::"text"]));



CREATE UNIQUE INDEX "generated_sessions_rested_day" ON "public"."generated_sessions" USING "btree" ("user_id", "session_date") WHERE ("status" = 'rested'::"text");



CREATE UNIQUE INDEX "gym_profiles_one_active" ON "public"."gym_profiles" USING "btree" ("user_id") WHERE "is_active";



CREATE INDEX "idx_body_measurements_date" ON "public"."body_measurements" USING "btree" ("date");



CREATE INDEX "idx_body_measurements_user_date" ON "public"."body_measurements" USING "btree" ("user_id", "date");



CREATE INDEX "idx_body_measurements_user_id" ON "public"."body_measurements" USING "btree" ("user_id");



CREATE INDEX "idx_class_parts_class" ON "public"."class_parts" USING "btree" ("class_id");



CREATE INDEX "idx_class_parts_wod" ON "public"."class_parts" USING "btree" ("wod_id");



CREATE INDEX "idx_classes_date" ON "public"."classes" USING "btree" ("date");



CREATE INDEX "idx_classes_user" ON "public"."classes" USING "btree" ("user_id");



CREATE INDEX "idx_dev_tasks_user_created_at" ON "public"."dev_tasks" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_dev_tasks_user_priority" ON "public"."dev_tasks" USING "btree" ("user_id", "priority");



CREATE INDEX "idx_dev_tasks_user_status" ON "public"."dev_tasks" USING "btree" ("user_id", "status");



CREATE INDEX "idx_eating_windows_user" ON "public"."eating_windows" USING "btree" ("user_id", "start_time");



CREATE INDEX "idx_equipment_category" ON "public"."equipment" USING "btree" ("category");



CREATE INDEX "idx_event_categories_is_default" ON "public"."event_categories" USING "btree" ("is_default");



CREATE INDEX "idx_event_categories_user_id" ON "public"."event_categories" USING "btree" ("user_id");



CREATE INDEX "idx_event_templates_is_system" ON "public"."event_templates" USING "btree" ("is_system_template");



CREATE INDEX "idx_event_templates_user_id" ON "public"."event_templates" USING "btree" ("user_id");



CREATE INDEX "idx_exercise_goal_types_exercise" ON "public"."exercise_goal_types" USING "btree" ("exercise_id");



CREATE INDEX "idx_exercise_goal_types_goal_type" ON "public"."exercise_goal_types" USING "btree" ("goal_type_id");



CREATE INDEX "idx_exercise_instances_execution_order" ON "public"."exercise_instances" USING "btree" ("execution_order");



CREATE INDEX "idx_exercise_instances_session" ON "public"."exercise_instances" USING "btree" ("workout_session_id");



CREATE INDEX "idx_exercise_instances_user" ON "public"."exercise_instances" USING "btree" ("user_id");



CREATE INDEX "idx_exercise_instances_workout" ON "public"."exercise_instances" USING "btree" ("workout_instance_id");



CREATE INDEX "idx_exercise_load_positions_exercise" ON "public"."exercise_load_positions" USING "btree" ("exercise_id");



CREATE INDEX "idx_exercise_load_positions_load_position" ON "public"."exercise_load_positions" USING "btree" ("load_position_id");



CREATE INDEX "idx_exercise_movement_styles_exercise" ON "public"."exercise_movement_styles" USING "btree" ("exercise_id");



CREATE INDEX "idx_exercise_movement_styles_style" ON "public"."exercise_movement_styles" USING "btree" ("movement_style_id");



CREATE INDEX "idx_exercise_muscle_regions_exercise" ON "public"."exercise_muscle_regions" USING "btree" ("exercise_id");



CREATE INDEX "idx_exercise_muscle_regions_muscle" ON "public"."exercise_muscle_regions" USING "btree" ("muscle_region_id");



CREATE INDEX "idx_exercise_muscle_regions_primary" ON "public"."exercise_muscle_regions" USING "btree" ("is_primary");



CREATE INDEX "idx_exercise_planes_exercise" ON "public"."exercise_planes_of_motion" USING "btree" ("exercise_id");



CREATE INDEX "idx_exercise_planes_plane" ON "public"."exercise_planes_of_motion" USING "btree" ("plane_of_motion_id");



CREATE INDEX "idx_exercise_scoring_types_exercise" ON "public"."exercise_scoring_types" USING "btree" ("exercise_id");



CREATE INDEX "idx_exercise_stances_exercise" ON "public"."exercise_stances" USING "btree" ("exercise_id");



CREATE INDEX "idx_exercise_stances_stance" ON "public"."exercise_stances" USING "btree" ("stance_id");



CREATE INDEX "idx_exercise_standards_created_by" ON "public"."exercise_standards" USING "btree" ("created_by");



CREATE INDEX "idx_exercise_standards_exercise" ON "public"."exercise_standards" USING "btree" ("exercise_id");



CREATE INDEX "idx_exercise_standards_official" ON "public"."exercise_standards" USING "btree" ("is_official_standard");



CREATE INDEX "idx_exercise_standards_variation" ON "public"."exercise_standards" USING "btree" ("variation_option_id");



CREATE INDEX "idx_exercise_variations_exercise" ON "public"."exercise_variations" USING "btree" ("exercise_id");



CREATE INDEX "idx_exercises_aliases" ON "public"."exercises" USING "gin" ("aliases");



CREATE INDEX "idx_exercises_created_by" ON "public"."exercises" USING "btree" ("created_by");



CREATE INDEX "idx_exercises_equipment_types" ON "public"."exercises" USING "gin" ("equipment_types");



CREATE INDEX "idx_exercises_goal_type" ON "public"."exercises" USING "btree" ("goal_type_id");



CREATE INDEX "idx_exercises_is_core" ON "public"."exercises" USING "btree" ("is_core");



CREATE INDEX "idx_exercises_is_movement" ON "public"."exercises" USING "btree" ("is_movement") WHERE ("is_movement" = true);



CREATE INDEX "idx_exercises_is_official" ON "public"."exercises" USING "btree" ("is_official");



CREATE INDEX "idx_exercises_load_position" ON "public"."exercises" USING "btree" ("load_position_id");



CREATE INDEX "idx_exercises_movement_category" ON "public"."exercises" USING "btree" ("movement_category_id");



CREATE INDEX "idx_exercises_movement_family" ON "public"."exercises" USING "btree" ("movement_family_id");



CREATE INDEX "idx_exercises_movement_style" ON "public"."exercises" USING "btree" ("movement_style_id");



CREATE INDEX "idx_exercises_parent" ON "public"."exercises" USING "btree" ("parent_exercise_id");



CREATE INDEX "idx_exercises_plane_of_motion" ON "public"."exercises" USING "btree" ("plane_of_motion_id");



CREATE INDEX "idx_exercises_range_depth" ON "public"."exercises" USING "btree" ("range_depth_id");



CREATE INDEX "idx_exercises_requires_distance" ON "public"."exercises" USING "btree" ("requires_distance");



CREATE INDEX "idx_exercises_requires_weight" ON "public"."exercises" USING "btree" ("requires_weight");



CREATE INDEX "idx_exercises_skill_level" ON "public"."exercises" USING "btree" ("skill_level");



CREATE INDEX "idx_exercises_slug" ON "public"."exercises" USING "btree" ("slug");



CREATE INDEX "idx_exercises_stance" ON "public"."exercises" USING "btree" ("stance_id");



CREATE INDEX "idx_exercises_symmetry" ON "public"."exercises" USING "btree" ("symmetry_id");



CREATE INDEX "idx_food_categories_user_id" ON "public"."food_categories" USING "btree" ("user_id");



CREATE INDEX "idx_food_inventory_barcode" ON "public"."food_inventory" USING "btree" ("barcode");



CREATE INDEX "idx_food_inventory_category" ON "public"."food_inventory" USING "btree" ("category");



CREATE INDEX "idx_food_inventory_category_map_category_id" ON "public"."food_inventory_category_map" USING "btree" ("category_id");



CREATE INDEX "idx_food_inventory_category_map_food_id" ON "public"."food_inventory_category_map" USING "btree" ("food_inventory_id");



CREATE INDEX "idx_food_inventory_category_map_user_id" ON "public"."food_inventory_category_map" USING "btree" ("user_id");



CREATE INDEX "idx_food_inventory_expiration" ON "public"."food_inventory" USING "btree" ("expiration_date");



CREATE INDEX "idx_food_inventory_location" ON "public"."food_inventory" USING "btree" ("location");



CREATE INDEX "idx_food_inventory_locations_food_inventory_id" ON "public"."food_inventory_locations" USING "btree" ("food_inventory_id");



CREATE INDEX "idx_food_inventory_locations_is_ready" ON "public"."food_inventory_locations" USING "btree" ("is_ready_to_consume");



CREATE INDEX "idx_food_inventory_locations_location" ON "public"."food_inventory_locations" USING "btree" ("location");



CREATE INDEX "idx_food_inventory_locations_user_id" ON "public"."food_inventory_locations" USING "btree" ("user_id");



CREATE INDEX "idx_food_inventory_saved_food" ON "public"."food_inventory" USING "btree" ("saved_food_id") WHERE ("saved_food_id" IS NOT NULL);



CREATE INDEX "idx_food_inventory_storage_type" ON "public"."food_inventory" USING "btree" ("storage_type");



CREATE INDEX "idx_food_inventory_subcategory_map_food_id" ON "public"."food_inventory_subcategory_map" USING "btree" ("food_inventory_id");



CREATE INDEX "idx_food_inventory_subcategory_map_subcategory_id" ON "public"."food_inventory_subcategory_map" USING "btree" ("subcategory_id");



CREATE INDEX "idx_food_inventory_subcategory_map_user_id" ON "public"."food_inventory_subcategory_map" USING "btree" ("user_id");



CREATE INDEX "idx_food_inventory_user_id" ON "public"."food_inventory" USING "btree" ("user_id");



CREATE INDEX "idx_food_subcategories_category_id" ON "public"."food_subcategories" USING "btree" ("category_id");



CREATE INDEX "idx_gyms_created_by" ON "public"."gyms" USING "btree" ("created_by");



CREATE INDEX "idx_load_positions_display_order" ON "public"."load_positions" USING "btree" ("display_order");



CREATE INDEX "idx_meal_categories_lookup" ON "public"."meal_categories" USING "btree" ("user_id", "category");



CREATE INDEX "idx_meal_items_meal" ON "public"."meal_items" USING "btree" ("meal_id", "display_order");



CREATE INDEX "idx_meal_items_saved_food" ON "public"."meal_items" USING "btree" ("saved_food_id");



CREATE INDEX "idx_meal_logs_date" ON "public"."meal_logs" USING "btree" ("date");



CREATE INDEX "idx_meal_logs_meal" ON "public"."meal_logs" USING "btree" ("meal_id") WHERE ("meal_id" IS NOT NULL);



CREATE INDEX "idx_meal_logs_saved_food_id" ON "public"."meal_logs" USING "btree" ("saved_food_id") WHERE ("saved_food_id" IS NOT NULL);



CREATE INDEX "idx_meal_logs_user_date" ON "public"."meal_logs" USING "btree" ("user_id", "date");



CREATE INDEX "idx_meal_logs_user_id" ON "public"."meal_logs" USING "btree" ("user_id");



CREATE INDEX "idx_meal_roles_lookup" ON "public"."meal_roles" USING "btree" ("user_id", "role");



CREATE INDEX "idx_meals_favorite" ON "public"."meals" USING "btree" ("user_id") WHERE "is_favorite";



CREATE INDEX "idx_meals_user_category" ON "public"."meals" USING "btree" ("user_id", "category");



CREATE INDEX "idx_measurement_profiles_exercise" ON "public"."movement_measurement_profiles" USING "btree" ("exercise_id");



CREATE INDEX "idx_measurement_profiles_type" ON "public"."movement_measurement_profiles" USING "btree" ("measurement_type");



CREATE INDEX "idx_measurement_profiles_variation" ON "public"."movement_measurement_profiles" USING "btree" ("variation_option_id");



CREATE INDEX "idx_morning_routine_completions_user_date" ON "public"."morning_routine_completions" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "idx_morning_routine_tasks_template_order" ON "public"."morning_routine_tasks" USING "btree" ("template_id", "order_index");



CREATE INDEX "idx_movement_families_display_order" ON "public"."movement_families" USING "btree" ("display_order");



CREATE INDEX "idx_movement_standards_wod_movement" ON "public"."movement_standards" USING "btree" ("wod_movement_id");



CREATE INDEX "idx_movement_styles_display_order" ON "public"."movement_styles" USING "btree" ("display_order");



CREATE INDEX "idx_muscle_regions_display_order" ON "public"."muscle_regions" USING "btree" ("display_order");



CREATE INDEX "idx_nutrition_logs_logged_at" ON "public"."nutrition_logs" USING "btree" ("logged_at" DESC);



CREATE INDEX "idx_nutrition_logs_user_id" ON "public"."nutrition_logs" USING "btree" ("user_id");



CREATE INDEX "idx_nutrition_logs_user_logged" ON "public"."nutrition_logs" USING "btree" ("user_id", "logged_at" DESC);



CREATE UNIQUE INDEX "idx_one_default_template_per_user" ON "public"."morning_routine_templates" USING "btree" ("user_id") WHERE ("is_default" = true);



CREATE INDEX "idx_pending_deliveries_due" ON "public"."pending_prepared_meal_deliveries" USING "btree" ("user_id", "arrives_at");



CREATE INDEX "idx_planes_of_motion_display_order" ON "public"."planes_of_motion" USING "btree" ("display_order");



CREATE INDEX "idx_profiles_id" ON "public"."profiles" USING "btree" ("id");



CREATE INDEX "idx_program_cycles_program" ON "public"."program_cycles" USING "btree" ("program_id");



CREATE INDEX "idx_program_instances_program" ON "public"."program_instances" USING "btree" ("program_id");



CREATE INDEX "idx_program_instances_status" ON "public"."program_instances" USING "btree" ("user_id", "status");



CREATE INDEX "idx_program_instances_user" ON "public"."program_instances" USING "btree" ("user_id");



CREATE INDEX "idx_program_media_program" ON "public"."program_media" USING "btree" ("program_id");



CREATE INDEX "idx_program_templates_featured" ON "public"."program_templates" USING "btree" ("is_featured") WHERE ("is_featured" = true);



CREATE INDEX "idx_program_templates_published" ON "public"."program_templates" USING "btree" ("is_published") WHERE ("is_published" = true);



CREATE INDEX "idx_program_templates_slug" ON "public"."program_templates" USING "btree" ("slug");



CREATE INDEX "idx_program_workout_exercises_exercise" ON "public"."program_workout_exercises" USING "btree" ("exercise_id");



CREATE INDEX "idx_program_workout_exercises_group_id" ON "public"."program_workout_exercises" USING "btree" ("group_id") WHERE ("group_id" IS NOT NULL);



CREATE INDEX "idx_program_workout_exercises_section" ON "public"."program_workout_exercises" USING "btree" ("program_workout_id", "section", "exercise_order");



CREATE INDEX "idx_program_workout_exercises_workout" ON "public"."program_workout_exercises" USING "btree" ("program_workout_id");



CREATE INDEX "idx_program_workouts_cycle" ON "public"."program_workouts" USING "btree" ("cycle_id");



CREATE INDEX "idx_program_workouts_position" ON "public"."program_workouts" USING "btree" ("program_id", "week_number", "day_number");



CREATE INDEX "idx_program_workouts_program" ON "public"."program_workouts" USING "btree" ("program_id");



CREATE INDEX "idx_progress_photos_date" ON "public"."progress_photos" USING "btree" ("date");



CREATE INDEX "idx_progress_photos_user_date" ON "public"."progress_photos" USING "btree" ("user_id", "date");



CREATE INDEX "idx_progress_photos_user_id" ON "public"."progress_photos" USING "btree" ("user_id");



CREATE INDEX "idx_progressions_exercise" ON "public"."program_workout_exercise_progressions" USING "btree" ("program_workout_exercise_id");



CREATE INDEX "idx_range_depths_display_order" ON "public"."range_depths" USING "btree" ("display_order");



CREATE INDEX "idx_saved_foods_barcode" ON "public"."saved_foods" USING "btree" ("barcode") WHERE ("barcode" IS NOT NULL);



CREATE INDEX "idx_saved_foods_is_favorite" ON "public"."saved_foods" USING "btree" ("user_id", "is_favorite") WHERE ("is_favorite" = true);



CREATE INDEX "idx_saved_foods_name" ON "public"."saved_foods" USING "btree" ("user_id", "name");



CREATE UNIQUE INDEX "idx_saved_foods_user_barcode" ON "public"."saved_foods" USING "btree" ("user_id", "barcode") WHERE ("barcode" IS NOT NULL);



CREATE INDEX "idx_saved_foods_user_id" ON "public"."saved_foods" USING "btree" ("user_id");



CREATE INDEX "idx_scaling_links_difficulty" ON "public"."movement_scaling_links" USING "btree" ("difficulty_delta");



CREATE INDEX "idx_scaling_links_from_exercise" ON "public"."movement_scaling_links" USING "btree" ("from_exercise_id");



CREATE INDEX "idx_scaling_links_from_variation" ON "public"."movement_scaling_links" USING "btree" ("from_variation_option_id");



CREATE INDEX "idx_scaling_links_to_exercise" ON "public"."movement_scaling_links" USING "btree" ("to_exercise_id");



CREATE INDEX "idx_scaling_links_to_variation" ON "public"."movement_scaling_links" USING "btree" ("to_variation_option_id");



CREATE INDEX "idx_scaling_links_type" ON "public"."movement_scaling_links" USING "btree" ("scaling_type");



CREATE INDEX "idx_schedule_events_date" ON "public"."schedule_events" USING "btree" ("date");



CREATE INDEX "idx_schedule_events_is_recurring" ON "public"."schedule_events" USING "btree" ("is_recurring");



CREATE INDEX "idx_schedule_events_status" ON "public"."schedule_events" USING "btree" ("status");



CREATE INDEX "idx_schedule_events_user_date" ON "public"."schedule_events" USING "btree" ("user_id", "date");



CREATE INDEX "idx_schedule_events_user_id" ON "public"."schedule_events" USING "btree" ("user_id");



CREATE INDEX "idx_set_instances_exercise" ON "public"."set_instances" USING "btree" ("exercise_instance_id");



CREATE INDEX "idx_set_instances_user" ON "public"."set_instances" USING "btree" ("user_id");



CREATE INDEX "idx_shopping_list_food_inventory_id" ON "public"."shopping_list" USING "btree" ("food_inventory_id");



CREATE INDEX "idx_shopping_list_is_purchased" ON "public"."shopping_list" USING "btree" ("is_purchased");



CREATE INDEX "idx_shopping_list_source_meal" ON "public"."shopping_list" USING "btree" ("source_meal_id") WHERE ("source_meal_id" IS NOT NULL);



CREATE INDEX "idx_shopping_list_user_id" ON "public"."shopping_list" USING "btree" ("user_id");



CREATE INDEX "idx_stances_display_order" ON "public"."stances" USING "btree" ("display_order");



CREATE INDEX "idx_symmetries_display_order" ON "public"."symmetries" USING "btree" ("display_order");



CREATE INDEX "idx_ticket_attachments_ticket_id" ON "public"."ticket_attachments" USING "btree" ("ticket_id");



CREATE INDEX "idx_user_machine_settings_user_gym" ON "public"."user_machine_settings" USING "btree" ("user_id", "gym_id");



CREATE INDEX "idx_user_preferences_user_id" ON "public"."user_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_user_profiles_user_id" ON "public"."user_profiles" USING "btree" ("user_id");



CREATE INDEX "idx_variation_options_aliases" ON "public"."variation_options" USING "gin" ("aliases");



CREATE INDEX "idx_variation_options_display_order" ON "public"."variation_options" USING "btree" ("display_order");



CREATE INDEX "idx_variation_options_load_position" ON "public"."variation_options" USING "btree" ("load_position_id");



CREATE INDEX "idx_variation_options_movement_family" ON "public"."variation_options" USING "btree" ("movement_family_id");



CREATE INDEX "idx_variation_options_movement_style" ON "public"."variation_options" USING "btree" ("movement_style_id");



CREATE INDEX "idx_variation_options_plane_of_motion" ON "public"."variation_options" USING "btree" ("plane_of_motion_id");



CREATE INDEX "idx_variation_options_range_depth" ON "public"."variation_options" USING "btree" ("range_depth_id");



CREATE INDEX "idx_variation_options_skill_level" ON "public"."variation_options" USING "btree" ("skill_level");



CREATE INDEX "idx_variation_options_stance" ON "public"."variation_options" USING "btree" ("stance_id");



CREATE INDEX "idx_variation_options_symmetry" ON "public"."variation_options" USING "btree" ("symmetry_id");



CREATE INDEX "idx_water_logs_date" ON "public"."water_logs" USING "btree" ("date");



CREATE INDEX "idx_water_logs_user_date" ON "public"."water_logs" USING "btree" ("user_id", "date");



CREATE INDEX "idx_water_logs_user_id" ON "public"."water_logs" USING "btree" ("user_id");



CREATE INDEX "idx_water_logs_user_type_date" ON "public"."water_logs" USING "btree" ("user_id", "beverage_type", "date" DESC);



CREATE INDEX "idx_weight_logs_date" ON "public"."weight_logs" USING "btree" ("date");



CREATE INDEX "idx_weight_logs_user_date" ON "public"."weight_logs" USING "btree" ("user_id", "date");



CREATE INDEX "idx_weight_logs_user_id" ON "public"."weight_logs" USING "btree" ("user_id");



CREATE INDEX "idx_wod_movements_exercise" ON "public"."wod_movements" USING "btree" ("exercise_id");



CREATE INDEX "idx_wod_movements_wod" ON "public"."wod_movements" USING "btree" ("wod_id");



CREATE INDEX "idx_wod_scaling_levels_wod" ON "public"."wod_scaling_levels" USING "btree" ("wod_id");



CREATE INDEX "idx_wods_category" ON "public"."wods" USING "btree" ("category_id");



CREATE INDEX "idx_wods_format" ON "public"."wods" USING "btree" ("format_id");



CREATE INDEX "idx_wods_image_generation_failed" ON "public"."wods" USING "btree" ("image_generation_failed") WHERE ("image_generation_failed" = true);



CREATE INDEX "idx_wods_user" ON "public"."wods" USING "btree" ("user_id");



CREATE INDEX "idx_workout_instances_date" ON "public"."workout_instances" USING "btree" ("user_id", "scheduled_date");



CREATE INDEX "idx_workout_instances_gym_id" ON "public"."workout_instances" USING "btree" ("gym_id");



CREATE INDEX "idx_workout_instances_instance" ON "public"."workout_instances" USING "btree" ("program_instance_id");



CREATE INDEX "idx_workout_instances_status" ON "public"."workout_instances" USING "btree" ("user_id", "status");



CREATE INDEX "idx_workout_instances_user" ON "public"."workout_instances" USING "btree" ("user_id");



CREATE INDEX "idx_workout_logs_date" ON "public"."workout_logs" USING "btree" ("date");



CREATE INDEX "idx_workout_logs_schedule_event" ON "public"."workout_logs" USING "btree" ("schedule_event_id");



CREATE INDEX "idx_workout_logs_user_date" ON "public"."workout_logs" USING "btree" ("user_id", "date");



CREATE INDEX "idx_workout_logs_user_id" ON "public"."workout_logs" USING "btree" ("user_id");



CREATE INDEX "idx_workout_sessions_instance" ON "public"."workout_sessions" USING "btree" ("workout_instance_id");



CREATE INDEX "idx_workout_sessions_user_date" ON "public"."workout_sessions" USING "btree" ("user_id", "session_date");



CREATE INDEX "idx_workouts_completed_at" ON "public"."workouts" USING "btree" ("completed_at" DESC);



CREATE INDEX "idx_workouts_user_completed" ON "public"."workouts" USING "btree" ("user_id", "completed_at" DESC);



CREATE INDEX "idx_workouts_user_id" ON "public"."workouts" USING "btree" ("user_id");



CREATE INDEX "inventory_events_item_idx" ON "public"."inventory_events" USING "btree" ("food_inventory_id");



CREATE INDEX "inventory_events_user_created_idx" ON "public"."inventory_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "movement_ratings_session" ON "public"."movement_ratings" USING "btree" ("session_id");



CREATE INDEX "nutrition_vendors_user_order_idx" ON "public"."nutrition_vendors" USING "btree" ("user_id", "display_order");



CREATE INDEX "session_adjustments_user_created" ON "public"."session_adjustments" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "session_debriefs_user_created" ON "public"."session_debriefs" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "set_instances_started_at" ON "public"."set_instances" USING "btree" ("exercise_instance_id", "started_at");



CREATE INDEX "source_exercises_exercise" ON "public"."source_exercises" USING "btree" ("exercise_id");



CREATE INDEX "todos_due_date_idx" ON "public"."todos" USING "btree" ("due_date");



CREATE INDEX "todos_user_id_idx" ON "public"."todos" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "exercise_standards_updated_at" BEFORE UPDATE ON "public"."exercise_standards" FOR EACH ROW EXECUTE FUNCTION "public"."update_exercise_standards_updated_at"();



CREATE CONSTRAINT TRIGGER "meal_categories_check_set" AFTER INSERT OR DELETE OR UPDATE ON "public"."meal_categories" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "public"."meal_categories_check_set"();



CREATE OR REPLACE TRIGGER "meals_updated_at" BEFORE UPDATE ON "public"."meals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "morning_routine_completions_updated_at" BEFORE UPDATE ON "public"."morning_routine_completions" FOR EACH ROW EXECUTE FUNCTION "public"."update_morning_routine_completions_updated_at"();



CREATE OR REPLACE TRIGGER "morning_routine_tasks_updated_at" BEFORE UPDATE ON "public"."morning_routine_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_morning_routine_tasks_updated_at"();



CREATE OR REPLACE TRIGGER "morning_routine_templates_updated_at" BEFORE UPDATE ON "public"."morning_routine_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_morning_routine_templates_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_prevent_circular_reference" BEFORE INSERT OR UPDATE ON "public"."exercises" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_circular_reference"();



CREATE OR REPLACE TRIGGER "trigger_validate_movement_depth" BEFORE INSERT OR UPDATE ON "public"."exercises" FOR EACH ROW EXECUTE FUNCTION "public"."validate_movement_depth"();



CREATE OR REPLACE TRIGGER "update_calorie_ramp_levels_updated_at" BEFORE UPDATE ON "public"."calorie_ramp_levels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_classes_updated_at" BEFORE UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_dev_tasks_updated_at" BEFORE UPDATE ON "public"."dev_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_exercise_instances_updated_at" BEFORE UPDATE ON "public"."exercise_instances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_exercises_updated_at" BEFORE UPDATE ON "public"."exercises" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_food_concepts_updated_at" BEFORE UPDATE ON "public"."food_concepts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_food_inventory_locations_updated_at" BEFORE UPDATE ON "public"."food_inventory_locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_food_inventory_updated_at" BEFORE UPDATE ON "public"."food_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_nutrition_constraints_updated_at" BEFORE UPDATE ON "public"."nutrition_constraints" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_nutrition_vendors_updated_at" BEFORE UPDATE ON "public"."nutrition_vendors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_program_instances_updated_at" BEFORE UPDATE ON "public"."program_instances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_program_templates_updated_at" BEFORE UPDATE ON "public"."program_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_saved_foods_updated_at" BEFORE UPDATE ON "public"."saved_foods" FOR EACH ROW EXECUTE FUNCTION "public"."update_saved_foods_updated_at"();



CREATE OR REPLACE TRIGGER "update_schedule_events_updated_at" BEFORE UPDATE ON "public"."schedule_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_wods_updated_at" BEFORE UPDATE ON "public"."wods" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_workout_instances_updated_at" BEFORE UPDATE ON "public"."workout_instances" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "workout_sessions_updated_at" BEFORE UPDATE ON "public"."workout_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_workout_sessions_updated_at"();



ALTER TABLE ONLY "public"."body_measurements"
    ADD CONSTRAINT "body_measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calorie_ramp_levels"
    ADD CONSTRAINT "calorie_ramp_levels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."captured_sources"
    ADD CONSTRAINT "captured_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."captured_workout_exercises"
    ADD CONSTRAINT "captured_workout_exercises_captured_workout_id_fkey" FOREIGN KEY ("captured_workout_id") REFERENCES "public"."captured_workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."captured_workout_exercises"
    ADD CONSTRAINT "captured_workout_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."captured_workout_muscles"
    ADD CONSTRAINT "captured_workout_muscles_captured_workout_id_fkey" FOREIGN KEY ("captured_workout_id") REFERENCES "public"."captured_workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."captured_workout_muscles"
    ADD CONSTRAINT "captured_workout_muscles_muscle_region_id_fkey" FOREIGN KEY ("muscle_region_id") REFERENCES "public"."muscle_regions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."captured_workout_usage"
    ADD CONSTRAINT "captured_workout_usage_captured_workout_id_fkey" FOREIGN KEY ("captured_workout_id") REFERENCES "public"."captured_workouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."captured_workout_usage"
    ADD CONSTRAINT "captured_workout_usage_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."generated_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."captured_workout_usage"
    ADD CONSTRAINT "captured_workout_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."captured_workouts"
    ADD CONSTRAINT "captured_workouts_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."captured_sources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."captured_workouts"
    ADD CONSTRAINT "captured_workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_parts"
    ADD CONSTRAINT "class_parts_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_parts"
    ADD CONSTRAINT "class_parts_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."wods"("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_checkin_soreness"
    ADD CONSTRAINT "daily_checkin_soreness_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "public"."daily_checkins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_checkin_soreness"
    ADD CONSTRAINT "daily_checkin_soreness_muscle_region_id_fkey" FOREIGN KEY ("muscle_region_id") REFERENCES "public"."muscle_regions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dev_tasks"
    ADD CONSTRAINT "dev_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eat_next_suggestions"
    ADD CONSTRAINT "eat_next_suggestions_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eat_next_suggestions"
    ADD CONSTRAINT "eat_next_suggestions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eating_windows"
    ADD CONSTRAINT "eating_windows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_categories"
    ADD CONSTRAINT "event_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_templates"
    ADD CONSTRAINT "event_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."event_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."event_templates"
    ADD CONSTRAINT "event_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_goal_types"
    ADD CONSTRAINT "exercise_goal_types_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_goal_types"
    ADD CONSTRAINT "exercise_goal_types_goal_type_id_fkey" FOREIGN KEY ("goal_type_id") REFERENCES "public"."goal_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_instances"
    ADD CONSTRAINT "exercise_instances_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."exercise_instances"
    ADD CONSTRAINT "exercise_instances_program_workout_exercise_id_fkey" FOREIGN KEY ("program_workout_exercise_id") REFERENCES "public"."program_workout_exercises"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."exercise_instances"
    ADD CONSTRAINT "exercise_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_instances"
    ADD CONSTRAINT "exercise_instances_workout_instance_id_fkey" FOREIGN KEY ("workout_instance_id") REFERENCES "public"."workout_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_instances"
    ADD CONSTRAINT "exercise_instances_workout_session_id_fkey" FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id");



ALTER TABLE ONLY "public"."exercise_load_positions"
    ADD CONSTRAINT "exercise_load_positions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_load_positions"
    ADD CONSTRAINT "exercise_load_positions_load_position_id_fkey" FOREIGN KEY ("load_position_id") REFERENCES "public"."load_positions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_movement_styles"
    ADD CONSTRAINT "exercise_movement_styles_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_movement_styles"
    ADD CONSTRAINT "exercise_movement_styles_movement_style_id_fkey" FOREIGN KEY ("movement_style_id") REFERENCES "public"."movement_styles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_muscle_regions"
    ADD CONSTRAINT "exercise_muscle_regions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_muscle_regions"
    ADD CONSTRAINT "exercise_muscle_regions_muscle_region_id_fkey" FOREIGN KEY ("muscle_region_id") REFERENCES "public"."muscle_regions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_planes_of_motion"
    ADD CONSTRAINT "exercise_planes_of_motion_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_planes_of_motion"
    ADD CONSTRAINT "exercise_planes_of_motion_plane_of_motion_id_fkey" FOREIGN KEY ("plane_of_motion_id") REFERENCES "public"."planes_of_motion"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_scoring_types"
    ADD CONSTRAINT "exercise_scoring_types_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_scoring_types"
    ADD CONSTRAINT "exercise_scoring_types_scoring_type_id_fkey" FOREIGN KEY ("scoring_type_id") REFERENCES "public"."scoring_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_skill_state"
    ADD CONSTRAINT "exercise_skill_state_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_skill_state"
    ADD CONSTRAINT "exercise_skill_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_stances"
    ADD CONSTRAINT "exercise_stances_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_stances"
    ADD CONSTRAINT "exercise_stances_stance_id_fkey" FOREIGN KEY ("stance_id") REFERENCES "public"."stances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_standards"
    ADD CONSTRAINT "exercise_standards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercise_standards"
    ADD CONSTRAINT "exercise_standards_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_standards"
    ADD CONSTRAINT "exercise_standards_variation_option_id_fkey" FOREIGN KEY ("variation_option_id") REFERENCES "public"."variation_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_variations"
    ADD CONSTRAINT "exercise_variations_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_variations"
    ADD CONSTRAINT "exercise_variations_variation_option_id_fkey" FOREIGN KEY ("variation_option_id") REFERENCES "public"."variation_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_goal_type_id_fkey" FOREIGN KEY ("goal_type_id") REFERENCES "public"."goal_types"("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_load_position_id_fkey" FOREIGN KEY ("load_position_id") REFERENCES "public"."load_positions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_movement_category_id_fkey" FOREIGN KEY ("movement_category_id") REFERENCES "public"."movement_categories"("id");



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_movement_family_id_fkey" FOREIGN KEY ("movement_family_id") REFERENCES "public"."movement_families"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_movement_style_id_fkey" FOREIGN KEY ("movement_style_id") REFERENCES "public"."movement_styles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_parent_exercise_id_fkey" FOREIGN KEY ("parent_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_plane_of_motion_id_fkey" FOREIGN KEY ("plane_of_motion_id") REFERENCES "public"."planes_of_motion"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_range_depth_id_fkey" FOREIGN KEY ("range_depth_id") REFERENCES "public"."range_depths"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_stance_id_fkey" FOREIGN KEY ("stance_id") REFERENCES "public"."stances"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exercises"
    ADD CONSTRAINT "exercises_symmetry_id_fkey" FOREIGN KEY ("symmetry_id") REFERENCES "public"."symmetries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."food_categories"
    ADD CONSTRAINT "food_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_concept_links"
    ADD CONSTRAINT "food_concept_links_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."food_concepts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_concept_links"
    ADD CONSTRAINT "food_concept_links_food_inventory_id_fkey" FOREIGN KEY ("food_inventory_id") REFERENCES "public"."food_inventory"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_concept_links"
    ADD CONSTRAINT "food_concept_links_saved_food_id_fkey" FOREIGN KEY ("saved_food_id") REFERENCES "public"."saved_foods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_concept_links"
    ADD CONSTRAINT "food_concept_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_concepts"
    ADD CONSTRAINT "food_concepts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_inventory_category_map"
    ADD CONSTRAINT "food_inventory_category_map_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."food_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_inventory_category_map"
    ADD CONSTRAINT "food_inventory_category_map_food_inventory_id_fkey" FOREIGN KEY ("food_inventory_id") REFERENCES "public"."food_inventory"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_inventory_category_map"
    ADD CONSTRAINT "food_inventory_category_map_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_inventory_locations"
    ADD CONSTRAINT "food_inventory_locations_food_inventory_id_fkey" FOREIGN KEY ("food_inventory_id") REFERENCES "public"."food_inventory"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_inventory_locations"
    ADD CONSTRAINT "food_inventory_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_inventory"
    ADD CONSTRAINT "food_inventory_preferred_vendor_id_fkey" FOREIGN KEY ("preferred_vendor_id") REFERENCES "public"."nutrition_vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."food_inventory"
    ADD CONSTRAINT "food_inventory_saved_food_id_fkey" FOREIGN KEY ("saved_food_id") REFERENCES "public"."saved_foods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."food_inventory_subcategory_map"
    ADD CONSTRAINT "food_inventory_subcategory_map_food_inventory_id_fkey" FOREIGN KEY ("food_inventory_id") REFERENCES "public"."food_inventory"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_inventory_subcategory_map"
    ADD CONSTRAINT "food_inventory_subcategory_map_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "public"."food_subcategories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_inventory_subcategory_map"
    ADD CONSTRAINT "food_inventory_subcategory_map_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_inventory"
    ADD CONSTRAINT "food_inventory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_subcategories"
    ADD CONSTRAINT "food_subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."food_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_session_blocks"
    ADD CONSTRAINT "generated_session_blocks_captured_workout_id_fkey" FOREIGN KEY ("captured_workout_id") REFERENCES "public"."captured_workouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_session_blocks"
    ADD CONSTRAINT "generated_session_blocks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."generated_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_session_items"
    ADD CONSTRAINT "generated_session_items_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_session_items"
    ADD CONSTRAINT "generated_session_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."generated_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_sessions"
    ADD CONSTRAINT "generated_sessions_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "public"."daily_checkins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_sessions"
    ADD CONSTRAINT "generated_sessions_gym_profile_id_fkey" FOREIGN KEY ("gym_profile_id") REFERENCES "public"."gym_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_sessions"
    ADD CONSTRAINT "generated_sessions_served_captured_workout_id_fkey" FOREIGN KEY ("served_captured_workout_id") REFERENCES "public"."captured_workouts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_sessions"
    ADD CONSTRAINT "generated_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_sessions"
    ADD CONSTRAINT "generated_sessions_workout_instance_id_fkey" FOREIGN KEY ("workout_instance_id") REFERENCES "public"."workout_instances"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gym_profile_equipment"
    ADD CONSTRAINT "gym_profile_equipment_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gym_profile_equipment"
    ADD CONSTRAINT "gym_profile_equipment_gym_profile_id_fkey" FOREIGN KEY ("gym_profile_id") REFERENCES "public"."gym_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gym_profiles"
    ADD CONSTRAINT "gym_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gyms"
    ADD CONSTRAINT "gyms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."inventory_events"
    ADD CONSTRAINT "inventory_events_food_inventory_id_fkey" FOREIGN KEY ("food_inventory_id") REFERENCES "public"."food_inventory"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_events"
    ADD CONSTRAINT "inventory_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_categories"
    ADD CONSTRAINT "meal_categories_meal_id_user_id_fkey" FOREIGN KEY ("meal_id", "user_id") REFERENCES "public"."meals"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_categories"
    ADD CONSTRAINT "meal_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_meal_id_user_id_fkey" FOREIGN KEY ("meal_id", "user_id") REFERENCES "public"."meals"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_saved_food_id_fkey" FOREIGN KEY ("saved_food_id") REFERENCES "public"."saved_foods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."meal_items"
    ADD CONSTRAINT "meal_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_logs"
    ADD CONSTRAINT "meal_logs_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meal_logs"
    ADD CONSTRAINT "meal_logs_saved_food_id_fkey" FOREIGN KEY ("saved_food_id") REFERENCES "public"."saved_foods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meal_logs"
    ADD CONSTRAINT "meal_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_roles"
    ADD CONSTRAINT "meal_roles_meal_id_user_id_fkey" FOREIGN KEY ("meal_id", "user_id") REFERENCES "public"."meals"("id", "user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meal_roles"
    ADD CONSTRAINT "meal_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meals"
    ADD CONSTRAINT "meals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."morning_routine_completions"
    ADD CONSTRAINT "morning_routine_completions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."morning_routine_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."morning_routine_completions"
    ADD CONSTRAINT "morning_routine_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."morning_routine_tasks"
    ADD CONSTRAINT "morning_routine_tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."morning_routine_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."morning_routine_templates"
    ADD CONSTRAINT "morning_routine_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movement_measurement_profiles"
    ADD CONSTRAINT "movement_measurement_profiles_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movement_measurement_profiles"
    ADD CONSTRAINT "movement_measurement_profiles_variation_option_id_fkey" FOREIGN KEY ("variation_option_id") REFERENCES "public"."variation_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movement_ratings"
    ADD CONSTRAINT "movement_ratings_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movement_ratings"
    ADD CONSTRAINT "movement_ratings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."generated_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movement_ratings"
    ADD CONSTRAINT "movement_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movement_scaling_links"
    ADD CONSTRAINT "movement_scaling_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."movement_scaling_links"
    ADD CONSTRAINT "movement_scaling_links_from_exercise_id_fkey" FOREIGN KEY ("from_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movement_scaling_links"
    ADD CONSTRAINT "movement_scaling_links_from_variation_option_id_fkey" FOREIGN KEY ("from_variation_option_id") REFERENCES "public"."variation_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movement_scaling_links"
    ADD CONSTRAINT "movement_scaling_links_to_exercise_id_fkey" FOREIGN KEY ("to_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movement_scaling_links"
    ADD CONSTRAINT "movement_scaling_links_to_variation_option_id_fkey" FOREIGN KEY ("to_variation_option_id") REFERENCES "public"."variation_options"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."movement_standards"
    ADD CONSTRAINT "movement_standards_wod_movement_id_fkey" FOREIGN KEY ("wod_movement_id") REFERENCES "public"."wod_movements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_constraints"
    ADD CONSTRAINT "nutrition_constraints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_logs"
    ADD CONSTRAINT "nutrition_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nutrition_vendors"
    ADD CONSTRAINT "nutrition_vendors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_prepared_meal_deliveries"
    ADD CONSTRAINT "pending_prepared_meal_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_prepared_meal_deliveries"
    ADD CONSTRAINT "pending_prepared_meal_deliveries_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."nutrition_vendors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_cycles"
    ADD CONSTRAINT "program_cycles_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."program_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_instances"
    ADD CONSTRAINT "program_instances_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."program_templates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."program_instances"
    ADD CONSTRAINT "program_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_media"
    ADD CONSTRAINT "program_media_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."program_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_templates"
    ADD CONSTRAINT "program_templates_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."program_workout_exercise_progressions"
    ADD CONSTRAINT "program_workout_exercise_progr_program_workout_exercise_id_fkey" FOREIGN KEY ("program_workout_exercise_id") REFERENCES "public"."program_workout_exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_workout_exercises"
    ADD CONSTRAINT "program_workout_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_workout_exercises"
    ADD CONSTRAINT "program_workout_exercises_program_workout_id_fkey" FOREIGN KEY ("program_workout_id") REFERENCES "public"."program_workouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_workouts"
    ADD CONSTRAINT "program_workouts_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."program_cycles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_workouts"
    ADD CONSTRAINT "program_workouts_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."program_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_photos"
    ADD CONSTRAINT "progress_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_foods"
    ADD CONSTRAINT "saved_foods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_events"
    ADD CONSTRAINT "schedule_events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."event_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedule_events"
    ADD CONSTRAINT "schedule_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_adjustments"
    ADD CONSTRAINT "session_adjustments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."generated_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_adjustments"
    ADD CONSTRAINT "session_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_debriefs"
    ADD CONSTRAINT "session_debriefs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."generated_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_debriefs"
    ADD CONSTRAINT "session_debriefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."set_instances"
    ADD CONSTRAINT "set_instances_exercise_instance_id_fkey" FOREIGN KEY ("exercise_instance_id") REFERENCES "public"."exercise_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."set_instances"
    ADD CONSTRAINT "set_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopping_list"
    ADD CONSTRAINT "shopping_list_food_inventory_id_fkey" FOREIGN KEY ("food_inventory_id") REFERENCES "public"."food_inventory"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shopping_list"
    ADD CONSTRAINT "shopping_list_source_meal_id_fkey" FOREIGN KEY ("source_meal_id") REFERENCES "public"."meals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shopping_list"
    ADD CONSTRAINT "shopping_list_source_saved_food_id_fkey" FOREIGN KEY ("source_saved_food_id") REFERENCES "public"."saved_foods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shopping_list"
    ADD CONSTRAINT "shopping_list_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shopping_list"
    ADD CONSTRAINT "shopping_list_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."nutrition_vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."source_exercises"
    ADD CONSTRAINT "source_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."source_exercises"
    ADD CONSTRAINT "source_exercises_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."captured_sources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_attachments"
    ADD CONSTRAINT "ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."dev_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_machine_settings"
    ADD CONSTRAINT "user_machine_settings_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id");



ALTER TABLE ONLY "public"."user_machine_settings"
    ADD CONSTRAINT "user_machine_settings_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id");



ALTER TABLE ONLY "public"."user_machine_settings"
    ADD CONSTRAINT "user_machine_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_current_gym_id_fkey" FOREIGN KEY ("current_gym_id") REFERENCES "public"."gyms"("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."variation_options"
    ADD CONSTRAINT "variation_options_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."variation_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."variation_options"
    ADD CONSTRAINT "variation_options_load_position_id_fkey" FOREIGN KEY ("load_position_id") REFERENCES "public"."load_positions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."variation_options"
    ADD CONSTRAINT "variation_options_movement_family_id_fkey" FOREIGN KEY ("movement_family_id") REFERENCES "public"."movement_families"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."variation_options"
    ADD CONSTRAINT "variation_options_movement_style_id_fkey" FOREIGN KEY ("movement_style_id") REFERENCES "public"."movement_styles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."variation_options"
    ADD CONSTRAINT "variation_options_plane_of_motion_id_fkey" FOREIGN KEY ("plane_of_motion_id") REFERENCES "public"."planes_of_motion"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."variation_options"
    ADD CONSTRAINT "variation_options_range_depth_id_fkey" FOREIGN KEY ("range_depth_id") REFERENCES "public"."range_depths"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."variation_options"
    ADD CONSTRAINT "variation_options_stance_id_fkey" FOREIGN KEY ("stance_id") REFERENCES "public"."stances"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."variation_options"
    ADD CONSTRAINT "variation_options_symmetry_id_fkey" FOREIGN KEY ("symmetry_id") REFERENCES "public"."symmetries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."water_logs"
    ADD CONSTRAINT "water_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weight_logs"
    ADD CONSTRAINT "weight_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wod_movements"
    ADD CONSTRAINT "wod_movements_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id");



ALTER TABLE ONLY "public"."wod_movements"
    ADD CONSTRAINT "wod_movements_l1_alternative_exercise_id_fkey" FOREIGN KEY ("l1_alternative_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wod_movements"
    ADD CONSTRAINT "wod_movements_l2_alternative_exercise_id_fkey" FOREIGN KEY ("l2_alternative_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wod_movements"
    ADD CONSTRAINT "wod_movements_rx_alternative_exercise_id_fkey" FOREIGN KEY ("rx_alternative_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wod_movements"
    ADD CONSTRAINT "wod_movements_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wod_scaling_levels"
    ADD CONSTRAINT "wod_scaling_levels_wod_id_fkey" FOREIGN KEY ("wod_id") REFERENCES "public"."wods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wods"
    ADD CONSTRAINT "wods_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."wod_categories"("id");



ALTER TABLE ONLY "public"."wods"
    ADD CONSTRAINT "wods_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "public"."wod_formats"("id");



ALTER TABLE ONLY "public"."wods"
    ADD CONSTRAINT "wods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_instances"
    ADD CONSTRAINT "workout_instances_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id");



ALTER TABLE ONLY "public"."workout_instances"
    ADD CONSTRAINT "workout_instances_program_instance_id_fkey" FOREIGN KEY ("program_instance_id") REFERENCES "public"."program_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_instances"
    ADD CONSTRAINT "workout_instances_program_workout_id_fkey" FOREIGN KEY ("program_workout_id") REFERENCES "public"."program_workouts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."workout_instances"
    ADD CONSTRAINT "workout_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_schedule_event_id_fkey" FOREIGN KEY ("schedule_event_id") REFERENCES "public"."schedule_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workout_logs"
    ADD CONSTRAINT "workout_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_workout_instance_id_fkey" FOREIGN KEY ("workout_instance_id") REFERENCES "public"."workout_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete dev tasks" ON "public"."dev_tasks" FOR DELETE USING (("public"."auth_is_admin"() AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Admins can insert dev tasks" ON "public"."dev_tasks" FOR INSERT WITH CHECK (("public"."auth_is_admin"() AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Admins can update dev tasks" ON "public"."dev_tasks" FOR UPDATE USING (("public"."auth_is_admin"() AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Admins can view own dev tasks" ON "public"."dev_tasks" FOR SELECT USING (("public"."auth_is_admin"() AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Allow authenticated users to delete exercise_goal_types" ON "public"."exercise_goal_types" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to delete exercise_load_positions" ON "public"."exercise_load_positions" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to delete exercise_planes_of_motion" ON "public"."exercise_planes_of_motion" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to delete exercise_stances" ON "public"."exercise_stances" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to insert exercise_goal_types" ON "public"."exercise_goal_types" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert exercise_load_positions" ON "public"."exercise_load_positions" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert exercise_planes_of_motion" ON "public"."exercise_planes_of_motion" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert exercise_stances" ON "public"."exercise_stances" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update exercise_goal_types" ON "public"."exercise_goal_types" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update exercise_load_positions" ON "public"."exercise_load_positions" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update exercise_planes_of_motion" ON "public"."exercise_planes_of_motion" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update exercise_stances" ON "public"."exercise_stances" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Allow public read access to exercise_goal_types" ON "public"."exercise_goal_types" FOR SELECT USING (true);



CREATE POLICY "Allow public read access to exercise_load_positions" ON "public"."exercise_load_positions" FOR SELECT USING (true);



CREATE POLICY "Allow public read access to exercise_planes_of_motion" ON "public"."exercise_planes_of_motion" FOR SELECT USING (true);



CREATE POLICY "Allow public read access to exercise_stances" ON "public"."exercise_stances" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can create own exercises" ON "public"."exercises" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "Authenticated users can delete exercise muscle regions" ON "public"."exercise_muscle_regions" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can delete exercise scoring types" ON "public"."exercise_scoring_types" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can delete exercise standards" ON "public"."exercise_standards" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can delete exercise variations" ON "public"."exercise_variations" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can delete measurement profiles" ON "public"."movement_measurement_profiles" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can delete scaling links" ON "public"."movement_scaling_links" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can insert exercise muscle regions" ON "public"."exercise_muscle_regions" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert exercise scoring types" ON "public"."exercise_scoring_types" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert exercise standards" ON "public"."exercise_standards" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert exercise variations" ON "public"."exercise_variations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert measurement profiles" ON "public"."movement_measurement_profiles" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can insert scaling links" ON "public"."movement_scaling_links" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can update exercise muscle regions" ON "public"."exercise_muscle_regions" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update exercise scoring types" ON "public"."exercise_scoring_types" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update exercise standards" ON "public"."exercise_standards" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update exercise variations" ON "public"."exercise_variations" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update measurement profiles" ON "public"."movement_measurement_profiles" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can update scaling links" ON "public"."movement_scaling_links" FOR UPDATE TO "authenticated" USING (true);



CREATE POLICY "Equipment are viewable by everyone" ON "public"."equipment" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Everyone can read food_categories" ON "public"."food_categories" FOR SELECT USING (true);



CREATE POLICY "Everyone can read food_subcategories" ON "public"."food_subcategories" FOR SELECT USING (true);



CREATE POLICY "Exercise muscle regions are viewable by everyone" ON "public"."exercise_muscle_regions" FOR SELECT USING (true);



CREATE POLICY "Exercise scoring types are viewable by everyone" ON "public"."exercise_scoring_types" FOR SELECT USING (true);



CREATE POLICY "Exercise standards are viewable by everyone" ON "public"."exercise_standards" FOR SELECT USING (true);



CREATE POLICY "Exercise variations are viewable by everyone" ON "public"."exercise_variations" FOR SELECT USING (true);



CREATE POLICY "Exercises are viewable by everyone" ON "public"."exercises" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Goal types are viewable by everyone" ON "public"."goal_types" FOR SELECT USING (true);



COMMENT ON POLICY "Goal types are viewable by everyone" ON "public"."goal_types" IS 'Reference data - public read access';



CREATE POLICY "Load positions are viewable by everyone" ON "public"."load_positions" FOR SELECT USING (true);



COMMENT ON POLICY "Load positions are viewable by everyone" ON "public"."load_positions" IS 'Reference data - public read access';



CREATE POLICY "Measurement profiles are viewable by everyone" ON "public"."movement_measurement_profiles" FOR SELECT USING (true);



CREATE POLICY "Movement categories are viewable by everyone" ON "public"."movement_categories" FOR SELECT USING (true);



CREATE POLICY "Movement families are viewable by everyone" ON "public"."movement_families" FOR SELECT USING (true);



COMMENT ON POLICY "Movement families are viewable by everyone" ON "public"."movement_families" IS 'Reference data - public read access';



CREATE POLICY "Movement styles are viewable by everyone" ON "public"."movement_styles" FOR SELECT USING (true);



COMMENT ON POLICY "Movement styles are viewable by everyone" ON "public"."movement_styles" IS 'Reference data - public read access';



CREATE POLICY "Muscle regions are viewable by everyone" ON "public"."muscle_regions" FOR SELECT USING (true);



COMMENT ON POLICY "Muscle regions are viewable by everyone" ON "public"."muscle_regions" IS 'Reference data - public read access';



CREATE POLICY "Only creators can delete their programs" ON "public"."program_templates" FOR DELETE USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Only creators can insert programs" ON "public"."program_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "creator_id"));



CREATE POLICY "Only creators can update their programs" ON "public"."program_templates" FOR UPDATE USING (("auth"."uid"() = "creator_id"));



CREATE POLICY "Planes of motion are viewable by everyone" ON "public"."planes_of_motion" FOR SELECT USING (true);



COMMENT ON POLICY "Planes of motion are viewable by everyone" ON "public"."planes_of_motion" IS 'Reference data - public read access';



CREATE POLICY "Program cycles are viewable if program is viewable" ON "public"."program_cycles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."program_templates"
  WHERE (("program_templates"."id" = "program_cycles"."program_id") AND (("program_templates"."is_published" = true) OR ("program_templates"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "Program media is viewable if program is viewable" ON "public"."program_media" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."program_templates"
  WHERE (("program_templates"."id" = "program_media"."program_id") AND (("program_templates"."is_published" = true) OR ("program_templates"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "Program templates are viewable by everyone" ON "public"."program_templates" FOR SELECT USING ((("is_published" = true) OR ("auth"."uid"() = "creator_id")));



CREATE POLICY "Program workout exercises are viewable if workout is viewable" ON "public"."program_workout_exercises" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."program_workouts" "pw"
     JOIN "public"."program_templates" "pt" ON (("pt"."id" = "pw"."program_id")))
  WHERE (("pw"."id" = "program_workout_exercises"."program_workout_id") AND (("pt"."is_published" = true) OR ("pt"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "Program workouts are viewable if program is viewable" ON "public"."program_workouts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."program_templates"
  WHERE (("program_templates"."id" = "program_workouts"."program_id") AND (("program_templates"."is_published" = true) OR ("program_templates"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "Progressions are viewable if exercise is viewable" ON "public"."program_workout_exercise_progressions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."program_workout_exercises" "pwe"
     JOIN "public"."program_workouts" "pw" ON (("pw"."id" = "pwe"."program_workout_id")))
     JOIN "public"."program_templates" "pt" ON (("pt"."id" = "pw"."program_id")))
  WHERE (("pwe"."id" = "program_workout_exercise_progressions"."program_workout_exercise_id") AND (("pt"."is_published" = true) OR ("pt"."creator_id" = "auth"."uid"()))))));



CREATE POLICY "Range depths are viewable by everyone" ON "public"."range_depths" FOR SELECT USING (true);



COMMENT ON POLICY "Range depths are viewable by everyone" ON "public"."range_depths" IS 'Reference data - public read access';



CREATE POLICY "Scaling links are viewable by everyone" ON "public"."movement_scaling_links" FOR SELECT USING (true);



CREATE POLICY "Scoring types are viewable by everyone" ON "public"."scoring_types" FOR SELECT USING (true);



CREATE POLICY "Stances are viewable by everyone" ON "public"."stances" FOR SELECT USING (true);



COMMENT ON POLICY "Stances are viewable by everyone" ON "public"."stances" IS 'Reference data - public read access';



CREATE POLICY "Symmetries are viewable by everyone" ON "public"."symmetries" FOR SELECT USING (true);



COMMENT ON POLICY "Symmetries are viewable by everyone" ON "public"."symmetries" IS 'Reference data - public read access';



CREATE POLICY "Users can create gyms" ON "public"."gyms" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can create their own WODs" ON "public"."wods" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own classes" ON "public"."classes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own exercise instances" ON "public"."exercise_instances" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own program instances" ON "public"."program_instances" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own set instances" ON "public"."set_instances" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own workout instances" ON "public"."workout_instances" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete exercises from own program workouts" ON "public"."program_workout_exercises" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."program_workouts" "pw"
     JOIN "public"."program_templates" "pt" ON (("pt"."id" = "pw"."program_id")))
  WHERE (("pw"."id" = "program_workout_exercises"."program_workout_id") AND ("pt"."creator_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own attachments" ON "public"."ticket_attachments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own categories" ON "public"."event_categories" FOR DELETE USING ((("auth"."uid"() = "user_id") AND ("is_default" = false)));



CREATE POLICY "Users can delete own custom exercises or admins can delete any" ON "public"."exercises" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))) OR (("created_by" = "auth"."uid"()) AND ("is_official" = false))));



CREATE POLICY "Users can delete own events" ON "public"."schedule_events" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own machine settings" ON "public"."user_machine_settings" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own nutrition logs" ON "public"."nutrition_logs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own templates" ON "public"."event_templates" FOR DELETE USING ((("auth"."uid"() = "user_id") AND ("is_system_template" = false)));



CREATE POLICY "Users can delete own todos" ON "public"."todos" FOR DELETE USING (("user_id" = '3a6c86e7-7cbd-4cf1-adc6-a6fa1acf3d92'::"uuid"));



CREATE POLICY "Users can delete own workout sessions" ON "public"."workout_sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own workouts" ON "public"."workouts" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete tasks from their templates" ON "public"."morning_routine_tasks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."morning_routine_templates"
  WHERE (("morning_routine_templates"."id" = "morning_routine_tasks"."template_id") AND ("morning_routine_templates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own WOD movements" ON "public"."wod_movements" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."wods"
  WHERE (("wods"."id" = "wod_movements"."wod_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own WOD scaling levels" ON "public"."wod_scaling_levels" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."wods"
  WHERE (("wods"."id" = "wod_scaling_levels"."wod_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own WODs" ON "public"."wods" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own body measurements" ON "public"."body_measurements" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own calorie ramp levels" ON "public"."calorie_ramp_levels" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own category mappings" ON "public"."food_inventory_category_map" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own class parts" ON "public"."class_parts" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_parts"."class_id") AND ("classes"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own classes" ON "public"."classes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own exercise instances" ON "public"."exercise_instances" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own exercise movement styles" ON "public"."exercise_movement_styles" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."exercises"
  WHERE (("exercises"."id" = "exercise_movement_styles"."exercise_id") AND ("exercises"."created_by" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own food concept links" ON "public"."food_concept_links" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own food concepts" ON "public"."food_concepts" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own food inventory" ON "public"."food_inventory" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own food inventory locations" ON "public"."food_inventory_locations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own meal logs" ON "public"."meal_logs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own movement standards" ON "public"."movement_standards" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."wod_movements" "wm"
     JOIN "public"."wods" ON (("wods"."id" = "wm"."wod_id")))
  WHERE (("wm"."id" = "movement_standards"."wod_movement_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own non-default categories" ON "public"."food_categories" FOR DELETE USING ((("auth"."uid"() = "user_id") AND ("is_default" = false)));



CREATE POLICY "Users can delete their own nutrition constraints" ON "public"."nutrition_constraints" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own nutrition vendors" ON "public"."nutrition_vendors" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own program instances" ON "public"."program_instances" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own progress photos" ON "public"."progress_photos" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own routine completions" ON "public"."morning_routine_completions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own routine templates" ON "public"."morning_routine_templates" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own saved foods" ON "public"."saved_foods" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own set instances" ON "public"."set_instances" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own shopping list items" ON "public"."shopping_list" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own subcategory mappings" ON "public"."food_inventory_subcategory_map" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own water logs" ON "public"."water_logs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own weight logs" ON "public"."weight_logs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own workout instances" ON "public"."workout_instances" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own workout logs" ON "public"."workout_logs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete workouts from own programs" ON "public"."program_workouts" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."program_templates"
  WHERE (("program_templates"."id" = "program_workouts"."program_id") AND ("program_templates"."creator_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert exercises into own program workouts" ON "public"."program_workout_exercises" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."program_workouts" "pw"
     JOIN "public"."program_templates" "pt" ON (("pt"."id" = "pw"."program_id")))
  WHERE (("pw"."id" = "program_workout_exercises"."program_workout_id") AND ("pt"."creator_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own attachments" ON "public"."ticket_attachments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own categories" ON "public"."event_categories" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own events" ON "public"."schedule_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own machine settings" ON "public"."user_machine_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own nutrition logs" ON "public"."nutrition_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own preferences" ON "public"."user_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own templates" ON "public"."event_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own todos" ON "public"."todos" FOR INSERT WITH CHECK (("user_id" = '3a6c86e7-7cbd-4cf1-adc6-a6fa1acf3d92'::"uuid"));



CREATE POLICY "Users can insert own workout sessions" ON "public"."workout_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own workouts" ON "public"."workouts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert tasks to their templates" ON "public"."morning_routine_tasks" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."morning_routine_templates"
  WHERE (("morning_routine_templates"."id" = "morning_routine_tasks"."template_id") AND ("morning_routine_templates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own WOD movements" ON "public"."wod_movements" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wods"
  WHERE (("wods"."id" = "wod_movements"."wod_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own WOD scaling levels" ON "public"."wod_scaling_levels" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."wods"
  WHERE (("wods"."id" = "wod_scaling_levels"."wod_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own body measurements" ON "public"."body_measurements" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own calorie ramp levels" ON "public"."calorie_ramp_levels" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own category mappings" ON "public"."food_inventory_category_map" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own class parts" ON "public"."class_parts" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_parts"."class_id") AND ("classes"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own exercise movement styles" ON "public"."exercise_movement_styles" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."exercises"
  WHERE (("exercises"."id" = "exercise_movement_styles"."exercise_id") AND (("exercises"."created_by" = "auth"."uid"()) OR ("exercises"."is_official" = true))))));



CREATE POLICY "Users can insert their own food categories" ON "public"."food_categories" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own food concept links" ON "public"."food_concept_links" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own food concepts" ON "public"."food_concepts" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own food inventory" ON "public"."food_inventory" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own food inventory locations" ON "public"."food_inventory_locations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own meal logs" ON "public"."meal_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own movement standards" ON "public"."movement_standards" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."wod_movements" "wm"
     JOIN "public"."wods" ON (("wods"."id" = "wm"."wod_id")))
  WHERE (("wm"."id" = "movement_standards"."wod_movement_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own nutrition constraints" ON "public"."nutrition_constraints" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own nutrition vendors" ON "public"."nutrition_vendors" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own progress photos" ON "public"."progress_photos" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own routine completions" ON "public"."morning_routine_completions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own routine templates" ON "public"."morning_routine_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own saved foods" ON "public"."saved_foods" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own shopping list items" ON "public"."shopping_list" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own subcategory mappings" ON "public"."food_inventory_subcategory_map" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own suggestions" ON "public"."eat_next_suggestions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own water logs" ON "public"."water_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own weight logs" ON "public"."weight_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own workout logs" ON "public"."workout_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert workouts into own programs" ON "public"."program_workouts" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."program_templates"
  WHERE (("program_templates"."id" = "program_workouts"."program_id") AND ("program_templates"."creator_id" = "auth"."uid"())))));



CREATE POLICY "Users can update exercises in own program workouts" ON "public"."program_workout_exercises" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."program_workouts" "pw"
     JOIN "public"."program_templates" "pt" ON (("pt"."id" = "pw"."program_id")))
  WHERE (("pw"."id" = "program_workout_exercises"."program_workout_id") AND ("pt"."creator_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."program_workouts" "pw"
     JOIN "public"."program_templates" "pt" ON (("pt"."id" = "pw"."program_id")))
  WHERE (("pw"."id" = "program_workout_exercises"."program_workout_id") AND ("pt"."creator_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own categories" ON "public"."event_categories" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own custom exercises" ON "public"."exercises" FOR UPDATE USING ((("created_by" = "auth"."uid"()) AND ("is_official" = false)));



CREATE POLICY "Users can update own events" ON "public"."schedule_events" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own machine settings" ON "public"."user_machine_settings" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own nutrition logs" ON "public"."nutrition_logs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own preferences" ON "public"."user_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own templates" ON "public"."event_templates" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own todos" ON "public"."todos" FOR UPDATE USING (("user_id" = '3a6c86e7-7cbd-4cf1-adc6-a6fa1acf3d92'::"uuid"));



CREATE POLICY "Users can update own workout sessions" ON "public"."workout_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own workouts" ON "public"."workouts" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update tasks in their templates" ON "public"."morning_routine_tasks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."morning_routine_templates"
  WHERE (("morning_routine_templates"."id" = "morning_routine_tasks"."template_id") AND ("morning_routine_templates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own WOD movements" ON "public"."wod_movements" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."wods"
  WHERE (("wods"."id" = "wod_movements"."wod_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own WOD scaling levels" ON "public"."wod_scaling_levels" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."wods"
  WHERE (("wods"."id" = "wod_scaling_levels"."wod_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own WODs" ON "public"."wods" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own body measurements" ON "public"."body_measurements" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own calorie ramp levels" ON "public"."calorie_ramp_levels" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own class parts" ON "public"."class_parts" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_parts"."class_id") AND ("classes"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own classes" ON "public"."classes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own exercise instances" ON "public"."exercise_instances" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own exercise movement styles" ON "public"."exercise_movement_styles" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."exercises"
  WHERE (("exercises"."id" = "exercise_movement_styles"."exercise_id") AND ("exercises"."created_by" = "auth"."uid"())))));



CREATE POLICY "Users can update their own food categories" ON "public"."food_categories" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own food concept links" ON "public"."food_concept_links" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own food concepts" ON "public"."food_concepts" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own food inventory" ON "public"."food_inventory" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own food inventory locations" ON "public"."food_inventory_locations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own gyms" ON "public"."gyms" FOR UPDATE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can update their own meal logs" ON "public"."meal_logs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own movement standards" ON "public"."movement_standards" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."wod_movements" "wm"
     JOIN "public"."wods" ON (("wods"."id" = "wm"."wod_id")))
  WHERE (("wm"."id" = "movement_standards"."wod_movement_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own nutrition constraints" ON "public"."nutrition_constraints" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own nutrition vendors" ON "public"."nutrition_vendors" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own program instances" ON "public"."program_instances" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own progress photos" ON "public"."progress_photos" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own routine completions" ON "public"."morning_routine_completions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own routine templates" ON "public"."morning_routine_templates" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own saved foods" ON "public"."saved_foods" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own set instances" ON "public"."set_instances" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own shopping list items" ON "public"."shopping_list" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own suggestions" ON "public"."eat_next_suggestions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own water logs" ON "public"."water_logs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own weight logs" ON "public"."weight_logs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own workout instances" ON "public"."workout_instances" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own workout logs" ON "public"."workout_logs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update workouts in own programs" ON "public"."program_workouts" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."program_templates"
  WHERE (("program_templates"."id" = "program_workouts"."program_id") AND ("program_templates"."creator_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."program_templates"
  WHERE (("program_templates"."id" = "program_workouts"."program_id") AND ("program_templates"."creator_id" = "auth"."uid"())))));



CREATE POLICY "Users can view all gyms" ON "public"."gyms" FOR SELECT USING (true);



CREATE POLICY "Users can view exercise movement styles" ON "public"."exercise_movement_styles" FOR SELECT USING (true);



CREATE POLICY "Users can view official and own exercises" ON "public"."exercises" FOR SELECT USING ((("is_official" = true) OR ("created_by" = "auth"."uid"())));



CREATE POLICY "Users can view own attachments" ON "public"."ticket_attachments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own categories and defaults" ON "public"."event_categories" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_default" = true)));



CREATE POLICY "Users can view own events" ON "public"."schedule_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own machine settings" ON "public"."user_machine_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own nutrition logs" ON "public"."nutrition_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own preferences" ON "public"."user_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own templates and system templates" ON "public"."event_templates" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_system_template" = true)));



CREATE POLICY "Users can view own todos" ON "public"."todos" FOR SELECT USING (("user_id" = '3a6c86e7-7cbd-4cf1-adc6-a6fa1acf3d92'::"uuid"));



CREATE POLICY "Users can view own workout sessions" ON "public"."workout_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own workouts" ON "public"."workouts" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view tasks from their templates" ON "public"."morning_routine_tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."morning_routine_templates"
  WHERE (("morning_routine_templates"."id" = "morning_routine_tasks"."template_id") AND ("morning_routine_templates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own WOD movements" ON "public"."wod_movements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."wods"
  WHERE (("wods"."id" = "wod_movements"."wod_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own WOD scaling levels" ON "public"."wod_scaling_levels" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."wods"
  WHERE (("wods"."id" = "wod_scaling_levels"."wod_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own WODs" ON "public"."wods" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own body measurements" ON "public"."body_measurements" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own calorie ramp levels" ON "public"."calorie_ramp_levels" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own category mappings" ON "public"."food_inventory_category_map" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own class parts" ON "public"."class_parts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."classes"
  WHERE (("classes"."id" = "class_parts"."class_id") AND ("classes"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own classes" ON "public"."classes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own exercise instances" ON "public"."exercise_instances" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own food categories" ON "public"."food_categories" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own food concept links" ON "public"."food_concept_links" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own food concepts" ON "public"."food_concepts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own food inventory" ON "public"."food_inventory" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own food inventory locations" ON "public"."food_inventory_locations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own meal logs" ON "public"."meal_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own movement standards" ON "public"."movement_standards" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."wod_movements" "wm"
     JOIN "public"."wods" ON (("wods"."id" = "wm"."wod_id")))
  WHERE (("wm"."id" = "movement_standards"."wod_movement_id") AND ("wods"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own nutrition constraints" ON "public"."nutrition_constraints" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own nutrition vendors" ON "public"."nutrition_vendors" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own program instances" ON "public"."program_instances" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own progress photos" ON "public"."progress_photos" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own routine completions" ON "public"."morning_routine_completions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own routine templates" ON "public"."morning_routine_templates" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own saved foods" ON "public"."saved_foods" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own set instances" ON "public"."set_instances" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own shopping list" ON "public"."shopping_list" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own subcategory mappings" ON "public"."food_inventory_subcategory_map" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own suggestions" ON "public"."eat_next_suggestions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own water logs" ON "public"."water_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own weight logs" ON "public"."weight_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own workout instances" ON "public"."workout_instances" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own workout logs" ON "public"."workout_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own captured sources" ON "public"."captured_sources" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own captured workout items" ON "public"."captured_workout_exercises" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."captured_workouts" "w"
  WHERE (("w"."id" = "captured_workout_exercises"."captured_workout_id") AND ("w"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."captured_workouts" "w"
  WHERE (("w"."id" = "captured_workout_exercises"."captured_workout_id") AND ("w"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users manage own captured workouts" ON "public"."captured_workouts" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own session blocks" ON "public"."generated_session_blocks" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."generated_sessions" "s"
  WHERE (("s"."id" = "generated_session_blocks"."session_id") AND ("s"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."generated_sessions" "s"
  WHERE (("s"."id" = "generated_session_blocks"."session_id") AND ("s"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users manage own source links" ON "public"."source_exercises" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."captured_sources" "s"
  WHERE (("s"."id" = "source_exercises"."source_id") AND ("s"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."captured_sources" "s"
  WHERE (("s"."id" = "source_exercises"."source_id") AND ("s"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users manage own workout muscles" ON "public"."captured_workout_muscles" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."captured_workouts" "w"
  WHERE (("w"."id" = "captured_workout_muscles"."captured_workout_id") AND ("w"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."captured_workouts" "w"
  WHERE (("w"."id" = "captured_workout_muscles"."captured_workout_id") AND ("w"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users manage own workout usage" ON "public"."captured_workout_usage" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Variation categories are viewable by everyone" ON "public"."variation_categories" FOR SELECT USING (true);



COMMENT ON POLICY "Variation categories are viewable by everyone" ON "public"."variation_categories" IS 'Reference data - public read access';



CREATE POLICY "Variation options are viewable by everyone" ON "public"."variation_options" FOR SELECT USING (true);



COMMENT ON POLICY "Variation options are viewable by everyone" ON "public"."variation_options" IS 'Reference data - public read access';



CREATE POLICY "WOD categories are viewable by everyone" ON "public"."wod_categories" FOR SELECT USING (true);



COMMENT ON POLICY "WOD categories are viewable by everyone" ON "public"."wod_categories" IS 'Reference data - public read access';



CREATE POLICY "WOD formats are viewable by everyone" ON "public"."wod_formats" FOR SELECT USING (true);



COMMENT ON POLICY "WOD formats are viewable by everyone" ON "public"."wod_formats" IS 'Reference data - public read access';



ALTER TABLE "public"."body_measurements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calorie_ramp_levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."captured_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."captured_workout_exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."captured_workout_muscles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."captured_workout_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."captured_workouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_checkin_soreness" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dev_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."eat_next_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."eating_windows" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "eating_windows_delete_own" ON "public"."eating_windows" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "eating_windows_insert_own" ON "public"."eating_windows" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "eating_windows_select_own" ON "public"."eating_windows" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "eating_windows_update_own" ON "public"."eating_windows" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."equipment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_goal_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_load_positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_movement_styles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_muscle_regions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_planes_of_motion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_scoring_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_skill_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_stances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_standards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_variations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_concept_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_concepts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_inventory_category_map" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_inventory_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_inventory_subcategory_map" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_subcategories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_session_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_session_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goal_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gym_profile_equipment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gym_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gyms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_events_insert_own" ON "public"."inventory_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "inventory_events_select_own" ON "public"."inventory_events" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."load_positions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meal_categories_delete_own" ON "public"."meal_categories" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "meal_categories_insert_own" ON "public"."meal_categories" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "meal_categories_select_own" ON "public"."meal_categories" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "meal_categories_update_own" ON "public"."meal_categories" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."meal_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meal_items_delete_own" ON "public"."meal_items" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "meal_items_insert_own" ON "public"."meal_items" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "meal_items_select_own" ON "public"."meal_items" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "meal_items_update_own" ON "public"."meal_items" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."meal_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meal_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meal_roles_delete_own" ON "public"."meal_roles" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "meal_roles_insert_own" ON "public"."meal_roles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "meal_roles_select_own" ON "public"."meal_roles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "meal_roles_update_own" ON "public"."meal_roles" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."meals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meals_delete_own" ON "public"."meals" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "meals_insert_own" ON "public"."meals" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "meals_select_own" ON "public"."meals" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "meals_update_own" ON "public"."meals" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."morning_routine_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."morning_routine_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."morning_routine_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movement_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movement_families" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movement_measurement_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movement_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movement_scaling_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movement_standards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."movement_styles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."muscle_regions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_constraints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nutrition_vendors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own adjustments" ON "public"."session_adjustments" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own checkins" ON "public"."daily_checkins" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own debriefs" ON "public"."session_debriefs" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own gym equipment" ON "public"."gym_profile_equipment" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."gym_profiles" "g"
  WHERE (("g"."id" = "gym_profile_equipment"."gym_profile_id") AND ("g"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."gym_profiles" "g"
  WHERE (("g"."id" = "gym_profile_equipment"."gym_profile_id") AND ("g"."user_id" = "auth"."uid"())))));



CREATE POLICY "own gyms" ON "public"."gym_profiles" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own movement ratings" ON "public"."movement_ratings" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own pending deliveries" ON "public"."pending_prepared_meal_deliveries" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own session items" ON "public"."generated_session_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."generated_sessions" "s"
  WHERE (("s"."id" = "generated_session_items"."session_id") AND ("s"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."generated_sessions" "s"
  WHERE (("s"."id" = "generated_session_items"."session_id") AND ("s"."user_id" = "auth"."uid"())))));



CREATE POLICY "own sessions" ON "public"."generated_sessions" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own skill state" ON "public"."exercise_skill_state" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own soreness" ON "public"."daily_checkin_soreness" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."daily_checkins" "c"
  WHERE (("c"."id" = "daily_checkin_soreness"."checkin_id") AND ("c"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."daily_checkins" "c"
  WHERE (("c"."id" = "daily_checkin_soreness"."checkin_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."pending_prepared_meal_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planes_of_motion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_cycles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_workout_exercise_progressions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_workout_exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_workouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."progress_photos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."range_depths" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_foods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scoring_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_debriefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."set_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shopping_list" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."source_exercises" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."symmetries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."todos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_machine_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."variation_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."variation_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."water_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weight_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wod_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wod_formats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wod_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wod_scaling_levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workout_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workouts" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."auth_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_inventory_units"("p_inventory_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_inventory_units"("p_inventory_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_inventory_units"("p_inventory_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."consume_one_inventory_unit"("p_inventory_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."consume_one_inventory_unit"("p_inventory_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_one_inventory_unit"("p_inventory_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_meals" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_meals" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_meals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_meals" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."discard_inventory_units"("p_inventory_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."discard_inventory_units"("p_inventory_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."discard_inventory_units"("p_inventory_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_movement_tier"("exercise_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_movement_tier"("exercise_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_movement_tier"("exercise_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."materialize_due_prepared_meal_deliveries"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."materialize_due_prepared_meal_deliveries"() TO "anon";
GRANT ALL ON FUNCTION "public"."materialize_due_prepared_meal_deliveries"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."materialize_due_prepared_meal_deliveries"() TO "service_role";



GRANT ALL ON FUNCTION "public"."meal_categories_check_set"() TO "anon";
GRANT ALL ON FUNCTION "public"."meal_categories_check_set"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."meal_categories_check_set"() TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_single_location_items"() TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_single_location_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_single_location_items"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prepared_meal_slug"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."prepared_meal_slug"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."prepared_meal_slug"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_circular_reference"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_circular_reference"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_circular_reference"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refund_inventory_units"("p_inventory_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refund_inventory_units"("p_inventory_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."refund_inventory_units"("p_inventory_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."replace_item_locations"("p_item_id" "uuid", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_item_locations"("p_item_id" "uuid", "p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_item_locations"("p_item_id" "uuid", "p_rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_inventory_unit"("p_inventory_id" "uuid", "p_location_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_inventory_unit"("p_inventory_id" "uuid", "p_location_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_inventory_unit"("p_inventory_id" "uuid", "p_location_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."schedule_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_arrives_at" timestamp with time zone, "p_meals" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."schedule_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_arrives_at" timestamp with time zone, "p_meals" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."schedule_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_arrives_at" timestamp with time zone, "p_meals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schedule_prepared_meal_delivery"("p_vendor_id" "uuid", "p_use_by" "date", "p_arrives_at" timestamp with time zone, "p_meals" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_active_ramp_level"("p_level_id" "uuid", "p_today" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_active_ramp_level"("p_level_id" "uuid", "p_today" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."set_active_ramp_level"("p_level_id" "uuid", "p_today" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_ramp_level"("p_level_id" "uuid", "p_today" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_meal_categories"("p_meal_id" "uuid", "p_categories" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_meal_categories"("p_meal_id" "uuid", "p_categories" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."set_meal_categories"("p_meal_id" "uuid", "p_categories" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_meal_categories"("p_meal_id" "uuid", "p_categories" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_meal_roles"("p_meal_id" "uuid", "p_roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_meal_roles"("p_meal_id" "uuid", "p_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."set_meal_roles"("p_meal_id" "uuid", "p_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_meal_roles"("p_meal_id" "uuid", "p_roles" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_inventory_units"("p_item_id" "uuid", "p_from_location_id" "uuid", "p_to_location_id" "uuid", "p_quantity" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_inventory_units"("p_item_id" "uuid", "p_from_location_id" "uuid", "p_to_location_id" "uuid", "p_quantity" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_inventory_units"("p_item_id" "uuid", "p_from_location_id" "uuid", "p_to_location_id" "uuid", "p_quantity" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_exercise_standards_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_exercise_standards_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_exercise_standards_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_morning_routine_completions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_morning_routine_completions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_morning_routine_completions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_morning_routine_tasks_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_morning_routine_tasks_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_morning_routine_tasks_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_morning_routine_templates_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_morning_routine_templates_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_morning_routine_templates_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_saved_foods_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_saved_foods_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_saved_foods_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_workout_sessions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_workout_sessions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_workout_sessions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_movement_depth"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_movement_depth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_movement_depth"() TO "service_role";


















GRANT ALL ON TABLE "public"."body_measurements" TO "anon";
GRANT ALL ON TABLE "public"."body_measurements" TO "authenticated";
GRANT ALL ON TABLE "public"."body_measurements" TO "service_role";



GRANT ALL ON TABLE "public"."calorie_ramp_levels" TO "anon";
GRANT ALL ON TABLE "public"."calorie_ramp_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."calorie_ramp_levels" TO "service_role";



GRANT ALL ON TABLE "public"."captured_sources" TO "anon";
GRANT ALL ON TABLE "public"."captured_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."captured_sources" TO "service_role";



GRANT ALL ON TABLE "public"."captured_workout_exercises" TO "anon";
GRANT ALL ON TABLE "public"."captured_workout_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."captured_workout_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."captured_workout_muscles" TO "anon";
GRANT ALL ON TABLE "public"."captured_workout_muscles" TO "authenticated";
GRANT ALL ON TABLE "public"."captured_workout_muscles" TO "service_role";



GRANT ALL ON TABLE "public"."captured_workout_usage" TO "anon";
GRANT ALL ON TABLE "public"."captured_workout_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."captured_workout_usage" TO "service_role";



GRANT ALL ON TABLE "public"."captured_workouts" TO "anon";
GRANT ALL ON TABLE "public"."captured_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."captured_workouts" TO "service_role";



GRANT ALL ON TABLE "public"."class_parts" TO "anon";
GRANT ALL ON TABLE "public"."class_parts" TO "authenticated";
GRANT ALL ON TABLE "public"."class_parts" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."daily_checkin_soreness" TO "anon";
GRANT ALL ON TABLE "public"."daily_checkin_soreness" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_checkin_soreness" TO "service_role";



GRANT ALL ON TABLE "public"."daily_checkins" TO "anon";
GRANT ALL ON TABLE "public"."daily_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."dev_tasks" TO "anon";
GRANT ALL ON TABLE "public"."dev_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."eat_next_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."eat_next_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."eat_next_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."eating_windows" TO "anon";
GRANT ALL ON TABLE "public"."eating_windows" TO "authenticated";
GRANT ALL ON TABLE "public"."eating_windows" TO "service_role";



GRANT ALL ON TABLE "public"."equipment" TO "anon";
GRANT ALL ON TABLE "public"."equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment" TO "service_role";



GRANT ALL ON TABLE "public"."event_categories" TO "anon";
GRANT ALL ON TABLE "public"."event_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."event_categories" TO "service_role";



GRANT ALL ON TABLE "public"."event_templates" TO "anon";
GRANT ALL ON TABLE "public"."event_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."event_templates" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_goal_types" TO "anon";
GRANT ALL ON TABLE "public"."exercise_goal_types" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_goal_types" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_instances" TO "anon";
GRANT ALL ON TABLE "public"."exercise_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_instances" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_load_positions" TO "anon";
GRANT ALL ON TABLE "public"."exercise_load_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_load_positions" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_movement_styles" TO "anon";
GRANT ALL ON TABLE "public"."exercise_movement_styles" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_movement_styles" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_muscle_regions" TO "anon";
GRANT ALL ON TABLE "public"."exercise_muscle_regions" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_muscle_regions" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_planes_of_motion" TO "anon";
GRANT ALL ON TABLE "public"."exercise_planes_of_motion" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_planes_of_motion" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_scoring_types" TO "anon";
GRANT ALL ON TABLE "public"."exercise_scoring_types" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_scoring_types" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_skill_state" TO "anon";
GRANT ALL ON TABLE "public"."exercise_skill_state" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_skill_state" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_stances" TO "anon";
GRANT ALL ON TABLE "public"."exercise_stances" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_stances" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_standards" TO "anon";
GRANT ALL ON TABLE "public"."exercise_standards" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_standards" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_variations" TO "anon";
GRANT ALL ON TABLE "public"."exercise_variations" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_variations" TO "service_role";



GRANT ALL ON TABLE "public"."exercises" TO "anon";
GRANT ALL ON TABLE "public"."exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."exercises" TO "service_role";



GRANT ALL ON TABLE "public"."food_categories" TO "anon";
GRANT ALL ON TABLE "public"."food_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."food_categories" TO "service_role";



GRANT ALL ON TABLE "public"."food_concept_links" TO "anon";
GRANT ALL ON TABLE "public"."food_concept_links" TO "authenticated";
GRANT ALL ON TABLE "public"."food_concept_links" TO "service_role";



GRANT ALL ON TABLE "public"."food_concepts" TO "anon";
GRANT ALL ON TABLE "public"."food_concepts" TO "authenticated";
GRANT ALL ON TABLE "public"."food_concepts" TO "service_role";



GRANT ALL ON TABLE "public"."food_inventory" TO "anon";
GRANT ALL ON TABLE "public"."food_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."food_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."food_inventory_category_map" TO "anon";
GRANT ALL ON TABLE "public"."food_inventory_category_map" TO "authenticated";
GRANT ALL ON TABLE "public"."food_inventory_category_map" TO "service_role";



GRANT ALL ON TABLE "public"."food_inventory_locations" TO "anon";
GRANT ALL ON TABLE "public"."food_inventory_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."food_inventory_locations" TO "service_role";



GRANT ALL ON TABLE "public"."food_inventory_subcategory_map" TO "anon";
GRANT ALL ON TABLE "public"."food_inventory_subcategory_map" TO "authenticated";
GRANT ALL ON TABLE "public"."food_inventory_subcategory_map" TO "service_role";



GRANT ALL ON TABLE "public"."food_subcategories" TO "anon";
GRANT ALL ON TABLE "public"."food_subcategories" TO "authenticated";
GRANT ALL ON TABLE "public"."food_subcategories" TO "service_role";



GRANT ALL ON TABLE "public"."generated_session_blocks" TO "anon";
GRANT ALL ON TABLE "public"."generated_session_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_session_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."generated_session_items" TO "anon";
GRANT ALL ON TABLE "public"."generated_session_items" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_session_items" TO "service_role";



GRANT ALL ON TABLE "public"."generated_sessions" TO "anon";
GRANT ALL ON TABLE "public"."generated_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."goal_types" TO "anon";
GRANT ALL ON TABLE "public"."goal_types" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_types" TO "service_role";



GRANT ALL ON TABLE "public"."gym_profile_equipment" TO "anon";
GRANT ALL ON TABLE "public"."gym_profile_equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."gym_profile_equipment" TO "service_role";



GRANT ALL ON TABLE "public"."gym_profiles" TO "anon";
GRANT ALL ON TABLE "public"."gym_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."gym_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."gyms" TO "anon";
GRANT ALL ON TABLE "public"."gyms" TO "authenticated";
GRANT ALL ON TABLE "public"."gyms" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_events" TO "anon";
GRANT ALL ON TABLE "public"."inventory_events" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_events" TO "service_role";



GRANT ALL ON TABLE "public"."load_positions" TO "anon";
GRANT ALL ON TABLE "public"."load_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."load_positions" TO "service_role";



GRANT ALL ON TABLE "public"."meal_categories" TO "anon";
GRANT ALL ON TABLE "public"."meal_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_categories" TO "service_role";



GRANT ALL ON TABLE "public"."meal_items" TO "anon";
GRANT ALL ON TABLE "public"."meal_items" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_items" TO "service_role";



GRANT ALL ON TABLE "public"."meal_logs" TO "anon";
GRANT ALL ON TABLE "public"."meal_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_logs" TO "service_role";



GRANT ALL ON TABLE "public"."meal_roles" TO "anon";
GRANT ALL ON TABLE "public"."meal_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."meal_roles" TO "service_role";



GRANT ALL ON TABLE "public"."meals" TO "anon";
GRANT ALL ON TABLE "public"."meals" TO "authenticated";
GRANT ALL ON TABLE "public"."meals" TO "service_role";



GRANT ALL ON TABLE "public"."morning_routine_completions" TO "anon";
GRANT ALL ON TABLE "public"."morning_routine_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."morning_routine_completions" TO "service_role";



GRANT ALL ON TABLE "public"."morning_routine_tasks" TO "anon";
GRANT ALL ON TABLE "public"."morning_routine_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."morning_routine_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."morning_routine_templates" TO "anon";
GRANT ALL ON TABLE "public"."morning_routine_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."morning_routine_templates" TO "service_role";



GRANT ALL ON TABLE "public"."movement_categories" TO "anon";
GRANT ALL ON TABLE "public"."movement_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."movement_categories" TO "service_role";



GRANT ALL ON TABLE "public"."movement_families" TO "anon";
GRANT ALL ON TABLE "public"."movement_families" TO "authenticated";
GRANT ALL ON TABLE "public"."movement_families" TO "service_role";



GRANT ALL ON TABLE "public"."movement_measurement_profiles" TO "anon";
GRANT ALL ON TABLE "public"."movement_measurement_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."movement_measurement_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."movement_ratings" TO "anon";
GRANT ALL ON TABLE "public"."movement_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."movement_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."movement_scaling_links" TO "anon";
GRANT ALL ON TABLE "public"."movement_scaling_links" TO "authenticated";
GRANT ALL ON TABLE "public"."movement_scaling_links" TO "service_role";



GRANT ALL ON TABLE "public"."movement_standards" TO "anon";
GRANT ALL ON TABLE "public"."movement_standards" TO "authenticated";
GRANT ALL ON TABLE "public"."movement_standards" TO "service_role";



GRANT ALL ON TABLE "public"."movement_styles" TO "anon";
GRANT ALL ON TABLE "public"."movement_styles" TO "authenticated";
GRANT ALL ON TABLE "public"."movement_styles" TO "service_role";



GRANT ALL ON TABLE "public"."muscle_regions" TO "anon";
GRANT ALL ON TABLE "public"."muscle_regions" TO "authenticated";
GRANT ALL ON TABLE "public"."muscle_regions" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_constraints" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_constraints" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_constraints" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_logs" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_logs" TO "service_role";



GRANT ALL ON TABLE "public"."nutrition_vendors" TO "anon";
GRANT ALL ON TABLE "public"."nutrition_vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."nutrition_vendors" TO "service_role";



GRANT ALL ON TABLE "public"."pending_prepared_meal_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."pending_prepared_meal_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_prepared_meal_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."planes_of_motion" TO "anon";
GRANT ALL ON TABLE "public"."planes_of_motion" TO "authenticated";
GRANT ALL ON TABLE "public"."planes_of_motion" TO "service_role";



GRANT ALL ON TABLE "public"."prepared_meal_delivery_history" TO "anon";
GRANT ALL ON TABLE "public"."prepared_meal_delivery_history" TO "authenticated";
GRANT ALL ON TABLE "public"."prepared_meal_delivery_history" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."program_cycles" TO "anon";
GRANT ALL ON TABLE "public"."program_cycles" TO "authenticated";
GRANT ALL ON TABLE "public"."program_cycles" TO "service_role";



GRANT ALL ON TABLE "public"."program_instances" TO "anon";
GRANT ALL ON TABLE "public"."program_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."program_instances" TO "service_role";



GRANT ALL ON TABLE "public"."program_media" TO "anon";
GRANT ALL ON TABLE "public"."program_media" TO "authenticated";
GRANT ALL ON TABLE "public"."program_media" TO "service_role";



GRANT ALL ON TABLE "public"."program_templates" TO "anon";
GRANT ALL ON TABLE "public"."program_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."program_templates" TO "service_role";



GRANT ALL ON TABLE "public"."program_workout_exercise_progressions" TO "anon";
GRANT ALL ON TABLE "public"."program_workout_exercise_progressions" TO "authenticated";
GRANT ALL ON TABLE "public"."program_workout_exercise_progressions" TO "service_role";



GRANT ALL ON TABLE "public"."program_workout_exercises" TO "anon";
GRANT ALL ON TABLE "public"."program_workout_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."program_workout_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."program_workouts" TO "anon";
GRANT ALL ON TABLE "public"."program_workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."program_workouts" TO "service_role";



GRANT ALL ON TABLE "public"."progress_photos" TO "anon";
GRANT ALL ON TABLE "public"."progress_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_photos" TO "service_role";



GRANT ALL ON TABLE "public"."range_depths" TO "anon";
GRANT ALL ON TABLE "public"."range_depths" TO "authenticated";
GRANT ALL ON TABLE "public"."range_depths" TO "service_role";



GRANT ALL ON TABLE "public"."saved_foods" TO "anon";
GRANT ALL ON TABLE "public"."saved_foods" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_foods" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_events" TO "anon";
GRANT ALL ON TABLE "public"."schedule_events" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_events" TO "service_role";



GRANT ALL ON TABLE "public"."scoring_types" TO "anon";
GRANT ALL ON TABLE "public"."scoring_types" TO "authenticated";
GRANT ALL ON TABLE "public"."scoring_types" TO "service_role";



GRANT ALL ON TABLE "public"."session_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."session_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."session_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."session_debriefs" TO "anon";
GRANT ALL ON TABLE "public"."session_debriefs" TO "authenticated";
GRANT ALL ON TABLE "public"."session_debriefs" TO "service_role";



GRANT ALL ON TABLE "public"."set_instances" TO "anon";
GRANT ALL ON TABLE "public"."set_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."set_instances" TO "service_role";



GRANT ALL ON TABLE "public"."shopping_list" TO "anon";
GRANT ALL ON TABLE "public"."shopping_list" TO "authenticated";
GRANT ALL ON TABLE "public"."shopping_list" TO "service_role";



GRANT ALL ON TABLE "public"."source_exercises" TO "anon";
GRANT ALL ON TABLE "public"."source_exercises" TO "authenticated";
GRANT ALL ON TABLE "public"."source_exercises" TO "service_role";



GRANT ALL ON TABLE "public"."stances" TO "anon";
GRANT ALL ON TABLE "public"."stances" TO "authenticated";
GRANT ALL ON TABLE "public"."stances" TO "service_role";



GRANT ALL ON TABLE "public"."symmetries" TO "anon";
GRANT ALL ON TABLE "public"."symmetries" TO "authenticated";
GRANT ALL ON TABLE "public"."symmetries" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_attachments" TO "anon";
GRANT ALL ON TABLE "public"."ticket_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."todos" TO "anon";
GRANT ALL ON TABLE "public"."todos" TO "authenticated";
GRANT ALL ON TABLE "public"."todos" TO "service_role";



GRANT ALL ON TABLE "public"."user_machine_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_machine_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_machine_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."variation_categories" TO "anon";
GRANT ALL ON TABLE "public"."variation_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."variation_categories" TO "service_role";



GRANT ALL ON TABLE "public"."variation_options" TO "anon";
GRANT ALL ON TABLE "public"."variation_options" TO "authenticated";
GRANT ALL ON TABLE "public"."variation_options" TO "service_role";



GRANT ALL ON TABLE "public"."water_logs" TO "anon";
GRANT ALL ON TABLE "public"."water_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."water_logs" TO "service_role";



GRANT ALL ON TABLE "public"."weight_logs" TO "anon";
GRANT ALL ON TABLE "public"."weight_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."weight_logs" TO "service_role";



GRANT ALL ON TABLE "public"."wod_categories" TO "anon";
GRANT ALL ON TABLE "public"."wod_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."wod_categories" TO "service_role";



GRANT ALL ON TABLE "public"."wod_formats" TO "anon";
GRANT ALL ON TABLE "public"."wod_formats" TO "authenticated";
GRANT ALL ON TABLE "public"."wod_formats" TO "service_role";



GRANT ALL ON TABLE "public"."wod_movements" TO "anon";
GRANT ALL ON TABLE "public"."wod_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."wod_movements" TO "service_role";



GRANT ALL ON TABLE "public"."wod_scaling_levels" TO "anon";
GRANT ALL ON TABLE "public"."wod_scaling_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."wod_scaling_levels" TO "service_role";



GRANT ALL ON TABLE "public"."wods" TO "anon";
GRANT ALL ON TABLE "public"."wods" TO "authenticated";
GRANT ALL ON TABLE "public"."wods" TO "service_role";



GRANT ALL ON TABLE "public"."workout_instances" TO "anon";
GRANT ALL ON TABLE "public"."workout_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_instances" TO "service_role";



GRANT ALL ON TABLE "public"."workout_logs" TO "anon";
GRANT ALL ON TABLE "public"."workout_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_logs" TO "service_role";



GRANT ALL ON TABLE "public"."workout_sessions" TO "anon";
GRANT ALL ON TABLE "public"."workout_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."workout_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."workouts" TO "anon";
GRANT ALL ON TABLE "public"."workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."workouts" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

drop policy "Exercises are viewable by everyone" on "public"."exercises";

alter table "public"."profiles" drop constraint "profiles_quick_add_oz_check";

alter table "public"."profiles" add constraint "profiles_quick_add_oz_check" CHECK ((((array_length(quick_add_oz, 1) >= 1) AND (array_length(quick_add_oz, 1) <= 6)) AND (0 < ALL (quick_add_oz)))) not valid;

alter table "public"."profiles" validate constraint "profiles_quick_add_oz_check";


  create policy "Exercises are viewable by everyone"
  on "public"."exercises"
  as permissive
  for select
  to anon, authenticated
using (true);


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "Allow authenticated delete from food-inventory"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'food-inventory'::text));



  create policy "Allow authenticated select from food-inventory"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'food-inventory'::text));



  create policy "Allow authenticated select from program-covers"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'program-covers'::text));



  create policy "Allow authenticated update in food-inventory"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'food-inventory'::text));



  create policy "Allow authenticated uploads to food-inventory"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'food-inventory'::text));



  create policy "Allow authenticated users to upload movement images"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'movement-images'::text));



  create policy "Allow public read access to movement images"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'movement-images'::text));



  create policy "Allow public select from food-inventory"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'food-inventory'::text));



  create policy "Allow public select from program-covers"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'program-covers'::text));



  create policy "Allow users to delete own movement images"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'movement-images'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))));



  create policy "Anyone can view WOD images"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'wod-images'::text));



  create policy "Program covers: owner delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'program-covers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Program covers: owner insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'program-covers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Program covers: owner update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'program-covers'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Progress photos: owner delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'progress-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Progress photos: owner insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'progress-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Progress photos: owner select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'progress-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Progress photos: owner update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'progress-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Public can view all food images"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'food-inventory'::text));



  create policy "Public read capture thumbs"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'capture-thumbs'::text));



  create policy "Users can delete their own WOD images"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'wod-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can delete their own food images"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'food-inventory'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can update their own WOD images"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'wod-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can update their own food images"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'food-inventory'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload WOD images to their own folder"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'wod-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload food images"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'food-inventory'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can view their own food images"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'food-inventory'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users delete own capture thumbs"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'capture-thumbs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



