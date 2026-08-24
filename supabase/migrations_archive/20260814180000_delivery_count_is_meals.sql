-- A delivery's "count" is meals, not dishes, 2026-08-14.
--
-- `schedule_prepared_meal_delivery` reported how many DISHES a box holds, so a
-- Thistle box of four dishes — two pastas, two salads, two mueslis and a
-- smoothie — confirmed as "4 meals" while the person unpacking it counted
-- seven. Quantity is the whole reason that field exists on a delivery row.
--
-- Only the number reported to the caller changes. `create_prepared_meal_delivery`
-- still returns its own count of dishes written, which is what it means by the
-- word and what its own callers use it for; this function stops passing that
-- number on as if it answered a different question.

CREATE OR REPLACE FUNCTION public.schedule_prepared_meal_delivery(
  p_vendor_id uuid,
  p_use_by date,
  p_arrives_at timestamptz,
  p_meals jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
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

REVOKE ALL ON FUNCTION public.schedule_prepared_meal_delivery(uuid, date, timestamptz, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.schedule_prepared_meal_delivery(uuid, date, timestamptz, jsonb) TO authenticated;
