import {
  resolveInventoryMatches,
  type ResolutionItem,
  type ResolutionInventoryRow,
} from "../inventoryResolution";

const item = (o: Partial<ResolutionItem> = {}): ResolutionItem => ({
  savedFoodId: "sf1",
  barcode: null,
  conceptIds: [],
  ...o,
});
const inv = (o: Partial<ResolutionInventoryRow> = {}): ResolutionInventoryRow => ({
  id: "inv1",
  barcode: null,
  totalQuantity: 1,
  conceptIds: [],
  ...o,
});

describe("resolveInventoryMatches", () => {
  it("matches by barcode when in stock", () => {
    const got = resolveInventoryMatches(
      [item({ barcode: "123" })],
      [inv({ barcode: "123" })],
    );
    expect(got.get("sf1")).toBe("inv1");
  });

  it("skips barcode matches with zero stock", () => {
    const got = resolveInventoryMatches(
      [item({ barcode: "123" })],
      [inv({ barcode: "123", totalQuantity: 0 })],
    );
    expect(got.has("sf1")).toBe(false);
  });

  it("a barcode match is terminal: an empty barcode row does not fall through to concepts", () => {
    // Seed-data counterexample: "Boost Very High Calorie" (barcode …152) is at
    // qty 0, while "Boost Plus" (different barcode) shares its concept and has
    // stock. The barcode is positive evidence that the item is NOT Boost Plus,
    // so decrementing it would corrupt the owner's stock records.
    const got = resolveInventoryMatches(
      [item({ barcode: "152", conceptIds: ["boost-high-protein"] })],
      [
        inv({ id: "invVHC", barcode: "152", totalQuantity: 0, conceptIds: ["boost-high-protein"] }),
        inv({ id: "invPlus", barcode: "999", totalQuantity: 6, conceptIds: ["boost-high-protein"] }),
      ],
    );
    expect(got.has("sf1")).toBe(false);
  });

  it("falls back to a unique shared-concept match", () => {
    const got = resolveInventoryMatches(
      [item({ conceptIds: ["boost"] })],
      [inv({ conceptIds: ["boost"] }), inv({ id: "inv2", conceptIds: ["rice"] })],
    );
    expect(got.get("sf1")).toBe("inv1");
  });

  // DESIGN CHANGE 2026-08-11 (inventory refinement Phase 3): plurality no
  // longer collapses to absence. Two stocked oatmeals must make oatmeal MORE
  // available, not less — the AI concept backfill immediately produced this
  // exact state in prod (Instant Oatmeal + Oats Over Night both "Oatmeal")
  // and a meal went from missing-3 to missing-4. The pick is deterministic:
  // soonest expiration first (use it before it goes bad), then largest
  // quantity, then id for total order.
  it("two in-stock products sharing the concept: soonest-expiring wins", () => {
    const got = resolveInventoryMatches(
      [item({ conceptIds: ["oatmeal"] })],
      [
        inv({ id: "instant", conceptIds: ["oatmeal"], totalQuantity: 35, daysLeft: 120 }),
        inv({ id: "overnight", conceptIds: ["oatmeal"], totalQuantity: 8, daysLeft: 5 }),
      ],
    );
    expect(got.get("sf1")).toBe("overnight");
  });

  it("a dated candidate beats an undated one; quantity breaks date ties", () => {
    const dated = resolveInventoryMatches(
      [item({ conceptIds: ["boost"] })],
      [
        inv({ id: "nodate", conceptIds: ["boost"], totalQuantity: 50, daysLeft: null }),
        inv({ id: "dated", conceptIds: ["boost"], totalQuantity: 2, daysLeft: 30 }),
      ],
    );
    expect(dated.get("sf1")).toBe("dated");
    const qty = resolveInventoryMatches(
      [item({ conceptIds: ["boost"] })],
      [
        inv({ id: "small", conceptIds: ["boost"], totalQuantity: 2 }),
        inv({ id: "big", conceptIds: ["boost"], totalQuantity: 9 }),
      ],
    );
    expect(qty.get("sf1")).toBe("big");
  });

  it("candidate order does not change the winner (determinism)", () => {
    const rows = [
      inv({ id: "a", conceptIds: ["boost"], totalQuantity: 3, daysLeft: 9 }),
      inv({ id: "b", conceptIds: ["boost"], totalQuantity: 3, daysLeft: 9 }),
    ];
    const fwd = resolveInventoryMatches([item({ conceptIds: ["boost"] })], rows);
    const rev = resolveInventoryMatches([item({ conceptIds: ["boost"] })], [...rows].reverse());
    expect(fwd.get("sf1")).toBe("a");
    expect(rev.get("sf1")).toBe("a");
  });

  it("out-of-stock candidates never win, whatever their dates", () => {
    const got = resolveInventoryMatches(
      [item({ conceptIds: ["boost"] })],
      [inv({ conceptIds: ["boost"] }), inv({ id: "inv2", conceptIds: ["boost"], totalQuantity: 0, daysLeft: 1 })],
    );
    expect(got.get("sf1")).toBe("inv1");
  });

  it("barcode wins over concept resolution", () => {
    const got = resolveInventoryMatches(
      [item({ barcode: "123", conceptIds: ["boost"] })],
      [inv({ barcode: "123" }), inv({ id: "inv2", conceptIds: ["boost"] })],
    );
    expect(got.get("sf1")).toBe("inv1");
  });

  it("returns nothing for unmatched items", () => {
    expect(resolveInventoryMatches([item()], [inv()]).size).toBe(0);
  });

  it("resolves items independently; two items may share one inventory row", () => {
    const got = resolveInventoryMatches(
      [
        item({ savedFoodId: "sfA", conceptIds: ["boost"] }),
        item({ savedFoodId: "sfB", conceptIds: ["boost"] }),
      ],
      [inv({ id: "invX", conceptIds: ["boost"] })],
    );
    expect([...got.values()]).toEqual(["invX", "invX"]); // callers must de-dup before consuming
  });
});
