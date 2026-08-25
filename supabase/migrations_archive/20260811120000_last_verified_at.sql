-- Inventory refinement sweep D6: when did a human (or a confirmed capture)
-- last attest this row matches physical reality? Every verb that implies
-- someone looked at the item — consume, discard, restock, edit, capture
-- apply — bumps this. The staleness the 2026-08-11 audit found (a year-old
-- snapshot presenting as live data) becomes measurable instead of invisible.
alter table public.food_inventory
  add column if not exists last_verified_at timestamptz;

-- Seed: treat the last update as the last verification — honest lower bound.
update public.food_inventory
  set last_verified_at = updated_at
  where last_verified_at is null;
