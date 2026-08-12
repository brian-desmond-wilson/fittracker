import { filterOptions, isNewValue } from "../vocabMatch";

describe("filterOptions", () => {
  const brands = ["Kirkland Signature", "bibigo", "La Boulangerie", "Del Monte"];
  const id = (s: string) => s;

  it("matches anywhere in the label, not just the start", () => {
    // You rarely remember which word a brand begins with.
    expect(filterOptions(brands, "signature", id)).toEqual(["Kirkland Signature"]);
    expect(filterOptions(brands, "monte", id)).toEqual(["Del Monte"]);
  });

  it("ignores case in both directions", () => {
    expect(filterOptions(brands, "BIBIGO", id)).toEqual(["bibigo"]);
    expect(filterOptions(["ARROWHEAD"], "arrow", id)).toEqual(["ARROWHEAD"]);
  });

  it("an empty or whitespace query returns everything", () => {
    expect(filterOptions(brands, "", id)).toHaveLength(4);
    expect(filterOptions(brands, "   ", id)).toHaveLength(4);
  });

  it("trims the query rather than failing to match on a stray space", () => {
    expect(filterOptions(brands, " bibigo ", id)).toEqual(["bibigo"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterOptions(brands, "zzz", id)).toEqual([]);
  });

  it("reads the label through the accessor for object options", () => {
    const objs = [{ name: "Costco" }, { name: "Thistle" }];
    expect(filterOptions(objs, "thist", (o) => o.name)).toEqual([{ name: "Thistle" }]);
  });

  it("does not mutate or alias the input", () => {
    const out = filterOptions(brands, "", id);
    out.push("nope");
    expect(brands).toHaveLength(4);
  });
});

describe("isNewValue — offering to add is only honest when it IS new", () => {
  const brands = ["Kirkland Signature", "bibigo"];

  it("is false for an exact existing value", () => {
    expect(isNewValue(brands, "Kirkland Signature")).toBe(false);
  });

  it("is false for a case variant — that is the duplicate we are preventing", () => {
    expect(isNewValue(brands, "kirkland signature")).toBe(false);
    expect(isNewValue(brands, "BIBIGO")).toBe(false);
  });

  it("is true for something genuinely absent", () => {
    expect(isNewValue(brands, "Trader Joe's")).toBe(true);
  });

  it("is false for empty or whitespace — there is nothing to add", () => {
    expect(isNewValue(brands, "")).toBe(false);
    expect(isNewValue(brands, "   ")).toBe(false);
  });

  it("ignores surrounding whitespace when deciding", () => {
    expect(isNewValue(brands, "  bibigo  ")).toBe(false);
  });

  it("a partial match is still new — Kirk is not Kirkland Signature", () => {
    expect(isNewValue(brands, "Kirk")).toBe(true);
  });
});
