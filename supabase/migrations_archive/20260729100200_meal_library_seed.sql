-- Nutrition OS Phase 2 seed: staple saved foods, their concept links, and
-- the Top 10 meals (Korean Beef Bowl = gold standard, taste_override love).
-- Spec §10: docs/superpowers/specs/2026-07-29-nutrition-meal-library-design.md
-- Idempotent: staples guarded by not-exists on (user_id, lower(name))
-- (saved_foods has no slug); meals via on conflict (user_id, slug); links
-- and items via their unique keys. Re-running never duplicates and never
-- overwrites user edits.
-- Unlinked staples (sauces, jelly, salsa, chips) are deliberate: no matching
-- Phase 1 concept exists; their small calorie weight keeps taste math honest.

-- EXECUTION AMENDMENT (2026-07-29): spec §10.1's notes marker needs a column
-- public.saved_foods has never had. It is added by the schema migration
-- 20260729100000 (which sorts first), not here — a _seed file carries data,
-- not DDL. The marker is stamped inline in the staple INSERT below, so only
-- rows this seed actually creates are ever labelled.

do $$
declare
  v_user_id uuid;
  v_staples integer;
  v_links integer;
  v_meals integer;
  v_items integer;
  v_check integer;
begin
  select id into v_user_id from auth.users limit 1;
  if v_user_id is null then
    raise exception 'No auth.users row found — cannot seed the Meal Library.';
  end if;

  -- notes is stamped inline rather than by a follow-up update: the column is
  -- brand new, so every pre-existing row has notes is null, and a
  -- `where notes is null and lower(name) in (...)` update would also label a
  -- food the owner already created whose name collides with a staple — a row
  -- this seed deliberately skipped. Stamping in the INSERT means the marker
  -- means exactly "created by this seed", and no user note is ever touched.
  insert into public.saved_foods
    (user_id, name, calories, protein, carbs, fats, sugars, sodium_mg, fiber_g,
     serving_size, notes)
  select v_user_id, v.name, v.cal, v.p, v.c, v.f, v.sug, v.na, v.fib, v.serving,
         'Nutrition OS staple (seeded)'
  from (values
    ('Ground Beef, cooked 85/15',      290, 26,   0,   20,   0,  90,  0,   '4 oz'),
    ('Microwave Sticky White Rice',    310, 6,    68,  1,    0,  10,  1,   '1 cup'),
    ('Grilled Chicken Breast, diced',  180, 34,   0,   4,    0,  380, 0,   '4 oz'),
    ('Teriyaki Sauce',                 60,  2,    12,  0,    10, 900, 0,   '2 tbsp'),
    ('Korean BBQ Sauce',               60,  1,    13,  0.5,  11, 520, 0,   '2 tbsp'),
    ('Greek Yogurt, whole milk plain', 220, 20,   9,   11,   9,  80,  0,   '1 cup'),
    ('Protein Granola',                220, 10,   26,  8,    7,  45,  3,   '1/2 cup'),
    ('Instant Oatmeal, prepared',      160, 4,    33,  2.5,  12, 260, 3,   '1 packet'),
    ('Peanut Butter',                  190, 8,    7,   16,   3,  140, 2,   '2 tbsp'),
    ('Grape Jelly',                    50,  0,    13,  0,    12, 5,   0,   '1 tbsp'),
    ('White Bread',                    150, 5,    28,  2,    3,  230, 1,   '2 slices'),
    ('Banana',                         105, 1.3,  27,  0.4,  14, 1,   3,   '1 medium'),
    ('Blueberries',                    85,  1,    21,  0.5,  15, 1,   3.6, '1 cup'),
    ('Whole Milk',                     150, 8,    12,  8,    12, 105, 0,   '1 cup'),
    ('Boost Very High Calorie',        530, 22,   85,  12,   26, 200, 0,   '1 bottle'),
    ('Cashews',                        160, 5,    9,   13,   2,  95,  1,   '1 oz'),
    ('Shredded Cheddar',               110, 7,    1,   9,    0,  180, 0,   '1/4 cup'),
    ('Salsa',                          10,  0,    2,   0,    1,  220, 0,   '2 tbsp'),
    ('Tortilla Chips',                 140, 2,    19,  7,    0,  115, 1,   '1 oz'),
    ('Whey Protein Powder',            120, 24,   3,   1.5,  2,  130, 0,   '1 scoop')
  ) as v(name, cal, p, c, f, sug, na, fib, serving)
  where not exists (
    select 1 from public.saved_foods sf
    where sf.user_id = v_user_id and lower(sf.name) = lower(v.name)
  );
  get diagnostics v_staples = row_count;

  insert into public.food_concept_links (user_id, concept_id, saved_food_id, matched_by)
  select v_user_id, c.id, sf.id, 'seed'
  from (values
    ('Ground Beef, cooked 85/15',      'ground-beef'),
    ('Microwave Sticky White Rice',    'microwave-rice'),
    ('Grilled Chicken Breast, diced',  'chicken-breast'),
    ('Greek Yogurt, whole milk plain', 'greek-yogurt'),
    ('Protein Granola',                'granola'),
    ('Instant Oatmeal, prepared',      'oatmeal'),
    ('Peanut Butter',                  'peanut-butter'),
    ('White Bread',                    'bread'),
    ('Banana',                         'bananas'),
    ('Blueberries',                    'blueberries'),
    ('Whole Milk',                     'whole-milk'),
    ('Boost Very High Calorie',        'boost-high-protein'),
    ('Cashews',                        'cashews'),
    ('Shredded Cheddar',               'cheese'),
    ('Whey Protein Powder',            'protein-shakes')
  ) as v(food_name, concept_slug)
  join public.food_concepts c
    on c.user_id = v_user_id and c.slug = v.concept_slug
  join public.saved_foods sf
    on sf.user_id = v_user_id and lower(sf.name) = lower(v.food_name)
  on conflict (concept_id, saved_food_id) do nothing;
  get diagnostics v_links = row_count;

  insert into public.meals
    (user_id, name, slug, category, role, prep_minutes, taste_override)
  select v_user_id, v.name, v.slug, v.category, v.role, v.prep, v.taste
  from (values
    ('Protein Oatmeal Bowl',  'protein-oatmeal-bowl',  'breakfast', null,                3, null),
    ('Greek Yogurt Bowl',     'greek-yogurt-bowl',     'breakfast', null,                2, null),
    ('Korean Beef Bowl',      'korean-beef-bowl',      'dinner',    null,                5, 'love'),
    ('Teriyaki Chicken Bowl', 'teriyaki-chicken-bowl', 'lunch',     null,                5, null),
    ('Cheeseburger Bowl',     'cheeseburger-bowl',     'dinner',    null,                5, null),
    ('Taco Bowl',             'taco-bowl',             'dinner',    null,                5, null),
    ('PB&J',                  'pb-and-j',              'lunch',     null,                3, null),
    ('Banana + PB',           'banana-pb',             'snack',     'bridge',            2, null),
    ('Boost + Cashews',       'boost-cashews',         'emergency', 'emergency_catchup', 0, null),
    ('Brian Bulk Shake',      'brian-bulk-shake',      'shake',     'calorie_booster',   4, null)
  ) as v(name, slug, category, role, prep, taste)
  on conflict (user_id, slug) do nothing;
  get diagnostics v_meals = row_count;

  insert into public.meal_items
    (user_id, meal_id, saved_food_id, servings, display_order, small_pieces_ok)
  select v_user_id, m.id, sf.id, v.servings, v.ord, v.sp_ok
  from (values
    ('protein-oatmeal-bowl',  'Instant Oatmeal, prepared',      1.0,  0, false),
    ('protein-oatmeal-bowl',  'Whey Protein Powder',            1.0,  1, false),
    ('protein-oatmeal-bowl',  'Peanut Butter',                  1.0,  2, false),
    ('protein-oatmeal-bowl',  'Banana',                         1.0,  3, false),
    ('greek-yogurt-bowl',     'Greek Yogurt, whole milk plain', 1.0,  0, false),
    ('greek-yogurt-bowl',     'Protein Granola',                1.0,  1, false),
    ('greek-yogurt-bowl',     'Blueberries',                    1.0,  2, false),
    ('korean-beef-bowl',      'Ground Beef, cooked 85/15',      1.5,  0, false),
    ('korean-beef-bowl',      'Microwave Sticky White Rice',    1.0,  1, false),
    ('korean-beef-bowl',      'Korean BBQ Sauce',               1.0,  2, false),
    ('teriyaki-chicken-bowl', 'Grilled Chicken Breast, diced',  1.5,  0, true),
    ('teriyaki-chicken-bowl', 'Microwave Sticky White Rice',    1.0,  1, false),
    ('teriyaki-chicken-bowl', 'Teriyaki Sauce',                 1.0,  2, false),
    ('cheeseburger-bowl',     'Ground Beef, cooked 85/15',      1.5,  0, false),
    ('cheeseburger-bowl',     'Microwave Sticky White Rice',    1.0,  1, false),
    ('cheeseburger-bowl',     'Shredded Cheddar',               1.0,  2, false),
    ('taco-bowl',             'Ground Beef, cooked 85/15',      1.25, 0, false),
    ('taco-bowl',             'Microwave Sticky White Rice',    1.0,  1, false),
    ('taco-bowl',             'Shredded Cheddar',               1.0,  2, false),
    ('taco-bowl',             'Salsa',                          1.0,  3, false),
    ('taco-bowl',             'Tortilla Chips',                 1.0,  4, false),
    ('pb-and-j',              'White Bread',                    1.0,  0, false),
    ('pb-and-j',              'Peanut Butter',                  2.0,  1, false),
    ('pb-and-j',              'Grape Jelly',                    1.0,  2, false),
    ('banana-pb',             'Banana',                         1.0,  0, false),
    ('banana-pb',             'Peanut Butter',                  1.0,  1, false),
    ('boost-cashews',         'Boost Very High Calorie',        1.0,  0, false),
    ('boost-cashews',         'Cashews',                        1.0,  1, false),
    ('brian-bulk-shake',      'Whole Milk',                     1.0,  0, false),
    ('brian-bulk-shake',      'Banana',                         1.0,  1, false),
    ('brian-bulk-shake',      'Peanut Butter',                  2.0,  2, false),
    ('brian-bulk-shake',      'Whey Protein Powder',            1.0,  3, false)
  ) as v(meal_slug, food_name, servings, ord, sp_ok)
  join public.meals m
    on m.user_id = v_user_id and m.slug = v.meal_slug
  join public.saved_foods sf
    on sf.user_id = v_user_id and lower(sf.name) = lower(v.food_name)
  on conflict (meal_id, saved_food_id) do nothing;
  get diagnostics v_items = row_count;

  raise notice 'Meal Library seed — staples: %, links: %, meals: %, items: %',
    v_staples, v_links, v_meals, v_items;

  -- Completeness guard on the ACTUAL final state, not on rows-inserted-this-run.
  -- Counting inserts cannot work: on a re-run every counter is legitimately 0,
  -- and on a first run `v_items < v_meals` only fires below 10 items, so a
  -- food_name/meal_slug typo dropping 12 of 32 would pass silently. Restricting
  -- to the 10 seeded slugs also makes it immune to meals the owner adds later.
  select count(*) into v_check
  from public.meal_items mi
  join public.meals m on m.id = mi.meal_id
  where m.user_id = v_user_id
    and m.slug in (
      'protein-oatmeal-bowl','greek-yogurt-bowl','korean-beef-bowl',
      'teriyaki-chicken-bowl','cheeseburger-bowl','taco-bowl','pb-and-j',
      'banana-pb','boost-cashews','brian-bulk-shake');
  if v_check <> 32 then
    raise exception 'Meal Library seed: expected 32 items across the 10 seeded meals, found % — check food_name/meal_slug spellings', v_check;
  end if;
end $$;
