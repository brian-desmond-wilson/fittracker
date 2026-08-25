ALTER TABLE public.profiles
  ADD COLUMN water_window_start TIME NOT NULL DEFAULT '08:00',
  ADD COLUMN water_window_end TIME NOT NULL DEFAULT '23:00',
  ADD COLUMN water_workout_bonus_oz INTEGER NOT NULL DEFAULT 0
    CHECK (water_workout_bonus_oz >= 0),
  ADD COLUMN water_reminders_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN water_reminder_times TEXT[] NOT NULL
    DEFAULT ARRAY['08:00', '12:00', '16:00', '20:00']
    CHECK (
      array_length(water_reminder_times, 1) BETWEEN 1 AND 12
    );

ALTER TABLE public.profiles
  ADD CONSTRAINT water_window_valid CHECK (water_window_end > water_window_start);
