-- Atomic ramp-level change: deactivate the current level, activate the target,
-- and sync the owner's canonical profiles targets. A plpgsql function body runs
-- in one implicit transaction, so the active level and the daily targets can
-- never silently disagree (which two separate client writes allowed).
-- security invoker => RLS applies, so a caller can only affect their own rows.

create or replace function public.set_active_ramp_level(
  p_level_id uuid,
  p_today date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_level public.calorie_ramp_levels%rowtype;
  v_rows integer;
begin
  select * into v_level
  from public.calorie_ramp_levels
  where id = p_level_id;

  if v_level.id is null then
    raise exception 'Ramp level % not found', p_level_id;
  end if;

  update public.calorie_ramp_levels
     set is_active = false
   where user_id = v_level.user_id
     and is_active
     and id <> p_level_id;

  update public.calorie_ramp_levels
     set is_active = true,
         started_at = p_today
   where id = p_level_id;

  update public.profiles
     set target_calories  = v_level.target_calories,
         target_protein_g = v_level.target_protein_g,
         target_carbs_g   = coalesce(v_level.target_carbs_g, target_carbs_g),
         target_fats_g    = coalesce(v_level.target_fats_g, target_fats_g)
   where id = v_level.user_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'No profiles row for user % — ramp level not applied', v_level.user_id;
  end if;
end;
$$;

revoke all on function public.set_active_ramp_level(uuid, date) from public;
grant execute on function public.set_active_ramp_level(uuid, date) to authenticated;
