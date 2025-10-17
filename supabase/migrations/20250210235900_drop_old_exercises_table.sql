-- Drop old exercises table that was used for a different feature
-- This table is being replaced by the new training program schema

DROP TABLE IF EXISTS public.exercises CASCADE;
