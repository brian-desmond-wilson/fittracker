-- 20260826100000_attribute_dictionary.sql
-- Stage 2: the user-approved attribute dictionary (decision record: the Attribute Audit
-- artifact, decided 2026-08-24). Naming fragments and orders on every identity value, the
-- identity/modifier style split, the approved merges/renames/drops/additions, the new Grip
-- attribute, and the engine amendments that make grips and the Box rule part of identity
-- and naming.
--
-- Every section is idempotent (re-run converges to the same state). The file ends with a
-- self-verify block per the standing data-migration rule: `db push` does not run the
-- harness, so this file must fail the push closed on drift.

-- ============================================================================
-- 1) Grips: new attribute table + two FK columns on exercises
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('Orientation','Width')),
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  name_fragment TEXT,
  name_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Standing rule: any new table ships with RLS + policies in the same migration (the
-- baseline's default privileges make an RLS-less table world-writable via PostgREST).
-- Read-only to everyone, no write policy.
ALTER TABLE public.grips ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'grips'
                   AND policyname = 'Grips are viewable by everyone') THEN
    CREATE POLICY "Grips are viewable by everyone" ON public.grips FOR SELECT USING (true);
  END IF;
END $$;

-- The approved 9 values. Silent values (Pronated, Hook, Standard) carry NULL fragments;
-- every speaking grip sits at order 25 (after range depth 20, before stance 30).
INSERT INTO public.grips (name, category, display_order, name_fragment, name_order) VALUES
  ('Pronated',  'Orientation', 1, NULL,           NULL),
  ('Supinated', 'Orientation', 2, 'Underhand',    25),
  ('Neutral',   'Orientation', 3, 'Neutral-Grip', 25),
  ('Mixed',     'Orientation', 4, 'Mixed-Grip',   25),
  ('Hook',      'Orientation', 5, NULL,           NULL),
  ('False',     'Orientation', 6, 'False-Grip',   25),
  ('Standard',  'Width',       1, NULL,           NULL),
  ('Wide',      'Width',       2, 'Wide-Grip',    25),
  ('Close',     'Width',       3, 'Close-Grip',   25)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS grip_orientation_id UUID REFERENCES public.grips(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grip_width_id UUID REFERENCES public.grips(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS exercises_grip_orientation_idx ON public.exercises (grip_orientation_id);
CREATE INDEX IF NOT EXISTS exercises_grip_width_idx ON public.exercises (grip_width_id);

-- ============================================================================
-- 2) Naming metadata backfill on all identity values
-- ============================================================================
-- Fragment convention: silent values store NULL fragment; the engine emits only
-- non-empty fragments. Default everywhere: fragment = value name.

-- Equipment: name @40 with approved overrides; Bodyweight and Jump Rope are silent
-- (double-unders don't carry the words).
UPDATE public.equipment SET name_fragment = name, name_order = 40 WHERE name <> 'Bodyweight';
UPDATE public.equipment SET name_fragment = 'Vest'       WHERE name = 'Weight Vest';
UPDATE public.equipment SET name_fragment = 'Parallette' WHERE name = 'Parallettes';
UPDATE public.equipment SET name_fragment = NULL, name_order = NULL WHERE name IN ('Bodyweight','Jump Rope');

-- Load positions: name @45; the barbell group implies Barbell (suppresses the equipment word).
UPDATE public.load_positions SET name_fragment = name, name_order = 45;
UPDATE public.load_positions
   SET implies_equipment_id = (SELECT id FROM public.equipment WHERE name = 'Barbell')
 WHERE name IN ('Back','Front','Overhead','Zercher');

-- Stances: name @30 with approved overrides; Standard is the silent default, and the
-- to-be-retired legacy 'Supine / Prone' must never speak in a generated name.
UPDATE public.stances SET name_fragment = name, name_order = 30;
UPDATE public.stances SET name_fragment = 'Wide-Stance'   WHERE name = 'Wide (Sumo)';
UPDATE public.stances SET name_fragment = 'Narrow-Stance' WHERE name = 'Narrow';
UPDATE public.stances SET name_fragment = NULL, name_order = NULL WHERE name IN ('Standard','Supine / Prone');

-- Range depths: name @20 with approved overrides; Full is the silent default.
UPDATE public.range_depths SET name_fragment = name, name_order = 20;
UPDATE public.range_depths SET name_fragment = 'ATG'     WHERE name = 'ATG (Ass to Grass)';
UPDATE public.range_depths SET name_fragment = 'Lockout' WHERE name = 'Lockout Only';
UPDATE public.range_depths SET name_fragment = NULL, name_order = NULL WHERE name = 'Full';

-- Movement styles: only identity styles speak; orders banded by category per the decision
-- record's order-band table (Assistance / Load Variant 10, Execution Control 12,
-- Dynamic Power 14 — "Weighted Strict Pull-Up", "Weighted Kipping Pull-Up").
-- Butterfly is in the list for re-run convergence; on first run it is seeded (with the same
-- fragment/order) in section 3 below.
UPDATE public.movement_styles
   SET name_fragment = name,
       name_order = CASE category
                      WHEN 'Assistance / Load Variant' THEN 10
                      WHEN 'Execution Control'         THEN 12
                      WHEN 'Dynamic Power'             THEN 14
                    END
 WHERE name IN ('Strict','Kipping','Butterfly','Plyometric (Explosive)','Assisted','Weighted','Deficit');
UPDATE public.movement_styles SET name_fragment = 'Plyo' WHERE name = 'Plyometric (Explosive)';
-- Modifier styles keep fragments for the prescription renderer. They stay is_identity=false,
-- so the engine never puts them in a catalog name; the order is the Execution band.
UPDATE public.movement_styles SET name_fragment = 'Pause',     name_order = 12 WHERE name = 'Pause';
UPDATE public.movement_styles SET name_fragment = 'Tempo',     name_order = 12 WHERE name = 'Tempo';
UPDATE public.movement_styles SET name_fragment = 'Eccentric', name_order = 12 WHERE name = 'Eccentric (Negative)';
UPDATE public.movement_styles SET name_fragment = 'Hold',      name_order = 12 WHERE name = 'Isometric (Hold)';
UPDATE public.movement_styles
   SET name_fragment = NULL, name_order = NULL
 WHERE name NOT IN ('Strict','Kipping','Butterfly','Plyometric (Explosive)','Assisted','Weighted','Deficit',
                    'Pause','Tempo','Eccentric (Negative)','Isometric (Hold)');

-- Symmetries: Alternating @35; every other value is silent (Bilateral is the default).
UPDATE public.symmetries SET name_fragment = 'Alternating', name_order = 35 WHERE name = 'Alternating';
UPDATE public.symmetries SET name_fragment = NULL, name_order = NULL WHERE name <> 'Alternating';

-- ============================================================================
-- 3) Style split: Butterfly in, identity flags on, four drops + Controlled merge
-- ============================================================================
-- Butterfly must exist BEFORE the is_identity pass references it.
INSERT INTO public.movement_styles (name, category, display_order, is_identity, name_fragment, name_order)
SELECT 'Butterfly', 'Dynamic Power',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.movement_styles),
       true, 'Butterfly', 14
 WHERE NOT EXISTS (SELECT 1 FROM public.movement_styles WHERE name = 'Butterfly');

-- The approved seven are identity; everything surviving outside the set is a modifier.
UPDATE public.movement_styles
   SET is_identity = (name IN ('Strict','Kipping','Butterfly','Plyometric (Explosive)','Assisted','Weighted','Deficit'));

-- Merge Controlled -> Tempo. Junction repoint is dedupe-safe against
-- UNIQUE (exercise_id, movement_style_id); this junction has no extra fields
-- (unlike the Back-merge's is_primary), so plain dedupe-skip loses nothing.
UPDATE public.exercise_movement_styles ems
   SET movement_style_id = (SELECT id FROM public.movement_styles WHERE name = 'Tempo')
 WHERE ems.movement_style_id = (SELECT id FROM public.movement_styles WHERE name = 'Controlled')
   AND NOT EXISTS (
     SELECT 1 FROM public.exercise_movement_styles e2
      WHERE e2.exercise_id = ems.exercise_id
        AND e2.movement_style_id = (SELECT id FROM public.movement_styles WHERE name = 'Tempo'));
DELETE FROM public.exercise_movement_styles          -- collision leftovers (exercise already had Tempo)
 WHERE movement_style_id = (SELECT id FROM public.movement_styles WHERE name = 'Controlled');
-- Merge semantics extend to the legacy FK column (0 rows on the 2026-08-24 staging
-- snapshot; defends against live drift).
UPDATE public.exercises
   SET movement_style_id = (SELECT id FROM public.movement_styles WHERE name = 'Tempo')
 WHERE movement_style_id = (SELECT id FROM public.movement_styles WHERE name = 'Controlled');

-- The four dropped values: junction rows and legacy FK refs go BEFORE the reference rows.
DELETE FROM public.exercise_movement_styles
 WHERE movement_style_id IN (SELECT id FROM public.movement_styles
                             WHERE name IN ('Standard','Unbroken','Alternating','Partial / Range-Limited'));
UPDATE public.exercises
   SET movement_style_id = NULL
 WHERE movement_style_id IN (SELECT id FROM public.movement_styles
                             WHERE name IN ('Standard','Unbroken','Alternating','Partial / Range-Limited'));
DELETE FROM public.movement_styles
 WHERE name IN ('Standard','Unbroken','Alternating','Partial / Range-Limited','Controlled');

-- ============================================================================
-- 4) Families: Core -> Midline rename; Mobility/Control merged into Mobility
-- ============================================================================
UPDATE public.movement_families SET name = 'Midline'
 WHERE name = 'Core'
   AND NOT EXISTS (SELECT 1 FROM public.movement_families WHERE name = 'Midline');

UPDATE public.exercises
   SET movement_family_id = (SELECT id FROM public.movement_families WHERE name = 'Mobility')
 WHERE movement_family_id = (SELECT id FROM public.movement_families WHERE name = 'Mobility/Control');
-- Edge table has a bare composite PK (movement_family_id, movement_category_id): dedupe-skip.
UPDATE public.movement_family_modalities m
   SET movement_family_id = (SELECT id FROM public.movement_families WHERE name = 'Mobility')
 WHERE m.movement_family_id = (SELECT id FROM public.movement_families WHERE name = 'Mobility/Control')
   AND NOT EXISTS (
     SELECT 1 FROM public.movement_family_modalities m2
      WHERE m2.movement_family_id = (SELECT id FROM public.movement_families WHERE name = 'Mobility')
        AND m2.movement_category_id = m.movement_category_id);
DELETE FROM public.movement_family_modalities
 WHERE movement_family_id = (SELECT id FROM public.movement_families WHERE name = 'Mobility/Control');
DELETE FROM public.movement_families WHERE name = 'Mobility/Control';

-- ============================================================================
-- 5) Goals: Cool-Down merged into Recovery
-- ============================================================================
UPDATE public.exercise_goal_types x
   SET goal_type_id = (SELECT id FROM public.goal_types WHERE name = 'Recovery')
 WHERE x.goal_type_id = (SELECT id FROM public.goal_types WHERE name = 'Cool-Down')
   AND NOT EXISTS (
     SELECT 1 FROM public.exercise_goal_types x2
      WHERE x2.exercise_id = x.exercise_id
        AND x2.goal_type_id = (SELECT id FROM public.goal_types WHERE name = 'Recovery'));
DELETE FROM public.exercise_goal_types
 WHERE goal_type_id = (SELECT id FROM public.goal_types WHERE name = 'Cool-Down');
-- exercises.goal_type_id has a plain (NO ACTION) FK: repoint before the delete.
UPDATE public.exercises
   SET goal_type_id = (SELECT id FROM public.goal_types WHERE name = 'Recovery')
 WHERE goal_type_id = (SELECT id FROM public.goal_types WHERE name = 'Cool-Down');
DELETE FROM public.goal_types WHERE name = 'Cool-Down';

-- ============================================================================
-- 6) Load positions: Double Overhead + Waiter in, Hang recategorized, Bodyweight out
-- ============================================================================
INSERT INTO public.load_positions (name, category, display_order, name_fragment, name_order)
SELECT 'Double Overhead', 'Dumbbell / KB',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.load_positions),
       'Double Overhead', 45
 WHERE NOT EXISTS (SELECT 1 FROM public.load_positions WHERE name = 'Double Overhead');
INSERT INTO public.load_positions (name, category, display_order, name_fragment, name_order)
SELECT 'Waiter', 'Dumbbell / KB',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.load_positions),
       'Waiter', 45
 WHERE NOT EXISTS (SELECT 1 FROM public.load_positions WHERE name = 'Waiter');

UPDATE public.load_positions SET category = 'Start Position' WHERE name = 'Hang';

-- Drop Bodyweight (redundant with the Bodyweight equipment default): null legacy FK refs
-- and delete junction refs BEFORE the reference row goes.
UPDATE public.exercises SET load_position_id = NULL
 WHERE load_position_id = (SELECT id FROM public.load_positions WHERE name = 'Bodyweight');
DELETE FROM public.exercise_load_positions
 WHERE load_position_id = (SELECT id FROM public.load_positions WHERE name = 'Bodyweight');
DELETE FROM public.load_positions WHERE name = 'Bodyweight';

-- ============================================================================
-- 7) Range depths: implies_equipment_id column, the Box rule, Variable / Custom out
-- ============================================================================
ALTER TABLE public.range_depths
  ADD COLUMN IF NOT EXISTS implies_equipment_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL;

UPDATE public.range_depths
   SET implies_equipment_id = (SELECT id FROM public.equipment WHERE name = 'Box')
 WHERE name = 'Box';

UPDATE public.exercises SET range_depth_id = NULL
 WHERE range_depth_id = (SELECT id FROM public.range_depths WHERE name = 'Variable / Custom');
DELETE FROM public.range_depths WHERE name = 'Variable / Custom';

-- ============================================================================
-- 8) Stances: Supine + Prone in; Athletic / Partial Squat renamed to Athletic
-- ============================================================================
INSERT INTO public.stances (name, display_order, name_fragment, name_order)
SELECT 'Supine', (SELECT COALESCE(max(display_order), 0) + 1 FROM public.stances), 'Supine', 30
 WHERE NOT EXISTS (SELECT 1 FROM public.stances WHERE name = 'Supine');
INSERT INTO public.stances (name, display_order, name_fragment, name_order)
SELECT 'Prone', (SELECT COALESCE(max(display_order), 0) + 1 FROM public.stances), 'Prone', 30
 WHERE NOT EXISTS (SELECT 1 FROM public.stances WHERE name = 'Prone');

-- Rename keeps the fragment in sync (fragment = value name).
UPDATE public.stances SET name = 'Athletic', name_fragment = 'Athletic'
 WHERE name = 'Athletic / Partial Squat'
   AND NOT EXISTS (SELECT 1 FROM public.stances WHERE name = 'Athletic');

-- Legacy 'Supine / Prone' deliberately kept: Stage 3 reclassifies its rows, then drops it.

-- ============================================================================
-- 9) Equipment: Jump Rope, GHD, Parallettes, Sled, Weight Vest
-- ============================================================================
INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)
SELECT 'Jump Rope', 'Bodyweight / Apparatus',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.equipment WHERE category = 'Bodyweight / Apparatus'),
       NULL, NULL  -- silent: double-unders don't carry the words
 WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE name = 'Jump Rope');
INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)
SELECT 'Parallettes', 'Bodyweight / Apparatus',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.equipment WHERE category = 'Bodyweight / Apparatus'),
       'Parallette', 40
 WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE name = 'Parallettes');
INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)
SELECT 'GHD', 'Supports / Surfaces',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.equipment WHERE category = 'Supports / Surfaces'),
       'GHD', 40
 WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE name = 'GHD');
INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)
SELECT 'Sled', 'Implements',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.equipment WHERE category = 'Implements'),
       'Sled', 40
 WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE name = 'Sled');
INSERT INTO public.equipment (name, category, display_order, name_fragment, name_order)
SELECT 'Weight Vest', 'Implements',
       (SELECT COALESCE(max(display_order), 0) + 1 FROM public.equipment WHERE category = 'Implements'),
       'Vest', 40
 WHERE NOT EXISTS (SELECT 1 FROM public.equipment WHERE name = 'Weight Vest');

-- ============================================================================
-- 10) Engine amendments (CREATE OR REPLACE; recompute_exercise_identity is untouched —
--     SECURITY DEFINER, search_path pinning, FOR UPDATE locking, stale-alias cleanup and
--     parent preservation all stay exactly as shipped in 20260825150000)
-- ============================================================================

-- exercise_identity_attrs gains the two grip columns: grips are identity.
CREATE OR REPLACE FUNCTION public.exercise_identity_attrs(p_id UUID) RETURNS UUID[]
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(array_agg(v ORDER BY v), '{}') FROM (
    SELECT e.load_position_id AS v FROM exercises e WHERE e.id = p_id AND e.load_position_id IS NOT NULL
    UNION ALL SELECT e.stance_id       FROM exercises e WHERE e.id = p_id AND e.stance_id IS NOT NULL
    UNION ALL SELECT e.range_depth_id  FROM exercises e WHERE e.id = p_id AND e.range_depth_id IS NOT NULL
    UNION ALL SELECT e.symmetry_id     FROM exercises e WHERE e.id = p_id AND e.symmetry_id IS NOT NULL
    UNION ALL SELECT e.grip_orientation_id FROM exercises e WHERE e.id = p_id AND e.grip_orientation_id IS NOT NULL
    UNION ALL SELECT e.grip_width_id   FROM exercises e WHERE e.id = p_id AND e.grip_width_id IS NOT NULL
    UNION ALL SELECT ee.equipment_id   FROM exercise_equipment ee WHERE ee.exercise_id = p_id
    UNION ALL SELECT ems.movement_style_id
              FROM exercise_movement_styles ems
              JOIN movement_styles ms ON ms.id = ems.movement_style_id AND ms.is_identity
              WHERE ems.exercise_id = p_id
  ) s(v);
$$;

-- generate_exercise_name gains grip fragments, and the implied-equipment suppression is
-- generalized: the equipment word disappears when EITHER the load position (Back Squat)
-- OR the range depth (Box Squat) implies that equipment.
CREATE OR REPLACE FUNCTION public.generate_exercise_name(p_id UUID) RETURNS TEXT
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_core UUID; v_noun TEXT; v_implied UUID[]; v_frags TEXT;
BEGIN
  SELECT core_movement_id INTO v_core FROM exercises WHERE id = p_id;
  IF v_core IS NULL THEN
    RETURN (SELECT name FROM exercises WHERE id = p_id);      -- outliers keep their name
  END IF;
  SELECT name INTO v_noun FROM exercises WHERE id = v_core;
  IF v_core = p_id THEN RETURN v_noun; END IF;                -- core row IS the noun

  SELECT COALESCE(array_agg(imp), '{}') INTO v_implied FROM (
    SELECT lp.implies_equipment_id AS imp
      FROM exercises e JOIN load_positions lp ON lp.id = e.load_position_id
     WHERE e.id = p_id AND lp.implies_equipment_id IS NOT NULL
    UNION ALL
    SELECT rd.implies_equipment_id
      FROM exercises e JOIN range_depths rd ON rd.id = e.range_depth_id
     WHERE e.id = p_id AND rd.implies_equipment_id IS NOT NULL
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
    SELECT ms.name_fragment, ms.name_order
      FROM exercise_movement_styles ems JOIN movement_styles ms
        ON ms.id = ems.movement_style_id AND ms.is_identity
      WHERE ems.exercise_id = p_id
    UNION ALL
    SELECT q.name_fragment, q.name_order
      FROM exercise_equipment ee JOIN equipment q ON q.id = ee.equipment_id
      WHERE ee.exercise_id = p_id
        AND NOT (q.id = ANY (v_implied))                      -- the generalized suppression rule
  ) f WHERE f.frag IS NOT NULL AND f.frag <> '';

  RETURN trim(concat_ws(' ', v_frags, v_noun));
END $$;

-- Grips are identity attributes now: the exercises recompute trigger must also fire when a
-- grip column changes. Guard function trg_exercise_identity is unchanged; only the
-- UPDATE OF list grows by the two grip columns.
DROP TRIGGER IF EXISTS exercises_identity_recompute ON public.exercises;
CREATE TRIGGER exercises_identity_recompute
  AFTER INSERT OR UPDATE OF core_movement_id, is_core, load_position_id, stance_id,
    range_depth_id, symmetry_id, grip_orientation_id, grip_width_id, name_is_custom ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION trg_exercise_identity();

-- ============================================================================
-- 11) Recompute backfill: fragments changed every generated name; derive the new state.
--     All real rows are name_is_custom, so display names cannot change (asserted below).
-- ============================================================================
DO $$
BEGIN
  PERFORM public.recompute_exercise_identity(id) FROM public.exercises;
END $$;

-- ============================================================================
-- 12) Self-verify (standing rule): assert the achieved state before commit,
--     observed values in every failure message. Mirrors the V8 harness essentials.
-- ============================================================================
DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
BEGIN
  -- grips: 9 rows (6 Orientation / 3 Width), RLS on
  SELECT count(*) INTO v_count FROM public.grips;
  IF v_count <> 9 THEN
    SELECT string_agg(name || ' [' || category || ']', ', ' ORDER BY category, display_order) INTO v_observed
      FROM public.grips;
    RAISE EXCEPTION 'attribute dictionary FAIL: grips count % (expected 9): %', v_count, COALESCE(v_observed, 'none');
  END IF;
  SELECT count(*) FILTER (WHERE category = 'Orientation') INTO v_count FROM public.grips;
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'attribute dictionary FAIL: grips Orientation count % (expected 6)', v_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class
                 WHERE relnamespace = 'public'::regnamespace AND relname = 'grips' AND relrowsecurity) THEN
    RAISE EXCEPTION 'attribute dictionary FAIL: grips RLS not enabled';
  END IF;

  -- styles: 11 rows, identity flag on exactly the approved seven, retired values gone
  SELECT count(*) INTO v_count FROM public.movement_styles;
  IF v_count <> 11 THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.movement_styles;
    RAISE EXCEPTION 'attribute dictionary FAIL: movement_styles count % (expected 11): %', v_count, v_observed;
  END IF;
  SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed FROM public.movement_styles WHERE is_identity;
  IF v_observed IS DISTINCT FROM 'Assisted, Butterfly, Deficit, Kipping, Plyometric (Explosive), Strict, Weighted' THEN
    RAISE EXCEPTION 'attribute dictionary FAIL: identity styles are {%}', COALESCE(v_observed, 'none');
  END IF;
  IF EXISTS (SELECT 1 FROM public.movement_styles
             WHERE name IN ('Standard','Unbroken','Alternating','Partial / Range-Limited','Controlled')) THEN
    SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed FROM public.movement_styles
      WHERE name IN ('Standard','Unbroken','Alternating','Partial / Range-Limited','Controlled');
    RAISE EXCEPTION 'attribute dictionary FAIL: retired styles still present: %', v_observed;
  END IF;

  -- families: 28, Midline in, Core / Mobility-Control out
  SELECT count(*) INTO v_count FROM public.movement_families;
  IF v_count <> 28
     OR EXISTS (SELECT 1 FROM public.movement_families WHERE name IN ('Core','Mobility/Control'))
     OR NOT EXISTS (SELECT 1 FROM public.movement_families WHERE name = 'Midline') THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.movement_families;
    RAISE EXCEPTION 'attribute dictionary FAIL: families (count %, expected 28 with Midline, without Core/Mobility-Control): %',
      v_count, v_observed;
  END IF;

  -- goals: 6, Cool-Down out
  SELECT count(*) INTO v_count FROM public.goal_types;
  IF v_count <> 6 OR EXISTS (SELECT 1 FROM public.goal_types WHERE name = 'Cool-Down') THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.goal_types;
    RAISE EXCEPTION 'attribute dictionary FAIL: goal_types (count %, expected 6 without Cool-Down): %', v_count, v_observed;
  END IF;

  -- load positions: 15, Bodyweight out, additions in, Hang recategorized, barbell group implies Barbell
  SELECT count(*) INTO v_count FROM public.load_positions;
  IF v_count <> 15
     OR EXISTS (SELECT 1 FROM public.load_positions WHERE name = 'Bodyweight')
     OR (SELECT count(*) FROM public.load_positions WHERE name IN ('Double Overhead','Waiter') AND category = 'Dumbbell / KB') <> 2
     OR (SELECT category FROM public.load_positions WHERE name = 'Hang') IS DISTINCT FROM 'Start Position' THEN
    SELECT string_agg(name || ' [' || COALESCE(category, 'null') || ']', ', ' ORDER BY display_order) INTO v_observed
      FROM public.load_positions;
    RAISE EXCEPTION 'attribute dictionary FAIL: load_positions (count %, expected 15 incl. Double Overhead/Waiter, Hang=Start Position, no Bodyweight): %',
      v_count, v_observed;
  END IF;
  SELECT count(*) INTO v_count FROM public.load_positions lp
   WHERE lp.name IN ('Back','Front','Overhead','Zercher')
     AND lp.implies_equipment_id = (SELECT id FROM public.equipment WHERE name = 'Barbell');
  IF v_count <> 4 THEN
    SELECT string_agg(lp.name || '->' || COALESCE(q.name, 'null'), ', ' ORDER BY lp.name) INTO v_observed
      FROM public.load_positions lp LEFT JOIN public.equipment q ON q.id = lp.implies_equipment_id
      WHERE lp.name IN ('Back','Front','Overhead','Zercher');
    RAISE EXCEPTION 'attribute dictionary FAIL: barbell-group implies (% of 4 correct): %', v_count, v_observed;
  END IF;

  -- range depths: 8, Variable / Custom out, Box implies Box
  SELECT count(*) INTO v_count FROM public.range_depths;
  IF v_count <> 8
     OR EXISTS (SELECT 1 FROM public.range_depths WHERE name = 'Variable / Custom')
     OR (SELECT implies_equipment_id FROM public.range_depths WHERE name = 'Box')
        IS DISTINCT FROM (SELECT id FROM public.equipment WHERE name = 'Box') THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.range_depths;
    RAISE EXCEPTION 'attribute dictionary FAIL: range_depths (count %, expected 8, Box implies Box, no Variable / Custom): %',
      v_count, v_observed;
  END IF;

  -- stances: 13, Supine + Prone + Athletic in, legacy Supine / Prone kept
  SELECT count(*) INTO v_count FROM public.stances;
  IF v_count <> 13
     OR (SELECT count(*) FROM public.stances WHERE name IN ('Supine','Prone','Athletic','Supine / Prone')) <> 4
     OR EXISTS (SELECT 1 FROM public.stances WHERE name = 'Athletic / Partial Squat') THEN
    SELECT string_agg(name, ', ' ORDER BY display_order) INTO v_observed FROM public.stances;
    RAISE EXCEPTION 'attribute dictionary FAIL: stances (count %, expected 13 with Supine, Prone, Athletic and legacy Supine / Prone): %',
      v_count, v_observed;
  END IF;

  -- equipment: 30 with the five additions
  SELECT count(*) INTO v_count FROM public.equipment;
  IF v_count <> 30
     OR (SELECT count(*) FROM public.equipment
          WHERE name IN ('Jump Rope','GHD','Parallettes','Sled','Weight Vest')) <> 5 THEN
    SELECT string_agg(name, ', ' ORDER BY category, display_order) INTO v_observed FROM public.equipment;
    RAISE EXCEPTION 'attribute dictionary FAIL: equipment (count %, expected 30 with the five additions): %',
      v_count, v_observed;
  END IF;

  -- naming metadata integrity: a value that speaks must know where
  SELECT string_agg(bad.v, ', ' ORDER BY bad.v) INTO v_observed FROM (
    SELECT 'equipment: ' || name AS v FROM public.equipment WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'load_positions: ' || name FROM public.load_positions WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'stances: ' || name FROM public.stances WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'range_depths: ' || name FROM public.range_depths WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'symmetries: ' || name FROM public.symmetries WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'movement_styles: ' || name FROM public.movement_styles WHERE name_fragment IS NOT NULL AND name_order IS NULL
    UNION ALL SELECT 'grips: ' || name FROM public.grips WHERE name_fragment IS NOT NULL AND name_order IS NULL
  ) bad;
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'attribute dictionary FAIL: values with a fragment but no name_order: %', v_observed;
  END IF;

  -- display-name invariant proxy: every real row is name_is_custom, so the recompute
  -- backfill above cannot have changed any display name.
  SELECT count(*) INTO v_count FROM public.exercises WHERE name_is_custom = false;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'attribute dictionary FAIL: % rows with name_is_custom=false (expected 0 — display names must be unchangeable here)', v_count;
  END IF;
END $$;
