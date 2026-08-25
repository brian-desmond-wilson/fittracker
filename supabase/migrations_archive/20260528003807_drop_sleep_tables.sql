-- Drops the sleep tracking feature: tables, trigger function, and policies.
-- Originally defined across:
--   mobile/supabase/migrations/20251014232400_create_sleep_tables.sql (sleep_sessions)
--   supabase/migrations/20250206_tracking_tables.sql (sleep_logs)
--   supabase/migrations/20250208_complete_tracking_schema.sql (sleep_logs redefinition)
-- Note: sleep_logs is recreated by the 20250208 migration. To prevent reintroduction
-- on a fresh DB rebuild, that migration's sleep_logs block was left intact for
-- historical accuracy; this DROP runs after it so the end state is correct.

DROP TABLE IF EXISTS public.sleep_sessions CASCADE;
DROP TABLE IF EXISTS public.sleep_logs CASCADE;
DROP FUNCTION IF EXISTS public.update_sleep_sessions_updated_at();
