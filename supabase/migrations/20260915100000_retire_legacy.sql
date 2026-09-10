-- Stage 6 (spec Phase 7): retire legacy catalog storage. Every attribute
-- now lives in exactly one place:
--   goal types        → exercise_goal_types junction
--   movement styles   → exercise_movement_styles junction
--   equipment         → exercise_equipment junction (cores: core_default_equipment)
--   aliases           → exercise_aliases table
--   plane/load/stance → single FK columns on exercises (these SURVIVE)
--   variations        → the derivation hierarchy (children of a core)
-- Final pre-drop backup: backups/catalog_data_20260909211947.sql (taken from
-- live 2026-09-09; the last dump containing the six legacy tables' contents,
-- including the 10 exercise_variations rows for Pike Walk + Hanging Knee Raise).

ALTER TABLE public.exercises
  DROP COLUMN IF EXISTS goal_type_id,
  DROP COLUMN IF EXISTS movement_style_id,
  DROP COLUMN IF EXISTS equipment_types,
  DROP COLUMN IF EXISTS aliases;

-- Vestigial variant-pointer columns on OTHER tables (all 100% NULL on live and
-- staging, verified 2026-09-09; their FK constraints would otherwise block the
-- table drops below).
ALTER TABLE public.exercise_standards DROP COLUMN IF EXISTS variation_option_id;
ALTER TABLE public.movement_measurement_profiles DROP COLUMN IF EXISTS variation_option_id;
ALTER TABLE public.movement_scaling_links
  DROP COLUMN IF EXISTS from_variation_option_id,
  DROP COLUMN IF EXISTS to_variation_option_id;

-- Children before parents (FKs).
DROP TABLE IF EXISTS public.exercise_variations;
DROP TABLE IF EXISTS public.variation_options;
DROP TABLE IF EXISTS public.variation_categories;
DROP TABLE IF EXISTS public.exercise_planes_of_motion;
DROP TABLE IF EXISTS public.exercise_load_positions;
DROP TABLE IF EXISTS public.exercise_stances;
