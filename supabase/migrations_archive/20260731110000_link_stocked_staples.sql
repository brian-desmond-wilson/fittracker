-- Nutrition OS: link the three inventory items that genuinely correspond to a
-- concept the seeded meals depend on.
--
-- Why this exists. `resolveInventoryMatches` (mobile/src/lib/inventoryResolution.ts)
-- matches a meal's saved food to stock by barcode, else by a UNIQUE shared
-- concept. Only 2 of 22 inventory rows carried a concept link, so
-- `assessAssemblability` counted nearly every meal ingredient as MISSING —
-- which Phase 5's demand engine then turned into a "needed for {meal}"
-- suggestion. The list was not wrong to do that; it was wrong about the three
-- ingredients below, which are in fact stocked.
--
-- Deliberately NOT linked, after owner review — each would make a meal
-- decrement the wrong product when logged, and under-matching is the intended
-- failure mode (inventoryResolution.ts's precedence note):
--   Oikos PRO              -> Greek Yogurt   (drinkable high-protein variant,
--                                             not the plain whole-milk yogurt
--                                             the Greek Yogurt Bowl calls for)
--   Chicken Crumbles       -> Chicken Breast (different product and form)
--   Strawberry Protein Shake -> Protein Shakes (ready-to-drink, not whey powder)
--
-- No meal becomes assemblable as a result, and that is correct: every meal
-- still needs something genuinely not in stock (ground beef, peanut butter,
-- bread, jelly, salsa, chips, cashews...). Phase 5's job is to ask for those.
--
-- Idempotent: `unique (concept_id, food_inventory_id)` makes the insert a
-- no-op on re-run. matched_by = 'user' — these are owner curation decisions,
-- not the Feb-2025 auto backfill.

do $$
declare
  v_pairs text[][] := array[
    ['Cooked Sticky White Rice', 'Microwave Rice'],
    ['Boost, Very High Calorie', 'Boost High Protein'],
    ['Organic Milk',             'Whole Milk']
  ];
  v_item_name text;
  v_concept_name text;
  v_item_id uuid;
  v_user_id uuid;
  v_concept_id uuid;
  v_n integer;
  v_inserted integer := 0;
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    v_item_name := v_pairs[i][1];
    v_concept_name := v_pairs[i][2];

    -- food_inventory.name has NO unique constraint (prod really does hold two
    -- rows both named "Propel Fitness Water"), so an ambiguous name must abort
    -- rather than silently link an arbitrary row.
    select count(*) into v_n from public.food_inventory where name = v_item_name;
    if v_n <> 1 then
      raise exception 'inventory name % matched % rows, expected exactly 1', v_item_name, v_n;
    end if;
    select id, user_id into v_item_id, v_user_id
      from public.food_inventory where name = v_item_name;

    select count(*) into v_n from public.food_concepts where name = v_concept_name;
    if v_n <> 1 then
      raise exception 'concept name % matched % rows, expected exactly 1', v_concept_name, v_n;
    end if;
    select id into v_concept_id from public.food_concepts where name = v_concept_name;

    insert into public.food_concept_links
      (user_id, concept_id, food_inventory_id, matched_by)
    values
      (v_user_id, v_concept_id, v_item_id, 'user')
    on conflict (concept_id, food_inventory_id) do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  raise notice 'linked % of % stocked staples (already-linked pairs skipped)',
    v_inserted, array_length(v_pairs, 1);
end $$;

-- Post-condition: a concept carried by 2+ IN-STOCK rows resolves to nothing
-- (2 candidates = ambiguous, inventoryResolution.ts), which would silently
-- undo the point of this migration. Fail loudly if these links created that.
do $$
declare
  v_ambiguous text;
begin
  -- The group-by must sit in a subquery: with it in the outer select,
  -- string_agg would aggregate WITHIN one group (repeating that concept's
  -- name once per row) and `into` would capture only the first offending
  -- group, silently under-reporting a second one.
  select string_agg(t.name, ', ') into v_ambiguous
  from (
    select fc.name
    from public.food_concept_links l
    join public.food_concepts fc on fc.id = l.concept_id
    join public.food_inventory fi on fi.id = l.food_inventory_id
    where l.food_inventory_id is not null
      and coalesce((
        select sum(q.quantity) from public.food_inventory_locations q
        where q.food_inventory_id = fi.id
      ), 0) > 0
    group by fc.id, fc.name
    having count(*) > 1
  ) t;

  if v_ambiguous is not null then
    raise exception 'concepts now carried by 2+ in-stock inventory rows (ambiguous, resolves to nothing): %', v_ambiguous;
  end if;

  raise notice 'no concept is carried by more than one in-stock inventory row';
end $$;
