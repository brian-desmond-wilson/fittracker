-- Start a catalog workout: run a saved workout instead of the recommendation.
-- 2026-08-17.
-- Spec: docs/superpowers/specs/2026-08-17-start-catalog-workout-design.md §3.
--
-- Three shifts, all on generated_sessions:
--
-- 1. A session you picked yourself is neither AI-composed nor rules-composed.
--
-- 2. A workout served whole has no push/pull/legs stamp. NULL means "did not
--    advance the rotation" — a full-body conditioning workout shouldn't consume
--    a slot in the split, so the rotation stands still and resumes where it
--    paused. The lookback in fetchCandidateData reads past unstamped rows.
--
-- 3. One PENDING session per day, not one row per day. Replacing the morning's
--    suggestion keeps the skipped original beside the workout you chose, so the
--    "suggested X, did Y" signal survives. Completed rows sit outside the
--    constraint entirely: finishing a session and then doing a second workout
--    is a fact about the day, not a conflict — and a completed session is never
--    rewritten, because marking one skipped would make the rotation lookback
--    reach past a day you actually trained and serve it to you again tomorrow.

ALTER TABLE public.generated_sessions
  DROP CONSTRAINT IF EXISTS generated_sessions_source_check;
ALTER TABLE public.generated_sessions
  ADD CONSTRAINT generated_sessions_source_check
  CHECK (source IN ('ai', 'rules_fallback', 'user_pick'));

ALTER TABLE public.generated_sessions
  ALTER COLUMN split_day DROP NOT NULL;

ALTER TABLE public.generated_sessions
  DROP CONSTRAINT IF EXISTS generated_sessions_user_id_session_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS generated_sessions_pending_day
  ON public.generated_sessions (user_id, session_date)
  WHERE status IN ('suggested', 'accepted');

COMMENT ON COLUMN public.generated_sessions.split_day IS
  'push/pull/legs, or NULL for a workout served whole — an unstamped session does not advance the rotation.';
COMMENT ON COLUMN public.generated_sessions.source IS
  'ai | rules_fallback = composed for you. user_pick = you chose a catalog workout yourself.';
