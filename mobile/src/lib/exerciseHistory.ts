// The reader's own history for ONE exercise, from a list of working sets.
// Spec: docs/superpowers/specs/2026-09-11-exercise-detail-page-v2-design.md §4.2, §5.
// Pure on purpose (decision 7): one scoped query feeds this, nothing here
// touches the network. Warm-ups never reach this module — the reader drops
// them.

export interface WorkingSet {
  sessionId: string;
  /** YYYY-MM-DD, the day the session was performed. */
  sessionDate: string;
  /** Same-day sessions order by this, the order they were logged in. */
  sessionNumber: number;
  /** The session's display name (sessionPresentation's rule), resolved by the reader. */
  sessionName: string;
  weightLbs: number;
  reps: number;
}

/** The best-set rule (§4.2): heaviest weight wins, ties break on reps. Every
 *  unweighted set weighs 0, so "all unweighted → most reps" is the same rule. */
function compareSets(a: { weightLbs: number; reps: number }, b: { weightLbs: number; reps: number }): number {
  if (a.weightLbs !== b.weightLbs) return a.weightLbs - b.weightLbs;
  return a.reps - b.reps;
}

const byChronology = (a: WorkingSet, b: WorkingSet): number =>
  a.sessionDate === b.sessionDate
    ? a.sessionNumber - b.sessionNumber
    : a.sessionDate < b.sessionDate ? -1 : 1;

/** Best set over the whole history. Ties go to the earliest session to reach
 *  the mark, whatever order the sets arrived in. */
export function bestSet(sets: WorkingSet[]): WorkingSet | null {
  let best: WorkingSet | null = null;
  for (const s of [...sets].sort(byChronology)) if (best === null || compareSets(s, best) > 0) best = s;
  return best;
}

export interface SessionTop {
  sessionId: string;
  sessionDate: string;
  sessionNumber: number;
  sessionName: string;
  topSet: WorkingSet;
}

/** One row per session, oldest first, carrying that session's best set. */
export function topSetPerSession(sets: WorkingSet[]): SessionTop[] {
  const bySession = new Map<string, SessionTop>();
  for (const s of [...sets].sort(byChronology)) {
    const held = bySession.get(s.sessionId);
    if (!held) {
      bySession.set(s.sessionId, {
        sessionId: s.sessionId, sessionDate: s.sessionDate, sessionNumber: s.sessionNumber,
        sessionName: s.sessionName, topSet: s,
      });
    } else if (compareSets(s, held.topSet) > 0) {
      held.topSet = s;
    }
  }
  return [...bySession.values()];
}

/** Distinct sessions with at least one working set. */
export function sessionCount(sets: WorkingSet[]): number {
  return new Set(sets.map((s) => s.sessionId)).size;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMs = 86_400_000;
/** Both date helpers below take calendar days as `YYYY-MM-DD`; anything else
 *  falls through untouched rather than rendering as "NaN Sep". */
const isCalendarDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
const toUtc = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** "8 Sep" this year, "8 Sep 2025" otherwise. Used by the history stats, the
 *  skill note and the Captured From dates so every date on the page agrees.
 *  `today` must be the LOCAL calendar day (`getLocalDateString` in
 *  src/lib/dates.ts), never `toISOString().slice(0, 10)`, which is UTC and
 *  flips the year on New Year's Eve evenings. A malformed `iso` comes back as
 *  is. */
export function formatShortDate(iso: string, today: string): string {
  if (!isCalendarDay(iso) || !isCalendarDay(today)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const label = `${d} ${MONTHS[m - 1]}`;
  return y === Number(today.slice(0, 4)) ? label : `${label} ${y}`;
}

/** "Today", "Yesterday", "3 days ago" up to 30, then the date.
 *  `today` must be the LOCAL calendar day (`getLocalDateString` in
 *  src/lib/dates.ts), never `toISOString().slice(0, 10)`: session dates are
 *  local days, and a UTC "today" would call last night's session "Yesterday"
 *  or tomorrow's... "Today". A malformed input returns the raw `date`. */
export function lastDonePhrase(today: string, date: string): string {
  if (!isCalendarDay(today) || !isCalendarDay(date)) return date;
  const days = Math.round((toUtc(today) - toUtc(date)) / dayMs);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 30) return `${days} days ago`;
  return formatShortDate(date, today);
}

export interface TrendBar {
  sessionId: string;
  sessionDate: string;
  /** 0–1, relative to the tallest bar in the window. */
  height: number;
  /** This session holds the best set ever. */
  best: boolean;
}

export const TREND_WINDOW = 8;

/** Bar height reads weight when any top set in the window is weighted, reps
 *  otherwise. Judged on the window, not the whole history: one weighted set
 *  years ago must not flatten eight recent bodyweight sessions to zero. */
function metricFor(window: SessionTop[]): (s: WorkingSet) => number {
  const weighted = window.some((t) => t.topSet.weightLbs > 0);
  return (s) => (weighted ? s.weightLbs : s.reps);
}

/** The last eight sessions' top sets, oldest left. */
export function trendBars(sets: WorkingSet[]): TrendBar[] {
  const window = topSetPerSession(sets).slice(-TREND_WINDOW);
  const metric = metricFor(window);
  const tallest = Math.max(0, ...window.map((t) => metric(t.topSet)));
  const best = bestSet(sets);
  return window.map((t) => ({
    sessionId: t.sessionId,
    sessionDate: t.sessionDate,
    height: tallest > 0 ? metric(t.topSet) / tallest : 0,
    best: best !== null && best.sessionId === t.sessionId,
  }));
}

export type TrendDirection = "up" | "down" | "steady";

export const TREND_LABELS: Record<TrendDirection, string> = {
  up: "trending up",
  down: "trending down",
  steady: "holding steady",
};

/** Latest top set against the median of the earlier bars in the window.
 *  Null under three sessions: two points are not a trend. */
export function trendDirection(sets: WorkingSet[]): TrendDirection | null {
  const window = topSetPerSession(sets).slice(-TREND_WINDOW);
  if (window.length < 3) return null;
  const metric = metricFor(window);
  const latest = metric(window[window.length - 1].topSet);
  const earlier = window.slice(0, -1).map((t) => metric(t.topSet)).sort((a, b) => a - b);
  const mid = Math.floor(earlier.length / 2);
  const median = earlier.length % 2 === 1 ? earlier[mid] : (earlier[mid - 1] + earlier[mid]) / 2;
  if (latest > median) return "up";
  if (latest < median) return "down";
  return "steady";
}

export interface SessionRow {
  sessionId: string;
  sessionDate: string;
  sessionName: string;
  topSet: WorkingSet;
  /** That session's top set beat every earlier session's top set under the
   *  best-set rule (heaviest weight, ties on reps), so it was the best set
   *  ever at the time. Same rule as `bestSet` and `trendBars`, so the row
   *  badge and the highlighted bar always agree; unweighted histories fall
   *  out of it as most-reps. Volume and e1RM records do not count — the
   *  badge sits on the top set, and those can be set without beating it. */
  isPr: boolean;
}

/** Sessions newest first. The caller decides how many to show. A session is
 *  a PR when its top set beat every earlier session's top set under the
 *  best-set rule; the first session is a baseline, not a PR. */
export function sessionRows(sets: WorkingSet[]): SessionRow[] {
  const tops = topSetPerSession(sets);
  const prSessions = new Set<string>();
  let best: WorkingSet | null = null;
  for (const t of tops) {
    if (best !== null && compareSets(t.topSet, best) > 0) prSessions.add(t.sessionId);
    if (best === null || compareSets(t.topSet, best) > 0) best = t.topSet;
  }
  return tops
    .reverse()
    .map((t) => ({
      sessionId: t.sessionId, sessionDate: t.sessionDate, sessionName: t.sessionName,
      topSet: t.topSet, isPr: prSessions.has(t.sessionId),
    }));
}

/** "50 lb × 12", or "12 reps" for an unweighted set. */
export function formatSet(set: { weightLbs: number; reps: number }): string {
  if (set.weightLbs > 0) return `${set.weightLbs} lb × ${set.reps}`;
  return `${set.reps} ${set.reps === 1 ? "rep" : "reps"}`;
}
