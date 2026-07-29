-- Backfill concept links to existing products.
-- Spec: docs/superpowers/specs/2026-07-28-nutrition-preference-model-design.md
-- Supersedes the plan's original Task 6 SQL: naive substring matching
-- mis-linked products whose name merely *contains* a concept as a non-head
-- word (e.g. "Butter Lettuce" -> "Butter", "Pasta Sauce" -> "Pasta") and
-- missed plural concepts ("Bananas") against singular products ("Banana").
--
-- Conservative + most-specific-wins: each product links to at most ONE
-- concept. Matching precedence:
--   1. exact match (case/whitespace-insensitive)
--   2. exact match modulo a trailing plural s ("Bananas" ~ "Banana")
--   3. concept as the product name's trailing head noun, e.g.
--      "Kerrygold Butter" -> Butter. This is word-boundary AND head-noun
--      position, so "Butter Lettuce" (Butter is not the trailing word)
--      correctly does NOT match. No LIKE/substring matching is used, so
--      literal % or _ in product names (e.g. "2% Milk") cannot wildcard.
-- Idempotent: on conflict do nothing against the unique link constraints.
--
-- Known accepted residuals (not oversights):
--   - Coincidental trailing-word matches: clause 3 is word-boundary +
--     head-noun position but has no semantic guard, so e.g. "Nutter Butter"
--     (a cookie) still links to the Butter concept. Narrow, low-impact;
--     the undo line above is the remedy if one turns up.
--   - Concepts under 5 chars ("Rice", "Tofu", "Eggs") never get suffix
--     matching, so "Fried Rice" / "Scrambled Eggs" won't link. Deliberate:
--     short generic words are exactly the ones that mis-link.
--   - Qty/size-suffixed names ("Ground Beef 80/20", "Organic Bananas 2lb")
--     won't link, since the concept must be the literal trailing word.
--     Under-linking is the intended failure mode throughout.
--
-- Undo: delete from public.food_concept_links where matched_by = 'auto_name_match';

do $$
declare
  v_user_id uuid;
  v_saved_links integer;
  v_inventory_links integer;
  r record;
begin
  select id into v_user_id from auth.users limit 1;
  if v_user_id is null then
    raise exception 'No auth.users row found — cannot backfill Nutrition OS concept links.';
  end if;

  with matches as (
    select
      f.id as saved_food_id,
      c.id as concept_id,
      case
        when lower(trim(f.name)) = lower(trim(c.name)) then 0
        when regexp_replace(lower(trim(f.name)), 's$', '')
             = regexp_replace(lower(trim(c.name)), 's$', '') then 1
        else 2
      end as match_rank,
      length(c.name) as specificity
    from public.food_concepts c
    join public.saved_foods f
      on f.user_id = c.user_id
     and (
       -- 1. exact match
       lower(trim(f.name)) = lower(trim(c.name))
       -- 2. exact match modulo a simple trailing plural ("Bananas" ~ "Banana")
       or regexp_replace(lower(trim(f.name)), 's$', '')
          = regexp_replace(lower(trim(c.name)), 's$', '')
       -- 3. product name ENDS WITH the concept as its trailing head noun
       --    ("Kerrygold Butter" -> Butter; "Butter Lettuce" -> no match)
       or (length(trim(c.name)) >= 5
           and right(lower(trim(f.name)), length(trim(c.name)) + 1)
               = ' ' || lower(trim(c.name)))
     )
    where c.user_id = v_user_id
  ),
  best as (
    select distinct on (saved_food_id) saved_food_id, concept_id
    from matches
    order by saved_food_id, match_rank, specificity desc, concept_id
  )
  insert into public.food_concept_links (user_id, concept_id, saved_food_id, matched_by)
  select v_user_id, b.concept_id, b.saved_food_id, 'auto_name_match'
  from best b
  on conflict (concept_id, saved_food_id) do nothing;

  get diagnostics v_saved_links = row_count;

  for r in
    select c.name as concept_name, f.name as product_name
    from public.food_concept_links l
    join public.food_concepts c on c.id = l.concept_id
    join public.saved_foods f on f.id = l.saved_food_id
    where l.user_id = v_user_id and l.matched_by = 'auto_name_match'
    order by c.name
  loop
    raise notice '  saved_food link: % -> %', r.product_name, r.concept_name;
  end loop;

  with matches as (
    select
      i.id as food_inventory_id,
      c.id as concept_id,
      case
        when lower(trim(i.name)) = lower(trim(c.name)) then 0
        when regexp_replace(lower(trim(i.name)), 's$', '')
             = regexp_replace(lower(trim(c.name)), 's$', '') then 1
        else 2
      end as match_rank,
      length(c.name) as specificity
    from public.food_concepts c
    join public.food_inventory i
      on i.user_id = c.user_id
     and (
       -- 1. exact match
       lower(trim(i.name)) = lower(trim(c.name))
       -- 2. exact match modulo a simple trailing plural ("Bananas" ~ "Banana")
       or regexp_replace(lower(trim(i.name)), 's$', '')
          = regexp_replace(lower(trim(c.name)), 's$', '')
       -- 3. product name ENDS WITH the concept as its trailing head noun
       --    ("Kerrygold Butter" -> Butter; "Butter Lettuce" -> no match)
       or (length(trim(c.name)) >= 5
           and right(lower(trim(i.name)), length(trim(c.name)) + 1)
               = ' ' || lower(trim(c.name)))
     )
    where c.user_id = v_user_id
  ),
  best as (
    select distinct on (food_inventory_id) food_inventory_id, concept_id
    from matches
    order by food_inventory_id, match_rank, specificity desc, concept_id
  )
  insert into public.food_concept_links (user_id, concept_id, food_inventory_id, matched_by)
  select v_user_id, b.concept_id, b.food_inventory_id, 'auto_name_match'
  from best b
  on conflict (concept_id, food_inventory_id) do nothing;

  get diagnostics v_inventory_links = row_count;

  for r in
    select c.name as concept_name, i.name as product_name
    from public.food_concept_links l
    join public.food_concepts c on c.id = l.concept_id
    join public.food_inventory i on i.id = l.food_inventory_id
    where l.user_id = v_user_id and l.matched_by = 'auto_name_match'
    order by c.name
  loop
    raise notice '  inventory link: % -> %', r.product_name, r.concept_name;
  end loop;

  raise notice 'Nutrition OS backfill — saved_food links: %, inventory links: %',
    v_saved_links, v_inventory_links;
end $$;
