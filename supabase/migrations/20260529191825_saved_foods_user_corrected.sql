-- Tracks whether a saved_food's nutrition values have been corrected
-- by the user (typically after a barcode scan returned wrong data, e.g.,
-- Open Food Facts reporting per-100g values as per-serving). When true,
-- the preview shows an "(edited)" pill so the user knows the data is
-- their own correction, not vendor data.

ALTER TABLE public.saved_foods
  ADD COLUMN user_corrected BOOLEAN NOT NULL DEFAULT false;
