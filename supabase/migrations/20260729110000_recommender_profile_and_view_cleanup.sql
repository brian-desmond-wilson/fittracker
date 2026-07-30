-- Nutrition OS Phase 3: recommender settings + aggregation-path decision.
-- Spec: docs/superpowers/specs/2026-07-29-nutrition-recommender-design.md §9
-- Plan: docs/superpowers/plans/2026-07-29-nutrition-recommender.md (Tasks 4/11,
--   plus the execution amendments that record what was verified before apply)
--
-- eat_nudges_enabled: per-user setting = profiles attribute (kernel rule;
-- water_reminders_enabled / meal_reminders_enabled precedent). Default false,
-- because nudges are opt-in from the Notifications screen.
--
-- View drops EXECUTE the standing pick-one aggregation decision (Concept Map
-- §18.2, audit D6): client-side math (sumNutrition/mealStats) is the adopted
-- path — it is live everywhere and carries all 7 nutrients — and these views
-- are consumed by nothing (verified by grep across the whole repo, 2026-07-29:
-- no static reference, no dynamic .from()/.rpc() target, no dependent object)
-- and stale (daily_nutrition_summary lacks sodium_mg/fiber_g).
--
-- Dropping these destroys no rows — both are plain GROUP BY views over
-- meal_logs / water_logs. If D6 is ever reversed, the definitions are still in
-- git: 20250206_tracking_tables.sql:350,364 (re-created identically at
-- 20250208_complete_tracking_schema.sql:278,291), with their security_invoker
-- setting and comments at 20251031000001_fix_security_definer_views.sql:8-19.
-- No `cascade` here on purpose: an unforeseen dependent should fail the apply
-- loudly and roll the whole file back, not be silently taken down with it.

alter table public.profiles
  add column if not exists eat_nudges_enabled boolean not null default false;

drop view if exists public.daily_nutrition_summary;
drop view if exists public.daily_water_summary;
