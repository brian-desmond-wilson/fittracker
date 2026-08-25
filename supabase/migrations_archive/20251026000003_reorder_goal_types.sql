-- Migration: Reorder Goal Types
-- Description: Updates display order to: Cool-Down, Stretching, Mobility, Recovery, Skill, Strength, MetCon

UPDATE goal_types SET display_order = 1 WHERE name = 'Cool-Down';
UPDATE goal_types SET display_order = 2 WHERE name = 'Stretching';
UPDATE goal_types SET display_order = 3 WHERE name = 'Mobility';
UPDATE goal_types SET display_order = 4 WHERE name = 'Recovery';
UPDATE goal_types SET display_order = 5 WHERE name = 'Skill';
UPDATE goal_types SET display_order = 6 WHERE name = 'Strength';
UPDATE goal_types SET display_order = 7 WHERE name = 'MetCon';
