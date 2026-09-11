# Exercise Detail Page v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the exercise page from a description into a page about the reader: their history for the exercise, their skill note, how it is scored, easier and harder alternatives, a clean Captured From strip and screen, tappable chips into the Exercises tab, and one primary action at the end of the scroll — Add to today.

**Architecture:** Tasks 1–11 add every pure module under TDD (history maths, skill replay, the Captured From model, the Add-to-today plan, small helpers) and the scoped Supabase readers/writers beside them. Tasks 12–15 build the section components. Task 16 recomposes `TrainingItemDetailScreen.tsx` in the spec's order on top of them. Tasks 17–18 wire the navigation targets (Exercises tab filter param, Today tab hand-off, Track session list filter). Task 19 audits fail-closed error handling; Task 20 walks the device and merges.

**Tech Stack:** React Native (Expo SDK 54, expo-router 6), TypeScript, Supabase JS (untyped client — a green typecheck proves nothing about column names, so every select is copied from a working sibling), Jest (ts-jest, pure libs only — never import React Native in a tested file), AsyncStorage via `createPrefsStore`, lucide-react-native, the app's `@/src/theme/tokens` palette, `ui/BottomSheet`, `ui/UndoToast` + `pendingToast`.

**Spec:** docs/superpowers/specs/2026-09-11-exercise-detail-page-v2-design.md

**Conventions for every task:**
- Work from `mobile/` on the branch `exercise-detail-v2` (Task 1 creates it from `main`). Run tests with `npx jest <path>`; typecheck with `npx tsc --noEmit -p .` (must print nothing).
- Commit after each task with the message given. End every commit message with a blank line and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Pure logic lives in `mobile/src/lib` with tests in `mobile/src/lib/__tests__/`; pixels live in `mobile/src/components/...`. A tested file never imports React Native, expo, or the Supabase client.
- Never import `@/src/lib/colors` (the legacy shim) in a new or rewritten file; use `@/src/theme/tokens`. Bottom sheets use `@/src/components/ui/BottomSheet`. Pickers come up from the bottom, never inline. Primary actions sit at the END of scrollable content, never pinned.
- The approved mock (spec §4, frames 1–3) is the decision record. Propose deviations in chat; do not ship them.
- Every new block on the page fails closed: a failed fetch hides that block and logs; the page still renders (spec §8).
- Later tasks use exactly the names defined in earlier tasks. Do not rename in passing.

---

## File map

**New (pure, tested):**
- `mobile/src/lib/exerciseHistory.ts` (+ `__tests__/exerciseHistory.test.ts`) — `WorkingSet`, best-set rule, last done, trend bars/direction, session rows with PR flags, `formatSet`, `formatShortDate`.
- `mobile/src/lib/skillReplay.ts` (+ `__tests__/skillReplay.test.ts`) — `replayRatings`.
- `mobile/src/lib/capturedFromModel.ts` (+ `__tests__/capturedFromModel.test.ts`) — `postCards`, `creatorGroups`, `sourceCounts`, `countLine`, `creatorProfileUrl`.
- `mobile/src/lib/addToTodayPlan.ts` (+ `__tests__/addToTodayPlan.test.ts`) — `TodayState` → `AddToTodayPlan`.
- `mobile/src/lib/scoredBy.ts` (+ `__tests__/scoredBy.test.ts`) — `scoredByLabel`.
- `mobile/src/lib/hierarchyCollapse.ts` (+ `__tests__/hierarchyCollapse.test.ts`) — `collapseSiblings`.
- `mobile/src/lib/demoVideo.ts` (+ `__tests__/demoVideo.test.ts`) — `videoSourceLabel`, `demoSearchUrl`.
- `mobile/src/lib/exerciseFilterLink.ts` (+ `__tests__/exerciseFilterLink.test.ts`) — the `exerciseFilter` route param: build, parse, merge.
- `mobile/src/lib/historyViewStore.ts` (+ `__tests__/historyViewStore.test.ts`) — Trend | Sessions preference.

**New (Supabase readers/writers):**
- `mobile/src/lib/supabase/exerciseHistory.ts` — `fetchExerciseWorkingSets`.
- `mobile/src/lib/supabase/rerateMovement.ts` — `fetchLatestRating`, `rerateMovement`.
- `mobile/src/lib/supabase/addToToday.ts` — `readTodayState`, `executeAddToToday`.

**New (components and routes):**
- `mobile/src/components/training/item-detail/HistoryBlock.tsx`
- `mobile/src/components/training/item-detail/ScaleItSection.tsx`
- `mobile/src/components/training/item-detail/DemoVideoCard.tsx`
- `mobile/src/components/training/item-detail/CapturedFromStrip.tsx`
- `mobile/src/components/training/item-detail/CapturedFromScreen.tsx` + `mobile/app/(tabs)/training/exercise-sources/[id].tsx`
- `mobile/src/components/training/item-detail/AddToTodayButton.tsx`

**Changed:**
- `mobile/src/types/capture.ts` — adds `CaptureSourceV2`.
- `mobile/src/lib/supabase/capture.ts` — `fetchExerciseSources` returns `CaptureSourceV2[]`.
- `mobile/src/components/training/daily/MovementRatingSheet.tsx` — `initialRatings` and `onSave` override.
- `mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx` — recomposed.
- `mobile/app/(tabs)/training/_layout.tsx` — registers `exercise-sources/[id]`.
- `mobile/app/(tabs)/training/index.tsx` — consumes `exerciseFilter` and `openTab` params.
- `mobile/src/components/training/daily/CatalogTab.tsx` — `initialFilters` merge.
- `mobile/src/components/training/daily/TodayTab.tsx` — shows a handed-off toast.
- `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx` + `mobile/app/(tabs)/track/gym-sessions/index.tsx` — `exerciseId` filter.

---

### Task 1: `exerciseHistory.ts` (TDD)

**Files:**
- Create: `mobile/src/lib/__tests__/exerciseHistory.test.ts`
- Create: `mobile/src/lib/exerciseHistory.ts`

- [ ] **Step 1: Create the branch**

Run from `mobile/`: `git checkout main && git pull && git checkout -b exercise-detail-v2`

- [ ] **Step 2: Write the failing tests**

```ts
// mobile/src/lib/__tests__/exerciseHistory.test.ts
import {
  bestSet, topSetPerSession, sessionCount, lastDonePhrase, formatShortDate,
  trendBars, trendDirection, sessionRows, formatSet,
} from "../exerciseHistory";
import type { WorkingSet } from "../exerciseHistory";

const ws = (
  sessionId: string, sessionDate: string, weightLbs: number, reps: number,
  o: Partial<WorkingSet> = {},
): WorkingSet => ({
  sessionId, sessionDate, sessionNumber: 1, sessionName: "Push Day", weightLbs, reps, ...o,
});

/** n sessions, one set each, on consecutive August days, weights from `weight(i)`. */
const series = (n: number, weight: (i: number) => number, reps = 10): WorkingSet[] =>
  Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    return ws(`s${i}`, `2026-08-${String(i).padStart(2, "0")}`, weight(i), reps);
  });

describe("bestSet", () => {
  it("heaviest weight wins", () => {
    const sets = [ws("a", "2026-09-01", 50, 12), ws("b", "2026-09-02", 60, 5), ws("c", "2026-09-03", 55, 20)];
    expect(bestSet(sets)?.sessionId).toBe("b");
  });

  it("ties on weight break on reps", () => {
    const sets = [ws("a", "2026-09-01", 50, 12), ws("b", "2026-09-02", 50, 15)];
    expect(bestSet(sets)?.sessionId).toBe("b");
  });

  it("all unweighted: most reps wins", () => {
    const sets = [ws("a", "2026-09-01", 0, 12), ws("b", "2026-09-02", 0, 20), ws("c", "2026-09-03", 0, 8)];
    expect(bestSet(sets)?.sessionId).toBe("b");
  });

  it("a weighted set beats any unweighted set", () => {
    const sets = [ws("a", "2026-09-01", 0, 30), ws("b", "2026-09-02", 20, 5)];
    expect(bestSet(sets)?.sessionId).toBe("b");
  });

  it("is null with no sets", () => {
    expect(bestSet([])).toBeNull();
  });
});

describe("topSetPerSession and sessionCount", () => {
  it("one row per session, oldest first, carrying the session's best set", () => {
    const sets = [
      ws("b", "2026-09-02", 40, 10), ws("a", "2026-09-01", 50, 8), ws("a", "2026-09-01", 55, 6),
    ];
    const tops = topSetPerSession(sets);
    expect(tops.map((t) => t.sessionId)).toEqual(["a", "b"]);
    expect(tops[0].topSet.weightLbs).toBe(55);
    expect(sessionCount(sets)).toBe(2);
  });

  it("same-day sessions order by session number", () => {
    const sets = [
      ws("late", "2026-09-01", 40, 10, { sessionNumber: 2 }),
      ws("early", "2026-09-01", 40, 10, { sessionNumber: 1 }),
    ];
    expect(topSetPerSession(sets).map((t) => t.sessionId)).toEqual(["early", "late"]);
  });
});

describe("lastDonePhrase", () => {
  const today = "2026-09-11";
  it("today, yesterday, days ago, then the date", () => {
    expect(lastDonePhrase(today, "2026-09-11")).toBe("Today");
    expect(lastDonePhrase(today, "2026-09-10")).toBe("Yesterday");
    expect(lastDonePhrase(today, "2026-09-08")).toBe("3 days ago");
    expect(lastDonePhrase(today, "2026-08-12")).toBe("30 days ago");
    expect(lastDonePhrase(today, "2026-08-11")).toBe("11 Aug");
    expect(lastDonePhrase(today, "2025-12-25")).toBe("25 Dec 2025");
  });
});

describe("formatShortDate", () => {
  it("drops the year inside the current year", () => {
    expect(formatShortDate("2026-09-08", "2026-09-11")).toBe("8 Sep");
    expect(formatShortDate("2025-09-08", "2026-09-11")).toBe("8 Sep 2025");
  });
});

describe("trendBars", () => {
  it("one bar per session, oldest left, tallest is 1, best-ever flagged", () => {
    const bars = trendBars(series(3, (i) => 100 + i * 10));
    expect(bars.map((b) => b.sessionId)).toEqual(["s1", "s2", "s3"]);
    expect(bars[2].height).toBe(1);
    expect(bars[0].height).toBeCloseTo(110 / 130);
    expect(bars.map((b) => b.best)).toEqual([false, false, true]);
  });

  it("keeps only the last eight of twenty", () => {
    const bars = trendBars(series(20, (i) => 100 + i));
    expect(bars).toHaveLength(8);
    expect(bars[0].sessionId).toBe("s13");
    expect(bars[7].sessionId).toBe("s20");
  });

  it("the best-ever bar can fall outside the window", () => {
    const bars = trendBars(series(20, (i) => (i === 2 ? 500 : 100)));
    expect(bars.every((b) => !b.best)).toBe(true);
    expect(bars.every((b) => b.height === 1)).toBe(true);
  });

  it("unweighted history draws reps", () => {
    const bars = trendBars([ws("a", "2026-09-01", 0, 5), ws("b", "2026-09-02", 0, 10)]);
    expect(bars.map((b) => b.height)).toEqual([0.5, 1]);
  });

  it("one session is one bar", () => {
    expect(trendBars(series(1, () => 100))).toHaveLength(1);
  });
});

describe("trendDirection", () => {
  it("is null under three sessions", () => {
    expect(trendDirection(series(1, () => 100))).toBeNull();
    expect(trendDirection(series(2, (i) => 100 + i))).toBeNull();
  });

  it("up when the latest beats the median of the earlier bars", () => {
    expect(trendDirection(series(3, (i) => 100 + i * 10))).toBe("up");
    expect(trendDirection(series(8, (i) => 100 + i * 5))).toBe("up");
  });

  it("down when below, steady when equal", () => {
    expect(trendDirection(series(8, (i) => 200 - i * 5))).toBe("down");
    expect(trendDirection(series(20, () => 100))).toBe("steady");
  });

  it("judges only the eight bars shown", () => {
    // Sessions 1–12 heavy, 13–19 light, 20 light: the window is all light → steady.
    expect(trendDirection(series(20, (i) => (i <= 12 ? 300 : 100)))).toBe("steady");
  });
});

describe("sessionRows", () => {
  it("newest first, top set per row, PR when that session set a record", () => {
    const rows = sessionRows(series(3, (i) => 100 + i * 10));
    expect(rows.map((r) => r.sessionId)).toEqual(["s3", "s2", "s1"]);
    expect(rows[0].topSet.weightLbs).toBe(130);
    // The first session is a baseline, not a record.
    expect(rows.map((r) => r.isPr)).toEqual([true, true, false]);
  });

  it("no PR on a session that did not beat the prior best", () => {
    const rows = sessionRows([
      ws("a", "2026-09-01", 100, 5), ws("b", "2026-09-02", 90, 5), ws("c", "2026-09-03", 90, 5),
    ]);
    expect(rows.map((r) => `${r.sessionId}:${r.isPr}`)).toEqual(["c:false", "b:false", "a:false"]);
  });
});

describe("formatSet", () => {
  it("weighted and unweighted forms", () => {
    expect(formatSet({ weightLbs: 50, reps: 12 })).toBe("50 lb × 12");
    expect(formatSet({ weightLbs: 52.5, reps: 3 })).toBe("52.5 lb × 3");
    expect(formatSet({ weightLbs: 0, reps: 12 })).toBe("12 reps");
    expect(formatSet({ weightLbs: 0, reps: 1 })).toBe("1 rep");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx jest src/lib/__tests__/exerciseHistory.test.ts`
Expected: FAIL, "Cannot find module '../exerciseHistory'".

- [ ] **Step 4: Write the module**

```ts
// mobile/src/lib/exerciseHistory.ts
// The reader's own history for ONE exercise, from a list of working sets.
// Spec: docs/superpowers/specs/2026-09-11-exercise-detail-page-v2-design.md §4.2, §5.
// Pure on purpose (decision 7): one scoped query feeds this, nothing here
// touches the network. Warm-ups never reach this module — the reader drops
// them.
import { computeRecords, recordsBySession } from "./personalRecords";
import type { SetFact } from "../types/records";

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

export function bestSet(sets: WorkingSet[]): WorkingSet | null {
  let best: WorkingSet | null = null;
  for (const s of sets) if (best === null || compareSets(s, best) > 0) best = s;
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
const toUtc = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** "8 Sep" this year, "8 Sep 2025" otherwise. Used by the history stats, the
 *  skill note and the Captured From dates so every date on the page agrees. */
export function formatShortDate(iso: string, today: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const label = `${d} ${MONTHS[m - 1]}`;
  return y === Number(today.slice(0, 4)) ? label : `${label} ${y}`;
}

/** "Today", "Yesterday", "3 days ago" up to 30, then the date. */
export function lastDonePhrase(today: string, date: string): string {
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

/** Bar height reads weight when the history has any weighted set, reps otherwise. */
function metricFor(sets: WorkingSet[]): (s: WorkingSet) => number {
  const weighted = sets.some((s) => s.weightLbs > 0);
  return (s) => (weighted ? s.weightLbs : s.reps);
}

/** The last eight sessions' top sets, oldest left. */
export function trendBars(sets: WorkingSet[]): TrendBar[] {
  const metric = metricFor(sets);
  const window = topSetPerSession(sets).slice(-TREND_WINDOW);
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
  const metric = metricFor(sets);
  const window = topSetPerSession(sets).slice(-TREND_WINDOW);
  if (window.length < 3) return null;
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
  /** That session set a record at the time (personalRecords over this exercise only). */
  isPr: boolean;
}

/** Sessions newest first. The caller decides how many to show. */
export function sessionRows(sets: WorkingSet[]): SessionRow[] {
  // personalRecords keys on exercise; every set here is the same exercise.
  const facts: SetFact[] = sets.map((s) => ({
    exerciseId: "this", exerciseName: "this",
    sessionId: s.sessionId, sessionNumber: s.sessionNumber, date: s.sessionDate,
    weightLbs: s.weightLbs, reps: s.reps, volumeLbs: s.weightLbs * s.reps,
  }));
  const prBySession = recordsBySession(computeRecords(facts));
  return topSetPerSession(sets)
    .reverse()
    .map((t) => ({
      sessionId: t.sessionId, sessionDate: t.sessionDate, sessionName: t.sessionName,
      topSet: t.topSet, isPr: (prBySession.get(t.sessionId) ?? 0) > 0,
    }));
}

/** "50 lb × 12", or "12 reps" for an unweighted set. */
export function formatSet(set: { weightLbs: number; reps: number }): string {
  if (set.weightLbs > 0) return `${set.weightLbs} lb × ${set.reps}`;
  return `${set.reps} ${set.reps === 1 ? "rep" : "reps"}`;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest src/lib/__tests__/exerciseHistory.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exerciseHistory.ts src/lib/__tests__/exerciseHistory.test.ts
git commit -m "feat(exercise-page): pure history maths — best set, last done, trend, session rows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The scoped history reader

**Files:**
- Create: `mobile/src/lib/supabase/exerciseHistory.ts`

- [ ] **Step 1: Write the reader**

```ts
// mobile/src/lib/supabase/exerciseHistory.ts
// One scoped query for a reader's working sets of ONE exercise (spec
// decision 7): not the user-wide set fetch Track uses, not a view. The
// select mirrors gymSessions.ts so the session name resolves through the
// same presentation rule; `!inner` on the exercise embed keeps only the
// sessions that contain this exercise, and only this exercise's rows.
import { supabase } from "../supabase";
import { toSession } from "./gymSessions";
import { sessionTitle } from "../sessionPresentation";
import type { WorkingSet } from "../exerciseHistory";

const SCOPED_SELECT = `
  id, session_number, session_date, started_at, ended_at, duration_seconds,
  workout_instance:workout_instances(
    id,
    program_workout:program_workouts(name, estimated_duration_minutes),
    generated_session:generated_sessions(
      split_day, source, served_captured_workout_id,
      captured:captured_workouts(
        id, name, est_minutes,
        source:captured_sources(poster_handle)
      ),
      blocks:generated_session_blocks(
        block, minutes,
        captured:captured_workouts(name)
      )
    )
  ),
  exercises:exercise_instances!inner(
    id, exercise_id, exercise_order, difficulty,
    exercise:exercises(
      name,
      regions:exercise_muscle_regions(is_primary, region:muscle_regions(name))
    ),
    sets:set_instances(
      set_number, actual_reps, actual_weight_lbs, volume_lbs, is_warmup,
      difficulty, started_at, ended_at, duration_seconds, timing_source
    )
  )
`;

/** Every working set of `exerciseId` this user has logged, oldest first.
 *  Empty on error — the history block fails closed. */
export async function fetchExerciseWorkingSets(
  userId: string,
  exerciseId: string,
): Promise<WorkingSet[]> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(SCOPED_SELECT)
    .eq("user_id", userId)
    .eq("exercises.exercise_id", exerciseId)
    .order("session_date", { ascending: true })
    .order("session_number", { ascending: true });
  if (error) {
    console.error("fetchExerciseWorkingSets failed:", error.message, error.details ?? "");
    return [];
  }
  const out: WorkingSet[] = [];
  for (const row of data ?? []) {
    // The title falls back to what the sets say was trained; with only this
    // exercise's rows embedded that fallback is judged on this exercise
    // alone. Named sessions (program, captured, split) are unaffected.
    const session = toSession(row, 1);
    const name = sessionTitle(session);
    for (const ex of session.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of ex.sets) {
        if (s.isWarmup) continue;
        out.push({
          sessionId: session.id,
          sessionDate: session.date,
          sessionNumber: session.sessionNumber,
          sessionName: name,
          weightLbs: s.weightLbs,
          reps: s.reps,
        });
      }
    }
  }
  return out;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: nothing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/exerciseHistory.ts
git commit -m "feat(exercise-page): one scoped query for a reader's working sets of an exercise

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Skill replay, re-rate writer, and the single-movement rating sheet

**Files:**
- Create: `mobile/src/lib/__tests__/skillReplay.test.ts`
- Create: `mobile/src/lib/skillReplay.ts`
- Create: `mobile/src/lib/supabase/rerateMovement.ts`
- Modify: `mobile/src/components/training/daily/MovementRatingSheet.tsx`

- [ ] **Step 1: Write the failing replay test**

```ts
// mobile/src/lib/__tests__/skillReplay.test.ts
import { replayRatings } from "../skillReplay";
import { applyRating } from "../dailySkill";
import type { MovementRating } from "../dailySkill";
import type { SkillStateLevel } from "../../types/daily";

/** The incremental path saveMovementRatings takes, one row at a time. */
function incremental(ratings: MovementRating[]) {
  let state: { currentLevel: SkillStateLevel; consecutiveTooEasy: number } | null = null;
  let last: MovementRating | null = null;
  for (const r of ratings) {
    const next = applyRating(state, r);
    state = { currentLevel: next.currentLevel, consecutiveTooEasy: next.consecutiveTooEasy };
    last = r;
  }
  return { currentLevel: state?.currentLevel ?? "beginner", consecutiveTooEasy: state?.consecutiveTooEasy ?? 0, lastRating: last };
}

describe("replayRatings", () => {
  it("no rows is a fresh beginner", () => {
    expect(replayRatings([])).toEqual({ currentLevel: "beginner", consecutiveTooEasy: 0, lastRating: null });
  });

  it("promotion path equals the incremental machine", () => {
    const path: MovementRating[] = ["right", "too_easy", "too_easy", "too_easy"];
    expect(replayRatings(path)).toEqual(incremental(path));
    expect(replayRatings(path)).toEqual({ currentLevel: "intermediate", consecutiveTooEasy: 1, lastRating: "too_easy" });
  });

  it("demotion path equals the incremental machine", () => {
    const path: MovementRating[] = ["too_easy", "too_easy", "too_easy", "too_easy", "too_hard"];
    expect(replayRatings(path)).toEqual(incremental(path));
    expect(replayRatings(path)).toEqual({ currentLevel: "intermediate", consecutiveTooEasy: 0, lastRating: "too_hard" });
  });

  it("an overwritten row changes the outcome — the reason to replay", () => {
    expect(replayRatings(["too_easy", "too_easy"]).currentLevel).toBe("intermediate");
    expect(replayRatings(["too_easy", "right"]).currentLevel).toBe("beginner");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/lib/__tests__/skillReplay.test.ts`
Expected: FAIL, "Cannot find module '../skillReplay'".

- [ ] **Step 3: Write the replay module**

```ts
// mobile/src/lib/skillReplay.ts
// Replays one exercise's rating rows, in date order, through the pure state
// machine to a final skill state. A re-rate from the exercise page overwrites
// a historic row, and incrementing from the prior state would then drift;
// replaying from nothing cannot (spec §5, Skill note).
import { applyRating } from "./dailySkill";
import type { MovementRating } from "./dailySkill";
import type { SkillStateLevel } from "../types/daily";

export interface ReplayedSkillState {
  currentLevel: SkillStateLevel;
  consecutiveTooEasy: number;
  lastRating: MovementRating | null;
}

export function replayRatings(ratings: MovementRating[]): ReplayedSkillState {
  let state: { currentLevel: SkillStateLevel; consecutiveTooEasy: number } | null = null;
  let last: MovementRating | null = null;
  for (const r of ratings) {
    const next = applyRating(state, r);
    state = { currentLevel: next.currentLevel, consecutiveTooEasy: next.consecutiveTooEasy };
    last = r;
  }
  return {
    currentLevel: state?.currentLevel ?? "beginner",
    consecutiveTooEasy: state?.consecutiveTooEasy ?? 0,
    lastRating: last,
  };
}
```

- [ ] **Step 4: Run the replay test**

Run: `npx jest src/lib/__tests__/skillReplay.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the re-rate reader/writer**

```ts
// mobile/src/lib/supabase/rerateMovement.ts
// The exercise page's skill note: the latest rating row for (user, exercise)
// with its session's date, and a re-rate that overwrites that row and then
// REPLAYS every row for the exercise into exercise_skill_state. The
// session-end batch path (saveMovementRatings) is untouched.
import { supabase } from "../supabase";
import { replayRatings } from "../skillReplay";
import type { MovementRating } from "../dailySkill";

export interface LatestRating {
  rating: MovementRating;
  sessionId: string;
  /** YYYY-MM-DD of the generated session the rating belongs to. */
  sessionDate: string;
}

interface RatingRow {
  rating: MovementRating;
  session_id: string;
  created_at: string;
  session: { session_date: string; created_at: string } | { session_date: string; created_at: string }[] | null;
}

const sessionOf = (r: RatingRow): { session_date: string; created_at: string } | null =>
  Array.isArray(r.session) ? (r.session[0] ?? null) : r.session;

/** Every rating row for the pair, oldest first (session date, then session
 *  creation, then the row's own creation). Throws on error. */
async function fetchRatingRows(userId: string, exerciseId: string): Promise<RatingRow[]> {
  const { data, error } = await supabase
    .from("movement_ratings")
    .select("rating, session_id, created_at, session:generated_sessions!inner(session_date, created_at)")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RatingRow[];
  return rows
    .filter((r) => sessionOf(r) !== null)
    .sort((a, b) => {
      const sa = sessionOf(a)!;
      const sb = sessionOf(b)!;
      if (sa.session_date !== sb.session_date) return sa.session_date < sb.session_date ? -1 : 1;
      if (sa.created_at !== sb.created_at) return sa.created_at < sb.created_at ? -1 : 1;
      return a.created_at < b.created_at ? -1 : 1;
    });
}

/** The most recent rating, or null when the reader never rated this exercise
 *  (or the read failed — the note fails closed). */
export async function fetchLatestRating(
  userId: string,
  exerciseId: string,
): Promise<LatestRating | null> {
  try {
    const rows = await fetchRatingRows(userId, exerciseId);
    const last = rows[rows.length - 1];
    if (!last) return null;
    return { rating: last.rating, sessionId: last.session_id, sessionDate: sessionOf(last)!.session_date };
  } catch (e) {
    console.error("fetchLatestRating failed:", e);
    return null;
  }
}

export interface RerateInput {
  userId: string;
  sessionId: string;
  exerciseId: string;
  rating: MovementRating;
}

/** Overwrite the (session, exercise) row, replay, upsert the state.
 *  False = nothing changed (the row was not found or a write failed). */
export async function rerateMovement(input: RerateInput): Promise<boolean> {
  try {
    const { data: updated, error: upError } = await supabase
      .from("movement_ratings")
      .update({ rating: input.rating })
      .eq("user_id", input.userId)
      .eq("session_id", input.sessionId)
      .eq("exercise_id", input.exerciseId)
      .select("id");
    if (upError) throw upError;
    if (!updated || updated.length === 0) throw new Error("rating row not found");

    const rows = await fetchRatingRows(input.userId, input.exerciseId);
    const next = replayRatings(rows.map((r) => r.rating));

    const { error: stateError } = await supabase.from("exercise_skill_state").upsert(
      {
        user_id: input.userId,
        exercise_id: input.exerciseId,
        current_level: next.currentLevel,
        consecutive_too_easy: next.consecutiveTooEasy,
        last_rating: next.lastRating,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,exercise_id" },
    );
    if (stateError) throw stateError;
    return true;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error("rerateMovement failed:", err?.code ?? "", err?.message ?? String(e));
    return false;
  }
}
```

- [ ] **Step 6: Give the rating sheet a single-movement mode**

In `mobile/src/components/training/daily/MovementRatingSheet.tsx`, replace the props interface
```ts
interface MovementRatingSheetProps {
  visible: boolean;
  sessionId: string | null;
  movements: RatableMovement[];
  onClose: () => void;
  onSaved: () => void;
}
```
with
```ts
interface MovementRatingSheetProps {
  visible: boolean;
  sessionId: string | null;
  movements: RatableMovement[];
  onClose: () => void;
  onSaved: () => void;
  /** Pre-selected pills, keyed by exercise id — the exercise page's Re-rate
   *  opens on the rating that stands. */
  initialRatings?: Record<string, MovementRating>;
  /** Replaces the session-end save. The caller owns success and failure
   *  (the page keeps its old note and toasts); the sheet just closes after. */
  onSave?: (ratings: { exerciseId: string; rating: MovementRating }[]) => Promise<void>;
}
```
Change the destructure to
```ts
export function MovementRatingSheet({
  visible, sessionId, movements, onClose, onSaved, initialRatings, onSave,
}: MovementRatingSheetProps) {
```
Replace the reset effect
```ts
  useEffect(() => {
    if (!visible) return;
    setRatings({});
    setPromotions(null);
    setErrorText(null);
  }, [visible]);
```
with
```ts
  useEffect(() => {
    if (!visible) return;
    setRatings(initialRatings ?? {});
    setPromotions(null);
    setErrorText(null);
  }, [visible, initialRatings]);
```
Replace the start of `submit`
```ts
  const submit = async () => {
    if (!sessionId || saving || count === 0) return;
    setSaving(true);
    setErrorText(null);
    const { data: { user } } = await supabase.auth.getUser();
```
with
```ts
  const submit = async () => {
    if (!sessionId || saving || count === 0) return;
    setSaving(true);
    setErrorText(null);
    if (onSave) {
      await onSave(Object.entries(ratings).map(([exerciseId, rating]) => ({ exerciseId, rating })));
      setSaving(false);
      onSaved();
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
```

- [ ] **Step 7: Typecheck and the full suite**

Run: `npx tsc --noEmit -p . && npx jest src/lib/__tests__/skillReplay.test.ts src/lib/__tests__/dailySkill.test.ts`
Expected: nothing from tsc; both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/skillReplay.ts src/lib/__tests__/skillReplay.test.ts src/lib/supabase/rerateMovement.ts src/components/training/daily/MovementRatingSheet.tsx
git commit -m "feat(exercise-page): re-rate overwrites the row and replays the skill state; rating sheet takes one movement

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `CaptureSourceV2` and `capturedFromModel.ts` (TDD)

**Files:**
- Modify: `mobile/src/types/capture.ts`
- Create: `mobile/src/lib/__tests__/capturedFromModel.test.ts`
- Create: `mobile/src/lib/capturedFromModel.ts`

- [ ] **Step 1: Add the enriched source type**

In `mobile/src/types/capture.ts`, directly after the closing `}` of `export interface CaptureSource {`, add:
```ts

/** A source with what the exercise page needs beside it: the creator's
 *  rehosted avatar (null when we have none) and the FitTracker workout
 *  captured from the post (null when the post was captured as a single
 *  exercise). Spec 2026-09-11 §5 Captured From. */
export interface CaptureSourceV2 extends CaptureSource {
  avatarUrl: string | null;
  workout: { id: string; name: string } | null;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// mobile/src/lib/__tests__/capturedFromModel.test.ts
import {
  postCards, creatorGroups, sourceCounts, countLine, creatorProfileUrl, EXERCISE_DEMO_LABEL,
} from "../capturedFromModel";
import type { CaptureSourceV2 } from "../../types/capture";

const today = "2026-09-11";
const src = (o: Partial<CaptureSourceV2> & { sourceId: string; capturedAt: string }): CaptureSourceV2 => ({
  platform: "instagram", sourceUrl: `https://www.instagram.com/p/${o.sourceId}/`,
  posterHandle: "@coach", thumbnailUrl: null, avatarUrl: null, workout: null, ...o,
});

const six: CaptureSourceV2[] = [
  src({ sourceId: "a", capturedAt: "2026-08-19T10:00:00Z", posterHandle: "@coach", workout: { id: "w1", name: "Leg Day Burner" } }),
  src({ sourceId: "b", capturedAt: "2026-09-06T10:00:00Z", posterHandle: "@coach" }),
  src({ sourceId: "c", capturedAt: "2026-07-01T10:00:00Z", posterHandle: "@kb_guy", workout: { id: "w2", name: "KB Flow" } }),
  src({ sourceId: "d", capturedAt: "2026-09-01T10:00:00Z", posterHandle: "@kb_guy" }),
  src({ sourceId: "e", capturedAt: "2026-08-30T10:00:00Z", posterHandle: "@Coach" }),
  src({ sourceId: "f", capturedAt: "2025-12-25T10:00:00Z", posterHandle: null, platform: "tiktok" }),
];

describe("postCards", () => {
  it("newest capture first", () => {
    expect(postCards(six, today).map((c) => c.sourceId)).toEqual(["b", "d", "e", "a", "c", "f"]);
  });

  it("workout name, or the Exercise demo fallback, and the dated sub-line", () => {
    const cards = postCards(six, today);
    const a = cards.find((c) => c.sourceId === "a")!;
    const b = cards.find((c) => c.sourceId === "b")!;
    expect(a.workoutLabel).toBe("Leg Day Burner");
    expect(a.subline).toBe("Workout · captured 19 Aug");
    expect(b.workoutLabel).toBe(EXERCISE_DEMO_LABEL);
    expect(b.subline).toBe("Captured 6 Sep");
    expect(b.dateLabel).toBe("6 Sep");
    expect(cards.find((c) => c.sourceId === "f")!.subline).toBe("Captured 25 Dec 2025");
  });

  it("a missing handle shows the platform", () => {
    const f = postCards(six, today).find((c) => c.sourceId === "f")!;
    expect(f.handle).toBe("TikTok");
    expect(f.handleIsPlaceholder).toBe(true);
  });

  it("collapses a post captured twice", () => {
    const twice = [
      src({ sourceId: "x1", capturedAt: "2026-09-01T10:00:00Z", sourceUrl: "https://www.instagram.com/p/SAME/" }),
      src({ sourceId: "x2", capturedAt: "2026-09-03T10:00:00Z", sourceUrl: "https://instagram.com/p/SAME" }),
    ];
    expect(postCards(twice, today)).toHaveLength(1);
  });
});

describe("creatorGroups", () => {
  it("groups case-insensitively, orders creators by latest post, posts newest first", () => {
    const groups = creatorGroups(six, today);
    expect(groups.map((g) => g.handle)).toEqual(["@coach", "@kb_guy", "TikTok"]);
    expect(groups[0].posts.map((p) => p.sourceId)).toEqual(["b", "e", "a"]);
    expect(groups[0].countLabel).toBe("3 posts");
    expect(groups[2].countLabel).toBe("1 post");
  });
});

describe("counts", () => {
  it("posts and distinct creators", () => {
    expect(sourceCounts(six)).toEqual({ posts: 6, creators: 3 });
    expect(countLine({ posts: 6, creators: 3 })).toBe("6 posts · 3 creators");
    expect(countLine({ posts: 1, creators: 1 })).toBe("1 post · 1 creator");
  });
});

describe("creatorProfileUrl", () => {
  it("per platform, without the @", () => {
    expect(creatorProfileUrl("instagram", "@coach")).toBe("https://www.instagram.com/coach/");
    expect(creatorProfileUrl("tiktok", "kb_guy")).toBe("https://www.tiktok.com/@kb_guy");
    expect(creatorProfileUrl("other", "@x")).toBeNull();
    expect(creatorProfileUrl("instagram", "not a handle")).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx jest src/lib/__tests__/capturedFromModel.test.ts`
Expected: FAIL, "Cannot find module '../capturedFromModel'".

- [ ] **Step 4: Write the model**

```ts
// mobile/src/lib/capturedFromModel.ts
// Captured From, as the page and its full screen want it: post cards newest
// first, creators grouped and ordered by their latest post, and the header
// counts. Spec §4.8. Pure; the reader hands in CaptureSourceV2 rows.
import type { CapturePlatform, CaptureSourceV2 } from "../types/capture";
import { collapseByPost } from "./captureUrl";
import { normaliseHandle } from "./creatorHandle";
import { formatShortDate } from "./exerciseHistory";

export const EXERCISE_DEMO_LABEL = "Exercise demo";

const PLATFORM_LABELS: Record<CapturePlatform, string> = {
  instagram: "Instagram", tiktok: "TikTok", other: "Other",
};

export interface PostCard {
  sourceId: string;
  sourceUrl: string;
  platform: CapturePlatform;
  thumbnailUrl: string | null;
  /** The handle as captured, or the platform name when the post had none. */
  handle: string;
  handleIsPlaceholder: boolean;
  /** The raw handle for the creator filter; null when there is none. */
  posterHandle: string | null;
  avatarUrl: string | null;
  workout: { id: string; name: string } | null;
  /** The workout name, or "Exercise demo". */
  workoutLabel: string;
  capturedAt: string;
  /** "19 Aug", or "25 Dec 2025" outside the current year. */
  dateLabel: string;
  /** "Workout · captured 19 Aug" or "Captured 6 Sep". */
  subline: string;
}

const newestFirst = (a: { capturedAt: string }, b: { capturedAt: string }): number =>
  a.capturedAt < b.capturedAt ? 1 : a.capturedAt > b.capturedAt ? -1 : 0;

function toCard(s: CaptureSourceV2, today: string): PostCard {
  const date = formatShortDate(s.capturedAt.slice(0, 10), today);
  return {
    sourceId: s.sourceId,
    sourceUrl: s.sourceUrl,
    platform: s.platform,
    thumbnailUrl: s.thumbnailUrl,
    handle: s.posterHandle ?? PLATFORM_LABELS[s.platform],
    handleIsPlaceholder: s.posterHandle === null,
    posterHandle: s.posterHandle,
    avatarUrl: s.avatarUrl,
    workout: s.workout,
    workoutLabel: s.workout?.name ?? EXERCISE_DEMO_LABEL,
    capturedAt: s.capturedAt,
    dateLabel: date,
    subline: s.workout ? `Workout · captured ${date}` : `Captured ${date}`,
  };
}

/** Every post, newest capture first. Two rows for one post collapse to one. */
export function postCards(sources: CaptureSourceV2[], today: string): PostCard[] {
  return collapseByPost(sources).sort(newestFirst).map((s) => toCard(s, today));
}

/** The grouping key: the normalised handle, or the platform when there is none. */
const creatorKey = (s: { platform: CapturePlatform; posterHandle: string | null }): string =>
  (s.posterHandle !== null && normaliseHandle(s.posterHandle)) || `platform:${s.platform}`;

export interface CreatorGroup {
  key: string;
  handle: string;
  posterHandle: string | null;
  platform: CapturePlatform;
  avatarUrl: string | null;
  latestCapturedAt: string;
  posts: PostCard[];
  /** "4 posts" */
  countLabel: string;
}

/** Creators ordered by their most recent post; posts within newest first. */
export function creatorGroups(sources: CaptureSourceV2[], today: string): CreatorGroup[] {
  const groups = new Map<string, CreatorGroup>();
  for (const card of postCards(sources, today)) {
    const key = creatorKey(card);
    const held = groups.get(key);
    if (held) {
      held.posts.push(card);
      if (held.avatarUrl === null) held.avatarUrl = card.avatarUrl;
    } else {
      groups.set(key, {
        key, handle: card.handle, posterHandle: card.posterHandle, platform: card.platform,
        avatarUrl: card.avatarUrl, latestCapturedAt: card.capturedAt, posts: [card], countLabel: "",
      });
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, countLabel: `${g.posts.length} ${g.posts.length === 1 ? "post" : "posts"}` }))
    .sort((a, b) => newestFirst({ capturedAt: a.latestCapturedAt }, { capturedAt: b.latestCapturedAt }));
}

export interface SourceCounts {
  posts: number;
  creators: number;
}

export function sourceCounts(sources: CaptureSourceV2[]): SourceCounts {
  const posts = collapseByPost(sources);
  return { posts: posts.length, creators: new Set(posts.map(creatorKey)).size };
}

/** "6 posts · 3 creators" */
export function countLine(c: SourceCounts): string {
  return `${c.posts} ${c.posts === 1 ? "post" : "posts"} · ${c.creators} ${c.creators === 1 ? "creator" : "creators"}`;
}

/** The creator's public profile, for the external-link icon beside a handle
 *  (decision 6). Null when the platform has no profile page we know. */
export function creatorProfileUrl(platform: CapturePlatform, rawHandle: string): string | null {
  const handle = normaliseHandle(rawHandle);
  if (!handle) return null;
  if (platform === "instagram") return `https://www.instagram.com/${handle}/`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${handle}`;
  return null;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest src/lib/__tests__/capturedFromModel.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/capture.ts src/lib/capturedFromModel.ts src/lib/__tests__/capturedFromModel.test.ts
git commit -m "feat(exercise-page): Captured From model — cards, creator groups, counts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `fetchExerciseSources` returns `CaptureSourceV2`

**Files:**
- Modify: `mobile/src/lib/supabase/capture.ts`

- [ ] **Step 1: Rewrite the function**

There is no foreign key from `captured_sources.poster_handle` to `creators` (the creators key is the normalised handle), so the avatar comes from the shared `fetchCreators()` map in parallel — the same way the Exercises tab decorates its picker. The workout is an embed on `captured_workouts.source_id`.

Replace the whole `fetchExerciseSources` function in `mobile/src/lib/supabase/capture.ts` (from its doc comment through its closing `}`) with:

```ts
/**
 * The posts one exercise was captured from, newest first — provenance for the
 * detail page. Same two filters fetchCatalog applies: a shared library
 * exercise may be linked by other people's captures, and a save that never
 * finished leaves a pending source that was never really reviewed.
 *
 * Carries the creator's avatar (from the shared creators cache, keyed by
 * normalised handle) and the workout captured from the post — the first by
 * creation when a source somehow has more than one. Null workout = the post
 * was captured as a single exercise.
 */
export async function fetchExerciseSources(
  exerciseId: string,
  userId: string,
): Promise<CaptureSourceV2[]> {
  const [{ data, error }, creators] = await Promise.all([
    supabase
      .from("source_exercises")
      .select(`
        source:captured_sources!inner(
          id, user_id, platform, source_url, poster_handle, thumbnail_url,
          captured_at, extraction_status,
          workouts:captured_workouts(id, name, created_at)
        )
      `)
      .eq("exercise_id", exerciseId),
    fetchCreators(),
  ]);
  if (error) {
    console.error("fetchExerciseSources failed:", error);
    return [];
  }

  // collapseByPost both dedupes and orders: two source rows for one post — a
  // capture made twice before the identity rule tightened — would otherwise
  // list the same link against the same handle twice.
  return collapseByPost(
    (data ?? [])
      .map((row: any) => row.source)
      .filter((s: any) => s && s.user_id === userId && s.extraction_status === "reviewed")
      .map((s: any): CaptureSourceV2 => {
        const workouts: { id: string; name: string; created_at: string }[] = s.workouts ?? [];
        const first = [...workouts].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0] ?? null;
        const handleKey = s.poster_handle ? normaliseHandle(s.poster_handle) : "";
        return {
          sourceId: s.id,
          platform: s.platform,
          sourceUrl: s.source_url,
          posterHandle: s.poster_handle,
          thumbnailUrl: s.thumbnail_url,
          capturedAt: s.captured_at,
          avatarUrl: handleKey ? (creators[handleKey]?.avatarUrl ?? null) : null,
          workout: first ? { id: first.id, name: first.name } : null,
        };
      }),
  );
}
```

- [ ] **Step 2: Fix the imports**

At the top of `mobile/src/lib/supabase/capture.ts`, add `CaptureSourceV2,` to the existing type import list from `"../../types/capture"` (the one that already contains `CaptureSource,`), and add these two imports under `import { collapseByPost } from "../captureUrl";`:
```ts
import { normaliseHandle } from "../creatorHandle";
import { fetchCreators } from "./creators";
```
If `fetchCreators` or `normaliseHandle` is already imported in the file, do not import it twice.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p . && npx jest src/lib/__tests__/captureUrl.test.ts`
Expected: nothing from tsc (the page's `useState<CaptureSource[]>` accepts the wider rows); PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/capture.ts
git commit -m "feat(exercise-page): exercise sources carry the creator avatar and the captured workout

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `addToTodayPlan.ts` (TDD) and the `addToToday` writer

**Files:**
- Create: `mobile/src/lib/__tests__/addToTodayPlan.test.ts`
- Create: `mobile/src/lib/addToTodayPlan.ts`
- Create: `mobile/src/lib/supabase/addToToday.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/addToTodayPlan.test.ts
import { planAddToToday, ADD_TO_TODAY_LABEL, IN_SESSION_LABEL } from "../addToTodayPlan";
import type { TodayState } from "../addToTodayPlan";

const state = (o: Partial<TodayState>): TodayState => ({ kind: "none", containsExercise: false, ...o });

describe("planAddToToday (spec §4.9, one case per branch)", () => {
  it("pending session: append", () => {
    expect(planAddToToday(state({ kind: "pending", sessionId: "s1" })))
      .toEqual({ action: "append", label: ADD_TO_TODAY_LABEL });
  });

  it("session in progress: append to the live list", () => {
    expect(planAddToToday(state({ kind: "inProgress", sessionId: "s1" })))
      .toEqual({ action: "appendLive", label: ADD_TO_TODAY_LABEL });
  });

  it("no session yet: create a user_pick session", () => {
    expect(planAddToToday(state({ kind: "none" })))
      .toEqual({ action: "create", label: ADD_TO_TODAY_LABEL });
  });

  it("today completed: a second session", () => {
    expect(planAddToToday(state({ kind: "completed", sessionId: "s1" })))
      .toEqual({ action: "appendSecond", label: ADD_TO_TODAY_LABEL });
  });

  it("today rested: confirm un-rest first", () => {
    expect(planAddToToday(state({ kind: "rested", sessionId: "s1" })))
      .toEqual({ action: "confirmUnrest", label: ADD_TO_TODAY_LABEL });
  });

  it("already in today's pending or live session: disabled", () => {
    expect(planAddToToday(state({ kind: "pending", sessionId: "s1", containsExercise: true })))
      .toEqual({ action: "disabled", label: IN_SESSION_LABEL });
    expect(planAddToToday(state({ kind: "inProgress", sessionId: "s1", containsExercise: true })))
      .toEqual({ action: "disabled", label: IN_SESSION_LABEL });
  });

  it("presence in a COMPLETED session does not disable — a second session is fine", () => {
    expect(planAddToToday(state({ kind: "completed", sessionId: "s1", containsExercise: true })).action)
      .toBe("appendSecond");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/lib/__tests__/addToTodayPlan.test.ts`
Expected: FAIL, "Cannot find module '../addToTodayPlan'".

- [ ] **Step 3: Write the plan module**

```ts
// mobile/src/lib/addToTodayPlan.ts
// Which of the §4.9 branches "Add to today" takes, from today's state. Pure:
// the writer (supabase/addToToday.ts) re-reads the state right before it
// writes and asks this again, so a stale button can never write the wrong
// shape.
export type TodayKind = "none" | "pending" | "inProgress" | "completed" | "rested";

export interface TodayState {
  kind: TodayKind;
  /** The session the day shows (pickDaySession's choice); absent for "none". */
  sessionId?: string;
  /** The exercise is already an item of that session. */
  containsExercise: boolean;
}

export type AddToTodayAction =
  | "append"        // pending session: one more main-block item
  | "appendLive"    // in-progress session: the item joins the remaining list
  | "create"        // no session yet: a user_pick session with just this item
  | "appendSecond"  // today completed: a second user_pick session
  | "confirmUnrest" // today rested: ask, un-rest, then create
  | "disabled";     // already in today's pending or live session

export interface AddToTodayPlan {
  action: AddToTodayAction;
  label: string;
}

export const ADD_TO_TODAY_LABEL = "Add to today";
export const IN_SESSION_LABEL = "In today's session";
export const ADD_TO_TODAY_CAPTION = "Goes into today's session as a main-block movement";
export const ADD_TO_TODAY_ITEM_REASON = "Added from the exercise page";
export const ADDED_TOAST_TITLE = "Added to today";

export function planAddToToday(state: TodayState): AddToTodayPlan {
  if (state.containsExercise && (state.kind === "pending" || state.kind === "inProgress")) {
    return { action: "disabled", label: IN_SESSION_LABEL };
  }
  switch (state.kind) {
    case "pending": return { action: "append", label: ADD_TO_TODAY_LABEL };
    case "inProgress": return { action: "appendLive", label: ADD_TO_TODAY_LABEL };
    case "completed": return { action: "appendSecond", label: ADD_TO_TODAY_LABEL };
    case "rested": return { action: "confirmUnrest", label: ADD_TO_TODAY_LABEL };
    case "none": return { action: "create", label: ADD_TO_TODAY_LABEL };
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/lib/__tests__/addToTodayPlan.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the writer**

```ts
// mobile/src/lib/supabase/addToToday.ts
// Executes an AddToTodayPlan. The session and item shapes are the ones
// captured-workout adoption writes (daily.ts adoptCapturedWorkout), minus
// the served workout: a user_pick session, unstamped, one main-block item
// with no targets and the page's reason. Spec §4.9, §5.
import { supabase } from "../supabase";
import { rampWeek } from "../dailySplit";
import { planAddToToday, ADD_TO_TODAY_ITEM_REASON } from "../addToTodayPlan";
import type { AddToTodayPlan, TodayState } from "../addToTodayPlan";
import { fetchTodaySession, fetchTodayCheckin, unrestToday } from "./daily";

/** Today's state as the plan wants it. Read immediately before writing (spec §7). */
export async function readTodayState(
  userId: string,
  exerciseId: string,
  date: string,
): Promise<TodayState> {
  const session = await fetchTodaySession(userId, date);
  if (!session) return { kind: "none", containsExercise: false };
  const containsExercise = session.items.some((i) => i.exerciseId === exerciseId);
  if (session.status === "rested") return { kind: "rested", sessionId: session.id, containsExercise: false };
  if (session.status === "completed") return { kind: "completed", sessionId: session.id, containsExercise };
  if (session.status === "accepted" && session.workoutInstanceId) {
    return { kind: "inProgress", sessionId: session.id, containsExercise };
  }
  // suggested, or accepted but not yet started
  return { kind: "pending", sessionId: session.id, containsExercise };
}

export type AddToTodayResult =
  | { ok: true; sessionId: string }
  | { ok: false; message: string };

const FAILED = "Couldn't add it. Today is unchanged — try again.";

async function appendItem(sessionId: string, exerciseId: string): Promise<void> {
  const { data: last, error: orderError } = await supabase
    .from("generated_session_items")
    .select("item_order")
    .eq("session_id", sessionId)
    .order("item_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) throw orderError;
  const { error } = await supabase.from("generated_session_items").insert({
    session_id: sessionId,
    exercise_id: exerciseId,
    item_order: (last?.item_order ?? -1) + 1,
    section: "main",
    target_sets: null,
    target_reps: null,
    rest_seconds: null,
    reason: ADD_TO_TODAY_ITEM_REASON,
  });
  if (error) throw error;
}

/** A user_pick session for the day holding just this item. Mirrors
 *  adoptCapturedWorkout's row, with no served workout. */
async function createUserPickSession(userId: string, exerciseId: string, date: string): Promise<string> {
  const [{ data: firstRow }, { data: gym }, checkin] = await Promise.all([
    supabase
      .from("generated_sessions")
      .select("session_date")
      .eq("user_id", userId)
      .order("session_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("gym_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
    fetchTodayCheckin(userId, date),
  ]);
  const { data: session, error: insError } = await supabase
    .from("generated_sessions")
    .insert({
      user_id: userId,
      session_date: date,
      gym_profile_id: gym?.id ?? null,
      checkin_id: checkin?.id ?? null,
      split_day: null,
      ramp_week: rampWeek(firstRow?.session_date ?? null, date),
      source: "user_pick",
      served_captured_workout_id: null,
      section_minutes: null,
      status: "suggested",
      inputs_snapshot: null,
    })
    .select("id")
    .single();
  if (insError) throw insError;
  try {
    await appendItem(session.id, exerciseId);
  } catch (e) {
    // An item-less user_pick session would sit on Today all day; take it back.
    const { error: undoError } = await supabase.from("generated_sessions").delete().eq("id", session.id);
    if (undoError) console.error("addToToday undo failed:", undoError);
    throw e;
  }
  return session.id;
}

export interface AddToTodayInput {
  userId: string;
  exerciseId: string;
  /** Sampled once by the caller — the app's no-two-clocks rule. */
  date: string;
  /** The plan the user confirmed. "confirmUnrest" here means they said Add. */
  plan: AddToTodayPlan;
}

/** Re-reads today, re-plans, and refuses if the branch changed under the
 *  user (except confirmUnrest → create, which is that branch's own path). */
export async function executeAddToToday(input: AddToTodayInput): Promise<AddToTodayResult> {
  try {
    const fresh = await readTodayState(input.userId, input.exerciseId, input.date);
    const plan = planAddToToday(fresh);
    if (plan.action !== input.plan.action) {
      return { ok: false, message: "Today changed since this page opened. Pull to refresh and try again." };
    }
    switch (plan.action) {
      case "append":
      case "appendLive": {
        await appendItem(fresh.sessionId!, input.exerciseId);
        return { ok: true, sessionId: fresh.sessionId! };
      }
      case "create":
      case "appendSecond": {
        const id = await createUserPickSession(input.userId, input.exerciseId, input.date);
        return { ok: true, sessionId: id };
      }
      case "confirmUnrest": {
        const cleared = await unrestToday(input.userId, input.date);
        if (!cleared) throw new Error("unrest failed");
        const id = await createUserPickSession(input.userId, input.exerciseId, input.date);
        return { ok: true, sessionId: id };
      }
      case "disabled":
        return { ok: false, message: "Already in today's session." };
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error("executeAddToToday failed:", err?.code ?? "", err?.message ?? String(e));
    return { ok: false, message: FAILED };
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: nothing. (If `fetchTodayCheckin` is not exported from `daily.ts`, add `export` to its declaration — it is declared `export async function fetchTodayCheckin` at ~198 today.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/addToTodayPlan.ts src/lib/__tests__/addToTodayPlan.test.ts src/lib/supabase/addToToday.ts
git commit -m "feat(exercise-page): Add-to-today plan and writer across pending, live, none, completed and rested days

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `scoredByLabel` (TDD)

**Files:**
- Create: `mobile/src/lib/__tests__/scoredBy.test.ts`
- Create: `mobile/src/lib/scoredBy.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/scoredBy.test.ts
import { scoredByLabel, scoringRowsOf } from "../scoredBy";

describe("scoredByLabel", () => {
  it("joins names by display order with a middle dot", () => {
    expect(scoredByLabel([{ name: "Load", displayOrder: 2 }, { name: "Reps", displayOrder: 1 }])).toBe("Reps · Load");
  });
  it("one name stands alone; none is empty", () => {
    expect(scoredByLabel([{ name: "Time", displayOrder: 1 }])).toBe("Time");
    expect(scoredByLabel([])).toBe("");
  });
});

describe("scoringRowsOf", () => {
  it("reads the junction embed, tolerating object or array shapes and nulls", () => {
    expect(scoringRowsOf([
      { scoring_type: { name: "Reps", display_order: 1 } },
      { scoring_type: [{ name: "Load", display_order: 2 }] },
      { scoring_type: null },
    ])).toEqual([{ name: "Reps", displayOrder: 1 }, { name: "Load", displayOrder: 2 }]);
    expect(scoringRowsOf(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/lib/__tests__/scoredBy.test.ts`
Expected: FAIL, "Cannot find module '../scoredBy'".

- [ ] **Step 3: Write the module**

```ts
// mobile/src/lib/scoredBy.ts
// The meta row's fourth column (spec §4.1): scoring type names in their
// display order, "Reps · Load".
export interface ScoringTypeRow {
  name: string;
  displayOrder: number;
}

export function scoredByLabel(rows: ScoringTypeRow[]): string {
  return [...rows].sort((a, b) => a.displayOrder - b.displayOrder).map((r) => r.name).join(" · ");
}

/** From the page select's `scoring_rows:exercise_scoring_types(scoring_type:scoring_types(name, display_order))`. */
export function scoringRowsOf(
  raw: { scoring_type: unknown }[] | undefined | null,
): ScoringTypeRow[] {
  const out: ScoringTypeRow[] = [];
  for (const row of raw ?? []) {
    const t = Array.isArray(row.scoring_type) ? row.scoring_type[0] : row.scoring_type;
    if (!t || typeof t !== "object") continue;
    const { name, display_order } = t as { name?: unknown; display_order?: unknown };
    if (typeof name !== "string") continue;
    out.push({ name, displayOrder: typeof display_order === "number" ? display_order : 0 });
  }
  return out;
}
```

- [ ] **Step 4: Run the test, commit**

Run: `npx jest src/lib/__tests__/scoredBy.test.ts` → PASS, 3 tests.
```bash
git add src/lib/scoredBy.ts src/lib/__tests__/scoredBy.test.ts
git commit -m "feat(exercise-page): Scored by label from scoring types

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `collapseSiblings` (TDD)

**Files:**
- Create: `mobile/src/lib/__tests__/hierarchyCollapse.test.ts`
- Create: `mobile/src/lib/hierarchyCollapse.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/hierarchyCollapse.test.ts
import { collapseSiblings, SIBLING_LIMIT } from "../hierarchyCollapse";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

describe("collapseSiblings", () => {
  it("shows up to four siblings and counts the rest", () => {
    expect(SIBLING_LIMIT).toBe(4);
    expect(collapseSiblings(ids(10), false)).toEqual({ shown: ["s1", "s2", "s3", "s4"], hidden: 6 });
  });
  it("four or fewer never collapse", () => {
    expect(collapseSiblings(ids(4), false)).toEqual({ shown: ids(4), hidden: 0 });
    expect(collapseSiblings([], false)).toEqual({ shown: [], hidden: 0 });
  });
  it("expanded shows everything", () => {
    expect(collapseSiblings(ids(10), true)).toEqual({ shown: ids(10), hidden: 0 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/lib/__tests__/hierarchyCollapse.test.ts`
Expected: FAIL, "Cannot find module '../hierarchyCollapse'".

- [ ] **Step 3: Write the module**

```ts
// mobile/src/lib/hierarchyCollapse.ts
// Spec §4.5: the current row plus up to four siblings, then "See all N".
// Ancestors and the current row are never collapsed; only the sibling list is.
export const SIBLING_LIMIT = 4;

export function collapseSiblings<T>(
  siblings: T[],
  expanded: boolean,
  limit: number = SIBLING_LIMIT,
): { shown: T[]; hidden: number } {
  if (expanded || siblings.length <= limit) return { shown: siblings, hidden: 0 };
  return { shown: siblings.slice(0, limit), hidden: siblings.length - limit };
}
```

- [ ] **Step 4: Run the test, commit**

Run: `npx jest src/lib/__tests__/hierarchyCollapse.test.ts` → PASS, 3 tests.
```bash
git add src/lib/hierarchyCollapse.ts src/lib/__tests__/hierarchyCollapse.test.ts
git commit -m "feat(exercise-page): sibling list collapses past four

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `demoVideo.ts` (TDD)

**Files:**
- Create: `mobile/src/lib/__tests__/demoVideo.test.ts`
- Create: `mobile/src/lib/demoVideo.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/demoVideo.test.ts
import { videoSourceLabel, demoSearchUrl } from "../demoVideo";

describe("videoSourceLabel", () => {
  it("names the host", () => {
    expect(videoSourceLabel("https://www.youtube.com/watch?v=abc")).toBe("YouTube");
    expect(videoSourceLabel("https://youtu.be/abc")).toBe("YouTube");
    expect(videoSourceLabel("https://www.instagram.com/reel/abc/")).toBe("Instagram");
    expect(videoSourceLabel("https://www.tiktok.com/@x/video/1")).toBe("TikTok");
    expect(videoSourceLabel("https://vimeo.com/1")).toBe("Video");
    expect(videoSourceLabel("not a url")).toBe("Video");
  });
});

describe("demoSearchUrl", () => {
  it("is a YouTube search for the name plus 'exercise'", () => {
    expect(demoSearchUrl("Goblet Squat")).toBe("https://www.youtube.com/results?search_query=Goblet%20Squat%20exercise");
    expect(demoSearchUrl("  Sit-up & Twist ")).toBe("https://www.youtube.com/results?search_query=Sit-up%20%26%20Twist%20exercise");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/lib/__tests__/demoVideo.test.ts`
Expected: FAIL, "Cannot find module '../demoVideo'".

- [ ] **Step 3: Write the module**

```ts
// mobile/src/lib/demoVideo.ts
// The Demo Video card's source label and the "Find a demo" search link
// (spec §4.7, decision 8).
export function videoSourceLabel(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "Video";
  }
  if (host.includes("youtube.") || host === "youtu.be") return "YouTube";
  if (host.includes("instagram.")) return "Instagram";
  if (host.includes("tiktok.")) return "TikTok";
  return "Video";
}

export function demoSearchUrl(exerciseName: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exerciseName.trim()} exercise`)}`;
}
```

- [ ] **Step 4: Run the test, commit**

Run: `npx jest src/lib/__tests__/demoVideo.test.ts` → PASS, 2 tests.
```bash
git add src/lib/demoVideo.ts src/lib/__tests__/demoVideo.test.ts
git commit -m "feat(exercise-page): demo video source label and Find-a-demo search link

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `exerciseFilterLink.ts` — the chip navigation param (TDD)

**Files:**
- Create: `mobile/src/lib/__tests__/exerciseFilterLink.test.ts`
- Create: `mobile/src/lib/exerciseFilterLink.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/exerciseFilterLink.test.ts
import {
  exerciseFilterParam, parseExerciseFilterParam, mergeExerciseFilters, EXERCISE_FILTER_PARAM,
} from "../exerciseFilterLink";
import { EMPTY_EXERCISE_FILTERS } from "../../types/exerciseFilters";

describe("exerciseFilterParam / parseExerciseFilterParam", () => {
  it("round-trips a single value on each axis", () => {
    expect(EXERCISE_FILTER_PARAM).toBe("exerciseFilter");
    expect(parseExerciseFilterParam(exerciseFilterParam({ muscles: ["Glutes"] }))).toEqual({ muscles: ["Glutes"] });
    expect(parseExerciseFilterParam(exerciseFilterParam({ equipment: ["Kettlebell"] }))).toEqual({ equipment: ["Kettlebell"] });
    expect(parseExerciseFilterParam(exerciseFilterParam({ creators: ["@coach"] }))).toEqual({ creators: ["@coach"] });
  });

  it("drops a muscle the filter model does not know, and is null when nothing survives (spec §8)", () => {
    expect(parseExerciseFilterParam(exerciseFilterParam({ muscles: ["Left Pinky"] }))).toBeNull();
    expect(parseExerciseFilterParam(exerciseFilterParam({ muscles: ["Left Pinky", "Chest"] }))).toEqual({ muscles: ["Chest"] });
  });

  it("is null for junk", () => {
    expect(parseExerciseFilterParam(undefined)).toBeNull();
    expect(parseExerciseFilterParam("{not json")).toBeNull();
    expect(parseExerciseFilterParam(JSON.stringify({ picture: "has" }))).toBeNull();
    expect(parseExerciseFilterParam(JSON.stringify({ creators: [1, 2] }))).toBeNull();
  });
});

describe("mergeExerciseFilters", () => {
  it("adds the value on top of the saved filters without duplicates", () => {
    const saved = { ...EMPTY_EXERCISE_FILTERS, muscles: ["Chest"], equipment: ["Bar"], picture: "has" as const };
    const merged = mergeExerciseFilters(saved, { muscles: ["Glutes"], equipment: ["Bar"] });
    expect(merged.muscles).toEqual(["Chest", "Glutes"]);
    expect(merged.equipment).toEqual(["Bar"]);
    expect(merged.picture).toBe("has");
    expect(merged).not.toBe(saved);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/lib/__tests__/exerciseFilterLink.test.ts`
Expected: FAIL, "Cannot find module '../exerciseFilterLink'".

- [ ] **Step 3: Write the module**

```ts
// mobile/src/lib/exerciseFilterLink.ts
// A muscle chip, an equipment tile or a creator handle on the exercise page
// opens the Exercises tab with that ONE value applied on top of the reader's
// saved filters (spec §4.4). The value rides the route as JSON in the
// `exerciseFilter` param; the tab consumes and clears it like `shareUrl`.
import type { ExerciseFilters } from "../types/exerciseFilters";
import { MUSCLE_GROUPS } from "./dailyCoverage";
import { strings } from "./filterPrefsStore";

export const EXERCISE_FILTER_PARAM = "exerciseFilter";

/** The three axes a chip can name. */
export type ExerciseFilterLink = Partial<Pick<ExerciseFilters, "creators" | "muscles" | "equipment">>;

const KNOWN_MUSCLES = new Set(MUSCLE_GROUPS.flatMap((g) => g.muscles));

export function exerciseFilterParam(link: ExerciseFilterLink): string {
  return JSON.stringify(link);
}

/** Null means "open the tab with no extra filter" — junk, or a value the
 *  filter model cannot represent (spec §8). */
export function parseExerciseFilterParam(raw: unknown): ExerciseFilterLink | null {
  if (typeof raw !== "string" || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const r = parsed as Record<string, unknown>;
  const link: ExerciseFilterLink = {};
  const creators = strings(r.creators);
  const muscles = strings(r.muscles).filter((m) => KNOWN_MUSCLES.has(m));
  const equipment = strings(r.equipment);
  if (creators.length > 0) link.creators = creators;
  if (muscles.length > 0) link.muscles = muscles;
  if (equipment.length > 0) link.equipment = equipment;
  return Object.keys(link).length > 0 ? link : null;
}

const union = (a: string[], b: string[] | undefined): string[] =>
  b ? [...a, ...b.filter((v) => !a.includes(v))] : [...a];

/** Saved filters with the link's values added. Fresh arrays: the result lands in React state. */
export function mergeExerciseFilters(base: ExerciseFilters, link: ExerciseFilterLink): ExerciseFilters {
  return {
    ...base,
    creators: union(base.creators, link.creators),
    muscles: union(base.muscles, link.muscles),
    equipment: union(base.equipment, link.equipment),
  };
}
```

- [ ] **Step 4: Run the test, commit**

Run: `npx jest src/lib/__tests__/exerciseFilterLink.test.ts` → PASS, 4 tests.
```bash
git add src/lib/exerciseFilterLink.ts src/lib/__tests__/exerciseFilterLink.test.ts
git commit -m "feat(exercise-page): exerciseFilter route param — build, parse, merge over saved filters

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: `historyViewStore.ts` — the Trend | Sessions preference (TDD)

**Files:**
- Create: `mobile/src/lib/__tests__/historyViewStore.test.ts`
- Create: `mobile/src/lib/historyViewStore.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/historyViewStore.test.ts
const mockMemory = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockMemory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockMemory.set(k, v); }),
  },
}));

import { historyViewKey, loadHistoryView, saveHistoryView, sanitizeHistoryView } from "../historyViewStore";

beforeEach(() => mockMemory.clear());

describe("historyViewStore", () => {
  it("keys per user under the spec's prefix (spec §7)", () => {
    expect(historyViewKey("u1")).toBe("training.exercise.historyView.v1:u1");
  });
  it("defaults to Trend and round-trips Sessions", async () => {
    expect(await loadHistoryView("u1")).toEqual({ view: "trend" });
    await saveHistoryView("u1", { view: "sessions" });
    expect(await loadHistoryView("u1")).toEqual({ view: "sessions" });
    expect(await loadHistoryView("u2")).toEqual({ view: "trend" });
  });
  it("sanitizes junk to Trend", () => {
    expect(sanitizeHistoryView({ view: "pie" })).toEqual({ view: "trend" });
    expect(sanitizeHistoryView(null)).toEqual({ view: "trend" });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/lib/__tests__/historyViewStore.test.ts`
Expected: FAIL, "Cannot find module '../historyViewStore'".

- [ ] **Step 3: Write the store**

```ts
// mobile/src/lib/historyViewStore.ts
// Which view of "Your history" the reader last chose, per user. Spec §7:
// key `training.exercise.historyView.v1:${userId}`, default Trend.
import { createPrefsStore, oneOf } from "./filterPrefsStore";

export type HistoryView = "trend" | "sessions";
export const ALL_HISTORY_VIEWS: HistoryView[] = ["trend", "sessions"];

export interface HistoryViewPrefs {
  view: HistoryView;
}

export function sanitizeHistoryView(raw: unknown): HistoryViewPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { view: oneOf(r.view, ALL_HISTORY_VIEWS) ?? "trend" };
}

const store = createPrefsStore<HistoryViewPrefs>({
  keyPrefix: "training.exercise.historyView.v1",
  defaults: { view: "trend" },
  sanitize: sanitizeHistoryView,
});

export const historyViewKey = store.key;
export const loadHistoryView = store.load;
export const saveHistoryView = store.save;
```

- [ ] **Step 4: Run the test, commit**

Run: `npx jest src/lib/__tests__/historyViewStore.test.ts` → PASS, 3 tests.
```bash
git add src/lib/historyViewStore.ts src/lib/__tests__/historyViewStore.test.ts
git commit -m "feat(exercise-page): Trend | Sessions choice is a per-user preference

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: `HistoryBlock.tsx`

**Files:**
- Create: `mobile/src/components/training/item-detail/HistoryBlock.tsx`

- [ ] **Step 1: Write the component**

```tsx
// mobile/src/components/training/item-detail/HistoryBlock.tsx
// "Your history" (mock frame 2): a segmented Trend | Sessions toggle in the
// header, one card, the skill note as the card's footer, and "See all N
// sessions" under it. Every number comes from lib/exerciseHistory; this file
// only draws. Hidden by the page when there are no working sets.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import {
  bestSet, formatSet, formatShortDate, lastDonePhrase, sessionCount, sessionRows,
  trendBars, trendDirection, TREND_LABELS,
} from "@/src/lib/exerciseHistory";
import type { WorkingSet } from "@/src/lib/exerciseHistory";
import { loadHistoryView, saveHistoryView } from "@/src/lib/historyViewStore";
import type { HistoryView } from "@/src/lib/historyViewStore";
import type { LatestRating } from "@/src/lib/supabase/rerateMovement";
import type { MovementRating } from "@/src/lib/dailySkill";

const RATING_WORDS: Record<MovementRating, string> = {
  too_easy: "too easy",
  right: "just right",
  too_hard: "too hard",
};

/** At most this many rows in the Sessions view (spec §4.2). */
const SESSION_ROWS = 4;
const BAR_MAX_HEIGHT = 56;

interface HistoryBlockProps {
  userId: string;
  sets: WorkingSet[];
  /** YYYY-MM-DD, sampled once by the page. */
  today: string;
  /** Null hides the footer: the reader never rated this exercise. */
  skillNote: LatestRating | null;
  onOpenSession: (sessionId: string) => void;
  onSeeAll: () => void;
  onRerate: () => void;
}

export function HistoryBlock({
  userId, sets, today, skillNote, onOpenSession, onSeeAll, onRerate,
}: HistoryBlockProps) {
  const [view, setView] = useState<HistoryView>("trend");
  useEffect(() => {
    let alive = true;
    loadHistoryView(userId).then((p) => { if (alive) setView(p.view); });
    return () => { alive = false; };
  }, [userId]);
  const pick = (v: HistoryView) => {
    setView(v);
    saveHistoryView(userId, { view: v });
  };

  const best = useMemo(() => bestSet(sets), [sets]);
  const count = useMemo(() => sessionCount(sets), [sets]);
  const bars = useMemo(() => trendBars(sets), [sets]);
  const direction = useMemo(() => trendDirection(sets), [sets]);
  const rows = useMemo(() => sessionRows(sets), [sets]);
  const lastDate = rows[0]?.sessionDate ?? null;

  if (sets.length === 0 || best === null || lastDate === null) return null;

  const DirectionIcon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Your history</Text>
        <View style={styles.seg} accessibilityRole="tablist">
          {(["trend", "sessions"] as HistoryView[]).map((v) => {
            const on = v === view;
            return (
              <TouchableOpacity key={v} style={[styles.segItem, on && styles.segItemOn]} onPress={() => pick(v)}
                accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{v === "trend" ? "Trend" : "Sessions"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        {view === "trend" ? (
          <>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Last done</Text>
                <Text style={styles.statValue} numberOfLines={1}>{lastDonePhrase(today, lastDate)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Best set</Text>
                <Text style={styles.statValue} numberOfLines={1}>{formatSet(best)}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Sessions</Text>
                <Text style={styles.statValue} numberOfLines={1}>{count}</Text>
              </View>
            </View>
            <View style={styles.bars} accessibilityLabel={`Top set over the last ${bars.length} sessions`}>
              {bars.map((b) => (
                <View key={b.sessionId} style={styles.barSlot}>
                  <View style={[
                    styles.bar,
                    { height: Math.max(4, Math.round(b.height * BAR_MAX_HEIGHT)) },
                    b.best && styles.barBest,
                  ]} />
                </View>
              ))}
            </View>
            <View style={styles.captionRow}>
              <Text style={styles.caption}>Top set, last {Math.min(bars.length, 8)} sessions</Text>
              {direction !== null && (
                <View style={styles.direction}>
                  <DirectionIcon size={13} color={direction === "down" ? colors.warning : colors.brand} />
                  <Text style={[styles.directionText, direction === "down" && styles.directionDown]}>
                    {TREND_LABELS[direction]}
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <View>
            {rows.slice(0, SESSION_ROWS).map((r, i) => (
              <TouchableOpacity key={r.sessionId} style={[styles.row, i > 0 && styles.rowBorder]}
                onPress={() => onOpenSession(r.sessionId)} accessibilityRole="button"
                accessibilityLabel={`${formatShortDate(r.sessionDate, today)}, ${r.sessionName}, ${formatSet(r.topSet)}${r.isPr ? ", personal record" : ""}`}>
                <Text style={styles.rowDate}>{formatShortDate(r.sessionDate, today)}</Text>
                <Text style={styles.rowName} numberOfLines={1}>· {r.sessionName}</Text>
                <Text style={styles.rowSet}>{formatSet(r.topSet)}</Text>
                {r.isPr && (
                  <View style={styles.pr}><Text style={styles.prText}>PR</Text></View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {skillNote && (
          <View style={styles.footer}>
            <Text style={styles.footerText} numberOfLines={2}>
              You rated this <Text style={styles.footerStrong}>{RATING_WORDS[skillNote.rating]}</Text> on {formatShortDate(skillNote.sessionDate, today)}
            </Text>
            <TouchableOpacity onPress={onRerate} accessibilityRole="button" accessibilityLabel="Re-rate this exercise"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.link}>Re-rate</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.seeAll} onPress={onSeeAll} accessibilityRole="button">
        <Text style={styles.link}>See all {count} {count === 1 ? "session" : "sessions"}</Text>
        <ChevronRight size={16} color={colors.brand} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text },
  seg: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: radii.control, padding: 2 },
  segItem: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radii.control - 2 },
  segItemOn: { backgroundColor: colors.brand },
  segText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  segTextOn: { color: colors.onBrand },
  card: { backgroundColor: colors.surface, borderRadius: radii.row, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  stats: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  stat: { flex: 1 },
  statLabel: { ...typography.caption, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11, marginBottom: 2 },
  statValue: { fontSize: 16, fontWeight: "700", color: colors.text },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, height: BAR_MAX_HEIGHT },
  barSlot: { flex: 1, justifyContent: "flex-end" },
  bar: { backgroundColor: tint(colors.brand, 0.35), borderRadius: 3 },
  barBest: { backgroundColor: colors.brand },
  captionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  caption: { ...typography.caption },
  direction: { flexDirection: "row", alignItems: "center", gap: 4 },
  directionText: { fontSize: 12, fontWeight: "600", color: colors.brand },
  directionDown: { color: colors.warning },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowDate: { fontSize: 14, fontWeight: "600", color: colors.text },
  rowName: { flex: 1, fontSize: 14, color: colors.textMuted },
  rowSet: { fontSize: 14, fontWeight: "600", color: colors.text },
  pr: { backgroundColor: tint(colors.success), borderRadius: radii.control, paddingHorizontal: 6, paddingVertical: 2 },
  prText: { fontSize: 10, fontWeight: "700", color: colors.success, letterSpacing: 0.5 },
  footer: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm,
    marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  footerText: { flex: 1, fontSize: 13, color: colors.textMuted },
  footerStrong: { fontWeight: "700", color: colors.text },
  link: { fontSize: 14, fontWeight: "600", color: colors.brand },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2, paddingTop: spacing.md, alignSelf: "flex-start" },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: nothing.

- [ ] **Step 3: Commit**

```bash
git add src/components/training/item-detail/HistoryBlock.tsx
git commit -m "feat(exercise-page): Your history block — Trend and Sessions views with the skill footer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: `ScaleItSection.tsx` and `DemoVideoCard.tsx`

**Files:**
- Create: `mobile/src/components/training/item-detail/ScaleItSection.tsx`
- Create: `mobile/src/components/training/item-detail/DemoVideoCard.tsx`

- [ ] **Step 1: Write Scale It**

```tsx
// mobile/src/components/training/item-detail/ScaleItSection.tsx
// Spec §4.6: Easier (regressions) and Harder (progressions) columns from
// movement_scaling_links, in display order. A single empty column is
// hidden and the other fills the width; both empty renders nothing.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";

export interface ScaleLink {
  id: string;
  name: string;
}

interface ScaleItSectionProps {
  easier: ScaleLink[];
  harder: ScaleLink[];
  onOpen: (exerciseId: string) => void;
}

function Column({ title, links, onOpen }: { title: string; links: ScaleLink[]; onOpen: (id: string) => void }) {
  return (
    <View style={styles.column}>
      <Text style={styles.columnTitle}>{title}</Text>
      {links.map((l) => (
        <TouchableOpacity key={l.id} style={styles.row} onPress={() => onOpen(l.id)} accessibilityRole="button"
          accessibilityLabel={`${title}: ${l.name}`}>
          <Text style={styles.rowText} numberOfLines={2}>{l.name}</Text>
          <ChevronRight size={16} color={colors.textFaint} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function ScaleItSection({ easier, harder, onOpen }: ScaleItSectionProps) {
  if (easier.length === 0 && harder.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Scale It</Text>
      <View style={styles.columns}>
        {easier.length > 0 && <Column title="Easier" links={easier} onOpen={onOpen} />}
        {harder.length > 0 && <Column title="Harder" links={harder} onOpen={onOpen} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text, marginBottom: spacing.md },
  columns: { flexDirection: "row", gap: spacing.md },
  column: { flex: 1, gap: spacing.sm },
  columnTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", color: colors.textMuted },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radii.control, borderWidth: 1, borderColor: colors.border,
  },
  rowText: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.text },
});
```

- [ ] **Step 2: Write the demo video card**

```tsx
// mobile/src/components/training/item-detail/DemoVideoCard.tsx
// Spec §4.7: a preview card (neutral tile, play glyph, source label) that
// opens the video, and under it "Find a demo ›" — a YouTube search for the
// exercise name that renders whether or not a video is set, so a poor
// default can always be replaced through the edit wizard (decision 8).
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { ChevronRight, Play } from "lucide-react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";
import { demoSearchUrl, videoSourceLabel } from "@/src/lib/demoVideo";

interface DemoVideoCardProps {
  videoUrl: string | null;
  exerciseName: string;
}

export function DemoVideoCard({ videoUrl, exerciseName }: DemoVideoCardProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Demo Video</Text>
      {videoUrl && (
        <TouchableOpacity style={styles.card} onPress={() => Linking.openURL(videoUrl)} activeOpacity={0.8}
          accessibilityRole="link" accessibilityLabel={`Watch the demo on ${videoSourceLabel(videoUrl)}`}>
          <View style={styles.play}>
            <Play size={22} color={colors.onBrand} fill={colors.onBrand} />
          </View>
          <View style={styles.sourceTag}>
            <Text style={styles.sourceText}>{videoSourceLabel(videoUrl)}</Text>
          </View>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.find} onPress={() => Linking.openURL(demoSearchUrl(exerciseName))}
        accessibilityRole="link" accessibilityLabel="Find a demo on YouTube">
        <Text style={styles.findText}>Find a demo</Text>
        <ChevronRight size={16} color={colors.brand} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text, marginBottom: spacing.md },
  card: {
    height: 160, borderRadius: radii.row, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  play: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", paddingLeft: 3 },
  sourceTag: {
    position: "absolute", left: spacing.md, bottom: spacing.md,
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.control, backgroundColor: colors.surface,
  },
  sourceText: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.5 },
  find: { flexDirection: "row", alignItems: "center", gap: 2, paddingTop: spacing.md, alignSelf: "flex-start" },
  findText: { fontSize: 14, fontWeight: "600", color: colors.brand },
});
```

- [ ] **Step 3: Typecheck, commit**

Run: `npx tsc --noEmit -p .` → nothing.
```bash
git add src/components/training/item-detail/ScaleItSection.tsx src/components/training/item-detail/DemoVideoCard.tsx
git commit -m "feat(exercise-page): Scale It columns and the demo video preview card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Captured From — the strip, the full screen and its route

**Files:**
- Create: `mobile/src/components/training/item-detail/CapturedFromStrip.tsx`
- Create: `mobile/src/components/training/item-detail/CapturedFromScreen.tsx`
- Create: `mobile/app/(tabs)/training/exercise-sources/[id].tsx`
- Modify: `mobile/app/(tabs)/training/_layout.tsx`

- [ ] **Step 1: Write the strip**

```tsx
// mobile/src/components/training/item-detail/CapturedFromStrip.tsx
// Spec §4.8 on the page (Option B): "Captured From" with the tappable
// "N posts · M creators" counts, then a horizontal strip of post cards —
// thumbnail with the avatar badged bottom-left, handle, workout name in
// green (or "Exercise demo"), capture date. The strip fades at the right
// edge to say there is more.
import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ExternalLink } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import { CreatorAvatar } from "@/src/components/ui/CreatorAvatar";
import { creatorProfileUrl, postCards, sourceCounts } from "@/src/lib/capturedFromModel";
import type { PostCard } from "@/src/lib/capturedFromModel";
import type { CaptureSourceV2 } from "@/src/types/capture";

export type CapturedFromTab = "posts" | "creators";

interface CapturedFromStripProps {
  sources: CaptureSourceV2[];
  today: string;
  onOpenCounts: (tab: CapturedFromTab) => void;
  onOpenWorkout: (workoutId: string) => void;
  /** The raw handle; the page turns it into an Exercises-tab filter (§4.4). */
  onOpenCreator: (handle: string) => void;
}

const CARD_WIDTH = 150;
const THUMB_HEIGHT = 110;

/** One post card. Shared with the full screen's rows via PostThumb. */
export function PostThumb({ card, height }: { card: PostCard; height: number }) {
  return (
    <TouchableOpacity style={[styles.thumbWrap, { height }]} onPress={() => Linking.openURL(card.sourceUrl)}
      activeOpacity={0.8} accessibilityRole="link" accessibilityLabel={`Open the ${card.platform} post by ${card.handle}`}>
      {card.thumbnailUrl ? (
        <Image source={{ uri: card.thumbnailUrl }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <View style={styles.avatarBadge}>
        <CreatorAvatar handle={card.handle} url={card.avatarUrl} size={24} />
      </View>
    </TouchableOpacity>
  );
}

export function CapturedFromStrip({
  sources, today, onOpenCounts, onOpenWorkout, onOpenCreator,
}: CapturedFromStripProps) {
  const cards = useMemo(() => postCards(sources, today), [sources, today]);
  const counts = useMemo(() => sourceCounts(sources), [sources]);
  if (cards.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Captured From</Text>
        <View style={styles.counts}>
          <TouchableOpacity onPress={() => onOpenCounts("posts")} accessibilityRole="button"
            accessibilityLabel={`See all ${counts.posts} posts`} hitSlop={{ top: 8, bottom: 8 }}>
            <Text style={styles.countText}>{counts.posts} {counts.posts === 1 ? "post" : "posts"}</Text>
          </TouchableOpacity>
          <Text style={styles.countDot}> · </Text>
          <TouchableOpacity onPress={() => onOpenCounts("creators")} accessibilityRole="button"
            accessibilityLabel={`See all ${counts.creators} creators`} hitSlop={{ top: 8, bottom: 8 }}>
            <Text style={styles.countText}>{counts.creators} {counts.creators === 1 ? "creator" : "creators"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {cards.map((card) => (
            <View key={card.sourceId} style={styles.card}>
              <PostThumb card={card} height={THUMB_HEIGHT} />
              {card.handleIsPlaceholder ? (
                <Text style={styles.handle} numberOfLines={1}>{card.handle}</Text>
              ) : (
                <View style={styles.handleRow}>
                  <TouchableOpacity style={styles.handleTap} onPress={() => onOpenCreator(card.posterHandle!)}
                    accessibilityRole="button" accessibilityLabel={`Exercises by ${card.handle}`}>
                    <Text style={styles.handle} numberOfLines={1}>{card.handle}</Text>
                  </TouchableOpacity>
                  {/* Decision 6: the profile lives behind a small icon, the handle behind the filter. */}
                  {creatorProfileUrl(card.platform, card.posterHandle!) && (
                    <TouchableOpacity onPress={() => Linking.openURL(creatorProfileUrl(card.platform, card.posterHandle!)!)}
                      accessibilityRole="link" accessibilityLabel={`Open ${card.handle} on ${card.platform}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <ExternalLink size={12} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {card.workout ? (
                <TouchableOpacity onPress={() => onOpenWorkout(card.workout!.id)} accessibilityRole="button"
                  accessibilityLabel={`Open the workout ${card.workoutLabel}`}>
                  <Text style={styles.workout} numberOfLines={1}>{card.workoutLabel}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.demo} numberOfLines={1}>{card.workoutLabel}</Text>
              )}
              <Text style={styles.date} numberOfLines={1}>{card.dateLabel}</Text>
            </View>
          ))}
        </ScrollView>
        {/* The fade is decoration over the strip's right edge; it must not eat taps. */}
        <LinearGradient pointerEvents="none" colors={[tint(colors.bg, 0), colors.bg]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fade} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text },
  counts: { flexDirection: "row", alignItems: "center" },
  countText: { fontSize: 13, fontWeight: "600", color: colors.brand },
  countDot: { fontSize: 13, color: colors.textFaint },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingRight: spacing.xxxl },
  card: { width: CARD_WIDTH, gap: 3 },
  thumbWrap: { width: "100%", borderRadius: radii.row, overflow: "hidden", marginBottom: spacing.xs },
  thumb: { width: "100%", height: "100%" },
  thumbEmpty: { backgroundColor: colors.surface2 },
  avatarBadge: { position: "absolute", left: spacing.sm, bottom: spacing.sm, borderRadius: 14, borderWidth: 2, borderColor: colors.bg },
  handleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  handleTap: { flexShrink: 1 },
  handle: { fontSize: 13, fontWeight: "600", color: colors.text },
  workout: { fontSize: 13, fontWeight: "600", color: colors.brand },
  demo: { fontSize: 13, color: colors.textMuted },
  date: { fontSize: 12, color: colors.textFaint },
  fade: { position: "absolute", right: 0, top: 0, bottom: 0, width: 40 },
});
```

- [ ] **Step 2: Write the full screen**

```tsx
// mobile/src/components/training/item-detail/CapturedFromScreen.tsx
// Spec §4.8 full screen (mock frame 3): "Captured From" with a Posts |
// Creators toggle. Posts is the flat list newest first; Creators is the
// grouped layout (Option A). The tap targets are the strip's: thumbnail →
// the post, workout name → the captured workout, handle → the Exercises tab
// filtered to that creator, and the external-link icon → their profile.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, ExternalLink } from "lucide-react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { fetchExerciseSources } from "@/src/lib/supabase/capture";
import { getLocalDateString } from "@/src/lib/dates";
import { creatorGroups, creatorProfileUrl, postCards } from "@/src/lib/capturedFromModel";
import type { PostCard } from "@/src/lib/capturedFromModel";
import { exerciseFilterParam } from "@/src/lib/exerciseFilterLink";
import { CreatorAvatar } from "@/src/components/ui/CreatorAvatar";
import type { CaptureSourceV2 } from "@/src/types/capture";
import { PostThumb } from "./CapturedFromStrip";
import type { CapturedFromTab } from "./CapturedFromStrip";

interface CapturedFromScreenProps {
  exerciseId: string;
  initialTab: CapturedFromTab;
  onClose: () => void;
}

export function CapturedFromScreen({ exerciseId, initialTab, onClose }: CapturedFromScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [today] = useState(() => getLocalDateString());
  const [tab, setTab] = useState<CapturedFromTab>(initialTab);
  const [sources, setSources] = useState<CaptureSourceV2[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const rows = await fetchExerciseSources(exerciseId, user.id);
        if (alive) setSources(rows);
      } catch (e) {
        console.error("CapturedFromScreen load failed:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [exerciseId]);

  const cards = useMemo(() => postCards(sources, today), [sources, today]);
  const groups = useMemo(() => creatorGroups(sources, today), [sources, today]);

  const openWorkout = useCallback((id: string) =>
    router.push(`/(tabs)/training/captured-workout/${id}` as never), [router]);
  const openCreator = useCallback((handle: string) =>
    router.navigate({
      pathname: "/(tabs)/training",
      params: { exerciseFilter: exerciseFilterParam({ creators: [handle] }) },
    } as never), [router]);

  const handleLine = (card: { platform: PostCard["platform"]; handle: string; posterHandle: string | null; handleIsPlaceholder?: boolean }) => {
    const profile = card.posterHandle ? creatorProfileUrl(card.platform, card.posterHandle) : null;
    return (
      <View style={styles.handleRow}>
        {card.posterHandle ? (
          <TouchableOpacity onPress={() => openCreator(card.posterHandle!)} accessibilityRole="button"
            accessibilityLabel={`Exercises by ${card.handle}`}>
            <Text style={styles.handle}>{card.handle}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.handle}>{card.handle}</Text>
        )}
        {profile && (
          <TouchableOpacity onPress={() => Linking.openURL(profile)} accessibilityRole="link"
            accessibilityLabel={`Open ${card.handle} on ${card.platform}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ExternalLink size={13} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const postRow = (card: PostCard, withHandle: boolean) => (
    <View key={card.sourceId} style={styles.postRow}>
      <View style={styles.postThumb}>
        <PostThumb card={card} height={64} />
      </View>
      <View style={styles.postText}>
        {card.workout ? (
          <TouchableOpacity onPress={() => openWorkout(card.workout!.id)} accessibilityRole="button"
            accessibilityLabel={`Open the workout ${card.workoutLabel}`}>
            <Text style={styles.workout} numberOfLines={1}>{card.workoutLabel}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.demo} numberOfLines={1}>{card.workoutLabel}</Text>
        )}
        <Text style={styles.subline} numberOfLines={1}>{card.subline}</Text>
        {withHandle && (
          <View style={styles.postHandle}>
            <CreatorAvatar handle={card.handle} url={card.avatarUrl} size={18} />
            {handleLine(card)}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.back} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back">
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Captured From</Text>
        </View>

        <View style={styles.seg} accessibilityRole="tablist">
          {(["posts", "creators"] as CapturedFromTab[]).map((t) => {
            const on = t === tab;
            return (
              <TouchableOpacity key={t} style={[styles.segItem, on && styles.segItemOn]} onPress={() => setTab(t)}
                accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{t === "posts" ? "Posts" : "Creators"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
        ) : (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
            {tab === "posts"
              ? cards.map((c) => postRow(c, true))
              : groups.map((g) => (
                  <View key={g.key} style={styles.group}>
                    <View style={styles.groupHeader}>
                      <CreatorAvatar handle={g.handle} url={g.avatarUrl} size={32} />
                      <View style={styles.groupText}>
                        {handleLine(g)}
                        <Text style={styles.subline}>{g.countLabel}</Text>
                      </View>
                    </View>
                    {g.posts.map((c) => postRow(c, false))}
                  </View>
                ))}
            {cards.length === 0 && <Text style={styles.empty}>Nothing captured for this exercise.</Text>}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  back: { minWidth: 40, height: 40, alignItems: "flex-start", justifyContent: "center", paddingHorizontal: spacing.sm },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  seg: {
    flexDirection: "row", marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: colors.surface2, borderRadius: radii.control, padding: 3,
  },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: radii.control - 2 },
  segItemOn: { backgroundColor: colors.brand },
  segText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  segTextOn: { color: colors.onBrand },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: spacing.lg },
  postRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  postThumb: { width: 64 },
  postText: { flex: 1, justifyContent: "center", gap: 2 },
  workout: { fontSize: 15, fontWeight: "600", color: colors.brand },
  demo: { fontSize: 15, fontWeight: "600", color: colors.text },
  subline: { fontSize: 12, color: colors.textMuted },
  postHandle: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2 },
  handleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  handle: { fontSize: 13, fontWeight: "600", color: colors.text },
  group: { marginTop: spacing.lg },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xs },
  groupText: { flex: 1 },
  empty: { paddingVertical: spacing.xxxl, textAlign: "center", color: colors.textMuted, fontSize: 14 },
});
```

- [ ] **Step 3: Write the route**

```tsx
// mobile/app/(tabs)/training/exercise-sources/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { CapturedFromScreen } from "@/src/components/training/item-detail/CapturedFromScreen";

export default function ExerciseSourcesPage() {
  const router = useRouter();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  return (
    <CapturedFromScreen
      exerciseId={id}
      initialTab={tab === "creators" ? "creators" : "posts"}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/training" as never))}
    />
  );
}
```

- [ ] **Step 4: Register the route**

In `mobile/app/(tabs)/training/_layout.tsx`, after `<Stack.Screen name="exercise/[id]" />` add:
```tsx
      <Stack.Screen name="exercise-sources/[id]" />
```

- [ ] **Step 5: Typecheck, commit**

Run: `npx tsc --noEmit -p .` → nothing.
```bash
git add src/components/training/item-detail/CapturedFromStrip.tsx src/components/training/item-detail/CapturedFromScreen.tsx "app/(tabs)/training/exercise-sources/[id].tsx" "app/(tabs)/training/_layout.tsx"
git commit -m "feat(exercise-page): Captured From strip on the page and the Posts | Creators screen behind it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: `AddToTodayButton.tsx`

**Files:**
- Create: `mobile/src/components/training/item-detail/AddToTodayButton.tsx`

- [ ] **Step 1: Write the button**

```tsx
// mobile/src/components/training/item-detail/AddToTodayButton.tsx
// Spec §4.9: the last thing in the scroll. Reads today's state to pick its
// label, re-reads on the tap (spec §7), confirms un-rest in a bottom sheet,
// shows failure inline under the button and leaves today untouched (spec
// §8). On success it hands a toast to the Today tab and tells the page to
// navigate there.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { handOffToast } from "@/src/components/ui/pendingToast";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { getLocalDateString } from "@/src/lib/dates";
import {
  planAddToToday, ADD_TO_TODAY_CAPTION, ADD_TO_TODAY_LABEL, ADDED_TOAST_TITLE,
} from "@/src/lib/addToTodayPlan";
import type { AddToTodayPlan } from "@/src/lib/addToTodayPlan";
import { executeAddToToday, readTodayState } from "@/src/lib/supabase/addToToday";

interface AddToTodayButtonProps {
  userId: string;
  exerciseId: string;
  exerciseName: string;
  /** Fired after a successful write; the page navigates to Today. */
  onAdded: () => void;
}

export function AddToTodayButton({ userId, exerciseId, exerciseName, onAdded }: AddToTodayButtonProps) {
  const [plan, setPlan] = useState<AddToTodayPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const readPlan = useCallback(async (): Promise<AddToTodayPlan> => {
    const state = await readTodayState(userId, exerciseId, getLocalDateString());
    const next = planAddToToday(state);
    setPlan(next);
    return next;
  }, [userId, exerciseId]);

  useEffect(() => {
    let alive = true;
    readPlan().catch((e) => {
      console.error("AddToTodayButton read failed:", e);
      // Fail open to the plain label: the tap re-reads before writing.
      if (alive) setPlan({ action: "create", label: ADD_TO_TODAY_LABEL });
    });
    return () => { alive = false; };
  }, [readPlan]);

  const run = async (chosen: AddToTodayPlan) => {
    setBusy(true);
    setError(null);
    const result = await executeAddToToday({
      userId, exerciseId, date: getLocalDateString(), plan: chosen,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    handOffToast({ title: ADDED_TOAST_TITLE, detail: `${exerciseName} is in today's main block.` });
    onAdded();
  };

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    let fresh: AddToTodayPlan;
    try {
      fresh = await readPlan(); // spec §7: re-read immediately before writing
    } catch (e) {
      console.error("AddToTodayButton re-read failed:", e);
      setBusy(false);
      setError("Couldn't read today. Check your connection and try again.");
      return;
    }
    if (fresh.action === "disabled") { setBusy(false); return; }
    if (fresh.action === "confirmUnrest") {
      setBusy(false);
      setConfirmVisible(true);
      return;
    }
    await run(fresh);
  };

  const disabled = plan === null || plan.action === "disabled" || busy;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={plan?.label ?? ADD_TO_TODAY_LABEL}
        accessibilityState={{ disabled, busy }}
      >
        {busy
          ? <ActivityIndicator size="small" color={colors.onBrand} />
          : <Text style={styles.buttonText}>{plan?.label ?? ADD_TO_TODAY_LABEL}</Text>}
      </TouchableOpacity>
      <Text style={styles.caption}>{ADD_TO_TODAY_CAPTION}</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <BottomSheet visible={confirmVisible} onClose={() => setConfirmVisible(false)} closeLabel="Cancel adding to today">
        <Text style={styles.sheetTitle}>Today is a rest day. Un-rest and add this?</Text>
        <Text style={styles.sheetBody}>
          The rest day is cleared and a session with {exerciseName} is set up for today.
        </Text>
        <View style={styles.sheetActions}>
          <TouchableOpacity style={styles.sheetCancel} onPress={() => setConfirmVisible(false)} accessibilityRole="button">
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetAdd} accessibilityRole="button"
            onPress={() => {
              setConfirmVisible(false);
              run({ action: "confirmUnrest", label: ADD_TO_TODAY_LABEL });
            }}>
            <Text style={styles.sheetAddText}>Add</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  button: {
    height: 52, borderRadius: radii.control, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.onBrand, ...typography.button },
  caption: { ...typography.caption, textAlign: "center", marginTop: spacing.sm },
  error: { fontSize: 13, color: colors.danger, textAlign: "center", marginTop: spacing.sm },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  sheetBody: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.lg },
  sheetActions: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  sheetCancel: {
    flex: 1, height: 48, borderRadius: radii.control, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  sheetCancelText: { color: colors.text, ...typography.button },
  sheetAdd: { flex: 1, height: 48, borderRadius: radii.control, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  sheetAddText: { color: colors.onBrand, ...typography.button },
});
```

- [ ] **Step 2: Typecheck, commit**

Run: `npx tsc --noEmit -p .` → nothing.
```bash
git add src/components/training/item-detail/AddToTodayButton.tsx
git commit -m "feat(exercise-page): Add to today button with the rest-day confirmation sheet

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Recompose `TrainingItemDetailScreen.tsx`

**Files:**
- Modify: `mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx` (whole file replaced)

What survives from the current file byte-for-byte in behaviour: the header (back + menu), the hero with its CORE/TIER badge and Generate Image, the admin check, the image prompt, the edit wizard modal, the hierarchy's look. What changes: the palette moves to tokens, the select gains scoring types, the sections render in the spec's order through the Task 12–15 components, chips and tiles become buttons, the hierarchy collapses, and the page carries a toast for a failed re-rate.

- [ ] **Step 1: Replace the whole file**

```tsx
// mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx
// The detail page behind both Training tabs (Exercises and Movements are two
// doors onto one `exercises` table; the noun, the hierarchy route and the
// photo prompt's discipline are the props, everything else is shared).
//
// v2 (spec 2026-09-11): hero → meta row (Category, Goal, Skill, Scored by) →
// Your history → Description → Also Known As → muscles → equipment →
// hierarchy → Scale It → Demo Video → Captured From → Add to today. Every
// new block fails closed: a failed fetch hides that block and logs.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, Image, Alert, Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, ChevronRight, Sparkles, MoreVertical, Dumbbell, Weight, Circle, AlertCircle,
} from 'lucide-react-native';
import { colors, spacing, tint } from '@/src/theme/tokens';
import { equipmentNamesOf } from '@/src/lib/exerciseEquipment';
import { ExerciseWithVariations } from '@/src/types/crossfit';
import type { CaptureSourceV2 } from '@/src/types/capture';
import { supabase } from '@/src/lib/supabase';
import { fetchAncestors, fetchMovementProgressions, fetchMovementRegressions } from '@/src/lib/supabase/crossfit';
import { fetchExerciseSources } from '@/src/lib/supabase/capture';
import { fetchExerciseWorkingSets } from '@/src/lib/supabase/exerciseHistory';
import { fetchLatestRating, rerateMovement } from '@/src/lib/supabase/rerateMovement';
import type { LatestRating } from '@/src/lib/supabase/rerateMovement';
import type { WorkingSet } from '@/src/lib/exerciseHistory';
import { scoredByLabel, scoringRowsOf } from '@/src/lib/scoredBy';
import { collapseSiblings } from '@/src/lib/hierarchyCollapse';
import { exerciseFilterParam } from '@/src/lib/exerciseFilterLink';
import type { ExerciseFilterLink } from '@/src/lib/exerciseFilterLink';
import { getLocalDateString } from '@/src/lib/dates';
import { CatalogItemWizard } from '@/src/components/training/crossfit/CatalogItemWizard';
import { MovementRatingSheet } from '@/src/components/training/daily/MovementRatingSheet';
import { UndoToast } from '@/src/components/ui/UndoToast';
import type { UndoToastContent } from '@/src/components/ui/UndoToast';
import { HistoryBlock } from './HistoryBlock';
import { ScaleItSection } from './ScaleItSection';
import type { ScaleLink } from './ScaleItSection';
import { DemoVideoCard } from './DemoVideoCard';
import { CapturedFromStrip } from './CapturedFromStrip';
import type { CapturedFromTab } from './CapturedFromStrip';
import { AddToTodayButton } from './AddToTodayButton';

export interface TrainingItemDetailScreenProps {
  /** How this tab names the thing, lower case: "exercise" or "movement". */
  noun: string;
  /** Plural of the same, for copy like "movements you created". */
  nounPlural: string;
  /**
   * Route prefix for the hierarchy and Scale It links, so tapping a parent,
   * sibling or alternative keeps you in the tab you arrived through.
   */
  routeBase: string;
  /** Flavours the generated photo, e.g. "CrossFit". */
  discipline?: string;
}

/** "movement" -> "Movement", for sentence-leading copy. */
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The detail row plus the junction embeds this screen reads. */
interface DetailRow extends ExerciseWithVariations {
  alias_rows?: { alias: string; kind: string }[];
  goal_rows?: { goal_type: { id: string; name: string } | null }[];
  scoring_rows?: { scoring_type: unknown }[];
}

/** "Also known as" names, deduplicated case-insensitively, minus the display name. */
function aliasNamesOf(item: DetailRow): string[] {
  const displayName = item.name.trim().toLowerCase();
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of item.alias_rows ?? []) {
    const alias = row.alias.trim();
    const key = alias.toLowerCase();
    if (!alias || key === displayName || seen.has(key)) continue;
    seen.add(key);
    names.push(alias);
  }
  return names;
}

/** A glyph per equipment name; the nearest lucide shapes. */
const getEquipmentIcon = (equipmentName: string) => {
  const name = equipmentName.toLowerCase();
  if (name.includes('barbell') || name.includes('bar')) return Weight;
  if (name.includes('dumbbell') || name.includes('db')) return Dumbbell;
  if (name.includes('kettlebell') || name.includes('kb')) return Weight;
  return Circle;
};

const scaleLinksOf = (rows: { to_exercise?: { id: string; name: string } }[]): ScaleLink[] =>
  rows.flatMap((r) => (r.to_exercise ? [{ id: r.to_exercise.id, name: r.to_exercise.name }] : []));

export function TrainingItemDetailScreen({
  noun, nounPlural, routeBase, discipline,
}: TrainingItemDetailScreenProps) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [today] = useState(() => getLocalDateString()); // one clock sample
  const [userId, setUserId] = useState<string | null>(null);
  const [item, setItem] = useState<DetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tier, setTier] = useState<number>(0);
  const [editVisible, setEditVisible] = useState(false);
  const [hierarchyData, setHierarchyData] = useState<{
    ancestors: Array<{ id: string; name: string; is_core: boolean; tier: number }>;
    siblings: ExerciseWithVariations[];
  }>({ ancestors: [], siblings: [] });
  const [siblingsExpanded, setSiblingsExpanded] = useState(false);

  // v2 blocks. Each starts empty and fails closed.
  const [sources, setSources] = useState<CaptureSourceV2[]>([]);
  const [history, setHistory] = useState<WorkingSet[]>([]);
  const [skillNote, setSkillNote] = useState<LatestRating | null>(null);
  const [easier, setEasier] = useState<ScaleLink[]>([]);
  const [harder, setHarder] = useState<ScaleLink[]>([]);
  const [rateVisible, setRateVisible] = useState(false);
  const [toast, setToast] = useState<UndoToastContent | null>(null);

  useEffect(() => {
    setSiblingsExpanded(false);
    loadItem();
    loadUser();
    loadScaling();
  }, [id]);

  useEffect(() => {
    if (!userId || !id) return;
    loadSources(userId);
    loadHistory(userId);
    loadSkillNote(userId);
  }, [userId, id]);

  useEffect(() => {
    if (item && !item.is_core && item.parent_exercise_id) loadHierarchy();
  }, [item]);

  const loadUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      setIsAdmin(profile?.is_admin || false);
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const loadSources = async (uid: string) => {
    try {
      setSources(await fetchExerciseSources(id, uid));
    } catch (error) {
      console.error('Error loading capture sources:', error);
      setSources([]);
    }
  };

  const loadHistory = async (uid: string) => {
    try {
      setHistory(await fetchExerciseWorkingSets(uid, id));
    } catch (error) {
      console.error('Error loading exercise history:', error);
      setHistory([]);
    }
  };

  const loadSkillNote = async (uid: string) => {
    try {
      setSkillNote(await fetchLatestRating(uid, id));
    } catch (error) {
      console.error('Error loading skill note:', error);
      setSkillNote(null);
    }
  };

  const loadScaling = async () => {
    try {
      const [regressions, progressions] = await Promise.all([
        fetchMovementRegressions(id),
        fetchMovementProgressions(id),
      ]);
      setEasier(scaleLinksOf(regressions));
      setHarder(scaleLinksOf(progressions));
    } catch (error) {
      console.error('Error loading scaling links:', error);
      setEasier([]);
      setHarder([]);
    }
  };

  const loadItem = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('exercises')
        .select(`
          *,
          movement_category:movement_categories(id, name),
          goal_rows:exercise_goal_types(goal_type:goal_types(id, name)),
          muscle_regions:exercise_muscle_regions(
            is_primary,
            muscle_region:muscle_regions(id, name)
          ),
          equipment_rows:exercise_equipment(
            equipment:equipment(id, name)
          ),
          alias_rows:exercise_aliases(alias, kind),
          scoring_rows:exercise_scoring_types(scoring_type:scoring_types(name, display_order))
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      setItem(data as any);
      setTier(data.tier ?? 0);
    } catch (error) {
      console.error('Error loading item:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHierarchy = async () => {
    if (!item || !item.parent_exercise_id) return;
    try {
      const ancestors = await fetchAncestors(item.parent_exercise_id);
      const { data: siblingsData, error: siblingsError } = await supabase
        .from('exercises')
        .select('id, name, is_core, parent_exercise_id')
        .eq('parent_exercise_id', item.parent_exercise_id)
        .neq('id', id)
        .order('name');
      if (siblingsError) throw siblingsError;
      setHierarchyData({ ancestors, siblings: (siblingsData || []) as any[] });
    } catch (error) {
      console.error('Error loading hierarchy:', error);
    }
  };

  const handleMenuPress = () => {
    if (!item) return;
    Alert.alert(`${capitalize(noun)} Options`, 'Choose an action', [
      { text: `Edit ${capitalize(noun)}`, onPress: () => setEditVisible(true) },
      { text: 'Regenerate Image', onPress: handleGenerateImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleGenerateImage = async () => {
    if (!item) return;
    try {
      setGenerating(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'You must be logged in to generate an image');
        return;
      }
      const canGenerate = isAdmin || (!item.is_official && item.created_by === user.id);
      if (!canGenerate) {
        Alert.alert(
          'Permission Denied',
          item.is_official
            ? `Only administrators can generate images for official ${nounPlural}.`
            : `You can only generate images for ${nounPlural} you created.`,
        );
        return;
      }
      const promptEquipment = equipmentNamesOf(item);
      const equipmentList = promptEquipment.length > 0 ? promptEquipment.join(', ') : 'bodyweight';
      const promptAliases = aliasNamesOf(item);
      const aliasesContext = promptAliases.length > 0 ? ` Also known as: ${promptAliases.join(', ')}.` : '';
      const athlete = discipline ? `a ${discipline} athlete` : 'an athlete';
      const gym = discipline ? `a modern ${discipline} gym` : 'a modern gym';
      const prompt = `A high-quality, professional photo of ${athlete} performing ${item.name} in ${gym}. ${item.movement_category?.name || ''} ${noun}.${aliasesContext} Equipment: ${equipmentList}. Dramatic lighting, motivational atmosphere, athletic focus. Photorealistic, high detail.`;
      const { data, error } = await supabase.functions.invoke('generate-movement-image', {
        body: { movementId: item.id, prompt, userId: user.id },
      });
      if (error) throw error;
      if (data && !data.success) {
        Alert.alert('Error', data.error || data.message || 'Image generation failed');
        return;
      }
      Alert.alert('Success', 'AI image generated successfully!', [{ text: 'OK', onPress: () => loadItem() }]);
    } catch (error: any) {
      console.error('Error generating image:', error);
      Alert.alert('Error', error?.message || 'Failed to generate image. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // ---------- navigation ----------

  /** A chip, tile or handle: the Exercises tab with this value on top of the saved filters (§4.4). */
  const openFiltered = useCallback((link: ExerciseFilterLink) => {
    router.navigate({
      pathname: '/(tabs)/training',
      params: { exerciseFilter: exerciseFilterParam(link) },
    } as never);
  }, [router]);
  const openToday = useCallback(() => {
    router.navigate({ pathname: '/(tabs)/training', params: { openTab: 'today' } } as never);
  }, [router]);
  const openSession = useCallback((sessionId: string) => {
    router.push(`/(tabs)/track/gym-sessions/${sessionId}` as never);
  }, [router]);
  const openAllSessions = useCallback(() => {
    if (!item) return;
    router.push({
      pathname: '/(tabs)/track/gym-sessions',
      params: { exerciseId: id, exerciseName: item.name },
    } as never);
  }, [router, id, item]);
  const openWorkout = useCallback((workoutId: string) => {
    router.push(`/(tabs)/training/captured-workout/${workoutId}` as never);
  }, [router]);
  const openSourcesScreen = useCallback((tab: CapturedFromTab) => {
    router.push({ pathname: `/(tabs)/training/exercise-sources/${id}`, params: { tab } } as never);
  }, [router, id]);

  /** Re-rate: overwrite the latest row, replay the state; on failure keep the
   *  old note and toast (spec §8). The sheet closes either way. */
  const onRerateSave = async (ratings: { exerciseId: string; rating: LatestRating['rating'] }[]) => {
    const chosen = ratings.find((r) => r.exerciseId === id);
    if (!chosen || !skillNote || !userId) return;
    const ok = await rerateMovement({ userId, sessionId: skillNote.sessionId, exerciseId: id, rating: chosen.rating });
    if (ok) {
      setSkillNote({ ...skillNote, rating: chosen.rating });
    } else {
      setToast({ title: "Couldn't save the rating", detail: 'Your earlier rating stands. Try again in a moment.' });
    }
  };

  // ---------- derived ----------

  const equipmentChips = item
    ? equipmentNamesOf(item).filter((name) => name.toLowerCase() !== 'bodyweight')
    : [];
  const aliasNames = item ? aliasNamesOf(item) : [];
  const scoredBy = useMemo(() => (item ? scoredByLabel(scoringRowsOf(item.scoring_rows)) : ''), [item]);
  const siblingView = collapseSiblings(hierarchyData.siblings, siblingsExpanded);
  const initialRatings = useMemo(
    () => (skillNote ? { [id]: skillNote.rating } : undefined),
    [skillNote, id],
  );

  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.loadingText}>Loading item...</Text>
        </View>
      </>
    );
  }

  if (!item) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <Text style={styles.errorText}>{capitalize(noun)} not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const badge = item.is_core === true ? (
    <View style={styles.heroCoreBadge}><Text style={styles.heroBadgeText}>CORE</Text></View>
  ) : tier > 0 ? (
    <View style={styles.heroTierBadge}><Text style={styles.heroBadgeText}>TIER {tier}</Text></View>
  ) : null;

  const hierarchyRow = (
    key: string, name: string, badgeNode: React.ReactNode, onPress: (() => void) | null, current: boolean, first: boolean,
  ) => (
    <View key={key} style={!first ? styles.hierarchyWrapper : undefined}>
      {!first && <View style={styles.hierarchyConnectorLine} />}
      <TouchableOpacity
        style={[first ? styles.hierarchyParent : styles.hierarchyItem, current && styles.hierarchyCurrentItem]}
        onPress={onPress ?? undefined}
        disabled={onPress === null}
        activeOpacity={0.7}
      >
        <View style={styles.hierarchyConnector}>
          <View style={[styles.connectorDot, current && styles.connectorDotCurrent]} />
        </View>
        <View style={styles.hierarchyItemContent}>
          {badgeNode}
          <Text style={[styles.hierarchyItemName, current && styles.hierarchyCurrentText]} numberOfLines={1} ellipsizeMode="tail">
            {name}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
  const tierBadge = (t: number) => (
    <View style={styles.tierHierarchyBadge}><Text style={styles.tierHierarchyBadgeText}>TIER {t}</Text></View>
  );
  const coreBadge = (
    <View style={styles.coreHierarchyBadge}><Text style={styles.coreHierarchyBadgeText}>CORE</Text></View>
  );

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color={colors.text} />
            <Text style={styles.backText}>{capitalize(nounPlural)}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleMenuPress} style={styles.menuButton}>
            <MoreVertical size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* 1. Hero — unchanged from v1 */}
          {item.image_url ? (
            <View style={styles.heroSection}>
              <Image source={{ uri: item.image_url }} style={styles.heroImage} resizeMode="cover" />
              <LinearGradient colors={[tint(colors.shadow, 0.6), tint(colors.shadow, 0), tint(colors.shadow, 0.8)]} style={styles.heroGradient} />
              <View style={styles.heroOverlay}>
                <Text style={styles.heroExerciseName}>{item.name}</Text>
                {badge}
              </View>
            </View>
          ) : (
            <View style={styles.heroPlaceholder}>
              {badge && <View style={styles.heroBadgeTopRight}>{badge}</View>}
              <Text style={styles.heroExerciseNameNoImage}>{item.name}</Text>
              <View style={{ height: 20 }} />
              <TouchableOpacity style={styles.generateButton} onPress={handleGenerateImage} disabled={generating} activeOpacity={0.7}>
                {generating ? (
                  <>
                    <ActivityIndicator size="small" color={colors.onBrand} />
                    <Text style={styles.generateButtonText}>Generating...</Text>
                  </>
                ) : (
                  <>
                    <Sparkles size={20} color={colors.onBrand} />
                    <Text style={styles.generateButtonText}>Generate Image</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* 2. Meta row: Category, Goal, Skill, Scored by (§4.1) */}
          <View style={styles.metaSection}>
            {item.movement_category?.name && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Category</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{item.movement_category.name}</Text>
              </View>
            )}
            {(item.goal_rows?.length ?? 0) > 0 && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Goal</Text>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {item.goal_rows!.map((g) => g.goal_type?.name).filter(Boolean).join(', ')}
                </Text>
              </View>
            )}
            {item.skill_level && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Skill</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{item.skill_level}</Text>
              </View>
            )}
            {scoredBy !== '' && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Scored by</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{scoredBy}</Text>
              </View>
            )}
          </View>

          {/* 3. Your history (§4.2) — hidden with no working sets */}
          {userId && history.length > 0 && (
            <HistoryBlock
              userId={userId}
              sets={history}
              today={today}
              skillNote={skillNote}
              onOpenSession={openSession}
              onSeeAll={openAllSessions}
              onRerate={() => setRateVisible(true)}
            />
          )}

          {/* 4. Description */}
          {item.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.descriptionText}>{item.description}</Text>
            </View>
          )}

          {/* 5. Also Known As */}
          {aliasNames.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Also Known As</Text>
              <Text style={styles.descriptionText}>{aliasNames.join(', ')}</Text>
            </View>
          )}

          {/* 6. Muscles — every chip is a button into the Exercises tab (§4.4) */}
          {item.muscle_regions && item.muscle_regions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Primary Muscles</Text>
              <View style={styles.muscleContainer}>
                {item.muscle_regions.filter((mr: any) => mr.is_primary).map((mr: any, index: number) => (
                  <TouchableOpacity key={index} style={styles.musclePrimaryChip}
                    onPress={() => openFiltered({ muscles: [mr.muscle_region?.name] })}
                    accessibilityRole="button" accessibilityLabel={`Exercises for ${mr.muscle_region?.name}`}>
                    <Text style={styles.musclePrimaryText}>{mr.muscle_region?.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {item.muscle_regions.some((mr: any) => !mr.is_primary) && (
                <>
                  <Text style={styles.subsectionTitle}>Secondary Muscles</Text>
                  <View style={styles.muscleContainer}>
                    {item.muscle_regions.filter((mr: any) => !mr.is_primary).map((mr: any, index: number) => (
                      <TouchableOpacity key={index} style={styles.muscleSecondaryChip}
                        onPress={() => openFiltered({ muscles: [mr.muscle_region?.name] })}
                        accessibilityRole="button" accessibilityLabel={`Exercises for ${mr.muscle_region?.name}`}>
                        <Text style={styles.muscleSecondaryText}>{mr.muscle_region?.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

          {/* 7. Equipment — tiles are buttons too */}
          {equipmentChips.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Equipment</Text>
              <View style={styles.equipmentContainer}>
                {equipmentChips.map((equipment, index) => {
                  const EquipmentIcon = getEquipmentIcon(equipment);
                  return (
                    <TouchableOpacity key={index} style={styles.equipmentItem}
                      onPress={() => openFiltered({ equipment: [equipment] })}
                      accessibilityRole="button" accessibilityLabel={`Exercises using ${equipment}`}>
                      <View style={styles.equipmentIconContainer}>
                        <EquipmentIcon size={32} color={colors.brand} strokeWidth={1.5} />
                      </View>
                      <Text style={styles.equipmentLabel}>{equipment}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* 8. Hierarchy — ancestors and the current row always; siblings collapse past four (§4.5) */}
          {!item.is_core && hierarchyData.ancestors.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{capitalize(noun)} Hierarchy</Text>
              <View>
                {hierarchyData.ancestors.map((ancestor, index) =>
                  hierarchyRow(
                    ancestor.id, ancestor.name,
                    ancestor.is_core ? coreBadge : tierBadge(ancestor.tier),
                    () => router.push(`${routeBase}/${ancestor.id}` as never), false, index === 0,
                  ),
                )}
                {hierarchyRow('current', item.name, tierBadge(tier), null, true, false)}
                {siblingView.shown.map((sibling) =>
                  hierarchyRow(
                    sibling.id, sibling.name, tierBadge(tier),
                    () => router.push(`${routeBase}/${sibling.id}` as never), false, false,
                  ),
                )}
                {siblingView.hidden > 0 && (
                  <TouchableOpacity style={styles.seeAllRow} onPress={() => setSiblingsExpanded(true)}
                    accessibilityRole="button" accessibilityLabel={`See all ${hierarchyData.siblings.length} siblings`}>
                    <Text style={styles.seeAllText}>See all {hierarchyData.siblings.length}</Text>
                    <ChevronRight size={16} color={colors.brand} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* 9. Scale It (§4.6) */}
          <ScaleItSection easier={easier} harder={harder}
            onOpen={(exerciseId) => router.push(`${routeBase}/${exerciseId}` as never)} />

          {/* 10. Demo Video (§4.7) — the Find-a-demo link always renders */}
          <DemoVideoCard videoUrl={item.video_url ?? null} exerciseName={item.name} />

          {/* 11. Captured From (§4.8) */}
          <CapturedFromStrip
            sources={sources}
            today={today}
            onOpenCounts={openSourcesScreen}
            onOpenWorkout={openWorkout}
            onOpenCreator={(handle) => openFiltered({ creators: [handle] })}
          />

          {/* 12. Add to today (§4.9) — the last thing in the scroll */}
          {userId && (
            <AddToTodayButton userId={userId} exerciseId={id} exerciseName={item.name} onAdded={openToday} />
          )}
        </ScrollView>

        <UndoToast toast={toast} onDismissed={() => setToast(null)} icon={AlertCircle} bottom={insets.bottom + spacing.xl} />
      </View>

      {/* Re-rate: the existing sheet, one movement, page-owned save (decision 4) */}
      {skillNote && (
        <MovementRatingSheet
          visible={rateVisible}
          sessionId={skillNote.sessionId}
          movements={[{ exerciseId: id, name: item.name }]}
          initialRatings={initialRatings}
          onSave={onRerateSave}
          onClose={() => setRateVisible(false)}
          onSaved={() => setRateVisible(false)}
        />
      )}

      {/* Edit — the one catalog wizard, pre-filled from this row */}
      <Modal visible={editVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setEditVisible(false)}>
        {editVisible && (
          <CatalogItemWizard
            isMovement={!!item.is_movement}
            editId={item.id}
            onClose={() => setEditVisible(false)}
            onSave={() => { setEditVisible(false); loadItem(); }}
          />
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centerContent: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: colors.textMuted },
  errorText: { fontSize: 18, color: colors.text, marginBottom: 16 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 17, color: colors.text },
  menuButton: { padding: 4 },
  backButtonText: { fontSize: 16, color: colors.brand, fontWeight: '600' },
  content: { flex: 1 },
  heroSection: { position: 'relative', width: '100%', height: 220, backgroundColor: colors.surface, overflow: 'hidden' },
  heroImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: 300 },
  heroGradient: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  heroPlaceholder: {
    height: 220, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.border, position: 'relative',
  },
  heroBadgeTopRight: { position: 'absolute', top: 16, right: 16 },
  generateButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: colors.brand, borderRadius: 8,
  },
  generateButtonText: { fontSize: 16, fontWeight: '600', color: colors.onBrand },
  heroOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 16 },
  heroExerciseName: {
    fontSize: 34, fontWeight: 'bold', color: colors.text, marginBottom: 8,
    textShadowColor: tint(colors.shadow, 0.75), textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  heroExerciseNameNoImage: { fontSize: 28, fontWeight: 'bold', color: colors.text, marginBottom: 8, textAlign: 'center' },
  heroCoreBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.success, borderRadius: 6 },
  heroTierBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.accents.water, borderRadius: 6 },
  heroBadgeText: { fontSize: 11, fontWeight: '600', color: colors.onBrand, letterSpacing: 0.5 },
  metaSection: {
    flexDirection: 'row', padding: 16, gap: 12, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 15, fontWeight: '600', color: colors.text },
  section: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 12 },
  subsectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 16, marginBottom: 8 },
  descriptionText: { fontSize: 15, lineHeight: 22, color: colors.text },
  equipmentContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  equipmentItem: { alignItems: 'center', width: 80 },
  equipmentIconContainer: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: tint(colors.brand, 0.08),
    alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: tint(colors.brand, 0.19),
  },
  equipmentLabel: { fontSize: 12, fontWeight: '500', color: colors.text, textAlign: 'center' },
  muscleContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  musclePrimaryChip: {
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: tint(colors.brand, 0.125),
    borderRadius: 8, borderWidth: 1, borderColor: colors.brand,
  },
  musclePrimaryText: { fontSize: 14, fontWeight: '600', color: colors.brand },
  muscleSecondaryChip: {
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surface,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
  },
  muscleSecondaryText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  hierarchyParent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 0 },
  hierarchyWrapper: { position: 'relative' },
  hierarchyConnectorLine: { position: 'absolute', left: 23, top: 0, bottom: 0, width: 2, backgroundColor: colors.border },
  hierarchyItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 48 },
  hierarchyCurrentItem: {
    backgroundColor: tint(colors.brand, 0.1), borderLeftWidth: 3, borderLeftColor: colors.brand,
    marginVertical: 4, borderRadius: 8, paddingLeft: 45,
  },
  hierarchyConnector: { width: 0, alignItems: 'center', justifyContent: 'center' },
  connectorDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border,
    borderWidth: 2, borderColor: colors.bg, marginLeft: -48,
  },
  connectorDotCurrent: { backgroundColor: colors.brand, borderColor: colors.brand, width: 12, height: 12, borderRadius: 6 },
  hierarchyItemContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  hierarchyItemName: { flex: 1, fontSize: 16, fontWeight: '500', color: colors.text },
  hierarchyCurrentText: { fontWeight: '700', color: colors.brand },
  coreHierarchyBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
    backgroundColor: tint(colors.brand), borderWidth: 1, borderColor: tint(colors.brand, 0.3),
  },
  coreHierarchyBadgeText: { fontSize: 10, fontWeight: '700', color: colors.brand, letterSpacing: 0.5 },
  tierHierarchyBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
    backgroundColor: tint(colors.accents.water), borderWidth: 1, borderColor: tint(colors.accents.water, 0.3),
  },
  tierHierarchyBadgeText: { fontSize: 10, fontWeight: '700', color: colors.accents.water, letterSpacing: 0.5 },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 48, paddingVertical: 10 },
  seeAllText: { fontSize: 14, fontWeight: '600', color: colors.brand },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: nothing. If `router.navigate` is flagged, the installed expo-router is older than 3.4 — replace both `router.navigate(` calls with `router.push(` (the Training index screen is already in the stack; expo-router dedupes by pathname on push within a stack in v6, and the params are consumed either way).

- [ ] **Step 3: Run the full suite**

Run: `npx jest`
Expected: all suites PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/training/item-detail/TrainingItemDetailScreen.tsx
git commit -m "feat(exercise-page): recompose the page in the v2 order — history, scored by, tappable chips, collapsed siblings, Scale It, demo card, Captured From strip, Add to today

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Navigation wiring — `exerciseFilter` and `openTab` params, `CatalogTab` merge, Today toast

**Files:**
- Modify: `mobile/app/(tabs)/training/index.tsx`
- Modify: `mobile/src/components/training/daily/CatalogTab.tsx`
- Modify: `mobile/src/components/training/daily/TodayTab.tsx`

- [ ] **Step 1: The Training index consumes and clears the two new params**

In `mobile/app/(tabs)/training/index.tsx`, add under the existing import of `fetchCapturedWorkouts, fetchCatalog`:
```ts
import { parseExerciseFilterParam } from "@/src/lib/exerciseFilterLink";
import type { ExerciseFilterLink } from "@/src/lib/exerciseFilterLink";
```
Replace the block
```ts
  const router = useRouter();
  const { shareUrl } = useLocalSearchParams<{ shareUrl?: string }>();
  const [pendingShareUrl, setPendingShareUrl] = useState<string | null>(null);
  useEffect(() => {
    if (typeof shareUrl !== "string" || shareUrl === "") return;
    setPendingShareUrl(shareUrl);
    setWorkoutMode("daily");
    setDailyTab("workouts"); // the Daily tab that hosts the capture flow
    router.setParams({ shareUrl: undefined });
  }, [shareUrl, router]);
```
with
```ts
  const router = useRouter();
  const { shareUrl, exerciseFilter, openTab } = useLocalSearchParams<{
    shareUrl?: string; exerciseFilter?: string; openTab?: string;
  }>();
  const [pendingShareUrl, setPendingShareUrl] = useState<string | null>(null);
  useEffect(() => {
    if (typeof shareUrl !== "string" || shareUrl === "") return;
    setPendingShareUrl(shareUrl);
    setWorkoutMode("daily");
    setDailyTab("workouts"); // the Daily tab that hosts the capture flow
    router.setParams({ shareUrl: undefined });
  }, [shareUrl, router]);
  // A chip on the exercise page: open the Exercises tab with that value on
  // top of the saved filters (spec 2026-09-11 §4.4). Same consume-and-clear
  // discipline as shareUrl. A value the model cannot represent parses to
  // null and the tab opens with no extra filter (§8).
  const [pendingExerciseFilter, setPendingExerciseFilter] = useState<ExerciseFilterLink | null>(null);
  useEffect(() => {
    if (typeof exerciseFilter !== "string" || exerciseFilter === "") return;
    setPendingExerciseFilter(parseExerciseFilterParam(exerciseFilter));
    setWorkoutMode("daily");
    setDailyTab("exercises");
    router.setParams({ exerciseFilter: undefined });
  }, [exerciseFilter, router]);
  // "Add to today" lands here: show Today, and remount it so it reloads the
  // day it was just handed (the tab loads on mount, not on focus).
  const [todayKey, setTodayKey] = useState(0);
  useEffect(() => {
    if (openTab !== "today") return;
    setWorkoutMode("daily");
    setDailyTab("today");
    setTodayKey((k) => k + 1);
    router.setParams({ openTab: undefined });
  }, [openTab, router]);
```
Replace
```tsx
        case "today":
          return <TodayTab />;
```
with
```tsx
        case "today":
          return <TodayTab key={todayKey} />;
```
and replace
```tsx
        case "exercises":
          return <CatalogTab searchQuery={searchQuery} onCountUpdate={setCatalogCount} />;
```
with
```tsx
        case "exercises":
          return (
            <CatalogTab
              searchQuery={searchQuery}
              onCountUpdate={setCatalogCount}
              initialFilters={pendingExerciseFilter}
              onInitialFiltersConsumed={() => setPendingExerciseFilter(null)}
            />
          );
```

- [ ] **Step 2: `CatalogTab` merges the link over the loaded prefs and saves**

In `mobile/src/components/training/daily/CatalogTab.tsx`, add under the import of `loadExercisePrefs, saveExercisePrefs`:
```ts
import { mergeExerciseFilters } from "@/src/lib/exerciseFilterLink";
import type { ExerciseFilterLink } from "@/src/lib/exerciseFilterLink";
```
Replace
```ts
interface CatalogTabProps {
  searchQuery: string;
  onCountUpdate: (count: number) => void;
}

export default function CatalogTab({ searchQuery, onCountUpdate }: CatalogTabProps) {
```
with
```ts
interface CatalogTabProps {
  searchQuery: string;
  onCountUpdate: (count: number) => void;
  /** One value from an exercise-page chip, applied on top of the saved
   *  filters once they have loaded — never before, so the load is not
   *  clobbered (spec 2026-09-11 §4.4, §7). */
  initialFilters?: ExerciseFilterLink | null;
  onInitialFiltersConsumed?: () => void;
}

export default function CatalogTab({
  searchQuery, onCountUpdate, initialFilters = null, onInitialFiltersConsumed,
}: CatalogTabProps) {
```
Directly after the `applySort` callback (the block ending `}, [userId, filters]);`), add:
```ts
  // The chip's value lands through the same "applied change saves" path the
  // sheet uses, after prefs resolve. `latest` sidesteps a stale closure: the
  // effect keys on the link, not on the filters it merges into.
  const latest = useRef({ filters, sort });
  latest.current = { filters, sort };
  useEffect(() => {
    if (!prefsReady || !userId || !initialFilters) return;
    const next = mergeExerciseFilters(latest.current.filters, initialFilters);
    setFilters(next);
    saveExercisePrefs(userId, { filters: next, sort: latest.current.sort });
    onInitialFiltersConsumed?.();
  }, [prefsReady, userId, initialFilters, onInitialFiltersConsumed]);
```
Change the React import at the top to `import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";`.

- [ ] **Step 3: The Today tab shows a handed-off toast**

In `mobile/src/components/training/daily/TodayTab.tsx`, add under `import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";`:
```ts
import { UndoToast } from "@/src/components/ui/UndoToast";
import type { UndoToastContent } from "@/src/components/ui/UndoToast";
import { takeHandedOffToast } from "@/src/components/ui/pendingToast";
import { Check } from "lucide-react-native";
```
(If `lucide-react-native` is already imported in the file, add `Check` to that import instead of adding a second one.)

Directly after the line `const [refreshKey, setRefreshKey] = useState(0);` add:
```ts
  // "Added to today" from the exercise page: the leaving screen hands the
  // message here, and this tab shows it once on mount (the index remounts
  // the tab when it opens Today for that reason).
  const [handedToast, setHandedToast] = useState<UndoToastContent | null>(() => takeHandedOffToast());
```
Directly before the closing `</View>` of the root container — the line after the `<MovementRatingSheet ... />` element at the end of the return — add:
```tsx
      <UndoToast toast={handedToast} onDismissed={() => setHandedToast(null)} icon={Check} />
```

- [ ] **Step 4: Typecheck and the filter suites**

Run: `npx tsc --noEmit -p . && npx jest src/lib/__tests__/exerciseFilterLink.test.ts src/lib/__tests__/exerciseFilterStore.test.ts src/lib/__tests__/exerciseFilters.test.ts`
Expected: nothing from tsc; all PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/training/index.tsx" src/components/training/daily/CatalogTab.tsx src/components/training/daily/TodayTab.tsx
git commit -m "feat(exercise-page): chips open the Exercises tab filtered; Add to today lands on a reloaded Today with a toast

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: "See all N sessions" — the Track session list takes an exercise filter

**Files:**
- Modify: `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx`
- Modify: `mobile/app/(tabs)/track/gym-sessions/index.tsx`

- [ ] **Step 1: The route reads the params**

Replace the whole of `mobile/app/(tabs)/track/gym-sessions/index.tsx` with:
```tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { GymSessionsScreen } from "@/src/components/track/gym-sessions/GymSessionsScreen";

export default function GymSessionsPage() {
  const router = useRouter();
  // From the exercise page's "See all N sessions": scope the History list to
  // sessions holding a working set of this exercise (spec 2026-09-11 §4.2).
  const { exerciseId, exerciseName } = useLocalSearchParams<{ exerciseId?: string; exerciseName?: string }>();

  // Always land on Track index — router.back() would walk linear history if
  // entered from outside the Track tab.
  return (
    <GymSessionsScreen
      exerciseId={typeof exerciseId === "string" && exerciseId !== "" ? exerciseId : null}
      exerciseName={typeof exerciseName === "string" && exerciseName !== "" ? exerciseName : null}
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/(tabs)/track")
      }
    />
  );
}
```

- [ ] **Step 2: The screen filters its History list**

In `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx`, replace
```ts
export function GymSessionsScreen({ onClose }: { onClose: () => void }) {
```
with
```ts
interface GymSessionsScreenProps {
  onClose: () => void;
  /** Scope the History list to sessions with a working set of this exercise. */
  exerciseId?: string | null;
  exerciseName?: string | null;
}

export function GymSessionsScreen({ onClose, exerciseId = null, exerciseName = null }: GymSessionsScreenProps) {
```
Directly after the line `const [calView, setCalView] = useState<"month" | "week">("month");` add:
```ts
  // The scope is a chip the reader can drop; the hero, stats and calendar
  // keep describing every session — only the list narrows.
  const [scoped, setScoped] = useState(true);
  const listSessions = useMemo(
    () => (exerciseId && scoped
      ? sessions.filter((s) => s.exercises.some(
          (e) => e.exerciseId === exerciseId && e.sets.some((set) => !set.isWarmup),
        ))
      : sessions),
    [sessions, exerciseId, scoped],
  );
```
Replace
```tsx
              {view === "history" &&
                sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    today={today}
                    prCount={prCounts.get(session.id) ?? 0}
                    onPress={() => open(session)}
                  />
                ))}
```
with
```tsx
              {view === "history" && exerciseId && scoped && (
                <View style={styles.scopeRow}>
                  <Text style={styles.scopeText} numberOfLines={1}>
                    Sessions with {exerciseName ?? "this exercise"} · {listSessions.length}
                  </Text>
                  <TouchableOpacity onPress={() => setScoped(false)} accessibilityRole="button"
                    accessibilityLabel="Show all sessions" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.scopeClear}>Show all</Text>
                  </TouchableOpacity>
                </View>
              )}
              {view === "history" &&
                listSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    today={today}
                    prCount={prCounts.get(session.id) ?? 0}
                    onPress={() => open(session)}
                  />
                ))}
              {view === "history" && exerciseId && scoped && listSessions.length === 0 && (
                <Text style={styles.emptyText}>No session with a working set of this exercise yet.</Text>
              )}
```
Add to the `styles` object, after `dayBlock: { ... },`:
```ts
  scopeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
    backgroundColor: colors.muted, borderRadius: 9,
  },
  scopeText: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.foreground },
  scopeClear: { fontSize: 13, fontWeight: "600", color: colors.primary },
```
(This file still imports the legacy `@/src/lib/colors` shim; the two new styles use its names so the file stays on one palette. Migrating it is out of scope — spec §10.)

- [ ] **Step 3: Typecheck, commit**

Run: `npx tsc --noEmit -p .` → nothing.
```bash
git add src/components/track/gym-sessions/GymSessionsScreen.tsx "app/(tabs)/track/gym-sessions/index.tsx"
git commit -m "feat(gym-sessions): the session list accepts an exercise scope for the exercise page's See all

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 19: Error-handling audit, typecheck, lint, full suite

**Files:**
- Possibly modify any file from Tasks 1–18 (only to satisfy the checks below).

- [ ] **Step 1: Confirm every new block fails closed (spec §8)**

Run from `mobile/`:
```bash
grep -n "catch" src/components/training/item-detail/TrainingItemDetailScreen.tsx | wc -l
grep -n "console.error" src/lib/supabase/exerciseHistory.ts src/lib/supabase/rerateMovement.ts src/lib/supabase/addToToday.ts src/lib/supabase/capture.ts | wc -l
```
Expected: the first prints at least 8 (loadUser, loadSources, loadHistory, loadSkillNote, loadScaling, loadItem, loadHierarchy, handleGenerateImage); the second at least 5. Read each `catch` in the page and confirm it sets that block's state to empty/null and nothing else — no block's failure may touch another block or the page's loading flag except `loadItem`.

- [ ] **Step 2: Confirm the inline error under the button and the re-rate toast**

Open `AddToTodayButton.tsx`: on `!result.ok` it sets `error` and returns with `busy` false and today untouched (the writer's failures leave no partial session: `createUserPickSession` deletes the session row when the item insert fails). Open `TrainingItemDetailScreen.tsx`: `onRerateSave` sets the toast on failure and leaves `skillNote` as it was.

- [ ] **Step 3: Typecheck, lint and the whole suite**

Run:
```bash
npx tsc --noEmit -p . && npx jest && npx eslint src/lib/exerciseHistory.ts src/lib/skillReplay.ts src/lib/capturedFromModel.ts src/lib/addToTodayPlan.ts src/lib/scoredBy.ts src/lib/hierarchyCollapse.ts src/lib/demoVideo.ts src/lib/exerciseFilterLink.ts src/lib/historyViewStore.ts src/lib/supabase/exerciseHistory.ts src/lib/supabase/rerateMovement.ts src/lib/supabase/addToToday.ts src/components/training/item-detail "app/(tabs)/training/exercise-sources" "app/(tabs)/training/index.tsx" "app/(tabs)/track/gym-sessions/index.tsx"
```
Expected: nothing from tsc; every suite PASS; eslint reports no errors in the new files (raw-colour warnings in pre-existing files are the known audit tail and are not in scope). Fix any error in place; keep the fix inside the file it belongs to.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A src app
git commit -m "chore(exercise-page): audit pass — fail-closed blocks, lint and types clean

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(Skip the commit if the tree is clean.)

---

### Task 20: Device walk, spec status, merge to main

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-exercise-detail-page-v2-design.md` (Status line)

- [ ] **Step 1: Run the app on the isolated simulator**

Boot `FitTracker-walk3` (UDID `883E9323-DFCB-4B68-BE22-A0A45836206F`; it has the dev client installed and Brian is signed in). Start Metro from `mobile/` with `npx expo start --dev-client --port 8097 --clear` in the background, then `xcrun simctl openurl 883E9323-DFCB-4B68-BE22-A0A45836206F "fittracker-local://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8097"` and tap Open at device points (275, 473) with idb. Drive with `idb ui tap` and `xcrun simctl io <udid> screenshot`. Never CGEvent-click; the sim is on another Space. No native module changed in this plan, so no dev-client rebuild is needed.

- [ ] **Step 2: Walk the spec's list (§9), a screenshot for each**

Training › Daily › Exercises, then open each page:
1. **Alternating Dumbbell Snatch** (history present, one creator): meta row shows four columns including "Scored by"; "Your history" renders with Last done / Best set / Sessions and bars; toggle to Sessions, rows show date · name · top set, a PR badge where earned; the skill footer reads "You rated this … on <date>" with Re-rate; tap Re-rate, change the rating, save — the footer updates in place; "See all N sessions" opens Track › Gym Sessions scoped to the exercise with the "Show all" chip; Captured From strip shows one card whose handle opens the Exercises tab with the creator chip applied on top of the saved filters.
2. **Squat** (six posts, three creators, ten siblings): hierarchy shows four siblings and "See all 10 ›", tapping expands in place; Captured From header reads "6 posts · 3 creators"; tapping "6 posts" opens the full screen on Posts, tapping "3 creators" opens it on Creators grouped with "N posts" headers; a workout name in green opens that captured workout; the strip fades at its right edge.
3. **A never-logged row**: no "Your history" section; every other section still renders; the Demo Video section shows "Find a demo ›" whether or not a video is set, and it opens a YouTube search for the name.
4. **Chips**: a primary muscle chip, a secondary muscle chip and an equipment tile each open the Exercises tab with the matching removable chip in the rail; leave the tab and come back — the chip is still applied (it was saved).
5. **Add to today across days** (use the Today tab's Set up / Mark done / Rest controls to put the day in each state):
   - pending session: button "Add to today" → lands on Today with the toast "Added to today" and the exercise as a main-block item; re-open the exercise page: button reads "In today's session" and is disabled;
   - session in progress (Start session, log one set, come back): append → the item shows in the live session's remaining list on next open;
   - completed day: append → a second session appears on Today;
   - rested day: the bottom sheet "Today is a rest day. Un-rest and add this?" → Cancel leaves the rest day; Add clears it and creates the session;
   - no session yet: creates a user_pick session with just this item.
6. **Failure path**: with the simulator offline (Settings › Wi-Fi off or `xcrun simctl status_bar` is not enough — toggle the Mac's network briefly), tap Add to today: an inline error appears under the button, the button re-enables, Today is unchanged.

- [ ] **Step 3: Mark the spec**

Change the spec's `**Status:**` line to `**Status:** Implemented and device-verified 2026-09-11 (plan: docs/superpowers/plans/2026-09-11-exercise-detail-page-v2.md)`.

- [ ] **Step 4: Commit, merge to main, push**

No pull requests in this repo — merge the branch straight to main.
```bash
git add docs/superpowers/specs/2026-09-11-exercise-detail-page-v2-design.md
git commit -m "docs(exercise-page): v2 spec marked device-verified

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git checkout main
git pull
git merge --no-ff exercise-detail-v2 -m "feat(exercise-page): exercise detail page v2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
npx tsc --noEmit -p . && npx jest
git push origin main
git branch -d exercise-detail-v2
```
Expected: nothing from tsc; every suite PASS before the push.

Stop Metro and shut the simulator down afterwards.
