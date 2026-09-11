-- One row per social creator whose posts have been captured, shared by every
-- user: a creator is the same person for everyone, so one fetch and one image
-- serve the whole app. Written only by the capture-post edge function with
-- the service role; users read. Spec:
-- docs/superpowers/specs/2026-09-10-creator-avatars-design.md
CREATE TABLE IF NOT EXISTS public.creators (
  platform text NOT NULL
    CONSTRAINT creators_platform_check CHECK (platform IN ('instagram', 'tiktok')),
  -- Normalised: no leading @, lowercased, trimmed.
  handle text NOT NULL,
  -- Public URL of OUR rehosted copy in the creator-avatars bucket; never a
  -- platform CDN link. NULL when the last fetch found nothing.
  avatar_url text,
  -- When we last TRIED, successful or not: drives the 30-day refresh and
  -- stops a dead profile being fetched on every capture.
  avatar_fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (platform, handle)
);

COMMENT ON TABLE public.creators IS
  'Social creators whose posts have been captured. Shared across users; avatar rehosted in creator-avatars.';

ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read creators"
  ON public.creators FOR SELECT
  TO authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policy on purpose: the edge function writes with
-- the service role, which bypasses RLS.

-- Bucket for rehosted avatars. Path convention: {platform}/{handle}.{ext},
-- overwritten in place on refresh so the stored URL never changes.
INSERT INTO storage.buckets (id, name, public)
VALUES ('creator-avatars', 'creator-avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read creator avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'creator-avatars');
-- Writes happen only from the edge function via service role — no
-- authenticated INSERT/UPDATE/DELETE policy, same as capture-thumbs.
