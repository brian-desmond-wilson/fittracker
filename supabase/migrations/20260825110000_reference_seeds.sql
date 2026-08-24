-- 20260825110000_reference_seeds.sql

-- 1) Merge stray 'Back' muscle region into 'Upper Back' (repoint links, dedupe, delete).
WITH back_row AS (SELECT id FROM muscle_regions WHERE name = 'Back'),
     upper_back AS (SELECT id FROM muscle_regions WHERE name = 'Upper Back')
UPDATE exercise_muscle_regions emr
SET muscle_region_id = (SELECT id FROM upper_back)
WHERE emr.muscle_region_id = (SELECT id FROM back_row)
  AND NOT EXISTS (   -- skip rows that would violate UNIQUE(exercise_id, muscle_region_id)
    SELECT 1 FROM exercise_muscle_regions e2
    WHERE e2.exercise_id = emr.exercise_id AND e2.muscle_region_id = (SELECT id FROM upper_back));

-- Colliding rows (exercise already had both Back and Upper Back) were skipped by the repoint
-- above; if Back held the primary flag, the surviving Upper Back row must inherit it before
-- Back's row is deleted, or the exercise silently loses its primary-muscle flag.
UPDATE exercise_muscle_regions ub
SET is_primary = true
WHERE ub.muscle_region_id = (SELECT id FROM muscle_regions WHERE name = 'Upper Back')
  AND ub.is_primary = false
  AND EXISTS (
    SELECT 1 FROM exercise_muscle_regions b
    WHERE b.exercise_id = ub.exercise_id
      AND b.muscle_region_id = (SELECT id FROM muscle_regions WHERE name = 'Back')
      AND b.is_primary = true);

DELETE FROM exercise_muscle_regions WHERE muscle_region_id = (SELECT id FROM muscle_regions WHERE name='Back');
DELETE FROM captured_workout_muscles WHERE muscle_region_id = (SELECT id FROM muscle_regions WHERE name='Back');
DELETE FROM daily_checkin_soreness   WHERE muscle_region_id = (SELECT id FROM muscle_regions WHERE name='Back');
DELETE FROM muscle_regions WHERE name = 'Back';

-- 2) Region groups (replaces the app's hardcoded display_order ranges).
UPDATE muscle_regions SET region_group = 'Upper Body'     WHERE name IN ('Neck / Traps','Shoulders','Chest','Upper Back','Lats','Biceps','Triceps','Forearms / Grip');
UPDATE muscle_regions SET region_group = 'Core / Midline' WHERE name IN ('Core','Obliques','Lower Back');
UPDATE muscle_regions SET region_group = 'Lower Body'     WHERE name IN ('Glutes','Quads','Hamstrings','Calves','Hip Flexors','Hip Abductors','Hip Adductors');
UPDATE muscle_regions SET region_group = 'Whole Body'     WHERE name IN ('Full Body');
ALTER TABLE muscle_regions ALTER COLUMN region_group SET NOT NULL;

-- 3) Family ↔ modality truth (fixes: Push/Press reachable from Lifting; Rotation and Swing reachable at all).
INSERT INTO movement_family_modalities (movement_family_id, movement_category_id)
SELECT f.id, c.id FROM movement_families f JOIN movement_categories c ON (c.name, f.name) IN (
  ('Weightlifting','Squat'),('Weightlifting','Hinge'),('Weightlifting','Lunge'),('Weightlifting','Push/Press'),
  ('Weightlifting','Pull'),('Weightlifting','Carry'),('Weightlifting','Throw'),('Weightlifting','Olympic'),
  ('Weightlifting','Swing'),('Weightlifting','Rotation'),('Weightlifting','Core'),
  ('Gymnastics','Pull'),('Gymnastics','Push/Press'),('Gymnastics','Core'),('Gymnastics','Inversion'),
  ('Gymnastics','Plyometric'),('Gymnastics','Climb'),('Gymnastics','Support/Hold'),('Gymnastics','Ring/Bar'),
  ('Gymnastics','Mobility/Control'),('Gymnastics','Rotation'),('Gymnastics','Lunge'),
  ('Monostructural','Run'),('Monostructural','Row'),('Monostructural','Bike'),('Monostructural','Ski'),
  ('Monostructural','Rope'),('Monostructural','Swim'),('Monostructural','Carry'),
  ('Recovery','Mobility'),('Recovery','Stretching'),('Recovery','Foam Rolling'),('Recovery','Breath Work'),
  ('Recovery','Activation'),('Recovery','Balance/Stability')
) ON CONFLICT DO NOTHING;

-- 4) Abbreviation starter set (grows via curation; normalizer lowercases before lookup).
INSERT INTO alias_abbreviations (abbrev, expansion) VALUES
  ('kb','kettlebell'),('db','dumbbell'),('bb','barbell'),('oh','overhead'),
  ('ohs','overhead squat'),('hspu','handstand push up'),('hs','handstand'),
  ('t2b','toes to bar'),('ttb','toes to bar'),('c2b','chest to bar'),
  ('rdl','romanian deadlift'),('sdhp','sumo deadlift high pull'),('ghd','glute ham developer'),
  ('bw','bodyweight'),('alt','alternating'),('sl','single leg'),('sa','single arm'),
  ('du','double under'),('dus','double unders'),('mu','muscle up'),('bmu','bar muscle up'),
  ('rmu','ring muscle up'),('kbs','kettlebell swing'),('wb','wall ball'),('sq','squat')
ON CONFLICT (abbrev) DO NOTHING;

-- 5) Self-verifying: `supabase db push` does not run the harness, so this migration must fail
-- closed on live drift by itself, independent of scripts/movement-model/verify_foundation.sql.
DO $$
DECLARE
  v_observed TEXT;
  v_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.muscle_regions WHERE name = 'Back') THEN
    RAISE EXCEPTION 'reference_seeds FAIL: stray Back muscle region still present (id=%)',
      (SELECT id FROM public.muscle_regions WHERE name = 'Back');
  END IF;

  IF EXISTS (SELECT 1 FROM public.muscle_regions WHERE region_group IS NULL) THEN
    SELECT string_agg(name, ', ' ORDER BY name) INTO v_observed
      FROM public.muscle_regions WHERE region_group IS NULL;
    RAISE EXCEPTION 'reference_seeds FAIL: muscle regions without region_group: %', v_observed;
  END IF;

  SELECT count(*) INTO v_count FROM public.movement_family_modalities;
  IF v_count < 29 THEN
    RAISE EXCEPTION 'reference_seeds FAIL: family-modality junction under-seeded, got % rows (need >= 29)', v_count;
  END IF;

  IF EXISTS (  -- every family reachable from at least one modality
    SELECT 1 FROM public.movement_families f
    WHERE NOT EXISTS (SELECT 1 FROM public.movement_family_modalities m WHERE m.movement_family_id = f.id)
  ) THEN
    SELECT string_agg(f.name, ', ' ORDER BY f.name) INTO v_observed
      FROM public.movement_families f
      WHERE NOT EXISTS (SELECT 1 FROM public.movement_family_modalities m WHERE m.movement_family_id = f.id);
    RAISE EXCEPTION 'reference_seeds FAIL: unreachable movement families: %', v_observed;
  END IF;

  SELECT count(*) INTO v_count FROM public.alias_abbreviations;
  IF v_count < 15 THEN
    RAISE EXCEPTION 'reference_seeds FAIL: abbreviation dictionary under-seeded, got % rows (need >= 15)', v_count;
  END IF;
END $$;
