-- One-off data fix: clear the cached Boost saved_food row so it can be
-- re-fetched from Open Food Facts with the new auto-scaling logic.
-- The original row was inserted before the auto_scaled migration and
-- carries the un-scaled per-100mL value (224 kcal) instead of the
-- per-serving 530 kcal. Idempotent: re-running deletes nothing.

DELETE FROM public.saved_foods
WHERE id = '50812254-413d-471a-9326-39c7109a692b';
