-- Migration: Fix Function Search Path Mutable Warnings
-- Description: Sets search_path on all functions to prevent search path injection attacks
-- Setting search_path = '' requires fully qualified names, which is the most secure option

-- Update trigger functions
ALTER FUNCTION public.update_sleep_sessions_updated_at() SET search_path = '';
ALTER FUNCTION public.update_morning_routine_templates_updated_at() SET search_path = '';
ALTER FUNCTION public.update_morning_routine_tasks_updated_at() SET search_path = '';
ALTER FUNCTION public.update_morning_routine_completions_updated_at() SET search_path = '';
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.update_exercise_standards_updated_at() SET search_path = '';

-- Update utility functions
ALTER FUNCTION public.get_movement_tier(uuid) SET search_path = '';
ALTER FUNCTION public.validate_movement_depth() SET search_path = '';
ALTER FUNCTION public.prevent_circular_reference() SET search_path = '';
ALTER FUNCTION public.auth_is_admin() SET search_path = '';
ALTER FUNCTION public.migrate_single_location_items() SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
