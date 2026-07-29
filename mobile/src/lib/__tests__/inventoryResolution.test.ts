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

  it("skips when two in-stock products share the concept (ambiguous)", () => {
    const got = resolveInventoryMatches(
      [item({ conceptIds: ["boost"] })],
      [inv({ conceptIds: ["boost"] }), inv({ id: "inv2", conceptIds: ["boost"] })],
    );
    expect(got.has("sf1")).toBe(false);
  });

  it("ambiguity ignores out-of-stock candidates", () => {
    const got = resolveInventoryMatches(
      [item({ conceptIds: ["boost"] })],
      [inv({ conceptIds: ["boost"] }), inv({ id: "inv2", conceptIds: ["boost"], totalQuantity: 0 })],
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
