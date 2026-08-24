-- Today tab redesign: block locks & dismissals, one-shot adjust instructions,
-- post-session debriefs, the AI day rationale, and the recovery override.
-- 2026-08-19. Approved mockups are the decision record (artifact
-- "Today Tab Redesign — Mockups"); built without a spec by request.

-- A locked block survives recomposes: the compose merges it back in verbatim
-- instead of re-picking it. A dismissed block is a built-in the user waved off
-- for today — the row stays (undo, history), the tab just stops counting it.
ALTER TABLE public.generated_session_blocks
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dismissed BOOLEAN NOT NULL DEFAULT false;

-- ONE sentence from the model about the day's shape, alongside the per-block
-- reasons. NULL for rules-composed days and rows from before the column.
ALTER TABLE public.generated_sessions
  ADD COLUMN IF NOT EXISTS day_reason TEXT;

-- "Train anyway": the user overrode a recovery call for this day. Lives on
-- the check-in because it is a day-level input, same as energy — and it must
-- survive a recompose, which session rows do not.
ALTER TABLE public.daily_checkins
  ADD COLUMN IF NOT EXISTS override_recovery BOOLEAN NOT NULL DEFAULT false;

-- One-shot instructions to the recommender ("no rowing today"), block-scoped
-- or day-scoped (block NULL). Kept as a log, not a single value: recent ones
-- resurface as tappable shortcuts, and the day's instructions all ride into
-- the compose prompt.
CREATE TABLE IF NOT EXISTS public.session_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: the instruction is the user's words, useful as a
  -- shortcut long after the session it first shaped is gone.
  session_id UUID REFERENCES public.generated_sessions(id) ON DELETE SET NULL,
  block TEXT CHECK (block IN ('warmup', 'mobility', 'main', 'conditioning', 'cooldown')),
  instruction TEXT NOT NULL CHECK (char_length(instruction) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_adjustments_user_created
  ON public.session_adjustments (user_id, created_at DESC);

-- How the session landed, one per session: one-tap verdict plus an optional
-- note, fed to the next compose.
CREATE TABLE IF NOT EXISTS public.session_debriefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL UNIQUE
    REFERENCES public.generated_sessions(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK (verdict IN ('too_easy', 'just_right', 'too_much')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_debriefs_user_created
  ON public.session_debriefs (user_id, created_at DESC);

ALTER TABLE public.session_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_debriefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own adjustments" ON public.session_adjustments;
CREATE POLICY "own adjustments" ON public.session_adjustments FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own debriefs" ON public.session_debriefs;
CREATE POLICY "own debriefs" ON public.session_debriefs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
