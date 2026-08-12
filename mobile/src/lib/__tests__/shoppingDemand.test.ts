import {
  computeShoppingSuggestions,
  FORECAST_LEAD_DAYS,
  type DemandInventoryItem,
} from "../shoppingDemand";
import type { ConsumptionEstimate } from "../consumptionRate";

let n = 0;
const item = (over: Partial<DemandInventoryItem> = {}): DemandInventoryItem => ({
  id: `i${n++}`,
  name: `Item ${n}`,
  unit: "bottle",
  preferredVendorId: "v1",
  lowThreshold: 2,
  totalQuantity: 5,
  isOut: false,
  isLow: false,
  ...over,
});
const run = (opts: Partial<Parameters<typeof computeShoppingSuggestions>[0]>) =>
  computeShoppingSuggestions({
    items: [], mealGaps: [], rates: new Map<string, ConsumptionEstimate>(), unpurchased: [], ...opts,
  });

beforeEach(() => { n = 0; });

describe("sources", () => {
  it("out of stock → priority 1, threshold-exit quantity, reason", () => {
    const [s] = run({ items: [item({ totalQuantity: 0, isOut: true, lowThreshold: 2 })] });
    expect(s).toMatchObject({ priority: 1, quantity: 3, reasons: ["out of stock"] }); // 2−0+1
  });
  it("threshold 0 out-of-stock still suggests quantity 1", () => {
    const [s] = run({ items: [item({ totalQuantity: 0, isOut: true, lowThreshold: 0 })] });
    expect(s.quantity).toBe(1);
  });
  it("low stock → priority 2 with count in reason", () => {
    const [s] = run({ items: [item({ totalQuantity: 2, isLow: true, lowThreshold: 3 })] });
    expect(s).toMatchObject({ priority: 2, quantity: 2, reasons: ["below threshold (2 left)"] });
  });
  it("missing-for-meal without inventory match → name-only row, priority 1", () => {
    const [s] = run({ mealGaps: [{ mealName: "Korean Beef Bowl", missing: ["Korean BBQ Sauce"] }] });
    expect(s).toMatchObject({
      name: "Korean BBQ Sauce", foodInventoryId: null, vendorId: null,
      quantity: 1, unit: null, priority: 1, reasons: ["needed for Korean Beef Bowl"],
    });
  });
  it("missing name matching an inventory item adopts its id/vendor/unit", () => {
    const boost = item({ name: "Boost Very High Calorie" });
    const [s] = run({
      items: [boost],
      mealGaps: [{ mealName: "Boost + Cashews", missing: ["boost very high calorie"] }],
    });
    expect(s.foodInventoryId).toBe(boost.id);
    expect(s.vendorId).toBe("v1");
    expect(s.unit).toBe("bottle");
  });
  it("byName's folded-name lookup is last-wins on a collision between two inventory items: the meal-gap reason attaches to whichever came later in `items` (deliberate, per the comment at the byName construction site — not an oversight)", () => {
    const first = item({ name: "Ground Beef" });
    const second = item({ name: "Ground Beef" });
    const got = run({
      items: [first, second],
      mealGaps: [{ mealName: "Taco Bowl", missing: ["Ground Beef"] }],
    });
    expect(got).toHaveLength(1);
    expect(got[0].foodInventoryId).toBe(second.id);
  });
  it(`forecast → priority 3 only when daysUntilOut <= ${FORECAST_LEAD_DAYS} and not low/out`, () => {
    const soon = item({});
    const later = item({});
    const alreadyLow = item({ isLow: true, totalQuantity: 1, lowThreshold: 2 });
    const alreadyOut = item({ isOut: true, totalQuantity: 0, lowThreshold: 2 });
    const rates = new Map<string, ConsumptionEstimate>([
      [soon.id, { ratePerDay: 1, daysUntilOut: FORECAST_LEAD_DAYS }],
      [later.id, { ratePerDay: 1, daysUntilOut: FORECAST_LEAD_DAYS + 1 }],
      [alreadyLow.id, { ratePerDay: 1, daysUntilOut: 1 }],
      [alreadyOut.id, { ratePerDay: 1, daysUntilOut: 1 }],
    ]);
    const got = run({ items: [soon, later, alreadyLow, alreadyOut], rates });
    const forecastOnly = got.find((s) => s.foodInventoryId === soon.id)!;
    expect(forecastOnly).toMatchObject({ priority: 3, quantity: 1 });
    expect(forecastOnly.reasons[0]).toBe(`~${FORECAST_LEAD_DAYS}d left at your pace`);
    expect(got.find((s) => s.foodInventoryId === later.id)).toBeUndefined();
    // alreadyLow must appear as the LOW source ONLY. min(2,3) stays 2
    // whether or not the forecast source also fires, so priority alone
    // can't prove the `it.isLow` guard half — only the reasons array
    // reveals whether a second, spurious forecast reason snuck in.
    const lowSuggestion = got.find((s) => s.foodInventoryId === alreadyLow.id)!;
    expect(lowSuggestion.priority).toBe(2);
    expect(lowSuggestion.reasons).toEqual(["below threshold (1 left)"]);
    // Same proof shape for the guard's `it.isOut` half.
    const outSuggestion = got.find((s) => s.foodInventoryId === alreadyOut.id)!;
    expect(outSuggestion.priority).toBe(1);
    expect(outSuggestion.reasons).toEqual(["out of stock"]);
  });
});

describe("merge + suppression", () => {
  it("cross-source merge: min priority, union reasons, threshold quantity wins", () => {
    const beef = item({ name: "Ground Beef", totalQuantity: 0, isOut: true, lowThreshold: 2 });
    const got = run({
      items: [beef],
      mealGaps: [
        { mealName: "Korean Beef Bowl", missing: ["Ground Beef"] },
        { mealName: "Taco Bowl", missing: ["Ground Beef"] },
      ],
    });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ priority: 1, quantity: 3 });
    expect(got[0].reasons).toEqual([
      "out of stock", "needed for Korean Beef Bowl", "needed for Taco Bowl",
    ]);
  });
  it("cross-priority merge takes the min, not the max: a meal gap (p1) merged with the low source (p2) stays p1", () => {
    const beef = item({ name: "Ground Beef", isLow: true, totalQuantity: 1, lowThreshold: 2 });
    const got = run({
      items: [beef],
      mealGaps: [{ mealName: "Taco Bowl", missing: ["Ground Beef"] }],
    });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ priority: 1, quantity: 2 }); // 2−1+1
    expect(got[0].reasons).toEqual(["needed for Taco Bowl", "below threshold (1 left)"]);
  });
  it("suppressed by an unpurchased row matching by id", () => {
    const beef = item({ totalQuantity: 0, isOut: true });
    expect(run({
      items: [beef],
      unpurchased: [{ foodInventoryId: beef.id, name: "whatever" }],
    })).toHaveLength(0);
  });
  it("suppressed by an unpurchased row matching by case-folded name (name-only rows)", () => {
    expect(run({
      mealGaps: [{ mealName: "PB&J", missing: ["Grape Jelly"] }],
      unpurchased: [{ foodInventoryId: null, name: "  grape jelly " }],
    })).toHaveLength(0);
  });
  it("a null-id unpurchased row still suppresses an id-carrying suggestion by name (manual entry, or an ON DELETE SET NULL orphan)", () => {
    const beef = item({ name: "Ground Beef", totalQuantity: 0, isOut: true });
    expect(run({
      items: [beef],
      unpurchased: [{ foodInventoryId: null, name: "ground beef" }],
    })).toHaveLength(0);
  });
  it("suppression is per-row: an id-carrying unpurchased row does NOT suppress by name — food_inventory has no unique constraint on name, so a different item sharing the name must still surface", () => {
    const a = item({ name: "Ground Beef", totalQuantity: 0, isOut: true });
    const b = item({ name: "Ground Beef", totalQuantity: 0, isOut: true });
    const got = run({
      items: [a, b],
      unpurchased: [{ foodInventoryId: a.id, name: "Ground Beef" }],
    });
    // a is suppressed by id; b is a distinct item and must not be swept up
    // by a's name via an unfiltered name-suppression set.
    expect(got).toHaveLength(1);
    expect(got[0].foodInventoryId).toBe(b.id);
  });
  it("purchased rows do NOT suppress (caller passes only unpurchased)", () => {
    // Contract test: the input is named `unpurchased` — this pins that a
    // suggestion re-appears once its row is purchased and thus absent here.
    const beef = item({ totalQuantity: 0, isOut: true });
    expect(run({ items: [beef], unpurchased: [] })).toHaveLength(1);
  });
  it("item-less meals suggest nothing (missing.length gate)", () => {
    expect(run({ mealGaps: [{ mealName: "Empty", missing: [] }] })).toHaveLength(0);
  });
  it("deterministic order: priority, then name", () => {
    const a = item({ name: "Zebra", totalQuantity: 0, isOut: true });
    const b = item({ name: "Apple", isLow: true, totalQuantity: 1 });
    const c = item({ name: "Mango", totalQuantity: 0, isOut: true });
    const got = run({ items: [b, a, c] });
    expect(got.map((s) => s.name)).toEqual(["Mango", "Zebra", "Apple"]);
  });
});

describe("scheduled supply", () => {
  // Stock that arrives on a delivery cadence — a Thistle meal, not a grocery.
  // Every suggestion the engine could raise about one is a false alarm: you
  // do not buy it when it runs low, you wait until Tuesday.
  const delivered = (over: Partial<DemandInventoryItem> = {}) =>
    item({ scheduledSupply: true, ...over });

  it("stays silent when it runs out", () => {
    expect(run({ items: [delivered({ totalQuantity: 0, isOut: true })] })).toEqual([]);
  });

  it("stays silent when it falls below its threshold", () => {
    expect(run({ items: [delivered({ totalQuantity: 1, isLow: true, lowThreshold: 3 })] })).toEqual([]);
  });

  it("stays silent when the forecast says it is nearly gone", () => {
    const it0 = delivered();
    expect(run({
      items: [it0],
      rates: new Map([[it0.id, { ratePerDay: 1, daysUntilOut: FORECAST_LEAD_DAYS }]]),
    })).toEqual([]);
  });

  it("stays silent when a meal names it as missing", () => {
    // The case that motivated suppressing the name-keyed source too: a
    // prepared meal IS its own meal, so an eaten one reads as both out of
    // stock and missing from the meal that contains it.
    const bowl = delivered({ name: "Ruby Rice Bowl", totalQuantity: 0, isOut: true });
    expect(run({
      items: [bowl],
      mealGaps: [{ mealName: "Ruby Rice Bowl", missing: ["Ruby Rice Bowl"] }],
    })).toEqual([]);
  });

  it("suppresses by name regardless of case or padding", () => {
    const bowl = delivered({ name: "Ruby Rice Bowl" });
    expect(run({
      items: [bowl],
      mealGaps: [{ mealName: "Dinner", missing: ["  ruby rice bowl "] }],
    })).toEqual([]);
  });

  it("leaves ordinary groceries alone in the same list", () => {
    const milk = item({ name: "Milk", totalQuantity: 0, isOut: true });
    const bowl = delivered({ name: "Ruby Rice Bowl", totalQuantity: 0, isOut: true });
    expect(run({ items: [bowl, milk] }).map((s) => s.name)).toEqual(["Milk"]);
  });

  it("treats an absent flag as an ordinary grocery", () => {
    // Every pre-existing caller omits the field; absence must not silence it.
    const [s] = run({ items: [item({ name: "Milk", totalQuantity: 0, isOut: true })] });
    expect(s.name).toBe("Milk");
  });
});
