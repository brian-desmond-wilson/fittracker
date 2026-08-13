-- A meal can be more than one kind of meal, and can be retired by hand.
-- Spec: docs/superpowers/specs/2026-08-13-meal-page-redesign-design.md
--
-- CATEGORIES. `meals.category` held exactly one of six values and did three
-- jobs: it grouped the library into shelves, it counted the tabs, and — the
-- consequential one — it decided which meals the recommender would consider in
-- the current eating window. A meal you would happily eat for lunch OR dinner
-- had to pick, and was then invisible to the other window for good.
--
-- A join table rather than an array column: the per-row CHECK below is
-- expressible, the pair is indexable, and adding a category is an insert rather
-- than a read-modify-write of the whole set.
--
-- `dessert` joins the set here. It existed only as a LOGGING SLOT
-- (meal_logs.meal_type) — a thing you could record having eaten but never file
-- a meal as.
--
-- `emergency` stays EXCLUSIVE, enforced by trigger below. It is deliberately
-- held out of ordinary suggestions (spec §5.3.6), and "this is an emergency
-- meal and also a breakfast" has no defined meaning for the recommender.
--
-- `meals.category` is NOT dropped. It becomes the PRIMARY category — the single
-- answer needed for the default logging slot — and its CHECK is widened to
-- accept 'dessert'.

CREATE TABLE IF NOT EXISTS public.meal_categories (
  meal_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN
    ('breakfast','lunch','dinner','snack','dessert','shake','emergency')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meal_id, category),
  -- Composite, matching meal_items: FK validation runs with RLS bypassed, so a
  -- plain meal_id could point at another user's meal while still satisfying
  -- this table's `with check (user_id = auth.uid())`.
  FOREIGN KEY (meal_id, user_id)
    REFERENCES public.meals(id, user_id) ON DELETE CASCADE
);

-- The read is "every meal in this category, for this user" — the shelf query.
CREATE INDEX IF NOT EXISTS idx_meal_categories_lookup
  ON public.meal_categories (user_id, category);

-- Widen the primary column's CHECK before the backfill can write 'dessert'
-- into it.
ALTER TABLE public.meals DROP CONSTRAINT IF EXISTS meals_category_check;
ALTER TABLE public.meals
  ADD CONSTRAINT meals_category_check CHECK (category IN
    ('breakfast','lunch','dinner','snack','dessert','shake','emergency'));

-- Backfill: one row per existing meal, from the category it already had. Its
-- existing category therefore stays primary, and nothing moves shelves on the
-- day this lands.
INSERT INTO public.meal_categories (meal_id, user_id, category)
SELECT id, user_id, category FROM public.meals
ON CONFLICT DO NOTHING;

-- Emergency is exclusive, and a meal must be filed somewhere. Enforced in a
-- trigger rather than a CHECK because both are statements about the SET of
-- rows for a meal, which a row-level constraint cannot see.
--
-- DEFERRABLE INITIALLY DEFERRED on the "at least one" half: replacing a meal's
-- categories is a delete-then-insert, which passes through zero rows in the
-- middle of the transaction. Checking at COMMIT lets the swap happen; checking
-- per statement would forbid it.
CREATE OR REPLACE FUNCTION public.meal_categories_check_set()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  target uuid := COALESCE(NEW.meal_id, OLD.meal_id);
  n_total integer;
  n_emergency integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE category = 'emergency')
    INTO n_total, n_emergency
    FROM public.meal_categories WHERE meal_id = target;

  -- The meal itself is gone (cascade): nothing left to be true about.
  IF NOT EXISTS (SELECT 1 FROM public.meals WHERE id = target) THEN
    RETURN NULL;
  END IF;

  IF n_total = 0 THEN
    RAISE EXCEPTION 'a meal must be filed under at least one category';
  END IF;

  IF n_emergency > 0 AND n_total > 1 THEN
    RAISE EXCEPTION 'emergency calories cannot be combined with another category';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS meal_categories_check_set ON public.meal_categories;
CREATE CONSTRAINT TRIGGER meal_categories_check_set
  AFTER INSERT OR UPDATE OR DELETE ON public.meal_categories
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.meal_categories_check_set();

ALTER TABLE public.meal_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meal_categories_select_own" ON public.meal_categories;
CREATE POLICY "meal_categories_select_own" ON public.meal_categories
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "meal_categories_insert_own" ON public.meal_categories;
CREATE POLICY "meal_categories_insert_own" ON public.meal_categories
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "meal_categories_update_own" ON public.meal_categories;
CREATE POLICY "meal_categories_update_own" ON public.meal_categories
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "meal_categories_delete_own" ON public.meal_categories;
CREATE POLICY "meal_categories_delete_own" ON public.meal_categories
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ARCHIVE. Retirement was computed and only computed — complete portion, out of
-- stock, idle long enough — so a meal could not be retired by hand and, worse,
-- could not be brought back. A meal is archived when this is set OR when the
-- retirement rule says so; setting it pins the meal to the archive, clearing it
-- hands the meal back to the automatic rule.
ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
