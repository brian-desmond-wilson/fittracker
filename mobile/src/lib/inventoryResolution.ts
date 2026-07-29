// Resolves a meal item's saved food to the inventory row its logging should
// decrement (spec §7.3). Pure so it is unit-testable; the query module
// assembles the inputs. Precedence:
//   1. exact barcode match — TERMINAL regardless of stock. A barcode hit
//      positively identifies the product; if that row is empty there is simply
//      nothing to decrement, and falling through would decrement a different
//      SKU that merely shares a concept.
//   2. unique shared-concept match with stock (2+ candidates = ambiguous,
//      0 = none; both skip — under-matching is the intended failure mode)
export interface ResolutionItem {
  savedFoodId: string;
  barcode: string | null;
  conceptIds: string[];
}

export interface ResolutionInventoryRow {
  id: string;
  barcode: string | null;
  /** Sum of location quantities, or the legacy quantity for location-less rows. */
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
    // Searched against the FULL inventory, not just in-stock rows — see the
    // precedence note above. The falsy-barcode guard is load-bearing: it makes
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
    if (candidates.length === 1) out.set(it.savedFoodId, candidates[0].id);
  }
  return out;
}
