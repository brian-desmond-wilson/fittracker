// mobile/src/lib/expiryPolicy.ts
// The ONE definition of "needs expiry attention" and "too old to keep
// counting" — extracted because the hub and the Inventory screen previously
// computed "expiring" with different rules (the hub included out-of-stock
// items; the screen filtered them out), and because the "expired" band has no
// lower bound: without an aging rule, an item that expired 546 days ago
// polluted the counts forever (the 2026-08-11 live-data audit found 17 of 22
// items in exactly that state).
//
// Semantics (Inventory critique C1 + C3, ruled 2026-08-11):
// - "attention" = expired-within-grace, expires today, or expires within the
//   EXPIRING_SOON_DAYS window. These are actionable: use it or toss it.
// - "stale" = expired for MORE than the grace window. The record has stopped
//   describing food and started describing history — it leaves every count
//   and waits for the audit/review flow instead.
// - Grace is category-aware: perishables (use-by semantics — dairy, produce,
//   meat…) age out after PERISHABLE_GRACE_DAYS; shelf-stable goods (best-by
//   semantics — drinks, snacks, pantry…) get SHELF_STABLE_GRACE_DAYS, because
//   a Red Bull three months past its best-by is stock, not spoilage.
// - An item carrying ANY perishable category is perishable: the perishable
//   component is what actually rots, so the short grace wins.
// - No categories, or only unknown names → perishable. The conservative
//   default surfaces the item for review sooner rather than quietly keeping
//   it on the books longer.
import type { ItemStockState } from "./stockState";

export const PERISHABLE_GRACE_DAYS = 14;
export const SHELF_STABLE_GRACE_DAYS = 90;

/** Category names exactly as they exist in prod (`food_categories.name`).
 *  Everything not listed here is treated as perishable — including the
 *  "All Products" / "Out of Stock" pseudo-categories, which real items do not
 *  carry as their only category. */
const SHELF_STABLE_CATEGORIES = new Set([
  "Beverages",
  "Snacks",
  "Pantry",
  "Breakfast Foods",
  "Frozen",
]);

export function expiryGraceDays(categoryNames?: readonly string[]): number {
  const names = categoryNames ?? [];
  const shelfStable =
    names.length > 0 && names.every((n) => SHELF_STABLE_CATEGORIES.has(n));
  return shelfStable ? SHELF_STABLE_GRACE_DAYS : PERISHABLE_GRACE_DAYS;
}

export type ExpiryReview = "ok" | "attention" | "stale";

/** Classify one item's expiry state under the aging policy. Reads only the
 *  projected `expiration` band and signed `daysLeft` — never the raw date. */
export function reviewExpiry(
  state: Pick<ItemStockState, "expiration" | "daysLeft">,
  categoryNames?: readonly string[],
): ExpiryReview {
  const band = state.expiration;
  if (band === null || band === "later") return "ok";
  if (band === "today" || band === "soon") return "attention";
  // band === "expired". daysLeft is the signed projection value (negative);
  // null means "expired, age unknown" — a synthetic input real projection
  // never produces. Unknown age must surface for review, never age out.
  if (state.daysLeft === null) return "attention";
  return -state.daysLeft > expiryGraceDays(categoryNames) ? "stale" : "attention";
}

/** C3's single "expiring" definition. Both the Loop Hub's inventory station
 *  and the Inventory screen's expiring section MUST consume this — do not
 *  re-derive from bands at a call site. Out-of-stock items are excluded (no
 *  food to use or toss); stale items are excluded (they belong to the review
 *  flow, not the urgency panel). */
export function isExpiringSoon(
  state: Pick<ItemStockState, "isOut" | "expiration" | "daysLeft">,
  categoryNames?: readonly string[],
): boolean {
  return !state.isOut && reviewExpiry(state, categoryNames) === "attention";
}

/** Long-expired under the aging policy: excluded from every live count,
 *  queued for the audit/review flow (critique item C1). */
export function isStaleExpired(
  state: Pick<ItemStockState, "expiration" | "daysLeft">,
  categoryNames?: readonly string[],
): boolean {
  return reviewExpiry(state, categoryNames) === "stale";
}

/** Sweep E4: typical shelf life by category, in days — DISPLAY-LAYER ONLY.
 *  An estimate is a hint the UI shows beside a missing date ("typically lasts
 *  ~2 weeks — set a date"); it is never written to expiration_date, because a
 *  fabricated date would flow into bands, counts, and the aging policy as if
 *  a human had read it off the package. Mixed items estimate by their most
 *  perishable component; unknown categories estimate nothing. */
const TYPICAL_SHELF_LIFE_DAYS: Record<string, number> = {
  "Produce": 7,
  "Meat & Seafood": 5,
  "Dairy, Cheese & Eggs": 14,
  "Deli & Prepared Foods": 5,
  "Breads & Bakery": 7,
  "Frozen": 180,
  "Snacks": 180,
  "Beverages": 270,
  "Breakfast Foods": 270,
  "Pantry": 365,
};

export function estimateShelfLifeDays(categoryNames?: readonly string[]): number | null {
  const known = (categoryNames ?? [])
    .map((n) => TYPICAL_SHELF_LIFE_DAYS[n])
    .filter((d): d is number => d !== undefined);
  return known.length > 0 ? Math.min(...known) : null;
}
