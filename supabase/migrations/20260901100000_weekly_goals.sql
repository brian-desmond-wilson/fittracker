-- Weekly training goals, kept as dated history.
--
-- A goal change must not rewrite the past: "weeks in a row" judges each week
-- against the goal that was in force that week, so rows are append-only in
-- practice and the current goal is simply the latest effective_from <= today.
CREATE TABLE IF NOT EXISTS weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The Sunday that starts the first week this goal governs.
  effective_from DATE NOT NULL,
  sessions_target INTEGER NOT NULL CHECK (sessions_target BETWEEN 1 AND 14),
  -- NULL means "not part of my goal", which is different from a target of 0.
  volume_target_lbs INTEGER CHECK (volume_target_lbs > 0),
  region_target INTEGER CHECK (region_target BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_weekly_goals_user_date
  ON weekly_goals(user_id, effective_from DESC);

ALTER TABLE weekly_goals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_goals' AND policyname = 'own weekly goals'
  ) THEN
    CREATE POLICY "own weekly goals" ON weekly_goals FOR ALL
      TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

COMMENT ON TABLE weekly_goals IS 'Dated weekly goal history. The goal in force for a week is the latest row with effective_from <= that week''s Sunday; changing today''s goal never rewrites past weeks.';
