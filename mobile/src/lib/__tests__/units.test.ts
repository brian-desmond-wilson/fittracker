import { formatQuantity, normalizeUnit } from "../units";

describe("normalizeUnit", () => {
  it("maps raw DB strings onto the known kinds", () => {
    expect(normalizeUnit("count")).toBe("count");
    expect(normalizeUnit("servings")).toBe("servings");
    expect(normalizeUnit("serving")).toBe("servings");
    expect(normalizeUnit("oz")).toBe("oz");
    expect(normalizeUnit("g")).toBe("g");
  });
  it("unknown, empty, and null collapse to count — the honest default", () => {
    expect(normalizeUnit("bottles")).toBe("count");
    expect(normalizeUnit("")).toBe("count");
    expect(normalizeUnit(null)).toBe("count");
    expect(normalizeUnit(undefined)).toBe("count");
  });
});

describe("formatQuantity — A11's one display rule", () => {
  it("count reads as plain stock, no unit noise", () => {
    expect(formatQuantity(2, "count")).toBe("2 in stock");
    expect(formatQuantity(1, "count")).toBe("1 in stock");
    expect(formatQuantity(0, "count")).toBe("Out of stock");
  });
  it("servings keep their word, singular and plural", () => {
    expect(formatQuantity(10, "servings")).toBe("10 servings");
    expect(formatQuantity(1, "serving")).toBe("1 serving");
    expect(formatQuantity(0, "servings")).toBe("Out of stock");
  });
  it("measures read value-plus-unit", () => {
    expect(formatQuantity(12, "oz")).toBe("12 oz");
    expect(formatQuantity(500, "g")).toBe("500 g");
  });
  it("unknown units fall back to count semantics", () => {
    expect(formatQuantity(3, "bottles")).toBe("3 in stock");
  });
});
