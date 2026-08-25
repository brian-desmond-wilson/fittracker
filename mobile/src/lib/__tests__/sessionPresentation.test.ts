import {
  calendarWeekSessions,
  durationLine,
  formatSessionDate,
  mainExerciseCount,
  regionsHit,
  sessionTitle,
  weekRail,
  weeksInARow,
} from "../sessionPresentation";
import type { HistoryExercise, HistorySession, HistorySet } from "../../types/gymSessions";
import type { WeeklyGoal } from "../../types/goals";

const set = (over: Partial<HistorySet> = {}): HistorySet => ({
  setNumber: 1, reps: 10, weightLbs: 100, volumeLbs: 1000, isWarmup: false,
  difficulty: null, startedAt: null, endedAt: null, durationSeconds: null,
  timingSource: null, ...over,
});

const exercise = (regions: string[], sets: HistorySet[], name = "Movement"): HistoryExercise => ({
  id: `ex-${name}`, exerciseId: `id-${name}`, name, order: 1, difficulty: null,
  primaryRegions: regions, sets,
});

const session = (over: Partial<HistorySession> = {}): HistorySession => ({
  id: "s1", date: "2026-08-24", sessionNumber: 1, sessionCount: 1,
  startedAt: null, endedAt: null, durationSeconds: null, name: null,
  source: "unknown", capturedWorkoutId: null, capturedWorkoutHandle: null,
  estimatedMinutes: null, mainBlockWorkoutName: null, exercises: [], ...over,
});

describe("formatSessionDate", () => {
  const today = "2026-08-24"; // a Monday
  it("uses weekday format inside the trailing 7 days", () => {
    expect(formatSessionDate("2026-08-24", today)).toBe("Mon 24");
    expect(formatSessionDate("2026-08-18", today)).toBe("Tue 18");
  });
  it("uses month-day for older dates this year", () => {
    expect(formatSessionDate("2026-08-16", today)).toBe("Aug 16");
    expect(formatSessionDate("2026-01-03", today)).toBe("Jan 3");
  });
  it("uses MM/DD/YY for prior years", () => {
    expect(formatSessionDate("2025-08-16", today)).toBe("08/16/25");
    expect(formatSessionDate("2019-12-01", today)).toBe("12/01/19");
  });
  // The 7-day rule wins at the year boundary — recency beats the calendar.
  it("keeps weekday format across a year boundary within 7 days", () => {
    expect(formatSessionDate("2025-12-30", "2026-01-02")).toBe("Tue 30");
  });
});

describe("sessionTitle", () => {
  it("prefers the stored template name", () => {
    expect(sessionTitle(session({ name: "Push Strength" }))).toBe("Push Strength");
  });
  it("falls back to the main block's workout", () => {
    expect(sessionTitle(session({ mainBlockWorkoutName: "1000 Rep Challenge" })))
      .toBe("1000 Rep Challenge");
  });
  it("derives from emphasis when nothing was stored", () => {
    const s = session({ exercises: [exercise(["Chest"], [set(), set()])] });
    expect(sessionTitle(s)).toBe("Push Day");
  });
  it("never says Workout", () => {
    expect(sessionTitle(session())).toBe("Training Session");
  });
});

describe("mainExerciseCount", () => {
  it("counts only exercises with working sets", () => {
    const s = session({
      exercises: [
        exercise(["Chest"], [set({ isWarmup: true }), set()], "bench"),
        exercise([], [set({ isWarmup: true })], "warmup-only"),
        exercise(["Lats"], [set()], "row"),
      ],
    });
    expect(mainExerciseCount(s)).toBe(2);
  });
});

describe("durationLine", () => {
  it("shows est → actual when both exist", () => {
    const s = session({ estimatedMinutes: 120, durationSeconds: 8160 });
    expect(durationLine(s)).toBe("est 2h 0m → 2h 16m");
  });
  it("shows actual alone without an estimate", () => {
    expect(durationLine(session({ durationSeconds: 2520 }))).toBe("42m");
  });
  it("drops the estimate on split sessions — it described the whole workout", () => {
    const s = session({ estimatedMinutes: 120, durationSeconds: 2520, sessionCount: 2 });
    expect(durationLine(s)).toBe("42m");
  });
  it("is null with no timing at all", () => {
    expect(durationLine(session({ estimatedMinutes: 45 }))).toBeNull();
  });
});

describe("regionsHit", () => {
  it("orders regions by working-set count and ignores warm-ups", () => {
    const s = session({
      exercises: [
        exercise(["Chest", "Triceps"], [set(), set(), set()], "bench"),
        exercise(["Triceps"], [set(), set()], "pushdown"),
        exercise(["Quads"], [set({ isWarmup: true })], "warmup-squat"),
      ],
    });
    expect(regionsHit(s)).toEqual(["Triceps", "Chest"]);
  });
});

describe("weekRail", () => {
  const today = "2026-08-24"; // Monday; week runs Sun 08-23 .. Sat 08-29
  it("builds Sunday-first with trained, rest, empty, and future days", () => {
    const sessions = [session({ id: "a", date: "2026-08-24" })];
    const rail = weekRail(sessions, new Set(["2026-08-23"]), today);
    expect(rail.map((d) => d.date)).toEqual([
      "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26",
      "2026-08-27", "2026-08-28", "2026-08-29",
    ]);
    expect(rail.map((d) => d.state)).toEqual([
      "rest", "trained", "future", "future", "future", "future", "future",
    ]);
    expect(rail[0].label).toBe("S");
    expect(rail[1].label).toBe("M");
  });
  it("marks a past day with nothing as empty, and today as empty until trained", () => {
    const rail = weekRail([], new Set(), "2026-08-25"); // Tuesday
    expect(rail[1].state).toBe("empty");  // Monday: passed, nothing
    expect(rail[2].state).toBe("empty");  // today: not trained yet, not future
    expect(rail[3].state).toBe("future"); // Wednesday
  });
  it("pins the week start when today is the Sunday itself", () => {
    const rail = weekRail([], new Set(), "2026-08-23"); // Sunday
    expect(rail[0].date).toBe("2026-08-23");
    expect(rail[6].date).toBe("2026-08-29");
    expect(rail[0].state).toBe("empty");  // today: nothing trained
    expect(rail[1].state).toBe("future"); // Monday hasn't happened yet
  });
  it("pins the week end when today is the Saturday itself", () => {
    const sessions = [session({ id: "a", date: "2026-08-29" })];
    const rail = weekRail(sessions, new Set(), "2026-08-29"); // Saturday
    expect(rail[0].date).toBe("2026-08-23");
    expect(rail[6].date).toBe("2026-08-29");
    expect(rail[6].state).toBe("trained");
    expect(rail.some((d) => d.state === "future")).toBe(false);
  });
});

describe("weeksInARow", () => {
  // A goal history with a 1-session target from the start of time reproduces
  // the old ≥1 rule explicitly, rather than relying on the default (5/week).
  const lenientGoals: WeeklyGoal[] = [
    { id: "g1", effectiveFrom: "1970-01-01", sessionsTarget: 1, volumeTargetLbs: null, regionTarget: null },
  ];

  it("counts consecutive trained weeks ending now", () => {
    const sessions = ["2026-08-24", "2026-08-19", "2026-08-12"].map((d) =>
      session({ date: d, id: d }),
    );
    expect(weeksInARow(sessions, "2026-08-24", lenientGoals)).toBe(3);
  });
  it("does not break on the current week before it has a session", () => {
    const sessions = ["2026-08-19", "2026-08-12"].map((d) => session({ date: d, id: d }));
    expect(weeksInARow(sessions, "2026-08-24", lenientGoals)).toBe(2);
  });
  it("breaks on a fully skipped week", () => {
    const sessions = ["2026-08-24", "2026-08-05"].map((d) => session({ date: d, id: d }));
    expect(weeksInARow(sessions, "2026-08-24", lenientGoals)).toBe(1);
  });
  it("is zero with nothing recent", () => {
    expect(
      weeksInARow([session({ date: "2026-07-01", id: "old" })], "2026-08-24", lenientGoals),
    ).toBe(0);
  });
  // With no goal history passed, the default goal (5 sessions/week) governs —
  // a single session a week no longer counts as a streak.
  it("judges against the default goal when no history is passed", () => {
    const sessions = ["2026-08-24", "2026-08-19", "2026-08-12"].map((d) =>
      session({ date: d, id: d }),
    );
    expect(weeksInARow(sessions, "2026-08-24")).toBe(0);
  });
  it("judges each week by the goal in force that week", () => {
    const goals: WeeklyGoal[] = [
      { id: "g2", effectiveFrom: "2026-08-16", sessionsTarget: 2, volumeTargetLbs: null, regionTarget: null },
      { id: "g1", effectiveFrom: "2026-01-04", sessionsTarget: 1, volumeTargetLbs: null, regionTarget: null },
    ];
    const sessions = [
      session({ id: "a", date: "2026-08-24" }), session({ id: "b", date: "2026-08-25" }),
      session({ id: "c", date: "2026-08-19" }), session({ id: "d", date: "2026-08-20" }),
      session({ id: "e", date: "2026-08-12" }), // week of 08-09, goal was 1
    ];
    expect(weeksInARow(sessions, "2026-08-24", goals)).toBe(3);
  });
});

describe("calendarWeekSessions", () => {
  const today = "2026-08-24"; // Monday; week runs Sun 08-23 .. Sat 08-29
  it("counts only sessions inside the Sunday-first calendar week", () => {
    const sessions = [
      session({ id: "a", date: "2026-08-23" }), // Sun, in
      session({ id: "b", date: "2026-08-24" }), // Mon (today), in
      session({ id: "c", date: "2026-08-22" }), // Sat, OUT — previous week
      session({ id: "d", date: "2026-08-29" }), // Sat, in (end of week)
    ];
    expect(calendarWeekSessions(sessions, today)).toBe(3);
  });
  it("counts two sessions on the same date as two", () => {
    const sessions = [
      session({ id: "a", date: "2026-08-24" }),
      session({ id: "b", date: "2026-08-24" }),
    ];
    expect(calendarWeekSessions(sessions, today)).toBe(2);
  });
  it("is zero with no sessions", () => {
    expect(calendarWeekSessions([], today)).toBe(0);
  });
});
