-- Create storage bucket for WOD images
-- This migration sets up the storage bucket and RLS policies for AI-generated WOD images

-- Create the wod-images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wod-images',
  'wod-images',
  true, -- public bucket for CDN delivery
  5242880, -- 5 MB file size limit
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for storage.objects

-- Allow users to upload WOD images to their own folder
CREATE POLICY "Users can upload WOD images to their own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'wod-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow anyone to view WOD images (public bucket)
CREATE POLICY "Anyone can view WOD images"
ON storage.objects FOR SELECT
USING (bucket_id = 'wod-images');

-- Allow users to update their own WOD images
CREATE POLICY "Users can update their own WOD images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'wod-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own WOD images
CREATE POLICY "Users can delete their own WOD images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'wod-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
