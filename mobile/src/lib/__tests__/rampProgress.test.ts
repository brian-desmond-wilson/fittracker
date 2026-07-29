import { assessRampProgress, WeighIn } from "../rampProgress";

// Helper: n weigh-ins spread across a week starting at `monday` (YYYY-MM-DD),
// each at `weight` lbs.
function week(monday: string, weight: number, count = 4): WeighIn[] {
  const [y, m, d] = monday.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    return {
      date: dt.toISOString().slice(0, 10),
      weight_lbs: weight,
    };
  });
}

describe("assessRampProgress", () => {
  const today = "2026-07-27"; // a Monday

  it("returns insufficient_data with no weigh-ins", () => {
    const r = assessRampProgress([], null, today);
    expect(r.recommendation).toBe("insufficient_data");
    expect(r.weeklyGainLbs).toBeNull();
  });

  it("returns insufficient_data when weeks have fewer than 3 weigh-ins", () => {
    const logs = [...week("2026-07-06", 163, 2), ...week("2026-07-13", 163.6, 2)];
    const r = assessRampProgress(logs, null, today);
    expect(r.recommendation).toBe("insufficient_data");
  });

  it("recommends hold when gaining within the 0.5-0.75 lb/wk target band", () => {
    const logs = [
      ...week("2026-07-06", 163),
      ...week("2026-07-13", 163.6),
      ...week("2026-07-20", 164.2),
    ];
    const r = assessRampProgress(logs, null, today);
    expect(r.recommendation).toBe("hold");
    expect(r.weeklyGainLbs).toBeCloseTo(0.6, 5);
  });

  it("recommends advance after 2 consecutive plateau weeks (<0.25 lb/wk)", () => {
    const logs = [
      ...week("2026-07-06", 164),
      ...week("2026-07-13", 164.1),
      ...week("2026-07-20", 164.15),
    ];
    const r = assessRampProgress(logs, null, today);
    expect(r.recommendation).toBe("advance");
  });

  it("holds during the first week at a level even if plateaued", () => {
    const logs = [
      ...week("2026-07-06", 164),
      ...week("2026-07-13", 164.1),
      ...week("2026-07-20", 164.15),
    ];
    const r = assessRampProgress(logs, "2026-07-24", today); // 3 days ago
    expect(r.recommendation).toBe("hold");
    expect(r.reason).toMatch(/week at/i);
  });

  it("waives the level-time gate when started_at is null (seeded state)", () => {
    const logs = [
      ...week("2026-07-06", 164),
      ...week("2026-07-13", 164.1),
      ...week("2026-07-20", 164.15),
    ];
    const r = assessRampProgress(logs, null, today);
    expect(r.recommendation).toBe("advance");
  });

  it("only one plateau week is not enough to advance", () => {
    const logs = [
      ...week("2026-07-06", 163),
      ...week("2026-07-13", 163.6), // +0.6 (in band)
      ...week("2026-07-20", 163.7), // +0.1 (plateau, but just one)
    ];
    const r = assessRampProgress(logs, null, today);
    expect(r.recommendation).toBe("hold");
  });
});
