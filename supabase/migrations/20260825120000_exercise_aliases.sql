-- 20260825120000_exercise_aliases.sql

CREATE OR REPLACE FUNCTION normalize_alias(raw TEXT) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(string_agg(COALESCE(a.expansion, w.word), ' ' ORDER BY w.ord), '')
  FROM unnest(regexp_split_to_array(
         trim(regexp_replace(lower(coalesce(raw,'')), '[^a-z0-9]+', ' ', 'g')), ' '))
       WITH ORDINALITY AS w(word, ord)
  LEFT JOIN alias_abbreviations a ON a.abbrev = w.word
  WHERE w.word <> '';
$$;

CREATE TABLE exercise_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('generated','display','short','wild')),
  source TEXT NOT NULL DEFAULT 'seed' CHECK (source IN ('seed','curation','capture')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Alias lock is ON from birth: table starts empty, so no dirty data can block it.
CREATE UNIQUE INDEX exercise_aliases_normalized_key ON exercise_aliases (alias_normalized);
CREATE INDEX exercise_aliases_exercise_idx ON exercise_aliases (exercise_id);

ALTER TABLE exercise_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aliases viewable by everyone" ON exercise_aliases FOR SELECT TO public USING (true);
CREATE POLICY "aliases writable by authenticated" ON exercise_aliases FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
