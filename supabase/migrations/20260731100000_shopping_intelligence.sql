-- Nutrition OS Phase 5: shopping intelligence schema.
-- Spec: docs/superpowers/specs/2026-07-30-nutrition-shopping-intelligence-design.md §5
--
-- (1) Vendor FKs: food_inventory.preferred_vendor_id (product default) and
--     shopping_list.vendor_id (per-row snapshot, stamped at add time,
--     overridable). Phase 1 reserved exactly this: "the shopping phase adds
--     FKs into it." No new indexes — both tables are tens of rows.
-- (2) Drop shopping_list.category: never written by anything, absent from
--     the TS type since it was authored, duplicates the category system.
--     Emptiness-guarded (meal_template_id precedent).
-- (3) replace_item_locations: the atomic replacement Phase 4's Task 4
--     amendment scheduled for this phase. One transaction ends the
--     delete→insert→resync client sequence whose partial failure could
--     strand a half-written item; the locations-as-truth invariant gets
--     ongoing enforcement.

alter table public.food_inventory
  add column if not exists preferred_vendor_id uuid
  references public.nutrition_vendors(id) on delete set null;

alter table public.shopping_list
  add column if not exists vendor_id uuid
  references public.nutrition_vendors(id) on delete set null;

do $$
declare
  v_nonnull integer;
begin
  select count(*) into v_nonnull from public.shopping_list where category is not null;
  if v_nonnull > 0 then
    raise exception 'shopping_list.category has % non-null rows — refusing to drop', v_nonnull;
  end if;
  raise notice 'shopping_list.category guard: % non-null rows found — safe to drop', v_nonnull;
end $$;

alter table public.shopping_list drop column if exists category;

create or replace function public.replace_item_locations(
  p_item_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  r jsonb;
  v_total integer := 0;
  v_qty integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'p_rows must be a non-empty JSON array — an item must keep >= 1 location row';
  end if;

  -- security invoker: RLS on food_inventory scopes this read, so a caller
  -- can only resolve (and therefore only rewrite) their own items.
  select fi.user_id into v_user_id from public.food_inventory fi where fi.id = p_item_id for update;
  if v_user_id is null then
    raise exception 'inventory item % not found', p_item_id;
  end if;

  -- Validate every row up front, so a bad element raises this message
  -- rather than a raw constraint violation once the insert reaches it.
  for r in select * from jsonb_array_elements(p_rows) loop
    if (r->>'location') is null
       or (r->>'location') not in ('fridge','freezer','pantry','cabinet') then
      raise exception 'invalid location: %', r->>'location';
    end if;
    v_qty := (r->>'quantity')::integer;
    if v_qty is null or v_qty < 0 then
      raise exception 'quantity must be a non-negative integer';
    end if;
    if jsonb_typeof(r->'is_ready_to_consume') is distinct from 'boolean' then
      raise exception 'is_ready_to_consume must be a boolean';
    end if;
  end loop;

  delete from public.food_inventory_locations where food_inventory_id = p_item_id;

  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.food_inventory_locations
      (food_inventory_id, user_id, location, quantity, is_ready_to_consume, notes)
    values
      (p_item_id, v_user_id, r->>'location', (r->>'quantity')::integer,
       (r->>'is_ready_to_consume')::boolean, r->>'notes');
    v_total := v_total + (r->>'quantity')::integer;
  end loop;

  update public.food_inventory set quantity = v_total where id = p_item_id;
end;
$$;

revoke all on function public.replace_item_locations(uuid, jsonb) from public;
revoke execute on function public.replace_item_locations(uuid, jsonb) from anon;
grant execute on function public.replace_item_locations(uuid, jsonb) to authenticated;
