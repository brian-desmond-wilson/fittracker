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
-- Schema/policy only — hand-written, idempotent (fresh / half-applied /
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
-- 2) Policy pass. Drop-and-recreate by name keeps every branch idempotent and
--    pins the exact final shape regardless of the starting state.
-- ============================================================================

-- 2a) equipment dictionary: align with the sibling dictionaries — SELECT for
--     everyone (the old policy was TO authenticated; anon embeds came back
--     null, Task 3 finding).
DROP POLICY IF EXISTS "Equipment are viewable by everyone" ON public.equipment;
CREATE POLICY "Equipment are viewable by everyone" ON public.equipment
  FOR SELECT USING (true);

-- 2b) exercise_equipment: replace the all-true ALL policy with per-command
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

-- 2c) exercise_scoring_types: replace the three all-true per-command policies
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

-- 2d) exercise_aliases: replace the all-true ALL policy. Non-wild INSERT and
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

-- ============================================================================
-- 3) Self-verify (fail closed, observed values). Structural only: an in-file
--    functional re-normalization test would mutate the live dictionary, so the
--    behavioral proof lives in the harness (V11) fixture, which rolls back.
-- ============================================================================

-- 3a) re-normalization engine wired: statement-level AFTER trigger on all
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

-- 3b) policy shapes: exact per-table sets from pg_policies, plus the qual
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
END $$;
