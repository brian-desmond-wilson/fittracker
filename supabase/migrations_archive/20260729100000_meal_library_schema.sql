-- Nutrition OS Phase 2: Meal Library schema.
-- Spec: docs/superpowers/specs/2026-07-29-nutrition-meal-library-design.md
-- Supersedes meal_templates (verified empty in prod 2026-07-29; dropped by
-- 20260729100300 after this feature's code lands).
--
-- meals carry NO nutrition columns — totals are always computed from items
-- (Concept Map hazard #1: no third nutrition-bearing product entity).
--
-- Naming: snake_case policy names (meals_select_own) and <table>_updated_at
-- triggers. Phase 1 (20260728100000) used sentence-style policy names and
-- update_<table>_updated_at; the snake_case form here is the intentional
-- convention going forward.

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  category text not null check (category in
    ('breakfast','lunch','dinner','snack','shake','emergency')),
  role text check (role in
    ('pre_workout','post_workout','bridge','calorie_booster','emergency_catchup')),
  default_meal_type text check (default_meal_type in
    ('breakfast','lunch','dinner','snack','dessert')),
  prep_minutes integer not null default 0 check (prep_minutes >= 0),
  taste_override text check (taste_override in
    ('love','like','neutral','dislike','never')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug),
  -- FK target for meal_items' composite (meal_id, user_id) reference, which
  -- makes it structurally impossible for an item to belong to a different
  -- user than its parent meal.
  unique (id, user_id)
);

create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null,
  -- RESTRICT, deliberately breaking with meal_template_items' CASCADE:
  -- deleting a saved food must not silently shrink a meal (and its
  -- calories). The delete fails loudly until the item is removed first.
  saved_food_id uuid not null references public.saved_foods(id) on delete restrict,
  servings numeric(5,2) not null default 1.0 check (servings > 0),
  display_order integer not null default 0,
  -- "This specific product is already in EoE-compliant form" — only
  -- meaningful when the linked concept has requires_small_pieces.
  small_pieces_ok boolean not null default false,
  created_at timestamptz not null default now(),
  unique (meal_id, saved_food_id),
  -- Composite, not a plain meal_id FK: FK validation runs with RLS bypassed
  -- (referential-integrity triggers execute as the table owner), so an
  -- independent meal_id could point at another user's meal while still
  -- satisfying this table's `with check (user_id = auth.uid())`. Binding both
  -- columns also makes a client bug loud rather than silent — the Task 9
  -- query module passes user_id explicitly on both the meals and meal_items
  -- inserts, and if those ever disagree the rows would simply become
  -- invisible to RLS with no error. Now they fail.
  foreign key (meal_id, user_id)
    references public.meals(id, user_id) on delete cascade
);

-- Meal Library provenance link on logged meals (spec §5.3): replaces
-- meal_logs.meal_template_id, which migration 20260729100300 drops once this
-- feature's code has landed. `on delete set null` — deleting a library meal
-- must not erase the historical log rows it produced.
alter table public.meal_logs
  add column if not exists meal_id uuid references public.meals(id) on delete set null;

-- Backs spec §10.1's seeded-staple marker: the seed (20260729100200) stamps
-- notes = 'Nutrition OS staple (seeded)' on the staples it inserts, but
-- public.saved_foods has never had a notes column (only food_inventory does).
-- Additive, nullable and idempotent; this file sorts first, so the column
-- exists before the seed runs.
alter table public.saved_foods
  add column if not exists notes text;

create index if not exists idx_meals_user_category
  on public.meals(user_id, category);
create index if not exists idx_meal_items_meal
  on public.meal_items(meal_id, display_order);
-- Supports the RESTRICT check on saved_foods deletes.
create index if not exists idx_meal_items_saved_food
  on public.meal_items(saved_food_id);
create index if not exists idx_meal_logs_meal
  on public.meal_logs(meal_id) where meal_id is not null;

alter table public.meals enable row level security;
alter table public.meal_items enable row level security;

drop policy if exists "meals_select_own" on public.meals;
create policy "meals_select_own" on public.meals
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "meals_insert_own" on public.meals;
create policy "meals_insert_own" on public.meals
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "meals_update_own" on public.meals;
create policy "meals_update_own" on public.meals
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "meals_delete_own" on public.meals;
create policy "meals_delete_own" on public.meals
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "meal_items_select_own" on public.meal_items;
create policy "meal_items_select_own" on public.meal_items
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "meal_items_insert_own" on public.meal_items;
create policy "meal_items_insert_own" on public.meal_items
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "meal_items_update_own" on public.meal_items;
create policy "meal_items_update_own" on public.meal_items
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "meal_items_delete_own" on public.meal_items;
create policy "meal_items_delete_own" on public.meal_items
  for delete to authenticated using (user_id = auth.uid());

drop trigger if exists meals_updated_at on public.meals;
create trigger meals_updated_at
  before update on public.meals
  for each row execute function public.update_updated_at_column();
