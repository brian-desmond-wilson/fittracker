-- Tier 4 schema for water tracking:
--   #11 container names + per-button beverage type (parallel arrays to quick_add_oz)
--   #12 user-preferred display unit
--   #13 beverage type on each log + global "only water counts" toggle

ALTER TABLE public.profiles
  ADD COLUMN quick_add_names TEXT[] NOT NULL DEFAULT ARRAY['','','',''],
  ADD COLUMN quick_add_types TEXT[] NOT NULL
    DEFAULT ARRAY['water','water','water','water'],
  ADD COLUMN water_display_unit TEXT NOT NULL DEFAULT 'oz'
    CHECK (water_display_unit IN ('oz','L')),
  ADD COLUMN water_only_counts BOOLEAN NOT NULL DEFAULT false;

-- Per-log beverage type
ALTER TABLE public.water_logs
  ADD COLUMN beverage_type TEXT NOT NULL DEFAULT 'water'
  CHECK (beverage_type IN ('water','coffee','tea','juice','other'));

-- Index for the "only water counts" filter
CREATE INDEX idx_water_logs_user_type_date
  ON public.water_logs (user_id, beverage_type, date DESC);
