-- What the recommender suggested, and whether you took it. 2026-08-12.
--
-- Eat Next is recomputed on every surface and every focus, shown, and thrown
-- away. Nothing anywhere records what it proposed — so there is no way to ask
-- the only question that would improve it: are its suggestions any good?
-- Acceptance rate, per context and per meal, cannot be computed from data that
-- was never written down.
--
-- Deliberately NOT a row per render. The engine recomputes constantly — every
-- focus, every log, every tab switch — and logging each one would produce
-- thousands of rows a week describing nothing but how often the screen was
-- looked at. The unique index below collapses a day's repeats of the same
-- (context, meal, rank) to ONE row, which is the grain that actually carries
-- information: "on this day, in this situation, this meal was offered".
--
-- `acted_at` is stamped when that meal is subsequently logged. Null therefore
-- means "offered and not taken (yet)", which is exactly the signal a future
-- acceptance-rate read needs, and it costs one update on a path that is
-- already writing.
CREATE TABLE IF NOT EXISTS public.eat_next_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Local calendar date, matching how meal_logs dates its rows.
  suggested_on DATE NOT NULL,
  context TEXT NOT NULL,
  meal_id UUID REFERENCES public.meals(id) ON DELETE CASCADE,
  meal_name TEXT NOT NULL,
  -- 0-based position in the recommendation list; 0 is the headline.
  rank INTEGER NOT NULL,
  -- The stock verdict at the moment of suggesting, so a later analysis can ask
  -- whether un-makeable suggestions are the ones being ignored.
  assemblable BOOLEAN,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS eat_next_suggestions_daily_unique
  ON public.eat_next_suggestions (user_id, suggested_on, context, meal_id, rank);

CREATE INDEX IF NOT EXISTS eat_next_suggestions_user_day
  ON public.eat_next_suggestions (user_id, suggested_on);

ALTER TABLE public.eat_next_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own suggestions" ON public.eat_next_suggestions;
CREATE POLICY "Users can view their own suggestions"
  ON public.eat_next_suggestions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own suggestions" ON public.eat_next_suggestions;
CREATE POLICY "Users can insert their own suggestions"
  ON public.eat_next_suggestions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own suggestions" ON public.eat_next_suggestions;
CREATE POLICY "Users can update their own suggestions"
  ON public.eat_next_suggestions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.eat_next_suggestions IS
  'One row per (day, context, meal, rank) the recommender offered. acted_at is set when that meal is logged; null means offered and not taken.';
