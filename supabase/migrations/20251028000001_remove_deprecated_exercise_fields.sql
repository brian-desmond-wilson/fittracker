-- Remove deprecated fields from exercises table
-- These fields have been replaced by:
-- - demo_video_url → video_url
-- - thumbnail_url → image_url
-- - setup_instructions, execution_cues, common_mistakes → exercise_standards table

-- Remove demo_video_url (replaced by video_url)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'demo_video_url'
    ) THEN
        ALTER TABLE exercises DROP COLUMN demo_video_url;
    END IF;
END $$;

-- Remove thumbnail_url (replaced by image_url)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'thumbnail_url'
    ) THEN
        ALTER TABLE exercises DROP COLUMN thumbnail_url;
    END IF;
END $$;

-- Remove setup_instructions (moved to exercise_standards)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'setup_instructions'
    ) THEN
        ALTER TABLE exercises DROP COLUMN setup_instructions;
    END IF;
END $$;

-- Remove execution_cues (moved to exercise_standards)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'execution_cues'
    ) THEN
        ALTER TABLE exercises DROP COLUMN execution_cues;
    END IF;
END $$;

-- Remove common_mistakes (moved to exercise_standards)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'common_mistakes'
    ) THEN
        ALTER TABLE exercises DROP COLUMN common_mistakes;
    END IF;
END $$;
