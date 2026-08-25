// Calendar-period arithmetic for the Stats tab: ranges, buckets, summaries.
// Pure — the tab owns pixels, supabase owns reads. All dates are local-day
// ISO strings compared lexically; UTC math only ever steps whole days.
import { dayDiff, sessionMinutes, sessionVolume, toUtc } from "./gymSessions";
import { mainExerciseCount } from "./sessionPresentation";
import type { HistorySession, HistorySet } from "../types/gymSessions";

export type StatScope = "week" | "month" | "year";

export interface PeriodRange {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
}

const dayMs = 86_400_000;
const iso = (utcMs: number): string => new Date(utcMs).toISOString().slice(0, 10);
const isoOf = (y: number, m: number, d: number): string => iso(Date.UTC(y, m, d));

/** The current calendar period and the one before it, Sunday-first weeks. */
export function periodRange(scope: StatScope, today: string): PeriodRange {
  const [y, m, d] = today.split("-").map(Number);
  if (scope === "week") {
    const todayUtc = Date.UTC(y, m - 1, d);
    const start = todayUtc - new Date(todayUtc).getUTCDay() * dayMs;
    return {
      start: iso(start), end: iso(start + 6 * dayMs),
      prevStart: iso(start - 7 * dayMs), prevEnd: iso(start - dayMs),
    };
  }
  if (scope === "month") {
    return {
      start: isoOf(y, m - 1, 1), end: isoOf(y, m, 0),
      prevStart: isoOf(y, m - 2, 1), prevEnd: isoOf(y, m - 1, 0),
    };
  }
  return {
    start: isoOf(y, 0, 1), end: isoOf(y, 11, 31),
    prevStart: isoOf(y - 1, 0, 1), prevEnd: isoOf(y - 1, 11, 31),
  };
}

interface Totals {
  workouts: number;
  minutes: number;
  volumeLbs: number;
  exercises: number;
}

export interface PeriodSummary extends Totals {
  prev: Totals;
}

const inRange = (s: HistorySession, start: string, end: string) =>
  s.date >= start && s.date <= end;

function totals(sessions: HistorySession[]): Totals {
  return {
    workouts: sessions.length,
    minutes: sessions.reduce((t, s) => t + (sessionMinutes(s) ?? 0), 0),
    volumeLbs: sessions.reduce((t, s) => t + sessionVolume(s), 0),
    exercises: sessions.reduce((t, s) => t + mainExerciseCount(s), 0),
  };
}

export function periodSummary(
  sessions: HistorySession[],
  range: PeriodRange,
): PeriodSummary {
  return {
    ...totals(sessions.filter((s) => inRange(s, range.start, range.end))),
    prev: totals(sessions.filter((s) => inRange(s, range.prevStart, range.prevEnd))),
  };
}

const SCOPE_NAMES: Record<StatScope, string> = {
  week: "last week", month: "last month", year: "last year",
};

/** "+4 vs last month" — the tile's one line of context. */
export function summaryDelta(now: number, prev: number, scope: StatScope): string {
  const diff = now - prev;
  if (diff === 0) return `same as ${SCOPE_NAMES[scope]}`;
  return `${diff > 0 ? "+" : ""}${diff} vs ${SCOPE_NAMES[scope]}`;
}

/**
 * Sessions grouped into the scope's buckets (7 days / month's week-rows /
 * 12 months), reduced by the caller. Bucketing and reducing are separated so
 * volume, counts, and e1RM series all share one grouping.
 */
export function bucketSeries<T>(
  sessions: HistorySession[],
  scope: StatScope,
  today: string,
  reduce: (group: HistorySession[]) => T,
): T[] {
  const range = periodRange(scope, today);
  const within = sessions.filter((s) => inRange(s, range.start, range.end));
  const count = bucketLabels(scope, today).length;
  const groups: HistorySession[][] = Array.from({ length: count }, () => []);
  for (const s of within) {
    groups[bucketIndex(s.date, scope, range)].push(s);
  }
  return groups.map(reduce);
}

function bucketIndex(date: string, scope: StatScope, range: PeriodRange): number {
  if (scope === "week") return dayDiff(date, range.start);
  if (scope === "month") {
    const dayOfMonth = Number(date.slice(8));
    const lead = new Date(toUtc(range.start)).getUTCDay();
    return Math.floor((lead + dayOfMonth - 1) / 7);
  }
  return Number(date.slice(5, 7)) - 1;
}

export function bucketLabels(scope: StatScope, today: string): string[] {
  if (scope === "week") return ["S", "M", "T", "W", "T", "F", "S"];
  if (scope === "year") return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const range = periodRange("month", today);
  const lead = new Date(toUtc(range.start)).getUTCDay();
  const days = Number(range.end.slice(8));
  const weeks = Math.ceil((lead + days) / 7);
  return Array.from({ length: weeks }, (_, i) => `W${i + 1}`);
}

/**
 * Epley on the best working set: w × (1 + reps/30), rounded. Null when
 * nothing was loaded — a bodyweight day has no 1RM to estimate.
 */
export function estimatedOneRepMax(sets: HistorySet[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.isWarmup || s.weightLbs <= 0 || s.reps <= 0) continue;
    const e = s.reps === 1 ? s.weightLbs : s.weightLbs * (1 + s.reps / 30);
    if (best === null || e > best) best = e;
  }
  return best === null ? null : Math.round(best);
}

export interface LiftCandidate {
  exerciseId: string;
  name: string;
}

const LIFT_PICKER_SIZE = 4;

/** The lifts worth charting: most-trained loaded movements, top four. */
export function liftCandidates(sessions: HistorySession[]): LiftCandidate[] {
  const byId = new Map<string, { name: string; workingSets: number }>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const loaded = ex.sets.filter((x) => !x.isWarmup && x.weightLbs > 0).length;
      if (loaded === 0) continue;
      const row = byId.get(ex.exerciseId) ?? { name: ex.name, workingSets: 0 };
      row.workingSets += loaded;
      byId.set(ex.exerciseId, row);
    }
  }
  return [...byId.entries()]
    .sort((a, b) => b[1].workingSets - a[1].workingSets)
    .slice(0, LIFT_PICKER_SIZE)
    .map(([exerciseId, { name }]) => ({ exerciseId, name }));
}

/** Best e1RM per bucket for one lift; null buckets draw as gaps, not zeros. */
export function strengthSeries(
  sessions: HistorySession[],
  exerciseId: string,
  scope: StatScope,
  today: string,
): (number | null)[] {
  return bucketSeries(sessions, scope, today, (group) => {
    let best: number | null = null;
    for (const s of group) {
      for (const ex of s.exercises) {
        if (ex.exerciseId !== exerciseId) continue;
        const e = estimatedOneRepMax(ex.sets);
        if (e !== null && (best === null || e > best)) best = e;
      }
    }
    return best;
  });
}
