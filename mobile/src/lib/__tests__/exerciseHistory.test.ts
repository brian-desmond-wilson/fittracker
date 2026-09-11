import {
  bestSet, topSetPerSession, sessionCount, lastDonePhrase, formatShortDate,
  trendBars, trendDirection, sessionRows, formatSet,
} from "../exerciseHistory";
import type { WorkingSet } from "../exerciseHistory";

const ws = (
  sessionId: string, sessionDate: string, weightLbs: number, reps: number,
  o: Partial<WorkingSet> = {},
): WorkingSet => ({
  sessionId, sessionDate, sessionNumber: 1, sessionName: "Push Day", weightLbs, reps, ...o,
});

/** n sessions, one set each, on consecutive August days, weights from `weight(i)`. */
const series = (n: number, weight: (i: number) => number, reps = 10): WorkingSet[] =>
  Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    return ws(`s${i}`, `2026-08-${String(i).padStart(2, "0")}`, weight(i), reps);
  });

describe("bestSet", () => {
  it("heaviest weight wins", () => {
    const sets = [ws("a", "2026-09-01", 50, 12), ws("b", "2026-09-02", 60, 5), ws("c", "2026-09-03", 55, 20)];
    expect(bestSet(sets)?.sessionId).toBe("b");
  });

  it("ties on weight break on reps", () => {
    const sets = [ws("a", "2026-09-01", 50, 12), ws("b", "2026-09-02", 50, 15)];
    expect(bestSet(sets)?.sessionId).toBe("b");
  });

  it("all unweighted: most reps wins", () => {
    const sets = [ws("a", "2026-09-01", 0, 12), ws("b", "2026-09-02", 0, 20), ws("c", "2026-09-03", 0, 8)];
    expect(bestSet(sets)?.sessionId).toBe("b");
  });

  it("a weighted set beats any unweighted set", () => {
    const sets = [ws("a", "2026-09-01", 0, 30), ws("b", "2026-09-02", 20, 5)];
    expect(bestSet(sets)?.sessionId).toBe("b");
  });

  it("is null with no sets", () => {
    expect(bestSet([])).toBeNull();
  });

  it("a tie across two sessions goes to the earlier one, whatever the input order", () => {
    const a = ws("a", "2026-09-01", 50, 10);
    const b = ws("b", "2026-09-02", 50, 10);
    expect(bestSet([a, b])?.sessionId).toBe("a");
    expect(bestSet([b, a])?.sessionId).toBe("a");
  });
});

describe("topSetPerSession and sessionCount", () => {
  it("one row per session, oldest first, carrying the session's best set", () => {
    const sets = [
      ws("b", "2026-09-02", 40, 10), ws("a", "2026-09-01", 50, 8), ws("a", "2026-09-01", 55, 6),
    ];
    const tops = topSetPerSession(sets);
    expect(tops.map((t) => t.sessionId)).toEqual(["a", "b"]);
    expect(tops[0].topSet.weightLbs).toBe(55);
    expect(sessionCount(sets)).toBe(2);
  });

  it("same-day sessions order by session number", () => {
    const sets = [
      ws("late", "2026-09-01", 40, 10, { sessionNumber: 2 }),
      ws("early", "2026-09-01", 40, 10, { sessionNumber: 1 }),
    ];
    expect(topSetPerSession(sets).map((t) => t.sessionId)).toEqual(["early", "late"]);
  });
});

describe("lastDonePhrase", () => {
  const today = "2026-09-11";
  it("today, yesterday, days ago, then the date", () => {
    expect(lastDonePhrase(today, "2026-09-11")).toBe("Today");
    expect(lastDonePhrase(today, "2026-09-10")).toBe("Yesterday");
    expect(lastDonePhrase(today, "2026-09-08")).toBe("3 days ago");
    expect(lastDonePhrase(today, "2026-08-12")).toBe("30 days ago");
    expect(lastDonePhrase(today, "2026-08-11")).toBe("11 Aug");
    expect(lastDonePhrase(today, "2025-12-25")).toBe("25 Dec 2025");
  });

  it("returns the raw date when either input is malformed", () => {
    expect(lastDonePhrase(today, "bogus")).toBe("bogus");
    expect(lastDonePhrase("bogus", "2026-09-01")).toBe("2026-09-01");
  });
});

describe("formatShortDate", () => {
  it("drops the year inside the current year", () => {
    expect(formatShortDate("2026-09-08", "2026-09-11")).toBe("8 Sep");
    expect(formatShortDate("2025-09-08", "2026-09-11")).toBe("8 Sep 2025");
  });

  it("returns the raw string when the date is malformed", () => {
    expect(formatShortDate("bogus", "2026-09-11")).toBe("bogus");
    expect(formatShortDate("2026-9-8", "2026-09-11")).toBe("2026-9-8");
  });
});

describe("trendBars", () => {
  it("one bar per session, oldest left, tallest is 1, best-ever flagged", () => {
    const bars = trendBars(series(3, (i) => 100 + i * 10));
    expect(bars.map((b) => b.sessionId)).toEqual(["s1", "s2", "s3"]);
    expect(bars[2].height).toBe(1);
    expect(bars[0].height).toBeCloseTo(110 / 130);
    expect(bars.map((b) => b.best)).toEqual([false, false, true]);
  });

  it("keeps only the last eight of twenty", () => {
    const bars = trendBars(series(20, (i) => 100 + i));
    expect(bars).toHaveLength(8);
    expect(bars[0].sessionId).toBe("s13");
    expect(bars[7].sessionId).toBe("s20");
  });

  it("the best-ever bar can fall outside the window", () => {
    const bars = trendBars(series(20, (i) => (i === 2 ? 500 : 100)));
    expect(bars.every((b) => !b.best)).toBe(true);
    expect(bars.every((b) => b.height === 1)).toBe(true);
  });

  it("unweighted history draws reps", () => {
    const bars = trendBars([ws("a", "2026-09-01", 0, 5), ws("b", "2026-09-02", 0, 10)]);
    expect(bars.map((b) => b.height)).toEqual([0.5, 1]);
  });

  it("one session is one bar", () => {
    expect(trendBars(series(1, () => 100))).toHaveLength(1);
  });

  it("judges weighted-vs-reps on the window, not the whole history", () => {
    // One weighted set years ago, then eight unweighted sessions with rising reps:
    // the bars shown are all unweighted, so they draw reps, not a row of zeros.
    const sets = [ws("old", "2024-01-01", 50, 5), ...series(8, () => 0, 0).map((s, k) => ({ ...s, reps: 5 + k }))];
    const heights = trendBars(sets).map((b) => b.height);
    expect(heights).toHaveLength(8);
    expect(heights[7]).toBe(1);
    for (let k = 1; k < heights.length; k++) expect(heights[k]).toBeGreaterThan(heights[k - 1]);
    expect(trendDirection(sets)).toBe("up");
  });
});

describe("trendDirection", () => {
  it("is null under three sessions", () => {
    expect(trendDirection(series(1, () => 100))).toBeNull();
    expect(trendDirection(series(2, (i) => 100 + i))).toBeNull();
  });

  it("up when the latest beats the median of the earlier bars", () => {
    expect(trendDirection(series(3, (i) => 100 + i * 10))).toBe("up");
    expect(trendDirection(series(8, (i) => 100 + i * 5))).toBe("up");
  });

  it("down when below, steady when equal", () => {
    expect(trendDirection(series(8, (i) => 200 - i * 5))).toBe("down");
    expect(trendDirection(series(20, () => 100))).toBe("steady");
  });

  it("judges only the eight bars shown", () => {
    // Sessions 1–12 heavy, 13–19 light, 20 light: the window is all light → steady.
    expect(trendDirection(series(20, (i) => (i <= 12 ? 300 : 100)))).toBe("steady");
  });
});

describe("sessionRows", () => {
  it("newest first, top set per row, PR when that session set a record", () => {
    const rows = sessionRows(series(3, (i) => 100 + i * 10));
    expect(rows.map((r) => r.sessionId)).toEqual(["s3", "s2", "s1"]);
    expect(rows[0].topSet.weightLbs).toBe(130);
    // The first session is a baseline, not a record.
    expect(rows.map((r) => r.isPr)).toEqual([true, true, false]);
  });

  it("no PR on a session that did not beat the prior best", () => {
    const rows = sessionRows([
      ws("a", "2026-09-01", 100, 5), ws("b", "2026-09-02", 90, 5), ws("c", "2026-09-03", 90, 5),
    ]);
    expect(rows.map((r) => `${r.sessionId}:${r.isPr}`)).toEqual(["c:false", "b:false", "a:false"]);
  });

  it("a session volume record without a weight record is not a PR", () => {
    // b lifts more total (90×5 twice) than a (100×5 once) but never beats a's top set.
    const rows = sessionRows([
      ws("a", "2026-09-01", 100, 5), ws("b", "2026-09-02", 90, 5), ws("b", "2026-09-02", 90, 5),
    ]);
    expect(rows.map((r) => `${r.sessionId}:${r.isPr}`)).toEqual(["b:false", "a:false"]);
  });

  it("an all-unweighted history earns a PR when the top set's reps beat every earlier session", () => {
    const rows = sessionRows([
      ws("s1", "2026-09-01", 0, 5), ws("s2", "2026-09-02", 0, 10),
      ws("s3", "2026-09-03", 0, 8), ws("s4", "2026-09-04", 0, 15),
    ]);
    expect(rows.map((r) => r.topSet.reps)).toEqual([15, 8, 10, 5]);
    expect(rows.map((r) => r.isPr)).toEqual([true, false, true, false]);
  });
});

describe("formatSet", () => {
  it("weighted and unweighted forms", () => {
    expect(formatSet({ weightLbs: 50, reps: 12 })).toBe("50 lb × 12");
    expect(formatSet({ weightLbs: 52.5, reps: 3 })).toBe("52.5 lb × 3");
    expect(formatSet({ weightLbs: 0, reps: 12 })).toBe("12 reps");
    expect(formatSet({ weightLbs: 0, reps: 1 })).toBe("1 rep");
  });
});
