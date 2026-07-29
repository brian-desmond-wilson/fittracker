-- Nutrition OS Phase 2: atomic, location-aware inventory decrement.
-- Replaces the client-side read-modify-write in foodInventoryMatchService
-- (non-atomic; wrote only the legacy single-location column). One plpgsql
-- body = one implicit transaction, so a multi-item meal decrement commits
-- or rolls back as a unit.
--
-- Unit semantics preserved: 1 unit = 1 discrete container per logged item,
-- regardless of servings. consumed/refunded of 0 means "no stock" — never
-- an error, because logging a meal must not fail on stock bookkeeping.
--
-- Location policy: consume from ready-to-consume locations first, then the
-- fullest; refund mirrors it. Rows with no location records fall back to
-- the legacy food_inventory.quantity column (22 inventory rows, 17 location
-- rows in prod — location-less items are real). After any location write,
-- food_inventory.quantity is resynced to sum(locations) so legacy readers
-- (barcode match "in stock" checks) stay correct.
-- security invoker => RLS applies; callers touch only their own rows.

create or replace function public.consume_inventory_units(p_inventory_ids uuid[])
returns table(inventory_id uuid, consumed integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_loc_id uuid;
  v_count integer;
begin
  foreach v_id in array p_inventory_ids loop
    v_loc_id := null;
    v_count := 0;

    if exists (select 1 from public.food_inventory_locations l
               where l.food_inventory_id = v_id) then
      select l.id into v_loc_id
      from public.food_inventory_locations l
      where l.food_inventory_id = v_id
        and l.quantity > 0
      order by l.is_ready_to_consume desc, l.quantity desc
      limit 1
      for update;

      if v_loc_id is not null then
        update public.food_inventory_locations
           set quantity = quantity - 1
         where id = v_loc_id;
        v_count := 1;

        update public.food_inventory fi
           set quantity = coalesce((
                 select sum(l2.quantity)
                 from public.food_inventory_locations l2
                 where l2.food_inventory_id = v_id), 0)
         where fi.id = v_id;
      end if;
    else
      update public.food_inventory fi
         set quantity = fi.quantity - 1
       where fi.id = v_id
         and fi.quantity > 0;
      get diagnostics v_count = row_count;
    end if;

    inventory_id := v_id;
    consumed := v_count;
    return next;
  end loop;
end;
$$;

create or replace function public.refund_inventory_units(p_inventory_ids uuid[])
returns table(inventory_id uuid, refunded integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_loc_id uuid;
  v_count integer;
begin
  foreach v_id in array p_inventory_ids loop
    v_loc_id := null;
    v_count := 0;

    if exists (select 1 from public.food_inventory_locations l
               where l.food_inventory_id = v_id) then
      -- Mirror of consume: credit the ready-to-consume location first.
      -- Units are containers, so "which location" is an approximation and
      -- that is fine (documented v1 semantics).
      select l.id into v_loc_id
      from public.food_inventory_locations l
      where l.food_inventory_id = v_id
      order by l.is_ready_to_consume desc, l.quantity desc
      limit 1
      for update;

      if v_loc_id is not null then
        update public.food_inventory_locations
           set quantity = quantity + 1
         where id = v_loc_id;
        v_count := 1;

        update public.food_inventory fi
           set quantity = coalesce((
                 select sum(l2.quantity)
                 from public.food_inventory_locations l2
                 where l2.food_inventory_id = v_id), 0)
         where fi.id = v_id;
      end if;
    else
      update public.food_inventory fi
         set quantity = fi.quantity + 1
       where fi.id = v_id;
      get diagnostics v_count = row_count;
    end if;

    inventory_id := v_id;
    refunded := v_count;
    return next;
  end loop;
end;
$$;

revoke all on function public.consume_inventory_units(uuid[]) from public;
grant execute on function public.consume_inventory_units(uuid[]) to authenticated;
revoke all on function public.refund_inventory_units(uuid[]) from public;
grant execute on function public.refund_inventory_units(uuid[]) to authenticated;
