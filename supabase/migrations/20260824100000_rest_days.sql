-- Rest days (spec 2026-08-24): a user-chosen terminal day state, and the flag
-- that lets an "active recovery" check-in force the recovery day shape.

-- 'rested' is TERMINAL: it lives outside generated_sessions_pending_day
-- (which covers only suggested/accepted), so un-resting and then composing a
-- real session never collides with it.
ALTER TABLE generated_sessions
  DROP CONSTRAINT generated_sessions_status_check;
ALTER TABLE generated_sessions
  ADD CONSTRAINT generated_sessions_status_check
  CHECK (status IN ('suggested', 'accepted', 'completed', 'skipped', 'rested'));

-- At most one rest record per day, same shape as the pending-day index.
CREATE UNIQUE INDEX IF NOT EXISTS generated_sessions_rested_day
  ON generated_sessions (user_id, session_date)
  WHERE status = 'rested';

-- Mirror of override_recovery, opposite direction: override cancels a
-- recovery call, force creates one. effectiveRecovery() reads both.
ALTER TABLE daily_checkins
  ADD COLUMN IF NOT EXISTS force_recovery BOOLEAN NOT NULL DEFAULT FALSE;
