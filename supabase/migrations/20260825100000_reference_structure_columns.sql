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
