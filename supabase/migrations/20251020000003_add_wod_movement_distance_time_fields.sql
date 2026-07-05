-- ============================================================================
-- Add distance and time fields to wod_movements table
-- Supports movements that are scored by distance (meters) or time (seconds)
-- ============================================================================

ALTER TABLE wod_movements
  ADD COLUMN IF NOT EXISTS rx_distance DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS rx_time INTEGER,
  ADD COLUMN IF NOT EXISTS l2_distance DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS l2_time INTEGER,
  ADD COLUMN IF NOT EXISTS l1_distance DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS l1_time INTEGER;

-- Add comments to clarify field usage
COMMENT ON COLUMN wod_movements.rx_distance IS 'Distance in meters for Rx scaling (e.g., 400m run)';
COMMENT ON COLUMN wod_movements.rx_time IS 'Time in seconds for Rx scaling (e.g., 60s plank hold)';
COMMENT ON COLUMN wod_movements.l2_distance IS 'Distance in meters for L2 scaling';
COMMENT ON COLUMN wod_movements.l2_time IS 'Time in seconds for L2 scaling';
COMMENT ON COLUMN wod_movements.l1_distance IS 'Distance in meters for L1 scaling';
COMMENT ON COLUMN wod_movements.l1_time IS 'Time in seconds for L1 scaling';
