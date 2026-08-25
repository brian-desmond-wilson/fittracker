-- 20260825150000_identity_engine.sql
-- Fingerprint, generated name, machine-derived parent and tier. Spec: "Option C".

-- Sorted identity attribute values for an exercise.
CREATE OR REPLACE FUNCTION exercise_identity_attrs(p_id UUID) RETURNS UUID[]
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(array_agg(v ORDER BY v), '{}') FROM (
    SELECT e.load_position_id AS v FROM exercises e WHERE e.id = p_id AND e.load_position_id IS NOT NULL
    UNION ALL SELECT e.stance_id       FROM exercises e WHERE e.id = p_id AND e.stance_id IS NOT NULL
    UNION ALL SELECT e.range_depth_id  FROM exercises e WHERE e.id = p_id AND e.range_depth_id IS NOT NULL
    UNION ALL SELECT e.symmetry_id     FROM exercises e WHERE e.id = p_id AND e.symmetry_id IS NOT NULL
    UNION ALL SELECT ee.equipment_id   FROM exercise_equipment ee WHERE ee.exercise_id = p_id
    UNION ALL SELECT ems.movement_style_id
              FROM exercise_movement_styles ems
              JOIN movement_styles ms ON ms.id = ems.movement_style_id AND ms.is_identity
              WHERE ems.exercise_id = p_id
  ) s(v);
$$;

-- Generated name: non-empty fragments of identity values, by name_order, + core noun.
CREATE OR REPLACE FUNCTION generate_exercise_name(p_id UUID) RETURNS TEXT
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_core UUID; v_noun TEXT; v_lp UUID; v_implied UUID; v_frags TEXT;
BEGIN
  SELECT core_movement_id, load_position_id INTO v_core, v_lp FROM exercises WHERE id = p_id;
  IF v_core IS NULL THEN
    RETURN (SELECT name FROM exercises WHERE id = p_id);      -- outliers keep their name
  END IF;
  SELECT name INTO v_noun FROM exercises WHERE id = v_core;
  IF v_core = p_id THEN RETURN v_noun; END IF;                -- core row IS the noun
  SELECT implies_equipment_id INTO v_implied FROM load_positions WHERE id = v_lp;

  SELECT string_agg(f.frag, ' ' ORDER BY f.ord, f.frag) INTO v_frags FROM (
    SELECT lp.name_fragment AS frag, lp.name_order AS ord
      FROM exercises e JOIN load_positions lp ON lp.id = e.load_position_id WHERE e.id = p_id
    UNION ALL
    SELECT st.name_fragment, st.name_order
      FROM exercises e JOIN stances st ON st.id = e.stance_id WHERE e.id = p_id
    UNION ALL
    SELECT rd.name_fragment, rd.name_order
      FROM exercises e JOIN range_depths rd ON rd.id = e.range_depth_id WHERE e.id = p_id
    UNION ALL
    SELECT sy.name_fragment, sy.name_order
      FROM exercises e JOIN symmetries sy ON sy.id = e.symmetry_id WHERE e.id = p_id
    UNION ALL
    SELECT ms.name_fragment, ms.name_order
      FROM exercise_movement_styles ems JOIN movement_styles ms
        ON ms.id = ems.movement_style_id AND ms.is_identity
      WHERE ems.exercise_id = p_id
    UNION ALL
    SELECT q.name_fragment, q.name_order
      FROM exercise_equipment ee JOIN equipment q ON q.id = ee.equipment_id
      WHERE ee.exercise_id = p_id
        AND (v_implied IS NULL OR q.id <> v_implied)          -- the suppression rule
  ) f WHERE f.frag IS NOT NULL AND f.frag <> '';

  RETURN trim(concat_ws(' ', v_frags, v_noun));
END $$;

-- Recompute one exercise's derived state. Called by triggers; safe to call directly.
-- SECURITY DEFINER: identity maintenance is a system invariant — it must run even when the
-- calling session is an RLS-restricted app role (whose UPDATE on exercises would silently no-op).
CREATE OR REPLACE FUNCTION recompute_exercise_identity(p_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_core UUID; v_is_core BOOLEAN; v_attrs UUID[]; v_parent UUID; v_ptier INTEGER; v_gen TEXT;
BEGIN
  -- Serialize concurrent recomputes of the same exercise: without this, two sessions each
  -- adding a junction row read a partial attribute set and the last write wins (lost update).
  PERFORM 1 FROM exercises WHERE id = p_id FOR UPDATE;
  SELECT core_movement_id, is_core INTO v_core, v_is_core FROM exercises WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_attrs := exercise_identity_attrs(p_id);
  v_gen := generate_exercise_name(p_id);

  IF v_is_core OR v_core IS NULL THEN
    v_parent := NULL;                                          -- cores and outliers have no parent
  ELSE
    SELECT c.id, c.tier INTO v_parent, v_ptier
    FROM exercises c
    WHERE c.core_movement_id = v_core AND c.id <> p_id
      AND exercise_identity_attrs(c.id) <@ v_attrs
      AND cardinality(exercise_identity_attrs(c.id)) < cardinality(v_attrs)
    ORDER BY cardinality(exercise_identity_attrs(c.id)) DESC, c.created_at ASC
    LIMIT 1;
    IF v_parent IS NULL THEN v_parent := v_core; v_ptier := 0; END IF;
  END IF;

  UPDATE exercises SET
    identity_fingerprint = CASE WHEN v_core IS NULL THEN NULL ELSE array_to_string(v_attrs, '|') END,
    -- Rows with no core movement keep their existing hand-set parent: the legacy hierarchy
    -- (19 live rows) must survive untouched until the Stage 3 catalog pass assigns cores —
    -- wiping it here would visibly flatten the app's hierarchy screen (zero-visible-change rule).
    parent_exercise_id   = CASE WHEN v_is_core THEN NULL
                                WHEN v_core IS NULL THEN parent_exercise_id
                                ELSE v_parent END,
    tier = CASE WHEN v_is_core THEN 0 WHEN v_core IS NULL THEN NULL ELSE COALESCE(v_ptier, 0) + 1 END,
    generated_name = v_gen,
    name = CASE WHEN name_is_custom OR v_core IS NULL THEN name ELSE v_gen END,
    updated_at = now()
  WHERE id = p_id;

  -- Sync the generated alias; a cross-exercise collision is skipped here — Stage 3's alias
  -- rebuild routes collisions to review. Never a crash.
  IF v_core IS NOT NULL AND v_gen IS NOT NULL AND v_gen <> '' THEN
    -- Drop stale generated aliases first: per-row junction triggers make every intermediate
    -- generated name an alias, and leaving that debris squats on names that rightfully
    -- belong to other exercises (their ON CONFLICT insert would silently lose).
    DELETE FROM exercise_aliases
    WHERE exercise_id = p_id AND kind = 'generated'
      AND alias_normalized <> normalize_alias(v_gen);
    BEGIN
      INSERT INTO exercise_aliases (exercise_id, alias, alias_normalized, kind, source)
      VALUES (p_id, v_gen, normalize_alias(v_gen), 'generated', 'seed')
      ON CONFLICT (alias_normalized) DO NOTHING;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;
END $$;

-- Triggers. Depth guard stops the UPDATE inside recompute from re-firing itself.
CREATE OR REPLACE FUNCTION trg_exercise_identity() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  PERFORM recompute_exercise_identity(NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS exercises_identity_recompute ON exercises;
CREATE TRIGGER exercises_identity_recompute
  AFTER INSERT OR UPDATE OF core_movement_id, is_core, load_position_id, stance_id,
    range_depth_id, symmetry_id, name_is_custom ON exercises
  FOR EACH ROW EXECUTE FUNCTION trg_exercise_identity();

CREATE OR REPLACE FUNCTION trg_junction_identity() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  v_id := COALESCE(NEW.exercise_id, OLD.exercise_id);
  IF pg_trigger_depth() <= 1 THEN PERFORM recompute_exercise_identity(v_id); END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS exercise_equipment_identity ON exercise_equipment;
CREATE TRIGGER exercise_equipment_identity
  AFTER INSERT OR UPDATE OR DELETE ON exercise_equipment
  FOR EACH ROW EXECUTE FUNCTION trg_junction_identity();
DROP TRIGGER IF EXISTS exercise_styles_identity ON exercise_movement_styles;
CREATE TRIGGER exercise_styles_identity
  AFTER INSERT OR UPDATE OR DELETE ON exercise_movement_styles
  FOR EACH ROW EXECUTE FUNCTION trg_junction_identity();

-- Pin search_path on the three earlier-branch functions that predate this convention.
-- They live in earlier unshipped migrations on this same branch; ALTER here avoids
-- re-touching those files.
ALTER FUNCTION normalize_alias(TEXT) SET search_path = public;
ALTER FUNCTION enforce_alias_normalized() SET search_path = public;
ALTER FUNCTION enforce_raw_name_normalized() SET search_path = public;

-- Backfill: the migration must achieve its state, not just install machinery.
-- Idempotent — recompute derives the same state on a re-run. The recompute UPDATE touches
-- none of the trigger's UPDATE OF columns, so this does not cascade through the triggers.
DO $$
BEGIN
  PERFORM recompute_exercise_identity(id) FROM exercises;
END $$;

-- Self-verify (standing data-migration rule): assert the achieved state before the
-- transaction commits, with observed values in every failure message.
DO $$
DECLARE
  v_observed TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM exercises WHERE is_core AND (identity_fingerprint IS NULL OR tier IS DISTINCT FROM 0)) THEN
    SELECT string_agg(name || ' (fingerprint=' || COALESCE(identity_fingerprint, 'null')
                      || ', tier=' || COALESCE(tier::TEXT, 'null') || ')', '; ' ORDER BY name)
      INTO v_observed
      FROM exercises WHERE is_core AND (identity_fingerprint IS NULL OR tier IS DISTINCT FROM 0);
    RAISE EXCEPTION 'identity engine backfill FAIL: core rows without fingerprint/tier 0: %', v_observed;
  END IF;

  IF EXISTS (SELECT 1 FROM exercises WHERE core_movement_id IS NULL AND tier IS NOT NULL) THEN
    SELECT string_agg(name || ' (tier=' || tier::TEXT || ')', '; ' ORDER BY name) INTO v_observed
      FROM exercises WHERE core_movement_id IS NULL AND tier IS NOT NULL;
    RAISE EXCEPTION 'identity engine backfill FAIL: coreless rows with non-null tier: %', v_observed;
  END IF;

  IF EXISTS (SELECT 1 FROM exercises WHERE name_is_custom = false) THEN
    SELECT count(*)::TEXT INTO v_observed FROM exercises WHERE name_is_custom = false;
    RAISE EXCEPTION 'identity engine backfill FAIL: % rows with name_is_custom=false (expected 0 at migration time)', v_observed;
  END IF;
END $$;
