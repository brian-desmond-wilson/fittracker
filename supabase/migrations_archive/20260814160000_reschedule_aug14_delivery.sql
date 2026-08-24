-- Data fix: the Aug 14 Thistle box had not arrived, 2026-08-14.
--
-- Seven meals across four dishes were logged the way every delivery was logged
-- before deliveries could carry an arrival time: straight into the fridge. The
-- box actually turns up on Sunday Aug 16 at 7pm PDT, so until then the app was
-- offering food that is not in the house — the exact thing scheduling exists to
-- prevent.
--
-- The use-by went in wrong too. 2026-08-16 was the delivery date typed into the
-- only date field that existed at the time; the real use-by is 2026-08-20, and
-- the corrected date is what the scheduled box carries.
--
-- The four rows become one pending delivery, rebuilt from the rows themselves
-- rather than from anything retyped here, so the dishes that come back on
-- Sunday are the dishes that went in. The writer that eventually spends it will
-- create fresh inventory rows — the saved foods, meals and concepts these rows
-- are linked to are left alone, so the library keeps everything it learned.
--
-- Narrow by construction: four ids, and it refuses to run if all four are not
-- still there exactly as described.

DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    '0b500336-fdd4-4604-b807-a2b7f1cd55b7',  -- Primo Pesto Pasta with Herb Ground Turkey ×2
    '7bccae14-4d8c-4f68-95dc-5b1da7722111',  -- Waldorf Salad With Roasted Chicken ×2
    '2b721e3d-8141-4c59-9d2e-b86e5f6c4ea4',  -- Tahini-Java Smoothie ×1
    '4f7484fb-ce6f-4401-b7c7-9d7371c1846f'   -- Cocoa & Berry Crumble Muesli ×2
  ]::uuid[];
  v_user_id   uuid;
  v_vendor_id uuid;
  v_found     integer;
  v_meals     jsonb;
BEGIN
  SELECT count(*) INTO v_found FROM public.food_inventory WHERE id = ANY(v_ids);
  IF v_found <> 4 THEN
    -- Somebody has already eaten, deleted or re-delivered part of this box.
    -- Doing half the fix would be worse than doing none: say so and stop.
    RAISE EXCEPTION 'expected the 4 rows of the Aug 14 delivery, found %', v_found;
  END IF;

  SELECT DISTINCT user_id, preferred_vendor_id INTO v_user_id, v_vendor_id
  FROM public.food_inventory WHERE id = ANY(v_ids);
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'the Aug 14 delivery rows do not agree on one vendor';
  END IF;

  -- The payload the writer takes, in the writer's own key names. The slot
  -- comes off the meal the original write created for each dish, keyed by the
  -- same slug it used; a dish whose meal has since gone falls back to lunch,
  -- exactly as the writer would.
  SELECT jsonb_agg(
           jsonb_build_object(
             'name', fi.name,
             'slot', coalesce(m.default_meal_type, 'lunch'),
             'quantity', greatest(1, fi.quantity),
             'calories', fi.calories,
             'protein', fi.protein,
             'fiber', fi.fiber_g,
             'saturated_fat', fi.saturated_fat_g,
             'sodium', fi.sodium_mg,
             'serving_size', fi.serving_size,
             'image_url', fi.image_primary_url
           )
           ORDER BY fi.name
         )
    INTO v_meals
  FROM public.food_inventory fi
  LEFT JOIN public.meals m
    ON m.user_id = fi.user_id
   AND m.slug = public.prepared_meal_slug(fi.name)
  WHERE fi.id = ANY(v_ids);

  -- 7pm PDT on Sunday Aug 16 is 02:00 UTC on Aug 17. Written as an offset
  -- literal rather than a local timestamp so it cannot be reinterpreted by
  -- whatever timezone this migration is applied under.
  INSERT INTO public.pending_prepared_meal_deliveries
    (user_id, vendor_id, arrives_at, use_by, meals)
  VALUES
    (v_user_id, v_vendor_id, '2026-08-16 19:00:00-07:00'::timestamptz, '2026-08-20'::date, v_meals);

  -- Location rows, category maps, subcategory maps and concept links all
  -- cascade off this. Shopping-list lines carry a nullable reference instead,
  -- so they are cleared by hand — none is expected on a delivered meal, but a
  -- line telling you to buy a dish that no longer exists would outlive it.
  UPDATE public.shopping_list SET food_inventory_id = NULL WHERE food_inventory_id = ANY(v_ids);
  DELETE FROM public.food_inventory WHERE id = ANY(v_ids);
END $$;
