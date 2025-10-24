-- Add WOD Image Fields
-- Adds support for AI-generated WOD images stored in Supabase Storage

-- Add image-related columns to wods table
ALTER TABLE wods
ADD COLUMN image_url text,
ADD COLUMN image_generated_at timestamptz,
ADD COLUMN image_generation_failed boolean DEFAULT false;

-- Add comment explaining the fields
COMMENT ON COLUMN wods.image_url IS 'URL to generated WOD image in Supabase Storage';
COMMENT ON COLUMN wods.image_generated_at IS 'Timestamp when the image was generated';
COMMENT ON COLUMN wods.image_generation_failed IS 'Flag indicating if image generation failed (for retry logic)';

-- Create index for querying WODs with failed image generation (for retry jobs)
CREATE INDEX idx_wods_image_generation_failed
ON wods (image_generation_failed)
WHERE image_generation_failed = true;

-- Update RLS policies to allow image URL updates
-- Users should be able to update their own WOD images
-- (The existing policy should already cover this, but we'll be explicit)

-- Note: Storage bucket 'wod-images' should be created manually via Supabase Dashboard
-- with the following settings:
--   - Public: true (for CDN delivery)
--   - File size limit: 5MB
--   - Allowed MIME types: image/png, image/jpeg, image/webp
--
-- Storage RLS Policy:
--   CREATE POLICY "Users can upload WOD images to their own folder"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'wod-images' AND
--     (storage.foldername(name))[1] = auth.uid()::text
--   );
--
--   CREATE POLICY "Anyone can view WOD images"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'wod-images');
--
--   CREATE POLICY "Users can update their own WOD images"
--   ON storage.objects FOR UPDATE
--   USING (
--     bucket_id = 'wod-images' AND
--     (storage.foldername(name))[1] = auth.uid()::text
--   );
--
--   CREATE POLICY "Users can delete their own WOD images"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'wod-images' AND
--     (storage.foldername(name))[1] = auth.uid()::text
--   );
