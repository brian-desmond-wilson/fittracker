// Resolves a meal item's saved food to the inventory row its logging should
// decrement (spec §7.3). Pure so it is unit-testable; the query module
// assembles the inputs. Precedence:
//   1. product identity — an inventory row that SAYS it is a package of this
//      product (`food_inventory.saved_food_id`, 2026-08-19 spec). In-stock
//      rows win; an empty identity row is TERMINAL for the same reason a
//      barcode hit is: the product is positively identified, there is simply
//      nothing left of it, and falling through to a concept match would
//      decrement a different product of the same type while claiming this one.
//   2. exact barcode match — TERMINAL regardless of stock. A barcode hit
//      positively identifies the product; if that row is empty there is simply
//      nothing to decrement, and falling through would decrement a different
//      SKU that merely shares a concept. Kept as the belt under the FK: rows
//      the backfill could not stamp still resolve.
//   3. shared-concept match with stock. 0 candidates = none (under-matching
//      stays the honest failure mode for ABSENCE). 2+ candidates: pick
//      deterministically — soonest expiration, then largest quantity, then id.
//      DESIGN CHANGE (inventory refinement Phase 3, 2026-08-11): plurality
//      used to collapse to absence ("ambiguous = skip"), which meant owning
//      TWO stocked oatmeals made oatmeal unavailable. That inverted the
//      system's goal the moment the AI concept backfill linked a second
//      product to an existing concept in prod. Duplicate stocked products
//      sharing a concept are normal kitchen reality, not an error state; the
//      soonest-expiring pick is the use-it-first behavior a person would want,
//      and determinism keeps logging reproducible.
export interface ResolutionItem {
  savedFoodId: string;
  barcode: string | null;
  conceptIds: string[];
}

export interface ResolutionInventoryRow {
  id: string;
  /** The product this stock is a package of — identity, not substitution.
   *  Optional because synthetic callers predate the column; absent reads as
   *  unstamped and resolution falls through to barcode, then concept. */
  savedFoodId?: string | null;
  barcode: string | null;
  /** Days until expiry when known (negative = expired). Optional because the
   *  logging path's rows carry it and synthetic callers may not; a null/absent
   *  date sorts AFTER any dated candidate — use dated stock first. */
  daysLeft?: number | null;
  /**
   * Σ of the item's `food_inventory_locations.quantity` rows — the ONLY stock
   * truth (spec §5.1). There is no legacy arm and there must never be one:
   * `food_inventory.quantity` is a maintained cache that this phase stopped
   * reading everywhere (`mealLibrary.ts` is the only producer of these rows,
   * and `foodInventoryMatchService.ts` projects the same way). A row with no
   * location rows is therefore 0 — genuinely out of stock as far as every
   * reader is concerned — NOT a cue to fall back to the cache. Restoring a
   * `locations.length > 0 ? … : quantity` fallback here re-arms the exact
   * divergence Phase 4 exists to close, including the consume RPC's legacy
   * decrement branch.
   */
  totalQuantity: number;
  conceptIds: string[];
}

export function resolveInventoryMatches(
  items: ResolutionItem[],
  inventory: ResolutionInventoryRow[],
): Map<string, string> {
  // Keyed by savedFoodId, which is unambiguous only because meal_items carries
  // a unique (meal_id, saved_food_id) constraint: a saved food appears at most
  // once per meal. Note two DIFFERENT saved foods may still resolve to the same
  // inventory id — callers must de-duplicate before consuming stock.
  const out = new Map<string, string>();
  const inStock = inventory.filter((r) => r.totalQuantity > 0);
  for (const it of items) {
    // Tier 1: identity. Prefer an in-stock package of the exact product; if
    // every package of it is empty, that is the answer (terminal), not a cue
    // to substitute — see the precedence note above.
    const identityRows = inventory.filter((r) => r.savedFoodId === it.savedFoodId);
    if (identityRows.length > 0) {
      const stocked = identityRows
        .filter((r) => r.totalQuantity > 0)
        .sort((a, b) => {
          const ad = a.daysLeft ?? Infinity;
          const bd = b.daysLeft ?? Infinity;
          return ad - bd || b.totalQuantity - a.totalQuantity || a.id.localeCompare(b.id);
        });
      if (stocked.length > 0) out.set(it.savedFoodId, stocked[0].id);
      continue;
    }
    // Tier 2: barcode. Searched against the FULL inventory, not just in-stock
    // rows — see the precedence note above. The falsy-barcode guard is load-bearing: it makes
    // a null === null false match structurally impossible, and correctly treats
    // an empty-string barcode as "no barcode".
    const barcodeRow = it.barcode
      ? inventory.find((r) => r.barcode === it.barcode)
      : undefined;
    if (barcodeRow) {
      if (barcodeRow.totalQuantity > 0) out.set(it.savedFoodId, barcodeRow.id);
      continue; // barcode identified the product; if it's empty, nothing to decrement
    }
    if (it.conceptIds.length === 0) continue;
    const wanted = new Set(it.conceptIds);
    const candidates = inStock.filter((r) =>
      r.conceptIds.some((cid) => wanted.has(cid)),
    );
    if (candidates.length === 0) continue;
    const winner = [...candidates].sort((a, b) => {
      const ad = a.daysLeft ?? Infinity;   // undated after dated: use dated stock first
      const bd = b.daysLeft ?? Infinity;
      if (ad !== bd) return ad - bd;       // soonest expiration first
      if (a.totalQuantity !== b.totalQuantity) return b.totalQuantity - a.totalQuantity;
      return a.id < b.id ? -1 : 1;         // total order — resolution is reproducible
    })[0];
    out.set(it.savedFoodId, winner.id);
  }
  return out;
}
