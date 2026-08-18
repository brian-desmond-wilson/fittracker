// Track > Workouts: what actually happened, as opposed to what was planned.
//
// Everything here describes instances — a session you performed, the exercises
// in it, the sets you logged. The templates those came from live in Training.

/**
 * The four groups a calendar dot and the balance bar speak in.
 *
 * Deliberately NOT push/pull/legs-the-split: a captured workout carries no
 * split stamp, and a WOD never had one. These describe what a session worked,
 * derived from the sets performed, so they apply to any session whatever it
 * came from.
 */
export type MuscleGroup = "push" | "pull" | "lower" | "full" | "untagged";

/** Where a session came from — the bridge back to Training. */
export type SessionSource = "catalog" | "recommended" | "program" | "unknown";

export interface HistorySet {
  setNumber: number;
  reps: number;
  weightLbs: number;
  volumeLbs: number;
  isWarmup: boolean;
  difficulty: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  timingSource: "measured" | "entered" | null;
}

export interface HistoryExercise {
  id: string;
  exerciseId: string;
  name: string;
  order: number;
  difficulty: string | null;
  /** exercise_muscle_regions names flagged primary. Empty when untagged. */
  primaryRegions: string[];
  sets: HistorySet[];
}

export interface HistorySession {
  id: string;
  /** YYYY-MM-DD, the day it was performed. */
  date: string;
  sessionNumber: number;
  /** How many sessions the parent workout was split across. */
  sessionCount: number;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  name: string;
  source: SessionSource;
  /** Set when the session came from a captured workout — links back to it. */
  capturedWorkoutId: string | null;
  capturedWorkoutHandle: string | null;
  exercises: HistoryExercise[];
}

export interface WeekSummary {
  sessions: number;
  volumeLbs: number;
  minutes: number;
  /** Last week's session count, for the "+1 vs last" line. */
  sessionsLastWeek: number;
}
