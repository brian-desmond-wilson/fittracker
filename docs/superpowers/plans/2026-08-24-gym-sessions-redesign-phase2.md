# Gym Sessions Redesign — Phase 2 Implementation Plan (Stats)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the Stats tab — one Week/Month/Year selector scoping summary tiles with deltas and four single-axis charts (volume, strength e1RM per lift, frequency, body weight) — and make streaks rest-day-aware with a weeks-in-a-row companion.

**Architecture:** All period math, bucketing, summaries, e1RM, and streak arithmetic land in a new pure lib module (`statsPeriod.ts`) plus edits to `sessionPresentation.ts`/`gymSessions.ts`, all unit-tested. Two small SVG chart components follow the app's existing chart idiom (`WaterBarChart`: 300-wide viewBox, padded frame, sparse first/mid/last labels). A new `StatsTab` component composes the tab so `GymSessionsScreen` stays thin. Spec: `docs/superpowers/specs/2026-08-24-gym-sessions-redesign-design.md` (Phase 2 scope).

**Tech Stack:** React Native (Expo), TypeScript, react-native-svg (already used for charts), Jest, Supabase (untyped client — mapper-level fixtures where fetching is involved).

**Branch:** Create `gym-sessions-stats` off **origin/main** in a fresh worktree (`git worktree add .claude/worktrees/gym-sessions-stats -b gym-sessions-stats origin/main`) — the main checkout belongs to another session; never switch its branch. Run `npm ci` in `<worktree>/mobile` before starting, plus `cp` the `.env` from the main checkout's `mobile/.env`.

**Decisions locked with the user (do not relitigate):**
- Body weight is its OWN chart, not an overlay on the frequency bars (dual-axis rejected 2026-08-24).
- Goal ring counts the calendar week; tiles keep trailing-7 semantics. The Stats tab is CALENDAR-period based (this phase's selector).
- Rest days preserve streaks. Weeks-in-a-row counts weeks with ≥1 session until the Phase 3 goals entity exists.
- No calories, no records/PRs, no goals-editing block in this phase (Phase 3).

**Phase 2 boundaries:** No new DB tables. The interim "Trends, records, and period stats land in Phase 2." note and the moved balance block get replaced by the real tab. The balance bar survives INSIDE the new tab (it's period-independent; keep it at the bottom, unchanged JSX).

---

## Existing code you build on

- `mobile/src/lib/gymSessions.ts` — `sessionVolume`, `sessionMinutes`, `sessionEmphasis`, `weekSummary`, `currentStreak`, `balance`, `formatVolume`, `formatMinutes`, exported `dayDiff`; internal `toUtc`.
- `mobile/src/lib/sessionPresentation.ts` — `weekRail`, `RailDay`, `mainExerciseCount`, `DEFAULT_WEEKLY_SESSIONS_GOAL`, `calendarWeekSessions`.
- `mobile/src/components/track/gym-sessions/` — `GymSessionsScreen.tsx` (three tabs; stats branch currently holds weekLine + balance block + placeholder note), `HeroHeader.tsx` (streak pill), `groupColors.ts`.
- Chart idiom to copy: `mobile/src/components/track/WaterBarChart.tsx` (300-wide viewBox, `padding = {top:14,bottom:22,left:8,right:8}`, slot/bar widths, sparse labels at first/mid/last, `colors` tokens).
- `weight_logs` table: `date` (YYYY-MM-DD), `weight_lbs`, `logged_at` (see `WeightScreen.tsx:94` and `types/track.ts:215`).
- Colors: `@/src/lib/colors` in gym-sessions files (`colors.primary` green #22C55E-ish, `colors.mutedForeground`, `colors.border`, `colors.muted`). Body-weight line uses `#60A5FA` (the blue already used for the upper-pull dot), single-series per chart so no legend is required; titles name the series.

Run all commands from the worktree's `mobile/`. Full check: `npx tsc --noEmit && npx jest`.

---

### Task 1: statsPeriod lib — ranges, buckets, summaries, deltas

**Files:**
- Create: `mobile/src/lib/statsPeriod.ts`
- Create: `mobile/src/lib/__tests__/statsPeriod.test.ts`
- Modify: `mobile/src/lib/gymSessions.ts` (export `toUtc`)

- [ ] **Step 1: Export toUtc**

In `gymSessions.ts` change `const toUtc = ...` to `export const toUtc = ...`.

- [ ] **Step 2: Write the failing tests**

Create `mobile/src/lib/__tests__/statsPeriod.test.ts`:

```ts
import {
  bucketLabels,
  bucketSeries,
  periodRange,
  periodSummary,
  summaryDelta,
} from "../statsPeriod";
import type { HistoryExercise, HistorySession, HistorySet } from "../../types/gymSessions";

const set = (over: Partial<HistorySet> = {}): HistorySet => ({
  setNumber: 1, reps: 10, weightLbs: 100, volumeLbs: 1000, isWarmup: false,
  difficulty: null, startedAt: null, endedAt: null, durationSeconds: null,
  timingSource: null, ...over,
});

const exercise = (sets: HistorySet[], name = "Movement"): HistoryExercise => ({
  id: `ex-${name}`, exerciseId: `id-${name}`, name, order: 1, difficulty: null,
  primaryRegions: ["Chest"], sets,
});

const session = (
  date: string,
  over: Partial<HistorySession> = {},
): HistorySession => ({
  id: `s-${date}-${Math.random()}`, date, sessionNumber: 1, sessionCount: 1,
  startedAt: null, endedAt: null, durationSeconds: 3600, name: null,
  source: "unknown", capturedWorkoutId: null, capturedWorkoutHandle: null,
  estimatedMinutes: null, mainBlockWorkoutName: null,
  exercises: [exercise([set()])], ...over,
});

// today is Monday 2026-08-24 throughout; its calendar week is Sun 08-23..Sat 08-29.
const TODAY = "2026-08-24";

describe("periodRange", () => {
  it("weeks run Sunday to Saturday, with the previous week behind", () => {
    expect(periodRange("week", TODAY)).toEqual({
      start: "2026-08-23", end: "2026-08-29",
      prevStart: "2026-08-16", prevEnd: "2026-08-22",
    });
  });
  it("months are calendar months", () => {
    expect(periodRange("month", TODAY)).toEqual({
      start: "2026-08-01", end: "2026-08-31",
      prevStart: "2026-07-01", prevEnd: "2026-07-31",
    });
  });
  it("years are calendar years", () => {
    expect(periodRange("year", TODAY)).toEqual({
      start: "2026-01-01", end: "2026-12-31",
      prevStart: "2025-01-01", prevEnd: "2025-12-31",
    });
  });
  it("January's previous month crosses the year boundary", () => {
    expect(periodRange("month", "2026-01-15").prevStart).toBe("2025-12-01");
    expect(periodRange("month", "2026-01-15").prevEnd).toBe("2025-12-31");
  });
});

describe("periodSummary", () => {
  const sessions = [
    session("2026-08-24"),                       // this week
    session("2026-08-23"),                       // this week (Sunday)
    session("2026-08-19", { durationSeconds: 1800 }), // last week
    session("2026-07-30"),                       // last month
  ];
  it("counts workouts, minutes, volume, exercises inside the range", () => {
    const s = periodSummary(sessions, periodRange("week", TODAY));
    expect(s.workouts).toBe(2);
    expect(s.minutes).toBe(120);
    expect(s.volumeLbs).toBe(2000);
    expect(s.exercises).toBe(2);
  });
  it("computes the previous period for comparison", () => {
    const s = periodSummary(sessions, periodRange("week", TODAY));
    expect(s.prev.workouts).toBe(1);
    expect(s.prev.minutes).toBe(30);
  });
});

describe("summaryDelta", () => {
  it("formats signed deltas and names the previous period", () => {
    expect(summaryDelta(6, 2, "week")).toBe("+4 vs last week");
    expect(summaryDelta(2, 6, "month")).toBe("-4 vs last month");
    expect(summaryDelta(3, 3, "year")).toBe("same as last year");
  });
});

describe("bucketSeries", () => {
  it("week scope buckets by day, seven buckets", () => {
    const sessions = [session("2026-08-24"), session("2026-08-24"), session("2026-08-27")];
    const buckets = bucketSeries(sessions, "week", TODAY, sessionCountOf);
    expect(buckets).toHaveLength(7);
    expect(buckets[1]).toBe(2); // Monday
    expect(buckets[4]).toBe(1); // Thursday
  });
  it("month scope buckets by calendar week rows", () => {
    // August 2026 spans 6 week-rows (Aug 1 is a Saturday).
    const sessions = [session("2026-08-01"), session("2026-08-24")];
    const buckets = bucketSeries(sessions, "month", TODAY, sessionCountOf);
    expect(buckets).toHaveLength(6);
    expect(buckets[0]).toBe(1); // week containing Aug 1
    expect(buckets[4]).toBe(1); // week containing Aug 24
  });
  it("year scope buckets by month, twelve buckets", () => {
    const sessions = [session("2026-01-10"), session("2026-08-24"), session("2026-08-01")];
    const buckets = bucketSeries(sessions, "year", TODAY, sessionCountOf);
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toBe(1);
    expect(buckets[7]).toBe(2);
  });
});

const sessionCountOf = (group: HistorySession[]) => group.length;

describe("bucketLabels", () => {
  it("names buckets per scope", () => {
    expect(bucketLabels("week", TODAY)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(bucketLabels("month", TODAY)).toEqual(["W1", "W2", "W3", "W4", "W5", "W6"]);
    expect(bucketLabels("year", TODAY)).toEqual(["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx jest src/lib/__tests__/statsPeriod.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement**

Create `mobile/src/lib/statsPeriod.ts`:

```ts
// Calendar-period arithmetic for the Stats tab: ranges, buckets, summaries.
// Pure — the tab owns pixels, supabase owns reads. All dates are local-day
// ISO strings compared lexically; UTC math only ever steps whole days.
import { dayDiff, sessionMinutes, sessionVolume, toUtc } from "./gymSessions";
import { mainExerciseCount } from "./sessionPresentation";
import type { HistorySession } from "../types/gymSessions";

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
```

- [ ] **Step 5: Run the tests**

Run: `npx jest src/lib/__tests__/statsPeriod.test.ts` → PASS (fix until green).

- [ ] **Step 6: Full check + commit**

Run: `npx tsc --noEmit && npx jest` → clean.

```bash
git add -A
git commit -m "feat(track): period arithmetic - calendar ranges, buckets, deltas"
```
(Every commit in this plan: append a blank line then `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.)

### Task 2: Strength — e1RM and per-lift series

**Files:**
- Modify: `mobile/src/lib/statsPeriod.ts`
- Modify: `mobile/src/lib/__tests__/statsPeriod.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the test file (extend the `exercise` helper usage as needed):

```ts
import { estimatedOneRepMax, liftCandidates, strengthSeries } from "../statsPeriod";

const lift = (
  date: string,
  name: string,
  sets: HistorySet[],
): HistorySession =>
  session(date, {
    exercises: [{
      id: `ex-${name}-${date}`, exerciseId: `id-${name}`, name, order: 1,
      difficulty: null, primaryRegions: ["Chest"], sets,
    }],
  });

describe("estimatedOneRepMax", () => {
  it("uses Epley on the best working set", () => {
    // 165×5 → 165*(1+5/30) = 192.5 → 193
    expect(estimatedOneRepMax([set({ weightLbs: 165, reps: 5 }), set({ weightLbs: 135, reps: 10 })])).toBe(193);
  });
  it("ignores warm-ups and unloaded sets", () => {
    expect(estimatedOneRepMax([
      set({ weightLbs: 225, reps: 5, isWarmup: true }),
      set({ weightLbs: 0, reps: 20 }),
    ])).toBeNull();
  });
});

describe("liftCandidates", () => {
  it("ranks loaded lifts by working sets and keeps the top four", () => {
    const sessions = [
      lift("2026-08-24", "Bench Press", [set(), set(), set()]),
      lift("2026-08-23", "Bench Press", [set(), set()]),
      lift("2026-08-22", "Row", [set(), set(), set(), set()]),
      lift("2026-08-21", "Squat", [set(), set()]),
      lift("2026-08-20", "OHP", [set()]),
      lift("2026-08-19", "Curl", [set()]),
      lift("2026-08-18", "Plank", [set({ weightLbs: 0 })]),
    ];
    const names = liftCandidates(sessions).map((c) => c.name);
    expect(names).toEqual(["Bench Press", "Row", "Squat", "OHP"]);
  });
});

describe("strengthSeries", () => {
  it("takes the bucket's best e1RM for the chosen lift, null when unworked", () => {
    const sessions = [
      lift("2026-08-24", "Bench Press", [set({ weightLbs: 165, reps: 5 })]),
      lift("2026-08-27", "Bench Press", [set({ weightLbs: 170, reps: 3 })]),
      lift("2026-08-27", "Row", [set({ weightLbs: 300, reps: 1 })]),
    ];
    const series = strengthSeries(sessions, "id-Bench Press", "week", TODAY);
    expect(series[1]).toBe(193);  // Monday
    expect(series[4]).toBe(187);  // Thursday: 170*(1+3/30) = 187
    expect(series[0]).toBeNull(); // Sunday: not benched
  });
});
```

- [ ] **Step 2: Run to verify failure**, then implement in `statsPeriod.ts`:

```ts
/**
 * Epley on the best working set: w × (1 + reps/30), rounded. Null when
 * nothing was loaded — a bodyweight day has no 1RM to estimate.
 */
export function estimatedOneRepMax(sets: HistorySet[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.isWarmup || s.weightLbs <= 0 || s.reps <= 0) continue;
    const e = s.weightLbs * (1 + s.reps / 30);
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
```

Add `HistorySet` to the type import in `statsPeriod.ts`.

- [ ] **Step 3: Tests green, full check, commit**

```bash
git add -A
git commit -m "feat(track): strength arithmetic - Epley e1RM, lift picker, per-bucket series"
```

### Task 3: Rest-aware streak + weeks in a row

**Files:**
- Modify: `mobile/src/lib/gymSessions.ts` (`currentStreak` gains restDates)
- Modify: `mobile/src/lib/__tests__/gymSessions.test.ts`
- Modify: `mobile/src/lib/sessionPresentation.ts` (add `weeksInARow`)
- Modify: `mobile/src/lib/__tests__/sessionPresentation.test.ts`
- Modify: `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx` (pass restDates; weeks pill)
- Modify: `mobile/src/components/track/gym-sessions/HeroHeader.tsx` (weeks in the streak line)

- [ ] **Step 1: Failing tests for the rest-aware streak**

In `gymSessions.test.ts`'s `currentStreak` describe, add:

```ts
  // Spec: the streak measures plan adherence. A confirmed rest day keeps the
  // chain alive and counts; an unplanned empty day still breaks it.
  it("keeps counting through a confirmed rest day", () => {
    const sessions = ["2026-08-17", "2026-08-15"].map((d) => session(d, []));
    expect(currentStreak(sessions, "2026-08-17", new Set(["2026-08-16"]))).toBe(3);
  });
  it("still breaks on an unplanned empty day", () => {
    const sessions = ["2026-08-17", "2026-08-15"].map((d) => session(d, []));
    expect(currentStreak(sessions, "2026-08-17", new Set())).toBe(1);
  });
  it("anchors on a rest day when today is one", () => {
    const sessions = [session("2026-08-16", [])];
    expect(currentStreak(sessions, "2026-08-17", new Set(["2026-08-17"]))).toBe(2);
  });
```

- [ ] **Step 2: Implement** — in `gymSessions.ts` replace `currentStreak` with:

```ts
/**
 * Consecutive days ON PLAN, counting back from today: a day counts when it
 * was trained or confirmed as rest. An unplanned empty day breaks it.
 *
 * A streak survives today being empty — it is only 8pm, and killing the number
 * before the day is over punishes you for not having trained yet.
 */
export function currentStreak(
  sessions: HistorySession[],
  today: string,
  restDates: Set<string> = new Set(),
): number {
  const days = new Set(sessions.map((s) => s.date));
  const onPlan = (d: string) => days.has(d) || restDates.has(d);
  if (days.size === 0 && restDates.size === 0) return 0;
  const startOffset = onPlan(today) ? 0 : 1;
  // Nothing today AND nothing yesterday means the streak is already broken.
  const anchor = new Date(toUtc(today) - startOffset * dayMs);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (!onPlan(iso(anchor))) return 0;
  let streak = 0;
  const cursor = new Date(anchor);
  while (onPlan(iso(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
```

Existing tests keep passing (the parameter defaults to empty).

- [ ] **Step 3: Failing tests for weeksInARow**

In `sessionPresentation.test.ts`:

```ts
import { weeksInARow } from "../sessionPresentation"; // merge into existing import

describe("weeksInARow", () => {
  // Until the goals entity lands, a week counts with ≥1 session.
  it("counts consecutive trained weeks ending now", () => {
    const sessions = ["2026-08-24", "2026-08-19", "2026-08-12"].map((d) => session({ date: d, id: d }));
    expect(weeksInARow(sessions, "2026-08-24")).toBe(3);
  });
  it("does not break on the current week before it has a session", () => {
    const sessions = ["2026-08-19", "2026-08-12"].map((d) => session({ date: d, id: d }));
    expect(weeksInARow(sessions, "2026-08-24")).toBe(2);
  });
  it("breaks on a fully skipped week", () => {
    const sessions = ["2026-08-24", "2026-08-05"].map((d) => session({ date: d, id: d }));
    expect(weeksInARow(sessions, "2026-08-24")).toBe(1);
  });
  it("is zero with nothing recent", () => {
    expect(weeksInARow([session({ date: "2026-07-01", id: "old" })], "2026-08-24")).toBe(0);
  });
});
```

(Adjust the `session` fixture call shape to that file's helper — it takes an
overrides object; date and a unique id are what matters.)

- [ ] **Step 4: Implement** in `sessionPresentation.ts`:

```ts
/**
 * Consecutive calendar weeks trained (≥1 session), ending with the current
 * week. The current week gets the same grace a day gets: empty-so-far doesn't
 * break the run, it just doesn't count yet. Once the goals entity exists
 * (Phase 3) the ≥1 threshold becomes the user's weekly goal.
 */
export function weeksInARow(sessions: HistorySession[], today: string): number {
  const weekStart = (date: string): string => {
    const utc = toUtc(date);
    return new Date(utc - new Date(utc).getUTCDay() * dayMs).toISOString().slice(0, 10);
  };
  const trained = new Set(sessions.map((s) => weekStart(s.date)));
  let cursor = weekStart(today);
  let weeks = 0;
  if (!trained.has(cursor)) {
    // grace: current week still in progress
    cursor = new Date(toUtc(cursor) - 7 * dayMs).toISOString().slice(0, 10);
  }
  while (trained.has(cursor)) {
    weeks += 1;
    cursor = new Date(toUtc(cursor) - 7 * dayMs).toISOString().slice(0, 10);
  }
  return weeks;
}
```

Import `toUtc` from `./gymSessions` (exported in Task 1) — `dayMs` already
exists in this module.

- [ ] **Step 5: Wire into the hero**

`GymSessionsScreen.tsx`:
- `const streak = useMemo(() => currentStreak(sessions, today, restDates), [sessions, today, restDates]);`
- `const weekStreak = useMemo(() => weeksInARow(sessions, today), [sessions, today]);`
- Pass `weeksInARow={weekStreak}` to both HeroHeader instances.

`HeroHeader.tsx`: add prop `weeksInARow: number`; the full variant's streak
pill text becomes:

```tsx
{streakDays}-day streak{weeksInARow > 1 ? ` · ${weeksInARow} weeks in a row` : ""}
```

and the compact row's `streakPart` becomes
`streakDays > 0 ? `🔥 ${streakDays}${weeksInARow > 1 ? ` · ${weeksInARow}w` : ""}` : ""`.

- [ ] **Step 6: Full check + commit**

```bash
git add -A
git commit -m "feat(track): streaks survive rest days; weeks-in-a-row joins the hero"
```

### Task 4: Body-weight series fetch

**Files:**
- Modify: `mobile/src/lib/supabase/gymSessions.ts`
- Modify: `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx`

- [ ] **Step 1: Add the fetch** (no unit test — untyped client; shape is trivial):

In `supabase/gymSessions.ts`:

```ts
export interface WeightPoint {
  date: string;
  weightLbs: number;
}

/** Body weight for the Stats tab's own chart — last entry per day wins. */
export async function fetchWeightSeries(
  userId: string,
  fromDate: string,
): Promise<WeightPoint[]> {
  const { data, error } = await supabase
    .from("weight_logs")
    .select("date, weight_lbs, logged_at")
    .eq("user_id", userId)
    .gte("date", fromDate)
    .order("date", { ascending: true })
    .order("logged_at", { ascending: true });
  if (error) {
    console.error("fetchWeightSeries failed:", error.message);
    return [];
  }
  const byDay = new Map<string, number>();
  for (const row of data ?? []) byDay.set(row.date, row.weight_lbs);
  return [...byDay.entries()].map(([date, weightLbs]) => ({ date, weightLbs }));
}
```

- [ ] **Step 2: Load it with the rest** in `GymSessionsScreen.tsx`:

```ts
const [weightSeries, setWeightSeries] = useState<WeightPoint[]>([]);
```

In `load()`, extend the `Promise.all` with
`fetchWeightSeries(user.id, \`${Number(today.slice(0, 4)) - 1}-01-01\`)`
(a year scope needs at most last year + this year) and set the state. Import
`WeightPoint` as a type.

- [ ] **Step 3: Full check + commit**

```bash
git add -A
git commit -m "feat(track): body weight series feeds the stats tab"
```

### Task 5: Chart components — PeriodBars and TrendLine

**Files:**
- Create: `mobile/src/components/track/gym-sessions/PeriodBars.tsx`
- Create: `mobile/src/components/track/gym-sessions/TrendLine.tsx`

No unit tests (presentation; device-verified in Task 7). Both follow the
`WaterBarChart` idiom: 300-wide viewBox, same padding, sparse labels.

- [ ] **Step 1: PeriodBars**

```tsx
// One series of bars over the period's buckets. Single series, single axis —
// magnitude only, so the bar color is the brand green and the chart needs no
// legend (the panel title names the series).
import React from "react";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { colors } from "@/src/lib/colors";

const VIEW_WIDTH = 300;

export function PeriodBars({
  values,
  labels,
  height = 120,
  formatValue,
}: {
  values: number[];
  labels: string[];
  height?: number;
  /** Direct label for the max bar — selective labeling, not every bar. */
  formatValue?: (v: number) => string;
}) {
  const padding = { top: 16, bottom: 20, left: 8, right: 8 };
  const innerWidth = VIEW_WIDTH - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slotWidth = innerWidth / Math.max(values.length, 1);
  const barWidth = Math.min(slotWidth * 0.6, 26);
  const baseY = padding.top + chartHeight;
  const max = Math.max(...values, 1);
  const maxIndex = values.indexOf(Math.max(...values));

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height}`}>
      {values.map((v, i) => {
        const barHeight = v > 0 ? Math.max((v / max) * chartHeight, 2) : 2;
        const x = padding.left + i * slotWidth + (slotWidth - barWidth) / 2;
        return (
          <React.Fragment key={i}>
            <Rect
              x={x}
              y={baseY - barHeight}
              width={barWidth}
              height={barHeight}
              rx={3}
              fill={v > 0 ? colors.primary : colors.muted}
            />
            {i === maxIndex && v > 0 && formatValue && (
              <SvgText
                x={x + barWidth / 2}
                y={baseY - barHeight - 5}
                fontSize={9}
                fill={colors.mutedForeground}
                textAnchor="middle"
              >
                {formatValue(v)}
              </SvgText>
            )}
            <SvgText
              x={x + barWidth / 2}
              y={height - 6}
              fontSize={9}
              fill={colors.mutedForeground}
              textAnchor="middle"
            >
              {labels[i] ?? ""}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}
```

- [ ] **Step 2: TrendLine**

```tsx
// One line over the period's buckets, gaps where there is no data. Used for
// est. 1RM and body weight — one measure, one axis, per chart.
import React from "react";
import Svg, { Circle, Polyline, Text as SvgText } from "react-native-svg";
import { colors } from "@/src/lib/colors";

const VIEW_WIDTH = 300;

export function TrendLine({
  values,
  labels,
  color = colors.primary,
  height = 120,
  formatValue = (v) => String(Math.round(v)),
}: {
  values: (number | null)[];
  labels: string[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const padding = { top: 16, bottom: 20, left: 8, right: 8 };
  const innerWidth = VIEW_WIDTH - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const slotWidth = innerWidth / Math.max(values.length, 1);
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const xOf = (i: number) => padding.left + i * slotWidth + slotWidth / 2;
  const yOf = (v: number) =>
    padding.top + chartHeight - ((v - min) / span) * chartHeight;

  const points = values
    .map((v, i) => (v === null ? null : `${xOf(i)},${yOf(v)}`))
    .filter(Boolean)
    .join(" ");
  const firstIdx = values.findIndex((v) => v !== null);
  let lastIdx = -1;
  values.forEach((v, i) => { if (v !== null) lastIdx = i; });

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height}`}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {values.map((v, i) =>
        v === null ? null : (
          <Circle key={i} cx={xOf(i)} cy={yOf(v)} r={i === firstIdx || i === lastIdx ? 3.5 : 2} fill={color} />
        ),
      )}
      {[firstIdx, lastIdx].filter((i, n, a) => i >= 0 && a.indexOf(i) === n).map((i) => (
        <SvgText
          key={`v${i}`}
          x={xOf(i)}
          y={yOf(values[i] as number) - 8}
          fontSize={9}
          fill={colors.mutedForeground}
          textAnchor="middle"
        >
          {formatValue(values[i] as number)}
        </SvgText>
      ))}
      {labels.map((l, i) => (
        <SvgText key={`l${i}`} x={xOf(i)} y={height - 6} fontSize={9} fill={colors.mutedForeground} textAnchor="middle">
          {l}
        </SvgText>
      ))}
    </Svg>
  );
}
```

If month scope has 31 daily labels this crowds — labels for TrendLine and
PeriodBars are BUCKET labels (7 / ≤6 / 12 entries), never daily, so density is
bounded by design.

- [ ] **Step 3: Typecheck + commit**

```bash
git add -A
git commit -m "feat(track): period bar and trend line charts"
```

### Task 6: StatsTab component + screen integration

**Files:**
- Create: `mobile/src/components/track/gym-sessions/StatsTab.tsx`
- Modify: `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx`

- [ ] **Step 1: StatsTab**

```tsx
// The Stats tab: one scope selector drives the tiles and every chart.
// Arithmetic lives in statsPeriod; this file owns only arrangement.
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "@/src/lib/colors";
import { formatMinutes, formatVolume, sessionVolume } from "@/src/lib/gymSessions";
import {
  bucketLabels, bucketSeries, liftCandidates, periodRange, periodSummary,
  strengthSeries, summaryDelta, type StatScope,
} from "@/src/lib/statsPeriod";
import type { WeightPoint } from "@/src/lib/supabase/gymSessions";
import type { HistorySession } from "@/src/types/gymSessions";
import { PeriodBars } from "./PeriodBars";
import { TrendLine } from "./TrendLine";

const BODY_WEIGHT_COLOR = "#60A5FA";

export function StatsTab({
  sessions,
  weightSeries,
  today,
}: {
  sessions: HistorySession[];
  weightSeries: WeightPoint[];
  today: string;
}) {
  const [scope, setScope] = useState<StatScope>("week");
  const lifts = useMemo(() => liftCandidates(sessions), [sessions]);
  const [liftId, setLiftId] = useState<string | null>(null);
  const activeLift = liftId ?? lifts[0]?.exerciseId ?? null;

  const range = useMemo(() => periodRange(scope, today), [scope, today]);
  const summary = useMemo(() => periodSummary(sessions, range), [sessions, range]);
  const labels = useMemo(() => bucketLabels(scope, today), [scope, today]);
  const volumeBuckets = useMemo(
    () => bucketSeries(sessions, scope, today, (g) => g.reduce((t, s) => t + sessionVolume(s), 0)),
    [sessions, scope, today],
  );
  const frequencyBuckets = useMemo(
    () => bucketSeries(sessions, scope, today, (g) => g.length),
    [sessions, scope, today],
  );
  const strength = useMemo(
    () => (activeLift ? strengthSeries(sessions, activeLift, scope, today) : []),
    [sessions, activeLift, scope, today],
  );
  const weightBuckets = useMemo(() => {
    // last known weight per bucket, so the line is a level, not a sum
    const within = weightSeries.filter((w) => w.date >= range.start && w.date <= range.end);
    return labels.map((_, i) => {
      const dates = within.filter((w) => bucketOf(w.date) === i);
      return dates.length > 0 ? dates[dates.length - 1].weightLbs : null;
    });
    function bucketOf(date: string): number {
      // mirror statsPeriod's bucketing via a session-shaped probe
      const idx = bucketSeries(
        [{ ...PROBE, date } as HistorySession], scope, today, (g) => g.length,
      ).findIndex((n) => n > 0);
      return idx;
    }
  }, [weightSeries, labels, range, scope, today]);

  const tiles = [
    { label: "WORKOUTS", value: String(summary.workouts), delta: summaryDelta(summary.workouts, summary.prev.workouts, scope) },
    { label: "TIME", value: formatMinutes(summary.minutes), delta: summaryDelta(Math.round(summary.minutes / 60), Math.round(summary.prev.minutes / 60), scope) },
    { label: "VOLUME", value: formatVolume(summary.volumeLbs), delta: summaryDelta(Math.round(summary.volumeLbs / 1000), Math.round(summary.prev.volumeLbs / 1000), scope) },
    { label: "EXERCISES", value: String(summary.exercises), delta: summaryDelta(summary.exercises, summary.prev.exercises, scope) },
  ];

  return (
    <View>
      <View style={styles.seg}>
        {(["week", "month", "year"] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.segTab, scope === s && styles.segTabOn]}
            onPress={() => setScope(s)}
            accessibilityRole="button"
            accessibilityState={{ selected: scope === s }}
          >
            <Text style={[styles.segText, scope === s && styles.segTextOn]}>
              {s === "week" ? "Week" : s === "month" ? "Month" : "Year"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View key={t.label} style={styles.tile}>
            <Text style={styles.tileLabel}>{t.label}</Text>
            <Text style={styles.tileValue}>{t.value}</Text>
            <Text style={styles.tileDelta}>{t.delta}</Text>
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Volume</Text>
        <PeriodBars values={volumeBuckets} labels={labels} formatValue={formatVolume} />
      </View>

      {lifts.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Strength · est. 1RM</Text>
          <View style={styles.liftRow}>
            {lifts.map((l) => (
              <TouchableOpacity
                key={l.exerciseId}
                style={[styles.lift, activeLift === l.exerciseId && styles.liftOn]}
                onPress={() => setLiftId(l.exerciseId)}
                accessibilityRole="button"
                accessibilityState={{ selected: activeLift === l.exerciseId }}
              >
                <Text style={[styles.liftText, activeLift === l.exerciseId && styles.liftTextOn]} numberOfLines={1}>
                  {l.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TrendLine values={strength} labels={labels} formatValue={(v) => `${Math.round(v)} lbs`} />
        </View>
      )}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Sessions</Text>
        <PeriodBars values={frequencyBuckets} labels={labels} formatValue={(v) => String(v)} />
      </View>

      {weightBuckets.some((w) => w !== null) && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Body weight</Text>
          <TrendLine values={weightBuckets} labels={labels} color={BODY_WEIGHT_COLOR} formatValue={(v) => `${Math.round(v)} lbs`} />
        </View>
      )}
    </View>
  );
}

const PROBE = {
  id: "probe", sessionNumber: 1, sessionCount: 1, startedAt: null, endedAt: null,
  durationSeconds: null, name: null, source: "unknown", capturedWorkoutId: null,
  capturedWorkoutHandle: null, estimatedMinutes: null, mainBlockWorkoutName: null,
  exercises: [],
};

const styles = StyleSheet.create({
  seg: {
    flexDirection: "row", gap: 4, backgroundColor: colors.muted,
    borderRadius: 9, padding: 3, marginBottom: 12, alignSelf: "flex-start", width: 220,
  },
  segTab: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 7 },
  segTabOn: { backgroundColor: colors.background },
  segText: { fontSize: 12, color: colors.mutedForeground, fontWeight: "600" },
  segTextOn: { color: colors.foreground },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  tile: {
    flexBasis: "48%", flexGrow: 1, backgroundColor: colors.muted,
    borderRadius: 10, padding: 10,
  },
  tileLabel: { fontSize: 10, color: colors.mutedForeground, letterSpacing: 0.5 },
  tileValue: { fontSize: 18, fontWeight: "700", color: colors.foreground, marginTop: 3 },
  tileDelta: { fontSize: 10, color: "#4ADE80", marginTop: 2 },
  panel: {
    backgroundColor: colors.muted, borderRadius: 12, padding: 12, marginBottom: 12,
  },
  panelTitle: { fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 },
  liftRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  lift: {
    backgroundColor: colors.background, borderRadius: 99,
    paddingHorizontal: 10, paddingVertical: 4, maxWidth: 120,
  },
  liftOn: { backgroundColor: "#052E16" },
  liftText: { fontSize: 11, color: colors.mutedForeground, fontWeight: "600" },
  liftTextOn: { color: "#4ADE80" },
});
```

Implementation note for the `weightBuckets` probe: if the probe approach reads
poorly, export `bucketIndexFor(date, scope, today): number` from statsPeriod
(a thin wrapper over the internal `bucketIndex` + `periodRange`) and use it
directly — cleaner than the session-shaped probe; add a two-line unit test for
it. Either implementation is acceptable; prefer the export.

A delta in green even when negative would lie — set the delta color inline:
`<Text style={[styles.tileDelta, t.delta.startsWith("-") && { color: colors.mutedForeground }]}>`.

- [ ] **Step 2: Screen integration**

In `GymSessionsScreen.tsx`'s stats branch, replace the weekLine + balance
block + `statsComing` note with:

```tsx
{view === "stats" && (
  <>
    <StatsTab sessions={sessions} weightSeries={weightSeries} today={today} />
    {bars.length > 0 && (
      /* the balance block JSX moves here unchanged, below the charts */
    )}
  </>
)}
```

Delete the `statsComing` style and, if now unused, the `weekLine`/
`weekLineText` styles and the `deltaLabel` computation (grep before deleting —
the delta line's job is replaced by the tiles' deltas).

- [ ] **Step 3: Full check + commit**

```bash
git add -A
git commit -m "feat(track): the stats tab earns its name - tiles, four charts, one scope"
```

### Task 7: Verification

- [ ] **Step 1:** `npx tsc --noEmit && npx jest` — clean, all suites green.

- [ ] **Step 2: Device walkthrough** (controller does this on the FitTracker
simulator with a Metro on a fresh port serving the worktree):

1. Stats tab, Week scope: four tiles with deltas, volume bars S–S, strength
   line with lift chips (tap a second lift), sessions bars, body-weight chart
   present only if weight was logged this week.
2. Month scope: W1..W5/6 buckets everywhere; Year: J..D buckets.
3. Hero: streak line shows rest-aware count and "· N weeks in a row" when >1.
4. History and Calendar tabs unchanged.
5. Balance bar still renders at the bottom of Stats.

- [ ] **Step 3:** Report results; stop for user review before any merge.

---

## Self-review notes

- Spec (Phase 2) coverage: global W/M/Y ✓ (T6), tiles+deltas ✓ (T1/T6), volume
  chart ✓, strength e1RM + picker ✓ (T2/T6), frequency ✓, body weight own
  chart ✓ (T4/T5/T6, user decision), rest-aware streak ✓ (T3), weeks-in-a-row ✓
  (T3). Records/goals deliberately absent (Phase 3).
- Single-axis rule holds: four charts, one measure each; no dual-axis anywhere;
  single-series charts carry no legend (titles name them) per the dataviz
  method; identity never rides on color alone (one series per plot).
- Type consistency: `StatScope`/`PeriodRange`/`WeightPoint` defined before use;
  `toUtc` exported T1, consumed T3; `weeksInARow` prop threaded to both
  HeroHeader call sites (grep for `<HeroHeader` — there are two).
- The bucket-probe wart in T6 has a sanctioned cleaner alternative documented
  inline (export `bucketIndexFor`).
