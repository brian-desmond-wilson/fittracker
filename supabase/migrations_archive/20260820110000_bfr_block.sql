-- Daily Training Phase 3: the BFR finisher becomes a sixth block.
-- generated_session_items.section already allows 'bfr' (Phase 2 schema);
-- these two CHECKs were written when blocks had five roles.
--
-- Deliberately untouched: captured_workouts.block_roles (catalog workouts are
-- never tagged bfr — the finisher is built-in-only) and
-- session_adjustments.block (the finisher is rules-appended, not composed,
-- so there is nothing for an instruction to steer).
ALTER TABLE public.generated_session_blocks
  DROP CONSTRAINT IF EXISTS generated_session_blocks_block_check;
ALTER TABLE public.generated_session_blocks
  ADD CONSTRAINT generated_session_blocks_block_check
  CHECK (block IN ('warmup', 'mobility', 'main', 'conditioning', 'bfr', 'cooldown'));

ALTER TABLE public.captured_workout_usage
  DROP CONSTRAINT IF EXISTS captured_workout_usage_block_check;
ALTER TABLE public.captured_workout_usage
  ADD CONSTRAINT captured_workout_usage_block_check
  CHECK (block IN ('warmup', 'mobility', 'main', 'conditioning', 'bfr', 'cooldown'));
