-- Migration: Add workout_sessions table for split workout tracking
-- Date: 2026-02-06
-- Description: Enables tracking individual sessions within a workout instance
--              (e.g., Day 6 done across 2 days = 2 sessions)

-- ============================================================
-- 1. Create workout_sessions table
-- ============================================================

CREATE TABLE IF NOT EXISTS workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  workout_instance_id UUID NOT NULL REFERENCES workout_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Session info
  session_number INTEGER NOT NULL DEFAULT 1,
  session_date DATE NOT NULL,
  
  -- Timing
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER DEFAULT 0,
  
  -- Optional
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(workout_instance_id, session_number)
);

-- Table comment
COMMENT ON TABLE workout_sessions IS 'Individual sessions within a workout instance (for split workouts done across multiple days)';
COMMENT ON COLUMN workout_sessions.session_number IS 'Sequential session number within the workout (1, 2, 3...)';
COMMENT ON COLUMN workout_sessions.session_date IS 'The actual date this session was performed';
COMMENT ON COLUMN workout_sessions.duration_seconds IS 'How long this specific session took';

-- ============================================================
-- 2. Add workout_session_id to exercise_instances
-- ============================================================

ALTER TABLE exercise_instances 
ADD COLUMN IF NOT EXISTS workout_session_id UUID REFERENCES workout_sessions(id);

COMMENT ON COLUMN exercise_instances.workout_session_id IS 'Links exercise to specific session (for split workout tracking)';

-- ============================================================
-- 3. Enable RLS
-- ============================================================

ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can view own workout sessions" 
  ON workout_sessions FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can insert their own sessions
CREATE POLICY "Users can insert own workout sessions" 
  ON workout_sessions FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions
CREATE POLICY "Users can update own workout sessions" 
  ON workout_sessions FOR UPDATE 
  USING (auth.uid() = user_id);

-- Users can delete their own sessions
CREATE POLICY "Users can delete own workout sessions" 
  ON workout_sessions FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================================
-- 4. Indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_workout_sessions_instance 
  ON workout_sessions(workout_instance_id);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_date 
  ON workout_sessions(user_id, session_date);

CREATE INDEX IF NOT EXISTS idx_exercise_instances_session 
  ON exercise_instances(workout_session_id);

-- ============================================================
-- 5. Updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_workout_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workout_sessions_updated_at
  BEFORE UPDATE ON workout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_workout_sessions_updated_at();
