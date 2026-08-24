-- 20260825100000_reference_structure_columns.sql
-- Naming metadata + identity flags + grouping-as-data on reference tables (spec: Reference-table hygiene).

ALTER TABLE muscle_regions ADD COLUMN IF NOT EXISTS region_group TEXT
  CHECK (region_group IN ('Upper Body','Core / Midline','Lower Body','Whole Body'));

ALTER TABLE movement_styles ADD COLUMN IF NOT EXISTS is_identity BOOLEAN NOT NULL DEFAULT false;

-- Naming metadata on every attribute-value table that can contribute words to a generated name.
ALTER TABLE equipment        ADD COLUMN IF NOT EXISTS name_fragment TEXT, ADD COLUMN IF NOT EXISTS name_order INTEGER;
ALTER TABLE load_positions   ADD COLUMN IF NOT EXISTS name_fragment TEXT, ADD COLUMN IF NOT EXISTS name_order INTEGER,
                             ADD COLUMN IF NOT EXISTS implies_equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL;
ALTER TABLE stances          ADD COLUMN IF NOT EXISTS name_fragment TEXT, ADD COLUMN IF NOT EXISTS name_order INTEGER;
ALTER TABLE range_depths     ADD COLUMN IF NOT EXISTS name_fragment TEXT, ADD COLUMN IF NOT EXISTS name_order INTEGER;
ALTER TABLE symmetries       ADD COLUMN IF NOT EXISTS name_fragment TEXT, ADD COLUMN IF NOT EXISTS name_order INTEGER;
ALTER TABLE movement_styles  ADD COLUMN IF NOT EXISTS name_fragment TEXT, ADD COLUMN IF NOT EXISTS name_order INTEGER;

-- Family ↔ modality reachability as data (replaces the app's drifted hardcoded map).
CREATE TABLE IF NOT EXISTS movement_family_modalities (
  movement_family_id UUID NOT NULL REFERENCES movement_families(id) ON DELETE CASCADE,
  movement_category_id UUID NOT NULL REFERENCES movement_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (movement_family_id, movement_category_id)
);

-- Abbreviation dictionary for the alias normalizer.
CREATE TABLE IF NOT EXISTS alias_abbreviations (
  abbrev TEXT PRIMARY KEY,          -- stored normalized: lowercase, alphanumeric
  expansion TEXT NOT NULL,          -- lowercase words
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The edge table has no attributes of its own (family/modality reachability is the fact being
-- recorded), so the bare composite PK is intentional: no surrogate id, no created_at.
COMMENT ON TABLE movement_family_modalities IS 'Edge table: family/modality reachability is the only fact. Composite PK is intentional, not an oversight — no surrogate id or created_at needed.';

-- Reverse-lookup index — house style indexes both FK columns of a junction (the PK already covers movement_family_id first).
CREATE INDEX IF NOT EXISTS idx_movement_family_modalities_category ON movement_family_modalities(movement_category_id);

-- Enforce the documented normalization invariant (abbrev is stored lowercase, alphanumeric).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'abbrev_normalized' AND conrelid = 'public.alias_abbreviations'::regclass
  ) THEN
    ALTER TABLE alias_abbreviations ADD CONSTRAINT abbrev_normalized CHECK (abbrev ~ '^[a-z0-9]+$');
  END IF;
END $$;

-- RLS, matching the schema's existing reference-table pattern: readable by everyone, no write policy.
ALTER TABLE movement_family_modalities ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'movement_family_modalities'
      AND policyname = 'Movement family modalities are viewable by everyone'
  ) THEN
    CREATE POLICY "Movement family modalities are viewable by everyone" ON movement_family_modalities FOR SELECT USING (true);
  END IF;
END $$;

ALTER TABLE alias_abbreviations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'alias_abbreviations'
      AND policyname = 'Alias abbreviations are viewable by everyone'
  ) THEN
    CREATE POLICY "Alias abbreviations are viewable by everyone" ON alias_abbreviations FOR SELECT USING (true);
  END IF;
END $$;
