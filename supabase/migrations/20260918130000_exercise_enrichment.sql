-- Provenance for the three enrichable exercise fields, so the enrichment
-- pipeline can tell a human's text from its own and never overwrite the
-- former. Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §5
--
-- Shape, keyed by column name:
--   {"description": {"by": "extraction" | "model" | "user", "at": "<iso>"},
--    "video_url":   {"by": "capture" | "user", "at": "<iso>"},
--    "image_url":   {"by": "model" | "user", "at": "<iso>"}}
-- A missing key means "nobody has filled this; the pipeline may".
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS enrichment jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.exercises.enrichment IS
  'Per-field provenance for description / video_url / image_url: {"<field>": {"by": "user"|"extraction"|"model"|"capture", "at": iso}}. A field with no key is fillable by enrich-exercise; by="user" is never overwritten.';

-- Seed: everything that exists today was put there by a person (or by a
-- generator a person tapped), so the backfill must not touch it. Only rows
-- with no provenance yet are stamped — re-running this file changes nothing.
UPDATE public.exercises
SET enrichment = enrichment
  || CASE WHEN nullif(btrim(description), '') IS NOT NULL
       THEN jsonb_build_object('description', jsonb_build_object('by', 'user', 'at', now()))
       ELSE '{}'::jsonb END
  || CASE WHEN nullif(btrim(video_url), '') IS NOT NULL
       THEN jsonb_build_object('video_url', jsonb_build_object('by', 'user', 'at', now()))
       ELSE '{}'::jsonb END
  || CASE WHEN nullif(btrim(image_url), '') IS NOT NULL
       THEN jsonb_build_object('image_url', jsonb_build_object('by', 'user', 'at', now()))
       ELSE '{}'::jsonb END
WHERE enrichment = '{}'::jsonb;

-- Assert: no filled field is left without provenance, and no empty field
-- carries one. Either would let the backfill overwrite or skip wrongly.
DO $$
DECLARE
  unstamped integer;
  ghost integer;
  n_desc integer;
  n_video integer;
  n_image integer;
BEGIN
  SELECT count(*) INTO unstamped FROM public.exercises
  WHERE (nullif(btrim(description), '') IS NOT NULL AND NOT (enrichment ? 'description'))
     OR (nullif(btrim(video_url), '') IS NOT NULL AND NOT (enrichment ? 'video_url'))
     OR (nullif(btrim(image_url), '') IS NOT NULL AND NOT (enrichment ? 'image_url'));
  IF unstamped > 0 THEN
    RAISE EXCEPTION 'exercise_enrichment: % rows have a filled field with no provenance', unstamped;
  END IF;

  SELECT count(*) INTO ghost FROM public.exercises
  WHERE (nullif(btrim(description), '') IS NULL AND enrichment ? 'description')
     OR (nullif(btrim(video_url), '') IS NULL AND enrichment ? 'video_url')
     OR (nullif(btrim(image_url), '') IS NULL AND enrichment ? 'image_url');
  IF ghost > 0 THEN
    RAISE EXCEPTION 'exercise_enrichment: % rows carry provenance for an empty field', ghost;
  END IF;

  SELECT count(*) FILTER (WHERE enrichment ? 'description'),
         count(*) FILTER (WHERE enrichment ? 'video_url'),
         count(*) FILTER (WHERE enrichment ? 'image_url')
    INTO n_desc, n_video, n_image
  FROM public.exercises;
  RAISE NOTICE 'exercise_enrichment seeded by=user: % descriptions, % videos, % images', n_desc, n_video, n_image;
END $$;
