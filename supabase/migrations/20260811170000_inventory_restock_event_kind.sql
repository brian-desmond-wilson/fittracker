-- A fourth event kind: 'restock'.
--
-- The item page's new quantity stepper can go up as well as down, and "I
-- bought another one" is NOT the same event as "undo, I mis-tapped". They
-- move stock identically but mean opposite things to demand:
--
--   restore — cancels a consume that never really happened. The estimator
--             nets the pair out (netConsumeEvents), so an undone tap teaches
--             it nothing.
--   restock — real new stock arriving. It is not consumption at all, so the
--             estimator must never see it; the trail query selects only
--             'consume' and 'restore', which excludes it by construction.
--
-- Collapsing the two would have made every mis-tap correction look like a
-- grocery run, or every grocery run cancel a real meal.
--
-- Additive: widen the check, no drops, no rewrites. The quantity move itself
-- reuses restore_inventory_unit (20260811160000) — same arithmetic, different
-- meaning, recorded in the trail rather than in the RPC.

alter table public.inventory_events
  drop constraint if exists inventory_events_kind_check;
alter table public.inventory_events
  add constraint inventory_events_kind_check
  check (kind in ('consume', 'discard', 'restore', 'restock'));
