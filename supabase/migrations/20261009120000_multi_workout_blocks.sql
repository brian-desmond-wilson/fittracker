-- Multi-workout sessions: a 2-hour day is three to five catalog workouts —
-- warmup → main → main → abs → conditioning → cooldown — and the coach now
-- picks only from the catalog, so one session has to reference several
-- workouts under the same block role. UNIQUE (session_id, block) forbade it.
--
-- Shape: the block rows stay what they were, plus an explicit order.
--   generated_session_blocks.block_position  the block's place in the walk,
--                                            0-based across the whole session.
--   UNIQUE (session_id, block, block_position) replaces UNIQUE (session_id, block).
--   generated_session_items.block_id         which block row an item belongs
--                                            to. NULL = "the block whose role
--                                            owns my section", which is how
--                                            every row written before this
--                                            migration already reads.
--
-- Existing rows get block_position 0 and the app sorts by (block_position,
-- canonical role order), so a session saved before today renders exactly as
-- it did. The app's own composer keeps writing one block per role at
-- position 0; only the agent gateway writes repeated roles.
--
-- No session rows are written or rewritten here.

ALTER TABLE public.generated_session_blocks
  ADD COLUMN IF NOT EXISTS block_position integer NOT NULL DEFAULT 0;

ALTER TABLE public.generated_session_blocks
  DROP CONSTRAINT IF EXISTS generated_session_blocks_session_id_block_key;
ALTER TABLE public.generated_session_blocks
  DROP CONSTRAINT IF EXISTS generated_session_blocks_session_block_position_key;
ALTER TABLE public.generated_session_blocks
  ADD CONSTRAINT generated_session_blocks_session_block_position_key
  UNIQUE (session_id, block, block_position);
ALTER TABLE public.generated_session_blocks
  DROP CONSTRAINT IF EXISTS generated_session_blocks_position_check;
ALTER TABLE public.generated_session_blocks
  ADD CONSTRAINT generated_session_blocks_position_check CHECK (block_position >= 0);

COMMENT ON COLUMN public.generated_session_blocks.block_position IS
  'Where the block sits in the session, 0-based across all blocks. Ties (every pre-2026-10-09 row is 0) fall back to the canonical role order warmup → mobility → main → conditioning → bfr → cooldown.';

ALTER TABLE public.generated_session_items
  ADD COLUMN IF NOT EXISTS block_id uuid
  REFERENCES public.generated_session_blocks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS generated_session_items_block
  ON public.generated_session_items (block_id);

COMMENT ON COLUMN public.generated_session_items.block_id IS
  'The block row this item was exploded from. NULL means "the first block whose role owns this section" — the only reading that existed before repeated roles.';

-- One call, one transaction: a composed session with its blocks and items,
-- for the agent gateway's POST /v1/jobs/save-session. Replaces the
-- 2026-10-08 body. What changed:
--   * a block role may repeat; the blocks array IS the order (block_position
--     = array index, and a supplied block_position must agree);
--   * every item may name its block with `block_index` (an index into the
--     blocks array) and MUST when its section's role appears more than once;
--   * items walk the blocks in order: item_order must not step back to an
--     earlier block;
--   * items land with block_id pointing at the inserted block row.
-- Validation still raises with the offending row named — "block[1] "main":
-- …", "item[3]: …" — so the gateway passes the message straight back.
CREATE OR REPLACE FUNCTION public.agent_save_session(
  p_session jsonb,
  p_blocks  jsonb,
  p_items   jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id          uuid;
  v_snapshot    jsonb;
  v_minutes     jsonb;
  b             jsonb;
  i             jsonb;
  idx           int;
  v_block       text;
  v_roles       text[] := '{}';
  v_block_ids   uuid[] := '{}';
  v_orders      int[];
  n             int;
  n_blocks      int;
  v_bi          int;
  v_prev_bi     int;
  v_prev_idx    int;
  v_role_for    text;
  v_section     text;
  v_new_id      uuid;
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
  n_blocks := jsonb_array_length(p_blocks);
  IF n_blocks = 0 THEN RAISE EXCEPTION 'blocks: at least one block is required'; END IF;

  v_snapshot := p_session->'inputs_snapshot';
  IF jsonb_typeof(v_snapshot) = 'string' THEN v_snapshot := (v_snapshot #>> '{}')::jsonb; END IF;
  v_minutes := p_session->'section_minutes';
  IF jsonb_typeof(v_minutes) = 'string' THEN v_minutes := (v_minutes #>> '{}')::jsonb; END IF;

  -- Blocks: the array order is the performance order. A role may repeat.
  idx := 0;
  FOR b IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
    v_block := b->>'block';
    IF v_block IS NULL THEN RAISE EXCEPTION 'block[%]: block name is required', idx; END IF;
    IF v_block NOT IN ('warmup', 'mobility', 'main', 'conditioning', 'bfr', 'cooldown') THEN
      RAISE EXCEPTION 'block[%] "%": unknown block name (warmup, mobility, main, conditioning, bfr, cooldown)', idx, v_block;
    END IF;
    IF (b->>'captured_workout_id' IS NULL) = (b->>'builtin_key' IS NULL) THEN
      RAISE EXCEPTION 'block[%] "%": exactly one of captured_workout_id / builtin_key is required', idx, v_block;
    END IF;
    IF b->>'name' IS NULL THEN RAISE EXCEPTION 'block[%] "%": name is required', idx, v_block; END IF;
    IF b->>'minutes' IS NULL THEN RAISE EXCEPTION 'block[%] "%": minutes is required', idx, v_block; END IF;
    IF b->>'block_position' IS NOT NULL AND (b->>'block_position')::int <> idx THEN
      RAISE EXCEPTION 'block[%] "%": block_position must equal its index in blocks (%), or be omitted', idx, v_block, idx;
    END IF;
    v_roles := v_roles || v_block;
    idx := idx + 1;
  END LOOP;

  -- Items: item_order contiguous from 0; block_index resolves each item to a
  -- block and is mandatory once a role repeats; the sequence never walks
  -- backwards through the blocks.
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
      v_section := i->>'section';
      IF v_section IS NULL THEN RAISE EXCEPTION 'item[%]: section is required', idx; END IF;
      v_role_for := CASE v_section WHEN 'accessory' THEN 'conditioning' ELSE v_section END;
      IF i->>'block_index' IS NOT NULL THEN
        v_bi := (i->>'block_index')::int;
        IF v_bi < 0 OR v_bi >= n_blocks THEN
          RAISE EXCEPTION 'item[%]: block_index % is out of range (blocks has % entries)', idx, v_bi, n_blocks;
        END IF;
        IF v_roles[v_bi+1] <> v_role_for THEN
          RAISE EXCEPTION 'item[%]: section "%" does not belong to block[%] "%"', idx, v_section, v_bi, v_roles[v_bi+1];
        END IF;
      ELSIF (SELECT count(*) FROM unnest(v_roles) r WHERE r = v_role_for) > 1 THEN
        RAISE EXCEPTION 'item[%]: block_index is required because block "%" appears more than once', idx, v_role_for;
      END IF;
      idx := idx + 1;
    END LOOP;
    -- Walk the items in item_order: a block_index may repeat or climb, never
    -- drop — the item sequence is the session's one timeline.
    v_prev_bi := NULL;
    v_prev_idx := NULL;
    FOR i, idx IN
      SELECT e, (e->>'item_order')::int FROM jsonb_array_elements(p_items) e
      ORDER BY (e->>'item_order')::int
    LOOP
      IF i->>'block_index' IS NULL THEN CONTINUE; END IF;
      v_bi := (i->>'block_index')::int;
      IF v_prev_bi IS NOT NULL AND v_bi < v_prev_bi THEN
        RAISE EXCEPTION 'items: item_order must follow block order (item_order % is in block[%] but item_order % is in block[%])', idx, v_bi, v_prev_idx, v_prev_bi;
      END IF;
      v_prev_bi := v_bi;
      v_prev_idx := idx;
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
        session_id, block, block_position, name, captured_workout_id, builtin_key,
        minutes, rounds_note, reason, locked, dismissed
      ) VALUES (
        v_id, b->>'block', idx, b->>'name', (b->>'captured_workout_id')::uuid,
        b->>'builtin_key', (b->>'minutes')::int, b->>'rounds_note', b->>'reason',
        coalesce((b->>'locked')::boolean, false), coalesce((b->>'dismissed')::boolean, false)
      ) RETURNING id INTO v_new_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'block[%] "%": %', idx, b->>'block', SQLERRM;
    END;
    v_block_ids := v_block_ids || v_new_id;
    idx := idx + 1;
  END LOOP;

  idx := 0;
  FOR i IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      INSERT INTO generated_session_items (
        session_id, block_id, exercise_id, item_order, section, target_sets,
        target_reps, rest_seconds, reason, weight_note
      ) VALUES (
        v_id,
        CASE WHEN i->>'block_index' IS NULL THEN NULL
             ELSE v_block_ids[(i->>'block_index')::int + 1] END,
        (i->>'exercise_id')::uuid, (i->>'item_order')::int, i->>'section',
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
