-- Inventory refinement Phase 2 (critique items B1/B2, feeds D4):
-- an append-only event trail for the two new inventory verbs, plus the
-- discard RPC that "toss it" calls.
--
-- Why a trail and not just quantity writes: the loop's Forecast learns
-- consumption ONLY from meal-log decrements today, which go dark whenever
-- concept links are missing. Explicit consume/discard events give the rate
-- estimator a second, link-independent signal (D4 wires it in), and discard
-- reasons become waste analytics for Shopping intelligence.
--
-- Append-only by policy: SELECT and INSERT only, no UPDATE/DELETE policies.
-- A mis-tap is corrected by a compensating event, not by editing history.

create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  food_inventory_id uuid not null references public.food_inventory(id) on delete cascade,
  kind text not null check (kind in ('consume', 'discard')),
  quantity integer not null check (quantity > 0),
  -- discard only; free text ("expired", "didn't like", "freezer burn").
  reason text,
  created_at timestamptz not null default now()
);

alter table public.inventory_events enable row level security;

create policy "inventory_events_select_own" on public.inventory_events
  for select using (auth.uid() = user_id);
create policy "inventory_events_insert_own" on public.inventory_events
  for insert with check (auth.uid() = user_id);

create index inventory_events_user_created_idx
  on public.inventory_events (user_id, created_at desc);
create index inventory_events_item_idx
  on public.inventory_events (food_inventory_id);

-- Discard: zero every location row for the item and resync the legacy
-- food_inventory.quantity cache, mirroring consume_inventory_units' contract
-- (20260729100100): security invoker so RLS scopes to the caller's rows;
-- returns the number of units discarded, and 0 conflates "already empty",
-- "no such row", and "not yours" — callers treat 0 as "nothing was moved".
-- Location-less rows fall back to the legacy quantity column, same as consume.
create or replace function public.discard_inventory_units(p_inventory_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer := 0;
begin
  if exists (select 1 from public.food_inventory_locations l
             where l.food_inventory_id = p_inventory_id) then
    select coalesce(sum(l.quantity), 0) into v_total
    from public.food_inventory_locations l
    where l.food_inventory_id = p_inventory_id;

    update public.food_inventory_locations
       set quantity = 0
     where food_inventory_id = p_inventory_id;

    update public.food_inventory fi
       set quantity = 0
     where fi.id = p_inventory_id;
  else
    select coalesce(fi.quantity, 0) into v_total
    from public.food_inventory fi
    where fi.id = p_inventory_id;

    update public.food_inventory fi
       set quantity = 0
     where fi.id = p_inventory_id;
  end if;

  return v_total;
end;
$$;
