-- Migration: 20260205000000_add_workout_completion_status.sql
-- Description: Add completion_status to workout_instances for partial workout support

-- Add completion_status column
-- NULL = not started or in progress
-- 'completed' = user finished entire workout
-- 'partial' = user stopped mid-workout, will continue tomorrow
ALTER TABLE workout_instances 
ADD COLUMN completion_status TEXT 
CHECK (completion_status IN ('completed', 'partial'));

-- Add index for common query pattern (finding latest workout by status)
CREATE INDEX idx_workout_instances_completion_status 
ON workout_instances (program_instance_id, performed_date DESC, completion_status)
WHERE completion_status IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN workout_instances.completion_status IS 
'Workout completion state: NULL=not started/in progress, completed=finished all exercises, partial=stopped mid-workout (continue tomorrow)';
