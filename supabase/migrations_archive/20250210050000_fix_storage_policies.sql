-- ============================================
-- Fix Food Inventory Storage Policies
-- Created: 2025-02-10
-- Description: Fix RLS policies for storage bucket
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can upload food images to their folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own food images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own food images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own food images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view all food images" ON storage.objects;

-- Allow authenticated users to insert images to their own folder
CREATE POLICY "Users can upload food images"
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

-- Allow public access to view all images (since bucket is public)
CREATE POLICY "Public can view all food images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'food-inventory');
