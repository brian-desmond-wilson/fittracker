-- Block recommender, hardening pass. 2026-08-18.
-- Follows 20260818100000_block_recommender.sql; all three tables are still
-- empty, so every ALTER here is a no-op against real data.

-- ---- Deleting a captured workout must not abort. ----
--
-- ON DELETE SET NULL runs an UPDATE, and CHECK is enforced on UPDATE, so the
-- old "one of the two is NOT NULL" check turned every catalog-workout block
-- into a lock on its workout: the delete would fail outright, contradicting
-- deleteCapturedWorkout's promise that a session survives with its link
-- cleared. The block's name is stored on the row instead, so the day you
-- trained still reads correctly after the workout is gone.
ALTER TABLE public.generated_session_blocks
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.generated_session_blocks
  ALTER COLUMN name DROP DEFAULT;

-- The remaining rule is mutual exclusion, not presence: a block is a catalog
-- workout or a built-in, never both. Both NULL is the deleted-workout case —
-- named history with nothing left to link to.
ALTER TABLE public.generated_session_blocks
  DROP CONSTRAINT IF EXISTS generated_session_blocks_check;
ALTER TABLE public.generated_session_blocks
  ADD CONSTRAINT generated_session_blocks_source_exclusive
  CHECK (captured_workout_id IS NULL OR builtin_key IS NULL);

-- block_order said nothing that block didn't: the five roles have one fixed
-- order, UNIQUE (session_id, block) already forbids repeats, and a stored
-- integer can only drift out of step with the role it duplicates.
ALTER TABLE public.generated_session_blocks
  DROP COLUMN IF EXISTS block_order;

-- ---- The usage ledger. ----
--
-- Completion is not the only writer — a retried completion is another — and a
-- duplicate row would double-weight that workout's muscles in the 7-day
-- coverage arithmetic, skewing tomorrow's recommendation with no error to
-- show for it.
ALTER TABLE public.captured_workout_usage
  ADD CONSTRAINT captured_workout_usage_unique_performance
  UNIQUE (user_id, captured_workout_id, performed_date, block);

-- Deleting a workout must not delete the training. CASCADE erased exactly the
-- history the denormalized muscles column exists to preserve. Recency still
-- works with the id gone, because a deleted workout can never be picked again.
-- (NULLs compare distinct, so the constraint above dedupes live workouts only
-- — which is all it ever needed to do.)
ALTER TABLE public.captured_workout_usage
  DROP CONSTRAINT IF EXISTS captured_workout_usage_captured_workout_id_fkey;
ALTER TABLE public.captured_workout_usage
  ALTER COLUMN captured_workout_id DROP NOT NULL;
ALTER TABLE public.captured_workout_usage
  ADD CONSTRAINT captured_workout_usage_captured_workout_id_fkey
  FOREIGN KEY (captured_workout_id)
  REFERENCES public.captured_workouts(id) ON DELETE SET NULL;

-- ---- Tag columns. ----
--
-- Every other tag column is constrained; this one was not. A classifier that
-- emits 'warm_up' or 'cool-down' would write cleanly and that workout would
-- become invisible to its block forever, with nothing anywhere to catch it —
-- the Supabase client is untyped, so the database is the only reader that can.
ALTER TABLE public.captured_workouts
  ADD CONSTRAINT captured_workouts_block_roles_check
  CHECK (block_roles <@ ARRAY['warmup', 'mobility', 'main', 'conditioning', 'cooldown']::TEXT[]);

-- ---- Redundant indexes. ----
-- Each duplicates the leading column of a UNIQUE constraint's own index and
-- buys nothing but write cost. captured_workout_usage_user_date stays: it
-- matches the coverage query and has no unique constraint behind it.
DROP INDEX IF EXISTS public.captured_workout_muscles_workout;
DROP INDEX IF EXISTS public.generated_session_blocks_session;

COMMENT ON COLUMN public.generated_session_blocks.name IS
  'The block''s display name at compose time, so history survives deleting the workout it came from.';
