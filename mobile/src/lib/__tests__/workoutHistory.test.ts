import {
  balance,
  currentStreak,
  emphasisByDate,
  formatMinutes,
  formatVolume,
  muscleGroupOf,
  sessionEmphasis,
  sessionMinutes,
  sessionPace,
  sessionVolume,
  sessionsOn,
  weekSummary,
} from "../workoutHistory";
import type { HistoryExercise, HistorySession, HistorySet } from "../../types/workoutHistory";

const set = (over: Partial<HistorySet> = {}): HistorySet => ({
  setNumber: 1,
  reps: 10,
  weightLbs: 100,
  volumeLbs: 1000,
  isWarmup: false,
  difficulty: null,
  startedAt: null,
  endedAt: null,
  durationSeconds: null,
  timingSource: null,
  ...over,
});

const exercise = (
  regions: string[],
  sets: HistorySet[],
  name = "Movement",
): HistoryExercise => ({
  id: `ex-${name}-${regions.join("")}`,
  exerciseId: `id-${name}`,
  name,
  order: 1,
  difficulty: null,
  primaryRegions: regions,
  sets,
});

const session = (
  date: string,
  exercises: HistoryExercise[],
  over: Partial<HistorySession> = {},
): HistorySession => ({
  id: `s-${date}-${Math.abs(exercises.length)}`,
  date,
  sessionNumber: 1,
  sessionCount: 1,
  startedAt: null,
  endedAt: null,
  durationSeconds: null,
  name: "Workout",
  source: "unknown",
  capturedWorkoutId: null,
  capturedWorkoutHandle: null,
  exercises,
  ...over,
});

describe("muscleGroupOf", () => {
  it("maps the seeded regions into four groups", () => {
    expect(muscleGroupOf("Chest")).toBe("push");
    expect(muscleGroupOf("Lats")).toBe("pull");
    expect(muscleGroupOf("Quads")).toBe("lower");
    expect(muscleGroupOf("Core")).toBe("full");
  });
  it("puts hinge territory in lower, not pull", () => {
    expect(muscleGroupOf("Lower Back")).toBe("lower");
    expect(muscleGroupOf("Posterior Chain")).toBe("lower");
  });
  it("puts grip and traps in pull", () => {
    expect(muscleGroupOf("Forearms / Grip")).toBe("pull");
    expect(muscleGroupOf("Neck / Traps")).toBe("pull");
  });
  it("returns null for a region it has never heard of", () => {
    expect(muscleGroupOf("Gills")).toBeNull();
  });
});

describe("sessionEmphasis", () => {
  it("says untagged when nothing carries a region", () => {
    expect(sessionEmphasis(session("2026-08-16", [exercise([], [set()])]))).toBe("untagged");
  });

  it("picks the group with the most working sets", () => {
    const s = session("2026-08-16", [
      exercise(["Chest"], [set(), set(), set()], "bench"),
      exercise(["Lats"], [set()], "row"),
    ]);
    expect(sessionEmphasis(s)).toBe("push");
  });

  it("ignores warm-ups when judging emphasis", () => {
    const s = session("2026-08-16", [
      exercise(["Chest"], [set({ isWarmup: true }), set({ isWarmup: true })], "bench"),
      exercise(["Lats"], [set()], "row"),
    ]);
    expect(sessionEmphasis(s)).toBe("pull");
  });

  it("calls a dead heat full body rather than picking a winner", () => {
    const s = session("2026-08-16", [
      exercise(["Chest"], [set(), set()], "bench"),
      exercise(["Lats"], [set(), set()], "row"),
    ]);
    expect(sessionEmphasis(s)).toBe("full");
  });

  // Half the library is untagged, so a session is judged on the half we know.
  it("judges on the tagged movements when only some carry regions", () => {
    const s = session("2026-08-16", [
      exercise([], [set(), set(), set()], "unknown"),
      exercise(["Quads"], [set()], "squat"),
    ]);
    expect(sessionEmphasis(s)).toBe("lower");
  });

  it("lets a two-region movement vote in both groups", () => {
    const s = session("2026-08-16", [
      exercise(["Chest", "Triceps"], [set()], "dip"),
      exercise(["Lats"], [set()], "row"),
    ]);
    expect(sessionEmphasis(s)).toBe("push");
  });
});

describe("sessionVolume and pace", () => {
  it("counts working sets only", () => {
    const s = session("2026-08-16", [
      exercise(["Chest"], [set({ volumeLbs: 1000 }), set({ volumeLbs: 500, isWarmup: true })]),
    ]);
    expect(sessionVolume(s)).toBe(1000);
  });

  it("reads minutes from the stored duration", () => {
    const s = session("2026-08-16", [], { durationSeconds: 2520 });
    expect(sessionMinutes(s)).toBe(42);
  });

  it("falls back to the span when no duration was stored", () => {
    const s = session("2026-08-16", [], {
      startedAt: "2026-08-16T09:18:00Z",
      endedAt: "2026-08-16T10:00:00Z",
    });
    expect(sessionMinutes(s)).toBe(42);
  });

  it("has no pace without a duration", () => {
    expect(sessionPace(session("2026-08-16", [exercise(["Chest"], [set()])]))).toBeNull();
  });

  // A bodyweight session did not do nothing — it has no load to multiply.
  it("has no pace when nothing was loaded, rather than zero", () => {
    const s = session("2026-08-16", [exercise(["Chest"], [set({ volumeLbs: 0 })])], {
      durationSeconds: 2400,
    });
    expect(sessionPace(s)).toBeNull();
  });

  it("is volume over minutes when both are known", () => {
    const s = session("2026-08-16", [exercise(["Chest"], [set({ volumeLbs: 8400 })])], {
      durationSeconds: 2520,
    });
    expect(sessionPace(s)).toBe(200);
  });
});

describe("weekSummary", () => {
  const sessions = [
    session("2026-08-16", [exercise(["Chest"], [set({ volumeLbs: 1000 })])], { durationSeconds: 1800 }),
    session("2026-08-14", [exercise(["Lats"], [set({ volumeLbs: 2000 })])], { durationSeconds: 1800 }),
    session("2026-08-08", [exercise(["Quads"], [set({ volumeLbs: 9999 })])], { durationSeconds: 1800 }),
  ];

  it("counts the last seven days, not the calendar week", () => {
    const summary = weekSummary(sessions, "2026-08-17");
    expect(summary.sessions).toBe(2);
    expect(summary.volumeLbs).toBe(3000);
    expect(summary.minutes).toBe(60);
  });

  it("counts the week before it for comparison", () => {
    expect(weekSummary(sessions, "2026-08-17").sessionsLastWeek).toBe(1);
  });

  it("ignores anything dated after today", () => {
    expect(weekSummary(sessions, "2026-08-15").sessions).toBe(1);
  });
});

describe("currentStreak", () => {
  it("is zero with no history", () => {
    expect(currentStreak([], "2026-08-17")).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const sessions = ["2026-08-17", "2026-08-16", "2026-08-15"].map((d) => session(d, []));
    expect(currentStreak(sessions, "2026-08-17")).toBe(3);
  });

  // It is only 8pm — the day is not over yet.
  it("survives an empty today when yesterday counted", () => {
    const sessions = ["2026-08-16", "2026-08-15"].map((d) => session(d, []));
    expect(currentStreak(sessions, "2026-08-17")).toBe(2);
  });

  it("breaks once a whole day passes empty", () => {
    const sessions = ["2026-08-15", "2026-08-14"].map((d) => session(d, []));
    expect(currentStreak(sessions, "2026-08-17")).toBe(0);
  });

  it("counts two sessions in one day as one day", () => {
    const sessions = [session("2026-08-17", []), session("2026-08-17", [])];
    expect(currentStreak(sessions, "2026-08-17")).toBe(1);
  });
});

describe("balance", () => {
  it("is empty with nothing in range", () => {
    expect(balance([], 14, "2026-08-17")).toEqual([]);
  });

  it("totals exactly 100 even when the split does not divide evenly", () => {
    const sessions = [
      session("2026-08-16", [exercise(["Chest"], [set()])]),
      session("2026-08-15", [exercise(["Lats"], [set()])]),
      session("2026-08-14", [exercise(["Quads"], [set()])]),
    ];
    const bars = balance(sessions, 14, "2026-08-17");
    expect(bars.reduce((t, b) => t + b.percent, 0)).toBe(100);
  });

  // Hiding untagged sessions would overstate how balanced the rest is.
  it("shows untagged sessions rather than dropping them", () => {
    const sessions = [
      session("2026-08-16", [exercise(["Chest"], [set()])]),
      session("2026-08-15", [exercise([], [set()])]),
    ];
    const bars = balance(sessions, 14, "2026-08-17");
    expect(bars.map((b) => b.group).sort()).toEqual(["push", "untagged"]);
  });
});

describe("sessionsOn and emphasisByDate", () => {
  it("returns a day's sessions newest first", () => {
    const sessions = [
      session("2026-08-16", [], { id: "early", startedAt: "2026-08-16T07:00:00Z" }),
      session("2026-08-16", [], { id: "late", startedAt: "2026-08-16T19:00:00Z" }),
      session("2026-08-15", [], { id: "other" }),
    ];
    expect(sessionsOn(sessions, "2026-08-16").map((s) => s.id)).toEqual(["late", "early"]);
  });

  // The dot describes the day, not whichever session came first.
  it("judges two sessions in a day together", () => {
    const sessions = [
      session("2026-08-16", [exercise(["Chest"], [set()], "bench")]),
      session("2026-08-16", [exercise(["Quads"], [set(), set()], "squat")]),
    ];
    expect(emphasisByDate(sessions).get("2026-08-16")).toBe("lower");
  });
});

describe("formatting", () => {
  it("reads volume as a scale", () => {
    expect(formatVolume(0)).toBe("—");
    expect(formatVolume(840)).toBe("840");
    expect(formatVolume(32400)).toBe("32.4k");
  });
  it("reads time in hours once it earns them", () => {
    expect(formatMinutes(0)).toBe("—");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(190)).toBe("3h 10m");
  });
});
