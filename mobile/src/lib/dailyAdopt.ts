// Adopting a catalog workout as today's session, and reading a day that can
// now hold more than one.
// Spec: docs/superpowers/specs/2026-08-17-start-catalog-workout-design.md §4.
//
// Pure: the arithmetic and the choosing live here, the writes live in
// supabase/daily.ts. Same division as the rest of the daily tier.
import type { SessionItem } from "../types/daily";

/** A captured workout's exercise, as stored. */
export interface CapturedWorkoutExercise {
  exerciseId: string;
  sets: number | null;
  reps: string | null;
  restSeconds: number | null;
}

/**
 * A captured workout's exercises as session items.
 *
 * Everything lands in `main`: the creator's workout has its own shape, and
 * slicing it into our warm-up/accessory/cool-down vocabulary would assert
 * structure the source never had. `reason` stays null — nothing recommended
 * these, the user chose them.
 *
 * NULL sets and rest are carried across as NULL rather than defaulted. The
 * capture schema is deliberate about this ("Never inferred"), and a circuit
 * with no per-exercise set count must not acquire one here.
 */
export function capturedWorkoutToSessionItems(
  exercises: CapturedWorkoutExercise[],
): SessionItem[] {
  return exercises.map((e, index) => ({
    exerciseId: e.exerciseId,
    section: "main" as const,
    itemOrder: index,
    targetSets: e.sets,
    targetReps: e.reps,
    restSeconds: e.restSeconds,
    reason: null,
  }));
}

/** One generated_sessions row, as day-selection needs to see it. */
export interface DaySessionRow {
  id: string;
  status: string;
  createdAt: string; // ISO
}

/**
 * Which of a date's sessions the day shows.
 *
 * The pending one — what you have yet to finish is what the Today tab is for.
 * Failing that, the most recently created completed one, so the tab shows what
 * you did rather than reverting to an empty day. Skipped rows are history and
 * are never shown.
 */
export function pickDaySession<T extends DaySessionRow>(rows: T[]): T | null {
  const pending = rows.filter(
    (r) => r.status === "suggested" || r.status === "accepted",
  );
  // The partial unique index permits only one, but read defensively: a stale
  // row here would silently hide today's real session.
  if (pending.length > 0) {
    return [...pending].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }
  const completed = rows.filter((r) => r.status === "completed");
  if (completed.length > 0) {
    return [...completed].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }
  return null;
}
