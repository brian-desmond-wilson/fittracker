-- Nutrition OS Phase 2: Meal Library schema.
-- Spec: docs/superpowers/specs/2026-07-29-nutrition-meal-library-design.md
-- Supersedes meal_templates (verified empty in prod 2026-07-29; dropped by
-- 20260729100300 after this feature's code lands).
--
-- meals carry NO nutrition columns — totals are always computed from items
-- (Concept Map hazard #1: no third nutrition-bearing product entity).

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
  unique (user_id, slug)
);

create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
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
  unique (meal_id, saved_food_id)
);

alter table public.meal_logs
  add column if not exists meal_id uuid references public.meals(id) on delete set null;

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
