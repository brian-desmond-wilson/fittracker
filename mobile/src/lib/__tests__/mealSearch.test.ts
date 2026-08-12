import { matchesQuery } from "../mealSearch";

describe("matchesQuery", () => {
  it("ignores case", () => {
    expect(matchesQuery("Greek Yogurt Bowl", "greek")).toBe(true);
    expect(matchesQuery("greek yogurt bowl", "GREEK")).toBe(true);
  });

  it("matches inside a word, not just at its start", () => {
    expect(matchesQuery("Protein Oatmeal Bowl", "oat")).toBe(true);
  });

  it("matches words that are not adjacent — the half-remembered name", () => {
    // A plain `includes` fails this, and it is how people actually type.
    expect(matchesQuery("Protein Oatmeal Bowl", "oat bowl")).toBe(true);
    expect(matchesQuery("Strawberry-Rhubarb Crumble With Vanilla", "crumble vanilla")).toBe(true);
  });

  it("requires every word, not any", () => {
    expect(matchesQuery("Greek Yogurt Bowl", "greek taco")).toBe(false);
  });

  it("tolerates messy whitespace", () => {
    expect(matchesQuery("Greek Yogurt Bowl", "  greek   bowl ")).toBe(true);
  });

  it("never matches on an empty query", () => {
    expect(matchesQuery("Greek Yogurt Bowl", "")).toBe(false);
    expect(matchesQuery("Greek Yogurt Bowl", "   ")).toBe(false);
  });

  it("does not match an unrelated meal", () => {
    expect(matchesQuery("Taco Bowl", "oatmeal")).toBe(false);
  });
});
