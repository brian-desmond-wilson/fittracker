-- What a session was composed from, so a rerolled block survives. 2026-08-18.
--
-- The Today tab recomposes any session still `suggested`, on every load. That
-- is right for a plan nothing has touched — the check-in or the gym may have
-- changed under it — but it also silently undoes a per-block reroll (spec §6),
-- because recomposition rewrites the block rows from the same cached answer.
--
-- The fix is for the client to recognise its own work: the compose inputs are
-- hashed into a signature, and a stored session already carrying that exact
-- signature is shown as stored rather than rebuilt. Change the inputs and the
-- signature changes with them, so a new day still composes.
--
-- NULL means "not known to have been composed from anything" — every session
-- written before this column, every workout adopted whole, and, deliberately,
-- every session whose save failed partway. saveGeneratedSession stamps this
-- LAST, after the items and blocks have landed, so a partial write leaves the
-- signature null and the next load repairs it. A default would break that:
-- it would make an unfinished session look finished, and nothing would ever
-- recompose it.
ALTER TABLE public.generated_sessions
  ADD COLUMN IF NOT EXISTS compose_signature TEXT;

COMMENT ON COLUMN public.generated_sessions.compose_signature IS
  'The inputs this session was composed from. Written last, so NULL means the compose never finished and the session is still recomposable. A reroll leaves it alone — it modifies a plan built from these inputs, it does not compose a new one.';
