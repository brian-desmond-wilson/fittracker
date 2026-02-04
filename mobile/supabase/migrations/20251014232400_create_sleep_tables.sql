-- Create sleep_sessions table to track sleep cycles
CREATE TABLE IF NOT EXISTS sleep_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL, -- The date of the sleep session (date you woke up)
  bedtime TIMESTAMPTZ, -- When user went to bed (previous day)
  wake_time TIMESTAMPTZ NOT NULL, -- When user woke up
  total_hours DECIMAL(4,2), -- Calculated hours of sleep
  quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5), -- 1-5 rating
  notes TEXT,
  manually_entered BOOLEAN DEFAULT false, -- If bedtime was entered manually vs button press
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one sleep session per user per date
  UNIQUE(user_id, date)
);

-- Create index for faster queries
CREATE INDEX idx_sleep_sessions_user_date ON sleep_sessions(user_id, date DESC);
CREATE INDEX idx_sleep_sessions_bedtime ON sleep_sessions(bedtime);

-- Enable RLS
ALTER TABLE sleep_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sleep sessions"
  ON sleep_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sleep sessions"
  ON sleep_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sleep sessions"
  ON sleep_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sleep sessions"
  ON sleep_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sleep_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER sleep_sessions_updated_at
  BEFORE UPDATE ON sleep_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_sleep_sessions_updated_at();
