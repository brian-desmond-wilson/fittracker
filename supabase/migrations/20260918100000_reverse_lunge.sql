-- Reverse Lunge: the bodyweight reverse lunge was missing from the catalog
-- (only Kettlebell Reverse Lunge and Alternating Reverse Lunge existed).
-- Surfaced by splitting "Air Squat, Reverse Lunge, And Burpee Complex" into
-- its parts (user verdict 2026-09-11): Air Squat is the Squat core (already
-- its wild alias), Burpee is the Burpee core, and Reverse Lunge needed a row.
--
-- Created as a derivation of the Lunge core with direction Reverse and
-- Bodyweight equipment, mirroring its siblings' muscle set. Fingerprint,
-- parent, tier, generated name and generated alias are computed by the
-- identity engine triggers, not hand-set. Alternating Reverse Lunge keeps
-- Alternating Lunge as its parent: both candidates carry two attributes and
-- the tie breaks on created_at.

INSERT INTO public.exercises (
  name, slug, is_movement, movement_category_id, movement_family_id,
  skill_level, is_core, core_movement_id, direction_id,
  is_official, created_by, requires_weight, requires_distance, name_is_custom
)
SELECT 'Reverse Lunge', 'reverse-lunge', false,
       (SELECT id FROM public.movement_categories WHERE name = 'Gymnastics'),
       (SELECT id FROM public.movement_families WHERE name = 'Lunge'),
       'Beginner', false,
       'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9',                 -- core: Lunge
       (SELECT id FROM public.directions WHERE name = 'Reverse'),
       false, 'bd91dc7e-7eb8-4655-b05a-c9f72db39e9e', false, false, false
 WHERE NOT EXISTS (SELECT 1 FROM public.exercises WHERE slug = 'reverse-lunge');

INSERT INTO public.exercise_equipment (exercise_id, equipment_id)
SELECT e.id, q.id
  FROM public.exercises e, public.equipment q
 WHERE e.slug = 'reverse-lunge' AND q.name = 'Bodyweight'
   AND NOT EXISTS (SELECT 1 FROM public.exercise_equipment x
                    WHERE x.exercise_id = e.id AND x.equipment_id = q.id);

INSERT INTO public.exercise_muscle_regions (exercise_id, muscle_region_id, is_primary)
SELECT e.id, m.id, v.is_primary
  FROM public.exercises e
  JOIN (VALUES ('Quads', true), ('Glutes', true),
               ('Hamstrings', false), ('Core', false), ('Calves', false)) AS v(muscle, is_primary) ON true
  JOIN public.muscle_regions m ON m.name = v.muscle
 WHERE e.slug = 'reverse-lunge'
   AND NOT EXISTS (SELECT 1 FROM public.exercise_muscle_regions x
                    WHERE x.exercise_id = e.id AND x.muscle_region_id = m.id);

INSERT INTO public.exercise_goal_types (exercise_id, goal_type_id)
SELECT e.id, g.id FROM public.exercises e, public.goal_types g
 WHERE e.slug = 'reverse-lunge' AND g.name = 'Strength'
ON CONFLICT (exercise_id, goal_type_id) DO NOTHING;

INSERT INTO public.exercise_scoring_types (exercise_id, scoring_type_id)
SELECT e.id, s.id FROM public.exercises e, public.scoring_types s
 WHERE e.slug = 'reverse-lunge' AND s.name = 'Reps'
ON CONFLICT (exercise_id, scoring_type_id) DO NOTHING;

-- Assert the end state the engine should have produced.
DO $$
DECLARE r RECORD;
BEGIN
  SELECT name, tier, parent_exercise_id, generated_name
    INTO r FROM public.exercises WHERE slug = 'reverse-lunge';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reverse_lunge: row was not created';
  END IF;
  IF r.tier <> 1 OR r.parent_exercise_id <> 'cca7659a-0cee-4395-aa3b-a0c7cd4b92b9' THEN
    RAISE EXCEPTION 'reverse_lunge: landed at tier % under % (expected tier 1 under the Lunge core)',
      r.tier, r.parent_exercise_id;
  END IF;
  IF r.name <> 'Reverse Lunge' OR r.generated_name <> 'Reverse Lunge' THEN
    RAISE EXCEPTION 'reverse_lunge: engine named the row "%" / generated "%"', r.name, r.generated_name;
  END IF;
  IF (SELECT parent_exercise_id FROM public.exercises WHERE name = 'Alternating Reverse Lunge')
     <> 'f0b6fe29-c3b0-4c1e-a7f2-7ed11a013056' THEN
    RAISE EXCEPTION 'reverse_lunge: Alternating Reverse Lunge was re-parented away from Alternating Lunge';
  END IF;
END $$;
