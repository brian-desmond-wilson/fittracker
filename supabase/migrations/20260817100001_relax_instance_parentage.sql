-- A generated daily session logs through the SAME instance chain as a program
-- workout — one history, no parallel logging system (spec §3.2). That requires
-- instances that belong to no program:
--
--   workout_instances.program_instance_id / program_workout_id  → nullable
--   exercise_instances.program_workout_exercise_id              → nullable
--
-- Integrity for daily rows is carried by generated_sessions.workout_instance_id
-- pointing at them (enforced app-side; a DB CHECK can't see across tables).
ALTER TABLE public.workout_instances
  ALTER COLUMN program_instance_id DROP NOT NULL,
  ALTER COLUMN program_workout_id DROP NOT NULL;

ALTER TABLE public.exercise_instances
  ALTER COLUMN program_workout_exercise_id DROP NOT NULL;

COMMENT ON COLUMN public.workout_instances.program_instance_id IS
  'NULL for standalone daily sessions (see generated_sessions.workout_instance_id).';
