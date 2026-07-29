-- Nutrition OS Phase 2: drop the superseded meal_templates feature.
-- Sanctioned supersession (Concept Map §18.7: "extend or supersede — never
-- sibling"; leaving them dormant is the map's cautionary tale). All three
-- targets were verified empty in prod on 2026-07-29; the guard re-proves
-- emptiness at apply time so this can never destroy data.

do $$
begin
  if exists (select 1 from public.meal_templates limit 1) then
    raise exception 'meal_templates has rows — refusing to drop';
  end if;
  if exists (select 1 from public.meal_template_items limit 1) then
    raise exception 'meal_template_items has rows — refusing to drop';
  end if;
  if exists (select 1 from public.meal_logs where meal_template_id is not null limit 1) then
    raise exception 'meal_logs.meal_template_id is referenced — refusing to drop';
  end if;
end $$;

drop index if exists public.idx_meal_logs_template;
alter table public.meal_logs drop column if exists meal_template_id;
drop table if exists public.meal_template_items;
drop table if exists public.meal_templates;
