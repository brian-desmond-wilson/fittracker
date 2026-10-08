-- 20261009100000_rls_tighten_catalog_writes.sql
-- RLS audit 2026-10-09 (see rls-audit-report.md): every table already has RLS
-- on and every per-user table is owner-scoped. What the audit found is five
-- shared-catalog tables whose INSERT/UPDATE/DELETE policies are USING (true)
-- / WITH CHECK (true) for any signed-in user, plus one table whose policies
-- compare user_id to a hard-coded uuid that is nobody.
--
--   1) exercise_muscle_regions, exercise_goal_types: the app writes these
--      from the client when a user creates their own exercise (frontDoor.ts),
--      so the write policies are scoped the way 20260910100000 scoped
--      exercise_equipment / exercise_scoring_types / exercise_aliases — rows
--      that hang off the caller's own NON-official exercise. Official catalog
--      rows become read-only to clients; curation keeps going through the
--      service role (SQL editor, edge functions), which bypasses RLS.
--   2) exercise_standards, movement_measurement_profiles,
--      movement_scaling_links: the client never writes them (grep: zero
--      insert/upsert/update/delete calls), so the write policies go. Reads
--      are unchanged.
--   3) todos: the four policies compared user_id to
--      '3a6c86e7-7cbd-4cf1-adc6-a6fa1acf3d92', which matches no auth.users
--      row (the table is unused and empty). Rewritten to auth.uid().
--
-- SELECT policies are untouched here; anon's catalog read access is the
-- subject of the separate, optional 20261009110000_revoke_anon.sql.
-- Idempotent: every CREATE is preceded by DROP POLICY IF EXISTS.

-- ============================================================================
-- 1) Own-non-official scope for the two junctions the app writes.
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert exercise muscle regions" ON public.exercise_muscle_regions;
DROP POLICY IF EXISTS "Authenticated users can update exercise muscle regions" ON public.exercise_muscle_regions;
DROP POLICY IF EXISTS "Authenticated users can delete exercise muscle regions" ON public.exercise_muscle_regions;
DROP POLICY IF EXISTS "exercise_muscle_regions insert on own exercises" ON public.exercise_muscle_regions;
CREATE POLICY "exercise_muscle_regions insert on own exercises" ON public.exercise_muscle_regions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e
                       WHERE e.id = exercise_muscle_regions.exercise_id
                         AND e.created_by = auth.uid() AND e.is_official = false));
DROP POLICY IF EXISTS "exercise_muscle_regions update on own exercises" ON public.exercise_muscle_regions;
CREATE POLICY "exercise_muscle_regions update on own exercises" ON public.exercise_muscle_regions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e
                  WHERE e.id = exercise_muscle_regions.exercise_id
                    AND e.created_by = auth.uid() AND e.is_official = false))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e
                       WHERE e.id = exercise_muscle_regions.exercise_id
                         AND e.created_by = auth.uid() AND e.is_official = false));
DROP POLICY IF EXISTS "exercise_muscle_regions delete on own exercises" ON public.exercise_muscle_regions;
CREATE POLICY "exercise_muscle_regions delete on own exercises" ON public.exercise_muscle_regions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e
                  WHERE e.id = exercise_muscle_regions.exercise_id
                    AND e.created_by = auth.uid() AND e.is_official = false));

DROP POLICY IF EXISTS "Allow authenticated users to insert exercise_goal_types" ON public.exercise_goal_types;
DROP POLICY IF EXISTS "Allow authenticated users to update exercise_goal_types" ON public.exercise_goal_types;
DROP POLICY IF EXISTS "Allow authenticated users to delete exercise_goal_types" ON public.exercise_goal_types;
DROP POLICY IF EXISTS "exercise_goal_types insert on own exercises" ON public.exercise_goal_types;
CREATE POLICY "exercise_goal_types insert on own exercises" ON public.exercise_goal_types
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e
                       WHERE e.id = exercise_goal_types.exercise_id
                         AND e.created_by = auth.uid() AND e.is_official = false));
DROP POLICY IF EXISTS "exercise_goal_types update on own exercises" ON public.exercise_goal_types;
CREATE POLICY "exercise_goal_types update on own exercises" ON public.exercise_goal_types
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e
                  WHERE e.id = exercise_goal_types.exercise_id
                    AND e.created_by = auth.uid() AND e.is_official = false))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e
                       WHERE e.id = exercise_goal_types.exercise_id
                         AND e.created_by = auth.uid() AND e.is_official = false));
DROP POLICY IF EXISTS "exercise_goal_types delete on own exercises" ON public.exercise_goal_types;
CREATE POLICY "exercise_goal_types delete on own exercises" ON public.exercise_goal_types
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e
                  WHERE e.id = exercise_goal_types.exercise_id
                    AND e.created_by = auth.uid() AND e.is_official = false));

-- ============================================================================
-- 2) Read-only to clients: the three catalog tables nothing in the app writes.
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert exercise standards" ON public.exercise_standards;
DROP POLICY IF EXISTS "Authenticated users can update exercise standards" ON public.exercise_standards;
DROP POLICY IF EXISTS "Authenticated users can delete exercise standards" ON public.exercise_standards;

DROP POLICY IF EXISTS "Authenticated users can insert measurement profiles" ON public.movement_measurement_profiles;
DROP POLICY IF EXISTS "Authenticated users can update measurement profiles" ON public.movement_measurement_profiles;
DROP POLICY IF EXISTS "Authenticated users can delete measurement profiles" ON public.movement_measurement_profiles;

DROP POLICY IF EXISTS "Authenticated users can insert scaling links" ON public.movement_scaling_links;
DROP POLICY IF EXISTS "Authenticated users can update scaling links" ON public.movement_scaling_links;
DROP POLICY IF EXISTS "Authenticated users can delete scaling links" ON public.movement_scaling_links;

-- ============================================================================
-- 3) todos: the caller, not a hard-coded uuid.
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own todos"   ON public.todos;
DROP POLICY IF EXISTS "Users can insert own todos" ON public.todos;
DROP POLICY IF EXISTS "Users can update own todos" ON public.todos;
DROP POLICY IF EXISTS "Users can delete own todos" ON public.todos;
DROP POLICY IF EXISTS "own todos" ON public.todos;
CREATE POLICY "own todos" ON public.todos
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
