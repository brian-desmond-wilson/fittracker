-- ============================================================================
-- Add "For Time" rep scheme support and gender-based weight scaling
-- Supports rep scheme types (descending, fixed_rounds, chipper, etc.)
-- Adds Men/Women weight differentiation for Rx/L2/L1 scaling
-- ============================================================================

-- ============================================================================
-- 1. Add rep scheme fields to wods table
-- ============================================================================

ALTER TABLE wods
  ADD COLUMN IF NOT EXISTS rep_scheme_type TEXT,
  ADD COLUMN IF NOT EXISTS rep_scheme TEXT,
  ADD COLUMN IF NOT EXISTS rep_scheme_rounds INTEGER;

-- Add check constraint for valid rep scheme types
ALTER TABLE wods
  DROP CONSTRAINT IF EXISTS wods_rep_scheme_type_check;

ALTER TABLE wods
  ADD CONSTRAINT wods_rep_scheme_type_check
  CHECK (rep_scheme_type IS NULL OR rep_scheme_type IN (
    'descending',
    'fixed_rounds',
    'chipper',
    'ascending',
    'distance',
    'custom'
  ));

-- Add comments to clarify field usage
COMMENT ON COLUMN wods.rep_scheme_type IS 'Type of rep scheme: descending (21-15-9), fixed_rounds (3 RFT), chipper (single pass), ascending (1-2-3-4-5), distance (2000m), custom';
COMMENT ON COLUMN wods.rep_scheme IS 'String representation of rep scheme (e.g., "21-18-15-12-9-6-3" or "3" for fixed rounds)';
COMMENT ON COLUMN wods.rep_scheme_rounds IS 'DEPRECATED: Number of rounds for fixed_rounds type (now stored in rep_scheme as string)';

-- ============================================================================
-- 2. Add gender-based weight fields to wod_movements table
-- ============================================================================

ALTER TABLE wod_movements
  -- Rx scaling - Men/Women split
  ADD COLUMN IF NOT EXISTS rx_weight_men_lbs DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS rx_weight_women_lbs DECIMAL(10, 2),

  -- L2 scaling - Men/Women split
  ADD COLUMN IF NOT EXISTS l2_weight_men_lbs DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS l2_weight_women_lbs DECIMAL(10, 2),

  -- L1 scaling - Men/Women split
  ADD COLUMN IF NOT EXISTS l1_weight_men_lbs DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS l1_weight_women_lbs DECIMAL(10, 2);

-- Add comments for deprecation notice
COMMENT ON COLUMN wod_movements.rx_weight_lbs IS 'DEPRECATED: Use rx_weight_men_lbs and rx_weight_women_lbs for gender-specific weights';
COMMENT ON COLUMN wod_movements.l2_weight_lbs IS 'DEPRECATED: Use l2_weight_men_lbs and l2_weight_women_lbs for gender-specific weights';
COMMENT ON COLUMN wod_movements.l1_weight_lbs IS 'DEPRECATED: Use l1_weight_men_lbs and l1_weight_women_lbs for gender-specific weights';

-- Add helpful comments for new columns
COMMENT ON COLUMN wod_movements.rx_weight_men_lbs IS 'Rx weight in pounds for men (e.g., 95 lbs for Thrusters)';
COMMENT ON COLUMN wod_movements.rx_weight_women_lbs IS 'Rx weight in pounds for women (e.g., 65 lbs for Thrusters)';
COMMENT ON COLUMN wod_movements.l2_weight_men_lbs IS 'L2 (scaled) weight in pounds for men';
COMMENT ON COLUMN wod_movements.l2_weight_women_lbs IS 'L2 (scaled) weight in pounds for women';
COMMENT ON COLUMN wod_movements.l1_weight_men_lbs IS 'L1 (beginner) weight in pounds for men';
COMMENT ON COLUMN wod_movements.l1_weight_women_lbs IS 'L1 (beginner) weight in pounds for women';

-- ============================================================================
-- 3. Migration helper: Copy existing weight data to men's column (optional)
-- ============================================================================

-- For backward compatibility, copy existing rx_weight_lbs to rx_weight_men_lbs
-- This assumes existing data was using men's weights as the default
-- Coaches can manually update women's weights after migration

UPDATE wod_movements
SET rx_weight_men_lbs = rx_weight_lbs
WHERE rx_weight_lbs IS NOT NULL AND rx_weight_men_lbs IS NULL;

UPDATE wod_movements
SET l2_weight_men_lbs = l2_weight_lbs
WHERE l2_weight_lbs IS NOT NULL AND l2_weight_men_lbs IS NULL;

UPDATE wod_movements
SET l1_weight_men_lbs = l1_weight_lbs
WHERE l1_weight_lbs IS NOT NULL AND l1_weight_men_lbs IS NULL;
