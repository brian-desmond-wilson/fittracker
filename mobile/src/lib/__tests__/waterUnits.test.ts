import {
  BEVERAGE_TYPES,
  OZ_PER_LITER,
  beverageColor,
  beverageLabel,
  formatAmount,
  formatGoal,
  formatVolume,
  litersToOz,
  ozToLiters,
} from "../waterUnits";

describe("conversion", () => {
  it("round-trips through litres", () => {
    expect(litersToOz(ozToLiters(64))).toBeCloseTo(64, 10);
  });

  it("uses US fluid ounces", () => {
    expect(ozToLiters(OZ_PER_LITER)).toBeCloseTo(1);
    expect(litersToOz(2)).toBeCloseTo(67.628);
  });
});

describe("formatVolume", () => {
  it("gives ounces one decimal and litres two", () => {
    expect(formatVolume(64, "oz")).toBe("64.0 oz");
    expect(formatVolume(64, "L")).toBe("1.89 L");
  });

  it("shows an empty day as zero rather than nothing", () => {
    expect(formatVolume(0, "oz")).toBe("0.0 oz");
    expect(formatVolume(0, "L")).toBe("0.00 L");
  });
});

describe("formatGoal", () => {
  it("keeps a goal whole in ounces", () => {
    expect(formatGoal(63.6, "oz")).toBe("64 oz");
    expect(formatGoal(64, "L")).toBe("1.89 L");
  });
});

describe("formatAmount", () => {
  it("rounds ounces to whole numbers", () => {
    expect(formatAmount(12.4, "oz")).toBe("12 oz");
  });

  it("drops to millilitres below a litre, so a glass isn't '0.24 L'", () => {
    expect(formatAmount(8, "L")).toBe("237 mL");
    expect(formatAmount(33, "L")).toBe("976 mL");
  });

  it("switches to litres at a litre and above", () => {
    expect(formatAmount(OZ_PER_LITER, "L")).toBe("1.00 L");
    expect(formatAmount(64, "L")).toBe("1.89 L");
  });
});

describe("beverages", () => {
  it("names and colours every type it declares", () => {
    for (const type of BEVERAGE_TYPES) {
      expect(beverageLabel(type)).toMatch(/^[A-Z]/);
      expect(beverageColor(type)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("gives each type its own colour", () => {
    const colours = BEVERAGE_TYPES.map(beverageColor);
    expect(new Set(colours).size).toBe(BEVERAGE_TYPES.length);
  });
});
