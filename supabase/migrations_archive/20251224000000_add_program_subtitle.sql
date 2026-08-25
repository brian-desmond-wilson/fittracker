-- Add subtitle column to program_templates
-- Created: 2025-12-24
-- Description: Add subtitle field for program short descriptions/taglines

ALTER TABLE program_templates
ADD COLUMN subtitle TEXT;

-- Add comment for documentation
COMMENT ON COLUMN program_templates.subtitle IS 'Short subtitle/tagline for the program (e.g., "A 4-Week Kickball Performance Peak Program")';
