-- Daily Training: record the creator's programming as the creator stated it.
-- 2026-08-16.
--
-- The first cut could only say "N sets x M reps per exercise". A caption like
--   - 8x Halos
--   - 8R/8L Rotational Offset Presses
--   REPEAT 3-4x rounds
-- has no per-exercise set count at all: it is one circuit of four movements,
-- repeated 3-4 times. Flattening that into "3 sets of 8" changes the workout
-- and silently drops the range, so the shape below keeps rounds where they
-- belong (on the workout) and leaves per-exercise sets NULL when the creator
-- never prescribed any.
--
-- raw_protocol keeps the caption's prescription lines verbatim. Parsing is
-- lossy by nature; the words the creator wrote are the ground truth we can
-- always fall back to, and what the Phase-2 recommender should show when it
-- serves a captured workout whole.

ALTER TABLE public.captured_workouts
  -- TEXT, not INTEGER: "3-4" and "AMRAP 20 min" are both real answers.
  ADD COLUMN IF NOT EXISTS rounds TEXT,
  ADD COLUMN IF NOT EXISTS raw_protocol TEXT;

ALTER TABLE public.captured_workout_exercises
  -- Both TEXT for the same reason target_reps is: "24kg", "bodyweight",
  -- "2x24kg", "30-45s", "hold to failure".
  ADD COLUMN IF NOT EXISTS target_weight TEXT,
  ADD COLUMN IF NOT EXISTS target_duration TEXT;

COMMENT ON COLUMN public.captured_workouts.rounds IS
  'How many times through the whole list, as the creator said it ("3-4"). NULL when the caption prescribes per-exercise sets instead.';
COMMENT ON COLUMN public.captured_workouts.raw_protocol IS
  'The caption''s prescription lines, verbatim. The lossless record behind the parsed items.';
COMMENT ON COLUMN public.captured_workout_exercises.target_sets IS
  'Per-exercise sets. NULL for circuit-style workouts — see captured_workouts.rounds. Never inferred.';
