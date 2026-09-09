-- 20260908100000_catalog_pass.sql
-- Stage 3 catalog pass: applies the user-approved classification of all 307 live
-- exercises (decision records: docs/superpowers/audit/catalog-pass-2026-08.csv,
-- new-attributes-2026-08.csv; end state blessed in catalog-final-2026-08.csv).
--
-- GENERATED FILE — do not edit by hand. Regenerate with:
--     python3 scripts/movement-model/generate_catalog_pass.py
-- The generator is deterministic; regeneration must produce this identical file.
--
-- Every section is idempotent (re-run converges to the same state). Safe under
-- `psql -1` / `db push` (no explicit transaction control in-file). Ends with
-- self-verify DO blocks that RAISE EXCEPTION, with observed values, on any
-- violated invariant (standing data-migration rule).
--
-- End state (from the blessed projection): 287 exercises = 48 cores + 187
-- derivations + 52 outliers; 25 duplicates merged away; tiers 48/144/38/5.

-- ============================================================================
-- 1) New reference tables: directions, support_positions, arm_positions,
--    bench_angles (standing rule: every CREATE TABLE ships RLS + policies in
--    the same migration)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.directions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  name_fragment TEXT,
  name_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.directions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'directions'
                   AND policyname = 'Directions are viewable by everyone') THEN
    CREATE POLICY "Directions are viewable by everyone" ON public.directions FOR SELECT USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.support_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  name_fragment TEXT,
  name_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.support_positions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'support_positions'
                   AND policyname = 'Support positions are viewable by everyone') THEN
    CREATE POLICY "Support positions are viewable by everyone" ON public.support_positions FOR SELECT USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.arm_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  name_fragment TEXT,
  name_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.arm_positions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'arm_positions'
                   AND policyname = 'Arm positions are viewable by everyone') THEN
    CREATE POLICY "Arm positions are viewable by everyone" ON public.arm_positions FOR SELECT USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.bench_angles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  name_fragment TEXT,
  name_order INTEGER,
  implies_equipment_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bench_angles ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'bench_angles'
                   AND policyname = 'Bench angles are viewable by everyone') THEN
    CREATE POLICY "Bench angles are viewable by everyone" ON public.bench_angles FOR SELECT USING (true);
  END IF;
END $$;

-- Seeds (silent values carry NULL fragment AND NULL order, house convention).
INSERT INTO public.directions (name, display_order, name_fragment, name_order)
SELECT 'Front', 1, 'Front', 22
 WHERE NOT EXISTS (SELECT 1 FROM public.directions WHERE name = 'Front');
INSERT INTO public.directions (name, display_order, name_fragment, name_order)
SELECT 'Lateral', 2, 'Lateral', 22
 WHERE NOT EXISTS (SELECT 1 FROM public.directions WHERE name = 'Lateral');
INSERT INTO public.directions (name, display_order, name_fragment, name_order)
SELECT 'Rear', 3, 'Rear', 22
 WHERE NOT EXISTS (SELECT 1 FROM public.directions WHERE name = 'Rear');
INSERT INTO public.directions (name, display_order, name_fragment, name_order)
SELECT 'Diagonal', 4, 'Diagonal', 22
 WHERE NOT EXISTS (SELECT 1 FROM public.directions WHERE name = 'Diagonal');
INSERT INTO public.directions (name, display_order, name_fragment, name_order)
SELECT 'Reverse', 5, 'Reverse', 22
 WHERE NOT EXISTS (SELECT 1 FROM public.directions WHERE name = 'Reverse');
INSERT INTO public.directions (name, display_order, name_fragment, name_order)
SELECT 'Walking', 6, 'Walking', 22
 WHERE NOT EXISTS (SELECT 1 FROM public.directions WHERE name = 'Walking');
INSERT INTO public.directions (name, display_order, name_fragment, name_order)
SELECT 'Curtsy', 7, 'Curtsy', 22
 WHERE NOT EXISTS (SELECT 1 FROM public.directions WHERE name = 'Curtsy');
INSERT INTO public.directions (name, display_order, name_fragment, name_order)
SELECT 'Low-to-High', 8, 'Low-to-High', 22
 WHERE NOT EXISTS (SELECT 1 FROM public.directions WHERE name = 'Low-to-High');
INSERT INTO public.support_positions (name, display_order, name_fragment, name_order)
SELECT 'Forearm', 1, NULL, NULL
 WHERE NOT EXISTS (SELECT 1 FROM public.support_positions WHERE name = 'Forearm');
INSERT INTO public.support_positions (name, display_order, name_fragment, name_order)
SELECT 'Hand', 2, 'High', 24
 WHERE NOT EXISTS (SELECT 1 FROM public.support_positions WHERE name = 'Hand');
INSERT INTO public.support_positions (name, display_order, name_fragment, name_order)
SELECT 'Side', 3, 'Side', 24
 WHERE NOT EXISTS (SELECT 1 FROM public.support_positions WHERE name = 'Side');
INSERT INTO public.arm_positions (name, display_order, name_fragment, name_order)
SELECT 'Overhead', 1, 'Overhead', 26
 WHERE NOT EXISTS (SELECT 1 FROM public.arm_positions WHERE name = 'Overhead');
INSERT INTO public.arm_positions (name, display_order, name_fragment, name_order)
SELECT 'Behind-Body', 2, 'Behind-Body', 26
 WHERE NOT EXISTS (SELECT 1 FROM public.arm_positions WHERE name = 'Behind-Body');
INSERT INTO public.arm_positions (name, display_order, name_fragment, name_order)
SELECT 'In-Front', 3, 'In-Front', 26
 WHERE NOT EXISTS (SELECT 1 FROM public.arm_positions WHERE name = 'In-Front');
INSERT INTO public.arm_positions (name, display_order, name_fragment, name_order)
SELECT 'Across-Body', 4, 'Cross-Body', 26
 WHERE NOT EXISTS (SELECT 1 FROM public.arm_positions WHERE name = 'Across-Body');
INSERT INTO public.arm_positions (name, display_order, name_fragment, name_order)
SELECT 'Braced', 5, 'Concentration', 26
 WHERE NOT EXISTS (SELECT 1 FROM public.arm_positions WHERE name = 'Braced');
INSERT INTO public.arm_positions (name, display_order, name_fragment, name_order)
SELECT 'Straight-Arm', 6, 'Straight-Arm', 26
 WHERE NOT EXISTS (SELECT 1 FROM public.arm_positions WHERE name = 'Straight-Arm');
INSERT INTO public.bench_angles (name, display_order, name_fragment, name_order, implies_equipment_id)
SELECT 'Flat', 1, NULL, NULL, NULL
 WHERE NOT EXISTS (SELECT 1 FROM public.bench_angles WHERE name = 'Flat');
INSERT INTO public.bench_angles (name, display_order, name_fragment, name_order, implies_equipment_id)
SELECT 'Incline', 2, 'Incline', 28, (SELECT id FROM public.equipment WHERE name = 'Bench')
 WHERE NOT EXISTS (SELECT 1 FROM public.bench_angles WHERE name = 'Incline');
INSERT INTO public.bench_angles (name, display_order, name_fragment, name_order, implies_equipment_id)
SELECT 'Decline', 3, 'Decline', 28, (SELECT id FROM public.equipment WHERE name = 'Bench')
 WHERE NOT EXISTS (SELECT 1 FROM public.bench_angles WHERE name = 'Decline');
-- Re-run convergence: Incline/Decline must imply Bench even if the rows pre-exist.
UPDATE public.bench_angles SET implies_equipment_id = (SELECT id FROM public.equipment WHERE name = 'Bench')
 WHERE name IN ('Incline','Decline') AND implies_equipment_id IS NULL;

-- ============================================================================
-- 2) variant_labels: G1 reference table (no free text on exercises), G2 each
--    label scoped to exactly ONE core via core_movement_id. Seeded in section 7
--    after the new core rows exist. G4 (wizard affordance) is a Stage 5 concern.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.variant_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  core_movement_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  name_fragment TEXT NOT NULL,
  name_order INTEGER NOT NULL DEFAULT 48,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (core_movement_id, slug)
);
ALTER TABLE public.variant_labels ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'variant_labels'
                   AND policyname = 'Variant labels are viewable by everyone') THEN
    CREATE POLICY "Variant labels are viewable by everyone" ON public.variant_labels FOR SELECT USING (true);
  END IF;
END $$;

-- ============================================================================
-- 3) Existing dictionaries: new stances, new equipment, Crush style,
--    Cross-Body symmetry fragment amendment
-- ============================================================================
INSERT INTO public.stances (name, display_order, name_fragment, name_order)
SELECT 'Bridge', (SELECT COALESCE(max(display_order), 0) + 1 FROM public.stances), 'Bridge', 30
 WHERE NOT EXISTS (SELECT 1 FROM public.stances WHERE name = 'Bridge');
INSERT INTO public.stances (name, display_order, name_fragment, name_order)
SELECT 'Hollow', (SELECT COALESCE(max(display_order), 0) + 1 FROM public.stances), 'Hollow', 30
 WHERE NOT EXISTS (SELECT 1 FROM public.stances WHERE name = 'Hollow');
INSERT INTO public.stances (name, display_order, name_fragment, name_order)
SELECT 'V-Sit', (SELECT COALESCE(max(display_order), 0) + 1 FROM public.stances), 'V-Sit', 30
 WHERE NOT EXISTS (SELECT 1 FROM public.stances WHERE name = 'V-Sit');
INSERT INTO public.stances (name, display_order, name_fragment, name_order)
SELECT 'Squat-Hold', (SELECT COALESCE(max(display_order), 0) + 1 FROM public.stances), 'Squat-Hold', 30
 WHERE NOT EXISTS (SELECT 1 FROM public.stances WHERE name = 'Squat-Hold');
INSERT INTO public.stances (name, display_order, name_fragment, name_order)
SELECT 'Tabletop', (SELECT COALESCE(max(display_order), 0) + 1 FROM public.stances), 'Tabletop', 30
 WHERE NOT EXISTS (SELECT 1 FROM public.stances WHERE name = 'Tabletop');
INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)
SELECT 'Machine', 'Machines',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.equipment WHERE category = 'Machines'),
       'Machine', 40
 WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE name = 'Machine');
INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)
SELECT 'Landmine', 'Implements',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.equipment WHERE category = 'Implements'),
       'Landmine', 40
 WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE name = 'Landmine');
INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)
SELECT 'Cable', 'Machines',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.equipment WHERE category = 'Machines'),
       'Cable', 40
 WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE name = 'Cable');
INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)
SELECT 'Smith Machine', 'Machines',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.equipment WHERE category = 'Machines'),
       'Smith Machine', 40
 WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE name = 'Smith Machine');
-- Crush: identity style, Execution band 14 per the approved seed sheet.
INSERT INTO public.movement_styles (name, category, display_order, is_identity, name_fragment, name_order)
SELECT 'Crush', 'Execution Control',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.movement_styles),
       true, 'Crush', 14
 WHERE NOT EXISTS (SELECT 1 FROM public.movement_styles WHERE name = 'Crush');
-- Cross-Body / Rotational now speaks (amendment): unambiguous, unlike Unilateral.
UPDATE public.symmetries SET name_fragment = 'Cross-Body', name_order = 35
 WHERE name = 'Cross-Body / Rotational'
   AND (name_fragment IS DISTINCT FROM 'Cross-Body' OR name_order IS DISTINCT FROM 35);

-- ============================================================================
-- 4) exercises: five attribute FK columns + core_default_equipment.
--    core_default_equipment is naming-only (suppression, mirrors
--    load_positions.implies_equipment_id) — it is NOT part of the fingerprint.
-- ============================================================================
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS direction_id UUID REFERENCES public.directions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS support_position_id UUID REFERENCES public.support_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS arm_position_id UUID REFERENCES public.arm_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bench_angle_id UUID REFERENCES public.bench_angles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_label_id UUID REFERENCES public.variant_labels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS core_default_equipment TEXT;
CREATE INDEX IF NOT EXISTS exercises_direction_idx ON public.exercises (direction_id);
CREATE INDEX IF NOT EXISTS exercises_support_position_idx ON public.exercises (support_position_id);
CREATE INDEX IF NOT EXISTS exercises_arm_position_idx ON public.exercises (arm_position_id);
CREATE INDEX IF NOT EXISTS exercises_bench_angle_idx ON public.exercises (bench_angle_id);
CREATE INDEX IF NOT EXISTS exercises_variant_label_idx ON public.exercises (variant_label_id);

-- Grip category guard (Stage 2 hand-off): the two grip FK columns must stay in
-- their categories. Trigger, matching house style (CHECK cannot subquery).
CREATE OR REPLACE FUNCTION public.enforce_grip_categories() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.grip_orientation_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM grips g WHERE g.id = NEW.grip_orientation_id AND g.category = 'Orientation') THEN
    RAISE EXCEPTION 'grip_orientation_id % on % is not an Orientation grip', NEW.grip_orientation_id, NEW.name;
  END IF;
  IF NEW.grip_width_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM grips g WHERE g.id = NEW.grip_width_id AND g.category = 'Width') THEN
    RAISE EXCEPTION 'grip_width_id % on % is not a Width grip', NEW.grip_width_id, NEW.name;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS exercises_grip_categories ON public.exercises;
CREATE TRIGGER exercises_grip_categories
  BEFORE INSERT OR UPDATE OF grip_orientation_id, grip_width_id ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION enforce_grip_categories();

-- ============================================================================
-- 5) Engine amendments (CREATE OR REPLACE; recompute_exercise_identity is
--    untouched — SECURITY DEFINER, search_path pinning, FOR UPDATE locking,
--    stale-alias cleanup and parent preservation stay as shipped in 20260825150000)
-- ============================================================================

-- exercise_identity_attrs gains direction, support position, arm position,
-- bench angle AND the variant label: all five are identity.
CREATE OR REPLACE FUNCTION public.exercise_identity_attrs(p_id UUID) RETURNS UUID[]
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(array_agg(v ORDER BY v), '{}') FROM (
    SELECT e.load_position_id AS v FROM exercises e WHERE e.id = p_id AND e.load_position_id IS NOT NULL
    UNION ALL SELECT e.stance_id       FROM exercises e WHERE e.id = p_id AND e.stance_id IS NOT NULL
    UNION ALL SELECT e.range_depth_id  FROM exercises e WHERE e.id = p_id AND e.range_depth_id IS NOT NULL
    UNION ALL SELECT e.symmetry_id     FROM exercises e WHERE e.id = p_id AND e.symmetry_id IS NOT NULL
    UNION ALL SELECT e.grip_orientation_id FROM exercises e WHERE e.id = p_id AND e.grip_orientation_id IS NOT NULL
    UNION ALL SELECT e.grip_width_id   FROM exercises e WHERE e.id = p_id AND e.grip_width_id IS NOT NULL
    UNION ALL SELECT e.direction_id    FROM exercises e WHERE e.id = p_id AND e.direction_id IS NOT NULL
    UNION ALL SELECT e.support_position_id FROM exercises e WHERE e.id = p_id AND e.support_position_id IS NOT NULL
    UNION ALL SELECT e.arm_position_id FROM exercises e WHERE e.id = p_id AND e.arm_position_id IS NOT NULL
    UNION ALL SELECT e.bench_angle_id  FROM exercises e WHERE e.id = p_id AND e.bench_angle_id IS NOT NULL
    UNION ALL SELECT e.variant_label_id FROM exercises e WHERE e.id = p_id AND e.variant_label_id IS NOT NULL
    UNION ALL SELECT ee.equipment_id   FROM exercise_equipment ee WHERE ee.exercise_id = p_id
    UNION ALL SELECT ems.movement_style_id
              FROM exercise_movement_styles ems
              JOIN movement_styles ms ON ms.id = ems.movement_style_id AND ms.is_identity
              WHERE ems.exercise_id = p_id
  ) s(v);
$$;

-- generate_exercise_name gains the new fragment bands (22 direction, 24 support,
-- 26 arm position, 28 bench angle, 48 variant — existing band order preserved:
-- 10/12/14 styles, 20 range, 25 grip, 30 stance, 35 alternating symmetry,
-- 40 equipment, 45 load position), the bench-angle implied-equipment suppression
-- (Incline/Decline imply Bench) alongside the load-position/range implications,
-- and CORE-DEFAULT EQUIPMENT SUPPRESSION: equipment named in the core's
-- core_default_equipment (comma-separated) is silent in derivation names.
-- Identity/fingerprint are unaffected by either suppression.
CREATE OR REPLACE FUNCTION public.generate_exercise_name(p_id UUID) RETURNS TEXT
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_core UUID; v_noun TEXT; v_implied UUID[]; v_default_eq TEXT[]; v_frags TEXT;
BEGIN
  SELECT core_movement_id INTO v_core FROM exercises WHERE id = p_id;
  IF v_core IS NULL THEN
    RETURN (SELECT name FROM exercises WHERE id = p_id);      -- outliers keep their name
  END IF;
  SELECT c.name,
         COALESCE((SELECT array_agg(btrim(x)) FROM unnest(string_to_array(c.core_default_equipment, ',')) x
                    WHERE btrim(x) <> ''), '{}')
    INTO v_noun, v_default_eq
    FROM exercises c WHERE c.id = v_core;
  IF v_core = p_id THEN RETURN v_noun; END IF;                -- core row IS the noun

  SELECT COALESCE(array_agg(imp), '{}') INTO v_implied FROM (
    SELECT lp.implies_equipment_id AS imp
      FROM exercises e JOIN load_positions lp ON lp.id = e.load_position_id
     WHERE e.id = p_id AND lp.implies_equipment_id IS NOT NULL
    UNION ALL
    SELECT rd.implies_equipment_id
      FROM exercises e JOIN range_depths rd ON rd.id = e.range_depth_id
     WHERE e.id = p_id AND rd.implies_equipment_id IS NOT NULL
    UNION ALL
    SELECT ba.implies_equipment_id
      FROM exercises e JOIN bench_angles ba ON ba.id = e.bench_angle_id
     WHERE e.id = p_id AND ba.implies_equipment_id IS NOT NULL
  ) s(imp);

  SELECT string_agg(f.frag, ' ' ORDER BY f.ord, f.frag) INTO v_frags FROM (
    SELECT lp.name_fragment AS frag, lp.name_order AS ord
      FROM exercises e JOIN load_positions lp ON lp.id = e.load_position_id WHERE e.id = p_id
    UNION ALL
    SELECT st.name_fragment, st.name_order
      FROM exercises e JOIN stances st ON st.id = e.stance_id WHERE e.id = p_id
    UNION ALL
    SELECT rd.name_fragment, rd.name_order
      FROM exercises e JOIN range_depths rd ON rd.id = e.range_depth_id WHERE e.id = p_id
    UNION ALL
    SELECT sy.name_fragment, sy.name_order
      FROM exercises e JOIN symmetries sy ON sy.id = e.symmetry_id WHERE e.id = p_id
    UNION ALL
    SELECT go.name_fragment, go.name_order
      FROM exercises e JOIN grips go ON go.id = e.grip_orientation_id WHERE e.id = p_id
    UNION ALL
    SELECT gw.name_fragment, gw.name_order
      FROM exercises e JOIN grips gw ON gw.id = e.grip_width_id WHERE e.id = p_id
    UNION ALL
    SELECT d.name_fragment, d.name_order
      FROM exercises e JOIN directions d ON d.id = e.direction_id WHERE e.id = p_id
    UNION ALL
    SELECT sp.name_fragment, sp.name_order
      FROM exercises e JOIN support_positions sp ON sp.id = e.support_position_id WHERE e.id = p_id
    UNION ALL
    SELECT ap.name_fragment, ap.name_order
      FROM exercises e JOIN arm_positions ap ON ap.id = e.arm_position_id WHERE e.id = p_id
    UNION ALL
    SELECT ba.name_fragment, ba.name_order
      FROM exercises e JOIN bench_angles ba ON ba.id = e.bench_angle_id WHERE e.id = p_id
    UNION ALL
    SELECT vl.name_fragment, vl.name_order
      FROM exercises e JOIN variant_labels vl ON vl.id = e.variant_label_id WHERE e.id = p_id
    UNION ALL
    SELECT ms.name_fragment, ms.name_order
      FROM exercise_movement_styles ems JOIN movement_styles ms
        ON ms.id = ems.movement_style_id AND ms.is_identity
      WHERE ems.exercise_id = p_id
    UNION ALL
    SELECT q.name_fragment, q.name_order
      FROM exercise_equipment ee JOIN equipment q ON q.id = ee.equipment_id
      WHERE ee.exercise_id = p_id
        AND NOT (q.id = ANY (v_implied))                      -- implied-equipment suppression
        AND NOT (q.name = ANY (v_default_eq))                 -- core-default suppression
  ) f WHERE f.frag IS NOT NULL AND f.frag <> '';

  RETURN trim(concat_ws(' ', v_frags, v_noun));
END $$;

-- The five new identity columns must fire the recompute trigger. (A core's
-- core_default_equipment is deliberately absent from the list: changing it
-- affects the CHILDREN's names, not the core's own row — callers recompute
-- descendants explicitly, as this migration does.)
DROP TRIGGER IF EXISTS exercises_identity_recompute ON public.exercises;
CREATE TRIGGER exercises_identity_recompute
  AFTER INSERT OR UPDATE OF core_movement_id, is_core, load_position_id, stance_id,
    range_depth_id, symmetry_id, grip_orientation_id, grip_width_id,
    direction_id, support_position_id, arm_position_id, bench_angle_id,
    variant_label_id, name_is_custom ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION trg_exercise_identity();

-- ============================================================================
-- 6) Classification staging data (temp tables; dropped at the end of the file)
-- ============================================================================
CREATE TEMP TABLE _cp_rows (
  exercise_id UUID PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('core','derive','outlier')),
  is_new_core BOOLEAN NOT NULL,
  old_name TEXT,                      -- NULL for the five new core rows
  final_name TEXT NOT NULL,
  name_is_custom BOOLEAN NOT NULL,
  core_id UUID,
  is_movement BOOLEAN NOT NULL,
  family TEXT NOT NULL,
  modality TEXT NOT NULL,
  load_position TEXT, stance TEXT, range_depth TEXT, symmetry TEXT,
  grip_orientation TEXT, grip_width TEXT, bench_angle TEXT,
  direction TEXT, support_position TEXT, arm_position TEXT, variant_slug TEXT,
  equipment TEXT[] NOT NULL,
  styles TEXT[] NOT NULL,
  goals TEXT[] NOT NULL,
  primary_muscles TEXT[] NOT NULL,
  secondary_muscles TEXT[] NOT NULL,
  core_default_equipment TEXT,
  note_wild_aliases TEXT[] NOT NULL,
  suppress_generated_alias BOOLEAN NOT NULL,
  expected_generated TEXT NOT NULL,
  expected_tier INTEGER,
  expected_parent_id UUID
);
INSERT INTO _cp_rows VALUES
  ('0056856b-444d-427d-92a4-899451758fdf', 'outlier', false, 'Kettlebell Deadlift High Pull', 'Kettlebell Deadlift High Pull', true, NULL, false, 'Hinge', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Glutes','Shoulders','Upper Back']::text[], ARRAY['Core','Forearms / Grip','Hamstrings','Neck / Traps']::text[], NULL, '{}'::text[], false, 'Kettlebell Deadlift High Pull', NULL, NULL),
  ('00b1670c-b022-44d1-9587-31655583cdc6', 'outlier', false, '90/90s', '90/90s', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Glutes','Hip Flexors']::text[], ARRAY['Hip Abductors','Hip Adductors']::text[], NULL, '{}'::text[], false, '90/90s', NULL, NULL),
  ('01f01e3a-393d-4819-8834-cf25ea1ba04a', 'core', false, 'Barbell Curl', 'Curl', true, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], '{}'::text[], 'Barbell', '{}'::text[], false, 'Curl', 0, NULL),
  ('01fbbe48-996b-4630-b89f-4d10d5a8ca25', 'outlier', false, 'Offset Reverse Lunge With Shoulder Press', 'Offset Reverse Lunge With Shoulder Press', true, NULL, false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads','Shoulders']::text[], ARRAY['Core','Hamstrings','Triceps']::text[], NULL, '{}'::text[], false, 'Offset Reverse Lunge With Shoulder Press', NULL, NULL),
  ('02e33e2e-af3b-4dc6-96a0-251f6770f986', 'derive', false, 'Landmine Chest Press', 'Landmine Chest Press', true, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell','Landmine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Landmine Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('02f06475-07ec-4b9b-85cf-dd3840810816', 'derive', false, 'Barbell Incline Bench Press (Medium-Grip)', 'Incline Bench Press', false, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, 'Incline', NULL, NULL, NULL, NULL, ARRAY['Barbell','Bench']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Shoulders','Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Incline Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('03603c33-ec76-42ef-8770-f1f9d41bed38', 'derive', false, 'Plank Reaches', 'Plank Reach', true, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'reach', ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Obliques','Shoulders']::text[], NULL, '{}'::text[], false, 'Reach Plank', 1, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b'),
  ('05d652c8-5c69-40d6-87ed-f543eac37b78', 'derive', false, 'Skull Crusher', 'Skull Crusher', true, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', false, 'Push/Press', 'Weightlifting', NULL, 'Supine', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bench','Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Supine Bench Dumbbell Triceps Extension', 1, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb'),
  ('060b2ea6-bf2d-41a2-ae31-75f8498be271', 'core', false, 'Leg Raises', 'Leg Raise', true, '060b2ea6-bf2d-41a2-ae31-75f8498be271', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Hip Flexors']::text[], '{}'::text[], 'Bodyweight, Floor', '{}'::text[], false, 'Leg Raise', 0, NULL),
  ('07b191c2-02ce-4e9c-92a4-1a9cd0feca7f', 'derive', false, 'Kettlebell Suitcase Lunge', 'Kettlebell Suitcase Lunge', false, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', false, 'Lunge', 'Gymnastics', 'Suitcase', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], ARRAY['Core','Forearms / Grip','Hamstrings','Obliques']::text[], NULL, '{}'::text[], false, 'Kettlebell Suitcase Lunge', 1, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9'),
  ('08dbcd57-b14c-4534-8764-648e2920c811', 'outlier', false, 'Kettlebell Gravedigger', 'Kettlebell Gravedigger', true, NULL, false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Shoulders']::text[], ARRAY['Core','Lats','Triceps']::text[], NULL, '{}'::text[], false, 'Kettlebell Gravedigger', NULL, NULL),
  ('0b38eb75-53b2-45e0-8c12-c52bd87fc774', 'core', false, 'Jump', 'Jump', true, '0b38eb75-53b2-45e0-8c12-c52bd87fc774', true, 'Plyometric', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon','Skill']::text[], ARRAY['Calves','Glutes','Hamstrings','Quads']::text[], ARRAY['Core','Hip Flexors','Lower Back']::text[], 'Bodyweight, Floor', '{}'::text[], false, 'Jump', 0, NULL),
  ('0b794684-532a-4a73-82fd-08af7bd4409a', 'derive', false, 'Plank Rows', 'Plank Rows', true, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', false, 'Support/Hold', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'renegade-row', ARRAY['Floor','Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Lats']::text[], ARRAY['Biceps','Shoulders','Upper Back']::text[], NULL, '{}'::text[], false, 'Kettlebell Renegade-Row Plank', 1, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b'),
  ('0b975a66-3c23-44ab-a520-9d839d3aaf50', 'outlier', false, 'Hyperextensions', 'Hyperextensions', true, NULL, false, 'Hinge', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['GHD']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Lower Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Hyperextensions', NULL, NULL),
  ('0b9f321c-af84-454d-a9c8-3890c7b4fec3', 'derive', false, 'Kettlebell Curl', 'Kettlebell Curl', false, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Kettlebell Curl', 1, '01f01e3a-393d-4819-8834-cf25ea1ba04a'),
  ('0c02557b-9688-44d6-a7ac-462a7479b9ab', 'derive', false, 'Plank Pull Thru', 'Dumbbell Plank Pull-Through', true, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pull-through', ARRAY['Bodyweight','Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Obliques','Shoulders']::text[], NULL, '{}'::text[], false, 'Dumbbell Pull-Through Plank', 1, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b'),
  ('0cf83693-8e3a-42e8-97be-ed7b42f9b9a5', 'derive', false, 'Diagonal Delt Raise', 'Diagonal Delt Raise', true, '31994dce-91ac-5b52-9640-98b3c0bb2091', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Diagonal', NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Shoulders']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Diagonal Raise', 1, '31994dce-91ac-5b52-9640-98b3c0bb2091'),
  ('0d32e2b5-9dae-47aa-b4e2-12c929ae7a4a', 'derive', false, 'Hang Clean', 'Hang Clean', false, 'b23b3d0b-de50-4526-8e28-e18377ad9767', true, 'Olympic', 'Weightlifting', 'Hang', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Shoulders']::text[], ARRAY['Core','Forearms / Grip','Quads','Upper Back']::text[], NULL, '{}'::text[], false, 'Hang Clean', 1, 'b23b3d0b-de50-4526-8e28-e18377ad9767'),
  ('0f67fc54-8e83-48d1-b3c0-b6b62a277596', 'derive', false, 'One-Arm Dumbbell Row', 'Single-Arm Dumbbell Row', true, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bench','Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Lats','Upper Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Bench Dumbbell Bent-Over Row', 2, '94b99564-ebb0-4f89-985f-8b4fb7ff27b5'),
  ('0f79c9ab-7ed2-4473-a314-02fbad499143', 'derive', false, 'Donkey Calf Raise', 'Donkey Calf Raise', true, '98e1ca9d-4297-480a-b06b-7f2b8e7a276f', false, 'Activation', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'donkey', ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Calves']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Dumbbell Donkey Calf Raise', 1, '98e1ca9d-4297-480a-b06b-7f2b8e7a276f'),
  ('0fe6557d-00c5-45e9-8897-eac172544b67', 'core', false, 'V-Ups', 'V-Up', true, '0fe6557d-00c5-45e9-8897-eac172544b67', true, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], 'Bodyweight, Floor', '{}'::text[], false, 'V-Up', 0, NULL),
  ('10f0f59b-5673-42c7-810e-9256838ea77f', 'derive', false, 'Chest-to-Bar', 'Chest-to-Bar', true, 'b6439378-a400-4c51-a1fe-c3ce317970cb', true, 'Pull', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'chest-to-bar', ARRAY['Bar']::text[], '{}'::text[], ARRAY['Skill']::text[], ARRAY['Biceps','Lats','Upper Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Chest-to-Bar Pull-Up', 1, 'b6439378-a400-4c51-a1fe-c3ce317970cb'),
  ('111bb1b9-85c9-4c92-b78c-cc9eb96dafb1', 'outlier', false, 'Face Pull', 'Face Pull', true, NULL, false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Upper Back']::text[], ARRAY['Neck / Traps','Shoulders']::text[], NULL, '{}'::text[], false, 'Face Pull', NULL, NULL),
  ('1158ba0c-c803-4e91-8716-08ff2f692e75', 'derive', false, 'Tricep Push Up', 'Close-Grip Push-Up', false, '6fe16d57-5b36-42be-828d-70270e41e912', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, 'Close', NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], ARRAY['Chest','Core','Shoulders']::text[], NULL, '{}'::text[], false, 'Close-Grip Push-Up', 1, '6fe16d57-5b36-42be-828d-70270e41e912'),
  ('11f667e1-0141-4578-a801-8631d7065ccc', 'derive', false, 'V-Sit Press Outs', 'V-Sit Press Outs', true, '4a7438df-8bee-4a3e-802a-72bee480df66', false, 'Push/Press', 'Weightlifting', NULL, 'V-Sit', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], ARRAY['Crush']::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors','Shoulders']::text[], NULL, '{}'::text[], false, 'Crush V-Sit Dumbbell Press', 2, '25809b50-015b-4578-9ac8-e73ec9d8be26'),
  ('1325914c-6886-4cce-986a-5b08f50d0bac', 'outlier', false, 'Pike Walk', 'Pike Walk', true, NULL, false, 'Inversion', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Skill']::text[], ARRAY['Core','Hamstrings','Shoulders']::text[], ARRAY['Upper Back']::text[], NULL, '{}'::text[], false, 'Pike Walk', NULL, NULL),
  ('13367306-3bf6-4e97-a597-5c2f815f59f0', 'derive', false, 'Wide Grip Pull Ups', 'Wide-Grip Pull-Up', false, 'b6439378-a400-4c51-a1fe-c3ce317970cb', false, 'Pull', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, 'Wide', NULL, NULL, NULL, NULL, NULL, ARRAY['Bar']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Lats','Upper Back']::text[], ARRAY['Biceps','Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Wide-Grip Pull-Up', 1, 'b6439378-a400-4c51-a1fe-c3ce317970cb'),
  ('17b26fd8-f8f9-44d3-972e-08f478fa59fa', 'derive', false, 'Toe Taps', 'Toe Taps', true, '060b2ea6-bf2d-41a2-ae31-75f8498be271', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Med Ball']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Med Ball Leg Raise', 1, '060b2ea6-bf2d-41a2-ae31-75f8498be271'),
  ('1b23327e-ee6f-4fa3-9506-eca752b40b0b', 'derive', false, 'V-Bar Pullup', 'Neutral-Grip Pull-Up', false, 'b6439378-a400-4c51-a1fe-c3ce317970cb', false, 'Pull', 'Gymnastics', NULL, NULL, NULL, NULL, 'Neutral', NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bar']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Lats','Upper Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Neutral-Grip Pull-Up', 1, 'b6439378-a400-4c51-a1fe-c3ce317970cb'),
  ('1c205c16-37a4-46d5-8fa6-82bd1afaa47a', 'derive', false, 'Incline Dumbbell Press', 'Incline Dumbbell Press', true, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, 'Incline', NULL, NULL, NULL, NULL, ARRAY['Bench','Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Shoulders','Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Incline Dumbbell Bench Press', 2, '41da4c6b-d777-4266-adec-cb6cbff347d2'),
  ('1ccf0321-0115-4602-a51e-03611208b723', 'core', false, 'Ski Erg', 'Ski', true, '1ccf0321-0115-4602-a51e-03611208b723', true, 'Ski', 'Monostructural', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Full Body']::text[], '{}'::text[], 'Ski', '{}'::text[], false, 'Ski', 0, NULL),
  ('1cd276db-2c03-491c-a006-b2d1ec0ddfed', 'core', false, 'Bike', 'Bike', true, '1cd276db-2c03-491c-a006-b2d1ec0ddfed', true, 'Bike', 'Monostructural', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Full Body']::text[], '{}'::text[], 'Bike', '{}'::text[], false, 'Bike', 0, NULL),
  ('1cd3ad50-d9c5-439b-8dcc-590bb1887d50', 'core', false, 'Squat', 'Squat', true, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50', true, 'Squat', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], ARRAY['Core','Lower Back']::text[], 'Bodyweight', '{}'::text[], false, 'Squat', 0, NULL),
  ('1d63cd53-6f8c-41e9-9a5f-3d6080993196', 'derive', false, 'Kettlebell Reverse Lunge', 'Kettlebell Reverse Lunge', true, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', false, 'Lunge', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Reverse', NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], ARRAY['Calves','Core','Hamstrings']::text[], NULL, '{}'::text[], false, 'Reverse Kettlebell Lunge', 1, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9'),
  ('1e847c3a-5aa6-4078-a9a6-9f3008357f34', 'derive', false, 'V Sit Shoulder Press', 'V Sit Shoulder Press', true, '4a7438df-8bee-4a3e-802a-72bee480df66', false, 'Push/Press', 'Weightlifting', NULL, 'V-Sit', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Shoulders']::text[], ARRAY['Hip Flexors','Triceps']::text[], NULL, '{}'::text[], false, 'V-Sit Kettlebell Press', 1, '4a7438df-8bee-4a3e-802a-72bee480df66'),
  ('202c394f-a35e-41d5-9ceb-bf00b0d88c1e', 'derive', false, 'V Sit Halos', 'V-Sit Halo', false, 'c2c05041-144b-45c7-9e54-5f4bec5b7a6a', false, 'Rotation', 'Weightlifting', NULL, 'V-Sit', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Shoulders']::text[], ARRAY['Hip Flexors','Upper Back']::text[], NULL, '{}'::text[], false, 'V-Sit Halo', 1, 'c2c05041-144b-45c7-9e54-5f4bec5b7a6a'),
  ('20af318d-079c-4146-8494-b43e35375cdb', 'derive', false, 'Dumbbell Bulgarian Split Squat', 'Dumbbell Bulgarian Split Squat', true, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', false, 'Lunge', 'Gymnastics', 'Suitcase', 'Split', NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bench','Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Split Bench Dumbbell Suitcase Lunge', 1, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9'),
  ('20ca987f-cb4f-4923-bc64-a5d9704186f4', 'derive', false, 'Weighted Dips', 'Weighted Dip', false, 'fe1484e2-c645-4c11-95cf-ea1669af44f9', false, 'Push/Press', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], ARRAY['Weighted']::text[], ARRAY['Strength']::text[], ARRAY['Chest','Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Weighted Dip', 1, 'fe1484e2-c645-4c11-95cf-ea1669af44f9'),
  ('2222e3be-0481-4103-827c-8fb0f3eb78c5', 'core', false, 'Leg Press', 'Leg Press', true, '2222e3be-0481-4103-827c-8fb0f3eb78c5', false, 'Squat', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], '{}'::text[], 'Machine', '{}'::text[], false, 'Leg Press', 0, NULL),
  ('225badb2-a9ac-43e0-897a-16e4023a3fdf', 'outlier', false, 'Windshield Wipers', 'Windshield Wipers', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Hip Flexors','Lower Back']::text[], NULL, '{}'::text[], false, 'Windshield Wipers', NULL, NULL),
  ('22a2b36e-e934-44e1-843c-92d55425d8c4', 'core', false, 'Leg Curl', 'Leg Curl', true, '22a2b36e-e934-44e1-843c-92d55425d8c4', false, 'Hinge', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Hamstrings']::text[], '{}'::text[], 'Machine', '{}'::text[], false, 'Leg Curl', 0, NULL),
  ('24a81876-d389-4ba9-a35a-87bb7ac70fbd', 'outlier', false, 'Ab Rollout', 'Ab Rollout', true, NULL, false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Lats','Shoulders']::text[], NULL, '{}'::text[], false, 'Ab Rollout', NULL, NULL),
  ('2566a7b5-c7c3-43d2-a1ef-16f438a67e4c', 'derive', false, 'Waiter''s Carry', 'Waiter''s Carry', true, '87377b27-531d-5a4e-ab8f-4faf947495e3', true, 'Carry', 'Weightlifting', 'Waiter', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Shoulders']::text[], ARRAY['Forearms / Grip','Obliques','Upper Back']::text[], NULL, '{}'::text[], false, 'Kettlebell Waiter Carry', 1, '87377b27-531d-5a4e-ab8f-4faf947495e3'),
  ('25809b50-015b-4578-9ac8-e73ec9d8be26', 'derive', false, 'Dumbbell Shoulder Press', 'Dumbbell Shoulder Press', true, '4a7438df-8bee-4a3e-802a-72bee480df66', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Shoulders','Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Dumbbell Press', 1, '4a7438df-8bee-4a3e-802a-72bee480df66'),
  ('2702fd09-a0d4-40c6-86e0-f42bb9ff9246', 'outlier', false, 'Russian Slams', 'Russian Slams', true, NULL, false, 'Throw', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Med Ball']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Russian Slams', NULL, NULL),
  ('2997561f-fe30-4e81-a9cf-00548ea689ff', 'derive', false, 'Bicycles', 'Bicycles', true, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Alternating Crunch', 1, 'da5fcd1e-b402-41ae-a144-5596aaa510d1'),
  ('2a5c6596-8af7-4c27-991e-2badf46feea1', 'derive', false, 'Close-Grip Barbell Bench Press', 'Close-Grip Bench Press', false, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, 'Close', NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell','Bench']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Close-Grip Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('2a8be090-b655-482a-9982-94e33b377af7', 'derive', false, 'Single-Arm 45° Triceps Extension', 'Single-Arm 45° Triceps Extension', true, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], ARRAY['Shoulders']::text[], NULL, '{}'::text[], false, 'Triceps Extension', 1, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb'),
  ('2aef1947-7d3b-4bc4-8ae6-6e42a4c352ba', 'outlier', false, 'Pigeon Stance Hip Stretch', 'Pigeon Stance Hip Stretch', true, NULL, false, 'Stretching', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor']::text[], '{}'::text[], ARRAY['Stretching']::text[], ARRAY['Glutes','Hip Flexors']::text[], ARRAY['Hip Abductors']::text[], NULL, '{}'::text[], false, 'Pigeon Stance Hip Stretch', NULL, NULL),
  ('2c3aae99-237b-4c58-8622-13a25f1dc9e4', 'derive', false, 'Cable-Resisted Toe Touches', 'Cable-Resisted Toe Touches', true, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'toe-tap', ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Cable Toe-Tap Crunch', 2, '47d9bcba-1b05-4a77-bf42-c908d1b8ea95'),
  ('2ca66465-6f3c-4a5c-b149-76238a463f05', 'derive', false, 'Overspeed Band Jump', 'Overspeed Band Jump', true, '0b38eb75-53b2-45e0-8c12-c52bd87fc774', false, 'Plyometric', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bands']::text[], ARRAY['Assisted']::text[], ARRAY['Skill']::text[], ARRAY['Calves','Glutes','Quads']::text[], ARRAY['Core','Hamstrings']::text[], NULL, '{}'::text[], false, 'Assisted Bands Jump', 1, '0b38eb75-53b2-45e0-8c12-c52bd87fc774'),
  ('2cefc88f-18c9-42b1-b045-947035cf20b3', 'core', false, 'Handstand Walk', 'Handstand Walk', true, '2cefc88f-18c9-42b1-b045-947035cf20b3', true, 'Inversion', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Skill']::text[], ARRAY['Core','Shoulders']::text[], '{}'::text[], 'Bodyweight, Floor', '{}'::text[], false, 'Handstand Walk', 0, NULL),
  ('2dd8abdf-ddb3-4733-a959-ae5a389f62fb', 'derive', false, 'Zercher Pin Squat', 'Zercher Pin Squat', true, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50', false, 'Squat', 'Gymnastics', 'Zercher', NULL, 'Lockout Only', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], ARRAY['Core','Upper Back']::text[], NULL, '{}'::text[], false, 'Lockout Zercher Squat', 1, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50'),
  ('2e1723ed-40b6-474f-be82-115f3157e15b', 'derive', false, 'Seated Cable Rows', 'Seated Cable Row', true, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Pull', 'Weightlifting', NULL, 'Seated', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Lats','Upper Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Seated Cable Bent-Over Row', 1, 'b6879563-ab0d-5bc6-9b44-cab09315d939'),
  ('2e76626e-5a55-4c02-b52c-0745fa4a1ec2', 'outlier', false, 'Band Lateral Walk', 'Band Lateral Walk', true, NULL, true, 'Activation', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bands','Floor']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Glutes','Hip Abductors']::text[], ARRAY['Core','Hip Flexors','Quads']::text[], NULL, '{}'::text[], false, 'Band Lateral Walk', NULL, NULL),
  ('2f05705b-6812-47e1-b1bc-4faf873fa826', 'derive', false, 'Weighted Sit-Up', 'Weighted Sit-Up', true, '3443dcdb-8b96-4dc2-a492-c174c0d1cedf', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell','Floor']::text[], ARRAY['Weighted']::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Weighted Dumbbell Sit-Up', 1, '3443dcdb-8b96-4dc2-a492-c174c0d1cedf'),
  ('2fc183f8-e1a0-4a1e-ac1c-be4bf2871366', 'derive', false, 'Back Squat ', 'Back Squat', false, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50', true, 'Squat', 'Gymnastics', 'Back', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], ARRAY['Core','Lower Back','Upper Back']::text[], NULL, '{}'::text[], false, 'Back Squat', 1, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50'),
  ('3122cd2f-a71d-4a7a-a763-ca90ad843690', 'outlier', false, 'Toe-Driver', 'Toe-Driver', true, NULL, false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Toe-Driver', NULL, NULL),
  ('316c08a4-4e36-4c85-844c-0c4c995a2738', 'derive', false, 'Weighted Leg Raise', 'Weighted Leg Raise', true, '060b2ea6-bf2d-41a2-ae31-75f8498be271', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], ARRAY['Weighted']::text[], ARRAY['Strength']::text[], ARRAY['Core','Hip Flexors']::text[], ARRAY['Obliques']::text[], NULL, '{}'::text[], false, 'Weighted Dumbbell Leg Raise', 1, '060b2ea6-bf2d-41a2-ae31-75f8498be271'),
  ('3177e399-ae13-48b1-a6b7-d650f28301c6', 'derive', false, 'Underhand Lat Pulldown', 'Underhand Lat Pulldown', false, '90d63ecc-cebe-5ace-806d-45c8560f973f', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, 'Supinated', NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Lats']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Underhand Lat Pulldown', 1, '90d63ecc-cebe-5ace-806d-45c8560f973f'),
  ('318731bc-0b26-4779-9aeb-f20eb1780c6d', 'derive', false, 'Bicep Curl', 'Dumbbell Curl', false, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Forearms / Grip']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Dumbbell Curl', 1, '01f01e3a-393d-4819-8834-cf25ea1ba04a'),
  ('31994dce-91ac-5b52-9640-98b3c0bb2091', 'core', true, NULL, 'Raise', true, '31994dce-91ac-5b52-9640-98b3c0bb2091', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], 'Dumbbell', '{}'::text[], false, 'Raise', 0, NULL),
  ('327c07d2-756b-410f-8297-dd21f760779d', 'derive', false, 'Overhand Curl', 'Overhand Curl', true, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, 'Pronated', NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Dumbbell Curl', 2, '318731bc-0b26-4779-9aeb-f20eb1780c6d'),
  ('328c34a9-af1e-433e-bde0-a19b5f71fddc', 'core', false, 'Tricep Pushdown', 'Triceps Pushdown', true, '328c34a9-af1e-433e-bde0-a19b5f71fddc', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], '{}'::text[], 'Cable', '{}'::text[], false, 'Triceps Pushdown', 0, NULL),
  ('3443dcdb-8b96-4dc2-a492-c174c0d1cedf', 'core', false, 'Sit-Up', 'Sit-Up', true, '3443dcdb-8b96-4dc2-a492-c174c0d1cedf', true, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], 'Bodyweight, Floor', '{}'::text[], false, 'Sit-Up', 0, NULL),
  ('36dd4c3b-d00a-4e75-951d-60ed20edf1bf', 'derive', false, 'Single Dumbbell Strict Press', 'Single Dumbbell Strict Press', true, '4a7438df-8bee-4a3e-802a-72bee480df66', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], ARRAY['Strict']::text[], ARRAY['Strength']::text[], ARRAY['Shoulders']::text[], ARRAY['Core','Triceps']::text[], NULL, '{}'::text[], false, 'Strict Dumbbell Press', 2, '25809b50-015b-4578-9ac8-e73ec9d8be26'),
  ('386926db-38fb-4da3-abdb-6ae22bea8aa5', 'derive', false, 'Jumping Split Lunges', 'Jumping Split Lunge', true, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', false, 'Lunge', 'Gymnastics', NULL, 'Split', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], ARRAY['Plyometric (Explosive)']::text[], ARRAY['MetCon']::text[], ARRAY['Glutes','Quads']::text[], ARRAY['Calves','Core','Hamstrings']::text[], NULL, '{}'::text[], false, 'Plyo Split Lunge', 1, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9'),
  ('3d244541-04d3-4ff6-943e-ccd8517d5b7f', 'core', false, 'Swimming', 'Swim', true, '3d244541-04d3-4ff6-943e-ccd8517d5b7f', true, 'Swim', 'Monostructural', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Full Body']::text[], '{}'::text[], 'Bodyweight', '{}'::text[], false, 'Swim', 0, NULL),
  ('3da442db-1cff-40e2-8672-50525710f392', 'derive', false, 'Flutter Kicks', 'Flutter Kicks', true, '060b2ea6-bf2d-41a2-ae31-75f8498be271', false, 'Midline', 'Gymnastics', NULL, NULL, 'Partial', 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Core','Hip Flexors']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Partial Alternating Leg Raise', 2, 'fbc40045-4a5a-4b78-a3da-77f59e94def5'),
  ('3ea89e52-8ef8-458e-a66a-307bd078c219', 'derive', false, 'Bulgarian Split Squat', 'Bulgarian Split Squat', true, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', true, 'Lunge', 'Gymnastics', NULL, 'Split', NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bench','Bodyweight']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Split Bench Lunge', 1, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9'),
  ('40030b7f-c667-4b67-8e7a-d64c1ff9b132', 'derive', false, 'Dumbbell Bridge Fly', 'Dumbbell Bridge Fly', true, '80d46a74-c62a-4849-920f-22d326bf7cef', false, 'Push/Press', 'Weightlifting', NULL, 'Bridge', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Glutes','Shoulders']::text[], NULL, '{}'::text[], false, 'Bridge Chest Fly', 1, '80d46a74-c62a-4849-920f-22d326bf7cef'),
  ('402b0f81-7d42-4705-8bc3-c5ea3df15026', 'derive', false, 'Alternating Gorilla Rows', 'Alternating Gorilla Row', true, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Lats','Upper Back']::text[], ARRAY['Biceps','Core','Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Alternating Kettlebell Bent-Over Row', 2, 'b08c3cf8-b02a-4953-8a72-058b3ea2a00b'),
  ('4055eaf8-3df8-4865-a5da-3b31bb18a6e4', 'outlier', false, 'Sumo RDL To Lateral Lunge Clean', 'Sumo RDL To Lateral Lunge Clean', true, NULL, false, 'Lunge', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], ARRAY['Core','Hip Abductors','Hip Adductors','Shoulders']::text[], NULL, '{}'::text[], false, 'Sumo RDL To Lateral Lunge Clean', NULL, NULL),
  ('41071b35-8024-4038-a593-0a1876f19dbc', 'derive', false, 'Seated Calf Raise', 'Seated Calf Raise', true, '98e1ca9d-4297-480a-b06b-7f2b8e7a276f', false, 'Activation', 'Weightlifting', NULL, 'Seated', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Machine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Calves']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Seated Machine Calf Raise', 1, '98e1ca9d-4297-480a-b06b-7f2b8e7a276f'),
  ('41da4c6b-d777-4266-adec-cb6cbff347d2', 'derive', false, 'Dumbbell Bench Press', 'Dumbbell Bench Press', false, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bench','Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Shoulders','Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Dumbbell Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('46a31718-8e74-4b71-9e1a-eb8474089261', 'derive', false, 'Single-Arm Cable Fly', 'Single-Arm Cable Fly', true, '80d46a74-c62a-4849-920f-22d326bf7cef', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Shoulders']::text[], NULL, '{}'::text[], false, 'Cable Chest Fly', 2, 'fdbe541d-95b5-4b16-b80d-688f54ef50ed'),
  ('46b2344d-5f50-4168-8ecd-99323965b7aa', 'derive', false, 'Flat Bench Cable Flyes', 'Flat Bench Cable Flyes', true, '80d46a74-c62a-4849-920f-22d326bf7cef', false, 'Push/Press', 'Weightlifting', NULL, 'Supine', NULL, NULL, NULL, NULL, 'Flat', NULL, NULL, NULL, NULL, ARRAY['Bench','Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Supine Cable Chest Fly', 2, 'fdbe541d-95b5-4b16-b80d-688f54ef50ed'),
  ('46e98a88-8396-43ab-ab0c-da633e4e9c40', 'derive', false, 'Kettlebell Kickstand Deadlift', 'Staggered Kettlebell Deadlift', false, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532', false, 'Hinge', 'Weightlifting', NULL, 'Staggered', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings']::text[], ARRAY['Core','Forearms / Grip','Lower Back']::text[], NULL, '{}'::text[], false, 'Staggered Kettlebell Deadlift', 1, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532'),
  ('470008aa-67df-4d72-b74b-aff43b4d3ec6', 'core', false, 'Snatch', 'Snatch', true, '470008aa-67df-4d72-b74b-aff43b4d3ec6', true, 'Olympic', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Full Body','Quads','Shoulders']::text[], '{}'::text[], 'Barbell', '{}'::text[], false, 'Snatch', 0, NULL),
  ('47273ede-cf88-4d25-9d06-bb71ed30e14c', 'outlier', false, 'Overhand Grip Curl To Press', 'Overhand Grip Curl To Press', true, NULL, false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Shoulders']::text[], ARRAY['Forearms / Grip','Triceps']::text[], NULL, '{}'::text[], false, 'Overhand Grip Curl To Press', NULL, NULL),
  ('477d482e-f23f-42eb-b060-bcc916c2271c', 'derive', false, 'Cross Body Single-Leg Romanian Deadlift', 'Cross Body Single-Leg Romanian Deadlift', true, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532', false, 'Hinge', 'Weightlifting', NULL, 'Single-Leg', 'Partial', 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings']::text[], ARRAY['Core','Forearms / Grip','Lower Back']::text[], NULL, '{}'::text[], false, 'Partial Single-Leg Kettlebell Deadlift', 1, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532'),
  ('47d9bcba-1b05-4a77-bf42-c908d1b8ea95', 'derive', false, 'Cable Crunch', 'Cable Crunch', false, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Cable Crunch', 1, 'da5fcd1e-b402-41ae-a144-5596aaa510d1'),
  ('47fb4553-1439-437f-b929-da8f132151bd', 'derive', false, 'Knee To Elbow', 'Knee To Elbow', true, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, 'Cross-Body / Rotational', NULL, NULL, NULL, NULL, NULL, NULL, 'elbow-reach', ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Hip Flexors','Shoulders']::text[], NULL, '{}'::text[], false, 'Cross-Body Elbow-Reach Crunch', 2, 'd8446175-d8b7-410a-a2a6-75490a8e6175'),
  ('4981bd90-d1c2-4251-a296-d5fa565ec09b', 'core', false, 'Around The Worlds', 'Around the World', true, '4981bd90-d1c2-4251-a296-d5fa565ec09b', false, 'Rotation', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Shoulders']::text[], 'Bodyweight', '{}'::text[], false, 'Around the World', 0, NULL),
  ('4a7438df-8bee-4a3e-802a-72bee480df66', 'core', false, 'Strict Press', 'Press', true, '4a7438df-8bee-4a3e-802a-72bee480df66', true, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Shoulders','Triceps']::text[], '{}'::text[], 'Barbell', '{}'::text[], false, 'Press', 0, NULL),
  ('4a933d94-d40d-4a6f-aff9-aab851f7f5f5', 'derive', false, 'Crush Push Ups', 'Crush Push-Up', false, '6fe16d57-5b36-42be-828d-70270e41e912', false, 'Push/Press', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Floor']::text[], ARRAY['Crush']::text[], ARRAY['Strength']::text[], ARRAY['Chest','Triceps']::text[], ARRAY['Core','Shoulders']::text[], NULL, '{}'::text[], false, 'Crush Push-Up', 1, '6fe16d57-5b36-42be-828d-70270e41e912'),
  ('4bfc73b8-8e74-4bdf-862f-fa63bd988f0e', 'derive', false, 'Hanging Knee Raises', 'Hanging Knee Raise', true, '060b2ea6-bf2d-41a2-ae31-75f8498be271', true, 'Midline', 'Gymnastics', NULL, NULL, 'Partial', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bar']::text[], '{}'::text[], ARRAY['Skill']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Partial Bar Leg Raise', 2, 'c37656f7-7768-4ed2-a473-f53eb97e7f6b'),
  ('4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', 'core', true, NULL, 'Plank', true, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], 'Bodyweight, Floor', '{}'::text[], false, 'Plank', 0, NULL),
  ('50d7aad5-0542-43bf-8b74-0631b67bfcad', 'derive', false, 'Seated Cable Chest Fly', 'Seated Cable Chest Fly', false, '80d46a74-c62a-4849-920f-22d326bf7cef', false, 'Push/Press', 'Weightlifting', NULL, 'Seated', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Shoulders']::text[], NULL, '{}'::text[], false, 'Seated Cable Chest Fly', 2, 'fdbe541d-95b5-4b16-b80d-688f54ef50ed'),
  ('518bb58b-48dd-4736-a597-63af49d07316', 'derive', false, 'Depth Jump', 'Depth Jump', true, '0b38eb75-53b2-45e0-8c12-c52bd87fc774', false, 'Plyometric', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Box']::text[], ARRAY['Plyometric (Explosive)']::text[], ARRAY['Skill']::text[], ARRAY['Calves','Glutes','Quads']::text[], ARRAY['Core','Hamstrings']::text[], NULL, '{}'::text[], false, 'Plyo Box Jump', 1, '0b38eb75-53b2-45e0-8c12-c52bd87fc774'),
  ('52cc2745-0e31-436f-9468-573ee6a70882', 'derive', false, 'Wide Grip Lat Pulldown', 'Wide-Grip Lat Pulldown', false, '90d63ecc-cebe-5ace-806d-45c8560f973f', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, 'Wide', NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Lats','Upper Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Wide-Grip Lat Pulldown', 1, '90d63ecc-cebe-5ace-806d-45c8560f973f'),
  ('54261211-c77f-473c-abac-8a603633975c', 'derive', false, 'Dumbbell Walking Lunge', 'Dumbbell Walking Lunge', true, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', false, 'Lunge', 'Gymnastics', 'Suitcase', NULL, NULL, NULL, NULL, NULL, NULL, 'Walking', NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Walking Dumbbell Suitcase Lunge', 1, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9'),
  ('542bd30f-234c-4190-baab-0d7a08477617', 'derive', false, 'Kettlebell Horn Curl', 'Kettlebell Horn Curl', false, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'horn', ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Kettlebell Horn Curl', 2, '0b9f321c-af84-454d-a9c8-3890c7b4fec3'),
  ('54b39df9-219e-4870-834c-ee1e9c6199b0', 'outlier', false, 'Leg Extension', 'Leg Extension', true, NULL, false, 'Squat', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Machine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Leg Extension', NULL, NULL),
  ('55493476-6af2-4fd3-92c9-d40176e56b6b', 'derive', false, 'Crunch And Replace', 'Crunch And Replace', true, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Med Ball']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Med Ball Crunch', 1, 'da5fcd1e-b402-41ae-a144-5596aaa510d1'),
  ('5645395b-73b1-49de-bb95-35d2bdc49749', 'derive', false, 'Close Grip Seated Hammer Curl', 'Close Grip Seated Hammer Curl', true, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, 'Seated', NULL, NULL, 'Neutral', 'Close', NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Close-Grip Neutral-Grip Seated Dumbbell Curl', 3, 'ce8b4758-21a4-4f68-9285-ef1311e29e3a'),
  ('56c7f46c-f938-4cb5-812f-e1f0ca30c964', 'derive', false, 'Kettlebell Hang Snatch', 'Kettlebell Hang Snatch', false, '470008aa-67df-4d72-b74b-aff43b4d3ec6', false, 'Olympic', 'Weightlifting', 'Hang', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Shoulders']::text[], ARRAY['Core','Forearms / Grip','Hamstrings','Upper Back']::text[], NULL, '{}'::text[], false, 'Kettlebell Hang Snatch', 1, '470008aa-67df-4d72-b74b-aff43b4d3ec6'),
  ('58473898-f9ae-4a32-98bd-28ecc5896919', 'derive', false, 'Tall Kneeling Offset Press', 'Tall Kneeling Offset Press', true, '4a7438df-8bee-4a3e-802a-72bee480df66', false, 'Push/Press', 'Weightlifting', NULL, 'Kneeling', NULL, 'Offset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Shoulders']::text[], ARRAY['Obliques','Triceps']::text[], NULL, '{}'::text[], false, 'Kneeling Kettlebell Press', 2, '81554dea-0beb-4bd1-8824-7f75c328b695'),
  ('5ccd7117-78f1-453a-a51e-ae45654cd84d', 'derive', false, 'Heel Tap Crunches', 'Heel Tap Crunch', true, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Lateral', NULL, NULL, NULL, ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Obliques']::text[], ARRAY['Core']::text[], NULL, '{}'::text[], false, 'Lateral Crunch', 1, 'da5fcd1e-b402-41ae-a144-5596aaa510d1'),
  ('5d7a7bde-c085-403a-8eb4-79d3aafa4d53', 'derive', false, 'Bar Push-Up', 'Barbell Push-Up', false, '6fe16d57-5b36-42be-828d-70270e41e912', false, 'Push/Press', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Triceps']::text[], ARRAY['Core','Shoulders']::text[], NULL, '{}'::text[], false, 'Barbell Push-Up', 1, '6fe16d57-5b36-42be-828d-70270e41e912'),
  ('5dd834e6-02c3-4e01-b472-efbe8d32fa53', 'derive', false, 'Walkout Push-up', 'Walkout Push-Up', false, '6fe16d57-5b36-42be-828d-70270e41e912', false, 'Push/Press', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'walkout', ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Chest','Triceps']::text[], ARRAY['Core','Shoulders']::text[], NULL, '{}'::text[], false, 'Walkout Push-Up', 1, '6fe16d57-5b36-42be-828d-70270e41e912'),
  ('5e35a841-1f39-44e6-ae61-e21317afc890', 'outlier', false, 'Iron Tridents', 'Iron Tridents', true, NULL, false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor','Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Shoulders']::text[], ARRAY['Hip Flexors','Triceps']::text[], NULL, '{}'::text[], false, 'Iron Tridents', NULL, NULL),
  ('62aa20f5-669d-4b89-9da5-95a3d6784af5', 'derive', false, 'Single-Arm Cable Lat Fly', 'Single-Arm Cable Lat Fly', true, '90d63ecc-cebe-5ace-806d-45c8560f973f', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, 'Straight-Arm', NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Lats']::text[], ARRAY['Shoulders']::text[], NULL, '{}'::text[], false, 'Straight-Arm Lat Pulldown', 2, '80bb759f-7e67-4d02-be05-87c680809e17'),
  ('649bb575-4931-40b4-8236-3e84fed0eeeb', 'derive', false, 'Decline Bench Press', 'Decline Bench Press', false, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, 'Decline', NULL, NULL, NULL, NULL, ARRAY['Barbell','Bench']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Decline Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('6569cb89-9e99-4ab8-a92f-006cff2880c3', 'outlier', false, 'Single-Leg Punch', 'Single-Leg Punch', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Core','Glutes']::text[], ARRAY['Calves','Obliques','Shoulders']::text[], NULL, '{}'::text[], false, 'Single-Leg Punch', NULL, NULL),
  ('66a213ee-f78f-4b3b-a9e3-acebe97eab59', 'core', false, 'Rope Climb', 'Rope Climb', true, '66a213ee-f78f-4b3b-a9e3-acebe97eab59', true, 'Climb', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Core','Forearms / Grip','Lats']::text[], ARRAY['Glutes','Hip Flexors','Shoulders','Upper Back']::text[], 'Rope', '{}'::text[], false, 'Rope Climb', 0, NULL),
  ('69c1541a-4d21-4384-949f-2ccb8cfc8338', 'derive', false, 'Seated Leg Curls', 'Seated Leg Curls', true, '22a2b36e-e934-44e1-843c-92d55425d8c4', false, 'Hinge', 'Weightlifting', NULL, 'Seated', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Machine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Hamstrings']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Seated Leg Curl', 1, '22a2b36e-e934-44e1-843c-92d55425d8c4'),
  ('69d48874-e10c-4168-b167-e03955dc67d3', 'derive', false, 'Power Clean', 'Power Clean', true, 'b23b3d0b-de50-4526-8e28-e18377ad9767', true, 'Olympic', 'Weightlifting', NULL, NULL, 'Partial', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['MetCon','Skill','Strength']::text[], ARRAY['Glutes','Hamstrings','Neck / Traps','Quads']::text[], ARRAY['Calves','Core','Forearms / Grip','Lats','Shoulders']::text[], NULL, '{}'::text[], false, 'Partial Clean', 1, 'b23b3d0b-de50-4526-8e28-e18377ad9767'),
  ('6dfbc753-9048-4a32-8a9a-3e90d3d24cd3', 'derive', false, 'Single-Arm Powerbomb', 'Single-Arm Overhead Triceps Extension', true, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, 'Overhead', NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], '{}'::text[], NULL, '{}'::text[], true, 'Overhead Dumbbell Triceps Extension', 2, '730c9097-4ef9-410d-81fc-d0e0d79113ac'),
  ('6dfc9b9d-02a8-467c-af5c-7e95a5673b3a', 'derive', false, 'Inverted Row', 'Bar Inverted Row', false, 'd07de065-5628-4634-bcaa-bc35e129f7e0', false, 'Pull', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bar']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Upper Back']::text[], ARRAY['Biceps','Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Bar Inverted Row', 1, 'd07de065-5628-4634-bcaa-bc35e129f7e0'),
  ('6fe16d57-5b36-42be-828d-70270e41e912', 'core', false, 'Push-up', 'Push-Up', true, '6fe16d57-5b36-42be-828d-70270e41e912', true, 'Push/Press', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Skill']::text[], ARRAY['Chest','Core','Triceps']::text[], '{}'::text[], 'Bodyweight, Floor', '{}'::text[], false, 'Push-Up', 0, NULL),
  ('71367b5a-0afe-4af0-a6ea-d00a8fc45690', 'derive', false, 'Box Jump', 'Box Jump', false, '0b38eb75-53b2-45e0-8c12-c52bd87fc774', true, 'Plyometric', 'Gymnastics', NULL, NULL, 'Box', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Box','Floor']::text[], '{}'::text[], ARRAY['MetCon','Skill']::text[], ARRAY['Calves','Glutes','Hamstrings','Quads']::text[], ARRAY['Core','Hip Flexors','Lower Back']::text[], NULL, '{}'::text[], false, 'Box Jump', 1, '0b38eb75-53b2-45e0-8c12-c52bd87fc774'),
  ('724ae756-5b28-483c-9c03-28bc160ce128', 'outlier', false, 'Sissy Squat', 'Sissy Squat', true, NULL, false, 'Squat', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Sissy Squat', NULL, NULL),
  ('72b6914d-98c7-4f2e-a642-40b28b240608', 'outlier', false, 'Alternating Cossack Squat To Halo', 'Alternating Cossack Squat To Halo', true, NULL, false, 'Squat', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Hip Adductors','Quads','Shoulders']::text[], ARRAY['Core','Glutes','Obliques']::text[], NULL, '{}'::text[], false, 'Alternating Cossack Squat To Halo', NULL, NULL),
  ('730c9097-4ef9-410d-81fc-d0e0d79113ac', 'derive', false, 'Overhead Extension', 'Overhead Extension', true, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Overhead', NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Overhead Dumbbell Triceps Extension', 1, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb'),
  ('73c9e31f-54cf-48e7-ac2c-30bf5750ac51', 'outlier', false, 'Single-Arm Upright Row', 'Single-Arm Upright Row', true, NULL, false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Shoulders']::text[], ARRAY['Biceps','Forearms / Grip','Neck / Traps']::text[], NULL, '{}'::text[], false, 'Single-Arm Upright Row', NULL, NULL),
  ('75cf65f4-8e6a-444d-8166-080699972de4', 'derive', false, 'Alternating Dumbbell Press', 'Alternating Dumbbell Press', false, '4a7438df-8bee-4a3e-802a-72bee480df66', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Alternating Dumbbell Press', 2, '25809b50-015b-4578-9ac8-e73ec9d8be26'),
  ('79963968-9188-455e-87f1-98758d2eb637', 'derive', false, 'Kettlebell Plank Pull Through', 'Kettlebell Plank Pull Through', true, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pull-through', ARRAY['Floor','Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Forearms / Grip','Shoulders','Upper Back']::text[], NULL, '{}'::text[], false, 'Kettlebell Pull-Through Plank', 1, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b'),
  ('7a9c7132-88c9-47f1-afe4-2b331f0d4b7c', 'derive', false, 'Romanian Deadlift', 'Romanian Deadlift', true, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532', true, 'Hinge', 'Weightlifting', NULL, NULL, 'Partial', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Partial Deadlift', 1, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532'),
  ('7baeaa57-c6d2-4f02-ab50-3abe3d9878ef', 'derive', false, 'Toe Tap Crunch', 'Toe-Tap Crunch', false, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'toe-tap', ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Toe-Tap Crunch', 1, 'da5fcd1e-b402-41ae-a144-5596aaa510d1'),
  ('7d4eb547-1967-45d9-9ffa-f1408b8bcc27', 'derive', false, 'Kettlebell Push Out', 'Kettlebell Push Out', true, '4a7438df-8bee-4a3e-802a-72bee480df66', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], ARRAY['Crush']::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Crush Kettlebell Press', 1, '4a7438df-8bee-4a3e-802a-72bee480df66'),
  ('7da78ee8-5cb1-469d-ab41-6259bf202a8e', 'derive', false, 'Alternating Gunslinger Cleans', 'Alternating Gunslinger Cleans', true, 'b23b3d0b-de50-4526-8e28-e18377ad9767', false, 'Olympic', 'Weightlifting', 'Suitcase', NULL, NULL, 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Shoulders']::text[], ARRAY['Core','Forearms / Grip','Hamstrings','Quads']::text[], NULL, ARRAY['Alt Gunslinger Cleans']::text[], false, 'Alternating Kettlebell Suitcase Clean', 2, '96604640-4e25-4993-9b5d-902eb541ec4b'),
  ('7daf1c99-796b-4f19-96f0-3076ba8fcb78', 'outlier', false, 'Tibialis Wall Raises', 'Tibialis Wall Raises', true, NULL, false, 'Activation', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor','Wall']::text[], '{}'::text[], ARRAY['Recovery']::text[], ARRAY['Calves']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Tibialis Wall Raises', NULL, NULL),
  ('7edf591c-d068-4139-bc1f-f0151a0489e6', 'derive', false, 'Alternating Dumbbell Flys', 'Alternating Chest Fly', false, '80d46a74-c62a-4849-920f-22d326bf7cef', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bench','Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Shoulders']::text[], NULL, '{}'::text[], false, 'Alternating Chest Fly', 1, '80d46a74-c62a-4849-920f-22d326bf7cef'),
  ('7f9583a4-9c4f-4680-a45c-04822718737f', 'derive', false, 'Alternating Reverse Lunges', 'Alternating Reverse Lunge', true, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', false, 'Lunge', 'Gymnastics', NULL, NULL, NULL, 'Alternating', NULL, NULL, NULL, 'Reverse', NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], ARRAY['Calves','Core','Hamstrings']::text[], NULL, '{}'::text[], false, 'Reverse Alternating Lunge', 2, 'f0b6fe29-c3b0-4c1e-a7f2-7ed11a013056'),
  ('80bb759f-7e67-4d02-be05-87c680809e17', 'derive', false, 'Straight Arm Cable Rope Lat Pulldown', 'Straight-Arm Lat Pulldown', false, '90d63ecc-cebe-5ace-806d-45c8560f973f', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Straight-Arm', NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Lats']::text[], ARRAY['Triceps','Upper Back']::text[], NULL, '{}'::text[], false, 'Straight-Arm Lat Pulldown', 1, '90d63ecc-cebe-5ace-806d-45c8560f973f'),
  ('80d46a74-c62a-4849-920f-22d326bf7cef', 'core', false, 'Dumbbell Chest Fly', 'Chest Fly', true, '80d46a74-c62a-4849-920f-22d326bf7cef', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Shoulders']::text[], 'Dumbbell, Bench', '{}'::text[], false, 'Chest Fly', 0, NULL),
  ('81554dea-0beb-4bd1-8824-7f75c328b695', 'derive', false, 'Rotational Offset Press', 'Rotational Offset Press', true, '4a7438df-8bee-4a3e-802a-72bee480df66', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Offset', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Shoulders']::text[], ARRAY['Core','Obliques','Triceps']::text[], NULL, '{}'::text[], false, 'Kettlebell Press', 1, '4a7438df-8bee-4a3e-802a-72bee480df66'),
  ('81b5afdb-461c-4563-8b0c-a9cdeb2bb124', 'core', false, 'Bench Press', 'Bench Press', true, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', true, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Shoulders','Triceps']::text[], '{}'::text[], 'Barbell, Bench', '{}'::text[], false, 'Bench Press', 0, NULL),
  ('81cae4a9-327f-442f-860b-1f7bdaf47c7c', 'outlier', false, 'Trunk Twists', 'Trunk Twists', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Lower Back']::text[], NULL, '{}'::text[], false, 'Trunk Twists', NULL, NULL),
  ('81de5dcb-5293-4993-a069-52991767e01f', 'derive', false, 'Reverse Machine Flyes', 'Reverse Machine Fly', true, '31994dce-91ac-5b52-9640-98b3c0bb2091', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Rear', NULL, NULL, NULL, ARRAY['Machine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Shoulders','Upper Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Rear Machine Raise', 1, '31994dce-91ac-5b52-9640-98b3c0bb2091'),
  ('81fc87d3-cb88-4272-9a6c-ffe64f665f13', 'derive', false, 'Kettlebell Around The World', 'Kettlebell Around the World', false, '4981bd90-d1c2-4251-a296-d5fa565ec09b', false, 'Rotation', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Forearms / Grip','Shoulders']::text[], NULL, '{}'::text[], false, 'Kettlebell Around the World', 1, '4981bd90-d1c2-4251-a296-d5fa565ec09b'),
  ('820cbfd1-df37-43ce-a629-ce36a8d484db', 'derive', false, 'Hack Squat ', 'Hack Squat', true, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50', false, 'Squat', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Machine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], ARRAY['Core','Lower Back']::text[], NULL, '{}'::text[], false, 'Machine Squat', 1, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50'),
  ('83822f11-0b85-4358-bef4-1c8c8043187e', 'derive', false, 'Cable Rope Overhead Triceps Extension', 'Cable Rope Overhead Triceps Extension', true, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Overhead', NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Overhead Cable Triceps Extension', 1, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb'),
  ('8399fcf6-3332-4b60-a71e-029e073b9b1f', 'outlier', false, 'Reverse Tabletop Single-Arm Press With Opposing Leg Extension', 'Reverse Tabletop Single-Arm Press With Opposing Leg Extension', true, NULL, false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor','Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Shoulders','Triceps']::text[], ARRAY['Chest','Core','Hamstrings']::text[], NULL, '{}'::text[], false, 'Reverse Tabletop Single-Arm Press With Opposing Leg Extension', NULL, NULL),
  ('839c6b15-f9ab-4a3c-8326-cdd75c6ff4ad', 'derive', false, 'Kettlebell Split Squats', 'Kettlebell Split Squat', true, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', false, 'Lunge', 'Gymnastics', NULL, 'Split', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], ARRAY['Core','Hamstrings']::text[], NULL, '{}'::text[], false, 'Split Kettlebell Lunge', 1, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9'),
  ('840080d9-21bd-47b2-846f-d3f62283eb6b', 'derive', false, 'Split Squat Kettlebell Swing', 'Split Squat Kettlebell Swing', true, 'e3652813-5afb-4412-9b2c-ffe3dff90cfc', false, 'Swing', 'Weightlifting', NULL, 'Split', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], ARRAY['Core','Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Split Swing', 1, 'e3652813-5afb-4412-9b2c-ffe3dff90cfc'),
  ('857a839d-e12a-49f8-9e58-d39577d908bb', 'derive', false, 'Single-Leg Press', 'Single-Leg Press', true, '2222e3be-0481-4103-827c-8fb0f3eb78c5', false, 'Squat', 'Weightlifting', NULL, 'Single-Leg', NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Machine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Single-Leg Leg Press', 1, '2222e3be-0481-4103-827c-8fb0f3eb78c5'),
  ('86f6b49b-aecf-4c3a-836b-9288ddbebd85', 'derive', false, 'Kneeling Rope Lat Pulldown', 'Kneeling Rope Lat Pulldown', true, '90d63ecc-cebe-5ace-806d-45c8560f973f', false, 'Pull', 'Weightlifting', NULL, 'Kneeling', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Lats']::text[], ARRAY['Biceps','Upper Back']::text[], NULL, '{}'::text[], false, 'Kneeling Lat Pulldown', 1, '90d63ecc-cebe-5ace-806d-45c8560f973f'),
  ('87377b27-531d-5a4e-ab8f-4faf947495e3', 'core', true, NULL, 'Carry', true, '87377b27-531d-5a4e-ab8f-4faf947495e3', true, 'Carry', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], NULL, '{}'::text[], false, 'Carry', 0, NULL),
  ('87b6fb0f-2d5e-40b0-a198-67611fbec811', 'outlier', false, 'Stretch', 'Stretch', true, NULL, true, 'Stretching', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Recovery']::text[], ARRAY['Full Body']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Stretch', NULL, NULL),
  ('884397ec-83c2-4444-9b16-592aaf8f2e7c', 'derive', false, 'Overhead Squat', 'Overhead Squat', false, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50', true, 'Squat', 'Gymnastics', 'Overhead', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Overhead Squat', 1, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50'),
  ('8917ee9c-60e6-4507-9031-982e51866f2b', 'derive', false, 'Spanish Squat Hold', 'Spanish Squat Hold', true, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50', false, 'Squat', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bands']::text[], '{}'::text[], ARRAY['Strength','Recovery']::text[], ARRAY['Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Bands Squat', 1, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50'),
  ('8a2b76ff-8f3f-4bf3-83e8-15e9c0263c66', 'derive', false, '2 Tap Climbers', '2 Tap Climbers', true, 'c2ba5880-c532-4981-8b14-da1be3e6b78f', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'double-tap', ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors','Shoulders']::text[], NULL, '{}'::text[], false, 'Double-Tap Mountain Climber', 1, 'c2ba5880-c532-4981-8b14-da1be3e6b78f'),
  ('8c35133e-f9c9-4b6c-8a25-fb894bcf4201', 'derive', false, 'Advanced Crunch', 'Double Crunch', false, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'double', ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Double Crunch', 1, 'da5fcd1e-b402-41ae-a144-5596aaa510d1'),
  ('8c5de959-e01c-4c6b-9aed-ff856062f730', 'derive', false, 'Dumbbell Bridge Single Chest Press', 'Dumbbell Bridge Single Chest Press', true, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, 'Bridge', NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Core','Glutes','Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Bridge Dumbbell Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('8d526913-85b9-46a7-95b3-0a262dd24957', 'derive', false, 'Butterfly Sit-Up', 'Butterfly Sit-Up', false, '3443dcdb-8b96-4dc2-a492-c174c0d1cedf', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Floor']::text[], ARRAY['Butterfly']::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Butterfly Sit-Up', 1, '3443dcdb-8b96-4dc2-a492-c174c0d1cedf'),
  ('8dbd180e-a5d4-4a84-bd73-9bf272f65250', 'derive', false, 'Kettlebell Goblet Squat', 'Kettlebell Goblet Squat', false, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50', false, 'Squat', 'Gymnastics', 'Goblet', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], ARRAY['Calves','Core','Hamstrings']::text[], NULL, '{}'::text[], false, 'Kettlebell Goblet Squat', 1, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50'),
  ('8de37301-d912-428a-b434-4ac641b79cb0', 'derive', false, 'Tricep Dumbbell Kickback', 'Dumbbell Triceps Kickback', true, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, 'Behind-Body', NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Behind-Body Dumbbell Triceps Extension', 1, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb'),
  ('8e470f94-2005-4870-a22b-976ddaf00a95', 'outlier', false, 'Wall Walk', 'Wall Walk', true, NULL, true, 'Inversion', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Floor','Wall']::text[], '{}'::text[], ARRAY['Skill']::text[], ARRAY['Core','Shoulders']::text[], ARRAY['Chest','Triceps']::text[], NULL, '{}'::text[], false, 'Wall Walk', NULL, NULL),
  ('8e7e68d1-3269-4be4-a4d2-18324172ca4d', 'derive', false, 'High Stance Leg Press', 'High Stance Leg Press', true, '2222e3be-0481-4103-827c-8fb0f3eb78c5', false, 'Squat', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'high-stance', ARRAY['Machine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'High-Stance Leg Press', 1, '2222e3be-0481-4103-827c-8fb0f3eb78c5'),
  ('8ea85d89-3a42-4f39-8930-8884300a77a6', 'core', false, 'Wall Balls', 'Wall Ball', true, '8ea85d89-3a42-4f39-8930-8884300a77a6', true, 'Throw', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Full Body','Quads','Shoulders']::text[], '{}'::text[], 'Med Ball, Wall', '{}'::text[], false, 'Wall Ball', 0, NULL),
  ('8ee6f215-1bbd-499b-8c75-a3c6195d8980', 'derive', false, 'Side Plank Raise', 'Side Plank Raise', true, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Side', NULL, NULL, ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Obliques']::text[], ARRAY['Core','Shoulders']::text[], NULL, '{}'::text[], false, 'Side Plank', 1, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b'),
  ('9000bb2f-4db1-42c8-9d9b-48cb0baf3b69', 'derive', false, 'Kettlebell Goblet Curtsy Squat', 'Kettlebell Goblet Curtsy Squat', true, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', false, 'Lunge', 'Gymnastics', 'Goblet', NULL, NULL, NULL, NULL, NULL, NULL, 'Curtsy', NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], ARRAY['Core','Hip Abductors','Hip Adductors']::text[], NULL, '{}'::text[], false, 'Curtsy Kettlebell Goblet Lunge', 1, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9'),
  ('90379030-13ce-4cff-81bc-f48e9f53640b', 'derive', false, 'Single Arm Cable Tricep Kickback', 'Single-Arm Cable Triceps Kickback', true, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, 'Behind-Body', NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Behind-Body Cable Triceps Extension', 1, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb'),
  ('90d63ecc-cebe-5ace-806d-45c8560f973f', 'core', true, NULL, 'Lat Pulldown', true, '90d63ecc-cebe-5ace-806d-45c8560f973f', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], 'Cable', '{}'::text[], false, 'Lat Pulldown', 0, NULL),
  ('914adec2-325b-4d82-a79e-f59724356c3b', 'core', false, 'Row', 'Row', true, '914adec2-325b-4d82-a79e-f59724356c3b', true, 'Row', 'Monostructural', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], ARRAY['Biceps','Core','Forearms / Grip','Lats','Upper Back']::text[], 'Rower', '{}'::text[], false, 'Row', 0, NULL),
  ('9194464a-7fbe-4c0a-aba8-e95d202cbcf9', 'derive', false, 'Ballistic Row', 'Ballistic Row', true, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], ARRAY['Plyometric (Explosive)']::text[], ARRAY['Strength']::text[], ARRAY['Lats','Upper Back']::text[], ARRAY['Biceps','Core','Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Plyo Kettlebell Bent-Over Row', 2, 'b08c3cf8-b02a-4953-8a72-058b3ea2a00b'),
  ('93d90bed-d91b-4c22-aa3c-94438cfcbc26', 'derive', false, 'Weighted Single Side V-Ups', 'Weighted Single Side V-Ups', true, '0fe6557d-00c5-45e9-8897-eac172544b67', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Dumbbell']::text[], ARRAY['Weighted']::text[], ARRAY['Strength']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Weighted Dumbbell V-Up', 1, '0fe6557d-00c5-45e9-8897-eac172544b67'),
  ('93e14713-45ae-41fa-a228-4ec5223aac82', 'derive', false, 'GHD Reverse Crunch', 'GHD Reverse Crunch', false, 'b7e02387-dee4-4549-8601-eea0abdc1a89', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['GHD']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'GHD Reverse Crunch', 1, 'b7e02387-dee4-4549-8601-eea0abdc1a89'),
  ('94b99564-ebb0-4f89-985f-8b4fb7ff27b5', 'derive', false, 'Bent Over Two-Dumbbell Row', 'Dumbbell Bent-Over Row', false, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Lats','Upper Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Dumbbell Bent-Over Row', 1, 'b6879563-ab0d-5bc6-9b44-cab09315d939'),
  ('95550834-e6de-4d4e-8499-a74dd2922c2f', 'derive', false, 'Alternating Dumbbell Curl', 'Alternating Dumbbell Curl', false, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Alternating Dumbbell Curl', 2, '318731bc-0b26-4779-9aeb-f20eb1780c6d'),
  ('95669791-297e-4913-9b20-b0bb6ae6033c', 'outlier', false, 'Pike Rotation', 'Pike Rotation', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Core','Shoulders']::text[], ARRAY['Hamstrings','Obliques']::text[], NULL, '{}'::text[], false, 'Pike Rotation', NULL, NULL),
  ('9576a843-c3c2-415a-a21d-38c0088a8290', 'outlier', false, 'Body Waves', 'Body Waves', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Core','Lower Back']::text[], ARRAY['Hip Flexors','Shoulders']::text[], NULL, '{}'::text[], false, 'Body Waves', NULL, NULL),
  ('96604640-4e25-4993-9b5d-902eb541ec4b', 'derive', false, 'Kettlebell Squat Clean', 'Kettlebell Squat Clean', true, 'b23b3d0b-de50-4526-8e28-e18377ad9767', false, 'Olympic', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads','Shoulders']::text[], ARRAY['Core','Forearms / Grip','Hamstrings','Upper Back']::text[], NULL, '{}'::text[], false, 'Kettlebell Clean', 1, 'b23b3d0b-de50-4526-8e28-e18377ad9767'),
  ('9777d13f-6f01-415e-b95d-1ceb2b5696e4', 'derive', false, 'Copenhagen Side Plank', 'Copenhagen Side Plank', true, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Side', NULL, NULL, ARRAY['Bench','Bodyweight']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Hip Adductors']::text[], ARRAY['Core','Obliques','Shoulders']::text[], NULL, '{}'::text[], false, 'Side Bench Plank', 1, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b'),
  ('98a9dbc8-e190-46be-a950-aa42853958cd', 'derive', false, 'Single-Leg Stiff-Leg Belt Squat Deadlift', 'Single-Leg Stiff-Leg Belt Squat Deadlift', true, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532', false, 'Hinge', 'Weightlifting', NULL, 'Single-Leg', 'Partial', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Machine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings']::text[], ARRAY['Core','Quads']::text[], NULL, '{}'::text[], false, 'Partial Single-Leg Machine Deadlift', 1, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532'),
  ('98ca656f-c6d2-497e-b734-84e4ce38fa8f', 'derive', false, 'Alternating Front Extension', 'Alternating Front Extension', true, '4a7438df-8bee-4a3e-802a-72bee480df66', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], ARRAY['Crush']::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Crush Alternating Dumbbell Press', 3, '75cf65f4-8e6a-444d-8166-080699972de4'),
  ('98e1ca9d-4297-480a-b06b-7f2b8e7a276f', 'core', false, 'Standing Calf Raises', 'Calf Raise', true, '98e1ca9d-4297-480a-b06b-7f2b8e7a276f', false, 'Activation', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Calves']::text[], '{}'::text[], 'Bodyweight', '{}'::text[], false, 'Calf Raise', 0, NULL),
  ('99a6149d-3c0f-46be-85c5-ddeddbed92ab', 'derive', false, 'Treadmill Run', 'Treadmill Run', false, 'd5b54a47-6b75-4d65-9093-a21925306978', false, 'Run', 'Monostructural', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Treadmill']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Calves','Full Body','Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Treadmill Run', 1, 'd5b54a47-6b75-4d65-9093-a21925306978'),
  ('9c94cfce-f41b-46b7-be88-8d08ae3b53a9', 'derive', false, 'Concentration Curl', 'Concentration Curl', true, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, 'Braced', NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Concentration Dumbbell Curl', 2, '318731bc-0b26-4779-9aeb-f20eb1780c6d'),
  ('9cbb87eb-68c2-4eeb-89b7-c0b159de629a', 'derive', false, 'Kettlebell Horn Push-Up', 'Kettlebell Horn Push-Up', true, '6fe16d57-5b36-42be-828d-70270e41e912', false, 'Push/Press', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor','Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Triceps']::text[], ARRAY['Core','Shoulders']::text[], NULL, '{}'::text[], false, 'Kettlebell Push-Up', 1, '6fe16d57-5b36-42be-828d-70270e41e912'),
  ('9d92f019-b91d-4f87-a2de-f6f3ad5ce65a', 'derive', false, 'Lateral Burpees Over The Dumbbell', 'Lateral Burpee Over Dumbbell', true, 'f5bf41cb-7241-4b46-a656-1015ffbddf21', false, 'Plyometric', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell','Floor']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Chest','Core','Glutes','Quads','Shoulders']::text[], ARRAY['Calves','Hamstrings','Lower Back','Triceps']::text[], NULL, '{}'::text[], false, 'Dumbbell Burpee', 1, 'f5bf41cb-7241-4b46-a656-1015ffbddf21'),
  ('9d9cc729-e8a6-44e4-a91e-3b452f4260a5', 'outlier', false, 'Pullover With Knee Tucks', 'Pullover With Knee Tucks', true, NULL, false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Hip Flexors','Lats']::text[], ARRAY['Chest','Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Pullover With Knee Tucks', NULL, NULL),
  ('9e599834-da6f-4589-8352-fe24ba2174fd', 'derive', false, 'Single-Arm Cable Front Raise', 'Single-Arm Cable Front Raise', true, '31994dce-91ac-5b52-9640-98b3c0bb2091', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, 'Front', NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Shoulders']::text[], ARRAY['Chest']::text[], NULL, '{}'::text[], false, 'Front Cable Raise', 1, '31994dce-91ac-5b52-9640-98b3c0bb2091'),
  ('9f6fabc9-1edb-4f68-bb95-25cbc62e24d2', 'outlier', false, 'Air Squat, Reverse Lunge, And Burpee Complex', 'Air Squat, Reverse Lunge, And Burpee Complex', true, NULL, false, 'Squat', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Full Body']::text[], ARRAY['Chest','Core','Glutes','Quads']::text[], NULL, '{}'::text[], false, 'Air Squat, Reverse Lunge, And Burpee Complex', NULL, NULL),
  ('a0c205ee-3c0a-4ffc-8c98-5175e885d4b0', 'derive', false, 'Lateral Raises', 'Lateral Raise', false, '31994dce-91ac-5b52-9640-98b3c0bb2091', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Lateral', NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Shoulders']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Lateral Raise', 1, '31994dce-91ac-5b52-9640-98b3c0bb2091'),
  ('a1397be9-5452-46f1-b35d-47b3e632889a', 'derive', false, 'Power Snatch', 'Power Snatch', true, '470008aa-67df-4d72-b74b-aff43b4d3ec6', true, 'Olympic', 'Weightlifting', NULL, NULL, 'Partial', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Full Body']::text[], ARRAY['Core','Forearms / Grip','Glutes','Hamstrings','Quads','Shoulders','Upper Back']::text[], NULL, '{}'::text[], false, 'Partial Snatch', 1, '470008aa-67df-4d72-b74b-aff43b4d3ec6'),
  ('a16bedae-5cbb-4f4a-b247-ccfb84e25045', 'derive', false, 'EZ-Bar Curl', 'EZ-Bar Curl', false, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ez-bar', ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Forearms / Grip']::text[], '{}'::text[], NULL, '{}'::text[], false, 'EZ-Bar Curl', 1, '01f01e3a-393d-4819-8834-cf25ea1ba04a'),
  ('a260b34d-f5ca-4b01-9ee1-0e0800c4e9f4', 'derive', false, 'Double-Under', 'Double-Under', true, 'e3cdc5c3-6618-4050-85db-88e4a1a70f29', true, 'Rope', 'Monostructural', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'double-under', ARRAY['Jump Rope']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Calves','Full Body']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Double-Under Jump Rope', 1, 'e3cdc5c3-6618-4050-85db-88e4a1a70f29'),
  ('a4811178-fb30-4d51-82df-f0f772ffef81', 'outlier', false, 'Single-Leg Dumbbell Stiff-Leg Hip Opener', 'Single-Leg Dumbbell Stiff-Leg Hip Opener', true, NULL, false, 'Stretching', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Glutes','Hamstrings']::text[], ARRAY['Core','Hip Abductors']::text[], NULL, '{}'::text[], false, 'Single-Leg Dumbbell Stiff-Leg Hip Opener', NULL, NULL),
  ('a63d62b8-f932-4fe2-815c-d4d5489d4d87', 'derive', false, 'Wide Stance Snatch Grip Deadlift', 'Wide Stance Snatch Grip Deadlift', true, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532', false, 'Hinge', 'Weightlifting', NULL, 'Wide (Sumo)', NULL, NULL, NULL, 'Wide', NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Lower Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Wide-Grip Wide-Stance Deadlift', 2, 'a8db17c7-f05c-4129-9591-5742c19ac5d2'),
  ('a67b404b-fd60-4a25-b578-33b8783bc1fa', 'derive', false, 'Wide Stance Squat', 'Wide-Stance Back Squat', false, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50', false, 'Squat', 'Gymnastics', 'Back', 'Wide (Sumo)', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hip Adductors','Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Wide-Stance Back Squat', 2, '2fc183f8-e1a0-4a1e-ac1c-be4bf2871366'),
  ('a6df346d-ef81-4928-97b6-56c0ff298dc8', 'derive', false, 'Trap Bar Deadlift', 'Trap Bar Deadlift', false, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532', true, 'Hinge', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Trap Bar']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Forearms / Grip','Glutes','Hamstrings','Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Trap Bar Deadlift', 1, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532'),
  ('a7c65e92-605a-4d37-b36e-3df8e3c92235', 'derive', false, 'Plank Jacks', 'Plank Jacks', true, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'jacks', ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Core']::text[], ARRAY['Hip Abductors','Shoulders']::text[], NULL, '{}'::text[], false, 'Jack Plank', 1, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b'),
  ('a7f5a707-29a1-4b68-ac0a-237b4148c8c1', 'derive', false, 'Smith Machine Bent Over Row', 'Smith Machine Bent-Over Row', false, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Smith Machine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Lats','Upper Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Smith Machine Bent-Over Row', 1, 'b6879563-ab0d-5bc6-9b44-cab09315d939'),
  ('a8464567-b78d-444c-a897-c93860cf7c9f', 'derive', false, 'Seal Row', 'Seal Row', true, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Pull', 'Weightlifting', NULL, 'Prone', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell','Bench']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Lats','Upper Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Prone Bench Bent-Over Row', 1, 'b6879563-ab0d-5bc6-9b44-cab09315d939'),
  ('a8db17c7-f05c-4129-9591-5742c19ac5d2', 'derive', false, 'Sumo Deadlift', 'Sumo Deadlift', true, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532', true, 'Hinge', 'Weightlifting', NULL, 'Wide (Sumo)', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Hip Adductors','Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Wide-Stance Deadlift', 1, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532'),
  ('ab58c0d1-35cd-4696-83ec-0831494e4602', 'derive', false, 'Dumbbell Suitcase Crunch', 'Dumbbell Suitcase Crunch', true, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Weightlifting', 'Suitcase', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], ARRAY['Weighted']::text[], ARRAY['Strength']::text[], ARRAY['Obliques']::text[], ARRAY['Core']::text[], NULL, '{}'::text[], false, 'Weighted Dumbbell Suitcase Crunch', 1, 'da5fcd1e-b402-41ae-a144-5596aaa510d1'),
  ('acf0800c-631d-4a1a-ba32-c1a477ab715e', 'core', false, 'Toes-to-Bar', 'Toes-to-Bar', true, 'acf0800c-631d-4a1a-ba32-c1a477ab715e', true, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Skill']::text[], ARRAY['Core','Hip Flexors']::text[], '{}'::text[], 'Bar', '{}'::text[], false, 'Toes-to-Bar', 0, NULL),
  ('adc07245-37d4-4a20-9925-533207bc4754', 'outlier', false, 'Mobility Work', 'Mobility Work', true, NULL, true, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Recovery']::text[], ARRAY['Full Body']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Mobility Work', NULL, NULL),
  ('ae7f41c1-fa4d-4f28-a255-5d48be5eb532', 'core', false, 'Deadlift', 'Deadlift', true, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532', true, 'Hinge', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Lower Back']::text[], ARRAY['Core','Forearms / Grip','Upper Back']::text[], 'Barbell', '{}'::text[], false, 'Deadlift', 0, NULL),
  ('af2be311-05fd-452c-9aa4-50e02d217983', 'core', false, 'Thruster', 'Thruster', true, 'af2be311-05fd-452c-9aa4-50e02d217983', true, 'Squat', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Full Body','Quads','Shoulders']::text[], '{}'::text[], 'Barbell', '{}'::text[], false, 'Thruster', 0, NULL),
  ('af357f8f-5f0f-475a-952f-9c4a90db114d', 'derive', false, 'Dumbbell Goblet Squat', 'Dumbbell Goblet Squat', false, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50', false, 'Squat', 'Gymnastics', 'Goblet', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], ARRAY['Core','Hamstrings']::text[], NULL, '{}'::text[], false, 'Dumbbell Goblet Squat', 1, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50'),
  ('afeaf1ac-bd14-4643-9d35-a85ab8da05a0', 'derive', false, 'Kettlebell Bench Press', 'Kettlebell Bench Press', false, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bench','Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Kettlebell Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('b08c3cf8-b02a-4953-8a72-058b3ea2a00b', 'derive', false, 'Kettlebell Bent-Over Row', 'Kettlebell Bent-Over Row', false, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Lats','Upper Back']::text[], ARRAY['Biceps','Core','Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Kettlebell Bent-Over Row', 1, 'b6879563-ab0d-5bc6-9b44-cab09315d939'),
  ('b13b9b6a-30eb-493d-afa3-67e818dba85b', 'outlier', false, 'Cool-Down Walk', 'Cool-Down Walk', true, NULL, true, 'Run', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Recovery']::text[], ARRAY['Full Body']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Cool-Down Walk', NULL, NULL),
  ('b1bb2efd-6c9f-44ea-ae45-667f93ad146e', 'derive', false, 'High Plank', 'High Plank', false, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Hand', NULL, NULL, ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Shoulders']::text[], NULL, '{}'::text[], false, 'High Plank', 1, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b'),
  ('b23b3d0b-de50-4526-8e28-e18377ad9767', 'core', false, 'Clean', 'Clean', true, 'b23b3d0b-de50-4526-8e28-e18377ad9767', true, 'Olympic', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Skill','Strength']::text[], ARRAY['Glutes','Hamstrings','Neck / Traps','Quads']::text[], ARRAY['Calves','Core','Forearms / Grip','Lats','Shoulders']::text[], 'Barbell', '{}'::text[], false, 'Clean', 0, NULL),
  ('b51b16df-6c23-492c-baa5-c5d1bbf38163', 'derive', false, 'Hollow Flutter Kicks', 'Hollow Flutter Kicks', true, '060b2ea6-bf2d-41a2-ae31-75f8498be271', false, 'Midline', 'Gymnastics', NULL, 'Hollow', 'Partial', 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors','Quads']::text[], NULL, '{}'::text[], false, 'Partial Hollow Alternating Leg Raise', 3, '3da442db-1cff-40e2-8672-50525710f392'),
  ('b6439378-a400-4c51-a1fe-c3ce317970cb', 'core', false, 'Pull-Up', 'Pull-Up', true, 'b6439378-a400-4c51-a1fe-c3ce317970cb', true, 'Pull', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Lats','Upper Back']::text[], ARRAY['Core','Forearms / Grip','Shoulders']::text[], 'Bar', '{}'::text[], false, 'Pull-Up', 0, NULL),
  ('b6879563-ab0d-5bc6-9b44-cab09315d939', 'core', true, NULL, 'Bent-Over Row', true, 'b6879563-ab0d-5bc6-9b44-cab09315d939', true, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], 'Barbell', '{}'::text[], false, 'Bent-Over Row', 0, NULL),
  ('b6cb3ae1-3280-47b9-aa09-e1d7da646992', 'outlier', false, 'D Ball Over Shoulder', 'D Ball Over Shoulder', true, NULL, false, 'Throw', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Sandbag']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Full Body','Glutes','Hamstrings','Upper Back']::text[], ARRAY['Core','Forearms / Grip','Shoulders']::text[], NULL, '{}'::text[], false, 'D Ball Over Shoulder', NULL, NULL),
  ('b6e93a9c-2d95-4a18-8e40-28289844f86f', 'derive', false, 'Front Incline Raise', 'Front Incline Raise', false, '31994dce-91ac-5b52-9640-98b3c0bb2091', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, 'Incline', 'Front', NULL, NULL, NULL, ARRAY['Bench','Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Shoulders']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Front Incline Raise', 1, '31994dce-91ac-5b52-9640-98b3c0bb2091'),
  ('b7e02387-dee4-4549-8601-eea0abdc1a89', 'core', false, 'Reverse Crunch Pulse', 'Reverse Crunch', true, 'b7e02387-dee4-4549-8601-eea0abdc1a89', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], 'Bodyweight, Floor', '{}'::text[], false, 'Reverse Crunch', 0, NULL),
  ('b858f251-3ff4-42b5-841d-3333814c37a1', 'derive', false, 'Supine Cable Pullover Crunch', 'Supine Cable Pullover Crunch', true, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Pull', 'Weightlifting', NULL, 'Supine', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Lats']::text[], NULL, '{}'::text[], false, 'Supine Cable Crunch', 2, '47d9bcba-1b05-4a77-bf42-c908d1b8ea95'),
  ('b8793729-fa21-4b33-b0b6-49a88211379f', 'outlier', false, 'Yoga Squat To Reach', 'Yoga Squat To Reach', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Quads','Shoulders']::text[], ARRAY['Glutes','Upper Back']::text[], NULL, '{}'::text[], false, 'Yoga Squat To Reach', NULL, NULL),
  ('b94a7298-2a71-4486-8211-790867506907', 'outlier', false, 'Horse Stance', 'Horse Stance', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Hip Adductors','Quads']::text[], ARRAY['Core','Glutes']::text[], NULL, '{}'::text[], false, 'Horse Stance', NULL, NULL),
  ('b9b1951c-aaf8-4fde-a82b-2e3dc91ac158', 'derive', false, 'Close Grip Dumbbell Bench Press', 'Close-Grip Dumbbell Bench Press', false, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, 'Close', NULL, NULL, NULL, NULL, NULL, ARRAY['Bench','Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], ARRAY['Chest','Shoulders']::text[], NULL, '{}'::text[], false, 'Close-Grip Dumbbell Bench Press', 2, '41da4c6b-d777-4266-adec-cb6cbff347d2'),
  ('ba68ae3b-6a55-4c61-ba68-acf3ec84f8dc', 'derive', false, 'Pull-to-Stand', 'Pull-to-Stand', true, '66a213ee-f78f-4b3b-a9e3-acebe97eab59', true, 'Climb', 'Gymnastics', NULL, 'Supine', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor','Rope']::text[], ARRAY['Assisted']::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Forearms / Grip','Lats']::text[], ARRAY['Core','Shoulders','Upper Back']::text[], NULL, '{}'::text[], false, 'Assisted Supine Floor Rope Climb', 1, '66a213ee-f78f-4b3b-a9e3-acebe97eab59'),
  ('bbf6d999-de07-479f-9dcc-a5b9d8a1dff1', 'derive', false, 'Wide Grip Seated Row', 'Wide-Grip Seated Cable Row', true, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Pull', 'Weightlifting', NULL, 'Seated', NULL, NULL, NULL, 'Wide', NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Upper Back']::text[], ARRAY['Biceps','Lats']::text[], NULL, '{}'::text[], false, 'Wide-Grip Seated Cable Bent-Over Row', 2, '2e1723ed-40b6-474f-be82-115f3157e15b'),
  ('bfb1d36c-efb4-4776-9d57-32379a8a511e', 'derive', false, 'Low To High Dumbbell Flys', 'Low To High Dumbbell Fly', true, '80d46a74-c62a-4849-920f-22d326bf7cef', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Low-to-High', NULL, NULL, NULL, ARRAY['Bench','Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Shoulders']::text[], NULL, '{}'::text[], false, 'Low-to-High Chest Fly', 1, '80d46a74-c62a-4849-920f-22d326bf7cef'),
  ('c03c87b9-5caa-4b80-a1df-4a70b08d9864', 'derive', false, 'Machine Bench Press', 'Machine Bench Press', false, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Machine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Machine Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('c0af3ce1-cb39-47c8-a196-f9eb7438bb87', 'outlier', false, 'Dumbbell Hold', 'Dumbbell Hold', true, NULL, false, 'Carry', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Dumbbell Hold', NULL, NULL),
  ('c0e25bfc-9bb9-43bd-9b92-15a0668cb630', 'derive', false, 'Stiff-Legged Dumbbell Deadlift (Dumbbell Romanian Deadlift)', 'Dumbbell Romanian Deadlift', true, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532', false, 'Hinge', 'Weightlifting', NULL, NULL, 'Partial', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Lower Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Partial Dumbbell Deadlift', 1, 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532'),
  ('c2b1e158-ea6c-4f67-8db0-3177640b14a7', 'derive', false, 'Boat Rows', 'Boat Rows', true, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Midline', 'Weightlifting', NULL, 'V-Sit', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Upper Back']::text[], ARRAY['Biceps','Hip Flexors','Lats']::text[], NULL, '{}'::text[], false, 'V-Sit Kettlebell Bent-Over Row', 2, 'b08c3cf8-b02a-4953-8a72-058b3ea2a00b'),
  ('c2ba5880-c532-4981-8b14-da1be3e6b78f', 'core', false, 'Mountain Climber With 1 Sec Pause', 'Mountain Climber', true, 'c2ba5880-c532-4981-8b14-da1be3e6b78f', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors','Quads','Shoulders']::text[], 'Bodyweight, Floor', '{}'::text[], false, 'Mountain Climber', 0, NULL),
  ('c2c05041-144b-45c7-9e54-5f4bec5b7a6a', 'core', false, 'Kettlebell Halo', 'Halo', true, 'c2c05041-144b-45c7-9e54-5f4bec5b7a6a', false, 'Rotation', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Shoulders']::text[], ARRAY['Core','Triceps','Upper Back']::text[], 'Kettlebell', '{}'::text[], false, 'Halo', 0, NULL),
  ('c3208d4e-39bb-42c1-99d3-3e90c80fe243', 'derive', false, 'Push Press', 'Push Press', true, '4a7438df-8bee-4a3e-802a-72bee480df66', true, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], ARRAY['Plyometric (Explosive)']::text[], ARRAY['Strength']::text[], ARRAY['Quads','Shoulders','Triceps']::text[], ARRAY['Core','Glutes']::text[], NULL, '{}'::text[], false, 'Plyo Press', 1, '4a7438df-8bee-4a3e-802a-72bee480df66'),
  ('c34597a3-55a5-4756-8188-8ff85d35b4b8', 'derive', false, 'Pogo Jumps', 'Pogo Jumps', true, '0b38eb75-53b2-45e0-8c12-c52bd87fc774', false, 'Plyometric', 'Recovery', NULL, NULL, 'Quarter', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength','MetCon']::text[], ARRAY['Calves']::text[], ARRAY['Glutes','Quads']::text[], NULL, '{}'::text[], false, 'Quarter Jump', 1, '0b38eb75-53b2-45e0-8c12-c52bd87fc774'),
  ('c37656f7-7768-4ed2-a473-f53eb97e7f6b', 'derive', false, 'Hanging Leg Raises', 'Hanging Leg Raise', true, '060b2ea6-bf2d-41a2-ae31-75f8498be271', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bar']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Hip Flexors']::text[], ARRAY['Forearms / Grip','Shoulders']::text[], NULL, '{}'::text[], false, 'Bar Leg Raise', 1, '060b2ea6-bf2d-41a2-ae31-75f8498be271'),
  ('c4ac582d-3576-4722-acd7-a0745a1ee737', 'core', false, 'Handstand Push-up', 'Handstand Push-Up', true, 'c4ac582d-3576-4722-acd7-a0745a1ee737', true, 'Push/Press', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Skill']::text[], ARRAY['Core','Shoulders','Triceps']::text[], '{}'::text[], 'Bodyweight, Wall', '{}'::text[], false, 'Handstand Push-Up', 0, NULL),
  ('c5605994-39b6-4a45-afb4-c4d8e949d8cb', 'derive', false, 'Cable Curl', 'Cable Curl', false, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Cable Curl', 1, '01f01e3a-393d-4819-8834-cf25ea1ba04a'),
  ('c597cd87-17ba-4b3f-946e-c6019d2fadb5', 'derive', false, 'Cable-Resisted Reverse Crunch', 'Cable Reverse Crunch', false, 'b7e02387-dee4-4549-8601-eea0abdc1a89', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Cable Reverse Crunch', 1, 'b7e02387-dee4-4549-8601-eea0abdc1a89'),
  ('c7902429-4714-4697-b503-0f2766d11649', 'derive', false, 'EZ Bar Spider Curls', 'EZ Bar Spider Curl', true, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, 'Prone', NULL, NULL, NULL, NULL, 'Incline', NULL, NULL, NULL, 'ez-bar', ARRAY['Barbell','Bench']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Incline Prone EZ-Bar Curl', 2, 'a16bedae-5cbb-4f4a-b247-ccfb84e25045'),
  ('c7f2f87e-0e57-41be-9cb4-08b8670ef9d3', 'derive', false, 'Single-Arm Kettlebell Row', 'Single-Arm Kettlebell Row', true, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Lats','Upper Back']::text[], ARRAY['Biceps','Core','Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Kettlebell Bent-Over Row', 2, 'b08c3cf8-b02a-4953-8a72-058b3ea2a00b'),
  ('c81483ac-3cc7-423f-9b85-794108eebfec', 'derive', false, 'Incline Dumbbell Curl', 'Incline Dumbbell Curl', false, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, 'Incline', NULL, NULL, NULL, NULL, ARRAY['Bench','Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Incline Dumbbell Curl', 2, '318731bc-0b26-4779-9aeb-f20eb1780c6d'),
  ('c8e35862-3134-4543-9302-4529d8eac79c', 'derive', false, 'Dumbbell Squeeze Press', 'Dumbbell Squeeze Press', true, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bench','Dumbbell']::text[], ARRAY['Crush']::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Crush Dumbbell Bench Press', 2, '41da4c6b-d777-4266-adec-cb6cbff347d2'),
  ('c9cc8b6d-0f84-4fb6-99b9-36f8d9aaaa42', 'outlier', false, 'Lunge With Reach', 'Lunge With Reach', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Hip Flexors','Quads']::text[], ARRAY['Glutes','Shoulders']::text[], NULL, '{}'::text[], false, 'Lunge With Reach', NULL, NULL),
  ('ca288903-1599-4766-ab35-304971ce8c00', 'derive', false, 'Kettlebell Front Rack Lunge', 'Kettlebell Front Rack Lunge', true, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', false, 'Lunge', 'Gymnastics', 'Single Front Rack', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Quads']::text[], ARRAY['Core','Hamstrings','Shoulders']::text[], NULL, '{}'::text[], false, 'Kettlebell Single Front Rack Lunge', 1, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9'),
  ('ca567717-d196-41a3-959f-944f3f2aa3a0', 'outlier', false, 'Lunge Rotation', 'Lunge Rotation', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Obliques','Quads']::text[], ARRAY['Core','Glutes','Hamstrings']::text[], NULL, '{}'::text[], false, 'Lunge Rotation', NULL, NULL),
  ('cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', 'core', false, 'Triceps Extension', 'Triceps Extension', true, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Triceps Extension', 0, NULL),
  ('cb32a445-315b-4d45-91fc-6135acc0d452', 'derive', false, 'Front Squat', 'Front Squat', false, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50', true, 'Squat', 'Gymnastics', 'Front', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Front Squat', 1, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50'),
  ('cb7af18c-9e72-4cd4-96ee-9ce28dc4e323', 'outlier', false, 'Squat Crunch', 'Squat Crunch', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Core','Quads']::text[], ARRAY['Glutes','Hip Flexors','Obliques']::text[], NULL, '{}'::text[], false, 'Squat Crunch', NULL, NULL),
  ('cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', 'core', false, 'Lunge', 'Lunge', true, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', true, 'Lunge', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], ARRAY['Calves','Core','Hip Flexors']::text[], 'Bodyweight', '{}'::text[], false, 'Lunge', 0, NULL),
  ('ce73f567-f654-40a9-835b-97febc87d76f', 'derive', false, 'Kettlebell Bridge Press', 'Kettlebell Bridge Press', true, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, 'Bridge', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], ARRAY['Core','Glutes','Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Bridge Kettlebell Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('ce8b4758-21a4-4f68-9285-ef1311e29e3a', 'derive', false, 'Hammer Curl', 'Hammer Curl', true, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, 'Neutral', NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Neutral-Grip Dumbbell Curl', 2, '318731bc-0b26-4779-9aeb-f20eb1780c6d'),
  ('ce983988-cf48-41df-a1c3-e2b2155ea8d1', 'outlier', false, 'Barbell Shrug', 'Barbell Shrug', true, NULL, false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Forearms / Grip','Neck / Traps','Upper Back']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Barbell Shrug', NULL, NULL),
  ('cf044d9e-4c18-47f9-a3c9-2e0016b80fbc', 'derive', false, 'Sit-Up Punch', 'Sit-Up Punch', true, '3443dcdb-8b96-4dc2-a492-c174c0d1cedf', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor','Med Ball']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Med Ball Sit-Up', 1, '3443dcdb-8b96-4dc2-a492-c174c0d1cedf'),
  ('d04d81bc-c668-4a96-b3a8-ff6a5cbc4d60', 'derive', false, 'EZ Bar Skullcrusher', 'EZ Bar Skullcrusher', true, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', false, 'Push/Press', 'Weightlifting', NULL, 'Supine', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell','Bench']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Supine Barbell Bench Triceps Extension', 1, 'cb22657b-7dd7-422d-bebb-4f5f7b63f6cb'),
  ('d07de065-5628-4634-bcaa-bc35e129f7e0', 'core', false, 'Ring Rows', 'Inverted Row', true, 'd07de065-5628-4634-bcaa-bc35e129f7e0', true, 'Pull', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Lats','Upper Back']::text[], ARRAY['Biceps','Core','Forearms / Grip']::text[], 'Rings', '{}'::text[], false, 'Inverted Row', 0, NULL),
  ('d2ec9d8c-8bca-4cb5-a842-534f13d41435', 'derive', false, 'Kettlebell Crush Press', 'Kettlebell Crush Press', true, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], ARRAY['Crush']::text[], ARRAY['Strength']::text[], ARRAY['Chest','Triceps']::text[], ARRAY['Core','Forearms / Grip','Shoulders']::text[], NULL, '{}'::text[], false, 'Crush Kettlebell Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('d33b0543-61ea-454e-9eec-92c1e9844376', 'derive', false, 'Weighted Pull-Up', 'Weighted Pull-Up', false, 'b6439378-a400-4c51-a1fe-c3ce317970cb', false, 'Pull', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bar']::text[], ARRAY['Weighted']::text[], ARRAY['Strength']::text[], ARRAY['Lats','Upper Back']::text[], ARRAY['Biceps','Core','Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Weighted Pull-Up', 1, 'b6439378-a400-4c51-a1fe-c3ce317970cb'),
  ('d34024ef-20d6-4491-a0fa-ca680ff3cdfa', 'derive', false, 'Static Squat Single-Arm Rows', 'Static Squat Single-Arm Row', true, 'b6879563-ab0d-5bc6-9b44-cab09315d939', false, 'Pull', 'Weightlifting', NULL, 'Squat-Hold', NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Lats','Quads','Upper Back']::text[], ARRAY['Biceps','Core','Glutes']::text[], NULL, '{}'::text[], false, 'Squat-Hold Kettlebell Bent-Over Row', 3, 'c7f2f87e-0e57-41be-9cb4-08b8670ef9d3'),
  ('d5b54a47-6b75-4d65-9093-a21925306978', 'core', false, 'Run', 'Run', true, 'd5b54a47-6b75-4d65-9093-a21925306978', true, 'Run', 'Monostructural', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Calves','Glutes','Hamstrings','Quads']::text[], ARRAY['Core','Hip Flexors']::text[], 'Bodyweight', '{}'::text[], false, 'Run', 0, NULL),
  ('d65c63d0-36dc-4b3c-9a62-c51af99c2e9d', 'derive', false, 'Weighted Russian Twist', 'Weighted Russian Twist', true, 'f6abb193-16c5-4eef-83d4-5e95b5c6ef2d', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], ARRAY['Weighted']::text[], ARRAY['Strength']::text[], ARRAY['Obliques']::text[], ARRAY['Core','Hip Flexors']::text[], NULL, '{}'::text[], false, 'Weighted Dumbbell Russian Twist', 1, 'f6abb193-16c5-4eef-83d4-5e95b5c6ef2d'),
  ('d7421380-f8a8-4832-bcf9-7923c7921fa2', 'core', false, 'Muscle-up', 'Muscle-Up', true, 'd7421380-f8a8-4832-bcf9-7923c7921fa2', true, 'Ring/Bar', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Skill']::text[], ARRAY['Core','Lats','Triceps','Upper Back']::text[], '{}'::text[], 'Rings', '{}'::text[], false, 'Muscle-Up', 0, NULL),
  ('d8446175-d8b7-410a-a2a6-75490a8e6175', 'derive', false, 'Elbow-To-Knee Crunch', 'Elbow-To-Knee Crunch', true, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, 'Cross-Body / Rotational', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Cross-Body Crunch', 1, 'da5fcd1e-b402-41ae-a144-5596aaa510d1'),
  ('d982a88b-f31e-446a-af91-4a6749548518', 'derive', false, 'Weighted Toe Tap Crunches', 'Weighted Toe Tap Crunch', true, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'toe-tap', ARRAY['Bodyweight','Dumbbell']::text[], ARRAY['Weighted']::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Weighted Dumbbell Toe-Tap Crunch', 1, 'da5fcd1e-b402-41ae-a144-5596aaa510d1'),
  ('da5fcd1e-b402-41ae-a144-5596aaa510d1', 'core', false, 'Crunches', 'Crunch', true, 'da5fcd1e-b402-41ae-a144-5596aaa510d1', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], '{}'::text[], 'Bodyweight, Floor', '{}'::text[], false, 'Crunch', 0, NULL),
  ('da8d711e-ca00-416d-a445-39686bd83a6c', 'derive', false, 'Seated Overhead Cable Curl', 'Seated Overhead Cable Curl', true, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, 'Seated', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Overhead', NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], ARRAY['Forearms / Grip']::text[], NULL, '{}'::text[], false, 'Overhead Seated Cable Curl', 3, 'e39d8f60-c552-4043-b569-4db5bf8b1d4b'),
  ('dd9c3d1a-c913-438b-93c9-df78b68e6bc5', 'derive', false, 'Spider Plank', 'Spider Plank', true, 'c2ba5880-c532-4981-8b14-da1be3e6b78f', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'spider', ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Hip Flexors','Shoulders']::text[], NULL, '{}'::text[], false, 'Spider Mountain Climber', 1, 'c2ba5880-c532-4981-8b14-da1be3e6b78f'),
  ('dd9ffabd-3eb7-4ba7-b178-70175e4fd786', 'outlier', false, 'Cable Zercher Pull Through', 'Cable Zercher Pull Through', true, NULL, false, 'Hinge', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes']::text[], ARRAY['Core','Hamstrings']::text[], NULL, '{}'::text[], false, 'Cable Zercher Pull Through', NULL, NULL),
  ('dde33be4-942f-4742-afb3-a4085881892a', 'outlier', false, 'Plate-Loaded Standing Hip Abduction', 'Plate-Loaded Standing Hip Abduction', true, NULL, false, 'Hinge', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Plate']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hip Abductors']::text[], ARRAY['Quads']::text[], NULL, '{}'::text[], false, 'Plate-Loaded Standing Hip Abduction', NULL, NULL),
  ('de507736-f4e7-4083-8a8f-48795c4cb9d9', 'outlier', false, 'Windmill', 'Windmill', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Obliques','Shoulders']::text[], ARRAY['Core','Glutes','Hamstrings']::text[], NULL, '{}'::text[], false, 'Windmill', NULL, NULL),
  ('de68bf32-b80f-4a1f-8ad6-68c6b1ae232c', 'outlier', false, 'Child''s Pose Flow', 'Child''s Pose Flow', true, NULL, false, 'Stretching', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Shoulders','Upper Back']::text[], ARRAY['Hip Flexors','Lats']::text[], NULL, '{}'::text[], false, 'Child''s Pose Flow', NULL, NULL),
  ('de836d7f-a1a6-421e-ace6-5f511707daa9', 'derive', false, 'Weighted Side Plank Dip', 'Weighted Side Plank Dip', true, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Side', NULL, NULL, ARRAY['Bodyweight','Dumbbell']::text[], ARRAY['Weighted']::text[], ARRAY['Strength']::text[], ARRAY['Obliques']::text[], ARRAY['Core','Shoulders']::text[], NULL, '{}'::text[], false, 'Weighted Side Dumbbell Plank', 1, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b'),
  ('dfd043b7-df25-450c-bba9-d67f45e26db9', 'derive', false, 'Bar Muscle-Up', 'Bar Muscle-Up', false, 'd7421380-f8a8-4832-bcf9-7923c7921fa2', true, 'Ring/Bar', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bar']::text[], '{}'::text[], ARRAY['Skill']::text[], ARRAY['Lats','Triceps','Upper Back']::text[], ARRAY['Biceps','Core','Forearms / Grip','Shoulders']::text[], NULL, '{}'::text[], false, 'Bar Muscle-Up', 1, 'd7421380-f8a8-4832-bcf9-7923c7921fa2'),
  ('e33b16d7-94a3-4993-b208-37bad81577cd', 'derive', false, 'Alternating Single-Dumbbell Lunge', 'Alternating Single-Dumbbell Lunge', true, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', false, 'Lunge', 'Gymnastics', 'Suitcase', NULL, NULL, 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], ARRAY['Calves','Core','Forearms / Grip','Hip Flexors','Lower Back']::text[], NULL, '{}'::text[], false, 'Alternating Dumbbell Suitcase Lunge', 1, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9'),
  ('e3652813-5afb-4412-9b2c-ffe3dff90cfc', 'core', false, 'Kettlebell Swing', 'Swing', true, 'e3652813-5afb-4412-9b2c-ffe3dff90cfc', true, 'Swing', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Core','Glutes','Hamstrings','Lower Back']::text[], '{}'::text[], 'Kettlebell', '{}'::text[], false, 'Swing', 0, NULL),
  ('e39d8f60-c552-4043-b569-4db5bf8b1d4b', 'derive', false, 'High Cable Curls', 'High Cable Curls', true, '01f01e3a-393d-4819-8834-cf25ea1ba04a', false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Overhead', NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Overhead Cable Curl', 2, 'c5605994-39b6-4a45-afb4-c4d8e949d8cb'),
  ('e3cdc5c3-6618-4050-85db-88e4a1a70f29', 'core', false, 'Jump Rope', 'Jump Rope', true, 'e3cdc5c3-6618-4050-85db-88e4a1a70f29', true, 'Rope', 'Monostructural', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Calves','Full Body']::text[], '{}'::text[], 'Jump Rope', '{}'::text[], false, 'Jump Rope', 0, NULL),
  ('e6d7e93a-20ad-4250-83ef-c6c07e702653', 'derive', false, 'Alternating Kickstand Swing', 'Alternating Kickstand Swing', true, 'e3652813-5afb-4412-9b2c-ffe3dff90cfc', false, 'Swing', 'Weightlifting', NULL, 'Staggered', NULL, 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Glutes','Hamstrings']::text[], ARRAY['Core','Forearms / Grip','Lower Back']::text[], NULL, '{}'::text[], false, 'Staggered Alternating Swing', 1, 'e3652813-5afb-4412-9b2c-ffe3dff90cfc'),
  ('e74b28c0-e5f3-4366-bb3b-2611e6a62c46', 'derive', false, 'Reverse Grip Pushdown', 'Reverse Grip Pushdown', true, '328c34a9-af1e-433e-bde0-a19b5f71fddc', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, 'Supinated', NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Underhand Triceps Pushdown', 1, '328c34a9-af1e-433e-bde0-a19b5f71fddc'),
  ('e85c15ac-0848-4129-ba6c-dd5780f08ba4', 'outlier', false, 'Single-Arm Devil Press', 'Single-Arm Devil Press', true, NULL, false, 'Plyometric', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Full Body']::text[], ARRAY['Core','Glutes','Quads','Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Single-Arm Devil Press', NULL, NULL),
  ('e85ddbba-191e-4f21-a16f-603ed76ee475', 'derive', false, 'Calf Press on the Leg Press Machine', 'Leg Press Calf Press', true, '98e1ca9d-4297-480a-b06b-7f2b8e7a276f', false, 'Activation', 'Weightlifting', NULL, 'Supine', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Machine']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Calves']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Supine Machine Calf Raise', 1, '98e1ca9d-4297-480a-b06b-7f2b8e7a276f'),
  ('e87d9cc5-a455-4feb-80be-81c42a384e8e', 'derive', false, 'Wide Grip Bench Press', 'Wide-Grip Bench Press', false, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, 'Wide', NULL, NULL, NULL, NULL, NULL, ARRAY['Barbell','Bench']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Shoulders','Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Wide-Grip Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('e8f336ff-6abe-4f45-a46b-70a95158273d', 'outlier', false, 'Kettlebell Swing With Squat Swing Combo', 'Kettlebell Swing With Squat Swing Combo', true, NULL, false, 'Squat', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], ARRAY['Core','Lower Back','Shoulders']::text[], NULL, '{}'::text[], false, 'Kettlebell Swing With Squat Swing Combo', NULL, NULL),
  ('e92f2281-d98b-4200-a644-0831871d1707', 'outlier', false, 'Horn Curl + Press Out', 'Horn Curl + Press Out', true, NULL, false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Biceps','Chest']::text[], ARRAY['Forearms / Grip','Shoulders','Triceps']::text[], NULL, '{}'::text[], false, 'Horn Curl + Press Out', NULL, NULL),
  ('ed1b3bbf-bc3c-46a6-90f3-ae2d097a0bd6', 'outlier', false, 'Kettlebell Sprawl Row', 'Kettlebell Sprawl Row', true, NULL, false, 'Pull', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor','Kettlebell']::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Full Body','Upper Back']::text[], ARRAY['Chest','Core','Forearms / Grip','Glutes','Quads','Shoulders']::text[], NULL, '{}'::text[], false, 'Kettlebell Sprawl Row', NULL, NULL),
  ('ee95e859-8e5e-4346-a3b0-9869a8c7d86b', 'derive', false, 'Plank Grab, Reach, And Pull', 'Plank Grab, Reach, And Pull', true, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', false, 'Midline', 'Weightlifting', NULL, NULL, NULL, 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, 'grab-reach-pull', ARRAY['Dumbbell','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Chest','Obliques','Shoulders']::text[], NULL, '{}'::text[], false, 'Alternating Dumbbell Grab-Reach-Pull Plank', 1, '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b'),
  ('f0b6fe29-c3b0-4c1e-a7f2-7ed11a013056', 'derive', false, 'Alternating Lunge ', 'Alternating Lunge', false, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', false, 'Lunge', 'Gymnastics', NULL, NULL, NULL, 'Alternating', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Quads']::text[], ARRAY['Calves','Core','Hip Flexors']::text[], NULL, '{}'::text[], false, 'Alternating Lunge', 1, 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9'),
  ('f3d47b88-b89d-4e0b-9c3d-5cbc08870ab6', 'derive', false, 'Cross Body Single-Arm Floor Press', 'Cross Body Single-Arm Floor Press', true, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, 'Supine', NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Floor','Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest','Triceps']::text[], ARRAY['Core','Shoulders']::text[], NULL, ARRAY['Cross Body SA Floor Press']::text[], false, 'Supine Floor Kettlebell Bench Press', 1, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('f57a4584-232e-4e44-9fa3-8276a991b076', 'outlier', false, 'Golf Swings', 'Golf Swings', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Obliques','Shoulders']::text[], ARRAY['Core','Hip Flexors']::text[], NULL, '{}'::text[], false, 'Golf Swings', NULL, NULL),
  ('f5bf41cb-7241-4b46-a656-1015ffbddf21', 'core', false, 'Burpee', 'Burpee', true, 'f5bf41cb-7241-4b46-a656-1015ffbddf21', true, 'Plyometric', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['MetCon']::text[], ARRAY['Chest','Core','Glutes','Quads','Shoulders']::text[], ARRAY['Calves','Hamstrings','Lower Back','Triceps']::text[], 'Bodyweight, Floor', '{}'::text[], false, 'Burpee', 0, NULL),
  ('f6abb193-16c5-4eef-83d4-5e95b5c6ef2d', 'core', false, 'Russian Twists', 'Russian Twist', true, 'f6abb193-16c5-4eef-83d4-5e95b5c6ef2d', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core','Obliques']::text[], ARRAY['Hip Flexors']::text[], 'Bodyweight, Floor', '{}'::text[], false, 'Russian Twist', 0, NULL),
  ('f6c0b711-4edc-445e-9790-eb93b773e2ca', 'derive', false, 'Cossack Squats', 'Cossack Squat', true, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50', false, 'Squat', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Lateral', NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Strength','Mobility']::text[], ARRAY['Hip Adductors','Quads']::text[], ARRAY['Glutes','Hamstrings']::text[], NULL, '{}'::text[], false, 'Lateral Squat', 1, '1cd3ad50-d9c5-439b-8dcc-590bb1887d50'),
  ('f7222122-0ffa-4337-8edd-9040e7c45190', 'derive', false, 'Double Bell Clean', 'Double Kettlebell Clean', true, 'b23b3d0b-de50-4526-8e28-e18377ad9767', false, 'Olympic', 'Weightlifting', 'Double Front Rack', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Glutes','Hamstrings','Shoulders']::text[], ARRAY['Core','Forearms / Grip','Upper Back']::text[], NULL, '{}'::text[], false, 'Kettlebell Double Front Rack Clean', 2, '96604640-4e25-4993-9b5d-902eb541ec4b'),
  ('f7975fca-5871-4600-bb4b-bfc8b1681a26', 'derive', false, 'Incline Reverse Crunch', 'Incline Reverse Crunch', false, 'b7e02387-dee4-4549-8601-eea0abdc1a89', false, 'Midline', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, 'Incline', NULL, NULL, NULL, NULL, ARRAY['Bench','Bodyweight']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Incline Reverse Crunch', 1, 'b7e02387-dee4-4549-8601-eea0abdc1a89'),
  ('f7a92fbd-7d0a-4671-a5ae-7ef7adc2075d', 'outlier', false, 'Foam Roll', 'Foam Roll', true, NULL, true, 'Foam Rolling', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Foam Roller']::text[], '{}'::text[], ARRAY['Recovery']::text[], ARRAY['Full Body']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Foam Roll', NULL, NULL),
  ('f92359e3-4f79-4ab8-88a3-d1661b22a379', 'derive', false, 'Single-Leg Calf Raise', 'Single-Leg Calf Raise', false, '98e1ca9d-4297-480a-b06b-7f2b8e7a276f', false, 'Activation', 'Weightlifting', NULL, 'Single-Leg', NULL, 'Unilateral', NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Calves']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Single-Leg Calf Raise', 1, '98e1ca9d-4297-480a-b06b-7f2b8e7a276f'),
  ('fbc40045-4a5a-4b78-a3da-77f59e94def5', 'derive', false, 'Balanced Knee Tucks', 'Balanced Knee Tucks', true, '060b2ea6-bf2d-41a2-ae31-75f8498be271', false, 'Midline', 'Gymnastics', NULL, NULL, 'Partial', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight','Floor']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Core']::text[], ARRAY['Hip Flexors']::text[], NULL, '{}'::text[], false, 'Partial Leg Raise', 1, '060b2ea6-bf2d-41a2-ae31-75f8498be271'),
  ('fc594581-6487-47e6-bc5e-5ed00be98478', 'derive', false, 'Hollow Hold Crush Press', 'Hollow Hold Crush Press', true, '81b5afdb-461c-4563-8b0c-a9cdeb2bb124', false, 'Push/Press', 'Weightlifting', NULL, 'Hollow', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Kettlebell']::text[], ARRAY['Crush']::text[], ARRAY['Strength']::text[], ARRAY['Chest','Core','Triceps']::text[], ARRAY['Hip Flexors','Shoulders']::text[], NULL, '{}'::text[], false, 'Crush Hollow Kettlebell Bench Press', 2, 'd2ec9d8c-8bca-4cb5-a842-534f13d41435'),
  ('fc768541-f4e9-4ca8-88d6-5522a4128371', 'derive', false, 'Seated Dumbbell Press', 'Seated Dumbbell Press', false, '4a7438df-8bee-4a3e-802a-72bee480df66', false, 'Push/Press', 'Weightlifting', NULL, 'Seated', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Dumbbell']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Shoulders','Triceps']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Seated Dumbbell Press', 2, '25809b50-015b-4578-9ac8-e73ec9d8be26'),
  ('fc86b911-7b6d-4999-941c-226a3d78efa1', 'outlier', false, 'Bound Ups', 'Bound Ups', true, NULL, false, 'Mobility', 'Recovery', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Bodyweight']::text[], '{}'::text[], ARRAY['Mobility']::text[], ARRAY['Calves','Quads']::text[], ARRAY['Glutes','Hamstrings']::text[], NULL, '{}'::text[], false, 'Bound Ups', NULL, NULL),
  ('fdbe541d-95b5-4b16-b80d-688f54ef50ed', 'derive', false, 'Cable Flys', 'Cable Chest Fly', false, '80d46a74-c62a-4849-920f-22d326bf7cef', false, 'Push/Press', 'Weightlifting', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ARRAY['Cable']::text[], '{}'::text[], ARRAY['Strength']::text[], ARRAY['Chest']::text[], '{}'::text[], NULL, '{}'::text[], false, 'Cable Chest Fly', 1, '80d46a74-c62a-4849-920f-22d326bf7cef'),
  ('fe1484e2-c645-4c11-95cf-ea1669af44f9', 'core', false, 'Dip', 'Dip', true, 'fe1484e2-c645-4c11-95cf-ea1669af44f9', true, 'Push/Press', 'Gymnastics', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::text[], '{}'::text[], ARRAY['Skill']::text[], ARRAY['Chest','Shoulders','Triceps']::text[], '{}'::text[], 'Bodyweight', '{}'::text[], false, 'Dip', 0, NULL);

CREATE TEMP TABLE _cp_merges (
  loser_id UUID PRIMARY KEY,
  loser_name TEXT NOT NULL,
  winner_id UUID NOT NULL
);
INSERT INTO _cp_merges VALUES
  ('05cbf27a-e3df-4a9d-87e4-e1507aeb1ee2', 'Overhead Cable Rope Tricep Extensions', '83822f11-0b85-4358-bef4-1c8c8043187e'),
  ('09212f1a-6d34-48c6-affc-2bb54ae36ab3', 'Leg Extensions', '54b39df9-219e-4870-834c-ee1e9c6199b0'),
  ('1536fb82-ead3-41f4-b9d8-e2f9575213b6', 'Tricep Pushdown - Rope Attachment', '328c34a9-af1e-433e-bde0-a19b5f71fddc'),
  ('220c6ac2-8878-4080-9e3d-d9368cf1e6ff', 'Barbell Bench Press (Medium Grip)', '81b5afdb-461c-4563-8b0c-a9cdeb2bb124'),
  ('2aece0cc-fc42-42a6-b0cf-685a5cea1702', 'Bent Over Row', 'b08c3cf8-b02a-4953-8a72-058b3ea2a00b'),
  ('4975ca4a-1dcd-40e9-9c74-0e8529a90c0e', 'Barbell Squat', '2fc183f8-e1a0-4a1e-ac1c-be4bf2871366'),
  ('61ea1015-5200-40ea-8ead-83effcd50cc6', 'Barbell Deadlift', 'ae7f41c1-fa4d-4f28-a255-5d48be5eb532'),
  ('67bb9120-8b5d-41f4-aa69-78f77713f866', 'Dips', 'fe1484e2-c645-4c11-95cf-ea1669af44f9'),
  ('699f4531-54ec-4fc4-bf92-edb7dad770eb', 'Standing Military Press', '4a7438df-8bee-4a3e-802a-72bee480df66'),
  ('718a016a-ad31-41a8-87be-d3960103877f', 'Single-Arm Kickback Variations', '8de37301-d912-428a-b434-4ac641b79cb0'),
  ('71bf3a1d-b380-409d-ab64-d6f54b5d2013', 'Bent Over Barbell Row', 'b6879563-ab0d-5bc6-9b44-cab09315d939'),
  ('87269f06-8ae1-4320-b581-6084daf46ac6', 'Air Squat', '1cd3ad50-d9c5-439b-8dcc-590bb1887d50'),
  ('8bac7714-3079-478d-86ea-acbca7df5742', 'Seated Mid Cable Fly', '50d7aad5-0542-43bf-8b74-0631b67bfcad'),
  ('b19e5060-0b0d-4214-bc03-e4cfcd78af32', 'Overhead Press', '4a7438df-8bee-4a3e-802a-72bee480df66'),
  ('d38b3cd2-67ae-4c87-aadb-502b861d34da', 'Side Lateral Raise', 'a0c205ee-3c0a-4ffc-8c98-5175e885d4b0'),
  ('d39fb66c-749e-4b51-83d5-3e36899c2a76', 'Pull Ups', 'b6439378-a400-4c51-a1fe-c3ce317970cb'),
  ('d9d0e8db-ac00-434c-a87e-2bfc30686f00', 'Rope Crunches', '47d9bcba-1b05-4a77-bf42-c908d1b8ea95'),
  ('ddf11ab7-eb62-4e96-a307-672cceaab5a7', 'Dips - Tricep Version', 'fe1484e2-c645-4c11-95cf-ea1669af44f9'),
  ('e1416c31-a647-4a0d-845b-aea974cef547', 'Barbell Row', 'b6879563-ab0d-5bc6-9b44-cab09315d939'),
  ('e1e31e87-93f9-4d83-8b0f-73c6f0beaf3d', 'Dip Or Seated Machine Dip', 'fe1484e2-c645-4c11-95cf-ea1669af44f9'),
  ('e67c93de-51fb-4a50-abba-c34230ea679f', 'Pullups', 'b6439378-a400-4c51-a1fe-c3ce317970cb'),
  ('ee16df57-abd6-470f-8959-983dfde8d8ca', 'Lying Leg Curls', '22a2b36e-e934-44e1-843c-92d55425d8c4'),
  ('eef17ace-fb86-492a-9332-3f189f9e3a9f', 'Lymphatic Jumps', 'c34597a3-55a5-4756-8188-8ff85d35b4b8'),
  ('f0f4178f-9ac9-4103-84b2-28b089c955b2', 'Standing Bicep Cable Curls', 'c5605994-39b6-4a45-afb4-c4d8e949d8cb'),
  ('f144f028-65b4-4209-9605-a479de7252bc', 'Cable Rope Curl', 'c5605994-39b6-4a45-afb4-c4d8e949d8cb');

-- Wild aliases captured from merge losers at merge time (name + legacy array);
-- re-asserted after the generated-alias purge so ordering accidents cannot lose them.
CREATE TEMP TABLE _cp_merge_wilds (
  winner_id UUID NOT NULL,
  alias TEXT NOT NULL
);

-- Fail fast if any staged reference value does not resolve (a silent NULL here
-- would otherwise masquerade as a deliberate blank).
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(bad.v, '; ' ORDER BY bad.v) INTO v_observed FROM (
    SELECT 'family: ' || s.family AS v FROM _cp_rows s
      WHERE NOT EXISTS (SELECT 1 FROM public.movement_families f WHERE f.name = s.family)
    UNION SELECT 'modality: ' || s.modality FROM _cp_rows s
      WHERE NOT EXISTS (SELECT 1 FROM public.movement_categories c WHERE c.name = s.modality)
    UNION SELECT 'load_position: ' || s.load_position FROM _cp_rows s
      WHERE s.load_position IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.load_positions x WHERE x.name = s.load_position)
    UNION SELECT 'stance: ' || s.stance FROM _cp_rows s
      WHERE s.stance IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stances x WHERE x.name = s.stance)
    UNION SELECT 'range_depth: ' || s.range_depth FROM _cp_rows s
      WHERE s.range_depth IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.range_depths x WHERE x.name = s.range_depth)
    UNION SELECT 'symmetry: ' || s.symmetry FROM _cp_rows s
      WHERE s.symmetry IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.symmetries x WHERE x.name = s.symmetry)
    UNION SELECT 'grip_orientation: ' || s.grip_orientation FROM _cp_rows s
      WHERE s.grip_orientation IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grips g WHERE g.name = s.grip_orientation AND g.category = 'Orientation')
    UNION SELECT 'grip_width: ' || s.grip_width FROM _cp_rows s
      WHERE s.grip_width IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grips g WHERE g.name = s.grip_width AND g.category = 'Width')
    UNION SELECT 'bench_angle: ' || s.bench_angle FROM _cp_rows s
      WHERE s.bench_angle IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bench_angles x WHERE x.name = s.bench_angle)
    UNION SELECT 'direction: ' || s.direction FROM _cp_rows s
      WHERE s.direction IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.directions x WHERE x.name = s.direction)
    UNION SELECT 'support_position: ' || s.support_position FROM _cp_rows s
      WHERE s.support_position IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.support_positions x WHERE x.name = s.support_position)
    UNION SELECT 'arm_position: ' || s.arm_position FROM _cp_rows s
      WHERE s.arm_position IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.arm_positions x WHERE x.name = s.arm_position)
    UNION SELECT 'equipment: ' || n FROM _cp_rows s CROSS JOIN LATERAL unnest(s.equipment) n
      WHERE NOT EXISTS (SELECT 1 FROM public.equipment x WHERE x.name = n)
    UNION SELECT 'style: ' || n FROM _cp_rows s CROSS JOIN LATERAL unnest(s.styles) n
      WHERE NOT EXISTS (SELECT 1 FROM public.movement_styles x WHERE x.name = n AND x.is_identity)
    UNION SELECT 'goal: ' || n FROM _cp_rows s CROSS JOIN LATERAL unnest(s.goals) n
      WHERE NOT EXISTS (SELECT 1 FROM public.goal_types x WHERE x.name = n)
    UNION SELECT 'muscle: ' || n FROM _cp_rows s CROSS JOIN LATERAL unnest(s.primary_muscles || s.secondary_muscles) n
      WHERE NOT EXISTS (SELECT 1 FROM public.muscle_regions x WHERE x.name = n)
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: staged values with no reference row: %', v_observed;
  END IF;

  -- every staged pre-existing exercise must exist with its sheet name (sanity:
  -- ids and names captured together on the approved sheet)
  SELECT string_agg(s.exercise_id::TEXT || ' (' || s.old_name || ')', '; ') INTO v_observed
    FROM _cp_rows s
   WHERE NOT s.is_new_core
     AND NOT EXISTS (SELECT 1 FROM public.exercises e
                      WHERE e.id = s.exercise_id AND e.name IN (s.old_name, s.final_name));
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: sheet rows not matching live exercises by id+name: %', v_observed;
  END IF;

  SELECT string_agg(m.loser_id::TEXT || ' (' || m.loser_name || ')', '; ') INTO v_observed
    FROM _cp_merges m
   WHERE EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = m.loser_id)
     AND NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = m.loser_id AND e.name = m.loser_name);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: merge losers not matching live exercises by id+name: %', v_observed;
  END IF;
END $$;

-- ============================================================================
-- 7) Core pass: five new core rows, promotions, curated renames, core-default
--    equipment. Descendants are recomputed in section 11 (a core rename does
--    not retrigger children on its own — the trigger has no name column).
-- ============================================================================
-- new core: Bent-Over Row (canonical slug is freed by the merges below, then claimed in section 8)
INSERT INTO public.exercises (id, name, slug, is_core, is_official, is_movement, name_is_custom,
                              movement_family_id, movement_category_id, core_default_equipment)
SELECT 'b6879563-ab0d-5bc6-9b44-cab09315d939', 'Bent-Over Row', 'bent-over-row-core', true, true, true, true,
       (SELECT id FROM public.movement_families WHERE name = 'Pull'),
       (SELECT id FROM public.movement_categories WHERE name = 'Weightlifting'),
       'Barbell'
 WHERE NOT EXISTS (SELECT 1 FROM public.exercises WHERE id = 'b6879563-ab0d-5bc6-9b44-cab09315d939');
-- new core: Carry
INSERT INTO public.exercises (id, name, slug, is_core, is_official, is_movement, name_is_custom,
                              movement_family_id, movement_category_id, core_default_equipment)
SELECT '87377b27-531d-5a4e-ab8f-4faf947495e3', 'Carry', 'carry', true, true, true, true,
       (SELECT id FROM public.movement_families WHERE name = 'Carry'),
       (SELECT id FROM public.movement_categories WHERE name = 'Weightlifting'),
       NULL
 WHERE NOT EXISTS (SELECT 1 FROM public.exercises WHERE id = '87377b27-531d-5a4e-ab8f-4faf947495e3');
-- new core: Lat Pulldown
INSERT INTO public.exercises (id, name, slug, is_core, is_official, is_movement, name_is_custom,
                              movement_family_id, movement_category_id, core_default_equipment)
SELECT '90d63ecc-cebe-5ace-806d-45c8560f973f', 'Lat Pulldown', 'lat-pulldown', true, true, false, true,
       (SELECT id FROM public.movement_families WHERE name = 'Pull'),
       (SELECT id FROM public.movement_categories WHERE name = 'Weightlifting'),
       'Cable'
 WHERE NOT EXISTS (SELECT 1 FROM public.exercises WHERE id = '90d63ecc-cebe-5ace-806d-45c8560f973f');
-- new core: Plank
INSERT INTO public.exercises (id, name, slug, is_core, is_official, is_movement, name_is_custom,
                              movement_family_id, movement_category_id, core_default_equipment)
SELECT '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', 'Plank', 'plank', true, true, false, true,
       (SELECT id FROM public.movement_families WHERE name = 'Midline'),
       (SELECT id FROM public.movement_categories WHERE name = 'Gymnastics'),
       'Bodyweight, Floor'
 WHERE NOT EXISTS (SELECT 1 FROM public.exercises WHERE id = '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b');
-- new core: Raise
INSERT INTO public.exercises (id, name, slug, is_core, is_official, is_movement, name_is_custom,
                              movement_family_id, movement_category_id, core_default_equipment)
SELECT '31994dce-91ac-5b52-9640-98b3c0bb2091', 'Raise', 'raise', true, true, false, true,
       (SELECT id FROM public.movement_families WHERE name = 'Push/Press'),
       (SELECT id FROM public.movement_categories WHERE name = 'Weightlifting'),
       'Dumbbell'
 WHERE NOT EXISTS (SELECT 1 FROM public.exercises WHERE id = '31994dce-91ac-5b52-9640-98b3c0bb2091');

-- Promote + rename the 43 sheet cores (9 already core from Stage 1). The BEFORE
-- trigger self-references core_movement_id; the AFTER trigger recomputes.
UPDATE public.exercises e
   SET is_core = true,
       parent_exercise_id = NULL,      -- check_core_no_parent: a core sheds its legacy parent
       name = s.final_name,
       name_is_custom = s.name_is_custom,
       core_default_equipment = s.core_default_equipment,
       updated_at = now()
  FROM _cp_rows s
 WHERE s.exercise_id = e.id AND s.kind = 'core' AND NOT s.is_new_core
   AND (NOT e.is_core
        OR e.parent_exercise_id IS NOT NULL
        OR e.name IS DISTINCT FROM s.final_name
        OR e.name_is_custom IS DISTINCT FROM s.name_is_custom
        OR e.core_default_equipment IS DISTINCT FROM s.core_default_equipment);

-- ============================================================================
-- 8) variant_labels seed (G2: each label scoped to exactly one core, by id)
-- ============================================================================
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT 'b6439378-a400-4c51-a1fe-c3ce317970cb', 'chest-to-bar', 'Chest-to-Bar', 48  -- core: Pull-Up
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = 'b6439378-a400-4c51-a1fe-c3ce317970cb' AND slug = 'chest-to-bar');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT '98e1ca9d-4297-480a-b06b-7f2b8e7a276f', 'donkey', 'Donkey', 48  -- core: Calf Raise
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = '98e1ca9d-4297-480a-b06b-7f2b8e7a276f' AND slug = 'donkey');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT 'da5fcd1e-b402-41ae-a144-5596aaa510d1', 'double', 'Double', 48  -- core: Crunch
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = 'da5fcd1e-b402-41ae-a144-5596aaa510d1' AND slug = 'double');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT 'c2ba5880-c532-4981-8b14-da1be3e6b78f', 'double-tap', 'Double-Tap', 48  -- core: Mountain Climber
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = 'c2ba5880-c532-4981-8b14-da1be3e6b78f' AND slug = 'double-tap');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT 'e3cdc5c3-6618-4050-85db-88e4a1a70f29', 'double-under', 'Double-Under', 48  -- core: Jump Rope
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = 'e3cdc5c3-6618-4050-85db-88e4a1a70f29' AND slug = 'double-under');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT 'da5fcd1e-b402-41ae-a144-5596aaa510d1', 'elbow-reach', 'Elbow-Reach', 48  -- core: Crunch
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = 'da5fcd1e-b402-41ae-a144-5596aaa510d1' AND slug = 'elbow-reach');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT '01f01e3a-393d-4819-8834-cf25ea1ba04a', 'ez-bar', 'EZ-Bar', 48  -- core: Curl
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = '01f01e3a-393d-4819-8834-cf25ea1ba04a' AND slug = 'ez-bar');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', 'grab-reach-pull', 'Grab-Reach-Pull', 48  -- core: Plank
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b' AND slug = 'grab-reach-pull');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT '2222e3be-0481-4103-827c-8fb0f3eb78c5', 'high-stance', 'High-Stance', 48  -- core: Leg Press
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = '2222e3be-0481-4103-827c-8fb0f3eb78c5' AND slug = 'high-stance');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT '01f01e3a-393d-4819-8834-cf25ea1ba04a', 'horn', 'Horn', 48  -- core: Curl
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = '01f01e3a-393d-4819-8834-cf25ea1ba04a' AND slug = 'horn');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', 'jacks', 'Jack', 48  -- core: Plank
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b' AND slug = 'jacks');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', 'pull-through', 'Pull-Through', 48  -- core: Plank
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b' AND slug = 'pull-through');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', 'reach', 'Reach', 48  -- core: Plank
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b' AND slug = 'reach');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b', 'renegade-row', 'Renegade-Row', 48  -- core: Plank
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = '4ce7951f-71b8-5d07-b3d7-163f3d9eb15b' AND slug = 'renegade-row');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT 'c2ba5880-c532-4981-8b14-da1be3e6b78f', 'spider', 'Spider', 48  -- core: Mountain Climber
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = 'c2ba5880-c532-4981-8b14-da1be3e6b78f' AND slug = 'spider');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT 'da5fcd1e-b402-41ae-a144-5596aaa510d1', 'toe-tap', 'Toe-Tap', 48  -- core: Crunch
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = 'da5fcd1e-b402-41ae-a144-5596aaa510d1' AND slug = 'toe-tap');
INSERT INTO public.variant_labels (core_movement_id, slug, name_fragment, name_order)
SELECT '6fe16d57-5b36-42be-828d-70270e41e912', 'walkout', 'Walkout', 48  -- core: Push-Up
 WHERE NOT EXISTS (SELECT 1 FROM public.variant_labels
                    WHERE core_movement_id = '6fe16d57-5b36-42be-828d-70270e41e912' AND slug = 'walkout');

-- ============================================================================
-- 9) Merges: 25 duplicate rows fold into their winners. The repoint is driven
--    by pg_constraint at runtime — every FK that references exercises(id) is
--    discovered and repointed (dedupe-skip against any unique index containing
--    the FK column), so a schema addition can never silently orphan rows.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_exercise_into(p_loser UUID, p_winner UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fk RECORD;
  idx RECORD;
  v_cond TEXT;
  v_loser_name TEXT;
  v_winner_name TEXT;
BEGIN
  IF p_loser = p_winner THEN
    RAISE EXCEPTION 'merge_exercise_into: loser and winner are the same row (%)', p_loser;
  END IF;
  SELECT name INTO v_winner_name FROM exercises WHERE id = p_winner FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'merge_exercise_into: winner % does not exist', p_winner;
  END IF;
  SELECT name INTO v_loser_name FROM exercises WHERE id = p_loser FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;                                                   -- already merged (idempotent)
  END IF;

  -- The loser's display name and its legacy array aliases survive as wild
  -- aliases on the winner (never one that trim-equals the winner's own name).
  INSERT INTO exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
  SELECT p_winner, a.alias, normalize_alias(a.alias), 'wild', 'seed'
    FROM (SELECT v_loser_name AS alias
          UNION
          SELECT unnest(l.aliases) FROM exercises l WHERE l.id = p_loser) a
   WHERE btrim(a.alias) <> v_winner_name
     AND normalize_alias(a.alias) <> ''
  ON CONFLICT (alias_normalized) DO NOTHING;

  FOR fk IN
    SELECT c.oid AS con_oid, c.conrelid::regclass AS tbl, a.attname AS col,
           c.conrelid = 'public.exercises'::regclass::oid AS self_ref,
           cardinality(c.conkey) AS ncols
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confrelid = 'public.exercises'::regclass
     ORDER BY c.conrelid::regclass::text, a.attname
  LOOP
    IF fk.ncols <> 1 THEN
      RAISE EXCEPTION 'merge_exercise_into: multi-column FK % on % is not supported', fk.con_oid::regclass, fk.tbl;
    END IF;

    -- Dedupe-skip: for every unique index containing this column, drop loser
    -- rows whose repointed image already exists on the winner.
    FOR idx IN
      SELECT i.indexrelid,
             (SELECT string_agg(format('t2.%1$I IS NOT DISTINCT FROM t1.%1$I', a2.attname), ' AND ')
                FROM unnest(i.indkey[0:i.indnkeyatts-1]) k(attnum)
                JOIN pg_attribute a2 ON a2.attrelid = i.indrelid AND a2.attnum = k.attnum
               WHERE a2.attname <> fk.col) AS other_cols
        FROM pg_index i
       WHERE i.indrelid = fk.tbl AND i.indisunique
         AND i.indpred IS NULL AND i.indexprs IS NULL
         AND EXISTS (SELECT 1 FROM unnest(i.indkey[0:i.indnkeyatts-1]) k(attnum)
                       JOIN pg_attribute a2 ON a2.attrelid = i.indrelid AND a2.attnum = k.attnum
                      WHERE a2.attname = fk.col)
       ORDER BY i.indexrelid
    LOOP
      EXECUTE format(
        'DELETE FROM %s t1 WHERE t1.%I = $1 AND EXISTS (SELECT 1 FROM %s t2 WHERE t2.%I = $2 AND %s)',
        fk.tbl, fk.col, fk.tbl, fk.col, COALESCE(idx.other_cols, 'true'))
      USING p_loser, p_winner;
    END LOOP;

    EXECUTE format('UPDATE %s SET %I = $2 WHERE %I = $1%s',
                   fk.tbl, fk.col, fk.col,
                   CASE WHEN fk.self_ref THEN ' AND id <> $1' ELSE '' END)
    USING p_loser, p_winner;
  END LOOP;

  -- Scaling links that became self-referential collapse away.
  IF to_regclass('public.movement_scaling_links') IS NOT NULL THEN
    DELETE FROM movement_scaling_links WHERE from_exercise_id = to_exercise_id;
  END IF;

  DELETE FROM exercises WHERE id = p_loser;
END $$;

DO $$
DECLARE
  m RECORD;
BEGIN
  FOR m IN SELECT * FROM _cp_merges ORDER BY loser_name LOOP
    IF NOT EXISTS (SELECT 1 FROM public.exercises WHERE id = m.winner_id) THEN
      RAISE EXCEPTION 'catalog pass FAIL: merge winner % for loser % missing', m.winner_id, m.loser_name;
    END IF;
    -- capture the loser''s wild-alias contributions before it disappears, so the
    -- alias rebuild (section 14) can re-assert them after the generated purge
    INSERT INTO _cp_merge_wilds (winner_id, alias)
    SELECT m.winner_id, a.alias
      FROM public.exercises l
      CROSS JOIN LATERAL (SELECT l.name AS alias UNION SELECT unnest(l.aliases)) a
     WHERE l.id = m.loser_id
       AND btrim(a.alias) <> (SELECT name FROM public.exercises WHERE id = m.winner_id)
       AND public.normalize_alias(a.alias) <> '';
    PERFORM public.merge_exercise_into(m.loser_id, m.winner_id);
  END LOOP;
END $$;

-- the merges above freed the canonical slug for Bent-Over Row
UPDATE public.exercises SET slug = 'bent-over-row'
 WHERE id = 'b6879563-ab0d-5bc6-9b44-cab09315d939' AND slug IS DISTINCT FROM 'bent-over-row';

-- ============================================================================
-- 10) Classification: every surviving row gets its approved attribute set,
--     display name and flags in one row-update (the identity trigger recomputes
--     per row once the statement completes), then the junctions are synced.
-- ============================================================================
UPDATE public.exercises e
   SET is_core = (s.kind = 'core'),
       core_movement_id = s.core_id,
       is_movement = s.is_movement,
       name = s.final_name,
       name_is_custom = s.name_is_custom,
       core_default_equipment = s.core_default_equipment,
       movement_family_id = (SELECT id FROM public.movement_families WHERE name = s.family),
       movement_category_id = (SELECT id FROM public.movement_categories WHERE name = s.modality),
       goal_type_id = (SELECT id FROM public.goal_types WHERE name = s.goals[1]),
       load_position_id = (SELECT id FROM public.load_positions WHERE name = s.load_position),
       stance_id = (SELECT id FROM public.stances WHERE name = s.stance),
       range_depth_id = (SELECT id FROM public.range_depths WHERE name = s.range_depth),
       symmetry_id = (SELECT id FROM public.symmetries WHERE name = s.symmetry),
       grip_orientation_id = (SELECT id FROM public.grips WHERE name = s.grip_orientation AND category = 'Orientation'),
       grip_width_id = (SELECT id FROM public.grips WHERE name = s.grip_width AND category = 'Width'),
       bench_angle_id = (SELECT id FROM public.bench_angles WHERE name = s.bench_angle),
       direction_id = (SELECT id FROM public.directions WHERE name = s.direction),
       support_position_id = (SELECT id FROM public.support_positions WHERE name = s.support_position),
       arm_position_id = (SELECT id FROM public.arm_positions WHERE name = s.arm_position),
       variant_label_id = (SELECT id FROM public.variant_labels
                            WHERE slug = s.variant_slug AND core_movement_id = s.core_id),
       -- outliers keep no machine hierarchy: the legacy hand-set parents the
       -- engine preserves for coreless rows retire with this pass
       parent_exercise_id = CASE WHEN s.kind = 'outlier' THEN NULL ELSE e.parent_exercise_id END,
       updated_at = now()
  FROM _cp_rows s
 WHERE s.exercise_id = e.id;

-- Equipment junction := the approved per-row set (cores carry none — the new
-- convention; their defaults live in core_default_equipment as naming metadata).
DELETE FROM public.exercise_equipment ee
 USING _cp_rows s
 WHERE ee.exercise_id = s.exercise_id
   AND NOT EXISTS (SELECT 1 FROM unnest(s.equipment) n
                    JOIN public.equipment q ON q.name = n
                   WHERE q.id = ee.equipment_id);
INSERT INTO public.exercise_equipment (exercise_id, equipment_id)
SELECT s.exercise_id, q.id
  FROM _cp_rows s
 CROSS JOIN LATERAL unnest(s.equipment) n
  JOIN public.equipment q ON q.name = n
ON CONFLICT (exercise_id, equipment_id) DO NOTHING;

-- Identity styles := the approved per-row set. Modifier-style junction rows
-- (Tempo, Pause, …) are prescription metadata and stay untouched.
DELETE FROM public.exercise_movement_styles ems
 USING _cp_rows s, public.movement_styles ms
 WHERE ems.exercise_id = s.exercise_id
   AND ms.id = ems.movement_style_id AND ms.is_identity
   AND NOT (ms.name = ANY (s.styles));
INSERT INTO public.exercise_movement_styles (exercise_id, movement_style_id)
SELECT s.exercise_id, ms.id
  FROM _cp_rows s
 CROSS JOIN LATERAL unnest(s.styles) n
  JOIN public.movement_styles ms ON ms.name = n AND ms.is_identity
ON CONFLICT (exercise_id, movement_style_id) DO NOTHING;

-- Goals := the approved per-row set (legacy goal_type_id was set to the first
-- listed goal above; the junction carries the full set).
DELETE FROM public.exercise_goal_types x
 USING _cp_rows s
 WHERE x.exercise_id = s.exercise_id
   AND NOT EXISTS (SELECT 1 FROM unnest(s.goals) n
                    JOIN public.goal_types g ON g.name = n
                   WHERE g.id = x.goal_type_id);
INSERT INTO public.exercise_goal_types (exercise_id, goal_type_id)
SELECT s.exercise_id, g.id
  FROM _cp_rows s
 CROSS JOIN LATERAL unnest(s.goals) n
  JOIN public.goal_types g ON g.name = n
ON CONFLICT (exercise_id, goal_type_id) DO NOTHING;

-- Muscles := the approved per-row sets with the primary/secondary split.
DELETE FROM public.exercise_muscle_regions x
 USING _cp_rows s
 WHERE x.exercise_id = s.exercise_id
   AND NOT EXISTS (SELECT 1 FROM unnest(s.primary_muscles || s.secondary_muscles) n
                    JOIN public.muscle_regions m ON m.name = n
                   WHERE m.id = x.muscle_region_id);
UPDATE public.exercise_muscle_regions x
   SET is_primary = (m.name = ANY (s.primary_muscles))
  FROM _cp_rows s, public.muscle_regions m
 WHERE x.exercise_id = s.exercise_id AND m.id = x.muscle_region_id
   AND x.is_primary IS DISTINCT FROM (m.name = ANY (s.primary_muscles));
INSERT INTO public.exercise_muscle_regions (exercise_id, muscle_region_id, is_primary)
SELECT s.exercise_id, m.id, (m.name = ANY (s.primary_muscles))
  FROM _cp_rows s
 CROSS JOIN LATERAL unnest(s.primary_muscles || s.secondary_muscles) n
  JOIN public.muscle_regions m ON m.name = n
ON CONFLICT (exercise_id, muscle_region_id) DO NOTHING;

-- ============================================================================
-- 11) Deterministic full recompute, ascending identity-attribute cardinality:
--     parents always finalize before their children, so the machine-derived
--     parent/tier chain lands in one pass (covers the core renames too).
-- ============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.exercises
    ORDER BY cardinality(public.exercise_identity_attrs(id)) ASC, created_at ASC, id ASC
  LOOP
    PERFORM public.recompute_exercise_identity(r.id);
  END LOOP;
END $$;

-- ============================================================================
-- 12) Legacy equipment_types array: kept in place (it drops in Stage 6) but
--     updated to the canonical final state so the array and the junction agree
--     — for cores that means their core-default equipment (the array still
--     feeds the app's equipment filters; an empty array would blank them).
-- ============================================================================
UPDATE public.exercises e
   SET equipment_types = v.arr
  FROM (SELECT s.exercise_id,
               CASE WHEN s.kind = 'core'
                    THEN COALESCE((SELECT array_agg(btrim(x)) FROM unnest(string_to_array(s.core_default_equipment, ',')) x
                                    WHERE btrim(x) <> ''), '{}')
                    ELSE s.equipment
               END AS arr
          FROM _cp_rows s) v
 WHERE e.id = v.exercise_id
   AND e.equipment_types IS DISTINCT FROM v.arr;

-- ============================================================================
-- 13) Legacy 'Supine / Prone' stance retires: the classification above is the
--     only writer of stance_id, so zero references must remain.
-- ============================================================================
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_observed
    FROM public.exercises e
    JOIN public.stances s ON s.id = e.stance_id
   WHERE s.name = 'Supine / Prone';
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: rows still on legacy Supine / Prone stance: %', v_observed;
  END IF;
END $$;
-- legacy dual-store junction debris goes with it (the FK would cascade anyway;
-- explicit for the record — 1 row on the 2026-08-24 snapshot)
DELETE FROM public.exercise_stances es
 USING public.stances s
 WHERE s.id = es.stance_id AND s.name = 'Supine / Prone';
DELETE FROM public.stances WHERE name = 'Supine / Prone';

-- ============================================================================
-- 14) Alias purge + rebuild. Order matters: purge ALL generated aliases (the
--     per-row recomputes above minted every intermediate name as debris; the
--     merge-time wilds landed before the purge and are re-asserted after it),
--     then re-mint generated aliases from the final generated names — only for
--     rows whose generated name differs from their display name — and finally
--     insert the wild set (old display names, sheet-note wilds, legacy array
--     aliases, merge-loser contributions). Generated aliases mint first so a
--     string that is both a row's generated name and one of its wild sources
--     lands as kind='generated'. A mint collision with an alias owned by
--     another exercise routes to exercise_match_reviews instead of failing,
--     except the documented Single-Arm Powerbomb suppression (its generated
--     alias would duplicate sibling Overhead Extension's, because Unilateral
--     is silent in names).
-- ============================================================================
DELETE FROM public.exercise_aliases WHERE kind = 'generated';

-- re-mint generated aliases
DO $$
DECLARE
  r RECORD;
  v_n INTEGER;
  v_norm TEXT;
  v_user UUID;
BEGIN
  FOR r IN
    SELECT e.id, e.name, e.generated_name, e.created_by
      FROM public.exercises e
      JOIN _cp_rows s ON s.exercise_id = e.id
     WHERE e.core_movement_id IS NOT NULL              -- never read generated_name off a coreless row
       AND e.generated_name IS NOT NULL AND e.generated_name <> ''
       AND e.generated_name <> e.name
       AND NOT s.suppress_generated_alias              -- the documented Powerbomb suppression
     ORDER BY e.name, e.id
  LOOP
    v_norm := public.normalize_alias(r.generated_name);
    INSERT INTO public.exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
    VALUES (r.id, r.generated_name, v_norm, 'generated', 'seed')
    ON CONFLICT (alias_normalized) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 AND NOT EXISTS (SELECT 1 FROM public.exercise_aliases
                                WHERE exercise_id = r.id AND alias_normalized = v_norm) THEN
      -- collision with an alias owned elsewhere: route to review, never fail
      SELECT COALESCE(r.created_by, (SELECT u.id FROM auth.users u ORDER BY u.created_at, u.id LIMIT 1))
        INTO v_user;
      IF v_user IS NULL THEN
        RAISE EXCEPTION 'catalog pass FAIL: generated-alias collision for % (%) and no auth user to own the review row',
          r.name, r.generated_name;
      END IF;
      INSERT INTO public.exercise_match_reviews (user_id, raw_name, raw_name_normalized, context, candidates, status)
      SELECT v_user, r.generated_name, v_norm,
             'catalog-pass generated-alias collision (exercise ' || r.id || ')',
             '[]'::jsonb, 'pending'
       WHERE NOT EXISTS (SELECT 1 FROM public.exercise_match_reviews
                          WHERE raw_name_normalized = v_norm
                            AND context = 'catalog-pass generated-alias collision (exercise ' || r.id || ')');
      RAISE WARNING 'catalog pass: generated alias % for % collided; routed to exercise_match_reviews',
        r.generated_name, r.name;
    END IF;
  END LOOP;
END $$;

-- old display names become wild aliases (skip exact keep-names: a trim-equal
-- alias of the row's own final name carries no information)
INSERT INTO public.exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
SELECT s.exercise_id, s.old_name, public.normalize_alias(s.old_name), 'wild', 'seed'
  FROM _cp_rows s
 WHERE s.old_name IS NOT NULL
   AND btrim(s.old_name) <> s.final_name
   AND public.normalize_alias(s.old_name) <> ''
ON CONFLICT (alias_normalized) DO NOTHING;

-- sheet-note wild aliases (wild-alias: markers on the approved sheet)
INSERT INTO public.exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
SELECT s.exercise_id, a, public.normalize_alias(a), 'wild', 'seed'
  FROM _cp_rows s
 CROSS JOIN LATERAL unnest(s.note_wild_aliases) a
 WHERE public.normalize_alias(a) <> ''
ON CONFLICT (alias_normalized) DO NOTHING;

-- legacy exercises.aliases array contents become wild aliases (the array drops
-- in Stage 6; from here the alias table is the single source of truth)
INSERT INTO public.exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
SELECT e.id, a, public.normalize_alias(a), 'wild', 'seed'
  FROM public.exercises e
 CROSS JOIN LATERAL unnest(e.aliases) a
 WHERE btrim(a) <> e.name
   AND public.normalize_alias(a) <> ''
ON CONFLICT (alias_normalized) DO NOTHING;

-- merge-loser contributions, re-asserted post-purge
INSERT INTO public.exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
SELECT mw.winner_id, mw.alias, public.normalize_alias(mw.alias), 'wild', 'seed'
  FROM _cp_merge_wilds mw
ON CONFLICT (alias_normalized) DO NOTHING;

-- ============================================================================
-- 15) SELF-VERIFY (standing rule): assert the achieved end state against the
--     blessed projection before the transaction commits; observed values in
--     every failure message. `db push` does not run the harness, so this file
--     fails the push closed on any drift.
-- ============================================================================

-- 15a) population: exactly the staged 287 rows survive, 48/187/52 by kind,
--      every merge loser gone, every winner present
DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM public.exercises;
  IF v_count <> 287 THEN
    RAISE EXCEPTION 'catalog pass FAIL: exercises count % (expected 287)', v_count;
  END IF;

  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_observed
    FROM public.exercises e WHERE NOT EXISTS (SELECT 1 FROM _cp_rows s WHERE s.exercise_id = e.id);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: unstaged exercises present: %', v_observed;
  END IF;
  SELECT string_agg(s.final_name, ', ' ORDER BY s.final_name) INTO v_observed
    FROM _cp_rows s WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = s.exercise_id);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: staged exercises missing: %', v_observed;
  END IF;

  SELECT count(*) INTO v_count FROM public.exercises WHERE is_core;
  IF v_count <> 48 THEN
    RAISE EXCEPTION 'catalog pass FAIL: core count % (expected 48)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.exercises WHERE NOT is_core AND core_movement_id IS NOT NULL;
  IF v_count <> 187 THEN
    RAISE EXCEPTION 'catalog pass FAIL: derivation count % (expected 187)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.exercises WHERE core_movement_id IS NULL;
  IF v_count <> 52 THEN
    RAISE EXCEPTION 'catalog pass FAIL: outlier count % (expected 52)', v_count;
  END IF;

  SELECT string_agg(m.loser_name, ', ' ORDER BY m.loser_name) INTO v_observed
    FROM _cp_merges m WHERE EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = m.loser_id);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: merge losers still present: %', v_observed;
  END IF;
  SELECT string_agg(m.loser_name || ' -> ' || m.winner_id, ', ' ORDER BY m.loser_name) INTO v_observed
    FROM _cp_merges m WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = m.winner_id);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: merge winners missing: %', v_observed;
  END IF;
END $$;

-- 15b) per-row end state: display name, custom flag, generated name, core,
--      tier, machine parent, is_movement, family, modality — all 287 rows
--      against the blessed projection
DO $$
DECLARE
  v_bad INTEGER;
  v_observed TEXT;
BEGIN
  SELECT count(*),
         string_agg(bad.detail, E'\n' ORDER BY bad.detail) FILTER (WHERE bad.rn <= 10)
    INTO v_bad, v_observed
  FROM (
    SELECT row_number() OVER (ORDER BY s.final_name) AS rn,
           s.final_name || ': ' ||
           concat_ws('; ',
             CASE WHEN e.name IS DISTINCT FROM s.final_name
                  THEN 'name=' || COALESCE(e.name, 'null') END,
             CASE WHEN e.name_is_custom IS DISTINCT FROM s.name_is_custom
                  THEN 'name_is_custom=' || e.name_is_custom::TEXT END,
             CASE WHEN e.generated_name IS DISTINCT FROM s.expected_generated
                  THEN 'generated=' || COALESCE(e.generated_name, 'null') || ' (expected ' || s.expected_generated || ')' END,
             CASE WHEN e.core_movement_id IS DISTINCT FROM s.core_id
                  THEN 'core=' || COALESCE(e.core_movement_id::TEXT, 'null') END,
             CASE WHEN e.is_core IS DISTINCT FROM (s.kind = 'core')
                  THEN 'is_core=' || e.is_core::TEXT END,
             CASE WHEN e.tier IS DISTINCT FROM s.expected_tier
                  THEN 'tier=' || COALESCE(e.tier::TEXT, 'null') || ' (expected ' || COALESCE(s.expected_tier::TEXT, 'null') || ')' END,
             CASE WHEN e.parent_exercise_id IS DISTINCT FROM s.expected_parent_id
                  THEN 'parent=' || COALESCE(e.parent_exercise_id::TEXT, 'null') || ' (expected ' || COALESCE(s.expected_parent_id::TEXT, 'null') || ')' END,
             CASE WHEN e.is_movement IS DISTINCT FROM s.is_movement
                  THEN 'is_movement=' || COALESCE(e.is_movement::TEXT, 'null') END,
             CASE WHEN f.name IS DISTINCT FROM s.family
                  THEN 'family=' || COALESCE(f.name, 'null') END,
             CASE WHEN mc.name IS DISTINCT FROM s.modality
                  THEN 'modality=' || COALESCE(mc.name, 'null') END,
             CASE WHEN e.core_movement_id IS NOT NULL AND e.identity_fingerprint IS NULL
                  THEN 'fingerprint=null' END
           ) AS detail
      FROM _cp_rows s
      JOIN public.exercises e ON e.id = s.exercise_id
      LEFT JOIN public.movement_families f ON f.id = e.movement_family_id
      LEFT JOIN public.movement_categories mc ON mc.id = e.movement_category_id
     WHERE e.name IS DISTINCT FROM s.final_name
        OR e.name_is_custom IS DISTINCT FROM s.name_is_custom
        OR e.generated_name IS DISTINCT FROM s.expected_generated
        OR e.core_movement_id IS DISTINCT FROM s.core_id
        OR e.is_core IS DISTINCT FROM (s.kind = 'core')
        OR e.tier IS DISTINCT FROM s.expected_tier
        OR e.parent_exercise_id IS DISTINCT FROM s.expected_parent_id
        OR e.is_movement IS DISTINCT FROM s.is_movement
        OR f.name IS DISTINCT FROM s.family
        OR mc.name IS DISTINCT FROM s.modality
        OR (e.core_movement_id IS NOT NULL AND e.identity_fingerprint IS NULL)
  ) bad;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'catalog pass FAIL: % rows diverge from the blessed projection (first 10):\n%', v_bad, v_observed;
  END IF;
END $$;

-- 15c) attribute columns resolve to exactly the staged values (both directions:
--      a NULL where the sheet has a value is as fatal as the reverse)
DO $$
DECLARE
  v_bad INTEGER;
  v_observed TEXT;
BEGIN
  SELECT count(*), string_agg(bad.detail, E'\n' ORDER BY bad.detail) FILTER (WHERE bad.rn <= 10)
    INTO v_bad, v_observed
  FROM (
    SELECT row_number() OVER (ORDER BY s.final_name) AS rn,
           s.final_name || ': ' ||
           concat_ws('; ',
             CASE WHEN lp.name IS DISTINCT FROM s.load_position THEN 'load_position=' || COALESCE(lp.name, 'null') || '<>' || COALESCE(s.load_position, 'null') END,
             CASE WHEN st.name IS DISTINCT FROM s.stance THEN 'stance=' || COALESCE(st.name, 'null') || '<>' || COALESCE(s.stance, 'null') END,
             CASE WHEN rd.name IS DISTINCT FROM s.range_depth THEN 'range_depth=' || COALESCE(rd.name, 'null') || '<>' || COALESCE(s.range_depth, 'null') END,
             CASE WHEN sy.name IS DISTINCT FROM s.symmetry THEN 'symmetry=' || COALESCE(sy.name, 'null') || '<>' || COALESCE(s.symmetry, 'null') END,
             CASE WHEN go.name IS DISTINCT FROM s.grip_orientation THEN 'grip_orientation=' || COALESCE(go.name, 'null') || '<>' || COALESCE(s.grip_orientation, 'null') END,
             CASE WHEN gw.name IS DISTINCT FROM s.grip_width THEN 'grip_width=' || COALESCE(gw.name, 'null') || '<>' || COALESCE(s.grip_width, 'null') END,
             CASE WHEN ba.name IS DISTINCT FROM s.bench_angle THEN 'bench_angle=' || COALESCE(ba.name, 'null') || '<>' || COALESCE(s.bench_angle, 'null') END,
             CASE WHEN di.name IS DISTINCT FROM s.direction THEN 'direction=' || COALESCE(di.name, 'null') || '<>' || COALESCE(s.direction, 'null') END,
             CASE WHEN sp.name IS DISTINCT FROM s.support_position THEN 'support=' || COALESCE(sp.name, 'null') || '<>' || COALESCE(s.support_position, 'null') END,
             CASE WHEN ap.name IS DISTINCT FROM s.arm_position THEN 'arm_position=' || COALESCE(ap.name, 'null') || '<>' || COALESCE(s.arm_position, 'null') END,
             CASE WHEN vl.slug IS DISTINCT FROM s.variant_slug THEN 'variant=' || COALESCE(vl.slug, 'null') || '<>' || COALESCE(s.variant_slug, 'null') END
           ) AS detail
      FROM _cp_rows s
      JOIN public.exercises e ON e.id = s.exercise_id
      LEFT JOIN public.load_positions lp ON lp.id = e.load_position_id
      LEFT JOIN public.stances st ON st.id = e.stance_id
      LEFT JOIN public.range_depths rd ON rd.id = e.range_depth_id
      LEFT JOIN public.symmetries sy ON sy.id = e.symmetry_id
      LEFT JOIN public.grips go ON go.id = e.grip_orientation_id
      LEFT JOIN public.grips gw ON gw.id = e.grip_width_id
      LEFT JOIN public.bench_angles ba ON ba.id = e.bench_angle_id
      LEFT JOIN public.directions di ON di.id = e.direction_id
      LEFT JOIN public.support_positions sp ON sp.id = e.support_position_id
      LEFT JOIN public.arm_positions ap ON ap.id = e.arm_position_id
      LEFT JOIN public.variant_labels vl ON vl.id = e.variant_label_id
     WHERE lp.name IS DISTINCT FROM s.load_position
        OR st.name IS DISTINCT FROM s.stance
        OR rd.name IS DISTINCT FROM s.range_depth
        OR sy.name IS DISTINCT FROM s.symmetry
        OR go.name IS DISTINCT FROM s.grip_orientation
        OR gw.name IS DISTINCT FROM s.grip_width
        OR ba.name IS DISTINCT FROM s.bench_angle
        OR di.name IS DISTINCT FROM s.direction
        OR sp.name IS DISTINCT FROM s.support_position
        OR ap.name IS DISTINCT FROM s.arm_position
        OR vl.slug IS DISTINCT FROM s.variant_slug
  ) bad;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'catalog pass FAIL: % rows with divergent attribute columns (first 10):\n%', v_bad, v_observed;
  END IF;
END $$;

-- 15d) junction equality per row: equipment (equivalent to the sheet, which
--      already folds the implied-equipment canonicalization), identity styles,
--      goals, muscles with the primary/secondary split; plus no orphans and
--      the cores-carry-no-equipment convention
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(bad.v, E'\n' ORDER BY bad.v) INTO v_observed FROM (
    SELECT s.final_name || ' equipment: {' ||
           COALESCE((SELECT string_agg(q.name, ',' ORDER BY q.name)
                       FROM public.exercise_equipment ee JOIN public.equipment q ON q.id = ee.equipment_id
                      WHERE ee.exercise_id = s.exercise_id), '') || '} expected {' ||
           array_to_string(s.equipment, ',') || '}' AS v
      FROM _cp_rows s
     WHERE COALESCE((SELECT array_agg(q.name ORDER BY q.name)
                       FROM public.exercise_equipment ee JOIN public.equipment q ON q.id = ee.equipment_id
                      WHERE ee.exercise_id = s.exercise_id), '{}')
           IS DISTINCT FROM (SELECT COALESCE(array_agg(x ORDER BY x), '{}') FROM unnest(s.equipment) x)
    UNION ALL
    SELECT s.final_name || ' identity styles: {' ||
           COALESCE((SELECT string_agg(ms.name, ',' ORDER BY ms.name)
                       FROM public.exercise_movement_styles x JOIN public.movement_styles ms
                         ON ms.id = x.movement_style_id AND ms.is_identity
                      WHERE x.exercise_id = s.exercise_id), '') || '} expected {' ||
           array_to_string(s.styles, ',') || '}'
      FROM _cp_rows s
     WHERE COALESCE((SELECT array_agg(ms.name ORDER BY ms.name)
                       FROM public.exercise_movement_styles x JOIN public.movement_styles ms
                         ON ms.id = x.movement_style_id AND ms.is_identity
                      WHERE x.exercise_id = s.exercise_id), '{}')
           IS DISTINCT FROM (SELECT COALESCE(array_agg(y ORDER BY y), '{}') FROM unnest(s.styles) y)
    UNION ALL
    SELECT s.final_name || ' goals: {' ||
           COALESCE((SELECT string_agg(g.name, ',' ORDER BY g.name)
                       FROM public.exercise_goal_types x JOIN public.goal_types g ON g.id = x.goal_type_id
                      WHERE x.exercise_id = s.exercise_id), '') || '} expected {' ||
           array_to_string(s.goals, ',') || '}'
      FROM _cp_rows s
     WHERE COALESCE((SELECT array_agg(g.name ORDER BY g.name)
                       FROM public.exercise_goal_types x JOIN public.goal_types g ON g.id = x.goal_type_id
                      WHERE x.exercise_id = s.exercise_id), '{}')
           IS DISTINCT FROM (SELECT COALESCE(array_agg(gg ORDER BY gg), '{}') FROM unnest(s.goals) gg)
    UNION ALL
    SELECT s.final_name || ' primary muscles diverge'
      FROM _cp_rows s
     WHERE COALESCE((SELECT array_agg(m.name ORDER BY m.name)
                       FROM public.exercise_muscle_regions x JOIN public.muscle_regions m ON m.id = x.muscle_region_id
                      WHERE x.exercise_id = s.exercise_id AND x.is_primary), '{}')
           IS DISTINCT FROM (SELECT COALESCE(array_agg(y ORDER BY y), '{}') FROM unnest(s.primary_muscles) y)
    UNION ALL
    SELECT s.final_name || ' secondary muscles diverge'
      FROM _cp_rows s
     WHERE COALESCE((SELECT array_agg(m.name ORDER BY m.name)
                       FROM public.exercise_muscle_regions x JOIN public.muscle_regions m ON m.id = x.muscle_region_id
                      WHERE x.exercise_id = s.exercise_id AND NOT x.is_primary), '{}')
           IS DISTINCT FROM (SELECT COALESCE(array_agg(y ORDER BY y), '{}') FROM unnest(s.secondary_muscles) y)
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: junction divergence from the sheet:\n%', v_observed;
  END IF;

  SELECT string_agg(e.name, ', ' ORDER BY e.name) INTO v_observed
    FROM public.exercises e
   WHERE e.is_core AND EXISTS (SELECT 1 FROM public.exercise_equipment ee WHERE ee.exercise_id = e.id);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: cores carrying equipment junction rows: %', v_observed;
  END IF;

  SELECT count(*)::TEXT INTO v_observed
    FROM public.exercise_equipment ee
   WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = ee.exercise_id)
      OR NOT EXISTS (SELECT 1 FROM public.equipment q WHERE q.id = ee.equipment_id);
  IF v_observed <> '0' THEN
    RAISE EXCEPTION 'catalog pass FAIL: % orphaned exercise_equipment rows', v_observed;
  END IF;
END $$;

-- 15e) identity invariants: no fingerprint duplicates within a core; the only
--      within-core generated-name duplicates are the five DECLARED silent-
--      attribute collisions on the blessed projection (Unilateral/Pronated are
--      silent in names, so the fingerprints differ while the names agree)
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(d.msg, '; ' ORDER BY d.msg) INTO v_observed FROM (
    SELECT 'core ' || c.name || ' fingerprint ' || e.identity_fingerprint || ' x' || count(*) AS msg
      FROM public.exercises e JOIN public.exercises c ON c.id = e.core_movement_id
     WHERE e.core_movement_id IS NOT NULL
     GROUP BY c.name, e.core_movement_id, e.identity_fingerprint
    HAVING count(*) > 1
  ) d;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: duplicate fingerprints within a core: %', v_observed;
  END IF;

  WITH dupes AS (
    SELECT e.core_movement_id, e.generated_name, count(*) AS n
      FROM public.exercises e
     WHERE e.core_movement_id IS NOT NULL AND NOT e.is_core
     GROUP BY e.core_movement_id, e.generated_name
    HAVING count(*) > 1
  ), declared(core_id, generated_name, n) AS (VALUES
    ('b6879563-ab0d-5bc6-9b44-cab09315d939', 'Kettlebell Bent-Over Row', 2),
    ('80d46a74-c62a-4849-920f-22d326bf7cef', 'Cable Chest Fly', 2),
    ('01f01e3a-393d-4819-8834-cf25ea1ba04a', 'Dumbbell Curl', 2),
    ('90d63ecc-cebe-5ace-806d-45c8560f973f', 'Straight-Arm Lat Pulldown', 2),
    ('cb22657b-7dd7-422d-bebb-4f5f7b63f6cb', 'Overhead Dumbbell Triceps Extension', 2)
  )
  SELECT string_agg(d.msg, '; ' ORDER BY d.msg) INTO v_observed FROM (
    SELECT 'undeclared: ' || dp.generated_name || ' x' || dp.n AS msg
      FROM dupes dp
     WHERE NOT EXISTS (SELECT 1 FROM declared dc
                        WHERE dc.core_id::uuid = dp.core_movement_id
                          AND dc.generated_name = dp.generated_name AND dc.n = dp.n)
    UNION ALL
    SELECT 'missing declared: ' || dc.generated_name
      FROM declared dc
     WHERE NOT EXISTS (SELECT 1 FROM dupes dp
                        WHERE dp.core_movement_id = dc.core_id::uuid
                          AND dp.generated_name = dc.generated_name AND dp.n = dc.n)
  ) d;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: within-core generated-name duplicates diverge from the declared set: %', v_observed;
  END IF;
END $$;

-- 15f) every coreless row is one of the 52 explicit outliers (and no outlier
--      kept a legacy parent), tiers land exactly 48/144/38/5
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  WITH outliers(id) AS (VALUES
    ('0056856b-444d-427d-92a4-899451758fdf'),
    ('00b1670c-b022-44d1-9587-31655583cdc6'),
    ('01fbbe48-996b-4630-b89f-4d10d5a8ca25'),
    ('08dbcd57-b14c-4534-8764-648e2920c811'),
    ('0b975a66-3c23-44ab-a520-9d839d3aaf50'),
    ('111bb1b9-85c9-4c92-b78c-cc9eb96dafb1'),
    ('1325914c-6886-4cce-986a-5b08f50d0bac'),
    ('225badb2-a9ac-43e0-897a-16e4023a3fdf'),
    ('24a81876-d389-4ba9-a35a-87bb7ac70fbd'),
    ('2702fd09-a0d4-40c6-86e0-f42bb9ff9246'),
    ('2aef1947-7d3b-4bc4-8ae6-6e42a4c352ba'),
    ('2e76626e-5a55-4c02-b52c-0745fa4a1ec2'),
    ('3122cd2f-a71d-4a7a-a763-ca90ad843690'),
    ('4055eaf8-3df8-4865-a5da-3b31bb18a6e4'),
    ('47273ede-cf88-4d25-9d06-bb71ed30e14c'),
    ('54b39df9-219e-4870-834c-ee1e9c6199b0'),
    ('5e35a841-1f39-44e6-ae61-e21317afc890'),
    ('6569cb89-9e99-4ab8-a92f-006cff2880c3'),
    ('724ae756-5b28-483c-9c03-28bc160ce128'),
    ('72b6914d-98c7-4f2e-a642-40b28b240608'),
    ('73c9e31f-54cf-48e7-ac2c-30bf5750ac51'),
    ('7daf1c99-796b-4f19-96f0-3076ba8fcb78'),
    ('81cae4a9-327f-442f-860b-1f7bdaf47c7c'),
    ('8399fcf6-3332-4b60-a71e-029e073b9b1f'),
    ('87b6fb0f-2d5e-40b0-a198-67611fbec811'),
    ('8e470f94-2005-4870-a22b-976ddaf00a95'),
    ('95669791-297e-4913-9b20-b0bb6ae6033c'),
    ('9576a843-c3c2-415a-a21d-38c0088a8290'),
    ('9d9cc729-e8a6-44e4-a91e-3b452f4260a5'),
    ('9f6fabc9-1edb-4f68-bb95-25cbc62e24d2'),
    ('a4811178-fb30-4d51-82df-f0f772ffef81'),
    ('adc07245-37d4-4a20-9925-533207bc4754'),
    ('b13b9b6a-30eb-493d-afa3-67e818dba85b'),
    ('b6cb3ae1-3280-47b9-aa09-e1d7da646992'),
    ('b8793729-fa21-4b33-b0b6-49a88211379f'),
    ('b94a7298-2a71-4486-8211-790867506907'),
    ('c0af3ce1-cb39-47c8-a196-f9eb7438bb87'),
    ('c9cc8b6d-0f84-4fb6-99b9-36f8d9aaaa42'),
    ('ca567717-d196-41a3-959f-944f3f2aa3a0'),
    ('cb7af18c-9e72-4cd4-96ee-9ce28dc4e323'),
    ('ce983988-cf48-41df-a1c3-e2b2155ea8d1'),
    ('dd9ffabd-3eb7-4ba7-b178-70175e4fd786'),
    ('dde33be4-942f-4742-afb3-a4085881892a'),
    ('de507736-f4e7-4083-8a8f-48795c4cb9d9'),
    ('de68bf32-b80f-4a1f-8ad6-68c6b1ae232c'),
    ('e85c15ac-0848-4129-ba6c-dd5780f08ba4'),
    ('e8f336ff-6abe-4f45-a46b-70a95158273d'),
    ('e92f2281-d98b-4200-a644-0831871d1707'),
    ('ed1b3bbf-bc3c-46a6-90f3-ae2d097a0bd6'),
    ('f57a4584-232e-4e44-9fa3-8276a991b076'),
    ('f7a92fbd-7d0a-4671-a5ae-7ef7adc2075d'),
    ('fc86b911-7b6d-4999-941c-226a3d78efa1')
  )
  SELECT string_agg(d.msg, '; ' ORDER BY d.msg) INTO v_observed FROM (
    SELECT e.name || ' coreless but not a declared outlier' AS msg
      FROM public.exercises e
     WHERE e.core_movement_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM outliers o WHERE o.id::uuid = e.id)
    UNION ALL
    SELECT e.name || ' declared outlier but has a core'
      FROM public.exercises e JOIN outliers o ON o.id::uuid = e.id
     WHERE e.core_movement_id IS NOT NULL
    UNION ALL
    SELECT e.name || ' outlier with parent/tier'
      FROM public.exercises e JOIN outliers o ON o.id::uuid = e.id
     WHERE e.parent_exercise_id IS NOT NULL OR e.tier IS NOT NULL
  ) d;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: outlier set diverges: %', v_observed;
  END IF;

  SELECT string_agg(t.tier_label || '=' || t.n, ', ' ORDER BY t.tier_label) INTO v_observed
    FROM (SELECT COALESCE(tier::TEXT, 'null') AS tier_label, count(*) AS n
            FROM public.exercises GROUP BY tier) t;
  IF v_observed IS DISTINCT FROM '0=48, 1=144, 2=38, 3=5, null=52' THEN
    RAISE EXCEPTION 'catalog pass FAIL: tier distribution % (expected 0=48, 1=144, 2=38, 3=5, null=52)', v_observed;
  END IF;
END $$;

-- 15g) variant guardrails: G2 — every variant label belongs to the labelled
--      row's own core; G3 ceiling — no core carries more than 6 variant-
--      labelled children
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(e.name || ' (label ' || vl.slug || ' scoped to ' || c.name || ')', '; ' ORDER BY e.name)
    INTO v_observed
    FROM public.exercises e
    JOIN public.variant_labels vl ON vl.id = e.variant_label_id
    JOIN public.exercises c ON c.id = vl.core_movement_id
   WHERE vl.core_movement_id IS DISTINCT FROM e.core_movement_id;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: variant labels used outside their core scope (G2): %', v_observed;
  END IF;

  SELECT string_agg(c.name || ' x' || d.n, '; ' ORDER BY c.name) INTO v_observed
    FROM (SELECT e.core_movement_id, count(*) AS n
            FROM public.exercises e
           WHERE e.variant_label_id IS NOT NULL AND NOT e.is_core
           GROUP BY e.core_movement_id
          HAVING count(*) > 6) d
    JOIN public.exercises c ON c.id = d.core_movement_id;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: cores exceeding 6 variant-labelled children (G3): %', v_observed;
  END IF;
END $$;

-- 15h) alias table: exactly the blessed set — every merge-loser name, every
--      renamed-away name, the sheet-note wilds, the legacy array aliases and
--      the re-minted generated aliases; the Powerbomb suppression holds
CREATE TEMP TABLE _cp_expected_aliases (
  exercise_id UUID NOT NULL,
  alias TEXT NOT NULL,
  kind TEXT NOT NULL
);
INSERT INTO _cp_expected_aliases VALUES
  ('01f01e3a-393d-4819-8834-cf25ea1ba04a', 'Barbell Curl', 'wild'),
  ('02e33e2e-af3b-4dc6-96a0-251f6770f986', 'Landmine Bench Press', 'generated'),
  ('02f06475-07ec-4b9b-85cf-dd3840810816', 'Barbell Incline Bench Press (Medium-Grip)', 'wild'),
  ('03603c33-ec76-42ef-8770-f1f9d41bed38', 'Plank Reaches', 'wild'),
  ('03603c33-ec76-42ef-8770-f1f9d41bed38', 'Reach Plank', 'generated'),
  ('05d652c8-5c69-40d6-87ed-f543eac37b78', 'Supine Bench Dumbbell Triceps Extension', 'generated'),
  ('060b2ea6-bf2d-41a2-ae31-75f8498be271', 'Leg Raises', 'wild'),
  ('0b38eb75-53b2-45e0-8c12-c52bd87fc774', 'Basic Jump', 'wild'),
  ('0b38eb75-53b2-45e0-8c12-c52bd87fc774', 'Bodyweight Jump', 'wild'),
  ('0b38eb75-53b2-45e0-8c12-c52bd87fc774', 'Vertical Jump', 'wild'),
  ('0b794684-532a-4a73-82fd-08af7bd4409a', 'Kettlebell Renegade-Row Plank', 'generated'),
  ('0c02557b-9688-44d6-a7ac-462a7479b9ab', 'Dumbbell Pull-Through Plank', 'generated'),
  ('0c02557b-9688-44d6-a7ac-462a7479b9ab', 'Plank Pull Thru', 'wild'),
  ('0cf83693-8e3a-42e8-97be-ed7b42f9b9a5', 'Diagonal Raise', 'generated'),
  ('0f67fc54-8e83-48d1-b3c0-b6b62a277596', 'Bench Dumbbell Bent-Over Row', 'generated'),
  ('0f67fc54-8e83-48d1-b3c0-b6b62a277596', 'One-Arm Dumbbell Row', 'wild'),
  ('0f79c9ab-7ed2-4473-a314-02fbad499143', 'Dumbbell Donkey Calf Raise', 'generated'),
  ('0fe6557d-00c5-45e9-8897-eac172544b67', 'V-Ups', 'wild'),
  ('10f0f59b-5673-42c7-810e-9256838ea77f', 'Chest-to-Bar Pull-Up', 'generated'),
  ('1158ba0c-c803-4e91-8716-08ff2f692e75', 'Tricep Push Up', 'wild'),
  ('11f667e1-0141-4578-a801-8631d7065ccc', 'Crush V-Sit Dumbbell Press', 'generated'),
  ('13367306-3bf6-4e97-a597-5c2f815f59f0', 'Wide Grip Pull Ups', 'wild'),
  ('17b26fd8-f8f9-44d3-972e-08f478fa59fa', 'Med Ball Leg Raise', 'generated'),
  ('1b23327e-ee6f-4fa3-9506-eca752b40b0b', 'V-Bar Pullup', 'wild'),
  ('1c205c16-37a4-46d5-8fa6-82bd1afaa47a', 'Incline Dumbbell Bench Press', 'generated'),
  ('1ccf0321-0115-4602-a51e-03611208b723', 'Ski Erg', 'wild'),
  ('1cd3ad50-d9c5-439b-8dcc-590bb1887d50', 'Air Squat', 'wild'),
  ('1d63cd53-6f8c-41e9-9a5f-3d6080993196', 'Reverse Kettlebell Lunge', 'generated'),
  ('1e847c3a-5aa6-4078-a9a6-9f3008357f34', 'V-Sit Kettlebell Press', 'generated'),
  ('202c394f-a35e-41d5-9ceb-bf00b0d88c1e', 'V Sit Halos', 'wild'),
  ('20af318d-079c-4146-8494-b43e35375cdb', 'Bulgarian Split Squat (DB)', 'wild'),
  ('20af318d-079c-4146-8494-b43e35375cdb', 'DB RFESS', 'wild'),
  ('20af318d-079c-4146-8494-b43e35375cdb', 'DB Rear-Foot Elevated Split Squat', 'wild'),
  ('20af318d-079c-4146-8494-b43e35375cdb', 'Split Bench Dumbbell Suitcase Lunge', 'generated'),
  ('20ca987f-cb4f-4923-bc64-a5d9704186f4', 'Weighted Dips', 'wild'),
  ('22a2b36e-e934-44e1-843c-92d55425d8c4', 'Lying Leg Curls', 'wild'),
  ('2566a7b5-c7c3-43d2-a1ef-16f438a67e4c', 'Kettlebell Waiter Carry', 'generated'),
  ('25809b50-015b-4578-9ac8-e73ec9d8be26', 'Dumbbell Press', 'generated'),
  ('2997561f-fe30-4e81-a9cf-00548ea689ff', 'Alternating Crunch', 'generated'),
  ('2a5c6596-8af7-4c27-991e-2badf46feea1', 'Close-Grip Barbell Bench Press', 'wild'),
  ('2a8be090-b655-482a-9982-94e33b377af7', 'Triceps Extension', 'generated'),
  ('2c3aae99-237b-4c58-8622-13a25f1dc9e4', 'Cable Toe-Tap Crunch', 'generated'),
  ('2ca66465-6f3c-4a5c-b149-76238a463f05', 'Assisted Bands Jump', 'generated'),
  ('2dd8abdf-ddb3-4733-a959-ae5a389f62fb', 'Lockout Zercher Squat', 'generated'),
  ('2e1723ed-40b6-474f-be82-115f3157e15b', 'Seated Cable Bent-Over Row', 'generated'),
  ('2e1723ed-40b6-474f-be82-115f3157e15b', 'Seated Cable Rows', 'wild'),
  ('2e76626e-5a55-4c02-b52c-0745fa4a1ec2', 'Banded Side Walk', 'wild'),
  ('2e76626e-5a55-4c02-b52c-0745fa4a1ec2', 'Lateral Band Walk', 'wild'),
  ('2e76626e-5a55-4c02-b52c-0745fa4a1ec2', 'Monster Walk (Lateral)', 'wild'),
  ('2f05705b-6812-47e1-b1bc-4faf873fa826', 'Weighted Dumbbell Sit-Up', 'generated'),
  ('2fc183f8-e1a0-4a1e-ac1c-be4bf2871366', 'Barbell Back Squat', 'wild'),
  ('2fc183f8-e1a0-4a1e-ac1c-be4bf2871366', 'Barbell Squat', 'wild'),
  ('316c08a4-4e36-4c85-844c-0c4c995a2738', 'Weighted Dumbbell Leg Raise', 'generated'),
  ('318731bc-0b26-4779-9aeb-f20eb1780c6d', 'Bicep Curl', 'wild'),
  ('327c07d2-756b-410f-8297-dd21f760779d', 'Dumbbell Curl', 'generated'),
  ('328c34a9-af1e-433e-bde0-a19b5f71fddc', 'Tricep Pushdown', 'wild'),
  ('328c34a9-af1e-433e-bde0-a19b5f71fddc', 'Tricep Pushdown - Rope Attachment', 'wild'),
  ('36dd4c3b-d00a-4e75-951d-60ed20edf1bf', 'Strict Dumbbell Press', 'generated'),
  ('386926db-38fb-4da3-abdb-6ae22bea8aa5', 'Jumping Split Lunges', 'wild'),
  ('386926db-38fb-4da3-abdb-6ae22bea8aa5', 'Plyo Split Lunge', 'generated'),
  ('3d244541-04d3-4ff6-943e-ccd8517d5b7f', 'Swimming', 'wild'),
  ('3da442db-1cff-40e2-8672-50525710f392', 'Partial Alternating Leg Raise', 'generated'),
  ('3ea89e52-8ef8-458e-a66a-307bd078c219', 'RFESS', 'wild'),
  ('3ea89e52-8ef8-458e-a66a-307bd078c219', 'Rear-Foot Elevated Split Squat', 'wild'),
  ('3ea89e52-8ef8-458e-a66a-307bd078c219', 'Split Bench Lunge', 'generated'),
  ('40030b7f-c667-4b67-8e7a-d64c1ff9b132', 'Bridge Chest Fly', 'generated'),
  ('402b0f81-7d42-4705-8bc3-c5ea3df15026', 'Alternating Gorilla Rows', 'wild'),
  ('402b0f81-7d42-4705-8bc3-c5ea3df15026', 'Alternating Kettlebell Bent-Over Row', 'generated'),
  ('41071b35-8024-4038-a593-0a1876f19dbc', 'Seated Machine Calf Raise', 'generated'),
  ('46a31718-8e74-4b71-9e1a-eb8474089261', 'Cable Chest Fly', 'generated'),
  ('46b2344d-5f50-4168-8ecd-99323965b7aa', 'Supine Cable Chest Fly', 'generated'),
  ('46e98a88-8396-43ab-ab0c-da633e4e9c40', 'Kettlebell Kickstand Deadlift', 'wild'),
  ('477d482e-f23f-42eb-b060-bcc916c2271c', 'Partial Single-Leg Kettlebell Deadlift', 'generated'),
  ('47d9bcba-1b05-4a77-bf42-c908d1b8ea95', 'Rope Crunches', 'wild'),
  ('47fb4553-1439-437f-b929-da8f132151bd', 'Cross-Body Elbow-Reach Crunch', 'generated'),
  ('4981bd90-d1c2-4251-a296-d5fa565ec09b', 'Around The Worlds', 'wild'),
  ('4a7438df-8bee-4a3e-802a-72bee480df66', 'Military Press', 'wild'),
  ('4a7438df-8bee-4a3e-802a-72bee480df66', 'Overhead Press', 'wild'),
  ('4a7438df-8bee-4a3e-802a-72bee480df66', 'Overhead Press (Strict)', 'wild'),
  ('4a7438df-8bee-4a3e-802a-72bee480df66', 'Shoulder Press', 'wild'),
  ('4a7438df-8bee-4a3e-802a-72bee480df66', 'Standing Military Press', 'wild'),
  ('4a7438df-8bee-4a3e-802a-72bee480df66', 'Strict Press', 'wild'),
  ('4a933d94-d40d-4a6f-aff9-aab851f7f5f5', 'Crush Push Ups', 'wild'),
  ('4bfc73b8-8e74-4bdf-862f-fa63bd988f0e', 'Hanging Knee Raises', 'wild'),
  ('4bfc73b8-8e74-4bdf-862f-fa63bd988f0e', 'Partial Bar Leg Raise', 'generated'),
  ('50d7aad5-0542-43bf-8b74-0631b67bfcad', 'Seated Mid Cable Fly', 'wild'),
  ('518bb58b-48dd-4736-a597-63af49d07316', 'Plyo Box Jump', 'generated'),
  ('52cc2745-0e31-436f-9468-573ee6a70882', 'Wide Grip Lat Pulldown', 'wild'),
  ('54261211-c77f-473c-abac-8a603633975c', 'Walking Dumbbell Suitcase Lunge', 'generated'),
  ('54b39df9-219e-4870-834c-ee1e9c6199b0', 'Leg Extensions', 'wild'),
  ('55493476-6af2-4fd3-92c9-d40176e56b6b', 'Med Ball Crunch', 'generated'),
  ('5645395b-73b1-49de-bb95-35d2bdc49749', 'Close-Grip Neutral-Grip Seated Dumbbell Curl', 'generated'),
  ('58473898-f9ae-4a32-98bd-28ecc5896919', 'Kneeling Kettlebell Press', 'generated'),
  ('5ccd7117-78f1-453a-a51e-ae45654cd84d', 'Heel Tap Crunches', 'wild'),
  ('5ccd7117-78f1-453a-a51e-ae45654cd84d', 'Lateral Crunch', 'generated'),
  ('5d7a7bde-c085-403a-8eb4-79d3aafa4d53', 'Bar Push-Up', 'wild'),
  ('5dd834e6-02c3-4e01-b472-efbe8d32fa53', 'Walkout Push-up', 'wild'),
  ('62aa20f5-669d-4b89-9da5-95a3d6784af5', 'Straight-Arm Lat Pulldown', 'generated'),
  ('66a213ee-f78f-4b3b-a9e3-acebe97eab59', 'RX Rope Climb', 'wild'),
  ('66a213ee-f78f-4b3b-a9e3-acebe97eab59', 'Rope Ascent', 'wild'),
  ('66a213ee-f78f-4b3b-a9e3-acebe97eab59', 'Standard Rope Climb', 'wild'),
  ('69c1541a-4d21-4384-949f-2ccb8cfc8338', 'Seated Leg Curl', 'generated'),
  ('69d48874-e10c-4168-b167-e03955dc67d3', 'Barbell Power Clean', 'wild'),
  ('69d48874-e10c-4168-b167-e03955dc67d3', 'Clean (Power)', 'wild'),
  ('69d48874-e10c-4168-b167-e03955dc67d3', 'Hang to Power Clean', 'wild'),
  ('69d48874-e10c-4168-b167-e03955dc67d3', 'Partial Clean', 'generated'),
  ('6dfbc753-9048-4a32-8a9a-3e90d3d24cd3', 'Single-Arm Powerbomb', 'wild'),
  ('6dfc9b9d-02a8-467c-af5c-7e95a5673b3a', 'Inverted Row', 'wild'),
  ('6fe16d57-5b36-42be-828d-70270e41e912', 'Push-up', 'wild'),
  ('71367b5a-0afe-4af0-a6ea-d00a8fc45690', 'Box Jump (Two-Foot Takeoff)', 'wild'),
  ('71367b5a-0afe-4af0-a6ea-d00a8fc45690', 'Jump to Box', 'wild'),
  ('71367b5a-0afe-4af0-a6ea-d00a8fc45690', 'Plyometric Box Jump', 'wild'),
  ('730c9097-4ef9-410d-81fc-d0e0d79113ac', 'Overhead Dumbbell Triceps Extension', 'generated'),
  ('79963968-9188-455e-87f1-98758d2eb637', 'Kettlebell Pull-Through Plank', 'generated'),
  ('7a9c7132-88c9-47f1-afe4-2b331f0d4b7c', 'Partial Deadlift', 'generated'),
  ('7baeaa57-c6d2-4f02-ab50-3abe3d9878ef', 'Toe Tap Crunch', 'wild'),
  ('7d4eb547-1967-45d9-9ffa-f1408b8bcc27', 'Crush Kettlebell Press', 'generated'),
  ('7da78ee8-5cb1-469d-ab41-6259bf202a8e', 'Alt Gunslinger Cleans', 'wild'),
  ('7da78ee8-5cb1-469d-ab41-6259bf202a8e', 'Alternating Kettlebell Suitcase Clean', 'generated'),
  ('7daf1c99-796b-4f19-96f0-3076ba8fcb78', 'Tibialis Anterior Raises', 'wild'),
  ('7daf1c99-796b-4f19-96f0-3076ba8fcb78', 'Tibialis Raises', 'wild'),
  ('7daf1c99-796b-4f19-96f0-3076ba8fcb78', 'Wall Tib Raises', 'wild'),
  ('7edf591c-d068-4139-bc1f-f0151a0489e6', 'Alternating Dumbbell Flys', 'wild'),
  ('7f9583a4-9c4f-4680-a45c-04822718737f', 'Alternating Reverse Lunges', 'wild'),
  ('7f9583a4-9c4f-4680-a45c-04822718737f', 'Reverse Alternating Lunge', 'generated'),
  ('80bb759f-7e67-4d02-be05-87c680809e17', 'Straight Arm Cable Rope Lat Pulldown', 'wild'),
  ('80d46a74-c62a-4849-920f-22d326bf7cef', 'Dumbbell Chest Fly', 'wild'),
  ('81554dea-0beb-4bd1-8824-7f75c328b695', 'Kettlebell Press', 'generated'),
  ('81b5afdb-461c-4563-8b0c-a9cdeb2bb124', 'Barbell Bench Press (Medium Grip)', 'wild'),
  ('81de5dcb-5293-4993-a069-52991767e01f', 'Rear Machine Raise', 'generated'),
  ('81de5dcb-5293-4993-a069-52991767e01f', 'Reverse Machine Flyes', 'wild'),
  ('81fc87d3-cb88-4272-9a6c-ffe64f665f13', 'Kettlebell Around The World', 'wild'),
  ('820cbfd1-df37-43ce-a629-ce36a8d484db', 'Hack', 'wild'),
  ('820cbfd1-df37-43ce-a629-ce36a8d484db', 'Machine Squat', 'generated'),
  ('83822f11-0b85-4358-bef4-1c8c8043187e', 'Overhead Cable Rope Tricep Extensions', 'wild'),
  ('83822f11-0b85-4358-bef4-1c8c8043187e', 'Overhead Cable Triceps Extension', 'generated'),
  ('839c6b15-f9ab-4a3c-8326-cdd75c6ff4ad', 'Kettlebell Split Squats', 'wild'),
  ('839c6b15-f9ab-4a3c-8326-cdd75c6ff4ad', 'Split Kettlebell Lunge', 'generated'),
  ('840080d9-21bd-47b2-846f-d3f62283eb6b', 'Split Swing', 'generated'),
  ('857a839d-e12a-49f8-9e58-d39577d908bb', 'Single-Leg Leg Press', 'generated'),
  ('86f6b49b-aecf-4c3a-836b-9288ddbebd85', 'Kneeling Lat Pulldown', 'generated'),
  ('8917ee9c-60e6-4507-9031-982e51866f2b', 'Banded Spanish Squat Hold', 'wild'),
  ('8917ee9c-60e6-4507-9031-982e51866f2b', 'Bands Squat', 'generated'),
  ('8917ee9c-60e6-4507-9031-982e51866f2b', 'Knee-Friendly Squat Hold', 'wild'),
  ('8917ee9c-60e6-4507-9031-982e51866f2b', 'Spanish Squat', 'wild'),
  ('8a2b76ff-8f3f-4bf3-83e8-15e9c0263c66', 'Double-Tap Mountain Climber', 'generated'),
  ('8c35133e-f9c9-4b6c-8a25-fb894bcf4201', 'Advanced Crunch', 'wild'),
  ('8c5de959-e01c-4c6b-9aed-ff856062f730', 'Bridge Dumbbell Bench Press', 'generated'),
  ('8de37301-d912-428a-b434-4ac641b79cb0', 'Behind-Body Dumbbell Triceps Extension', 'generated'),
  ('8de37301-d912-428a-b434-4ac641b79cb0', 'Single-Arm Kickback Variations', 'wild'),
  ('8de37301-d912-428a-b434-4ac641b79cb0', 'Tricep Dumbbell Kickback', 'wild'),
  ('8e7e68d1-3269-4be4-a4d2-18324172ca4d', 'High-Stance Leg Press', 'generated'),
  ('8ea85d89-3a42-4f39-8930-8884300a77a6', 'Wall Balls', 'wild'),
  ('8ee6f215-1bbd-499b-8c75-a3c6195d8980', 'Side Plank', 'generated'),
  ('9000bb2f-4db1-42c8-9d9b-48cb0baf3b69', 'Curtsy Kettlebell Goblet Lunge', 'generated'),
  ('90379030-13ce-4cff-81bc-f48e9f53640b', 'Behind-Body Cable Triceps Extension', 'generated'),
  ('90379030-13ce-4cff-81bc-f48e9f53640b', 'Single Arm Cable Tricep Kickback', 'wild'),
  ('914adec2-325b-4d82-a79e-f59724356c3b', 'Concept2 Row', 'wild'),
  ('914adec2-325b-4d82-a79e-f59724356c3b', 'Indoor Row', 'wild'),
  ('914adec2-325b-4d82-a79e-f59724356c3b', 'Row Erg', 'wild'),
  ('9194464a-7fbe-4c0a-aba8-e95d202cbcf9', 'Plyo Kettlebell Bent-Over Row', 'generated'),
  ('93d90bed-d91b-4c22-aa3c-94438cfcbc26', 'Weighted Dumbbell V-Up', 'generated'),
  ('94b99564-ebb0-4f89-985f-8b4fb7ff27b5', 'Bent Over Two-Dumbbell Row', 'wild'),
  ('96604640-4e25-4993-9b5d-902eb541ec4b', 'Kettlebell Clean', 'generated'),
  ('9777d13f-6f01-415e-b95d-1ceb2b5696e4', 'Side Bench Plank', 'generated'),
  ('98a9dbc8-e190-46be-a950-aa42853958cd', 'Partial Single-Leg Machine Deadlift', 'generated'),
  ('98ca656f-c6d2-497e-b734-84e4ce38fa8f', 'Crush Alternating Dumbbell Press', 'generated'),
  ('98e1ca9d-4297-480a-b06b-7f2b8e7a276f', 'Standing Calf Raises', 'wild'),
  ('99a6149d-3c0f-46be-85c5-ddeddbed92ab', 'Indoor Run', 'wild'),
  ('99a6149d-3c0f-46be-85c5-ddeddbed92ab', 'TM Run', 'wild'),
  ('99a6149d-3c0f-46be-85c5-ddeddbed92ab', 'Treadmill Running', 'wild'),
  ('9c94cfce-f41b-46b7-be88-8d08ae3b53a9', 'Concentration Dumbbell Curl', 'generated'),
  ('9cbb87eb-68c2-4eeb-89b7-c0b159de629a', 'Kettlebell Push-Up', 'generated'),
  ('9d92f019-b91d-4f87-a2de-f6f3ad5ce65a', 'Burpee Over Dumbbell', 'wild'),
  ('9d92f019-b91d-4f87-a2de-f6f3ad5ce65a', 'Dumbbell Burpee', 'generated'),
  ('9d92f019-b91d-4f87-a2de-f6f3ad5ce65a', 'Dumbbell Lateral Burpee', 'wild'),
  ('9d92f019-b91d-4f87-a2de-f6f3ad5ce65a', 'Lateral Burpees Over The Dumbbell', 'wild'),
  ('9d92f019-b91d-4f87-a2de-f6f3ad5ce65a', 'Lateral Jump-Over Burpee', 'wild'),
  ('9e599834-da6f-4589-8352-fe24ba2174fd', 'Front Cable Raise', 'generated'),
  ('a0c205ee-3c0a-4ffc-8c98-5175e885d4b0', 'Lateral Raises', 'wild'),
  ('a0c205ee-3c0a-4ffc-8c98-5175e885d4b0', 'Side Lateral Raise', 'wild'),
  ('a1397be9-5452-46f1-b35d-47b3e632889a', 'Partial Snatch', 'generated'),
  ('a260b34d-f5ca-4b01-9ee1-0e0800c4e9f4', 'Double-Under Jump Rope', 'generated'),
  ('a63d62b8-f932-4fe2-815c-d4d5489d4d87', 'Wide-Grip Wide-Stance Deadlift', 'generated'),
  ('a67b404b-fd60-4a25-b578-33b8783bc1fa', 'Wide Stance Squat', 'wild'),
  ('a6df346d-ef81-4928-97b6-56c0ff298dc8', 'Hex Bar Deadlift', 'wild'),
  ('a7c65e92-605a-4d37-b36e-3df8e3c92235', 'Jack Plank', 'generated'),
  ('a7f5a707-29a1-4b68-ac0a-237b4148c8c1', 'Smith Machine Bent Over Row', 'wild'),
  ('a8464567-b78d-444c-a897-c93860cf7c9f', 'Prone Bench Bent-Over Row', 'generated'),
  ('a8db17c7-f05c-4129-9591-5742c19ac5d2', 'Wide-Stance Deadlift', 'generated'),
  ('ab58c0d1-35cd-4696-83ec-0831494e4602', 'Weighted Dumbbell Suitcase Crunch', 'generated'),
  ('ae7f41c1-fa4d-4f28-a255-5d48be5eb532', 'Barbell Deadlift', 'wild'),
  ('ae7f41c1-fa4d-4f28-a255-5d48be5eb532', 'Conventional Deadlift', 'wild'),
  ('b08c3cf8-b02a-4953-8a72-058b3ea2a00b', 'Bent Over Row', 'wild'),
  ('b23b3d0b-de50-4526-8e28-e18377ad9767', 'Barbell Clean', 'wild'),
  ('b23b3d0b-de50-4526-8e28-e18377ad9767', 'Full Clean', 'wild'),
  ('b23b3d0b-de50-4526-8e28-e18377ad9767', 'Squat Clean', 'wild'),
  ('b51b16df-6c23-492c-baa5-c5d1bbf38163', 'Partial Hollow Alternating Leg Raise', 'generated'),
  ('b6439378-a400-4c51-a1fe-c3ce317970cb', 'Bodyweight Pull-Up', 'wild'),
  ('b6439378-a400-4c51-a1fe-c3ce317970cb', 'Dead-Hang Pull-Up', 'wild'),
  ('b6439378-a400-4c51-a1fe-c3ce317970cb', 'Pull Ups', 'wild'),
  ('b6439378-a400-4c51-a1fe-c3ce317970cb', 'Pullups', 'wild'),
  ('b6439378-a400-4c51-a1fe-c3ce317970cb', 'Strict Pull-Up', 'wild'),
  ('b6879563-ab0d-5bc6-9b44-cab09315d939', 'Barbell Row', 'wild'),
  ('b6879563-ab0d-5bc6-9b44-cab09315d939', 'Bent Over Barbell Row', 'wild'),
  ('b7e02387-dee4-4549-8601-eea0abdc1a89', 'Reverse Crunch Pulse', 'wild'),
  ('b858f251-3ff4-42b5-841d-3333814c37a1', 'Supine Cable Crunch', 'generated'),
  ('b9b1951c-aaf8-4fde-a82b-2e3dc91ac158', 'Close Grip Dumbbell Bench Press', 'wild'),
  ('ba68ae3b-6a55-4c61-ba68-acf3ec84f8dc', 'Assisted Supine Floor Rope Climb', 'generated'),
  ('ba68ae3b-6a55-4c61-ba68-acf3ec84f8dc', 'Assisted Vertical Pull', 'wild'),
  ('ba68ae3b-6a55-4c61-ba68-acf3ec84f8dc', 'Rope Pull-to-Stand', 'wild'),
  ('ba68ae3b-6a55-4c61-ba68-acf3ec84f8dc', 'Rope Seated Pull', 'wild'),
  ('ba68ae3b-6a55-4c61-ba68-acf3ec84f8dc', 'Towel Pull-to-Stand', 'wild'),
  ('bbf6d999-de07-479f-9dcc-a5b9d8a1dff1', 'Wide Grip Seated Row', 'wild'),
  ('bbf6d999-de07-479f-9dcc-a5b9d8a1dff1', 'Wide-Grip Seated Cable Bent-Over Row', 'generated'),
  ('bfb1d36c-efb4-4776-9d57-32379a8a511e', 'Low To High Dumbbell Flys', 'wild'),
  ('bfb1d36c-efb4-4776-9d57-32379a8a511e', 'Low-to-High Chest Fly', 'generated'),
  ('c0e25bfc-9bb9-43bd-9b92-15a0668cb630', 'Partial Dumbbell Deadlift', 'generated'),
  ('c0e25bfc-9bb9-43bd-9b92-15a0668cb630', 'Stiff-Legged Dumbbell Deadlift (Dumbbell Romanian Deadlift)', 'wild'),
  ('c2b1e158-ea6c-4f67-8db0-3177640b14a7', 'V-Sit Kettlebell Bent-Over Row', 'generated'),
  ('c2ba5880-c532-4981-8b14-da1be3e6b78f', 'Mountain Climber With 1 Sec Pause', 'wild'),
  ('c2c05041-144b-45c7-9e54-5f4bec5b7a6a', 'Kettlebell Halo', 'wild'),
  ('c3208d4e-39bb-42c1-99d3-3e90c80fe243', 'Barbell Push Press', 'wild'),
  ('c3208d4e-39bb-42c1-99d3-3e90c80fe243', 'Plyo Press', 'generated'),
  ('c3208d4e-39bb-42c1-99d3-3e90c80fe243', 'S2O', 'wild'),
  ('c3208d4e-39bb-42c1-99d3-3e90c80fe243', 'Shoulder-to-Overhead', 'wild'),
  ('c34597a3-55a5-4756-8188-8ff85d35b4b8', 'Lymphatic Jumps', 'wild'),
  ('c34597a3-55a5-4756-8188-8ff85d35b4b8', 'Quarter Jump', 'generated'),
  ('c37656f7-7768-4ed2-a473-f53eb97e7f6b', 'Bar Leg Raise', 'generated'),
  ('c37656f7-7768-4ed2-a473-f53eb97e7f6b', 'Hanging Leg Raises', 'wild'),
  ('c4ac582d-3576-4722-acd7-a0745a1ee737', 'Handstand Push-up', 'wild'),
  ('c5605994-39b6-4a45-afb4-c4d8e949d8cb', 'Cable Rope Curl', 'wild'),
  ('c5605994-39b6-4a45-afb4-c4d8e949d8cb', 'Standing Bicep Cable Curls', 'wild'),
  ('c597cd87-17ba-4b3f-946e-c6019d2fadb5', 'Cable-Resisted Reverse Crunch', 'wild'),
  ('c7902429-4714-4697-b503-0f2766d11649', 'EZ Bar Spider Curls', 'wild'),
  ('c7902429-4714-4697-b503-0f2766d11649', 'Incline Prone EZ-Bar Curl', 'generated'),
  ('c7f2f87e-0e57-41be-9cb4-08b8670ef9d3', 'Kettlebell Bent-Over Row', 'generated'),
  ('c8e35862-3134-4543-9302-4529d8eac79c', 'Crush Dumbbell Bench Press', 'generated'),
  ('ca288903-1599-4766-ab35-304971ce8c00', 'Kettlebell Single Front Rack Lunge', 'generated'),
  ('cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', 'Bodyweight Lunge', 'wild'),
  ('cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', 'Forward Lunge', 'wild'),
  ('cca7659a-0cee-4395-aa3b-a0c7cd4b92b9', 'Statonary Lunge', 'wild'),
  ('ce73f567-f654-40a9-835b-97febc87d76f', 'Bridge Kettlebell Bench Press', 'generated'),
  ('ce8b4758-21a4-4f68-9285-ef1311e29e3a', 'Neutral-Grip Dumbbell Curl', 'generated'),
  ('cf044d9e-4c18-47f9-a3c9-2e0016b80fbc', 'Med Ball Sit-Up', 'generated'),
  ('d04d81bc-c668-4a96-b3a8-ff6a5cbc4d60', 'Supine Barbell Bench Triceps Extension', 'generated'),
  ('d07de065-5628-4634-bcaa-bc35e129f7e0', 'Ring Rows', 'wild'),
  ('d2ec9d8c-8bca-4cb5-a842-534f13d41435', 'Crush Kettlebell Bench Press', 'generated'),
  ('d34024ef-20d6-4491-a0fa-ca680ff3cdfa', 'Squat-Hold Kettlebell Bent-Over Row', 'generated'),
  ('d34024ef-20d6-4491-a0fa-ca680ff3cdfa', 'Static Squat Single-Arm Rows', 'wild'),
  ('d5b54a47-6b75-4d65-9093-a21925306978', 'Distance Run', 'wild'),
  ('d5b54a47-6b75-4d65-9093-a21925306978', 'Road Run', 'wild'),
  ('d5b54a47-6b75-4d65-9093-a21925306978', 'Running', 'wild'),
  ('d5b54a47-6b75-4d65-9093-a21925306978', 'Track Run', 'wild'),
  ('d65c63d0-36dc-4b3c-9a62-c51af99c2e9d', 'Weighted Dumbbell Russian Twist', 'generated'),
  ('d7421380-f8a8-4832-bcf9-7923c7921fa2', 'Muscle-up', 'wild'),
  ('d8446175-d8b7-410a-a2a6-75490a8e6175', 'Cross-Body Crunch', 'generated'),
  ('d982a88b-f31e-446a-af91-4a6749548518', 'Weighted Dumbbell Toe-Tap Crunch', 'generated'),
  ('d982a88b-f31e-446a-af91-4a6749548518', 'Weighted Toe Tap Crunches', 'wild'),
  ('da5fcd1e-b402-41ae-a144-5596aaa510d1', 'Crunches', 'wild'),
  ('da8d711e-ca00-416d-a445-39686bd83a6c', 'Overhead Seated Cable Curl', 'generated'),
  ('dd9c3d1a-c913-438b-93c9-df78b68e6bc5', 'Spider Mountain Climber', 'generated'),
  ('de836d7f-a1a6-421e-ace6-5f511707daa9', 'Weighted Side Dumbbell Plank', 'generated'),
  ('e33b16d7-94a3-4993-b208-37bad81577cd', 'Alternating Dumbbell Suitcase Lunge', 'generated'),
  ('e33b16d7-94a3-4993-b208-37bad81577cd', 'Alternating Single-DB Lunge', 'wild'),
  ('e33b16d7-94a3-4993-b208-37bad81577cd', 'DB Alternating Lunge', 'wild'),
  ('e33b16d7-94a3-4993-b208-37bad81577cd', 'Offset Lunge', 'wild'),
  ('e33b16d7-94a3-4993-b208-37bad81577cd', 'Single Dumbbell Alternating Lunge', 'wild'),
  ('e3652813-5afb-4412-9b2c-ffe3dff90cfc', 'American Kettlebell Swing (Overhead)', 'wild'),
  ('e3652813-5afb-4412-9b2c-ffe3dff90cfc', 'Kettlebell Swing', 'wild'),
  ('e3652813-5afb-4412-9b2c-ffe3dff90cfc', 'Russian Kettlebell Swing', 'wild'),
  ('e39d8f60-c552-4043-b569-4db5bf8b1d4b', 'Overhead Cable Curl', 'generated'),
  ('e6d7e93a-20ad-4250-83ef-c6c07e702653', 'Staggered Alternating Swing', 'generated'),
  ('e74b28c0-e5f3-4366-bb3b-2611e6a62c46', 'Underhand Triceps Pushdown', 'generated'),
  ('e85ddbba-191e-4f21-a16f-603ed76ee475', 'Calf Press on the Leg Press Machine', 'wild'),
  ('e85ddbba-191e-4f21-a16f-603ed76ee475', 'Supine Machine Calf Raise', 'generated'),
  ('e87d9cc5-a455-4feb-80be-81c42a384e8e', 'Wide Grip Bench Press', 'wild'),
  ('ee95e859-8e5e-4346-a3b0-9869a8c7d86b', 'Alternating Dumbbell Grab-Reach-Pull Plank', 'generated'),
  ('f0b6fe29-c3b0-4c1e-a7f2-7ed11a013056', 'Alternating Forward Lunge', 'wild'),
  ('f0b6fe29-c3b0-4c1e-a7f2-7ed11a013056', 'Bodyweight Alternating Lunge', 'wild'),
  ('f0b6fe29-c3b0-4c1e-a7f2-7ed11a013056', 'Dynamic Lunge', 'wild'),
  ('f3d47b88-b89d-4e0b-9c3d-5cbc08870ab6', 'Cross Body SA Floor Press', 'wild'),
  ('f3d47b88-b89d-4e0b-9c3d-5cbc08870ab6', 'Supine Floor Kettlebell Bench Press', 'generated'),
  ('f5bf41cb-7241-4b46-a656-1015ffbddf21', 'Bodyweight Burpee', 'wild'),
  ('f5bf41cb-7241-4b46-a656-1015ffbddf21', 'Chest-to-Ground Burpee', 'wild'),
  ('f5bf41cb-7241-4b46-a656-1015ffbddf21', 'Standard Burpee', 'wild'),
  ('f6abb193-16c5-4eef-83d4-5e95b5c6ef2d', 'Russian Twists', 'wild'),
  ('f6c0b711-4edc-445e-9790-eb93b773e2ca', 'Cossack Squats', 'wild'),
  ('f6c0b711-4edc-445e-9790-eb93b773e2ca', 'Lateral Squat', 'generated'),
  ('f7222122-0ffa-4337-8edd-9040e7c45190', 'Double Bell Clean', 'wild'),
  ('f7222122-0ffa-4337-8edd-9040e7c45190', 'Kettlebell Double Front Rack Clean', 'generated'),
  ('f92359e3-4f79-4ab8-88a3-d1661b22a379', 'Single-Leg Heel Raise', 'wild'),
  ('f92359e3-4f79-4ab8-88a3-d1661b22a379', 'Unilateral Calf Raise', 'wild'),
  ('fbc40045-4a5a-4b78-a3da-77f59e94def5', 'Partial Leg Raise', 'generated'),
  ('fc594581-6487-47e6-bc5e-5ed00be98478', 'Crush Hollow Kettlebell Bench Press', 'generated'),
  ('fdbe541d-95b5-4b16-b80d-688f54ef50ed', 'Cable Flys', 'wild'),
  ('fe1484e2-c645-4c11-95cf-ea1669af44f9', 'Dip Or Seated Machine Dip', 'wild'),
  ('fe1484e2-c645-4c11-95cf-ea1669af44f9', 'Dips', 'wild'),
  ('fe1484e2-c645-4c11-95cf-ea1669af44f9', 'Dips - Tricep Version', 'wild');

DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
BEGIN
  SELECT string_agg(d.msg, E'\n' ORDER BY d.msg) INTO v_observed FROM (
    SELECT 'missing: ' || x.alias || ' (' || x.kind || ') on ' || e.name AS msg
      FROM _cp_expected_aliases x
      JOIN public.exercises e ON e.id = x.exercise_id
     WHERE NOT EXISTS (SELECT 1 FROM public.exercise_aliases a
                        WHERE a.exercise_id = x.exercise_id
                          AND a.alias_normalized = public.normalize_alias(x.alias)
                          AND a.kind = x.kind)
    UNION ALL
    SELECT 'unexpected: ' || a.alias || ' (' || a.kind || ') on ' || COALESCE(e.name, a.exercise_id::TEXT)
      FROM public.exercise_aliases a
      LEFT JOIN public.exercises e ON e.id = a.exercise_id
     WHERE NOT EXISTS (SELECT 1 FROM _cp_expected_aliases x
                        WHERE x.exercise_id = a.exercise_id
                          AND public.normalize_alias(x.alias) = a.alias_normalized
                          AND x.kind = a.kind)
  ) d;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: alias table diverges from the blessed set:\n%', v_observed;
  END IF;

  SELECT count(*) INTO v_count FROM public.exercise_aliases;
  IF v_count <> 299 THEN
    RAISE EXCEPTION 'catalog pass FAIL: alias count % (expected 299)', v_count;
  END IF;

  -- every merge-loser display name resolves via the alias table to its winner
  SELECT string_agg(m.loser_name, ', ' ORDER BY m.loser_name) INTO v_observed
    FROM _cp_merges m
   WHERE NOT EXISTS (SELECT 1 FROM public.exercise_aliases a
                      WHERE a.exercise_id = m.winner_id
                        AND a.alias_normalized = public.normalize_alias(m.loser_name)
                        AND a.kind = 'wild');
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: merge-loser names missing from the alias table: %', v_observed;
  END IF;

  -- documented Powerbomb suppression: the string aliases Overhead Extension ONLY,
  -- and the renamed Powerbomb row minted no generated alias
  SELECT count(*) INTO v_count FROM public.exercise_aliases
   WHERE alias_normalized = public.normalize_alias('Overhead Dumbbell Triceps Extension');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'catalog pass FAIL: ''Overhead Dumbbell Triceps Extension'' has % alias rows (expected exactly 1)', v_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.exercise_aliases
                  WHERE exercise_id = '730c9097-4ef9-410d-81fc-d0e0d79113ac'          -- Overhead Extension
                    AND alias_normalized = public.normalize_alias('Overhead Dumbbell Triceps Extension')
                    AND kind = 'generated') THEN
    RAISE EXCEPTION 'catalog pass FAIL: ''Overhead Dumbbell Triceps Extension'' does not alias Overhead Extension';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exercise_aliases
              WHERE exercise_id = '6dfbc753-9048-4a32-8a9a-3e90d3d24cd3'                 -- Single-Arm Overhead Triceps Extension
                AND kind = 'generated') THEN
    SELECT string_agg(alias, ', ') INTO v_observed FROM public.exercise_aliases
     WHERE exercise_id = '6dfbc753-9048-4a32-8a9a-3e90d3d24cd3' AND kind = 'generated';
    RAISE EXCEPTION 'catalog pass FAIL: Powerbomb row minted generated aliases despite the documented suppression: %', v_observed;
  END IF;
END $$;

-- 15i) dictionary + retirement spot checks and the brief-mandated name samples
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.stances WHERE name = 'Supine / Prone') THEN
    RAISE EXCEPTION 'catalog pass FAIL: legacy Supine / Prone stance still present (id=%)',
      (SELECT id FROM public.stances WHERE name = 'Supine / Prone');
  END IF;

  SELECT string_agg(bad.v, '; ') INTO v_observed FROM (
    SELECT 'directions=' || count(*)::TEXT AS v FROM public.directions HAVING count(*) <> 8
    UNION ALL SELECT 'support_positions=' || count(*) FROM public.support_positions HAVING count(*) <> 3
    UNION ALL SELECT 'arm_positions=' || count(*) FROM public.arm_positions HAVING count(*) <> 6
    UNION ALL SELECT 'bench_angles=' || count(*) FROM public.bench_angles HAVING count(*) <> 3
    UNION ALL SELECT 'variant_labels=' || count(*) FROM public.variant_labels HAVING count(*) <> 17
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: dictionary seed counts off: %', v_observed;
  END IF;

  SELECT string_agg(bad.v, E'\n') INTO v_observed FROM (
    SELECT 'Double Crunch -> ' || COALESCE((SELECT generated_name FROM public.exercises WHERE id = '8c35133e-f9c9-4b6c-8a25-fb894bcf4201'), 'MISSING')
     WHERE COALESCE((SELECT generated_name FROM public.exercises WHERE id = '8c35133e-f9c9-4b6c-8a25-fb894bcf4201'), '') <> 'Double Crunch'
    UNION ALL
    SELECT 'Knee To Elbow -> ' || COALESCE((SELECT generated_name FROM public.exercises WHERE id = '47fb4553-1439-437f-b929-da8f132151bd'), 'MISSING')
     WHERE COALESCE((SELECT generated_name FROM public.exercises WHERE id = '47fb4553-1439-437f-b929-da8f132151bd'), '') <> 'Cross-Body Elbow-Reach Crunch'
    UNION ALL
    SELECT 'Alternating Front Extension -> ' || COALESCE((SELECT generated_name FROM public.exercises WHERE id = '98ca656f-c6d2-497e-b734-84e4ce38fa8f'), 'MISSING')
     WHERE COALESCE((SELECT generated_name FROM public.exercises WHERE id = '98ca656f-c6d2-497e-b734-84e4ce38fa8f'), '') <> 'Crush Alternating Dumbbell Press'
    UNION ALL
    SELECT 'Plank Grab, Reach, And Pull -> ' || COALESCE((SELECT generated_name FROM public.exercises WHERE id = 'ee95e859-8e5e-4346-a3b0-9869a8c7d86b'), 'MISSING')
     WHERE COALESCE((SELECT generated_name FROM public.exercises WHERE id = 'ee95e859-8e5e-4346-a3b0-9869a8c7d86b'), '') <> 'Alternating Dumbbell Grab-Reach-Pull Plank'
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'catalog pass FAIL: sampled generated names diverge:\n%', v_observed;
  END IF;
END $$;

DROP TABLE _cp_rows;
DROP TABLE _cp_merges;
DROP TABLE _cp_merge_wilds;
DROP TABLE _cp_expected_aliases;
