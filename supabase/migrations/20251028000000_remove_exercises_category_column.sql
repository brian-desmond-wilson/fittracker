-- Remove deprecated category column from exercises table
-- This field has been replaced by movement_category_id which references movement_categories table

-- Check if column exists before dropping (safe migration)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'category'
    ) THEN
        ALTER TABLE exercises DROP COLUMN category;
    END IF;
END $$;

-- Also remove deprecated equipment and muscle_groups columns if they still exist
-- These have been replaced by junction tables

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'equipment'
    ) THEN
        ALTER TABLE exercises DROP COLUMN equipment;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'muscle_groups'
    ) THEN
        ALTER TABLE exercises DROP COLUMN muscle_groups;
    END IF;
END $$;
