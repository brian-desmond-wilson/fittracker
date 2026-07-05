-- Create morning_routine_templates table
CREATE TABLE IF NOT EXISTS morning_routine_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  target_completion_time TIME, -- Target time to complete routine (e.g., 7:00 AM)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create partial unique index to ensure only one default template per user
CREATE UNIQUE INDEX idx_one_default_template_per_user
  ON morning_routine_templates(user_id)
  WHERE is_default = true;

-- Create morning_routine_tasks table
CREATE TABLE IF NOT EXISTS morning_routine_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES morning_routine_templates(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL, -- Order tasks appear in wizard
  estimated_minutes INTEGER NOT NULL, -- Estimated time to complete
  is_required BOOLEAN DEFAULT true, -- Can this task be skipped?
  task_type VARCHAR(50) DEFAULT 'simple', -- 'simple', 'checklist', 'weight_entry', 'medication'
  checklist_items JSONB, -- For checklist tasks: ["item1", "item2"]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for ordering tasks
CREATE INDEX idx_morning_routine_tasks_template_order ON morning_routine_tasks(template_id, order_index);

-- Create morning_routine_completions table (daily log)
CREATE TABLE IF NOT EXISTS morning_routine_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES morning_routine_templates(id) ON DELETE CASCADE,
  date DATE NOT NULL, -- Date of completion
  started_at TIMESTAMPTZ NOT NULL, -- When routine started
  completed_at TIMESTAMPTZ, -- When routine finished (null if not completed yet)
  total_minutes INTEGER, -- Actual time taken
  tasks_completed JSONB NOT NULL DEFAULT '[]', -- Array of completed task info: [{"task_id": "uuid", "completed_at": "timestamp", "skipped": false, "data": {}}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one routine per user per date
  UNIQUE(user_id, date)
);

-- Create index for faster queries
CREATE INDEX idx_morning_routine_completions_user_date ON morning_routine_completions(user_id, date DESC);

-- Enable RLS on all tables
ALTER TABLE morning_routine_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE morning_routine_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE morning_routine_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for morning_routine_templates
CREATE POLICY "Users can view their own routine templates"
  ON morning_routine_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own routine templates"
  ON morning_routine_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own routine templates"
  ON morning_routine_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own routine templates"
  ON morning_routine_templates FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for morning_routine_tasks
CREATE POLICY "Users can view tasks from their templates"
  ON morning_routine_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM morning_routine_templates
      WHERE morning_routine_templates.id = morning_routine_tasks.template_id
      AND morning_routine_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert tasks to their templates"
  ON morning_routine_tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM morning_routine_templates
      WHERE morning_routine_templates.id = morning_routine_tasks.template_id
      AND morning_routine_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tasks in their templates"
  ON morning_routine_tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM morning_routine_templates
      WHERE morning_routine_templates.id = morning_routine_tasks.template_id
      AND morning_routine_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tasks from their templates"
  ON morning_routine_tasks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM morning_routine_templates
      WHERE morning_routine_templates.id = morning_routine_tasks.template_id
      AND morning_routine_templates.user_id = auth.uid()
    )
  );

-- RLS Policies for morning_routine_completions
CREATE POLICY "Users can view their own routine completions"
  ON morning_routine_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own routine completions"
  ON morning_routine_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own routine completions"
  ON morning_routine_completions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own routine completions"
  ON morning_routine_completions FOR DELETE
  USING (auth.uid() = user_id);

-- Functions to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_morning_routine_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_morning_routine_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_morning_routine_completions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER morning_routine_templates_updated_at
  BEFORE UPDATE ON morning_routine_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_morning_routine_templates_updated_at();

CREATE TRIGGER morning_routine_tasks_updated_at
  BEFORE UPDATE ON morning_routine_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_morning_routine_tasks_updated_at();

CREATE TRIGGER morning_routine_completions_updated_at
  BEFORE UPDATE ON morning_routine_completions
  FOR EACH ROW
  EXECUTE FUNCTION update_morning_routine_completions_updated_at();
