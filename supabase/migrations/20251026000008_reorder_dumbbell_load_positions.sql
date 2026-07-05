-- Migration: Reorder Dumbbell/KB Load Positions
-- Description: Moves Single Front Rack and Double Front Rack to the top of the Dumbbell/KB section

-- Update display order for Dumbbell/KB section
UPDATE load_positions SET display_order = 5 WHERE name = 'Single Front Rack';
UPDATE load_positions SET display_order = 6 WHERE name = 'Double Front Rack';
UPDATE load_positions SET display_order = 7 WHERE name = 'Goblet';
UPDATE load_positions SET display_order = 8 WHERE name = 'Single Overhead';
UPDATE load_positions SET display_order = 9 WHERE name = 'Suitcase';
