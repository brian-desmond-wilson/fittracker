-- Replacing a meal's categories has to be ONE transaction.
--
-- The set is constrained twice — at least one category, and `emergency` only
-- alone — and both are checked by a deferred constraint trigger at COMMIT.
-- From the client, a delete and an insert are two separate HTTP calls and so
-- two separate transactions: the delete would commit an empty set and be
-- refused, and an insert-first ordering would commit a union that can hold
-- `emergency` alongside what it is replacing. Neither ordering works from
-- outside; inside one function body, the intermediate state is never committed
-- and the trigger sees only the final set.
--
-- SECURITY INVOKER (the default): RLS still applies, so this can only ever
-- rewrite the caller's own meal. The `user_id` written comes from the meal row
-- itself rather than from the client.

CREATE OR REPLACE FUNCTION public.set_meal_categories(
  p_meal_id uuid,
  p_categories text[]
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  owner uuid;
BEGIN
  IF array_length(p_categories, 1) IS NULL THEN
    RAISE EXCEPTION 'a meal must be filed under at least one category';
  END IF;

  -- RLS-filtered: a meal that is not the caller's is simply not found here.
  SELECT user_id INTO owner FROM public.meals WHERE id = p_meal_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'meal not found';
  END IF;

  DELETE FROM public.meal_categories
    WHERE meal_id = p_meal_id
      AND category <> ALL (p_categories);

  INSERT INTO public.meal_categories (meal_id, user_id, category)
  SELECT p_meal_id, owner, c FROM unnest(p_categories) AS c
  ON CONFLICT (meal_id, category) DO NOTHING;

  -- The primary category — what the default logging slot reads — is the first
  -- one given. Callers pass the set with the primary at its head, so an
  -- unchanged head leaves this a no-op write.
  UPDATE public.meals SET category = p_categories[1], updated_at = now()
    WHERE id = p_meal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_meal_categories(uuid, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.set_meal_categories(uuid, text[]) TO authenticated;
