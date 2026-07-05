-- ============================================================================
-- Add Admin Delete Policy for Exercises
-- Allows admins to delete any movement (official or custom)
-- ============================================================================

-- Drop existing policy (we'll recreate it with admin support)
DROP POLICY IF EXISTS "Users can delete own custom exercises" ON exercises;

-- Recreate policy with admin support
-- Users can delete movements if:
-- 1. They are an admin (can delete any movement), OR
-- 2. They created the movement AND it's not official
CREATE POLICY "Users can delete own custom exercises or admins can delete any"
  ON exercises FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
    OR
    (created_by = auth.uid() AND is_official = false)
  );
