-- Bring stored capture URLs onto the identity rule the app now applies.
--
-- "Already captured?" is answered by comparing source_url, so the stored
-- string has to be the canonical one or a re-share of an old capture reads as
-- a new post. The client's normalizer changed in two ways: one Instagram post
-- is one identity whatever door it came through (/p/, /reel/, /reels/, /tv/,
-- or the profile-scoped /<user>/reel/), and a carousel's img_index says which
-- slide was on screen, not which post. Rows written before that — including
-- the earliest ones, saved before any normalization existed — still carry
-- www., trailing slashes and slide indexes.
--
-- Where two rows canonicalize to the same URL, they are a genuine duplicate
-- capture of one post. Only the earliest is rewritten: the unique index would
-- reject the second, and leaving it on its old URL is harmless — it stays
-- visible and deletable, while the canonical URL now exists, so a future
-- re-share of that post matches the original instead of making a third.
WITH canonical AS (
  SELECT
    id,
    user_id,
    CASE
      -- An Instagram post: the shortcode is the identity, everything else goes.
      WHEN source_url ~ '^https?://(?:www\.)?instagram\.com/(?:[^/?#]+/)?(?:p|reel|reels|tv)/[^/?#]+'
        THEN regexp_replace(
               source_url,
               '^https?://(?:www\.)?instagram\.com/(?:[^/?#]+/)?(?:p|reel|reels|tv)/([^/?#]+).*$',
               'https://instagram.com/p/\1')
      -- Anything else keeps its path; only the cosmetic host and trailing
      -- slash come off, matching what the client would now store.
      ELSE regexp_replace(
             regexp_replace(source_url, '^(https?://)www\.', '\1'),
             '/+$', '')
    END AS url
  FROM public.captured_sources
),
ranked AS (
  SELECT
    c.id,
    c.user_id,
    c.url,
    ROW_NUMBER() OVER (
      PARTITION BY c.user_id, c.url ORDER BY s.captured_at, c.id
    ) AS rn
  FROM canonical c
  JOIN public.captured_sources s ON s.id = c.id
)
UPDATE public.captured_sources AS s
SET source_url = r.url
FROM ranked r
WHERE s.id = r.id
  AND s.source_url <> r.url
  AND r.rn = 1
  -- And never onto a URL some other row already holds.
  AND NOT EXISTS (
    SELECT 1
    FROM public.captured_sources t
    WHERE t.user_id = r.user_id
      AND t.source_url = r.url
      AND t.id <> r.id
  );
