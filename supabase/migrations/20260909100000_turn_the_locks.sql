-- 20260909100000_turn_the_locks.sql
-- Stage 4 "turn the locks": duplicates become physically impossible and the
-- engine's known race/drift gaps close.
--   1) Fingerprint UNIQUE lock replaces the plain exercises_fingerprint_idx.
--   2) Sibling recompute on identity change (Task 9 review I5).
--   3) Session-variable guard replaces the pg_trigger_depth() guards (I2).
--   4) Symmetric core-reference validation under FOR KEY SHARE (Task 9 final review).
-- Schema/engine only — hand-written (no generator), idempotent, single-transaction
-- safe (plain CREATE UNIQUE INDEX is correct at 287 rows; CONCURRENTLY is banned
-- inside the push transaction and unnecessary here).
SET LOCAL lock_timeout = '5s';

-- ============================================================================
-- 1) Pre-lock data gate: the unique build below would fail anyway on dirty
--    data, but fail HERE with the offending rows named instead of a bare
--    duplicate-key error.
-- ============================================================================
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(d.msg, '; ' ORDER BY d.msg) INTO v_observed FROM (
    SELECT 'core ' || c.name || ' fingerprint "' || e.identity_fingerprint || '" x' || count(*) AS msg
      FROM public.exercises e JOIN public.exercises c ON c.id = e.core_movement_id
     WHERE e.core_movement_id IS NOT NULL
     GROUP BY c.name, e.core_movement_id, e.identity_fingerprint
    HAVING count(*) > 1
  ) d;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'turn_the_locks: cannot build the unique lock over duplicate fingerprints: %', v_observed;
  END IF;
END $$;

-- ============================================================================
-- 2) The fingerprint UNIQUE lock.
--
-- SCOPE (design question 1): the index is total (no WHERE clause) on
-- (core_movement_id, identity_fingerprint); composite-NULL semantics under the
-- default NULLS DISTINCT do the row scoping:
--   * Derivations AND core rows participate: both carry core_movement_id and an
--     engine-written fingerprint ('' for an attribute-free row). Two rows of the
--     same core with the same identity attribute set are physically impossible.
--   * Coreless rows (the 52 outliers) carry NULL in BOTH columns, so they are
--     exempt — outliers never collide with each other or with anything else.
--     No partial WHERE is needed; keeping the index total also lets the planner
--     keep using it for exactly the lookups the plain index served.
--   * A just-inserted row still has fingerprint NULL for the instant before the
--     AFTER trigger's recompute UPDATE writes the computed value; that UPDATE is
--     checked against this index, so the insert path is still locked — a
--     duplicate insert is rejected from inside its own trigger.
--
-- CORE vs BARE CHILD (design question 1, continued): a core row self-references
-- with fingerprint '' (cores are attribute-free — Stage 3 end state; 48/48 cores
-- observed at '' on the 2026-09-08 dump, and V9 pins cores to zero equipment
-- junctions). A bare zero-attribute child would compute fingerprint '' under the
-- same core and land on the slot the core's own row already occupies — the
-- collision is the enforcement: bare children are REJECTED by this index, i.e.
-- physically impossible while cores stay attribute-free. Degenerate future case:
-- if a core ever grew identity attributes, its own slot would move off '' and
-- ONE bare child would become insertable (a second would collide with the
-- first); harness V10 flags both conditions with a WARNING.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS exercises_fingerprint_key
  ON public.exercises (core_movement_id, identity_fingerprint);
-- Never carry both: the plain index is fully subsumed by the unique one.
DROP INDEX IF EXISTS public.exercises_fingerprint_idx;

-- ============================================================================
-- 3) Engine: session-variable guard (I2) + sibling recompute (I5).
--    recompute_exercise_identity re-issued from 20260908100000 (the CURRENT
--    version — with the `, c.id ASC` parent tiebreaker) with two additions:
--    the re-entrancy ledger and the sibling cascade. SECURITY DEFINER,
--    search_path pinning, FOR UPDATE serialization, parent preservation and
--    stale-alias cleanup are unchanged.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.recompute_exercise_identity(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_core UUID; v_is_core BOOLEAN; v_attrs UUID[]; v_parent UUID; v_ptier INTEGER; v_gen TEXT;
  v_old_fp TEXT; v_old_tier INTEGER; v_new_fp TEXT; v_new_tier INTEGER;
  v_visited TEXT; v_top BOOLEAN := false;
  r RECORD;
BEGIN
  -- Re-entrancy ledger (Stage 4). One transaction-local session variable serves
  -- two duties:
  --   (a) recursion brake for the sibling cascade below — a row is recomputed at
  --       most once per top-level entry (the ledger only grows inside a cascade,
  --       so termination is a counting argument);
  --   (b) the trigger guard: trg_exercise_identity / trg_junction_identity skip
  --       while the ledger is non-empty, replacing the old depth-based guard
  --       which also silenced recompute for UNRELATED trigger-driven writes (I2).
  -- set_config(..., is_local => true) is transaction-scoped and unwinds on
  -- (sub)transaction abort, so a caught unique_violation cannot leave the
  -- ledger stuck. UUIDs are fixed-length tokens, so substring containment is an
  -- exact membership test.
  v_visited := COALESCE(current_setting('fittracker.identity_recompute_visited', true), '');
  IF v_visited = '' THEN
    v_top := true;
  ELSIF position(p_id::text IN v_visited) > 0 THEN
    RETURN;                                -- already recomputed in this cascade
  END IF;
  PERFORM set_config('fittracker.identity_recompute_visited',
                     v_visited || ' ' || p_id::text, true);

  -- Serialize concurrent recomputes of the same exercise: without this, two sessions each
  -- adding a junction row read a partial attribute set and the last write wins (lost update).
  PERFORM 1 FROM exercises WHERE id = p_id FOR UPDATE;
  SELECT core_movement_id, is_core, identity_fingerprint, tier
    INTO v_core, v_is_core, v_old_fp, v_old_tier
    FROM exercises WHERE id = p_id;
  IF FOUND THEN
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
      ORDER BY cardinality(exercise_identity_attrs(c.id)) DESC, c.created_at ASC, c.id ASC
      LIMIT 1;
      IF v_parent IS NULL THEN v_parent := v_core; v_ptier := 0; END IF;
    END IF;

    v_new_fp   := CASE WHEN v_core IS NULL THEN NULL ELSE array_to_string(v_attrs, '|') END;
    v_new_tier := CASE WHEN v_is_core THEN 0 WHEN v_core IS NULL THEN NULL
                       ELSE COALESCE(v_ptier, 0) + 1 END;

    UPDATE exercises SET
      identity_fingerprint = v_new_fp,
      -- Rows with no core movement keep their existing hand-set parent: the legacy hierarchy
      -- must survive untouched (zero-visible-change rule; Stage 3 assigned cores/outliers).
      parent_exercise_id   = CASE WHEN v_is_core THEN NULL
                                  WHEN v_core IS NULL THEN parent_exercise_id
                                  ELSE v_parent END,
      tier = v_new_tier,
      generated_name = v_gen,
      name = CASE WHEN name_is_custom OR v_core IS NULL THEN name ELSE v_gen END,
      updated_at = now()
    WHERE id = p_id;

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

    -- Sibling recompute (Stage 4, I5): when this row's identity actually moved
    -- (fingerprint or tier), re-derive the rows whose parent/tier can depend on
    -- it. TRAVERSAL BOUND (design question 2): targets are restricted to
    --   (a) this row's direct current/former children (their parent may have
    --       just become invalid or their tier stale), and
    --   (b) same-core siblings whose attribute sets STRICTLY contain this row's
    --       new set (this row may have just become their parent — including the
    --       freshly-INSERTed-intermediate case, the I5 headline);
    -- each visited at most once per top-level entry (the ledger), so a cascade
    -- performs at most one recompute per catalog row and in practice touches
    -- only the changed row's containment cone. Cardinality-ascending order is a
    -- topological order for "can be parent of" (a parent always has strictly
    -- fewer attributes), so a target's parent tier is settled before the target
    -- reads it. Branch (b) is skipped for core rows: a core's attribute set is
    -- empty, so "strict superset" would sweep the whole family for no gain —
    -- core-driven effects travel through branch (a).
    IF (v_old_fp IS DISTINCT FROM v_new_fp) OR (v_old_tier IS DISTINCT FROM v_new_tier) THEN
      FOR r IN
        SELECT s.id
          FROM exercises s
         WHERE s.id <> p_id AND NOT s.is_core
           AND (
             s.parent_exercise_id = p_id
             OR (NOT v_is_core AND v_core IS NOT NULL
                 AND s.core_movement_id = v_core
                 AND exercise_identity_attrs(s.id) @> v_attrs
                 AND cardinality(exercise_identity_attrs(s.id)) > cardinality(v_attrs))
           )
           AND position(s.id::text IN COALESCE(
                 current_setting('fittracker.identity_recompute_visited', true), '')) = 0
         ORDER BY cardinality(exercise_identity_attrs(s.id)) ASC, s.id ASC
      LOOP
        PERFORM recompute_exercise_identity(r.id);
      END LOOP;
    END IF;
  END IF;

  IF v_top THEN
    PERFORM set_config('fittracker.identity_recompute_visited', '', true);
  END IF;
END $$;

-- Triggers: the guard is now the engine's own ledger, not pg_trigger_depth().
-- Depth > 1 is true for ANY trigger-driven write — an unrelated trigger
-- inserting or amending an exercise row would have silently skipped recompute
-- (I2). The ledger is non-empty ONLY while recompute_exercise_identity itself
-- is on the stack, which is exactly the write set that must not re-enter.
CREATE OR REPLACE FUNCTION public.trg_exercise_identity() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF COALESCE(current_setting('fittracker.identity_recompute_visited', true), '') <> '' THEN
    RETURN NEW;                     -- engine write: the cascade handles siblings itself
  END IF;
  PERFORM recompute_exercise_identity(NEW.id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_junction_identity() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF COALESCE(current_setting('fittracker.identity_recompute_visited', true), '') <> '' THEN
    RETURN COALESCE(NEW, OLD);      -- engine write: the cascade handles siblings itself
  END IF;
  v_id := COALESCE(NEW.exercise_id, OLD.exercise_id);
  PERFORM recompute_exercise_identity(v_id);
  RETURN COALESCE(NEW, OLD);
END $$;

-- ============================================================================
-- 4) Symmetric core-reference validation (Task 9 final review).
--    The FK guarantees the target row EXISTS; it says nothing about is_core.
--    Before this change any non-core row was accepted as a "core" target
--    (phantom-core insert), and a demote racing a child insert could slip
--    through in one commit order. Now, under default READ COMMITTED:
--      * insert/repoint side locks the target FOR KEY SHARE and requires
--        is_core — the locking read waits out an in-flight demotion (which
--        holds FOR UPDATE, below) and then re-evaluates the LATEST committed
--        row version, so "demote committed first" rejects;
--      * demote side upgrades its own row to FOR UPDATE (the UPDATE's native
--        tuple lock is FOR NO KEY UPDATE, which does NOT conflict with
--        FOR KEY SHARE — the explicit upgrade creates the conflict) and only
--        then checks for dependents, so "insert committed first" rejects and
--        a truly concurrent pair serializes instead of interleaving.
--    V5's inverse invariant stays as post-hoc detection.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_core_self_reference() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Demotion guard (mirrors the RESTRICT-on-delete precedent): demotion via UPDATE must not
  -- silently orphan a derivation tree — dependents must be repointed first (Stage 3 merge tooling).
  IF TG_OP = 'UPDATE' AND OLD.is_core AND NOT NEW.is_core THEN
    -- Stage 4: FOR UPDATE self-lock — conflicts with the FOR KEY SHARE taken by
    -- concurrent child inserts/repoints, forcing serialization (see banner).
    PERFORM 1 FROM exercises WHERE id = OLD.id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM exercises c WHERE c.core_movement_id = OLD.id AND c.id <> OLD.id) THEN
      RAISE EXCEPTION 'cannot demote core % — % dependent rows still reference it as core; repoint them first (Stage 3 merge tooling)',
        OLD.name, (SELECT count(*) FROM exercises c WHERE c.core_movement_id = OLD.id AND c.id <> OLD.id);
    END IF;
  END IF;

  IF NEW.is_core THEN
    NEW.core_movement_id := NEW.id;
  ELSIF NEW.core_movement_id = NEW.id THEN
    -- demoted from core: a non-core row must not self-reference
    NEW.core_movement_id := NULL;
  END IF;

  -- Stage 4 symmetric validation: a non-self core reference must land on a row
  -- that IS a core, read under FOR KEY SHARE of the target (see banner). Rows
  -- whose reference was just self-corrected above never reach this branch.
  IF NEW.core_movement_id IS NOT NULL AND NEW.core_movement_id <> NEW.id THEN
    PERFORM 1 FROM exercises t WHERE t.id = NEW.core_movement_id AND t.is_core FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'core_movement_id % on % does not reference a core movement (is_core row required)',
        NEW.core_movement_id, NEW.name;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ============================================================================
-- 5) Self-verify (fail closed, observed values). 5a/5b structural, 5c
--    behavioral on fixtures that are created AND fully removed in-file, so the
--    committed state is untouched and a re-run starts clean (idempotent).
-- ============================================================================

-- 5a) index states: unique lock present and UNIQUE, plain index gone — never both
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  PERFORM 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname = 'exercises_fingerprint_key'
     AND c.relnamespace = 'public'::regnamespace
     AND i.indrelid = 'public.exercises'::regclass
     AND i.indisunique;
  IF NOT FOUND THEN
    SELECT string_agg(indexname, ', ' ORDER BY indexname) INTO v_observed
      FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'exercises'
       AND indexname LIKE '%fingerprint%';
    RAISE EXCEPTION 'turn_the_locks: unique index exercises_fingerprint_key missing or not unique (fingerprint indexes present: %)',
      COALESCE(v_observed, 'none');
  END IF;

  PERFORM 1 FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'exercises_fingerprint_idx';
  IF FOUND THEN
    RAISE EXCEPTION 'turn_the_locks: plain exercises_fingerprint_idx still present alongside the unique lock (never both)';
  END IF;
END $$;

-- 5b) engine sources carry the new guards and none of the old ones
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_observed
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('trg_exercise_identity', 'trg_junction_identity', 'recompute_exercise_identity')
     AND p.prosrc LIKE '%pg_trigger_depth%';
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'turn_the_locks: pg_trigger_depth() guard still present in: %', v_observed;
  END IF;

  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_observed
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('trg_exercise_identity', 'trg_junction_identity', 'recompute_exercise_identity')
     AND p.prosrc NOT LIKE '%fittracker.identity_recompute_visited%';
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'turn_the_locks: session-variable guard missing from: %', v_observed;
  END IF;

  PERFORM 1 FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'enforce_core_self_reference'
     AND p.prosrc LIKE '%FOR KEY SHARE%' AND p.prosrc LIKE '%FOR UPDATE%';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turn_the_locks: enforce_core_self_reference lacks the FOR KEY SHARE / FOR UPDATE locking reads';
  END IF;

  -- SECURITY DEFINER + pinned search_path preserved on the engine entry point
  PERFORM 1 FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'recompute_exercise_identity'
     AND p.prosecdef
     AND array_to_string(COALESCE(p.proconfig, '{}'), ',') LIKE '%search_path=public%';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turn_the_locks: recompute_exercise_identity lost SECURITY DEFINER / search_path=public';
  END IF;
END $$;

-- 5c) behavioral: recompute still fires on plain writes (the guard-replacement
--     regression proof), the sibling cascade re-derives parents/tiers both when
--     a row's identity changes and when a new intermediate row appears, the
--     unique lock rejects duplicates and bare children, and the symmetric
--     validation rejects a non-core target. All fixture rows (TL- prefixed) are
--     deleted before the block ends.
DO $$
DECLARE
  st_wide UUID; st_stag UUID; sy_alt UUID;
  tl_core UUID; tl_a UUID; tl_b UUID; tl_c UUID;
  v_observed TEXT;
  v_caught BOOLEAN;
BEGIN
  SELECT id INTO st_wide FROM stances WHERE name = 'Wide (Sumo)';
  SELECT id INTO st_stag FROM stances WHERE name = 'Staggered';
  SELECT id INTO sy_alt  FROM symmetries WHERE name = 'Alternating';
  IF st_wide IS NULL OR st_stag IS NULL OR sy_alt IS NULL THEN
    RAISE EXCEPTION 'turn_the_locks self-verify: dictionary rows missing (Wide (Sumo)=%, Staggered=%, Alternating=%)',
      COALESCE(st_wide::text, 'null'), COALESCE(st_stag::text, 'null'), COALESCE(sy_alt::text, 'null');
  END IF;

  -- Fixture family: core TL, A = {Wide}, B = {Wide, Alternating} → B's parent is A
  INSERT INTO exercises (name, slug, is_core, is_official)
    VALUES ('TLFIXTURECORE', 'tl-fixture-core', true, true) RETURNING id INTO tl_core;
  INSERT INTO exercises (name, slug, is_official, core_movement_id, stance_id)
    VALUES ('TLFIXTUREA', 'tl-fixture-a', true, tl_core, st_wide) RETURNING id INTO tl_a;
  INSERT INTO exercises (name, slug, is_official, core_movement_id, stance_id, symmetry_id)
    VALUES ('TLFIXTUREB', 'tl-fixture-b', true, tl_core, st_wide, sy_alt) RETURNING id INTO tl_b;

  -- Recompute fired on INSERT under the new guard (fingerprint computed, hierarchy derived)
  IF (SELECT identity_fingerprint FROM exercises WHERE id = tl_a) IS NULL THEN
    RAISE EXCEPTION 'turn_the_locks self-verify: INSERT did not recompute (fingerprint null on fixture A)';
  END IF;
  IF (SELECT parent_exercise_id FROM exercises WHERE id = tl_b) IS DISTINCT FROM tl_a
     OR (SELECT tier FROM exercises WHERE id = tl_b) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'turn_the_locks self-verify: B parent/tier = %/% (expected A/2)',
      COALESCE((SELECT parent_exercise_id FROM exercises WHERE id = tl_b)::text, 'null'),
      COALESCE((SELECT tier FROM exercises WHERE id = tl_b)::text, 'null');
  END IF;

  -- Regression proof: a normal single-row UPDATE of an identity column still
  -- recomputes (the old depth guard is gone; the ledger guard must not eat it)...
  SELECT identity_fingerprint INTO v_observed FROM exercises WHERE id = tl_a;
  UPDATE exercises SET stance_id = st_stag WHERE id = tl_a;
  IF (SELECT identity_fingerprint FROM exercises WHERE id = tl_a) IS NOT DISTINCT FROM v_observed THEN
    RAISE EXCEPTION 'turn_the_locks self-verify: identity-column UPDATE did not recompute (fingerprint unchanged: %)',
      COALESCE(v_observed, 'null');
  END IF;

  -- ...and the sibling cascade re-derived B: A = {Staggered} no longer sits
  -- inside B = {Wide, Alternating}, so B falls back to the core at tier 1.
  IF (SELECT parent_exercise_id FROM exercises WHERE id = tl_b) IS DISTINCT FROM tl_core
     OR (SELECT tier FROM exercises WHERE id = tl_b) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'turn_the_locks self-verify (I5): after A''s identity change B parent/tier = %/% (expected core/1)',
      COALESCE((SELECT parent_exercise_id FROM exercises WHERE id = tl_b)::text, 'null'),
      COALESCE((SELECT tier FROM exercises WHERE id = tl_b)::text, 'null');
  END IF;

  -- I5 headline: INSERTing an intermediate row C = {Alternating} must pull the
  -- existing superset B under it (new row becomes parent of an existing row).
  INSERT INTO exercises (name, slug, is_official, core_movement_id, symmetry_id)
    VALUES ('TLFIXTUREC', 'tl-fixture-c', true, tl_core, sy_alt) RETURNING id INTO tl_c;
  IF (SELECT parent_exercise_id FROM exercises WHERE id = tl_b) IS DISTINCT FROM tl_c
     OR (SELECT tier FROM exercises WHERE id = tl_b) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'turn_the_locks self-verify (I5): after inserting intermediate C, B parent/tier = %/% (expected C/2)',
      COALESCE((SELECT parent_exercise_id FROM exercises WHERE id = tl_b)::text, 'null'),
      COALESCE((SELECT tier FROM exercises WHERE id = tl_b)::text, 'null');
  END IF;

  -- The lock: a duplicate insert (same core, same identity attributes as C) is
  -- rejected by exercises_fingerprint_key from inside the recompute trigger.
  v_caught := false;
  BEGIN
    INSERT INTO exercises (name, slug, is_official, core_movement_id, symmetry_id)
      VALUES ('TLFIXTUREDUP', 'tl-fixture-dup', true, tl_core, sy_alt);
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
    IF SQLERRM NOT LIKE '%exercises_fingerprint_key%' THEN
      RAISE EXCEPTION 'turn_the_locks self-verify: duplicate rejected by the wrong constraint: %', SQLERRM;
    END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'turn_the_locks self-verify: duplicate insert was NOT rejected by the unique lock';
  END IF;

  -- The lock, core-vs-bare-child semantics: a zero-attribute child computes
  -- fingerprint '' and collides with the core row's own ('' ) slot — rejected.
  v_caught := false;
  BEGIN
    INSERT INTO exercises (name, slug, is_official, core_movement_id)
      VALUES ('TLFIXTUREBARE', 'tl-fixture-bare', true, tl_core);
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
    IF SQLERRM NOT LIKE '%exercises_fingerprint_key%' THEN
      RAISE EXCEPTION 'turn_the_locks self-verify: bare child rejected by the wrong constraint: %', SQLERRM;
    END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'turn_the_locks self-verify: bare zero-attribute child was NOT rejected by the unique lock';
  END IF;

  -- Symmetric core-reference validation: a non-core target (fixture A) is rejected.
  v_caught := false;
  BEGIN
    INSERT INTO exercises (name, slug, is_official, core_movement_id)
      VALUES ('TLFIXTUREPHANTOM', 'tl-fixture-phantom', true, tl_a);
  EXCEPTION WHEN raise_exception THEN
    v_caught := true;
    IF SQLERRM NOT LIKE '%does not reference a core movement%' THEN
      RAISE EXCEPTION 'turn_the_locks self-verify: phantom-core insert raised the wrong error: %', SQLERRM;
    END IF;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'turn_the_locks self-verify: phantom-core insert (non-core target) was NOT rejected';
  END IF;

  -- Full cleanup: children first (core FK is RESTRICT), aliases cascade.
  DELETE FROM exercises WHERE id IN (tl_a, tl_b, tl_c);
  DELETE FROM exercises WHERE id = tl_core;
  IF EXISTS (SELECT 1 FROM exercises WHERE slug LIKE 'tl-fixture-%') THEN
    SELECT string_agg(slug, ', ' ORDER BY slug) INTO v_observed
      FROM exercises WHERE slug LIKE 'tl-fixture-%';
    RAISE EXCEPTION 'turn_the_locks self-verify: fixture rows not cleaned up: %', v_observed;
  END IF;
  IF EXISTS (SELECT 1 FROM exercise_aliases a
              WHERE NOT EXISTS (SELECT 1 FROM exercises e WHERE e.id = a.exercise_id)) THEN
    RAISE EXCEPTION 'turn_the_locks self-verify: orphaned alias rows left behind by the fixtures';
  END IF;
END $$;
