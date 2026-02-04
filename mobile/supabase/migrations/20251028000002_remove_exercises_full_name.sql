-- Remove full_name column from exercises table
-- This field is computed dynamically on the client side by combining name + variations
-- Example: "Front Squat + Pause + Barbell" is built from name "Front Squat" + variation options

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'full_name'
    ) THEN
        ALTER TABLE exercises DROP COLUMN full_name;
    END IF;
END $$;
