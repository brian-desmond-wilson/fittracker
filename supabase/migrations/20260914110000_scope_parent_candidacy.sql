-- Stage 6 / Task 11: scope parent candidacy to official-or-same-owner rows.
--
-- The identity engine's worker picked a derivation's parent as the largest
-- attribute-subset row in the same core family, with NO ownership filter. A
-- user's private row could therefore become the parent of an OFFICIAL row,
-- squatting inside the official hierarchy (a private row must not anchor
-- official curation). This replaces recompute_exercise_identity_row with the
-- same body plus one predicate: a candidate parent must be official, or must
-- share the child row's created_by. The core-fallback is untouched, so a row
-- with no eligible candidate still parents to its core movement.
--
-- Source of truth for the copied body: 20260909100000_turn_the_locks.sql.
-- The trailing REVOKE restates the Stage 5 lockdown (20260910100000) so a
-- fresh apply always ends in the revoked state regardless of whether
-- CREATE OR REPLACE preserves the existing ACL.

CREATE OR REPLACE FUNCTION public.recompute_exercise_identity_row(p_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_core UUID; v_is_core BOOLEAN; v_attrs UUID[]; v_parent UUID; v_ptier INTEGER; v_gen TEXT;
  v_new_fp TEXT; v_new_tier INTEGER; v_new_parent UUID; v_new_name TEXT;
  v_old RECORD;
  v_changed BOOLEAN;
BEGIN
  -- Serialize concurrent recomputes of the same exercise: without this, two sessions each
  -- adding a junction row read a partial attribute set and the last write wins (lost update).
  -- (The orchestrator has usually locked this row already; re-locking is a no-op then.)
  PERFORM 1 FROM exercises WHERE id = p_id FOR UPDATE;
  SELECT core_movement_id, is_core, identity_fingerprint, parent_exercise_id,
         tier, generated_name, name, name_is_custom, created_by
    INTO v_old FROM exercises WHERE id = p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  v_core := v_old.core_movement_id;
  v_is_core := v_old.is_core;
  v_attrs := exercise_identity_attrs(p_id);
  v_gen := generate_exercise_name(p_id);

  IF v_is_core OR v_core IS NULL THEN
    v_parent := NULL;                                          -- cores and outliers have no parent
  ELSE
    SELECT c.id, c.tier INTO v_parent, v_ptier
    FROM exercises c
    WHERE c.core_movement_id = v_core AND c.id <> p_id
      AND exercise_identity_attrs(c.id) <@ v_attrs
      AND cardinality(exercise_identity_attrs(c.id)) < cardinality(v_attrs)
      -- Stage 6 hardening: a private row must never become another owner's
      -- parent — candidates are official rows, or rows sharing this row's
      -- owner. Without this, a user row can squat inside the official
      -- hierarchy and dangle for everyone else (Stage 5 review hand-off).
      AND (c.is_official OR c.created_by IS NOT DISTINCT FROM v_old.created_by)
    ORDER BY cardinality(exercise_identity_attrs(c.id)) DESC, c.created_at ASC, c.id ASC
    LIMIT 1;
    IF v_parent IS NULL THEN v_parent := v_core; v_ptier := 0; END IF;
  END IF;

  v_new_fp   := CASE WHEN v_core IS NULL THEN NULL ELSE array_to_string(v_attrs, '|') END;
  v_new_tier := CASE WHEN v_is_core THEN 0 WHEN v_core IS NULL THEN NULL
                     ELSE COALESCE(v_ptier, 0) + 1 END;
  -- Rows with no core movement keep their existing hand-set parent: the legacy hierarchy
  -- must survive untouched (zero-visible-change rule; Stage 3 assigned cores/outliers).
  v_new_parent := CASE WHEN v_is_core THEN NULL
                       WHEN v_core IS NULL THEN v_old.parent_exercise_id
                       ELSE v_parent END;
  v_new_name := CASE WHEN v_old.name_is_custom OR v_core IS NULL THEN v_old.name ELSE v_gen END;

  -- Conditional write: the family pass calls this worker on rows that may be
  -- unaffected — skipping the no-op UPDATE avoids updated_at churn on them.
  v_changed := v_new_fp     IS DISTINCT FROM v_old.identity_fingerprint
            OR v_new_parent IS DISTINCT FROM v_old.parent_exercise_id
            OR v_new_tier   IS DISTINCT FROM v_old.tier
            OR v_gen        IS DISTINCT FROM v_old.generated_name
            OR v_new_name   IS DISTINCT FROM v_old.name;
  IF v_changed THEN
    -- M1 NOTE for tooling authors: THIS statement is where the fingerprint lock
    -- rejects a duplicate. The 23505 names exercises_fingerprint_key but
    -- surfaces from the OUTER write's AFTER trigger — an INSERT on exercises or
    -- a junction table can fail with an exercises constraint error, and an
    -- ON CONFLICT clause on that outer write CANNOT swallow it (ON CONFLICT
    -- only arbitrates the statement's own target table conflicts).
    UPDATE exercises SET
      identity_fingerprint = v_new_fp,
      parent_exercise_id   = v_new_parent,
      tier                 = v_new_tier,
      generated_name       = v_gen,
      name                 = v_new_name,
      updated_at           = now()
    WHERE id = p_id;
  END IF;

  -- Alias sync runs unconditionally (a pure no-op when the alias is already
  -- right), preserving the Stage 1/3 behavior exactly.
  -- Sync the generated alias; a cross-exercise collision is skipped here — Stage 3's alias
  -- rebuild re-mints the final set and asserts it exactly. Never a crash.
  IF v_core IS NULL THEN
    -- A core-less row holds no generated aliases: a demoted core (or a row whose core was
    -- cleared) must not leave its old generated name squatting as debris.
    DELETE FROM exercise_aliases WHERE exercise_id = p_id AND kind = 'generated';
  ELSIF v_gen IS NOT NULL AND v_gen <> '' THEN
    -- Drop stale generated aliases first: per-row junction triggers make every intermediate
    -- generated name an alias, and leaving that debris squats on names that rightfully
    -- belong to other exercises (their ON CONFLICT insert would silently lose).
    DELETE FROM exercise_aliases
    WHERE exercise_id = p_id AND kind = 'generated'
      AND alias_normalized <> normalize_alias(v_gen);
    BEGIN
      INSERT INTO exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
      VALUES (p_id, v_gen, normalize_alias(v_gen), 'generated', 'seed')
      ON CONFLICT (alias_normalized) DO NOTHING;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;

  RETURN v_changed;
END $$;

-- Stage 5 kept this worker off the PostgREST surface; CREATE OR REPLACE
-- preserves an existing function's ACL, but restating the REVOKE makes the
-- end state explicit and independent of apply order.
REVOKE ALL ON FUNCTION public.recompute_exercise_identity_row(UUID) FROM PUBLIC, anon, authenticated;

-- Explicit sweep: re-parent the rows the new rule invalidates NOW, at apply
-- time, instead of lazily whenever something next touches their families.
-- (Non-official CORE parents are legitimate — the core fallback is outside
-- the candidate query by design — hence tier <> 0.)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT child.id
    FROM public.exercises child
    JOIN public.exercises p ON p.id = child.parent_exercise_id
    WHERE NOT p.is_official
      AND p.created_by IS DISTINCT FROM child.created_by
      AND p.tier <> 0
    ORDER BY child.id
  LOOP
    PERFORM public.recompute_exercise_identity(r.id);
  END LOOP;
END $$;
