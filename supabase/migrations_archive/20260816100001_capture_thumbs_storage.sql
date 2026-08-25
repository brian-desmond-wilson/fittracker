-- Bucket for rehosted capture thumbnails. Path convention: {userId}/{ts}.{ext}
INSERT INTO storage.buckets (id, name, public)
VALUES ('capture-thumbs', 'capture-thumbs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read capture thumbs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'capture-thumbs');

-- Writes happen only from the edge function via service role, which bypasses
-- RLS — no authenticated INSERT policy on purpose.

CREATE POLICY "Users delete own capture thumbs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'capture-thumbs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
