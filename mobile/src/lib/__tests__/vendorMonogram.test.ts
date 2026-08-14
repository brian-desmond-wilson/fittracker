import { monogram } from "../vendorMonogram";

describe("monogram — the fallback when a vendor has no logo", () => {
  it("takes the initials of the first two words", () => {
    expect(monogram("Gus's Community Market")).toBe("GC");
    expect(monogram("Amazon Fresh")).toBe("AF");
  });
  it("a single word gives a single letter", () => {
    expect(monogram("Thistle")).toBe("T");
  });
  it("ignores punctuation rather than turning it into an initial", () => {
    // "Costco (Instacart)" must not read as "C(".
    expect(monogram("Costco (Instacart)")).toBe("CI");
    expect(monogram("Trader Joe's")).toBe("TJ");
  });
  it("uppercases whatever it finds", () => {
    expect(monogram("whole foods")).toBe("WF");
  });
  it("survives an empty or punctuation-only name", () => {
    expect(monogram("")).toBe("?");
    expect(monogram("   ")).toBe("?");
    expect(monogram("!!!")).toBe("?");
  });
  it("handles leading whitespace without producing a blank initial", () => {
    expect(monogram("  Costco  Wholesale ")).toBe("CW");
  });
  it("keeps digits, which are legitimate first characters", () => {
    expect(monogram("99 Ranch Market")).toBe("9R");
  });
});

describe("monogram, on meal names", () => {
  it("ignores a joining symbol rather than printing it", () => {
    // These are real meals in the library; splitting on whitespace alone gave
    // "B+" and "P".
    expect(monogram("Boost + Cashews")).toBe("BC");
    expect(monogram("PB&J")).toBe("PJ");
  });

  it("handles the long ones", () => {
    expect(monogram("Pasta Trapanese With Pulled Chicken")).toBe("PT");
    expect(monogram("Almond Dream Smoothie")).toBe("AD");
  });

  it("has a mark for a name it cannot read", () => {
    expect(monogram("")).toBe("?");
    expect(monogram("   ")).toBe("?");
  });
});
