-- scripts/movement-model/audit_worksheet.sql
-- NOTE: pre-Stage-6 tool — references legacy structures that no longer exist; historical use only.
-- One row per attribute value with live usage counts and empty decision columns.
-- Run: psql "$DB" -f scripts/movement-model/audit_worksheet.sql --csv --pset footer=off -o docs/superpowers/audit/attribute-audit-2026-08.csv
--
-- ** REGENERATION CLOBBER GUARD **
-- This worksheet is hand-edited during the Stage 2 audit session (decision, is_identity,
-- name_fragment, name_order, notes columns get filled in by a human). Before re-running this
-- script against the committed CSV's filename: check whether that CSV already has any non-empty
-- cell in those five columns. If it does, DO NOT overwrite it — write the new run to a NEW dated
-- filename instead (e.g. attribute-audit-2026-09.csv) so in-progress decisions are never blanked.
--
-- Equipment usage counts mirror the app's normalizeEquipmentName() in
-- mobile/src/lib/dailyCandidates.ts (LEGACY_EQUIPMENT dict) — see legacy_equipment_map below.
-- That JS function is the authority; keep this map in sync with it, not the other way around.
--
-- load_position, stance, and plane_of_motion are dual-stored (a legacy FK column on exercises
-- AND a newer junction table, backfilled from the FK, so most rows live in both places). Their
-- usage counts are DISTINCT-exercise counts across the union of both sources — summing FK count
-- + junction count double-counts every already-backfilled row.
WITH legacy_equipment_map(norm_raw, norm_canonical) AS (
  VALUES
    ('barbell','barbell'), ('dumbbell','dumbbell'), ('kettlebell','kettlebell'),
    ('wallball','medball'), ('medicineball','medball'), ('box','box'),
    ('rings','rings'), ('rower','rower'), ('bike','bike'), ('assaultbike','bike'),
    ('skierg','ski'), ('bodyweight','bodyweight')
)
SELECT * FROM (
  SELECT 'modality' AS attribute, mc.name AS value, mc.display_order,
         (SELECT count(*) FROM exercises e WHERE e.movement_category_id = mc.id) AS usage,
         '' AS decision, '' AS is_identity, '' AS name_fragment, '' AS name_order, '' AS notes
  FROM movement_categories mc
  UNION ALL
  SELECT 'family', f.name, f.display_order,
         (SELECT count(*) FROM exercises e WHERE e.movement_family_id = f.id), '', '', '', '', ''
  FROM movement_families f
  UNION ALL
  SELECT 'goal_type', g.name, g.display_order,
         (SELECT count(*) FROM exercise_goal_types x WHERE x.goal_type_id = g.id), '', '', '', '', ''
  FROM goal_types g
  UNION ALL
  SELECT 'muscle_region', m.name, m.display_order,
         (SELECT count(*) FROM exercise_muscle_regions x WHERE x.muscle_region_id = m.id), '', '', '', '', ''
  FROM muscle_regions m
  UNION ALL
  SELECT 'scoring_type', s.name, s.display_order,
         (SELECT count(*) FROM exercise_scoring_types x WHERE x.scoring_type_id = s.id), '', '', '', '', ''
  FROM scoring_types s
  UNION ALL
  -- Equipment: count an exercise if ANY element of equipment_types normalizes (via the app's
  -- LEGACY_EQUIPMENT dict, else lower+strip-spaces/underscores identity) to this row's name,
  -- normalized the same way. Without this, legacy-dialect tags ('bike', 'ski_erg',
  -- 'assault_bike', 'wall_ball', 'medicine_ball') never match their canonical equipment.name.
  SELECT 'equipment', q.name || ' [' || q.category || ']', q.display_order,
         (SELECT count(*) FROM exercises e
          WHERE EXISTS (
            SELECT 1 FROM unnest(e.equipment_types) AS raw
            WHERE COALESCE(
                    (SELECT lem.norm_canonical FROM legacy_equipment_map lem
                     WHERE lem.norm_raw = lower(replace(replace(raw, ' ', ''), '_', ''))),
                    lower(replace(replace(raw, ' ', ''), '_', ''))
                  ) = lower(replace(replace(q.name, ' ', ''), '_', ''))
          )), '', '', '', '', ''
  FROM equipment q
  UNION ALL
  -- Dual-stored (legacy FK + junction, junction backfilled from FK): distinct-exercise count
  -- across the union, not a sum, or every already-backfilled row is counted twice.
  SELECT 'load_position', lp.name || ' [' || lp.category || ']', lp.display_order,
         (SELECT count(DISTINCT x.exercise_id) FROM (
            SELECT e.id AS exercise_id FROM exercises e WHERE e.load_position_id = lp.id
            UNION
            SELECT j.exercise_id FROM exercise_load_positions j WHERE j.load_position_id = lp.id
          ) x), '', '', '', '', ''
  FROM load_positions lp
  UNION ALL
  SELECT 'stance', st.name, st.display_order,
         (SELECT count(DISTINCT x.exercise_id) FROM (
            SELECT e.id AS exercise_id FROM exercises e WHERE e.stance_id = st.id
            UNION
            SELECT j.exercise_id FROM exercise_stances j WHERE j.stance_id = st.id
          ) x), '', '', '', '', ''
  FROM stances st
  UNION ALL
  SELECT 'range_depth', rd.name, rd.display_order,
         (SELECT count(*) FROM exercises e WHERE e.range_depth_id = rd.id), '', '', '', '', ''
  FROM range_depths rd
  UNION ALL
  SELECT 'movement_style', ms.name || ' [' || ms.category || ']', ms.display_order,
         (SELECT count(*) FROM exercise_movement_styles x WHERE x.movement_style_id = ms.id), '', '', '', '', ''
  FROM movement_styles ms
  UNION ALL
  SELECT 'symmetry', sy.name, sy.display_order,
         (SELECT count(*) FROM exercises e WHERE e.symmetry_id = sy.id), '', '', '', '', ''
  FROM symmetries sy
  UNION ALL
  SELECT 'plane_of_motion', p.name, p.display_order,
         (SELECT count(DISTINCT x.exercise_id) FROM (
            SELECT e.id AS exercise_id FROM exercises e WHERE e.plane_of_motion_id = p.id
            UNION
            SELECT j.exercise_id FROM exercise_planes_of_motion j WHERE j.plane_of_motion_id = p.id
          ) x), '', '', '', '', ''
  FROM planes_of_motion p
  UNION ALL
  SELECT 'skill_level', v.lvl, v.ord, (SELECT count(*) FROM exercises e WHERE e.skill_level = v.lvl), '', '', '', '', ''
  FROM (VALUES ('Beginner',1),('Intermediate',2),('Advanced',3)) v(lvl, ord)
  UNION ALL
  SELECT 'variation_option (retiring)', vc.name || ': ' || vo.name, vo.display_order,
         (SELECT count(*) FROM exercise_variations x WHERE x.variation_option_id = vo.id), '', '', '', '', ''
  FROM variation_options vo JOIN variation_categories vc ON vc.id = vo.category_id
) t ORDER BY attribute, display_order;
