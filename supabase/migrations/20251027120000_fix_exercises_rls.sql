-- Fix RLS policy on exercises table to allow public read access
-- This ensures anonymous queries (like our test scripts) can read exercises

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Exercises are viewable by everyone" ON exercises;

-- Recreate policy to allow SELECT for all users (authenticated or not)
CREATE POLICY "Exercises are viewable by everyone"
  ON exercises FOR SELECT
  TO public
  USING (true);

-- Verify RLS is enabled
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
