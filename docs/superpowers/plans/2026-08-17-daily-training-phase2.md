# Daily Training Phase 2 — The Daily Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each day, after a 10-second check-in, FitTracker composes a complete gym-aware session from the captured catalog (rules tier on-device + one constrained AI call), shows it on the Today tab and Home, and logs it through the existing set-by-set chain.

**Architecture:** Hybrid rules+AI per the spec (`docs/superpowers/specs/2026-08-16-daily-training-design.md` §5): pure TS modules compute split position, re-entry ramp, candidate filtering/ranking, progression resolution, and the time budget; the `compose-session` edge function makes exactly one judgment call, constrained to candidate ids, re-validated client-side; rules-only composition is the always-available fallback. Gym context is chip-plus-sheet (§6, revised). Logging reuses `app/workout/[id].tsx` via a new daily mode: instance-table parentage becomes nullable and the screen learns to build its template shape from `generated_session_items`.

**Tech Stack:** Expo/React Native, Supabase (Postgres + RLS, Deno edge functions), OpenAI `gpt-5.6-terra`, Jest.

**Binding conventions (same as Phase 1, plus one new):**
- Supabase JS client is untyped — runtime verification steps are mandatory, tsc proves nothing about schema.
- **The live DB has drifted ahead of `supabase/migrations`** for the instance tables: the app writes columns the migrations never defined (`set_instances.difficulty`, `.increase_weight_next`, `.notes`, `.weight_lbs`; `workout_instances.duration_seconds`; `program_workout_exercises.superset_group`). Migrations are a lower bound. Never "fix" this drift in this project; just don't be surprised by it, and verify DDL assumptions with `npx supabase db dump --schema public` when something errors.
- Migrations via `npx supabase db push --yes` from `mobile/`. Never dashboard SQL.
- Bottom sheets, never inline pickers.
- Commit exactly where the plan says (this plan's approval is the commit authorization); stage ONLY the named paths — the working tree has unrelated uncommitted changes. No PRs, ever.
- Work on branch `daily-training-phase2`; merging to main is the user's call at the end.

---

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260817100000_daily_loop_schema.sql` | Create: gyms, check-ins, generated sessions, skill state, BFR flag |
| `supabase/migrations/20260817100001_relax_instance_parentage.sql` | Modify: nullable program parentage on instance tables |
| `mobile/src/types/daily.ts` | Create: all Phase-2 domain types |
| `mobile/src/lib/dailySplit.ts` (+test) | Pure: split rotation + ramp week |
| `mobile/src/lib/dailyCandidates.ts` (+test) | Pure: equipment normalization, section classing, filter/rank, progression resolve |
| `mobile/src/lib/dailyBudget.ts` (+test) | Pure: time budget → per-section slots + set/rep defaults |
| `mobile/src/lib/dailyCompose.ts` (+test) | Pure: rules-only composition + AI-response validation |
| `mobile/src/lib/supabase/daily.ts` | Client: gyms/check-ins/sessions CRUD + candidate-data assembly |
| `supabase/functions/compose-session/index.ts` | AI tier: one constrained judgment call |
| `mobile/src/hooks/useDailySession.ts` | Orchestration: rules → AI ask (signature-cached, one retry) → persisted session |
| `mobile/src/components/training/daily/GymSheet.tsx` | Gym bottom sheet: switch/add/edit + BFR toggle |
| `mobile/src/components/training/daily/CheckinSheet.tsx` | Check-in bottom sheet: soreness map, energy, minutes |
| `mobile/src/components/training/daily/TodayTab.tsx` | Rewrite placeholder → the daily session surface |
| `mobile/src/components/DailySessionHomeCard.tsx` | Home card |
| `mobile/app/(tabs)/home.tsx` | Modify: insert card |
| `mobile/app/(tabs)/training/index.tsx` | Modify: Today count chip + search placeholder |
| `mobile/app/workout/[id].tsx` | Modify: daily mode (template from session items, null parentage, completion backfill) |

Reused, unmodified: `fetchCatalog`/`fetchCapturedWorkouts` (`capture.ts`), `fetchEquipment`/`fetchMuscleRegions` (`crossfit.ts`), `useFuelPlan`'s scaffolding patterns (copied, not imported).

---

### Task 0: Branch

- [ ] **Step 0.1:**

```bash
cd /Users/brianwilson/code/fittracker
git checkout main && git pull && git checkout -b daily-training-phase2
```

---

### Task 1: Schema migrations

**Files:**
- Create: `supabase/migrations/20260817100000_daily_loop_schema.sql`
- Create: `supabase/migrations/20260817100001_relax_instance_parentage.sql`

- [ ] **Step 1.1: Write the daily-loop schema migration**

Create `supabase/migrations/20260817100000_daily_loop_schema.sql`:

```sql
-- Daily Training Phase 2: the daily loop. 2026-08-17.
-- Spec: docs/superpowers/specs/2026-08-16-daily-training-design.md §3.1.

-- ---- Gyms: context, not content. One active at a time. ----
CREATE TABLE IF NOT EXISTS public.gym_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  preset TEXT NOT NULL DEFAULT 'custom'
    CHECK (preset IN ('full_gym', 'hotel_gym', 'bodyweight', 'custom')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gym_profiles_one_active
  ON public.gym_profiles (user_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.gym_profile_equipment (
  gym_profile_id UUID NOT NULL REFERENCES public.gym_profiles(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  PRIMARY KEY (gym_profile_id, equipment_id)
);

-- BFR bands travel with the user, not with a gym.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bfr_bands_available BOOLEAN NOT NULL DEFAULT false;

-- ---- Daily check-in: the recommender's morning inputs. ----
CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  energy INTEGER NOT NULL CHECK (energy BETWEEN 1 AND 10),
  minutes_available INTEGER NOT NULL DEFAULT 120 CHECK (minutes_available > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, checkin_date)
);

CREATE TABLE IF NOT EXISTS public.daily_checkin_soreness (
  checkin_id UUID NOT NULL REFERENCES public.daily_checkins(id) ON DELETE CASCADE,
  muscle_region_id UUID NOT NULL REFERENCES public.muscle_regions(id) ON DELETE CASCADE,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 3),
  PRIMARY KEY (checkin_id, muscle_region_id)
);

-- ---- Generated sessions: the recommender's output and its memory. ----
CREATE TABLE IF NOT EXISTS public.generated_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  gym_profile_id UUID REFERENCES public.gym_profiles(id) ON DELETE SET NULL,
  checkin_id UUID REFERENCES public.daily_checkins(id) ON DELETE SET NULL,
  split_day TEXT NOT NULL CHECK (split_day IN ('push', 'pull', 'legs')),
  ramp_week INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ai', 'rules_fallback')),
  served_captured_workout_id UUID REFERENCES public.captured_workouts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'accepted', 'completed', 'skipped')),
  workout_instance_id UUID REFERENCES public.workout_instances(id) ON DELETE SET NULL,
  -- What the AI was handed, verbatim, for audit.
  inputs_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_date)
);

CREATE TABLE IF NOT EXISTS public.generated_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.generated_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL,
  section TEXT NOT NULL
    CHECK (section IN ('warmup', 'main', 'accessory', 'bfr', 'cooldown')),
  target_sets INTEGER,
  target_reps TEXT,
  rest_seconds INTEGER,
  -- The model's one-line contribution beyond the assignment itself.
  reason TEXT,
  -- Backfilled on completion: the suggested-vs-performed log
  -- (mirrors eat_next_suggestions.acted_at).
  was_performed BOOLEAN
);
CREATE INDEX IF NOT EXISTS generated_session_items_session
  ON public.generated_session_items (session_id);

-- ---- Learn-as-you-go skill levels (read in Phase 2, written in Phase 3). ----
CREATE TABLE IF NOT EXISTS public.exercise_skill_state (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  current_level TEXT NOT NULL DEFAULT 'beginner'
    CHECK (current_level IN ('beginner', 'intermediate', 'advanced')),
  consecutive_too_easy INTEGER NOT NULL DEFAULT 0,
  last_rating TEXT CHECK (last_rating IN ('too_easy', 'right', 'too_hard')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id)
);

-- ---- RLS: owner-only, the Phase-1 pattern. ----
ALTER TABLE public.gym_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_profile_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_checkin_soreness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_skill_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own gyms" ON public.gym_profiles;
CREATE POLICY "own gyms" ON public.gym_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own gym equipment" ON public.gym_profile_equipment;
CREATE POLICY "own gym equipment" ON public.gym_profile_equipment FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.gym_profiles g
    WHERE g.id = gym_profile_id AND g.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.gym_profiles g
    WHERE g.id = gym_profile_id AND g.user_id = auth.uid()));

DROP POLICY IF EXISTS "own checkins" ON public.daily_checkins;
CREATE POLICY "own checkins" ON public.daily_checkins FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own soreness" ON public.daily_checkin_soreness;
CREATE POLICY "own soreness" ON public.daily_checkin_soreness FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_checkins c
    WHERE c.id = checkin_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.daily_checkins c
    WHERE c.id = checkin_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "own sessions" ON public.generated_sessions;
CREATE POLICY "own sessions" ON public.generated_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own session items" ON public.generated_session_items;
CREATE POLICY "own session items" ON public.generated_session_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.generated_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.generated_sessions s
    WHERE s.id = session_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "own skill state" ON public.exercise_skill_state;
CREATE POLICY "own skill state" ON public.exercise_skill_state FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 1.2: Write the parentage-relaxation migration**

Create `supabase/migrations/20260817100001_relax_instance_parentage.sql`:

```sql
-- A generated daily session logs through the SAME instance chain as a program
-- workout — one history, no parallel logging system (spec §3.2). That requires
-- instances that belong to no program:
--
--   workout_instances.program_instance_id / program_workout_id  → nullable
--   exercise_instances.program_workout_exercise_id              → nullable
--
-- Integrity for daily rows is carried by generated_sessions.workout_instance_id
-- pointing at them (enforced app-side; a DB CHECK can't see across tables).
ALTER TABLE public.workout_instances
  ALTER COLUMN program_instance_id DROP NOT NULL,
  ALTER COLUMN program_workout_id DROP NOT NULL;

ALTER TABLE public.exercise_instances
  ALTER COLUMN program_workout_exercise_id DROP NOT NULL;

COMMENT ON COLUMN public.workout_instances.program_instance_id IS
  'NULL for standalone daily sessions (see generated_sessions.workout_instance_id).';
```

- [ ] **Step 1.3: Apply and verify**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx supabase db push --yes
npx supabase migration list 2>&1 | tail -4
```

Expected: `20260817100000` and `20260817100001` applied on remote. Then confirm the NOT NULLs are actually gone (live-DB check, not migration faith):

```bash
npx supabase db dump --schema public 2>/dev/null | grep -A4 '"program_instance_id"' | head -8
```

Expected: `program_instance_id "uuid"` with no `not null` on the `workout_instances` definition.

- [ ] **Step 1.4: Commit**

```bash
cd /Users/brianwilson/code/fittracker
git add supabase/migrations/20260817100000_daily_loop_schema.sql supabase/migrations/20260817100001_relax_instance_parentage.sql
git commit -m "feat(daily): phase 2 schema — gyms, check-ins, generated sessions, skill state, nullable parentage"
```

---

### Task 2: Domain types

**Files:**
- Create: `mobile/src/types/daily.ts`

- [ ] **Step 2.1: Write the types**

```typescript
// Types for Daily Training Phase 2 — the daily loop.
// Spec: docs/superpowers/specs/2026-08-16-daily-training-design.md §3, §5.

export type SplitDay = "push" | "pull" | "legs";
export type SessionSection = "warmup" | "main" | "accessory" | "bfr" | "cooldown";
export type SkillStateLevel = "beginner" | "intermediate" | "advanced";

export interface GymProfile {
  id: string;
  name: string;
  location: string | null;
  preset: "full_gym" | "hotel_gym" | "bodyweight" | "custom";
  isActive: boolean;
  /** equipment.name values checked for this gym. */
  equipmentNames: string[];
}

export interface DailyCheckin {
  id: string;
  checkinDate: string; // YYYY-MM-DD
  energy: number; // 1-10
  minutesAvailable: number;
  /** muscle_regions.name → severity 1-3 */
  soreness: Record<string, number>;
}

/** One exercise as the rules tier sees it — assembled by daily.ts, consumed
 *  by the pure modules. */
export interface SessionCandidate {
  exerciseId: string;
  name: string;
  skillLevel: "Beginner" | "Intermediate" | "Advanced" | null;
  goalTypes: string[];
  muscles: { name: string; isPrimary: boolean }[];
  /** Raw equipment_types values — normalize before matching. */
  equipmentTypes: string[];
  isCapture: boolean;
  lastPerformedDaysAgo: number | null; // null = never
}

/** A candidate after filtering/ranking/progression, ready for composition. */
export interface RankedCandidate extends SessionCandidate {
  section: SessionSection; // warmup | main | cooldown pool (accessory/bfr derive from main)
  soreDowngrade: boolean;
  /** Set when progression resolution swapped in an easier movement. */
  regressedFromId: string | null;
}

export interface SectionPlan {
  section: SessionSection;
  slots: number;
  targetSets: number;
  targetReps: string;
  restSeconds: number | null;
}

export interface SessionItem {
  exerciseId: string;
  section: SessionSection;
  itemOrder: number;
  targetSets: number | null;
  targetReps: string | null;
  restSeconds: number | null;
  reason: string | null;
}

export interface ComposedSession {
  splitDay: SplitDay;
  rampWeek: number;
  source: "ai" | "rules_fallback";
  servedCapturedWorkoutId: string | null;
  items: SessionItem[];
}

/** A stored generated_sessions row with items joined for display. */
export interface StoredSession extends ComposedSession {
  id: string;
  sessionDate: string;
  status: "suggested" | "accepted" | "completed" | "skipped";
  workoutInstanceId: string | null;
  gymProfileId: string | null;
  items: (SessionItem & { id: string; name: string; wasPerformed: boolean | null })[];
}
```

- [ ] **Step 2.2: Commit**

```bash
cd /Users/brianwilson/code/fittracker
git add mobile/src/types/daily.ts
git commit -m "feat(daily): phase 2 domain types"
```

---

### Task 3: `dailySplit.ts` — split rotation + ramp week (TDD)

**Files:**
- Create: `mobile/src/lib/dailySplit.ts`
- Test: `mobile/src/lib/__tests__/dailySplit.test.ts`

- [ ] **Step 3.1: Write the failing tests**

```typescript
import { nextSplitDay, rampWeek } from "../dailySplit";

describe("nextSplitDay", () => {
  it("starts at push with no history", () => {
    expect(nextSplitDay(null)).toBe("push");
  });
  it("rotates push → pull → legs → push", () => {
    expect(nextSplitDay("push")).toBe("pull");
    expect(nextSplitDay("pull")).toBe("legs");
    expect(nextSplitDay("legs")).toBe("push");
  });
  // The spec's travel rule: a missed day shifts the sequence, never breaks
  // it — which falls out of keying on last COMPLETED day, so there is no
  // date math to get wrong.
});

describe("rampWeek", () => {
  it("is week 1 with no first session", () => {
    expect(rampWeek(null, "2026-08-17")).toBe(1);
  });
  it("counts weeks from the first session date", () => {
    expect(rampWeek("2026-08-17", "2026-08-17")).toBe(1);
    expect(rampWeek("2026-08-17", "2026-08-23")).toBe(1);
    expect(rampWeek("2026-08-17", "2026-08-24")).toBe(2);
    expect(rampWeek("2026-08-17", "2026-09-01")).toBe(3);
  });
  it("never returns less than 1", () => {
    expect(rampWeek("2026-08-20", "2026-08-17")).toBe(1);
  });
});
```

- [ ] **Step 3.2: Run, verify failure**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx jest src/lib/__tests__/dailySplit.test.ts
```

Expected: FAIL — cannot find module.

- [ ] **Step 3.3: Implement**

```typescript
// Split rotation and the re-entry ramp position. Pure; dates are YYYY-MM-DD
// strings so callers control the clock (one `today` sampled per compute —
// the app's no-two-clocks rule).
import type { SplitDay } from "../types/daily";

const ORDER: SplitDay[] = ["push", "pull", "legs"];

/** The next split day, keyed on the last COMPLETED day. Missing a calendar
 *  day shifts the sequence instead of breaking it — travel rule. */
export function nextSplitDay(lastCompleted: SplitDay | null): SplitDay {
  if (!lastCompleted) return "push";
  return ORDER[(ORDER.indexOf(lastCompleted) + 1) % ORDER.length];
}

const dayMs = 24 * 60 * 60 * 1000;
const toUtc = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};

/** 1-based week since the first-ever generated session. Weeks 1-2 are the
 *  volume-capped re-entry ramp (8 weeks detrained). */
export function rampWeek(firstSessionDate: string | null, today: string): number {
  if (!firstSessionDate) return 1;
  const days = Math.floor((toUtc(today) - toUtc(firstSessionDate)) / dayMs);
  return Math.max(1, Math.floor(days / 7) + 1);
}
```

- [ ] **Step 3.4: Run, verify pass; commit**

```bash
npx jest src/lib/__tests__/dailySplit.test.ts
cd /Users/brianwilson/code/fittracker
git add mobile/src/lib/dailySplit.ts mobile/src/lib/__tests__/dailySplit.test.ts
git commit -m "feat(daily): split rotation and ramp week"
```

---

### Task 4: `dailyCandidates.ts` — filter, rank, progression (TDD)

**Files:**
- Create: `mobile/src/lib/dailyCandidates.ts`
- Test: `mobile/src/lib/__tests__/dailyCandidates.test.ts`

- [ ] **Step 4.1: Write the failing tests**

```typescript
import {
  normalizeEquipmentName,
  buildCandidatePools,
  resolveProgressions,
} from "../dailyCandidates";
import type { SessionCandidate } from "../../types/daily";

const cand = (overrides: Partial<SessionCandidate> = {}): SessionCandidate => ({
  exerciseId: "ex-1",
  name: "Dumbbell Bench Press",
  skillLevel: "Intermediate",
  goalTypes: ["Strength"],
  muscles: [{ name: "Chest", isPrimary: true }, { name: "Triceps", isPrimary: false }],
  equipmentTypes: ["Dumbbell", "Bench"],
  isCapture: true,
  lastPerformedDaysAgo: null,
  ...overrides,
});

const GYM = new Set(["Dumbbell", "Bench", "Bodyweight", "Floor", "Wall", "Bands", "Mat"]);

describe("normalizeEquipmentName", () => {
  it("passes Title Case through and maps the legacy snake_case dialect", () => {
    expect(normalizeEquipmentName("Dumbbell")).toBe("Dumbbell");
    expect(normalizeEquipmentName("barbell")).toBe("Barbell");
    expect(normalizeEquipmentName("wall_ball")).toBe("Med Ball");
    expect(normalizeEquipmentName("medicine_ball")).toBe("Med Ball");
    expect(normalizeEquipmentName("assault_bike")).toBe("Bike");
    expect(normalizeEquipmentName("ski_erg")).toBe("Ski");
    expect(normalizeEquipmentName("bodyweight")).toBe("Bodyweight");
  });
});

describe("buildCandidatePools", () => {
  it("keeps a push exercise on push day and drops it on legs day", () => {
    const push = buildCandidatePools([cand()], { splitDay: "push", gymEquipment: GYM, soreness: {} });
    const legs = buildCandidatePools([cand()], { splitDay: "legs", gymEquipment: GYM, soreness: {} });
    expect(push.main.map((c) => c.exerciseId)).toEqual(["ex-1"]);
    expect(legs.main).toHaveLength(0);
  });

  it("drops candidates whose equipment the gym lacks", () => {
    const pools = buildCandidatePools(
      [cand({ equipmentTypes: ["Barbell"] })],
      { splitDay: "push", gymEquipment: GYM, soreness: {} },
    );
    expect(pools.main).toHaveLength(0);
  });

  it("treats empty equipment as bodyweight (always available)", () => {
    const pools = buildCandidatePools(
      [cand({ equipmentTypes: [] })],
      { splitDay: "push", gymEquipment: new Set(["Floor"]), soreness: {} },
    );
    expect(pools.main).toHaveLength(1);
  });

  it("excludes primaries sore at 2+, downgrades at 1", () => {
    const soreOut = buildCandidatePools([cand()], {
      splitDay: "push", gymEquipment: GYM, soreness: { Chest: 2 },
    });
    expect(soreOut.main).toHaveLength(0);
    const soreDown = buildCandidatePools([cand()], {
      splitDay: "push", gymEquipment: GYM, soreness: { Chest: 1 },
    });
    expect(soreDown.main[0].soreDowngrade).toBe(true);
  });

  it("routes Mobility to warmup and Stretching/Cool-Down to cooldown, un-gated by split", () => {
    const pools = buildCandidatePools(
      [
        cand({ exerciseId: "w", goalTypes: ["Mobility"], muscles: [{ name: "Quads", isPrimary: true }] }),
        cand({ exerciseId: "c", goalTypes: ["Stretching"], muscles: [{ name: "Quads", isPrimary: true }] }),
      ],
      { splitDay: "push", gymEquipment: GYM, soreness: {} },
    );
    expect(pools.warmup.map((c) => c.exerciseId)).toEqual(["w"]);
    expect(pools.cooldown.map((c) => c.exerciseId)).toEqual(["c"]);
  });

  it("ranks captures first, then least-recently-performed, sore-downgrades last", () => {
    const pools = buildCandidatePools(
      [
        cand({ exerciseId: "stock-never", isCapture: false, lastPerformedDaysAgo: null }),
        cand({ exerciseId: "cap-recent", isCapture: true, lastPerformedDaysAgo: 1 }),
        cand({ exerciseId: "cap-stale", isCapture: true, lastPerformedDaysAgo: 9 }),
        cand({ exerciseId: "cap-never", isCapture: true, lastPerformedDaysAgo: null }),
      ],
      { splitDay: "push", gymEquipment: GYM, soreness: {} },
    );
    expect(pools.main.map((c) => c.exerciseId)).toEqual([
      "cap-never", "cap-stale", "cap-recent", "stock-never",
    ]);
  });

  it("Full Body counts for every split day", () => {
    const pools = buildCandidatePools(
      [cand({ muscles: [{ name: "Full Body", isPrimary: true }] })],
      { splitDay: "legs", gymEquipment: GYM, soreness: {} },
    );
    expect(pools.main).toHaveLength(1);
  });
});

describe("resolveProgressions", () => {
  it("regresses an Advanced movement the user hasn't earned, when a link exists", () => {
    const advanced = { ...cand({ exerciseId: "hsw", name: "Handstand Walk", skillLevel: "Advanced" as const }), section: "main" as const, soreDowngrade: false, regressedFromId: null };
    const wallWalk = cand({ exerciseId: "ww", name: "Wall Walk", skillLevel: "Intermediate" });
    const out = resolveProgressions([advanced], {
      skillState: {},
      regressions: new Map([["hsw", "ww"]]),
      byExerciseId: new Map([["ww", wallWalk]]),
    });
    expect(out[0].exerciseId).toBe("ww");
    expect(out[0].regressedFromId).toBe("hsw");
  });

  it("keeps an Advanced movement the user has earned", () => {
    const advanced = { ...cand({ exerciseId: "hsw", skillLevel: "Advanced" as const }), section: "main" as const, soreDowngrade: false, regressedFromId: null };
    const out = resolveProgressions([advanced], {
      skillState: { hsw: "advanced" },
      regressions: new Map([["hsw", "ww"]]),
      byExerciseId: new Map(),
    });
    expect(out[0].exerciseId).toBe("hsw");
  });

  it("keeps an Advanced movement with no regression link (nothing to swap to)", () => {
    const advanced = { ...cand({ exerciseId: "hsw", skillLevel: "Advanced" as const }), section: "main" as const, soreDowngrade: false, regressedFromId: null };
    const out = resolveProgressions([advanced], {
      skillState: {}, regressions: new Map(), byExerciseId: new Map(),
    });
    expect(out[0].exerciseId).toBe("hsw");
  });
});
```

- [ ] **Step 4.2: Run, verify failure**

```bash
npx jest src/lib/__tests__/dailyCandidates.test.ts
```

- [ ] **Step 4.3: Implement**

```typescript
// The rules tier's candidate builder: which exercises are even in play today.
// Pure — every fact (gym equipment, soreness, recency, skill states,
// regression links) arrives as data. Nothing here talks to the network.
import type {
  RankedCandidate,
  SessionCandidate,
  SessionSection,
  SkillStateLevel,
  SplitDay,
} from "../types/daily";

// Legacy equipment_types dialect (the 2025-10 backfill) → equipment.name.
// New writes use equipment.name verbatim; both coexist in the table.
const LEGACY_EQUIPMENT: Record<string, string> = {
  barbell: "Barbell", dumbbell: "Dumbbell", kettlebell: "Kettlebell",
  wall_ball: "Med Ball", medicine_ball: "Med Ball", box: "Box",
  rings: "Rings", rower: "Rower", bike: "Bike", assault_bike: "Bike",
  ski_erg: "Ski", bodyweight: "Bodyweight",
};

export function normalizeEquipmentName(raw: string): string {
  const legacy = LEGACY_EQUIPMENT[raw.toLowerCase()];
  if (legacy) return legacy;
  return raw;
}

// muscle_regions.name values, verbatim (post-reorg seed).
const DAY_MUSCLES: Record<SplitDay, Set<string>> = {
  push: new Set(["Chest", "Shoulders", "Triceps"]),
  pull: new Set(["Upper Back", "Lats", "Biceps", "Forearms / Grip", "Neck / Traps"]),
  legs: new Set([
    "Quads", "Glutes", "Hamstrings", "Calves",
    "Hip Flexors", "Hip Abductors", "Hip Adductors",
  ]),
};
const ALWAYS_MUSCLES = new Set(["Core", "Obliques", "Lower Back", "Full Body"]);

// goal_types.name → which pool. Skill/Strength/MetCon are "work"; the rest
// bookend the session and aren't split-gated.
function poolFor(goalTypes: string[]): "warmup" | "main" | "cooldown" {
  if (goalTypes.some((g) => g === "Stretching" || g === "Cool-Down")) return "cooldown";
  if (goalTypes.some((g) => g === "Mobility" || g === "Recovery")) return "warmup";
  return "main";
}

export interface PoolContext {
  splitDay: SplitDay;
  /** Normalized equipment.name values available today (gym + BFR injection). */
  gymEquipment: Set<string>;
  /** muscle_regions.name → severity 1-3. */
  soreness: Record<string, number>;
}

export interface CandidatePools {
  warmup: RankedCandidate[];
  main: RankedCandidate[];
  cooldown: RankedCandidate[];
}

/** Rank: captures before stock; never-performed before stale before recent;
 *  sore-downgrades sink to the bottom of their pool. */
function rank(a: RankedCandidate, b: RankedCandidate): number {
  if (a.soreDowngrade !== b.soreDowngrade) return a.soreDowngrade ? 1 : -1;
  if (a.isCapture !== b.isCapture) return a.isCapture ? -1 : 1;
  const aDays = a.lastPerformedDaysAgo ?? Number.POSITIVE_INFINITY;
  const bDays = b.lastPerformedDaysAgo ?? Number.POSITIVE_INFINITY;
  if (aDays !== bDays) return bDays - aDays;
  return a.name.localeCompare(b.name);
}

export function buildCandidatePools(
  candidates: SessionCandidate[],
  ctx: PoolContext,
): CandidatePools {
  const pools: CandidatePools = { warmup: [], main: [], cooldown: [] };

  for (const c of candidates) {
    // Equipment gate. Empty means bodyweight — always doable.
    const needs = c.equipmentTypes.map(normalizeEquipmentName);
    const equipmentOk =
      needs.length === 0 ||
      needs.every((n) => n === "Bodyweight" || ctx.gymEquipment.has(n));
    if (!equipmentOk) continue;

    const pool = poolFor(c.goalTypes);
    const primaries = c.muscles.filter((m) => m.isPrimary).map((m) => m.name);

    let soreDowngrade = false;
    if (pool === "main") {
      // Split gate: at least one primary belongs to today (or is always-on).
      const onDay = primaries.some(
        (m) => DAY_MUSCLES[ctx.splitDay].has(m) || ALWAYS_MUSCLES.has(m),
      );
      if (!onDay) continue;
      // Soreness gate: 2+ on a primary excludes; 1 downgrades rank.
      const worst = Math.max(0, ...primaries.map((m) => ctx.soreness[m] ?? 0));
      if (worst >= 2) continue;
      soreDowngrade = worst === 1;
    }

    pools[pool].push({
      ...c,
      section: pool as SessionSection,
      soreDowngrade,
      regressedFromId: null,
    });
  }

  pools.warmup.sort(rank);
  pools.main.sort(rank);
  pools.cooldown.sort(rank);
  return pools;
}

export interface ProgressionContext {
  /** exercise_id → earned level. Absent = beginner (conservative default). */
  skillState: Record<string, SkillStateLevel>;
  /** from_exercise_id → to_exercise_id, first regression link by display_order. */
  regressions: Map<string, string>;
  /** Lookup for the regression targets' own candidate data. */
  byExerciseId: Map<string, SessionCandidate>;
}

const EARNS: Record<string, SkillStateLevel> = {
  Advanced: "advanced",
  Intermediate: "intermediate",
};

/** Swap in the easier movement when the candidate outranks the user's earned
 *  level AND a regression link exists. No link → keep it (we can't invent a
 *  regression); the model still sees the skill level and can order it late. */
export function resolveProgressions(
  ranked: RankedCandidate[],
  ctx: ProgressionContext,
): RankedCandidate[] {
  return ranked.map((c) => {
    const needed = c.skillLevel ? EARNS[c.skillLevel] : undefined;
    if (!needed) return c;
    const earned = ctx.skillState[c.exerciseId] ?? "beginner";
    const rankOf = { beginner: 0, intermediate: 1, advanced: 2 } as const;
    if (rankOf[earned] >= rankOf[needed]) return c;
    const toId = ctx.regressions.get(c.exerciseId);
    const target = toId ? ctx.byExerciseId.get(toId) : undefined;
    if (!target) return c;
    return {
      ...target,
      section: c.section,
      soreDowngrade: c.soreDowngrade,
      regressedFromId: c.exerciseId,
      // The regression inherits the original's queue position by replacing
      // it in place; isCapture/lastPerformed come from the target itself.
    };
  });
}
```

- [ ] **Step 4.4: Run, verify pass; commit**

```bash
npx jest src/lib/__tests__/dailyCandidates.test.ts
cd /Users/brianwilson/code/fittracker
git add mobile/src/lib/dailyCandidates.ts mobile/src/lib/__tests__/dailyCandidates.test.ts
git commit -m "feat(daily): candidate pools — equipment/split/soreness gates, rotation rank, progression resolve"
```

---

### Task 5: `dailyBudget.ts` — time budget (TDD)

**Files:**
- Create: `mobile/src/lib/dailyBudget.ts`
- Test: `mobile/src/lib/__tests__/dailyBudget.test.ts`

- [ ] **Step 5.1: Write the failing tests**

```typescript
import { sessionBudget } from "../dailyBudget";

const plan = (minutes: number, rampWeek = 3, energy = 7) =>
  sessionBudget({ minutes, rampWeek, energy });

const slotsOf = (p: ReturnType<typeof sessionBudget>) =>
  Object.fromEntries(p.map((s) => [s.section, s.slots]));

describe("sessionBudget", () => {
  it("fills a 120-minute day with every section", () => {
    const s = slotsOf(plan(120));
    expect(s.warmup).toBeGreaterThanOrEqual(2);
    expect(s.main).toBeGreaterThanOrEqual(4);
    expect(s.accessory).toBeGreaterThanOrEqual(2);
    expect(s.bfr).toBeGreaterThanOrEqual(1);
    expect(s.cooldown).toBeGreaterThanOrEqual(1);
  });

  it("trims from the back as minutes shrink: cooldown and bfr go before main", () => {
    const s60 = slotsOf(plan(60));
    expect(s60.main).toBeGreaterThanOrEqual(3);
    expect(s60.bfr).toBe(0);
    const s30 = slotsOf(plan(30));
    expect(s30.main).toBeGreaterThanOrEqual(2);
    expect(s30.accessory).toBe(0);
    expect(s30.cooldown).toBe(0);
  });

  it("caps volume in ramp weeks 1 and 2 regardless of time", () => {
    const w1 = slotsOf(plan(120, 1));
    expect(w1.main).toBeLessThanOrEqual(3);
    expect(w1.accessory).toBeLessThanOrEqual(1);
    expect(w1.bfr).toBe(0);
    const w2 = slotsOf(plan(120, 2));
    expect(w2.main).toBeLessThanOrEqual(4);
    expect(w2.bfr).toBeLessThanOrEqual(1);
  });

  it("low energy trims sets, not sections", () => {
    const normal = plan(120, 3, 7).find((s) => s.section === "main")!;
    const tired = plan(120, 3, 3).find((s) => s.section === "main")!;
    expect(tired.slots).toBe(normal.slots);
    expect(tired.targetSets).toBe(normal.targetSets - 1);
  });

  it("sets are never below 2", () => {
    const tired = plan(120, 1, 1).find((s) => s.section === "main")!;
    expect(tired.targetSets).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 5.2: Run, verify failure**

```bash
npx jest src/lib/__tests__/dailyBudget.test.ts
```

- [ ] **Step 5.3: Implement**

```typescript
// The session's time arithmetic. Deterministic: minutes in, per-section slot
// counts and set/rep defaults out. The AI never gets to move these numbers —
// rules keep the numbers (spec §2).
import type { SectionPlan, SessionSection } from "../types/daily";

interface BudgetInput {
  minutes: number;
  rampWeek: number;
  energy: number; // 1-10
}

// Fractions of the day and per-exercise minute costs, in trim order:
// shrinking time takes cooldown first, then bfr, then accessory.
const SHAPE: {
  section: SessionSection;
  fraction: number;
  perSlot: number;
  minSlots: number;
  sets: number;
  reps: string;
  rest: number | null;
}[] = [
  { section: "warmup",    fraction: 0.15, perSlot: 4,  minSlots: 1, sets: 1, reps: "10",     rest: null },
  { section: "main",      fraction: 0.50, perSlot: 10, minSlots: 2, sets: 3, reps: "8-12",  rest: 120 },
  { section: "accessory", fraction: 0.20, perSlot: 7,  minSlots: 0, sets: 3, reps: "12-15", rest: 90 },
  { section: "bfr",       fraction: 0.07, perSlot: 8,  minSlots: 0, sets: 3, reps: "15-20", rest: 45 },
  { section: "cooldown",  fraction: 0.08, perSlot: 4,  minSlots: 0, sets: 1, reps: "30-60s", rest: null },
];

// Re-entry ramp (weeks 1-2 after 8 weeks off): hard slot ceilings that time
// cannot buy back.
const RAMP_CAPS: Record<number, Partial<Record<SessionSection, number>>> = {
  1: { main: 3, accessory: 1, bfr: 0 },
  2: { main: 4, accessory: 2, bfr: 1 },
};

export function sessionBudget({ minutes, rampWeek, energy }: BudgetInput): SectionPlan[] {
  const caps = RAMP_CAPS[rampWeek] ?? {};
  // Short days starve the back of the list: below these thresholds a section
  // simply doesn't run, and its fraction flows forward to main.
  const skip = new Set<SessionSection>();
  if (minutes < 75) skip.add("bfr");
  if (minutes < 45) { skip.add("accessory"); skip.add("cooldown"); }

  const liveFraction = SHAPE.filter((s) => !skip.has(s.section))
    .reduce((sum, s) => sum + s.fraction, 0);

  return SHAPE.map((s) => {
    if (skip.has(s.section)) {
      return { section: s.section, slots: 0, targetSets: s.sets, targetReps: s.reps, restSeconds: s.rest };
    }
    const slice = (minutes * s.fraction) / liveFraction;
    let slots = Math.max(s.minSlots, Math.floor(slice / s.perSlot));
    const cap = caps[s.section];
    if (cap !== undefined) slots = Math.min(slots, cap);
    // Low energy scales sets down, never the day's focus (spec §5.2).
    const sets = s.section === "main" || s.section === "accessory" || s.section === "bfr"
      ? Math.max(2, energy <= 4 ? s.sets - 1 : s.sets)
      : s.sets;
    return { section: s.section, slots, targetSets: sets, targetReps: s.reps, restSeconds: s.rest };
  });
}
```

- [ ] **Step 5.4: Run, verify pass; commit**

```bash
npx jest src/lib/__tests__/dailyBudget.test.ts
cd /Users/brianwilson/code/fittracker
git add mobile/src/lib/dailyBudget.ts mobile/src/lib/__tests__/dailyBudget.test.ts
git commit -m "feat(daily): session time budget with ramp caps and energy scaling"
```

---

### Task 6: `dailyCompose.ts` — fallback composition + AI validation (TDD)

**Files:**
- Create: `mobile/src/lib/dailyCompose.ts`
- Test: `mobile/src/lib/__tests__/dailyCompose.test.ts`

- [ ] **Step 6.1: Write the failing tests**

```typescript
import { composeFallback, validateAiSession } from "../dailyCompose";
import type { CandidatePools } from "../dailyCandidates";
import type { RankedCandidate, SectionPlan } from "../../types/daily";

const rc = (id: string, section: RankedCandidate["section"]): RankedCandidate => ({
  exerciseId: id, name: id, skillLevel: "Beginner", goalTypes: [], muscles: [],
  equipmentTypes: [], isCapture: true, lastPerformedDaysAgo: null,
  section, soreDowngrade: false, regressedFromId: null,
});

const pools: CandidatePools = {
  warmup: [rc("w1", "warmup"), rc("w2", "warmup")],
  main: [rc("m1", "main"), rc("m2", "main"), rc("m3", "main"), rc("m4", "main"), rc("m5", "main")],
  cooldown: [rc("c1", "cooldown")],
};

const budget: SectionPlan[] = [
  { section: "warmup", slots: 1, targetSets: 1, targetReps: "10", restSeconds: null },
  { section: "main", slots: 3, targetSets: 3, targetReps: "8-12", restSeconds: 120 },
  { section: "accessory", slots: 1, targetSets: 3, targetReps: "12-15", restSeconds: 90 },
  { section: "bfr", slots: 1, targetSets: 3, targetReps: "15-20", restSeconds: 45 },
  { section: "cooldown", slots: 1, targetSets: 1, targetReps: "30-60s", restSeconds: null },
];

describe("composeFallback", () => {
  it("fills each section's slots from its pool in rank order, no reuse", () => {
    const items = composeFallback(pools, budget);
    const bySection = (s: string) => items.filter((i) => i.section === s).map((i) => i.exerciseId);
    expect(bySection("warmup")).toEqual(["w1"]);
    expect(bySection("main")).toEqual(["m1", "m2", "m3"]);
    // accessory and bfr draw from the remaining main pool
    expect(bySection("accessory")).toEqual(["m4"]);
    expect(bySection("bfr")).toEqual(["m5"]);
    expect(bySection("cooldown")).toEqual(["c1"]);
    const ids = items.map((i) => i.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("takes what exists when a pool runs short", () => {
    const thin: CandidatePools = { warmup: [], main: [rc("m1", "main")], cooldown: [] };
    const items = composeFallback(thin, budget);
    expect(items.map((i) => i.exerciseId)).toEqual(["m1"]);
  });

  it("numbers items sequentially and carries the budget's targets", () => {
    const items = composeFallback(pools, budget);
    expect(items.map((i) => i.itemOrder)).toEqual(items.map((_, idx) => idx));
    const main = items.find((i) => i.section === "main")!;
    expect(main.targetSets).toBe(3);
    expect(main.targetReps).toBe("8-12");
    expect(main.restSeconds).toBe(120);
  });
});

describe("validateAiSession", () => {
  const allowed = new Set(["m1", "m2", "w1", "c1"]);

  it("keeps items whose ids were offered, drops invented ones", () => {
    const out = validateAiSession(
      {
        items: [
          { exerciseId: "m1", section: "main", sets: 3, reps: "10", restSeconds: 90, reason: "fresh" },
          { exerciseId: "made-up", section: "main", sets: 3, reps: "10", restSeconds: 90, reason: "x" },
        ],
        servedWorkoutId: null,
      },
      allowed, new Set(),
    );
    expect(out!.items.map((i) => i.exerciseId)).toEqual(["m1"]);
  });

  it("drops items with bogus sections and clamps insane set counts", () => {
    const out = validateAiSession(
      {
        items: [
          { exerciseId: "m1", section: "swimming", sets: 3, reps: "10", restSeconds: 90, reason: "x" },
          { exerciseId: "m2", section: "main", sets: 45, reps: "10", restSeconds: 90, reason: "x" },
        ],
        servedWorkoutId: null,
      },
      allowed, new Set(),
    );
    expect(out!.items).toHaveLength(1);
    expect(out!.items[0].targetSets).toBe(6);
  });

  it("accepts a served workout id only if it was offered", () => {
    const ok = validateAiSession({ items: [], servedWorkoutId: "cw-1" }, allowed, new Set(["cw-1"]));
    expect(ok!.servedCapturedWorkoutId).toBe("cw-1");
    const bad = validateAiSession({ items: [], servedWorkoutId: "cw-9" }, allowed, new Set(["cw-1"]));
    expect(bad).toBeNull();
  });

  it("returns null for garbage or an empty answer", () => {
    expect(validateAiSession(null, allowed, new Set())).toBeNull();
    expect(validateAiSession({ items: [], servedWorkoutId: null }, allowed, new Set())).toBeNull();
  });
});
```

- [ ] **Step 6.2: Run, verify failure**

```bash
npx jest src/lib/__tests__/dailyCompose.test.ts
```

- [ ] **Step 6.3: Implement**

```typescript
// Rules-only composition (the fallback that makes "you always get a workout"
// true) and the validator that constrains the AI's answer to what it was
// offered — the fuel-plan doctrine, enforced client-side.
import type { CandidatePools } from "./dailyCandidates";
import type { SectionPlan, SessionItem, SessionSection } from "../types/daily";

const SECTIONS: SessionSection[] = ["warmup", "main", "accessory", "bfr", "cooldown"];

/** Top-of-rank fill, one pass, no exercise used twice. Accessory and BFR
 *  draw from what's left of the main pool — they are main-muscle work at
 *  different intensities, not separate taxonomies. */
export function composeFallback(pools: CandidatePools, budget: SectionPlan[]): SessionItem[] {
  const used = new Set<string>();
  const items: SessionItem[] = [];
  const mainQueue = [...pools.main];

  const take = (from: { exerciseId: string }[], n: number) => {
    const out: string[] = [];
    for (const c of from) {
      if (out.length >= n) break;
      if (used.has(c.exerciseId)) continue;
      used.add(c.exerciseId);
      out.push(c.exerciseId);
    }
    return out;
  };

  for (const plan of budget) {
    if (plan.slots === 0) continue;
    const pool = plan.section === "warmup" ? pools.warmup
      : plan.section === "cooldown" ? pools.cooldown
      : mainQueue;
    for (const id of take(pool, plan.slots)) {
      items.push({
        exerciseId: id,
        section: plan.section,
        itemOrder: items.length,
        targetSets: plan.targetSets,
        targetReps: plan.targetReps,
        restSeconds: plan.restSeconds,
        reason: null,
      });
    }
  }
  return items;
}

export interface ValidatedAiSession {
  items: SessionItem[];
  servedCapturedWorkoutId: string | null;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** Null means "unusable answer" — the caller falls back to rules. */
export function validateAiSession(
  raw: unknown,
  allowedExerciseIds: Set<string>,
  allowedWorkoutIds: Set<string>,
): ValidatedAiSession | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const servedId = str(r.servedWorkoutId);
  if (servedId) {
    if (!allowedWorkoutIds.has(servedId)) return null;
    return { items: [], servedCapturedWorkoutId: servedId };
  }

  const items: SessionItem[] = (Array.isArray(r.items) ? r.items : [])
    .map((item, idx): SessionItem | null => {
      if (typeof item !== "object" || item === null) return null;
      const i = item as Record<string, unknown>;
      const id = str(i.exerciseId);
      if (!id || !allowedExerciseIds.has(id)) return null;
      if (!SECTIONS.includes(i.section as SessionSection)) return null;
      const sets = typeof i.sets === "number" && i.sets >= 1
        ? Math.min(6, Math.round(i.sets))
        : null;
      const rest = typeof i.restSeconds === "number" && i.restSeconds >= 0
        ? Math.min(600, Math.round(i.restSeconds))
        : null;
      return {
        exerciseId: id,
        section: i.section as SessionSection,
        itemOrder: idx,
        targetSets: sets,
        targetReps: str(i.reps),
        restSeconds: rest,
        reason: str(i.reason),
      };
    })
    .filter((i): i is SessionItem => i !== null)
    // One appearance per exercise; first mention wins.
    .filter((i, idx, arr) => arr.findIndex((x) => x.exerciseId === i.exerciseId) === idx)
    .map((i, idx) => ({ ...i, itemOrder: idx }));

  if (items.length === 0) return null;
  return { items, servedCapturedWorkoutId: null };
}
```

- [ ] **Step 6.4: Run, verify pass; commit**

```bash
npx jest src/lib/__tests__/dailyCompose.test.ts
cd /Users/brianwilson/code/fittracker
git add mobile/src/lib/dailyCompose.ts mobile/src/lib/__tests__/dailyCompose.test.ts
git commit -m "feat(daily): rules composition fallback and constrained AI-session validation"
```

---

### Task 7: Client library `daily.ts`

**Files:**
- Create: `mobile/src/lib/supabase/daily.ts`

- [ ] **Step 7.1: Write the module**

```typescript
// Client half of the daily loop: gyms, check-ins, generated sessions, and the
// data-assembly the rules tier consumes. Suggest-only boundary: the ONLY
// session writes here are the suggestion record itself and status
// transitions the user's taps cause.
import { supabase } from "../supabase";
import type {
  ComposedSession,
  DailyCheckin,
  GymProfile,
  SessionCandidate,
  SkillStateLevel,
  SplitDay,
  StoredSession,
} from "../../types/daily";

// ---------- Gyms ----------

const GYM_PRESETS: Record<string, string[]> = {
  // equipment.name values, verbatim from the seeded table.
  full_gym: [
    "Barbell", "Dumbbell", "Kettlebell", "Trap Bar", "Med Ball", "Plate",
    "Sandbag", "Bike", "Rower", "Ski", "Treadmill", "Bodyweight", "Bar",
    "Rings", "Rope", "Bench", "Box", "Floor", "Wall", "Bands", "Foam Roller",
    "Massage Ball", "Mat", "Stability Ball", "Yoga Block",
  ],
  hotel_gym: [
    "Dumbbell", "Bench", "Treadmill", "Bike", "Bodyweight", "Floor", "Wall",
    "Mat", "Bands", "Foam Roller",
  ],
  bodyweight: ["Bodyweight", "Floor", "Wall", "Mat", "Bands"],
};

export function presetEquipmentNames(preset: string): string[] {
  return GYM_PRESETS[preset] ?? [];
}

export async function fetchGyms(userId: string): Promise<GymProfile[]> {
  const { data, error } = await supabase
    .from("gym_profiles")
    .select("id, name, location, preset, is_active, gym_profile_equipment(equipment(name))")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchGyms failed:", error);
    return [];
  }
  return (data ?? []).map((g: any) => ({
    id: g.id,
    name: g.name,
    location: g.location,
    preset: g.preset,
    isActive: g.is_active,
    equipmentNames: (g.gym_profile_equipment ?? [])
      .map((e: any) => e.equipment?.name)
      .filter(Boolean),
  }));
}

export interface SaveGymInput {
  id?: string; // absent = create
  userId: string;
  name: string;
  location: string | null;
  preset: string;
  equipmentNames: string[];
}

/** Create or update a gym and replace its equipment checklist. */
export async function saveGym(input: SaveGymInput): Promise<string | null> {
  try {
    let gymId = input.id ?? null;
    if (gymId) {
      const { error } = await supabase
        .from("gym_profiles")
        .update({ name: input.name, location: input.location, preset: input.preset })
        .eq("id", gymId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from("gym_profiles")
        .insert({
          user_id: input.userId,
          name: input.name,
          location: input.location,
          preset: input.preset,
        })
        .select("id")
        .single();
      if (error) throw error;
      gymId = data.id;
    }

    // Replace the checklist wholesale — it's a handful of rows.
    const { data: equipmentRows, error: eqError } = await supabase
      .from("equipment")
      .select("id, name")
      .in("name", input.equipmentNames);
    if (eqError) throw eqError;
    const { error: delError } = await supabase
      .from("gym_profile_equipment")
      .delete()
      .eq("gym_profile_id", gymId);
    if (delError) throw delError;
    if ((equipmentRows ?? []).length > 0) {
      const { error: insError } = await supabase
        .from("gym_profile_equipment")
        .insert(equipmentRows!.map((e) => ({ gym_profile_id: gymId, equipment_id: e.id })));
      if (insError) throw insError;
    }
    return gymId;
  } catch (e) {
    console.error("saveGym failed:", e);
    return null;
  }
}

/** One active gym per user: clear, then set. The partial unique index makes
 *  the invariant real even if this races. */
export async function setActiveGym(userId: string, gymId: string): Promise<boolean> {
  const { error: clearError } = await supabase
    .from("gym_profiles")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);
  if (clearError) {
    console.error("setActiveGym clear failed:", clearError);
    return false;
  }
  const { error } = await supabase
    .from("gym_profiles")
    .update({ is_active: true })
    .eq("id", gymId);
  if (error) {
    console.error("setActiveGym failed:", error);
    return false;
  }
  return true;
}

export async function fetchBfrFlag(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("bfr_bands_available")
    .eq("id", userId)
    .maybeSingle();
  return !!data?.bfr_bands_available;
}

export async function setBfrFlag(userId: string, value: boolean): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ bfr_bands_available: value })
    .eq("id", userId);
  if (error) console.error("setBfrFlag failed:", error);
}

// ---------- Check-ins ----------

export async function fetchTodayCheckin(
  userId: string,
  date: string,
): Promise<DailyCheckin | null> {
  const { data, error } = await supabase
    .from("daily_checkins")
    .select("id, checkin_date, energy, minutes_available, daily_checkin_soreness(severity, muscle_regions(name))")
    .eq("user_id", userId)
    .eq("checkin_date", date)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("fetchTodayCheckin failed:", error);
    return null;
  }
  const soreness: Record<string, number> = {};
  for (const s of (data as any).daily_checkin_soreness ?? []) {
    const name = s.muscle_regions?.name;
    if (name) soreness[name] = s.severity;
  }
  return {
    id: data.id,
    checkinDate: data.checkin_date,
    energy: data.energy,
    minutesAvailable: data.minutes_available,
    soreness,
  };
}

export interface SaveCheckinInput {
  userId: string;
  date: string;
  energy: number;
  minutesAvailable: number;
  /** muscle_regions.name → severity */
  soreness: Record<string, number>;
}

export async function saveCheckin(input: SaveCheckinInput): Promise<DailyCheckin | null> {
  try {
    const { data, error } = await supabase
      .from("daily_checkins")
      .upsert(
        {
          user_id: input.userId,
          checkin_date: input.date,
          energy: input.energy,
          minutes_available: input.minutesAvailable,
        },
        { onConflict: "user_id,checkin_date" },
      )
      .select("id")
      .single();
    if (error) throw error;

    const { error: delError } = await supabase
      .from("daily_checkin_soreness")
      .delete()
      .eq("checkin_id", data.id);
    if (delError) throw delError;

    const soreNames = Object.keys(input.soreness);
    if (soreNames.length > 0) {
      const { data: regions, error: regError } = await supabase
        .from("muscle_regions")
        .select("id, name")
        .in("name", soreNames);
      if (regError) throw regError;
      const rows = (regions ?? []).map((r) => ({
        checkin_id: data.id,
        muscle_region_id: r.id,
        severity: input.soreness[r.name],
      }));
      if (rows.length > 0) {
        const { error: insError } = await supabase
          .from("daily_checkin_soreness")
          .insert(rows);
        if (insError) throw insError;
      }
    }
    return fetchTodayCheckin(input.userId, input.date);
  } catch (e) {
    console.error("saveCheckin failed:", e);
    return null;
  }
}

// ---------- Candidate data assembly ----------

export interface CandidateData {
  candidates: SessionCandidate[];
  byExerciseId: Map<string, SessionCandidate>;
  skillState: Record<string, SkillStateLevel>;
  regressions: Map<string, string>;
  lastCompletedSplitDay: SplitDay | null;
  firstSessionDate: string | null;
}

/** Everything the rules tier needs, in one round of queries. */
export async function fetchCandidateData(userId: string): Promise<CandidateData> {
  const [exercisesRes, capturedRes, recencyRes, skillRes, regRes, historyRes] =
    await Promise.all([
      supabase.from("exercises").select(`
        id, name, skill_level, equipment_types,
        muscle_regions:exercise_muscle_regions(is_primary, muscle_region:muscle_regions(name)),
        goal_types:exercise_goal_types(goal_type:goal_types(name))
      `),
      supabase
        .from("source_exercises")
        .select("exercise_id, source:captured_sources!inner(user_id, extraction_status)"),
      supabase
        .from("exercise_instances")
        .select("exercise_id, performed_date")
        .eq("user_id", userId)
        .not("performed_date", "is", null)
        .order("performed_date", { ascending: false })
        .limit(500),
      supabase
        .from("exercise_skill_state")
        .select("exercise_id, current_level")
        .eq("user_id", userId),
      supabase
        .from("movement_scaling_links")
        .select("from_exercise_id, to_exercise_id, display_order")
        .eq("scaling_type", "regression")
        .order("display_order", { ascending: true }),
      supabase
        .from("generated_sessions")
        .select("session_date, split_day, status")
        .eq("user_id", userId)
        .order("session_date", { ascending: true }),
    ]);

  const capturedIds = new Set(
    (capturedRes.data ?? [])
      .filter((r: any) => r.source?.user_id === userId && r.source?.extraction_status === "reviewed")
      .map((r: any) => r.exercise_id),
  );

  const today = new Date();
  const lastPerformed = new Map<string, number>();
  for (const row of recencyRes.data ?? []) {
    if (lastPerformed.has(row.exercise_id)) continue;
    const days = Math.floor(
      (today.getTime() - new Date(`${row.performed_date}T00:00:00`).getTime()) / 86400000,
    );
    lastPerformed.set(row.exercise_id, Math.max(0, days));
  }

  const candidates: SessionCandidate[] = (exercisesRes.data ?? []).map((row: any) => ({
    exerciseId: row.id,
    name: row.name,
    skillLevel: row.skill_level ?? null,
    goalTypes: (row.goal_types ?? []).map((g: any) => g.goal_type?.name).filter(Boolean),
    muscles: (row.muscle_regions ?? []).map((m: any) => ({
      name: m.muscle_region?.name ?? "",
      isPrimary: !!m.is_primary,
    })),
    equipmentTypes: row.equipment_types ?? [],
    isCapture: capturedIds.has(row.id),
    lastPerformedDaysAgo: lastPerformed.get(row.id) ?? null,
  }));

  const skillState: Record<string, SkillStateLevel> = {};
  for (const row of skillRes.data ?? []) skillState[row.exercise_id] = row.current_level;

  const regressions = new Map<string, string>();
  for (const row of regRes.data ?? []) {
    if (!regressions.has(row.from_exercise_id)) {
      regressions.set(row.from_exercise_id, row.to_exercise_id);
    }
  }

  const history = historyRes.data ?? [];
  const lastCompleted = [...history].reverse().find((h: any) => h.status === "completed");

  return {
    candidates,
    byExerciseId: new Map(candidates.map((c) => [c.exerciseId, c])),
    skillState,
    regressions,
    lastCompletedSplitDay: (lastCompleted?.split_day as SplitDay) ?? null,
    firstSessionDate: history[0]?.session_date ?? null,
  };
}

// ---------- Generated sessions ----------

export async function fetchTodaySession(
  userId: string,
  date: string,
): Promise<StoredSession | null> {
  const { data, error } = await supabase
    .from("generated_sessions")
    .select(`
      id, session_date, split_day, ramp_week, source, served_captured_workout_id,
      status, workout_instance_id, gym_profile_id,
      items:generated_session_items(
        id, exercise_id, item_order, section, target_sets, target_reps,
        rest_seconds, reason, was_performed, exercise:exercises(name)
      )
    `)
    .eq("user_id", userId)
    .eq("session_date", date)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("fetchTodaySession failed:", error);
    return null;
  }
  return {
    id: data.id,
    sessionDate: data.session_date,
    splitDay: data.split_day,
    rampWeek: data.ramp_week,
    source: data.source,
    servedCapturedWorkoutId: data.served_captured_workout_id,
    status: data.status,
    workoutInstanceId: data.workout_instance_id,
    gymProfileId: data.gym_profile_id,
    items: ((data as any).items ?? [])
      .sort((a: any, b: any) => a.item_order - b.item_order)
      .map((i: any) => ({
        id: i.id,
        exerciseId: i.exercise_id,
        name: i.exercise?.name ?? "Unknown",
        section: i.section,
        itemOrder: i.item_order,
        targetSets: i.target_sets,
        targetReps: i.target_reps,
        restSeconds: i.rest_seconds,
        reason: i.reason,
        wasPerformed: i.was_performed,
      })),
  };
}

export interface SaveSessionInput {
  userId: string;
  date: string;
  gymProfileId: string | null;
  checkinId: string | null;
  session: ComposedSession;
  inputsSnapshot: unknown;
}

/** Upsert today's suggestion. Regeneration (gym/check-in change) replaces the
 *  row's items; an accepted/completed session is never overwritten. */
export async function saveGeneratedSession(input: SaveSessionInput): Promise<string | null> {
  try {
    const existing = await fetchTodaySession(input.userId, input.date);
    if (existing && existing.status !== "suggested") return existing.id;

    const row = {
      user_id: input.userId,
      session_date: input.date,
      gym_profile_id: input.gymProfileId,
      checkin_id: input.checkinId,
      split_day: input.session.splitDay,
      ramp_week: input.session.rampWeek,
      source: input.session.source,
      served_captured_workout_id: input.session.servedCapturedWorkoutId,
      status: "suggested",
      inputs_snapshot: input.inputsSnapshot ?? null,
    };
    const { data, error } = await supabase
      .from("generated_sessions")
      .upsert(row, { onConflict: "user_id,session_date" })
      .select("id")
      .single();
    if (error) throw error;

    const { error: delError } = await supabase
      .from("generated_session_items")
      .delete()
      .eq("session_id", data.id);
    if (delError) throw delError;

    if (input.session.items.length > 0) {
      const { error: insError } = await supabase.from("generated_session_items").insert(
        input.session.items.map((i) => ({
          session_id: data.id,
          exercise_id: i.exerciseId,
          item_order: i.itemOrder,
          section: i.section,
          target_sets: i.targetSets,
          target_reps: i.targetReps,
          rest_seconds: i.restSeconds,
          reason: i.reason,
        })),
      );
      if (insError) throw insError;
    }
    return data.id;
  } catch (e) {
    console.error("saveGeneratedSession failed:", e);
    return null;
  }
}

/** Called by the logging screen when the user starts the session. */
export async function acceptSession(sessionId: string, workoutInstanceId: string): Promise<void> {
  const { error } = await supabase
    .from("generated_sessions")
    .update({ status: "accepted", workout_instance_id: workoutInstanceId })
    .eq("id", sessionId);
  if (error) console.error("acceptSession failed:", error);
}

/** Called on finish: stamp the outcome and backfill suggested-vs-performed. */
export async function completeSession(
  sessionId: string,
  performedExerciseIds: string[],
): Promise<void> {
  const performed = new Set(performedExerciseIds);
  const { data: items, error } = await supabase
    .from("generated_session_items")
    .select("id, exercise_id")
    .eq("session_id", sessionId);
  if (error) {
    console.error("completeSession read failed:", error);
    return;
  }
  for (const item of items ?? []) {
    const { error: upError } = await supabase
      .from("generated_session_items")
      .update({ was_performed: performed.has(item.exercise_id) })
      .eq("id", item.id);
    if (upError) console.error("completeSession item update failed:", upError);
  }
  const { error: sessError } = await supabase
    .from("generated_sessions")
    .update({ status: "completed" })
    .eq("id", sessionId);
  if (sessError) console.error("completeSession status failed:", sessError);
}
```

- [ ] **Step 7.2: Typecheck; commit**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx tsc --noEmit
cd /Users/brianwilson/code/fittracker
git add mobile/src/lib/supabase/daily.ts
git commit -m "feat(daily): client library — gyms, check-ins, candidate assembly, session persistence"
```

---

### Task 8: `compose-session` edge function

**Files:**
- Create: `supabase/functions/compose-session/index.ts`

- [ ] **Step 8.1: Write the function**

```typescript
// The daily recommender's AI tier: ONE judgment call — compose today's
// session from pre-filtered, pre-ranked candidates. Doctrine (fuel-plan):
// - SUGGEST ONLY: writes nothing, ever.
// - The model may use only ids given; the client re-validates independently.
// - Rules keep the numbers: slot counts and default sets/reps arrive as
//   constraints; the model orders, pairs, and explains.
// Model: gpt-5.6-terra — judgment tier.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
const MODEL = 'gpt-5.6-terra';

const SYSTEM = `You are composing one person's gym session for today. The
deterministic engine has already filtered every candidate for split day,
available equipment, soreness, and skill level — your job is selection,
ordering, and pairing, the judgment a good coach applies.

Rules:
- Use ONLY exercise ids from the candidate list, by exact "id". Never invent.
- Respect the slot budget per section. Fewer is fine; more is not.
- Higher-ranked candidates are preferred (the list is ordered), but you may
  reach past one when it makes the session cohere: complementary movement
  patterns, sensible push/pull pairing within the day, equipment flow so the
  person isn't walking across the gym between every set.
- A "captured workout" (if any are offered) may be served WHOLE instead of a
  composed list, but only when it genuinely fits today's focus, equipment,
  and time — then return its id as servedWorkoutId and an empty items array.
- sets/reps/restSeconds default to the section's stated defaults; deviate
  only with reason (e.g. heavier compound → fewer reps).
- "reason" is ONE short sentence to the athlete, plain and specific — "first
  time back on pressing, so it leads while you're fresh", not marketing.
- Order items warmup → main → accessory → bfr → cooldown.

Respond as JSON:
{"items": [{"exerciseId": string, "section": "warmup"|"main"|"accessory"|"bfr"|"cooldown",
  "sets": number, "reps": string, "restSeconds": number, "reason": string}],
 "servedWorkoutId": string | null}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY is not configured');
    if (!req.headers.get('Authorization')) throw new Error('missing Authorization header');

    const { splitDay, minutes, budget = [], candidates = [], capturedWorkouts = [] } =
      await req.json();

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return new Response(JSON.stringify({ items: [], servedWorkoutId: null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const budgetTable = (budget as any[])
      .map((b) => `${b.section}: ${b.slots} slots · default ${b.targetSets}×${b.targetReps}${b.restSeconds ? ` · rest ${b.restSeconds}s` : ''}`)
      .join('\n');

    const candidateTable = (candidates as any[])
      .map((c) => [
        `${c.id} · ${c.name}`,
        `pool ${c.pool}`,
        c.isCapture ? 'CAPTURED' : 'stock',
        c.skillLevel ?? 'unrated',
        `muscles ${Array.isArray(c.muscles) ? c.muscles.join('/') : ''}`,
        c.lastPerformedDaysAgo == null ? 'never done' : `last done ${c.lastPerformedDaysAgo}d ago`,
        c.regressedFrom ? `regression of ${c.regressedFrom}` : null,
      ].filter(Boolean).join(' · '))
      .join('\n');

    const workoutTable = (capturedWorkouts as any[])
      .map((w) => `${w.id} · "${w.name}" · ${w.itemCount} movements · muscles ${w.muscles}`)
      .join('\n');

    const user = [
      `Split day: ${splitDay}. Minutes available: ${minutes}.`,
      ``, `Slot budget:`, budgetTable,
      ``, `Candidates (ranked, best first):`, candidateTable,
      workoutTable ? `\nCaptured workouts servable whole:\n${workoutTable}` : '',
    ].join('\n');

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
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`openai ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('empty model response');
    // Parsed only to fail fast on malformed JSON — the client re-validates
    // every id and field against what it offered.
    return new Response(JSON.stringify({ composition: JSON.parse(content) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('compose-session:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
```

- [ ] **Step 8.2: Deploy; commit**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx supabase functions deploy compose-session
cd /Users/brianwilson/code/fittracker
git add supabase/functions/compose-session/index.ts
git commit -m "feat(daily): compose-session edge function — one constrained judgment call"
```

---

### Task 9: `useDailySession` hook

**Files:**
- Create: `mobile/src/hooks/useDailySession.ts`

- [ ] **Step 9.1: Write the hook**

```typescript
// Orchestrates the daily loop: rules tier → one AI ask → persisted session.
// Operational scaffolding copies useFuelPlan: module-scope signature cache +
// in-flight coalescing, exactly one retry (token refresh survival),
// event-driven recompute — never timers, one clock sample per compute.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getLocalDateString } from "../components/workout-session/helpers";
import { nextSplitDay, rampWeek } from "../lib/dailySplit";
import { buildCandidatePools, resolveProgressions } from "../lib/dailyCandidates";
import { sessionBudget } from "../lib/dailyBudget";
import { composeFallback, validateAiSession } from "../lib/dailyCompose";
import {
  fetchBfrFlag,
  fetchCandidateData,
  fetchGyms,
  fetchTodayCheckin,
  fetchTodaySession,
  saveGeneratedSession,
} from "../lib/supabase/daily";
import { fetchCapturedWorkouts } from "../lib/supabase/capture";
import type {
  ComposedSession,
  DailyCheckin,
  GymProfile,
  StoredSession,
} from "../types/daily";

const AI_RETRY_DELAY_MS = 1_200;
const aiAnswerBySignature = new Map<string, ComposedSession | null>();
const aiAskInFlight = new Map<string, Promise<unknown>>();

async function askComposeSession(body: object): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, AI_RETRY_DELAY_MS));
    try {
      const { data, error } = await supabase.functions.invoke("compose-session", { body });
      if (error) throw error;
      return data?.composition ?? null;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export interface UseDailySessionValue {
  session: StoredSession | null;
  checkin: DailyCheckin | null;
  activeGym: GymProfile | null;
  gyms: GymProfile[];
  loading: boolean;
  error: Error | null;
  /** Call after any input changes (check-in saved, gym switched). */
  refetch: () => void;
}

export function useDailySession(refreshKey = 0): UseDailySessionValue {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [gyms, setGyms] = useState<GymProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const runIdRef = useRef(0);

  const load = useCallback(async () => {
    const runId = ++runIdRef.current;
    try {
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");
      const today = getLocalDateString(); // one clock sample per compute

      const [gymList, todayCheckin, existing] = await Promise.all([
        fetchGyms(user.id),
        fetchTodayCheckin(user.id, today),
        fetchTodaySession(user.id, today),
      ]);
      if (runId !== runIdRef.current) return;
      setGyms(gymList);
      setCheckin(todayCheckin);

      // No check-in yet → nothing to compose; the sheet gates the day.
      if (!todayCheckin) {
        setSession(existing);
        setLoading(false);
        return;
      }
      // Already accepted/completed → show it as stored, never recompose.
      if (existing && existing.status !== "suggested") {
        setSession(existing);
        setLoading(false);
        return;
      }

      const activeGym = gymList.find((g) => g.isActive) ?? null;
      const [data, bfr, capturedWorkouts] = await Promise.all([
        fetchCandidateData(user.id),
        fetchBfrFlag(user.id),
        fetchCapturedWorkouts(user.id),
      ]);
      if (runId !== runIdRef.current) return;

      // ---- Rules tier ----
      const splitDay = nextSplitDay(data.lastCompletedSplitDay);
      const week = rampWeek(data.firstSessionDate, today);
      const gymEquipment = new Set(activeGym?.equipmentNames ?? []);
      if (gymEquipment.size === 0) {
        // No gym configured: assume bodyweight basics rather than nothing.
        ["Bodyweight", "Floor", "Wall", "Mat"].forEach((n) => gymEquipment.add(n));
      }
      if (bfr) gymEquipment.add("Bands");

      const pools = buildCandidatePools(data.candidates, {
        splitDay,
        gymEquipment,
        soreness: todayCheckin.soreness,
      });
      pools.main = resolveProgressions(pools.main, {
        skillState: data.skillState,
        regressions: data.regressions,
        byExerciseId: data.byExerciseId,
      });
      const budget = sessionBudget({
        minutes: todayCheckin.minutesAvailable,
        rampWeek: week,
        energy: todayCheckin.energy,
      });
      const fallbackItems = composeFallback(pools, budget);

      // ---- AI tier: one ask per question signature ----
      const offeredIds = new Set(
        [...pools.warmup, ...pools.main, ...pools.cooldown].map((c) => c.exerciseId),
      );
      const offeredWorkoutIds = new Set(capturedWorkouts.map((w) => w.workoutId));
      const signature = [
        today, splitDay, todayCheckin.id, activeGym?.id ?? "no-gym",
        todayCheckin.minutesAvailable, todayCheckin.energy,
        [...offeredIds].sort().join(","),
      ].join("::");

      let composed: ComposedSession = {
        splitDay, rampWeek: week, source: "rules_fallback",
        servedCapturedWorkoutId: null, items: fallbackItems,
      };

      const aiBody = {
        splitDay,
        minutes: todayCheckin.minutesAvailable,
        budget,
        candidates: [
          ...pools.warmup, ...pools.main, ...pools.cooldown,
        ].map((c) => ({
          id: c.exerciseId,
          name: c.name,
          pool: c.section,
          isCapture: c.isCapture,
          skillLevel: c.skillLevel,
          muscles: c.muscles.filter((m) => m.isPrimary).map((m) => m.name),
          lastPerformedDaysAgo: c.lastPerformedDaysAgo,
          regressedFrom: c.regressedFromId,
        })),
        capturedWorkouts: capturedWorkouts.map((w) => ({
          id: w.workoutId,
          name: w.name,
          itemCount: w.items.length,
          muscles: "",
        })),
      };

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
          const validated = validateAiSession(raw, offeredIds, offeredWorkoutIds);
          cached = validated
            ? { splitDay, rampWeek: week, source: "ai" as const,
                servedCapturedWorkoutId: validated.servedCapturedWorkoutId,
                items: validated.items }
            : null;
          aiAnswerBySignature.set(signature, cached);
        }
        if (cached) composed = cached;
      } catch (e) {
        // AI failure is not an error state — rules stand alone (spec §5.4).
        console.warn("compose-session ask failed:", e);
      }
      if (runId !== runIdRef.current) return;

      const sessionId = await saveGeneratedSession({
        userId: user.id,
        date: today,
        gymProfileId: activeGym?.id ?? null,
        checkinId: todayCheckin.id,
        session: composed,
        inputsSnapshot: aiBody,
      });
      if (runId !== runIdRef.current) return;
      if (sessionId) {
        setSession(await fetchTodaySession(user.id, today));
      }
    } catch (e) {
      if (runId === runIdRef.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (runId === runIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  return {
    session,
    checkin,
    gyms,
    activeGym: gyms.find((g) => g.isActive) ?? null,
    loading,
    error,
    refetch: load,
  };
}
```

- [ ] **Step 9.2: Typecheck; commit**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx tsc --noEmit
cd /Users/brianwilson/code/fittracker
git add mobile/src/hooks/useDailySession.ts
git commit -m "feat(daily): useDailySession — rules tier plus one signature-cached AI ask"
```

---

### Task 10: Gym + check-in bottom sheets

**Files:**
- Create: `mobile/src/components/training/daily/GymSheet.tsx`
- Create: `mobile/src/components/training/daily/CheckinSheet.tsx`

Both are `Modal` + `animationType="slide"` + `presentationStyle="pageSheet"` bottom sheets, colors from `@/src/lib/colors` (same keys the Phase-1 sheets use).

- [ ] **Step 10.1: Write GymSheet**

```tsx
import React, { useEffect, useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch,
} from "react-native";
import { X, Check, Plus, MapPin } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import {
  fetchBfrFlag, presetEquipmentNames, saveGym, setActiveGym, setBfrFlag,
} from "@/src/lib/supabase/daily";
import { fetchEquipment } from "@/src/lib/supabase/crossfit";
import type { GymProfile } from "@/src/types/daily";

const PRESETS: { key: string; label: string }[] = [
  { key: "full_gym", label: "Full gym" },
  { key: "hotel_gym", label: "Hotel gym" },
  { key: "bodyweight", label: "Bodyweight" },
  { key: "custom", label: "Custom" },
];

interface GymSheetProps {
  visible: boolean;
  gyms: GymProfile[];
  onClose: () => void;
  /** Fires after any change that should recompose the session. */
  onChanged: () => void;
}

export function GymSheet({ visible, gyms, onClose, onChanged }: GymSheetProps) {
  const [editing, setEditing] = useState<GymProfile | "new" | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [preset, setPreset] = useState("hotel_gym");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [allEquipment, setAllEquipment] = useState<string[]>([]);
  const [bfr, setBfr] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    fetchEquipment().then((rows) => setAllEquipment(rows.map((r: any) => r.name)));
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) fetchBfrFlag(user.id).then(setBfr);
    });
  }, [visible]);

  const startEdit = (gym: GymProfile | "new") => {
    setEditing(gym);
    if (gym === "new") {
      setName(""); setLocation(""); setPreset("hotel_gym");
      setChecked(new Set(presetEquipmentNames("hotel_gym")));
    } else {
      setName(gym.name); setLocation(gym.location ?? ""); setPreset(gym.preset);
      setChecked(new Set(gym.equipmentNames));
    }
  };

  const applyPreset = (key: string) => {
    setPreset(key);
    if (key !== "custom") setChecked(new Set(presetEquipmentNames(key)));
  };

  const toggleEquipment = (n: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
    setPreset("custom");
  };

  const handleActivate = async (gymId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await setActiveGym(user.id, gymId);
    onChanged();
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const gymId = await saveGym({
      id: editing === "new" ? undefined : editing!.id,
      userId: user.id,
      name: name.trim(),
      location: location.trim() || null,
      preset,
      equipmentNames: [...checked],
    });
    if (gymId && editing === "new") await setActiveGym(user.id, gymId);
    setSaving(false);
    setEditing(null);
    onChanged();
  };

  const handleBfrToggle = async (value: boolean) => {
    setBfr(value);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) { await setBfrFlag(user.id, value); onChanged(); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{editing ? (editing === "new" ? "New gym" : "Edit gym") : "Gyms"}</Text>
          <TouchableOpacity onPress={editing ? () => setEditing(null) : onClose}>
            <X size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {!editing ? (
          <ScrollView>
            {gyms.map((gym) => (
              <TouchableOpacity key={gym.id} style={styles.gymRow} onPress={() => handleActivate(gym.id)}>
                <View style={[styles.radio, gym.isActive && styles.radioActive]}>
                  {gym.isActive && <Check size={14} color="#FFFFFF" />}
                </View>
                <View style={styles.gymBody}>
                  <Text style={styles.gymName}>{gym.name}</Text>
                  <Text style={styles.gymMeta}>
                    {[gym.location, `${gym.equipmentNames.length} equipment`].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => startEdit(gym)}>
                  <Text style={styles.editLink}>Edit</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.addRow} onPress={() => startEdit("new")}>
              <Plus size={18} color={colors.primary} />
              <Text style={styles.addText}>Add a gym</Text>
            </TouchableOpacity>

            <View style={styles.bfrRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gymName}>BFR bands travel with me</Text>
                <Text style={styles.gymMeta}>Counts as available equipment at every gym</Text>
              </View>
              <Switch value={bfr} onValueChange={handleBfrToggle} trackColor={{ true: colors.primary }} />
            </View>
          </ScrollView>
        ) : (
          <ScrollView>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="Waikiki Hotel Gym" placeholderTextColor={colors.mutedForeground} />
            <Text style={styles.label}>Location</Text>
            <View style={styles.inputRow}>
              <MapPin size={16} color={colors.mutedForeground} />
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} value={location}
                onChangeText={setLocation} placeholder="Honolulu, HI"
                placeholderTextColor={colors.mutedForeground} />
            </View>
            <Text style={styles.label}>Preset</Text>
            <View style={styles.pillRow}>
              {PRESETS.map((p) => (
                <TouchableOpacity key={p.key}
                  style={[styles.pill, preset === p.key && styles.pillActive]}
                  onPress={() => applyPreset(p.key)}>
                  <Text style={[styles.pillText, preset === p.key && styles.pillTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Equipment</Text>
            <View style={styles.pillRow}>
              {allEquipment.map((n) => (
                <TouchableOpacity key={n}
                  style={[styles.pill, checked.has(n) && styles.pillActive]}
                  onPress={() => toggleEquipment(n)}>
                  <Text style={[styles.pillText, checked.has(n) && styles.pillTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.button, saving && { opacity: 0.6 }]}
              onPress={handleSave} disabled={saving}>
              <Text style={styles.buttonText}>Save gym</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground },
  gymRow: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  gymBody: { flex: 1 },
  gymName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  gymMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  editLink: { fontSize: 14, color: colors.primary },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 16 },
  addText: { fontSize: 15, color: colors.primary, fontWeight: "600" },
  bfrRow: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8,
  },
  label: { fontSize: 13, color: colors.mutedForeground, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: colors.input, borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 16, color: colors.foreground, marginBottom: 4,
  },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.input,
    borderRadius: 8, paddingHorizontal: 12,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 13, color: colors.mutedForeground },
  pillTextActive: { color: "#FFFFFF", fontWeight: "600" },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14,
    alignItems: "center", marginTop: 24,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});
```

- [ ] **Step 10.2: Write CheckinSheet**

```tsx
import React, { useEffect, useState } from "react";
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import { X } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/components/workout-session/helpers";
import { saveCheckin } from "@/src/lib/supabase/daily";
import { fetchMuscleRegions } from "@/src/lib/supabase/crossfit";
import type { DailyCheckin } from "@/src/types/daily";

const MINUTES_OPTIONS = [45, 60, 90, 120];
// Cycle 0 → 1 → 2 → 3 → 0 on tap: not sore, tender, sore, very sore.
const SEVERITY_LABEL = ["", "tender", "sore", "very sore"];

interface CheckinSheetProps {
  visible: boolean;
  existing: DailyCheckin | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CheckinSheet({ visible, existing, onClose, onSaved }: CheckinSheetProps) {
  const [energy, setEnergy] = useState(existing?.energy ?? 7);
  const [minutes, setMinutes] = useState(existing?.minutesAvailable ?? 120);
  const [soreness, setSoreness] = useState<Record<string, number>>(existing?.soreness ?? {});
  const [regions, setRegions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEnergy(existing?.energy ?? 7);
    setMinutes(existing?.minutesAvailable ?? 120);
    setSoreness(existing?.soreness ?? {});
    fetchMuscleRegions().then((rows) =>
      // "Full Body" is a classification, not a body part you can be sore in.
      setRegions(rows.map((r: any) => r.name).filter((n: string) => n !== "Full Body")),
    );
  }, [visible, existing]);

  const cycleSoreness = (region: string) => {
    setSoreness((prev) => {
      const next = { ...prev };
      const current = next[region] ?? 0;
      const bumped = (current + 1) % 4;
      if (bumped === 0) delete next[region]; else next[region] = bumped;
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    await saveCheckin({
      userId: user.id,
      date: getLocalDateString(),
      energy,
      minutesAvailable: minutes,
      soreness,
    });
    setSaving(false);
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>How's today looking?</Text>
          <TouchableOpacity onPress={onClose}><X size={24} color={colors.mutedForeground} /></TouchableOpacity>
        </View>
        <ScrollView>
          <Text style={styles.label}>Sore anywhere? Tap once for tender, twice for sore, three times for very sore.</Text>
          <View style={styles.pillRow}>
            {regions.map((r) => {
              const level = soreness[r] ?? 0;
              return (
                <TouchableOpacity key={r}
                  style={[styles.pill, level > 0 && styles.pillActive, level > 1 && styles.pillHot]}
                  onPress={() => cycleSoreness(r)}>
                  <Text style={[styles.pillText, level > 0 && styles.pillTextActive]}>
                    {r}{level > 0 ? ` · ${SEVERITY_LABEL[level]}` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Energy: {energy}/10</Text>
          <View style={styles.pillRow}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <TouchableOpacity key={n}
                style={[styles.dot, energy === n && styles.pillActive]}
                onPress={() => setEnergy(n)}>
                <Text style={[styles.pillText, energy === n && styles.pillTextActive]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Time available</Text>
          <View style={styles.pillRow}>
            {MINUTES_OPTIONS.map((m) => (
              <TouchableOpacity key={m}
                style={[styles.pill, minutes === m && styles.pillActive]}
                onPress={() => setMinutes(m)}>
                <Text style={[styles.pillText, minutes === m && styles.pillTextActive]}>
                  {m >= 60 ? `${m / 60}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <TouchableOpacity style={[styles.button, saving && { opacity: 0.6 }]}
          onPress={handleSave} disabled={saving}>
          <Text style={styles.buttonText}>Build my session</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "700", color: colors.foreground },
  label: { fontSize: 13, color: colors.mutedForeground, marginTop: 18, marginBottom: 8 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
  },
  dot: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillHot: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  pillText: { fontSize: 13, color: colors.mutedForeground },
  pillTextActive: { color: "#FFFFFF", fontWeight: "600" },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14,
    alignItems: "center", marginTop: 12,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
});
```

- [ ] **Step 10.3: Typecheck; commit**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx tsc --noEmit
cd /Users/brianwilson/code/fittracker
git add mobile/src/components/training/daily/GymSheet.tsx mobile/src/components/training/daily/CheckinSheet.tsx
git commit -m "feat(daily): gym and check-in bottom sheets"
```

---

### Task 11: Today tab

**Files:**
- Rewrite: `mobile/src/components/training/daily/TodayTab.tsx` (replace the 21-line placeholder)
- Modify: `mobile/app/(tabs)/training/index.tsx`

- [ ] **Step 11.1: Rewrite TodayTab**

```tsx
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronDown, MapPin, Play, Sparkles } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { useDailySession } from "@/src/hooks/useDailySession";
import { GymSheet } from "./GymSheet";
import { CheckinSheet } from "./CheckinSheet";
import type { SessionSection } from "@/src/types/daily";

const SECTION_TITLES: Record<SessionSection, string> = {
  warmup: "Warm-up",
  main: "Main work",
  accessory: "Accessories",
  bfr: "BFR finisher",
  cooldown: "Cooldown",
};
const SECTION_ORDER: SessionSection[] = ["warmup", "main", "accessory", "bfr", "cooldown"];

export default function TodayTab() {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [gymSheetVisible, setGymSheetVisible] = useState(false);
  const [checkinVisible, setCheckinVisible] = useState(false);
  const { session, checkin, activeGym, gyms, loading, error, refetch } =
    useDailySession(refreshKey);
  const [refreshing, setRefreshing] = useState(false);

  const bump = () => setRefreshKey((k) => k + 1);

  const onRefresh = async () => {
    setRefreshing(true);
    bump();
    setTimeout(() => setRefreshing(false), 600);
  };

  const startSession = () => {
    if (!session) return;
    router.push({
      pathname: `/workout/${session.id}`,
      params: {
        mode: "daily",
        ...(session.workoutInstanceId ? { instanceId: session.workoutInstanceId } : {}),
      },
    });
  };

  const gymChip = (
    <TouchableOpacity style={styles.gymChip} onPress={() => setGymSheetVisible(true)} activeOpacity={0.7}>
      <MapPin size={14} color={colors.primary} />
      <Text style={styles.gymChipText}>
        {activeGym ? `at: ${activeGym.name}` : "No gym set — tap to add"}
      </Text>
      <ChevronDown size={14} color={colors.mutedForeground} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {gymChip}

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Couldn't build today's session</Text>
            <Text style={styles.emptyText}>{error.message}</Text>
          </View>
        ) : !checkin ? (
          <View style={styles.center}>
            <Sparkles size={32} color={colors.primary} />
            <Text style={styles.emptyTitle}>Check in to build today's session</Text>
            <Text style={styles.emptyText}>
              Ten seconds: soreness, energy, and how long you've got.
            </Text>
            <TouchableOpacity style={styles.button} onPress={() => setCheckinVisible(true)}>
              <Text style={styles.buttonText}>Check in</Text>
            </TouchableOpacity>
          </View>
        ) : !session ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Nothing to work with yet</Text>
            <Text style={styles.emptyText}>
              Capture some exercises in the Exercises tab and pull to refresh.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.sessionHeader}>
              <Text style={styles.sessionTitle}>
                {session.splitDay === "push" ? "Push day" : session.splitDay === "pull" ? "Pull day" : "Leg day"}
              </Text>
              <View style={styles.badges}>
                {session.rampWeek <= 2 && (
                  <Text style={styles.rampBadge}>Re-entry week {session.rampWeek}</Text>
                )}
                <Text style={styles.sourceBadge}>
                  {session.source === "ai" ? "AI composed" : "Rules composed"}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setCheckinVisible(true)}>
                <Text style={styles.editCheckin}>
                  Energy {checkin.energy}/10 · {checkin.minutesAvailable} min · edit
                </Text>
              </TouchableOpacity>
            </View>

            {SECTION_ORDER.map((section) => {
              const items = session.items.filter((i) => i.section === section);
              if (items.length === 0) return null;
              return (
                <View key={section} style={styles.section}>
                  <Text style={styles.sectionTitle}>{SECTION_TITLES[section]}</Text>
                  {items.map((item) => (
                    <View key={item.id} style={styles.itemCard}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemMeta}>
                        {[
                          item.targetSets ? `${item.targetSets} × ${item.targetReps ?? "?"}` : item.targetReps,
                          item.restSeconds ? `rest ${item.restSeconds}s` : null,
                        ].filter(Boolean).join(" · ")}
                      </Text>
                      {item.reason && <Text style={styles.itemReason}>{item.reason}</Text>}
                    </View>
                  ))}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {session && checkin && session.status !== "completed" && (
        <TouchableOpacity style={styles.startButton} onPress={startSession} activeOpacity={0.8}>
          <Play size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>
            {session.workoutInstanceId ? "Continue session" : "Start session"}
          </Text>
        </TouchableOpacity>
      )}

      <GymSheet visible={gymSheetVisible} gyms={gyms}
        onClose={() => setGymSheetVisible(false)}
        onChanged={() => { setGymSheetVisible(false); bump(); }} />
      <CheckinSheet visible={checkinVisible} existing={checkin}
        onClose={() => setCheckinVisible(false)}
        onSaved={() => { setCheckinVisible(false); bump(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 96 },
  gymChip: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 16,
  },
  gymChipText: { fontSize: 13, color: colors.foreground, fontWeight: "600" },
  center: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "bold", color: colors.foreground },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12,
    paddingHorizontal: 28, marginTop: 12,
  },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  sessionHeader: { marginBottom: 12 },
  sessionTitle: { fontSize: 22, fontWeight: "700", color: colors.foreground },
  badges: { flexDirection: "row", gap: 8, marginTop: 6 },
  rampBadge: {
    fontSize: 11, color: "#F59E0B", borderWidth: 1, borderColor: "#F59E0B",
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden",
  },
  sourceBadge: {
    fontSize: 11, color: colors.mutedForeground, borderWidth: 1,
    borderColor: colors.border, borderRadius: 10, paddingHorizontal: 8,
    paddingVertical: 2, overflow: "hidden",
  },
  editCheckin: { fontSize: 13, color: colors.primary, marginTop: 8 },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 12, color: colors.mutedForeground, textTransform: "uppercase",
    letterSpacing: 1, marginBottom: 8,
  },
  itemCard: {
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  itemName: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  itemMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  itemReason: { fontSize: 12, color: colors.primary, marginTop: 6, fontStyle: "italic" },
  startButton: {
    position: "absolute", left: 16, right: 16, bottom: 16, flexDirection: "row",
    gap: 8, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
});
```

- [ ] **Step 11.2: Wire the search placeholder in the training screen**

In `mobile/app/(tabs)/training/index.tsx`, the daily branch of `getSearchPlaceholder()` currently has no `today` case (falls to `"Search..."`). That's acceptable — but make the Today tab default when a session exists is Phase-3 polish; the only Phase-2 change here is defaulting `dailyTab` to `"today"` once the loop is live:

```tsx
const [dailyTab, setDailyTab] = useState<DailyTab>("today");
```

(Currently `"exercises"` at line 33.)

- [ ] **Step 11.3: Typecheck; commit**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx tsc --noEmit
cd /Users/brianwilson/code/fittracker
git add mobile/src/components/training/daily/TodayTab.tsx "mobile/app/(tabs)/training/index.tsx"
git commit -m "feat(daily): Today tab — gym chip, check-in gate, composed session"
```

---

### Task 12: Logging integration (`app/workout/[id].tsx` daily mode)

**Files:**
- Modify: `mobile/app/workout/[id].tsx`

The screen is template-driven: `[id]` is a `program_workouts.id`, targets come from `program_workout_exercises`, and every write threads program parentage. Daily mode reuses the whole screen by building the SAME `WorkoutTemplate` shape from `generated_session_items` and passing NULL parentage. Six surgical edits, all anchored to current code (line numbers from current main):

- [ ] **Step 12.1: Params + mode flag (line 71)**

Replace:
```tsx
const { id, instanceId, programInstanceId } = useLocalSearchParams<{ id: string; instanceId?: string; programInstanceId?: string }>();
```
with:
```tsx
const { id, instanceId, programInstanceId, mode } = useLocalSearchParams<{ id: string; instanceId?: string; programInstanceId?: string; mode?: string }>();
// Daily mode: `id` is a generated_sessions.id, parentage is NULL, and the
// template shape is built from generated_session_items instead of a program.
const isDaily = mode === 'daily';
```

- [ ] **Step 12.2: Template loading (inside `loadWorkout`, lines 298-333)**

Wrap the existing `program_workouts` fetch in `if (!isDaily) { ... }` and add the daily branch. The daily branch builds pseudo-`ProgramWorkoutExercise` rows: `id` carries the session item id (never written to the DB in daily mode), `target_sets`/`target_reps_min` come from the item (reps parsed to its leading integer; `"8-12"` → 8):

```tsx
let sortedExercises: any[];
let templateName = '';
let sessionRow: { id: string; workout_instance_id: string | null } | null = null;

if (isDaily) {
  const { data: sessionData, error: sessionError } = await supabase
    .from('generated_sessions')
    .select(`
      id, split_day, workout_instance_id,
      items:generated_session_items(
        id, exercise_id, item_order, section, target_sets, target_reps,
        rest_seconds,
        exercises ( id, name, image_url )
      )
    `)
    .eq('id', id)
    .single();
  if (sessionError) throw sessionError;
  sessionRow = { id: sessionData.id, workout_instance_id: sessionData.workout_instance_id };
  templateName = sessionData.split_day === 'push' ? 'Push Day'
    : sessionData.split_day === 'pull' ? 'Pull Day' : 'Leg Day';
  sortedExercises = [...(sessionData.items || [])]
    .sort((a: any, b: any) => a.item_order - b.item_order)
    .map((item: any) => ({
      id: item.id, // session item id — NEVER written as program_workout_exercise_id
      exercise_id: item.exercise_id,
      exercise_order: item.item_order,
      target_sets: item.target_sets ?? 3,
      target_reps_min: parseInt(item.target_reps ?? '', 10) || 8,
      target_reps_max: null,
      superset_group: null,
      exercises: item.exercises,
    }));
  setTemplate({
    id: sessionData.id,
    name: templateName,
    day_number: 0,
    week_number: 0,
    program_workout_exercises: sortedExercises,
  } as unknown as WorkoutTemplate);
} else {
  // ... existing program_workouts fetch + sort + setTemplate, unchanged ...
}
```

Also in the daily branch: if `sessionRow.workout_instance_id` exists and no `instanceId` param was passed, treat it as the resume instance — set a local `const effectiveInstanceId = instanceId || sessionRow?.workout_instance_id || null;` and use `effectiveInstanceId` everywhere the rest of `loadWorkout` reads `instanceId` (lines 384, 546).

- [ ] **Step 12.3: Instance creation (`createWorkoutInstance`, lines 948-968)**

Replace the `programInstanceId` guard and insert:
```tsx
if (!isDaily && !programInstanceId) {
  console.error('Cannot create workout instance: programInstanceId not available');
  Alert.alert('Error', 'Program instance not found. Please start from the home screen.');
  return null;
}
```
and the insert body:
```tsx
.insert({
  user_id: userId,
  program_instance_id: isDaily ? null : programInstanceId,
  program_workout_id: isDaily ? null : template.id,
  week_number: template.week_number, // 0 for daily
  day_number: template.day_number,   // 0 for daily
  status: 'in_progress',
  scheduled_date: getLocalDateString(),
  started_at: startedAt?.toISOString(),
})
```
After a successful insert, link the session (import `acceptSession` from `@/src/lib/supabase/daily` at the top of the file):
```tsx
if (data) {
  workoutInstanceIdRef.current = data.id;
  setWorkoutInstanceId(data.id);
  if (isDaily) await acceptSession(String(id), data.id);
  return data.id;
}
```

- [ ] **Step 12.4: Null parentage on exercise writes (two sites: lines 662 and 1079)**

In both `saveSetToDatabase` and `saveExerciseInstance`, the insert line
```tsx
program_workout_exercise_id: state.exercise.id,
```
becomes
```tsx
// Daily: state.exercise.id is a generated_session_items id, not a
// program_workout_exercises id — parentage is NULL by design.
program_workout_exercise_id: isDaily ? null : state.exercise.id,
```

- [ ] **Step 12.5: Completion backfill (`finishWorkout`, after the workout_instances update ~line 1232)**

Import `completeSession` from `@/src/lib/supabase/daily` and add, inside the `if (workoutInstanceId)` block after the update succeeds:
```tsx
if (isDaily) {
  const performedIds = exerciseStates
    .filter((e) => e.sets.some((s) => s.completed))
    .map((e) => e.exercise.exercise_id);
  await completeSession(String(id), performedIds);
}
```

- [ ] **Step 12.6: Typecheck, run the FULL suite, verify no program-mode regression**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx tsc --noEmit
npm test
```

Then on the simulator (or defer to Task 14): open a normal PROGRAM workout from Home and log one set — the program path must behave exactly as before (this file has no test coverage; manual verification is the regression gate).

- [ ] **Step 12.7: Commit**

```bash
cd /Users/brianwilson/code/fittracker
git add "mobile/app/workout/[id].tsx"
git commit -m "feat(daily): logging screen daily mode — session-built template, null parentage, completion backfill"
```

---

### Task 13: Home card

**Files:**
- Create: `mobile/src/components/DailySessionHomeCard.tsx`
- Modify: `mobile/app/(tabs)/home.tsx`

- [ ] **Step 13.1: Write the card**

```tsx
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Flame } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/components/workout-session/helpers";
import { fetchTodaySession } from "@/src/lib/supabase/daily";
import type { StoredSession } from "@/src/types/daily";

/** Compact Home surface for the generated daily session. Read-only: it shows
 *  what exists and routes to the Today tab; composition happens there. */
export function DailySessionHomeCard() {
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoaded(true); return; }
      fetchTodaySession(user.id, getLocalDateString())
        .then(setSession)
        .finally(() => setLoaded(true));
    });
  }, []);

  if (!loaded) return null;

  const title = !session
    ? "Check in to build today's session"
    : session.status === "completed"
      ? "Today's session — done 💪"
      : session.splitDay === "push" ? "Push day is ready"
      : session.splitDay === "pull" ? "Pull day is ready"
      : "Leg day is ready";

  const subtitle = session
    ? `${session.items.length} movements · ${session.source === "ai" ? "AI composed" : "rules composed"}`
    : "Soreness, energy, time — ten seconds";

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => router.push("/(tabs)/training")}
    >
      <View style={styles.iconWrap}><Flame size={20} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 14,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: `${colors.primary}20`,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  subtitle: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
});
```

- [ ] **Step 13.2: Insert into Home**

In `mobile/app/(tabs)/home.tsx`: add the import, then between the Eat Next block (line 150) and the "Today's Workout" section title (line 153) insert:

```tsx
<Text style={styles.sectionTitle}>Daily Training</Text>
<DailySessionHomeCard key={`daily-${refreshKey}`} />
```

(The `key` remount on `refreshKey` matches how `TodaysWorkoutCard` refreshes.)

- [ ] **Step 13.3: Typecheck; commit**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx tsc --noEmit
cd /Users/brianwilson/code/fittracker
git add mobile/src/components/DailySessionHomeCard.tsx "mobile/app/(tabs)/home.tsx"
git commit -m "feat(daily): Home card for the generated session"
```

---

### Task 14: End-to-end on-device verification

The untyped-client / drifted-schema reality makes this the load-bearing test. Boot a NEW dedicated simulator with Metro on a unique port (standing rule):

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx expo start --dev-client --port 8091
```

- [ ] **Step 14.1: Full quality gate first**

```bash
npm test && npx tsc --noEmit && npm run lint
```

Expected: all suites pass (including the four new daily ones), no new tsc errors, no new lint errors.

- [ ] **Step 14.2: Walk the loop**

1. **Gyms:** Today tab → gym chip → add "Test Hotel Gym" (hotel preset), tweak a checkbox → save. Chip shows the gym. Toggle BFR on.
2. **Check-in:** tap Check in → mark Chest sore (2 taps), energy 6, 90 minutes → Build my session. A session appears: split day named, sections grouped, reasons visible on AI picks, "AI composed" (or "Rules composed" if offline) badge.
3. **Soreness respected:** with Chest sore at "sore" on a push day, no chest-primary movement appears in main work.
4. **Equipment respected:** no barbell movement appears (hotel preset has no barbell).
5. **Regenerate:** switch to a bodyweight gym via the chip → session recomposes without barbell/dumbbell work; check-in edit (30 min) → session shrinks, cooldown/BFR drop first.
6. **Persistence:** kill and relaunch the app → Today shows the same stored session (no recompute, same items).
7. **Logging:** Start session → the logging screen shows the session's movements with its set/rep targets → log two sets on the first exercise → back out → Today shows Continue session → resume → finish workout. No errors, and the program-workout path (Home → Today's Workout card) still opens and logs correctly.
8. **Backfill:** after finish, verify `generated_sessions.status = 'completed'` and `was_performed` set on items (query below).
9. **Offline fallback:** airplane mode → new day simulation is impractical; instead delete today's check-in via re-check-in with changed values while offline → expect the rules-composed session, "Rules composed" badge, no crash.
10. **Home:** card shows the session state and routes to the Today tab.

- [ ] **Step 14.3: Verify rows**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx supabase db dump --data-only --schema public 2>/dev/null | grep -A3 "COPY public.generated_sessions" | head -8
```

Expected: today's row with status `completed`, `workout_instance_id` set; the linked `workout_instances` row has NULL program parentage.

- [ ] **Step 14.4: Stop and report**

Do NOT merge. Show the user: screenshots of Today (composed session with reasons), the gym sheet, the check-in sheet, the logging screen mid-session, Home card, plus test output and any deviations from this plan. The user decides the merge.

---

## Self-Review Notes (already applied)

- Spec §3.1 fully covered by Task 1 (all seven new tables + BFR flag); §3.2 by Task 1's second migration + Task 12; §5.1–5.5 by Tasks 3–9 (feedback-loop *ratings UI* is Phase 3 by the spec's phasing — `was_performed` backfill, which §5.5 assigns to completion, IS in Task 12); §6 chip-plus-sheet by Tasks 10–11; Home + logging by Tasks 12–13.
- `served_captured_workout_id` flows end-to-end (schema → validator → hook → storage) but the Today tab renders served workouts as their items only when the AI returns items; a served-whole workout displays via its stored `served_captured_workout_id` with zero items — acceptable Phase-2 cut, flagged for Phase 3 polish.
- Type names checked across tasks: `SessionCandidate`/`RankedCandidate`/`SectionPlan`/`SessionItem`/`ComposedSession`/`StoredSession` (Task 2) are used with those exact names in Tasks 4–13; `CandidatePools` exported from `dailyCandidates` and imported in `dailyCompose`/hook.
- The hook writes suggestion rows (`saveGeneratedSession`) — consistent with the suggest-only doctrine as applied by nutrition's `eat_next_suggestions`: recording a suggestion is not acting on it; acting (accept/complete) happens only on user taps in Task 12.
- Known simplifications, deliberate: recency limit 500 instance rows; `capturedWorkouts.muscles` sent empty (model sees names/counts only); check-in soreness pills instead of a literal body-map graphic (same data, less build); no skill-level filter added to Exercises tab (pre-existing Phase-1 drift, unchanged here).
```
