-- Daily Training Phase 1: social-media capture catalog. 2026-08-16.
-- Spec: docs/superpowers/specs/2026-08-16-daily-training-design.md §3.
--
-- captured_sources is the provenance record: one row per shared post. The
-- exercises themselves live in the existing unified `exercises` table; the
-- source_exercises junction is what makes an exercise "captured". A post that
-- contains a full workout ADDITIONALLY gets a captured_workouts row preserving
-- the creator's programming, servable whole by the Phase-2 recommender.

CREATE TABLE IF NOT EXISTS public.captured_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'other')),
  -- The tap-back link. Unique per user so a re-shared post surfaces the
  -- existing capture instead of re-processing.
  source_url TEXT NOT NULL,
  poster_handle TEXT,
  caption_text TEXT,
  -- Rehosted into the capture-thumbs bucket, never hot-linked (the source
  -- CDN's URL is exactly the kind that vanishes).
  thumbnail_url TEXT,
  -- The AI's full output, for audit and for retry-after-failure.
  raw_extraction JSONB,
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'reviewed', 'failed')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS captured_sources_user_url_unique
  ON public.captured_sources (user_id, source_url);

CREATE TABLE IF NOT EXISTS public.source_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.captured_sources(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  -- TRUE when this capture created the exercise row; FALSE when the AI
  -- matched an existing library entry and we only linked it.
  was_created BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS source_exercises_exercise
  ON public.source_exercises (exercise_id);

CREATE TABLE IF NOT EXISTS public.captured_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.captured_sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.captured_workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_workout_id UUID NOT NULL REFERENCES public.captured_workouts(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  exercise_order INTEGER NOT NULL,
  target_sets INTEGER,
  -- TEXT, matching wod_movements: rep schemes like '21-15-9' or '8-12'.
  target_reps TEXT,
  rest_seconds INTEGER,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS captured_workout_exercises_workout
  ON public.captured_workout_exercises (captured_workout_id);

ALTER TABLE public.captured_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captured_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captured_workout_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own captured sources" ON public.captured_sources;
CREATE POLICY "Users manage own captured sources"
  ON public.captured_sources FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- source_exercises has no user_id of its own; ownership flows through the
-- parent source row.
DROP POLICY IF EXISTS "Users manage own source links" ON public.source_exercises;
CREATE POLICY "Users manage own source links"
  ON public.source_exercises FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.captured_sources s
    WHERE s.id = source_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.captured_sources s
    WHERE s.id = source_id AND s.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users manage own captured workouts" ON public.captured_workouts;
CREATE POLICY "Users manage own captured workouts"
  ON public.captured_workouts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own captured workout items" ON public.captured_workout_exercises;
CREATE POLICY "Users manage own captured workout items"
  ON public.captured_workout_exercises FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.captured_workouts w
    WHERE w.id = captured_workout_id AND w.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.captured_workouts w
    WHERE w.id = captured_workout_id AND w.user_id = auth.uid()
  ));

COMMENT ON TABLE public.captured_sources IS
  'One row per social post shared into the app. Exercises live in exercises; source_exercises links them.';
