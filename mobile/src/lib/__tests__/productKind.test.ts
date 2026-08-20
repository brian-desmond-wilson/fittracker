import { caloriesLabel, isGenericProduct, stockedProductIds } from "../productKind";

const product = (over: Partial<{ id: string; brand: string | null; barcode: string | null }> = {}) => ({
  id: "p1", brand: null, barcode: null, ...over,
});

describe("stockedProductIds", () => {
  it("collects every product some stock row names", () => {
    const s = stockedProductIds([{ savedFoodId: "a" }, { savedFoodId: "b" }, { savedFoodId: "a" }]);
    expect([...s].sort()).toEqual(["a", "b"]);
  });

  it("ignores unstamped rows rather than adding a blank key", () => {
    const s = stockedProductIds([{ savedFoodId: null }, { savedFoodId: undefined }, {}]);
    expect(s.size).toBe(0);
  });
});

describe("isGenericProduct", () => {
  const none = new Set<string>();

  it("calls a nameless, unscanned, unstocked product generic", () => {
    expect(isGenericProduct(product(), none)).toBe(true);
  });

  it("a brand alone makes it a package", () => {
    expect(isGenericProduct(product({ brand: "Quaker" }), none)).toBe(false);
  });

  it("a barcode alone makes it a package", () => {
    expect(isGenericProduct(product({ barcode: "030000010204" }), none)).toBe(false);
  });

  // The case that motivated the whole predicate: a real SKU the delivery
  // flow created, currently unowned, must not be demoted to a stand-in.
  it("stock on record makes it a package even with no brand or barcode", () => {
    expect(isGenericProduct(product(), new Set(["p1"]))).toBe(false);
  });

  // Running the cupboard down is not a change of kind — `stockedProductIds`
  // keeps empty rows, and this is the assertion that says why.
  it("stays a package when the naming row is empty", () => {
    const stocked = stockedProductIds([{ savedFoodId: "p1" }]);
    expect(isGenericProduct(product(), stocked)).toBe(false);
  });

  it("treats whitespace-only brand and barcode as absent", () => {
    expect(isGenericProduct(product({ brand: "  ", barcode: " " }), none)).toBe(true);
  });

  it("other products' stock says nothing about this one", () => {
    expect(isGenericProduct(product(), new Set(["p2"]))).toBe(true);
  });
});

describe("caloriesLabel", () => {
  it("states a package's number plainly", () => {
    expect(caloriesLabel(160, false)).toBe("160 cal");
  });

  it("marks a stand-in's number as a reference figure", () => {
    expect(caloriesLabel(160, true)).toBe("~160 cal");
  });

  it("marks zero too — a zero estimate is still an estimate", () => {
    expect(caloriesLabel(0, true)).toBe("~0 cal");
  });
});
