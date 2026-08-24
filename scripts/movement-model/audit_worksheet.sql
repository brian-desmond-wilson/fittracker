-- scripts/movement-model/audit_worksheet.sql
-- One row per attribute value with live usage counts and empty decision columns.
-- Run: psql "$DB" -f scripts/movement-model/audit_worksheet.sql -A -F',' -o docs/superpowers/audit/attribute-audit-2026-08.csv
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
  SELECT 'equipment', q.name || ' [' || q.category || ']', q.display_order,
         (SELECT count(*) FROM exercises e WHERE e.equipment_types @> ARRAY[q.name]), '', '', '', '', ''
  FROM equipment q
  UNION ALL
  SELECT 'load_position', lp.name || ' [' || lp.category || ']', lp.display_order,
         (SELECT count(*) FROM exercises e WHERE e.load_position_id = lp.id)
       + (SELECT count(*) FROM exercise_load_positions x WHERE x.load_position_id = lp.id), '', '', '', '', ''
  FROM load_positions lp
  UNION ALL
  SELECT 'stance', st.name, st.display_order,
         (SELECT count(*) FROM exercises e WHERE e.stance_id = st.id)
       + (SELECT count(*) FROM exercise_stances x WHERE x.stance_id = st.id), '', '', '', '', ''
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
         (SELECT count(*) FROM exercises e WHERE e.plane_of_motion_id = p.id)
       + (SELECT count(*) FROM exercise_planes_of_motion x WHERE x.plane_of_motion_id = p.id), '', '', '', '', ''
  FROM planes_of_motion p
  UNION ALL
  SELECT 'skill_level', v.lvl, v.ord, (SELECT count(*) FROM exercises e WHERE e.skill_level = v.lvl), '', '', '', '', ''
  FROM (VALUES ('Beginner',1),('Intermediate',2),('Advanced',3)) v(lvl, ord)
  UNION ALL
  SELECT 'variation_option (retiring)', vc.name || ': ' || vo.name, vo.display_order,
         (SELECT count(*) FROM exercise_variations x WHERE x.variation_option_id = vo.id), '', '', '', '', ''
  FROM variation_options vo JOIN variation_categories vc ON vc.id = vo.category_id
) t ORDER BY attribute, display_order;
