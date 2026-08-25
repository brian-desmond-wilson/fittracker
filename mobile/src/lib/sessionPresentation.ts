// How a session presents itself: title, date, headline numbers.
// Pure selectors over HistorySession — fetching stays in supabase/gymSessions.
// Spec: docs/superpowers/specs/2026-08-24-gym-sessions-redesign-design.md.
import { dayDiff, formatMinutes, sessionEmphasis, sessionMinutes, toUtc } from "./gymSessions";
import { goalForWeek } from "./goalHistory";
import type { HistorySession, MuscleGroup } from "../types/gymSessions";
import type { WeeklyGoal } from "../types/goals";

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

export type RailState = "trained" | "rest" | "empty" | "future";
export interface RailDay {
  date: string;
  /** Single-letter weekday for the pill. */
  label: string;
  state: RailState;
}

const dayMs = 86_400_000;

/**
 * The current calendar week (Sunday-first) as hero-rail pills. Trained beats
 * rest when a day somehow has both; days after today are future, not failures.
 */
export function weekRail(
  sessions: HistorySession[],
  restDates: Set<string>,
  today: string,
): RailDay[] {
  const trained = new Set(sessions.map((s) => s.date));
  const [y, m, d] = today.split("-").map(Number);
  const todayUtc = Date.UTC(y, m - 1, d);
  const sunday = todayUtc - new Date(todayUtc).getUTCDay() * dayMs;
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(sunday + i * dayMs).toISOString().slice(0, 10);
    const state: RailState = trained.has(date)
      ? "trained"
      : restDates.has(date)
        ? "rest"
        : date > today
          ? "future"
          : "empty";
    return { date, label: "SMTWTFS"[i], state };
  });
}

/**
 * Sessions inside the current Sunday-first calendar week. The goal ring's
 * window — it must agree with the week rail beside it, not the trailing-7-day
 * tiles below, and it is the window Phase 2's weeks-in-a-row will reuse.
 */
export function calendarWeekSessions(sessions: HistorySession[], today: string): number {
  const dates = weekRail([], new Set(), today).map((d) => d.date);
  const start = dates[0];
  const end = dates[6];
  return sessions.filter((s) => s.date >= start && s.date <= end).length;
}

/**
 * Consecutive calendar weeks meeting their goal, ending with the current
 * week. Each week is judged against the goal that was in force that week —
 * changing today's goal must not rewrite last month's streak. The current
 * week gets the same grace a day gets: empty-so-far doesn't break the run, it
 * just doesn't count yet.
 */
export function weeksInARow(
  sessions: HistorySession[],
  today: string,
  goals: WeeklyGoal[] = [],
): number {
  const weekStart = (date: string): string => {
    const utc = toUtc(date);
    return new Date(utc - new Date(utc).getUTCDay() * dayMs).toISOString().slice(0, 10);
  };
  const countByWeek = new Map<string, number>();
  for (const s of sessions) {
    const week = weekStart(s.date);
    countByWeek.set(week, (countByWeek.get(week) ?? 0) + 1);
  }
  const metGoal = (week: string) =>
    (countByWeek.get(week) ?? 0) >= goalForWeek(goals, week).sessionsTarget;
  let cursor = weekStart(today);
  let weeks = 0;
  if (!metGoal(cursor)) {
    // grace: current week still in progress
    cursor = new Date(toUtc(cursor) - 7 * dayMs).toISOString().slice(0, 10);
  }
  while (metGoal(cursor)) {
    weeks += 1;
    cursor = new Date(toUtc(cursor) - 7 * dayMs).toISOString().slice(0, 10);
  }
  return weeks;
}
