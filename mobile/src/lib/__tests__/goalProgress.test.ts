import { MAJOR_REGIONS, majorRegionOf, goalProgress, regionsCoveredIn } from "../goalProgress";
import type { HistoryExercise, HistorySession, HistorySet } from "../../types/gymSessions";
import type { WeeklyGoal } from "../../types/goals";

const set = (over: Partial<HistorySet> = {}): HistorySet => ({
  setNumber: 1, reps: 10, weightLbs: 100, volumeLbs: 1000, isWarmup: false,
  difficulty: null, startedAt: null, endedAt: null, durationSeconds: null,
  timingSource: null, ...over,
});
const exercise = (regions: string[], sets: HistorySet[], name = "Movement"): HistoryExercise => ({
  id: `ex-${name}-${regions.join("")}`, exerciseId: `id-${name}`, name, order: 1,
  difficulty: null, primaryRegions: regions, sets,
});
const session = (date: string, exercises: HistoryExercise[]): HistorySession => ({
  id: `s-${date}-${exercises.length}`, date, sessionNumber: 1, sessionCount: 1,
  startedAt: null, endedAt: null, durationSeconds: 3600, name: null,
  source: "unknown", capturedWorkoutId: null, capturedWorkoutHandle: null,
  estimatedMinutes: null, mainBlockWorkoutName: null, exercises,
});
const goal = (over: Partial<WeeklyGoal> = {}): WeeklyGoal => ({
  id: "g", effectiveFrom: "2026-08-23", sessionsTarget: 5,
  volumeTargetLbs: null, regionTarget: null, ...over,
});

describe("majorRegionOf", () => {
  it("folds the seeded regions into six", () => {
    expect(MAJOR_REGIONS).toEqual(["Chest", "Back", "Shoulders", "Arms", "Legs", "Core"]);
    expect(majorRegionOf("Chest")).toBe("Chest");
    expect(majorRegionOf("Lats")).toBe("Back");
    expect(majorRegionOf("Upper Back")).toBe("Back");
    expect(majorRegionOf("Lower Back")).toBe("Back");
    expect(majorRegionOf("Biceps")).toBe("Arms");
    expect(majorRegionOf("Forearms / Grip")).toBe("Arms");
    expect(majorRegionOf("Quads")).toBe("Legs");
    expect(majorRegionOf("Glutes")).toBe("Legs");
    expect(majorRegionOf("Hip Abductors")).toBe("Legs");
    expect(majorRegionOf("Obliques")).toBe("Core");
  });
  // Full Body trains everything and nothing in particular — counting it as a
  // region would let one entry satisfy coverage.
  it("does not map Full Body or unknown regions", () => {
    expect(majorRegionOf("Full Body")).toBeNull();
    expect(majorRegionOf("Gills")).toBeNull();
  });
  // The map mirrors muscle_regions seed strings; a rename there must fail here,
  // not silently under-count coverage.
  it("maps every seeded region except Full Body", () => {
    const SEEDED = ["Biceps","Calves","Chest","Core","Forearms / Grip","Full Body","Glutes","Hamstrings","Hip Abductors","Hip Adductors","Hip Flexors","Lats","Lower Back","Neck / Traps","Obliques","Quads","Shoulders","Triceps","Upper Back"];
    const unmapped = SEEDED.filter((r) => majorRegionOf(r) === null);
    expect(unmapped).toEqual(["Full Body"]);
  });
});

describe("regionsCoveredIn", () => {
  it("counts distinct major regions from working sets", () => {
    const sessions = [
      session("2026-08-24", [exercise(["Chest", "Triceps"], [set()])]),
      session("2026-08-25", [exercise(["Lats"], [set()])]),
      session("2026-08-26", [exercise(["Quads"], [set({ isWarmup: true })])]),
    ];
    expect(regionsCoveredIn(sessions)).toEqual(["Chest", "Back", "Arms"]);
  });
});

describe("goalProgress", () => {
  const sessions = [
    session("2026-08-24", [exercise(["Chest"], [set({ volumeLbs: 12000 })])]),
    session("2026-08-25", [exercise(["Lats"], [set({ volumeLbs: 8000 })])]),
  ];
  it("reports sessions against the target", () => {
    const p = goalProgress(sessions, goal({ sessionsTarget: 5 }));
    expect(p.sessions).toEqual({ done: 2, target: 5, met: false });
  });
  it("omits metrics the goal does not set", () => {
    const p = goalProgress(sessions, goal());
    expect(p.volume).toBeNull();
    expect(p.regions).toBeNull();
  });
  it("reports volume and regions when set", () => {
    const p = goalProgress(sessions, goal({ volumeTargetLbs: 15000, regionTarget: 3 }));
    expect(p.volume).toEqual({ done: 20000, target: 15000, met: true });
    expect(p.regions).toEqual({ done: 2, target: 3, met: false });
  });
  it("counts a met goal when the target is exactly reached", () => {
    const p = goalProgress(sessions, goal({ sessionsTarget: 2 }));
    expect(p.sessions.met).toBe(true);
  });
});
