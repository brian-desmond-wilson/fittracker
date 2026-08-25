-- 20260825140000_catalog_identity_columns.sql
-- Catalog identity columns on exercises: core_movement_id, identity_fingerprint,
-- tier, generated_name, name_is_custom. Stage 1 scaffolding only — the identity
-- engine (Task 9) populates fingerprint/tier/generated_name; this migration just
-- adds the columns, backfills core self-reference, and flags existing names custom.

-- RESTRICT (not SET NULL): consistent with the exercise_match_reviews precedent. Deleting a
-- core with dependents must be an explicit repoint-then-delete via Stage 3 merge tooling;
-- self-referencing childless cores still delete in one statement.
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS core_movement_id UUID REFERENCES exercises(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS identity_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS tier INTEGER,
  ADD COLUMN IF NOT EXISTS generated_name TEXT,
  ADD COLUMN IF NOT EXISTS name_is_custom BOOLEAN NOT NULL DEFAULT false;

-- Idempotent fixup: the column may already exist on staging with the original SET NULL action.
-- Drop and re-add the FK under RESTRICT if it isn't already.
DO $$
DECLARE
  v_deltype "char";
BEGIN
  SELECT confdeltype INTO v_deltype
  FROM pg_constraint
  WHERE conrelid = 'public.exercises'::regclass
    AND conname = 'exercises_core_movement_id_fkey';

  IF v_deltype IS NOT NULL AND v_deltype <> 'r' THEN
    ALTER TABLE exercises DROP CONSTRAINT exercises_core_movement_id_fkey;
    ALTER TABLE exercises
      ADD CONSTRAINT exercises_core_movement_id_fkey
      FOREIGN KEY (core_movement_id) REFERENCES exercises(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Existing hand-set names are overrides until the catalog pass says otherwise.
-- Unconditional and idempotent: a re-run just sets true to true again.
UPDATE exercises SET name_is_custom = true;

-- Core rows self-reference (today's 9 curated cores; Stage 3 finalizes the set).
-- Idempotent: re-running assigns id = id for rows already self-referencing.
UPDATE exercises SET core_movement_id = id WHERE is_core;

-- NOTE: the UNIQUE (core_movement_id, identity_fingerprint) lock is intentionally NOT created here.
-- It is Stage 4 ("turn the locks"), after the Stage 3 catalog pass cleans the data.

CREATE INDEX IF NOT EXISTS exercises_core_movement_idx ON exercises (core_movement_id);
CREATE INDEX IF NOT EXISTS exercises_fingerprint_idx ON exercises (core_movement_id, identity_fingerprint);

-- Self-verify (standing rule: data migrations must fail the push closed on drift).
-- Tolerant of re-run.
DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
  v_deltype "char";
BEGIN
  IF EXISTS (SELECT 1 FROM public.exercises WHERE is_core AND core_movement_id IS DISTINCT FROM id) THEN
    SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed
      FROM public.exercises WHERE is_core AND core_movement_id IS DISTINCT FROM id;
    RAISE EXCEPTION 'catalog_identity_columns: core rows not self-referencing core_movement_id: %', v_observed;
  END IF;

  SELECT count(*) INTO v_count FROM public.exercises WHERE NOT name_is_custom;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'catalog_identity_columns: % exercises rows have name_is_custom = false, expected 0', v_count;
  END IF;

  SELECT confdeltype INTO v_deltype
  FROM pg_constraint
  WHERE conrelid = 'public.exercises'::regclass AND conname = 'exercises_core_movement_id_fkey';
  IF v_deltype IS DISTINCT FROM 'r' THEN
    RAISE EXCEPTION 'catalog_identity_columns: exercises_core_movement_id_fkey confdeltype = % (expected r/RESTRICT)', COALESCE(v_deltype, 'null');
  END IF;
END $$;
