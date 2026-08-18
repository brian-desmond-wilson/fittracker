// Split rotation and the re-entry ramp position. Pure; dates are YYYY-MM-DD
// strings so callers control the clock (one `today` sampled per compute —
// the app's no-two-clocks rule).
import type { SplitDay } from "../types/daily";

const ORDER: SplitDay[] = ["push", "pull", "legs"];

/** The next split day, keyed on the last COMPLETED day. Missing a calendar
 *  day shifts the sequence instead of breaking it — travel rule. */
export function nextSplitDay(lastCompleted: SplitDay | null): SplitDay {
  if (!lastCompleted) return "push";
  return ORDER[(ORDER.indexOf(lastCompleted) + 1) % ORDER.length];
}

const dayMs = 24 * 60 * 60 * 1000;
const toUtc = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};

/** 1-based week since the first-ever generated session. Weeks 1-2 are the
 *  volume-capped re-entry ramp (8 weeks detrained). */
export function rampWeek(firstSessionDate: string | null, today: string): number {
  if (!firstSessionDate) return 1;
  const days = Math.floor((toUtc(today) - toUtc(firstSessionDate)) / dayMs);
  return Math.max(1, Math.floor(days / 7) + 1);
}

/** One generated_sessions row, as the rotation lookback needs to see it. */
export interface SessionHistoryRow {
  sessionDate: string; // YYYY-MM-DD
  createdAt: string; // ISO — the tiebreak within a date
  splitDay: SplitDay | null;
  status: string;
}

/**
 * The split day the rotation should key on: the most recently completed
 * session that carries a stamp.
 *
 * Unstamped sessions (a catalog workout served whole) are read past rather
 * than treated as "no history" — a full-body conditioning workout is not a
 * push, pull or legs day, so the rotation stands still and resumes where it
 * paused instead of restarting at push.
 *
 * A date can hold more than one completed session, so ordering is by date AND
 * creation time; date alone leaves same-day rows tied and the winner arbitrary.
 */
export function lastStampedSplitDay(history: SessionHistoryRow[]): SplitDay | null {
  const completed = history
    .filter((h) => h.status === "completed" && h.splitDay !== null)
    .sort((a, b) =>
      a.sessionDate === b.sessionDate
        ? a.createdAt.localeCompare(b.createdAt)
        : a.sessionDate.localeCompare(b.sessionDate),
    );
  return completed.length > 0 ? completed[completed.length - 1].splitDay : null;
}
