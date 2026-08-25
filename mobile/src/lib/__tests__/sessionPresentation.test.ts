import {
  DEFAULT_WEEKLY_SESSIONS_GOAL,
  durationLine,
  formatSessionDate,
  mainExerciseCount,
  regionsHit,
  sessionTitle,
  weekRail,
} from "../sessionPresentation";
import type { HistoryExercise, HistorySession, HistorySet } from "../../types/gymSessions";

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

describe("goal default", () => {
  it("exists until the goals entity lands", () => {
    expect(DEFAULT_WEEKLY_SESSIONS_GOAL).toBeGreaterThan(0);
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
