-- A meal can do more than one job.
--
-- `meals.role` held at most ONE of five values, and the recommender reads it to
-- decide which meals it will even consider when it is looking for a specific
-- job — a pre-workout window, a post-workout window, a shortfall to make up.
-- A shake that is genuinely both a post-workout meal AND a calorie booster had
-- to pick one, and was then invisible to the other question for good. This is
-- the same failure `meal_categories` fixed for shelves, one field over.
--
-- A join table rather than an array column, for the same three reasons as
-- categories: the per-row CHECK is expressible, the pair is indexable, and
-- adding a role is an insert rather than a read-modify-write of the whole set.
--
-- TWO THINGS ARE DELIBERATELY ABSENT that categories has. There is no
-- "at least one" rule — role is optional and the empty set is the common case,
-- which is why the constraint trigger categories needs has no counterpart here.
-- And there is no PRIMARY role: `meals.category` survived because the default
-- logging slot needs exactly one answer, whereas nothing anywhere asks "what is
-- THE role of this meal" — every reader asks whether a given role is among
-- them. `meals.role` is therefore kept in sync with the first of the set purely
-- so anything still reading the old column sees something sane; no reader in
-- the app consults it after this migration, and it can be dropped once no
-- deployed build does either.

CREATE TABLE IF NOT EXISTS public.meal_roles (
  meal_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN
    ('pre_workout','post_workout','bridge','calorie_booster','emergency_catchup')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meal_id, role),
  -- Composite, matching meal_categories and meal_items: FK validation runs with
  -- RLS bypassed, so a plain meal_id could point at another user's meal while
  -- still satisfying this table's `with check (user_id = auth.uid())`.
  FOREIGN KEY (meal_id, user_id)
    REFERENCES public.meals(id, user_id) ON DELETE CASCADE
);

-- The read is "every meal that can do this job, for this user" — the question
-- the recommender asks at the top of each window.
CREATE INDEX IF NOT EXISTS idx_meal_roles_lookup
  ON public.meal_roles (user_id, role);

-- Backfill: one row per meal that already had a role. Meals with none stay
-- with none, so no meal starts answering a question it did not answer before.
INSERT INTO public.meal_roles (meal_id, user_id, role)
SELECT id, user_id, role FROM public.meals WHERE role IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.meal_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meal_roles_select_own" ON public.meal_roles;
CREATE POLICY "meal_roles_select_own" ON public.meal_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "meal_roles_insert_own" ON public.meal_roles;
CREATE POLICY "meal_roles_insert_own" ON public.meal_roles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "meal_roles_update_own" ON public.meal_roles;
CREATE POLICY "meal_roles_update_own" ON public.meal_roles
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "meal_roles_delete_own" ON public.meal_roles;
CREATE POLICY "meal_roles_delete_own" ON public.meal_roles
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Replacing a meal's roles in ONE transaction.
--
-- Unlike `set_meal_categories` this is not forced by a constraint — every
-- intermediate state here is legal. It exists so a half-applied edit cannot
-- survive: from the client a delete and an insert are two HTTP calls, and a
-- failure between them would leave the meal advertising the roles it used to
-- have and none of the ones just chosen. Clearing every role is a legitimate
-- edit, so an empty array is accepted rather than refused.
--
-- SECURITY INVOKER (the default): RLS still applies, so this can only ever
-- rewrite the caller's own meal. The `user_id` written comes from the meal row
-- itself rather than from the client.
CREATE OR REPLACE FUNCTION public.set_meal_roles(
  p_meal_id uuid,
  p_roles text[]
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  owner uuid;
  roles text[] := COALESCE(p_roles, ARRAY[]::text[]);
BEGIN
  -- RLS-filtered: a meal that is not the caller's is simply not found here.
  SELECT user_id INTO owner FROM public.meals WHERE id = p_meal_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'meal not found';
  END IF;

  DELETE FROM public.meal_roles
    WHERE meal_id = p_meal_id
      AND role <> ALL (roles);

  INSERT INTO public.meal_roles (meal_id, user_id, role)
  SELECT p_meal_id, owner, r FROM unnest(roles) AS r
  ON CONFLICT (meal_id, role) DO NOTHING;

  -- The legacy single-role column, kept sane rather than kept authoritative —
  -- see the header. Callers pass the set in display order, so this lands on
  -- whichever role sits first in the rail.
  UPDATE public.meals
    SET role = CASE WHEN array_length(roles, 1) IS NULL THEN NULL ELSE roles[1] END,
        updated_at = now()
    WHERE id = p_meal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_meal_roles(uuid, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.set_meal_roles(uuid, text[]) TO authenticated;
