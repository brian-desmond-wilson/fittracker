import {
  projectItemStock,
  EXPIRING_SOON_DAYS,
  assessAssemblability,
  lowThresholdFor,
  type StockItemInput,
  type StockLocationRow,
  type AssemblabilityInventoryRow,
} from "../stockState";

const item = (over: Partial<StockItemInput> = {}): StockItemInput => ({
  storage_type: "multi-location",
  restock_threshold: 1,
  fridge_restock_threshold: null,
  total_restock_threshold: null,
  requires_refrigeration: false,
  expiration_date: null,
  ...over,
});
let locId = 0;
const loc = (quantity: number, ready = true): StockLocationRow => ({
  id: `l${locId++}`,
  location: "fridge",
  quantity,
  is_ready_to_consume: ready,
});
const TODAY = "2026-07-29";

describe("quantity projection — locations always, no storage_type branch", () => {
  it("sums total/ready/storage from location rows", () => {
    const s = projectItemStock({
      item: item(),
      locations: [loc(3, true), loc(5, false), loc(2, true)],
      todayLocalDate: TODAY,
    });
    expect(s).toMatchObject({ totalQuantity: 10, readyQuantity: 5, storageQuantity: 5 });
    expect(s.isOut).toBe(false);
  });
  it("single-location items also read locations (post-reconcile invariant)", () => {
    const s = projectItemStock({
      item: item({ storage_type: "single-location" }),
      locations: [loc(4, true)],
      todayLocalDate: TODAY,
    });
    expect(s.totalQuantity).toBe(4);
  });
  it("no locations → 0/out (reconcile guarantees this can't persist, but never NaN)", () => {
    const s = projectItemStock({ item: item(), locations: [], todayLocalDate: TODAY });
    expect(s.totalQuantity).toBe(0);
    expect(s.isOut).toBe(true);
    expect(s.isLow).toBe(false); // out ≠ low
  });
});

describe("thresholds — UI semantics preserved", () => {
  it("single-location low uses restock_threshold", () => {
    const s = projectItemStock({
      item: item({ storage_type: "single-location", restock_threshold: 2 }),
      locations: [loc(2)],
      todayLocalDate: TODAY,
    });
    expect(s.isLow).toBe(true);
  });
  it("multi-location low uses total_restock_threshold (null → 0 → never low while stocked)", () => {
    const low = projectItemStock({
      item: item({ total_restock_threshold: 4 }),
      locations: [loc(4)],
      todayLocalDate: TODAY,
    });
    const notLow = projectItemStock({
      item: item({ total_restock_threshold: null }),
      locations: [loc(1)],
      todayLocalDate: TODAY,
    });
    expect(low.isLow).toBe(true);
    expect(notLow.isLow).toBe(false);
  });
  it("needsFridgeRestock requires refrigeration AND positive threshold AND ready <= threshold", () => {
    const base = {
      item: item({ requires_refrigeration: true, fridge_restock_threshold: 2 }),
      locations: [loc(2, true), loc(9, false)],
      todayLocalDate: TODAY,
    };
    expect(projectItemStock(base).needsFridgeRestock).toBe(true);
    expect(
      projectItemStock({ ...base, item: item({ requires_refrigeration: false, fridge_restock_threshold: 2 }) })
        .needsFridgeRestock,
    ).toBe(false);
    expect(
      projectItemStock({ ...base, item: item({ requires_refrigeration: true, fridge_restock_threshold: 0 }) })
        .needsFridgeRestock,
    ).toBe(false);
    expect(
      projectItemStock({
        ...base,
        item: item({ requires_refrigeration: true, fridge_restock_threshold: 2, storage_type: "single-location" }),
      }).needsFridgeRestock,
    ).toBe(false); // multi-location concept only
    // pins the (threshold ?? 0) > 0 guard: no threshold configured, empty fridge stratum
    expect(
      projectItemStock({
        item: item({ requires_refrigeration: true, fridge_restock_threshold: null }),
        locations: [loc(9, false)],
        todayLocalDate: TODAY,
      }).needsFridgeRestock,
    ).toBe(false);
    // pins the <= boundary from above: ready stock exceeds the threshold
    expect(
      projectItemStock({ ...base, locations: [loc(3, true), loc(9, false)] }).needsFridgeRestock,
    ).toBe(false);
  });
});

describe("expiration banding", () => {
  const exp = (date: string | null) =>
    projectItemStock({ item: item({ expiration_date: date }), locations: [loc(1)], todayLocalDate: TODAY });
  it.each([
    ["2026-07-28", "expired", -1],
    ["2026-07-29", "today", 0],
    ["2026-07-30", "soon", 1],
    ["2026-08-05", "soon", EXPIRING_SOON_DAYS],
    ["2026-08-06", "later", EXPIRING_SOON_DAYS + 1],
  ])("%s → %s (daysLeft %i)", (date, band, days) => {
    const s = exp(date);
    expect(s.expiration).toBe(band);
    expect(s.daysLeft).toBe(days);
  });
  it("no date → null/null", () => {
    const s = exp(null);
    expect(s.expiration).toBeNull();
    expect(s.daysLeft).toBeNull();
  });
  it("malformed date → null/null, not NaN", () => {
    expect(exp("not-a-date")).toMatchObject({ expiration: null, daysLeft: null });
  });
});

const invRow = (o: Partial<AssemblabilityInventoryRow> = {}): AssemblabilityInventoryRow => ({
  id: "inv1",
  name: "Boost, Very High Calorie",
  barcode: null,
  totalQuantity: 1,
  conceptIds: [],
  daysLeft: null,
  ...o,
});
const mealItem = (o: Partial<{ savedFoodId: string; name: string; barcode: string | null; conceptIds: string[] }> = {}) => ({
  savedFoodId: "sf1",
  name: "Boost Very High Calorie",
  barcode: null,
  conceptIds: [] as string[],
  ...o,
});

describe("assessAssemblability", () => {
  it("assemblable when every item resolves to in-stock inventory", () => {
    const r = assessAssemblability({
      items: [mealItem({ conceptIds: ["boost"] })],
      inventory: [invRow({ conceptIds: ["boost"] })],
    });
    expect(r.assemblable).toBe(true);
    expect(r.missing).toEqual([]);
  });
  it("unresolvable item counts as missing (under-claiming is honest)", () => {
    const r = assessAssemblability({
      items: [mealItem({ name: "Korean BBQ Sauce" })],
      inventory: [invRow()],
    });
    expect(r.assemblable).toBe(false);
    expect(r.missing).toEqual(["Korean BBQ Sauce"]);
  });
  it("barcode-terminal-but-out-of-stock is missing, NOT resolved to a concept sibling", () => {
    // Phase 2 amendment: barcode is terminal evidence of identity.
    const r = assessAssemblability({
      items: [mealItem({ barcode: "123", conceptIds: ["boost"] })],
      inventory: [
        invRow({ barcode: "123", totalQuantity: 0 }),
        invRow({ id: "inv2", name: "Boost Plus", conceptIds: ["boost"], totalQuantity: 6 }),
      ],
    });
    expect(r.assemblable).toBe(false);
    expect(r.missing).toEqual(["Boost Very High Calorie"]);
  });
  it("missing preserves item order", () => {
    const r = assessAssemblability({
      items: [
        mealItem({ savedFoodId: "a", name: "A-Food" }),
        mealItem({ savedFoodId: "b", name: "B-Food", conceptIds: ["boost"] }),
        mealItem({ savedFoodId: "c", name: "C-Food" }),
      ],
      inventory: [invRow({ conceptIds: ["boost"] })],
    });
    expect(r.missing).toEqual(["A-Food", "C-Food"]);
  });
  it("two items resolving to one in-stock container are both satisfied (units are containers)", () => {
    const r = assessAssemblability({
      items: [
        mealItem({ savedFoodId: "a", conceptIds: ["boost"] }),
        mealItem({ savedFoodId: "b", name: "Other", barcode: "123" }),
      ],
      inventory: [invRow({ barcode: "123", conceptIds: ["boost"], totalQuantity: 1 })],
    });
    expect(r.assemblable).toBe(true);
  });
  it("reports the most urgent expiring in-stock item the meal uses, and a later skipped row does not clobber it", () => {
    const r = assessAssemblability({
      items: [
        mealItem({ savedFoodId: "a", conceptIds: ["beef"] }),
        mealItem({ savedFoodId: "b", name: "Rice", conceptIds: ["rice"] }),
        mealItem({ savedFoodId: "c", name: "Pasta", conceptIds: ["pasta"] }),
      ],
      inventory: [
        invRow({ id: "i1", name: "Sirloin", conceptIds: ["beef"], daysLeft: 2 }),
        invRow({ id: "i2", name: "Sticky Rice", conceptIds: ["rice"], daysLeft: 5 }),
        // Matched but non-qualifying (already expired), visited AFTER the
        // winner above — pins that a skip does not reset the running minimum.
        invRow({ id: "i3", name: "Stale Pasta", conceptIds: ["pasta"], daysLeft: -3 }),
      ],
    });
    expect(r.expiringItemName).toBe("Sirloin");
    expect(r.expiringDaysLeft).toBe(2);
  });
  it("expiring ignores items beyond the soon window", () => {
    const r = assessAssemblability({
      items: [mealItem({ conceptIds: ["beef"] })],
      inventory: [invRow({ conceptIds: ["beef"], daysLeft: EXPIRING_SOON_DAYS + 1 })],
    });
    expect(r.expiringItemName).toBeNull();
  });
  it("expiring includes the EXPIRING_SOON_DAYS boundary itself (inclusive upper bound)", () => {
    const r = assessAssemblability({
      items: [mealItem({ conceptIds: ["beef"] })],
      inventory: [invRow({ conceptIds: ["beef"], daysLeft: EXPIRING_SOON_DAYS })],
    });
    expect(r.expiringItemName).toBe("Boost, Very High Calorie");
    expect(r.expiringDaysLeft).toBe(EXPIRING_SOON_DAYS);
  });
  it("expiring excludes already-expired rows — a throw-out is not a rescue", () => {
    const r = assessAssemblability({
      items: [mealItem({ conceptIds: ["beef"] })],
      inventory: [invRow({ conceptIds: ["beef"], daysLeft: -3 })],
    });
    expect(r.expiringItemName).toBeNull();
    expect(r.expiringDaysLeft).toBeNull();
  });
  it("a matched row with no expiration date is not 'expiring'", () => {
    const r = assessAssemblability({
      items: [mealItem({ conceptIds: ["beef"] })],
      inventory: [invRow({ conceptIds: ["beef"], daysLeft: null })],
    });
    expect(r.expiringItemName).toBeNull();
    expect(r.expiringDaysLeft).toBeNull();
  });
  it("a tie between two matched rows favors the first meal item's resolution", () => {
    const r = assessAssemblability({
      items: [
        mealItem({ savedFoodId: "a", conceptIds: ["beef"] }),
        mealItem({ savedFoodId: "b", name: "Rice", conceptIds: ["rice"] }),
      ],
      inventory: [
        invRow({ id: "i1", name: "Sirloin", conceptIds: ["beef"], daysLeft: 3 }),
        invRow({ id: "i2", name: "Sticky Rice", conceptIds: ["rice"], daysLeft: 3 }),
      ],
    });
    expect(r.expiringItemName).toBe("Sirloin");
    expect(r.expiringDaysLeft).toBe(3);
  });
  it("empty meal is not assemblable", () => {
    expect(assessAssemblability({ items: [], inventory: [invRow()] }).assemblable).toBe(false);
  });
});

// The premise Task 10's map builder rests on. `assemblable` is
// `items.length > 0 && missing.length === 0`, so an item-less meal is the one
// input for which `assemblable === false` and `missing.length === 0` hold at
// the same time — i.e. `missingCount` is 0 not because nothing is missing but
// because nothing was checked. Every consumer that renders or ranks off this
// verdict has to handle that separately (MealDetail gates on the LIST, Task
// 8's FIX 1; `buildStockByMealId` omits the meal, Task 10's DECISION).
// Pinned as a whole-object assertion so a future change to any of the four
// fields for this input surfaces here rather than silently downstream.
describe("assessAssemblability — the item-less verdict (Task 10 premise)", () => {
  it("item-less meal: not assemblable AND nothing missing, with no expiring signal", () => {
    expect(
      assessAssemblability({
        items: [],
        inventory: [invRow({ conceptIds: ["boost"], daysLeft: 1 })],
      }),
    ).toEqual({
      assemblable: false,
      missing: [],
      expiringItemName: null,
      expiringDaysLeft: null,
    });
  });
});

describe("lowThresholdFor", () => {
  it("single-location → restock_threshold", () => {
    expect(lowThresholdFor(item({ storage_type: "single-location", restock_threshold: 4 }))).toBe(4);
  });
  it("multi-location → total_restock_threshold; nulls → 0", () => {
    expect(lowThresholdFor(item({ total_restock_threshold: 6 }))).toBe(6);
    expect(lowThresholdFor(item({ total_restock_threshold: null }))).toBe(0);
    expect(lowThresholdFor(item({ storage_type: "single-location", restock_threshold: null }))).toBe(0);
  });
});
