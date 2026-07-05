-- Fix get_movement_tier function to use public schema prefix
-- The empty search_path was causing "relation exercises does not exist" errors

CREATE OR REPLACE FUNCTION "public"."get_movement_tier"("exercise_id_param" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
WITH RECURSIVE movement_hierarchy AS (
  -- Base case: the movement itself
  SELECT
    id,
    parent_exercise_id,
    0 AS depth
  FROM public.exercises
  WHERE id = exercise_id_param

  UNION ALL

  -- Recursive case: traverse up to parent
  SELECT
    e.id,
    e.parent_exercise_id,
    mh.depth + 1
  FROM public.exercises e
  INNER JOIN movement_hierarchy mh ON e.id = mh.parent_exercise_id
)
SELECT MAX(depth) FROM movement_hierarchy;
$$;

COMMENT ON FUNCTION "public"."get_movement_tier"("exercise_id_param" "uuid") IS 'Computes the tier/depth of a movement in the hierarchy (0 = core, 1-4 = variation tiers)';


-- Fix validate_movement_depth trigger function
CREATE OR REPLACE FUNCTION "public"."validate_movement_depth"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only validate if parent_exercise_id is being set
  IF NEW.parent_exercise_id IS NOT NULL THEN
    -- Check if adding this movement would exceed max depth
    IF public.get_movement_tier(NEW.parent_exercise_id) >= 4 THEN
      RAISE EXCEPTION 'Movement hierarchy depth cannot exceed 4 tiers (current parent is at tier 4)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- Fix prevent_circular_reference trigger function
CREATE OR REPLACE FUNCTION "public"."prevent_circular_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only check if parent_exercise_id is being set
  IF NEW.parent_exercise_id IS NOT NULL THEN
    -- Check if the new parent would create a circular reference
    -- by checking if NEW.id appears anywhere in the ancestor chain of NEW.parent_exercise_id
    IF EXISTS (
      WITH RECURSIVE descendants AS (
        -- Start with the parent's children (excluding self)
        SELECT id, parent_exercise_id
        FROM public.exercises
        WHERE parent_exercise_id = NEW.id

        UNION ALL

        -- Recursive: children of children
        SELECT e.id, e.parent_exercise_id
        FROM public.exercises e
        INNER JOIN descendants d ON e.parent_exercise_id = d.id
      )
      SELECT 1 FROM descendants WHERE id = NEW.parent_exercise_id
    ) THEN
      RAISE EXCEPTION 'Cannot set parent - would create circular reference in movement hierarchy';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
