// Resolves a meal item's saved food to the inventory row its logging should
// decrement (spec §7.3). Pure so it is unit-testable; the query module
// assembles the inputs. Precedence:
//   1. exact barcode match with stock
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
  const out = new Map<string, string>();
  const inStock = inventory.filter((r) => r.totalQuantity > 0);
  for (const it of items) {
    const byBarcode = it.barcode
      ? inStock.find((r) => r.barcode === it.barcode)
      : undefined;
    if (byBarcode) {
      out.set(it.savedFoodId, byBarcode.id);
      continue;
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
