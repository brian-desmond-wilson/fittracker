ALTER TABLE public.profiles
  ADD COLUMN target_water_oz INTEGER NOT NULL DEFAULT 64
  CHECK (target_water_oz > 0);
