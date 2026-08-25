-- Tracks whether a saved_food's nutrition values were auto-scaled by us
-- when persisting from Open Food Facts. Specifically: when OFF only had
-- per-100 g/mL data populated and we used the serving size to scale,
-- this flag is true. The auto-scaled and user_corrected flags are
-- independent — a food can be both (we scaled, then the user further
-- corrected) or either, or neither.

ALTER TABLE public.saved_foods
  ADD COLUMN auto_scaled BOOLEAN NOT NULL DEFAULT false;
