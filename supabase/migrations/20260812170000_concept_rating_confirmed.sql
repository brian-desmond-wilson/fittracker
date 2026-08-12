-- Whether a taste rating is the owner's opinion or our guess. 2026-08-12.
--
-- `food_concepts.rating` is NOT NULL, so every concept has always had one —
-- including the ones nobody has ever expressed a view about. The delivery
-- writer seeds new dishes at 'like' because the column demands a value, and
-- the Brian Score then weights taste at 22/30 off that guess as confidently
-- as it would off a real preference.
--
-- The score is 30% taste. Guessing a third of it and never asking is the
-- quiet reason the recommender's ranking is less personal than it looks.
--
-- This column does not change any rating. It records whether one was ever
-- CONFIRMED, so the app can ask about the ones it invented — once, at the
-- moment the answer is easiest to give, which is straight after eating the
-- thing. Null on every existing row, because none of them were confirmed
-- through an interface that did not exist.
ALTER TABLE public.food_concepts
  ADD COLUMN IF NOT EXISTS rating_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.food_concepts.rating_confirmed_at IS
  'When the owner last confirmed this concept''s rating by hand. Null means the rating is a default or an import — usable, but never asked about.';
