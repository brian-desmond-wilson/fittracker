-- ============================================
-- Progress Photos Storage Bucket Setup
-- Created: 2025-02-10
-- Description: Create storage bucket for progress photos
-- ============================================

-- Create storage bucket for progress photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('progress-photos', 'progress-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload photos
CREATE POLICY "Allow authenticated uploads to progress-photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'progress-photos');

-- Allow authenticated users to view photos
CREATE POLICY "Allow authenticated select from progress-photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'progress-photos');

-- Allow authenticated users to update photos
CREATE POLICY "Allow authenticated update in progress-photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'progress-photos');

-- Allow authenticated users to delete photos
CREATE POLICY "Allow authenticated delete from progress-photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'progress-photos');

-- Allow public read access
CREATE POLICY "Allow public select from progress-photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'progress-photos');
