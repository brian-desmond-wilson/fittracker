-- What the decrement ACTUALLY took. 2026-08-12.
--
-- `meal_logs.inventory_items` records what a log CLAIMED against inventory,
-- written before the consume RPC runs. A row can therefore claim a unit that
-- was never taken — a failed `consume_inventory_units`, or a stale-read race
-- in resolution — and the consumption estimator, which reads those claims,
-- inherits the error: phantom units inflate the rate and deflate "days until
-- out". `consumptionRate.ts` documents this as bias (4) and says plainly that
-- there is "no cheap fix: actual decrements aren't persisted anywhere this lib
-- could read instead".
--
-- This is that place. The RPC already RETURNS the ids it truly decremented;
-- the client was discarding them after using them for undo. Storing them
-- makes the honest history available to every future reader.
--
-- Additive and nullable, with three distinguishable states:
--   NULL          — written before this column existed, or by a path that does
--                   not decrement. Unknown, and must not be read as "nothing".
--   '[]'          — the decrement ran and took nothing.
--   '["id", ...]' — exactly what came off the shelf.
--
-- Deliberately NOT a backfill from `inventory_items`: that would manufacture
-- the very confirmation this column exists to distinguish from a claim.
ALTER TABLE public.meal_logs
  ADD COLUMN IF NOT EXISTS consumed_inventory_ids JSONB;

COMMENT ON COLUMN public.meal_logs.consumed_inventory_ids IS
  'Inventory ids the consume RPC confirmed it decremented for this log. NULL = unknown (pre-column or non-decrementing path); [] = ran and took nothing. Distinct from inventory_items, which records intent.';
