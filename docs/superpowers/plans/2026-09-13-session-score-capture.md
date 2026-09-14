# Session-End Score Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a served-whole captured workout finishes, ask for the score in the workout's own units (prefilled from the clock for time), store one score per session, let it be added or edited later from the workout page, and light up Best, PR badges, and the eight-session trend bars on the workout page's history block.

**Architecture:** One new table `session_scores` (shaped like `session_debriefs`). Pure rules in `src/lib/workoutScore.ts` (format, compare, best, bars, direction, PR flags, clock parsing) with Jest tests. Reads/writes in `src/lib/supabase/sessionScores.ts`. One `ScoreSheet` component used from two entry points: the live screen's Finish (replacing the completion alert when scorable) and the workout page's history rows. `WorkoutSessionRow` gains the generated-session id and the score; the history block becomes the exercise block's twin, sharing its bar/PR styles via `historyStyles.ts`.

**Tech Stack:** Expo / React Native, expo-router, Supabase (untyped client), Jest + ts-jest (pure `src/lib` only), lucide-react-native. Migrations via `npx supabase db push --yes` from `mobile/`.

**Spec:** `docs/superpowers/specs/2026-09-13-session-score-capture-design.md`.

**Deviations from the spec, decided while planning:**
1. **First scored session is a baseline, not a PR** — matching `exerciseHistory.sessionRows` ("the first session is a baseline, not a PR") so the two blocks agree. Spec §5.2 said the first is a PR.
2. `completeSession` in `daily.ts` gains a boolean return (true when the session was stamped completed) so the live screen can honour spec §4.3's "or `completeSession` declined" rule; today it returns `void` and declines silently. Its other caller (`TodayTab.markDone`) ignores the result.
3. `WorkoutSessionRow.sessionId` is the Track row (`workout_sessions.id`, nullable); scores key on the generated session, so the row gains `generatedSessionId: string` (always present).

**Working directory for every command:** `mobile/` (`cd /Users/brianwilson/code/fittracker/mobile`).

**Commit trailer for every commit:**
```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

## File map

**New**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260919100000_session_scores.sql` | The table, its shape constraint, index, RLS. |
| `mobile/src/lib/workoutScore.ts` + `__tests__/workoutScore.test.ts` | `Score` type; format, compare, best, height, bars, direction, session rows with PR flags; `parseClock`. |
| `mobile/src/lib/supabase/sessionScores.ts` | `fetchWorkoutScores`, `upsertSessionScore`, `deleteSessionScore`. |
| `mobile/src/components/ui/ClockInput.tsx` | The minutes/seconds pair, lifted from `SetTimeSheet`. |
| `mobile/src/components/workout-session/ScoreSheet.tsx` | The sheet: inputs per type, Save / Skip / Remove, inline error. |

**Modified**

| File | Change |
|---|---|
| `mobile/src/lib/supabase/daily.ts` | `completeSession` returns `Promise<boolean>`. |
| `mobile/src/lib/workoutHistory.ts` | Row gains `generatedSessionId`, `score`. |
| `mobile/src/lib/supabase/workoutHistory.ts` | Joins scores; fills the two fields. |
| `mobile/src/components/training/item-detail/historyStyles.ts` | Gains `bars, barSlot, bar, barBest, direction, directionText, directionDown, pr, prText`. |
| `mobile/src/components/training/item-detail/HistoryBlock.tsx` | Uses the shared bar/PR styles (pure refactor). |
| `mobile/src/components/training/workout-detail/WorkoutHistoryBlock.tsx` | Best / bars / direction / PR / Add score / tap-to-edit / long-press to Track. |
| `mobile/src/components/training/daily/CapturedWorkoutScreen.tsx` | Mounts `ScoreSheet` for history rows; refetches after save/remove. |
| `mobile/app/workout/[id].tsx` | Finish opens `ScoreSheet` when scorable instead of the alert. |

---

### Task 1: The `session_scores` table

**Files:**
- Create: `supabase/migrations/20260919100000_session_scores.sql` (repo root `supabase/`, i.e. `../supabase/migrations/` from `mobile/`)

- [ ] **Step 1: Write the migration**

```sql
-- One score per served-whole daily session, in the workout's own units.
-- Spec: docs/superpowers/specs/2026-09-13-session-score-capture-design.md §5.1
--
-- Shaped like session_debriefs: one row per generated session, owned by the
-- user, cascaded away with the session. workout_id is denormalised from the
-- session's served_captured_workout_id so the workout page reads its scores
-- in one query. value_a carries rounds | seconds | reps | lb | m | cal | in
-- by score_type; value_b is the partial reps of a rounds_reps score and
-- nothing else; quality is the word for a quality score and nothing else.
CREATE TABLE IF NOT EXISTS public.session_scores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL UNIQUE REFERENCES public.generated_sessions(id) ON DELETE CASCADE,
  workout_id  uuid NOT NULL REFERENCES public.captured_workouts(id) ON DELETE CASCADE,
  score_type  text NOT NULL CHECK (score_type IN
    ('reps','rounds_reps','load','time','distance','calories','duration','quality','height')),
  value_a     integer,
  value_b     integer,
  quality     text CHECK (quality IN ('rough','solid','crisp')),
  capped      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_scores_value_shape CHECK (
    (score_type = 'quality' AND quality IS NOT NULL AND value_a IS NULL AND value_b IS NULL) OR
    (score_type = 'rounds_reps' AND value_a IS NOT NULL AND value_b IS NOT NULL AND quality IS NULL) OR
    (score_type NOT IN ('quality','rounds_reps') AND value_a IS NOT NULL AND value_b IS NULL AND quality IS NULL)
  ),
  CONSTRAINT session_scores_capped_is_time CHECK (capped = false OR score_type = 'time')
);

CREATE INDEX IF NOT EXISTS session_scores_workout_idx
  ON public.session_scores (user_id, workout_id);

ALTER TABLE public.session_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own scores" ON public.session_scores
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.session_scores IS
  'The score a person recorded for one served-whole daily session, in the workout''s score_type units. value_a/value_b/quality by type; capped only on time.';
```

- [ ] **Step 2: Apply it**

Run: `npx supabase db push --yes`
Expected: the migration applies; `npx supabase migration list` shows `20260919100000` as applied on both local and remote columns.

- [ ] **Step 3: Verify the shape constraint holds** (untyped client — this is the only proof)

Run this once against the linked database and expect the second statement to FAIL:
```bash
npx supabase db query "INSERT INTO public.session_scores (user_id, session_id, workout_id, score_type, value_a) SELECT user_id, id, served_captured_workout_id, 'time', 600 FROM public.generated_sessions WHERE served_captured_workout_id IS NOT NULL AND status='completed' LIMIT 1 RETURNING id; DELETE FROM public.session_scores;" 2>&1 | tail -3
npx supabase db query "INSERT INTO public.session_scores (user_id, session_id, workout_id, score_type, value_a, capped) SELECT user_id, id, served_captured_workout_id, 'reps', 10, true FROM public.generated_sessions WHERE served_captured_workout_id IS NOT NULL LIMIT 1;" 2>&1 | tail -2
```
Expected: first prints an id then deletes; second errors with `session_scores_capped_is_time`. If `db query` is not available in this CLI version, skip this step and say so — the constraint is exercised on device in Task 11.

- [ ] **Step 4: Commit**

```bash
git add ../supabase/migrations/20260919100000_session_scores.sql
git commit -m "feat(db): session_scores — one score per served-whole session

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Pure score rules

**Files:**
- Create: `mobile/src/lib/workoutScore.ts`
- Create: `mobile/src/lib/__tests__/workoutScore.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/workoutScore.test.ts
import {
  formatScore, compareScores, bestScore, scoreHeight, trendScoreBars, trendScoreDirection,
  scoreSessionRows, parseClock, scoreFromRow, rowFromScore, isChartable,
} from "../workoutScore";
import type { Score, ScoredSession } from "../workoutScore";

const rr = (rounds: number, reps: number): Score => ({ type: "rounds_reps", rounds, reps });
const t = (seconds: number, capped = false): Score => ({ type: "time", seconds, capped });
const load = (value: number): Score => ({ type: "load", value });
const q = (quality: "rough" | "solid" | "crisp"): Score => ({ type: "quality", quality });

const sess = (sessionId: string, sessionDate: string, score: Score | null): ScoredSession =>
  ({ sessionId, sessionDate, score });

describe("formatScore (spec §4.2)", () => {
  it("rounds + reps, dropping zero reps", () => {
    expect(formatScore(rr(6, 14))).toBe("6 + 14");
    expect(formatScore(rr(6, 0))).toBe("6");
  });
  it("time as m:ss, Capped when capped", () => {
    expect(formatScore(t(754))).toBe("12:34");
    expect(formatScore(t(3661))).toBe("1:01:01");
    expect(formatScore(t(900, true))).toBe("Capped");
  });
  it("units", () => {
    expect(formatScore({ type: "reps", value: 120 })).toBe("120 reps");
    expect(formatScore({ type: "reps", value: 1 })).toBe("1 rep");
    expect(formatScore(load(185))).toBe("185 lb");
    expect(formatScore({ type: "distance", value: 2000 })).toBe("2,000 m");
    expect(formatScore({ type: "calories", value: 50 })).toBe("50 cal");
    expect(formatScore({ type: "duration", value: 150 })).toBe("2:30");
    expect(formatScore({ type: "height", value: 24 })).toBe("24 in");
    expect(formatScore(q("crisp"))).toBe("Crisp");
  });
});

describe("compareScores (spec §5.2)", () => {
  it("rounds before reps", () => {
    expect(compareScores(rr(7, 0), rr(6, 30))).toBeGreaterThan(0);
    expect(compareScores(rr(6, 14), rr(6, 15))).toBeLessThan(0);
    expect(compareScores(rr(6, 14), rr(6, 14))).toBe(0);
  });
  it("time: lower wins; capped loses to any finish; two capped tie", () => {
    expect(compareScores(t(700), t(754))).toBeGreaterThan(0);
    expect(compareScores(t(900, true), t(1500))).toBeLessThan(0);
    expect(compareScores(t(900, true), t(900, true))).toBe(0);
  });
  it("higher wins for the counted types", () => {
    expect(compareScores(load(200), load(185))).toBeGreaterThan(0);
    expect(compareScores({ type: "duration", value: 90 }, { type: "duration", value: 120 })).toBeLessThan(0);
  });
  it("quality: rough < solid < crisp", () => {
    expect(compareScores(q("crisp"), q("solid"))).toBeGreaterThan(0);
    expect(compareScores(q("rough"), q("solid"))).toBeLessThan(0);
  });
  it("mixed types throw", () => {
    expect(() => compareScores(rr(1, 0), t(10))).toThrow();
  });
});

describe("bestScore", () => {
  it("ties go to the earliest", () => {
    const rows = [sess("a", "2026-09-01", load(185)), sess("b", "2026-09-05", load(185)), sess("c", "2026-09-09", load(180))];
    expect(bestScore(rows)?.sessionId).toBe("a");
  });
  it("null with no scores", () => {
    expect(bestScore([sess("a", "2026-09-01", null)])).toBeNull();
  });
  it("ignores rows whose type differs from the first scored row", () => {
    const rows = [sess("a", "2026-09-01", load(185)), sess("b", "2026-09-05", t(600))];
    expect(bestScore(rows)?.sessionId).toBe("a");
  });
});

describe("scoreHeight: taller is better", () => {
  it("higher-wins types scale to the max", () => {
    const w = [load(100), load(200)];
    expect(scoreHeight(load(100), w)).toBeCloseTo(0.5);
    expect(scoreHeight(load(200), w)).toBe(1);
  });
  it("time: fastest is 1, capped sits at 0.15", () => {
    const w = [t(600), t(1200), t(900, true)];
    expect(scoreHeight(t(600), w)).toBe(1);
    expect(scoreHeight(t(1200), w)).toBeCloseTo(0.5);
    expect(scoreHeight(t(900, true), w)).toBe(0.15);
  });
  it("rounds_reps keeps lexicographic order", () => {
    const w = [rr(6, 14), rr(7, 0)];
    expect(scoreHeight(rr(7, 0), w)).toBe(1);
    expect(scoreHeight(rr(6, 14), w)).toBeLessThan(1);
    expect(scoreHeight(rr(6, 14), w)).toBeGreaterThan(0.8);
  });
  it("quality is not chartable", () => {
    expect(isChartable("quality")).toBe(false);
    expect(isChartable("time")).toBe(true);
  });
});

describe("trendScoreBars / trendScoreDirection", () => {
  const ten = Array.from({ length: 10 }, (_, i) =>
    sess(`s${i}`, `2026-08-${String(i + 1).padStart(2, "0")}`, load(100 + i * 10)));
  it("last eight scored sessions, oldest left, best flagged", () => {
    const bars = trendScoreBars(ten);
    expect(bars.length).toBe(8);
    expect(bars[0].sessionId).toBe("s2");
    expect(bars[7].best).toBe(true);
    expect(bars[7].height).toBe(1);
  });
  it("unscored sessions are skipped, not drawn as zero", () => {
    const rows = [sess("a", "2026-09-01", load(100)), sess("b", "2026-09-02", null), sess("c", "2026-09-03", load(120))];
    expect(trendScoreBars(rows).map((b) => b.sessionId)).toEqual(["a", "c"]);
  });
  it("direction: null under three, up/down/steady vs the median of the earlier bars", () => {
    expect(trendScoreDirection(ten.slice(0, 2))).toBeNull();
    expect(trendScoreDirection(ten)).toBe("up");
    const down = [sess("a", "2026-09-01", t(600)), sess("b", "2026-09-02", t(620)), sess("c", "2026-09-03", t(700))];
    expect(trendScoreDirection(down)).toBe("down");
    const steady = [sess("a", "2026-09-01", load(100)), sess("b", "2026-09-02", load(100)), sess("c", "2026-09-03", load(100))];
    expect(trendScoreDirection(steady)).toBe("steady");
  });
});

describe("scoreSessionRows: newest first, PR when it beat every earlier score", () => {
  it("first is a baseline, later records are PRs, a capped time never is", () => {
    const rows = [
      sess("a", "2026-09-01", t(800)), sess("b", "2026-09-02", t(700)),
      sess("c", "2026-09-03", t(900, true)), sess("d", "2026-09-04", null), sess("e", "2026-09-05", t(650)),
    ];
    const out = scoreSessionRows(rows);
    expect(out.map((r) => r.sessionId)).toEqual(["e", "d", "c", "b", "a"]);
    expect(out.map((r) => r.isPr)).toEqual([true, false, false, true, false]);
  });
});

describe("parseClock", () => {
  it("minutes and seconds to seconds; blanks, junk and 0:00 are null", () => {
    expect(parseClock("12", "34")).toBe(754);
    expect(parseClock("", "45")).toBe(45);
    expect(parseClock("1", "")).toBe(60);
    expect(parseClock("", "")).toBeNull();
    expect(parseClock("0", "0")).toBeNull();
    expect(parseClock("ab", "cd")).toBeNull();
    expect(parseClock("1", "75")).toBe(135);
  });
});

describe("row <-> score", () => {
  it("round-trips every shape", () => {
    const cases: Score[] = [rr(6, 14), t(754), t(900, true), load(185), { type: "distance", value: 2000 }, q("solid")];
    for (const s of cases) expect(scoreFromRow(rowFromScore(s))).toEqual(s);
  });
  it("rejects a malformed row", () => {
    expect(scoreFromRow({ score_type: "rounds_reps", value_a: 6, value_b: null, quality: null, capped: false })).toBeNull();
    expect(scoreFromRow({ score_type: "bogus", value_a: 1, value_b: null, quality: null, capped: false })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/__tests__/workoutScore.test.ts`
Expected: FAIL — `Cannot find module '../workoutScore'`.

- [ ] **Step 3: Write the module**

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/lib/__tests__/workoutScore.test.ts`
Expected: PASS (all). If `formatDuration(754)` gives `"12:34"` — yes (m:ss, no hour). If any `toLocaleString` formatting differs under Node, use `String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",")` instead and say so.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/workoutScore.ts src/lib/__tests__/workoutScore.test.ts
git commit -m "feat(workouts): score rules — format, compare, best, bars, direction, PR flags

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Score reads/writes, and `completeSession` reports success

**Files:**
- Create: `mobile/src/lib/supabase/sessionScores.ts`
- Modify: `mobile/src/lib/supabase/daily.ts` (`completeSession`)

- [ ] **Step 1: Write the module**

```ts
// mobile/src/lib/supabase/sessionScores.ts
// The read and the two writes behind session scores. Reads fail closed to
// "no scores" — the history block then draws days without bars, which is a
// state it already has. Writes report failure as a message the sheet shows
// inline. Spec: docs/superpowers/specs/2026-09-13-session-score-capture-design.md §5.3
import { supabase } from "../supabase";
import { rowFromScore, scoreFromRow } from "../workoutScore";
import type { Score, ScoreRow } from "../workoutScore";

/** generated session id → score, for one workout. */
export async function fetchWorkoutScores(userId: string, workoutId: string): Promise<Map<string, Score>> {
  const { data, error } = await supabase
    .from("session_scores")
    .select("session_id, score_type, value_a, value_b, quality, capped")
    .eq("user_id", userId)
    .eq("workout_id", workoutId);
  if (error) {
    console.error("fetchWorkoutScores failed:", error.message, error.details ?? "");
    return new Map();
  }
  const out = new Map<string, Score>();
  for (const r of (data ?? []) as (ScoreRow & { session_id: string })[]) {
    const s = scoreFromRow(r);
    if (s) out.set(r.session_id, s);
  }
  return out;
}

export type ScoreWriteResult = { ok: true } | { ok: false; message: string };

const FAILED = "Couldn't save the score. Try again.";

export interface UpsertScoreInput {
  userId: string;
  /** generated_sessions.id */
  sessionId: string;
  workoutId: string;
  score: Score;
}

/** One row per session: a second save for the same session replaces it. */
export async function upsertSessionScore(input: UpsertScoreInput): Promise<ScoreWriteResult> {
  const { error } = await supabase
    .from("session_scores")
    .upsert(
      {
        user_id: input.userId,
        session_id: input.sessionId,
        workout_id: input.workoutId,
        ...rowFromScore(input.score),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" },
    );
  if (error) {
    console.error("upsertSessionScore failed:", error.code ?? "", error.message, error.details ?? "");
    return { ok: false, message: FAILED };
  }
  return { ok: true };
}

export async function deleteSessionScore(sessionId: string): Promise<ScoreWriteResult> {
  const { error } = await supabase.from("session_scores").delete().eq("session_id", sessionId);
  if (error) {
    console.error("deleteSessionScore failed:", error.code ?? "", error.message, error.details ?? "");
    return { ok: false, message: "Couldn't remove the score. Try again." };
  }
  return { ok: true };
}
```

- [ ] **Step 2: `completeSession` returns whether it completed**

In `mobile/src/lib/supabase/daily.ts`, `export async function completeSession(sessionId, performedExerciseIds): Promise<void>` becomes `Promise<boolean>`. Every early `return;` inside it (the read-error return, the false-start `return` after `console.warn(...nothing logged...)`, the sets-read error return, and the `sessError` branch) becomes `return false;`. After the `generated_sessions` status update succeeds and the ledger write runs, the function ends with `return true;`. Update its doc comment with one line: "Returns true when the session was stamped completed; false when it declined (false start) or the stamp failed." Read the whole function first — do not change any write or its ordering; only the return values.

`TodayTab.markDone` (`src/components/training/daily/TodayTab.tsx:333`) keeps `await completeSession(session.id, []);` unchanged — an ignored boolean is fine.

- [ ] **Step 3: Typecheck, test, commit**

Run: `npx tsc --noEmit` → clean. `npx jest` → all pass.

```bash
git add src/lib/supabase/sessionScores.ts src/lib/supabase/daily.ts
git commit -m "feat(workouts): session score reads and writes; completeSession reports success

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: History rows carry the generated session id and the score

**Files:**
- Modify: `mobile/src/lib/workoutHistory.ts`
- Modify: `mobile/src/lib/__tests__/workoutHistory.test.ts`
- Modify: `mobile/src/lib/supabase/workoutHistory.ts`

- [ ] **Step 1: Extend the row type and update the tests**

In `workoutHistory.ts`, `WorkoutSessionRow` becomes:
```ts
export interface WorkoutSessionRow {
  /** generated_sessions.id — the day; what a score hangs off. */
  generatedSessionId: string;
  /** The Track session (workout_sessions.id) to open; null when the completed
   *  day has no Track row to show, so the row draws but does not open. */
  sessionId: string | null;
  /** YYYY-MM-DD, local. */
  sessionDate: string;
  durationSeconds: number | null;
  score: Score | null;
}
```
with `import type { Score } from "./workoutScore";`. Replace the header comment's last sentence ("No score yet — …") with "Scores ride on the row (workoutScore.ts owns their rules)."

In the test file's `row()` helper add `generatedSessionId: \`g-${date}\`, score: null` to the object so every existing test still passes unchanged.

Run: `npx jest src/lib/__tests__/workoutHistory.test.ts` → PASS.

- [ ] **Step 2: Join scores in the read**

In `supabase/workoutHistory.ts`: import `fetchWorkoutScores` from `./sessionScores`. Run it alongside the sessions query — after the `gens` read succeeds:
```ts
  const scores = await fetchWorkoutScores(userId, workoutId);
```
and in the final `.map((g) => ({ … }))` add `generatedSessionId: g.id,` and `score: scores.get(g.id) ?? null,`. Add to the header comment: "Scores are one more read, joined by the generated session id; a failed scores read leaves every row unscored, which the block draws as days without bars."

- [ ] **Step 3: Typecheck, test, commit**

`npx tsc --noEmit` → clean (the only consumer, `WorkoutHistoryBlock`, ignores the new fields until Task 9). `npx jest` → pass.

```bash
git add src/lib/workoutHistory.ts src/lib/__tests__/workoutHistory.test.ts src/lib/supabase/workoutHistory.ts
git commit -m "feat(workouts): history rows carry the day id and its score

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Share the bar and PR styles

**Files:**
- Modify: `mobile/src/components/training/item-detail/historyStyles.ts`
- Modify: `mobile/src/components/training/item-detail/HistoryBlock.tsx`

- [ ] **Step 1: Move the styles**

Append to `historyStyles` (values byte-identical to `HistoryBlock.tsx`'s local sheet; `tint` must be imported from tokens):
```ts
  bars: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, height: 56 },
  barSlot: { flex: 1, justifyContent: "flex-end" },
  bar: { backgroundColor: tint(colors.brand, 0.35), borderRadius: 3 },
  barBest: { backgroundColor: colors.brand },
  direction: { flexDirection: "row", alignItems: "center", gap: 4 },
  directionText: { fontSize: 12, fontWeight: "600", color: colors.brand },
  directionDown: { color: colors.warning },
  pr: { backgroundColor: tint(colors.success), borderRadius: radii.control, paddingHorizontal: 6, paddingVertical: 2 },
  prText: { fontSize: 10, fontWeight: "700", color: colors.success, letterSpacing: 0.5 },
```
and export `export const BAR_MAX_HEIGHT = 56;` from the same file (use it in `bars.height`).

In `HistoryBlock.tsx`: delete those nine keys from the local sheet (keep `footer`, `footerText`, `footerStrong`), delete its local `const BAR_MAX_HEIGHT = 56;`, import `BAR_MAX_HEIGHT` from `./historyStyles`, and replace `styles.bars/barSlot/bar/barBest/direction/directionText/directionDown/pr/prText` with `h.…`. Drop `tint`/`radii` from its token import if now unused.

- [ ] **Step 2: Verify and commit**

`npx tsc --noEmit` → clean; `npx eslint src/components/training/item-detail` → no new warnings.

```bash
git add src/components/training/item-detail/historyStyles.ts src/components/training/item-detail/HistoryBlock.tsx
git commit -m "refactor(exercises): share the history bar and PR styles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: ClockInput

**Files:**
- Create: `mobile/src/components/ui/ClockInput.tsx`

- [ ] **Step 1: Write it**

```tsx
// mobile/src/components/ui/ClockInput.tsx
// Minutes and seconds, side by side — the pair SetTimeSheet types a set's
// duration into, lifted so the score sheet asks for a finish time the same
// way. Text in, text out: the caller parses with parseClock, which is where
// "blank means none" and "75 seconds carries" live.
import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { colors, radii } from "@/src/theme/tokens";

interface ClockInputProps {
  mins: string;
  secs: string;
  onChange: (next: { mins: string; secs: string }) => void;
  disabled?: boolean;
  /** Read out before "minutes" / "seconds". */
  label?: string;
}

export function ClockInput({ mins, secs, onChange, disabled = false, label = "" }: ClockInputProps) {
  const prefix = label ? `${label} ` : "";
  return (
    <View style={styles.row}>
      <TextInput
        style={[styles.field, disabled && styles.fieldDisabled]}
        value={mins}
        onChangeText={(v) => onChange({ mins: v, secs })}
        keyboardType="number-pad"
        selectTextOnFocus
        editable={!disabled}
        maxLength={3}
        accessibilityLabel={`${prefix}minutes`}
      />
      <Text style={styles.unit}>min</Text>
      <TextInput
        style={[styles.field, disabled && styles.fieldDisabled]}
        value={secs}
        onChangeText={(v) => onChange({ mins, secs: v })}
        keyboardType="number-pad"
        selectTextOnFocus
        editable={!disabled}
        maxLength={2}
        accessibilityLabel={`${prefix}seconds`}
      />
      <Text style={styles.unit}>sec</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  field: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.control, paddingVertical: 12, paddingHorizontal: 18,
    fontSize: 20, color: colors.text, minWidth: 74, textAlign: "center",
  },
  fieldDisabled: { opacity: 0.5 },
  unit: { fontSize: 13, color: colors.textMuted },
});
```

`SetTimeSheet` is NOT rewired in this task — leave it; a later cleanup can point it here.

- [ ] **Step 2: Verify and commit**

`npx tsc --noEmit` → clean; `npx eslint src/components/ui/ClockInput.tsx` → clean.

```bash
git add src/components/ui/ClockInput.tsx
git commit -m "feat(ui): ClockInput — the minutes/seconds pair as a component

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: ScoreSheet

**Files:**
- Create: `mobile/src/components/workout-session/ScoreSheet.tsx`

- [ ] **Step 1: Write it**

```tsx
// mobile/src/components/workout-session/ScoreSheet.tsx
// "How did it go?" — the score for one served-whole session, in the
// workout's own units (spec 2026-09-13 §4.1–4.2). Opened at Finish on the
// live screen (Save / Skip) and from a history row on the workout page
// (Save / Remove score). The sheet owns its input state; the caller owns
// the write and reports failure back through onSave's result so the typed
// values survive a retry. Scrim taps do not dismiss: this holds typed
// content.
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, ActivityIndicator, Alert } from "react-native";
import { X } from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { ClockInput } from "@/src/components/ui/ClockInput";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { SCORE_LABELS } from "@/src/lib/workoutFormatVocab";
import { splitDuration } from "@/src/lib/setTiming";
import { formatDuration } from "@/src/lib/timeFormat";
import { parseClock, QUALITIES, QUALITY_LABELS } from "@/src/lib/workoutScore";
import type { Score, ScorableType, Quality, CountedType } from "@/src/lib/workoutScore";
import type { ScoreWriteResult } from "@/src/lib/supabase/sessionScores";

interface ScoreSheetProps {
  visible: boolean;
  workoutName: string;
  scoreType: ScorableType;
  /** Seconds the session clock recorded; null in backfill mode or when unknown. */
  elapsedSeconds: number | null;
  /** The workout's time cap in minutes; null when none. */
  capMinutes: number | null;
  /** Present when editing; drives "Remove score" instead of "Skip". */
  existing: Score | null;
  onSave: (score: Score) => Promise<ScoreWriteResult>;
  onSkip: () => void;
  onRemove?: () => Promise<ScoreWriteResult>;
  onClose: () => void;
}

const COUNTED_CAPTION: Record<Exclude<CountedType, "duration">, string> = {
  reps: "reps", load: "lb", distance: "m", calories: "cal", height: "in",
};

const digitsOnly = (v: string): string => v.replace(/[^0-9]/g, "");
const num = (v: string): number | null => (v === "" ? null : parseInt(v, 10));

export function ScoreSheet({
  visible, workoutName, scoreType, elapsedSeconds, capMinutes, existing, onSave, onSkip, onRemove, onClose,
}: ScoreSheetProps) {
  const [rounds, setRounds] = useState("");
  const [reps, setReps] = useState("");
  const [clock, setClock] = useState({ mins: "", secs: "" });
  const [capped, setCapped] = useState(false);
  const [value, setValue] = useState("");
  const [quality, setQuality] = useState<Quality | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill: an existing score when editing; otherwise the session clock for
  // a time score (live mode only — backfill passes null). Reset on every open
  // so a sheet reopened for another session never shows the last one's numbers.
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setBusy(false);
    setCapped(false);
    setQuality(null);
    setRounds(""); setReps(""); setValue("");
    setClock({ mins: "", secs: "" });
    if (existing) {
      switch (existing.type) {
        case "rounds_reps": setRounds(String(existing.rounds)); setReps(String(existing.reps)); break;
        case "time": {
          const d = splitDuration(existing.seconds);
          setClock({ mins: String(d.mins), secs: String(d.secs) });
          setCapped(existing.capped);
          break;
        }
        case "duration": {
          const d = splitDuration(existing.value);
          setClock({ mins: String(d.mins), secs: String(d.secs) });
          break;
        }
        case "quality": setQuality(existing.quality); break;
        default: setValue(String(existing.value));
      }
      return;
    }
    if (scoreType === "time" && elapsedSeconds !== null && elapsedSeconds > 0) {
      const d = splitDuration(elapsedSeconds);
      setClock({ mins: String(d.mins), secs: String(d.secs) });
    }
  }, [visible, existing, scoreType, elapsedSeconds]);

  const toggleCap = (on: boolean) => {
    setCapped(on);
    if (on && capMinutes !== null) {
      setClock({ mins: String(capMinutes), secs: "0" });
    } else if (!on) {
      const d = splitDuration(elapsedSeconds ?? 0);
      setClock(elapsedSeconds ? { mins: String(d.mins), secs: String(d.secs) } : { mins: "", secs: "" });
    }
  };

  /** The score the inputs describe, or null while they are not yet a score. */
  const draft = (): Score | null => {
    switch (scoreType) {
      case "rounds_reps": {
        const r = num(rounds) ?? 0;
        const p = num(reps) ?? 0;
        if (rounds === "" && reps === "") return null;
        if (r === 0 && p === 0) return null;
        return { type: "rounds_reps", rounds: r, reps: p };
      }
      case "time": {
        if (capped && capMinutes !== null) return { type: "time", seconds: capMinutes * 60, capped: true };
        const s = parseClock(clock.mins, clock.secs);
        return s === null ? null : { type: "time", seconds: s, capped: false };
      }
      case "duration": {
        const s = parseClock(clock.mins, clock.secs);
        return s === null ? null : { type: "duration", value: s };
      }
      case "quality":
        return quality === null ? null : { type: "quality", quality };
      default: {
        const v = num(value);
        return v === null || v <= 0 ? null : { type: scoreType, value: v };
      }
    }
  };

  const score = draft();

  const save = async () => {
    if (!score || busy) return;
    setBusy(true);
    setError(null);
    const result = await onSave(score);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  const remove = () => {
    if (!onRemove || busy) return;
    Alert.alert("Remove this score?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          setBusy(true);
          setError(null);
          const result = await onRemove();
          setBusy(false);
          if (!result.ok) setError(result.message);
        },
      },
    ]);
  };

  const input = (() => {
    switch (scoreType) {
      case "rounds_reps":
        return (
          <View style={styles.pair}>
            <View style={styles.pairCell}>
              <TextInput style={styles.field} value={rounds} onChangeText={(v) => setRounds(digitsOnly(v))}
                keyboardType="number-pad" selectTextOnFocus maxLength={3} accessibilityLabel="Rounds" placeholder="0" placeholderTextColor={colors.textFaint} />
              <Text style={styles.unit}>rounds</Text>
            </View>
            <Text style={styles.plus}>+</Text>
            <View style={styles.pairCell}>
              <TextInput style={styles.field} value={reps} onChangeText={(v) => setReps(digitsOnly(v))}
                keyboardType="number-pad" selectTextOnFocus maxLength={3} accessibilityLabel="Partial reps" placeholder="0" placeholderTextColor={colors.textFaint} />
              <Text style={styles.unit}>reps</Text>
            </View>
          </View>
        );
      case "time":
        return (
          <>
            <ClockInput mins={clock.mins} secs={clock.secs} onChange={setClock} disabled={capped} label="Finish time" />
            {capMinutes !== null && (
              <View style={styles.capRow}>
                <Text style={styles.capText}>Hit the time cap ({capMinutes} min)</Text>
                <Switch value={capped} onValueChange={toggleCap} trackColor={{ true: colors.brand, false: colors.border }} />
              </View>
            )}
          </>
        );
      case "duration":
        return <ClockInput mins={clock.mins} secs={clock.secs} onChange={setClock} label="Duration" />;
      case "quality":
        return (
          <View style={styles.pillRow}>
            {QUALITIES.map((qk) => (
              <TouchableOpacity key={qk} style={[styles.pill, quality === qk && styles.pillActive]} onPress={() => setQuality(qk)}
                accessibilityRole="button" accessibilityState={{ selected: quality === qk }}>
                <Text style={[styles.pillText, quality === qk && styles.pillTextActive]}>{QUALITY_LABELS[qk]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      default:
        return (
          <View style={styles.single}>
            <TextInput style={[styles.field, styles.fieldWide]} value={value} onChangeText={(v) => setValue(digitsOnly(v))}
              keyboardType="number-pad" selectTextOnFocus maxLength={6} accessibilityLabel={SCORE_LABELS[scoreType]} placeholder="0" placeholderTextColor={colors.textFaint} />
            <Text style={styles.unit}>{COUNTED_CAPTION[scoreType as Exclude<CountedType, "duration">]}</Text>
          </View>
        );
    }
  })();

  const subtitle = [workoutName, elapsedSeconds !== null && elapsedSeconds > 0 ? `Duration ${formatDuration(elapsedSeconds)}` : null]
    .filter(Boolean).join(" · ");

  return (
    <BottomSheet visible={visible} onClose={onClose} dismissOnScrim={false} closeLabel="Close the score sheet">
      <View style={styles.header}>
        <Text style={styles.title}>How did it go?</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Close">
          <X size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      <Text style={styles.caption}>{SCORE_LABELS[scoreType]}</Text>
      <View style={styles.inputWrap}>{input}</View>

      <TouchableOpacity
        style={[styles.save, (busy || !score) && styles.saveDisabled]}
        onPress={save}
        disabled={busy || !score}
        accessibilityRole="button"
        accessibilityLabel="Save score"
        accessibilityState={{ disabled: busy || !score, busy }}
      >
        {busy ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Text style={styles.saveText}>Save</Text>}
      </TouchableOpacity>
      {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      {existing && onRemove ? (
        <TouchableOpacity style={styles.quiet} onPress={remove} disabled={busy} accessibilityRole="button">
          <Text style={styles.quietDanger}>Remove score</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.quiet} onPress={onSkip} disabled={busy} accessibilityRole="button">
          <Text style={styles.quietText}>Skip</Text>
        </TouchableOpacity>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 17, fontWeight: "700", color: colors.text, flexShrink: 1 },
  subtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  caption: { ...typography.caption, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11, marginTop: spacing.lg, marginBottom: spacing.sm },
  inputWrap: { marginBottom: spacing.md },
  pair: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md },
  pairCell: { alignItems: "center", gap: 4 },
  plus: { fontSize: 22, color: colors.textMuted, marginBottom: 18 },
  single: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  field: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.control, paddingVertical: 12, paddingHorizontal: 18,
    fontSize: 20, color: colors.text, minWidth: 74, textAlign: "center",
  },
  fieldWide: { minWidth: 120 },
  unit: { fontSize: 13, color: colors.textMuted },
  capRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  capText: { fontSize: 14, color: colors.text },
  pillRow: { flexDirection: "row", gap: 8 },
  pill: {
    flex: 1, alignItems: "center", paddingVertical: 11,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill,
  },
  pillActive: { borderColor: colors.brand, backgroundColor: tint(colors.brand) },
  pillText: { fontSize: 13.5, color: colors.textMuted },
  pillTextActive: { color: colors.brand, fontWeight: "600" },
  save: { backgroundColor: colors.brand, borderRadius: radii.control, paddingVertical: 14, alignItems: "center", marginTop: spacing.sm },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: colors.onBrand, ...typography.button },
  error: { fontSize: 13, color: colors.danger, textAlign: "center", marginTop: spacing.sm },
  quiet: { alignItems: "center", paddingVertical: 14 },
  quietText: { color: colors.textMuted, fontSize: 14 },
  quietDanger: { color: colors.danger, fontSize: 14 },
});
```

- [ ] **Step 2: Verify and commit**

`npx tsc --noEmit` → clean; `npx eslint src/components/workout-session/ScoreSheet.tsx` → clean (no raw colours).

```bash
git add src/components/workout-session/ScoreSheet.tsx
git commit -m "feat(workouts): ScoreSheet — the score in the workout's own units

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Finish opens the sheet on the live screen

**Files:**
- Modify: `mobile/app/workout/[id].tsx`

- [ ] **Step 1: Imports and state**

Add imports:
```ts
import { ScoreSheet } from '@/src/components/workout-session/ScoreSheet';
import { upsertSessionScore } from '@/src/lib/supabase/sessionScores';
import type { Score, ScorableType } from '@/src/lib/workoutScore';
```
Next to the other `useState` declarations (after `const [servedWorkout, setServedWorkout] = …` at ~line 112) add:
```ts
  // Opened by finishWorkout when the served workout is scorable and the
  // session was stamped completed; null otherwise. Holds what the sheet
  // needs so a re-render cannot change what it asks for.
  const [scorePrompt, setScorePrompt] = useState<{ scoreType: ScorableType; elapsedSeconds: number | null; capMinutes: number | null } | null>(null);
```

- [ ] **Step 2: Branch at the end of `finishWorkout`**

Replace, inside `finishWorkout`, the block
```ts
        if (isDaily) {
          const performedIds = …;
          await completeSession(String(id), performedIds);
        }
      }

      Alert.alert(
        '🎉 Workout Complete!',
        …
        [{ text: 'Done', onPress: () => router.back() }]
      );
```
with
```ts
        if (isDaily) {
          const performedIds = exerciseStates
            .filter((e) => e.sets.some((s) => s.completed))
            .map((e) => e.exercise.exercise_id);
          completed = await completeSession(String(id), performedIds);
        }
      }

      // A served-whole workout with a score type gets asked for its score
      // instead of the alert — but only once the day is on record as
      // completed, so a refused completion (false start) never leaves a
      // score with no session behind it. Spec 2026-09-13 §4.3.
      const scoreType = servedWorkout?.tags.scoreType ?? null;
      if (completed && scoreType !== null && scoreType !== 'none') {
        const span = recordedSpan();
        setScorePrompt({
          scoreType,
          elapsedSeconds: recordMode === 'backfill' ? null : span.durationSeconds,
          capMinutes: servedWorkout?.tags.formatMinutes ?? null,
        });
        return;
      }

      Alert.alert(
        '🎉 Workout Complete!',
        `Duration: ${formatDuration(elapsedSeconds())}\nExercises: ${exerciseStates.filter(e => e.completed).length}/${exerciseStates.length}`,
        [{ text: 'Done', onPress: () => router.back() }]
      );
```
and declare `let completed = false;` as the first line inside the `try` of `finishWorkout`. The `finally { setIsSaving(false); }` stays; the early `return` passes through it.

- [ ] **Step 3: Mount the sheet**

Directly before the closing `</View>` of the screen's return (after the `{timingSet && … <SetTimeSheet …/>}` block), add:
```tsx
      {scorePrompt && servedWorkout && userId && (
        <ScoreSheet
          visible
          workoutName={servedWorkout.name}
          scoreType={scorePrompt.scoreType}
          elapsedSeconds={scorePrompt.elapsedSeconds}
          capMinutes={scorePrompt.capMinutes}
          existing={null}
          onSave={async (score: Score) => {
            const result = await upsertSessionScore({
              userId, sessionId: String(id), workoutId: servedWorkout.workoutId, score,
            });
            if (result.ok) {
              setScorePrompt(null);
              router.back();
            }
            return result;
          }}
          onSkip={() => { setScorePrompt(null); router.back(); }}
          onClose={() => { setScorePrompt(null); router.back(); }}
        />
      )}
```
Confirm `userId` is the state at line ~103 and `id` is the generated session id in daily mode (it is what `completeSession(String(id), …)` receives).

- [ ] **Step 4: Verify and commit**

`npx tsc --noEmit` → clean; `npx eslint "app/workout/[id].tsx"` → no new warnings; `npx jest` → pass.

```bash
git add "app/workout/[id].tsx"
git commit -m "feat(workouts): ask for the score when a served workout finishes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The history block draws Best, bars, PRs, and opens the sheet

**Files:**
- Modify: `mobile/src/components/training/workout-detail/WorkoutHistoryBlock.tsx`

- [ ] **Step 1: Rewrite the block**

Replace the file's contents with:

```tsx
// mobile/src/components/training/workout-detail/WorkoutHistoryBlock.tsx
// "Your history" for a workout (spec 2026-09-13 session-score §4.4): the
// exercise page's frame with the workout's scores — Best in the score's own
// units, the eight-session bars (taller is better; time and capped invert),
// the direction caption, PR badges, and a row that adds or edits a score.
// Every number comes from lib/workoutHistory and lib/workoutScore; this
// file only draws.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react-native";
import { colors, spacing } from "@/src/theme/tokens";
import { historyStyles as h, BAR_MAX_HEIGHT } from "@/src/components/training/item-detail/historyStyles";
import { formatShortDate, lastDonePhrase, TREND_LABELS } from "@/src/lib/exerciseHistory";
import { summarizeWorkoutHistory, durationText } from "@/src/lib/workoutHistory";
import type { WorkoutSessionRow } from "@/src/lib/workoutHistory";
import {
  bestScore, formatScore, isChartable, scoreSessionRows, trendScoreBars, trendScoreDirection,
} from "@/src/lib/workoutScore";
import { loadWorkoutHistoryView, saveWorkoutHistoryView } from "@/src/lib/historyViewStore";
import type { HistoryView } from "@/src/lib/historyViewStore";

interface WorkoutHistoryBlockProps {
  userId: string;
  rows: WorkoutSessionRow[];
  /** YYYY-MM-DD, sampled once by the page. */
  today: string;
  /** Long-press: the Track session, when the day has one. */
  onOpenSession: (sessionId: string) => void;
  /** Tap: add or edit that day's score. */
  onScoreRow: (row: WorkoutSessionRow) => void;
  onSeeAll: () => void;
}

export function WorkoutHistoryBlock({ userId, rows, today, onOpenSession, onScoreRow, onSeeAll }: WorkoutHistoryBlockProps) {
  const [view, setView] = useState<HistoryView>("trend");
  useEffect(() => {
    let alive = true;
    loadWorkoutHistoryView(userId).then((p) => { if (alive) setView(p.view); }).catch(console.error);
    return () => { alive = false; };
  }, [userId]);
  const pick = (v: HistoryView) => {
    setView(v);
    saveWorkoutHistoryView(userId, { view: v }).catch(console.error);
  };

  const summary = useMemo(() => summarizeWorkoutHistory(rows), [rows]);
  // Scores hang off the generated session; the pure rules key on that id.
  const scored = useMemo(
    () => rows.map((r) => ({ sessionId: r.generatedSessionId, sessionDate: r.sessionDate, score: r.score })),
    [rows],
  );
  const best = useMemo(() => bestScore(scored), [scored]);
  const bars = useMemo(() => trendScoreBars(scored), [scored]);
  const direction = useMemo(() => trendScoreDirection(scored), [scored]);
  const sessionRows = useMemo(() => scoreSessionRows(scored), [scored]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.generatedSessionId, r])), [rows]);

  if (!summary) {
    return (
      <View style={h.section}>
        <View style={h.headerRow}>
          <Text style={h.sectionTitle}>Your history</Text>
        </View>
        <View style={[h.card, styles.emptyCard]}>
          <Text style={styles.emptyText}>You haven't done this one yet.</Text>
        </View>
      </View>
    );
  }

  const chartable = best !== null && isChartable(best.score.type);
  const DirectionIcon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  const caption = best === null
    ? "Add a score to see your trend."
    : !chartable
      ? "Rated, not scored."
      : `Score, last ${bars.length} ${bars.length === 1 ? "session" : "sessions"}`;

  return (
    <View style={h.section}>
      <View style={h.headerRow}>
        <Text style={h.sectionTitle}>Your history</Text>
        <View style={h.seg} accessibilityRole="tablist">
          {(["trend", "sessions"] as HistoryView[]).map((v) => {
            const on = v === view;
            return (
              <TouchableOpacity key={v} style={[h.segItem, on && h.segItemOn]} onPress={() => pick(v)}
                accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[h.segText, on && h.segTextOn]}>{v === "trend" ? "Trend" : "Sessions"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={h.card}>
        {view === "trend" ? (
          <>
            <View style={[h.stats, !chartable && styles.statsTight]}>
              <View style={h.stat}>
                <Text style={h.statLabel}>Last done</Text>
                <Text style={h.statValue} numberOfLines={1}>{lastDonePhrase(today, summary.lastDate)}</Text>
              </View>
              <View style={h.stat}>
                <Text style={h.statLabel}>Best</Text>
                <Text style={[h.statValue, best === null && styles.statEmpty]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {best ? formatScore(best.score) : "—"}
                </Text>
              </View>
              <View style={h.stat}>
                <Text style={h.statLabel}>Times</Text>
                <Text style={h.statValue} numberOfLines={1}>{summary.count}</Text>
              </View>
            </View>
            {chartable && bars.length > 0 && (
              <View style={h.bars} accessible accessibilityLabel={`Score over the last ${bars.length} sessions`}>
                {bars.map((b) => (
                  <View key={b.sessionId} style={h.barSlot}>
                    <View style={[h.bar, { height: Math.max(4, Math.round(b.height * BAR_MAX_HEIGHT)) }, b.best && h.barBest]} />
                  </View>
                ))}
              </View>
            )}
            <View style={h.captionRow}>
              <Text style={h.caption}>{caption}</Text>
              {chartable && direction !== null && (
                <View style={h.direction}>
                  <DirectionIcon size={13} color={direction === "down" ? colors.warning : colors.brand} />
                  <Text style={[h.directionText, direction === "down" && h.directionDown]}>{TREND_LABELS[direction]}</Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <View>
            {sessionRows.slice(0, summary.rows.length).map((r, i) => {
              const row = byId.get(r.sessionId);
              if (!row) return null;
              const date = formatShortDate(r.sessionDate, today);
              const scoreText = r.score ? formatScore(r.score) : null;
              const duration = durationText(row.durationSeconds);
              const a11y = [date, scoreText ?? "no score yet", r.isPr ? "personal record" : null, duration]
                .filter(Boolean).join(", ");
              return (
                <TouchableOpacity
                  key={r.sessionId}
                  style={[h.row, i > 0 && h.rowBorder]}
                  onPress={() => onScoreRow(row)}
                  onLongPress={row.sessionId ? () => onOpenSession(row.sessionId!) : undefined}
                  delayLongPress={350}
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  accessibilityHint={scoreText ? "Edits the score. Long-press opens the session." : "Adds a score. Long-press opens the session."}
                >
                  <Text style={h.rowDate}>{date}</Text>
                  {duration ? (
                    <Text style={h.rowName} numberOfLines={1}>· {duration}</Text>
                  ) : (
                    <View style={h.rowSpacer} />
                  )}
                  {scoreText ? (
                    <Text style={h.rowSet}>{scoreText}</Text>
                  ) : (
                    <Text style={h.link}>Add score</Text>
                  )}
                  {r.isPr && <View style={h.pr}><Text style={h.prText}>PR</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <TouchableOpacity style={h.seeAll} onPress={onSeeAll} accessibilityRole="button">
        <Text style={h.link}>See all {summary.count} {summary.count === 1 ? "session" : "sessions"}</Text>
        <ChevronRight size={16} color={colors.brand} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  statsTight: { marginBottom: spacing.sm },
  statEmpty: { color: colors.textFaint },
  emptyCard: { alignItems: "center", paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted },
});
```

Note `sessionRows.slice(0, summary.rows.length)` keeps the four-row cap from `SESSION_ROWS` without importing it twice; `summary.rows` is newest-first exactly like `sessionRows`.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` — expect ONE error: `CapturedWorkoutScreen.tsx` does not pass `onScoreRow` yet. That is Task 10. `npx eslint` on the file → clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/training/workout-detail/WorkoutHistoryBlock.tsx
git commit -m "feat(workouts): history block shows Best, bars, PRs, and adds or edits scores

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The workout page mounts the sheet

**Files:**
- Modify: `mobile/src/components/training/daily/CapturedWorkoutScreen.tsx`

- [ ] **Step 1: Imports and state**

Add:
```ts
import { ScoreSheet } from "@/src/components/workout-session/ScoreSheet";
import { upsertSessionScore, deleteSessionScore } from "@/src/lib/supabase/sessionScores";
import type { Score } from "@/src/lib/workoutScore";
```
After `const [historyLoaded, setHistoryLoaded] = useState(false);` add:
```ts
  // The history row whose score is being added or edited; null when closed.
  const [scoreRow, setScoreRow] = useState<WorkoutSessionRow | null>(null);
```

- [ ] **Step 2: A refetch the sheet can call**

The history focus effect reads `fetchWorkoutHistory(user.id, id)` inline. Lift the read into a callback above it so both the effect and the sheet use it:
```ts
  const reloadHistory = useCallback(async (uid: string) => {
    const rows = await fetchWorkoutHistory(uid, id);
    setHistory(rows);
    setHistoryLoaded(true);
  }, [id]);
```
and have the effect call `reloadHistory(user.id)` (keeping the `alive` guard by checking it before `setUserId`; the callback's own setters may run after unmount harmlessly — match the existing `.catch(console.error)` chain).

- [ ] **Step 3: Wire the block and mount the sheet**

Add `onScoreRow={setScoreRow}` to the `<WorkoutHistoryBlock …/>` props. Directly after the `<StartModeSheet …/>` mount at the bottom of the read view, add:
```tsx
      {workout && userId && scoreRow && workout.tags.scoreType && workout.tags.scoreType !== "none" && (
        <ScoreSheet
          visible
          workoutName={workout.name}
          scoreType={workout.tags.scoreType}
          elapsedSeconds={null}
          capMinutes={workout.tags.formatMinutes}
          existing={scoreRow.score}
          onSave={async (score: Score) => {
            const result = await upsertSessionScore({
              userId, sessionId: scoreRow.generatedSessionId, workoutId: workout.workoutId, score,
            });
            if (result.ok) {
              setScoreRow(null);
              await reloadHistory(userId);
            }
            return result;
          }}
          onRemove={async () => {
            const result = await deleteSessionScore(scoreRow.generatedSessionId);
            if (result.ok) {
              setScoreRow(null);
              await reloadHistory(userId);
            }
            return result;
          }}
          onSkip={() => setScoreRow(null)}
          onClose={() => setScoreRow(null)}
        />
      )}
```
When the workout's score type is `none`/null, tapping a row must do nothing rather than open a sheet for nothing: in `onScoreRow`, guard — `onScoreRow={(row) => { if (workout.tags.scoreType && workout.tags.scoreType !== "none") setScoreRow(row); }}`. The `scoreType` narrowing to `ScorableType` is satisfied by the `!== "none"` check in the JSX condition (TypeScript narrows the union through `&&`); if it does not narrow, bind `const scorable = workout.tags.scoreType && workout.tags.scoreType !== "none" ? workout.tags.scoreType : null;` above the return and use it.

- [ ] **Step 4: Verify and commit**

`npx tsc --noEmit` → clean; `npx eslint src/components/training/daily/CapturedWorkoutScreen.tsx` → no new warnings; `npx jest` → pass.

```bash
git add src/components/training/daily/CapturedWorkoutScreen.tsx
git commit -m "feat(workouts): add or edit a session's score from the workout page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Device pass

**Files:** none.

- [ ] **Step 1: Metro + walk3**

Reuse the Metro on port 8097 if it is still up (`lsof -nP -iTCP:8097 -sTCP:LISTEN`); otherwise `npx expo start --dev-client --port 8097`. Drive `FitTracker-walk3` (UDID `883E9323-DFCB-4B68-BE22-A0A45836206F`) explicitly on every simulator call.

- [ ] **Step 2: Walk**

1. Workouts › open "Melt Programming Benchmark WOD Day 2" (format rounds, scored by time). Start Workout › Live › mark one set complete › summary › Finish. Expect the score sheet: title "How did it go?", subtitle with the duration, caption "Time", the clock prefilled with the elapsed time, no cap switch (no cap set). Save. Back on the workout page: Trend shows Best as that time; Sessions shows date · duration · time; no PR (baseline).
2. Repeat once with a faster typed time → the new row has a PR badge; bars show two, the faster one taller and highlighted; no direction yet. A third → direction label appears.
3. Open the kettlebell AMRAP › Start › Finish. Expect the rounds + reps pair. Save "6 + 14". Trend Best "6 + 14".
4. On a workout with a cap (edit one to format For time with 20 minutes), finish › toggle "Hit the time cap" → clock fills 20:00 and disables; Save → row shows "Capped", never a PR.
5. Finish › Skip → no row score; the Sessions row shows "Add score"; tap it → sheet opens blank; save → row updates without leaving the page.
6. Tap a scored row → sheet prefilled; change it; Save. Tap again › Remove score › confirm → "Add score" again.
7. Long-press a row → Track session opens; back returns to the workout page.
8. Backfill mode finish → clock blank (no prefill).
9. A workout whose score is "Not scored": Finish shows the old alert; rows are not tappable into a sheet.
10. Exercise page › any exercise with history → its history block is pixel-identical to before Task 5.

Clean up any test sessions you created on Today/Tomorrow and say which ones remain.

- [ ] **Step 3: Record** any deviation from the spec before changing anything.
