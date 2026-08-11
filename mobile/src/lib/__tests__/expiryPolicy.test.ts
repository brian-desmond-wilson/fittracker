import {
  PERISHABLE_GRACE_DAYS,
  SHELF_STABLE_GRACE_DAYS,
  expiryGraceDays,
  reviewExpiry,
  isExpiringSoon,
} from "../expiryPolicy";
import type { ItemStockState } from "../stockState";

const state = (over: Partial<ItemStockState> = {}): ItemStockState => ({
  totalQuantity: 3, readyQuantity: 3, storageQuantity: 0,
  isOut: false, isLow: false, needsFridgeRestock: false,
  expiration: null, daysLeft: null, ...over,
});

describe("expiryGraceDays", () => {
  it("perishable categories get the short grace", () => {
    expect(expiryGraceDays(["Dairy, Cheese & Eggs"])).toBe(PERISHABLE_GRACE_DAYS);
    expect(expiryGraceDays(["Produce"])).toBe(PERISHABLE_GRACE_DAYS);
    expect(expiryGraceDays(["Meat & Seafood"])).toBe(PERISHABLE_GRACE_DAYS);
  });
  it("shelf-stable categories get the long grace", () => {
    expect(expiryGraceDays(["Beverages"])).toBe(SHELF_STABLE_GRACE_DAYS);
    expect(expiryGraceDays(["Pantry"])).toBe(SHELF_STABLE_GRACE_DAYS);
    expect(expiryGraceDays(["Frozen"])).toBe(SHELF_STABLE_GRACE_DAYS);
    expect(expiryGraceDays(["Breakfast Foods"])).toBe(SHELF_STABLE_GRACE_DAYS);
    expect(expiryGraceDays(["Snacks"])).toBe(SHELF_STABLE_GRACE_DAYS);
  });
  it("a mixed item is perishable — any perishable category wins", () => {
    expect(expiryGraceDays(["Beverages", "Dairy, Cheese & Eggs"])).toBe(PERISHABLE_GRACE_DAYS);
  });
  it("no categories defaults to perishable (conservative: surfaces sooner)", () => {
    expect(expiryGraceDays([])).toBe(PERISHABLE_GRACE_DAYS);
    expect(expiryGraceDays(undefined)).toBe(PERISHABLE_GRACE_DAYS);
  });
  it("unknown category names default to perishable", () => {
    expect(expiryGraceDays(["Mystery Aisle"])).toBe(PERISHABLE_GRACE_DAYS);
  });
});

describe("reviewExpiry", () => {
  it("no date and far-future dates are ok", () => {
    expect(reviewExpiry(state(), [])).toBe("ok");
    expect(reviewExpiry(state({ expiration: "later", daysLeft: 30 }), [])).toBe("ok");
  });
  it("today and soon need attention", () => {
    expect(reviewExpiry(state({ expiration: "today", daysLeft: 0 }), [])).toBe("attention");
    expect(reviewExpiry(state({ expiration: "soon", daysLeft: 7 }), [])).toBe("attention");
  });
  it("freshly expired needs attention; long-expired is stale — boundary is exactly the grace", () => {
    // perishable grace 14: expired 14 days ago is still attention; 15 is stale
    expect(reviewExpiry(state({ expiration: "expired", daysLeft: -PERISHABLE_GRACE_DAYS }), []))
      .toBe("attention");
    expect(reviewExpiry(state({ expiration: "expired", daysLeft: -(PERISHABLE_GRACE_DAYS + 1) }), []))
      .toBe("stale");
  });
  it("shelf-stable items use the long grace at the same boundary", () => {
    const bev = ["Beverages"];
    expect(reviewExpiry(state({ expiration: "expired", daysLeft: -SHELF_STABLE_GRACE_DAYS }), bev))
      .toBe("attention");
    expect(reviewExpiry(state({ expiration: "expired", daysLeft: -(SHELF_STABLE_GRACE_DAYS + 1) }), bev))
      .toBe("stale");
  });
  it("expired with unknown age (null daysLeft) is attention, never stale", () => {
    // Synthetic input — real projection always pairs "expired" with a negative
    // daysLeft. Unknown age must surface for review rather than silently age out.
    expect(reviewExpiry(state({ expiration: "expired", daysLeft: null }), [])).toBe("attention");
  });
});

describe("isExpiringSoon — the ONE definition both hub and screen consume", () => {
  it("counts expired-within-grace, today, and soon", () => {
    expect(isExpiringSoon(state({ expiration: "expired", daysLeft: -3 }), [])).toBe(true);
    expect(isExpiringSoon(state({ expiration: "today", daysLeft: 0 }), [])).toBe(true);
    expect(isExpiringSoon(state({ expiration: "soon", daysLeft: 5 }), [])).toBe(true);
  });
  it("excludes stale, later, and no-date items", () => {
    expect(isExpiringSoon(state({ expiration: "expired", daysLeft: -400 }), [])).toBe(false);
    expect(isExpiringSoon(state({ expiration: "later", daysLeft: 20 }), [])).toBe(false);
    expect(isExpiringSoon(state(), [])).toBe(false);
  });
  it("excludes out-of-stock items regardless of band", () => {
    expect(isExpiringSoon(
      state({ totalQuantity: 0, isOut: true, expiration: "soon", daysLeft: 2 }), [],
    )).toBe(false);
  });
  it("a long-expired beverage within its 90d grace still counts", () => {
    expect(isExpiringSoon(state({ expiration: "expired", daysLeft: -35 }), ["Snacks"])).toBe(true);
    // same age on a perishable is stale
    expect(isExpiringSoon(state({ expiration: "expired", daysLeft: -35 }), ["Produce"])).toBe(false);
  });
});
