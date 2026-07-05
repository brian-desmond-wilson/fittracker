-- Baseline for tables that previously lived only in the loose schema.sql /
-- schedule_schema.sql dumps (never captured by a migration): dev_tasks and
-- event_templates. Both are still used by the mobile app. The other loose-file
-- tables are intentionally NOT recreated: workouts / nutrition_logs are dead
-- (the web app that used them was removed), and push_subscriptions /
-- sent_notifications were retired with the web-push stack.

create extension if not exists "uuid-ossp";

-- Shared helpers the tables below depend on (idempotent).
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language 'plpgsql';

create or replace function public.auth_is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
end;
$$ language plpgsql security definer stable;

-- Profile-on-signup: create a profiles row when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- dev_tasks (personal dev/bug tracker; admin-gated)
-- ============================================================
create table dev_tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade not null,
  section text not null check (section in ('home', 'schedule', 'track', 'progress', 'profile', 'settings', 'training', 'other')),
  title text not null,
  description text,
  status text not null check (status in ('open', 'in_progress', 'done')) default 'open',
  priority text not null check (priority in ('low', 'medium', 'high')) default 'medium',
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table dev_tasks enable row level security;

create policy "Users can view own dev tasks" on dev_tasks for select
  using (auth_is_admin() and auth.uid() = user_id);
create policy "Users can insert own dev tasks" on dev_tasks for insert
  with check (auth_is_admin() and auth.uid() = user_id);
create policy "Users can update own dev tasks" on dev_tasks for update
  using (auth_is_admin() and auth.uid() = user_id);
create policy "Users can delete own dev tasks" on dev_tasks for delete
  using (auth_is_admin() and auth.uid() = user_id);

create index idx_dev_tasks_user_status on dev_tasks(user_id, status);
create index idx_dev_tasks_user_priority on dev_tasks(user_id, priority);
create index idx_dev_tasks_user_created_at on dev_tasks(user_id, created_at desc);

create trigger update_dev_tasks_updated_at
  before update on dev_tasks
  for each row execute function update_updated_at_column();

-- ============================================================
-- event_templates (reusable schedule-event templates)
-- ============================================================
create table event_templates (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  category_id uuid references event_categories(id) on delete set null,
  title text not null,
  default_duration_minutes integer not null default 30,
  is_system_template boolean default false,
  created_at timestamptz default now()
);

alter table event_templates enable row level security;

create policy "Users can view own or system templates" on event_templates for select
  using (auth.uid() = user_id or is_system_template = true);
create policy "Users can insert own templates" on event_templates for insert
  with check (auth.uid() = user_id);
create policy "Users can update own templates" on event_templates for update
  using (auth.uid() = user_id);
create policy "Users can delete own non-system templates" on event_templates for delete
  using (auth.uid() = user_id and is_system_template = false);

create index idx_event_templates_user_id on event_templates(user_id);
create index idx_event_templates_is_system on event_templates(is_system_template);
