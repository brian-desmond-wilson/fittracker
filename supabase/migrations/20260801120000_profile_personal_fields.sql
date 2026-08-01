-- Static personal facts for the Profile page's Personal Details card
-- (spec: docs/superpowers/specs/2026-08-01-goals-restructure-design.md).
-- All nullable, no backfill. Current weight deliberately NOT added here —
-- it is derived from the latest weight_logs row.
ALTER TABLE public.profiles
  ADD COLUMN birthdate DATE,
  ADD COLUMN sex TEXT CHECK (sex IN ('male', 'female')),
  ADD COLUMN health_notes TEXT;
