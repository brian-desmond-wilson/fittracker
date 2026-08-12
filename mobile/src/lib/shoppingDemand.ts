// Suggest-confirm shopping demand (Nutrition OS Phase 5, spec §6). Pure —
// sibling of stockState/eatNext/mealScore/rampProgress/conceptMatch/
// consumptionRate. Four sources with fixed priorities; two dedupe layers;
// nothing here writes anything — suggestions become shopping_list rows
// only when the owner taps.
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
  /**
   * Resupplied on a delivery cadence rather than bought when low. Optional so
   * every existing caller and test keeps compiling; absent reads as false.
   *
   * These items are excluded from ALL FOUR sources, not just the three that
   * read stock. A meal gap naming one would otherwise resurrect it through
   * the name-keyed path, which is exactly the case a Thistle meal hits: the
   * meal IS the item, so an eaten one is simultaneously out of stock and
   * missing from its own meal. Both readings are true and neither is worth
   * telling you about — the next delivery is already on its way.
   */
  scheduledSupply?: boolean;
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
  const { items: allItems, mealGaps, rates, unpurchased } = opts;

  // Split once, at the top: the three stock-driven sources below simply never
  // see a scheduled-supply item, and the name set catches the fourth (meal
  // gaps), which keys on a name rather than an id. Names are folded the same
  // way the suppression layer at the foot of this function folds them.
  const items = allItems.filter((it) => it.scheduledSupply !== true);
  const scheduledNames = new Set(
    allItems.filter((it) => it.scheduledSupply === true).map((it) => fold(it.name)),
  );
  // last-wins on a folded-name collision between two inventory items: the
  // meal-gap reason attaches to whichever came later in `items`. Defensible
  // under the id-first merge identity (two distinct items still produce two
  // suggestions via their own id keys) — a deliberate choice, not an
  // oversight.
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

  // Suppression: anything already on the (unpurchased) list. Per row, id
  // else name (spec §6) — a row with a known foodInventoryId suppresses by
  // id ONLY; a row without one (typed manually, or orphaned by a deleted
  // item via shopping_list.food_inventory_id's ON DELETE SET NULL)
  // suppresses by case-folded name. food_inventory has no unique constraint
  // on name, so folding every row's name into the suppression set — even
  // id-carrying rows — would let an unpurchased row for item A silently
  // drop a suggestion for a distinct item B that merely shares its name.
  // Accepted residual, the other direction: if an item is renamed after its
  // list row was created, that row's now-stale `name` won't id-match a
  // fresh name-only suggestion for the same item (e.g. a meal gap citing
  // the item's current display name) — a visible duplicate the owner can
  // decline in this suggest-confirm UI, not a silent drop. See the Task 4
  // amendment.
  const suppressedIds = new Set(
    unpurchased.map((r) => r.foodInventoryId).filter((x): x is string => x !== null),
  );
  const suppressedNames = new Set(
    unpurchased.filter((r) => r.foodInventoryId === null).map((r) => fold(r.name)),
  );

  return [...drafts.values()]
    .filter(
      (d) =>
        !(d.foodInventoryId !== null && suppressedIds.has(d.foodInventoryId)) &&
        !suppressedNames.has(fold(d.name)) &&
        !scheduledNames.has(fold(d.name)),
    )
    .map(({ thresholdQuantity: _tq, ...s }) => s)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}
