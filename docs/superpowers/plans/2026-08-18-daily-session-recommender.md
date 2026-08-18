# Daily Session Recommender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Today tab composes a five-block session (warm-up → mobility → main → conditioning → cool-down) from whole catalog workouts, steered by soreness, energy, rolling muscle coverage, and the time budget.

**Architecture:** Rules tier (pure TS modules, client-side) classifies nothing and computes everything: recovery-day gate, per-block time envelopes, per-block shortlists from AI-tagged catalog workouts, built-in fallbacks. One constrained AI call picks one candidate per block and writes a one-line reason; the client re-validates and falls back to top-of-rank picks. Tags are AI-assigned at capture (lazy backfill for existing workouts), a usage ledger drives coverage and variety.

**Tech Stack:** React Native/Expo, Supabase (Postgres + Deno edge functions), OpenAI gpt-5.6-terra, Jest.

**Spec:** `docs/superpowers/specs/2026-08-18-daily-session-recommender-design.md`

**House rules that bind every task:**
- Suggest-only boundary: the AI writes no rows; the client validates every id against what it offered.
- One clock sample per compute; dates are `YYYY-MM-DD` strings passed in.
- Pure modules take data, never talk to the network; network code lives in `mobile/src/lib/supabase/`.
- Supabase client is untyped — `tsc` proves nothing about column names; check spelling against the migration.
- All commands run from `mobile/` unless the path says otherwise.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260818100000_block_recommender.sql` | Create: workout tag columns, `captured_workout_muscles`, `captured_workout_usage`, `generated_session_blocks`; widen section CHECK with `mobility` |
| `supabase/migrations/20260818110000_block_recommender_fixes.sql` | Create: review amendments — see "Task 1 amendments" below |
| `mobile/src/types/dailyBlocks.ts` | Create: all block-recommender types |
| `mobile/src/types/daily.ts` | Modify: add `"mobility"` to `SessionSection`; add `blocks` to `StoredSession` |
| `mobile/src/types/capture.ts` | Modify: `CapturedWorkoutEntry.tags` |
| `mobile/src/lib/dailyBuiltins.ts` | Create: shipped fallback routines + lookup |
| `mobile/src/lib/dailyCoverage.ts` | Create: rolling 7-day muscle coverage from the ledger |
| `mobile/src/lib/dailyBlockBudget.ts` | Create: per-block time envelopes + round-trim fitting |
| `mobile/src/lib/dailyBlockShortlist.ts` | Create: recovery gate, body focus, per-block shortlists |
| `mobile/src/lib/dailyBlockCompose.ts` | Create: rules fallback pick, AI answer validator, reroll cycling |
| `mobile/src/lib/workoutTagValidate.ts` | Create: classify-response validator |
| `mobile/src/lib/supabase/workoutTags.ts` | Create: tag fetch/save, classify call, usage ledger reads/writes |
| `mobile/src/lib/supabase/daily.ts` | Modify: persist/read blocks, ledger on completion, reroll write |
| `mobile/src/hooks/useDailySession.ts` | Modify: swap engine to block composition (same external contract) |
| `mobile/src/lib/dailySectionMinutes.ts`, `mobile/src/lib/dailyCompose.ts` | Modify: `mobility` in SECTIONS arrays |
| `supabase/functions/capture-post/index.ts` | Modify: new `classify` action |
| `supabase/functions/compose-session/index.ts` | Modify: new `blocks` mode |
| `mobile/src/components/training/daily/TodayTab.tsx` | Modify: five-block card, reroll, nudges, recovery day |
| `mobile/src/components/training/daily/CapturedWorkoutScreen.tsx` | Modify: tag display + editor |

Test files mirror sources in `mobile/src/lib/__tests__/`.

---

### Task 1: Schema migration + types

**Files:**
- Create: `supabase/migrations/20260818100000_block_recommender.sql`
- Create: `mobile/src/types/dailyBlocks.ts`
- Modify: `mobile/src/types/daily.ts:5` (SessionSection), `:92-99` (StoredSession)
- Modify: `mobile/src/types/capture.ts:122` (CapturedWorkoutEntry)
- Modify: `mobile/src/lib/dailySectionMinutes.ts:31`, `mobile/src/lib/dailyCompose.ts:13`
- Modify: `mobile/src/components/training/daily/TodayTab.tsx:18-25`

- [ ] **Step 1: Write the migration**

```sql
-- Block recommender: whole-workout daily composition. 2026-08-18.
-- Spec: docs/superpowers/specs/2026-08-18-daily-session-recommender-design.md §3, §7.

-- §3.1 Workout tags, AI-assigned at capture, user-editable.
ALTER TABLE public.captured_workouts
  ADD COLUMN IF NOT EXISTS block_roles TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS est_minutes INTEGER CHECK (est_minutes BETWEEN 1 AND 240),
  ADD COLUMN IF NOT EXISTS intensity TEXT CHECK (intensity IN ('low', 'moderate', 'high')),
  ADD COLUMN IF NOT EXISTS skill_level TEXT
    CHECK (skill_level IN ('Beginner', 'Intermediate', 'Advanced')),
  -- NULL = never classified; the recommender skips untagged workouts (spec §8).
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

-- Workout-level muscle tags (spec §3.1) — the workout's own story, not a
-- derivation from its exercises, because tags are editable.
CREATE TABLE IF NOT EXISTS public.captured_workout_muscles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_workout_id UUID NOT NULL
    REFERENCES public.captured_workouts(id) ON DELETE CASCADE,
  muscle_region_id UUID NOT NULL
    REFERENCES public.muscle_regions(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (captured_workout_id, muscle_region_id)
);
CREATE INDEX IF NOT EXISTS captured_workout_muscles_workout
  ON public.captured_workout_muscles (captured_workout_id);

-- §3.2 Usage ledger. Muscles are denormalized AT TIME OF PERFORMANCE so a
-- later retag doesn't rewrite training history.
CREATE TABLE IF NOT EXISTS public.captured_workout_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  captured_workout_id UUID NOT NULL
    REFERENCES public.captured_workouts(id) ON DELETE CASCADE,
  performed_date DATE NOT NULL,
  block TEXT NOT NULL
    CHECK (block IN ('warmup', 'mobility', 'main', 'conditioning', 'cooldown')),
  -- [{"name": "Chest", "isPrimary": true}, ...]
  muscles JSONB NOT NULL DEFAULT '[]',
  session_id UUID REFERENCES public.generated_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS captured_workout_usage_user_date
  ON public.captured_workout_usage (user_id, performed_date);

-- Block-level plan of a composed session. Items still explode into
-- generated_session_items for logging; built-in blocks have no item rows
-- (their movements are static app data, not exercises).
CREATE TABLE IF NOT EXISTS public.generated_session_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL
    REFERENCES public.generated_sessions(id) ON DELETE CASCADE,
  block TEXT NOT NULL
    CHECK (block IN ('warmup', 'mobility', 'main', 'conditioning', 'cooldown')),
  captured_workout_id UUID REFERENCES public.captured_workouts(id) ON DELETE SET NULL,
  builtin_key TEXT,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 240),
  rounds_note TEXT,
  reason TEXT,
  block_order INTEGER NOT NULL,
  CHECK (captured_workout_id IS NOT NULL OR builtin_key IS NOT NULL),
  UNIQUE (session_id, block)
);
CREATE INDEX IF NOT EXISTS generated_session_blocks_session
  ON public.generated_session_blocks (session_id);

-- §7 Sections migration: mobility joins the vocabulary; conditioning reuses
-- the existing accessory slot; old rows untouched.
ALTER TABLE public.generated_session_items
  DROP CONSTRAINT IF EXISTS generated_session_items_section_check;
ALTER TABLE public.generated_session_items
  ADD CONSTRAINT generated_session_items_section_check
  CHECK (section IN ('warmup', 'mobility', 'main', 'accessory', 'bfr', 'cooldown'));

ALTER TABLE public.captured_workout_muscles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captured_workout_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_session_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own workout muscles" ON public.captured_workout_muscles;
CREATE POLICY "Users manage own workout muscles"
  ON public.captured_workout_muscles FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.captured_workouts w
    WHERE w.id = captured_workout_id AND w.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.captured_workouts w
    WHERE w.id = captured_workout_id AND w.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own workout usage" ON public.captured_workout_usage;
CREATE POLICY "Users manage own workout usage"
  ON public.captured_workout_usage FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own session blocks" ON public.generated_session_blocks;
CREATE POLICY "Users manage own session blocks"
  ON public.generated_session_blocks FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.generated_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.generated_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()));

COMMENT ON TABLE public.captured_workout_usage IS
  'One row per catalog workout actually performed: powers coverage, variety, and the future exercise-level engine.';
```

- [ ] **Step 2: Push it**

Run from repo root: `npx supabase db push --yes`
Expected: the new migration applies cleanly. If it fails, read the error — do not mark it repaired.

- [ ] **Step 3: Create `mobile/src/types/dailyBlocks.ts`**

```ts
// Types for the block recommender — whole-workout daily composition.
// Spec: docs/superpowers/specs/2026-08-18-daily-session-recommender-design.md.

export type BlockRole = "warmup" | "mobility" | "main" | "conditioning" | "cooldown";
export type WorkoutIntensity = "low" | "moderate" | "high";
export type BodyFocus = "upper" | "lower" | "full";

export interface WorkoutMuscle {
  name: string; // muscle_regions.name, verbatim
  isPrimary: boolean;
}

/** AI-assigned at capture, user-editable. classifiedAt null = untagged —
 *  excluded from recommendation until tagged (spec §8). */
export interface WorkoutTags {
  blockRoles: BlockRole[];
  muscles: WorkoutMuscle[];
  estMinutes: number | null;
  intensity: WorkoutIntensity | null;
  skillLevel: "Beginner" | "Intermediate" | "Advanced" | null;
  classifiedAt: string | null;
}

/** A catalog workout as the rules tier sees it. */
export interface TaggedWorkout {
  workoutId: string;
  name: string;
  rounds: string | null; // creator's rounds prescription, e.g. "3-4"
  tags: WorkoutTags;
  lastPerformedDaysAgo: number | null; // from the usage ledger; null = never
}

/** One ledger row (captured_workout_usage). */
export interface UsageRow {
  capturedWorkoutId: string;
  performedDate: string; // YYYY-MM-DD
  block: BlockRole;
  muscles: WorkoutMuscle[];
}

/** A shipped fallback routine — static app data, not a database row. */
export interface BuiltinRoutine {
  key: string; // stable id, e.g. "builtin-warmup-upper"
  name: string;
  role: Extract<BlockRole, "warmup" | "mobility" | "cooldown">;
  focus: BodyFocus;
  minutes: number;
  movements: { name: string; prescription: string }[];
}

export interface BlockEnvelope {
  block: BlockRole;
  minMinutes: number;
  maxMinutes: number;
}

/** One shortlist entry: a catalog workout fitted to its block's envelope, or
 *  a built-in. Minutes and roundsNote are precomputed here — the AI only
 *  picks, it never moves numbers. */
export interface BlockCandidate {
  workoutId: string | null; // null = built-in
  builtinKey: string | null;
  name: string;
  minutes: number;
  roundsNote: string | null; // e.g. "Do 3 of 4 rounds"
  muscles: WorkoutMuscle[];
  focus: BodyFocus;
  score: number;
}

export type BlockShortlists = Partial<Record<BlockRole, BlockCandidate[]>>;

export interface BlockPick {
  block: BlockRole;
  workoutId: string | null;
  builtinKey: string | null;
  minutes: number;
  roundsNote: string | null;
  reason: string | null;
}

/** A generated_session_blocks row joined for display. */
export interface StoredBlock extends BlockPick {
  id: string;
  name: string; // workout name, or the built-in's name resolved client-side
}
```

- [ ] **Step 4: Widen existing types**

In `mobile/src/types/daily.ts` change line 5 to:

```ts
export type SessionSection = "warmup" | "mobility" | "main" | "accessory" | "bfr" | "cooldown";
```

and extend `StoredSession` (line 92) with blocks:

```ts
/** A stored generated_sessions row with items joined for display. */
export interface StoredSession extends ComposedSession {
  id: string;
  sessionDate: string;
  status: "suggested" | "accepted" | "completed" | "skipped";
  workoutInstanceId: string | null;
  gymProfileId: string | null;
  items: (SessionItem & { id: string; name: string; wasPerformed: boolean | null })[];
  /** Empty for pre-block sessions and workouts served whole. */
  blocks: import("./dailyBlocks").StoredBlock[];
}
```

In `mobile/src/types/capture.ts` add to `CapturedWorkoutEntry` (after `items`):

```ts
  /** Block-recommender tags. classifiedAt null = never classified. */
  tags: import("./dailyBlocks").WorkoutTags;
```

In `mobile/src/lib/dailySectionMinutes.ts:31` and `mobile/src/lib/dailyCompose.ts:13` change the SECTIONS constant to:

```ts
const SECTIONS: SessionSection[] = ["warmup", "mobility", "main", "accessory", "bfr", "cooldown"];
```

In `mobile/src/components/training/daily/TodayTab.tsx:18-25` add mobility:

```ts
const SECTION_TITLES: Record<SessionSection, string> = {
  warmup: "Warm-up",
  mobility: "Mobility",
  main: "Main work",
  accessory: "Accessories",
  bfr: "BFR finisher",
  cooldown: "Cooldown",
};
const SECTION_ORDER: SessionSection[] = ["warmup", "mobility", "main", "accessory", "bfr", "cooldown"];
```

- [ ] **Step 5: Typecheck, test, commit**

Run: `npx tsc --noEmit` — expected: clean (capture.ts consumers may now need `tags`; if `toCapturedWorkoutEntry` errors, add a placeholder `tags` mapping there: `tags: { blockRoles: [], muscles: [], estMinutes: null, intensity: null, skillLevel: null, classifiedAt: null }` — Task 10 replaces it with the real read).
Run: `npm test` — expected: all existing suites pass (the widened union is additive).

```bash
git add -A && git commit -m "feat(daily): schema and types for the block recommender"
```

#### Task 1 amendments (from code review — migration `20260818110000_block_recommender_fixes.sql`)

The first migration shipped with a delete-breaking constraint and some missing
hardening. The amendment migration, and the final schema every later task
codes against:

1. **`generated_session_blocks` gains `name TEXT NOT NULL`** — the block's
   display name captured at compose time. `ON DELETE SET NULL` on
   `captured_workout_id` performs an UPDATE, and the original
   `CHECK (captured_workout_id IS NOT NULL OR builtin_key IS NOT NULL)` is
   enforced on UPDATE, so deleting a captured workout that had ever appeared
   in a block aborted the whole DELETE — breaking the shipped swipe-to-delete.
   The check is now **mutual exclusion**: `CHECK (captured_workout_id IS NULL
   OR builtin_key IS NULL)`. After a workout delete both columns are NULL and
   the row survives as named history.
2. **`captured_workout_usage` gains `UNIQUE (user_id, captured_workout_id,
   performed_date, block)`** — a retried completion would otherwise
   double-count that workout's muscles in the coverage weighting. Ledger
   writes upsert on this key.
3. **`captured_workout_usage.captured_workout_id` is now nullable, `ON DELETE
   SET NULL`** — CASCADE erased training history, contradicting the whole
   point of denormalizing muscles onto the row. `UsageRow.capturedWorkoutId`
   is `string | null` accordingly.
4. **`captured_workouts.block_roles` gains a value CHECK** against the five
   roles — an untyped client plus a free-text array meant a classifier typo
   ("warm_up") would write cleanly and make that workout invisible forever.
5. **`generated_session_blocks.block_order` is dropped** — `UNIQUE (session_id,
   block)` plus the fixed five-role order made it derivable and driftable.
   Readers sort by `BLOCK_ORDER` (Task 6) instead.
6. **Two redundant indexes dropped** (leading columns of existing UNIQUEs).
   `captured_workout_usage_user_date` stays — it matches the coverage query.

---

### Task 2: Built-in fallback library

**Files:**
- Create: `mobile/src/lib/dailyBuiltins.ts`
- Test: `mobile/src/lib/__tests__/dailyBuiltins.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { BUILTINS, findBuiltin, builtinByKey } from "../dailyBuiltins";

describe("built-in fallback library", () => {
  it("ships warmup, mobility and cooldown in all three focuses", () => {
    for (const role of ["warmup", "mobility", "cooldown"] as const) {
      for (const focus of ["upper", "lower", "full"] as const) {
        const hit = BUILTINS.find((b) => b.role === role && b.focus === focus);
        expect(hit).toBeDefined();
        expect(hit!.movements.length).toBeGreaterThanOrEqual(3);
        expect(hit!.minutes).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("keys are unique and stable-looking", () => {
    const keys = BUILTINS.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^builtin-(warmup|mobility|cooldown)-(upper|lower|full)$/);
  });

  it("findBuiltin matches role and focus", () => {
    expect(findBuiltin("warmup", "upper")!.key).toBe("builtin-warmup-upper");
    expect(findBuiltin("mobility", "lower")!.key).toBe("builtin-mobility-lower");
  });

  it("builtinByKey round-trips", () => {
    expect(builtinByKey("builtin-cooldown-full")!.role).toBe("cooldown");
    expect(builtinByKey("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it** — `npm test -- dailyBuiltins` — expected: FAIL (module not found).

- [ ] **Step 3: Implement `mobile/src/lib/dailyBuiltins.ts`**

```ts
// The shipped fallback routines: {warmup, mobility, cooldown} × {upper,
// lower, full}. Static app data — every session is complete from day one,
// and each use fires a gap nudge to capture a replacement (spec §3.3).
// Conditioning has no built-in: it is the optional block and simply drops.
import type { BuiltinRoutine } from "../types/dailyBlocks";

export const BUILTINS: BuiltinRoutine[] = [
  {
    key: "builtin-warmup-upper", name: "Upper-Body Warm-up", role: "warmup",
    focus: "upper", minutes: 6,
    movements: [
      { name: "Jumping Jacks", prescription: "60s" },
      { name: "Arm Circles", prescription: "15 each way" },
      { name: "Band Pull-Aparts", prescription: "2 × 15" },
      { name: "Scapular Push-ups", prescription: "2 × 10" },
    ],
  },
  {
    key: "builtin-warmup-lower", name: "Lower-Body Warm-up", role: "warmup",
    focus: "lower", minutes: 6,
    movements: [
      { name: "Jumping Jacks", prescription: "60s" },
      { name: "Bodyweight Squats", prescription: "2 × 12" },
      { name: "Walking Lunges", prescription: "10 each leg" },
      { name: "Glute Bridges", prescription: "2 × 12" },
    ],
  },
  {
    key: "builtin-warmup-full", name: "Full-Body Warm-up", role: "warmup",
    focus: "full", minutes: 7,
    movements: [
      { name: "Jumping Jacks", prescription: "60s" },
      { name: "Bodyweight Squats", prescription: "2 × 10" },
      { name: "Arm Circles", prescription: "15 each way" },
      { name: "Inchworms", prescription: "2 × 5" },
    ],
  },
  {
    key: "builtin-mobility-upper", name: "Upper-Body Mobility", role: "mobility",
    focus: "upper", minutes: 7,
    movements: [
      { name: "Thread the Needle", prescription: "8 each side" },
      { name: "Cat-Cow", prescription: "10 slow reps" },
      { name: "Shoulder Dislocates (band or towel)", prescription: "2 × 10" },
      { name: "Thoracic Rotations", prescription: "8 each side" },
    ],
  },
  {
    key: "builtin-mobility-lower", name: "Lower-Body Mobility", role: "mobility",
    focus: "lower", minutes: 7,
    movements: [
      { name: "Leg Swings", prescription: "12 each direction" },
      { name: "Hip Openers (90/90)", prescription: "6 each side" },
      { name: "World's Greatest Stretch", prescription: "5 each side" },
      { name: "Ankle Circles", prescription: "10 each way" },
    ],
  },
  {
    key: "builtin-mobility-full", name: "Full-Body Mobility", role: "mobility",
    focus: "full", minutes: 8,
    movements: [
      { name: "World's Greatest Stretch", prescription: "5 each side" },
      { name: "Cat-Cow", prescription: "10 slow reps" },
      { name: "Leg Swings", prescription: "12 each direction" },
      { name: "Deep Squat Hold", prescription: "2 × 30s" },
    ],
  },
  {
    key: "builtin-cooldown-upper", name: "Upper-Body Cool-down", role: "cooldown",
    focus: "upper", minutes: 6,
    movements: [
      { name: "Doorway Chest Stretch", prescription: "45s each side" },
      { name: "Cross-Body Shoulder Stretch", prescription: "30s each side" },
      { name: "Triceps Overhead Stretch", prescription: "30s each side" },
      { name: "Child's Pose", prescription: "60s" },
    ],
  },
  {
    key: "builtin-cooldown-lower", name: "Lower-Body Cool-down", role: "cooldown",
    focus: "lower", minutes: 6,
    movements: [
      { name: "Standing Quad Stretch", prescription: "30s each side" },
      { name: "Seated Hamstring Stretch", prescription: "45s each side" },
      { name: "Figure-4 Glute Stretch", prescription: "30s each side" },
      { name: "Calf Stretch on Wall", prescription: "30s each side" },
    ],
  },
  {
    key: "builtin-cooldown-full", name: "Full-Body Cool-down", role: "cooldown",
    focus: "full", minutes: 7,
    movements: [
      { name: "Child's Pose", prescription: "60s" },
      { name: "Seated Hamstring Stretch", prescription: "45s each side" },
      { name: "Doorway Chest Stretch", prescription: "45s each side" },
      { name: "Slow Nasal Breathing, Lying Down", prescription: "2 min" },
    ],
  },
];

export function findBuiltin(
  role: BuiltinRoutine["role"],
  focus: BuiltinRoutine["focus"],
): BuiltinRoutine | null {
  return BUILTINS.find((b) => b.role === role && b.focus === focus) ?? null;
}

export function builtinByKey(key: string): BuiltinRoutine | null {
  return BUILTINS.find((b) => b.key === key) ?? null;
}
```

- [ ] **Step 4: Run it** — `npm test -- dailyBuiltins` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dailyBuiltins.ts src/lib/__tests__/dailyBuiltins.test.ts
git commit -m "feat(daily): built-in fallback routines for support blocks"
```

---

### Task 3: Muscle coverage from the ledger

**Files:**
- Create: `mobile/src/lib/dailyCoverage.ts`
- Test: `mobile/src/lib/__tests__/dailyCoverage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { muscleCoverage, TRAINABLE_MUSCLES } from "../dailyCoverage";
import type { UsageRow } from "../../types/dailyBlocks";

const row = (date: string, muscles: [string, boolean][]): UsageRow => ({
  capturedWorkoutId: "w1",
  performedDate: date,
  block: "main",
  muscles: muscles.map(([name, isPrimary]) => ({ name, isPrimary })),
});

describe("muscleCoverage", () => {
  const today = "2026-08-18";

  it("empty ledger: zero load, everything equally neglected", () => {
    const cov = muscleCoverage([], today);
    expect(Object.keys(cov.load)).toHaveLength(0);
    expect(cov.yesterday.size).toBe(0);
    expect(cov.neglected).toHaveLength(TRAINABLE_MUSCLES.length);
  });

  it("yesterday's primaries land in `yesterday`; secondaries do not", () => {
    const cov = muscleCoverage(
      [row("2026-08-17", [["Chest", true], ["Triceps", false]])], today);
    expect(cov.yesterday.has("Chest")).toBe(true);
    expect(cov.yesterday.has("Triceps")).toBe(false);
  });

  it("recent work weighs more than old work", () => {
    const cov = muscleCoverage([
      row("2026-08-17", [["Chest", true]]),   // 1 day ago
      row("2026-08-12", [["Quads", true]]),   // 6 days ago
    ], today);
    expect(cov.load["Chest"]).toBeGreaterThan(cov.load["Quads"]);
  });

  it("secondaries count half", () => {
    const cov = muscleCoverage([
      row("2026-08-17", [["Chest", true], ["Triceps", false]]),
    ], today);
    expect(cov.load["Triceps"]).toBeCloseTo(cov.load["Chest"] / 2);
  });

  it("work older than 7 days is out of the window", () => {
    const cov = muscleCoverage([row("2026-08-10", [["Lats", true]])], today);
    expect(cov.load["Lats"]).toBeUndefined();
  });

  it("neglected sorts least-loaded first", () => {
    const cov = muscleCoverage([row("2026-08-17", [["Chest", true]])], today);
    expect(cov.neglected[cov.neglected.length - 1]).toBe("Chest");
  });
});
```

- [ ] **Step 2: Run it** — `npm test -- dailyCoverage` — expected: FAIL (module not found).

- [ ] **Step 3: Implement `mobile/src/lib/dailyCoverage.ts`**

```ts
// Rolling 7-day muscle coverage from the usage ledger — what got trained,
// how recently, and what has been neglected. Pure; the ledger rows and
// today's date arrive as data (one clock sample per compute).
// Spec §4 step 1.
import type { UsageRow } from "../types/dailyBlocks";

// muscle_regions.name values, verbatim (post-reorg seed) — the same
// vocabulary dailyCandidates.ts gates on.
export const TRAINABLE_MUSCLES = [
  "Chest", "Shoulders", "Triceps",
  "Upper Back", "Lats", "Biceps", "Forearms / Grip", "Neck / Traps",
  "Quads", "Glutes", "Hamstrings", "Calves",
  "Hip Flexors", "Hip Abductors", "Hip Adductors",
  "Core", "Obliques", "Lower Back",
] as const;

export interface MuscleCoverage {
  /** name → decayed 7-day load. Absent = untouched this week. */
  load: Record<string, number>;
  /** Primary muscles hit exactly yesterday. */
  yesterday: Set<string>;
  /** TRAINABLE_MUSCLES sorted least-loaded first. */
  neglected: string[];
}

const dayMs = 24 * 60 * 60 * 1000;
const toUtc = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};

export function daysBetween(earlier: string, later: string): number {
  return Math.floor((toUtc(later) - toUtc(earlier)) / dayMs);
}

export function muscleCoverage(usage: UsageRow[], today: string): MuscleCoverage {
  const load: Record<string, number> = {};
  const yesterday = new Set<string>();

  for (const rowItem of usage) {
    const daysAgo = daysBetween(rowItem.performedDate, today);
    if (daysAgo < 1 || daysAgo > 7) continue;
    // Linear decay: yesterday counts 7/8, a week ago 1/8.
    const decay = (8 - daysAgo) / 8;
    for (const m of rowItem.muscles) {
      load[m.name] = (load[m.name] ?? 0) + (m.isPrimary ? 1 : 0.5) * decay;
      if (daysAgo === 1 && m.isPrimary) yesterday.add(m.name);
    }
  }

  const neglected = [...TRAINABLE_MUSCLES].sort(
    (a, b) => (load[a] ?? 0) - (load[b] ?? 0),
  );
  return { load, yesterday, neglected };
}
```

- [ ] **Step 4: Run it** — `npm test -- dailyCoverage` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dailyCoverage.ts src/lib/__tests__/dailyCoverage.test.ts
git commit -m "feat(daily): rolling 7-day muscle coverage from the usage ledger"
```

---

### Task 4: Block time envelopes and round-trim fitting

**Files:**
- Create: `mobile/src/lib/dailyBlockBudget.ts`
- Test: `mobile/src/lib/__tests__/dailyBlockBudget.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { blockEnvelopes, fitToEnvelope } from "../dailyBlockBudget";
import type { BlockEnvelope } from "../../types/dailyBlocks";

const env = (block: BlockEnvelope["block"], min: number, max: number): BlockEnvelope =>
  ({ block, minMinutes: min, maxMinutes: max });

describe("blockEnvelopes", () => {
  it("60 minutes: four blocks, no conditioning, main gets the bulk", () => {
    const envs = blockEnvelopes(60, false);
    expect(envs.map((e) => e.block)).toEqual(["warmup", "mobility", "main", "cooldown"]);
    const main = envs.find((e) => e.block === "main")!;
    expect(main.maxMinutes).toBe(45); // 60 - 3×5 min support minimum
    expect(main.minMinutes).toBe(30); // 60 - 3×10 support maximum
  });

  it("90 minutes: conditioning appears, in RAMP order", () => {
    const envs = blockEnvelopes(90, false);
    expect(envs.map((e) => e.block))
      .toEqual(["warmup", "mobility", "main", "conditioning", "cooldown"]);
    expect(envs.find((e) => e.block === "conditioning")).toEqual(env("conditioning", 10, 20));
  });

  it("30 minutes: support compresses to 3-5", () => {
    const envs = blockEnvelopes(30, false);
    expect(envs.find((e) => e.block === "warmup")).toEqual(env("warmup", 3, 5));
    expect(envs.find((e) => e.block === "main")!.maxMinutes).toBe(21); // 30 - 3×3
  });

  it("recovery day: mobility and cooldown only", () => {
    const envs = blockEnvelopes(60, true);
    expect(envs.map((e) => e.block)).toEqual(["mobility", "cooldown"]);
    const total = envs.reduce((s, e) => s + e.maxMinutes, 0);
    expect(total).toBeLessThanOrEqual(60);
  });
});

describe("fitToEnvelope", () => {
  const mainEnv = env("main", 30, 45);

  it("null estimate never fits", () => {
    expect(fitToEnvelope(null, null, mainEnv)).toBeNull();
  });

  it("an in-envelope workout passes through untouched", () => {
    expect(fitToEnvelope(40, "4", mainEnv)).toEqual({ minutes: 40, roundsNote: null });
  });

  it("too long with rounds: trims whole rounds", () => {
    // 60 min over 4 rounds = 15/round; 45-min cap → 3 rounds = 45.
    expect(fitToEnvelope(60, "4", mainEnv)).toEqual({ minutes: 45, roundsNote: "Do 3 of 4 rounds" });
  });

  it("too long, roundless, within 25%: capped with a note", () => {
    expect(fitToEnvelope(50, null, mainEnv)).toEqual({ minutes: 45, roundsNote: "Cap at 45 min" });
  });

  it("too long, roundless, past 25%: rejected", () => {
    expect(fitToEnvelope(90, null, mainEnv)).toBeNull();
  });

  it("too short with rounds: extends rounds, at most doubling", () => {
    // 12 min over 2 rounds = 6/round; 30-min floor → 5 rounds, capped at 4 → 24.
    expect(fitToEnvelope(12, "2", mainEnv)).toEqual({ minutes: 24, roundsNote: "Do 4 rounds (written: 2)" });
  });

  it("a range of rounds reads its top end", () => {
    expect(fitToEnvelope(60, "3-4", mainEnv)).toEqual({ minutes: 45, roundsNote: "Do 3 of 4 rounds" });
  });

  it("slightly under min without rounds: allowed as-is", () => {
    expect(fitToEnvelope(25, null, mainEnv)).toEqual({ minutes: 25, roundsNote: null });
  });
});
```

- [ ] **Step 2: Run it** — `npm test -- dailyBlockBudget` — expected: FAIL.

- [ ] **Step 3: Implement `mobile/src/lib/dailyBlockBudget.ts`**

```ts
// The block session's time arithmetic: what each block may cost, and how a
// catalog workout is trimmed or extended (by whole rounds) to fit. All
// deterministic — the AI picks candidates whose minutes are already decided.
// Spec §4 steps 4-5.
import type { BlockEnvelope } from "../types/dailyBlocks";

/** Under this many total minutes, support blocks compress (spec §8). */
const SHORT_DAY = 45;
/** Conditioning only exists when the budget clears this (spec §4). */
const CONDITIONING_FLOOR = 75;
/** A roundless workout may be capped down by at most this factor. */
const CAP_TOLERANCE = 1.25;

export function blockEnvelopes(minutes: number, recoveryDay: boolean): BlockEnvelope[] {
  if (recoveryDay) {
    // Mobility and cool-down only, deliberately (spec §6).
    const mobility = Math.max(10, Math.round(minutes * 0.6));
    const cooldown = Math.max(5, Math.min(minutes - mobility, Math.round(minutes * 0.4)));
    return [
      { block: "mobility", minMinutes: 5, maxMinutes: mobility },
      { block: "cooldown", minMinutes: 5, maxMinutes: cooldown },
    ];
  }

  const short = minutes < SHORT_DAY;
  const supportMin = short ? 3 : 5;
  const supportMax = short ? 5 : 10;
  const hasConditioning = minutes >= CONDITIONING_FLOOR;

  const support: BlockEnvelope[] = [
    { block: "warmup", minMinutes: supportMin, maxMinutes: supportMax },
    { block: "mobility", minMinutes: supportMin, maxMinutes: supportMax },
    { block: "cooldown", minMinutes: supportMin, maxMinutes: supportMax },
  ];
  if (hasConditioning) support.push({ block: "conditioning", minMinutes: 10, maxMinutes: 20 });

  const minTaken = support.reduce((s, e) => s + e.minMinutes, 0);
  const maxTaken = support.reduce((s, e) => s + e.maxMinutes, 0);
  const main: BlockEnvelope = {
    block: "main",
    minMinutes: Math.max(10, minutes - maxTaken),
    maxMinutes: Math.max(15, minutes - minTaken),
  };

  return [
    support[0], support[1], main,
    ...(hasConditioning ? [support[3]] : []),
    support[2],
  ];
}

export interface FittedDuration {
  minutes: number;
  roundsNote: string | null;
}

/** Top of a rounds prescription: "4" → 4, "3-4" → 4. Null when unparseable. */
function topRounds(rounds: string | null): number | null {
  if (!rounds) return null;
  const numbers = (rounds.match(/\d+/g) ?? []).map(Number);
  if (numbers.length === 0) return null;
  const top = Math.max(...numbers);
  return top >= 2 ? top : null;
}

/**
 * Fit a workout's estimated duration to a block's envelope, by whole rounds
 * when the creator wrote rounds. Null = cannot fit; the workout leaves the
 * shortlist. Never invents more than double the written rounds.
 */
export function fitToEnvelope(
  estMinutes: number | null,
  rounds: string | null,
  env: BlockEnvelope,
): FittedDuration | null {
  if (estMinutes === null || estMinutes <= 0) return null;

  if (estMinutes <= env.maxMinutes && estMinutes >= env.minMinutes) {
    return { minutes: estMinutes, roundsNote: null };
  }

  const n = topRounds(rounds);

  if (estMinutes > env.maxMinutes) {
    if (n !== null) {
      const k = Math.max(1, Math.floor((n * env.maxMinutes) / estMinutes));
      if (k < n) {
        const minutes = Math.round((estMinutes * k) / n);
        if (minutes <= env.maxMinutes) {
          return { minutes, roundsNote: `Do ${k} of ${n} rounds` };
        }
      }
      return null;
    }
    // Roundless: a modest overage caps; past tolerance it doesn't fit.
    if (estMinutes <= env.maxMinutes * CAP_TOLERANCE) {
      return { minutes: env.maxMinutes, roundsNote: `Cap at ${env.maxMinutes} min` };
    }
    return null;
  }

  // Under the floor. With rounds we can extend (at most doubling); without,
  // a short workout is simply a short block — allowed as-is.
  if (n !== null) {
    const k = Math.min(n * 2, Math.ceil((n * env.minMinutes) / estMinutes));
    if (k > n) {
      const minutes = Math.round((estMinutes * k) / n);
      if (minutes <= env.maxMinutes) {
        return { minutes, roundsNote: `Do ${k} rounds (written: ${n})` };
      }
    }
  }
  return { minutes: estMinutes, roundsNote: null };
}
```

- [ ] **Step 4: Run it** — `npm test -- dailyBlockBudget` — expected: PASS. Fix arithmetic, not tests, on failure.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dailyBlockBudget.ts src/lib/__tests__/dailyBlockBudget.test.ts
git commit -m "feat(daily): block time envelopes and whole-round fitting"
```

---

### Task 5: Recovery gate, body focus, and per-block shortlists

**Files:**
- Create: `mobile/src/lib/dailyBlockShortlist.ts`
- Test: `mobile/src/lib/__tests__/dailyBlockShortlist.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { isRecoveryDay, workoutFocus, buildBlockShortlists } from "../dailyBlockShortlist";
import { blockEnvelopes } from "../dailyBlockBudget";
import { muscleCoverage } from "../dailyCoverage";
import type { TaggedWorkout, WorkoutMuscle } from "../../types/dailyBlocks";

const muscles = (pairs: [string, boolean][]): WorkoutMuscle[] =>
  pairs.map(([name, isPrimary]) => ({ name, isPrimary }));

const workout = (over: Partial<TaggedWorkout> & { workoutId: string }): TaggedWorkout => ({
  name: over.workoutId,
  rounds: null,
  lastPerformedDaysAgo: null,
  ...over,
  tags: {
    blockRoles: ["main"],
    muscles: muscles([["Chest", true]]),
    estMinutes: 40,
    intensity: "moderate",
    skillLevel: "Intermediate",
    classifiedAt: "2026-08-18T00:00:00Z",
    ...(over.tags ?? {}),
  },
});

const baseCtx = () => ({
  coverage: muscleCoverage([], "2026-08-18"),
  soreness: {} as Record<string, number>,
  envelopes: blockEnvelopes(60, false),
  rampWeek: 3,
});

describe("isRecoveryDay", () => {
  it("three regions at 2+ trips it", () => {
    expect(isRecoveryDay({ energy: 7, soreness: { Chest: 2, Quads: 2, Lats: 2 } })).toBe(true);
  });
  it("one region at 3 with low energy trips it", () => {
    expect(isRecoveryDay({ energy: 3, soreness: { Quads: 3 } })).toBe(true);
  });
  it("one region at 3 with good energy does not", () => {
    expect(isRecoveryDay({ energy: 8, soreness: { Quads: 3 } })).toBe(false);
  });
});

describe("workoutFocus", () => {
  it("all-upper primaries → upper", () => {
    expect(workoutFocus(muscles([["Chest", true], ["Triceps", true]]))).toBe("upper");
  });
  it("mixed or core-only → full", () => {
    expect(workoutFocus(muscles([["Chest", true], ["Quads", true]]))).toBe("full");
    expect(workoutFocus(muscles([["Core", true]]))).toBe("full");
  });
});

describe("buildBlockShortlists", () => {
  it("untagged workouts never appear", () => {
    const w = workout({ workoutId: "w1" });
    w.tags.classifiedAt = null;
    const { shortlists } = buildBlockShortlists([w], baseCtx());
    expect(shortlists.main).toHaveLength(0);
  });

  it("sore-dominated mains are excluded; done-3-days-ago is excluded", () => {
    const sore = workout({ workoutId: "sore" });
    const recent = workout({ workoutId: "recent", lastPerformedDaysAgo: 3 });
    const ok = workout({ workoutId: "ok", tags: { muscles: muscles([["Quads", true]]) } as any });
    const ctx = { ...baseCtx(), soreness: { Chest: 2 } };
    const { shortlists } = buildBlockShortlists([sore, recent, ok], ctx);
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["ok"]);
  });

  it("advanced workouts sit out ramp weeks 1-2", () => {
    const adv = workout({ workoutId: "adv", tags: { skillLevel: "Advanced" } as any });
    const { shortlists } = buildBlockShortlists([adv], { ...baseCtx(), rampWeek: 1 });
    expect(shortlists.main).toHaveLength(0);
    const later = buildBlockShortlists([adv], { ...baseCtx(), rampWeek: 3 });
    expect(later.shortlists.main).toHaveLength(1);
  });

  it("neglected muscles outrank yesterday's muscles", () => {
    const chest = workout({ workoutId: "chest" });
    const legs = workout({ workoutId: "legs", tags: { muscles: muscles([["Quads", true]]) } as any });
    const cov = muscleCoverage([{
      capturedWorkoutId: "x", performedDate: "2026-08-17", block: "main",
      muscles: muscles([["Chest", true]]),
    }], "2026-08-18");
    const { shortlists } = buildBlockShortlists([chest, legs], { ...baseCtx(), coverage: cov });
    expect(shortlists.main![0].workoutId).toBe("legs");
  });

  it("support blocks share the main's focus and end with a built-in", () => {
    const main = workout({ workoutId: "m" }); // upper focus
    const upperWu = workout({
      workoutId: "wu-upper",
      tags: { blockRoles: ["warmup"], muscles: muscles([["Shoulders", true]]), estMinutes: 8 } as any,
    });
    const lowerWu = workout({
      workoutId: "wu-lower",
      tags: { blockRoles: ["warmup"], muscles: muscles([["Quads", true]]), estMinutes: 8 } as any,
    });
    const { shortlists } = buildBlockShortlists([main, upperWu, lowerWu], baseCtx());
    const ids = shortlists.warmup!.map((c) => c.workoutId ?? c.builtinKey);
    expect(ids).toContain("wu-upper");
    expect(ids).not.toContain("wu-lower");
    expect(shortlists.warmup![shortlists.warmup!.length - 1].builtinKey).toBe("builtin-warmup-upper");
  });

  it("no conditioning shortlist under 75 minutes, and no built-in for it above", () => {
    const sixty = buildBlockShortlists([workout({ workoutId: "m" })], baseCtx());
    expect(sixty.shortlists.conditioning).toBeUndefined();
    const ninety = buildBlockShortlists([workout({ workoutId: "m" })],
      { ...baseCtx(), envelopes: blockEnvelopes(90, false) });
    expect((ninety.shortlists.conditioning ?? []).every((c) => c.builtinKey === null)).toBe(true);
  });

  it("empty main pool relaxes recency first and flags it", () => {
    const recent = workout({ workoutId: "recent", lastPerformedDaysAgo: 2 });
    const { shortlists, relaxedMain } = buildBlockShortlists([recent], baseCtx());
    expect(relaxedMain).toBe(true);
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["recent"]);
  });

  it("recovery day: mobility and cooldown only, full-body built-ins", () => {
    const { shortlists } = buildBlockShortlists([workout({ workoutId: "m" })], {
      ...baseCtx(),
      envelopes: blockEnvelopes(60, true),
    });
    expect(shortlists.main).toBeUndefined();
    expect(shortlists.warmup).toBeUndefined();
    expect(shortlists.mobility![shortlists.mobility!.length - 1].builtinKey)
      .toBe("builtin-mobility-full");
  });
});
```

- [ ] **Step 2: Run it** — `npm test -- dailyBlockShortlist` — expected: FAIL.

- [ ] **Step 3: Implement `mobile/src/lib/dailyBlockShortlist.ts`**

```ts
// The rules tier's hard work: which whole workouts are in play for each block
// today. Pure — coverage, soreness, and envelopes arrive as data.
// Spec §4 steps 2-4 and §8.
import { findBuiltin } from "./dailyBuiltins";
import { fitToEnvelope } from "./dailyBlockBudget";
import type {
  BlockCandidate,
  BlockEnvelope,
  BlockRole,
  BlockShortlists,
  BodyFocus,
  TaggedWorkout,
  WorkoutMuscle,
} from "../types/dailyBlocks";
import type { MuscleCoverage } from "./dailyCoverage";

/** Recovery-day gate (spec §4 step 2): ≥3 regions at severity ≥2, or any
 *  region at 3 alongside energy ≤3. */
export function isRecoveryDay(checkin: {
  energy: number;
  soreness: Record<string, number>;
}): boolean {
  const severities = Object.values(checkin.soreness);
  const atTwo = severities.filter((s) => s >= 2).length;
  const atThree = severities.filter((s) => s >= 3).length;
  return atTwo >= 3 || (atThree >= 1 && checkin.energy <= 3);
}

const UPPER = new Set([
  "Chest", "Shoulders", "Triceps",
  "Upper Back", "Lats", "Biceps", "Forearms / Grip", "Neck / Traps",
]);
const LOWER = new Set([
  "Quads", "Glutes", "Hamstrings", "Calves",
  "Hip Flexors", "Hip Abductors", "Hip Adductors",
]);

export function workoutFocus(muscles: WorkoutMuscle[]): BodyFocus {
  const primaries = muscles.filter((m) => m.isPrimary).map((m) => m.name);
  const upper = primaries.filter((m) => UPPER.has(m)).length;
  const lower = primaries.filter((m) => LOWER.has(m)).length;
  if (upper > 0 && lower === 0) return "upper";
  if (lower > 0 && upper === 0) return "lower";
  return "full";
}

/** Don't repeat a main workout inside this window (spec §4 step 3). */
const MAIN_REPEAT_DAYS = 4;
const MAIN_SHORTLIST = 5;
const SUPPORT_SHORTLIST = 3;

export interface ShortlistContext {
  coverage: MuscleCoverage;
  soreness: Record<string, number>;
  envelopes: BlockEnvelope[];
  rampWeek: number;
}

export interface ShortlistResult {
  shortlists: BlockShortlists;
  /** True when the main list only exists because exclusions were relaxed —
   *  the UI labels the day a compromise (spec §8). */
  relaxedMain: boolean;
}

function toCandidate(
  w: TaggedWorkout,
  env: BlockEnvelope,
  score: number,
): BlockCandidate | null {
  const fitted = fitToEnvelope(w.tags.estMinutes, w.rounds, env);
  if (!fitted) return null;
  return {
    workoutId: w.workoutId,
    builtinKey: null,
    name: w.name,
    minutes: fitted.minutes,
    roundsNote: fitted.roundsNote,
    muscles: w.tags.muscles,
    focus: workoutFocus(w.tags.muscles),
    score,
  };
}

/** Freshness of a workout's primaries against the week's load, 0..1-ish. */
function freshness(w: TaggedWorkout, coverage: MuscleCoverage): number {
  const primaries = w.tags.muscles.filter((m) => m.isPrimary).map((m) => m.name);
  if (primaries.length === 0) return 0.5;
  const sum = primaries.reduce((s, m) => s + 1 / (1 + (coverage.load[m] ?? 0)), 0);
  return sum / primaries.length;
}

function scoreMain(w: TaggedWorkout, coverage: MuscleCoverage): number {
  const primaries = w.tags.muscles.filter((m) => m.isPrimary).map((m) => m.name);
  const recency = w.lastPerformedDaysAgo === null
    ? 1
    : Math.min(1, w.lastPerformedDaysAgo / 7);
  const yesterdayPenalty = primaries.some((m) => coverage.yesterday.has(m)) ? 0.5 : 0;
  return freshness(w, coverage) * 2 + recency - yesterdayPenalty;
}

function soreDominated(w: TaggedWorkout, soreness: Record<string, number>): boolean {
  return w.tags.muscles.some((m) => m.isPrimary && (soreness[m.name] ?? 0) >= 2);
}

export function buildBlockShortlists(
  workouts: TaggedWorkout[],
  ctx: ShortlistContext,
): ShortlistResult {
  const tagged = workouts.filter((w) => w.tags.classifiedAt !== null);
  const byRole = (role: BlockRole) =>
    tagged.filter((w) => w.tags.blockRoles.includes(role));
  const envFor = (block: BlockRole) =>
    ctx.envelopes.find((e) => e.block === block);

  const shortlists: BlockShortlists = {};
  let relaxedMain = false;

  const mainEnv = envFor("main");
  const recovery = mainEnv === undefined; // recovery envelopes carry no main

  // ---- Main (skipped entirely on a recovery day) ----
  let mainFocuses = new Set<BodyFocus>(["full"]);
  if (!recovery && mainEnv) {
    const pool = byRole("main")
      // Advanced workouts sit out the re-entry ramp; there is no per-workout
      // skill state yet, so the ramp is the conservative gate (spec §2 pin).
      .filter((w) => !(ctx.rampWeek <= 2 && w.tags.skillLevel === "Advanced"));

    const strict = pool.filter(
      (w) =>
        !soreDominated(w, ctx.soreness) &&
        (w.lastPerformedDaysAgo === null || w.lastPerformedDaysAgo >= MAIN_REPEAT_DAYS),
    );
    // §8: relax recency first, then soreness dominance — never the ramp gate.
    let chosen = strict;
    if (chosen.length === 0) {
      chosen = pool.filter((w) => !soreDominated(w, ctx.soreness));
      relaxedMain = chosen.length > 0;
    }
    if (chosen.length === 0) {
      chosen = pool;
      relaxedMain = chosen.length > 0;
    }

    const main = chosen
      .map((w) => toCandidate(w, mainEnv, scoreMain(w, ctx.coverage)))
      .filter((c): c is BlockCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAIN_SHORTLIST);
    shortlists.main = main;
    if (main.length > 0) {
      mainFocuses = new Set(main.map((c) => c.focus));
    }
  }

  // The built-in flavor follows the top main candidate; recovery days and
  // full-body days get the full-body built-in.
  const builtinFocus: BodyFocus =
    !recovery && (shortlists.main?.length ?? 0) > 0 ? shortlists.main![0].focus : "full";

  // ---- Support blocks ----
  const supportRoles: BlockRole[] = recovery
    ? ["mobility", "cooldown"]
    : ["warmup", "mobility", "cooldown"];
  for (const role of supportRoles) {
    const env = envFor(role);
    if (!env) continue;
    const list = byRole(role)
      .filter((w) => {
        const focus = workoutFocus(w.tags.muscles);
        return recovery || focus === "full" || mainFocuses.has(focus);
      })
      .map((w) => toCandidate(w, env, freshness(w, ctx.coverage) +
        (w.lastPerformedDaysAgo === null ? 1 : Math.min(1, w.lastPerformedDaysAgo / 7))))
      .filter((c): c is BlockCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, SUPPORT_SHORTLIST);

    // Built-ins are appended directly, NOT run through fitToEnvelope: they
    // ship at 6-8 minutes and a compressed short-day envelope (3-5) would
    // reject them outright, breaking the promise that every session is
    // complete. Clamp to the ceiling instead.
    const builtin = findBuiltin(role as "warmup" | "mobility" | "cooldown", builtinFocus);
    if (builtin) {
      list.push({
        workoutId: null,
        builtinKey: builtin.key,
        name: builtin.name,
        minutes: Math.min(builtin.minutes, env.maxMinutes),
        roundsNote: null,
        muscles: [],
        focus: builtin.focus,
        score: 0,
      });
    }
    shortlists[role] = list;
  }

  // ---- Conditioning: optional, no built-in (spec §3.3) ----
  const condEnv = envFor("conditioning");
  if (condEnv) {
    shortlists.conditioning = byRole("conditioning")
      .filter((w) => {
        const focus = workoutFocus(w.tags.muscles);
        return (focus === "full" || mainFocuses.has(focus)) &&
          !soreDominated(w, ctx.soreness);
      })
      .map((w) => toCandidate(w, condEnv, freshness(w, ctx.coverage)))
      .filter((c): c is BlockCandidate => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, SUPPORT_SHORTLIST);
  }

  return { shortlists, relaxedMain };
}
```

- [ ] **Step 4: Run it** — `npm test -- dailyBlockShortlist` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dailyBlockShortlist.ts src/lib/__tests__/dailyBlockShortlist.test.ts
git commit -m "feat(daily): recovery gate, body focus, per-block shortlists"
```

---

### Task 6: Fallback composition, AI validation, reroll cycling

**Files:**
- Create: `mobile/src/lib/dailyBlockCompose.ts`
- Modify: `mobile/src/types/dailyBlocks.ts` (`BlockPick` gains `name`)
- Test: `mobile/src/lib/__tests__/dailyBlockCompose.test.ts`

**Type change first:** `BlockPick` gains `name: string` — the block's display
name, carried from the chosen candidate and stored on the row so a session's
history survives the workout being deleted (see Task 1 amendments). Since
`StoredBlock extends BlockPick`, delete the now-duplicated `name` from
`StoredBlock`, leaving it `extends BlockPick { id: string }`.

- [ ] **Step 1: Write the failing test**

```ts
import {
  composeBlockFallback,
  validateBlockComposition,
  nextCandidate,
  BLOCK_ORDER,
  SECTION_FOR_BLOCK,
} from "../dailyBlockCompose";
import type { BlockCandidate, BlockShortlists } from "../../types/dailyBlocks";

const cand = (id: string, minutes = 10, builtin = false): BlockCandidate => ({
  workoutId: builtin ? null : id,
  builtinKey: builtin ? id : null,
  name: id, minutes, roundsNote: null, muscles: [], focus: "full", score: 1,
});

const shortlists: BlockShortlists = {
  warmup: [cand("wu1", 8), cand("builtin-warmup-full", 7, true)],
  mobility: [cand("mo1", 8)],
  main: [cand("m1", 40), cand("m2", 35)],
  cooldown: [cand("cd1", 6)],
};

describe("composeBlockFallback", () => {
  it("takes the top candidate of every offered block, in block order", () => {
    const picks = composeBlockFallback(shortlists);
    expect(picks.map((p) => p.block)).toEqual(["warmup", "mobility", "main", "cooldown"]);
    expect(picks.find((p) => p.block === "main")!.workoutId).toBe("m1");
  });
  it("skips empty shortlists", () => {
    const picks = composeBlockFallback({ ...shortlists, conditioning: [] });
    expect(picks.some((p) => p.block === "conditioning")).toBe(false);
  });
});

describe("validateBlockComposition", () => {
  const valid = {
    blocks: [
      { block: "warmup", id: "wu1", reason: "shoulders first" },
      { block: "mobility", id: "mo1", reason: "hips" },
      { block: "main", id: "m2", reason: "fresh muscles" },
      { block: "cooldown", id: "cd1", reason: "wind down" },
    ],
  };

  it("accepts a good answer, carrying candidate minutes", () => {
    const picks = validateBlockComposition(valid, shortlists, 60)!;
    expect(picks).toHaveLength(4);
    expect(picks.find((p) => p.block === "main")!.minutes).toBe(35);
    expect(picks.find((p) => p.block === "warmup")!.reason).toBe("shoulders first");
  });

  it("rejects an id the shortlist never offered", () => {
    const bad = { blocks: [{ ...valid.blocks[0], id: "stranger" }, ...valid.blocks.slice(1)] };
    expect(validateBlockComposition(bad, shortlists, 60)).toBeNull();
  });

  it("rejects a missing main when main was offered", () => {
    const noMain = { blocks: valid.blocks.filter((b) => b.block !== "main") };
    expect(validateBlockComposition(noMain, shortlists, 60)).toBeNull();
  });

  it("accepts a mainless answer when no main was offered (recovery day)", () => {
    const rec: BlockShortlists = { mobility: [cand("mo1", 30)], cooldown: [cand("cd1", 20)] };
    const answer = { blocks: [
      { block: "mobility", id: "mo1", reason: "easy day" },
      { block: "cooldown", id: "cd1", reason: "stretch" },
    ]};
    expect(validateBlockComposition(answer, rec, 60)).toHaveLength(2);
  });

  it("rejects when the candidates' minutes bust the budget", () => {
    expect(validateBlockComposition(valid, shortlists, 40)).toBeNull(); // 89 min into 40
  });

  it("a duplicate block keeps the first mention", () => {
    const dup = { blocks: [...valid.blocks, { block: "main", id: "m1", reason: "again" }] };
    const picks = validateBlockComposition(dup, shortlists, 60)!;
    expect(picks.filter((p) => p.block === "main")).toHaveLength(1);
    expect(picks.find((p) => p.block === "main")!.workoutId).toBe("m2");
  });

  it("resolves a built-in pick by its key", () => {
    const withBuiltin = { blocks: [
      { block: "warmup", id: "builtin-warmup-full", reason: "no captures yet" },
      ...valid.blocks.slice(1),
    ]};
    const picks = validateBlockComposition(withBuiltin, shortlists, 60)!;
    expect(picks.find((p) => p.block === "warmup")!.builtinKey).toBe("builtin-warmup-full");
  });

  it("garbage is null", () => {
    expect(validateBlockComposition(null, shortlists, 60)).toBeNull();
    expect(validateBlockComposition({ blocks: "x" }, shortlists, 60)).toBeNull();
  });
});

describe("nextCandidate", () => {
  it("cycles forward and wraps", () => {
    expect(nextCandidate(shortlists.main!, "m1")!.workoutId).toBe("m2");
    expect(nextCandidate(shortlists.main!, "m2")!.workoutId).toBe("m1");
  });
  it("single-candidate lists have nowhere to go", () => {
    expect(nextCandidate(shortlists.mobility!, "mo1")).toBeNull();
  });
});

describe("SECTION_FOR_BLOCK", () => {
  it("conditioning reuses the accessory section (spec §7)", () => {
    expect(SECTION_FOR_BLOCK.conditioning).toBe("accessory");
    expect(SECTION_FOR_BLOCK.mobility).toBe("mobility");
  });
  it("BLOCK_ORDER is the five phases in sequence", () => {
    expect(BLOCK_ORDER).toEqual(["warmup", "mobility", "main", "conditioning", "cooldown"]);
  });
});
```

- [ ] **Step 2: Run it** — `npm test -- dailyBlockCompose` — expected: FAIL.

- [ ] **Step 3: Implement `mobile/src/lib/dailyBlockCompose.ts`**

```ts
// Rules-only block composition (the "you always get a session" fallback), the
// validator that constrains the AI's picks to what it was offered, and the
// reroll cycling. Fuel-plan doctrine, enforced client-side. Spec §5.
import type {
  BlockCandidate,
  BlockPick,
  BlockRole,
  BlockShortlists,
} from "../types/dailyBlocks";
import type { SessionSection } from "../types/daily";

export const BLOCK_ORDER: BlockRole[] = [
  "warmup", "mobility", "main", "conditioning", "cooldown",
];

/** §7: mobility is a new section; conditioning reuses the accessory slot. */
export const SECTION_FOR_BLOCK: Record<BlockRole, SessionSection> = {
  warmup: "warmup",
  mobility: "mobility",
  main: "main",
  conditioning: "accessory",
  cooldown: "cooldown",
};

/** The model may overrun the day slightly; past this it stopped adding. */
const OVERRUN_TOLERANCE = 1.1;

function pickFrom(candidate: BlockCandidate, block: BlockRole, reason: string | null): BlockPick {
  return {
    block,
    workoutId: candidate.workoutId,
    builtinKey: candidate.builtinKey,
    // Carried onto the row, not resolved by join at read time: a session's
    // history has to survive the workout being deleted.
    name: candidate.name,
    minutes: candidate.minutes,
    roundsNote: candidate.roundsNote,
    reason,
  };
}

/** Top of every offered shortlist, in block order. */
export function composeBlockFallback(shortlists: BlockShortlists): BlockPick[] {
  const picks: BlockPick[] = [];
  for (const block of BLOCK_ORDER) {
    const list = shortlists[block];
    if (!list || list.length === 0) continue;
    picks.push(pickFrom(list[0], block, null));
  }
  return picks;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/**
 * Null means "unusable answer" — the caller falls back to rules. Minutes and
 * round notes always come from the shortlist candidate, never from the model:
 * rules keep the numbers, the model picks and explains.
 */
export function validateBlockComposition(
  raw: unknown,
  shortlists: BlockShortlists,
  minutesAvailable: number,
): BlockPick[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const blocks = (raw as Record<string, unknown>).blocks;
  if (!Array.isArray(blocks)) return null;

  const picks = new Map<BlockRole, BlockPick>();
  for (const entry of blocks) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const block = e.block as BlockRole;
    if (!BLOCK_ORDER.includes(block)) continue;
    if (picks.has(block)) continue; // first mention wins
    const list = shortlists[block];
    if (!list) return null; // picked a block that was never offered
    const id = str(e.id);
    if (!id) return null;
    const candidate = list.find((c) => c.workoutId === id || c.builtinKey === id);
    if (!candidate) return null; // an id we never offered — unusable
    picks.set(block, pickFrom(candidate, block, str(e.reason)));
  }

  if (picks.size === 0) return null;
  // Main is not optional when it was offered.
  if ((shortlists.main?.length ?? 0) > 0 && !picks.has("main")) return null;

  // A non-finite budget makes every comparison false, so the overrun check
  // would silently pass anything. Refuse rather than validate against NaN —
  // the time envelopes already fall back to a short day upstream.
  if (!Number.isFinite(minutesAvailable) || minutesAvailable <= 0) return null;
  const total = [...picks.values()].reduce((s, p) => s + p.minutes, 0);
  if (total > minutesAvailable * OVERRUN_TOLERANCE) return null;

  return BLOCK_ORDER.filter((b) => picks.has(b)).map((b) => picks.get(b)!);
}

/** The next shortlist entry after the current pick, wrapping; null when the
 *  list has nowhere else to go. Reroll swaps ONE block (spec §6). */
export function nextCandidate(
  list: BlockCandidate[],
  currentId: string,
): BlockCandidate | null {
  if (list.length < 2) return null;
  const idx = list.findIndex((c) => c.workoutId === currentId || c.builtinKey === currentId);
  if (idx === -1) return list[0];
  return list[(idx + 1) % list.length];
}
```

- [ ] **Step 4: Run it** — `npm test -- dailyBlockCompose` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dailyBlockCompose.ts src/lib/__tests__/dailyBlockCompose.test.ts
git commit -m "feat(daily): block fallback composition, AI validation, reroll cycling"
```

---

### Task 7: Classification response validator

**Files:**
- Create: `mobile/src/lib/workoutTagValidate.ts`
- Test: `mobile/src/lib/__tests__/workoutTagValidate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { validateWorkoutTags } from "../workoutTagValidate";

const allowed = new Set(["Chest", "Shoulders", "Quads", "Core"]);

const good = {
  block_roles: ["main", "conditioning"],
  primary_muscles: ["Chest", "Shoulders"],
  secondary_muscles: ["Core"],
  est_minutes: 35,
  intensity: "high",
  skill_level: "Intermediate",
};

describe("validateWorkoutTags", () => {
  it("accepts a good answer", () => {
    const tags = validateWorkoutTags(good, allowed)!;
    expect(tags.blockRoles).toEqual(["main", "conditioning"]);
    expect(tags.muscles).toEqual([
      { name: "Chest", isPrimary: true },
      { name: "Shoulders", isPrimary: true },
      { name: "Core", isPrimary: false },
    ]);
    expect(tags.estMinutes).toBe(35);
    expect(tags.intensity).toBe("high");
    expect(tags.skillLevel).toBe("Intermediate");
  });

  it("drops unknown roles and muscles rather than failing", () => {
    const tags = validateWorkoutTags({
      ...good,
      block_roles: ["main", "cardio"],
      primary_muscles: ["Chest", "Traps"],
    }, allowed)!;
    expect(tags.blockRoles).toEqual(["main"]);
    expect(tags.muscles.map((m) => m.name)).toEqual(["Chest", "Core"]);
  });

  it("no valid roles = unusable", () => {
    expect(validateWorkoutTags({ ...good, block_roles: ["hiit"] }, allowed)).toBeNull();
  });

  it("no primary muscle = unusable — it would be immune to the soreness gate", () => {
    expect(validateWorkoutTags({ ...good, primary_muscles: [] }, allowed)).toBeNull();
    expect(validateWorkoutTags({ ...good, primary_muscles: ["Traps"] }, allowed)).toBeNull();
  });

  it("nonsense minutes become null, not a rejection", () => {
    expect(validateWorkoutTags({ ...good, est_minutes: 600 }, allowed)!.estMinutes).toBeNull();
    expect(validateWorkoutTags({ ...good, est_minutes: "x" }, allowed)!.estMinutes).toBeNull();
  });

  it("bad enum values become null", () => {
    const tags = validateWorkoutTags({ ...good, intensity: "brutal", skill_level: "Pro" }, allowed)!;
    expect(tags.intensity).toBeNull();
    expect(tags.skillLevel).toBeNull();
  });

  it("garbage is null", () => {
    expect(validateWorkoutTags(null, allowed)).toBeNull();
    expect(validateWorkoutTags("x", allowed)).toBeNull();
  });

  it("a muscle in both lists stays primary", () => {
    const tags = validateWorkoutTags({
      ...good, primary_muscles: ["Chest"], secondary_muscles: ["Chest"],
    }, allowed)!;
    expect(tags.muscles).toEqual([{ name: "Chest", isPrimary: true }]);
  });
});
```

- [ ] **Step 2: Run it** — `npm test -- workoutTagValidate` — expected: FAIL.

- [ ] **Step 3: Implement `mobile/src/lib/workoutTagValidate.ts`**

```ts
// The classify answer, constrained to our vocabulary — same stance as
// captureReview: the model suggests, the client decides what is usable.
// Roles are the one hard requirement; every other field degrades to null.
import type { BlockRole, WorkoutIntensity, WorkoutTags } from "../types/dailyBlocks";

const ROLES: BlockRole[] = ["warmup", "mobility", "main", "conditioning", "cooldown"];
const INTENSITIES: WorkoutIntensity[] = ["low", "moderate", "high"];
const SKILLS = ["Beginner", "Intermediate", "Advanced"] as const;
const MAX_MINUTES = 240;

/** Null means "unusable" — the workout stays untagged and out of play. */
export function validateWorkoutTags(
  raw: unknown,
  allowedMuscles: Set<string>,
): WorkoutTags | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const blockRoles = (Array.isArray(r.block_roles) ? r.block_roles : [])
    .filter((v): v is BlockRole => ROLES.includes(v as BlockRole));
  if (blockRoles.length === 0) return null;

  // A workout with no primary muscle is unusable, not merely under-described:
  // the soreness gate reads primaries, so it would be permanently immune —
  // a chest workout offered on a chest-sore day (Task 5 review). Roles and at
  // least one primary muscle are the two hard requirements; everything else
  // degrades to null.

  const names = (v: unknown): string[] =>
    (Array.isArray(v) ? v : []).filter(
      (m): m is string => typeof m === "string" && allowedMuscles.has(m),
    );
  const primaries = [...new Set(names(r.primary_muscles))];
  const primarySet = new Set(primaries);
  const secondaries = [...new Set(names(r.secondary_muscles))]
    .filter((m) => !primarySet.has(m));

  if (primaries.length === 0) return null;

  const est = typeof r.est_minutes === "number" &&
    Number.isFinite(r.est_minutes) &&
    r.est_minutes >= 1 && r.est_minutes <= MAX_MINUTES
      ? Math.round(r.est_minutes)
      : null;

  return {
    blockRoles,
    muscles: [
      ...primaries.map((name) => ({ name, isPrimary: true })),
      ...secondaries.map((name) => ({ name, isPrimary: false })),
    ],
    estMinutes: est,
    intensity: INTENSITIES.includes(r.intensity as WorkoutIntensity)
      ? (r.intensity as WorkoutIntensity)
      : null,
    skillLevel: SKILLS.includes(r.skill_level as (typeof SKILLS)[number])
      ? (r.skill_level as (typeof SKILLS)[number])
      : null,
    classifiedAt: null, // stamped by the saver, not the validator
  };
}
```

- [ ] **Step 4: Run it** — `npm test -- workoutTagValidate` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workoutTagValidate.ts src/lib/__tests__/workoutTagValidate.test.ts
git commit -m "feat(daily): classify-response validator"
```

---

### Task 8: `classify` action in the capture-post edge function

**Files:**
- Modify: `supabase/functions/capture-post/index.ts` (insert before the `if (body.action === 'extract')` branch at line 240)

- [ ] **Step 1: Add the action**

Insert this block after the `summarize` branch (after line 238):

```ts
    // Block-recommender tags for one captured workout. Suggest only: returns
    // tags the client validates (workoutTagValidate.ts) and saves itself.
    // Used at capture time, from the edit screen, and by the lazy backfill.
    if (body.action === 'classify') {
      if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
      const name = String(body.name ?? '').trim();
      if (!name) throw new Error('name is required');
      const rounds = String(body.rounds ?? '').trim();
      const caption = String(body.caption ?? '').trim();
      const rawProtocol = String(body.rawProtocol ?? '').trim();
      const muscles = (Array.isArray(body.muscles) ? body.muscles : []) as string[];
      const items = (Array.isArray(body.items) ? body.items : []) as {
        name?: string; sets?: number | null; reps?: string | null; duration?: string | null;
      }[];

      const SYSTEM = `You classify one saved workout for a daily session
recommender that assembles five-phase days: warmup -> mobility -> main ->
conditioning -> cooldown.

Rules:
- "block_roles": every phase this workout could serve, from exactly that
  vocabulary. Multi-role is normal (a stretching routine serves mobility and
  cooldown). A loaded strength or metcon piece is "main"; short high-heart-rate
  finishers are "conditioning".
- "primary_muscles"/"secondary_muscles": use ONLY names from the provided
  muscle list. Primary = what the workout is for; secondary = what assists.
- "est_minutes": how long one honest pass takes, INCLUDING the written rounds
  and sensible rests. A whole number.
- "intensity": low | moderate | high — systemic effort of the workout as
  written, not of its hardest movement.
- "skill_level": Beginner | Intermediate | Advanced — the technical demand of
  its hardest movement.

Respond as JSON:
{"block_roles": string[], "primary_muscles": string[],
 "secondary_muscles": string[], "est_minutes": number,
 "intensity": string, "skill_level": string}`;

      const movementLines = items
        .map((i) => [i.name, i.sets ? `${i.sets} sets` : null, i.reps, i.duration]
          .filter(Boolean).join(' · '))
        .join('\n');
      const user = [
        `Workout: ${name}`,
        rounds ? `Rounds: ${rounds}` : '',
        `Movements:\n${movementLines || '(none listed)'}`,
        rawProtocol ? `Prescription as written:\n${rawProtocol}` : '',
        caption ? `Original caption:\n${caption.slice(0, 2000)}` : '',
        ``,
        `Allowed muscles: ${muscles.join(', ')}`,
      ].filter((l) => l !== '').join('\n');

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('empty model response');
      // Parsed only to fail fast; the client validates every field.
      return json({ tags: JSON.parse(content) });
    }
```

- [ ] **Step 2: Deploy and smoke it**

Run from repo root: `npx supabase functions deploy capture-post`
Expected: deploy succeeds (this becomes capture-post v4).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/capture-post/index.ts
git commit -m "feat(daily): classify action tags a captured workout for the block recommender"
```

---

### Task 9: Tags + ledger Supabase client

**Files:**
- Create: `mobile/src/lib/supabase/workoutTags.ts`

No unit tests here — this file is all I/O; the pure halves were tested in Tasks 3-7.

- [ ] **Step 1: Implement `mobile/src/lib/supabase/workoutTags.ts`**

```ts
// Client half of workout tags and the usage ledger. Network only — every
// judgment lives in the pure modules (workoutTagValidate, dailyCoverage).
import { supabase } from "../supabase";
import { validateWorkoutTags } from "../workoutTagValidate";
import { daysBetween } from "../dailyCoverage";
import type { CapturedWorkoutEntry } from "../../types/capture";
import type {
  BlockRole,
  TaggedWorkout,
  UsageRow,
  WorkoutMuscle,
  WorkoutTags,
} from "../../types/dailyBlocks";

export async function fetchMuscleRegionNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from("muscle_regions")
    .select("name")
    .order("display_order", { ascending: true });
  if (error) {
    console.error("fetchMuscleRegionNames failed:", error);
    return [];
  }
  return (data ?? []).map((r) => r.name);
}

/** Every reviewed catalog workout with its tags and ledger recency —
 *  the block recommender's whole world. `today` is the caller's one clock
 *  sample. */
export async function fetchTaggedWorkouts(
  userId: string,
  today: string,
): Promise<TaggedWorkout[]> {
  const [workoutsRes, usageRes] = await Promise.all([
    supabase
      .from("captured_workouts")
      .select(`
        id, name, rounds, block_roles, est_minutes, intensity, skill_level,
        classified_at,
        source:captured_sources!inner(extraction_status),
        wmuscles:captured_workout_muscles(is_primary, muscle_region:muscle_regions(name))
      `)
      .eq("user_id", userId),
    supabase
      .from("captured_workout_usage")
      .select("captured_workout_id, performed_date")
      .eq("user_id", userId)
      .order("performed_date", { ascending: false })
      .limit(500),
  ]);
  if (workoutsRes.error) {
    console.error("fetchTaggedWorkouts failed:", workoutsRes.error);
    return [];
  }

  const lastPerformed = new Map<string, number>();
  for (const row of usageRes.data ?? []) {
    // A deleted workout leaves its ledger row with a null id — the training
    // still counts for coverage, but there is nothing left to date-stamp.
    if (!row.captured_workout_id) continue;
    if (lastPerformed.has(row.captured_workout_id)) continue;
    lastPerformed.set(
      row.captured_workout_id,
      Math.max(0, daysBetween(row.performed_date, today)),
    );
  }

  return (workoutsRes.data ?? [])
    .filter((row: any) => row.source?.extraction_status === "reviewed")
    .map((row: any): TaggedWorkout => ({
      workoutId: row.id,
      name: row.name,
      rounds: row.rounds ?? null,
      lastPerformedDaysAgo: lastPerformed.get(row.id) ?? null,
      tags: {
        blockRoles: (row.block_roles ?? []) as BlockRole[],
        muscles: (row.wmuscles ?? [])
          .map((m: any): WorkoutMuscle => ({
            name: m.muscle_region?.name ?? "",
            isPrimary: !!m.is_primary,
          }))
          .filter((m: WorkoutMuscle) => m.name !== ""),
        estMinutes: row.est_minutes ?? null,
        intensity: row.intensity ?? null,
        skillLevel: row.skill_level ?? null,
        classifiedAt: row.classified_at ?? null,
      },
    }));
}

/** Write tags: the row's columns plus a wholesale replace of the muscle
 *  junction — it's a handful of rows, same doctrine as saveGym.
 *
 *  This is the ONLY place `classified_at` is stamped. The validator always
 *  returns it null — null is exactly what the recommender reads as "untagged,
 *  ignore this workout" — so tags that were validated but never saved through
 *  here are invisible by design rather than by accident (Task 7 review). */
export async function saveWorkoutTags(
  workoutId: string,
  // Omit the stamp: this function IS the stamp. Taking a `classifiedAt` it
  // silently discards would read like a second stamping site (Task 7 review).
  tags: Omit<WorkoutTags, "classifiedAt">,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("captured_workouts")
      .update({
        block_roles: tags.blockRoles,
        est_minutes: tags.estMinutes,
        intensity: tags.intensity,
        skill_level: tags.skillLevel,
        classified_at: new Date().toISOString(),
      })
      .eq("id", workoutId);
    if (error) throw error;

    const { error: delError } = await supabase
      .from("captured_workout_muscles")
      .delete()
      .eq("captured_workout_id", workoutId);
    if (delError) throw delError;

    const names = tags.muscles.map((m) => m.name);
    if (names.length > 0) {
      const { data: regions, error: regError } = await supabase
        .from("muscle_regions")
        .select("id, name")
        .in("name", names);
      if (regError) throw regError;
      const byName = new Map((regions ?? []).map((r) => [r.name, r.id]));
      const rows = tags.muscles
        .filter((m) => byName.has(m.name))
        .map((m) => ({
          captured_workout_id: workoutId,
          muscle_region_id: byName.get(m.name),
          is_primary: m.isPrimary,
        }));
      if (rows.length > 0) {
        const { error: insError } = await supabase
          .from("captured_workout_muscles")
          .insert(rows);
        if (insError) throw insError;
      }
    }
    return true;
  } catch (e) {
    console.error("saveWorkoutTags failed:", e);
    return false;
  }
}

/** Ask the model for tags, validate, save. Returns the saved tags, or null —
 *  a failed classification leaves the workout untagged and out of play
 *  (spec §8), never half-tagged. */
export async function classifyWorkout(
  workout: CapturedWorkoutEntry,
  allowedMuscles: string[],
): Promise<WorkoutTags | null> {
  try {
    const { data, error } = await supabase.functions.invoke("capture-post", {
      body: {
        action: "classify",
        name: workout.name,
        rounds: workout.rounds,
        caption: workout.source?.captionText ?? "",
        rawProtocol: workout.rawProtocol ?? "",
        muscles: allowedMuscles,
        items: workout.items.map((i) => ({
          name: i.name, sets: i.sets, reps: i.reps, duration: i.duration,
        })),
      },
    });
    if (error) throw error;
    const tags = validateWorkoutTags(data?.tags, new Set(allowedMuscles));
    if (!tags) return null;
    const saved = await saveWorkoutTags(workout.workoutId, tags);
    return saved ? tags : null;
  } catch (e) {
    console.error("classifyWorkout failed:", e);
    return null;
  }
}

/** The coverage window's ledger rows. */
export async function fetchUsage(
  userId: string,
  sinceDate: string,
): Promise<UsageRow[]> {
  const { data, error } = await supabase
    .from("captured_workout_usage")
    .select("captured_workout_id, performed_date, block, muscles")
    .eq("user_id", userId)
    .gte("performed_date", sinceDate);
  if (error) {
    console.error("fetchUsage failed:", error);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    capturedWorkoutId: r.captured_workout_id,
    performedDate: r.performed_date,
    block: r.block,
    muscles: Array.isArray(r.muscles) ? r.muscles : [],
  }));
}

export interface RecordUsageInput {
  userId: string;
  sessionId: string | null;
  performedDate: string;
  entries: { capturedWorkoutId: string; block: BlockRole; muscles: WorkoutMuscle[] }[];
}

/** Upsert, not insert: a retried completion must not double-count a
 *  workout's muscles in the coverage weighting. */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  if (input.entries.length === 0) return;
  const { error } = await supabase.from("captured_workout_usage").upsert(
    input.entries.map((e) => ({
      user_id: input.userId,
      captured_workout_id: e.capturedWorkoutId,
      performed_date: input.performedDate,
      block: e.block,
      muscles: e.muscles,
      session_id: input.sessionId,
    })),
    { onConflict: "user_id,captured_workout_id,performed_date,block" },
  );
  if (error) console.error("recordUsage failed:", error);
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` — expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/workoutTags.ts
git commit -m "feat(daily): tags and usage-ledger client"
```

---

### Task 10: Real tags on `CapturedWorkoutEntry`

**Files:**
- Modify: `mobile/src/lib/supabase/capture.ts:300` (`toCapturedWorkoutEntry`), `:340-397` (both fetch selects)

- [ ] **Step 1: Extend the selects and the mapper**

In both `fetchCapturedWorkouts` and `fetchCapturedWorkout`, extend the select's first line and add the muscles join:

```ts
      id, name, rounds, raw_protocol, description, notes, created_at,
      block_roles, est_minutes, intensity, skill_level, classified_at,
      wmuscles:captured_workout_muscles(is_primary, muscle_region:muscle_regions(name)),
```

(keep the existing `source:` and `items:` joins unchanged). In `toCapturedWorkoutEntry` add to the returned object:

```ts
    tags: {
      blockRoles: row.block_roles ?? [],
      muscles: (row.wmuscles ?? [])
        .map((m: any) => ({
          name: m.muscle_region?.name ?? "",
          isPrimary: !!m.is_primary,
        }))
        .filter((m: any) => m.name !== ""),
      estMinutes: row.est_minutes ?? null,
      intensity: row.intensity ?? null,
      skillLevel: row.skill_level ?? null,
      classifiedAt: row.classified_at ?? null,
    },
```

Remove the Task-1 placeholder if one was added.

- [ ] **Step 2: Typecheck and test** — `npx tsc --noEmit && npm test` — expected: clean/pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/capture.ts
git commit -m "feat(daily): captured workout entries carry their tags"
```

---

### Task 11: `blocks` mode in the compose-session edge function

**Files:**
- Modify: `supabase/functions/compose-session/index.ts`

- [ ] **Step 1: Add the mode branch**

Inside `serve`, after the OPTIONS/auth checks and `await req.json()` (line 67-68), destructure `mode` too, and branch before the existing exercise flow:

```ts
    const bodyIn = await req.json();
    if (bodyIn.mode === 'blocks') return await composeBlocks(bodyIn);
    const { splitDay, minutes, budget = [], candidates = [], capturedWorkouts = [] } = bodyIn;
```

Then add above `serve` (module scope):

```ts
const BLOCKS_SYSTEM = `You are picking one person's training day from
pre-filtered shortlists — one pick per block, five blocks at most: warmup,
mobility, main, conditioning, cooldown. The deterministic engine already
handled soreness, time, recency and skill; your job is the judgment call of
which combination makes the most coherent day.

Rules:
- For each offered block, pick EXACTLY ONE candidate, by its exact "id".
  Never invent ids. Skip conditioning if skipping it makes a better day;
  never skip any other offered block.
- The day should hang together: the warmup, mobility and cooldown you pick
  should prepare and unwind the main workout you pick (matching body focus).
- Prefer neglected muscles over yesterday's muscles. Higher score = the
  engine's preference; you may reach past it when cohesion says so.
- Candidates marked BUILT-IN are shipped generics. Prefer the person's own
  captures when one fits; a built-in is the fallback, not the default.
- Each candidate's minutes are fixed. A "(note: ...)" is a round adjustment
  already computed — repeat it in your reason if it matters.
- "reason" is ONE short sentence to the athlete, plain and specific.

Respond as JSON:
{"blocks": [{"block": "warmup"|"mobility"|"main"|"conditioning"|"cooldown",
  "id": string, "reason": string}]}`;

async function composeBlocks(body: any): Promise<Response> {
  const { minutes, energy, soreness = {}, coverage = {}, relaxedMain = false,
    shortlists = {} } = body;

  const offered = Object.entries(shortlists as Record<string, any[]>)
    .filter(([, list]) => Array.isArray(list) && list.length > 0);
  if (offered.length === 0) {
    return new Response(JSON.stringify({ composition: { blocks: [] } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const soreLines = Object.entries(soreness as Record<string, number>)
    .map(([m, s]) => `${m}: ${s}/3`).join(', ') || 'none';
  const tables = offered.map(([block, list]) => {
    const rows = list.map((c: any) => [
      `${c.id} · ${c.name}`,
      `~${c.minutes} min`,
      c.builtin ? 'BUILT-IN' : null,
      `focus ${c.focus}`,
      Array.isArray(c.muscles) && c.muscles.length > 0 ? `muscles ${c.muscles.join('/')}` : null,
      c.lastPerformedDaysAgo == null ? 'never done' : `last done ${c.lastPerformedDaysAgo}d ago`,
      typeof c.score === 'number' ? `score ${c.score.toFixed(2)}` : null,
      c.roundsNote ? `(note: ${c.roundsNote})` : null,
    ].filter(Boolean).join(' · ')).join('\n');
    return `${block.toUpperCase()}:\n${rows}`;
  }).join('\n\n');

  const user = [
    `Minutes available: ${minutes}. Energy: ${energy}/10. Soreness: ${soreLines}.`,
    `Most neglected muscles this week: ${(coverage.neglected ?? []).join(', ') || 'no history yet'}.`,
    `Hit yesterday: ${(coverage.yesterday ?? []).join(', ') || 'nothing'}.`,
    relaxedMain
      ? 'NOTE: the main shortlist only exists because exclusions were relaxed — every candidate was done recently. Say so in the main reason.'
      : '',
    ``, `Shortlists (ranked, best first):`, tables,
  ].filter((l) => l !== '').join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: BLOCKS_SYSTEM },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`openai ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('empty model response');
  // Parsed only to fail fast — the client re-validates every id.
  return new Response(JSON.stringify({ composition: JSON.parse(content) }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

Also update the header comment (lines 1-7) to mention both modes.

- [ ] **Step 2: Deploy** — from repo root: `npx supabase functions deploy compose-session` — expected: success.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/compose-session/index.ts
git commit -m "feat(daily): blocks mode — the AI picks one candidate per block"
```

---

### Task 12: Persistence — blocks, ledger, reroll

**Files:**
- Modify: `mobile/src/lib/supabase/daily.ts` (`fetchTodaySession`, `saveGeneratedSession`, `completeSession`; new `rerollBlock`)

- [ ] **Step 1: Read blocks in `fetchTodaySession`**

Add to the select (inside the existing backtick string, after the `items:` join):

```ts
      blocks:generated_session_blocks(
        id, block, name, captured_workout_id, builtin_key, minutes,
        rounds_note, reason
      )
```

Add imports at the top of the file:

```ts
import { BLOCK_ORDER, SECTION_FOR_BLOCK } from "../dailyBlockCompose";
import { recordUsage } from "./workoutTags";
import type { BlockPick, StoredBlock } from "../../types/dailyBlocks";
```

And map blocks in the returned object (after `items`). The name is stored on
the row, so a block whose workout was later deleted still reads as history:

```ts
    blocks: (((data as any).blocks ?? []) as any[])
      .map((b): StoredBlock => ({
        id: b.id,
        block: b.block,
        workoutId: b.captured_workout_id,
        builtinKey: b.builtin_key,
        minutes: b.minutes,
        roundsNote: b.rounds_note,
        reason: b.reason,
        name: b.name,
      }))
      .sort((a, b) => BLOCK_ORDER.indexOf(a.block) - BLOCK_ORDER.indexOf(b.block)),
```

- [ ] **Step 2: Write blocks in `saveGeneratedSession`**

The amended schema's source check is mutual exclusion, not presence — a block
row with BOTH `captured_workout_id` and `builtin_key` NULL is now legal, so
that a deleted workout can leave named history behind. That makes this writer
solely responsible for giving every block a source. Drop any pick carrying
neither, and log it; the client is untyped and nothing else will catch it.

Change `SaveSessionInput` to carry picks:

```ts
export interface SaveSessionInput {
  userId: string;
  date: string;
  gymProfileId: string | null;
  checkinId: string | null;
  session: ComposedSession;
  /** Block plan for a block-composed session; empty for legacy shapes. */
  blocks: BlockPick[];
  inputsSnapshot: unknown;
}
```

After the items insert (line 487), add:

```ts
    const { error: blkDelError } = await supabase
      .from("generated_session_blocks")
      .delete()
      .eq("session_id", data.id);
    if (blkDelError) throw blkDelError;
    if (input.blocks.length > 0) {
      const { error: blkError } = await supabase.from("generated_session_blocks").insert(
        input.blocks.map((b) => ({
          session_id: data.id,
          block: b.block,
          name: b.name,
          captured_workout_id: b.workoutId,
          builtin_key: b.builtinKey,
          minutes: b.minutes,
          rounds_note: b.roundsNote,
          reason: b.reason,
        })),
      );
      if (blkError) throw blkError;
    }
```

- [ ] **Step 3: Explode block picks into session items**

Add to `daily.ts` (near `adoptCapturedWorkout`):

```ts
/** A block plan's catalog workouts as loggable session items — built-in
 *  blocks contribute none (their movements aren't exercise rows). Sections
 *  map per spec §7 (conditioning → accessory). */
export async function blockPicksToItems(picks: BlockPick[]): Promise<SessionItem[]> {
  const workoutIds = picks.map((p) => p.workoutId).filter((id): id is string => id !== null);
  if (workoutIds.length === 0) return [];
  const { data, error } = await supabase
    .from("captured_workout_exercises")
    .select("captured_workout_id, exercise_id, exercise_order, target_sets, target_reps, rest_seconds")
    .in("captured_workout_id", workoutIds)
    .order("exercise_order", { ascending: true });
  if (error) {
    console.error("blockPicksToItems failed:", error);
    return [];
  }
  const byWorkout = new Map<string, any[]>();
  for (const row of data ?? []) {
    const list = byWorkout.get(row.captured_workout_id) ?? [];
    list.push(row);
    byWorkout.set(row.captured_workout_id, list);
  }
  const items: SessionItem[] = [];
  for (const pick of picks) {
    if (!pick.workoutId) continue;
    for (const row of byWorkout.get(pick.workoutId) ?? []) {
      items.push({
        exerciseId: row.exercise_id,
        section: SECTION_FOR_BLOCK[pick.block],
        itemOrder: items.length,
        targetSets: row.target_sets,
        targetReps: row.target_reps,
        restSeconds: row.rest_seconds,
        reason: null,
      });
    }
  }
  return items;
}
```

Add `SessionItem` to the type import from `../../types/daily`, and fix the two existing `saveGeneratedSession` callers: `useDailySession.ts` passes `blocks` (Task 13); if any other caller exists, pass `blocks: []`.

- [ ] **Step 4: Ledger writes in `completeSession`**

Append to `completeSession`, after the status update succeeds:

```ts
  // §3.2: the ledger records what actually ran — composed blocks and
  // workouts served whole alike. Muscles denormalized now, so a retag never
  // rewrites history.
  const { data: sess } = await supabase
    .from("generated_sessions")
    .select(`
      user_id, session_date, served_captured_workout_id,
      blocks:generated_session_blocks(block, captured_workout_id)
    `)
    .eq("id", sessionId)
    .single();
  if (!sess) return;
  const entries: { capturedWorkoutId: string; block: BlockRole }[] = [];
  for (const b of ((sess as any).blocks ?? []) as any[]) {
    if (b.captured_workout_id) {
      entries.push({ capturedWorkoutId: b.captured_workout_id, block: b.block });
    }
  }
  if (entries.length === 0 && sess.served_captured_workout_id) {
    entries.push({ capturedWorkoutId: sess.served_captured_workout_id, block: "main" });
  }
  if (entries.length === 0) return;
  const ids = [...new Set(entries.map((e) => e.capturedWorkoutId))];
  const { data: muscleRows } = await supabase
    .from("captured_workout_muscles")
    .select("captured_workout_id, is_primary, muscle_region:muscle_regions(name)")
    .in("captured_workout_id", ids);
  const musclesByWorkout = new Map<string, { name: string; isPrimary: boolean }[]>();
  for (const m of (muscleRows ?? []) as any[]) {
    const name = m.muscle_region?.name;
    if (!name) continue;
    const list = musclesByWorkout.get(m.captured_workout_id) ?? [];
    list.push({ name, isPrimary: !!m.is_primary });
    musclesByWorkout.set(m.captured_workout_id, list);
  }
  await recordUsage({
    userId: sess.user_id,
    sessionId,
    performedDate: sess.session_date,
    entries: entries.map((e) => ({
      ...e,
      muscles: musclesByWorkout.get(e.capturedWorkoutId) ?? [],
    })),
  });
```

Add `BlockRole` to the dailyBlocks type import.

- [ ] **Step 5: Reroll write**

Add to `daily.ts`:

```ts
/**
 * Swap ONE block for the next shortlist candidate (spec §6). Only a
 * still-suggested session rerolls — an accepted or completed day is history.
 * The shortlists ride in inputs_snapshot, written at compose time.
 *
 * The day's total re-flows here: a swap is bounded by the block's own
 * envelope, but main's envelope can be 25 minutes wide, so a reroll can push
 * the day past the budget. Recompute the total after the swap and surface it
 * — §6 says the totals re-flow, and the Today tab reads them back (Task 6
 * review).
 */
export async function rerollBlock(
  sessionId: string,
  block: BlockRole,
): Promise<boolean> {
  try {
    const { data: sess, error } = await supabase
      .from("generated_sessions")
      .select(`
        status, inputs_snapshot,
        blocks:generated_session_blocks(id, block, captured_workout_id, builtin_key)
      `)
      .eq("id", sessionId)
      .single();
    if (error || !sess) throw error ?? new Error("session not found");
    if (sess.status !== "suggested") return false;

    const shortlists = (sess.inputs_snapshot as any)?.shortlists ?? {};
    const list = (shortlists[block] ?? []) as BlockCandidate[];
    const current = ((sess as any).blocks as any[]).find((b) => b.block === block);
    if (!current) return false;
    const next = nextCandidate(list, current.captured_workout_id ?? current.builtin_key ?? "");
    if (!next) return false;

    const { error: upError } = await supabase
      .from("generated_session_blocks")
      .update({
        captured_workout_id: next.workoutId,
        builtin_key: next.builtinKey,
        name: next.name,
        minutes: next.minutes,
        rounds_note: next.roundsNote,
        reason: null, // the model's reason explained the OLD pick
      })
      .eq("id", current.id);
    if (upError) throw upError;

    // Replace just this block's loggable items.
    const { error: delError } = await supabase
      .from("generated_session_items")
      .delete()
      .eq("session_id", sessionId)
      .eq("section", SECTION_FOR_BLOCK[block]);
    if (delError) throw delError;
    if (next.workoutId) {
      const items = await blockPicksToItems([
        { block, workoutId: next.workoutId, builtinKey: null, name: next.name,
          minutes: next.minutes, roundsNote: next.roundsNote, reason: null },
      ]);
      if (items.length > 0) {
        const { error: insError } = await supabase.from("generated_session_items").insert(
          items.map((i, idx) => ({
            session_id: sessionId,
            exercise_id: i.exerciseId,
            item_order: 1000 + idx, // after existing items; display sorts by section
            section: i.section,
            target_sets: i.targetSets,
            target_reps: i.targetReps,
            rest_seconds: i.restSeconds,
            reason: null,
          })),
        );
        if (insError) throw insError;
      }
    }
    return true;
  } catch (e) {
    console.error("rerollBlock failed:", e);
    return false;
  }
}
```

Add `nextCandidate` to the dailyBlockCompose import and `BlockCandidate` to the dailyBlocks type import.

- [ ] **Step 6: Typecheck, run the suite, commit**

Run: `npx tsc --noEmit && npm test` — expected: the only errors are `useDailySession.ts` missing the new `blocks` field on `SaveSessionInput`; add `blocks: []` there temporarily (Task 13 replaces it). Then clean.

```bash
git add src/lib/supabase/daily.ts src/hooks/useDailySession.ts
git commit -m "feat(daily): persist block plans, write the usage ledger, reroll one block"
```

---

### Task 13: The hook — block engine inside the same contract

**Files:**
- Modify: `mobile/src/hooks/useDailySession.ts`

The hook's external contract (`UseDailySessionValue`) does not change. Everything from the `// ---- Rules tier ----` comment (line 113) through the `saveGeneratedSession` call (line 220) is replaced; the scaffolding (run ids, signature cache, retry, gates at lines 88-103) stays.

- [ ] **Step 1: Replace imports**

Remove imports of `nextSplitDay`, `buildCandidatePools`, `resolveProgressions`, `sessionBudget`, `composeFallback`, `validateAiSession`, `fetchBfrFlag`, `fetchCandidateData`. Keep `rampWeek`, `estimateSectionMinutes`, gyms/check-in/session fetchers. Add:

```ts
import { rampWeek } from "../lib/dailySplit";
import { muscleCoverage } from "../lib/dailyCoverage";
import { blockEnvelopes } from "../lib/dailyBlockBudget";
import { isRecoveryDay, buildBlockShortlists } from "../lib/dailyBlockShortlist";
import {
  composeBlockFallback,
  validateBlockComposition,
} from "../lib/dailyBlockCompose";
import { blockPicksToItems, saveGeneratedSession } from "../lib/supabase/daily";
import {
  classifyWorkout,
  fetchMuscleRegionNames,
  fetchTaggedWorkouts,
  fetchUsage,
} from "../lib/supabase/workoutTags";
import { fetchCapturedWorkouts } from "../lib/supabase/capture";
import type { BlockPick, BlockShortlists } from "../types/dailyBlocks";
```

- [ ] **Step 2: Replace the compute section**

Replace lines 105-220 (from `const activeGym = ...` through the `saveGeneratedSession` call) with:

```ts
      const activeGym = gymList.find((g) => g.isActive) ?? null;
      const sinceDate = new Date(new Date(`${today}T00:00:00`).getTime() - 8 * 86400000)
        .toISOString().slice(0, 10);
      const [captured, usage, muscleNames, firstRow] = await Promise.all([
        fetchCapturedWorkouts(user.id),
        fetchUsage(user.id, sinceDate),
        fetchMuscleRegionNames(),
        supabase
          .from("generated_sessions")
          .select("session_date")
          .eq("user_id", user.id)
          .order("session_date", { ascending: true })
          .limit(1)
          .maybeSingle()
          .then((r) => r.data),
      ]);
      if (runId !== runIdRef.current) return;

      // ---- Lazy classification backfill (spec §3.1, §8): tag what isn't
      // tagged, in place, before shortlisting. A failure leaves that workout
      // out of play today; tomorrow retries.
      const untagged = captured.filter((w) => w.tags.classifiedAt === null);
      if (untagged.length > 0 && muscleNames.length > 0) {
        await Promise.all(untagged.map((w) =>
          classifyWorkout(w, muscleNames).catch(() => null)));
      }
      const tagged = await fetchTaggedWorkouts(user.id, today);
      if (runId !== runIdRef.current) return;

      // ---- Rules tier ----
      const week = rampWeek(firstRow?.session_date ?? null, today);
      const recovery = isRecoveryDay(todayCheckin);
      const coverage = muscleCoverage(usage, today);
      const envelopes = blockEnvelopes(todayCheckin.minutesAvailable, recovery);
      const { shortlists, relaxedMain } = buildBlockShortlists(tagged, {
        coverage,
        soreness: todayCheckin.soreness,
        envelopes,
        rampWeek: week,
        // Told, not inferred: spec §6's "recovery days are mobility and
        // cool-down only" is a rule about the day, not a consequence of the
        // envelope array's shape (Task 5 review).
        recoveryDay: recovery,
      });
      // Budget-aware: the fallback runs precisely when the model's answer was
      // rejected, often for overrunning, so handing back the same overrun
      // would make the rejection meaningless (Task 6 review).
      const fallbackPicks = composeBlockFallback(
        shortlists, todayCheckin.minutesAvailable,
      );

      // ---- AI tier: one ask per question signature ----
      const shortlistIds = Object.values(shortlists)
        .flat()
        .map((c) => c.workoutId ?? c.builtinKey ?? "")
        .sort()
        .join(",");
      const signature = [
        today, todayCheckin.id, todayCheckin.minutesAvailable,
        todayCheckin.energy, recovery ? "recovery" : "train", shortlistIds,
      ].join("::");

      const aiBody = {
        mode: "blocks",
        minutes: todayCheckin.minutesAvailable,
        energy: todayCheckin.energy,
        soreness: todayCheckin.soreness,
        relaxedMain,
        coverage: {
          neglected: coverage.neglected.slice(0, 8),
          yesterday: [...coverage.yesterday],
        },
        shortlists: Object.fromEntries(
          Object.entries(shortlists).map(([block, list]) => [
            block,
            (list ?? []).map((c) => ({
              id: c.workoutId ?? c.builtinKey,
              name: c.name,
              minutes: c.minutes,
              roundsNote: c.roundsNote,
              focus: c.focus,
              builtin: c.builtinKey !== null,
              muscles: c.muscles.filter((m) => m.isPrimary).map((m) => m.name),
              lastPerformedDaysAgo:
                tagged.find((w) => w.workoutId === c.workoutId)?.lastPerformedDaysAgo ?? null,
              score: c.score,
            })),
          ]),
        ),
      };

      let picks: BlockPick[] = fallbackPicks;
      let source: "ai" | "rules_fallback" = "rules_fallback";
      try {
        let cached = aiAnswerBySignature.get(signature);
        if (cached === undefined) {
          let ask = aiAskInFlight.get(signature);
          if (!ask) {
            ask = askComposeSession(aiBody);
            aiAskInFlight.set(signature, ask);
            ask.finally(() => aiAskInFlight.delete(signature));
          }
          const raw = await ask;
          cached = validateBlockComposition(
            raw, shortlists, todayCheckin.minutesAvailable,
          );
          aiAnswerBySignature.set(signature, cached);
        }
        if (cached) {
          picks = cached;
          source = "ai";
        }
      } catch (e) {
        // AI failure is not an error state — rules stand alone (spec §5).
        console.warn("compose-session ask failed:", e);
      }
      if (runId !== runIdRef.current) return;

      const items = await blockPicksToItems(picks);
      const sectionMinutes = Object.fromEntries(
        picks.map((p) => [SECTION_FOR_BLOCK[p.block], p.minutes]),
      );
      const sessionId = await saveGeneratedSession({
        userId: user.id,
        date: today,
        gymProfileId: activeGym?.id ?? null,
        checkinId: todayCheckin.id,
        session: {
          splitDay: null, // block sessions never move the PPL rotation
          rampWeek: week,
          source,
          servedCapturedWorkoutId: null,
          items,
          sectionMinutes,
        },
        blocks: picks,
        // Shortlists ride along for reroll; aiBody for audit, same as before.
        inputsSnapshot: { aiBody, shortlists: shortlists as BlockShortlists },
      });
```

Keep the tail of `load()` unchanged (refetch of the stored session, error handling). Change the module-scope cache type (line 30) to:

```ts
const aiAnswerBySignature = new Map<string, BlockPick[] | null>();
```

and add `SECTION_FOR_BLOCK` to the dailyBlockCompose import.

- [ ] **Step 3: Typecheck and full suite** — `npx tsc --noEmit && npm test` — expected: clean/pass. `nextSplitDay`/`dailyCandidates`/`dailyBudget` and their tests remain in the repo — the deferred exercise-level phase reuses them; do not delete.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useDailySession.ts
git commit -m "feat(daily): the Today engine composes five blocks from whole catalog workouts"
```

---

### Task 14: Today tab UI

**Files:**
- Modify: `mobile/src/components/training/daily/TodayTab.tsx`

- [ ] **Step 1: Render the block session**

Add imports:

```ts
import { RotateCw } from "lucide-react-native";
import { builtinByKey } from "@/src/lib/dailyBuiltins";
import { SECTION_FOR_BLOCK } from "@/src/lib/dailyBlockCompose";
import { rerollBlock } from "@/src/lib/supabase/daily";
import type { StoredBlock } from "@/src/types/dailyBlocks";
```

Add block titles and a nudge helper near `SECTION_TITLES`:

```ts
const BLOCK_TITLES: Record<StoredBlock["block"], string> = {
  warmup: "Warm-up",
  mobility: "Mobility",
  main: "Main workout",
  conditioning: "Conditioning",
  cooldown: "Cool-down",
};
const NUDGE_FOCUS: Record<string, string> = {
  upper: "an upper-body", lower: "a lower-body", full: "a full-body",
};
function gapNudge(builtinKey: string): string {
  const b = builtinByKey(builtinKey);
  if (!b) return "Capture a routine to replace this built-in.";
  return `Capture ${NUDGE_FOCUS[b.focus]} ${BLOCK_TITLES[b.role].toLowerCase()} routine to replace this built-in.`;
}
```

Inside the component add reroll state and handler:

```ts
  const [rerolling, setRerolling] = useState<string | null>(null);
  const reroll = async (block: StoredBlock["block"]) => {
    if (!session || rerolling) return;
    setRerolling(block);
    const changed = await rerollBlock(session.id, block);
    setRerolling(null);
    if (changed) bump();
  };
```

In the JSX, in the non-served session branch, render blocks when they exist. Replace the `: SECTION_ORDER.map(...)` arm with:

```tsx
              : session.blocks.length > 0
                ? session.blocks.map((block) => {
                    const builtin = block.builtinKey ? builtinByKey(block.builtinKey) : null;
                    const items = session.items.filter(
                      (i) => i.section === SECTION_FOR_BLOCK[block.block],
                    );
                    const canReroll = session.status === "suggested";
                    return (
                      <View key={block.id} style={styles.section}>
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionTitle}>
                            {BLOCK_TITLES[block.block]}
                          </Text>
                          <View style={styles.blockHeaderRight}>
                            <Text style={styles.sectionMinutes}>~{block.minutes} min</Text>
                            {canReroll && (
                              <TouchableOpacity
                                onPress={() => reroll(block.block)}
                                disabled={rerolling !== null}
                                accessibilityRole="button"
                                accessibilityLabel={`Swap the ${BLOCK_TITLES[block.block]}`}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                {rerolling === block.block
                                  ? <ActivityIndicator size="small" color={colors.primary} />
                                  : <RotateCw size={15} color={colors.primary} />}
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                        <View style={styles.blockCard}>
                          <View style={styles.blockNameRow}>
                            <Text style={styles.itemName}>{block.name}</Text>
                            {builtin && <Text style={styles.builtinBadge}>BUILT-IN</Text>}
                          </View>
                          {block.roundsNote && (
                            <Text style={styles.itemMeta}>{block.roundsNote}</Text>
                          )}
                          {block.reason && (
                            <Text style={styles.itemReason}>{block.reason}</Text>
                          )}
                          {builtin
                            ? builtin.movements.map((m) => (
                                <View key={m.name} style={styles.blockItemRow}>
                                  <Text style={styles.blockItemName}>{m.name}</Text>
                                  <Text style={styles.itemMeta}>{m.prescription}</Text>
                                </View>
                              ))
                            : items.map((item) => (
                                <TouchableOpacity
                                  key={item.id}
                                  style={styles.blockItemRow}
                                  activeOpacity={0.7}
                                  onPress={() =>
                                    router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
                                  }
                                >
                                  <Text style={styles.blockItemName}>{item.name}</Text>
                                  <Text style={styles.itemMeta}>
                                    {[
                                      item.targetSets
                                        ? `${item.targetSets} × ${item.targetReps ?? "?"}`
                                        : item.targetReps,
                                    ].filter(Boolean).join(" · ")}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                          {builtin && (
                            <Text style={styles.nudge}>{gapNudge(block.builtinKey!)}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                : SECTION_ORDER.map((section) => {
```

(the legacy `SECTION_ORDER.map` arm continues unchanged — it still renders pre-block sessions).

- [ ] **Step 2: Title and totals for block sessions**

In the header, where the title picks push/pull/legs (lines 133-141), block sessions need their own line. Replace the title expression with:

```tsx
                {served
                  ? served.name
                  : session.blocks.length > 0
                    ? session.blocks.some((b) => b.block === "main")
                      ? session.blocks.find((b) => b.block === "main")!.name
                      : "Recovery day"
                    : session.splitDay === "push"
                      ? "Push day"
                      : session.splitDay === "pull"
                        ? "Pull day"
                        : "Leg day"}
```

Under the badges, for a recovery day add (after the source badge block, inside the header):

```tsx
              {session.blocks.length > 0 && !session.blocks.some((b) => b.block === "main") && (
                <Text style={styles.recoveryNote}>
                  You're beat up — mobility and stretching only today, on purpose.
                </Text>
              )}
```

The existing `plannedMinutes` line already sums `sectionMinutes`, which Task 13
writes from block minutes. It does need one change: **when the planned total
exceeds the minutes the user said they had, say so.** The rules fallback keeps
every block even when a block's shortest candidate busts the budget — a
complete session that runs long beats a mutilated one, and the durations are
the creators', not ours to shrink — so a short day can legitimately plan 60
minutes against a 45-minute budget (Task 6 review). That is honest only if the
screen admits it. Style the total as a warning and append "— runs long" when
`plannedMinutes > checkin.minutesAvailable`.

- [ ] **Step 3: Styles**

Add to the StyleSheet:

```ts
  blockHeaderRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  blockCard: {
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 12, gap: 4,
  },
  blockNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  builtinBadge: {
    fontSize: 10, color: colors.mutedForeground, borderWidth: 1,
    borderColor: colors.border, borderRadius: 8, paddingHorizontal: 6,
    paddingVertical: 1, overflow: "hidden", letterSpacing: 0.5,
  },
  blockItemRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  blockItemName: { fontSize: 14, color: colors.foreground, flex: 1, marginRight: 8 },
  nudge: { fontSize: 12, color: "#F59E0B", marginTop: 6, fontStyle: "italic" },
  recoveryNote: { fontSize: 13, color: colors.mutedForeground, marginTop: 6 },
```

- [ ] **Step 4: Typecheck and commit**

Run: `npx tsc --noEmit` — expected: clean.

```bash
git add src/components/training/daily/TodayTab.tsx
git commit -m "feat(daily): Today shows the five-block day with reroll and gap nudges"
```

---

### Task 15: Tag display + editor on the workout screen

**Files:**
- Modify: `mobile/src/components/training/daily/CapturedWorkoutScreen.tsx`

- [ ] **Step 1: Show tags in view mode**

Add imports:

```ts
import { classifyWorkout, saveWorkoutTags, fetchMuscleRegionNames } from "@/src/lib/supabase/workoutTags";
import type { BlockRole, WorkoutIntensity } from "@/src/types/dailyBlocks";
```

Below the description block in view mode, render a tag summary row (style to match existing meta text):

```tsx
        {!editing && workout.tags.classifiedAt !== null && (
          <Text style={styles.tagSummary}>
            {[
              workout.tags.blockRoles.join(" · "),
              workout.tags.estMinutes ? `~${workout.tags.estMinutes} min` : null,
              workout.tags.intensity,
              workout.tags.skillLevel,
            ].filter(Boolean).join("  ·  ")}
          </Text>
        )}
        {!editing && workout.tags.classifiedAt === null && (
          <TouchableOpacity
            style={styles.tagButton}
            disabled={tagging}
            onPress={async () => {
              setTagging(true);
              const names = await fetchMuscleRegionNames();
              await classifyWorkout(workout, names);
              setTagging(false);
              await reload(); // the screen's existing re-read function
            }}
          >
            <Text style={styles.tagButtonText}>
              {tagging ? "Tagging…" : "Tag for the recommender"}
            </Text>
          </TouchableOpacity>
        )}
```

with state `const [tagging, setTagging] = useState(false);`. If the screen's re-read function has a different name than `reload`, call that one — it is the function the `useFocusEffect` at line 76 uses.

- [ ] **Step 2: Edit tags in edit mode**

Extend the draft shape (`draftFrom`, line 28 area) with `blockRoles`, `estMinutes` (string, for the TextInput), `intensity`, `skillLevel`, seeded from `workout.tags`. In the edit-mode JSX add, below the existing description editor:

```tsx
          {editing && (
            <View style={styles.tagEditor}>
              <Text style={styles.tagEditorLabel}>Serves as</Text>
              <View style={styles.chipRow}>
                {(["warmup", "mobility", "main", "conditioning", "cooldown"] as BlockRole[]).map((role) => {
                  const on = draft!.blockRoles.includes(role);
                  return (
                    <TouchableOpacity
                      key={role}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() =>
                        setDraft((d) => d && ({
                          ...d,
                          blockRoles: on
                            ? d.blockRoles.filter((r) => r !== role)
                            : [...d.blockRoles, role],
                        }))
                      }
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{role}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.tagEditorLabel}>Estimated minutes</Text>
              <TextInput
                style={styles.tagInput}
                keyboardType="number-pad"
                value={draft!.estMinutes}
                onChangeText={(v) => setDraft((d) => d && { ...d, estMinutes: v })}
                placeholder="e.g. 35"
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={styles.tagEditorLabel}>Intensity</Text>
              <View style={styles.chipRow}>
                {(["low", "moderate", "high"] as WorkoutIntensity[]).map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[styles.chip, draft!.intensity === level && styles.chipOn]}
                    onPress={() => setDraft((d) => d && { ...d, intensity: level })}
                  >
                    <Text style={[styles.chipText, draft!.intensity === level && styles.chipTextOn]}>
                      {level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
```

In the screen's `save` function (line ~160), after `updateCapturedWorkout` succeeds, persist tags — keeping muscles as they were (the editor edits roles/minutes/intensity; muscle editing stays on the AI):

```ts
    const est = parseInt(draft.estMinutes, 10);
    await saveWorkoutTags(workout.workoutId, {
      blockRoles: draft.blockRoles,
      muscles: workout.tags.muscles,
      estMinutes: Number.isFinite(est) && est >= 1 && est <= 240 ? est : null,
      intensity: draft.intensity,
      skillLevel: workout.tags.skillLevel,
    });
```

**Do not save at all when the workout has no primary muscle.** A workout with
no muscles is immune to the soreness gate — a chest workout the classifier
failed to tag can be offered on a chest-sore day — and this editor is the one
path to "classified" that never passes through the tag validator (Task 5
review). `saveWorkoutTags` stamps `classified_at` unconditionally, so the
guard has to be here: if the workout carries no primary muscle, skip the tag
save entirely and tell the user it needs classifying before the recommender
will use it, pointing them at the "Tag for the recommender" button. Task 7's
validator enforces the same rule on the AI path.

```ts
```

Styles (match the screen's existing palette):

```ts
  tagSummary: { fontSize: 13, color: colors.mutedForeground, marginTop: 8 },
  tagButton: {
    alignSelf: "flex-start", borderWidth: 1, borderColor: colors.primary,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8,
  },
  tagButtonText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  tagEditor: { marginTop: 16, gap: 8 },
  tagEditorLabel: {
    fontSize: 12, color: colors.mutedForeground, textTransform: "uppercase",
    letterSpacing: 1,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.muted },
  chipText: { fontSize: 13, color: colors.mutedForeground },
  chipTextOn: { color: colors.primary, fontWeight: "600" },
```

(If `TextInput` isn't imported yet, add it to the react-native import; the screen already edits text fields, so it likely is.)

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit` — expected: clean.

```bash
git add src/components/training/daily/CapturedWorkoutScreen.tsx
git commit -m "feat(daily): workout tags visible and editable on the workout screen"
```

---

### Task 16: Full verification

- [ ] **Step 1: Static + unit**

Run: `npx tsc --noEmit` — expected: clean.
Run: `npm test` — expected: every suite passes, including the five new ones.

- [ ] **Step 2: Confirm deploys and migration**

From repo root: `npx supabase migration list` — expected: `20260818100000` applied. Both functions were deployed in Tasks 8 and 11; if unsure, redeploy both.

- [ ] **Step 3: On-device checklist (Brian verifies — a green typecheck proves nothing about schema correctness)**

1. Open a workout in the catalog → "Tag for the recommender" → tags appear; edit them; they stick after leaving and returning.
2. Today tab with a saved check-in → five blocks render (or four under 75 min), each with minutes, reason, and the main workout as the title; total ≈ minutes available.
3. Blocks with no matching capture show BUILT-IN + the capture nudge.
4. Reroll on a block swaps only that block.
5. Set 3 muscle groups sore at 2+ in the check-in → recovery day: mobility + cool-down only, recovery copy shown.
6. Start and complete the session → next day's coverage avoids those muscles (check `captured_workout_usage` rows exist: `npx supabase db dump` or the dashboard).
7. Airplane-mode the AI (or let it fail) → session still appears, badged "Rules composed".

- [ ] **Step 4: Final commit if verification produced fixes**

```bash
git add -A && git commit -m "fix(daily): on-device findings from block recommender verification"
```

---

## Self-review notes (already applied)

- **Spec coverage:** §3.1 → Tasks 1/8/9/10/15; §3.2 → Tasks 1/9/12; §3.3 → Task 2; §4 → Tasks 3-5; §5 → Tasks 6/11/13; §6 → Tasks 12/14; §7 → Tasks 1/6; §8 → relaxation in Task 5, short-day envelopes in Task 4, untagged exclusion in Tasks 5/9/13, AI-failure fallback in Task 13; §9 → the five test suites + device checklist; §10 honored (old exercise modules kept, nothing else built).
- **Pinned during planning** (spec was silent): no per-user skill state exists, so "not exceed the user's skill level" is implemented as *Advanced workouts sit out ramp weeks 1-2*; block sessions store `split_day` NULL so they never move the legacy PPL rotation; reroll clears the AI reason rather than inventing one.
- **Type consistency:** `BlockPick`/`BlockCandidate`/`StoredBlock` defined once in Task 1 and used by name everywhere; `SECTION_FOR_BLOCK` defined in Task 6, consumed in Tasks 12-14.
