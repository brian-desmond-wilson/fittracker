// THE stock projection AND the meal-assemblability read on top of it
// (Nutrition OS Phase 4). Pure, no I/O. Two exports carry the module:
//   • `projectItemStock` — per-item quantities, low/out/restock flags and the
//     expiration band (spec §5.1). Replaces the three byte-identical client
//     computations (FoodInventoryScreen and the two detail/edit routes) and
//     the four dropped stock views.
//   • `assessAssemblability` — "can this meal be made right now", plus the
//     most urgent expiring ingredient it uses (spec §5.2). Read by the Meal
//     Library surfaces and, via `buildStockByMealId`, by the recommender.
// Locations are the only quantity truth — storage_type never branches
// quantity math; it survives solely as a threshold-semantics + UI
// presentation hint. Threshold semantics are pinned to the SHIPPED UI, not
// the dropped views (the views OR'd thresholds and ignored
// requires_refrigeration).
import {
  resolveInventoryMatches,
  type ResolutionInventoryRow,
} from "./inventoryResolution";

export const EXPIRING_SOON_DAYS = 7;

export type ExpirationBand = "expired" | "today" | "soon" | "later";

export interface StockItemInput {
  storage_type: string | null;
  restock_threshold: number | null;
  fridge_restock_threshold: number | null;
  total_restock_threshold: number | null;
  requires_refrigeration: boolean | null;
  expiration_date: string | null; // YYYY-MM-DD
}

export interface StockLocationRow {
  id: string;
  location: string;
  quantity: number;
  is_ready_to_consume: boolean;
}

/**
 * The only two fields `projectItemStock` reads off a location row. Callers
 * that HAVE real rows (`fetchInventoryWithState`, the add/preview routes) pass
 * `StockLocationRow`s and are unaffected — this is a widening. Callers that
 * only have quantities (Task 8's Meal Library fetch, which selects
 * `locations:food_inventory_locations(quantity, is_ready_to_consume)`) no
 * longer have to fabricate an `id` and a `location: ""` that nothing reads and
 * that no `location` CHECK would accept. Deferred to Task 8 by Task 1's
 * review; folded in here because Task 8 touches this call anyway.
 */
export type StockQuantityRow = Pick<
  StockLocationRow,
  "quantity" | "is_ready_to_consume"
>;

export interface ItemStockState {
  totalQuantity: number;
  readyQuantity: number;
  storageQuantity: number;
  isOut: boolean;
  isLow: boolean;
  needsFridgeRestock: boolean;
  expiration: ExpirationBand | null;
  daysLeft: number | null;
}

/** Whole-day difference between two local YYYY-MM-DD strings (b − a). */
export function daysBetweenLocalDates(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map((s) => parseInt(s, 10));
  const [by, bm, bd] = b.split("-").map((s) => parseInt(s, 10));
  // Local-noon anchors sidestep DST edges: a midnight anchor could land on
  // either side of a spring-forward/fall-back transition and shift the
  // whole-day diff by an hour; noon is never within an hour of a transition.
  const da = new Date(ay, am - 1, ad, 12).getTime();
  const db = new Date(by, bm - 1, bd, 12).getTime();
  return Math.round((db - da) / 86_400_000);
}

/** The threshold `isLow` compares against — exported for the demand engine's
 *  restock-quantity math (spec §6). One definition; projectItemStock uses it. */
export function lowThresholdFor(item: StockItemInput): number {
  return item.storage_type === "single-location"
    ? item.restock_threshold ?? 0
    : item.total_restock_threshold ?? 0;
}

export function projectItemStock(opts: {
  item: StockItemInput;
  locations: ReadonlyArray<StockQuantityRow>;
  todayLocalDate: string;
}): ItemStockState {
  const { item, locations, todayLocalDate } = opts;
  const totalQuantity = locations.reduce((s, l) => s + l.quantity, 0);
  const readyQuantity = locations
    .filter((l) => l.is_ready_to_consume)
    .reduce((s, l) => s + l.quantity, 0);
  const storageQuantity = totalQuantity - readyQuantity;

  // Anything that isn't exactly "single-location" — including a null/unknown
  // storage_type — is treated as multi-location. Real rows can't hit this:
  // storage_type is NOT NULL with a two-value CHECK. Synthetic callers (e.g.
  // Task 8's assemblability inputs) can pass null; that's intentional here,
  // not an oversight.
  const single = item.storage_type === "single-location";
  const lowThreshold = lowThresholdFor(item);
  const isLow = totalQuantity > 0 && totalQuantity <= lowThreshold;

  const needsFridgeRestock =
    !single &&
    item.requires_refrigeration === true &&
    (item.fridge_restock_threshold ?? 0) > 0 &&
    readyQuantity <= (item.fridge_restock_threshold ?? 0);

  let expiration: ExpirationBand | null = null;
  let daysLeft: number | null = null;
  if (item.expiration_date) {
    const rawDaysLeft = daysBetweenLocalDates(todayLocalDate, item.expiration_date);
    if (Number.isFinite(rawDaysLeft)) {
      daysLeft = rawDaysLeft;
      expiration =
        daysLeft < 0 ? "expired"
        : daysLeft === 0 ? "today"
        : daysLeft <= EXPIRING_SOON_DAYS ? "soon"
        : "later";
    }
    // Else: an unparseable expiration_date behaves as "no date" rather than
    // poisoning downstream comparisons — NaN is silently false in every
    // band/filter comparison (NaN < 0, NaN === 0, NaN <= 7 all false), which
    // would otherwise land the row in "later" carrying daysLeft: NaN and
    // defeat callers that treat `daysLeft === null` as the "skip" case.
  }

  return {
    totalQuantity,
    readyQuantity,
    storageQuantity,
    isOut: totalQuantity === 0,
    isLow,
    needsFridgeRestock,
    expiration,
    daysLeft,
  };
}

export interface AssemblabilityInventoryRow extends ResolutionInventoryRow {
  name: string;
  /** From projectItemStock().daysLeft — null when no expiration date. */
  daysLeft: number | null;
}

export interface MealAssemblability {
  assemblable: boolean;
  /**
   * Saved-food display names, in meal item order, that we CHECKED FOR and did
   * not find. These are groceries: the ingredient is identifiable (it carries
   * a barcode or a concept link) and no in-stock row answers to it, so buying
   * one would genuinely close the gap.
   */
  missing: string[];
  /**
   * Ingredients we could not check at all — no barcode and no concept link, so
   * nothing in the inventory could ever match them however full the fridge is.
   *
   * Kept separate from `missing` because conflating them makes the app lie in
   * two directions at once: it reports a curation gap as a shopping need (the
   * "unassigned" rows that pile up on the list for food already in the
   * kitchen), and it reports "you are out of X" when the truth is "nobody has
   * told me what X is". Same epistemics as an item-less meal in `eatNext`:
   * absence of evidence, not evidence of absence.
   */
  unlinked: string[];
  expiringItemName: string | null;
  expiringDaysLeft: number | null;
}

/**
 * "Can I make this meal right now?" — resolution reuses Phase 2's
 * resolveInventoryMatches verbatim (barcode terminal, else unique shared
 * concept among in-stock rows). An item that resolves to nothing blocks the
 * verdict: under-claiming is the honest failure mode. Duplicate resolution
 * (two items → one container) satisfies both — v1 units are containers.
 *
 * What it does NOT do is claim to know WHY an item failed to resolve. That
 * split — `missing` (checked, absent) versus `unlinked` (uncheckable) — is
 * the difference between a shopping list and a curation queue; see the field
 * docs above.
 */
export function assessAssemblability(opts: {
  items: Array<{ savedFoodId: string; name: string; barcode: string | null; conceptIds: string[] }>;
  inventory: AssemblabilityInventoryRow[];
}): MealAssemblability {
  const { items, inventory } = opts;
  const matches = resolveInventoryMatches(items, inventory);

  // An item with neither a barcode nor a concept link cannot match ANY row —
  // `resolveInventoryMatches` has nothing to compare on, so it falls through
  // both arms regardless of what is in stock. Failing that test says something
  // about our records, not about the kitchen, so it is reported separately.
  // The falsy barcode check mirrors the resolver's own, which treats an empty
  // string as no barcode.
  const uncheckable = (it: { barcode: string | null; conceptIds: string[] }) =>
    !it.barcode && it.conceptIds.length === 0;

  const unresolved = items.filter((it) => !matches.has(it.savedFoodId));
  const missing = unresolved.filter((it) => !uncheckable(it)).map((it) => it.name);
  const unlinked = unresolved.filter(uncheckable).map((it) => it.name);

  // "Expiring" is a rescue signal (eat this soon), not a spoilage report:
  // bounded below at 0 so already-expired rows (daysLeft < 0) never win the
  // minimum — they're a throw-out, not a rescue, and can't share the
  // "expires in {n}d" copy template. Day 0 (expires today) is retained.
  const byId = new Map(inventory.map((r) => [r.id, r]));
  let expiringItemName: string | null = null;
  let expiringDays: number | null = null;
  for (const invId of new Set(matches.values())) {
    const row = byId.get(invId);
    if (!row) continue;
    const d = row.daysLeft;
    if (d === null || d < 0 || d > EXPIRING_SOON_DAYS) continue;
    // Strict `<` (not `<=`): on a tie, the first-encountered row wins, which
    // — since matches preserves meal-item insertion order — means the
    // earlier meal item's resolution wins. Deliberate, not incidental.
    if (expiringDays === null || d < expiringDays) {
      expiringItemName = row.name;
      expiringDays = d;
    }
  }

  return {
    // Unchanged: an unresolved item still blocks the verdict whichever bucket
    // it lands in. We cannot claim you can make a meal containing something we
    // cannot account for — the split refines the EXPLANATION, not the answer.
    assemblable: items.length > 0 && unresolved.length === 0,
    missing,
    unlinked,
    expiringItemName,
    expiringDaysLeft: expiringDays,
  };
}
