import {
  projectItemStock,
  EXPIRING_SOON_DAYS,
  type StockItemInput,
  type StockLocationRow,
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
});
