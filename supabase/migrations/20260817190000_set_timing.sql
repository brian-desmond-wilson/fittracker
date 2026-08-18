-- Set timing: record when each set happened and how long it took.
-- 2026-08-17.
--
-- Until now a set recorded weight, reps, effort and notes — and nothing about
-- time. The logging screen's per-set timer was display-only: its start and
-- finish lived in memory for the length of the session and were dropped when
-- the set was written. The whole workout kept a start and a duration; the
-- individual sets kept nothing.
--
-- Two ways in, one shape out. Live mode measures the numbers from the timer.
-- Backfill mode takes them from you — either a duration, with each set
-- starting where the one before it ended, or explicit start and end times.
-- Both produce the same three columns, so nothing downstream needs to know
-- which mode filled them.
--
-- timing_source keeps that distinction anyway: a measured 4:12 and a
-- remembered 4:12 are not equally trustworthy, and anything later that reasons
-- about pace should be able to tell them apart.

ALTER TABLE public.set_instances
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  ADD COLUMN IF NOT EXISTS timing_source TEXT
    CHECK (timing_source IS NULL OR timing_source IN ('measured', 'entered'));

COMMENT ON COLUMN public.set_instances.started_at IS
  'When the set began. Measured by the timer in live mode; given or chained from the previous set in backfill.';
COMMENT ON COLUMN public.set_instances.ended_at IS
  'When the set finished. NULL when only a duration is known and no anchor time was ever set.';
COMMENT ON COLUMN public.set_instances.duration_seconds IS
  'How long the set took. Authoritative when entered directly; otherwise ended_at - started_at.';
COMMENT ON COLUMN public.set_instances.timing_source IS
  'measured = the timer ran. entered = you typed it in after the fact. NULL = a set logged before any of this existed.';

-- An exercise's span is derived from its sets rather than stored twice, so
-- reading a workout's timeline means reading sets by time.
CREATE INDEX IF NOT EXISTS set_instances_started_at
  ON public.set_instances (exercise_instance_id, started_at);
