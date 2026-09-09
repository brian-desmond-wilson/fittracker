// Weekly goal progress, and the six-region vocabulary coverage speaks in.
//
// Coverage is judged on six major regions rather than the 19 seeded ones:
// hitting all nineteen weekly is not a real training week, and a goal nobody
// can meet is not a goal.
import { sessionVolume } from "./gymSessions";
import type { HistorySession } from "../types/gymSessions";
import type { WeeklyGoal } from "../types/goals";

export type MajorRegion = "Chest" | "Back" | "Shoulders" | "Arms" | "Legs" | "Core";

export const MAJOR_REGIONS: MajorRegion[] = [
  "Chest", "Back", "Shoulders", "Arms", "Legs", "Core",
];

const REGION_MAP: Record<string, MajorRegion> = {
  Chest: "Chest",
  Lats: "Back",
  "Upper Back": "Back",
  "Lower Back": "Back",
  "Neck / Traps": "Back",
  Shoulders: "Shoulders",
  Biceps: "Arms",
  Triceps: "Arms",
  "Forearms / Grip": "Arms",
  Quads: "Legs",
  Hamstrings: "Legs",
  Glutes: "Legs",
  Calves: "Legs",
  "Hip Abductors": "Legs",
  "Hip Adductors": "Legs",
  "Hip Flexors": "Legs",
  Core: "Core",
  Obliques: "Core",
};

/** Null for Full Body and anything unseeded — neither earns coverage credit. */
export function majorRegionOf(region: string): MajorRegion | null {
  return REGION_MAP[region] ?? null;
}

/** Major regions worked, in MAJOR_REGIONS order, judged on working sets. */
export function regionsCoveredIn(sessions: HistorySession[]): MajorRegion[] {
  const hit = new Set<MajorRegion>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (!ex.sets.some((x) => !x.isWarmup)) continue;
      for (const region of ex.primaryRegions) {
        const major = majorRegionOf(region);
        if (major) hit.add(major);
      }
    }
  }
  return MAJOR_REGIONS.filter((r) => hit.has(r));
}

export interface GoalMetric {
  done: number;
  target: number;
  met: boolean;
}

export interface GoalProgress {
  sessions: GoalMetric;
  /** Null when the goal does not set this metric. */
  volume: GoalMetric | null;
  regions: GoalMetric | null;
}

const metric = (done: number, target: number): GoalMetric => ({
  done, target, met: done >= target,
});

/** Progress for ONE week — pass only that week's sessions. */
export function goalProgress(
  weekSessions: HistorySession[],
  goal: WeeklyGoal,
): GoalProgress {
  const volume = weekSessions.reduce((t, s) => t + sessionVolume(s), 0);
  return {
    sessions: metric(weekSessions.length, goal.sessionsTarget),
    volume: goal.volumeTargetLbs === null ? null : metric(volume, goal.volumeTargetLbs),
    regions:
      goal.regionTarget === null
        ? null
        : metric(regionsCoveredIn(weekSessions).length, goal.regionTarget),
  };
}
