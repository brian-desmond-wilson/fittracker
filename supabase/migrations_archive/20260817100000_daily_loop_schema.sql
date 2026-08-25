-- Daily Training Phase 2: the daily loop. 2026-08-17.
-- Spec: docs/superpowers/specs/2026-08-16-daily-training-design.md §3.1.

-- ---- Gyms: context, not content. One active at a time. ----
CREATE TABLE IF NOT EXISTS public.gym_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  preset TEXT NOT NULL DEFAULT 'custom'
    CHECK (preset IN ('full_gym', 'hotel_gym', 'bodyweight', 'custom')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gym_profiles_one_active
  ON public.gym_profiles (user_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.gym_profile_equipment (
  gym_profile_id UUID NOT NULL REFERENCES public.gym_profiles(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  PRIMARY KEY (gym_profile_id, equipment_id)
);

-- BFR bands travel with the user, not with a gym.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bfr_bands_available BOOLEAN NOT NULL DEFAULT false;

-- ---- Daily check-in: the recommender's morning inputs. ----
CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 10),
  minutes_available INTEGER NOT NULL DEFAULT 120 CHECK (minutes_available > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, checkin_date)
);

CREATE TABLE IF NOT EXISTS public.daily_checkin_soreness (
  checkin_id UUID NOT NULL REFERENCES public.daily_checkins(id) ON DELETE CASCADE,
  muscle_region_id UUID NOT NULL REFERENCES public.muscle_regions(id) ON DELETE CASCADE,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 3),
  PRIMARY KEY (checkin_id, muscle_region_id)
);

-- ---- Generated sessions: the recommender's output and its memory. ----
CREATE TABLE IF NOT EXISTS public.generated_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  gym_profile_id UUID REFERENCES public.gym_profiles(id) ON DELETE SET NULL,
  checkin_id UUID REFERENCES public.daily_checkins(id) ON DELETE SET NULL,
  split_day TEXT NOT NULL CHECK (split_day IN ('push', 'pull', 'legs')),
  ramp_week INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai', 'rules_fallback')),
  served_captured_workout_id UUID REFERENCES public.captured_workouts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'accepted', 'completed', 'skipped')),
  workout_instance_id UUID REFERENCES public.workout_instances(id) ON DELETE SET NULL,
  -- What the AI was handed, verbatim, for audit.
  inputs_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_date)
);

CREATE TABLE IF NOT EXISTS public.generated_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.generated_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL,
  section TEXT NOT NULL
    CHECK (section IN ('warmup', 'main', 'accessory', 'bfr', 'cooldown')),
  target_sets INTEGER,
  target_reps TEXT,
  rest_seconds INTEGER,
  -- The model's one-line contribution beyond the assignment itself.
  reason TEXT,
  -- Backfilled on completion: the suggested-vs-performed log
  -- (mirrors eat_next_suggestions.acted_at).
  was_performed BOOLEAN
);
CREATE INDEX IF NOT EXISTS generated_session_items_session
  ON public.generated_session_items (session_id);

-- ---- Learn-as-you-go skill levels (read in Phase 2, written in Phase 3). ----
CREATE TABLE IF NOT EXISTS public.exercise_skill_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  current_level TEXT NOT NULL DEFAULT 'beginner'
    CHECK (current_level IN ('beginner', 'intermediate', 'advanced')),
  consecutive_too_easy INTEGER NOT NULL DEFAULT 0,
  last_rating TEXT CHECK (last_rating IN ('too_easy', 'right', 'too_hard')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id)
);

-- ---- RLS: owner-only, the Phase-1 pattern. ----
ALTER TABLE public.gym_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_profile_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_checkin_soreness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_skill_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own gyms" ON public.gym_profiles;
CREATE POLICY "own gyms" ON public.gym_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own gym equipment" ON public.gym_profile_equipment;
CREATE POLICY "own gym equipment" ON public.gym_profile_equipment FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gym_profiles g
    WHERE g.id = gym_profile_id AND g.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.gym_profiles g
    WHERE g.id = gym_profile_id AND g.user_id = auth.uid()));

DROP POLICY IF EXISTS "own checkins" ON public.daily_checkins;
CREATE POLICY "own checkins" ON public.daily_checkins FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own soreness" ON public.daily_checkin_soreness;
CREATE POLICY "own soreness" ON public.daily_checkin_soreness FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_checkins c
    WHERE c.id = checkin_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.daily_checkins c
    WHERE c.id = checkin_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "own sessions" ON public.generated_sessions;
CREATE POLICY "own sessions" ON public.generated_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own session items" ON public.generated_session_items;
CREATE POLICY "own session items" ON public.generated_session_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.generated_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.generated_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "own skill state" ON public.exercise_skill_state;
CREATE POLICY "own skill state" ON public.exercise_skill_state FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
