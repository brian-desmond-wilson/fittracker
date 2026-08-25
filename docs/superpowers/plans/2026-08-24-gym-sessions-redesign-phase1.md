# Gym Sessions Redesign — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Track > Gym Sessions as three sub-tabs (History / Stats / Calendar) with a collapsing hero header (goal ring, streak, week rail), named session cards with muscle heatmaps and est→actual durations, and a Month/Week calendar toggle.

**Architecture:** All new arithmetic/formatting lands in a new pure lib module (`sessionPresentation.ts`) with unit tests; the Supabase layer gains two fields on `HistorySession` (estimated minutes, main-block workout name) via SELECT extensions and a now-exported row mapper; three new components (MiniMuscleMap, HeroHeader, WeekStrip) compose into the reworked screen. Spec: `docs/superpowers/specs/2026-08-24-gym-sessions-redesign-design.md`.

**Tech Stack:** React Native (Expo), TypeScript, react-native-svg 15.12.1 (already a dependency), Jest, Supabase (untyped client — tsc proves nothing about column names; mapper tests use fixture rows).

**Branch:** Create `gym-sessions-redesign` off **main** (the repo may be checked out on `movement-model-foundation` — do not branch from it). Use a worktree per `superpowers:using-git-worktrees`.

**Phase 1 boundaries (from spec):** No weekly-goal entity (hardcoded default target), no PR badges, no trend charts (Stats tab gets the existing balance/summary content as interim), no modality chip rendering (slot only), streak stays the existing trained-days streak (rest-day-aware rework is Phase 2).

---

## Existing code you build on

- `mobile/src/lib/gymSessions.ts` — pure arithmetic: `sessionVolume`, `sessionMinutes`, `sessionPace`, `sessionEmphasis`, `weekSummary`, `currentStreak`, `balance`, `sessionsOn`, `monthWeeks`, `formatVolume`, `formatMinutes`, `GROUP_LABELS`. Internal `dayDiff`/`toUtc` helpers (Task 2 exports `dayDiff`).
- `mobile/src/lib/supabase/gymSessions.ts` — `fetchGymSessions(userId)`, `fetchGymSession(sessionId)`, internal `SELECT` string, `describe()` (name+source resolution), `toSession()` mapper (Task 1 exports it).
- `mobile/src/lib/supabase/daily.ts` — `fetchRestDates(userId): Promise<Set<string>>` (already wired into the screen).
- `mobile/src/components/track/gym-sessions/` — `GymSessionsScreen.tsx`, `SessionRow.tsx`, `HistoryCalendar.tsx` (fixed-seven-cell weeks + rest markers), `SessionDetailScreen.tsx`, `groupColors.ts` (`GROUP_COLORS`, `SOURCE_COLORS`, `SOURCE_LABELS`).
- `mobile/src/types/gymSessions.ts` — `HistorySession`, `HistoryExercise`, `HistorySet`, `MuscleGroup`, `SessionSource`, `WeekSummary`.
- DB columns (verified against `supabase/migrations/20260824000000_live_baseline.sql`): `program_workouts.estimated_duration_minutes`, `captured_workouts.est_minutes`, `generated_session_blocks(block, minutes, captured_workout_id)`, `generated_sessions.status` (`'rested'` marks rest days; `fetchRestDates` already interprets this).

Run all commands from `mobile/`. Full check before any commit: `npx tsc --noEmit && npx jest`.

---

### Task 1: Session mapper — estimated minutes + main-block name

**Files:**
- Modify: `mobile/src/types/gymSessions.ts`
- Modify: `mobile/src/lib/supabase/gymSessions.ts`
- Create: `mobile/src/lib/__tests__/gymSessionsMapping.test.ts`

- [ ] **Step 1: Extend the types**

In `mobile/src/types/gymSessions.ts`, change `HistorySession`'s `name` field and add two fields:

```ts
  /** Resolved template name; null when nothing served the session a title
   *  (the UI derives one via sessionTitle()). */
  name: string | null;
  source: SessionSource;
  /** Planned length in minutes from whatever template served the session. */
  estimatedMinutes: number | null;
  /** For block-composed daily sessions: the captured workout serving the
   *  'main' block. The naming rule's third preference. */
  mainBlockWorkoutName: string | null;
```

(`source` already exists — shown for placement. Only `name`'s type, `estimatedMinutes`, and `mainBlockWorkoutName` change/add.)

- [ ] **Step 2: Write the failing mapper tests**

Create `mobile/src/lib/__tests__/gymSessionsMapping.test.ts`:

```ts
import { toSession } from "../supabase/gymSessions";

// PostgREST returns nested one-to-ones as objects OR single-element arrays
// depending on the join; the mapper's first() normalises both. Fixtures use
// the array form since it is the shape that has broken before.
const baseRow = {
  id: "s1",
  session_number: 1,
  session_date: "2026-08-24",
  started_at: "2026-08-24T16:24:00Z",
  ended_at: "2026-08-24T18:40:00Z",
  duration_seconds: 8160,
  workout_instance: [{ id: "wi1", program_workout: null, generated_session: null }],
  exercises: [],
};

describe("toSession estimates and naming sources", () => {
  it("takes estimated minutes from the program workout", () => {
    const row = {
      ...baseRow,
      workout_instance: [{
        id: "wi1",
        program_workout: [{ name: "Push Strength", estimated_duration_minutes: 120 }],
        generated_session: null,
      }],
    };
    const s = toSession(row, 1);
    expect(s.name).toBe("Push Strength");
    expect(s.estimatedMinutes).toBe(120);
    expect(s.mainBlockWorkoutName).toBeNull();
  });

  it("takes estimated minutes from a whole-served captured workout", () => {
    const row = {
      ...baseRow,
      workout_instance: [{
        id: "wi1",
        program_workout: null,
        generated_session: [{
          split_day: null,
          served_captured_workout_id: "cw1",
          captured: [{ id: "cw1", name: "KB Chest & Triceps", est_minutes: 40, source: null }],
          blocks: [],
        }],
      }],
    };
    const s = toSession(row, 1);
    expect(s.name).toBe("KB Chest & Triceps");
    expect(s.estimatedMinutes).toBe(40);
  });

  it("sums block minutes and finds the main block's workout name", () => {
    const row = {
      ...baseRow,
      workout_instance: [{
        id: "wi1",
        program_workout: null,
        generated_session: [{
          split_day: null,
          served_captured_workout_id: null,
          captured: null,
          blocks: [
            { block: "warmup", minutes: 10, captured: [{ name: "Band Circuit" }] },
            { block: "main", minutes: 45, captured: [{ name: "1000 Rep Challenge" }] },
            { block: "cooldown", minutes: 5, captured: null },
          ],
        }],
      }],
    };
    const s = toSession(row, 1);
    expect(s.name).toBeNull(); // block sessions have no template title
    expect(s.mainBlockWorkoutName).toBe("1000 Rep Challenge");
    expect(s.estimatedMinutes).toBe(60);
  });

  it("leaves everything null when nothing served the session", () => {
    const s = toSession(baseRow, 1);
    expect(s.name).toBeNull();
    expect(s.estimatedMinutes).toBeNull();
    expect(s.mainBlockWorkoutName).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx jest src/lib/__tests__/gymSessionsMapping.test.ts`
Expected: FAIL — `toSession` is not exported (and fields don't exist).

- [ ] **Step 4: Extend SELECT, describe(), and toSession**

In `mobile/src/lib/supabase/gymSessions.ts`:

1. In the `SELECT` string, extend the nested selects (`program_workout`, `captured`, and add `blocks`):

```ts
const SELECT = `
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
  exercises:exercise_instances(
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
```

2. Rework `describe()` so its result carries the new fields, with the split-day
title kept and the final fallback becoming `null` (the "Workout" literal dies here):

```ts
interface NameAndSource {
  name: string | null;
  source: SessionSource;
  capturedWorkoutId: string | null;
  capturedWorkoutHandle: string | null;
  estimatedMinutes: number | null;
  mainBlockWorkoutName: string | null;
}

/** What this session should be called, and where it came from. */
function describe(instance: any): NameAndSource {
  const generated = first<any>(instance?.generated_session);
  const captured = first<any>(generated?.captured);
  const blocks: any[] = generated?.blocks ?? [];
  const mainBlockWorkoutName =
    first<any>(blocks.find((b) => b.block === "main")?.captured)?.name ?? null;
  const blockMinutes = blocks.reduce((t, b) => t + (b.minutes ?? 0), 0);

  if (generated?.served_captured_workout_id && captured) {
    return {
      name: captured.name,
      source: "catalog",
      capturedWorkoutId: generated.served_captured_workout_id,
      capturedWorkoutHandle: first<any>(captured.source)?.poster_handle ?? null,
      estimatedMinutes: captured.est_minutes ?? null,
      mainBlockWorkoutName,
    };
  }
  const program = first<any>(instance?.program_workout);
  if (program?.name) {
    return {
      name: program.name,
      source: "program",
      capturedWorkoutId: null,
      capturedWorkoutHandle: null,
      estimatedMinutes: program.estimated_duration_minutes ?? null,
      mainBlockWorkoutName,
    };
  }
  if (generated?.split_day) {
    return {
      name: SPLIT_TITLES[generated.split_day] ?? null,
      source: "recommended",
      capturedWorkoutId: null,
      capturedWorkoutHandle: null,
      estimatedMinutes: blockMinutes > 0 ? blockMinutes : null,
      mainBlockWorkoutName,
    };
  }
  if (generated) {
    // A block-composed daily session: no single template title.
    return {
      name: null,
      source: "recommended",
      capturedWorkoutId: null,
      capturedWorkoutHandle: null,
      estimatedMinutes: blockMinutes > 0 ? blockMinutes : null,
      mainBlockWorkoutName,
    };
  }
  return {
    name: null,
    source: "unknown",
    capturedWorkoutId: null,
    capturedWorkoutHandle: null,
    estimatedMinutes: null,
    mainBlockWorkoutName: null,
  };
}
```

3. Export the mapper: change `function toSession(` to `export function toSession(`.
(`describe`'s spread into the session object already carries the new fields through
`...described` — verify `toSession` uses `...describe(instance)`; it does today
via `...described`.)

- [ ] **Step 5: Run mapper tests and the full suite**

Run: `npx jest src/lib/__tests__/gymSessionsMapping.test.ts` → PASS.
Run: `npx tsc --noEmit` — expect **errors** where `session.name` is used as a
string (`SessionRow.tsx`, `SessionDetailScreen.tsx`, possibly test fixtures).
Task 3 fixes the UI; for now update only `src/lib/__tests__/gymSessions.test.ts`'s
`session()` fixture (add the two fields, keep `name: "Workout"` → change to
`name: null` if the fixture type errors):

```ts
  name: null,
  estimatedMinutes: null,
  mainBlockWorkoutName: null,
```

Do NOT commit yet if tsc still fails on the two screens — Tasks 2–3 complete the
ripple; commit happens at the end of Task 3.

### Task 2: sessionPresentation lib — dates, titles, counts, regions

**Files:**
- Modify: `mobile/src/lib/gymSessions.ts` (export `dayDiff`)
- Create: `mobile/src/lib/sessionPresentation.ts`
- Create: `mobile/src/lib/__tests__/sessionPresentation.test.ts`

- [ ] **Step 1: Export dayDiff**

In `mobile/src/lib/gymSessions.ts`, change `const dayDiff = ...` to
`export const dayDiff = ...` (it currently reads
`const dayDiff = (a: string, b: string): number => Math.round((toUtc(a) - toUtc(b)) / dayMs);`).

- [ ] **Step 2: Write the failing tests**

Create `mobile/src/lib/__tests__/sessionPresentation.test.ts`:

```ts
import {
  DEFAULT_WEEKLY_SESSIONS_GOAL,
  durationLine,
  formatSessionDate,
  mainExerciseCount,
  regionsHit,
  sessionTitle,
} from "../sessionPresentation";
import type { HistoryExercise, HistorySession, HistorySet } from "../../types/gymSessions";

const set = (over: Partial<HistorySet> = {}): HistorySet => ({
  setNumber: 1, reps: 10, weightLbs: 100, volumeLbs: 1000, isWarmup: false,
  difficulty: null, startedAt: null, endedAt: null, durationSeconds: null,
  timingSource: null, ...over,
});

const exercise = (regions: string[], sets: HistorySet[], name = "Movement"): HistoryExercise => ({
  id: `ex-${name}`, exerciseId: `id-${name}`, name, order: 1, difficulty: null,
  primaryRegions: regions, sets,
});

const session = (over: Partial<HistorySession> = {}): HistorySession => ({
  id: "s1", date: "2026-08-24", sessionNumber: 1, sessionCount: 1,
  startedAt: null, endedAt: null, durationSeconds: null, name: null,
  source: "unknown", capturedWorkoutId: null, capturedWorkoutHandle: null,
  estimatedMinutes: null, mainBlockWorkoutName: null, exercises: [], ...over,
});

describe("formatSessionDate", () => {
  const today = "2026-08-24"; // a Monday
  it("uses weekday format inside the trailing 7 days", () => {
    expect(formatSessionDate("2026-08-24", today)).toBe("Mon 24");
    expect(formatSessionDate("2026-08-18", today)).toBe("Tue 18");
  });
  it("uses month-day for older dates this year", () => {
    expect(formatSessionDate("2026-08-16", today)).toBe("Aug 16");
    expect(formatSessionDate("2026-01-03", today)).toBe("Jan 3");
  });
  it("uses MM/DD/YY for prior years", () => {
    expect(formatSessionDate("2025-08-16", today)).toBe("08/16/25");
    expect(formatSessionDate("2019-12-01", today)).toBe("12/01/19");
  });
  // The 7-day rule wins at the year boundary — recency beats the calendar.
  it("keeps weekday format across a year boundary within 7 days", () => {
    expect(formatSessionDate("2025-12-30", "2026-01-02")).toBe("Tue 30");
  });
});

describe("sessionTitle", () => {
  it("prefers the stored template name", () => {
    expect(sessionTitle(session({ name: "Push Strength" }))).toBe("Push Strength");
  });
  it("falls back to the main block's workout", () => {
    expect(sessionTitle(session({ mainBlockWorkoutName: "1000 Rep Challenge" })))
      .toBe("1000 Rep Challenge");
  });
  it("derives from emphasis when nothing was stored", () => {
    const s = session({ exercises: [exercise(["Chest"], [set(), set()])] });
    expect(sessionTitle(s)).toBe("Push Day");
  });
  it("never says Workout", () => {
    expect(sessionTitle(session())).toBe("Training Session");
  });
});

describe("mainExerciseCount", () => {
  it("counts only exercises with working sets", () => {
    const s = session({
      exercises: [
        exercise(["Chest"], [set({ isWarmup: true }), set()], "bench"),
        exercise([], [set({ isWarmup: true })], "warmup-only"),
        exercise(["Lats"], [set()], "row"),
      ],
    });
    expect(mainExerciseCount(s)).toBe(2);
  });
});

describe("durationLine", () => {
  it("shows est → actual when both exist", () => {
    const s = session({ estimatedMinutes: 120, durationSeconds: 8160 });
    expect(durationLine(s)).toBe("est 2h 0m → 2h 16m");
  });
  it("shows actual alone without an estimate", () => {
    expect(durationLine(session({ durationSeconds: 2520 }))).toBe("42m");
  });
  it("drops the estimate on split sessions — it described the whole workout", () => {
    const s = session({ estimatedMinutes: 120, durationSeconds: 2520, sessionCount: 2 });
    expect(durationLine(s)).toBe("42m");
  });
  it("is null with no timing at all", () => {
    expect(durationLine(session({ estimatedMinutes: 45 }))).toBeNull();
  });
});

describe("regionsHit", () => {
  it("orders regions by working-set count and ignores warm-ups", () => {
    const s = session({
      exercises: [
        exercise(["Chest", "Triceps"], [set(), set(), set()], "bench"),
        exercise(["Triceps"], [set(), set()], "pushdown"),
        exercise(["Quads"], [set({ isWarmup: true })], "warmup-squat"),
      ],
    });
    expect(regionsHit(s)).toEqual(["Triceps", "Chest"]);
  });
});

describe("goal default", () => {
  it("exists until the goals entity lands", () => {
    expect(DEFAULT_WEEKLY_SESSIONS_GOAL).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx jest src/lib/__tests__/sessionPresentation.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement**

Create `mobile/src/lib/sessionPresentation.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests**

Run: `npx jest src/lib/__tests__/sessionPresentation.test.ts` → PASS.
(If `formatMinutes(120)` renders "2h 0m" differently, fix the TEST expectation to
match `formatMinutes`'s actual output — it is the existing app-wide format.)

### Task 3: Ripple the nullable name through the two screens

**Files:**
- Modify: `mobile/src/components/track/gym-sessions/SessionRow.tsx`
- Modify: `mobile/src/components/track/gym-sessions/SessionDetailScreen.tsx`

- [ ] **Step 1: SessionRow uses sessionTitle**

In `SessionRow.tsx` add to the lib import block:

```ts
import { sessionTitle } from "@/src/lib/gymSessions" // ← wrong module, see below
```

Correction — import from the new module (do not guess):

```ts
import { sessionTitle } from "@/src/lib/sessionPresentation";
```

Then inside the component: `const title = sessionTitle(session);` and replace
both uses of `session.name` (`accessibilityLabel` and the `<Text style={styles.name}>`)
with `title`. (This task only stops the bleeding from the type change — the full
card redesign is Task 6.)

- [ ] **Step 2: SessionDetailScreen uses sessionTitle**

In `SessionDetailScreen.tsx`, add the same import, and replace its
`{session.name}` title usage (the screen's `<Text>` under the header — find with
`grep -n "session.name" src/components/track/gym-sessions/SessionDetailScreen.tsx`)
with `{sessionTitle(session)}`.

- [ ] **Step 3: Full check**

Run: `npx tsc --noEmit && npx jest`
Expected: both clean — the Task 1 type ripple is fully resolved.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(track): sessions know their names — mapper estimates, naming rule, date formats"
```

### Task 4: Week rail arithmetic

**Files:**
- Modify: `mobile/src/lib/sessionPresentation.ts`
- Modify: `mobile/src/lib/__tests__/sessionPresentation.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `sessionPresentation.test.ts` (reuse its `session` fixture):

```ts
import { weekRail } from "../sessionPresentation"; // merge into the existing import

describe("weekRail", () => {
  const today = "2026-08-24"; // Monday; week runs Sun 08-23 .. Sat 08-29
  it("builds Sunday-first with trained, rest, empty, and future days", () => {
    const sessions = [session({ id: "a", date: "2026-08-24" })];
    const rail = weekRail(sessions, new Set(["2026-08-23"]), today);
    expect(rail.map((d) => d.date)).toEqual([
      "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26",
      "2026-08-27", "2026-08-28", "2026-08-29",
    ]);
    expect(rail.map((d) => d.state)).toEqual([
      "rest", "trained", "future", "future", "future", "future", "future",
    ]);
    expect(rail[0].label).toBe("S");
    expect(rail[1].label).toBe("M");
  });
  it("marks a past day with nothing as empty", () => {
    const rail = weekRail([], new Set(), "2026-08-25"); // Tuesday
    expect(rail[1].state).toBe("empty"); // Monday passed, nothing happened
    expect(rail[2].state).toBe("trained" as never); // placeholder — replaced next line
  });
});
```

Delete the deliberately-wrong last assertion and replace that second test with:

```ts
  it("marks a past day with nothing as empty, and today as empty until trained", () => {
    const rail = weekRail([], new Set(), "2026-08-25"); // Tuesday
    expect(rail[1].state).toBe("empty");  // Monday: passed, nothing
    expect(rail[2].state).toBe("empty");  // today: not trained yet, not future
    expect(rail[3].state).toBe("future"); // Wednesday
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/lib/__tests__/sessionPresentation.test.ts`
Expected: FAIL — `weekRail` is not exported.

- [ ] **Step 3: Implement**

Append to `sessionPresentation.ts`:

```ts
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
```

- [ ] **Step 4: Run tests, then commit**

Run: `npx jest src/lib/__tests__/sessionPresentation.test.ts` → PASS.

```bash
git add src/lib/sessionPresentation.ts src/lib/__tests__/sessionPresentation.test.ts
git commit -m "feat(track): week rail arithmetic - trained, rest, empty, future"
```

### Task 5: MiniMuscleMap component

**Files:**
- Create: `mobile/src/components/track/gym-sessions/MiniMuscleMap.tsx`

No unit test — pure presentation; verified on device in Task 9. The zone
mapping is data, and regions the map doesn't know simply light nothing.

- [ ] **Step 1: Create the component**

```tsx
// A body at a glance: front and back silhouettes with trained zones lit.
// Region names come from muscle_regions rows via regionsHit(); anything the
// zone table doesn't know is silently unlit rather than wrong.
import React from "react";
import Svg, { Circle, Ellipse, Rect } from "react-native-svg";
import { colors } from "@/src/lib/colors";

/** Which silhouette a zone draws on. */
type Side = "front" | "back";
interface Zone { side: Side; shapes: React.ReactElement[] }

const lit = colors.primary;

/** Shared silhouette scaffold, 24×44 viewBox per figure. */
function Figure({ children, x }: { children: React.ReactNode; x: number }) {
  return (
    <>
      <Circle cx={x + 12} cy={5} r={3.4} fill="#1F2937" />
      <Rect x={x + 6.5} y={9.5} width={11} height={15} rx={4} fill="#1F2937" />
      <Rect x={x + 2.5} y={10.5} width={3.4} height={12} rx={1.7} fill="#1F2937" />
      <Rect x={x + 18.1} y={10.5} width={3.4} height={12} rx={1.7} fill="#1F2937" />
      <Rect x={x + 6.8} y={25} width={4.6} height={14} rx={2.2} fill="#1F2937" />
      <Rect x={x + 12.6} y={25} width={4.6} height={14} rx={2.2} fill="#1F2937" />
      {children}
    </>
  );
}

/** Region name → highlight shapes. Coordinates are inside the 24-wide figure;
 *  the caller offsets front (x=0) and back (x=26). */
function zoneShapes(region: string, x: number): { side: Side; el: React.ReactElement } | null {
  const k = region.toLowerCase();
  const el = (side: Side, node: React.ReactElement) => ({ side, el: node });
  if (k.includes("chest")) return el("front", <Ellipse cx={x + 12} cy={13} rx={5} ry={2.6} fill={lit} />);
  if (k.includes("shoulder")) return el("front", <><Circle cx={x + 5.5} cy={11} r={2} fill={lit} /><Circle cx={x + 18.5} cy={11} r={2} fill={lit} /></>);
  if (k.includes("bicep")) return el("front", <><Rect x={x + 2.7} y={12} width={3} height={5} rx={1.5} fill={lit} /><Rect x={x + 18.3} y={12} width={3} height={5} rx={1.5} fill={lit} /></>);
  if (k.includes("tricep")) return el("back", <><Rect x={x + 2.7} y={12} width={3} height={5} rx={1.5} fill={lit} /><Rect x={x + 18.3} y={12} width={3} height={5} rx={1.5} fill={lit} /></>);
  if (k.includes("forearm") || k.includes("grip")) return el("front", <><Rect x={x + 2.7} y={17.5} width={3} height={4.5} rx={1.5} fill={lit} /><Rect x={x + 18.3} y={17.5} width={3} height={4.5} rx={1.5} fill={lit} /></>);
  if (k.includes("core") || k.includes("abs")) return el("front", <Rect x={x + 9} y={16.5} width={6} height={7} rx={2} fill={lit} />);
  if (k.includes("oblique")) return el("front", <><Rect x={x + 7} y={17} width={2.2} height={6} rx={1.1} fill={lit} /><Rect x={x + 14.8} y={17} width={2.2} height={6} rx={1.1} fill={lit} /></>);
  if (k.includes("lat")) return el("back", <><Rect x={x + 6.8} y={13.5} width={3.4} height={7} rx={1.7} fill={lit} /><Rect x={x + 13.8} y={13.5} width={3.4} height={7} rx={1.7} fill={lit} /></>);
  if (k.includes("trap") || k.includes("neck")) return el("back", <Ellipse cx={x + 12} cy={10.5} rx={4.4} ry={1.8} fill={lit} />);
  if (k.includes("upper back") || k.includes("rhomboid")) return el("back", <Rect x={x + 8} y={12} width={8} height={4} rx={2} fill={lit} />);
  if (k.includes("lower back") || k.includes("posterior")) return el("back", <Rect x={x + 8.5} y={19.5} width={7} height={4} rx={2} fill={lit} />);
  if (k.includes("glute")) return el("back", <Ellipse cx={x + 12} cy={25.5} rx={5} ry={2.6} fill={lit} />);
  if (k.includes("quad") || k.includes("hip flexor")) return el("front", <><Rect x={x + 7} y={26} width={4.2} height={7.5} rx={2} fill={lit} /><Rect x={x + 12.8} y={26} width={4.2} height={7.5} rx={2} fill={lit} /></>);
  if (k.includes("hamstring")) return el("back", <><Rect x={x + 7} y={27} width={4.2} height={7} rx={2} fill={lit} /><Rect x={x + 12.8} y={27} width={4.2} height={7} rx={2} fill={lit} /></>);
  if (k.includes("abductor") || k.includes("adductor")) return el("front", <><Rect x={x + 5.9} y={26} width={2} height={5} rx={1} fill={lit} /><Rect x={x + 16.1} y={26} width={2} height={5} rx={1} fill={lit} /></>);
  if (k.includes("calv") || k.includes("calf") || k.includes("tibialis")) return el("back", <><Rect x={x + 7.2} y={34.5} width={3.8} height={4.5} rx={1.9} fill={lit} /><Rect x={x + 13} y={34.5} width={3.8} height={4.5} rx={1.9} fill={lit} /></>);
  if (k.includes("full body")) return el("front", <Rect x={x + 6.5} y={9.5} width={11} height={15} rx={4} fill={lit} opacity={0.55} />);
  return null;
}

/** width defaults to card size; pass a larger width on the detail screen. */
export function MiniMuscleMap({ regions, width = 40 }: { regions: string[]; width?: number }) {
  const front: React.ReactElement[] = [];
  const back: React.ReactElement[] = [];
  regions.forEach((region, i) => {
    const zf = zoneShapes(region, 0);
    if (zf?.side === "front") front.push(<React.Fragment key={`f${i}`}>{zf.el}</React.Fragment>);
    const zb = zoneShapes(region, 26);
    if (zb?.side === "back") back.push(<React.Fragment key={`b${i}`}>{zb.el}</React.Fragment>);
  });
  return (
    <Svg width={width} height={(width * 44) / 50} viewBox="0 0 50 44">
      <Figure x={0}>{front}</Figure>
      <Figure x={26}>{back}</Figure>
    </Svg>
  );
}
```

- [ ] **Step 2: Typecheck, commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/track/gym-sessions/MiniMuscleMap.tsx
git commit -m "feat(track): mini muscle map - front/back silhouettes with lit zones"
```

### Task 6: Session card redesign

**Files:**
- Modify: `mobile/src/components/track/gym-sessions/SessionRow.tsx`

- [ ] **Step 1: Rework the card**

Replace `SessionRow.tsx`'s body (keep the file's export shape and props). Full
new component:

```tsx
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { formatVolume, sessionPace, sessionVolume } from "@/src/lib/gymSessions";
import {
  durationLine, formatSessionDate, mainExerciseCount, regionsHit, sessionTitle,
} from "@/src/lib/sessionPresentation";
import { SOURCE_COLORS, SOURCE_LABELS } from "./groupColors";
import type { HistorySession } from "@/src/types/gymSessions";
import { MiniMuscleMap } from "./MiniMuscleMap";

const CARD_REGION_CHIPS = 3;

export function SessionRow({
  session,
  today,
  onPress,
  showDate = true,
}: {
  session: HistorySession;
  today: string;
  onPress: () => void;
  showDate?: boolean;
}) {
  const title = sessionTitle(session);
  const volume = sessionVolume(session);
  const pace = sessionPace(session);
  const duration = durationLine(session);
  const regions = regionsHit(session);
  const exercises = mainExerciseCount(session);
  const source = SOURCE_COLORS[session.source] ?? SOURCE_COLORS.unknown;

  // Only what is actually known — a session with no timing shouldn't wear a
  // dash where its duration would be.
  const meta = [
    `${exercises} exercise${exercises === 1 ? "" : "s"}`,
    duration,
    volume > 0 ? `${formatVolume(volume)} lbs` : null,
    pace ? `${pace} lb/min` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const clock = session.startedAt
    ? new Date(session.startedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${meta}. Open the session.`}
    >
      <MiniMuscleMap regions={regions} />
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.name} numberOfLines={1}>{title}</Text>
          <Text style={styles.when}>
            {showDate ? formatSessionDate(session.date, today) : clock}
          </Text>
        </View>
        <Text style={styles.meta}>{meta}</Text>
        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: source.bg }]}>
            <Text style={[styles.chipText, { color: source.fg }]}>
              {SOURCE_LABELS[session.source] ?? "Logged"}
            </Text>
          </View>
          {regions.slice(0, CARD_REGION_CHIPS).map((region) => (
            <View key={region} style={styles.chip}>
              <Text style={styles.chipText}>{region}</Text>
            </View>
          ))}
          {/* Modality/category chip renders here once the movement model
              supplies it — the slot is this comment. */}
          {session.sessionCount > 1 && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                {session.sessionNumber} of {session.sessionCount} sessions
              </Text>
            </View>
          )}
        </View>
      </View>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  body: { flex: 1 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.foreground },
  when: { fontSize: 12, color: colors.mutedForeground },
  meta: { fontSize: 12, color: colors.mutedForeground, marginTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: colors.muted, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  chipText: { fontSize: 11, color: colors.mutedForeground, fontWeight: "600" },
});
```

Note the new required `today` prop (the date rule needs it, and the screen
already holds a single `today` sample — no second clock). The emphasis chip
(group dot) is gone: region chips replace it, and the heatmap carries the
at-a-glance role.

- [ ] **Step 2: Fix the two call sites**

`GymSessionsScreen.tsx` renders `<SessionRow ...>` twice (list + day detail):
add `today={today}` to both. Run `npx tsc --noEmit` to catch any others.

- [ ] **Step 3: Full check, commit**

Run: `npx tsc --noEmit && npx jest` → clean.

```bash
git add -A
git commit -m "feat(track): session cards - heatmap, region chips, est vs actual"
```

### Task 7: HeroHeader component

**Files:**
- Create: `mobile/src/components/track/gym-sessions/HeroHeader.tsx`

- [ ] **Step 1: Create the component**

```tsx
// The page's headline: goal ring, streak, this week as seven pills, and the
// week's numbers. Collapses to one row when the list needs the screen.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Flame } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { formatMinutes, formatVolume } from "@/src/lib/gymSessions";
import type { RailDay } from "@/src/lib/sessionPresentation";
import type { WeekSummary } from "@/src/types/gymSessions";

function GoalRing({ done, target, size }: { done: number; target: number; size: number }) {
  const stroke = size / 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = target > 0 ? Math.min(done / target, 1) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.muted} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={colors.primary} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
          strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.ringText, { fontSize: size / 4.4 }]} accessibilityLabel={`${done} of ${target} sessions`}>
        {done}/{target}
      </Text>
    </View>
  );
}

export function HeroHeader({
  goalDone, goalTarget, streakDays, rail, week, collapsed,
}: {
  goalDone: number;
  goalTarget: number;
  streakDays: number;
  rail: RailDay[];
  week: WeekSummary;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <View style={styles.compact}>
        <GoalRing done={goalDone} target={goalTarget} size={34} />
        <Text style={styles.compactText}>
          {streakDays > 0 ? `🔥 ${streakDays} · ` : ""}
          {formatVolume(week.volumeLbs)} lbs this week
        </Text>
      </View>
    );
  }
  const toGo = Math.max(goalTarget - goalDone, 0);
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <GoalRing done={goalDone} target={goalTarget} size={52} />
        <View style={styles.heroLines}>
          <Text style={styles.heroTitle}>
            {toGo === 0 ? "Weekly goal met" : `Weekly goal · ${toGo} to go`}
          </Text>
          {streakDays > 0 && (
            <View style={styles.streak}>
              <Flame size={11} color="#86EFAC" />
              <Text style={styles.streakText}>
                {streakDays}-day streak
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.rail}>
        {rail.map((day) => (
          <View
            key={day.date}
            style={[
              styles.pill,
              day.state === "trained" && styles.pillTrained,
              day.state === "future" && styles.pillFuture,
            ]}
          >
            <Text style={[styles.pillText, day.state === "trained" && styles.pillTextTrained]}>
              {day.state === "rest" ? "💤" : day.label}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>SESSIONS</Text>
          <Text style={styles.tileValue}>{week.sessions}</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>VOLUME</Text>
          <Text style={styles.tileValue}>{formatVolume(week.volumeLbs)}</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>TIME</Text>
          <Text style={styles.tileValue}>{formatMinutes(week.minutes)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.muted, borderRadius: 14, padding: 12, marginBottom: 12,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroLines: { flex: 1, gap: 4 },
  heroTitle: { fontSize: 14, fontWeight: "700", color: colors.foreground },
  ringText: { position: "absolute", color: colors.foreground, fontWeight: "700" },
  streak: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    backgroundColor: "#14532D", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3,
  },
  streakText: { fontSize: 11, color: "#86EFAC", fontWeight: "600" },
  rail: { flexDirection: "row", gap: 4, marginTop: 10 },
  pill: {
    flex: 1, alignItems: "center", paddingVertical: 5,
    backgroundColor: colors.background, borderRadius: 7,
  },
  pillTrained: { backgroundColor: "#14532D" },
  pillFuture: { opacity: 0.45 },
  pillText: { fontSize: 10, color: colors.mutedForeground, fontWeight: "600" },
  pillTextTrained: { color: "#86EFAC" },
  tiles: { flexDirection: "row", gap: 8, marginTop: 10 },
  tile: { flex: 1, backgroundColor: colors.background, borderRadius: 10, padding: 10 },
  tileLabel: { fontSize: 10, color: colors.mutedForeground, letterSpacing: 0.5 },
  tileValue: { fontSize: 17, fontWeight: "700", color: colors.foreground, marginTop: 3 },
  compact: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.muted, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12,
  },
  compactText: { fontSize: 12, color: colors.foreground, fontWeight: "600" },
});
```

- [ ] **Step 2: Typecheck, commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/track/gym-sessions/HeroHeader.tsx
git commit -m "feat(track): hero header - goal ring, streak, week rail, collapse variant"
```

### Task 8: Three tabs + hero + interim Stats in the screen

**Files:**
- Modify: `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx`

- [ ] **Step 1: Rework the screen**

Changes, keeping the load/refresh/empty/loading scaffolding exactly as is:

1. Replace the view state and add collapse state:

```ts
const [view, setView] = useState<"history" | "stats" | "calendar">("history");
const [collapsed, setCollapsed] = useState(false);
```

2. Add imports:

```ts
import { HeroHeader } from "./HeroHeader";
import {
  DEFAULT_WEEKLY_SESSIONS_GOAL, weekRail,
} from "@/src/lib/sessionPresentation";
```

3. Add the rail memo next to the existing ones:

```ts
const rail = useMemo(
  () => weekRail(sessions, restDates, today),
  [sessions, restDates, today],
);
```

4. Make the ScrollView drive collapse (threshold with hysteresis so it doesn't
flicker at the boundary):

```tsx
<ScrollView
  contentContainerStyle={styles.content}
  scrollEventThrottle={32}
  onScroll={(e) => {
    const y = e.nativeEvent.contentOffset.y;
    setCollapsed((c) => (c ? y > 90 : y > 130));
  }}
  refreshControl={...unchanged...}
>
```

5. Inside the non-empty branch, replace everything from `styles.tiles` through
the `weekLine` block (the balance block moves to the Stats tab) with:

```tsx
<HeroHeader
  goalDone={week.sessions}
  goalTarget={DEFAULT_WEEKLY_SESSIONS_GOAL}
  streakDays={streak}
  rail={rail}
  week={week}
  collapsed={collapsed}
/>
```

6. Replace the two-way toggle with three tabs:

```tsx
<View style={styles.toggle}>
  {(["history", "stats", "calendar"] as const).map((v) => (
    <TouchableOpacity
      key={v}
      style={[styles.toggleTab, view === v && styles.toggleTabOn]}
      onPress={() => setView(v)}
      accessibilityRole="button"
      accessibilityState={{ selected: view === v }}
    >
      <Text style={[styles.toggleText, view === v && styles.toggleTextOn]}>
        {v === "history" ? "History" : v === "stats" ? "Stats" : "Calendar"}
      </Text>
    </TouchableOpacity>
  ))}
</View>
```

7. Render per tab. `history` → the existing `sessions.map(...)` list.
`calendar` → the existing calendar + day-detail block, untouched in this task.
`stats` → the balance block that used to sit in the header, plus the
this-week/delta line, plus an honest placeholder for Phase 2:

```tsx
{view === "stats" && (
  <>
    <View style={styles.weekLine}>
      <Text style={styles.weekLineText}>This week · {deltaLabel}</Text>
    </View>
    {bars.length > 0 && (
      /* the balanceBlock JSX moves here verbatim from the old header */
    )}
    <Text style={styles.statsComing}>
      Trends, records, and period stats land in Phase 2.
    </Text>
  </>
)}
```

Add the style: `statsComing: { fontSize: 12, color: colors.mutedForeground, marginTop: 16, textAlign: "center" },`

8. The old `tiles`/`tile`/`tileLabel`/`tileValue`/`streak`/`streakText` styles
become unused in this file once HeroHeader owns them — delete them here.

- [ ] **Step 2: Full check, commit**

Run: `npx tsc --noEmit && npx jest` → clean.

```bash
git add -A
git commit -m "feat(track): gym sessions gets history/stats/calendar tabs and the hero"
```

### Task 9: Calendar Month/Week toggle + WeekStrip

**Files:**
- Create: `mobile/src/components/track/gym-sessions/WeekStrip.tsx`
- Modify: `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx`

- [ ] **Step 1: Create WeekStrip**

```tsx
// The current week as seven tappable day cards: date, volume, or 💤.
// The month grid answers "how consistent"; this answers "how was this week".
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "@/src/lib/colors";
import { formatVolume, sessionVolume, sessionsOn } from "@/src/lib/gymSessions";
import type { RailDay } from "@/src/lib/sessionPresentation";
import type { HistorySession } from "@/src/types/gymSessions";

export function WeekStrip({
  rail, sessions, selected, onSelect,
}: {
  rail: RailDay[];
  sessions: HistorySession[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  return (
    <View style={styles.strip}>
      {rail.map((day) => {
        const daySessions = sessionsOn(sessions, day.date);
        const volume = daySessions.reduce((t, s) => t + sessionVolume(s), 0);
        const isSelected = day.date === selected;
        return (
          <TouchableOpacity
            key={day.date}
            style={[styles.card, isSelected && styles.cardSelected, day.state === "future" && styles.cardFuture]}
            disabled={daySessions.length === 0}
            onPress={() => onSelect(day.date)}
            accessibilityRole="button"
            accessibilityLabel={`${day.date}, ${
              day.state === "rest" ? "rest day" : `${daySessions.length} sessions`
            }`}
          >
            <Text style={styles.day}>{day.label}</Text>
            <Text style={[styles.num, isSelected && styles.numSelected]}>
              {Number(day.date.slice(8))}
            </Text>
            <Text style={styles.vol}>
              {day.state === "rest" ? "💤" : volume > 0 ? formatVolume(volume) : " "}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", gap: 5 },
  card: {
    flex: 1, alignItems: "center", backgroundColor: colors.muted,
    borderRadius: 9, paddingVertical: 7, gap: 2,
    borderWidth: 1, borderColor: "transparent",
  },
  cardSelected: { borderColor: colors.primary },
  cardFuture: { opacity: 0.45 },
  day: { fontSize: 9, color: colors.mutedForeground },
  num: { fontSize: 13, fontWeight: "700", color: colors.foreground },
  numSelected: { color: colors.primary },
  vol: { fontSize: 8, color: "#86EFAC", minHeight: 10 },
});
```

- [ ] **Step 2: Add the Month/Week toggle to the calendar tab**

In `GymSessionsScreen.tsx`: add state and import.

```ts
import { WeekStrip } from "./WeekStrip";
const [calView, setCalView] = useState<"month" | "week">("month");
```

In the calendar branch, above `<HistoryCalendar ...>`, insert a small segmented
control (reuses the toggle styles with a narrower container):

```tsx
<View style={[styles.toggle, styles.calToggle]}>
  {(["month", "week"] as const).map((v) => (
    <TouchableOpacity
      key={v}
      style={[styles.toggleTab, calView === v && styles.toggleTabOn]}
      onPress={() => setCalView(v)}
      accessibilityRole="button"
      accessibilityState={{ selected: calView === v }}
    >
      <Text style={[styles.toggleText, calView === v && styles.toggleTextOn]}>
        {v === "month" ? "Month" : "Week"}
      </Text>
    </TouchableOpacity>
  ))}
</View>
```

Render `calView === "month"` → existing `<HistoryCalendar ...>`;
`calView === "week"` → `<WeekStrip rail={rail} sessions={sessions} selected={selectedDate} onSelect={setSelectedDate} />`.
The existing `selectedDate` day-detail block below stays and serves both views.

Add style: `calToggle: { alignSelf: "flex-start", width: 170, marginBottom: 12 },`

- [ ] **Step 3: Full check, commit**

Run: `npx tsc --noEmit && npx jest` → clean.

```bash
git add -A
git commit -m "feat(track): calendar tab gets a month/week toggle"
```

### Task 10: Full verification

- [ ] **Step 1: Suite + typecheck**

Run: `npx tsc --noEmit && npx jest`
Expected: clean, all suites green.

- [ ] **Step 2: Device verification (dedicated simulator + unique Metro port per the usual isolation rule)**

Walk each of these on the FitTracker simulator and screenshot:

1. History tab: hero (ring, streak, rail with any 💤 days), cards show real
   titles (none say "Workout"), heatmaps lit sensibly, region chips, est→actual
   on sessions that have estimates, MM/DD/YY only on prior-year rows.
2. Scroll the list: hero collapses to the compact row and returns on scroll-up
   without flicker.
3. Stats tab: balance bar + week line + Phase 2 note.
4. Calendar tab: month grid unchanged (dots + rest markers), Week toggle shows
   the strip, tapping a day in each view opens the same day detail.
5. Session detail screen still opens and shows the derived title.

- [ ] **Step 3: Report**

Summarize screenshots and any deviations; stop for user review before any merge
(no PRs on this project — merges go straight to main when the user says so).

---

## Self-review notes

- Spec coverage (Phase 1 list): tabs ✓ (T8), hero + collapse ✓ (T7/T8), naming ✓
  (T1/T2/T3), cards ✓ (T5/T6), date formats ✓ (T2), calendar toggle + rest
  markers ✓ (T9, markers pre-existing), interim stats ✓ (T8), goal-ring default ✓
  (T2/T8). Phase 2/3 items deliberately absent.
- Type consistency: `RailDay`/`weekRail` defined T4, consumed T7/T8/T9;
  `sessionTitle` defined T2, consumed T3/T6; `today` prop added T6 and supplied
  in both call sites; `toSession` export used only by tests.
- Split-session estimate rule encoded in `durationLine` and tested.
