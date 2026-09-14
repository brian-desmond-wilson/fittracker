// "Your history" on the workout page, shaped from the reader's completed
// sessions of this one workout. Pure: supabase/workoutHistory.ts owns the
// read, WorkoutHistoryBlock owns the pixels. No score yet — that lands with
// session-end score capture (spec 2026-09-13 §10) and lights up Best + trend.

export interface WorkoutSessionRow {
  /** The Track session (workout_sessions.id) to open; null when the completed
   *  day has no Track row to show, so the row draws but does not open. */
  sessionId: string | null;
  /** YYYY-MM-DD, local. */
  sessionDate: string;
  durationSeconds: number | null;
}

export interface WorkoutHistorySummary {
  count: number;
  lastDate: string;
  firstDate: string;
  /** Newest first, at most SESSION_ROWS. */
  rows: WorkoutSessionRow[];
}

/** At most this many rows in the Sessions view — the exercise page's rule. */
export const SESSION_ROWS = 4;

/** Null when never done: the block draws its "not yet" card, never zeros. */
export function summarizeWorkoutHistory(rows: WorkoutSessionRow[]): WorkoutHistorySummary | null {
  if (rows.length === 0) return null;
  // YYYY-MM-DD compares correctly as a string.
  const sorted = [...rows].sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0));
  return {
    count: sorted.length,
    lastDate: sorted[0].sessionDate,
    firstDate: sorted[sorted.length - 1].sessionDate,
    rows: sorted.slice(0, SESSION_ROWS),
  };
}

/** "18 min"; null when there is nothing honest to say. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}
