-- Daily Training Phase 3: per-movement ratings + progression chains.
-- Spec: docs/superpowers/specs/2026-08-16-daily-training-design.md §5.5.

-- ---- One rating per movement per session: the audit trail behind
-- ---- exercise_skill_state, and how the UI knows a session is already rated.
CREATE TABLE IF NOT EXISTS public.movement_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.generated_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('too_easy', 'right', 'too_hard')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, exercise_id)
);
CREATE INDEX IF NOT EXISTS movement_ratings_session
  ON public.movement_ratings (session_id);

ALTER TABLE public.movement_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own movement ratings" ON public.movement_ratings;
CREATE POLICY "own movement ratings" ON public.movement_ratings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---- Seed movement_scaling_links. The 2025-10 seed matched zero names; the
-- ---- table is empty on the live DB (verified 2026-08-20). These chains use
-- ---- the catalog's actual names. Each link gets its mirror regression.
DO $$
DECLARE
  chain TEXT[][] := ARRAY[
    -- [easier, harder] pairs; display_order 1 throughout (primary chain).
    ARRAY['Ring Rows', 'Pull-Up'],
    ARRAY['Pull-Up', 'Wide Grip Pull Ups'],
    ARRAY['Wide Grip Pull Ups', 'Bar Muscle-Up'],
    ARRAY['Push-up', 'Dip'],
    ARRAY['Air Squat', 'Dumbbell Goblet Squat'],
    ARRAY['Dumbbell Goblet Squat', 'Front Squat'],
    ARRAY['Front Squat', 'Back Squat'],
    ARRAY['Kettlebell Swing', 'Kettlebell Hang Snatch'],
    ARRAY['Hang Clean', 'Clean'],
    ARRAY['Clean', 'Power Clean'],
    ARRAY['Sit-Up', 'V-Ups'],
    ARRAY['V-Ups', 'Toes-to-Bar'],
    ARRAY['Lunge', 'Jumping Split Lunges']
  ];
  pair TEXT[];
  easier_id UUID;
  harder_id UUID;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY chain LOOP
    SELECT id INTO easier_id FROM public.exercises WHERE trim(name) ILIKE pair[1] LIMIT 1;
    SELECT id INTO harder_id FROM public.exercises WHERE trim(name) ILIKE pair[2] LIMIT 1;
    IF easier_id IS NOT NULL AND harder_id IS NOT NULL THEN
      INSERT INTO public.movement_scaling_links
        (from_exercise_id, to_exercise_id, scaling_type, difficulty_delta, display_order)
      SELECT easier_id, harder_id, 'progression', 1, 1
      WHERE NOT EXISTS (
        SELECT 1 FROM public.movement_scaling_links
        WHERE from_exercise_id = easier_id AND to_exercise_id = harder_id
          AND scaling_type = 'progression'
      );
      INSERT INTO public.movement_scaling_links
        (from_exercise_id, to_exercise_id, scaling_type, difficulty_delta, display_order)
      SELECT harder_id, easier_id, 'regression', -1, 1
      WHERE NOT EXISTS (
        SELECT 1 FROM public.movement_scaling_links
        WHERE from_exercise_id = harder_id AND to_exercise_id = easier_id
          AND scaling_type = 'regression'
      );
    END IF;
  END LOOP;
END $$;

-- Secondary regression for Pull-Up (Inverted Row also exists in the catalog).
DO $$
DECLARE a UUID; b UUID;
BEGIN
  SELECT id INTO a FROM public.exercises WHERE trim(name) ILIKE 'Inverted Row' LIMIT 1;
  SELECT id INTO b FROM public.exercises WHERE trim(name) ILIKE 'Pull-Up' LIMIT 1;
  IF a IS NOT NULL AND b IS NOT NULL THEN
    INSERT INTO public.movement_scaling_links
      (from_exercise_id, to_exercise_id, scaling_type, difficulty_delta, display_order)
    SELECT a, b, 'progression', 1, 2
    WHERE NOT EXISTS (
      SELECT 1 FROM public.movement_scaling_links
      WHERE from_exercise_id = a AND to_exercise_id = b AND scaling_type = 'progression'
    );
  END IF;
END $$;
