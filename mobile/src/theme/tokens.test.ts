// mobile/src/theme/tokens.test.ts
import { tint } from "./tokens";

describe("tint", () => {
  it("produces the standard 15% fill", () => {
    expect(tint("#22C55E")).toBe("rgba(34,197,94,0.15)");
  });
  it("accepts an explicit alpha", () => {
    expect(tint("#F59E0B", 0.3)).toBe("rgba(245,158,11,0.3)");
  });
  it("handles lowercase hex", () => {
    expect(tint("#f97316")).toBe("rgba(249,115,22,0.15)");
  });
  it("throws on malformed input rather than emitting a broken color", () => {
    expect(() => tint("#FFF")).toThrow();     // shorthand not supported
    expect(() => tint("22C55E")).toThrow();   // missing #
  });
});
