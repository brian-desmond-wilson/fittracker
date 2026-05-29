-- Tier 3 meals: pace coaching (meal time targets) + meal reminders.
--
-- The waking-hours window is shared with water (water_window_start/end)
-- per Tier 3 spec, so no new window columns. We do add meal-time
-- targets (when the user typically eats each main meal) so the pace
-- coach can suggest catch-up amounts "by the next meal".

ALTER TABLE public.profiles
  ADD COLUMN breakfast_time TIME NOT NULL DEFAULT '08:00',
  ADD COLUMN lunch_time     TIME NOT NULL DEFAULT '12:00',
  ADD COLUMN dinner_time    TIME NOT NULL DEFAULT '18:00',
  ADD CONSTRAINT meal_times_valid
    CHECK (breakfast_time < lunch_time AND lunch_time < dinner_time);

-- Meal reminders: parallel arrays for times + meal_type, mirroring the
-- water_reminder_times pattern. Defaults to one per main meal so the
-- "Send Test Reminder" button works immediately after enable.
ALTER TABLE public.profiles
  ADD COLUMN meal_reminders_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN meal_reminder_times TEXT[] NOT NULL
    DEFAULT ARRAY['08:00', '12:00', '18:00']
    CHECK (
      array_length(meal_reminder_times, 1) BETWEEN 1 AND 12
    ),
  ADD COLUMN meal_reminder_types TEXT[] NOT NULL
    DEFAULT ARRAY['breakfast', 'lunch', 'dinner'];
