-- 20260909100000_turn_the_locks.sql
-- Stage 4 "turn the locks": duplicates become physically impossible and the
-- engine's known race/drift gaps close.
--   1) Fingerprint UNIQUE lock (DEFERRABLE INITIALLY IMMEDIATE constraint)
--      replacing the plain exercises_fingerprint_idx.
--   2) Sibling recompute on identity change (Task 9 review I5) via a top-level
--      worklist drained in global cardinality order (no recursion).
--   3) Session-variable guard replaces the depth-based trigger guards (I2).
--   4) Symmetric core-reference validation under FOR KEY SHARE (Task 9 final
--      review), SECURITY DEFINER so RLS cannot blind the locking read.
-- Schema/engine only — hand-written (no generator), idempotent, single-
-- transaction safe (plain index/constraint builds are correct at 287 rows;
-- CONCURRENTLY is banned inside the push transaction and unnecessary here).
-- This file assumes a wrapping transaction (supabase db push / psql -1):
-- SET LOCAL is inert without one, so never run it statement-by-statement.
SET LOCAL lock_timeout = '5s';

-- ============================================================================
-- 1) Pre-lock data gate: the constraint build below would fail anyway on dirty
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
-- 2) The fingerprint UNIQUE lock: a DEFERRABLE INITIALLY IMMEDIATE constraint
--    (not a bare unique index).
--
-- WHY A DEFERRABLE CONSTRAINT: a plain unique index checks per-row, which
-- rejects legitimate multi-statement identity reshuffles whose END state is
-- unique (e.g. two siblings swapping a stance). INITIALLY IMMEDIATE keeps the
-- default behavior everyone expects — a duplicate is rejected at the end of
-- the statement that creates it — while future curation flows can
-- SET CONSTRAINTS exercises_fingerprint_key DEFERRED for the swap and have the
-- check run once at commit. (Nothing uses this key as an ON CONFLICT arbiter —
-- the engine's only ON CONFLICT is on exercise_aliases — so losing arbiter
-- eligibility, the one cost of deferrability, is free here.)
--
-- SCOPE (design question 1): the constraint is total (no predicate) on
-- (core_movement_id, identity_fingerprint); composite-NULL semantics under the
-- default NULLS DISTINCT do the row scoping:
--   * Derivations AND core rows participate: both carry core_movement_id and an
--     engine-written fingerprint ('' for an attribute-free row). Two rows of the
--     same core with the same identity attribute set are physically impossible.
--   * Coreless rows (the 52 outliers) carry NULL in BOTH columns, so they are
--     exempt — outliers never collide with each other or with anything else.
--     The backing index stays total, so the planner keeps using it for exactly
--     the lookups the plain index served.
--   * A just-inserted row still has fingerprint NULL for the instant before the
--     AFTER trigger's recompute UPDATE writes the computed value; that UPDATE is
--     checked against this constraint, so the insert path is still locked — a
--     duplicate insert is rejected from inside its own trigger.
--
-- CORE vs BARE CHILD (design question 1, continued): a core row self-references
-- with fingerprint '' (cores are attribute-free — Stage 3 end state; 48/48 cores
-- observed at '' on the 2026-09-08 dump, and V9 pins cores to zero equipment
-- junctions). A bare zero-attribute child would compute fingerprint '' under the
-- same core and land on the slot the core's own row already occupies — the
-- collision is the enforcement: bare children are REJECTED, i.e. physically
-- impossible while cores stay attribute-free. Degenerate future case: if a core
-- ever grew identity attributes, its own slot would move off '' and ONE bare
-- child would become insertable (a second would collide with the first);
-- harness V10 flags both conditions with a WARNING.
-- ============================================================================
DO $$
BEGIN
  -- Transition guard: an earlier revision of this migration created a plain
  -- unique INDEX under this name; a constraint-backed index must not be dropped
  -- this way, so only clear a bare index.
  IF EXISTS (SELECT 1 FROM pg_class c
              WHERE c.relname = 'exercises_fingerprint_key'
                AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'i')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conrelid = 'public.exercises'::regclass
                        AND conname = 'exercises_fingerprint_key') THEN
    EXECUTE 'DROP INDEX public.exercises_fingerprint_key';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.exercises'::regclass
                    AND conname = 'exercises_fingerprint_key') THEN
    EXECUTE 'ALTER TABLE public.exercises
               ADD CONSTRAINT exercises_fingerprint_key
               UNIQUE (core_movement_id, identity_fingerprint)
               DEFERRABLE INITIALLY IMMEDIATE';
  END IF;
END $$;
-- Never carry both: the plain index is fully subsumed by the constraint's
-- backing index.
DROP INDEX IF EXISTS public.exercises_fingerprint_idx;

-- ============================================================================
-- 3) Engine: worklist-based sibling recompute (I5) + session-variable guard (I2).
--
--    The single-row derivation moves into recompute_exercise_identity_row
--    (worker: derive + conditionally write ONE row, no cascading). The public
--    recompute_exercise_identity keeps its signature — triggers and existing
--    callers are untouched — and becomes the orchestrator: recompute the entry
--    row, and if its identity moved, drain every affected core family in ONE
--    globally ordered pass. No recursion anywhere.
-- ============================================================================

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
         tier, generated_name, name, name_is_custom
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

-- Orchestrator. Signature unchanged from Stage 1/3 — triggers and any direct
-- caller (backfills, tooling) keep working.
--
-- CONCURRENCY / LOCKING (I1): when the entry row's identity moved, every
-- affected family's rows are LOCKED UP FRONT in the same deterministic global
-- (cardinality ASC, id ASC) order the pass then recomputes in, and families
-- themselves are visited in core-id order — two overlapping cascades acquire
-- their common locks in the same sequence. RESIDUAL RISK: the entry row's own
-- lock (taken by the triggering statement itself) precedes the worklist and is
-- outside this ordering, so two cascades whose entry rows sit at different
-- worklist positions in the same family can still deadlock (40P01); Postgres
-- resolves it by aborting one — callers should treat 40P01 on catalog writes
-- as retryable.
CREATE OR REPLACE FUNCTION public.recompute_exercise_identity(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_core UUID; v_changed BOOLEAN; v_family UUID; r RECORD;
BEGIN
  -- Re-entrancy guard (Stage 4, I2): a transaction-local session variable that
  -- is 'on' ONLY while this orchestrator is on the stack. The identity triggers
  -- skip while it is on — replacing the old depth-based guard, which also
  -- silenced recompute for UNRELATED trigger-driven writes. set_config(...,
  -- is_local => true) unwinds on (sub)transaction abort, so a caught rejection
  -- cannot leave the flag stuck.
  IF COALESCE(current_setting('fittracker.identity_recompute_active', true), '') = 'on' THEN
    RETURN;
  END IF;
  PERFORM set_config('fittracker.identity_recompute_active', 'on', true);

  PERFORM 1 FROM exercises WHERE id = p_id FOR UPDATE;
  SELECT core_movement_id INTO v_core FROM exercises WHERE id = p_id;
  IF FOUND THEN
    v_changed := recompute_exercise_identity_row(p_id);

    -- WORKLIST sibling recompute (C1 fix for I5): if the entry row's identity
    -- moved, drain each affected family in ONE global pass ordered by
    -- (cardinality ASC, id ASC). That order is TOPOLOGICAL for parent
    -- selection — a parent always has strictly fewer attributes, and attribute
    -- sets are inputs the pass never changes — so every row's parent candidates
    -- are settled before the row reads their tiers; correctness is induction on
    -- cardinality, with no recursion and no revisit hazard. Draining the WHOLE
    -- family (entry row included — its pre-pass values may have read stale
    -- sibling tiers) rather than just the containment cone trades a handful of
    -- no-op worker calls for that proof and for the deterministic lock order.
    -- TRAVERSAL BOUND (design question 2): at most one worker call per family
    -- row per top-level entry; affected families are the entry row's own core
    -- family plus, after a repoint/promotion, the family its stale children
    -- were left in — never more.
    IF v_changed THEN
      FOR v_family IN
        SELECT DISTINCT f.core_id FROM (
          SELECT v_core AS core_id WHERE v_core IS NOT NULL
          UNION
          SELECT s.core_movement_id FROM exercises s        -- stragglers after a repoint/promotion
           WHERE s.parent_exercise_id = p_id
             AND s.core_movement_id IS NOT NULL
             AND s.core_movement_id IS DISTINCT FROM v_core
        ) f ORDER BY f.core_id
      LOOP
        -- Lock phase: all family row locks up front, in pass order (I1).
        FOR r IN
          SELECT e.id FROM exercises e
           WHERE e.core_movement_id = v_family AND NOT e.is_core
           ORDER BY cardinality(exercise_identity_attrs(e.id)) ASC, e.id ASC
        LOOP
          PERFORM 1 FROM exercises WHERE id = r.id FOR UPDATE;
        END LOOP;
        -- Recompute phase: same order.
        FOR r IN
          SELECT e.id FROM exercises e
           WHERE e.core_movement_id = v_family AND NOT e.is_core
           ORDER BY cardinality(exercise_identity_attrs(e.id)) ASC, e.id ASC
        LOOP
          PERFORM recompute_exercise_identity_row(r.id);
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  PERFORM set_config('fittracker.identity_recompute_active', '', true);
END $$;

-- Triggers: guard on the engine's own flag, not the trigger-call depth. Depth
-- > 1 is true for ANY trigger-driven write — an unrelated trigger inserting or
-- amending an exercise row would have silently skipped recompute (I2). The
-- flag is on ONLY while the orchestrator itself is on the stack, which is
-- exactly the write set that must not re-enter.
CREATE OR REPLACE FUNCTION public.trg_exercise_identity() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF COALESCE(current_setting('fittracker.identity_recompute_active', true), '') = 'on' THEN
    RETURN NEW;                     -- engine write: the worklist handles siblings itself
  END IF;
  PERFORM recompute_exercise_identity(NEW.id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_junction_identity() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF COALESCE(current_setting('fittracker.identity_recompute_active', true), '') = 'on' THEN
    RETURN COALESCE(NEW, OLD);      -- engine write: the worklist handles siblings itself
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
--    SECURITY DEFINER (review I3): under RLS an authenticated writer cannot
--    take FOR KEY SHARE on official cores it has no UPDATE policy for — the
--    locking read would come back empty and misreport a real core as invalid.
--    Definer rights (matching recompute_exercise_identity) keep the validation
--    about the catalog's truth, not the caller's visibility.
--    V5's inverse invariant stays as post-hoc detection.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_core_self_reference() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- 5a) the lock is a DEFERRABLE INITIALLY IMMEDIATE unique CONSTRAINT on
--     exactly (core_movement_id, identity_fingerprint), and the plain index is
--     gone — never both
DO $$
DECLARE
  v_def TEXT;
  v_observed TEXT;
BEGIN
  SELECT pg_get_indexdef(c.conindid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.exercises'::regclass
     AND c.conname = 'exercises_fingerprint_key'
     AND c.contype = 'u' AND c.condeferrable AND NOT c.condeferred;
  IF v_def IS NULL THEN
    SELECT string_agg(conname || ' (type=' || contype || ', deferrable=' || condeferrable
                      || ', initially_deferred=' || condeferred || ')', '; ' ORDER BY conname)
      INTO v_observed
      FROM pg_constraint WHERE conrelid = 'public.exercises'::regclass AND contype = 'u';
    RAISE EXCEPTION 'turn_the_locks: exercises_fingerprint_key is not a DEFERRABLE INITIALLY IMMEDIATE unique constraint (unique constraints on exercises: %)',
      COALESCE(v_observed, 'none');
  END IF;
  IF v_def NOT LIKE '%UNIQUE INDEX%' OR v_def NOT LIKE '%(core_movement_id, identity_fingerprint)%' THEN
    RAISE EXCEPTION 'turn_the_locks: exercises_fingerprint_key backing index has the wrong shape: %', v_def;
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
  PERFORM 1 FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'recompute_exercise_identity_row';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turn_the_locks: worker function recompute_exercise_identity_row missing';
  END IF;

  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_observed
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('trg_exercise_identity', 'trg_junction_identity',
                       'recompute_exercise_identity', 'recompute_exercise_identity_row')
     AND p.prosrc LIKE '%pg_trigger_depth%';
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'turn_the_locks: depth guard still present in: %', v_observed;
  END IF;

  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_observed
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('trg_exercise_identity', 'trg_junction_identity', 'recompute_exercise_identity')
     AND p.prosrc NOT LIKE '%fittracker.identity_recompute_active%';
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

  -- SECURITY DEFINER + pinned search_path on all three engine entry points
  -- (enforce_core_self_reference gained it in this migration — review I3)
  SELECT string_agg(t.fn, ', ' ORDER BY t.fn) INTO v_observed
    FROM (VALUES ('recompute_exercise_identity'), ('recompute_exercise_identity_row'),
                 ('enforce_core_self_reference')) t(fn)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = t.fn
        AND p.prosecdef
        AND array_to_string(COALESCE(p.proconfig, '{}'), ',') LIKE '%search_path=public%');
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'turn_the_locks: functions missing SECURITY DEFINER / search_path=public: %', v_observed;
  END IF;
END $$;

-- 5c) behavioral: recompute still fires on plain writes (the guard-replacement
--     regression proof), the worklist re-derives parents/tiers both when a
--     row's identity changes and when a new intermediate row appears, the
--     unique lock rejects duplicates and bare children, and the symmetric
--     validation rejects a non-core target. All fixture rows (TL- prefixed)
--     are deleted before the block ends.
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
  -- recomputes (the old depth guard is gone; the flag guard must not eat it)...
  SELECT identity_fingerprint INTO v_observed FROM exercises WHERE id = tl_a;
  UPDATE exercises SET stance_id = st_stag WHERE id = tl_a;
  IF (SELECT identity_fingerprint FROM exercises WHERE id = tl_a) IS NOT DISTINCT FROM v_observed THEN
    RAISE EXCEPTION 'turn_the_locks self-verify: identity-column UPDATE did not recompute (fingerprint unchanged: %)',
      COALESCE(v_observed, 'null');
  END IF;

  -- ...and the worklist re-derived B: A = {Staggered} no longer sits inside
  -- B = {Wide, Alternating}, so B falls back to the core at tier 1.
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
  -- fingerprint '' and collides with the core row's own ('') slot — rejected.
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
