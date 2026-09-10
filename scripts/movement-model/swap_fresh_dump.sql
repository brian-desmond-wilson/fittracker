-- Swap staging catalog data for the fresh 2026-09-08 20:02 live dump (v2).
-- The dump omits the migration-created dictionaries (grips, directions,
-- support_positions, arm_positions, bench_angles, variant_labels) and the
-- derived tables (exercise_aliases, exercise_equipment, exercise_match_reviews);
-- their ids were generated independently per environment, so:
--   * loaded exercises columns pointing at those dictionaries are remapped
--     live-id -> staging-id by pairing old/new rows on the stable exercise id;
--   * preserved tables pointing at RELOADED tables (equipment, muscle_regions,
--     families, categories) are remapped old-staging-id -> live-id by name;
--   * identity_fingerprint is rebuilt from the remapped attribute ids;
--   * a fail-closed gate proves every reference resolves and every fingerprint
--     is self-consistent before COMMIT.
SET LOCAL session_replication_role = replica;

-- Phase 0: snapshots (the old staging state is the id Rosetta stone — it is the
-- same Stage 3 catalog content, previously verified by V0-V10 on both sides).
CREATE TEMP TABLE _old_ex ON COMMIT DROP AS
  SELECT id, grip_orientation_id, grip_width_id, direction_id, support_position_id,
         arm_position_id, bench_angle_id, variant_label_id
    FROM public.exercises;
CREATE TEMP TABLE _old_equipment  ON COMMIT DROP AS SELECT id, name FROM public.equipment;
CREATE TEMP TABLE _old_regions    ON COMMIT DROP AS SELECT id, name FROM public.muscle_regions;
CREATE TEMP TABLE _old_families   ON COMMIT DROP AS SELECT id, name FROM public.movement_families;
CREATE TEMP TABLE _old_categories ON COMMIT DROP AS SELECT id, name FROM public.movement_categories;

-- Phase 1: clear the dumped tables only.
DELETE FROM public.exercise_standards;
DELETE FROM public.movement_measurement_profiles;
DELETE FROM public.movement_scaling_links;
DELETE FROM public.exercise_goal_types;
DELETE FROM public.exercise_scoring_types;
DELETE FROM public.exercise_muscle_regions;
DELETE FROM public.exercise_movement_styles;
DELETE FROM public.exercises;
DELETE FROM public.goal_types;
DELETE FROM public.movement_categories;
DELETE FROM public.movement_families;
DELETE FROM public.planes_of_motion;
DELETE FROM public.load_positions;
DELETE FROM public.stances;
DELETE FROM public.range_depths;
DELETE FROM public.movement_styles;
DELETE FROM public.symmetries;
DELETE FROM public.muscle_regions;
DELETE FROM public.equipment;
DELETE FROM public.scoring_types;

\i backups/catalog_data_20260908200223.sql

-- Phase 2a: remap the loaded exercises' preserved-dictionary columns
-- (live id -> staging id), pairing on the stable exercise id. Fail closed on
-- any NULLness disagreement or non-functional mapping (both would mean the
-- fresh dump and the verified staging catalog DIVERGE in content).
DO $$
DECLARE
  col TEXT;
  v_bad BIGINT;
BEGIN
  FOREACH col IN ARRAY ARRAY['grip_orientation_id','grip_width_id','direction_id',
                             'support_position_id','arm_position_id','bench_angle_id','variant_label_id']
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.exercises n JOIN _old_ex o ON o.id = n.id
        WHERE (n.%1$I IS NULL) <> (o.%1$I IS NULL)', col) INTO v_bad;
    IF v_bad <> 0 THEN
      RAISE EXCEPTION 'fresh-dump swap FAIL: % NULLness diverges on % rows (dump content != verified staging content)', col, v_bad;
    END IF;
    EXECUTE format(
      'SELECT count(*) FROM (
         SELECT n.%1$I FROM public.exercises n JOIN _old_ex o ON o.id = n.id
          WHERE n.%1$I IS NOT NULL GROUP BY n.%1$I HAVING count(DISTINCT o.%1$I) > 1) x', col) INTO v_bad;
    IF v_bad <> 0 THEN
      RAISE EXCEPTION 'fresh-dump swap FAIL: % live->staging map not functional for % live ids', col, v_bad;
    END IF;
    EXECUTE format(
      'UPDATE public.exercises e SET %1$I = m.staging_id
         FROM (SELECT DISTINCT n.%1$I AS live_id, o.%1$I AS staging_id
                 FROM public.exercises n JOIN _old_ex o ON o.id = n.id
                WHERE n.%1$I IS NOT NULL) m
        WHERE e.%1$I = m.live_id AND e.%1$I IS DISTINCT FROM m.staging_id', col);
  END LOOP;
END $$;

-- Phase 2b: remap preserved tables that point INTO reloaded tables, by name
-- (no-ops where the ids never diverged).
UPDATE public.exercise_equipment ee SET equipment_id = qn.id
  FROM _old_equipment qo JOIN public.equipment qn ON qn.name = qo.name
 WHERE ee.equipment_id = qo.id AND qo.id <> qn.id;
UPDATE public.gym_profile_equipment ge SET equipment_id = qn.id
  FROM _old_equipment qo JOIN public.equipment qn ON qn.name = qo.name
 WHERE ge.equipment_id = qo.id AND qo.id <> qn.id;
UPDATE public.bench_angles ba SET implies_equipment_id = qn.id
  FROM _old_equipment qo JOIN public.equipment qn ON qn.name = qo.name
 WHERE ba.implies_equipment_id = qo.id AND qo.id <> qn.id;
UPDATE public.captured_workout_muscles cm SET muscle_region_id = rn.id
  FROM _old_regions ro JOIN public.muscle_regions rn ON rn.name = ro.name
 WHERE cm.muscle_region_id = ro.id AND ro.id <> rn.id;
UPDATE public.daily_checkin_soreness ds SET muscle_region_id = rn.id
  FROM _old_regions ro JOIN public.muscle_regions rn ON rn.name = ro.name
 WHERE ds.muscle_region_id = ro.id AND ro.id <> rn.id;
UPDATE public.movement_family_modalities mm SET movement_family_id = fn.id
  FROM _old_families fo JOIN public.movement_families fn ON fn.name = fo.name
 WHERE mm.movement_family_id = fo.id AND fo.id <> fn.id;
UPDATE public.movement_family_modalities mm SET movement_category_id = cn.id
  FROM _old_categories co JOIN public.movement_categories cn ON cn.name = co.name
 WHERE mm.movement_category_id = co.id AND co.id <> cn.id;

-- Phase 2c: rebuild fingerprints from the remapped attribute ids (live
-- fingerprint strings embed live dictionary/equipment uuids). Everything else
-- derived (generated_name, name, parent, tier, aliases) is id-stable or
-- name-stable and needs no rebuild.
UPDATE public.exercises e
   SET identity_fingerprint = array_to_string(public.exercise_identity_attrs(e.id), '|')
 WHERE e.core_movement_id IS NOT NULL
   AND e.identity_fingerprint IS DISTINCT FROM array_to_string(public.exercise_identity_attrs(e.id), '|');

-- Phase 3: fail-closed end-state gate.
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  SELECT string_agg(bad.v, '; ') INTO v_observed FROM (
    -- Dataset-size checks are FLOORS: live grows with on-device activity
    -- (captures mint exercises/aliases/reviews), so exact counts rot. Cores
    -- and dictionaries stay exact. Floors set 2026-09-09 (post-curation: 286
    -- exercises on the 2026-09-08 dump; live carries 4 extra minted rows).
    SELECT 'exercises='||count(*) FROM public.exercises HAVING count(*) < 286
    UNION ALL SELECT 'cores='||count(*) FROM public.exercises WHERE is_core HAVING count(*) <> 48
    UNION ALL SELECT 'derivations='||count(*) FROM public.exercises WHERE core_movement_id IS NOT NULL AND NOT is_core HAVING count(*) < 187
    UNION ALL SELECT 'outliers='||count(*) FROM public.exercises WHERE core_movement_id IS NULL HAVING count(*) < 51
    UNION ALL SELECT 'aliases='||count(*) FROM public.exercise_aliases HAVING count(*) < 299
    UNION ALL SELECT 'variant labels='||count(*) FROM public.variant_labels HAVING count(*) <> 17
    UNION ALL SELECT 'orphan aliases='||count(*) FROM public.exercise_aliases a
      WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = a.exercise_id) HAVING count(*) <> 0
    UNION ALL SELECT 'orphan equipment junctions='||count(*) FROM public.exercise_equipment ee
      WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = ee.exercise_id)
         OR NOT EXISTS (SELECT 1 FROM public.equipment q WHERE q.id = ee.equipment_id) HAVING count(*) <> 0
    UNION ALL SELECT 'orphan gym equipment='||count(*) FROM public.gym_profile_equipment ge
      WHERE NOT EXISTS (SELECT 1 FROM public.equipment q WHERE q.id = ge.equipment_id) HAVING count(*) <> 0
    UNION ALL SELECT 'orphan style junctions='||count(*) FROM public.exercise_movement_styles ems
      WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = ems.exercise_id)
         OR NOT EXISTS (SELECT 1 FROM public.movement_styles ms WHERE ms.id = ems.movement_style_id) HAVING count(*) <> 0
    UNION ALL SELECT 'orphan family modalities='||count(*) FROM public.movement_family_modalities mm
      WHERE NOT EXISTS (SELECT 1 FROM public.movement_families f WHERE f.id = mm.movement_family_id)
         OR NOT EXISTS (SELECT 1 FROM public.movement_categories c WHERE c.id = mm.movement_category_id) HAVING count(*) <> 0
    UNION ALL SELECT 'orphan captured muscles='||count(*) FROM public.captured_workout_muscles cm
      WHERE NOT EXISTS (SELECT 1 FROM public.muscle_regions r WHERE r.id = cm.muscle_region_id) HAVING count(*) <> 0
    UNION ALL SELECT 'orphan soreness='||count(*) FROM public.daily_checkin_soreness ds
      WHERE NOT EXISTS (SELECT 1 FROM public.muscle_regions r WHERE r.id = ds.muscle_region_id) HAVING count(*) <> 0
    UNION ALL SELECT 'orphan exercise refs='||count(*) FROM (
      SELECT exercise_id AS x FROM public.exercise_instances
      UNION ALL SELECT exercise_id FROM public.wod_movements
      UNION ALL SELECT exercise_id FROM public.program_workout_exercises
      UNION ALL SELECT exercise_id FROM public.source_exercises
      UNION ALL SELECT core_movement_id FROM public.variant_labels
    ) refs WHERE x IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = refs.x) HAVING count(*) <> 0
    UNION ALL SELECT 'dangling dictionary refs='||count(*) FROM public.exercises e
      WHERE (e.variant_label_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.variant_labels v WHERE v.id = e.variant_label_id))
         OR (e.grip_orientation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grips g WHERE g.id = e.grip_orientation_id))
         OR (e.grip_width_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.grips g WHERE g.id = e.grip_width_id))
         OR (e.direction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.directions d WHERE d.id = e.direction_id))
         OR (e.support_position_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.support_positions s WHERE s.id = e.support_position_id))
         OR (e.arm_position_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.arm_positions a WHERE a.id = e.arm_position_id))
         OR (e.bench_angle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bench_angles b WHERE b.id = e.bench_angle_id))
         OR (e.load_position_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.load_positions l WHERE l.id = e.load_position_id))
         OR (e.stance_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stances s WHERE s.id = e.stance_id))
         OR (e.range_depth_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.range_depths r WHERE r.id = e.range_depth_id))
         OR (e.symmetry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.symmetries s WHERE s.id = e.symmetry_id))
         OR (e.parent_exercise_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exercises p WHERE p.id = e.parent_exercise_id))
         OR (e.core_movement_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exercises c WHERE c.id = e.core_movement_id))
      HAVING count(*) <> 0
    UNION ALL SELECT 'stale fingerprints='||count(*) FROM public.exercises e
      WHERE e.core_movement_id IS NOT NULL
        AND e.identity_fingerprint IS DISTINCT FROM array_to_string(public.exercise_identity_attrs(e.id), '|')
      HAVING count(*) <> 0
    UNION ALL SELECT 'coreless with fingerprint='||count(*) FROM public.exercises
      WHERE core_movement_id IS NULL AND identity_fingerprint IS NOT NULL HAVING count(*) <> 0
    UNION ALL SELECT 'per-core fingerprint dupes='||count(*) FROM (
      SELECT 1 FROM public.exercises e WHERE e.core_movement_id IS NOT NULL
       GROUP BY e.core_movement_id, e.identity_fingerprint HAVING count(*) > 1) d HAVING count(*) <> 0
  ) bad(v);
  IF v_observed IS NOT NULL THEN
    RAISE EXCEPTION 'fresh-dump swap FAIL: %', v_observed;
  END IF;
END $$;
