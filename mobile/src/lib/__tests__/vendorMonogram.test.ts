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
