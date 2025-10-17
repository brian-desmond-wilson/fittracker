-- ============================================
-- Food Inventory Storage Bucket Setup
-- Created: 2025-02-10
-- Description: Create storage bucket for food inventory images
-- ============================================

-- Create storage bucket for food inventory images
INSERT INTO storage.buckets (id, name, public)
VALUES ('food-inventory', 'food-inventory', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images to their own folder
CREATE POLICY "Users can upload food images to their folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'food-inventory' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view their own images
CREATE POLICY "Users can view their own food images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'food-inventory' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own images
CREATE POLICY "Users can update their own food images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'food-inventory' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own images
CREATE POLICY "Users can delete their own food images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'food-inventory' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public access to all images (since bucket is public)
CREATE POLICY "Public can view all food images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'food-inventory');
