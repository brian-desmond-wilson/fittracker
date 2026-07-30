-- Nutrition OS Phase 4: locations become the ONLY stock truth.
-- Spec: docs/superpowers/specs/2026-07-29-nutrition-inventory-loop-design.md §6
--
-- (1) Reconcile: single-location items — the LEGACY column wins (it is what
--     the UI displayed); their location rows are replaced by one canonical
--     row. Multi-location items — LOCATIONS win; legacy column resynced.
--     Location-less items get their canonical row created. Idempotent in
--     effect: a re-run reproduces the same state.
-- (2) transfer_inventory_units: atomic restock transfer (replaces two
--     independent client UPDATEs). Loud failure on insufficient stock —
--     deliberately unlike consume's silent-0, which is correct for logging.
-- (3) Drop the five unread views (adopt-or-drop rule; client stockState.ts
--     is the adopted path). shopping_list TABLE is untouched (canonical).

do $$
declare
  v_user_id uuid;
  r record;
  v_replaced integer := 0;
  v_resynced integer := 0;
  v_bad integer;
begin
  select id into v_user_id from auth.users limit 1;
  if v_user_id is null then
    raise exception 'No auth.users row found — cannot reconcile inventory.';
  end if;

  -- A. Single-location (or null storage_type) items: replace location rows
  --    with the one canonical row derived from the legacy columns.
  for r in
    select fi.id, fi.name, fi.quantity, fi.location
    from public.food_inventory fi
    where fi.user_id = v_user_id
      and coalesce(fi.storage_type, 'single-location') = 'single-location'
  loop
    delete from public.food_inventory_locations where food_inventory_id = r.id;
    insert into public.food_inventory_locations
      (food_inventory_id, user_id, location, quantity, is_ready_to_consume)
    values (r.id, v_user_id, coalesce(r.location, 'pantry'), r.quantity, true);
    v_replaced := v_replaced + 1;
    raise notice '  single-location canonicalized: % (qty %)', r.name, r.quantity;
  end loop;

  -- B. Multi-location items with no location rows at all: same treatment.
  for r in
    select fi.id, fi.name, fi.quantity, fi.location
    from public.food_inventory fi
    where fi.user_id = v_user_id
      and fi.storage_type = 'multi-location'
      and not exists (select 1 from public.food_inventory_locations l
                      where l.food_inventory_id = fi.id)
  loop
    insert into public.food_inventory_locations
      (food_inventory_id, user_id, location, quantity, is_ready_to_consume)
    values (r.id, v_user_id, coalesce(r.location, 'pantry'), r.quantity, true);
    v_replaced := v_replaced + 1;
    raise notice '  location-less multi item seeded: % (qty %)', r.name, r.quantity;
  end loop;

  -- C. Resync the legacy cache for EVERY item: quantity = sum(locations).
  update public.food_inventory fi
     set quantity = sub.total
    from (select l.food_inventory_id, sum(l.quantity) as total
            from public.food_inventory_locations l
           group by l.food_inventory_id) sub
   where sub.food_inventory_id = fi.id
     and fi.user_id = v_user_id
     and fi.quantity is distinct from sub.total;
  get diagnostics v_resynced = row_count;

  -- D. Post-condition: every item has >= 1 location row and cache = sum.
  select count(*) into v_bad
  from public.food_inventory fi
  where fi.user_id = v_user_id
    and (not exists (select 1 from public.food_inventory_locations l
                     where l.food_inventory_id = fi.id)
         or fi.quantity <> coalesce((select sum(l2.quantity)
                                     from public.food_inventory_locations l2
                                     where l2.food_inventory_id = fi.id), 0));
  if v_bad > 0 then
    raise exception 'Reconcile failed: % items still violate locations-as-truth', v_bad;
  end if;

  raise notice 'Inventory reconcile — canonicalized: %, legacy caches resynced: %',
    v_replaced, v_resynced;
end $$;

create or replace function public.transfer_inventory_units(
  p_item_id uuid,
  p_from_location_id uuid,   -- null = "from store" (no source decrement)
  p_to_location_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_from public.food_inventory_locations%rowtype;
  v_to public.food_inventory_locations%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'transfer quantity must be positive';
  end if;
  if p_from_location_id is not null and p_from_location_id = p_to_location_id then
    raise exception 'source and target locations must differ';
  end if;

  select * into v_to from public.food_inventory_locations
   where id = p_to_location_id and food_inventory_id = p_item_id
   for update;
  if v_to.id is null then
    raise exception 'target location % not found on item %', p_to_location_id, p_item_id;
  end if;

  if p_from_location_id is not null then
    select * into v_from from public.food_inventory_locations
     where id = p_from_location_id and food_inventory_id = p_item_id
     for update;
    if v_from.id is null then
      raise exception 'source location % not found on item %', p_from_location_id, p_item_id;
    end if;
    if v_from.quantity < p_quantity then
      raise exception 'insufficient stock in source location (% < %)', v_from.quantity, p_quantity;
    end if;
    update public.food_inventory_locations
       set quantity = quantity - p_quantity where id = p_from_location_id;
  end if;

  update public.food_inventory_locations
     set quantity = quantity + p_quantity where id = p_to_location_id;

  update public.food_inventory fi
     set quantity = coalesce((select sum(l.quantity)
                              from public.food_inventory_locations l
                              where l.food_inventory_id = p_item_id), 0)
   where fi.id = p_item_id;
end;
$$;

revoke all on function public.transfer_inventory_units(uuid, uuid, uuid, integer) from public;
revoke execute on function public.transfer_inventory_units(uuid, uuid, uuid, integer) from anon;
grant execute on function public.transfer_inventory_units(uuid, uuid, uuid, integer) to authenticated;

-- Drop order matters: low_stock_items, out_of_stock_items and expiring_soon_items
-- are all defined FROM food_inventory_with_locations (20250217000003:106,122,130),
-- so the parent must go last. Deliberately NOT `cascade` — an unforeseen dependent
-- should abort the apply loudly rather than be silently dropped.
drop view if exists public.low_stock_items;
drop view if exists public.out_of_stock_items;
drop view if exists public.expiring_soon_items;
drop view if exists public.food_inventory_with_locations;
drop view if exists public.shopping_list_active;
