import { nextSplitDay, rampWeek } from "../dailySplit";

describe("nextSplitDay", () => {
  it("starts at push with no history", () => {
    expect(nextSplitDay(null)).toBe("push");
  });
  it("rotates push → pull → legs → push", () => {
    expect(nextSplitDay("push")).toBe("pull");
    expect(nextSplitDay("pull")).toBe("legs");
    expect(nextSplitDay("legs")).toBe("push");
  });
  // The spec's travel rule: a missed day shifts the sequence, never breaks
  // it — which falls out of keying on last COMPLETED day, so there is no
  // date math to get wrong.
});

describe("rampWeek", () => {
  it("is week 1 with no first session", () => {
    expect(rampWeek(null, "2026-08-17")).toBe(1);
  });
  it("counts weeks from the first session date", () => {
    expect(rampWeek("2026-08-17", "2026-08-17")).toBe(1);
    expect(rampWeek("2026-08-17", "2026-08-23")).toBe(1);
    expect(rampWeek("2026-08-17", "2026-08-24")).toBe(2);
    expect(rampWeek("2026-08-17", "2026-09-01")).toBe(3);
  });
  it("never returns less than 1", () => {
    expect(rampWeek("2026-08-20", "2026-08-17")).toBe(1);
  });
});
