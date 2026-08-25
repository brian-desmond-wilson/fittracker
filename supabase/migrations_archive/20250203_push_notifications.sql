-- Push notifications support
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

create table if not exists sent_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references schedule_events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table push_subscriptions enable row level security;
alter table sent_notifications enable row level security;

create policy "Users can view own push subscriptions"
  on push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own push subscriptions"
  on push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own push subscriptions"
  on push_subscriptions for delete
  using (auth.uid() = user_id);

create policy "Users can view own sent notifications"
  on sent_notifications for select
  using (auth.uid() = user_id);

create policy "Users can insert own sent notifications"
  on sent_notifications for insert
  with check (auth.uid() = user_id);

create index if not exists idx_push_subscriptions_user
  on push_subscriptions(user_id);

create index if not exists idx_push_subscriptions_endpoint
  on push_subscriptions(endpoint);
