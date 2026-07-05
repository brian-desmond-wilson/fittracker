-- ============================================================================
-- Alter l2_reps and l1_reps to support both numbers and rep scheme patterns
-- Allows values like "15" (integer) or "15-12-9-6-3" (rep scheme pattern)
-- ============================================================================

-- Change l2_reps from INTEGER to TEXT
ALTER TABLE wod_movements
  ALTER COLUMN l2_reps TYPE TEXT USING l2_reps::TEXT;

-- Change l1_reps from INTEGER to TEXT
ALTER TABLE wod_movements
  ALTER COLUMN l1_reps TYPE TEXT USING l1_reps::TEXT;

-- Add comments to clarify usage
COMMENT ON COLUMN wod_movements.l2_reps IS 'L2 reps: can be a number (e.g., "15") or rep scheme pattern (e.g., "15-12-9" for descending scheme)';
COMMENT ON COLUMN wod_movements.l1_reps IS 'L1 reps: can be a number (e.g., "15") or rep scheme pattern (e.g., "15-12-9-6-3" for reduced descending scheme)';
