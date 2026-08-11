-- Undo for the "used one" verb.
--
-- Three additive pieces, no drops and no rewrites of existing behaviour:
--
-- 1. A third event kind, 'restore'. The trail is append-only by policy (see
--    20260811090000) and that ruling stands: an undo is a COMPENSATING event,
--    not a deletion of the consume it reverses. History keeps saying the tap
--    happened; the rate estimator nets the pair out.
--
-- 2. `consume_one_inventory_unit` — a single-item consume that also reports
--    WHICH location row it took from. The plural `consume_inventory_units`
--    (20260729100100) is deliberately left untouched: meal logging and the
--    barcode match service depend on its signature. The selection rule here
--    is a copy of that function's, and must stay one: ready-to-consume rows
--    first, then the fullest.
--
-- 3. `restore_inventory_unit` — puts a unit back into a NAMED location. It
--    takes the location rather than re-deriving it because "where consume
--    would take from now" is not the same question as "where consume just
--    took from": the decrement itself can change which row is fullest.

alter table public.inventory_events
  drop constraint if exists inventory_events_kind_check;
alter table public.inventory_events
  add constraint inventory_events_kind_check
  check (kind in ('consume', 'discard', 'restore'));

create or replace function public.consume_one_inventory_unit(p_inventory_id uuid)
returns table(consumed integer, location_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_loc_id uuid;
  v_count integer := 0;
begin
  if exists (select 1 from public.food_inventory_locations l
             where l.food_inventory_id = p_inventory_id) then
    select l.id into v_loc_id
    from public.food_inventory_locations l
    where l.food_inventory_id = p_inventory_id
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
               where l2.food_inventory_id = p_inventory_id), 0)
       where fi.id = p_inventory_id;
    end if;
  else
    -- Location-less rows fall back to the legacy quantity column, same as
    -- the plural function. There is no location to report.
    update public.food_inventory fi
       set quantity = fi.quantity - 1
     where fi.id = p_inventory_id
       and fi.quantity > 0;
    get diagnostics v_count = row_count;
  end if;

  consumed := v_count;
  location_id := v_loc_id;
  return next;
end;
$$;

-- Returns the number of units restored: 1 on success, 0 when nothing moved.
-- 0 conflates "no such row", "not yours" and "that location is gone" — callers
-- treat it the same way they treat consume's 0, as "nothing happened".
-- p_location_id may be null for a location-less item, which restores to the
-- legacy quantity column.
create or replace function public.restore_inventory_unit(
  p_inventory_id uuid,
  p_location_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_location_id is not null then
    update public.food_inventory_locations
       set quantity = quantity + 1
     where id = p_location_id
       and food_inventory_id = p_inventory_id;
    get diagnostics v_count = row_count;

    if v_count > 0 then
      update public.food_inventory fi
         set quantity = coalesce((
               select sum(l2.quantity)
               from public.food_inventory_locations l2
               where l2.food_inventory_id = p_inventory_id), 0)
       where fi.id = p_inventory_id;
    end if;
  else
    update public.food_inventory fi
       set quantity = fi.quantity + 1
     where fi.id = p_inventory_id;
    get diagnostics v_count = row_count;
  end if;

  return v_count;
end;
$$;
