-- Per-exercise load prescription on a composed session's items. Free text:
-- the coach writes the whole scheme ("Ramp 15×8, 20×5, 24×3 → work 26 lb",
-- "25–30 lb, RPE 7–8 (no history)"). NULL when the coach said nothing about
-- load, which the app renders as nothing rather than a placeholder.
ALTER TABLE public.generated_session_items
  ADD COLUMN IF NOT EXISTS weight_note text;
