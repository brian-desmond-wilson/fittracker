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
    const r = assessRampProgress({ weighIns: [], levelStartedAt: null, today });
    expect(r.recommendation).toBe("insufficient_data");
    expect(r.weeklyGainLbs).toBeNull();
  });

  it("returns insufficient_data when weeks have fewer than 3 weigh-ins", () => {
    const logs = [...week("2026-07-06", 163, 2), ...week("2026-07-13", 163.6, 2)];
    const r = assessRampProgress({ weighIns: logs, levelStartedAt: null, today });
    expect(r.recommendation).toBe("insufficient_data");
  });

  it("recommends hold when gaining within the 0.5-0.75 lb/wk target band", () => {
    const logs = [
      ...week("2026-07-06", 163),
      ...week("2026-07-13", 163.6),
      ...week("2026-07-20", 164.2),
    ];
    const r = assessRampProgress({ weighIns: logs, levelStartedAt: null, today });
    expect(r.recommendation).toBe("hold");
    expect(r.weeklyGainLbs).toBeCloseTo(0.6, 5);
  });

  it("recommends advance after 2 consecutive plateau weeks (<0.25 lb/wk)", () => {
    const logs = [
      ...week("2026-07-06", 164),
      ...week("2026-07-13", 164.1),
      ...week("2026-07-20", 164.15),
    ];
    const r = assessRampProgress({ weighIns: logs, levelStartedAt: null, today });
    expect(r.recommendation).toBe("advance");
  });

  it("holds during the first week at a level even if plateaued", () => {
    const logs = [
      ...week("2026-07-06", 164),
      ...week("2026-07-13", 164.1),
      ...week("2026-07-20", 164.15),
    ];
    const r = assessRampProgress({
      weighIns: logs,
      levelStartedAt: "2026-07-24", // 3 days ago
      today,
    });
    expect(r.recommendation).toBe("hold");
    expect(r.reason).toMatch(/week at/i);
  });

  it("waives the level-time gate when started_at is null (seeded state)", () => {
    const logs = [
      ...week("2026-07-06", 164),
      ...week("2026-07-13", 164.1),
      ...week("2026-07-20", 164.15),
    ];
    const r = assessRampProgress({ weighIns: logs, levelStartedAt: null, today });
    expect(r.recommendation).toBe("advance");
  });

  it("only one plateau week is not enough to advance", () => {
    const logs = [
      ...week("2026-07-06", 163),
      ...week("2026-07-13", 163.6), // +0.6 (in band)
      ...week("2026-07-20", 163.7), // +0.1 (plateau, but just one)
    ];
    const r = assessRampProgress({ weighIns: logs, levelStartedAt: null, today });
    expect(r.recommendation).toBe("hold");
  });

  it("normalizes gains across a gap week instead of treating surviving weeks as adjacent", () => {
    // Week of 7/6 (Mon-Thu, qualifies): avg 164.0
    // Week of 7/13: only a single weigh-in on 7/15 -- doesn't qualify, dropped
    // Week of 7/20 (qualifies): avg 164.3 -- two calendar weeks after 7/6
    // Week of 7/27 (qualifies): avg 164.35 -- one calendar week after 7/20
    // Naive adjacent-week math would read the first gap as +0.3 lb in "one
    // week" (fails the plateau test), when it's really +0.15 lb/wk over the
    // true two-week span -- a genuine plateau once normalized.
    const logs: WeighIn[] = [
      ...week("2026-07-06", 164.0),
      { date: "2026-07-15", weight_lbs: 164.3 },
      ...week("2026-07-20", 164.3),
      ...week("2026-07-27", 164.35),
    ];
    const r = assessRampProgress({
      weighIns: logs,
      levelStartedAt: null,
      today: "2026-08-03",
    });
    expect(r.recommendation).toBe("advance");
  });

  it("recommends hold with a reason mentioning faster-than-target when gaining above the band", () => {
    const logs = [
      ...week("2026-07-06", 163),
      ...week("2026-07-13", 164),
      ...week("2026-07-20", 165),
    ];
    const r = assessRampProgress({ weighIns: logs, levelStartedAt: null, today });
    expect(r.recommendation).toBe("hold");
    expect(r.reason).toMatch(/faster than the target/i);
  });

  it("returns insufficient_data when fewer than 3 weeks qualify amid thin weeks", () => {
    const logs = [
      ...week("2026-07-06", 163, 1), // thin, doesn't qualify
      ...week("2026-07-13", 163.5), // qualifies
      ...week("2026-07-20", 164, 2), // thin, doesn't qualify
      ...week("2026-07-27", 164.4), // qualifies -- only 2 qualifying weeks total
    ];
    const r = assessRampProgress({
      weighIns: logs,
      levelStartedAt: null,
      today: "2026-08-03",
    });
    expect(r.recommendation).toBe("insufficient_data");
  });

  it("describes a declining trend honestly rather than claiming a gain", () => {
    const logs = [
      ...week("2026-07-06", 165),
      ...week("2026-07-13", 164),
      ...week("2026-07-20", 163),
    ];
    const r = assessRampProgress({ weighIns: logs, levelStartedAt: null, today });
    expect(r.recommendation).toBe("advance");
    expect(r.reason).not.toMatch(/gained/i);
  });
});
