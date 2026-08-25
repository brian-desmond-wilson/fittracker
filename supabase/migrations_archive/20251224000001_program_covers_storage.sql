-- ============================================
-- Program Covers Storage Bucket Setup
-- Created: 2025-12-24
-- Description: Create storage bucket for program cover images
-- ============================================

-- Create storage bucket for program cover images
INSERT INTO storage.buckets (id, name, public)
VALUES ('program-covers', 'program-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload covers
CREATE POLICY "Allow authenticated uploads to program-covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'program-covers');

-- Allow authenticated users to view covers
CREATE POLICY "Allow authenticated select from program-covers"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'program-covers');

-- Allow authenticated users to update covers
CREATE POLICY "Allow authenticated update in program-covers"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'program-covers');

-- Allow authenticated users to delete covers
CREATE POLICY "Allow authenticated delete from program-covers"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'program-covers');

-- Allow public read access (needed for displaying program cards)
CREATE POLICY "Allow public select from program-covers"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'program-covers');
