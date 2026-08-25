-- Block recommender: whole-workout daily composition. 2026-08-18.
-- Spec: docs/superpowers/specs/2026-08-18-daily-session-recommender-design.md §3, §7.

-- §3.1 Workout tags, AI-assigned at capture, user-editable.
ALTER TABLE public.captured_workouts
  ADD COLUMN IF NOT EXISTS block_roles TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS est_minutes INTEGER CHECK (est_minutes BETWEEN 1 AND 240),
  ADD COLUMN IF NOT EXISTS intensity TEXT CHECK (intensity IN ('low', 'moderate', 'high')),
  ADD COLUMN IF NOT EXISTS skill_level TEXT
    CHECK (skill_level IN ('Beginner', 'Intermediate', 'Advanced')),
  -- NULL = never classified; the recommender skips untagged workouts (spec §8).
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

-- Workout-level muscle tags (spec §3.1) — the workout's own story, not a
-- derivation from its exercises, because tags are editable.
CREATE TABLE IF NOT EXISTS public.captured_workout_muscles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_workout_id UUID NOT NULL
    REFERENCES public.captured_workouts(id) ON DELETE CASCADE,
  muscle_region_id UUID NOT NULL
    REFERENCES public.muscle_regions(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (captured_workout_id, muscle_region_id)
);
CREATE INDEX IF NOT EXISTS captured_workout_muscles_workout
  ON public.captured_workout_muscles (captured_workout_id);

-- §3.2 Usage ledger. Muscles are denormalized AT TIME OF PERFORMANCE so a
-- later retag doesn't rewrite training history.
CREATE TABLE IF NOT EXISTS public.captured_workout_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  captured_workout_id UUID NOT NULL
    REFERENCES public.captured_workouts(id) ON DELETE CASCADE,
  performed_date DATE NOT NULL,
  block TEXT NOT NULL
    CHECK (block IN ('warmup', 'mobility', 'main', 'conditioning', 'cooldown')),
  -- [{"name": "Chest", "isPrimary": true}, ...]
  muscles JSONB NOT NULL DEFAULT '[]',
  session_id UUID REFERENCES public.generated_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS captured_workout_usage_user_date
  ON public.captured_workout_usage (user_id, performed_date);

-- Block-level plan of a composed session. Items still explode into
-- generated_session_items for logging; built-in blocks have no item rows
-- (their movements are static app data, not exercises).
CREATE TABLE IF NOT EXISTS public.generated_session_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL
    REFERENCES public.generated_sessions(id) ON DELETE CASCADE,
  block TEXT NOT NULL
    CHECK (block IN ('warmup', 'mobility', 'main', 'conditioning', 'cooldown')),
  captured_workout_id UUID REFERENCES public.captured_workouts(id) ON DELETE SET NULL,
  builtin_key TEXT,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 240),
  rounds_note TEXT,
  reason TEXT,
  block_order INTEGER NOT NULL,
  CHECK (captured_workout_id IS NOT NULL OR builtin_key IS NOT NULL),
  UNIQUE (session_id, block)
);
CREATE INDEX IF NOT EXISTS generated_session_blocks_session
  ON public.generated_session_blocks (session_id);

-- §7 Sections migration: mobility joins the vocabulary; conditioning reuses
-- the existing accessory slot; old rows untouched.
ALTER TABLE public.generated_session_items
  DROP CONSTRAINT IF EXISTS generated_session_items_section_check;
ALTER TABLE public.generated_session_items
  ADD CONSTRAINT generated_session_items_section_check
  CHECK (section IN ('warmup', 'mobility', 'main', 'accessory', 'bfr', 'cooldown'));

ALTER TABLE public.captured_workout_muscles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captured_workout_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_session_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own workout muscles" ON public.captured_workout_muscles;
CREATE POLICY "Users manage own workout muscles"
  ON public.captured_workout_muscles FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.captured_workouts w
    WHERE w.id = captured_workout_id AND w.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.captured_workouts w
    WHERE w.id = captured_workout_id AND w.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own workout usage" ON public.captured_workout_usage;
CREATE POLICY "Users manage own workout usage"
  ON public.captured_workout_usage FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own session blocks" ON public.generated_session_blocks;
CREATE POLICY "Users manage own session blocks"
  ON public.generated_session_blocks FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.generated_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.generated_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()));

COMMENT ON TABLE public.captured_workout_usage IS
  'One row per catalog workout actually performed: powers coverage, variety, and the future exercise-level engine.';
