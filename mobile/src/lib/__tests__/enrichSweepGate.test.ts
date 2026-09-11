import { sweepIsDue, SWEEP_INTERVAL_MS, SWEEP_LAST_RUN_KEY } from "../enrichSweepGate";

const now = new Date("2026-09-11T12:00:00Z");

describe("sweepIsDue", () => {
  it("is due when nothing was recorded", () => {
    expect(sweepIsDue(null, now)).toBe(true);
    expect(sweepIsDue("", now)).toBe(true);
  });

  it("is due after seven days, not before", () => {
    expect(sweepIsDue("2026-09-04T12:00:00.001Z", now)).toBe(false);
    expect(sweepIsDue("2026-09-04T12:00:00.000Z", now)).toBe(true);
    expect(sweepIsDue("2026-08-01T00:00:00Z", now)).toBe(true);
  });

  it("treats garbage as never run", () => {
    expect(sweepIsDue("not a date", now)).toBe(true);
  });

  it("names its constants", () => {
    expect(SWEEP_INTERVAL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(SWEEP_LAST_RUN_KEY).toBe("catalog.enrichSweep.lastRun.v1");
  });
});
