-- A captured workout gets a one-line description: what this workout IS, in a
-- sentence, so the page can say "a kettlebell full body strength session from
-- Dr. Colin" without replaying the caption the creator already wrote.
--
-- Distinct from the three texts already on the row:
--   raw_protocol  — the creator's prescription lines, verbatim
--   notes         — the owner's own note
--   (sources.caption_text) — the post's caption, archived as provenance
ALTER TABLE public.captured_workouts
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.captured_workouts.description IS
  'One-sentence summary of the workout, written at capture and editable after.';
