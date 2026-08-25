-- Add "Feed the Dog" task to existing morning routine templates
-- This will add the task between "Walk the Dog" (order_index 3) and "Quick Breakfast" (order_index 4)

-- First, update order_index for tasks that come after the new task
UPDATE morning_routine_tasks
SET order_index = order_index + 1
WHERE title IN ('Quick Breakfast', 'Pack for Gym')
  AND order_index >= 4;

-- Insert the new "Feed the Dog" task for all existing templates
INSERT INTO morning_routine_tasks (
  template_id,
  title,
  description,
  order_index,
  estimated_minutes,
  is_required,
  task_type,
  checklist_items
)
SELECT
  template_id,
  'Feed the Dog',
  'Feed your dog breakfast',
  4,
  3,
  false,
  'simple',
  NULL
FROM morning_routine_tasks
WHERE title = 'Walk the Dog'
ON CONFLICT DO NOTHING;
