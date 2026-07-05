-- Create movement-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('movement-images', 'movement-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload movement images
CREATE POLICY "Allow authenticated users to upload movement images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'movement-images');

-- Allow public read access to movement images
CREATE POLICY "Allow public read access to movement images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'movement-images');

-- Allow authenticated users to delete movement images
-- (simplified - filename pattern is {userId}/{movementId}_{timestamp}.png)
CREATE POLICY "Allow users to delete own movement images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'movement-images' AND (
    -- User owns the file (filename starts with their user ID)
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    -- User is admin
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
);
