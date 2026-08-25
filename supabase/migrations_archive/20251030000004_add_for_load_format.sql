-- Add "For Load" format to wod_formats table
INSERT INTO wod_formats (name, description)
VALUES (
  'For Load',
  'Perform a strength movement (or complex) with progressively heavier weights until you hit your max successful load. Score is the heaviest weight lifted, not how fast or how many times you lift it.'
)
ON CONFLICT (name) DO NOTHING;
