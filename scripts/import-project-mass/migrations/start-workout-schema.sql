-- Start Workout Feature - Schema Migration
-- Run against cloud Supabase (fittracker-db)

-- ============================================================
-- NEW TABLES
-- ============================================================

-- Gyms table
CREATE TABLE IF NOT EXISTS gyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'USA',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User preferences (including remembered gym)
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  current_gym_id UUID REFERENCES gyms(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Machine settings per user/gym/exercise
CREATE TABLE IF NOT EXISTS user_machine_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  gym_id UUID REFERENCES gyms(id) NOT NULL,
  exercise_id UUID REFERENCES exercises(id) NOT NULL,
  seat_position INTEGER,
  back_pad_position INTEGER,
  rack_height INTEGER,
  cable_height INTEGER,
  foot_plate_position INTEGER,
  grip_width_position INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, gym_id, exercise_id)
);

-- User profiles for AI suggestions
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE NOT NULL,
  
  -- Physical stats
  weight_lbs DECIMAL(5,1),
  goal_weight_lbs DECIMAL(5,1),
  height_inches INTEGER,
  date_of_birth DATE,
  gender TEXT, -- 'male', 'female', 'other', 'prefer_not_to_say'
  
  -- Fitness context
  training_experience TEXT, -- 'beginner', 'intermediate', 'advanced'
  primary_goal TEXT, -- 'strength', 'hypertrophy', 'fat_loss', 'general_fitness'
  
  -- Injuries/limitations (JSONB for flexibility)
  injuries JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ALTER EXISTING TABLES
-- ============================================================

-- workout_instances: add gym tracking
ALTER TABLE workout_instances 
ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES gyms(id);

-- set_instances: add difficulty and rest tracking
ALTER TABLE set_instances 
ADD COLUMN IF NOT EXISTS difficulty TEXT; -- e, em, m, mh, h, vh

ALTER TABLE set_instances 
ADD COLUMN IF NOT EXISTS increase_weight_next BOOLEAN DEFAULT FALSE; -- the ^ flag

ALTER TABLE set_instances 
ADD COLUMN IF NOT EXISTS rest_duration_seconds INTEGER;

ALTER TABLE set_instances 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- exercise_instances: add execution order and difficulty
ALTER TABLE exercise_instances 
ADD COLUMN IF NOT EXISTS execution_order INTEGER;

ALTER TABLE exercise_instances 
ADD COLUMN IF NOT EXISTS difficulty TEXT;

ALTER TABLE exercise_instances 
ADD COLUMN IF NOT EXISTS increase_weight_next BOOLEAN DEFAULT FALSE;

ALTER TABLE exercise_instances 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- workout_instances: add overall difficulty (may already exist as difficulty_rating)
ALTER TABLE workout_instances 
ADD COLUMN IF NOT EXISTS difficulty TEXT;

ALTER TABLE workout_instances 
ADD COLUMN IF NOT EXISTS increase_weight_next BOOLEAN DEFAULT FALSE;

ALTER TABLE workout_instances 
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE workout_instances
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE workout_instances
ADD COLUMN IF NOT EXISTS total_rest_seconds INTEGER;

-- program_workout_exercises: add superset grouping
ALTER TABLE program_workout_exercises 
ADD COLUMN IF NOT EXISTS superset_group INTEGER; -- NULL = not superset, same number = grouped

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_gyms_created_by ON gyms(created_by);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_machine_settings_user_gym ON user_machine_settings(user_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_instances_gym_id ON workout_instances(gym_id);
CREATE INDEX IF NOT EXISTS idx_exercise_instances_execution_order ON exercise_instances(execution_order);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on new tables
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_machine_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Gyms: users can see all gyms, but only edit their own
CREATE POLICY "Users can view all gyms" ON gyms FOR SELECT USING (true);
CREATE POLICY "Users can create gyms" ON gyms FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own gyms" ON gyms FOR UPDATE USING (auth.uid() = created_by);

-- User preferences: users can only access their own
CREATE POLICY "Users can view own preferences" ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON user_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Machine settings: users can only access their own
CREATE POLICY "Users can view own machine settings" ON user_machine_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own machine settings" ON user_machine_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own machine settings" ON user_machine_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own machine settings" ON user_machine_settings FOR DELETE USING (auth.uid() = user_id);

-- User profiles: users can only access their own
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- DONE
-- ============================================================
