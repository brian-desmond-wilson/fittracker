// How a session presents itself: title, date, headline numbers.
// Pure selectors over HistorySession — fetching stays in supabase/gymSessions.
// Spec: docs/superpowers/specs/2026-08-24-gym-sessions-redesign-design.md.
import { dayDiff, formatMinutes, sessionEmphasis, sessionMinutes } from "./gymSessions";
import type { HistorySession, MuscleGroup } from "../types/gymSessions";

/** Until the weekly-goals entity lands (Phase 3), the ring measures against
 *  this. One place to delete. */
export const DEFAULT_WEEKLY_SESSIONS_GOAL = 5;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Trailing week → "Mon 24"; older this year → "Aug 16"; prior years → 08/16/25.
 * Recency outranks the calendar: five days ago is "Tue 30" even in January.
 */
export function formatSessionDate(iso: string, today: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const age = dayDiff(today, iso);
  if (age >= 0 && age < 7) {
    return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
  }
  const todayYear = Number(today.slice(0, 4));
  if (y === todayYear) return `${MONTHS[m - 1]} ${d}`;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(m)}/${pad(d)}/${pad(y % 100)}`;
}

const EMPHASIS_TITLES: Record<MuscleGroup, string> = {
  push: "Push Day",
  pull: "Pull Day",
  lower: "Leg Day",
  full: "Full Body Session",
  untagged: "Training Session",
};

/**
 * The naming rule: stored template name (program / captured / split title),
 * then the main block's workout, then what the sets say was trained.
 * Never the literal "Workout".
 */
export function sessionTitle(session: HistorySession): string {
  if (session.name) return session.name;
  if (session.mainBlockWorkoutName) return session.mainBlockWorkoutName;
  return EMPHASIS_TITLES[sessionEmphasis(session)];
}

/** Exercises that did real work — warm-up-only entries don't count. */
export function mainExerciseCount(session: HistorySession): number {
  return session.exercises.filter((e) => e.sets.some((s) => !s.isWarmup)).length;
}

/**
 * "est 2h 0m → 2h 16m", or just the actual when no estimate applies.
 * A split session drops the estimate — it described the whole workout,
 * not this half.
 */
export function durationLine(session: HistorySession): string | null {
  const actual = sessionMinutes(session);
  if (!actual) return null;
  const est = session.sessionCount === 1 ? session.estimatedMinutes : null;
  return est ? `est ${formatMinutes(est)} → ${formatMinutes(actual)}` : formatMinutes(actual);
}

/** Regions this session trained, busiest first, judged on working sets. */
export function regionsHit(session: HistorySession): string[] {
  const counts = new Map<string, number>();
  for (const ex of session.exercises) {
    const working = ex.sets.filter((s) => !s.isWarmup).length;
    if (working === 0) continue;
    for (const region of ex.primaryRegions) {
      counts.set(region, (counts.get(region) ?? 0) + working);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([region]) => region);
}
