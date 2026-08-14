import {
  buildDailySeries,
  computeBestStreak,
  computeCurrentStreak,
  computePace,
  computeRollingStats,
  type TotalsByDate,
} from "../waterStats";

// A fixed local noon, so nothing here depends on when the suite runs or on
// which side of a DST boundary the machine sits.
const TODAY = new Date(2026, 7, 14, 12, 0);
const flatGoal = (oz: number) => () => oz;

/** Totals for consecutive days ending on `end`, most recent first. */
function daysBack(end: Date, amounts: number[]): TotalsByDate {
  const totals: TotalsByDate = {};
  amounts.forEach((oz, i) => {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    totals[key] = oz;
  });
  return totals;
}

describe("computeCurrentStreak", () => {
  it("counts back through days that hit their goal", () => {
    const totals = daysBack(TODAY, [70, 70, 70, 10]);
    expect(computeCurrentStreak(totals, flatGoal(64), TODAY)).toBe(3);
  });

  it("does not break the streak just because today is unfinished", () => {
    // Still morning, 8 of 64 oz. Yesterday and the day before were hit, so
    // the streak stands at 2 until midnight.
    const totals = daysBack(TODAY, [8, 70, 70]);
    expect(computeCurrentStreak(totals, flatGoal(64), TODAY)).toBe(2);
  });

  it("counts today once it is hit", () => {
    const totals = daysBack(TODAY, [70, 70]);
    expect(computeCurrentStreak(totals, flatGoal(64), TODAY)).toBe(2);
  });

  it("is zero when yesterday was missed and today is unfinished", () => {
    expect(computeCurrentStreak(daysBack(TODAY, [8, 10]), flatGoal(64), TODAY)).toBe(0);
  });

  it("measures each day against that day's own goal", () => {
    const totals = daysBack(TODAY, [70, 70, 70]);
    const keyOf = (back: number) => Object.keys(totals).sort()[2 - back];
    // The middle day had a workout bonus it never covered.
    const goalForDate = (k: string) => (k === keyOf(1) ? 90 : 64);
    expect(computeCurrentStreak(totals, goalForDate, TODAY)).toBe(1);
  });

  it("is zero when there is no goal at all", () => {
    expect(computeCurrentStreak(daysBack(TODAY, [70]), flatGoal(0), TODAY)).toBe(0);
  });
});

describe("computeBestStreak", () => {
  it("finds the longest run, not the most recent one", () => {
    // 4 hit, one miss, then 2 hit up to today.
    const totals = daysBack(TODAY, [70, 70, 10, 70, 70, 70, 70]);
    expect(computeBestStreak(totals, flatGoal(64), TODAY)).toBe(4);
  });

  it("treats a day with no logs at all as a miss", () => {
    const totals = daysBack(TODAY, [70, 70]);
    delete totals[Object.keys(totals).sort()[0]];
    expect(computeBestStreak(totals, flatGoal(64), TODAY)).toBe(1);
  });

  it("is zero with no history", () => {
    expect(computeBestStreak({}, flatGoal(64), TODAY)).toBe(0);
  });

  it("counts the earliest logged day — the walk must not start late", () => {
    // Regression: the range used to begin at `new Date("YYYY-MM-DD")`, which
    // is UTC midnight and so lands on the previous local day west of
    // Greenwich. A single logged day still has to register as a streak of 1.
    const totals = daysBack(TODAY, [70]);
    expect(computeBestStreak(totals, flatGoal(64), TODAY)).toBe(1);
  });
});

describe("computeRollingStats", () => {
  it("averages over seven days, counting missing days as zero", () => {
    const totals = daysBack(TODAY, [70, 70, 70]);
    const { avgOzPerDay, daysHit, daysInWindow } = computeRollingStats(
      totals,
      flatGoal(64),
      TODAY,
    );
    expect(daysInWindow).toBe(7);
    expect(daysHit).toBe(3);
    expect(avgOzPerDay).toBeCloseTo(210 / 7);
  });

  it("ignores anything older than the window", () => {
    const totals = daysBack(TODAY, [0, 0, 0, 0, 0, 0, 0, 999]);
    expect(computeRollingStats(totals, flatGoal(64), TODAY).avgOzPerDay).toBe(0);
  });
});

describe("buildDailySeries", () => {
  it("runs oldest to newest and pads the gaps", () => {
    const series = buildDailySeries(daysBack(TODAY, [70, 0, 30]), 4, flatGoal(64), TODAY);
    expect(series).toHaveLength(4);
    expect(series.map((e) => e.total)).toEqual([0, 30, 0, 70]);
    expect(series[3].date).toBe("2026-08-14");
    expect(series.every((e) => e.goal === 64)).toBe(true);
  });
});

describe("computePace", () => {
  const window = { windowStart: "08:00", windowEnd: "22:00" };
  const at = (h: number, m = 0) => new Date(2026, 7, 14, h, m);

  it("says so once the goal is met, whatever the hour", () => {
    expect(
      computePace({ currentOz: 64, goalOz: 64, ...window, now: at(9) }).status,
    ).toBe("goal_hit");
  });

  it("holds off before and after the waking window", () => {
    expect(computePace({ currentOz: 0, goalOz: 64, ...window, now: at(6) }).status)
      .toBe("before_window");
    expect(computePace({ currentOz: 0, goalOz: 64, ...window, now: at(23) }).status)
      .toBe("after_window");
  });

  it("accepts the seconds a Postgres time column carries", () => {
    expect(
      computePace({ currentOz: 0, goalOz: 64, windowStart: "08:00:00", windowEnd: "22:00:00", now: at(6) })
        .status,
    ).toBe("before_window");
  });

  it("calls it on pace inside the tolerance band", () => {
    // Half past the window: 32 oz expected, and 4 oz either way is fine.
    expect(computePace({ currentOz: 32, goalOz: 64, ...window, now: at(15) }).status)
      .toBe("on_pace");
    expect(computePace({ currentOz: 35, goalOz: 64, ...window, now: at(15) }).status)
      .toBe("on_pace");
  });

  it("reports how far ahead", () => {
    const pace = computePace({ currentOz: 50, goalOz: 64, ...window, now: at(15) });
    expect(pace.status).toBe("ahead");
    expect(pace.ozAhead).toBe(18);
  });

  it("reports how far behind, and what to drink by when", () => {
    const pace = computePace({ currentOz: 10, goalOz: 64, ...window, now: at(15) });
    expect(pace.status).toBe("behind");
    expect(pace.ozBehind).toBe(22);
    // Next hour at least 30 minutes out, and the catch-up is measured to it.
    expect(pace.catchUpTimeLabel).toBe("4 PM");
    expect(pace.catchUpOz).toBe(27);
  });

  it("never suggests a catch-up time past the end of the window", () => {
    const pace = computePace({ currentOz: 10, goalOz: 64, ...window, now: at(21, 45) });
    expect(pace.status).toBe("behind");
    expect(pace.catchUpTimeLabel).toBe("10 PM");
  });

  it("stays quiet when there is no goal or no window to pace against", () => {
    expect(computePace({ currentOz: 10, goalOz: 0, ...window, now: at(15) }).status)
      .toBe("on_pace");
    expect(
      computePace({ currentOz: 10, goalOz: 64, windowStart: "22:00", windowEnd: "22:00", now: at(22) })
        .status,
    ).toBe("on_pace");
  });
});
