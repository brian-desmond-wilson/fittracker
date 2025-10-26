-- Migration: Update Scoring Types
-- Description: Updates scoring types with new names, descriptions, and display order

-- Update existing scoring types with new names and descriptions
UPDATE scoring_types SET
  name = 'Reps',
  description = 'Count of repetitions completed.',
  display_order = 1
WHERE name = 'Reps';

UPDATE scoring_types SET
  name = 'Rounds + Reps',
  description = 'Used for AMRAP or EMOM style scoring.',
  display_order = 2
WHERE name = 'Rounds';

UPDATE scoring_types SET
  name = 'Load',
  description = 'Heaviest or prescribed weight used.',
  display_order = 3
WHERE name = 'Weight';

UPDATE scoring_types SET
  name = 'Time',
  description = 'Total time to complete a fixed amount of work.',
  display_order = 4
WHERE name = 'Time';

UPDATE scoring_types SET
  name = 'Distance',
  description = 'Length covered (run, row, ski, carry).',
  display_order = 5
WHERE name = 'Distance';

UPDATE scoring_types SET
  name = 'Calories',
  description = 'Machine output metric (ergs).',
  display_order = 6
WHERE name = 'Calories';

-- Insert new scoring types (if they don't already exist)
INSERT INTO scoring_types (name, description, display_order) VALUES
  ('Duration / Hold', 'Time-under-tension or static hold duration.', 7),
  ('Quality', 'Subjective or binary completion for skill/mobility work.', 8),
  ('Height / Range', 'Vertical distance or range-of-motion metrics.', 9),
  ('Not Scored / N/A', 'Used for movements not tracked for score (warm-ups, recovery).', 10)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;

-- Delete old scoring types that are no longer needed
DELETE FROM scoring_types WHERE name IN ('Height', 'None');
