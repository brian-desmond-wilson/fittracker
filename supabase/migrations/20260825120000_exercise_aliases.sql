-- 20260825120000_exercise_aliases.sql

-- Dictionary-drift policy: alias_normalized values are computed under the dictionary as of
-- insert time. Adding a row to alias_abbreviations is NOT backward-safe: it requires
-- re-normalizing all exercise_aliases and routing any resulting collisions to
-- exercise_match_reviews. That re-normalization flow lands with the capture front door
-- (roadmap Stage 5); until then treat the dictionary as append-rarely and re-run the harness
-- after any change.
CREATE OR REPLACE FUNCTION normalize_alias(raw TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(string_agg(COALESCE(a.expansion, w.word), ' ' ORDER BY w.ord), '')
  FROM unnest(regexp_split_to_array(
         trim(regexp_replace(lower(coalesce(raw,'')), '[^a-z0-9]+', ' ', 'g')), ' '))
       WITH ORDINALITY AS w(word, ord)
  LEFT JOIN alias_abbreviations a ON a.abbrev = w.word
  WHERE w.word <> '';
$$;

CREATE TABLE IF NOT EXISTS exercise_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('generated','display','short','wild')),
  source TEXT NOT NULL DEFAULT 'seed' CHECK (source IN ('seed','curation','capture')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Alias lock is ON from birth: table starts empty, so no dirty data can block it.
CREATE UNIQUE INDEX IF NOT EXISTS exercise_aliases_normalized_key ON exercise_aliases (alias_normalized);
CREATE INDEX IF NOT EXISTS exercise_aliases_exercise_idx ON exercise_aliases (exercise_id);

ALTER TABLE exercise_aliases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_aliases' AND policyname = 'aliases viewable by everyone'
  ) THEN
    CREATE POLICY "aliases viewable by everyone" ON exercise_aliases FOR SELECT TO public USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_aliases' AND policyname = 'aliases writable by authenticated'
  ) THEN
    CREATE POLICY "aliases writable by authenticated" ON exercise_aliases FOR ALL
      TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Invariant this table exists for: alias_normalized must ALWAYS equal normalize_alias(alias),
-- regardless of what a caller passes.
CREATE OR REPLACE FUNCTION enforce_alias_normalized() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.alias_normalized := normalize_alias(NEW.alias);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS exercise_aliases_normalize ON exercise_aliases;
CREATE TRIGGER exercise_aliases_normalize
  BEFORE INSERT OR UPDATE OF alias, alias_normalized ON exercise_aliases
  FOR EACH ROW EXECUTE FUNCTION enforce_alias_normalized();
