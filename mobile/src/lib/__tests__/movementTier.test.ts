import { computeTiers, type TierRow } from "../movementTier";

const row = (id: string, parent: string | null = null): TierRow => ({
  id,
  parent_exercise_id: parent,
});

describe("computeTiers", () => {
  it("calls a movement with no parent tier 0", () => {
    expect(computeTiers([row("squat")]).get("squat")).toBe(0);
  });

  it("counts one step per level, the way the SQL does", () => {
    const tiers = computeTiers([
      row("lunge"),
      row("alt-lunge", "lunge"),
      row("alt-db-lunge", "alt-lunge"),
      row("alt-single-db-lunge", "alt-db-lunge"),
    ]);
    expect(tiers.get("lunge")).toBe(0);
    expect(tiers.get("alt-lunge")).toBe(1);
    expect(tiers.get("alt-db-lunge")).toBe(2);
    expect(tiers.get("alt-single-db-lunge")).toBe(3);
  });

  it("gives siblings the same tier", () => {
    const tiers = computeTiers([row("press"), row("push", "press"), row("jerk", "press")]);
    expect(tiers.get("push")).toBe(1);
    expect(tiers.get("jerk")).toBe(1);
  });

  it("does not depend on the order rows arrive in", () => {
    const forwards = computeTiers([row("a"), row("b", "a"), row("c", "b")]);
    const backwards = computeTiers([row("c", "b"), row("b", "a"), row("a")]);
    expect([...backwards.entries()].sort()).toEqual([...forwards.entries()].sort());
  });

  it("stops at a parent that is not in the set", () => {
    // A filtered slice can name a parent it doesn't contain; the walk counts
    // the steps it could actually take rather than guessing at the rest.
    expect(computeTiers([row("child", "absent-parent")]).get("child")).toBe(0);
  });

  it("stops on a cycle rather than hanging", () => {
    const tiers = computeTiers([row("a", "b"), row("b", "a")]);
    expect(tiers.get("a")).toBeLessThanOrEqual(1);
    expect(tiers.get("b")).toBeLessThanOrEqual(1);
  });

  it("answers for every row it was given", () => {
    const rows = [row("a"), row("b", "a"), row("c")];
    const tiers = computeTiers(rows);
    expect([...tiers.keys()].sort()).toEqual(["a", "b", "c"]);
  });

  it("has nothing to say about an empty table", () => {
    expect(computeTiers([]).size).toBe(0);
  });

  it("handles a deep chain in one pass", () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      row(`n${i}`, i === 0 ? null : `n${i - 1}`),
    );
    expect(computeTiers(rows).get("n199")).toBe(199);
  });
});
