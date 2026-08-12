-- Eating windows: the day's configured meal slots, the data model under Fuel.
--
-- The Fuel page (the renamed Meals & Snacks) plans the day as a sequence of
-- windows — breakfast 7–9, lunch 12–1:30, dinner 6–7:30 — and attributes every
-- meal_logs row to one of them. Until now the schedule was three point-in-time
-- columns on profiles (breakfast_time / lunch_time / dinner_time) sharing the
-- water window as its bounds. Points can't say "missed": a window has to close
-- before the plan may redistribute its calories.
--
-- Additive only. The profile columns stay: they remain the fallback the client
-- derives default windows from when this table has no rows for a user, and
-- TrackingSettingsScreen keeps editing them until the windows editor lands.
--
-- No seed rows on purpose — deriving defaults client-side from the profile
-- times means no migration has to guess a snack schedule for every user.

CREATE TABLE public.eating_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- What the rail calls the slot: "Breakfast", "Mid-morning", "Dinner".
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  -- Which meal_type a log in this window defaults to, and which meals suit it.
  -- Same vocabulary as meal_logs.meal_type.
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'dessert')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  -- Share of the day's calorie budget this window carries, as a weight, not a
  -- percentage: the engine normalises over the windows that remain open, so
  -- weights keep meaning even after one is missed. NULL = engine default for
  -- the meal_type.
  budget_weight NUMERIC(4, 2) CHECK (budget_weight > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT eating_windows_span CHECK (end_time > start_time),
  CONSTRAINT eating_windows_label_unique UNIQUE (user_id, label)
);

CREATE INDEX idx_eating_windows_user ON public.eating_windows (user_id, start_time);

ALTER TABLE public.eating_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eating_windows_select_own" ON public.eating_windows
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "eating_windows_insert_own" ON public.eating_windows
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "eating_windows_update_own" ON public.eating_windows
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "eating_windows_delete_own" ON public.eating_windows
  FOR DELETE USING (auth.uid() = user_id);
