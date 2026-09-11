-- Format (how a captured workout runs) and Score (what is recorded), plus the
-- minutes a time-defined format is built on. All nullable: the classifier
-- fills them and the lazy backfill reaches the existing library over a few
-- loads. Spec: docs/superpowers/specs/2026-09-10-workout-format-and-score-design.md
ALTER TABLE public.captured_workouts
  ADD COLUMN IF NOT EXISTS format text
    CONSTRAINT captured_workouts_format_check
    CHECK (format IN ('sets_reps','rounds','amrap','emom','for_time','intervals','chipper','ladder')),
  ADD COLUMN IF NOT EXISTS score_type text
    CONSTRAINT captured_workouts_score_type_check
    CHECK (score_type IN ('reps','rounds_reps','load','time','distance','calories','duration','quality','height','none')),
  ADD COLUMN IF NOT EXISTS format_minutes integer
    CONSTRAINT captured_workouts_format_minutes_check
    CHECK (format_minutes BETWEEN 1 AND 240);

COMMENT ON COLUMN public.captured_workouts.format IS
  'How the workout runs; will drive the live layout. NULL = not yet classified.';
COMMENT ON COLUMN public.captured_workouts.score_type IS
  'What is recorded when the workout is done. NULL = not yet classified.';
COMMENT ON COLUMN public.captured_workouts.format_minutes IS
  'The minutes a time-defined format is built on (AMRAP cap, EMOM length, For-time cap, interval total). Not the duration estimate in est_minutes.';
