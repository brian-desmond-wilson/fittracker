# Daily Training Phase 3 — Promotion Loop, BFR Finisher, Share Extension, Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the daily loop's learning half — per-movement too-easy/right/too-hard ratings that update `exercise_skill_state` and promote along `movement_scaling_links`, with the earned skill ceiling steering the workout shortlist — plus the BFR finisher block, the iOS share extension feeding the existing capture pipeline, and four polish items.

**Architecture:** Everything sits on the 2026-08-18 block recommender (whole-workout composition), NOT the deferred exercise-level engine. Ratings are a post-workout sheet on the Today tab (mirroring the existing debrief pattern); a pure state machine (`dailySkill.ts`) owns promotion arithmetic; the earned ceiling replaces the shortlist's documented ramp stand-in (`dailyBlockShortlist.ts:203-205`). BFR is a rules-appended sixth block backed by static built-in routines — the AI never sees it, per "rules keep the numbers." The share extension (expo-share-intent v5, Expo SDK 54) lands a URL into the existing `CaptureFab → CaptureSheet → resolvePost` flow; nothing parallel is built.

**Tech Stack:** Expo SDK 54 / React Native 0.81, Supabase (Postgres + RLS, Deno edge functions), OpenAI `gpt-5.6-terra`, Jest, expo-share-intent v5.

**Reconciliation against the 2026-08-16 spec §7 (what is NOT in this plan):**
- *"Serving captured workouts whole"* — **already shipped**: the start-catalog-workout feature (2026-08-17) and the block recommender (2026-08-18) both serve whole workouts. Nothing to build.
- Exercise-level PPL composition — explicitly deferred by the 2026-08-18 spec §10. The rating loop built here writes the state that engine will read.
- The live `movement_scaling_links` table is **empty** (the 2025-10 seed matched no exercise names). Task 2 seeds real chains verified against the live catalog's 200 movements; promotion degrades gracefully to level-bumps where no link exists.

**Binding conventions (inherited from Phases 1/2):**
- Supabase JS client is untyped — runtime verification is mandatory; tsc proves nothing about schema. The live DB has drifted ahead of migrations on the instance tables; verify DDL with `npx supabase db dump --schema public` when something errors. **The worktree is not linked to the Supabase project — run all `npx supabase` commands from `/Users/brianwilson/code/fittracker/mobile` (the main checkout), which is linked. Migration files are written in THIS worktree and copied to the main checkout only for the push step (see Task 2 Step 2.3).**
- Migrations via `npx supabase db push --yes`. Never dashboard SQL.
- Bottom sheets, never inline pickers. Approved mockups are decision records — the movement-rating sheet is NEW (no mockup exists); the existing DebriefSheet (approved mockup F) is not modified.
- Commit exactly where the plan says; stage ONLY the named paths. No PRs, ever.
- Branch `daily-training-phase3` (already created; Stage A fixes are its first seven commits). Merging to main is Brian's call.
- On-device runs: dedicated new simulator, Metro on port 8092, and `mobile/.env` must be copied from the main checkout into the worktree first (it is gitignored and absent here).

---

## File Structure

| Path | Responsibility |
|---|---|
| `mobile/src/lib/dailySkill.ts` (+test) | Create — pure: rating→state machine, promotion decision, user skill ceiling |
| `supabase/migrations/20260820100000_phase3_ratings_and_links.sql` | Create — `movement_ratings` table + RLS; seed `movement_scaling_links` with verified chains |
| `supabase/migrations/20260820110000_bfr_block.sql` | Create — extend `block` CHECKs with `'bfr'` |
| `mobile/src/lib/supabase/daily.ts` | Modify — skill-state fetch, ratings write path, progression lookup |
| `mobile/src/components/training/daily/MovementRatingSheet.tsx` | Create — post-workout per-movement rating sheet |
| `mobile/src/components/training/daily/TodayTab.tsx` | Modify — mount rating sheet after debrief; "Rate the movements" card |
| `mobile/src/lib/dailyBlockShortlist.ts` (+test) | Modify — skill ceiling gate replaces the ramp stand-in |
| `mobile/src/hooks/useDailySession.ts` | Modify — fetch skill states; append BFR pick |
| `mobile/src/types/dailyBlocks.ts` | Modify — `BlockRole` += `"bfr"`; widen `BuiltinRoutine.role` |
| `mobile/src/lib/dailyBlockCompose.ts` (+test) | Modify — order/titles/section for bfr; `bfrFinisherPick` |
| `mobile/src/lib/dailyBuiltins.ts` | Modify — two BFR built-in routines |
| `mobile/src/lib/supabase/capture.ts` | Modify — `markCaptureRejected`; thumbnail through `extractPost` |
| `mobile/src/components/training/daily/CaptureReviewSheet.tsx` | Modify — rejection persists a `failed` source row |
| `mobile/src/lib/catalogFilter.ts` (+test) | Modify — skill-level filter axis |
| `mobile/src/components/training/daily/CatalogTab.tsx` | Modify — Skill pill rail |
| `mobile/src/types/capture.ts` | Modify — `CatalogFilters.skill`, `CatalogEntry.skillLevel` |
| `supabase/functions/capture-post/index.ts` | Modify — extract action reads the thumbnail |
| `mobile/app/workout/[id].tsx` | Modify — chapter-card preview shows creator's reps |
| `mobile/app/_layout.tsx` | Modify — share-intent hook → route to capture |
| `mobile/app/(tabs)/training/index.tsx` | Modify — `shareUrl` param → CaptureFab |
| `mobile/src/components/training/daily/CaptureFab.tsx` | Modify — `initialUrl` pass-through |
| `mobile/src/components/training/daily/CaptureSheet.tsx` | Modify — `initialUrl` autofill + auto-resolve |
| `mobile/app.json` | Modify — expo-share-intent plugin |

---

### Task 1: `dailySkill.ts` — the promotion state machine (TDD)

**Files:**
- Create: `mobile/src/lib/dailySkill.ts`
- Test: `mobile/src/lib/__tests__/dailySkill.test.ts`

- [ ] **Step 1.1: Write the failing tests**

```typescript
import { applyRating, userSkillCeiling } from "../dailySkill";

describe("applyRating", () => {
  it("starts a fresh movement at beginner with an empty streak", () => {
    const s = applyRating(null, "right");
    expect(s).toEqual({
      currentLevel: "beginner", consecutiveTooEasy: 0,
      lastRating: "right", promoted: false,
    });
  });

  it("one too-easy builds the streak without promoting", () => {
    const s = applyRating(null, "too_easy");
    expect(s.consecutiveTooEasy).toBe(1);
    expect(s.currentLevel).toBe("beginner");
    expect(s.promoted).toBe(false);
  });

  it("two consecutive too-easy promote and reset the streak (spec §5.5)", () => {
    const s = applyRating(
      { currentLevel: "beginner", consecutiveTooEasy: 1 }, "too_easy",
    );
    expect(s.currentLevel).toBe("intermediate");
    expect(s.consecutiveTooEasy).toBe(0);
    expect(s.promoted).toBe(true);
  });

  it("a right rating breaks the streak", () => {
    const s = applyRating(
      { currentLevel: "beginner", consecutiveTooEasy: 1 }, "right",
    );
    expect(s.consecutiveTooEasy).toBe(0);
    expect(s.promoted).toBe(false);
  });

  it("too-hard demotes one level immediately and breaks the streak", () => {
    const s = applyRating(
      { currentLevel: "advanced", consecutiveTooEasy: 1 }, "too_hard",
    );
    expect(s.currentLevel).toBe("intermediate");
    expect(s.consecutiveTooEasy).toBe(0);
  });

  it("demotion floors at beginner", () => {
    const s = applyRating(
      { currentLevel: "beginner", consecutiveTooEasy: 0 }, "too_hard",
    );
    expect(s.currentLevel).toBe("beginner");
  });

  it("promotion at advanced keeps the level but still signals — the chain may offer a harder movement", () => {
    const s = applyRating(
      { currentLevel: "advanced", consecutiveTooEasy: 1 }, "too_easy",
    );
    expect(s.currentLevel).toBe("advanced");
    expect(s.promoted).toBe(true);
    expect(s.consecutiveTooEasy).toBe(0);
  });
});

describe("userSkillCeiling", () => {
  it("is Beginner with no earned states", () => {
    expect(userSkillCeiling([])).toBe("Beginner");
  });
  it("needs three movements at a level before the ceiling rises", () => {
    expect(userSkillCeiling(["intermediate", "intermediate"])).toBe("Beginner");
    expect(userSkillCeiling(["intermediate", "intermediate", "intermediate"])).toBe("Intermediate");
  });
  it("advanced states count toward the intermediate threshold too", () => {
    expect(userSkillCeiling(["advanced", "intermediate", "intermediate"])).toBe("Intermediate");
    expect(userSkillCeiling(["advanced", "advanced", "advanced"])).toBe("Advanced");
  });
});
```

- [ ] **Step 1.2: Run, verify failure**

Run: `cd /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/mobile && npx jest src/lib/__tests__/dailySkill.test.ts`
Expected: FAIL — cannot find module `../dailySkill`.

- [ ] **Step 1.3: Implement**

```typescript
// The learn-as-you-go state machine (2026-08-16 spec §5.5): per-movement
// too-easy/right/too-hard ratings drive exercise_skill_state. Pure — the
// write path in supabase/daily.ts feeds it rows and persists what it returns.
//
// Promotion is deliberately slow (two consecutive too-easy) and demotion
// deliberately fast (one too-hard): eight weeks detrained, start conservative
// and back off the moment something is too much.
import type { SkillStateLevel } from "../types/daily";

export type MovementRating = "too_easy" | "right" | "too_hard";

export interface SkillRatingState {
  currentLevel: SkillStateLevel;
  consecutiveTooEasy: number;
  lastRating: MovementRating;
  /** True when this rating completed a too-easy streak: bump the level and
   *  surface the movement's progression link, when one exists. */
  promoted: boolean;
}

const ORDER: SkillStateLevel[] = ["beginner", "intermediate", "advanced"];

const shift = (level: SkillStateLevel, by: 1 | -1): SkillStateLevel =>
  ORDER[Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(level) + by))];

export function applyRating(
  prev: { currentLevel: SkillStateLevel; consecutiveTooEasy: number } | null,
  rating: MovementRating,
): SkillRatingState {
  const level = prev?.currentLevel ?? "beginner";
  const streak = prev?.consecutiveTooEasy ?? 0;

  if (rating === "too_easy") {
    const nextStreak = streak + 1;
    if (nextStreak >= 2) {
      return {
        currentLevel: shift(level, 1),
        consecutiveTooEasy: 0,
        lastRating: rating,
        promoted: true,
      };
    }
    return { currentLevel: level, consecutiveTooEasy: nextStreak, lastRating: rating, promoted: false };
  }
  if (rating === "too_hard") {
    return { currentLevel: shift(level, -1), consecutiveTooEasy: 0, lastRating: rating, promoted: false };
  }
  return { currentLevel: level, consecutiveTooEasy: 0, lastRating: rating, promoted: false };
}

/** The workout-shortlist gate's input: what the user has EARNED, summarized.
 *  Three movements at a level before the ceiling rises — one lucky rating on
 *  one movement must not unlock Advanced workouts wholesale. Replaces the
 *  ramp-week stand-in documented in dailyBlockShortlist.ts. */
export function userSkillCeiling(
  earned: SkillStateLevel[],
): "Beginner" | "Intermediate" | "Advanced" {
  const advanced = earned.filter((l) => l === "advanced").length;
  const atLeastIntermediate = earned.filter((l) => l !== "beginner").length;
  if (advanced >= 3) return "Advanced";
  if (atLeastIntermediate >= 3) return "Intermediate";
  return "Beginner";
}
```

- [ ] **Step 1.4: Run, verify pass; commit**

```bash
cd /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/mobile
npx jest src/lib/__tests__/dailySkill.test.ts
cd ..
git add mobile/src/lib/dailySkill.ts mobile/src/lib/__tests__/dailySkill.test.ts
git commit -m "feat(daily): the skill state machine — slow to promote, quick to back off"
```

---

### Task 2: Migration — `movement_ratings` + seed the progression chains

**Files:**
- Create: `supabase/migrations/20260820100000_phase3_ratings_and_links.sql`

- [ ] **Step 2.1: Write the migration**

The seed names were verified against the live catalog on 2026-08-20 (200 distinct movements in captured workouts). Every insert is guarded — a missing name inserts nothing rather than failing. `trim()` guards the known `'Back Squat '` trailing-space row.

```sql
-- Daily Training Phase 3: per-movement ratings + progression chains.
-- Spec: docs/superpowers/specs/2026-08-16-daily-training-design.md §5.5.

-- ---- One rating per movement per session: the audit trail behind
-- ---- exercise_skill_state, and how the UI knows a session is already rated.
CREATE TABLE IF NOT EXISTS public.movement_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.generated_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('too_easy', 'right', 'too_hard')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, exercise_id)
);
CREATE INDEX IF NOT EXISTS movement_ratings_session
  ON public.movement_ratings (session_id);

ALTER TABLE public.movement_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own movement ratings" ON public.movement_ratings;
CREATE POLICY "own movement ratings" ON public.movement_ratings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---- Seed movement_scaling_links. The 2025-10 seed matched zero names; the
-- ---- table is empty on the live DB (verified 2026-08-20). These chains use
-- ---- the catalog's actual names. Each link gets its mirror regression.
DO $$
DECLARE
  chain TEXT[][] := ARRAY[
    -- [easier, harder] pairs; display_order 1 throughout (primary chain).
    ARRAY['Ring Rows', 'Pull-Up'],
    ARRAY['Pull-Up', 'Wide Grip Pull Ups'],
    ARRAY['Wide Grip Pull Ups', 'Bar Muscle-Up'],
    ARRAY['Push-up', 'Dip'],
    ARRAY['Air Squat', 'Dumbbell Goblet Squat'],
    ARRAY['Dumbbell Goblet Squat', 'Front Squat'],
    ARRAY['Front Squat', 'Back Squat'],
    ARRAY['Kettlebell Swing', 'Kettlebell Hang Snatch'],
    ARRAY['Hang Clean', 'Clean'],
    ARRAY['Clean', 'Power Clean'],
    ARRAY['Sit-Up', 'V-Ups'],
    ARRAY['V-Ups', 'Toes-to-Bar'],
    ARRAY['Lunge', 'Jumping Split Lunges']
  ];
  pair TEXT[];
  easier_id UUID;
  harder_id UUID;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY chain LOOP
    SELECT id INTO easier_id FROM public.exercises WHERE trim(name) ILIKE pair[1] LIMIT 1;
    SELECT id INTO harder_id FROM public.exercises WHERE trim(name) ILIKE pair[2] LIMIT 1;
    IF easier_id IS NOT NULL AND harder_id IS NOT NULL THEN
      INSERT INTO public.movement_scaling_links
        (from_exercise_id, to_exercise_id, scaling_type, difficulty_delta, display_order)
      SELECT easier_id, harder_id, 'progression', 1, 1
      WHERE NOT EXISTS (
        SELECT 1 FROM public.movement_scaling_links
        WHERE from_exercise_id = easier_id AND to_exercise_id = harder_id
          AND scaling_type = 'progression'
      );
      INSERT INTO public.movement_scaling_links
        (from_exercise_id, to_exercise_id, scaling_type, difficulty_delta, display_order)
      SELECT harder_id, easier_id, 'regression', -1, 1
      WHERE NOT EXISTS (
        SELECT 1 FROM public.movement_scaling_links
        WHERE from_exercise_id = harder_id AND to_exercise_id = easier_id
          AND scaling_type = 'regression'
      );
    END IF;
  END LOOP;
END $$;

-- Secondary regression for Pull-Up (Inverted Row also exists in the catalog).
DO $$
DECLARE a UUID; b UUID;
BEGIN
  SELECT id INTO a FROM public.exercises WHERE trim(name) ILIKE 'Inverted Row' LIMIT 1;
  SELECT id INTO b FROM public.exercises WHERE trim(name) ILIKE 'Pull-Up' LIMIT 1;
  IF a IS NOT NULL AND b IS NOT NULL THEN
    INSERT INTO public.movement_scaling_links
      (from_exercise_id, to_exercise_id, scaling_type, difficulty_delta, display_order)
    SELECT a, b, 'progression', 1, 2
    WHERE NOT EXISTS (
      SELECT 1 FROM public.movement_scaling_links
      WHERE from_exercise_id = a AND to_exercise_id = b AND scaling_type = 'progression'
    );
  END IF;
END $$;
```

- [ ] **Step 2.2: Copy to the main checkout and push**

The push runs from the linked main checkout; the migration file must exist there too (both trees share the repo history, so committing here and pushing there stays consistent — the copy is byte-identical).

```bash
cp /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/supabase/migrations/20260820100000_phase3_ratings_and_links.sql \
   /Users/brianwilson/code/fittracker/supabase/migrations/
cd /Users/brianwilson/code/fittracker/mobile
npx supabase db push --yes
npx supabase migration list 2>&1 | tail -3
```

Expected: `20260820100000` applied local and remote.

- [ ] **Step 2.3: Verify the seed took (live-DB check, not migration faith)**

```bash
cd /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/mobile
node -e "
require('dotenv').config({ path: '/Users/brianwilson/code/fittracker/mobile/.env' });
const { createClient } = require('@supabase/supabase-js');
const c = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SERVICE_ROLE);
c.from('movement_scaling_links').select('*', { count: 'exact', head: true })
  .then(({ count }) => console.log('links:', count));
"
```

Expected: `links:` ≥ 24 (13 pairs × 2 directions, minus any name misses, + the secondary). If 0, STOP — the names regressed; re-verify with a name probe before proceeding.

- [ ] **Step 2.4: Commit**

```bash
cd /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714
git add supabase/migrations/20260820100000_phase3_ratings_and_links.sql
git commit -m "feat(daily): movement ratings table and real progression chains"
```

---

### Task 3: Ratings write path in `daily.ts`

**Files:**
- Modify: `mobile/src/lib/supabase/daily.ts` (append near the debrief functions)

- [ ] **Step 3.1: Add the client functions**

Append to `mobile/src/lib/supabase/daily.ts` (imports: add `applyRating` and types from `../dailySkill` to the existing import block at the top of the file; add `SkillStateLevel` to the existing `../../types/daily` type import if not present):

```typescript
// ---------- Movement ratings → skill state (Phase 3) ----------

import { applyRating } from "../dailySkill";
import type { MovementRating } from "../dailySkill";

/** exercise_id → earned level, for the shortlist ceiling. */
export async function fetchSkillStates(
  userId: string,
): Promise<Record<string, SkillStateLevel>> {
  const { data, error } = await supabase
    .from("exercise_skill_state")
    .select("exercise_id, current_level")
    .eq("user_id", userId);
  if (error) {
    console.error("fetchSkillStates failed:", error);
    return {};
  }
  const out: Record<string, SkillStateLevel> = {};
  for (const row of data ?? []) out[row.exercise_id] = row.current_level;
  return out;
}

/** Which of a session's movements are already rated. */
export async function fetchSessionRatings(sessionId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("movement_ratings")
    .select("exercise_id")
    .eq("session_id", sessionId);
  if (error) {
    console.error("fetchSessionRatings failed:", error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.exercise_id));
}

export interface RatingInput {
  userId: string;
  sessionId: string;
  ratings: { exerciseId: string; rating: MovementRating }[];
}

export interface PromotionResult {
  exerciseId: string;
  /** The harder movement the chain offers, when a progression link exists. */
  toExerciseId: string | null;
  toName: string | null;
}

/** Persist one sheet of ratings: movement_ratings rows (the audit trail),
 *  exercise_skill_state updates through the pure state machine, and the
 *  promotion signals the sheet celebrates. Null = nothing was written. */
export async function saveMovementRatings(
  input: RatingInput,
): Promise<{ promotions: PromotionResult[] } | null> {
  if (input.ratings.length === 0) return { promotions: [] };
  try {
    const ids = input.ratings.map((r) => r.exerciseId);

    const { error: auditError } = await supabase.from("movement_ratings").upsert(
      input.ratings.map((r) => ({
        user_id: input.userId,
        session_id: input.sessionId,
        exercise_id: r.exerciseId,
        rating: r.rating,
      })),
      { onConflict: "session_id,exercise_id" },
    );
    if (auditError) throw auditError;

    const { data: states, error: stateError } = await supabase
      .from("exercise_skill_state")
      .select("exercise_id, current_level, consecutive_too_easy")
      .eq("user_id", input.userId)
      .in("exercise_id", ids);
    if (stateError) throw stateError;
    const prevById = new Map(
      (states ?? []).map((s) => [s.exercise_id, {
        currentLevel: s.current_level as SkillStateLevel,
        consecutiveTooEasy: s.consecutive_too_easy as number,
      }]),
    );

    const nextRows = input.ratings.map((r) => {
      const next = applyRating(prevById.get(r.exerciseId) ?? null, r.rating);
      return { exerciseId: r.exerciseId, next };
    });

    const { error: upError } = await supabase.from("exercise_skill_state").upsert(
      nextRows.map(({ exerciseId, next }) => ({
        user_id: input.userId,
        exercise_id: exerciseId,
        current_level: next.currentLevel,
        consecutive_too_easy: next.consecutiveTooEasy,
        last_rating: next.lastRating,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,exercise_id" },
    );
    if (upError) throw upError;

    // Promotions → the chain's next movement, when a link exists.
    const promotedIds = nextRows.filter((r) => r.next.promoted).map((r) => r.exerciseId);
    if (promotedIds.length === 0) return { promotions: [] };

    const { data: links } = await supabase
      .from("movement_scaling_links")
      .select("from_exercise_id, to_exercise_id, display_order, to:exercises!movement_scaling_links_to_exercise_id_fkey(name)")
      .eq("scaling_type", "progression")
      .in("from_exercise_id", promotedIds)
      .order("display_order", { ascending: true });

    const firstLink = new Map<string, { id: string; name: string | null }>();
    for (const l of (links ?? []) as any[]) {
      if (!firstLink.has(l.from_exercise_id)) {
        firstLink.set(l.from_exercise_id, { id: l.to_exercise_id, name: l.to?.name ?? null });
      }
    }
    return {
      promotions: promotedIds.map((id) => ({
        exerciseId: id,
        toExerciseId: firstLink.get(id)?.id ?? null,
        toName: firstLink.get(id)?.name ?? null,
      })),
    };
  } catch (e) {
    console.error("saveMovementRatings failed:", e);
    return null;
  }
}
```

**Note on the embed:** the FK-name hint `exercises!movement_scaling_links_to_exercise_id_fkey` must match the live constraint name. Verify before committing:

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx supabase db dump --schema public 2>/dev/null | grep "movement_scaling_links.*FOREIGN KEY" 
```

If the constraint is named differently, use that name; if ambiguity is impossible (only one FK to exercises per column), the simple form `to:exercises(name)` fails on this table (two FKs to exercises) — the hint is required.

- [ ] **Step 3.2: Typecheck; commit**

```bash
cd /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/mobile
npx tsc --noEmit
cd ..
git add mobile/src/lib/supabase/daily.ts
git commit -m "feat(daily): ratings write path — audit rows, skill upserts, promotion lookups"
```

---

### Task 4: `MovementRatingSheet` + Today-tab wiring

**Files:**
- Create: `mobile/src/components/training/daily/MovementRatingSheet.tsx`
- Modify: `mobile/src/components/training/daily/TodayTab.tsx`

- [ ] **Step 4.1: Write the sheet**

Modeled on `DebriefSheet.tsx` (same Modal/pageSheet shape, same tokens). The list is the completed session's performed movements, deduped.

```tsx
// Per-movement too-easy/right/too-hard, the second half of closing a day
// (the DebriefSheet asks about the session; this asks about each movement).
// Skippable; dismissing saves nothing. Writes through the dailySkill state
// machine and celebrates promotions inline before closing.
import React, { useEffect, useState } from "react";
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from "react-native";
import { X, TrendingUp } from "lucide-react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { saveMovementRatings } from "@/src/lib/supabase/daily";
import type { PromotionResult } from "@/src/lib/supabase/daily";
import type { MovementRating } from "@/src/lib/dailySkill";

const CHOICES: { key: MovementRating; label: string }[] = [
  { key: "too_easy", label: "Too easy" },
  { key: "right", label: "Right" },
  { key: "too_hard", label: "Too hard" },
];

export interface RatableMovement {
  exerciseId: string;
  name: string;
}

interface MovementRatingSheetProps {
  visible: boolean;
  sessionId: string | null;
  movements: RatableMovement[];
  onClose: () => void;
  onSaved: () => void;
}

export function MovementRatingSheet({
  visible, sessionId, movements, onClose, onSaved,
}: MovementRatingSheetProps) {
  const [ratings, setRatings] = useState<Record<string, MovementRating>>({});
  const [promotions, setPromotions] = useState<PromotionResult[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setRatings({});
    setPromotions(null);
  }, [visible]);

  const submit = async () => {
    if (!sessionId || saving) return;
    const entries = Object.entries(ratings);
    if (entries.length === 0) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const result = await saveMovementRatings({
      userId: user.id,
      sessionId,
      ratings: entries.map(([exerciseId, rating]) => ({ exerciseId, rating })),
    });
    setSaving(false);
    if (!result) return; // write failed; the sheet stays, taps intact
    if (result.promotions.length > 0) {
      setPromotions(result.promotions); // show the level-ups; Done closes
    } else {
      onSaved();
    }
  };

  const nameOf = (id: string) =>
    movements.find((m) => m.exerciseId === id)?.name ?? "This movement";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>How did each movement feel?</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <X size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {promotions === null ? (
          <>
            <ScrollView contentContainerStyle={styles.list}>
              {movements.map((m) => (
                <View key={m.exerciseId} style={styles.row}>
                  <Text style={styles.movement} numberOfLines={2}>{m.name}</Text>
                  <View style={styles.segments}>
                    {CHOICES.map((c) => {
                      const active = ratings[m.exerciseId] === c.key;
                      return (
                        <TouchableOpacity
                          key={c.key}
                          style={[styles.segment, active && styles.segmentActive]}
                          onPress={() =>
                            setRatings((r) => {
                              const next = { ...r };
                              if (active) delete next[m.exerciseId];
                              else next[m.exerciseId] = c.key;
                              return next;
                            })
                          }
                        >
                          <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
              {/* Primary action at the end of the scroll — house rule. */}
              <TouchableOpacity
                style={[styles.save, Object.keys(ratings).length === 0 && styles.saveDisabled]}
                disabled={Object.keys(ratings).length === 0 || saving}
                onPress={submit}
              >
                <Text style={styles.saveText}>
                  {saving ? "Saving…" : `Save ${Object.keys(ratings).length || ""} rating${Object.keys(ratings).length === 1 ? "" : "s"}`}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {promotions.map((p) => (
              <View key={p.exerciseId} style={styles.promoRow}>
                <TrendingUp size={18} color={colors.success} />
                <Text style={styles.promoText}>
                  {nameOf(p.exerciseId)} leveled up
                  {p.toName ? ` — try ${p.toName} next time` : ""}
                </Text>
              </View>
            ))}
            <TouchableOpacity style={styles.save} onPress={onSaved}>
              <Text style={styles.saveText}>Done</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { ...typography.h3, color: colors.text, flex: 1, paddingRight: spacing.md },
  list: { padding: spacing.lg, gap: spacing.md },
  row: {
    backgroundColor: colors.surface, borderRadius: radii.md,
    padding: spacing.md, gap: spacing.sm,
  },
  movement: { fontSize: 15, fontWeight: "600", color: colors.text },
  segments: { flexDirection: "row", gap: spacing.xs },
  segment: {
    flex: 1, paddingVertical: 8, borderRadius: radii.sm, alignItems: "center",
    backgroundColor: colors.surface2,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  segmentTextActive: { color: colors.onBrand },
  save: {
    marginTop: spacing.md, paddingVertical: 14, borderRadius: radii.md,
    backgroundColor: colors.brand, alignItems: "center",
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { fontSize: 15, fontWeight: "700", color: colors.onBrand },
  promoRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md,
  },
  promoText: { flex: 1, fontSize: 14, color: colors.text },
});
```

**Style-token caveat:** `typography.h3`, `radii.sm/md`, `spacing.xs/sm/md/lg` must match the actual exports of `mobile/src/theme/tokens.ts` — check that file's export names before writing and use whatever DebriefSheet itself uses for the same roles.

- [ ] **Step 4.2: Wire into TodayTab**

In `mobile/src/components/training/daily/TodayTab.tsx`, mirror the debrief pattern exactly (state at ~line 75-102, effect at ~129-146, card at ~635-648, sheet mount at ~696):

1. Imports: add `MovementRatingSheet` and `fetchSessionRatings`.
2. State, beside the debrief state:

```tsx
  const [ratingVisible, setRatingVisible] = useState(false);
  // Whether today's completed session already has movement ratings — null
  // while unknown, mirroring hasDebrief.
  const [hasRatings, setHasRatings] = useState<boolean | null>(null);
  const ratingPromptedRef = useRef(false);
```

3. In the effect that fetches the debrief (the one keyed on the completed session id), also fetch ratings:

```tsx
    fetchSessionRatings(sessionId).then((rated) => {
      if (cancelled) return;
      setHasRatings(rated.size > 0);
    });
```

(match the effect's existing cancellation flag name; reset `setHasRatings(null)` where `setHasDebrief(null)` resets.)

4. The ratable movements, derived where the session is in scope (completed sessions only; deduped; skip movements marked not-performed):

```tsx
  const ratableMovements = React.useMemo(() => {
    if (!session || session.status !== "completed") return [];
    const seen = new Set<string>();
    return session.items
      .filter((i) => i.wasPerformed !== false)
      .filter((i) => (seen.has(i.exerciseId) ? false : (seen.add(i.exerciseId), true)))
      .map((i) => ({ exerciseId: i.exerciseId, name: i.name }));
  }, [session]);
```

5. Auto-prompt AFTER the debrief resolves — in `DebriefSheet`'s existing `onClose`/`onSaved` handlers, chain the rating prompt (once per mount, never over an already-rated day, and only when there is something to rate):

```tsx
      <DebriefSheet
        visible={debriefVisible}
        sessionId={/* unchanged */}
        onClose={() => {
          setDebriefVisible(false);
          if (hasRatings === false && ratableMovements.length > 0 && !ratingPromptedRef.current) {
            ratingPromptedRef.current = true;
            setRatingVisible(true);
          }
        }}
        onSaved={() => {
          setDebriefVisible(false); setHasDebrief(true);
          if (hasRatings === false && ratableMovements.length > 0 && !ratingPromptedRef.current) {
            ratingPromptedRef.current = true;
            setRatingVisible(true);
          }
        }} />
      <MovementRatingSheet
        visible={ratingVisible}
        sessionId={session?.id ?? null}
        movements={ratableMovements}
        onClose={() => setRatingVisible(false)}
        onSaved={() => { setRatingVisible(false); setHasRatings(true); }} />
```

6. The card affordance, directly under the existing debrief card block (~line 639), same visual pattern (reuse `styles.debriefCard` styles with a new title/text):

```tsx
                {hasRatings === false && ratableMovements.length > 0 && (
                  <TouchableOpacity
                    style={styles.debriefCard}
                    onPress={() => setRatingVisible(true)}
                  >
                    <Text style={styles.debriefCardTitle}>Rate the movements</Text>
                    <Text style={styles.debriefCardText}>
                      Too easy twice in a row levels a movement up.
                    </Text>
                  </TouchableOpacity>
                )}
```

- [ ] **Step 4.3: Typecheck; commit**

```bash
cd /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/mobile
npx tsc --noEmit
cd ..
git add mobile/src/components/training/daily/MovementRatingSheet.tsx mobile/src/components/training/daily/TodayTab.tsx
git commit -m "feat(daily): post-workout movement ratings — the loop's learning half"
```

---

### Task 5: The earned ceiling gates the shortlist (TDD)

**Files:**
- Modify: `mobile/src/lib/dailyBlockShortlist.ts`
- Test: `mobile/src/lib/__tests__/dailyBlockShortlist.test.ts`
- Modify: `mobile/src/hooks/useDailySession.ts`

- [ ] **Step 5.1: Write the failing tests**

Add to the existing describe blocks in `dailyBlockShortlist.test.ts` (reuse the file's existing workout/context factories — read them first; the factory will need a `userSkill` default of `"Beginner"` added to the context):

```typescript
describe("skill ceiling gate", () => {
  it("excludes a workout tagged above the user's earned ceiling", () => {
    // factory: an Advanced-tagged main workout, userSkill "Beginner", rampWeek 3
    // expect: not in shortlists.main
  });
  it("admits it once the ceiling is earned", () => {
    // same workout, userSkill "Advanced" → present
  });
  it("an untagged skill level is never gated", () => {
    // skillLevel null → present at any ceiling
  });
  it("the ramp still excludes Advanced in weeks 1-2 even at a high ceiling", () => {
    // userSkill "Advanced", rampWeek 1, Advanced workout → absent
  });
  it("the §8 relaxation ladder never relaxes the skill gate", () => {
    // thin catalog forcing relaxation; the only main candidate is Advanced,
    // userSkill Beginner → shortlists.main stays empty / relaxedMain path
    // does not resurrect it
  });
});
```

Write these as REAL tests against the file's existing factories (the comments above describe intent, not final code — the factories' exact shape comes from the file). Run to see them fail:

```bash
npx jest src/lib/__tests__/dailyBlockShortlist.test.ts
```

Expected: FAIL — `userSkill` not part of `ShortlistContext` / gate not applied.

- [ ] **Step 5.2: Implement the gate**

In `dailyBlockShortlist.ts`:

1. `ShortlistContext` gains `userSkill: "Beginner" | "Intermediate" | "Advanced";`
2. Add near the other small helpers:

```typescript
const SKILL_RANK: Record<string, number> = { Beginner: 0, Intermediate: 1, Advanced: 2 };

/** A workout above what the user has EARNED is out (spec §4 step 3, "not
 *  exceed the user's skill level"). Untagged = never gated. Replaces the
 *  ramp-week stand-in this file documented while skill state was empty. */
function withinSkill(w: TaggedWorkout, userSkill: string): boolean {
  const tag = w.tags.skillLevel;
  if (!tag) return true;
  return SKILL_RANK[tag] <= (SKILL_RANK[userSkill] ?? 0);
}
```

3. At the existing ramp stand-in (~line 203-205), replace the filter with both gates (keep the ramp gate — early weeks stay conservative regardless of history) and update the stand-in comment:

```typescript
      .filter((w) => withinSkill(w, ctx.userSkill))
      // Weeks 1-2 stay conservative regardless of earned level (re-entry ramp).
      .filter((w) => !(ctx.rampWeek <= 2 && w.tags.skillLevel === "Advanced"));
```

4. Trace the §8 relaxation path (`relaxedMain`) in this file and confirm the relaxation re-filters recency and soreness only — the skill filter must apply to the relaxed pool too. If the relaxed pool is built from `byRole("main")` directly, apply `withinSkill` there as well.

- [ ] **Step 5.3: Run tests, fix, verify all green**

```bash
npx jest src/lib/__tests__/dailyBlockShortlist.test.ts && npx jest
```

- [ ] **Step 5.4: Feed it from the hook**

In `useDailySession.ts`: add `fetchSkillStates` to the imports from `../lib/supabase/daily` and `userSkillCeiling` from `../lib/dailySkill`. In the compose path's data-fetch `Promise.all` (the one that gathers workouts/usage/profile before shortlists are built), add `fetchSkillStates(user.id)`, then pass the ceiling into the shortlist context:

```typescript
      const userSkill = userSkillCeiling(Object.values(skillStates));
```

and `userSkill` into the `buildBlockShortlists` ctx. The compose signature must ALSO incorporate the ceiling (a promotion should be able to change tomorrow's composition, and the signature gate would otherwise serve the cached day): append `userSkill` to the signature string where it is assembled.

- [ ] **Step 5.5: Typecheck, full suite; commit**

```bash
npx tsc --noEmit && npx jest
cd ..
git add mobile/src/lib/dailyBlockShortlist.ts mobile/src/lib/__tests__/dailyBlockShortlist.test.ts mobile/src/hooks/useDailySession.ts
git commit -m "feat(daily): earned skill ceiling gates the main shortlist"
```

---

### Task 6: Migration — the `bfr` block value

**Files:**
- Create: `supabase/migrations/20260820110000_bfr_block.sql`

- [ ] **Step 6.1: Confirm the live constraint names**

```bash
cd /Users/brianwilson/code/fittracker/mobile
npx supabase db dump --schema public 2>/dev/null | grep -B2 -A2 "block IN"
```

Expected: CHECK constraints on `generated_session_blocks.block` and `captured_workout_usage.block` listing the five roles. Note their exact names (default form: `<table>_block_check`).

- [ ] **Step 6.2: Write the migration** (adjust constraint names to what Step 6.1 showed)

```sql
-- Daily Training Phase 3: the BFR finisher becomes a sixth block.
-- generated_session_items.section already allows 'bfr' (Phase 2 schema);
-- these two CHECKs were written when blocks had five roles.
ALTER TABLE public.generated_session_blocks
  DROP CONSTRAINT IF EXISTS generated_session_blocks_block_check;
ALTER TABLE public.generated_session_blocks
  ADD CONSTRAINT generated_session_blocks_block_check
  CHECK (block IN ('warmup', 'mobility', 'main', 'conditioning', 'bfr', 'cooldown'));

ALTER TABLE public.captured_workout_usage
  DROP CONSTRAINT IF EXISTS captured_workout_usage_block_check;
ALTER TABLE public.captured_workout_usage
  ADD CONSTRAINT captured_workout_usage_block_check
  CHECK (block IN ('warmup', 'mobility', 'main', 'conditioning', 'bfr', 'cooldown'));
```

(`captured_workouts.block_roles` keeps its five-value CHECK on purpose — catalog workouts are never tagged `bfr`; the finisher is built-in-only.)

- [ ] **Step 6.3: Copy, push, verify, commit**

```bash
cp /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/supabase/migrations/20260820110000_bfr_block.sql \
   /Users/brianwilson/code/fittracker/supabase/migrations/
cd /Users/brianwilson/code/fittracker/mobile
npx supabase db push --yes
npx supabase db dump --schema public 2>/dev/null | grep "block IN" 
cd /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714
git add supabase/migrations/20260820110000_bfr_block.sql
git commit -m "feat(daily): 'bfr' joins the block vocabulary"
```

Expected from the dump grep: both constraints now list six values.

---

### Task 7: BFR finisher in the engine (TDD for the pure part)

**Files:**
- Modify: `mobile/src/types/dailyBlocks.ts`
- Modify: `mobile/src/lib/dailyBlockCompose.ts`
- Test: `mobile/src/lib/__tests__/dailyBlockCompose.test.ts`
- Modify: `mobile/src/lib/dailyBuiltins.ts`
- Modify: `mobile/src/hooks/useDailySession.ts`
- Modify: `mobile/src/components/training/daily/TodayTab.tsx` (hide reroll on bfr rows)

- [ ] **Step 7.1: Types**

In `dailyBlocks.ts`:

```typescript
export type BlockRole = "warmup" | "mobility" | "main" | "conditioning" | "bfr" | "cooldown";
```

and widen the builtin role (the doc comment about bfr having no block comes out):

```typescript
  role: Extract<BlockRole, "warmup" | "mobility" | "cooldown" | "bfr">;
```

- [ ] **Step 7.2: Failing tests for `bfrFinisherPick`**

Add to `dailyBlockCompose.test.ts`:

```typescript
import { bfrFinisherPick } from "../dailyBlockCompose";

describe("bfrFinisherPick", () => {
  const ok = { bandsAvailable: true, minutes: 90, recoveryDay: false, mainFocus: "upper" as const };

  it("programs an upper finisher on an upper day", () => {
    const pick = bfrFinisherPick(ok);
    expect(pick?.block).toBe("bfr");
    expect(pick?.builtinKey).toBe("builtin-bfr-upper");
    expect(pick?.workoutId).toBeNull();
  });
  it("matches a lower day with the lower finisher", () => {
    expect(bfrFinisherPick({ ...ok, mainFocus: "lower" })?.builtinKey).toBe("builtin-bfr-lower");
  });
  it("a full-body day gets the upper finisher (arms recover fastest)", () => {
    expect(bfrFinisherPick({ ...ok, mainFocus: "full" })?.builtinKey).toBe("builtin-bfr-upper");
  });
  it("declines without bands", () => {
    expect(bfrFinisherPick({ ...ok, bandsAvailable: false })).toBeNull();
  });
  it("declines under 75 minutes — same floor as conditioning", () => {
    expect(bfrFinisherPick({ ...ok, minutes: 74 })).toBeNull();
  });
  it("declines on a recovery day", () => {
    expect(bfrFinisherPick({ ...ok, recoveryDay: true })).toBeNull();
  });
  it("declines with no main focus (thin day)", () => {
    expect(bfrFinisherPick({ ...ok, mainFocus: null })).toBeNull();
  });
});
```

Run: `npx jest src/lib/__tests__/dailyBlockCompose.test.ts` — expect FAIL (no export). Existing tests in this file may ALSO fail on the widened `BlockRole` — fix any exhaustive `Record<BlockRole, …>` fixtures as part of Step 7.3.

- [ ] **Step 7.3: Implement**

In `dailyBlockCompose.ts`:

```typescript
export const BLOCK_ORDER: BlockRole[] = [
  "warmup", "mobility", "main", "conditioning", "bfr", "cooldown",
];
```

`BLOCK_TITLES` += `bfr: "BFR finisher"`. `SECTION_FOR_BLOCK` += `bfr: "bfr"` (the Phase 2 items CHECK already allows it). Then:

```typescript
import { findBuiltin } from "./dailyBuiltins";

export interface BfrContext {
  bandsAvailable: boolean;
  minutes: number;
  recoveryDay: boolean;
  /** The chosen main pick's focus, or null when the day has no main. */
  mainFocus: BodyFocus | null;
}

/** The BFR finisher is rules-appended, never offered to the model: whether
 *  it runs is a fact about bands, time, and soreness — not a judgment call.
 *  Spec (2026-08-16 §2): bands always packed → program finishers regularly.
 *  Same 75-minute floor as conditioning: the optional blocks share it. */
export function bfrFinisherPick(ctx: BfrContext): BlockPick | null {
  if (!ctx.bandsAvailable || ctx.recoveryDay || ctx.minutes < 75) return null;
  if (!ctx.mainFocus) return null;
  const routine = findBuiltin("bfr", ctx.mainFocus === "lower" ? "lower" : "upper");
  if (!routine) return null;
  return {
    block: "bfr",
    workoutId: null,
    builtinKey: routine.key,
    name: routine.name,
    minutes: routine.minutes,
    roundsNote: null,
    reason: null,
  };
}
```

**Check `findBuiltin`'s signature first** (`dailyBuiltins.ts:100`) — if it takes `(role, focus)` use as shown; if it takes an object or falls back across focuses, adapt but keep exact-focus behavior for bfr (fallback across focus is fine — there are exactly two bfr routines).

In `dailyBuiltins.ts`, append to `BUILTINS` (high-rep, low-load, band-occluded work — the standard 30/15/15/15 BFR scheme):

```typescript
  {
    key: "builtin-bfr-upper", name: "BFR Arm Finisher", role: "bfr",
    focus: "upper", minutes: 10,
    movements: [
      { name: "Banded Bicep Curls (cuffs on)", prescription: "30-15-15-15, 30s rests" },
      { name: "Banded Triceps Extensions (cuffs on)", prescription: "30-15-15-15, 30s rests" },
    ],
  },
  {
    key: "builtin-bfr-lower", name: "BFR Leg Finisher", role: "bfr",
    focus: "lower", minutes: 10,
    movements: [
      { name: "Bodyweight Squats (cuffs on)", prescription: "30-15-15-15, 30s rests" },
      { name: "Standing Calf Raises (cuffs on)", prescription: "30-15-15-15, 30s rests" },
    ],
  },
```

Run the pure suites: `npx jest src/lib/__tests__/dailyBlockCompose.test.ts src/lib/__tests__/dailyBuiltins.test.ts` — green, and fix any `Record<BlockRole, …>` exhaustiveness fallout across the tree (`npx tsc --noEmit` lists every site; expected: `BLOCK_TITLES`, `SECTION_FOR_BLOCK`, possibly test fixtures and `dailySectionMinutes`).

- [ ] **Step 7.4: Append the pick in the hook**

In `useDailySession.ts`, the compose path already fetches the BFR flag if the Phase-2 `fetchBfrFlag` still rides along — **check**: search the hook for `fetchBfrFlag`; if absent, add it to the data-fetch `Promise.all`. After `picks` are final (both the AI-validated path and the `composeBlockFallback` path converge on one `picks` array before items are built), append:

```typescript
      // Rules-appended, never asked: bands + time decide, not the model.
      const mainPick = picks.find((p) => p.block === "main");
      const mainCandidate = mainPick
        ? (shortlists.main ?? []).find(
            (c) => c.workoutId === mainPick.workoutId && c.builtinKey === mainPick.builtinKey,
          )
        : null;
      const bfrPick = bfrFinisherPick({
        bandsAvailable: bfr,
        minutes: todayCheckin.minutesAvailable,
        recoveryDay: shape === "recovery", // use the hook's existing recovery flag variable
        mainFocus: mainCandidate?.focus ?? null,
      });
      if (bfrPick) {
        const cooldownIdx = picks.findIndex((p) => p.block === "cooldown");
        picks.splice(cooldownIdx === -1 ? picks.length : cooldownIdx, 0, bfrPick);
      }
```

(match the hook's actual variable names for the recovery flag and the shortlists; `sectionMinutes` derives from picks via `SECTION_FOR_BLOCK`, so the bfr minutes flow into the planned total automatically — verify that derivation is downstream of this append.)

- [ ] **Step 7.5: Hide the reroll affordance on bfr rows**

In `TodayTab.tsx`, find the block-row reroll button render and gate it: `block.block !== "bfr" && block.block !== ...` — match the existing condition style (built-in rows may already hide or show reroll; bfr has a one-routine "shortlist," so rerolling is meaningless). Also confirm `BlockCard`/row rendering handles a `bfr` row like any built-in (badge, no tap-through to a workout page).

- [ ] **Step 7.6: Full gates; commit**

```bash
npx tsc --noEmit && npx jest && npm run lint 2>&1 | tail -1
cd ..
git add mobile/src/types/dailyBlocks.ts mobile/src/lib/dailyBlockCompose.ts mobile/src/lib/__tests__/dailyBlockCompose.test.ts mobile/src/lib/dailyBuiltins.ts mobile/src/hooks/useDailySession.ts mobile/src/components/training/daily/TodayTab.tsx
git commit -m "feat(daily): the BFR finisher — a rules-appended sixth block"
```

(If Step 7.3's exhaustiveness fallout touched other files — e.g. `dailySectionMinutes.ts`, `dailyChapters.ts`, or their tests — stage those exact paths too and name them in the commit body.)

---

### Task 8: Capture rejection persists a `failed` source row

**Files:**
- Modify: `mobile/src/lib/supabase/capture.ts`
- Modify: `mobile/src/components/training/daily/CaptureReviewSheet.tsx`

- [ ] **Step 8.1: Add `markCaptureRejected`**

Append to `capture.ts` (near `saveCapture`). Today, closing the review sheet discards everything — the URL, the fetch, the extraction — and the original spec (§4) wanted the source kept as `failed` for retry. `saveCapture` already reclaims pending/failed rows, so a later re-capture of the same URL heals it.

```typescript
export interface RejectCaptureInput {
  userId: string;
  sourceUrl: string;
  platform: string;
  posterHandle: string | null;
  captionText: string | null;
  thumbnailUrl: string | null;
  rawExtraction: unknown;
}

/** The review sheet was dismissed without accepting: keep the source row as
 *  'failed' so the capture isn't lost (spec §4). Never downgrades a reviewed
 *  row — rejecting a duplicate of something already captured is a no-op. */
export async function markCaptureRejected(input: RejectCaptureInput): Promise<void> {
  try {
    const existing = await findExistingCapture(input.userId, input.sourceUrl);
    if (existing) {
      if (existing.extraction_status === "reviewed") return;
      const { error } = await supabase
        .from("captured_sources")
        .update({ extraction_status: "failed", raw_extraction: input.rawExtraction ?? null })
        .eq("id", existing.id);
      if (error) throw error;
      return;
    }
    const { error } = await supabase.from("captured_sources").insert({
      user_id: input.userId,
      platform: input.platform,
      source_url: input.sourceUrl,
      poster_handle: input.posterHandle,
      caption_text: input.captionText,
      thumbnail_url: input.thumbnailUrl,
      raw_extraction: input.rawExtraction ?? null,
      extraction_status: "failed",
    });
    if (error) throw error;
  } catch (e) {
    console.error("markCaptureRejected failed:", e); // best-effort; never blocks the close
  }
}
```

- [ ] **Step 8.2: Call it from the review sheet's close**

In `CaptureReviewSheet.tsx`: the sheet receives `payload` (`resolved`, `sourceUrl`, `rawExtraction`). In the handler for the explicit close (the X / onRequestClose path — NOT `onSaved`), fire-and-forget before `onClose()`:

```tsx
    if (payload) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        markCaptureRejected({
          userId: user.id,
          sourceUrl: payload.sourceUrl,
          platform: payload.resolved.platform,
          posterHandle: payload.resolved.posterHandle,
          captionText: payload.resolved.captionText,
          thumbnailUrl: payload.resolved.thumbnailUrl,
          rawExtraction: payload.rawExtraction,
        });
      });
    }
```

Read the sheet's actual close-handler structure and `ResolvedPost` field names first (`mobile/src/types/capture.ts`) and adapt field access; a save that already succeeded must not pass through this path (check the sheet's saved flag; the close handler after `onSaved` fires must skip the mark).

- [ ] **Step 8.3: Typecheck; commit**

```bash
cd mobile && npx tsc --noEmit && cd ..
git add mobile/src/lib/supabase/capture.ts mobile/src/components/training/daily/CaptureReviewSheet.tsx
git commit -m "feat(capture): rejecting a review keeps the source as failed, for retry"
```

---

### Task 9: Skill filter on the Exercises tab (TDD)

**Files:**
- Modify: `mobile/src/types/capture.ts`
- Modify: `mobile/src/lib/catalogFilter.ts`
- Test: `mobile/src/lib/__tests__/catalogFilter.test.ts`
- Modify: `mobile/src/lib/supabase/capture.ts` (fetchCatalog select, if needed)
- Modify: `mobile/src/components/training/daily/CatalogTab.tsx`

- [ ] **Step 9.1: Failing test**

First check whether `CatalogEntry` already carries `skillLevel` (look at the type in `types/capture.ts` and the `fetchCatalog` select at `capture.ts:417`). Add to `catalogFilter.test.ts`, using the file's existing entry factory extended with `skillLevel`:

```typescript
  it("filters by skill level, and null skill only ever matches no filter", () => {
    const entries = [
      entry({ name: "Pull-Up", skillLevel: "Intermediate" }),
      entry({ name: "Burpee", skillLevel: "Beginner" }),
      entry({ name: "Mystery", skillLevel: null }),
    ];
    const out = filterCatalog(entries, { ...noFilters, skill: "Beginner" });
    expect(out.map((e) => e.name)).toEqual(["Burpee"]);
    expect(filterCatalog(entries, noFilters)).toHaveLength(3);
  });
```

(match the factory/`noFilters` helper names actually in the test file). Run — expect FAIL (unknown property / no filtering).

- [ ] **Step 9.2: Implement**

- `types/capture.ts`: `CatalogFilters` gains `skill: string | null;` and `CatalogEntry` gains `skillLevel: string | null;` (if absent).
- `catalogFilter.ts`, in the filter chain:

```typescript
    if (f.skill && e.skillLevel !== f.skill) return false;
```

- `capture.ts` `fetchCatalog`: add `skill_level` to the select and `skillLevel: row.skill_level ?? null` to the mapped entry (only if absent today).
- `CatalogTab.tsx`: the filters state object gains `skill: null`, and add one rail after the existing ones:

```tsx
        {rail("Skill", "skill", ["Beginner", "Intermediate", "Advanced"])}
```

- [ ] **Step 9.3: Green, full gates; commit**

```bash
cd mobile && npx jest src/lib/__tests__/catalogFilter.test.ts && npx tsc --noEmit && cd ..
git add mobile/src/types/capture.ts mobile/src/lib/catalogFilter.ts mobile/src/lib/__tests__/catalogFilter.test.ts mobile/src/lib/supabase/capture.ts mobile/src/components/training/daily/CatalogTab.tsx
git commit -m "feat(daily): skill-level filter on the Exercises tab"
```

---

### Task 10: The extraction model sees the thumbnail

**Files:**
- Modify: `supabase/functions/capture-post/index.ts`
- Modify: `mobile/src/lib/supabase/capture.ts` (`extractPost`)
- Modify: `mobile/src/components/training/daily/CaptureSheet.tsx`

- [ ] **Step 10.1: Client passes the rehosted thumbnail**

`extractPost` (capture.ts:36): add `thumbnailUrl?: string | null` to its input interface and pass it through in the invoke body. `CaptureSheet.tsx` `runExtract`: add `thumbnailUrl: r.thumbnailUrl` to the `extractPost({...})` call (confirm the `ResolvedPost` field name in `types/capture.ts` — the resolve action returns `thumbnailUrl`).

- [ ] **Step 10.2: Edge function sends it to the model**

In `capture-post/index.ts`, the `extract` action currently sends `content: user` as a plain string. Change the user message to a content array when a thumbnail exists (spec §4 step 3: "model reads caption + thumbnail"; only app-owned storage URLs are ever forwarded):

```typescript
      const thumbnailUrl =
        typeof body.thumbnailUrl === 'string' && body.thumbnailUrl.startsWith('https://')
          ? body.thumbnailUrl
          : null;
      const userContent = thumbnailUrl
        ? [
            { type: 'text', text: user },
            { type: 'image_url', image_url: { url: thumbnailUrl } },
          ]
        : user;
```

and use `{ role: 'user', content: userContent }` in the extract call's messages. (Locate the extract action's own fetch — it is the block after `if (body.action === 'extract')`, not the classify block quoted at line ~340.)

- [ ] **Step 10.3: Deploy, typecheck, commit**

```bash
cp -r /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/supabase/functions/capture-post \
      /Users/brianwilson/code/fittracker/supabase/functions/
cd /Users/brianwilson/code/fittracker/mobile
npx supabase functions deploy capture-post
cd /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/mobile
npx tsc --noEmit
cd ..
git add supabase/functions/capture-post/index.ts mobile/src/lib/supabase/capture.ts mobile/src/components/training/daily/CaptureSheet.tsx
git commit -m "feat(capture): the extraction model sees the post's thumbnail"
```

(The deploy copies the function dir to the linked main checkout first, same pattern as migrations.)

---

### Task 11: The chapter card stops inventing reps

**Files:**
- Modify: `mobile/app/workout/[id].tsx` (~line 2115-2125, the UP NEXT preview)

- [ ] **Step 11.1: Use the creator's words**

The preview builds `rx: `${sets.length} × ${target_reps_min}`` — the invented-number class commit 658b56d removed from the logger proper. The daily template carries `raw_reps` on each exercise (set at template build, ~line 545). Change the rx expression so a creator's prescription wins:

```tsx
                    ? [{
                        name: getExercise(exerciseStates[s.exerciseIndex].exercise).name,
                        rx: (exerciseStates[s.exerciseIndex].exercise as any).raw_reps
                          ?? `${exerciseStates[s.exerciseIndex].sets.length} × ${
                               exerciseStates[s.exerciseIndex].exercise.target_reps_min}`,
                      }]
```

Read the actual expression first and keep its exact shape — the code above shows the substitution (raw_reps when present, the computed line otherwise); program-mode exercises have no `raw_reps`, so program previews are unchanged.

- [ ] **Step 11.2: Typecheck; commit**

```bash
cd mobile && npx tsc --noEmit && cd ..
git add "mobile/app/workout/[id].tsx"
git commit -m "fix(daily): the chapter preview shows the creator's reps, not invented ones"
```

---

### Task 12: iOS share extension → the existing capture pipeline

This is the invasive one: a config plugin and a NEW DEV BUILD. Everything before this task ships without it.

**Files:**
- Modify: `mobile/package.json` (expo-share-intent)
- Modify: `mobile/app.json`
- Modify: `mobile/app/_layout.tsx`
- Modify: `mobile/app/(tabs)/training/index.tsx`
- Modify: `mobile/src/components/training/daily/CaptureFab.tsx`
- Modify: `mobile/src/components/training/daily/CaptureSheet.tsx`

- [ ] **Step 12.1: Install (v5 line = Expo SDK 54)**

```bash
cd /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/mobile
npm install expo-share-intent@^5
```

- [ ] **Step 12.2: Plugin config**

In `app.json`, add to `expo.plugins` (URLs only — the pipeline consumes links, not media):

```json
      [
        "expo-share-intent",
        {
          "iosActivationRules": {
            "NSExtensionActivationSupportsWebURLWithMaxCount": 1,
            "NSExtensionActivationSupportsWebPageWithMaxCount": 1
          },
          "androidIntentFilters": ["text/*"]
        }
      ]
```

- [ ] **Step 12.3: Root layout routes the intent**

In `mobile/app/_layout.tsx` (inside the root component, after existing hooks — read the file first and place per its structure):

```tsx
import { useShareIntent } from "expo-share-intent";
// ...
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (!hasShareIntent) return;
    const url = shareIntent.webUrl ?? shareIntent.text ?? null;
    resetShareIntent();
    if (url) {
      router.push({ pathname: "/(tabs)/training", params: { shareUrl: url } });
    }
  }, [hasShareIntent]);
```

(use the file's existing `router` access — `useRouter()` or the exported `router` object — and confirm the training route path string against the existing navigation calls in the codebase.)

- [ ] **Step 12.4: Training screen → CaptureFab → CaptureSheet**

- `mobile/app/(tabs)/training/index.tsx`: read `shareUrl` via `useLocalSearchParams`, hand it to the Daily surface's `CaptureFab` as `initialUrl`, and clear it after handing off (`router.setParams({ shareUrl: undefined })`) so re-focusing the tab doesn't re-open the sheet. **Read the file first** — the Fab may be mounted per-tab inside `WorkoutsTab`/`CatalogTab`; if so, thread `initialUrl` to wherever the Daily-mode Fab mounts (one prop, one hop; do not duplicate the sheet).
- `CaptureFab.tsx`:

```tsx
interface CaptureFabProps {
  onSaved: () => void;
  /** A URL arriving from the iOS share sheet: open the capture sheet with it. */
  initialUrl?: string | null;
}

export function CaptureFab({ onSaved, initialUrl }: CaptureFabProps) {
  // ...existing state...
  useEffect(() => {
    if (initialUrl) setCaptureVisible(true);
  }, [initialUrl]);
  // pass through: <CaptureSheet visible={captureVisible} initialUrl={initialUrl ?? null} ... />
```

- `CaptureSheet.tsx`: add `initialUrl?: string | null` to props; when the sheet becomes visible with an `initialUrl`, prefill and immediately resolve — the same function the paste path calls (read the sheet for its resolve handler name; `phase` moves to `"resolving"`):

```tsx
  useEffect(() => {
    if (visible && initialUrl && phase === "url" && url === "") {
      setUrl(initialUrl);
      handleResolve(initialUrl); // the sheet's existing resolve entry point
    }
  }, [visible, initialUrl]);
```

From `resolvePost` onward, nothing changes — this is the whole point.

- [ ] **Step 12.5: Prebuild + NEW DEV BUILD (required from here on)**

**Callout: this step invalidates the existing dev client.** The config plugin adds a native share-extension target; every on-device step after this needs the rebuilt client. Known build quirks apply (pods need `LANG`, expo resolves simulator UDIDs via xctrace, dev cert renewed 2026-08-19).

```bash
cd /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/mobile
cp /Users/brianwilson/code/fittracker/mobile/.env .env   # gitignored; absent in the worktree
npx expo prebuild -p ios --clean
LANG=en_US.UTF-8 npx expo run:ios --no-bundler   # target the Task 13 simulator once it exists (see 13.1)
```

Expected: pod install succeeds; the Xcode build produces the app + ShareExtension target; no signing errors (dev cert is current).

- [ ] **Step 12.6: Typecheck, full suite; commit**

```bash
npx tsc --noEmit && npx jest
cd ..
git add mobile/package.json mobile/package-lock.json mobile/app.json mobile/app/_layout.tsx "mobile/app/(tabs)/training/index.tsx" mobile/src/components/training/daily/CaptureFab.tsx mobile/src/components/training/daily/CaptureSheet.tsx
git commit -m "feat(capture): iOS share extension feeds the existing capture pipeline"
```

(If `expo prebuild` generated an `ios/` directory that git doesn't ignore, do NOT stage it — check `.gitignore`; this repo has no committed `ios/` dir and that stays true.)

---

### Task 13: Full gates + end-to-end on-device verification

- [ ] **Step 13.1: Dedicated simulator + Metro on 8092**

```bash
xcrun simctl create "FitTracker-Phase3" "iPhone 16 Pro" 2>/dev/null || true
xcrun simctl boot "FitTracker-Phase3"
cd /Users/brianwilson/code/fittracker/.claude/worktrees/daily-training-phase-3-d30714/mobile
RCT_METRO_PORT=8092 npx expo start --dev-client --port 8092
```

(install the Task 12 dev build onto THIS simulator — `npx expo run:ios` with the device flag pointing at FitTracker-Phase3, or drag the built .app in via `xcrun simctl install`.)

- [ ] **Step 13.2: Quality gates**

```bash
npm test && npx tsc --noEmit && npm run lint
```

Expected: all suites green, zero TS errors, zero lint errors (hex warnings ignored).

- [ ] **Step 13.3: Walk the loop (screenshots at each numbered stop)**

1. **BFR block**: check in with ≥75 minutes, BFR flag on (Gym sheet toggle) → the composed day shows the sixth block titled "BFR finisher" with its two banded movements; planned minutes include it; it has no reroll affordance. Toggle the flag off, recompose (change gym or check-in) → block gone.
2. **Complete a session** (Start → walk at least one block, log a set → Finish) → debrief sheet appears; save it → the movement-rating sheet auto-follows, listing the day's performed movements.
3. **Rating → skill state**: rate one seeded-chain movement (e.g. Pull-Up) "Too easy", save. Verify the row landed:
   `node -e "...select from exercise_skill_state / movement_ratings..."` (consecutive_too_easy = 1).
4. **Promotion**: "Build another session" on the same day (or next day), complete a session containing the same movement, rate it "Too easy" again → the sheet shows "Pull-Up leveled up — try Wide Grip Pull Ups next time". Verify `current_level` bumped and streak reset.
5. **Ceiling**: with three movements rated up to intermediate, verify a workout tagged Advanced stays out of the main shortlist and one tagged Intermediate now appears (probe the compose or check the shortlist snapshot in `inputs_snapshot`).
6. **Rejection path**: capture a URL, let extraction finish, close the review sheet with X → `captured_sources` row exists with `extraction_status = 'failed'`; re-capture the same URL → flows normally (reclaim).
7. **Skill filter**: Exercises tab → Skill rail filters; "Beginner" shows only beginner movements.
8. **Thumbnail extraction**: capture a post whose caption is thin but whose image shows the movement — extraction still proposes sensibly (qualitative; confirm no errors in the function logs: `npx supabase functions logs capture-post` from the main checkout).
9. **Chapter preview**: in a live session, the between-blocks card shows `21-15-9`-style prescriptions verbatim where the creator wrote them.
10. **Share extension E2E**: on the simulator, open Safari → an Instagram post URL → share sheet → FitTracker → app opens with the capture sheet resolving that URL → accept → it lands in the catalog. (Safari's share sheet is the realistic sim path; a real device with the Instagram app is the gold path if available.)
11. **Program-mode regression**: open a normal program workout, log a set, finish — unchanged behavior.

- [ ] **Step 13.4: Stop and report**

Report to Brian: gates output, the walkthrough results with screenshots, deviations list. **Do not merge; do not push.** Brian decides merges.

---

## Self-review notes (already applied)

- Spec §7 items all covered or explicitly reconciled away (serving-whole = shipped; exercise-level engine = deferred by the newer spec).
- The `movement_ratings` table is new schema not in the original spec — it exists so "is this session rated?" is answerable and the audit trail survives; the spec's `exercise_skill_state` remains the recommender-facing state.
- Promotion demotion rule (one too-hard demotes) is an interpretation of the spec's "promote/demote from ratings" — flagged in the plan summary for Brian's sign-off.
- The BFR block being rules-appended (invisible to the AI) is a design decision consistent with "rules keep the numbers" — also flagged in the summary.
- Type ripple from widening `BlockRole` is called out in Task 7 and caught by tsc; the executor fixes exhaustiveness fallout in the same commit.
