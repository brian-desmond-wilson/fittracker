-- Add needs_review status to dev_tasks for PR review workflow
ALTER TABLE dev_tasks DROP CONSTRAINT IF EXISTS dev_tasks_status_check;
ALTER TABLE dev_tasks ADD CONSTRAINT dev_tasks_status_check 
  CHECK (status IN ('open', 'in_progress', 'needs_review', 'done'));

COMMENT ON CONSTRAINT dev_tasks_status_check ON dev_tasks IS 
  'Status workflow: open -> in_progress -> needs_review -> done';
