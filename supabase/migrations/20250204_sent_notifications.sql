-- Track notifications that have already been delivered so we don't resend
create table if not exists sent_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references schedule_events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table sent_notifications enable row level security;

create policy "Users can view own sent notifications"
  on sent_notifications for select
  using (auth.uid() = user_id);

create policy "Users can insert own sent notifications"
  on sent_notifications for insert
  with check (auth.uid() = user_id);

create index if not exists idx_sent_notifications_event_user
  on sent_notifications(event_id, user_id);
