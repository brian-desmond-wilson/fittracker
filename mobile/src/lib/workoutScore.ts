// mobile/src/lib/workoutScore.ts
// A served-whole session's score, in the workout's own units, and every rule
// the workout page needs to compare, rank, chart and name them. Pure — the
// read/write is supabase/sessionScores.ts, the pixels are ScoreSheet and
// WorkoutHistoryBlock. Mirrors exerciseHistory.ts so the two history blocks
// behave alike: best goes to the earliest on a tie, the trend window is
// eight, direction is the latest against the median of the earlier bars,
// and the first session is a baseline rather than a record.
// Spec: docs/superpowers/specs/2026-09-13-session-score-capture-design.md §5.2
import type { WorkoutScoreType } from "../types/dailyBlocks";
import { TREND_WINDOW } from "./exerciseHistory";
import type { TrendDirection } from "./exerciseHistory";
import { formatDuration } from "./timeFormat";

export type Quality = "rough" | "solid" | "crisp";
export const QUALITIES: Quality[] = ["rough", "solid", "crisp"];
export const QUALITY_LABELS: Record<Quality, string> = { rough: "Rough", solid: "Solid", crisp: "Crisp" };

export type CountedType = "reps" | "load" | "distance" | "calories" | "duration" | "height";

export type Score =
  | { type: "rounds_reps"; rounds: number; reps: number }
  | { type: "time"; seconds: number; capped: boolean }
  | { type: CountedType; value: number }
  | { type: "quality"; quality: Quality };

/** The one type a score sheet never opens for. */
export type ScorableType = Exclude<WorkoutScoreType, "none">;

/** A completed session with whatever score it carries. `sessionId` here is
 *  the GENERATED session id — the row a score hangs off. */
export interface ScoredSession {
  sessionId: string;
  /** YYYY-MM-DD, local. */
  sessionDate: string;
  score: Score | null;
}

// ---------- formatting ----------

const UNIT: Record<CountedType, string> = {
  reps: "reps", load: "lb", distance: "m", calories: "cal", duration: "", height: "in",
};

export function formatScore(s: Score): string {
  switch (s.type) {
    case "rounds_reps": return s.reps > 0 ? `${s.rounds} + ${s.reps}` : `${s.rounds}`;
    case "time": return s.capped ? "Capped" : formatDuration(s.seconds);
    case "quality": return QUALITY_LABELS[s.quality];
    case "duration": return formatDuration(s.value);
    case "reps": return `${s.value} ${s.value === 1 ? "rep" : "reps"}`;
    case "distance": return `${s.value.toLocaleString("en-US")} ${UNIT.distance}`;
    default: return `${s.value} ${UNIT[s.type]}`;
  }
}

// ---------- ordering ----------

const QUALITY_RANK: Record<Quality, number> = { rough: 0, solid: 1, crisp: 2 };

/** Negative when `a` is worse than `b`, positive when better, 0 when equal.
 *  Two different types cannot be ranked against each other; that is a
 *  programming error, not a data state, so it throws. */
export function compareScores(a: Score, b: Score): number {
  if (a.type !== b.type) throw new Error(`compareScores: ${a.type} vs ${b.type}`);
  switch (a.type) {
    case "rounds_reps": {
      const o = b as typeof a;
      return a.rounds !== o.rounds ? a.rounds - o.rounds : a.reps - o.reps;
    }
    case "time": {
      const o = b as typeof a;
      // A capped attempt did not finish; any finish beats it, two caps tie.
      if (a.capped || o.capped) return a.capped === o.capped ? 0 : a.capped ? -1 : 1;
      return o.seconds - a.seconds;
    }
    case "quality": return QUALITY_RANK[a.quality] - QUALITY_RANK[(b as typeof a).quality];
    default: return a.value - (b as typeof a).value;
  }
}

/** The type the block ranks on: the earliest scored row's. Rows of another
 *  type (the workout was re-tagged after scoring) still display, but do not
 *  compete — spec §8. */
function rankedType(rows: ScoredSession[]): Score["type"] | null {
  const first = chronological(rows).find((r) => r.score !== null);
  return first?.score?.type ?? null;
}

function chronological(rows: ScoredSession[]): ScoredSession[] {
  return [...rows].sort((a, b) => (a.sessionDate < b.sessionDate ? -1 : a.sessionDate > b.sessionDate ? 1 : 0));
}

/** Scored rows of the ranked type, oldest first. */
function ranked(rows: ScoredSession[]): (ScoredSession & { score: Score })[] {
  const type = rankedType(rows);
  if (type === null) return [];
  return chronological(rows).filter((r): r is ScoredSession & { score: Score } => r.score !== null && r.score.type === type);
}

/** Best ever; ties go to the earliest. Null with no score. */
export function bestScore(rows: ScoredSession[]): (ScoredSession & { score: Score }) | null {
  let best: (ScoredSession & { score: Score }) | null = null;
  for (const r of ranked(rows)) {
    if (best === null || compareScores(r.score, best.score) > 0) best = r;
  }
  return best;
}

// ---------- charting ----------

export function isChartable(type: WorkoutScoreType | null): boolean {
  return type !== null && type !== "none" && type !== "quality";
}

/** A capped time draws visibly but under every finish. */
const CAPPED_HEIGHT = 0.15;
/** Partial reps never reach a full round in a real workout, so this keeps
 *  (rounds, reps) in lexicographic order on one axis. */
const REPS_PER_ROUND_AXIS = 1000;

function magnitude(s: Score): number {
  switch (s.type) {
    case "rounds_reps": return s.rounds * REPS_PER_ROUND_AXIS + s.reps;
    case "time": return s.seconds;
    case "quality": return QUALITY_RANK[s.quality];
    default: return s.value;
  }
}

/** 0–1, taller is better, judged against the window it is drawn in. */
export function scoreHeight(s: Score, window: Score[]): number {
  if (s.type === "time") {
    if (s.capped) return CAPPED_HEIGHT;
    const finishes = window.filter((w): w is Extract<Score, { type: "time" }> => w.type === "time" && !w.capped);
    const fastest = Math.min(...finishes.map((w) => w.seconds));
    return fastest > 0 ? fastest / s.seconds : 0;
  }
  const tallest = Math.max(0, ...window.filter((w) => w.type === s.type).map(magnitude));
  return tallest > 0 ? magnitude(s) / tallest : 0;
}

export interface ScoreBar {
  sessionId: string;
  sessionDate: string;
  height: number;
  best: boolean;
}

/** The last eight SCORED sessions of the ranked type, oldest left. An
 *  unscored day is skipped, not drawn as zero — it says nothing about the
 *  trend. */
export function trendScoreBars(rows: ScoredSession[]): ScoreBar[] {
  const window = ranked(rows).slice(-TREND_WINDOW);
  const scores = window.map((r) => r.score);
  const best = bestScore(rows);
  return window.map((r) => ({
    sessionId: r.sessionId,
    sessionDate: r.sessionDate,
    height: scoreHeight(r.score, scores),
    best: best !== null && best.sessionId === r.sessionId,
  }));
}

/** Latest score against the median of the earlier bars, by compareScores
 *  (so time and capped invert correctly). Null under three scored sessions. */
export function trendScoreDirection(rows: ScoredSession[]): TrendDirection | null {
  const window = ranked(rows).slice(-TREND_WINDOW);
  if (window.length < 3) return null;
  const latest = window[window.length - 1].score;
  const earlier = window.slice(0, -1).map((r) => r.score).sort(compareScores);
  const mid = Math.floor(earlier.length / 2);
  // An even window has no middle element; the two middle scores bracket the
  // median, and "better than both" / "worse than both" is decisive while
  // "between" reads as steady.
  const [lo, hi] = earlier.length % 2 === 1 ? [earlier[mid], earlier[mid]] : [earlier[mid - 1], earlier[mid]];
  if (compareScores(latest, hi) > 0) return "up";
  if (compareScores(latest, lo) < 0) return "down";
  return "steady";
}

// ---------- rows ----------

export interface ScoreSessionRow extends ScoredSession {
  /** The score beat every earlier scored session's — a record at the time.
   *  The first scored session is a baseline, not a record, as on the
   *  exercise page. */
  isPr: boolean;
}

/** Newest first, every session (scored or not); PR flags as above. */
export function scoreSessionRows(rows: ScoredSession[]): ScoreSessionRow[] {
  const prs = new Set<string>();
  let best: Score | null = null;
  for (const r of ranked(rows)) {
    if (best !== null && compareScores(r.score, best) > 0) prs.add(r.sessionId);
    if (best === null || compareScores(r.score, best) > 0) best = r.score;
  }
  return chronological(rows).reverse().map((r) => ({ ...r, isPr: prs.has(r.sessionId) }));
}

// ---------- clock input ----------

const digits = (v: string): number | null => {
  const d = v.replace(/[^0-9]/g, "");
  return d === "" ? null : parseInt(d, 10);
};

/** Minutes and seconds fields to seconds. Blank, junk, or 0:00 is null —
 *  there is no such thing as a zero-second finish. Seconds over 59 carry. */
export function parseClock(mins: string, secs: string): number | null {
  const m = digits(mins);
  const s = digits(secs);
  if (m === null && s === null) return null;
  const total = (m ?? 0) * 60 + (s ?? 0);
  return total > 0 ? total : null;
}

// ---------- persistence shape ----------

export interface ScoreRow {
  score_type: string;
  value_a: number | null;
  value_b: number | null;
  quality: string | null;
  capped: boolean;
}

export function rowFromScore(s: Score): ScoreRow {
  switch (s.type) {
    case "rounds_reps": return { score_type: s.type, value_a: s.rounds, value_b: s.reps, quality: null, capped: false };
    case "time": return { score_type: s.type, value_a: s.seconds, value_b: null, quality: null, capped: s.capped };
    case "quality": return { score_type: s.type, value_a: null, value_b: null, quality: s.quality, capped: false };
    default: return { score_type: s.type, value_a: s.value, value_b: null, quality: null, capped: false };
  }
}

const COUNTED: ReadonlySet<string> = new Set<CountedType>(["reps", "load", "distance", "calories", "duration", "height"]);

/** Null for any row the table's shape constraint would have refused — the
 *  client is untyped, so the guard lives here too. */
export function scoreFromRow(r: ScoreRow): Score | null {
  switch (r.score_type) {
    case "rounds_reps":
      return r.value_a !== null && r.value_b !== null ? { type: "rounds_reps", rounds: r.value_a, reps: r.value_b } : null;
    case "time":
      return r.value_a !== null ? { type: "time", seconds: r.value_a, capped: !!r.capped } : null;
    case "quality":
      return r.quality === "rough" || r.quality === "solid" || r.quality === "crisp" ? { type: "quality", quality: r.quality } : null;
    default:
      return COUNTED.has(r.score_type) && r.value_a !== null ? { type: r.score_type as CountedType, value: r.value_a } : null;
  }
}
