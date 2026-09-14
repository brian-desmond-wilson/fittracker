-- One score per served-whole daily session, in the workout's own units.
-- Spec: docs/superpowers/specs/2026-09-13-session-score-capture-design.md §5.1
--
-- Shaped like session_debriefs: one row per generated session, owned by the
-- user, cascaded away with the session. workout_id is denormalised from the
-- session's served_captured_workout_id so the workout page reads its scores
-- in one query. value_a carries rounds | seconds | reps | lb | m | cal | in
-- by score_type; value_b is the partial reps of a rounds_reps score and
-- nothing else; quality is the word for a quality score and nothing else.
CREATE TABLE IF NOT EXISTS public.session_scores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL UNIQUE REFERENCES public.generated_sessions(id) ON DELETE CASCADE,
  workout_id  uuid NOT NULL REFERENCES public.captured_workouts(id) ON DELETE CASCADE,
  score_type  text NOT NULL CHECK (score_type IN
    ('reps','rounds_reps','load','time','distance','calories','duration','quality','height')),
  value_a     integer,
  value_b     integer,
  quality     text CHECK (quality IN ('rough','solid','crisp')),
  capped      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_scores_value_shape CHECK (
    (score_type = 'quality' AND quality IS NOT NULL AND value_a IS NULL AND value_b IS NULL) OR
    (score_type = 'rounds_reps' AND value_a IS NOT NULL AND value_b IS NOT NULL AND quality IS NULL) OR
    (score_type NOT IN ('quality','rounds_reps') AND value_a IS NOT NULL AND value_b IS NULL AND quality IS NULL)
  ),
  CONSTRAINT session_scores_capped_is_time CHECK (capped = false OR score_type = 'time')
);

CREATE INDEX IF NOT EXISTS session_scores_workout_idx
  ON public.session_scores (user_id, workout_id);

ALTER TABLE public.session_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own scores" ON public.session_scores
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.session_scores IS
  'The score a person recorded for one served-whole daily session, in the workout''s score_type units. value_a/value_b/quality by type; capped only on time.';
