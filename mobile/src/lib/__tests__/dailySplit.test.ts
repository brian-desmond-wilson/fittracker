import { lastStampedSplitDay, nextSplitDay, rampWeek } from "../dailySplit";

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

describe("lastStampedSplitDay", () => {
  const row = (
    sessionDate: string,
    createdAt: string,
    splitDay: "push" | "pull" | "legs" | null,
    status: string,
  ) => ({ sessionDate, createdAt, splitDay, status });

  it("is null with no history", () => {
    expect(lastStampedSplitDay([])).toBeNull();
  });

  it("finds the most recent completed stamp", () => {
    expect(
      lastStampedSplitDay([
        row("2026-08-15", "2026-08-15T08:00:00Z", "push", "completed"),
        row("2026-08-16", "2026-08-16T08:00:00Z", "pull", "completed"),
      ]),
    ).toBe("pull");
  });

  it("ignores sessions that were not completed", () => {
    expect(
      lastStampedSplitDay([
        row("2026-08-15", "2026-08-15T08:00:00Z", "push", "completed"),
        row("2026-08-16", "2026-08-16T08:00:00Z", "pull", "skipped"),
        row("2026-08-17", "2026-08-17T08:00:00Z", "legs", "suggested"),
      ]),
    ).toBe("push");
  });

  // The point of the whole feature: a catalog workout does not consume a slot
  // in the rotation, so tomorrow serves what today was going to.
  it("reads past an unstamped session to the last stamped one", () => {
    expect(
      lastStampedSplitDay([
        row("2026-08-15", "2026-08-15T08:00:00Z", "push", "completed"),
        row("2026-08-16", "2026-08-16T08:00:00Z", null, "completed"),
        row("2026-08-17", "2026-08-17T08:00:00Z", null, "completed"),
      ]),
    ).toBe("push");
  });

  it("still starts a genuinely fresh user at push", () => {
    const onlyUnstamped = lastStampedSplitDay([
      row("2026-08-17", "2026-08-17T08:00:00Z", null, "completed"),
    ]);
    expect(onlyUnstamped).toBeNull();
    expect(nextSplitDay(onlyUnstamped)).toBe("push");
  });

  // A day can hold two completed sessions now, so date alone leaves them tied.
  it("breaks a same-day tie on creation time", () => {
    expect(
      lastStampedSplitDay([
        row("2026-08-17", "2026-08-17T19:00:00Z", null, "completed"),
        row("2026-08-17", "2026-08-17T08:00:00Z", "pull", "completed"),
      ]),
    ).toBe("pull");
  });

  it("takes the later stamp when both same-day sessions carry one", () => {
    expect(
      lastStampedSplitDay([
        row("2026-08-17", "2026-08-17T08:00:00Z", "pull", "completed"),
        row("2026-08-17", "2026-08-17T19:00:00Z", "legs", "completed"),
      ]),
    ).toBe("legs");
  });
});
