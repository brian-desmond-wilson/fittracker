-- Full Body muscle-tag pass (user verdict 2026-09-11).
--
-- The rule: primary lists the muscles that carry the load. "Full Body" joins
-- them only on compounds with no single dominant region (Olympic lifts,
-- thrusters, burpee-style movements). It stands ALONE only on monostructural
-- or recovery work (Bike, Ski, Swim, Run, Walk, Stretch, Foam Roll, Mobility).
-- "Full Body" is a classification, not a trainable muscle: it earns no
-- coverage credit and gates no split day, so the real muscles must be listed
-- alongside it or filters and soreness gating can't see the exercise.
--
-- 19 rows carry the tag; this file touches 12 of them. Not an identity
-- change — muscles are outside the fingerprint, so no re-parenting.

-- 1) Primary ↔ secondary flips on existing rows.
UPDATE public.exercise_muscle_regions x SET is_primary = v.is_primary
FROM (VALUES
  -- Olympic lifts match Snatch: the legs and shoulders carry the bar.
  ('Power Snatch',           'Quads',     true),
  ('Power Snatch',           'Shoulders', true),
  ('Single-Arm Devil Press', 'Shoulders', true),
  ('Single-Arm Devil Press', 'Quads',     true),
  -- Running is monostructural like Bike/Ski/Swim: Full Body alone up top.
  ('Treadmill Run',          'Calves',    false),
  ('Treadmill Run',          'Quads',     false)
) AS v(exercise, muscle, is_primary)
JOIN public.exercises e ON e.name = v.exercise
JOIN public.muscle_regions m ON m.name = v.muscle
WHERE x.exercise_id = e.id AND x.muscle_region_id = m.id
  AND x.is_primary IS DISTINCT FROM v.is_primary;

-- 2) Jump rope work is calf-dominant: Full Body comes off.
DELETE FROM public.exercise_muscle_regions x
USING public.exercises e, public.muscle_regions m
WHERE x.exercise_id = e.id AND x.muscle_region_id = m.id
  AND e.name IN ('Double-Under', 'Jump Rope') AND m.name = 'Full Body';

-- 3) Secondary muscles added (fills only — never touches an existing row).
INSERT INTO public.exercise_muscle_regions (exercise_id, muscle_region_id, is_primary)
SELECT e.id, m.id, false
FROM (VALUES
  ('Alternating Dumbbell Snatch', 'Glutes'),
  ('Alternating Dumbbell Snatch', 'Hamstrings'),
  ('Alternating Dumbbell Snatch', 'Core'),
  ('Alternating Dumbbell Snatch', 'Forearms / Grip'),
  ('Snatch', 'Core'),
  ('Snatch', 'Forearms / Grip'),
  ('Snatch', 'Glutes'),
  ('Snatch', 'Hamstrings'),
  ('Snatch', 'Upper Back'),
  ('Single-Arm Devil Press', 'Chest'),
  ('Double-Under', 'Forearms / Grip'),
  ('Double-Under', 'Shoulders'),
  ('Jump Rope', 'Forearms / Grip'),
  ('Jump Rope', 'Shoulders'),
  ('Dumbbell Thruster', 'Glutes'),
  ('Dumbbell Thruster', 'Core'),
  ('Dumbbell Thruster', 'Triceps'),
  ('Thruster', 'Glutes'),
  ('Thruster', 'Core'),
  ('Thruster', 'Triceps'),
  ('Wall Ball', 'Glutes'),
  ('Wall Ball', 'Core'),
  ('Wall Ball', 'Triceps')
) AS v(exercise, muscle)
JOIN public.exercises e ON e.name = v.exercise
JOIN public.muscle_regions m ON m.name = v.muscle
WHERE NOT EXISTS (SELECT 1 FROM public.exercise_muscle_regions x
                   WHERE x.exercise_id = e.id AND x.muscle_region_id = m.id);

-- 4) Assert the primary set of every row this file touched.
DO $$
DECLARE v RECORD; v_actual TEXT[];
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ('Alternating Dumbbell Snatch', ARRAY['Full Body','Quads','Shoulders']),
      ('Double-Under',                ARRAY['Calves']),
      ('Dumbbell Thruster',           ARRAY['Full Body','Quads','Shoulders']),
      ('Jump Rope',                   ARRAY['Calves']),
      ('Power Snatch',                ARRAY['Full Body','Quads','Shoulders']),
      ('Single-Arm Devil Press',      ARRAY['Full Body','Quads','Shoulders']),
      ('Snatch',                      ARRAY['Full Body','Quads','Shoulders']),
      ('Thruster',                    ARRAY['Full Body','Quads','Shoulders']),
      ('Treadmill Run',               ARRAY['Full Body']),
      ('Wall Ball',                   ARRAY['Full Body','Quads','Shoulders'])
    ) AS t(exercise, expected)
  LOOP
    SELECT COALESCE(array_agg(m.name ORDER BY m.name), '{}') INTO v_actual
      FROM public.exercises e
      JOIN public.exercise_muscle_regions x ON x.exercise_id = e.id AND x.is_primary
      JOIN public.muscle_regions m ON m.id = x.muscle_region_id
     WHERE e.name = v.exercise;
    IF v_actual <> v.expected THEN
      RAISE EXCEPTION 'full_body_muscle_pass: % primaries are % (expected %)', v.exercise, v_actual, v.expected;
    END IF;
  END LOOP;
  -- Every Full Body row still has the tag as PRIMARY (never demoted to secondary).
  IF EXISTS (SELECT 1 FROM public.exercise_muscle_regions x
              JOIN public.muscle_regions m ON m.id = x.muscle_region_id
             WHERE m.name = 'Full Body' AND NOT x.is_primary) THEN
    RAISE EXCEPTION 'full_body_muscle_pass: Full Body appears as a secondary muscle';
  END IF;
END $$;
