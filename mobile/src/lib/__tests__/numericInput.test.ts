import { sanitizeInteger, sanitizeDecimal, nudgeOnGrid } from "../numericInput";

describe("nudgeOnGrid", () => {
  it("with step 1 it simply adds and subtracts", () => {
    expect(nudgeOnGrid(3, 1)).toBe(4);
    expect(nudgeOnGrid(3, -1)).toBe(2);
  });

  it("clamps at the floor and the ceiling", () => {
    expect(nudgeOnGrid(0, -1)).toBe(0);
    expect(nudgeOnGrid(100, 1, { step: 5, max: 100 })).toBe(100);
    expect(nudgeOnGrid(0, -1, { step: 5, max: 100 })).toBe(0);
  });

  it("snaps an off-grid value onto the grid instead of carrying its offset", () => {
    expect(nudgeOnGrid(83, 1, { step: 5, max: 100 })).toBe(85);
    expect(nudgeOnGrid(83, -1, { step: 5, max: 100 })).toBe(80);
  });

  it("steps by the step once on the grid", () => {
    expect(nudgeOnGrid(100, -1, { step: 5, max: 100 })).toBe(95);
    expect(nudgeOnGrid(95, 1, { step: 5, max: 100 })).toBe(100);
  });

  it("a non-numeric value starts from the floor", () => {
    expect(nudgeOnGrid(NaN, 1, { step: 5, min: 10 })).toBe(15);
  });
});

describe("sanitizeInteger", () => {
  it("keeps digits and drops everything else", () => {
    expect(sanitizeInteger("310")).toBe("310");
    expect(sanitizeInteger("3a1b0")).toBe("310");
    expect(sanitizeInteger("310 kcal")).toBe("310");
  });
  it("drops a decimal point — calories are whole numbers", () => {
    expect(sanitizeInteger("310.5")).toBe("3105");
  });
  it("drops signs, so a negative cannot be entered", () => {
    expect(sanitizeInteger("-40")).toBe("40");
    expect(sanitizeInteger("+40")).toBe("40");
  });
  it("leaves empty empty — that means not recorded, not zero", () => {
    expect(sanitizeInteger("")).toBe("");
    expect(sanitizeInteger("abc")).toBe("");
  });
  it("strips separators from a pasted figure", () => {
    expect(sanitizeInteger("1,550")).toBe("1550");
  });
  it("survives emoji and whitespace", () => {
    expect(sanitizeInteger(" 3 1 0 🍕")).toBe("310");
  });
});

describe("sanitizeDecimal", () => {
  it("keeps a plain decimal", () => {
    expect(sanitizeDecimal("0.5")).toBe("0.5");
    expect(sanitizeDecimal("14")).toBe("14");
  });
  it("allows only one point, keeping what follows the first", () => {
    // Fumbling the key must not eat the digits after it.
    expect(sanitizeDecimal("1..5")).toBe("1.5");
    expect(sanitizeDecimal("1.2.3")).toBe("1.23");
  });
  it("permits a bare leading point as a half-typed state", () => {
    expect(sanitizeDecimal(".")).toBe(".");
    expect(sanitizeDecimal(".5")).toBe(".5");
  });
  it("drops letters, signs and units", () => {
    expect(sanitizeDecimal("17g")).toBe("17");
    expect(sanitizeDecimal("-2.5")).toBe("2.5");
    expect(sanitizeDecimal("about 6")).toBe("6");
  });
  it("leaves empty empty", () => {
    expect(sanitizeDecimal("")).toBe("");
    expect(sanitizeDecimal("g")).toBe("");
  });
  it("keeps a trailing point, so you can keep typing after it", () => {
    expect(sanitizeDecimal("14.")).toBe("14.");
  });
  it("strips a thousands separator without merging it into the decimal", () => {
    expect(sanitizeDecimal("1,550.5")).toBe("1550.5");
  });
});
