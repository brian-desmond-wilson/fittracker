import { muscleCoverage, TRAINABLE_MUSCLES } from "../dailyCoverage";
import type { UsageRow } from "../../types/dailyBlocks";

const row = (date: string, muscles: [string, boolean][]): UsageRow => ({
  capturedWorkoutId: "w1",
  performedDate: date,
  block: "main",
  muscles: muscles.map(([name, isPrimary]) => ({ name, isPrimary })),
});

describe("muscleCoverage", () => {
  const today = "2026-08-18";

  it("empty ledger: zero load, everything equally neglected", () => {
    const cov = muscleCoverage([], today);
    expect(Object.keys(cov.load)).toHaveLength(0);
    expect(cov.yesterday.size).toBe(0);
    expect(cov.neglected).toHaveLength(TRAINABLE_MUSCLES.length);
  });

  it("empty ledger: ties break alphabetically, not by declaration order", () => {
    const cov = muscleCoverage([], today);
    expect(cov.neglected).toEqual(
      [...TRAINABLE_MUSCLES].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("today's training counts — the session being composed isn't in the ledger yet", () => {
    const cov = muscleCoverage([row("2026-08-18", [["Chest", true]])], today);
    expect(cov.load["Chest"]).toBeCloseTo(1);
  });

  it("day 7 is the last day in the window", () => {
    const cov = muscleCoverage([row("2026-08-11", [["Lats", true]])], today);
    expect(cov.load["Lats"]).toBeCloseTo(1 / 8);
  });

  it("yesterday's primaries land in `yesterday`; secondaries do not", () => {
    const cov = muscleCoverage(
      [row("2026-08-17", [["Chest", true], ["Triceps", false]])], today);
    expect(cov.yesterday.has("Chest")).toBe(true);
    expect(cov.yesterday.has("Triceps")).toBe(false);
  });

  it("recent work weighs more than old work", () => {
    const cov = muscleCoverage([
      row("2026-08-17", [["Chest", true]]),   // 1 day ago
      row("2026-08-12", [["Quads", true]]),   // 6 days ago
    ], today);
    expect(cov.load["Chest"]).toBeGreaterThan(cov.load["Quads"]);
  });

  it("secondaries count half", () => {
    const cov = muscleCoverage([
      row("2026-08-17", [["Chest", true], ["Triceps", false]]),
    ], today);
    expect(cov.load["Triceps"]).toBeCloseTo(cov.load["Chest"] / 2);
  });

  it("work older than 7 days is out of the window", () => {
    const cov = muscleCoverage([row("2026-08-10", [["Lats", true]])], today);
    expect(cov.load["Lats"]).toBeUndefined();
  });

  it("neglected sorts least-loaded first", () => {
    const cov = muscleCoverage([row("2026-08-17", [["Chest", true]])], today);
    expect(cov.neglected[cov.neglected.length - 1]).toBe("Chest");
  });
});
