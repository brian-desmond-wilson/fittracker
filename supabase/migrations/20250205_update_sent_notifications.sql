-- Update sent_notifications to track notification date per user/event
alter table sent_notifications
  add column if not exists notification_date date not null default current_date;

alter table sent_notifications
  drop constraint if exists sent_notifications_event_id_user_id_key;

alter table sent_notifications
  add constraint sent_notifications_event_id_user_id_notification_date_key
    unique (event_id, user_id, notification_date);

create index if not exists idx_sent_notifications_event_user_date
  on sent_notifications(event_id, user_id, notification_date);

alter table sent_notifications
  alter column notification_date drop default;
