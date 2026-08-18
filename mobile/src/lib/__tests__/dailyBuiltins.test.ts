import { BUILTINS, findBuiltin, builtinByKey } from "../dailyBuiltins";

describe("built-in fallback library", () => {
  it("ships warmup, mobility and cooldown in all three focuses", () => {
    for (const role of ["warmup", "mobility", "cooldown"] as const) {
      for (const focus of ["upper", "lower", "full"] as const) {
        const hit = BUILTINS.find((b) => b.role === role && b.focus === focus);
        expect(hit).toBeDefined();
        expect(hit!.movements.length).toBeGreaterThanOrEqual(3);
        expect(hit!.minutes).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("keys are unique and stable-looking", () => {
    const keys = BUILTINS.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^builtin-(warmup|mobility|cooldown)-(upper|lower|full)$/);
  });

  it("findBuiltin matches role and focus", () => {
    expect(findBuiltin("warmup", "upper")!.key).toBe("builtin-warmup-upper");
    expect(findBuiltin("mobility", "lower")!.key).toBe("builtin-mobility-lower");
  });

  it("builtinByKey round-trips", () => {
    expect(builtinByKey("builtin-cooldown-full")!.role).toBe("cooldown");
    expect(builtinByKey("nope")).toBeNull();
  });
});
