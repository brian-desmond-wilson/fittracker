-- Retire the legacy web-push notification stack.
--
-- push_subscriptions and sent_notifications were only ever used by the
-- send-notifications edge function, which delivered W3C web push to the
-- now-removed /app2 web PWA. The mobile app registers no push subscriptions and
-- schedules schedule-event notifications locally on-device, so these tables are
-- orphaned. The edge function and its cron have been removed alongside this.

drop table if exists public.sent_notifications;
drop table if exists public.push_subscriptions;
