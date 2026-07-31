// Suggest-confirm shopping demand (Nutrition OS Phase 5, spec §6). Pure —
// the seventh sibling lib. Four sources with fixed priorities; two dedupe
// layers; nothing here writes anything — suggestions become shopping_list
// rows only when the owner taps.
import type { ConsumptionEstimate } from "./consumptionRate";

export const FORECAST_LEAD_DAYS = 3;

export interface DemandInventoryItem {
  id: string;
  name: string;
  unit: string | null;
  preferredVendorId: string | null;
  /** lowThresholdFor(item) — the same value isLow compares against. */
  lowThreshold: number;
  totalQuantity: number;
  isOut: boolean;
  isLow: boolean;
}

export interface MealGap {
  mealName: string;
  missing: string[];
}

export interface UnpurchasedRow {
  foodInventoryId: string | null;
  name: string;
}

export interface ShoppingSuggestion {
  name: string;
  foodInventoryId: string | null;
  vendorId: string | null;
  quantity: number;
  unit: string | null;
  priority: 1 | 2 | 3;
  reasons: string[];
}

const fold = (s: string) => s.trim().toLowerCase();

interface Draft extends ShoppingSuggestion {
  /** Threshold-formula quantities beat the default 1 on merge (spec §6). */
  thresholdQuantity: boolean;
}

export function computeShoppingSuggestions(opts: {
  items: DemandInventoryItem[];
  mealGaps: MealGap[];
  rates: Map<string, ConsumptionEstimate>;
  unpurchased: UnpurchasedRow[];
}): ShoppingSuggestion[] {
  const { items, mealGaps, rates, unpurchased } = opts;
  const byId = new Map(items.map((it) => [it.id, it]));
  const byName = new Map(items.map((it) => [fold(it.name), it]));

  // key = inventory id when known, else folded name (the merge identity).
  const drafts = new Map<string, Draft>();

  const upsert = (
    key: string,
    base: Omit<Draft, "priority" | "reasons" | "quantity" | "thresholdQuantity">,
    priority: 1 | 2 | 3,
    reason: string,
    quantity: number,
    thresholdQuantity: boolean,
  ) => {
    const existing = drafts.get(key);
    if (!existing) {
      drafts.set(key, { ...base, priority, reasons: [reason], quantity, thresholdQuantity });
      return;
    }
    existing.priority = Math.min(existing.priority, priority) as 1 | 2 | 3;
    existing.reasons.push(reason);
    if (thresholdQuantity && !existing.thresholdQuantity) {
      existing.quantity = quantity;
      existing.thresholdQuantity = true;
    }
    // A merge may also teach a name-only draft its inventory identity.
    if (existing.foodInventoryId === null && base.foodInventoryId !== null) {
      existing.foodInventoryId = base.foodInventoryId;
      existing.vendorId = base.vendorId;
      existing.unit = base.unit;
    }
  };

  const itemBase = (it: DemandInventoryItem) => ({
    name: it.name,
    foodInventoryId: it.id,
    vendorId: it.preferredVendorId,
    unit: it.unit,
  });
  const exitLowQty = (it: DemandInventoryItem) =>
    Math.max(1, it.lowThreshold - it.totalQuantity + 1);

  // Source order fixes the reason ordering within a merged suggestion:
  // out → meals → low → forecast (spec §6 table order).
  for (const it of items) {
    if (it.isOut) upsert(it.id, itemBase(it), 1, "out of stock", exitLowQty(it), true);
  }
  for (const gap of mealGaps) {
    for (const missingName of gap.missing) {
      const match = byName.get(fold(missingName));
      const key = match ? match.id : fold(missingName);
      const base = match
        ? itemBase(match)
        : { name: missingName, foodInventoryId: null, vendorId: null, unit: null };
      upsert(key, base, 1, `needed for ${gap.mealName}`, 1, false);
    }
  }
  for (const it of items) {
    if (it.isLow) {
      upsert(it.id, itemBase(it), 2, `below threshold (${it.totalQuantity} left)`, exitLowQty(it), true);
    }
  }
  for (const it of items) {
    const est = rates.get(it.id);
    if (!est || it.isOut || it.isLow) continue;
    if (est.daysUntilOut <= FORECAST_LEAD_DAYS) {
      upsert(it.id, itemBase(it), 3, `~${est.daysUntilOut}d left at your pace`, 1, false);
    }
  }

  // Suppression: anything already on the (unpurchased) list, by id or name.
  const suppressedIds = new Set(
    unpurchased.map((r) => r.foodInventoryId).filter((x): x is string => x !== null),
  );
  const suppressedNames = new Set(unpurchased.map((r) => fold(r.name)));

  return [...drafts.values()]
    .filter(
      (d) =>
        !(d.foodInventoryId !== null && suppressedIds.has(d.foodInventoryId)) &&
        !suppressedNames.has(fold(d.name)),
    )
    .map(({ thresholdQuantity: _tq, ...s }) => s)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}
