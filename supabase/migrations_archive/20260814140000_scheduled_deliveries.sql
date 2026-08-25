-- Deliveries that have not arrived yet, 2026-08-14.
--
-- Writing a delivery has always meant writing the food into the fridge, which
-- is right when you log a box as you unpack it and wrong when you log one the
-- night before it comes: the meals count as stock, feed the plan, and answer
-- "what can I eat" with food that is still on a van.
--
-- A delivery now carries the moment it ARRIVES. If that moment has passed, the
-- box is written exactly as before. If it has not, the whole payload waits
-- here — vendor, use-by, dishes and all — and is written the first time the app
-- reads inventory after the arrival time. The pending row is the delivery; it
-- is not a shadow copy of one, and nothing about it is visible to the loop, the
-- shopping list or the meal library until it is spent.
--
-- WHY NOT ROWS WITH ZERO QUANTITY: an inventory row that exists but holds
-- nothing is indistinguishable from an item you have run out of, which is a
-- state the whole app already reasons about — restock signals, the Past
-- segment, the expiry ladder. A pending delivery would have inherited every
-- one of those meanings wrongly. Held payload has no such second reading.

CREATE TABLE IF NOT EXISTS public.pending_prepared_meal_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.nutrition_vendors(id) ON DELETE CASCADE,
  -- When the box turns up. The one column this table exists for.
  arrives_at TIMESTAMPTZ NOT NULL,
  use_by DATE NOT NULL,
  -- The same array `create_prepared_meal_delivery` takes, held verbatim so the
  -- writer that eventually runs is the writer that would have run at the time.
  meals JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pending_prepared_meal_deliveries IS
  'Deliveries scheduled for a future arrival. Spent — deleted, and written into inventory — by materialize_due_prepared_meal_deliveries once arrives_at has passed.';

-- Every read is "mine, soonest first", which is also the claim order.
CREATE INDEX IF NOT EXISTS idx_pending_deliveries_due
  ON public.pending_prepared_meal_deliveries (user_id, arrives_at);

ALTER TABLE public.pending_prepared_meal_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own pending deliveries" ON public.pending_prepared_meal_deliveries;
CREATE POLICY "own pending deliveries"
  ON public.pending_prepared_meal_deliveries
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------
--
-- One entry point for both cases, and the DATABASE decides which it is. The
-- client cannot be trusted to compare its own clock against the server's: a
-- phone a few minutes fast would schedule a box it is holding in its hands.
--
-- Returns {"status": "delivered"|"scheduled", "count": n} — the caller has to
-- say something different in each case, and "how many meals" is the only other
-- thing it needs.
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
  v_count   integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_meals IS NULL OR jsonb_typeof(p_meals) <> 'array' THEN
    RAISE EXCEPTION 'p_meals must be a JSON array';
  END IF;

  IF p_arrives_at IS NULL OR p_arrives_at <= now() THEN
    -- Already here. The old path, unchanged.
    v_count := create_prepared_meal_delivery(p_vendor_id, p_use_by, p_meals);
    RETURN jsonb_build_object('status', 'delivered', 'count', v_count);
  END IF;

  INSERT INTO pending_prepared_meal_deliveries (user_id, vendor_id, arrives_at, use_by, meals)
  VALUES (v_user_id, p_vendor_id, p_arrives_at, p_use_by, p_meals);

  -- The count of NAMED dishes, matching what the writer would report: a blank
  -- row at the bottom of the form is not a meal, and the two numbers have to
  -- agree or the same box reads as a different size before and after it lands.
  SELECT count(*) INTO v_count
  FROM jsonb_array_elements(p_meals) m
  WHERE trim(coalesce(m->>'name', '')) <> '';

  RETURN jsonb_build_object('status', 'scheduled', 'count', v_count);
END $$;

REVOKE ALL ON FUNCTION public.schedule_prepared_meal_delivery(uuid, date, timestamptz, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.schedule_prepared_meal_delivery(uuid, date, timestamptz, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Arrival
-- ---------------------------------------------------------------------------
--
-- Called on every inventory read rather than by a scheduler, because the app
-- has none and a delivery that materialises only while the phone is open is
-- honest: the food appears the first time you look after it arrived.
--
-- The claim is a DELETE ... RETURNING, so two devices reading at the same
-- moment cannot both write the same box — the row is gone before its payload
-- is spent, and the whole function is one transaction, so a failure part-way
-- puts the pending row back rather than losing the delivery.
CREATE OR REPLACE FUNCTION public.materialize_due_prepared_meal_deliveries()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
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

REVOKE ALL ON FUNCTION public.materialize_due_prepared_meal_deliveries() FROM public;
GRANT EXECUTE ON FUNCTION public.materialize_due_prepared_meal_deliveries() TO authenticated;
