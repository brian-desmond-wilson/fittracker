-- enrich_fill: the one write the enrichment pipeline makes, as a single
-- conditional UPDATE so that "human edits always win" (spec §5) holds under
-- concurrency, not only against the snapshot the function read.
--
-- Before this, enrich-exercise loaded a row (a sweep loads every row once,
-- then works through a batch for minutes), decided a field was fillable, and
-- wrote `{[field]: value, enrichment: {...snapshot, [field]: stamp}}`. A person
-- editing the same row in the wizard in between lost both their value and
-- their by="user" stamp to the stale snapshot. Here the fillable test runs in
-- the same statement as the write, against the row as it is NOW:
--
--   * the column must still be null/blank AND its provenance must not be
--     "user" — otherwise no row matches and 0 comes back, which the caller
--     reads as "someone filled or claimed it since we planned";
--   * p_force (the image regenerate, the one permitted overwrite) skips that
--     test but still MERGES the stamp with `||` rather than replacing the
--     object, so the other fields' stamps — user ones included — are never
--     lost.
--
-- Returns the number of rows written: 1 or 0. Any other field name or
-- provenance value is a programming error and raises.
-- Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §5, §8
CREATE OR REPLACE FUNCTION public.enrich_fill(
  p_id uuid, p_field text, p_value text, p_by text, p_force boolean DEFAULT false
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_field NOT IN ('description', 'video_url', 'image_url') THEN
    RAISE EXCEPTION 'enrich_fill: % is not an enrichable field', p_field;
  END IF;
  IF p_by NOT IN ('extraction', 'model', 'capture') THEN
    RAISE EXCEPTION 'enrich_fill: % is not a pipeline provenance', p_by;
  END IF;

  EXECUTE format(
    'UPDATE public.exercises
        SET %1$I = $1,
            enrichment = enrichment
              || jsonb_build_object($2::text, jsonb_build_object(''by'', $3::text, ''at'', now()))
      WHERE id = $4
        AND ($5 OR (nullif(btrim(%1$I), '''') IS NULL
                    AND coalesce(enrichment -> $2::text ->> ''by'', '''') <> ''user''))',
    p_field)
  USING p_value, p_field, p_by, p_id, p_force;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

COMMENT ON FUNCTION public.enrich_fill(uuid, text, text, text, boolean) IS
  'Conditional fill of one enrichable exercise field plus its provenance stamp. Writes only when the field is still blank and not by="user" (p_force skips that test for the image regenerate). Returns rows written: 0 means a human got there first.';

-- Default privileges hand every new function to anon and authenticated, which
-- would expose this as POST /rest/v1/rpc/enrich_fill to any client — a way to
-- stamp pipeline provenance over catalog rows from a phone. Only the edge
-- functions (service role) may call it.
REVOKE ALL ON FUNCTION public.enrich_fill(uuid, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enrich_fill(uuid, text, text, text, boolean) TO service_role;

-- Self-verify: the ACL is what the comment above promises.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.enrich_fill(uuid, text, text, text, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.enrich_fill(uuid, text, text, text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'enrich_fill: still executable by an API role';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.enrich_fill(uuid, text, text, text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'enrich_fill: service_role cannot execute';
  END IF;
END $$;
