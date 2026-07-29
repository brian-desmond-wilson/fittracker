import {
  parsePrepMinutes,
  snapServings,
  DEFAULT_PREP_MINUTES,
  SERVING_STEP,
  MAX_SERVINGS,
} from "../mealBuilderInputs";

describe("parsePrepMinutes", () => {
  // The whole point of this function: "0" is a real answer (open and eat),
  // blank is not. `parseInt(raw, 10) || 0` collapses them and scores every
  // half-filled form as an instant meal (convenience 25/25).
  it("returns 0 for an explicit \"0\" — NOT null", () => {
    expect(parsePrepMinutes("0")).toBe(0);
  });

  it("returns null for a blank field", () => {
    expect(parsePrepMinutes("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(parsePrepMinutes("   ")).toBeNull();
  });

  it("trims surrounding whitespace around a real zero", () => {
    expect(parsePrepMinutes("  0 ")).toBe(0);
  });

  it("parses leading zeros as decimal, not octal", () => {
    expect(parsePrepMinutes("007")).toBe(7);
  });

  it("returns null for a negative number", () => {
    expect(parsePrepMinutes("-3")).toBeNull();
  });

  it("returns null for non-numeric text", () => {
    expect(parsePrepMinutes("abc")).toBeNull();
  });

  it("returns null for a decimal (prep minutes are whole minutes)", () => {
    expect(parsePrepMinutes("3.5")).toBeNull();
  });

  it("returns null for exponent notation", () => {
    expect(parsePrepMinutes("1e3")).toBeNull();
  });

  it("returns null for an explicit plus sign", () => {
    expect(parsePrepMinutes("+5")).toBeNull();
  });

  it("parses ordinary whole minutes", () => {
    expect(parsePrepMinutes("5")).toBe(5);
    expect(parsePrepMinutes("45")).toBe(45);
  });

  it("DEFAULT_PREP_MINUTES is not 0 — a blank field must not score as instant", () => {
    expect(DEFAULT_PREP_MINUTES).toBeGreaterThan(0);
  });
});

describe("snapServings", () => {
  it("keeps every value on the 0.25 grid walking the full range up", () => {
    let v: number = SERVING_STEP;
    for (let i = 0; i < 200; i++) {
      v = snapServings(v, SERVING_STEP);
      // numeric(5,2) must store it losslessly: at most 2 decimal places…
      expect(Number(v.toFixed(2))).toBe(v);
      // …and it must be an exact multiple of the step.
      expect(v / SERVING_STEP).toBe(Math.round(v / SERVING_STEP));
    }
  });

  it("keeps every value on the 0.25 grid walking the full range down", () => {
    let v: number = MAX_SERVINGS;
    for (let i = 0; i < 200; i++) {
      v = snapServings(v, -SERVING_STEP);
      expect(Number(v.toFixed(2))).toBe(v);
      expect(v / SERVING_STEP).toBe(Math.round(v / SERVING_STEP));
    }
  });

  it("clamps at the lower bound — never zero or negative servings", () => {
    expect(snapServings(SERVING_STEP, -SERVING_STEP)).toBe(SERVING_STEP);
    expect(snapServings(SERVING_STEP, -100)).toBe(SERVING_STEP);
  });

  it("clamps at the upper bound (meal_logs.servings is numeric(4,2))", () => {
    expect(snapServings(MAX_SERVINGS, SERVING_STEP)).toBe(MAX_SERVINGS);
    expect(snapServings(MAX_SERVINGS, 500)).toBe(MAX_SERVINGS);
  });

  it("snaps an off-grid seed (e.g. an older row's 1.33) onto the grid", () => {
    expect(snapServings(1.33, SERVING_STEP)).toBe(1.5);
    expect(snapServings(1.33, -SERVING_STEP)).toBe(1);
  });

  it("steps by exactly one increment from a typical value", () => {
    expect(snapServings(1, SERVING_STEP)).toBe(1.25);
    expect(snapServings(1, -SERVING_STEP)).toBe(0.75);
  });

  it("SERVING_STEP is a power of two, which is why the snap is exact", () => {
    expect(Math.log2(SERVING_STEP)).toBe(Math.round(Math.log2(SERVING_STEP)));
  });

  it("MAX_SERVINGS sits on the grid, so the upper clamp is reachable", () => {
    expect(MAX_SERVINGS / SERVING_STEP).toBe(Math.round(MAX_SERVINGS / SERVING_STEP));
  });
});
