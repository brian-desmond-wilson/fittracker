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
