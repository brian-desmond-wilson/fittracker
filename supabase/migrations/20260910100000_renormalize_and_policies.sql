-- 20260910100000_renormalize_and_policies.sql
-- Stage 5 Task 5: the abbreviation dictionary becomes self-healing and the
-- catalog junction tables stop being wide-open to any authenticated user.
--   1) Re-normalization trigger on alias_abbreviations (INSERT/UPDATE/DELETE):
--      every exercise_aliases.alias_normalized is recomputed under the new
--      dictionary; when two aliases collapse onto one normalized form, the
--      LOSER (newer created_at, tiebreak larger id) is removed and routed to
--      exercise_match_reviews — the dictionary write itself never fails.
--   2) Policy tightening: exercise_equipment, exercise_scoring_types and
--      exercise_aliases writes are restricted to rows whose parent exercise is
--      created_by = auth.uid() AND is_official = false, with ONE carve-out:
--      authenticated INSERT of kind='wild' aliases onto ANY exercise (the
--      review queue's link+teach flow and re-capture self-resolution depend
--      on wild aliases landing on official rows). Generated-kind minting stays
--      engine-side (SECURITY DEFINER, owner bypasses RLS).
--   3) The equipment dictionary SELECT policy joins its siblings ("viewable by
--      everyone" — public, not authenticated-only; anon embeds returned null).
--   4) DELETE-recompute engine gap closed: deleting an exercise now drains its
--      core family (children re-parent upward, tiers re-derive) instead of
--      leaving parent-SET-NULL orphans with stale tiers. The Stage 4 family
--      drain is extracted into recompute_core_family and REUSED by both the
--      orchestrator and the new statement-level AFTER DELETE trigger.
-- Schema/engine/policy — hand-written, idempotent (fresh / half-applied /
-- re-applied all converge), single-transaction safe.
-- This file assumes a wrapping transaction (supabase db push / psql -1):
-- SET LOCAL is inert without one, so never run it statement-by-statement.
SET LOCAL lock_timeout = '5s';

-- ============================================================================
-- 1) Re-normalization engine.
--
-- SHAPE: a statement-level AFTER trigger on alias_abbreviations doing a
-- set-based pass over exercise_aliases. The per-row BEFORE trigger on
-- exercise_aliases (enforce_alias_normalized) recomputes NEW.alias_normalized
-- from NEW.alias on our UPDATEs — the same value we set — so there is no
-- fight; and nothing here writes alias_abbreviations, so no recursion.
--
-- COLLISION SAFETY under the plain (non-deferrable — it is the engine's
-- ON CONFLICT arbiter) unique index exercise_aliases_normalized_key:
--   * duplicate-target losers (two aliases whose FINAL normalized form is
--     identical) are removed and routed BEFORE any update;
--   * the progress pass only updates a row when no OTHER row currently holds
--     its target slot, so a single UPDATE statement can never trip the index
--     transiently; chains (A's new value is B's old value) drain one link per
--     pass;
--   * a swap CYCLE (aliases exchanging normalized forms — requires a
--     pathological abbreviation change) starves the progress pass; one cycle
--     member (the loser by the same newest-first rule) is routed to the queue,
--     which breaks the cycle, and the loop resumes. The dictionary write
--     itself never fails.
-- ============================================================================

-- Worker: remove ONE collision loser from exercise_aliases and record it in
-- exercise_match_reviews so curation can re-teach the wording deliberately.
-- SECURITY DEFINER: the routing inserts a review row for whichever user the
-- alias belonged to — RLS on exercise_match_reviews ("own reviews") must not
-- blind or block the write.
CREATE OR REPLACE FUNCTION public.route_alias_renorm_loser(p_alias_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_loser RECORD;
  v_winner RECORD;
  v_user UUID;
  v_candidates JSONB;
  v_context TEXT;
BEGIN
  SELECT a.id, a.exercise_id, a.alias, a.kind,
         normalize_alias(a.alias) AS new_norm,
         e.name AS exercise_name, e.created_by AS exercise_owner
    INTO v_loser
    FROM exercise_aliases a JOIN exercises e ON e.id = a.exercise_id
   WHERE a.id = p_alias_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- The competitor that keeps (or will keep) the slot: judged by FINAL
  -- normalized form, oldest created_at then smallest id first — the same rule
  -- that picked this row as the loser.
  SELECT b.alias, b.exercise_id, e.name AS exercise_name INTO v_winner
    FROM exercise_aliases b JOIN exercises e ON e.id = b.exercise_id
   WHERE b.id <> v_loser.id AND normalize_alias(b.alias) = v_loser.new_norm
   ORDER BY b.created_at ASC, b.id ASC
   LIMIT 1;

  -- Whose review: the acting user when there is one, else the alias's exercise
  -- owner, else the oldest account (single-developer app; curation runs as
  -- postgres where auth.uid() is NULL).
  v_user := COALESCE(auth.uid(), v_loser.exercise_owner,
                     (SELECT u.id FROM auth.users u ORDER BY u.created_at ASC, u.id ASC LIMIT 1));

  IF v_user IS NULL THEN
    RAISE WARNING 'alias re-normalization: no user available to route collision loser "%" (exercise %) — removing without a review row',
      v_loser.alias, v_loser.exercise_name;
  ELSE
    v_candidates := jsonb_build_array(
      jsonb_build_object('exerciseId', v_loser.exercise_id, 'name', v_loser.exercise_name));
    IF v_winner.exercise_id IS NOT NULL AND v_winner.exercise_id IS DISTINCT FROM v_loser.exercise_id THEN
      v_candidates := v_candidates || jsonb_build_array(
        jsonb_build_object('exerciseId', v_winner.exercise_id, 'name', v_winner.exercise_name));
    END IF;
    v_context := format(
      'alias re-normalization collision: "%s" (%s, on "%s") now normalizes to "%s", already held by "%s" on "%s"; removed from the alias dictionary by an abbreviation change',
      v_loser.alias, v_loser.kind, v_loser.exercise_name, v_loser.new_norm,
      COALESCE(v_winner.alias, '?'), COALESCE(v_winner.exercise_name, '?'));
    BEGIN
      -- raw_name_normalized is trigger-enforced; placeholder satisfies NOT NULL.
      INSERT INTO exercise_match_reviews (user_id, raw_name, raw_name_normalized, context, candidates)
      VALUES (v_user, v_loser.alias, '', v_context, v_candidates);
    EXCEPTION WHEN OTHERS THEN
      -- The dictionary write must never fail on the routing side-channel.
      RAISE WARNING 'alias re-normalization: could not route loser "%" to exercise_match_reviews (%: %) — removing anyway',
        v_loser.alias, SQLSTATE, SQLERRM;
      v_user := NULL;
    END;
  END IF;

  DELETE FROM exercise_aliases WHERE id = v_loser.id;
  RETURN v_user IS NOT NULL;
END $$;

-- Statement-level pass: converge exercise_aliases.alias_normalized onto the
-- current dictionary. SECURITY DEFINER for the same reason as the worker (the
-- pass may fire from any writer the dictionary ever grants; today that is
-- curation only — alias_abbreviations has no write policies).
CREATE OR REPLACE FUNCTION public.renormalize_exercise_aliases() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_renormalized INTEGER := 0;
  v_routed INTEGER := 0;
  v_pass INTEGER;
  v_guard INTEGER := 0;
  v_loser UUID;
  r RECORD;
BEGIN
  LOOP
    v_guard := v_guard + 1;
    IF v_guard > 500 THEN
      RAISE WARNING 'alias re-normalization: bailed after 500 passes with stale rows remaining (dictionary write preserved)';
      EXIT;
    END IF;

    -- (a) duplicate-target losers: any alias sharing its FINAL normalized form
    -- with an older (created_at ASC, id ASC) alias is removed and routed.
    FOR r IN
      SELECT d.id FROM (
        SELECT a.id,
               row_number() OVER (PARTITION BY normalize_alias(a.alias)
                                  ORDER BY a.created_at ASC, a.id ASC) AS rn
          FROM exercise_aliases a
      ) d WHERE d.rn > 1
    LOOP
      PERFORM route_alias_renorm_loser(r.id);
      v_routed := v_routed + 1;
    END LOOP;

    -- (b) progress pass: renormalize every stale row whose target slot is free
    -- in the current snapshot (transient-collision-proof; see banner).
    UPDATE exercise_aliases a
       SET alias_normalized = normalize_alias(a.alias)
     WHERE a.alias_normalized IS DISTINCT FROM normalize_alias(a.alias)
       AND NOT EXISTS (SELECT 1 FROM exercise_aliases b
                        WHERE b.id <> a.id
                          AND b.alias_normalized = normalize_alias(a.alias));
    GET DIAGNOSTICS v_pass = ROW_COUNT;
    v_renormalized := v_renormalized + v_pass;
    CONTINUE WHEN v_pass > 0;

    -- (c) no progress left: anything still stale sits in a swap cycle. Route
    -- one loser (newest created_at, largest id) and go around again.
    SELECT a.id INTO v_loser
      FROM exercise_aliases a
     WHERE a.alias_normalized IS DISTINCT FROM normalize_alias(a.alias)
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT 1;
    EXIT WHEN v_loser IS NULL;
    PERFORM route_alias_renorm_loser(v_loser);
    v_routed := v_routed + 1;
  END LOOP;

  RAISE NOTICE 'alias re-normalization: % alias(es) renormalized, % collision loser(s) routed to exercise_match_reviews',
    v_renormalized, v_routed;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS alias_abbreviations_renormalize ON public.alias_abbreviations;
CREATE TRIGGER alias_abbreviations_renormalize
  AFTER INSERT OR UPDATE OR DELETE ON public.alias_abbreviations
  FOR EACH STATEMENT EXECUTE FUNCTION public.renormalize_exercise_aliases();

-- ============================================================================
-- 2) Engine: family recompute on DELETE (the drift gap).
--
-- THE GAP: parent_exercise_id is ON DELETE SET NULL and the RI action's
-- UPDATE touches no identity column, so deleting a derivation left its
-- children with parent NULL and a stale tier (observed on staging: Incline
-- Bench Press at tier 2 / parent NULL after every probe cleanup). Cores are
-- safe (core FK is RESTRICT), outliers are core-less — only derivation
-- deletes need a repair pass.
--
-- REUSE, NOT DUPLICATION: the Stage 4 orchestrator's per-family drain (lock
-- phase then recompute phase, both in global (cardinality ASC, id ASC) order)
-- is extracted verbatim into recompute_core_family; recompute_exercise_identity
-- is re-created to call it, and the new DELETE trigger calls the same
-- function. Locking/ordering semantics are therefore identical on every path.
--
-- TRIGGER SHAPE (bulk-delete cost): a STATEMENT-level AFTER DELETE trigger
-- with a transition table, NOT a row-level one. A row-level trigger would
-- drain the whole family once PER DELETED ROW — a Stage-3-style curation
-- merge deleting 25 rows in one statement would run 25 full family drains
-- (each taking every family lock). The statement shape drains each affected
-- core family exactly ONCE per statement no matter how many rows fell, and
-- fires after the RI SET NULL updates (statement triggers run after all row
-- triggers), so it always sees the orphaned state it must repair. The
-- session-variable guard makes it a no-op inside an engine pass, and the
-- worker's conditional write makes re-drains harmless — a future curation
-- migration that deletes in bulk and then runs its own recompute converges
-- to the same state (idempotent).
-- ============================================================================

-- The Stage 4 drain, extracted. SECURITY DEFINER matching the orchestrator:
-- the pass must see and lock the whole family regardless of caller RLS.
CREATE OR REPLACE FUNCTION public.recompute_core_family(p_core UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  -- Lock phase: all family row locks up front, in pass order (Stage 4 I1).
  FOR r IN
    SELECT e.id FROM exercises e
     WHERE e.core_movement_id = p_core AND NOT e.is_core
     ORDER BY cardinality(exercise_identity_attrs(e.id)) ASC, e.id ASC
  LOOP
    PERFORM 1 FROM exercises WHERE id = r.id FOR UPDATE;
  END LOOP;
  -- Recompute phase: same order (topological — parents settle before children
  -- read their tiers; see the Stage 4 worklist proof).
  FOR r IN
    SELECT e.id FROM exercises e
     WHERE e.core_movement_id = p_core AND NOT e.is_core
     ORDER BY cardinality(exercise_identity_attrs(e.id)) ASC, e.id ASC
  LOOP
    PERFORM recompute_exercise_identity_row(r.id);
  END LOOP;
END $$;

-- Orchestrator re-created ONLY to delegate its inlined drain loops to
-- recompute_core_family. Signature, guard, worklist semantics and every
-- comment-documented behavior are unchanged from 20260909100000.
CREATE OR REPLACE FUNCTION public.recompute_exercise_identity(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_core UUID; v_changed BOOLEAN; v_family UUID;
BEGIN
  -- Re-entrancy guard (Stage 4 I2): transaction-local flag, 'on' only while
  -- an engine pass is on the stack; unwinds on (sub)transaction abort.
  IF COALESCE(current_setting('fittracker.identity_recompute_active', true), '') = 'on' THEN
    RETURN;
  END IF;
  PERFORM set_config('fittracker.identity_recompute_active', 'on', true);

  PERFORM 1 FROM exercises WHERE id = p_id FOR UPDATE;
  SELECT core_movement_id INTO v_core FROM exercises WHERE id = p_id;
  IF FOUND THEN
    v_changed := recompute_exercise_identity_row(p_id);

    -- Worklist sibling recompute (Stage 4 C1/I5): entry row's identity moved →
    -- drain each affected family once, in core-id order.
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
        PERFORM recompute_core_family(v_family);
      END LOOP;
    END IF;
  END IF;

  PERFORM set_config('fittracker.identity_recompute_active', '', true);
END $$;

-- The DELETE repair pass. SECURITY DEFINER: trigger functions run as the
-- INVOKING user, and section 4 revokes the engine entry points from
-- anon/authenticated — definer rights keep the shim's recompute_core_family
-- call working for app-user deletes (enforce_core_self_reference precedent,
-- Stage 4 I3). The shim only reads the transition table and delegates.
CREATE OR REPLACE FUNCTION public.trg_exercise_delete_identity() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_family UUID;
BEGIN
  -- Inside an engine pass the worklist owns the family — skip (I2).
  IF COALESCE(current_setting('fittracker.identity_recompute_active', true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('fittracker.identity_recompute_active', 'on', true);
  FOR v_family IN
    SELECT DISTINCT d.core_movement_id
      FROM deleted_rows d
     WHERE d.core_movement_id IS NOT NULL      -- outliers: no family, no-op
       AND d.core_movement_id <> d.id          -- deleted cores were childless (RESTRICT)
     ORDER BY 1                                -- core-id order, matching the orchestrator
  LOOP
    PERFORM recompute_core_family(v_family);
  END LOOP;
  PERFORM set_config('fittracker.identity_recompute_active', '', true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS exercises_identity_delete ON public.exercises;
CREATE TRIGGER exercises_identity_delete
  AFTER DELETE ON public.exercises
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_exercise_delete_identity();

-- The Stage 4 shims, re-created byte-identical EXCEPT for SECURITY DEFINER +
-- pinned search_path. REQUIRED by section 4's privilege hygiene: a trigger
-- function executes as the user whose write fired it, so once EXECUTE on
-- recompute_exercise_identity is revoked from authenticated, an invoker-rights
-- shim would fail every app-user catalog write from inside its own trigger.
-- Definer rights make "engine triggers run as owner" actually true. The shims
-- contain nothing but the guard check and the delegation call.
CREATE OR REPLACE FUNCTION public.trg_exercise_identity() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(current_setting('fittracker.identity_recompute_active', true), '') = 'on' THEN
    RETURN NEW;                     -- engine write: the worklist handles siblings itself
  END IF;
  PERFORM recompute_exercise_identity(NEW.id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_junction_identity() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
-- 3) Policy pass. Drop-and-recreate by name keeps every branch idempotent and
--    pins the exact final shape regardless of the starting state.
-- ============================================================================

-- 3a) equipment dictionary: align with the sibling dictionaries — SELECT for
--     everyone (the old policy was TO authenticated; anon embeds came back
--     null, Task 3 finding).
DROP POLICY IF EXISTS "Equipment are viewable by everyone" ON public.equipment;
CREATE POLICY "Equipment are viewable by everyone" ON public.equipment
  FOR SELECT USING (true);

-- 3b) exercise_equipment: replace the all-true ALL policy with per-command
--     policies scoped to the caller's own non-official exercises.
DROP POLICY IF EXISTS "exercise_equipment writable by authenticated" ON public.exercise_equipment;
DROP POLICY IF EXISTS "exercise_equipment insert on own exercises" ON public.exercise_equipment;
CREATE POLICY "exercise_equipment insert on own exercises" ON public.exercise_equipment
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e
                       WHERE e.id = exercise_equipment.exercise_id
                         AND e.created_by = auth.uid() AND e.is_official = false));
DROP POLICY IF EXISTS "exercise_equipment update on own exercises" ON public.exercise_equipment;
CREATE POLICY "exercise_equipment update on own exercises" ON public.exercise_equipment
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e
                  WHERE e.id = exercise_equipment.exercise_id
                    AND e.created_by = auth.uid() AND e.is_official = false))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e
                       WHERE e.id = exercise_equipment.exercise_id
                         AND e.created_by = auth.uid() AND e.is_official = false));
DROP POLICY IF EXISTS "exercise_equipment delete on own exercises" ON public.exercise_equipment;
CREATE POLICY "exercise_equipment delete on own exercises" ON public.exercise_equipment
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e
                  WHERE e.id = exercise_equipment.exercise_id
                    AND e.created_by = auth.uid() AND e.is_official = false));

-- 3c) exercise_scoring_types: replace the three all-true per-command policies
--     (Task 2 finding) with the same own-non-official scope.
DROP POLICY IF EXISTS "Authenticated users can insert exercise scoring types" ON public.exercise_scoring_types;
DROP POLICY IF EXISTS "Authenticated users can update exercise scoring types" ON public.exercise_scoring_types;
DROP POLICY IF EXISTS "Authenticated users can delete exercise scoring types" ON public.exercise_scoring_types;
DROP POLICY IF EXISTS "exercise_scoring_types insert on own exercises" ON public.exercise_scoring_types;
CREATE POLICY "exercise_scoring_types insert on own exercises" ON public.exercise_scoring_types
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e
                       WHERE e.id = exercise_scoring_types.exercise_id
                         AND e.created_by = auth.uid() AND e.is_official = false));
DROP POLICY IF EXISTS "exercise_scoring_types update on own exercises" ON public.exercise_scoring_types;
CREATE POLICY "exercise_scoring_types update on own exercises" ON public.exercise_scoring_types
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e
                  WHERE e.id = exercise_scoring_types.exercise_id
                    AND e.created_by = auth.uid() AND e.is_official = false))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e
                       WHERE e.id = exercise_scoring_types.exercise_id
                         AND e.created_by = auth.uid() AND e.is_official = false));
DROP POLICY IF EXISTS "exercise_scoring_types delete on own exercises" ON public.exercise_scoring_types;
CREATE POLICY "exercise_scoring_types delete on own exercises" ON public.exercise_scoring_types
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e
                  WHERE e.id = exercise_scoring_types.exercise_id
                    AND e.created_by = auth.uid() AND e.is_official = false));

-- 3d) exercise_aliases: replace the all-true ALL policy. Non-wild INSERT and
--     all UPDATE/DELETE are own-non-official only; the WILD-ALIAS CARVE-OUT
--     lets any authenticated user teach a wild wording onto ANY exercise
--     (official included) — the review queue's link+teach flow and re-capture
--     self-resolution depend on it. UPDATE/DELETE of official-row aliases
--     stays locked (curation/engine side only).
DROP POLICY IF EXISTS "aliases writable by authenticated" ON public.exercise_aliases;
DROP POLICY IF EXISTS "aliases insert on own exercises" ON public.exercise_aliases;
CREATE POLICY "aliases insert on own exercises" ON public.exercise_aliases
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e
                       WHERE e.id = exercise_aliases.exercise_id
                         AND e.created_by = auth.uid() AND e.is_official = false));
DROP POLICY IF EXISTS "wild aliases insertable by authenticated" ON public.exercise_aliases;
CREATE POLICY "wild aliases insertable by authenticated" ON public.exercise_aliases
  FOR INSERT TO authenticated
  WITH CHECK (kind = 'wild');
DROP POLICY IF EXISTS "aliases update on own exercises" ON public.exercise_aliases;
CREATE POLICY "aliases update on own exercises" ON public.exercise_aliases
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e
                  WHERE e.id = exercise_aliases.exercise_id
                    AND e.created_by = auth.uid() AND e.is_official = false))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e
                       WHERE e.id = exercise_aliases.exercise_id
                         AND e.created_by = auth.uid() AND e.is_official = false));
DROP POLICY IF EXISTS "aliases delete on own exercises" ON public.exercise_aliases;
CREATE POLICY "aliases delete on own exercises" ON public.exercise_aliases
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e
                  WHERE e.id = exercise_aliases.exercise_id
                    AND e.created_by = auth.uid() AND e.is_official = false));

-- 3e) exercises INSERT: the trust boundary every own-non-official policy
--     above leans on (review finding) — the old WITH CHECK constrained only
--     role + self-attribution, so a plain authenticated INSERT with
--     is_official=true minted straight into the official catalog. The policy
--     keeps its original checks verbatim and gains is_official = false.
--     is_core is deliberately NOT constrained (the wizard creates core rows
--     by design). The UPDATE policy already pins officialness immutable for
--     users: it declares no WITH CHECK, so its USING
--     (created_by = auth.uid() AND is_official = false) is applied to new
--     rows too — a user cannot flip an own row official post-insert; 5d
--     asserts that shape stays.
DROP POLICY IF EXISTS "Authenticated users can create own exercises" ON public.exercises;
CREATE POLICY "Authenticated users can create own exercises" ON public.exercises
  FOR INSERT
  WITH CHECK ((auth.role() = 'authenticated'::text)
              AND (created_by = auth.uid())
              AND (is_official = false));

-- ============================================================================
-- 4) Function privilege hygiene (merge_exercise_into precedent, Stage 3
--    review class). Supabase default privileges hand EXECUTE on every new
--    public function to anon/authenticated, which makes SECURITY DEFINER
--    workers RPC-callable at POST /rest/v1/rpc/<fn>:
--      * route_alias_renorm_loser was a working RLS bypass — any caller could
--        delete ANY alias by id with definer rights (official rows included)
--        and mint a review row attributed to the alias owner;
--      * recompute_core_family / recompute_exercise_identity /
--        recompute_exercise_identity_row are engine-internal (the last two
--        carried Stage 4 default grants — swept here).
--    App code calls none of them (grep of mobile/src + supabase/functions:
--    zero rpc references, 2026-09-08). The engine reaches them exclusively
--    through the SECURITY DEFINER trigger shims above, which run as owner
--    and are unaffected. Trigger-returning functions need nothing — PostgREST
--    cannot expose them. REVOKE is idempotent by nature.
-- ============================================================================
REVOKE ALL ON FUNCTION public.route_alias_renorm_loser(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_core_family(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_exercise_identity(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_exercise_identity_row(UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5) Self-verify (fail closed, observed values). 5a-5d structural; 5e
--    behavioral on fixtures created AND fully removed in-file. An in-file
--    functional re-normalization test would mutate the live dictionary, so the
--    behavioral proof lives in the harness (V11) fixture, which rolls back.
-- ============================================================================

-- 5a) re-normalization engine wired: statement-level AFTER trigger on all
--     three commands; both functions SECURITY DEFINER with pinned search_path.
DO $$
DECLARE
  v_tgtype INT2;
  v_observed TEXT;
BEGIN
  SELECT tgtype INTO v_tgtype FROM pg_trigger
   WHERE tgrelid = 'public.alias_abbreviations'::regclass
     AND tgname = 'alias_abbreviations_renormalize' AND NOT tgisinternal;
  IF v_tgtype IS NULL THEN
    SELECT string_agg(tgname, ', ' ORDER BY tgname) INTO v_observed
      FROM pg_trigger WHERE tgrelid = 'public.alias_abbreviations'::regclass AND NOT tgisinternal;
    RAISE EXCEPTION 'renormalize_and_policies: trigger alias_abbreviations_renormalize missing (triggers present: %)',
      COALESCE(v_observed, 'none');
  END IF;
  -- tgtype bits: 1=ROW, 2=BEFORE, 4=INSERT, 8=DELETE, 16=UPDATE
  IF (v_tgtype & 1) <> 0 OR (v_tgtype & 2) <> 0 OR (v_tgtype & 28) <> 28 THEN
    RAISE EXCEPTION 'renormalize_and_policies: alias_abbreviations_renormalize has the wrong shape (tgtype=%, expected statement-level AFTER INSERT OR UPDATE OR DELETE)', v_tgtype;
  END IF;

  SELECT string_agg(t.fn, ', ' ORDER BY t.fn) INTO v_observed
    FROM (VALUES ('renormalize_exercise_aliases'), ('route_alias_renorm_loser')) t(fn)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = t.fn
        AND p.prosecdef
        AND array_to_string(COALESCE(p.proconfig, '{}'), ',') LIKE '%search_path=public%');
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'renormalize_and_policies: functions missing SECURITY DEFINER / search_path=public: %', v_observed;
  END IF;
END $$;

-- 5b) DELETE-recompute engine wired: statement-level AFTER DELETE trigger with
--     the transition table; the extracted drain exists with definer rights;
--     the orchestrator delegates to it (reuse, not duplication).
DO $$
DECLARE
  v_tgtype INT2;
  v_oldtable NAME;
  v_observed TEXT;
BEGIN
  SELECT tgtype, tgoldtable INTO v_tgtype, v_oldtable FROM pg_trigger
   WHERE tgrelid = 'public.exercises'::regclass
     AND tgname = 'exercises_identity_delete' AND NOT tgisinternal;
  IF v_tgtype IS NULL THEN
    SELECT string_agg(tgname, ', ' ORDER BY tgname) INTO v_observed
      FROM pg_trigger WHERE tgrelid = 'public.exercises'::regclass AND NOT tgisinternal;
    RAISE EXCEPTION 'renormalize_and_policies: trigger exercises_identity_delete missing (triggers present: %)',
      COALESCE(v_observed, 'none');
  END IF;
  -- tgtype bits: 1=ROW, 2=BEFORE, 8=DELETE
  IF (v_tgtype & 1) <> 0 OR (v_tgtype & 2) <> 0 OR (v_tgtype & 8) <> 8
     OR v_oldtable IS DISTINCT FROM 'deleted_rows' THEN
    RAISE EXCEPTION 'renormalize_and_policies: exercises_identity_delete has the wrong shape (tgtype=%, tgoldtable=%; expected statement-level AFTER DELETE with OLD TABLE deleted_rows)',
      v_tgtype, COALESCE(v_oldtable, 'null');
  END IF;

  PERFORM 1 FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'recompute_core_family'
     AND p.prosecdef
     AND array_to_string(COALESCE(p.proconfig, '{}'), ',') LIKE '%search_path=public%';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'renormalize_and_policies: recompute_core_family missing or lacking SECURITY DEFINER / search_path=public';
  END IF;

  SELECT string_agg(t.fn, ', ' ORDER BY t.fn) INTO v_observed
    FROM (VALUES ('recompute_exercise_identity'), ('trg_exercise_delete_identity')) t(fn)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = t.fn
        AND p.prosrc LIKE '%recompute_core_family%'
        AND p.prosrc LIKE '%fittracker.identity_recompute_active%');
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'renormalize_and_policies: functions not delegating to recompute_core_family under the session guard: %', v_observed;
  END IF;
END $$;

-- 5c) privilege hygiene holds: none of the four engine/worker functions is
--     EXECUTE-able by anon or authenticated (has_function_privilege reads
--     proacl with PUBLIC-grant inheritance, so anon=false also proves no
--     PUBLIC grant survived), and every trigger shim that reaches them runs
--     with definer rights.
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(t.role || ' -> ' || t.fn, '; ' ORDER BY t.fn, t.role) INTO v_observed
    FROM (SELECT r.role, f.fn
            FROM (VALUES ('anon'), ('authenticated')) r(role)
            CROSS JOIN (VALUES ('public.route_alias_renorm_loser(uuid)'),
                               ('public.recompute_core_family(uuid)'),
                               ('public.recompute_exercise_identity(uuid)'),
                               ('public.recompute_exercise_identity_row(uuid)')) f(fn)) t
   WHERE has_function_privilege(t.role, t.fn, 'EXECUTE');
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'renormalize_and_policies: engine functions still EXECUTE-able over RPC: %', v_observed;
  END IF;

  SELECT string_agg(t.fn, ', ' ORDER BY t.fn) INTO v_observed
    FROM (VALUES ('trg_exercise_identity'), ('trg_junction_identity'),
                 ('trg_exercise_delete_identity')) t(fn)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = t.fn
        AND p.prosecdef
        AND array_to_string(COALESCE(p.proconfig, '{}'), ',') LIKE '%search_path=public%');
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'renormalize_and_policies: trigger shims lacking SECURITY DEFINER / search_path=public (their engine calls would fail for app users after the revokes): %', v_observed;
  END IF;
END $$;

-- 5d) policy shapes: exact per-table sets from pg_policies, plus the qual
--     essentials on every tightened write policy.
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  -- equipment: exactly one policy — SELECT, roles {public}, qual true
  SELECT string_agg(policyname || '/' || cmd || '/' || array_to_string(roles, '+') || '/' || COALESCE(qual, '~'),
                    '; ' ORDER BY policyname) INTO v_observed
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'equipment';
  IF v_observed IS DISTINCT FROM 'Equipment are viewable by everyone/SELECT/public/true' THEN
    RAISE EXCEPTION 'renormalize_and_policies: equipment policy set diverges: {%}', COALESCE(v_observed, 'none');
  END IF;

  -- exercise_equipment: SELECT-for-everyone + the three own-scope writes, nothing else
  SELECT string_agg(policyname || ':' || cmd, '; ' ORDER BY policyname) INTO v_observed
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exercise_equipment';
  IF v_observed IS DISTINCT FROM
     'exercise_equipment delete on own exercises:DELETE; exercise_equipment insert on own exercises:INSERT; exercise_equipment update on own exercises:UPDATE; exercise_equipment viewable by everyone:SELECT' THEN
    RAISE EXCEPTION 'renormalize_and_policies: exercise_equipment policy set diverges: {%}', COALESCE(v_observed, 'none');
  END IF;

  -- exercise_scoring_types: same shape, old wide-open names gone
  SELECT string_agg(policyname || ':' || cmd, '; ' ORDER BY policyname) INTO v_observed
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exercise_scoring_types';
  IF v_observed IS DISTINCT FROM
     'Exercise scoring types are viewable by everyone:SELECT; exercise_scoring_types delete on own exercises:DELETE; exercise_scoring_types insert on own exercises:INSERT; exercise_scoring_types update on own exercises:UPDATE' THEN
    RAISE EXCEPTION 'renormalize_and_policies: exercise_scoring_types policy set diverges: {%}', COALESCE(v_observed, 'none');
  END IF;

  -- exercise_aliases: SELECT + own-scope insert/update/delete + the wild carve-out
  SELECT string_agg(policyname || ':' || cmd, '; ' ORDER BY policyname) INTO v_observed
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exercise_aliases';
  IF v_observed IS DISTINCT FROM
     'aliases delete on own exercises:DELETE; aliases insert on own exercises:INSERT; aliases update on own exercises:UPDATE; aliases viewable by everyone:SELECT; wild aliases insertable by authenticated:INSERT' THEN
    RAISE EXCEPTION 'renormalize_and_policies: exercise_aliases policy set diverges: {%}', COALESCE(v_observed, 'none');
  END IF;

  -- every tightened write policy carries BOTH essentials (owner + non-official)
  -- in each expression it defines; the carve-out is exactly kind='wild'
  SELECT string_agg(tablename || '.' || policyname, '; ' ORDER BY tablename, policyname) INTO v_observed
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('exercise_equipment', 'exercise_scoring_types', 'exercise_aliases')
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
     AND policyname <> 'wild aliases insertable by authenticated'
     AND (roles IS DISTINCT FROM ARRAY['authenticated']::name[]
          OR COALESCE(qual, with_check) NOT LIKE '%created_by = auth.uid()%'
          OR COALESCE(qual, with_check) NOT LIKE '%is_official = false%'
          OR COALESCE(with_check, qual) NOT LIKE '%created_by = auth.uid()%'
          OR COALESCE(with_check, qual) NOT LIKE '%is_official = false%');
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'renormalize_and_policies: write policies missing the own-non-official essentials: %', v_observed;
  END IF;

  SELECT with_check INTO v_observed FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'exercise_aliases'
     AND policyname = 'wild aliases insertable by authenticated';
  IF v_observed IS DISTINCT FROM '(kind = ''wild''::text)' THEN
    RAISE EXCEPTION 'renormalize_and_policies: wild-alias carve-out WITH CHECK diverges: %', COALESCE(v_observed, 'null');
  END IF;

  -- exercises INSERT boundary: role + self-attribution + is_official=false,
  -- and exactly one INSERT policy (a second permissive policy would OR the
  -- hole right back open)
  SELECT string_agg(policyname || ' CHECK ' || COALESCE(with_check, '~'), '; ' ORDER BY policyname)
    INTO v_observed
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exercises' AND cmd = 'INSERT';
  IF v_observed IS DISTINCT FROM
     'Authenticated users can create own exercises CHECK ((auth.role() = ''authenticated''::text) AND (created_by = auth.uid()) AND (is_official = false))' THEN
    RAISE EXCEPTION 'renormalize_and_policies: exercises INSERT policy set diverges: {%}', COALESCE(v_observed, 'none');
  END IF;

  -- exercises UPDATE boundary: no WITH CHECK declared (USING doubles as the
  -- new-row check, keeping is_official immutable for users) and USING carries
  -- both essentials
  PERFORM 1 FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'exercises' AND cmd = 'UPDATE'
     AND policyname = 'Users can update own custom exercises'
     AND with_check IS NULL
     AND qual LIKE '%created_by = auth.uid()%'
     AND qual LIKE '%is_official = false%';
  IF NOT FOUND THEN
    SELECT string_agg(policyname || ' USING ' || COALESCE(qual, '~') || ' CHECK ' || COALESCE(with_check, '~'),
                      '; ' ORDER BY policyname) INTO v_observed
      FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exercises' AND cmd = 'UPDATE';
    RAISE EXCEPTION 'renormalize_and_policies: exercises UPDATE policy no longer pins officialness immutable: {%}',
      COALESCE(v_observed, 'none');
  END IF;
END $$;

-- 5e) behavioral: deleting a mid-tree derivation repairs its family (children
--     re-parent upward, tiers re-derive), an outlier delete is a no-op, and a
--     bulk delete settles in one pass. Fixture rows (RP- prefixed) are created
--     AND fully removed in-file, so the committed state is untouched and a
--     re-run starts clean (idempotent).
DO $$
DECLARE
  st_wide UUID; sy_alt UUID; gw_wide UUID;
  rp_core UUID; rp_a UUID; rp_b UUID; rp_c UUID; rp_out UUID;
  v_observed TEXT;
BEGIN
  SELECT id INTO st_wide FROM stances WHERE name = 'Wide (Sumo)';
  SELECT id INTO sy_alt  FROM symmetries WHERE name = 'Alternating';
  SELECT id INTO gw_wide FROM grips WHERE name = 'Wide' AND category = 'Width';
  IF st_wide IS NULL OR sy_alt IS NULL OR gw_wide IS NULL THEN
    RAISE EXCEPTION 'renormalize_and_policies 5e: dictionary rows missing (Wide (Sumo)=%, Alternating=%, Wide grip=%)',
      COALESCE(st_wide::text, 'null'), COALESCE(sy_alt::text, 'null'), COALESCE(gw_wide::text, 'null');
  END IF;

  -- Family: core; A = {Wide}; B = {Wide, Alternating} under A at tier 2.
  INSERT INTO exercises (name, slug, is_core, is_official)
    VALUES ('RPFIXTURECORE', 'rp-fixture-core', true, true) RETURNING id INTO rp_core;
  INSERT INTO exercises (name, slug, is_official, core_movement_id, stance_id)
    VALUES ('RPFIXTUREA', 'rp-fixture-a', true, rp_core, st_wide) RETURNING id INTO rp_a;
  INSERT INTO exercises (name, slug, is_official, core_movement_id, stance_id, symmetry_id)
    VALUES ('RPFIXTUREB', 'rp-fixture-b', true, rp_core, st_wide, sy_alt) RETURNING id INTO rp_b;
  IF (SELECT parent_exercise_id FROM exercises WHERE id = rp_b) IS DISTINCT FROM rp_a
     OR (SELECT tier FROM exercises WHERE id = rp_b) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'renormalize_and_policies 5e: starting shape wrong — B parent/tier = %/% (expected A/2)',
      COALESCE((SELECT parent_exercise_id FROM exercises WHERE id = rp_b)::text, 'null'),
      COALESCE((SELECT tier FROM exercises WHERE id = rp_b)::text, 'null');
  END IF;

  -- The gap under test: deleting A must leave B re-parented to the core at
  -- tier 1 (before this migration: parent NULL, tier stale at 2).
  DELETE FROM exercises WHERE id = rp_a;
  IF (SELECT parent_exercise_id FROM exercises WHERE id = rp_b) IS DISTINCT FROM rp_core
     OR (SELECT tier FROM exercises WHERE id = rp_b) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'renormalize_and_policies 5e: after deleting A, B parent/tier = %/% (expected core/1)',
      COALESCE((SELECT parent_exercise_id FROM exercises WHERE id = rp_b)::text, 'null'),
      COALESCE((SELECT tier FROM exercises WHERE id = rp_b)::text, 'null');
  END IF;

  -- Bulk delete: rebuild A and add C = {Wide, Alternating, Wide-Grip} (tier 3
  -- under B), then drop A AND B in ONE statement — C must settle at tier 1
  -- directly under the core in a single drain.
  INSERT INTO exercises (name, slug, is_official, core_movement_id, stance_id)
    VALUES ('RPFIXTUREA', 'rp-fixture-a', true, rp_core, st_wide) RETURNING id INTO rp_a;
  INSERT INTO exercises (name, slug, is_official, core_movement_id, stance_id, symmetry_id, grip_width_id)
    VALUES ('RPFIXTUREC', 'rp-fixture-c', true, rp_core, st_wide, sy_alt, gw_wide) RETURNING id INTO rp_c;
  IF (SELECT tier FROM exercises WHERE id = rp_c) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'renormalize_and_policies 5e: bulk fixture shape wrong — C tier = % (expected 3)',
      COALESCE((SELECT tier FROM exercises WHERE id = rp_c)::text, 'null');
  END IF;
  DELETE FROM exercises WHERE id IN (rp_a, rp_b);
  IF (SELECT parent_exercise_id FROM exercises WHERE id = rp_c) IS DISTINCT FROM rp_core
     OR (SELECT tier FROM exercises WHERE id = rp_c) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'renormalize_and_policies 5e: after bulk delete, C parent/tier = %/% (expected core/1)',
      COALESCE((SELECT parent_exercise_id FROM exercises WHERE id = rp_c)::text, 'null'),
      COALESCE((SELECT tier FROM exercises WHERE id = rp_c)::text, 'null');
  END IF;

  -- Outlier delete: coreless row — the trigger must find no family and do
  -- nothing (no drift anywhere, no errors).
  INSERT INTO exercises (name, slug, is_official)
    VALUES ('RPFIXTUREOUT', 'rp-fixture-out', true) RETURNING id INTO rp_out;
  DELETE FROM exercises WHERE id = rp_out;

  -- Full cleanup: child first, then the core; nothing RP- prefixed survives.
  DELETE FROM exercises WHERE id = rp_c;
  DELETE FROM exercises WHERE id = rp_core;
  IF EXISTS (SELECT 1 FROM exercises WHERE slug LIKE 'rp-fixture-%') THEN
    SELECT string_agg(slug, ', ' ORDER BY slug) INTO v_observed
      FROM exercises WHERE slug LIKE 'rp-fixture-%';
    RAISE EXCEPTION 'renormalize_and_policies 5e: fixture rows not cleaned up: %', v_observed;
  END IF;
END $$;
