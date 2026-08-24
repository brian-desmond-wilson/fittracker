-- 20260825130000_equipment_junction_and_review_queue.sql
-- exercise_equipment existed in the archived tree but never reached live. Recreated here.

CREATE TABLE IF NOT EXISTS exercise_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exercise_id, equipment_id)
);
-- Reverse-lookup index — house style indexes both FK columns of a junction (UNIQUE already covers exercise_id first).
CREATE INDEX IF NOT EXISTS exercise_equipment_equipment_idx ON exercise_equipment(equipment_id);

ALTER TABLE exercise_equipment ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_equipment' AND policyname = 'exercise_equipment viewable by everyone'
  ) THEN
    CREATE POLICY "exercise_equipment viewable by everyone" ON exercise_equipment FOR SELECT TO public USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_equipment' AND policyname = 'exercise_equipment writable by authenticated'
  ) THEN
    CREATE POLICY "exercise_equipment writable by authenticated" ON exercise_equipment FOR ALL
      TO authenticated USING (true) WITH CHECK (true);
  END IF;
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
  -- RESTRICT (not SET NULL): consistent with the exercise_instances precedent. Stage 3 merge
  -- tooling must repoint review rows before deleting a merged-away exercise; silently orphaning
  -- resolved_exercise_id would hide that a review's resolution target vanished.
  resolved_exercise_id UUID REFERENCES exercises(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS exercise_match_reviews_pending_idx ON exercise_match_reviews (status) WHERE status = 'pending';

-- Idempotent fixup: the table may already exist on staging with the original SET NULL action.
-- Drop and re-add the FK under RESTRICT if it isn't already.
DO $$
DECLARE
  v_deltype "char";
BEGIN
  SELECT confdeltype INTO v_deltype
  FROM pg_constraint
  WHERE conrelid = 'public.exercise_match_reviews'::regclass
    AND conname = 'exercise_match_reviews_resolved_exercise_id_fkey';

  IF v_deltype IS NOT NULL AND v_deltype <> 'r' THEN
    ALTER TABLE exercise_match_reviews DROP CONSTRAINT exercise_match_reviews_resolved_exercise_id_fkey;
    ALTER TABLE exercise_match_reviews
      ADD CONSTRAINT exercise_match_reviews_resolved_exercise_id_fkey
      FOREIGN KEY (resolved_exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Lifecycle integrity: status and its resolution fields must always agree.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exercise_match_reviews_lifecycle_check' AND conrelid = 'public.exercise_match_reviews'::regclass
  ) THEN
    ALTER TABLE exercise_match_reviews ADD CONSTRAINT exercise_match_reviews_lifecycle_check CHECK (
      (status = 'pending'             AND resolved_exercise_id IS NULL     AND resolved_at IS NULL) OR
      (status IN ('linked','minted')  AND resolved_exercise_id IS NOT NULL AND resolved_at IS NOT NULL) OR
      (status = 'dismissed'           AND resolved_exercise_id IS NULL     AND resolved_at IS NOT NULL)
    );
  END IF;
END $$;

-- candidates is a match-candidate list; guard the shape so consumers can rely on array semantics.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exercise_match_reviews_candidates_array_check' AND conrelid = 'public.exercise_match_reviews'::regclass
  ) THEN
    ALTER TABLE exercise_match_reviews ADD CONSTRAINT exercise_match_reviews_candidates_array_check
      CHECK (jsonb_typeof(candidates) = 'array');
  END IF;
END $$;

ALTER TABLE exercise_match_reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_match_reviews' AND policyname = 'own reviews'
  ) THEN
    CREATE POLICY "own reviews" ON exercise_match_reviews FOR ALL
      TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Invariant this table exists for: raw_name_normalized must ALWAYS equal normalize_alias(raw_name),
-- regardless of what a caller passes (mirrors the exercise_aliases fix exactly).
CREATE OR REPLACE FUNCTION enforce_raw_name_normalized() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN NEW.raw_name_normalized := normalize_alias(NEW.raw_name); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS exercise_match_reviews_normalize ON exercise_match_reviews;
CREATE TRIGGER exercise_match_reviews_normalize
  BEFORE INSERT OR UPDATE OF raw_name, raw_name_normalized ON exercise_match_reviews
  FOR EACH ROW EXECUTE FUNCTION enforce_raw_name_normalized();
