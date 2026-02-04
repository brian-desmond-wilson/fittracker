-- Migration: Fix Security Definer Views
-- Description: Changes 7 views from SECURITY DEFINER to SECURITY INVOKER
-- This ensures the views respect RLS policies of the underlying tables

-- Set all views to use SECURITY INVOKER (respects RLS)
ALTER VIEW public.expiring_soon_items SET (security_invoker = true);
ALTER VIEW public.out_of_stock_items SET (security_invoker = true);
ALTER VIEW public.daily_water_summary SET (security_invoker = true);
ALTER VIEW public.low_stock_items SET (security_invoker = true);
ALTER VIEW public.daily_nutrition_summary SET (security_invoker = true);
ALTER VIEW public.shopping_list_active SET (security_invoker = true);
ALTER VIEW public.food_inventory_with_locations SET (security_invoker = true);

-- Add comments for documentation
COMMENT ON VIEW public.expiring_soon_items IS 'Food items expiring within 7 days - uses SECURITY INVOKER to respect RLS';
COMMENT ON VIEW public.out_of_stock_items IS 'Food items with zero quantity - uses SECURITY INVOKER to respect RLS';
COMMENT ON VIEW public.daily_water_summary IS 'Daily water intake summary by user - uses SECURITY INVOKER to respect RLS';
COMMENT ON VIEW public.low_stock_items IS 'Food items at or below restock threshold - uses SECURITY INVOKER to respect RLS';
COMMENT ON VIEW public.daily_nutrition_summary IS 'Daily nutrition summary by user - uses SECURITY INVOKER to respect RLS';
COMMENT ON VIEW public.shopping_list_active IS 'Active (unpurchased) shopping list items - uses SECURITY INVOKER to respect RLS';
COMMENT ON VIEW public.food_inventory_with_locations IS 'Food inventory with location breakdown - uses SECURITY INVOKER to respect RLS';
