import { matchesInventoryQuery } from "../inventorySearch";

const item = (name: string, brand: string | null = null) => ({ name, brand });

describe("matchesInventoryQuery", () => {
  it("matches on the name, case-insensitively and part-way through a word", () => {
    expect(matchesInventoryQuery(item("Bananas"), "bana")).toBe(true);
    expect(matchesInventoryQuery(item("Bananas"), "NAN")).toBe(true);
    expect(matchesInventoryQuery(item("Bananas"), "apple")).toBe(false);
  });

  it("matches on the brand, which is often all you remember", () => {
    expect(matchesInventoryQuery(item("Pasta Arrabiata", "Thistle"), "thistle")).toBe(true);
  });

  it("wants every word, so brand and name can be typed together", () => {
    const pasta = item("Pasta Arrabiata", "Thistle");
    expect(matchesInventoryQuery(pasta, "thistle pasta")).toBe(true);
    expect(matchesInventoryQuery(pasta, "thistle smoothie")).toBe(false);
  });

  it("ignores surrounding and repeated whitespace rather than failing on it", () => {
    expect(matchesInventoryQuery(item("Pasta Arrabiata", "Thistle"), "  thistle   pasta ")).toBe(true);
  });

  it("matches everything when there is nothing to search for", () => {
    expect(matchesInventoryQuery(item("Bananas"), "")).toBe(true);
    expect(matchesInventoryQuery(item("Bananas"), "   ")).toBe(true);
  });

  it("survives a missing brand", () => {
    expect(matchesInventoryQuery(item("Bananas", null), "bananas")).toBe(true);
    expect(matchesInventoryQuery({ name: "Bananas" }, "bananas")).toBe(true);
  });
});
