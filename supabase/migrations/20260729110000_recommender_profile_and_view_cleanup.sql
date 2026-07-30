-- Nutrition OS Phase 3: recommender settings + aggregation-path decision.
-- Spec: docs/superpowers/specs/2026-07-29-nutrition-recommender-design.md §9
--
-- eat_nudges_enabled: per-user setting = profiles attribute (kernel rule;
-- water_reminders_enabled / meal_reminders_enabled precedent). Default false
-- — nudges are opt-in from the Notifications screen.
--
-- View drops EXECUTE the standing pick-one aggregation decision (Concept Map
-- §18.2, audit D6): client-side math (sumNutrition/mealStats) is the adopted
-- path — it is live everywhere and carries all 7 nutrients — and these views
-- are consumed by nothing (verified by grep across mobile/src and mobile/app,
-- 2026-07-29) and stale (daily_nutrition_summary lacks sodium_mg/fiber_g).

alter table public.profiles
  add column if not exists eat_nudges_enabled boolean not null default false;

drop view if exists public.daily_nutrition_summary;
drop view if exists public.daily_water_summary;
