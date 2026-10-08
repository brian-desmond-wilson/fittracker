-- One call, one transaction: a composed session with its blocks and items,
-- for the agent gateway's POST /v1/jobs/save-session. Tonight's three
-- sequential inserts left a session with no blocks when the block insert
-- failed midway; inside one function body every failure unwinds everything.
--
-- Validation raises with the offending row named — "block[1] "main": …",
-- "item[3]: …" — so the gateway can pass the message straight back.
-- A stringified JSON object for inputs_snapshot / section_minutes is
-- unwrapped rather than stored as a string (the shape tonight's save had).
CREATE OR REPLACE FUNCTION public.agent_save_session(
  p_session jsonb,
  p_blocks  jsonb,
  p_items   jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id       uuid;
  v_snapshot jsonb;
  v_minutes  jsonb;
  b          jsonb;
  i          jsonb;
  idx        int;
  v_block    text;
  v_seen     text[] := '{}';
  v_orders   int[];
  n          int;
BEGIN
  IF p_session IS NULL OR jsonb_typeof(p_session) <> 'object' THEN
    RAISE EXCEPTION 'session: must be an object';
  END IF;
  IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' THEN
    RAISE EXCEPTION 'blocks: must be an array';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items: must be an array';
  END IF;
  IF p_session->>'user_id' IS NULL THEN RAISE EXCEPTION 'session: user_id is required'; END IF;
  IF p_session->>'session_date' IS NULL THEN RAISE EXCEPTION 'session: session_date is required'; END IF;
  IF p_session->>'ramp_week' IS NULL THEN RAISE EXCEPTION 'session: ramp_week is required'; END IF;
  IF jsonb_array_length(p_blocks) = 0 THEN RAISE EXCEPTION 'blocks: at least one block is required'; END IF;

  v_snapshot := p_session->'inputs_snapshot';
  IF jsonb_typeof(v_snapshot) = 'string' THEN v_snapshot := (v_snapshot #>> '{}')::jsonb; END IF;
  v_minutes := p_session->'section_minutes';
  IF jsonb_typeof(v_minutes) = 'string' THEN v_minutes := (v_minutes #>> '{}')::jsonb; END IF;

  idx := 0;
  FOR b IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
    v_block := b->>'block';
    IF v_block IS NULL THEN RAISE EXCEPTION 'block[%]: block name is required', idx; END IF;
    IF v_block = ANY (v_seen) THEN
      RAISE EXCEPTION 'block[%] "%": duplicate block name', idx, v_block;
    END IF;
    v_seen := v_seen || v_block;
    IF (b->>'captured_workout_id' IS NULL) = (b->>'builtin_key' IS NULL) THEN
      RAISE EXCEPTION 'block[%] "%": exactly one of captured_workout_id / builtin_key is required', idx, v_block;
    END IF;
    IF b->>'name' IS NULL THEN RAISE EXCEPTION 'block[%] "%": name is required', idx, v_block; END IF;
    IF b->>'minutes' IS NULL THEN RAISE EXCEPTION 'block[%] "%": minutes is required', idx, v_block; END IF;
    idx := idx + 1;
  END LOOP;

  n := jsonb_array_length(p_items);
  IF n > 0 THEN
    SELECT array_agg((e->>'item_order')::int ORDER BY (e->>'item_order')::int)
      INTO v_orders
      FROM jsonb_array_elements(p_items) e;
    FOR idx IN 0..n-1 LOOP
      IF v_orders[idx+1] IS DISTINCT FROM idx THEN
        RAISE EXCEPTION 'items: item_order must be contiguous from 0 (got %)', array_to_string(v_orders, ',');
      END IF;
    END LOOP;
    idx := 0;
    FOR i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      IF i->>'exercise_id' IS NULL THEN RAISE EXCEPTION 'item[%]: exercise_id is required', idx; END IF;
      IF i->>'section' IS NULL THEN RAISE EXCEPTION 'item[%]: section is required', idx; END IF;
      idx := idx + 1;
    END LOOP;
  END IF;

  BEGIN
    INSERT INTO generated_sessions (
      user_id, session_date, gym_profile_id, checkin_id, split_day, ramp_week,
      source, served_captured_workout_id, status, section_minutes, day_reason,
      inputs_snapshot, compose_signature
    ) VALUES (
      (p_session->>'user_id')::uuid,
      (p_session->>'session_date')::date,
      (p_session->>'gym_profile_id')::uuid,
      (p_session->>'checkin_id')::uuid,
      p_session->>'split_day',
      (p_session->>'ramp_week')::int,
      coalesce(p_session->>'source', 'ai'),
      (p_session->>'served_captured_workout_id')::uuid,
      coalesce(p_session->>'status', 'suggested'),
      v_minutes,
      p_session->>'day_reason',
      v_snapshot,
      p_session->>'compose_signature'
    ) RETURNING id INTO v_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'session: %', SQLERRM;
  END;

  idx := 0;
  FOR b IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
    BEGIN
      INSERT INTO generated_session_blocks (
        session_id, block, name, captured_workout_id, builtin_key, minutes,
        rounds_note, reason, locked, dismissed
      ) VALUES (
        v_id, b->>'block', b->>'name', (b->>'captured_workout_id')::uuid,
        b->>'builtin_key', (b->>'minutes')::int, b->>'rounds_note', b->>'reason',
        coalesce((b->>'locked')::boolean, false), coalesce((b->>'dismissed')::boolean, false)
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'block[%] "%": %', idx, b->>'block', SQLERRM;
    END;
    idx := idx + 1;
  END LOOP;

  idx := 0;
  FOR i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      INSERT INTO generated_session_items (
        session_id, exercise_id, item_order, section, target_sets, target_reps,
        rest_seconds, reason, weight_note
      ) VALUES (
        v_id, (i->>'exercise_id')::uuid, (i->>'item_order')::int, i->>'section',
        (i->>'target_sets')::int, i->>'target_reps', (i->>'rest_seconds')::int,
        i->>'reason', i->>'weight_note'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'item[%]: %', idx, SQLERRM;
    END;
    idx := idx + 1;
  END LOOP;

  RETURN v_id;
END $$;

-- Only the gateway (service role) may call it.
REVOKE ALL ON FUNCTION public.agent_save_session(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_save_session(jsonb, jsonb, jsonb) TO service_role;
