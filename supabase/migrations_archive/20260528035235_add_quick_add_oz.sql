ALTER TABLE public.profiles
  ADD COLUMN quick_add_oz INTEGER[] NOT NULL DEFAULT ARRAY[8, 12, 16, 20]
  CHECK (
    array_length(quick_add_oz, 1) BETWEEN 1 AND 6
    AND 0 < ALL(quick_add_oz)
  );
