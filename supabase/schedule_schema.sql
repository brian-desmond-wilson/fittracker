-- ======================
-- SCHEDULE FEATURE TABLES
-- ======================

-- Event Categories
CREATE TABLE event_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL, -- Hex color code
  icon TEXT, -- Icon name from lucide-react
  is_default BOOLEAN DEFAULT FALSE, -- System-provided categories
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schedule Events
CREATE TABLE schedule_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES event_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  start_time TIME NOT NULL, -- Time only (e.g., 09:15:00)
  end_time TIME NOT NULL, -- Time only (e.g., 09:45:00)
  date DATE, -- NULL for recurring events, specific date for one-time events
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_days INTEGER[], -- Days of week [0=Sun, 1=Mon, ..., 6=Sat], NULL = all days
  status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event Templates
CREATE TABLE event_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  category_id UUID REFERENCES event_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  default_duration_minutes INTEGER NOT NULL DEFAULT 30,
  is_system_template BOOLEAN DEFAULT FALSE, -- Pre-defined templates
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ======================
-- TRIGGERS
-- ======================

-- Apply update trigger to schedule_events table
CREATE TRIGGER update_schedule_events_updated_at
  BEFORE UPDATE ON schedule_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ======================
-- ROW LEVEL SECURITY
-- ======================

-- Enable RLS on all tables
ALTER TABLE event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_templates ENABLE ROW LEVEL SECURITY;

-- Event Categories Policies
CREATE POLICY "Users can view own categories and defaults"
  ON event_categories FOR SELECT
  USING (auth.uid() = user_id OR is_default = TRUE);

CREATE POLICY "Users can insert own categories"
  ON event_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON event_categories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories"
  ON event_categories FOR DELETE
  USING (auth.uid() = user_id AND is_default = FALSE);

-- Schedule Events Policies
CREATE POLICY "Users can view own events"
  ON schedule_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON schedule_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own events"
  ON schedule_events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own events"
  ON schedule_events FOR DELETE
  USING (auth.uid() = user_id);

-- Event Templates Policies
CREATE POLICY "Users can view own templates and system templates"
  ON event_templates FOR SELECT
  USING (auth.uid() = user_id OR is_system_template = TRUE);

CREATE POLICY "Users can insert own templates"
  ON event_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON event_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON event_templates FOR DELETE
  USING (auth.uid() = user_id AND is_system_template = FALSE);

-- ======================
-- INDEXES
-- ======================

-- Event Categories indexes
CREATE INDEX idx_event_categories_user_id ON event_categories(user_id);
CREATE INDEX idx_event_categories_is_default ON event_categories(is_default);

-- Schedule Events indexes
CREATE INDEX idx_schedule_events_user_id ON schedule_events(user_id);
CREATE INDEX idx_schedule_events_date ON schedule_events(date);
CREATE INDEX idx_schedule_events_is_recurring ON schedule_events(is_recurring);
CREATE INDEX idx_schedule_events_user_date ON schedule_events(user_id, date);
CREATE INDEX idx_schedule_events_status ON schedule_events(status);

-- Event Templates indexes
CREATE INDEX idx_event_templates_user_id ON event_templates(user_id);
CREATE INDEX idx_event_templates_is_system ON event_templates(is_system_template);

-- ======================
-- SEED DEFAULT CATEGORIES
-- ======================

-- Insert default categories (user_id is NULL for system defaults)
INSERT INTO event_categories (user_id, name, color, icon, is_default) VALUES
(NULL, 'Meals', '#22C55E', 'Utensils', TRUE),
(NULL, 'Exercise', '#F97316', 'Dumbbell', TRUE),
(NULL, 'Pet Care', '#3B82F6', 'Dog', TRUE),
(NULL, 'Work', '#8B5CF6', 'Briefcase', TRUE),
(NULL, 'Personal', '#EC4899', 'Heart', TRUE),
(NULL, 'Other', '#6B7280', 'Circle', TRUE);

-- ======================
-- SEED SYSTEM TEMPLATES
-- ======================

-- Get category IDs for system templates
DO $$
DECLARE
  meals_id UUID;
  exercise_id UUID;
  pet_id UUID;
  personal_id UUID;
BEGIN
  SELECT id INTO meals_id FROM event_categories WHERE name = 'Meals' AND is_default = TRUE LIMIT 1;
  SELECT id INTO exercise_id FROM event_categories WHERE name = 'Exercise' AND is_default = TRUE LIMIT 1;
  SELECT id INTO pet_id FROM event_categories WHERE name = 'Pet Care' AND is_default = TRUE LIMIT 1;
  SELECT id INTO personal_id FROM event_categories WHERE name = 'Personal' AND is_default = TRUE LIMIT 1;

  -- Insert system templates
  INSERT INTO event_templates (user_id, category_id, title, default_duration_minutes, is_system_template) VALUES
  (NULL, meals_id, 'Breakfast', 30, TRUE),
  (NULL, meals_id, 'Lunch', 45, TRUE),
  (NULL, meals_id, 'Dinner', 60, TRUE),
  (NULL, meals_id, 'Snack', 15, TRUE),
  (NULL, exercise_id, 'Workout', 60, TRUE),
  (NULL, exercise_id, 'Morning Run', 30, TRUE),
  (NULL, exercise_id, 'Yoga Session', 45, TRUE),
  (NULL, pet_id, 'Walk Murphy', 15, TRUE),
  (NULL, pet_id, 'Feed Murphy', 10, TRUE),
  (NULL, personal_id, 'Morning Routine', 30, TRUE),
  (NULL, personal_id, 'Evening Routine', 30, TRUE),
  (NULL, personal_id, 'Meditation', 20, TRUE);
END $$;
