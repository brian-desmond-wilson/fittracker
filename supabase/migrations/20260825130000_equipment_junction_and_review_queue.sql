-- 20260825130000_equipment_junction_and_review_queue.sql
-- exercise_equipment existed in the archived tree but never reached live. Recreated here.

CREATE TABLE IF NOT EXISTS exercise_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exercise_id, equipment_id)
);
ALTER TABLE exercise_equipment ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "exercise_equipment viewable by everyone" ON exercise_equipment FOR SELECT TO public USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "exercise_equipment writable by authenticated" ON exercise_equipment FOR ALL
    TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS exercise_match_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id UUID REFERENCES captured_sources(id) ON DELETE SET NULL,
  raw_name TEXT NOT NULL,
  raw_name_normalized TEXT NOT NULL,
  context TEXT,
  candidates JSONB NOT NULL DEFAULT '[]',   -- [{exercise_id, name, confidence, why}]
  draft JSONB,                              -- parsed attributes + generated-name preview for minting
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','linked','minted','dismissed')),
  resolved_exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS exercise_match_reviews_pending_idx ON exercise_match_reviews (status) WHERE status = 'pending';
ALTER TABLE exercise_match_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "own reviews" ON exercise_match_reviews FOR ALL
    TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
