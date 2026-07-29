-- Nutrition OS Phase 1: preference & constraint model schema.
-- Spec: docs/superpowers/specs/2026-07-28-nutrition-preference-model-design.md

create table if not exists public.food_concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  rating text not null check (rating in ('love','like','neutral','dislike','never')),
  requires_small_pieces boolean not null default false,
  prep_intensive boolean not null default false,
  form_note text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.food_concept_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references public.food_concepts(id) on delete cascade,
  saved_food_id uuid references public.saved_foods(id) on delete cascade,
  food_inventory_id uuid references public.food_inventory(id) on delete cascade,
  matched_by text not null check (matched_by in ('seed','auto_name_match','user')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(saved_food_id, food_inventory_id) = 1),
  unique (concept_id, saved_food_id),
  unique (concept_id, food_inventory_id)
);

create table if not exists public.nutrition_vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  app_url text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.nutrition_constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  has_eoe boolean not null default false,
  avoids_eating_with_hands boolean not null default false,
  prefers_bowls boolean not null default false,
  spice_tolerance text not null default 'medium'
    check (spice_tolerance in ('none','mild','medium','hot')),
  max_prep_minutes integer not null default 5,
  prefers_small_frequent_meals boolean not null default true,
  max_leftover_hours integer not null default 24,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.calorie_ramp_levels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  level integer not null,
  name text not null,
  target_calories integer not null,
  target_protein_g integer not null,
  target_carbs_g integer,
  target_fats_g integer,
  is_active boolean not null default false,
  started_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, level)
);

create unique index if not exists calorie_ramp_levels_one_active
  on public.calorie_ramp_levels (user_id) where is_active;

create index if not exists food_concept_links_concept_idx
  on public.food_concept_links (concept_id);

create index if not exists food_concepts_user_name_idx
  on public.food_concepts (user_id, name);

create index if not exists nutrition_vendors_user_order_idx
  on public.nutrition_vendors (user_id, display_order);

create index if not exists food_concept_links_saved_food_idx
  on public.food_concept_links (saved_food_id) where saved_food_id is not null;

create index if not exists food_concept_links_inventory_idx
  on public.food_concept_links (food_inventory_id) where food_inventory_id is not null;

-- RLS: owner-only, per-operation policies (house pattern).
alter table public.food_concepts enable row level security;
alter table public.food_concept_links enable row level security;
alter table public.nutrition_vendors enable row level security;
alter table public.nutrition_constraints enable row level security;
alter table public.calorie_ramp_levels enable row level security;

drop policy if exists "Users can view their own food concepts" on public.food_concepts;
create policy "Users can view their own food concepts"
  on public.food_concepts for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can insert their own food concepts" on public.food_concepts;
create policy "Users can insert their own food concepts"
  on public.food_concepts for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Users can update their own food concepts" on public.food_concepts;
create policy "Users can update their own food concepts"
  on public.food_concepts for update to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can delete their own food concepts" on public.food_concepts;
create policy "Users can delete their own food concepts"
  on public.food_concepts for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own food concept links" on public.food_concept_links;
create policy "Users can view their own food concept links"
  on public.food_concept_links for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can insert their own food concept links" on public.food_concept_links;
create policy "Users can insert their own food concept links"
  on public.food_concept_links for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Users can update their own food concept links" on public.food_concept_links;
create policy "Users can update their own food concept links"
  on public.food_concept_links for update to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can delete their own food concept links" on public.food_concept_links;
create policy "Users can delete their own food concept links"
  on public.food_concept_links for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own nutrition vendors" on public.nutrition_vendors;
create policy "Users can view their own nutrition vendors"
  on public.nutrition_vendors for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can insert their own nutrition vendors" on public.nutrition_vendors;
create policy "Users can insert their own nutrition vendors"
  on public.nutrition_vendors for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Users can update their own nutrition vendors" on public.nutrition_vendors;
create policy "Users can update their own nutrition vendors"
  on public.nutrition_vendors for update to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can delete their own nutrition vendors" on public.nutrition_vendors;
create policy "Users can delete their own nutrition vendors"
  on public.nutrition_vendors for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own nutrition constraints" on public.nutrition_constraints;
create policy "Users can view their own nutrition constraints"
  on public.nutrition_constraints for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can insert their own nutrition constraints" on public.nutrition_constraints;
create policy "Users can insert their own nutrition constraints"
  on public.nutrition_constraints for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Users can update their own nutrition constraints" on public.nutrition_constraints;
create policy "Users can update their own nutrition constraints"
  on public.nutrition_constraints for update to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can delete their own nutrition constraints" on public.nutrition_constraints;
create policy "Users can delete their own nutrition constraints"
  on public.nutrition_constraints for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own calorie ramp levels" on public.calorie_ramp_levels;
create policy "Users can view their own calorie ramp levels"
  on public.calorie_ramp_levels for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can insert their own calorie ramp levels" on public.calorie_ramp_levels;
create policy "Users can insert their own calorie ramp levels"
  on public.calorie_ramp_levels for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "Users can update their own calorie ramp levels" on public.calorie_ramp_levels;
create policy "Users can update their own calorie ramp levels"
  on public.calorie_ramp_levels for update to authenticated
  using (auth.uid() = user_id);
drop policy if exists "Users can delete their own calorie ramp levels" on public.calorie_ramp_levels;
create policy "Users can delete their own calorie ramp levels"
  on public.calorie_ramp_levels for delete to authenticated
  using (auth.uid() = user_id);

-- Maintain updated_at on mutable tables (shared helper from bootstrap).
drop trigger if exists update_food_concepts_updated_at on public.food_concepts;
create trigger update_food_concepts_updated_at
  before update on public.food_concepts
  for each row execute function update_updated_at_column();

drop trigger if exists update_nutrition_vendors_updated_at on public.nutrition_vendors;
create trigger update_nutrition_vendors_updated_at
  before update on public.nutrition_vendors
  for each row execute function update_updated_at_column();

drop trigger if exists update_nutrition_constraints_updated_at on public.nutrition_constraints;
create trigger update_nutrition_constraints_updated_at
  before update on public.nutrition_constraints
  for each row execute function update_updated_at_column();

drop trigger if exists update_calorie_ramp_levels_updated_at on public.calorie_ramp_levels;
create trigger update_calorie_ramp_levels_updated_at
  before update on public.calorie_ramp_levels
  for each row execute function update_updated_at_column();
