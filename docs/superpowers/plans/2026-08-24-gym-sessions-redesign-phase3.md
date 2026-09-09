# Gym Sessions Redesign — Phase 3 Implementation Plan (Goals & Records)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded weekly-goal default with a real, dated goal entity the user edits from the Stats tab, and add computed personal records — a Records section, an all-records drill-in, and `PR ×n` badges on session cards.

**Architecture:** One migration adds `weekly_goals` (dated history, per-user RLS). Records are **computed, never stored**: a dedicated slim query pulls every logged set's (exercise, weight, reps, volume, date) across all history — the History tab's 200-session fetch cannot see all 230 sessions, so records get their own unbounded, cheap-columns query. All record and goal arithmetic lands in pure lib modules with unit tests. Spec: `docs/superpowers/specs/2026-08-24-gym-sessions-redesign-design.md` (Phase 3).

**Tech Stack:** React Native (Expo), TypeScript, Supabase (untyped client — mapper-level fixtures for anything parsed), Jest, react-native-svg (existing chart components reused).

**Branch:** Create `gym-sessions-goals` off **origin/main** in a fresh worktree:
`git worktree add .claude/worktrees/gym-sessions-goals -b gym-sessions-goals origin/main`, then in `<worktree>/mobile`: `cp` the `.env` from the main checkout's `mobile/.env` and run `npm ci`. NEVER switch the primary checkout's branch — other sessions are working there.

## Decisions locked with the user (do not relitigate)

- **A PR requires beating a prior mark.** First-ever performance of an exercise sets the baseline silently and is NOT a record.
- **Muscle coverage = six major regions**, not all 19: Chest, Back, Shoulders, Arms, Legs, Core (mapping in Task 3).
- **Goal history is dated.** Each week is judged against the goal in force that week; changing today's goal must not rewrite last month's streak.
- Carried from earlier phases: no workout calories; goal ring counts the calendar week; modality chip stays absent until the movement model supplies it.

## MIGRATION COORDINATION — read before writing SQL

Other sessions are actively adding migrations in the `202608 25–26` range (latest on main: `20260826100000_attribute_dictionary.sql`; the movement-model roadmap has further stages queued). To avoid a version collision this plan uses **`20260901100000_weekly_goals.sql`** — deliberately past the contested range.

Before writing the file, re-check for collisions:
```bash
ls supabase/migrations/ | tail -5
git ls-remote --heads origin | awk '{print $2}'   # see what else is in flight
```
If `20260901100000` is taken, bump the day (`20260902100000`, …) and note it in your report.

Follow the repo's migration conventions exactly (see `20260825130000_equipment_junction_and_review_queue.sql`):
- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE … ENABLE ROW LEVEL SECURITY`
- policies wrapped in `DO $$ … IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE …) THEN CREATE POLICY … END IF; END $$;`
- per-user policy shape: `FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
- any function: `SET search_path TO 'public'` — never empty (see mobile/CLAUDE.md).

**Do NOT push the migration to the remote database.** Write it, and stop. The controller will run `npx supabase db push` after review — the live DB is shared with other in-flight work.

---

## Existing code you build on

- `mobile/src/lib/statsPeriod.ts` — `StatScope`, `periodRange`, `periodSummary`, `summaryDelta`, `formattedDelta`, `bucketSeries`, `bucketLabels`, `bucketIndexFor`, `estimatedOneRepMax`, `liftCandidates`, `strengthSeries`.
- `mobile/src/lib/sessionPresentation.ts` — `weekRail`, `RailDay`, `calendarWeekSessions`, `weeksInARow`, `DEFAULT_WEEKLY_SESSIONS_GOAL` (this plan retires the constant), `sessionTitle`, `regionsHit`, `mainExerciseCount`, `durationLine`, `formatSessionDate`.
- `mobile/src/lib/gymSessions.ts` — `sessionVolume`, `sessionMinutes`, `currentStreak(sessions, today, restDates)`, `muscleGroupOf`, `toUtc`, `dayDiff`, `formatVolume`, `formatMinutes`.
- `mobile/src/components/track/gym-sessions/` — `GymSessionsScreen.tsx`, `StatsTab.tsx`, `HeroHeader.tsx`, `SessionRow.tsx`, `PeriodBars.tsx`, `TrendLine.tsx`, `MiniMuscleMap.tsx`, `WeekStrip.tsx`, `HistoryCalendar.tsx`, `SessionDetailScreen.tsx`.
- `mobile/src/lib/supabase/gymSessions.ts` — `fetchGymSessions` (limit 200), `fetchGymSession`, `fetchWeightSeries`, `toSession` (exported for tests), `WeightPoint`.
- Route pattern for a new screen: `mobile/app/(tabs)/track/gym-sessions/[id].tsx` shows how a sub-route mounts a component; `_layout.tsx` registers screens.

Run everything from the worktree's `mobile/`. Full check: `npx tsc --noEmit && npx jest`.

---

### Task 1: Migration — weekly_goals

**Files:**
- Create: `supabase/migrations/20260901100000_weekly_goals.sql` (verify the version first, see above)

- [ ] **Step 1: Check for collisions**

Run: `ls supabase/migrations/ | tail -5` and confirm `20260901100000` is unused.

- [ ] **Step 2: Write the migration**

```sql
-- Weekly training goals, kept as dated history.
--
-- A goal change must not rewrite the past: "weeks in a row" judges each week
-- against the goal that was in force that week, so rows are append-only in
-- practice and the current goal is simply the latest effective_from <= today.
CREATE TABLE IF NOT EXISTS weekly_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The Sunday that starts the first week this goal governs.
  effective_from DATE NOT NULL,
  sessions_target INTEGER NOT NULL CHECK (sessions_target BETWEEN 1 AND 14),
  -- NULL means "not part of my goal", which is different from a target of 0.
  volume_target_lbs INTEGER CHECK (volume_target_lbs > 0),
  region_target INTEGER CHECK (region_target BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_weekly_goals_user_date
  ON weekly_goals(user_id, effective_from DESC);

ALTER TABLE weekly_goals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weekly_goals' AND policyname = 'own weekly goals'
  ) THEN
    CREATE POLICY "own weekly goals" ON weekly_goals FOR ALL
      TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

COMMENT ON TABLE weekly_goals IS 'Dated weekly goal history. The goal in force for a week is the latest row with effective_from <= that week''s Sunday; changing today''s goal never rewrites past weeks.';
```

- [ ] **Step 3: Do NOT push**

Report the file as written. The controller runs `npx supabase db push` after review.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260901100000_weekly_goals.sql
git commit -m "feat(db): weekly goals as dated history"
```
(Every commit in this plan: blank line then `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.)

### Task 2: Goal types, fetch, and save

**Files:**
- Create: `mobile/src/types/goals.ts`
- Create: `mobile/src/lib/supabase/weeklyGoals.ts`
- Create: `mobile/src/lib/__tests__/goalHistory.test.ts`
- Create: `mobile/src/lib/goalHistory.ts`

- [ ] **Step 1: Types**

`mobile/src/types/goals.ts`:

```ts
// A weekly training goal and its history. Targets are per calendar week.
export interface WeeklyGoal {
  id: string;
  /** The Sunday starting the first week this goal governs (YYYY-MM-DD). */
  effectiveFrom: string;
  sessionsTarget: number;
  /** Null means this metric is not part of the goal — not a target of zero. */
  volumeTargetLbs: number | null;
  regionTarget: number | null;
}

/** What the user can change; the effective date is derived, never typed. */
export interface WeeklyGoalDraft {
  sessionsTarget: number;
  volumeTargetLbs: number | null;
  regionTarget: number | null;
}
```

- [ ] **Step 2: Write the failing history tests**

`mobile/src/lib/__tests__/goalHistory.test.ts`:

```ts
import { DEFAULT_GOAL, goalForWeek, goalInForce } from "../goalHistory";
import type { WeeklyGoal } from "../../types/goals";

const goal = (effectiveFrom: string, sessionsTarget: number): WeeklyGoal => ({
  id: `g-${effectiveFrom}`, effectiveFrom, sessionsTarget,
  volumeTargetLbs: null, regionTarget: null,
});

// Goals arrive newest-first from the query; the helpers must not care.
const history = [goal("2026-08-23", 6), goal("2026-06-07", 4), goal("2026-01-04", 3)];

describe("goalInForce", () => {
  it("takes the newest goal not in the future", () => {
    expect(goalInForce(history, "2026-08-24").sessionsTarget).toBe(6);
  });
  it("falls back to the default before any goal was set", () => {
    expect(goalInForce(history, "2025-12-01")).toEqual(DEFAULT_GOAL);
    expect(goalInForce([], "2026-08-24")).toEqual(DEFAULT_GOAL);
  });
  it("ignores goals dated after the day asked about", () => {
    expect(goalInForce(history, "2026-07-01").sessionsTarget).toBe(4);
  });
});

describe("goalForWeek", () => {
  // A week is governed by the goal in force on the Sunday it starts, so a
  // goal changed mid-week does not move that week's bar.
  it("judges a week by its Sunday, not by today", () => {
    expect(goalForWeek(history, "2026-08-26").sessionsTarget).toBe(6); // week of 08-23
    expect(goalForWeek(history, "2026-08-20").sessionsTarget).toBe(4); // week of 08-16
  });
});
```

- [ ] **Step 3: Run to verify failure**, then implement `mobile/src/lib/goalHistory.ts`:

```ts
// Which goal governs a given day or week. Pure; the fetch lives in
// supabase/weeklyGoals.ts.
//
// A goal change must never rewrite the past — every question here is asked
// about a date, and answered with the goal that was in force on that date.
import { toUtc } from "./gymSessions";
import type { WeeklyGoal } from "../types/goals";

const dayMs = 86_400_000;

/** What a user is measured against before they ever set a goal. */
export const DEFAULT_GOAL: WeeklyGoal = {
  id: "default",
  effectiveFrom: "1970-01-01",
  sessionsTarget: 5,
  volumeTargetLbs: null,
  regionTarget: null,
};

/** The newest goal effective on or before `date`. */
export function goalInForce(history: WeeklyGoal[], date: string): WeeklyGoal {
  const applicable = history
    .filter((g) => g.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return applicable[0] ?? DEFAULT_GOAL;
}

/** The goal governing the calendar week containing `date`. */
export function goalForWeek(history: WeeklyGoal[], date: string): WeeklyGoal {
  const utc = toUtc(date);
  const sunday = new Date(utc - new Date(utc).getUTCDay() * dayMs)
    .toISOString()
    .slice(0, 10);
  return goalInForce(history, sunday);
}
```

- [ ] **Step 4: Fetch and save** — `mobile/src/lib/supabase/weeklyGoals.ts`:

```ts
// Reads and writes for the weekly-goal history.
import { supabase } from "../supabase";
import type { WeeklyGoal, WeeklyGoalDraft } from "../../types/goals";

const SELECT = "id, effective_from, sessions_target, volume_target_lbs, region_target";

const toGoal = (row: any): WeeklyGoal => ({
  id: row.id,
  effectiveFrom: row.effective_from,
  sessionsTarget: Number(row.sessions_target),
  volumeTargetLbs: row.volume_target_lbs === null ? null : Number(row.volume_target_lbs),
  regionTarget: row.region_target === null ? null : Number(row.region_target),
});

export async function fetchGoalHistory(userId: string): Promise<WeeklyGoal[]> {
  const { data, error } = await supabase
    .from("weekly_goals")
    .select(SELECT)
    .eq("user_id", userId)
    .order("effective_from", { ascending: false });
  if (error) {
    console.error("fetchGoalHistory failed:", error.message);
    return [];
  }
  return (data ?? []).map(toGoal);
}

/**
 * Save a goal effective from the given week's Sunday. Upsert on
 * (user_id, effective_from) so editing twice in one week corrects that week
 * rather than stacking rows.
 */
export async function saveWeeklyGoal(
  userId: string,
  weekStart: string,
  draft: WeeklyGoalDraft,
): Promise<boolean> {
  const { error } = await supabase.from("weekly_goals").upsert(
    {
      user_id: userId,
      effective_from: weekStart,
      sessions_target: draft.sessionsTarget,
      volume_target_lbs: draft.volumeTargetLbs,
      region_target: draft.regionTarget,
    },
    { onConflict: "user_id,effective_from" },
  );
  if (error) {
    console.error("saveWeeklyGoal failed:", error.message);
    return false;
  }
  return true;
}
```

- [ ] **Step 5: Full check + commit**

```bash
git add -A
git commit -m "feat(track): weekly goals - dated history, fetch, save"
```

### Task 3: Coverage regions and goal progress

**Files:**
- Create: `mobile/src/lib/goalProgress.ts`
- Create: `mobile/src/lib/__tests__/goalProgress.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { MAJOR_REGIONS, majorRegionOf, goalProgress, regionsCoveredIn } from "../goalProgress";
import type { HistoryExercise, HistorySession, HistorySet } from "../../types/gymSessions";
import type { WeeklyGoal } from "../../types/goals";

const set = (over: Partial<HistorySet> = {}): HistorySet => ({
  setNumber: 1, reps: 10, weightLbs: 100, volumeLbs: 1000, isWarmup: false,
  difficulty: null, startedAt: null, endedAt: null, durationSeconds: null,
  timingSource: null, ...over,
});
const exercise = (regions: string[], sets: HistorySet[], name = "Movement"): HistoryExercise => ({
  id: `ex-${name}-${regions.join("")}`, exerciseId: `id-${name}`, name, order: 1,
  difficulty: null, primaryRegions: regions, sets,
});
const session = (date: string, exercises: HistoryExercise[]): HistorySession => ({
  id: `s-${date}-${exercises.length}`, date, sessionNumber: 1, sessionCount: 1,
  startedAt: null, endedAt: null, durationSeconds: 3600, name: null,
  source: "unknown", capturedWorkoutId: null, capturedWorkoutHandle: null,
  estimatedMinutes: null, mainBlockWorkoutName: null, exercises,
});
const goal = (over: Partial<WeeklyGoal> = {}): WeeklyGoal => ({
  id: "g", effectiveFrom: "2026-08-23", sessionsTarget: 5,
  volumeTargetLbs: null, regionTarget: null, ...over,
});

describe("majorRegionOf", () => {
  it("folds the seeded regions into six", () => {
    expect(MAJOR_REGIONS).toEqual(["Chest", "Back", "Shoulders", "Arms", "Legs", "Core"]);
    expect(majorRegionOf("Chest")).toBe("Chest");
    expect(majorRegionOf("Lats")).toBe("Back");
    expect(majorRegionOf("Upper Back")).toBe("Back");
    expect(majorRegionOf("Lower Back")).toBe("Back");
    expect(majorRegionOf("Biceps")).toBe("Arms");
    expect(majorRegionOf("Forearms / Grip")).toBe("Arms");
    expect(majorRegionOf("Quads")).toBe("Legs");
    expect(majorRegionOf("Glutes")).toBe("Legs");
    expect(majorRegionOf("Hip Abductors")).toBe("Legs");
    expect(majorRegionOf("Obliques")).toBe("Core");
  });
  // Full Body trains everything and nothing in particular — counting it as a
  // region would let one entry satisfy coverage.
  it("does not map Full Body or unknown regions", () => {
    expect(majorRegionOf("Full Body")).toBeNull();
    expect(majorRegionOf("Gills")).toBeNull();
  });
});

describe("regionsCoveredIn", () => {
  it("counts distinct major regions from working sets", () => {
    const sessions = [
      session("2026-08-24", [exercise(["Chest", "Triceps"], [set()])]),
      session("2026-08-25", [exercise(["Lats"], [set()])]),
      session("2026-08-26", [exercise(["Quads"], [set({ isWarmup: true })])]),
    ];
    expect(regionsCoveredIn(sessions)).toEqual(["Chest", "Back", "Arms"]);
  });
});

describe("goalProgress", () => {
  const sessions = [
    session("2026-08-24", [exercise(["Chest"], [set({ volumeLbs: 12000 })])]),
    session("2026-08-25", [exercise(["Lats"], [set({ volumeLbs: 8000 })])]),
  ];
  it("reports sessions against the target", () => {
    const p = goalProgress(sessions, goal({ sessionsTarget: 5 }));
    expect(p.sessions).toEqual({ done: 2, target: 5, met: false });
  });
  it("omits metrics the goal does not set", () => {
    const p = goalProgress(sessions, goal());
    expect(p.volume).toBeNull();
    expect(p.regions).toBeNull();
  });
  it("reports volume and regions when set", () => {
    const p = goalProgress(sessions, goal({ volumeTargetLbs: 15000, regionTarget: 3 }));
    expect(p.volume).toEqual({ done: 20000, target: 15000, met: true });
    expect(p.regions).toEqual({ done: 2, target: 3, met: false });
  });
  it("counts a met goal when the target is exactly reached", () => {
    const p = goalProgress(sessions, goal({ sessionsTarget: 2 }));
    expect(p.sessions.met).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**, then implement `mobile/src/lib/goalProgress.ts`:

```ts
// Weekly goal progress, and the six-region vocabulary coverage speaks in.
//
// Coverage is judged on six major regions rather than the 19 seeded ones:
// hitting all nineteen weekly is not a real training week, and a goal nobody
// can meet is not a goal.
import { sessionVolume } from "./gymSessions";
import type { HistorySession } from "../types/gymSessions";
import type { WeeklyGoal } from "../types/goals";

export type MajorRegion = "Chest" | "Back" | "Shoulders" | "Arms" | "Legs" | "Core";

export const MAJOR_REGIONS: MajorRegion[] = [
  "Chest", "Back", "Shoulders", "Arms", "Legs", "Core",
];

const REGION_MAP: Record<string, MajorRegion> = {
  Chest: "Chest",
  Lats: "Back",
  "Upper Back": "Back",
  "Lower Back": "Back",
  "Neck / Traps": "Back",
  Shoulders: "Shoulders",
  Biceps: "Arms",
  Triceps: "Arms",
  "Forearms / Grip": "Arms",
  Quads: "Legs",
  Hamstrings: "Legs",
  Glutes: "Legs",
  Calves: "Legs",
  "Hip Abductors": "Legs",
  "Hip Adductors": "Legs",
  "Hip Flexors": "Legs",
  Core: "Core",
  Obliques: "Core",
};

/** Null for Full Body and anything unseeded — neither earns coverage credit. */
export function majorRegionOf(region: string): MajorRegion | null {
  return REGION_MAP[region] ?? null;
}

/** Major regions worked, in MAJOR_REGIONS order, judged on working sets. */
export function regionsCoveredIn(sessions: HistorySession[]): MajorRegion[] {
  const hit = new Set<MajorRegion>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (!ex.sets.some((x) => !x.isWarmup)) continue;
      for (const region of ex.primaryRegions) {
        const major = majorRegionOf(region);
        if (major) hit.add(major);
      }
    }
  }
  return MAJOR_REGIONS.filter((r) => hit.has(r));
}

export interface GoalMetric {
  done: number;
  target: number;
  met: boolean;
}

export interface GoalProgress {
  sessions: GoalMetric;
  /** Null when the goal does not set this metric. */
  volume: GoalMetric | null;
  regions: GoalMetric | null;
}

const metric = (done: number, target: number): GoalMetric => ({
  done, target, met: done >= target,
});

/** Progress for ONE week — pass only that week's sessions. */
export function goalProgress(
  weekSessions: HistorySession[],
  goal: WeeklyGoal,
): GoalProgress {
  const volume = weekSessions.reduce((t, s) => t + sessionVolume(s), 0);
  return {
    sessions: metric(weekSessions.length, goal.sessionsTarget),
    volume: goal.volumeTargetLbs === null ? null : metric(volume, goal.volumeTargetLbs),
    regions:
      goal.regionTarget === null
        ? null
        : metric(regionsCoveredIn(weekSessions).length, goal.regionTarget),
  };
}
```

- [ ] **Step 3: Full check + commit**

```bash
git add -A
git commit -m "feat(track): goal progress and the six major regions"
```

### Task 4: Records — slim fetch and computation

**Files:**
- Create: `mobile/src/types/records.ts`
- Create: `mobile/src/lib/personalRecords.ts`
- Create: `mobile/src/lib/__tests__/personalRecords.test.ts`
- Modify: `mobile/src/lib/supabase/gymSessions.ts`

- [ ] **Step 1: Types** — `mobile/src/types/records.ts`:

```ts
// Personal records are computed from set history, never stored: the moment a
// set is edited or deleted, a stored record would be a lie.

/** One logged working set, flattened — the only shape record math needs. */
export interface SetFact {
  exerciseId: string;
  exerciseName: string;
  sessionId: string;
  date: string;
  weightLbs: number;
  reps: number;
  volumeLbs: number;
}

export type RecordKind = "weight" | "e1rm" | "sessionVolume";

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  kind: RecordKind;
  value: number;
  date: string;
  sessionId: string;
  /** What this beat. A record always beats something — firsts are not records. */
  previous: number;
}
```

- [ ] **Step 2: The slim fetch** — append to `mobile/src/lib/supabase/gymSessions.ts`:

```ts
/**
 * Every working set ever logged, flattened, for record computation.
 *
 * Deliberately separate from fetchGymSessions: that read is capped at 200
 * sessions for the history list, and an ALL-TIME record cannot be computed
 * from a window. This query carries only the six columns record math needs.
 */
export async function fetchSetFacts(userId: string): Promise<SetFact[]> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(`
      id, session_date,
      exercises:exercise_instances(
        exercise_id,
        exercise:exercises(name),
        sets:set_instances(actual_reps, actual_weight_lbs, volume_lbs, is_warmup)
      )
    `)
    .eq("user_id", userId)
    .order("session_date", { ascending: true });
  if (error) {
    console.error("fetchSetFacts failed:", error.message);
    return [];
  }
  const facts: SetFact[] = [];
  for (const row of data ?? []) {
    for (const ex of (row as any).exercises ?? []) {
      const name = first<any>(ex.exercise)?.name;
      if (!ex.exercise_id || !name) continue;
      for (const s of ex.sets ?? []) {
        if (s.is_warmup) continue;
        facts.push({
          exerciseId: ex.exercise_id,
          exerciseName: name,
          sessionId: (row as any).id,
          date: (row as any).session_date,
          weightLbs: Number(s.actual_weight_lbs ?? 0),
          reps: Number(s.actual_reps ?? 0),
          volumeLbs: Number(s.volume_lbs ?? 0),
        });
      }
    }
  }
  return facts;
}
```

Add `SetFact` to the file's type imports.

- [ ] **Step 3: Write the failing record tests** — `mobile/src/lib/__tests__/personalRecords.test.ts`:

```ts
import { computeRecords, recordsBySession } from "../personalRecords";
import type { SetFact } from "../../types/records";

const fact = (over: Partial<SetFact> = {}): SetFact => ({
  exerciseId: "bench", exerciseName: "Bench Press", sessionId: "s1",
  date: "2026-01-01", weightLbs: 100, reps: 5, volumeLbs: 500, ...over,
});

describe("computeRecords", () => {
  // A first performance sets the baseline; it is not a record (user decision).
  it("does not call a first performance a record", () => {
    expect(computeRecords([fact()])).toEqual([]);
  });

  it("records a heavier top set against the previous best", () => {
    const records = computeRecords([
      fact({ date: "2026-01-01", weightLbs: 100, sessionId: "s1" }),
      fact({ date: "2026-01-08", weightLbs: 110, sessionId: "s2" }),
    ]);
    const weight = records.find((r) => r.kind === "weight");
    expect(weight).toMatchObject({ value: 110, previous: 100, date: "2026-01-08", sessionId: "s2" });
  });

  it("ignores a lighter session entirely", () => {
    const records = computeRecords([
      fact({ date: "2026-01-01", weightLbs: 110 }),
      fact({ date: "2026-01-08", weightLbs: 100, sessionId: "s2" }),
    ]);
    expect(records.filter((r) => r.sessionId === "s2")).toEqual([]);
  });

  it("catches an e1RM record even when the weight is not a record", () => {
    const records = computeRecords([
      fact({ date: "2026-01-01", weightLbs: 200, reps: 1 }),   // e1RM 200
      fact({ date: "2026-01-08", weightLbs: 180, reps: 5, sessionId: "s2" }), // e1RM 210
    ]);
    expect(records.find((r) => r.kind === "weight")).toBeUndefined();
    expect(records.find((r) => r.kind === "e1rm")).toMatchObject({ value: 210, previous: 200 });
  });

  it("records session volume per exercise", () => {
    const records = computeRecords([
      fact({ date: "2026-01-01", volumeLbs: 500 }),
      fact({ date: "2026-01-08", volumeLbs: 400, sessionId: "s2" }),
      fact({ date: "2026-01-08", volumeLbs: 400, sessionId: "s2" }),
    ]);
    expect(records.find((r) => r.kind === "sessionVolume")).toMatchObject({
      value: 800, previous: 500, sessionId: "s2",
    });
  });

  it("keeps exercises independent", () => {
    const records = computeRecords([
      fact({ exerciseId: "bench", weightLbs: 200, date: "2026-01-01" }),
      fact({ exerciseId: "row", exerciseName: "Row", weightLbs: 100, date: "2026-01-08", sessionId: "s2" }),
    ]);
    expect(records).toEqual([]); // row's first, bench unbeaten
  });

  it("ignores unloaded work — bodyweight sets have no weight record", () => {
    const records = computeRecords([
      fact({ weightLbs: 0, volumeLbs: 0, date: "2026-01-01" }),
      fact({ weightLbs: 0, volumeLbs: 0, date: "2026-01-08", sessionId: "s2" }),
    ]);
    expect(records.filter((r) => r.kind !== "sessionVolume")).toEqual([]);
  });
});

describe("recordsBySession", () => {
  it("counts records per session for the card badge", () => {
    const records = computeRecords([
      fact({ date: "2026-01-01", weightLbs: 100, volumeLbs: 500 }),
      fact({ date: "2026-01-08", weightLbs: 120, volumeLbs: 600, sessionId: "s2" }),
    ]);
    expect(recordsBySession(records).get("s2")).toBe(3); // weight, e1rm, sessionVolume
  });
});
```

- [ ] **Step 4: Run to verify failure**, then implement `mobile/src/lib/personalRecords.ts`:

```ts
// Personal records, computed from flattened set history.
//
// A record must beat a prior mark: the first time you perform a movement sets
// the baseline silently, so a new program does not paint every card with PRs.
// Three kinds per exercise — heaviest set, best estimated 1RM, and the biggest
// single session by volume — because they answer different questions and a
// session can set one without the others.
import { estimatedOneRepMax } from "./statsPeriod";
import type { PersonalRecord, RecordKind, SetFact } from "../types/records";

interface Best {
  weight: number;
  e1rm: number;
  sessionVolume: number;
}

/** One session's contribution to one exercise. */
interface SessionRollup {
  sessionId: string;
  date: string;
  exerciseId: string;
  exerciseName: string;
  weight: number;
  e1rm: number;
  volume: number;
}

function rollup(facts: SetFact[]): SessionRollup[] {
  const byKey = new Map<string, SessionRollup>();
  for (const f of facts) {
    const key = `${f.sessionId}|${f.exerciseId}`;
    const row = byKey.get(key) ?? {
      sessionId: f.sessionId, date: f.date, exerciseId: f.exerciseId,
      exerciseName: f.exerciseName, weight: 0, e1rm: 0, volume: 0,
    };
    row.weight = Math.max(row.weight, f.weightLbs);
    const e = estimatedOneRepMax([
      {
        setNumber: 1, reps: f.reps, weightLbs: f.weightLbs, volumeLbs: f.volumeLbs,
        isWarmup: false, difficulty: null, startedAt: null, endedAt: null,
        durationSeconds: null, timingSource: null,
      },
    ]);
    row.e1rm = Math.max(row.e1rm, e ?? 0);
    row.volume += f.volumeLbs;
    byKey.set(key, row);
  }
  // Chronological, so "previous best" means what it says.
  return [...byKey.values()].sort((a, b) =>
    a.date === b.date ? a.sessionId.localeCompare(b.sessionId) : a.date < b.date ? -1 : 1,
  );
}

/** Every record ever set, oldest first. */
export function computeRecords(facts: SetFact[]): PersonalRecord[] {
  const best = new Map<string, Best>();
  const records: PersonalRecord[] = [];
  for (const row of rollup(facts)) {
    const prior = best.get(row.exerciseId);
    const candidates: [RecordKind, number, number | undefined][] = [
      ["weight", row.weight, prior?.weight],
      ["e1rm", row.e1rm, prior?.e1rm],
      ["sessionVolume", row.volume, prior?.sessionVolume],
    ];
    for (const [kind, value, previous] of candidates) {
      // Unloaded work has no weight or 1RM to beat; a first has nothing to beat.
      if (value <= 0 || previous === undefined || value <= previous) continue;
      records.push({
        exerciseId: row.exerciseId, exerciseName: row.exerciseName, kind,
        value, date: row.date, sessionId: row.sessionId, previous,
      });
    }
    best.set(row.exerciseId, {
      weight: Math.max(prior?.weight ?? 0, row.weight),
      e1rm: Math.max(prior?.e1rm ?? 0, row.e1rm),
      sessionVolume: Math.max(prior?.sessionVolume ?? 0, row.volume),
    });
  }
  return records;
}

/** How many records each session set — the card badge's number. */
export function recordsBySession(records: PersonalRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.sessionId, (counts.get(r.sessionId) ?? 0) + 1);
  return counts;
}

/** The current best per exercise per kind, newest record first. */
export function currentRecords(records: PersonalRecord[]): PersonalRecord[] {
  const latest = new Map<string, PersonalRecord>();
  for (const r of records) latest.set(`${r.exerciseId}|${r.kind}`, r);
  return [...latest.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
```

- [ ] **Step 5: Full check + commit**

```bash
git add -A
git commit -m "feat(track): personal records computed from set history"
```

### Task 5: Goal editor sheet

**Files:**
- Create: `mobile/src/components/track/gym-sessions/GoalEditorSheet.tsx`

- [ ] **Step 1: Build the sheet**

A bottom sheet Modal (the app's convention — never inline pickers, per house rules). It takes the current goal and calls back with a draft.

```tsx
// Editing the weekly goal. A sheet from the bottom, never an inline picker.
import React, { useState } from "react";
import {
  Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/lib/colors";
import { MAJOR_REGIONS } from "@/src/lib/goalProgress";
import type { WeeklyGoal, WeeklyGoalDraft } from "@/src/types/goals";

const SESSION_OPTIONS = [2, 3, 4, 5, 6, 7];
const VOLUME_OPTIONS = [null, 20000, 40000, 60000, 80000, 100000];

export function GoalEditorSheet({
  visible, goal, onClose, onSave,
}: {
  visible: boolean;
  goal: WeeklyGoal;
  onClose: () => void;
  onSave: (draft: WeeklyGoalDraft) => void;
}) {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState(goal.sessionsTarget);
  const [volume, setVolume] = useState<number | null>(goal.volumeTargetLbs);
  const [regions, setRegions] = useState<number | null>(goal.regionTarget);

  // Re-seed when a different goal arrives (sheet is mounted once).
  React.useEffect(() => {
    if (visible) {
      setSessions(goal.sessionsTarget);
      setVolume(goal.volumeTargetLbs);
      setRegions(goal.regionTarget);
    }
  }, [visible, goal]);

  const Row = ({
    label, hint, children,
  }: { label: string; hint: string; children: React.ReactNode }) => (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowHint}>{hint}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );

  const Chip = ({
    on, label, onPress,
  }: { on: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Weekly goal</Text>
          <ScrollView>
            <Row label="Sessions" hint="Workouts per week">
              {SESSION_OPTIONS.map((n) => (
                <Chip key={n} on={sessions === n} label={String(n)} onPress={() => setSessions(n)} />
              ))}
            </Row>
            <Row label="Volume" hint="Total weight moved — optional">
              {VOLUME_OPTIONS.map((v) => (
                <Chip
                  key={String(v)}
                  on={volume === v}
                  label={v === null ? "Off" : `${v / 1000}k`}
                  onPress={() => setVolume(v)}
                />
              ))}
            </Row>
            <Row label="Muscle coverage" hint={`Of ${MAJOR_REGIONS.length} major regions — optional`}>
              <Chip on={regions === null} label="Off" onPress={() => setRegions(null)} />
              {MAJOR_REGIONS.map((_, i) => (
                <Chip
                  key={i}
                  on={regions === i + 1}
                  label={String(i + 1)}
                  onPress={() => setRegions(i + 1)}
                />
              ))}
            </Row>
            {/* Primary action at the end of the scroll, never pinned. */}
            <TouchableOpacity
              style={styles.save}
              onPress={() => onSave({ sessionsTarget: sessions, volumeTargetLbs: volume, regionTarget: regions })}
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>Save goal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background, borderTopLeftRadius: 20,
    borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10, maxHeight: "80%",
  },
  grabber: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: "center", marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground, marginBottom: 14 },
  row: { marginBottom: 18 },
  rowLabel: { fontSize: 14, fontWeight: "600", color: colors.foreground },
  rowHint: { fontSize: 11, color: colors.mutedForeground, marginTop: 2, marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.muted, borderRadius: 99,
    paddingHorizontal: 14, paddingVertical: 7, minWidth: 44, alignItems: "center",
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.mutedForeground, fontWeight: "600" },
  chipTextOn: { color: "#052E16" },
  save: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: "center", marginTop: 6,
  },
  saveText: { fontSize: 15, fontWeight: "700", color: "#052E16" },
  cancel: { paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 14, color: colors.mutedForeground },
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
git add -A
git commit -m "feat(track): a sheet for setting the weekly goal"
```

### Task 6: Records section and the all-records screen

**Files:**
- Create: `mobile/src/components/track/gym-sessions/RecordsSection.tsx`
- Create: `mobile/src/components/track/gym-sessions/AllRecordsScreen.tsx`
- Create: `mobile/app/(tabs)/track/gym-sessions/records.tsx`
- Modify: `mobile/app/(tabs)/track/_layout.tsx`

- [ ] **Step 1: Read the routing convention**

Read `mobile/app/(tabs)/track/gym-sessions/[id].tsx` and `mobile/app/(tabs)/track/_layout.tsx` and follow exactly how the detail screen is registered and mounted. The new route is `gym-sessions/records`.

- [ ] **Step 2: RecordsSection** (shown on the Stats tab, top N + drill-in link):

```tsx
// The headline records, with the rest a tap away.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "@/src/lib/colors";
import { formatVolume } from "@/src/lib/gymSessions";
import type { PersonalRecord } from "@/src/types/records";

const SHOWN = 3;

export const recordLabel = (r: PersonalRecord): string =>
  r.kind === "weight"
    ? `${Math.round(r.value)} lbs`
    : r.kind === "e1rm"
      ? `est. 1RM ${Math.round(r.value)} lbs`
      : `${formatVolume(r.value)} lbs in a session`;

export function RecordsSection({
  records, onSeeAll,
}: {
  records: PersonalRecord[];
  onSeeAll: () => void;
}) {
  if (records.length === 0) return null;
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Recent records 🏆</Text>
      {records.slice(0, SHOWN).map((r) => (
        <View key={`${r.exerciseId}-${r.kind}-${r.date}`} style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>{r.exerciseName}</Text>
          <Text style={styles.value}>{recordLabel(r)}</Text>
          <Text style={styles.beat}>beat {Math.round(r.previous)}</Text>
        </View>
      ))}
      {records.length > SHOWN && (
        <TouchableOpacity onPress={onSeeAll} accessibilityRole="button">
          <Text style={styles.link}>See all {records.length} records ›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.muted, borderRadius: 12, padding: 12, marginBottom: 12 },
  title: { fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 },
  row: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  name: { fontSize: 13, fontWeight: "600", color: colors.foreground },
  value: { fontSize: 12, color: "#4ADE80", marginTop: 2 },
  beat: { fontSize: 10, color: colors.mutedForeground, marginTop: 1 },
  link: { fontSize: 12, color: colors.primary, fontWeight: "600", marginTop: 10 },
});
```

- [ ] **Step 3: AllRecordsScreen** — full-screen list grouped by exercise, following the
`SessionDetailScreen.tsx` header/safe-area pattern exactly (read it first: `useSafeAreaInsets`,
`StatusBar`, back row with `ChevronLeft` + "Gym Sessions"-style label, `ScrollView`).
It fetches its own facts (`fetchSetFacts` → `computeRecords` → `currentRecords`) so the route
is self-sufficient, shows a loading spinner, and renders each exercise with its three current
bests (omitting kinds with no record). Group with:

```ts
const byExercise = new Map<string, PersonalRecord[]>();
for (const r of currentRecords(computeRecords(facts))) {
  byExercise.set(r.exerciseName, [...(byExercise.get(r.exerciseName) ?? []), r]);
}
```

Header label: "Records". Back label: "Gym Sessions".

- [ ] **Step 4: Route + layout registration** following the existing convention.

- [ ] **Step 5: Full check + commit**

```bash
git add -A
git commit -m "feat(track): records section and the all-records screen"
```

### Task 7: Wire goals and records into the screen

**Files:**
- Modify: `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx`
- Modify: `mobile/src/components/track/gym-sessions/StatsTab.tsx`
- Modify: `mobile/src/components/track/gym-sessions/HeroHeader.tsx`
- Modify: `mobile/src/components/track/gym-sessions/SessionRow.tsx`
- Modify: `mobile/src/lib/sessionPresentation.ts` (retire `DEFAULT_WEEKLY_SESSIONS_GOAL`)
- Modify: `mobile/src/lib/__tests__/sessionPresentation.test.ts`

- [ ] **Step 1: Screen state and loading**

In `GymSessionsScreen.tsx`:
- state: `goals: WeeklyGoal[]`, `setFacts: SetFact[]`, `goalSheetOpen: boolean`
- extend `load()`'s `Promise.all` with `fetchGoalHistory(user.id)` and `fetchSetFacts(user.id)`; keep the userId in state or a ref so the save handler can use it.
- memos:
  ```ts
  const currentGoal = useMemo(() => goalForWeek(goals, today), [goals, today]);
  const records = useMemo(() => computeRecords(setFacts), [setFacts]);
  const prCounts = useMemo(() => recordsBySession(records), [records]);
  const weekSessions = useMemo(
    () => sessions.filter((s) => { const r = periodRange("week", today); return s.date >= r.start && s.date <= r.end; }),
    [sessions, today],
  );
  const progress = useMemo(() => goalProgress(weekSessions, currentGoal), [weekSessions, currentGoal]);
  ```
- pass `goalTarget={currentGoal.sessionsTarget}` to both HeroHeader call sites (replacing `DEFAULT_WEEKLY_SESSIONS_GOAL`).
- save handler: `saveWeeklyGoal(userId, periodRange("week", today).start, draft)` then `await load()` and close the sheet.
- render `<GoalEditorSheet visible={goalSheetOpen} goal={currentGoal} onClose={...} onSave={...} />` as a sibling of the ScrollView.

- [ ] **Step 2: weeksInARow honors goal history**

In `sessionPresentation.ts`, change `weeksInARow(sessions, today)` to
`weeksInARow(sessions, today, goals: WeeklyGoal[] = [])`: a week counts when its session
count meets `goalForWeek(goals, thatWeeksSunday).sessionsTarget`. With no goals passed the
default goal applies (5/week) — **update the existing tests**, which assume ≥1: they must now
pass a goal history or assert against the default. Add a test:

```ts
it("judges each week by the goal in force that week", () => {
  const goals = [
    { id: "g2", effectiveFrom: "2026-08-16", sessionsTarget: 2, volumeTargetLbs: null, regionTarget: null },
    { id: "g1", effectiveFrom: "2026-01-04", sessionsTarget: 1, volumeTargetLbs: null, regionTarget: null },
  ];
  const sessions = [
    session({ id: "a", date: "2026-08-24" }), session({ id: "b", date: "2026-08-25" }),
    session({ id: "c", date: "2026-08-19" }), session({ id: "d", date: "2026-08-20" }),
    session({ id: "e", date: "2026-08-12" }), // week of 08-09, goal was 1
  ];
  expect(weeksInARow(sessions, "2026-08-24", goals)).toBe(3);
});
```

Then delete `DEFAULT_WEEKLY_SESSIONS_GOAL` and its test; grep for stragglers.

- [ ] **Step 3: Goals block on the Stats tab**

`StatsTab.tsx` gains props `progress: GoalProgress`, `onEditGoal: () => void`, `records: PersonalRecord[]`, `onSeeAllRecords: () => void`. Above the summary tiles, render a goals panel: a title row with an "Edit" button, then one bar per set metric:

```tsx
<View style={styles.panel}>
  <View style={styles.goalHead}>
    <Text style={styles.panelTitle}>Weekly goal</Text>
    <TouchableOpacity onPress={onEditGoal} accessibilityRole="button">
      <Text style={styles.edit}>Edit</Text>
    </TouchableOpacity>
  </View>
  {([
    ["Sessions", progress.sessions, (n: number) => String(n)],
    ...(progress.volume ? [["Volume", progress.volume, formatVolume] as const] : []),
    ...(progress.regions ? [["Muscle coverage", progress.regions, (n: number) => String(n)] as const] : []),
  ] as [string, GoalMetric, (n: number) => string][]).map(([label, m, fmt]) => (
    <View key={label} style={styles.goalRow}>
      <Text style={styles.goalLabel}>{label}</Text>
      <View style={styles.goalTrack}>
        <View style={[styles.goalFill, { width: `${Math.min((m.done / m.target) * 100, 100)}%` }]} />
      </View>
      <Text style={styles.goalValue}>{fmt(m.done)}/{fmt(m.target)}</Text>
    </View>
  ))}
</View>
```

Styles: `goalHead` row space-between; `edit` primary-colored 12pt; `goalRow` row with gap 8; `goalLabel` width 96 12pt muted; `goalTrack` flex:1 height 6 radius 99 background `colors.background`; `goalFill` height 100% background `colors.primary`; `goalValue` 10pt muted width 76 right-aligned.

Render `<RecordsSection records={records} onSeeAll={onSeeAllRecords} />` below the charts, above the balance bar.

- [ ] **Step 4: PR badges on cards**

`SessionRow.tsx` gains an optional `prCount?: number`. When `> 0`, render a chip after the region chips:

```tsx
{prCount ? (
  <View style={[styles.chip, styles.prChip]}>
    <Text style={[styles.chipText, styles.prChipText]}>PR ×{prCount}</Text>
  </View>
) : null}
```
with `prChip: { backgroundColor: "#241a2e" }` and `prChipText: { color: "#E879F9" }`.
Pass `prCount={prCounts.get(session.id) ?? 0}` at BOTH call sites in `GymSessionsScreen.tsx`
(list + day detail).

- [ ] **Step 5: Full check + commit**

```bash
git add -A
git commit -m "feat(track): goals drive the ring, records reach the cards"
```

### Task 8: Verification

- [ ] **Step 1:** `npx tsc --noEmit && npx jest` — clean, all suites green.

- [ ] **Step 2:** Report to the controller that the migration is ready but UNPUSHED. The controller pushes it and then runs the device walkthrough:
1. Stats tab shows the goals block; Edit opens the sheet from the bottom; saving updates ring + block.
2. Hero ring reflects the saved target (not 5).
3. Records section lists records; "See all" opens the records screen; back returns.
4. History cards show `PR ×n` on sessions that set records.
5. Changing the goal does not alter last week's contribution to weeks-in-a-row.

---

## Self-review notes

- Spec (Phase 3) coverage: goals entity ✓ (T1/T2), inline editing from Stats ✓ (T5/T7), sessions+volume+coverage targets ✓ (T3/T5), ring driven by real goal ✓ (T7), PR computation ✓ (T4), records section + drill-in ✓ (T6), PR badges ✓ (T7).
- User decisions encoded: firsts are not records (T4 test), six major regions (T3), dated goal history (T1/T2/T7 weeksInARow change).
- The 200-session history cap is why records get their own query (T4 comment) — the one non-obvious architectural point.
- Type consistency: `WeeklyGoal`/`WeeklyGoalDraft` (T2) → T5/T7; `SetFact`/`PersonalRecord` (T4) → T6/T7; `GoalProgress`/`GoalMetric` (T3) → T7.
- Migration is written but NOT pushed; controller owns the push because the live DB is shared with in-flight work.
