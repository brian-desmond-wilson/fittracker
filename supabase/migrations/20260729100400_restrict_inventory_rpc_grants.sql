-- Nutrition OS Phase 2 follow-up: deny `anon` EXECUTE on the inventory RPCs.
--
-- 20260729100100 did `revoke all on function ... from public`, intending that
-- only `authenticated` may execute these. That does NOT achieve it: Supabase
-- grants EXECUTE to `anon` and `authenticated` directly, not via the PUBLIC
-- pseudo-role, so revoking from PUBLIC leaves the direct `anon` grant intact.
-- Verified against prod on 2026-07-29 (post-apply): a caller holding only the
-- anon key could invoke both functions.
--
-- This was never exploitable. Both functions are `security invoker`, so RLS
-- applies and an unauthenticated caller has a NULL auth.uid(), which matches
-- no rows. Confirmed empirically on a real in-stock row: the call returned
-- consumed = 0 and food_inventory.quantity was unchanged.
--
-- So this migration is defense in depth: it closes the gap at the grant layer
-- so the restriction no longer rests solely on RLS. Forward-only and safe --
-- it removes a privilege that nothing legitimate uses.

revoke execute on function public.consume_inventory_units(uuid[]) from anon;
revoke execute on function public.refund_inventory_units(uuid[]) from anon;
