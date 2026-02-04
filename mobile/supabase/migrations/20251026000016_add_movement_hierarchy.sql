-- Migration: Add movement hierarchy system
-- Description: Adds is_core and parent_exercise_id columns to support Core/Variation movement classification
--              with unlimited depth (max 4 tiers) and attribute inheritance

-- Add hierarchy columns to exercises table
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS is_core BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL;

-- Add index for performance on parent lookups
CREATE INDEX IF NOT EXISTS idx_exercises_parent ON exercises(parent_exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercises_is_core ON exercises(is_core);

-- Function to compute movement tier/depth from root
-- Returns 0 for core movements (no parent), 1-4 for variations
CREATE OR REPLACE FUNCTION get_movement_tier(exercise_id_param UUID)
RETURNS INTEGER AS $$
WITH RECURSIVE movement_hierarchy AS (
  -- Base case: the movement itself
  SELECT
    id,
    parent_exercise_id,
    0 AS depth
  FROM exercises
  WHERE id = exercise_id_param

  UNION ALL

  -- Recursive case: traverse up to parent
  SELECT
    e.id,
    e.parent_exercise_id,
    mh.depth + 1
  FROM exercises e
  INNER JOIN movement_hierarchy mh ON e.id = mh.parent_exercise_id
)
SELECT MAX(depth) FROM movement_hierarchy;
$$ LANGUAGE SQL STABLE;

-- Function to validate depth limit (max 4 tiers = depth 4)
CREATE OR REPLACE FUNCTION validate_movement_depth()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if parent_exercise_id is being set
  IF NEW.parent_exercise_id IS NOT NULL THEN
    -- Check if adding this movement would exceed max depth
    IF get_movement_tier(NEW.parent_exercise_id) >= 4 THEN
      RAISE EXCEPTION 'Movement hierarchy depth cannot exceed 4 tiers (current parent is at tier 4)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to prevent circular references
CREATE OR REPLACE FUNCTION prevent_circular_reference()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if parent_exercise_id is being set
  IF NEW.parent_exercise_id IS NOT NULL THEN
    -- Check if the parent is a descendant of this movement (would create cycle)
    IF EXISTS (
      WITH RECURSIVE descendants AS (
        -- Base: direct children
        SELECT id, parent_exercise_id
        FROM exercises
        WHERE parent_exercise_id = NEW.id

        UNION ALL

        -- Recursive: children of children
        SELECT e.id, e.parent_exercise_id
        FROM exercises e
        INNER JOIN descendants d ON e.parent_exercise_id = d.id
      )
      SELECT 1 FROM descendants WHERE id = NEW.parent_exercise_id
    ) THEN
      RAISE EXCEPTION 'Cannot set parent - would create circular reference in movement hierarchy';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add constraint: core movements cannot have parents
ALTER TABLE exercises
  ADD CONSTRAINT check_core_no_parent
  CHECK (NOT (is_core = true AND parent_exercise_id IS NOT NULL));

-- Add triggers for validation
DROP TRIGGER IF EXISTS trigger_validate_movement_depth ON exercises;
CREATE TRIGGER trigger_validate_movement_depth
  BEFORE INSERT OR UPDATE ON exercises
  FOR EACH ROW
  EXECUTE FUNCTION validate_movement_depth();

DROP TRIGGER IF EXISTS trigger_prevent_circular_reference ON exercises;
CREATE TRIGGER trigger_prevent_circular_reference
  BEFORE INSERT OR UPDATE ON exercises
  FOR EACH ROW
  EXECUTE FUNCTION prevent_circular_reference();

-- Set all existing movements to is_core = false (as requested)
UPDATE exercises SET is_core = false WHERE is_core IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN exercises.is_core IS 'True if this is a core/base movement, false if it is a variation';
COMMENT ON COLUMN exercises.parent_exercise_id IS 'Reference to parent movement (for variations). NULL for core movements.';
COMMENT ON FUNCTION get_movement_tier(UUID) IS 'Computes the tier/depth of a movement in the hierarchy (0 = core, 1-4 = variation tiers)';
