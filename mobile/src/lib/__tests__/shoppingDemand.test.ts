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
  it(`forecast → priority 3 only when daysUntilOut <= ${FORECAST_LEAD_DAYS} and not low/out`, () => {
    const soon = item({});
    const later = item({});
    const alreadyLow = item({ isLow: true, totalQuantity: 1, lowThreshold: 2 });
    const rates = new Map<string, ConsumptionEstimate>([
      [soon.id, { ratePerDay: 1, daysUntilOut: FORECAST_LEAD_DAYS }],
      [later.id, { ratePerDay: 1, daysUntilOut: FORECAST_LEAD_DAYS + 1 }],
      [alreadyLow.id, { ratePerDay: 1, daysUntilOut: 1 }],
    ]);
    const got = run({ items: [soon, later, alreadyLow], rates });
    const forecastOnly = got.find((s) => s.foodInventoryId === soon.id)!;
    expect(forecastOnly).toMatchObject({ priority: 3, quantity: 1 });
    expect(forecastOnly.reasons[0]).toBe(`~${FORECAST_LEAD_DAYS}d left at your pace`);
    expect(got.find((s) => s.foodInventoryId === later.id)).toBeUndefined();
    // alreadyLow appears as the LOW source (priority 2), not forecast
    expect(got.find((s) => s.foodInventoryId === alreadyLow.id)!.priority).toBe(2);
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
