-- Per-section time estimates for a generated session.
--
-- The composing model estimates how long each section takes, reasoning from
-- the sets and rests it just prescribed. That judgment cannot be recomputed on
-- a later read without asking again, so it is stored with the session and
-- replaced whenever the session regenerates.
--
-- Shape: {"warmup": 12, "main": 58, "accessory": 14, "cooldown": 6} — only the
-- sections that actually got work. Null on rows composed before this column
-- existed, and on a captured workout served whole; the client falls back to
-- deriving the estimate from the items it is already showing.
ALTER TABLE public.generated_sessions
  ADD COLUMN IF NOT EXISTS section_minutes jsonb;

COMMENT ON COLUMN public.generated_sessions.section_minutes IS
  'Whole minutes per session section, e.g. {"warmup":12,"main":58}. Null means no stored estimate; the client derives one from the items.';
