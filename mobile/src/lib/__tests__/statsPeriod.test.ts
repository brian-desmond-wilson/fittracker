import {
  bucketIndexFor,
  bucketLabels,
  bucketSeries,
  estimatedOneRepMax,
  liftCandidates,
  periodRange,
  periodSummary,
  strengthSeries,
  summaryDelta,
} from "../statsPeriod";
import type { HistoryExercise, HistorySession, HistorySet } from "../../types/gymSessions";

const set = (over: Partial<HistorySet> = {}): HistorySet => ({
  setNumber: 1, reps: 10, weightLbs: 100, volumeLbs: 1000, isWarmup: false,
  difficulty: null, startedAt: null, endedAt: null, durationSeconds: null,
  timingSource: null, ...over,
});

const exercise = (sets: HistorySet[], name = "Movement"): HistoryExercise => ({
  id: `ex-${name}`, exerciseId: `id-${name}`, name, order: 1, difficulty: null,
  primaryRegions: ["Chest"], sets,
});

const session = (
  date: string,
  over: Partial<HistorySession> = {},
): HistorySession => ({
  id: `s-${date}-${Math.random()}`, date, sessionNumber: 1, sessionCount: 1,
  startedAt: null, endedAt: null, durationSeconds: 3600, name: null,
  source: "unknown", capturedWorkoutId: null, capturedWorkoutHandle: null,
  estimatedMinutes: null, mainBlockWorkoutName: null,
  exercises: [exercise([set()])], ...over,
});

// today is Monday 2026-08-24 throughout; its calendar week is Sun 08-23..Sat 08-29.
const TODAY = "2026-08-24";

describe("periodRange", () => {
  it("weeks run Sunday to Saturday, with the previous week behind", () => {
    expect(periodRange("week", TODAY)).toEqual({
      start: "2026-08-23", end: "2026-08-29",
      prevStart: "2026-08-16", prevEnd: "2026-08-22",
    });
  });
  it("months are calendar months", () => {
    expect(periodRange("month", TODAY)).toEqual({
      start: "2026-08-01", end: "2026-08-31",
      prevStart: "2026-07-01", prevEnd: "2026-07-31",
    });
  });
  it("years are calendar years", () => {
    expect(periodRange("year", TODAY)).toEqual({
      start: "2026-01-01", end: "2026-12-31",
      prevStart: "2025-01-01", prevEnd: "2025-12-31",
    });
  });
  it("January's previous month crosses the year boundary", () => {
    expect(periodRange("month", "2026-01-15").prevStart).toBe("2025-12-01");
    expect(periodRange("month", "2026-01-15").prevEnd).toBe("2025-12-31");
  });
});

describe("periodSummary", () => {
  const sessions = [
    session("2026-08-24"),                       // this week
    session("2026-08-23"),                       // this week (Sunday)
    session("2026-08-19", { durationSeconds: 1800 }), // last week
    session("2026-07-30"),                       // last month
  ];
  it("counts workouts, minutes, volume, exercises inside the range", () => {
    const s = periodSummary(sessions, periodRange("week", TODAY));
    expect(s.workouts).toBe(2);
    expect(s.minutes).toBe(120);
    expect(s.volumeLbs).toBe(2000);
    expect(s.exercises).toBe(2);
  });
  it("computes the previous period for comparison", () => {
    const s = periodSummary(sessions, periodRange("week", TODAY));
    expect(s.prev.workouts).toBe(1);
    expect(s.prev.minutes).toBe(30);
  });
});

describe("summaryDelta", () => {
  it("formats signed deltas and names the previous period", () => {
    expect(summaryDelta(6, 2, "week")).toBe("+4 vs last week");
    expect(summaryDelta(2, 6, "month")).toBe("-4 vs last month");
    expect(summaryDelta(3, 3, "year")).toBe("same as last year");
  });
});

describe("bucketSeries", () => {
  it("week scope buckets by day, seven buckets", () => {
    const sessions = [session("2026-08-24"), session("2026-08-24"), session("2026-08-27")];
    const buckets = bucketSeries(sessions, "week", TODAY, sessionCountOf);
    expect(buckets).toHaveLength(7);
    expect(buckets[1]).toBe(2); // Monday
    expect(buckets[4]).toBe(1); // Thursday
  });
  it("month scope buckets by calendar week rows", () => {
    // August 2026 spans 6 week-rows (Aug 1 is a Saturday).
    const sessions = [session("2026-08-01"), session("2026-08-24")];
    const buckets = bucketSeries(sessions, "month", TODAY, sessionCountOf);
    expect(buckets).toHaveLength(6);
    expect(buckets[0]).toBe(1); // week containing Aug 1
    expect(buckets[4]).toBe(1); // week containing Aug 24
  });
  it("year scope buckets by month, twelve buckets", () => {
    const sessions = [session("2026-01-10"), session("2026-08-24"), session("2026-08-01")];
    const buckets = bucketSeries(sessions, "year", TODAY, sessionCountOf);
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toBe(1);
    expect(buckets[7]).toBe(2);
  });
});

const sessionCountOf = (group: HistorySession[]) => group.length;

describe("bucketIndexFor", () => {
  it("places a date in the same bucket bucketSeries would group it into", () => {
    expect(bucketIndexFor("2026-08-24", "week", TODAY)).toBe(1); // Monday
    expect(bucketIndexFor("2026-08-01", "month", TODAY)).toBe(0); // week containing Aug 1
  });
});

describe("bucketLabels", () => {
  it("names buckets per scope", () => {
    expect(bucketLabels("week", TODAY)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(bucketLabels("month", TODAY)).toEqual(["W1", "W2", "W3", "W4", "W5", "W6"]);
    expect(bucketLabels("year", TODAY)).toEqual(["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]);
  });
});

const lift = (
  date: string,
  name: string,
  sets: HistorySet[],
): HistorySession =>
  session(date, {
    exercises: [{
      id: `ex-${name}-${date}`, exerciseId: `id-${name}`, name, order: 1,
      difficulty: null, primaryRegions: ["Chest"], sets,
    }],
  });

describe("estimatedOneRepMax", () => {
  it("uses Epley on the best working set", () => {
    // 165×5 → 165*(1+5/30) = 192.5 → 193
    expect(estimatedOneRepMax([set({ weightLbs: 165, reps: 5 }), set({ weightLbs: 135, reps: 10 })])).toBe(193);
  });
  it("ignores warm-ups and unloaded sets", () => {
    expect(estimatedOneRepMax([
      set({ weightLbs: 225, reps: 5, isWarmup: true }),
      set({ weightLbs: 0, reps: 20 }),
    ])).toBeNull();
  });
  it("takes a true single at face value", () => {
    expect(estimatedOneRepMax([set({ weightLbs: 200, reps: 1 })])).toBe(200);
  });
});

describe("liftCandidates", () => {
  it("ranks loaded lifts by working sets and keeps the top four", () => {
    const sessions = [
      lift("2026-08-24", "Bench Press", [set(), set(), set()]),
      lift("2026-08-23", "Bench Press", [set(), set()]),
      lift("2026-08-22", "Row", [set(), set(), set(), set()]),
      lift("2026-08-21", "Squat", [set(), set()]),
      lift("2026-08-20", "OHP", [set()]),
      lift("2026-08-19", "Curl", [set()]),
      lift("2026-08-18", "Plank", [set({ weightLbs: 0 })]),
    ];
    const names = liftCandidates(sessions).map((c) => c.name);
    expect(names).toEqual(["Bench Press", "Row", "Squat", "OHP"]);
  });
});

describe("strengthSeries", () => {
  it("takes the bucket's best e1RM for the chosen lift, null when unworked", () => {
    const sessions = [
      lift("2026-08-24", "Bench Press", [set({ weightLbs: 165, reps: 5 })]),
      lift("2026-08-27", "Bench Press", [set({ weightLbs: 170, reps: 3 })]),
      lift("2026-08-27", "Row", [set({ weightLbs: 300, reps: 1 })]),
    ];
    const series = strengthSeries(sessions, "id-Bench Press", "week", TODAY);
    expect(series[1]).toBe(193);  // Monday
    expect(series[4]).toBe(187);  // Thursday: 170*(1+3/30) = 187
    expect(series[0]).toBeNull(); // Sunday: not benched
  });
});
