-- Stage 6 curation: every catalog row carries skill_level and >=1 scoring type.
-- Values are the approved sheet docs/superpowers/audit/2026-09-09-skill-scoring-curation.csv
-- (decision record). Fills blanks only -- never overwrites existing curation.
-- skill_level is not an identity column: no recompute, no fingerprint movement.

-- 0) Bound Ups: not a real exercise (user verdict 2026-09-09), approved for
-- deletion INCLUDING its history — one logged instance and one captured-workout
-- item from the 2026-08-19 "8-Minute Energy Flow" capture. exercise_instances
-- RESTRICTs on exercises, so the history rows go explicitly first; the
-- remaining references (captured/source/session items) cascade.
DELETE FROM public.exercise_instances
WHERE exercise_id IN (SELECT id FROM public.exercises WHERE name = 'Bound Ups' AND core_movement_id IS NULL);
DELETE FROM public.exercises WHERE name = 'Bound Ups' AND core_movement_id IS NULL;

-- 1) Authored skill levels (cores + outliers missing one). 15 rows.
UPDATE public.exercises e SET skill_level = v.skill
FROM (VALUES
  ('Calf Raise', 'Beginner'),
  ('Carry', 'Beginner'),
  ('Leg Curl', 'Beginner'),
  ('Plank', 'Beginner'),
  ('Bent-Over Row', 'Beginner'),
  ('Curl', 'Beginner'),
  ('Lat Pulldown', 'Beginner'),
  ('Bench Press', 'Intermediate'),
  ('Raise', 'Beginner'),
  ('Triceps Pushdown', 'Beginner'),
  ('Leg Press', 'Beginner'),
  ('Hyperextensions', 'Beginner'),
  ('Barbell Shrug', 'Beginner'),
  ('Leg Extension', 'Beginner'),
  ('Sissy Squat', 'Intermediate')
) AS v(name, skill)
WHERE e.name = v.name
  AND (e.tier = 0 OR e.core_movement_id IS NULL)
  AND e.skill_level IS NULL;

-- 2) Authored scoring types (cores + outliers with none). 128 pairs.
INSERT INTO public.exercise_scoring_types (exercise_id, scoring_type_id)
SELECT e.id, st.id
FROM (VALUES
  ('Calf Raise', 'Reps'),
  ('Calf Raise', 'Load'),
  ('Bike', 'Calories'),
  ('Bike', 'Distance'),
  ('Bike', 'Time'),
  ('Carry', 'Distance'),
  ('Carry', 'Load'),
  ('Leg Curl', 'Reps'),
  ('Leg Curl', 'Load'),
  ('Handstand Walk', 'Distance'),
  ('Crunch', 'Reps'),
  ('Leg Raise', 'Reps'),
  ('Mountain Climber', 'Reps'),
  ('Plank', 'Duration / Hold'),
  ('Reverse Crunch', 'Reps'),
  ('Russian Twist', 'Reps'),
  ('Sit-Up', 'Reps'),
  ('Toes-to-Bar', 'Reps'),
  ('V-Up', 'Reps'),
  ('Snatch', 'Reps'),
  ('Snatch', 'Load'),
  ('Bent-Over Row', 'Reps'),
  ('Bent-Over Row', 'Load'),
  ('Curl', 'Reps'),
  ('Curl', 'Load'),
  ('Inverted Row', 'Reps'),
  ('Lat Pulldown', 'Reps'),
  ('Lat Pulldown', 'Load'),
  ('Bench Press', 'Reps'),
  ('Bench Press', 'Load'),
  ('Chest Fly', 'Reps'),
  ('Chest Fly', 'Load'),
  ('Dip', 'Reps'),
  ('Handstand Push-Up', 'Reps'),
  ('Push-Up', 'Reps'),
  ('Raise', 'Reps'),
  ('Raise', 'Load'),
  ('Triceps Extension', 'Reps'),
  ('Triceps Extension', 'Load'),
  ('Triceps Pushdown', 'Reps'),
  ('Triceps Pushdown', 'Load'),
  ('Muscle-Up', 'Reps'),
  ('Jump Rope', 'Reps'),
  ('Jump Rope', 'Time'),
  ('Around the World', 'Reps'),
  ('Halo', 'Reps'),
  ('Ski', 'Calories'),
  ('Ski', 'Distance'),
  ('Ski', 'Time'),
  ('Leg Press', 'Reps'),
  ('Leg Press', 'Load'),
  ('Thruster', 'Reps'),
  ('Thruster', 'Load'),
  ('Swim', 'Distance'),
  ('Swim', 'Time'),
  ('Wall Ball', 'Reps'),
  ('Dumbbell Hold', 'Duration / Hold'),
  ('Dumbbell Hold', 'Load'),
  ('Foam Roll', 'Not Scored / N/A'),
  ('Cable Zercher Pull Through', 'Reps'),
  ('Cable Zercher Pull Through', 'Load'),
  ('Hyperextensions', 'Reps'),
  ('Hyperextensions', 'Load'),
  ('Kettlebell Deadlift High Pull', 'Reps'),
  ('Kettlebell Deadlift High Pull', 'Load'),
  ('Plate-Loaded Standing Hip Abduction', 'Reps'),
  ('Plate-Loaded Standing Hip Abduction', 'Load'),
  ('Wall Walk', 'Reps'),
  ('Sumo RDL To Lateral Lunge Clean', 'Reps'),
  ('Sumo RDL To Lateral Lunge Clean', 'Load'),
  ('Ab Rollout', 'Reps'),
  ('Iron Tridents', 'Reps'),
  ('Iron Tridents', 'Load'),
  ('Kettlebell Gravedigger', 'Reps'),
  ('Kettlebell Gravedigger', 'Load'),
  ('Toe-Driver', 'Reps'),
  ('90/90s', 'Not Scored / N/A'),
  ('Body Waves', 'Not Scored / N/A'),
  ('Golf Swings', 'Not Scored / N/A'),
  ('Horse Stance', 'Duration / Hold'),
  ('Lunge Rotation', 'Not Scored / N/A'),
  ('Lunge With Reach', 'Not Scored / N/A'),
  ('Mobility Work', 'Not Scored / N/A'),
  ('Pike Rotation', 'Not Scored / N/A'),
  ('Single-Leg Punch', 'Duration / Hold'),
  ('Squat Crunch', 'Not Scored / N/A'),
  ('Trunk Twists', 'Not Scored / N/A'),
  ('Windmill', 'Reps'),
  ('Windshield Wipers', 'Not Scored / N/A'),
  ('Yoga Squat To Reach', 'Not Scored / N/A'),
  ('Single-Arm Devil Press', 'Reps'),
  ('Single-Arm Devil Press', 'Load'),
  ('Barbell Shrug', 'Reps'),
  ('Barbell Shrug', 'Load'),
  ('Face Pull', 'Reps'),
  ('Face Pull', 'Load'),
  ('Horn Curl + Press Out', 'Reps'),
  ('Horn Curl + Press Out', 'Load'),
  ('Kettlebell Sprawl Row', 'Reps'),
  ('Kettlebell Sprawl Row', 'Load'),
  ('Overhand Grip Curl To Press', 'Reps'),
  ('Overhand Grip Curl To Press', 'Load'),
  ('Pullover With Knee Tucks', 'Reps'),
  ('Pullover With Knee Tucks', 'Load'),
  ('Single-Arm Upright Row', 'Reps'),
  ('Single-Arm Upright Row', 'Load'),
  ('Offset Reverse Lunge With Shoulder Press', 'Reps'),
  ('Offset Reverse Lunge With Shoulder Press', 'Load'),
  ('Reverse Tabletop Single-Arm Press With Opposing Leg Extension', 'Reps'),
  ('Reverse Tabletop Single-Arm Press With Opposing Leg Extension', 'Load'),
  ('Cool-Down Walk', 'Not Scored / N/A'),
  ('Air Squat, Reverse Lunge, And Burpee Complex', 'Reps'),
  ('Alternating Cossack Squat To Halo', 'Reps'),
  ('Alternating Cossack Squat To Halo', 'Load'),
  ('Kettlebell Swing With Squat Swing Combo', 'Reps'),
  ('Kettlebell Swing With Squat Swing Combo', 'Load'),
  ('Leg Extension', 'Reps'),
  ('Leg Extension', 'Load'),
  ('Sissy Squat', 'Reps'),
  ('Sissy Squat', 'Load'),
  ('Child''s Pose Flow', 'Not Scored / N/A'),
  ('Pigeon Stance Hip Stretch', 'Not Scored / N/A'),
  ('Single-Leg Dumbbell Stiff-Leg Hip Opener', 'Not Scored / N/A'),
  ('Stretch', 'Not Scored / N/A'),
  ('D Ball Over Shoulder', 'Reps'),
  ('D Ball Over Shoulder', 'Load'),
  ('Russian Slams', 'Reps'),
  ('Russian Slams', 'Load')
) AS v(name, scoring)
JOIN public.exercises e ON e.name = v.name AND (e.tier = 0 OR e.core_movement_id IS NULL)
JOIN public.scoring_types st ON st.name = v.scoring
ON CONFLICT (exercise_id, scoring_type_id) DO NOTHING;

-- 3) Derivations inherit from their core where still blank.
UPDATE public.exercises d SET skill_level = c.skill_level
FROM public.exercises c
WHERE d.core_movement_id = c.id AND d.id <> c.id
  AND d.skill_level IS NULL AND c.skill_level IS NOT NULL;

INSERT INTO public.exercise_scoring_types (exercise_id, scoring_type_id)
SELECT d.id, cst.scoring_type_id
FROM public.exercises d
JOIN public.exercises c ON c.id = d.core_movement_id AND d.id <> c.id
JOIN public.exercise_scoring_types cst ON cst.exercise_id = c.id
WHERE NOT EXISTS (SELECT 1 FROM public.exercise_scoring_types x WHERE x.exercise_id = d.id)
ON CONFLICT (exercise_id, scoring_type_id) DO NOTHING;

-- 4) Assert the declared standard now holds.
DO $$
DECLARE n_skill INT; n_scoring INT;
BEGIN
  SELECT count(*) INTO n_skill FROM public.exercises WHERE skill_level IS NULL;
  SELECT count(*) INTO n_scoring FROM public.exercises e
    WHERE NOT EXISTS (SELECT 1 FROM public.exercise_scoring_types est WHERE est.exercise_id = e.id);
  IF n_skill > 0 OR n_scoring > 0 THEN
    RAISE EXCEPTION 'curation incomplete: % rows without skill_level, % without scoring', n_skill, n_scoring;
  END IF;
END $$;
