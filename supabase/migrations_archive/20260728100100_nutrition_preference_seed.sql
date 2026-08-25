-- Seed Nutrition OS Phase 1 from the July 2026 discovery conversation.
-- Idempotent: unique keys + on conflict do nothing.
-- Single-user app: owner is resolved via auth.users (house convention).
--
-- Note: Level 1 is seeded is_active = true with started_at left NULL.
-- This migration intentionally does NOT write to public.profiles — the
-- owner's live calorie/protein targets only change when he explicitly
-- confirms a level change in-app.

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users limit 1;

  if v_user_id is null then
    raise exception 'No auth.users row found — cannot seed Nutrition OS preference data.';
  end if;

  insert into public.food_concepts
    (user_id, name, slug, rating, requires_small_pieces, prep_intensive, form_note)
  select v_user_id, v.name, v.slug, v.rating, v.small_pieces, v.prep_heavy, v.form_note
  from (values
    -- Protein
    ('Chicken Breast','chicken-breast','like',true,false,'Must be cut/diced into small pieces (EoE)'),
    ('Rotisserie Chicken','rotisserie-chicken','like',true,false,'Sliced/diced; no bones; not eaten by hand'),
    ('Steak','steak','like',true,false,'Thin-sliced or diced; well-cooked (EoE)'),
    ('Ground Beef','ground-beef','love',false,false,null),
    ('Turkey','turkey','like',false,false,null),
    ('Salmon','salmon','love',false,true,'Time-consuming to prepare solo'),
    ('Tuna','tuna','like',false,false,null),
    ('Shrimp','shrimp','like',false,false,null),
    ('Eggs','eggs','like',false,true,'Time-consuming to prepare solo'),
    ('Egg Whites','egg-whites','dislike',false,false,null),
    ('Bacon','bacon','love',false,true,'Time-consuming to prepare solo'),
    ('Sausage','sausage','love',false,true,'Time-consuming to prepare solo'),
    ('Greek Yogurt','greek-yogurt','like',false,false,null),
    ('Cottage Cheese','cottage-cheese','dislike',false,false,null),
    ('Cheese','cheese','love',false,false,null),
    ('Protein Bars','protein-bars','like',false,false,null),
    ('Protein Shakes','protein-shakes','like',false,false,null),
    -- Carbs
    ('Rice','rice','love',false,false,null),
    ('Microwave Rice','microwave-rice','love',false,false,null),
    ('Potatoes','potatoes','like',false,false,null),
    ('Sweet Potatoes','sweet-potatoes','neutral',false,false,null),
    ('Pasta','pasta','love',false,false,null),
    ('Bread','bread','love',false,false,null),
    ('Hawaiian Buns','hawaiian-buns','love',false,false,null),
    ('Bagels','bagels','like',false,false,null),
    ('English Muffins','english-muffins','like',false,false,null),
    ('Tortillas','tortillas','like',false,false,null),
    ('Oatmeal','oatmeal','like',false,false,null),
    ('Pancakes','pancakes','love',false,false,null),
    ('Waffles','waffles','like',false,false,null),
    ('Protein Waffles','protein-waffles','like',false,false,null),
    ('Cereal','cereal','like',false,false,null),
    ('Granola','granola','love',false,false,null),
    -- Fats
    ('Peanut Butter','peanut-butter','love',false,false,null),
    ('Almond Butter','almond-butter','love',false,false,null),
    ('Cashews','cashews','love',false,false,null),
    ('Mixed Nuts','mixed-nuts','like',false,false,null),
    ('Avocados','avocados','love',false,false,null),
    ('Olive Oil','olive-oil','love',false,false,null),
    ('Butter','butter','love',false,false,null),
    -- Fruits
    ('Bananas','bananas','love',false,false,null),
    ('Blueberries','blueberries','love',false,false,null),
    ('Strawberries','strawberries','love',false,false,null),
    ('Grapes','grapes','love',false,false,null),
    ('Apples','apples','like',false,false,null),
    ('Pineapple','pineapple','like',false,false,null),
    -- Drinks
    ('Whole Milk','whole-milk','love',false,false,null),
    ('Chocolate Milk','chocolate-milk','like',false,false,null),
    ('Fairlife Milk','fairlife-milk','neutral',false,false,null),
    ('Boost High Protein','boost-high-protein','love',false,false,null),
    ('Coffee','coffee','dislike',false,false,null),
    ('Juice','juice','like',false,false,null),
    ('Sparkling Water','sparkling-water','neutral',false,false,null),
    -- Convenience
    ('Frozen Burritos','frozen-burritos','like',false,false,null),
    ('Frozen Grilled Chicken','frozen-grilled-chicken','like',false,false,null),
    ('Trail Mix','trail-mix','like',false,false,null),
    ('Frozen Meatballs','frozen-meatballs','like',false,false,null),
    ('String Cheese','string-cheese','dislike',false,false,null),
    ('Beef Jerky','beef-jerky','dislike',false,false,null),
    -- Never list
    ('Tofu','tofu','never',false,false,null),
    ('Radish','radish','never',false,false,null),
    ('Hot Dogs','hot-dogs','never',false,false,null),
    ('Mushrooms','mushrooms','never',false,false,null),
    ('Mayonnaise','mayonnaise','never',false,false,null),
    ('Pickles','pickles','never',false,false,null)
  ) as v(name, slug, rating, small_pieces, prep_heavy, form_note)
  on conflict (user_id, slug) do nothing;

  insert into public.nutrition_constraints
    (user_id, has_eoe, avoids_eating_with_hands, prefers_bowls, spice_tolerance,
     max_prep_minutes, prefers_small_frequent_meals, max_leftover_hours, notes)
  values (v_user_id, true, true, true, 'medium', 5, true, 24,
    'Germaphobe; prefers fresh over reheated; sandwiches wrapped in foil')
  on conflict (user_id) do nothing;

  insert into public.nutrition_vendors (user_id, name, slug, app_url, display_order)
  select v_user_id, v.name, v.slug, v.app_url, v.ord
  from (values
    ('Amazon Fresh','amazon-fresh','https://www.amazon.com/fmc', 1),
    ('Costco (Instacart)','costco-instacart','https://www.instacart.com/store/costco/storefront', 2),
    ('Gus''s Community Market','guss-community-market', null, 3),
    ('Thistle','thistle','https://www.thistle.co', 4)
  ) as v(name, slug, app_url, ord)
  on conflict (user_id, slug) do nothing;

  -- Level 1 seeded active with started_at NULL; public.profiles targets
  -- are NOT written here — first write happens on the first confirmed
  -- change in-app.
  insert into public.calorie_ramp_levels
    (user_id, level, name, target_calories, target_protein_g, is_active)
  select v_user_id, v.lvl, v.name, v.cal, v.protein, v.active
  from (values
    (1,'Foundation',2300,160,true),
    (2,'Momentum',2500,165,false),
    (3,'Growth',2700,170,false),
    (4,'Peak',2900,175,false)
  ) as v(lvl, name, cal, protein, active)
  on conflict (user_id, level) do nothing;

  raise notice 'Nutrition OS seed — food_concepts: %, vendors: %, ramp_levels: %, constraints: %',
    (select count(*) from public.food_concepts where user_id = v_user_id),
    (select count(*) from public.nutrition_vendors where user_id = v_user_id),
    (select count(*) from public.calorie_ramp_levels where user_id = v_user_id),
    (select count(*) from public.nutrition_constraints where user_id = v_user_id);
end $$;
