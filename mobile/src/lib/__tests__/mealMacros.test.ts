import { formatMacroValue, formatMacroProgress } from "../mealMacros";

describe("formatMacroValue", () => {
  it("rounds calories and sodium to whole numbers with separators", () => {
    expect(formatMacroValue(2300, "calories")).toBe("2,300");
    expect(formatMacroValue(2299.6, "calories")).toBe("2,300");
    expect(formatMacroValue(1500, "sodium")).toBe("1,500");
  });

  // C6. These were "160.0" and "0.0" — a decimal of precision on numbers that
  // have none, printed on every meals screen.
  it("drops a trailing zero from a whole gram value", () => {
    expect(formatMacroValue(160, "protein")).toBe("160");
    expect(formatMacroValue(0, "protein")).toBe("0");
  });

  it("keeps a real decimal", () => {
    expect(formatMacroValue(12.5, "carbs")).toBe("12.5");
    expect(formatMacroValue(0.4, "fats")).toBe("0.4");
  });

  it("rounds to a tenth rather than printing float noise", () => {
    // Summing decimal nutrition leaves values like 39.99999999999999.
    expect(formatMacroValue(39.99999999999999, "protein")).toBe("40");
    expect(formatMacroValue(12.449999, "carbs")).toBe("12.4");
  });

  it("does not lose a value that rounds up to a whole number", () => {
    expect(formatMacroValue(19.98, "fiber")).toBe("20");
  });
});

describe("formatMacroProgress", () => {
  it("reads without stray decimals on both sides", () => {
    expect(formatMacroProgress(0, 160, "protein")).toBe("0 / 160 g");
  });

  it("still shows a partial gram where there is one", () => {
    expect(formatMacroProgress(12.5, 160, "protein")).toBe("12.5 / 160 g");
  });

  it("omits the goal when there is none", () => {
    expect(formatMacroProgress(40, null, "protein")).toBe("40g");
  });
});
