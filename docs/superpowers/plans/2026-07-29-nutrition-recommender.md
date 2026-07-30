# Nutrition OS Phase 3 — Recommender + "Eat Next" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic, explainable "Eat Next" recommender — pure engine + Home card + in-Meals suggestions + ramp banner + pace-aware nudge family — per `docs/superpowers/specs/2026-07-29-nutrition-recommender-design.md`.

**Architecture:** One pure lib (`eatNext.ts`) does all ranking and reason generation; one hook (`useEatNext`) assembles its input from existing fetchers (`fetchMealLibrary`, `sumNutrition`, `computeMealPace`, `computeBrianScore`, the workout-today query); surfaces and the nudge scheduler are thin renderers of the same result. One small migration (profiles column + dropping the two dead aggregation views).

**Tech Stack:** Expo SDK 54 / RN 0.81.5, TypeScript strict, Supabase (Postgres 17), Jest + ts-jest (pure TS libs only), expo-notifications.

**Branch:** `nutrition-os/recommender` (exists; spec committed).

---

## ⛔ Preconditions — read before Task 1

1. **SATISFIED 2026-07-29: Phase 2 is merged to `main` and applied to prod** (main @ `685417c` and later). The old `nutrition-os/recommender` doc branch was folded into `main` and deleted — execution starts by **creating a fresh `nutrition-os/recommender` branch from current `main`**. Run `cd mobile && npm test` first and confirm the Phase 1/2 baseline (5 suites, 107 tests) is green before Task 1.
2. **RECONCILED 2026-07-29 against Phase 2's final execution amendments** (all 16 tasks) and the landed files. Verified matching: `fetchMealLibrary`/`MealLibraryData` (incl. `conceptIdsBySavedFoodId`, `conceptsById`, `targetCalories`), `computeMealTotals` (now rounds 2 dp), `MealLibraryModal` props (`visible/savedFoods/todayDate/onClose/onLogged`) and its `:69` visibility effect (Task 10's edit target), `libraryVisible` state name in MealsScreen, `mealScore.ts` exports (`RAW_MAX`, `COMPONENT_MAX`, `SCORE_BAND_CORE_MIN/MID_MIN`, 2 dp totals / 1 dp `raw` rounding). Changes folded into this plan from the amendments: **ranking uses `score.raw`, not the rounded `score`** (Task 1 — Phase 2's banding analysis: all 10 seeds land 84–95 on /100, `raw` discriminates strictly better; UI still displays `score`); note that `consumeOneInventoryUnit`/`refundOneInventoryUnit` now return `Promise<boolean>` (this plan never calls them — the engine path uses `logMeal`'s RPC flow). Known Phase 2 follow-up NOT in this plan's scope: `findInventoryMatchByBarcode` still reads the legacy `quantity` column (Phase 4 territory).
3. **A green `tsc --noEmit` proves nothing about DB column names** — the supabase client is untyped (`createClient` without a `Database` generic; see Phase 2 amendment, Task 1). Verify column usage by grep against migrations and by runtime testing.
4. House rules (identical to Phase 2): migrations idempotent, `public.`-qualified, never applied by implementers (Task 10 is the owner gate); `StyleSheet.create`; `useSafeAreaInsets`; alert-on-failure; commit per task; record deviations in "⚠️ Execution amendments" at the bottom of this file.

## File structure

| File | Responsibility |
|---|---|
| `mobile/src/lib/eatNext.ts` (create) + `__tests__/eatNext.test.ts` | The engine: contexts, filters, ranking, reasons, nudge decision |
| `mobile/src/lib/__tests__/mealPace.test.ts` (create) | Missing suite for the existing pace lib (audit R2) |
| `supabase/migrations/20260729110000_recommender_profile_and_view_cleanup.sql` (create) | `profiles.eat_nudges_enabled`; drop dead views |
| `mobile/src/hooks/useEatNext.ts` (create) | Input assembly; single source for all surfaces |
| `mobile/src/components/EatNextHomeCard.tsx` (create) | Home card |
| `mobile/src/components/RampHomeBanner.tsx` (create) | Ramp advance banner |
| `mobile/app/(tabs)/home.tsx` (modify :119-131) | Mount banner + card |
| `mobile/app/(tabs)/profile.tsx` (modify) | `?modal=nutrition` deep link |
| `mobile/src/components/track/meals/EatNextRow.tsx` (create) | Suggested-now chips |
| `mobile/src/components/track/MealsScreen.tsx` (modify ~:1407) | Mount row; `suggestMealId` param; nudge resync on log |
| `mobile/src/components/track/meals/library/MealLibraryModal.tsx` (modify) | Optional `initialMealId` prop |
| `mobile/src/services/eatNudgeService.ts` (create) | "eat-nudge" family, cancel-and-resync |
| `mobile/src/services/notificationService.ts` (modify :282-295) | Family-scoped reschedule (landmine fix) |
| `mobile/src/components/profile/NotificationsScreen.tsx` (modify) | Eat-nudge toggle + test fire |

Reference reading per task: the spec; `mobile/src/lib/mealPace.ts` (pace semantics), `mobile/src/lib/mealScore.ts` + `mobile/src/lib/rampProgress.ts` (pure-lib house style), `mobile/src/components/MealsHomeCard.tsx` + `TodaysWorkoutCard.tsx` (card pattern), `mobile/src/services/mealReminderService.ts` (family pattern), `mobile/src/lib/supabase/mealLibrary.ts` (Phase 2 query module, post-merge).

---

### Task 1: Engine — contexts, filters, ranking (TDD)

**Files:**
- Create: `mobile/src/lib/eatNext.ts`
- Test: `mobile/src/lib/__tests__/eatNext.test.ts`

Spec §5 is the contract. The nudge decision is Task 2 — this task returns `nudge: null` unconditionally and Task 2 replaces that.

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/eatNext.test.ts
import {
  recommendEatNext,
  EMERGENCY_MIN_GAP_CAL,
  PREP_HARD_CAP_FACTOR,
  type EatNextInput,
  type ScoredMeal,
} from "../eatNext";
import { EMPTY_TOTALS } from "../mealMacros";

// ── fixtures ───────────────────────────────────────────────────────────────
// Minutes: window 08:00–23:00 (480–1380); meals 08:00/12:00/18:00.
const BASE: Omit<EatNextInput, "meals"> = {
  nowMinutes: 13 * 60, // 13:00
  windowStartMinutes: 8 * 60,
  windowEndMinutes: 23 * 60,
  mealTimesMinutes: { breakfast: 8 * 60, lunch: 12 * 60, dinner: 18 * 60 },
  dayTotals: { ...EMPTY_TOTALS, calories: 900, protein: 60 },
  goals: {
    calories: 2300, protein: 160, carbs: null, sodium_mg: null,
    fats: null, sugars: null, fiber_g: null,
  },
  caloriePace: { status: "on_pace" },
  proteinPace: { status: "on_pace" },
  maxPrepMinutes: 5,
  workoutCompletedAtMinutes: null,
  nudgesEnabled: false,
};

let nextId = 0;
function scored(over: {
  name?: string;
  category?: string;
  role?: string | null;
  prep?: number;
  calories?: number;
  protein?: number;
  score?: number;
  containsNever?: boolean;
  approved?: boolean;
}): ScoredMeal {
  const id = `m${nextId++}`;
  const calories = over.calories ?? 600;
  const protein = over.protein ?? 35;
  return {
    meal: {
      id,
      user_id: "u",
      name: over.name ?? id,
      slug: id,
      category: (over.category ?? "lunch") as never,
      role: (over.role ?? null) as never,
      default_meal_type: null,
      prep_minutes: over.prep ?? 5,
      taste_override: null,
      notes: null,
      created_at: "",
      updated_at: "",
      items: [],
    } as never,
    totals: {
      calories, protein, carbs: 0, fats: 0, sugars: 0, sodium_mg: 0, fiber_g: 0,
    },
    score: {
      taste: 22, convenience: 20, protein: 12, eoe: 15, calories: 10,
      // Ranking reads `raw` (Phase 2 amendment: the /100 score's rounding
      // creates ties raw doesn't have); tests drive both with one knob.
      raw: over.score ?? 83, score: over.score ?? 83,
      tasteUnknown: false,
      containsNever: over.containsNever ?? false,
      approved: over.approved ?? true,
      totalCalories: calories, totalProtein: protein,
    },
  };
}
const input = (over: Partial<EatNextInput>, meals: ScoredMeal[]): EatNextInput =>
  ({ ...BASE, ...over, meals });

beforeEach(() => { nextId = 0; });

// ── terminal contexts ──────────────────────────────────────────────────────
describe("terminal contexts", () => {
  it("after_window: nothing recommended past windowEnd", () => {
    const r = recommendEatNext(input({ nowMinutes: 23 * 60 + 10 }, [scored({})]));
    expect(r.context).toBe("after_window");
    expect(r.recommendations).toHaveLength(0);
  });

  it("goal_hit with protein satisfied: terminal, no recommendations", () => {
    const r = recommendEatNext(
      input(
        {
          dayTotals: { ...EMPTY_TOTALS, calories: 2350, protein: 158 },
          caloriePace: { status: "goal_hit" },
        },
        [scored({})],
      ),
    );
    expect(r.context).toBe("goal_hit");
    expect(r.recommendations).toHaveLength(0);
    expect(r.message).toMatch(/target hit/i);
  });

  it("goal_hit but protein ≥15g short: one high-protein bridge/booster under 300 cal", () => {
    const bridgeSmall = scored({ role: "bridge", calories: 290, protein: 25 });
    const boosterBig = scored({ role: "calorie_booster", calories: 690, protein: 27 });
    const plain = scored({ calories: 250, protein: 30 });
    const r = recommendEatNext(
      input(
        { dayTotals: { ...EMPTY_TOTALS, calories: 2400, protein: 140 } },
        [boosterBig, plain, bridgeSmall],
      ),
    );
    expect(r.context).toBe("goal_hit");
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0].mealId).toBe(bridgeSmall.meal.id);
    expect(r.recommendations[0].reasons.join(" ")).toMatch(/protein/i);
  });

  it("goal_hit protein-short with NO qualifying meal stays terminal (no fall-through)", () => {
    const r = recommendEatNext(
      input(
        { dayTotals: { ...EMPTY_TOTALS, calories: 2400, protein: 140 } },
        [scored({ calories: 600 })], // too big to qualify
      ),
    );
    expect(r.context).toBe("goal_hit");
    expect(r.recommendations).toHaveLength(0);
  });
});

// ── post-workout ───────────────────────────────────────────────────────────
describe("post_workout", () => {
  const trained = { workoutCompletedAtMinutes: 12 * 60 }; // 12:00, now 13:00
  it("prefers role=post_workout, then ≥25g protein meals", () => {
    const pw = scored({ role: "post_workout", score: 70 });
    const highP = scored({ protein: 40, score: 90 });
    const lowP = scored({ protein: 10, score: 99 });
    const r = recommendEatNext(input(trained, [lowP, highP, pw]));
    expect(r.context).toBe("post_workout");
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      pw.meal.id, highP.meal.id,
    ]); // lowP excluded entirely
  });
  it("window closes 180 min after completion", () => {
    const r = recommendEatNext(
      input({ workoutCompletedAtMinutes: 13 * 60 - 181 }, [scored({})]),
    );
    expect(r.context).not.toBe("post_workout");
  });
  it("falls through when no candidate meal qualifies", () => {
    const r = recommendEatNext(input(trained, [scored({ protein: 5 })]));
    expect(r.context).toBe("next_meal");
  });
});

// ── emergency / catch_up ───────────────────────────────────────────────────
describe("emergency and catch_up", () => {
  const behind = (catchUpAmount: number): Partial<EatNextInput> => ({
    caloriePace: { status: "behind", delta: catchUpAmount, catchUpAmount },
  });

  it("emergency: past dinner + behind ≥400 → emergency/booster meals, calories descending", () => {
    const small = scored({ category: "emergency", calories: 400 });
    const big = scored({ category: "emergency", calories: 700 });
    const booster = scored({ role: "calorie_booster", category: "shake", calories: 750 });
    const r = recommendEatNext(
      input({ nowMinutes: 20 * 60, ...behind(600) }, [small, booster, big]),
    );
    expect(r.context).toBe("emergency");
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      booster.meal.id, big.meal.id, small.meal.id,
    ]);
  });

  it(`emergency requires gap ≥ EMERGENCY_MIN_GAP_CAL (${EMERGENCY_MIN_GAP_CAL})`, () => {
    // gap 399 misses the emergency bar; 450 cal is within ±35% of 399, so
    // the same meal is caught by catch_up instead.
    const r = recommendEatNext(
      input({ nowMinutes: 20 * 60, ...behind(399) }, [
        scored({ category: "emergency", calories: 450 }),
      ]),
    );
    expect(r.context).toBe("catch_up");
  });

  it("catch_up: candidates within ±35% of catchUpAmount, ranked by score", () => {
    const fits = scored({ calories: 500, score: 80 });
    const fitsBetter = scored({ calories: 450, score: 95 });
    const tooBig = scored({ calories: 900 });
    const tooSmall = scored({ calories: 200 });
    const r = recommendEatNext(input(behind(500), [fits, tooBig, tooSmall, fitsBetter]));
    expect(r.context).toBe("catch_up");
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      fitsBetter.meal.id, fits.meal.id,
    ]);
    expect(r.recommendations[0].reasons.join(" ")).toMatch(/500 cal/);
  });

  it("catch_up with no meal in band falls through to next_meal", () => {
    const r = recommendEatNext(input(behind(500), [scored({ calories: 2000, category: "dinner" })]));
    expect(r.context).toBe("next_meal");
  });
});

// ── next_meal ──────────────────────────────────────────────────────────────
describe("next_meal", () => {
  it("13:00 → next slot dinner; dinner-category meals win", () => {
    const dinner = scored({ category: "dinner" });
    const breakfast = scored({ category: "breakfast" });
    const r = recommendEatNext(input({ nowMinutes: 13 * 60 + 1 }, [breakfast, dinner]));
    expect(r.context).toBe("next_meal");
    expect(r.recommendations[0].mealId).toBe(dinner.meal.id);
  });
  it("≥120 min before next meal prefers bridge/snack", () => {
    // 13:00, dinner 18:00 → 300 min out
    const bridge = scored({ role: "bridge", category: "snack", calories: 300 });
    const dinner = scored({ category: "dinner", score: 99 });
    const r = recommendEatNext(input({}, [dinner, bridge]));
    expect(r.recommendations[0].mealId).toBe(bridge.meal.id);
  });
  it("after dinner time (on pace) → snack slot; shakes count as snacks; emergency never surfaces", () => {
    const shake = scored({ category: "shake" });
    const emergency = scored({ category: "emergency", score: 100 });
    const r = recommendEatNext(input({ nowMinutes: 19 * 60 }, [emergency, shake]));
    expect(r.context).toBe("next_meal");
    expect(r.recommendations.map((x) => x.mealId)).toEqual([shake.meal.id]);
  });
  it("before window behaves as next_meal for breakfast", () => {
    const b = scored({ category: "breakfast" });
    const r = recommendEatNext(
      input({ nowMinutes: 7 * 60, caloriePace: { status: "before_window" } }, [b]),
    );
    expect(r.context).toBe("next_meal");
    expect(r.recommendations[0].mealId).toBe(b.meal.id);
  });
});

// ── filters + ranking ──────────────────────────────────────────────────────
describe("filters and ranking", () => {
  it("containsNever never surfaces in any context", () => {
    const never = scored({ category: "dinner", score: 100, containsNever: true });
    const ok = scored({ category: "dinner", score: 50 });
    const r = recommendEatNext(input({}, [never, ok]));
    expect(r.recommendations.map((x) => x.mealId)).toEqual([ok.meal.id]);
  });

  it(`prep > maxPrep×${PREP_HARD_CAP_FACTOR} never surfaces; (maxPrep, ×${PREP_HARD_CAP_FACTOR}] surfaces with a budget reason`, () => {
    const way = scored({ category: "dinner", prep: 11 });   // > 10 → gone
    const over = scored({ category: "dinner", prep: 8 });    // (5,10] → reason
    const fine = scored({ category: "dinner", prep: 4 });
    const r = recommendEatNext(input({}, [way, over, fine]));
    const ids = r.recommendations.map((x) => x.mealId);
    expect(ids).not.toContain(way.meal.id);
    expect(ids).toContain(over.meal.id);
    const overRec = r.recommendations.find((x) => x.mealId === over.meal.id)!;
    expect(overRec.reasons.join(" ")).toMatch(/prep budget/i);
  });

  it("deterministic order: raw desc, then prep asc, then name asc; top 3 cap", () => {
    const a = scored({ name: "A", category: "dinner", score: 90, prep: 5 });
    const b = scored({ name: "B", category: "dinner", score: 90, prep: 3 });
    const c = scored({ name: "C", category: "dinner", score: 95 });
    const d = scored({ name: "D", category: "dinner", score: 90, prep: 5 });
    const r1 = recommendEatNext(input({}, [a, d, c, b]));
    const r2 = recommendEatNext(input({}, [d, b, a, c]));
    expect(r1.recommendations.map((x) => x.mealId)).toEqual([
      c.meal.id, b.meal.id, a.meal.id,
    ]);
    expect(r2.recommendations).toEqual(r1.recommendations);
  });

  it("empty library → next_meal with empty recommendations and a message", () => {
    const r = recommendEatNext(input({}, []));
    expect(r.recommendations).toHaveLength(0);
    expect(r.message).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd mobile && npm test -- eatNext
```

Expected: FAIL — cannot find module `../eatNext`.

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/eatNext.ts
// The "Eat Next" recommender (Nutrition OS Phase 3). Pure, deterministic,
// no I/O — same input, same output, always. Reasons are generated by the
// same predicates that rank, so the UI can never claim a reason the ranking
// didn't use. Spec: docs/superpowers/specs/2026-07-29-nutrition-recommender-design.md §5.
//
// Policy constants are code, not schema (rampProgress/mealScore stance).
import type { MealPaceState } from "./mealPace";
import type { BrianScoreResult } from "./mealScore";
import type { MacroGoals, MacroTotals } from "./mealMacros";
import type { MealTotals, MealWithItems, MealRole } from "@/src/types/meal-library";

export const POST_WORKOUT_WINDOW_MIN = 180;
export const EMERGENCY_MIN_GAP_CAL = 400;
export const CATCH_UP_BAND = 0.35;
export const NUDGE_MIN_GAP_CAL = 250;
export const NUDGE_MILESTONE_OFFSET_MIN = 20;
export const EMERGENCY_CHECK_BEFORE_END_MIN = 90;
export const PROTEIN_SHORT_G = 15;
export const PROTEIN_SHORT_MAX_CAL = 300;
export const POST_WORKOUT_MIN_PROTEIN_G = 25;
export const BRIDGE_PREFER_GAP_MIN = 120;
export const PREP_HARD_CAP_FACTOR = 2;
const TOP_N = 3;

export type EatNextContext =
  | "after_window"
  | "goal_hit"
  | "post_workout"
  | "emergency"
  | "catch_up"
  | "next_meal";

export interface ScoredMeal {
  meal: MealWithItems;
  totals: MealTotals;
  score: BrianScoreResult;
}

export interface EatNextInput {
  nowMinutes: number;
  windowStartMinutes: number;
  windowEndMinutes: number;
  mealTimesMinutes: { breakfast: number; lunch: number; dinner: number };
  dayTotals: MacroTotals;
  goals: MacroGoals;
  caloriePace: MealPaceState;
  proteinPace: MealPaceState;
  meals: ScoredMeal[];
  maxPrepMinutes: number;
  workoutCompletedAtMinutes: number | null;
  nudgesEnabled: boolean;
}

export interface EatNextRecommendation {
  mealId: string;
  name: string;
  reasons: string[];
}

export interface EatNextNudge {
  fireAtMinutes: number;
  title: string;
  body: string;
}

export interface EatNextResult {
  context: EatNextContext;
  message: string | null;
  recommendations: EatNextRecommendation[];
  nudge: EatNextNudge | null;
}

interface Candidate extends ScoredMeal {
  extraReasons: string[];
  roleRank: number; // 0 = preferred role, 1 = otherwise (lower sorts first)
}

function baseEligible(m: ScoredMeal, maxPrepMinutes: number): boolean {
  if (m.score.containsNever) return false;
  return m.meal.prep_minutes <= maxPrepMinutes * PREP_HARD_CAP_FACTOR;
}

function prepReason(m: ScoredMeal, maxPrepMinutes: number): string[] {
  return m.meal.prep_minutes > maxPrepMinutes
    ? [`${m.meal.prep_minutes} min — over your prep budget`]
    : [];
}

function rank(cands: Candidate[]): Candidate[] {
  return [...cands].sort(
    (a, b) =>
      a.roleRank - b.roleRank ||
      // Rank on the un-renormalized component sum: Phase 2's banding analysis
      // found the rounded /100 score barely discriminates (all seeds 84-95);
      // raw is strictly finer and ties less. UI still DISPLAYS score/100.
      b.score.raw - a.score.raw ||
      a.meal.prep_minutes - b.meal.prep_minutes ||
      a.meal.name.localeCompare(b.meal.name),
  );
}

function toRecs(cands: Candidate[], contextReason: (c: Candidate) => string[]): EatNextRecommendation[] {
  return cands.slice(0, TOP_N).map((c) => ({
    mealId: c.meal.id,
    name: c.meal.name,
    reasons: [...contextReason(c), ...c.extraReasons],
  }));
}

function candidate(
  m: ScoredMeal,
  preferredRoles: ReadonlyArray<MealRole>,
  maxPrepMinutes: number,
): Candidate {
  return {
    ...m,
    extraReasons: prepReason(m, maxPrepMinutes),
    roleRank: m.meal.role !== null && preferredRoles.includes(m.meal.role) ? 0 : 1,
  };
}

/** Next main-meal slot strictly after now, else snack (mealPace's milestone rule). */
function nextSlot(
  nowMinutes: number,
  mealTimesMinutes: EatNextInput["mealTimesMinutes"],
): { slot: "breakfast" | "lunch" | "dinner" | "snack"; atMinutes: number | null } {
  const entries = [
    { slot: "breakfast" as const, atMinutes: mealTimesMinutes.breakfast },
    { slot: "lunch" as const, atMinutes: mealTimesMinutes.lunch },
    { slot: "dinner" as const, atMinutes: mealTimesMinutes.dinner },
  ]
    .filter((e) => e.atMinutes > nowMinutes)
    .sort((a, b) => a.atMinutes - b.atMinutes);
  return entries[0] ?? { slot: "snack", atMinutes: null };
}

export function recommendEatNext(input: EatNextInput): EatNextResult {
  const {
    nowMinutes, windowEndMinutes, mealTimesMinutes, dayTotals, goals,
    caloriePace, meals, maxPrepMinutes, workoutCompletedAtMinutes,
  } = input;

  const eligible = meals.filter((m) => baseEligible(m, maxPrepMinutes));
  const nudge = computeNudge(input);

  // 1. after_window — terminal.
  if (nowMinutes > windowEndMinutes) {
    return { context: "after_window", message: "Eating window closed for today.", recommendations: [], nudge: null };
  }

  // 2. goal_hit — terminal (protein-short exception recommends within it).
  const calorieGoal = goals.calories;
  if (calorieGoal != null && calorieGoal > 0 && dayTotals.calories >= calorieGoal) {
    const proteinGoal = goals.protein;
    const proteinShort =
      proteinGoal != null && proteinGoal - dayTotals.protein >= PROTEIN_SHORT_G;
    if (proteinShort) {
      const q = eligible
        .filter(
          (m) =>
            (m.meal.role === "bridge" || m.meal.role === "calorie_booster") &&
            m.totals.calories < PROTEIN_SHORT_MAX_CAL,
        )
        .sort(
          (a, b) =>
            b.totals.protein - a.totals.protein ||
            a.meal.name.localeCompare(b.meal.name),
        );
      if (q.length > 0) {
        const top = q[0];
        const gap = Math.round((proteinGoal ?? 0) - dayTotals.protein);
        return {
          context: "goal_hit",
          message: "Calorie target hit — protein still short.",
          recommendations: [{
            mealId: top.meal.id,
            name: top.meal.name,
            reasons: [
              `protein short by ~${gap} g`,
              `${Math.round(top.totals.protein)} g protein in ${Math.round(top.totals.calories)} cal`,
              ...prepReason(top, maxPrepMinutes),
            ],
          }],
          nudge: null,
        };
      }
    }
    return { context: "goal_hit", message: "Target hit — nothing needed.", recommendations: [], nudge: null };
  }

  // 3. post_workout — falls through when empty.
  if (
    workoutCompletedAtMinutes !== null &&
    nowMinutes - workoutCompletedAtMinutes >= 0 &&
    nowMinutes - workoutCompletedAtMinutes <= POST_WORKOUT_WINDOW_MIN
  ) {
    const cands = eligible
      .filter(
        (m) =>
          m.meal.role === "post_workout" ||
          m.totals.protein >= POST_WORKOUT_MIN_PROTEIN_G,
      )
      .map((m) => candidate(m, ["post_workout"], maxPrepMinutes));
    if (cands.length > 0) {
      return {
        context: "post_workout",
        message: null,
        recommendations: toRecs(rank(cands), (c) => [
          c.meal.role === "post_workout"
            ? "post-workout meal"
            : `post-workout — ${Math.round(c.totals.protein)} g protein`,
        ]),
        nudge,
      };
    }
  }

  const behind = caloriePace.status === "behind";
  const gap = behind ? caloriePace.catchUpAmount ?? 0 : 0;

  // 4. emergency — falls through when empty.
  if (behind && nowMinutes > mealTimesMinutes.dinner && gap >= EMERGENCY_MIN_GAP_CAL) {
    const cands = eligible
      .filter(
        (m) =>
          m.meal.category === "emergency" ||
          m.meal.role === "emergency_catchup" ||
          m.meal.role === "calorie_booster",
      )
      .map((m) => candidate(m, ["emergency_catchup", "calorie_booster"], maxPrepMinutes))
      // Emergency ranks by rescue size, not score (spec §5.3.4).
      .sort(
        (a, b) =>
          b.totals.calories - a.totals.calories ||
          a.meal.name.localeCompare(b.meal.name),
      );
    if (cands.length > 0) {
      return {
        context: "emergency",
        message: `~${gap} cal to go before day's end`,
        recommendations: toRecs(cands, (c) => [
          `~${gap} cal to go — ${Math.round(c.totals.calories)} cal, ${c.meal.prep_minutes} min prep`,
        ]),
        nudge,
      };
    }
  }

  // 5. catch_up — falls through when empty.
  if (behind && gap > 0) {
    const cands = eligible
      .filter((m) => Math.abs(m.totals.calories - gap) <= gap * CATCH_UP_BAND)
      .map((m) => candidate(m, ["bridge"], maxPrepMinutes));
    if (cands.length > 0) {
      return {
        context: "catch_up",
        message: `${gap} cal behind pace`,
        recommendations: toRecs(rank(cands), (c) => [
          `closes the ~${gap} cal gap (${Math.round(c.totals.calories)} cal, ${c.meal.prep_minutes} min)`,
        ]),
        nudge,
      };
    }
  }

  // 6. next_meal — default.
  const { slot, atMinutes } = nextSlot(nowMinutes, mealTimesMinutes);
  const slotCategories: ReadonlyArray<string> =
    slot === "snack" ? ["snack", "shake"] : [slot];
  const farFromMeal =
    atMinutes !== null && atMinutes - nowMinutes >= BRIDGE_PREFER_GAP_MIN;
  const preferredRoles: ReadonlyArray<MealRole> = farFromMeal ? ["bridge"] : [];
  const pool = farFromMeal
    ? eligible.filter(
        (m) =>
          slotCategories.includes(m.meal.category) ||
          m.meal.role === "bridge" ||
          m.meal.category === "snack",
      )
    : eligible.filter((m) => slotCategories.includes(m.meal.category));
  const cands = pool.map((m) => candidate(m, preferredRoles, maxPrepMinutes));
  return {
    context: "next_meal",
    message:
      cands.length === 0
        ? meals.length === 0
          ? "No meals in your library yet."
          : `Nothing in the library fits ${slot} right now.`
        : null,
    recommendations: toRecs(rank(cands), () => [
      slot === "snack" ? "between meals" : `next: ${slot}`,
    ]),
    nudge,
  };
}

// Task 2 replaces this stub with the real decision (spec §5.6).
function computeNudge(_input: EatNextInput): EatNextNudge | null {
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd mobile && npm test -- eatNext
```

Expected: PASS. Also `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/eatNext.ts mobile/src/lib/__tests__/eatNext.test.ts
git commit -m "feat(nutrition-os): Eat Next engine — contexts, filters, ranking"
```

---

### Task 2: Engine — nudge decision (TDD)

> ⚠️ **Before transcribing this task's code, read the Task 1 amendment (second round) at the bottom of this file.** Two required deviations apply here: `computeNudge` must call the existing `calorieGoalHit(goals, dayTotals)` helper instead of re-inlining the goal-hit predicate below, and its docstring's claim that the nudge references the top recommendation is false as drafted.

**Files:**
- Modify: `mobile/src/lib/eatNext.ts` (replace the `computeNudge` stub)
- Test: `mobile/src/lib/__tests__/eatNext.test.ts` (append)

Spec §5.6: nudge only when enabled + behind ≥250 cal; fire at next milestone + 20 min, else `windowEnd − 90`; strictly in the future, never past `windowEnd`; body carries gap + top recommendation.

- [ ] **Step 1: Append the failing tests**

```ts
// append to mobile/src/lib/__tests__/eatNext.test.ts
import {
  NUDGE_MIN_GAP_CAL,
  NUDGE_MILESTONE_OFFSET_MIN,
  EMERGENCY_CHECK_BEFORE_END_MIN,
} from "../eatNext";

describe("nudge decision", () => {
  const behindBy = (catchUpAmount: number): Partial<EatNextInput> => ({
    nudgesEnabled: true,
    caloriePace: { status: "behind", delta: catchUpAmount, catchUpAmount },
  });
  const meal = () => scored({ category: "dinner", calories: 500 });

  it("fires at next milestone + offset with gap and top rec in the body", () => {
    // now 13:00 → next milestone dinner 18:00 → fire 18:20
    const m = meal();
    const r = recommendEatNext(input(behindBy(500), [m]));
    expect(r.nudge).not.toBeNull();
    expect(r.nudge!.fireAtMinutes).toBe(18 * 60 + NUDGE_MILESTONE_OFFSET_MIN);
    expect(r.nudge!.body).toMatch(/500 cal/);
    expect(r.nudge!.body).toContain(m.meal.name);
  });

  it("no meal time remaining → windowEnd − 90", () => {
    const r = recommendEatNext(
      input({ ...behindBy(600), nowMinutes: 19 * 60 }, [meal()]),
    );
    expect(r.nudge!.fireAtMinutes).toBe(23 * 60 - EMERGENCY_CHECK_BEFORE_END_MIN);
  });

  it("computed time already past → now + offset", () => {
    // 22:00: windowEnd−90 = 21:30 is past → 22:20
    const r = recommendEatNext(
      input({ ...behindBy(600), nowMinutes: 22 * 60 }, [meal()]),
    );
    expect(r.nudge!.fireAtMinutes).toBe(22 * 60 + NUDGE_MILESTONE_OFFSET_MIN);
  });

  it("even now + offset exceeds windowEnd → null", () => {
    const r = recommendEatNext(
      input({ ...behindBy(600), nowMinutes: 22 * 60 + 50 }, [meal()]),
    );
    expect(r.nudge).toBeNull();
  });

  it.each([
    ["disabled", { ...behindBy(600), nudgesEnabled: false }],
    [`gap below ${NUDGE_MIN_GAP_CAL}`, behindBy(NUDGE_MIN_GAP_CAL - 1)],
    ["on pace", { nudgesEnabled: true }],
    [
      "goal hit",
      {
        nudgesEnabled: true,
        dayTotals: { ...EMPTY_TOTALS, calories: 2400, protein: 170 },
      },
    ],
  ])("no nudge when %s", (_label, over) => {
    const r = recommendEatNext(input(over as Partial<EatNextInput>, [meal()]));
    expect(r.nudge).toBeNull();
  });

  it("nudge fires even when the surfaced context is post_workout (independent decisions)", () => {
    const r = recommendEatNext(
      input({ ...behindBy(500), workoutCompletedAtMinutes: 12 * 60 }, [
        scored({ role: "post_workout", calories: 500 }),
      ]),
    );
    expect(r.context).toBe("post_workout");
    expect(r.nudge).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd mobile && npm test -- eatNext
```

Expected: the new `nudge decision` tests FAIL (stub returns null / lacks body).

- [ ] **Step 3: Replace the stub**

```ts
// replaces the computeNudge stub in mobile/src/lib/eatNext.ts
/**
 * Spec §5.6. Decided here, scheduled by eatNudgeService — the engine never
 * touches expo-notifications. The nudge references the top recommendation
 * the SAME result computes, so message and ranking cannot disagree.
 */
function computeNudge(input: EatNextInput): EatNextNudge | null {
  const {
    nowMinutes, windowEndMinutes, mealTimesMinutes, dayTotals, goals,
    caloriePace, meals, maxPrepMinutes, nudgesEnabled,
  } = input;
  if (!nudgesEnabled) return null;
  if (nowMinutes > windowEndMinutes) return null;
  const calorieGoal = goals.calories;
  if (calorieGoal != null && calorieGoal > 0 && dayTotals.calories >= calorieGoal) {
    return null;
  }
  if (caloriePace.status !== "behind") return null;
  const gap = caloriePace.catchUpAmount ?? 0;
  if (gap < NUDGE_MIN_GAP_CAL) return null;

  const { atMinutes } = nextSlot(nowMinutes, mealTimesMinutes);
  let fireAt =
    atMinutes !== null
      ? atMinutes + NUDGE_MILESTONE_OFFSET_MIN
      : windowEndMinutes - EMERGENCY_CHECK_BEFORE_END_MIN;
  if (fireAt <= nowMinutes) fireAt = nowMinutes + NUDGE_MILESTONE_OFFSET_MIN;
  if (fireAt > windowEndMinutes) return null;

  // Best catch-up candidate for the body: same eligibility + ranking rules.
  const eligible = meals.filter((m) => baseEligible(m, maxPrepMinutes));
  const inBand = rank(
    eligible
      .filter((m) => Math.abs(m.totals.calories - gap) <= gap * CATCH_UP_BAND)
      .map((m) => candidate(m, ["bridge"], maxPrepMinutes)),
  );
  const pick = inBand[0] ?? rank(eligible.map((m) => candidate(m, [], maxPrepMinutes)))[0];
  const suggestion = pick
    ? ` — ${pick.meal.name} fixes it in ${pick.meal.prep_minutes} min`
    : "";
  return {
    fireAtMinutes: fireAt,
    title: "Eat something",
    body: `~${gap} cal to go${suggestion}`,
  };
}
```

Note `computeNudge` is called once before the context chain in Task 1's code and its result is attached to every non-terminal context (`post_workout`/`emergency`/`catch_up`/`next_meal`); terminal contexts return `nudge: null` explicitly. That wiring already exists from Task 1 — this task only replaces the stub body.

- [ ] **Step 4: Run to verify pass**

```bash
cd mobile && npm test -- eatNext
```

Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/eatNext.ts mobile/src/lib/__tests__/eatNext.test.ts
git commit -m "feat(nutrition-os): Eat Next nudge decision"
```

---

### Task 3: `mealPace.test.ts` — the missing suite (audit R2)

**Files:**
- Test: `mobile/src/lib/__tests__/mealPace.test.ts` (create; `mealPace.ts` is NOT modified)

These tests pin the **existing** implementation (read `mobile/src/lib/mealPace.ts` first — 133 lines). All expectations below were derived from that code; if any test fails, the test is wrong, not the lib — recheck the derivation before touching anything.

- [ ] **Step 1: Write the tests**

```ts
// mobile/src/lib/__tests__/mealPace.test.ts
// Pins the existing pace lib (untested since meals-tier3; audit item R2).
import { computeMealPace, type ComputeMealPaceOpts } from "../mealPace";

const at = (h: number, m = 0) => new Date(2026, 6, 29, h, m, 0, 0);

const base: Omit<ComputeMealPaceOpts, "currentValue" | "now"> = {
  goal: 2300,
  windowStart: "08:00",
  windowEnd: "23:00",
  mealTimes: { breakfast: "08:00", lunch: "12:00", dinner: "18:00" },
  macro: "calories",
};

describe("short-circuits", () => {
  it("null/zero goal → on_pace", () => {
    expect(computeMealPace({ ...base, goal: null, currentValue: 0, now: at(12) }).status).toBe("on_pace");
    expect(computeMealPace({ ...base, goal: 0, currentValue: 0, now: at(12) }).status).toBe("on_pace");
  });
  it("currentValue ≥ goal → goal_hit, even outside the window", () => {
    expect(computeMealPace({ ...base, currentValue: 2300, now: at(6) }).status).toBe("goal_hit");
  });
  it("before/after window", () => {
    expect(computeMealPace({ ...base, currentValue: 0, now: at(7, 59) }).status).toBe("before_window");
    expect(computeMealPace({ ...base, currentValue: 100, now: at(23, 1) }).status).toBe("after_window");
  });
  it("degenerate window (end ≤ start) → on_pace", () => {
    // Note: an inverted window (23:00→08:00) hits the after_window check
    // first for any now > end, so the only reachable degenerate case is
    // start === end with now exactly on it — that is what this pins.
    expect(
      computeMealPace({
        ...base, windowStart: "08:00", windowEnd: "08:00",
        currentValue: 500, now: at(8, 0),
      }).status,
    ).toBe("on_pace");
  });
});

describe("linear expected-by-now", () => {
  // window 480–1380 (900 min). At 12:00: elapsed (720−480)/900 = 4/15,
  // expected 2300 × 4/15 = 613.33; tolerance max(2300×0.05, 100) = 115.
  it("within tolerance → on_pace", () => {
    expect(computeMealPace({ ...base, currentValue: 550, now: at(12) }).status).toBe("on_pace");
  });
  it("ahead beyond tolerance → ahead with rounded delta", () => {
    const r = computeMealPace({ ...base, currentValue: 800, now: at(12) });
    expect(r.status).toBe("ahead");
    expect(r.delta).toBe(Math.round(800 - (2300 * 4) / 15)); // 187
  });
  it("behind: delta, catch-up aimed at next milestone (dinner)", () => {
    // 13:00: expected 2300×(780−480)/900 = 766.67; current 400 → behind 367.
    // Next milestone = dinner 18:00 (1080): target 2300×600/900 = 1533.33
    // → catchUp round(1533.33−400) = 1133, label "dinner (6 PM)".
    const r = computeMealPace({ ...base, currentValue: 400, now: at(13) });
    expect(r.status).toBe("behind");
    expect(r.delta).toBe(367);
    expect(r.catchUpAmount).toBe(1133);
    expect(r.catchUpLabel).toBe("dinner (6 PM)");
  });
  it("after all meals → catch-up aimed at end of day", () => {
    const r = computeMealPace({ ...base, currentValue: 1200, now: at(19) });
    expect(r.status).toBe("behind");
    expect(r.catchUpLabel).toBe("end of day (11 PM)");
    // target ratio 1 → catchUp = 2300 − 1200
    expect(r.catchUpAmount).toBe(1100);
  });
});

describe("tolerance floors", () => {
  it("calories floor 100 beats 5% for small goals", () => {
    // goal 1000 → 5% = 50 < floor 100. At 12:00 expected 266.67; 190 behind
    // by 76.67 → within the 100 floor → on_pace.
    expect(
      computeMealPace({ ...base, goal: 1000, currentValue: 190, now: at(12) }).status,
    ).toBe("on_pace");
  });
  it("protein floor 8 g", () => {
    // goal 100g → 5% = 5 < floor 8. At 12:00 expected 26.67; 20 → behind 6.67
    // → within floor → on_pace.
    expect(
      computeMealPace({
        ...base, macro: "protein", goal: 100, currentValue: 20, now: at(12),
      }).status,
    ).toBe("on_pace");
  });
});

describe("milestone label formatting", () => {
  it("half-hour meal times format with minutes", () => {
    const r = computeMealPace({
      ...base,
      mealTimes: { breakfast: "08:00", lunch: "12:30", dinner: "18:00" },
      currentValue: 100,
      now: at(11),
    });
    expect(r.status).toBe("behind");
    expect(r.catchUpLabel).toBe("lunch (12:30 PM)");
  });
});
```

- [ ] **Step 2: Run**

```bash
cd mobile && npm test -- mealPace
```

Expected: PASS on first run (the lib already behaves this way). If a test fails, re-derive the expectation from `mealPace.ts` — do not modify the lib.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/__tests__/mealPace.test.ts
git commit -m "test(nutrition-os): pin mealPace behavior (audit R2 gap)"
```

---

### Task 4: Migration — profiles column + view drops

**Files:**
- Create: `supabase/migrations/20260729110000_recommender_profile_and_view_cleanup.sql`

Do **not** apply — Task 10 is the owner gate.

- [ ] **Step 1: Write the migration**

```sql
-- Nutrition OS Phase 3: recommender settings + aggregation-path decision.
-- Spec: docs/superpowers/specs/2026-07-29-nutrition-recommender-design.md §9
--
-- eat_nudges_enabled: per-user setting = profiles attribute (kernel rule;
-- water_reminders_enabled / meal_reminders_enabled precedent). Default false
-- — nudges are opt-in from the Notifications screen.
--
-- View drops EXECUTE the standing pick-one aggregation decision (Concept Map
-- §18.2, audit D6): client-side math (sumNutrition/mealStats) is the adopted
-- path — it is live everywhere and carries all 7 nutrients — and these views
-- are consumed by nothing (verified by grep across mobile/src and mobile/app,
-- 2026-07-29) and stale (daily_nutrition_summary lacks sodium_mg/fiber_g).

alter table public.profiles
  add column if not exists eat_nudges_enabled boolean not null default false;

drop view if exists public.daily_nutrition_summary;
drop view if exists public.daily_water_summary;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260729110000_recommender_profile_and_view_cleanup.sql
git commit -m "feat(nutrition-os): eat_nudges_enabled + drop dead aggregation views (D6)"
```

---

### Task 5: `useEatNext` hook

**Files:**
- Create: `mobile/src/hooks/useEatNext.ts`

Assembles the engine input (spec §6). Depends on Phase 2's `mealLibrary.ts` being merged — verify its exports first (`fetchMealLibrary`, `computeMealTotals`, `MealLibraryData`) and adjust property names here if amendments changed them.

- [ ] **Step 1: Write the hook**

```ts
// mobile/src/hooks/useEatNext.ts
// Single assembly point for the Eat Next engine (spec §6): every surface and
// the nudge scheduler consume this hook, so no two surfaces can disagree.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { computeBrianScore } from "@/src/lib/mealScore";
import { computeMealPace, type MealPaceState } from "@/src/lib/mealPace";
import { sumNutrition, type MacroGoals } from "@/src/lib/mealMacros";
import {
  recommendEatNext,
  type EatNextResult,
  type ScoredMeal,
} from "@/src/lib/eatNext";
import {
  computeMealTotals,
  fetchMealLibrary,
} from "@/src/lib/supabase/mealLibrary";
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";

const DEFAULT_MAX_PREP_MINUTES = 5;

interface ProfileRow {
  target_calories: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_sodium_mg: number | null;
  target_fats_g: number | null;
  target_sugars_g: number | null;
  target_fiber_g: number | null;
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  water_window_start: string;
  water_window_end: string;
  eat_nudges_enabled: boolean;
}

export interface UseEatNextValue {
  result: EatNextResult | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

const hhmm = (t: string) => t.slice(0, 5); // "HH:MM:SS" → "HH:MM"
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map((s) => parseInt(s, 10));
  return h * 60 + (m || 0);
};

export function useEatNext(refreshKey?: number): UseEatNextValue {
  const [result, setResult] = useState<EatNextResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const today = getLocalDateString();
      const [library, logs, profile, constraints, workout] = await Promise.all([
        fetchMealLibrary(),
        supabase.from("meal_logs").select("*").eq("date", today),
        supabase
          .from("profiles")
          .select(
            "target_calories, target_protein_g, target_carbs_g, target_sodium_mg, target_fats_g, target_sugars_g, target_fiber_g, breakfast_time, lunch_time, dinner_time, water_window_start, water_window_end, eat_nudges_enabled",
          )
          .maybeSingle(),
        supabase
          .from("nutrition_constraints")
          .select("max_prep_minutes")
          .maybeSingle(),
        supabase
          .from("workout_instances")
          .select("completed_at")
          .eq("scheduled_date", today)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const errs = [logs.error, profile.error, constraints.error, workout.error]
        .filter((e) => e !== null);
      if (errs.length > 0) {
        errs.slice(1).forEach((e) => console.error("useEatNext:", e));
        throw errs[0];
      }
      const p = profile.data as ProfileRow | null;
      if (!p) throw new Error("No profile row");

      const dayTotals = sumNutrition(logs.data ?? []);
      const goals: MacroGoals = {
        calories: p.target_calories,
        protein: p.target_protein_g,
        carbs: p.target_carbs_g,
        sodium_mg: p.target_sodium_mg,
        fats: p.target_fats_g,
        sugars: p.target_sugars_g,
        fiber_g: p.target_fiber_g,
      };
      const mealTimes = {
        breakfast: hhmm(p.breakfast_time),
        lunch: hhmm(p.lunch_time),
        dinner: hhmm(p.dinner_time),
      };
      const windowStart = hhmm(p.water_window_start);
      const windowEnd = hhmm(p.water_window_end);

      const paceFor = (macro: "calories" | "protein"): MealPaceState =>
        computeMealPace({
          currentValue: macro === "calories" ? dayTotals.calories : dayTotals.protein,
          goal: macro === "calories" ? goals.calories : goals.protein,
          windowStart,
          windowEnd,
          mealTimes,
          macro,
        });

      const meals: ScoredMeal[] = library.meals.map((meal) => ({
        meal,
        totals: computeMealTotals(meal.items),
        score: computeBrianScore({
          prepMinutes: meal.prep_minutes,
          role: meal.role,
          tasteOverride: meal.taste_override,
          items: meal.items.map((it) => ({
            calories: it.savedFood.calories,
            protein: it.savedFood.protein,
            servings: it.servings,
            smallPiecesOk: it.small_pieces_ok,
            concepts: (library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [])
              .map((id) => library.conceptsById.get(id))
              .filter((c): c is NonNullable<typeof c> => !!c)
              .map((c) => ({
                rating: c.rating,
                requiresSmallPieces: c.requires_small_pieces,
                prepIntensive: c.prep_intensive,
              })),
          })),
        }),
      }));

      let workoutCompletedAtMinutes: number | null = null;
      const completedAt = (workout.data as { completed_at: string | null } | null)
        ?.completed_at;
      if (completedAt) {
        const d = new Date(completedAt); // timestamptz → local
        workoutCompletedAtMinutes = d.getHours() * 60 + d.getMinutes();
      }

      const now = new Date();
      setResult(
        recommendEatNext({
          nowMinutes: now.getHours() * 60 + now.getMinutes(),
          windowStartMinutes: toMinutes(windowStart),
          windowEndMinutes: toMinutes(windowEnd),
          mealTimesMinutes: {
            breakfast: toMinutes(mealTimes.breakfast),
            lunch: toMinutes(mealTimes.lunch),
            dinner: toMinutes(mealTimes.dinner),
          },
          dayTotals,
          goals,
          caloriePace: paceFor("calories"),
          proteinPace: paceFor("protein"),
          meals,
          maxPrepMinutes:
            (constraints.data as { max_prep_minutes: number } | null)
              ?.max_prep_minutes ?? DEFAULT_MAX_PREP_MINUTES,
          workoutCompletedAtMinutes,
          nudgesEnabled: p.eat_nudges_enabled,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey]);

  return { result, loading, error, refetch: load };
}
```

Note the Brian-Score assembly duplicates the `scores` memo inside `MealLibraryModal` — deliberate small duplication rather than exporting the modal's internals; if Phase 2's amendments extracted a shared helper for this, use it instead and note the substitution.

- [ ] **Step 2: Typecheck + column-name grep**

```bash
cd mobile && npx tsc --noEmit
grep -n "eat_nudges_enabled\|water_window_start\|breakfast_time" ../supabase/migrations/*.sql | head
```

Expected: 0 type errors; the grep confirms every selected column exists in a migration (`eat_nudges_enabled` in Task 4's file).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/hooks/useEatNext.ts
git commit -m "feat(nutrition-os): useEatNext input-assembly hook"
```

---

### Task 6: `eatNudgeService` + Notifications-screen toggle

**Files:**
- Create: `mobile/src/services/eatNudgeService.ts`
- Modify: `mobile/src/components/profile/NotificationsScreen.tsx` (add toggle + test-fire in the meal-reminders card region, ~:257-285)

Model: `mobile/src/services/mealReminderService.ts` — read it first; the family tag / cancel-enumerate / permission flow below mirrors it exactly.

- [ ] **Step 1: Write the service**

```ts
// mobile/src/services/eatNudgeService.ts
// "eat-nudge" local-notification family (Nutrition OS Phase 3, spec §8.1).
// Pace-aware: the DECISION comes from recommendEatNext (pure); this service
// only schedules/cancels it. Strict cancel-and-resync — at most ONE pending
// nudge exists, budgeted against the shared 64-slot iOS cap.
import * as Notifications from "expo-notifications";
import { requestPermissions } from "./notificationService";
import type { EatNextNudge } from "@/src/lib/eatNext";

const EAT_NUDGE_TYPE = "eat-nudge";

/** Cancel this family only; other families (water/meal/event/weight) untouched. */
export async function cancelAllEatNudges(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.content.data?.type === EAT_NUDGE_TYPE) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (error) {
    console.error("cancelAllEatNudges:", error);
  }
}

/**
 * Reconcile pending state with the engine's decision: null → cancel only;
 * otherwise cancel-then-schedule one DATE-trigger one-shot for today at
 * fireAtMinutes (already guaranteed strictly in the future by the engine,
 * but re-checked here since scheduling happens later than deciding).
 */
export async function syncEatNudge(decision: EatNextNudge | null): Promise<void> {
  await cancelAllEatNudges();
  if (!decision) return;
  const granted = await requestPermissions();
  if (!granted) return;

  const fireDate = new Date();
  fireDate.setHours(
    Math.floor(decision.fireAtMinutes / 60),
    decision.fireAtMinutes % 60,
    0,
    0,
  );
  if (fireDate.getTime() <= Date.now()) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: decision.title,
        body: decision.body,
        data: { type: EAT_NUDGE_TYPE },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      },
    });
  } catch (error) {
    console.error("syncEatNudge schedule failed:", error);
  }
}

/** One-off test fire (Notifications screen), mirroring the other families. */
export async function sendTestEatNudge(): Promise<{
  ok: boolean;
  permissionDenied?: boolean;
}> {
  const granted = await requestPermissions();
  if (!granted) return { ok: false, permissionDenied: true };
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Eat something (test)",
        body: "If you can see this, pace nudges will work too.",
        data: { type: EAT_NUDGE_TYPE, test: true },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
      },
    });
    return { ok: true };
  } catch (error) {
    console.error("sendTestEatNudge:", error);
    return { ok: false };
  }
}
```

- [ ] **Step 2: Add the toggle to `NotificationsScreen.tsx`**

Read the meal-reminders card (~:257-285) and add a sibling card directly after it, using the same row/switch/test-button components that card uses (match its exact local component names — likely a `Switch` row bound to a profiles column and a small "Send test" `TouchableOpacity`):

- State: load `eat_nudges_enabled` in the screen's existing profile fetch; add `const [eatNudges, setEatNudges] = useState(false)` seeded from it.
- Toggle handler (alert-on-failure idiom):

```tsx
const handleEatNudgesToggle = async (value: boolean) => {
  setEatNudges(value);
  const { error } = await supabase
    .from("profiles")
    .update({ eat_nudges_enabled: value })
    .eq("id", userId);
  if (error) {
    setEatNudges(!value);
    Alert.alert("Failed to save", error.message);
    return;
  }
  if (!value) await cancelAllEatNudges(); // off = no pending nudge survives
};
```

- Card copy: title "Pace nudges", subtitle "One smart reminder when you're falling behind on calories — only fires when needed."; test button calls `sendTestEatNudge()` and alerts on `permissionDenied` exactly as the meal-reminder test button does.
- Imports: `cancelAllEatNudges, sendTestEatNudge` from `@/src/services/eatNudgeService`.

- [ ] **Step 3: Typecheck + commit**

```bash
cd mobile && npx tsc --noEmit
```

Expected: 0 errors.

```bash
git add mobile/src/services/eatNudgeService.ts mobile/src/components/profile/NotificationsScreen.tsx
git commit -m "feat(nutrition-os): eat-nudge notification family + settings toggle"
```

---

### Task 7: Landmine fix — family-scoped reschedule

**Files:**
- Modify: `mobile/src/services/notificationService.ts:271-295`

Event notifications already carry `data.type: 'event_reminder'` (`:187`), so no tagging work is needed. The bug is only that `rescheduleAllNotifications` (fired debounced from the Schedule screen) calls the global `cancelAllNotifications()` (`:295` → `:273`), evicting water/meal/weight and the new eat-nudge families.

- [ ] **Step 1: Add a family-scoped cancel and use it**

Add below `cancelAllNotifications`:

```ts
/**
 * Cancel only schedule-event reminders (data.type === 'event_reminder'),
 * leaving the other families (water-reminder, meal-reminder, weight_reminder,
 * eat-nudge) untouched. rescheduleAllNotifications previously used the global
 * cancelAllNotifications() here, which silently evicted every other family
 * each time the Schedule screen rescheduled — the "64-slot landmine".
 */
export async function cancelAllEventReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.content.data?.type === 'event_reminder') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (error) {
    console.error('Error canceling event reminders:', error);
  }
}
```

In `rescheduleAllNotifications`, replace the line `await cancelAllNotifications();` (with its `// Cancel all existing notifications` comment) with:

```ts
    // Cancel only this family — other reminder families own their own slots.
    await cancelAllEventReminders();
```

`cancelAllNotifications` itself stays exported (sign-out semantics). Verify no other call site depended on the global wipe:

```bash
cd mobile && grep -rn "cancelAllNotifications" src/ app/
```

Expected: the definition, and (if any) sign-out call sites only — no Schedule-screen ones besides the line just changed.

- [ ] **Step 2: Typecheck + commit**

```bash
cd mobile && npx tsc --noEmit
```

```bash
git add mobile/src/services/notificationService.ts
git commit -m "fix(notifications): schedule reschedule cancels only its own family"
```

---

### Task 8: `EatNextHomeCard` + Home wiring

> ⚠️ **Before transcribing this task's code, read the Task 1 amendment (second round) at the bottom of this file.** Required deviation: the `isEmptyLibrary` check below must import and compare against `EMPTY_LIBRARY_MESSAGE` from `eatNext.ts`, not the inline string literal.

**Files:**
- Create: `mobile/src/components/EatNextHomeCard.tsx`
- Modify: `mobile/app/(tabs)/home.tsx:126-131`

Pattern anchors: `TodaysWorkoutCard.tsx` (full-width card, state machine), `MealsHomeCard.tsx` (self-fetch + `refreshKey`). Styles live in the component.

- [ ] **Step 1: Write the card**

```tsx
// mobile/src/components/EatNextHomeCard.tsx
// Home surface for the Eat Next recommender (spec §7.1). Full-width card,
// TodaysWorkoutCard pattern: self-fetching, refreshKey remount/reload,
// loading / error+retry / contextual-empty states. Also the app-open resync
// point for the eat-nudge family.
import React, { useCallback, useEffect } from "react";
import {
  ActivityIndicator, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { UtensilsCrossed } from "lucide-react-native";
import { useEatNext } from "@/src/hooks/useEatNext";
import { syncEatNudge } from "@/src/services/eatNudgeService";

interface EatNextHomeCardProps {
  refreshKey?: number;
}

export function EatNextHomeCard({ refreshKey }: EatNextHomeCardProps) {
  const { result, loading, error, refetch } = useEatNext(refreshKey);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // App-open / focus resync point for the nudge family (spec §8.1).
  useEffect(() => {
    if (result) syncEatNudge(result.nudge);
  }, [result]);

  if (loading && !result) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#22C55E" />
      </View>
    );
  }
  if (error && !result) {
    return (
      <TouchableOpacity style={styles.card} onPress={refetch} activeOpacity={0.7}>
        <Text style={styles.mutedText}>Couldn&apos;t load a suggestion — tap to retry.</Text>
      </TouchableOpacity>
    );
  }
  if (!result) return null;

  const top = result.recommendations[0];
  const emergency = result.context === "emergency";

  if (!top) {
    // Contextual empty: goal_hit / after_window / empty library message.
    const isEmptyLibrary = result.message === "No meals in your library yet.";
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push("/(tabs)/track/meals")}
      >
        <View style={styles.headerRow}>
          <UtensilsCrossed size={18} color="#9CA3AF" strokeWidth={2} />
          <Text style={styles.mutedText}>{result.message ?? "Nothing to suggest right now."}</Text>
        </View>
        {isEmptyLibrary && (
          <Text style={styles.ctaText}>Build your Meal Library in Track → Meals</Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, emergency && styles.cardEmergency]}
      activeOpacity={0.7}
      onPress={() =>
        router.push({
          pathname: "/(tabs)/track/meals",
          params: { suggestMealId: top.mealId },
        })
      }
    >
      <View style={styles.headerRow}>
        <UtensilsCrossed size={18} color={emergency ? "#F87171" : "#22C55E"} strokeWidth={2} />
        <Text style={[styles.title, emergency && styles.titleEmergency]} numberOfLines={1}>
          {top.name}
        </Text>
      </View>
      <Text style={styles.reason} numberOfLines={2}>
        {top.reasons[0]}
      </Text>
      {result.message && <Text style={styles.mutedText}>{result.message}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 20,
    marginBottom: 8,
  },
  cardEmergency: { borderColor: "rgba(248,113,113,0.5)" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", flexShrink: 1 },
  titleEmergency: { color: "#F87171" },
  reason: { fontSize: 13, color: "#D1D5DB", marginTop: 6 },
  mutedText: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },
  ctaText: { fontSize: 13, color: "#22C55E", marginTop: 6 },
});
```

(If a score chip is ever added to this card, import `SCORE_BAND_CORE_MIN`/`SCORE_BAND_MID_MIN` from `mealScore.ts` — never re-declare band cutoffs locally.)

- [ ] **Step 2: Mount in `home.tsx`**

After line 128 (`<TodaysWorkoutCard …/>`) and before the "Today's Summary" title, insert:

```tsx
        {/* Eat Next Section */}
        <Text style={styles.sectionTitle}>Eat Next</Text>
        <EatNextHomeCard refreshKey={refreshKey} />
```

Add the import `import { EatNextHomeCard } from "@/src/components/EatNextHomeCard";` alongside the other card imports.

- [ ] **Step 3: Typecheck + commit**

```bash
cd mobile && npx tsc --noEmit
```

```bash
git add mobile/src/components/EatNextHomeCard.tsx "mobile/app/(tabs)/home.tsx"
git commit -m "feat(nutrition-os): Eat Next home card"
```

---

### Task 9: `RampHomeBanner` + profile deep link

**Files:**
- Create: `mobile/src/components/RampHomeBanner.tsx`
- Modify: `mobile/app/(tabs)/home.tsx` (mount above Today's Workout)
- Modify: `mobile/app/(tabs)/profile.tsx` (read `?modal=nutrition`)

- [ ] **Step 1: Write the banner**

```tsx
// mobile/src/components/RampHomeBanner.tsx
// Promotes Phase 1's ramp "advance" suggestion to Home (spec §7.3). Renders
// nothing unless the assessment says advance AND a next level exists — the
// top-of-ramp case stays a Preferences-only banner. Never writes; tapping
// deep-links to the Nutrition Preferences modal where RampCard confirms.
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { TrendingUp } from "lucide-react-native";
import {
  fetchNutritionPreferences,
  fetchRecentWeighIns,
} from "@/src/lib/supabase/nutritionPreferences";
import { assessRampProgress } from "@/src/lib/rampProgress";
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";

const TREND_WINDOW_DAYS = 42; // same window NutritionPreferencesScreen uses

interface RampHomeBannerProps {
  refreshKey?: number;
}

export function RampHomeBanner({ refreshKey }: RampHomeBannerProps) {
  const [nextLevelName, setNextLevelName] = useState<string | null>(null);
  const [nextLevelNumber, setNextLevelNumber] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - TREND_WINDOW_DAYS);
      const [prefs, weighIns] = await Promise.all([
        fetchNutritionPreferences(),
        fetchRecentWeighIns(getLocalDateString(since)),
      ]);
      const active = prefs.rampLevels.find((l) => l.is_active) ?? null;
      const next = active
        ? prefs.rampLevels.find((l) => l.level === active.level + 1) ?? null
        : null;
      const assessment = assessRampProgress({
        weighIns,
        levelStartedAt: active?.started_at ?? null,
        today: getLocalDateString(),
      });
      if (assessment.recommendation === "advance" && next) {
        setNextLevelName(next.name);
        setNextLevelNumber(next.level);
      } else {
        setNextLevelName(null);
        setNextLevelNumber(null);
      }
    } catch (error) {
      // A Home banner is decoration — fail silent, never alert from here.
      console.error("RampHomeBanner load:", error);
      setNextLevelName(null);
      setNextLevelNumber(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, refreshKey]),
  );

  if (nextLevelName === null) return null;

  return (
    <TouchableOpacity
      style={styles.banner}
      activeOpacity={0.8}
      onPress={() =>
        router.push({ pathname: "/(tabs)/profile", params: { modal: "nutrition" } })
      }
    >
      <TrendingUp size={18} color="#22C55E" strokeWidth={2} />
      <Text style={styles.text}>
        Ready for Level {nextLevelNumber} — {nextLevelName}. Tap to review.
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.4)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  text: { fontSize: 14, fontWeight: "600", color: "#22C55E", flexShrink: 1 },
});
```

- [ ] **Step 2: Mount in `home.tsx`** — directly before the `{/* Today's Workout Section */}` comment (line ~126):

```tsx
        {/* Ramp advance banner (renders nothing unless actionable) */}
        <RampHomeBanner refreshKey={refreshKey} />
```

plus the import.

- [ ] **Step 3: Deep link in `profile.tsx`**

Add imports `useLocalSearchParams, router` from `expo-router` (keep existing imports). Below the `activeModal` state (line ~39):

```tsx
  const params = useLocalSearchParams<{ modal?: string }>();
  useEffect(() => {
    if (params.modal === "nutrition") {
      setActiveModal("nutrition");
      // Consume the param so back-navigation doesn't re-open the modal.
      router.setParams({ modal: undefined });
    }
  }, [params.modal]);
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd mobile && npx tsc --noEmit
```

```bash
git add mobile/src/components/RampHomeBanner.tsx "mobile/app/(tabs)/home.tsx" "mobile/app/(tabs)/profile.tsx"
git commit -m "feat(nutrition-os): ramp advance banner on Home with deep link"
```

---

### Task 10: `EatNextRow` + MealsScreen wiring + `initialMealId`

**Files:**
- Create: `mobile/src/components/track/meals/EatNextRow.tsx`
- Modify: `mobile/src/components/track/MealsScreen.tsx` (~:1407 pace-lines block; library-modal block; log-write handlers)
- Modify: `mobile/src/components/track/meals/library/MealLibraryModal.tsx` (optional `initialMealId` prop)

- [ ] **Step 1: Write the row**

```tsx
// mobile/src/components/track/meals/EatNextRow.tsx
// "Suggested now" strip (spec §7.2): top 2 recommendations as chips, today
// view only. A dumb renderer — the hook/engine owns all logic.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { EatNextResult } from "@/src/lib/eatNext";

interface EatNextRowProps {
  result: EatNextResult | null;
  onMealPress: (mealId: string) => void;
}

export function EatNextRow({ result, onMealPress }: EatNextRowProps) {
  if (!result || result.recommendations.length === 0) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Suggested now</Text>
      {result.recommendations.slice(0, 2).map((rec) => (
        <TouchableOpacity
          key={rec.mealId}
          style={styles.chip}
          activeOpacity={0.7}
          onPress={() => onMealPress(rec.mealId)}
        >
          <Text style={styles.chipName} numberOfLines={1}>{rec.name}</Text>
          <Text style={styles.chipReason} numberOfLines={1}>{rec.reasons[0]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, marginBottom: 4 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  chip: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  chipName: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  chipReason: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
});
```

- [ ] **Step 2: `MealLibraryModal` — optional `initialMealId`**

In `mobile/src/components/track/meals/library/MealLibraryModal.tsx`: add `initialMealId?: string | null` to the props interface, and change the visibility effect so opening with a target lands on its detail:

```tsx
  useEffect(() => {
    if (visible) {
      setView(
        initialMealId
          ? { mode: "detail", mealId: initialMealId }
          : { mode: "list" },
      );
      load();
    }
  }, [visible, initialMealId, load]);
```

(If the target id no longer exists after `load()`, the existing `detailMeal === undefined` handling falls back to the list body — verify that branch renders the list rather than a blank body; if it renders nothing, add `if (view.mode === "detail" && data && !detailMeal) setView({ mode: "list" })` guard logic in an effect.)

- [ ] **Step 3: Wire MealsScreen**

Read the current file around the anchors first (it will have drifted from the line numbers below — match on content).

1. Imports: `EatNextRow`, `useEatNext`, `syncEatNudge`, `useLocalSearchParams` (from `expo-router`).
2. Hook: near the pace `useMemo`s (~:1149): `const eatNext = useEatNext();`
3. Param handling — near the other state hooks:

```tsx
  const params = useLocalSearchParams<{ suggestMealId?: string }>();
  const [libraryInitialMealId, setLibraryInitialMealId] = useState<string | null>(null);
  useEffect(() => {
    if (params.suggestMealId) {
      setLibraryInitialMealId(params.suggestMealId);
      setLibraryVisible(true);
      router.setParams({ suggestMealId: undefined }); // consume once
    }
  }, [params.suggestMealId]);
```

(`router` is already imported in this file; if not, import from `expo-router`.)
4. Render — inside the `{viewingToday && (` block that wraps `MealsPaceLines` (~:1407-1412), directly after `<MealsPaceLines …/>`:

```tsx
                    <EatNextRow
                      result={eatNext.result}
                      onMealPress={(mealId) => {
                        setLibraryInitialMealId(mealId);
                        setLibraryVisible(true);
                      }}
                    />
```

5. Library modal block: pass `initialMealId={libraryInitialMealId}`, and in its `onClose`, also `setLibraryInitialMealId(null)`.
6. Post-write resync — in the shared refetch path every log write already calls (the same function the library modal's `onLogged` uses, which invalidates the day cache and refetches): append

```tsx
  await eatNext.refetch();
  // eatNext.result is now stale in this closure; sync from the fresh value
  // inside a useEffect keyed on eatNext.result instead of here.
```

and add, near the other effects:

```tsx
  useEffect(() => {
    if (viewingToday && eatNext.result) syncEatNudge(eatNext.result.nudge);
  }, [viewingToday, eatNext.result]);
```

(The effect-based sync covers both the post-log path and initial load; the Home card covers app-open. Double-syncing is harmless — the service is idempotent cancel-then-schedule.)

- [ ] **Step 4: Typecheck + full tests + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
```

Expected: 0 errors, all suites pass.

```bash
git add mobile/src/components/track/meals/EatNextRow.tsx mobile/src/components/track/MealsScreen.tsx mobile/src/components/track/meals/library/MealLibraryModal.tsx
git commit -m "feat(nutrition-os): in-Meals suggestions row + suggestMealId deep link"
```

---

### Task 11: Apply migration to prod — ⚠️ OWNER GATE

**Do not execute without the owner's explicit go-ahead in the session.**

- [ ] **Step 1: Pre-flight (read-only)** — `npx supabase migration list` shows exactly `20260729110000_recommender_profile_and_view_cleanup` pending (all four Phase 2 migrations must already be APPLIED — if they aren't, stop: the merge-order precondition was violated). Verify via read-only query that `daily_nutrition_summary`/`daily_water_summary` still exist and `profiles.eat_nudges_enabled` doesn't.

- [ ] **Step 1b: Drift check before the drops (read-only, ADDED during execution — see the Task 4 amendment).** Capture what is *actually* about to be dropped, not what a 2025 migration says should be there:

```sql
select 'daily_nutrition_summary' as view_name,
       pg_get_viewdef('public.daily_nutrition_summary'::regclass, true) as definition
union all
select 'daily_water_summary',
       pg_get_viewdef('public.daily_water_summary'::regclass, true);
```

  Three things for one query: it captures the definitions being removed, it doubles as the existence check Step 1 wants (it errors if either view is already gone), and — the real point — **if either definition differs from `20250206_tracking_tables.sql:350,364`, STOP.** Divergence means someone hand-edited these views directly in production, which undermines the "consumed by nothing" premise the whole D6 decision rests on. This DB is not rebuildable from the repo, so static analysis cannot rule drift out. Paste the output into the Task 11 amendment either way.

- [ ] **Step 2: Apply** — `npx supabase db push --yes`.

- [ ] **Step 3: Post-verify (read-only)** — `eat_nudges_enabled` exists with default false and the single profiles row reads `false`; both views are gone; nothing else changed.

- [ ] **Step 4: Post-apply wiring (ADDED during execution — see the Task 5 amendment; extended by the Task 6 amendment).** Until this step runs, the nudge is dead code: Task 5 ships `nudgesEnabled: false` hardcoded and Task 6 ships the Notifications-screen toggle seeded `useState(false)` with no DB read, because naming a nonexistent column makes PostgREST reject the whole select (42703 → HTTP 400). Only now is the column real. **Three edits** (not two — extended during Task 6's review):
  1. In `mobile/src/hooks/useEatNext.ts`, add `eat_nudges_enabled: boolean;` to `interface ProfileRow`, replacing the `NOTE:` comment that marks its absence. **This alone fails to compile** (`Property 'eat_nudges_enabled' is missing in type … but required in type 'Record<keyof ProfileRow, true>'`) until you add the matching `eat_nudges_enabled: true,` entry to the `PROFILE_COLUMNS` object just below it, which is what puts the column in the select string.
  2. In the same file, change the `recommendEatNext` argument `nudgesEnabled: false` to `nudgesEnabled: p.eat_nudges_enabled`, deleting the block comment above it that explains the hardcode.
  3. In `mobile/src/components/profile/NotificationsScreen.tsx`: add `eat_nudges_enabled` to the profile `.select(...)` string (alongside `water_reminders_enabled, water_reminder_times, meal_reminders_enabled, meal_reminder_times, meal_reminder_types`), delete the `// Pace nudges … Seeded false rather than loaded from …` block comment above `const [eatNudges, setEatNudges] = useState(false)`, and change that line to seed from `!!data.eat_nudges_enabled` inside the existing profile-load `useEffect`, the same way `enabled`/`mealEnabled` are seeded a few lines above it.

  Then `cd mobile && npx tsc --noEmit && npm test` (both must stay clean — no test covers the hook or the screen, so this is a compile + regression check only), and verify on device that the Notifications toggle from Task 6 now actually persists (was previously silently failing every write) and gates nudge scheduling. Add "toggle Pace nudges off and back on, confirm it survives leaving and re-entering the screen" to that on-device check specifically — that's the symptom of forgetting edit 3 alone (the write in edit 3's absence would succeed against the now-real column while the switch still always renders `false` on entry, since nothing seeds it from the row). Commit separately from the apply.

  Note: `useEatNext`'s `computedAt` field (added during Task 6's review, exposed unconditionally — it does not depend on this migration) is unrelated to this step. It is Task 8/10's obligation, not this step's: whichever of those tasks calls `eatNudgeService.ts`'s `syncEatNudge(decision, sourceDay)` must pass the hook's `computedAt` as `sourceDay`, never a fresh `new Date()` — the parameter is required (not optional) specifically so that can't be forgotten. See the Task 6 amendment's item 5 disposition for the full reasoning.

---

### Task 12: Final verification sweep

- [ ] **Step 1:** `cd mobile && npx tsc --noEmit && npm test` — 0 errors, all suites green (eatNext, mealPace, plus all Phase 1/2 suites).
- [ ] **Step 2:** Greps: `grep -rn "daily_nutrition_summary\|daily_water_summary" mobile/ supabase/migrations/20260729110000*` → only the drop migration; `grep -rn "cancelAllNotifications()" mobile/src` → no call inside `rescheduleAllNotifications`.
- [ ] **Step 3 (owner):** On-device checklist — Metro reload only, unique `--port` (8081 is usually voyance-mobile): Home shows the Eat Next card with a sensible suggestion + reason; tapping opens that meal's detail in the library modal; logging a meal updates the Meals-screen suggestion row; with nudges enabled and a deliberately-behind day, a nudge schedules (verify via the iOS scheduled-notifications or by waiting) and clears after catching up; ramp banner appears only if the assessment says advance, and tapping lands inside Nutrition Preferences; opening the Schedule screen and forcing a reschedule no longer cancels water/meal reminders (check `getScheduledNotificationCount()` before/after via the Notifications screen test-fires still working).
- [ ] **Step 4:** Stop. Merging and pushing are the owner's calls.

---

## Self-review checklist (run after writing, before execution)

- Spec coverage: §5.1–5.5 → Task 1; §5.6–5.7 → Task 2; §6 → Task 5; §7.1 → Task 8; §7.2 → Task 10; §7.3 → Task 9; §8.1–8.2 → Task 6; §8.3 → Task 7; §9 → Tasks 4/11; §10 → Tasks 1–3/12; §11 → Preconditions block. No gaps.
- Type consistency: `EatNextInput`/`EatNextResult`/`ScoredMeal`/`EatNextNudge` (Task 1→2/5/8/10), `recommendEatNext` (1→5), `syncEatNudge(decision)` (6→8/10), `useEatNext(refreshKey?)` (5→8/10), `initialMealId` (10 internal), constants imported from `eatNext.ts` in tests rather than re-declared.
- Known accepted risks: MealsScreen anchors are content-based (file drifts); Brian-Score assembly duplicated between `useEatNext` and `MealLibraryModal` (noted in Task 5); nudge double-sync between Home card and MealsScreen effects (idempotent by design).

## ⚠️ Execution amendments

### Task 1

All three items below were found by a spec-compliance review that ran mutation testing against `eatNext.test.ts`, not by the suite as written. The plan's prescribed test file (the 19-case block in Task 1 Step 1) passed 19/19 green while the implementation carried all three defects — a green, matching-the-plan suite proved conformance to the plan's code, not conformance to the spec.

- **§5.3.6 preference ignored `category=snack`.** Spec §5.3.6: "if ≥120 min remain before the next meal time, prefer role=`bridge`/**category=`snack`**." The plan's `candidate()` computed `roleRank` only from `m.meal.role`, and the `next_meal` branch passed `preferredRoles = farFromMeal ? ["bridge"] : []` — the category half of the preference was never implemented. A `category: "snack"`, `role: null` meal got `roleRank: 1`, the same rank as an unrelated dinner-category meal, and only won by outscoring it on `raw`. The plan's own test for this rule (`"≥120 min before next meal prefers bridge/snack"`) masked the gap because its fixture was `scored({ role: "bridge", category: "snack" })` — satisfying both predicates at once, so it passed on the `role` half alone and could never detect the missing `category` half. **Fix:** `candidate()` gained a fourth parameter, `preferredCategories`, and `roleRank` is now `0` when either the role OR the category matches; the `next_meal` branch passes `preferredCategories: farFromMeal ? ["snack"] : []` alongside the existing `preferredRoles`. **New test** (`"prefers category=snack even without role=bridge..."`): a `category: "snack"`, `role: null` meal with a deliberately LOWER `raw` than a competing dinner-category meal must still rank first — a test that only passes if the preference itself, not the score, decided the order. Verified: reverting `candidate()` to the role-only check reproduces the original failure (this new test fails; all pre-existing tests still pass).
- **`emergency`-category meals could leak into `next_meal`.** Spec §5.3.6: "`emergency` never surfaces here." The `farFromMeal` pool-expansion predicate admitted any meal with `role === "bridge"` regardless of category, and `MealCategory`/`MealRole` in `src/types/meal-library.ts` permit `category: "emergency"` with `role: "bridge"` on the same row — nothing in the type system rules that combination out, and nothing in the plan's fixtures exercised it. **Fix:** the pool-expansion filter in the `next_meal` branch now additionally requires `m.meal.category !== "emergency"`. **New test** (`"emergency-category meal never surfaces in next_meal, even with role=bridge..."`): an `emergency`/`bridge` meal with the highest `raw` score in its input set must never appear in the recommendations. Verified: reverting the filter reproduces the leak (this new test fails; all pre-existing tests still pass).
- **Test-coverage gap against spec §10** ("threshold edges for every §5.7 constant"). The plan's 19-case suite reported 19/19 green while carrying ten surviving mutations, confirmed one at a time by re-applying each to `eatNext.ts`, re-running the full suite, observing a failure, then reverting:
  1. `rank()`'s sort key, `b.score.raw - a.score.raw` → `b.score.score - a.score.score` — untestable under the plan's fixture, which set `raw` and `score` from a single knob (`over.score ?? 83`) so they could never disagree. The §5.5 ranking key itself — the very thing Phase 2's banding finding motivated — was unverified.
  2. Post-workout's negative-elapsed guard (`nowMinutes - workoutCompletedAtMinutes >= 0`) — dropping it entirely left the suite green; no fixture put `workoutCompletedAtMinutes` in the future (the clock-skew case).
  3. `after_window`: `>` → `>=` on `nowMinutes > windowEndMinutes` — no fixture tested exactly at `windowEndMinutes`; the closest existing case was ten minutes past it.
  4. Emergency's past-dinner condition (`nowMinutes > mealTimesMinutes.dinner`) dropped entirely — the plan's `"emergency: past dinner + behind ≥400"` and `"catch_up: ..."` tests don't exercise a behind-and-≥400-gap scenario before dinner time with an emergency-eligible meal present, so removing the condition left the suite green.
  5. `< PROTEIN_SHORT_MAX_CAL` → `<=` in the goal_hit protein-short filter — no fixture placed a candidate's calories exactly at 300.
  6. `PROTEIN_SHORT_G`: `>=` → `>` — no fixture made the protein gap exactly 15g.
  7. `POST_WORKOUT_MIN_PROTEIN_G`: `>=` → `>` — no fixture made a candidate's protein exactly 25g.
  8. `BRIDGE_PREFER_GAP_MIN`: `>=` → `>` — no fixture placed the next-meal gap exactly 120 minutes out (existing fixtures used 60, 299, and 300).
  9. `POST_WORKOUT_WINDOW_MIN`: `<=` → `<` — the plan's "closes at 180" test used 181 minutes elapsed, never exactly 180.
  10. `CATCH_UP_BAND`: `<=` → `<` — no fixture placed a candidate's calorie distance from the gap exactly at the 35% band edge.
  - **Fix:** twelve tests added to `eatNext.test.ts` — ten mapping 1:1 to the ten mutations above, plus the two tests pinning the two structural deviations documented in the bullets above this one. Per the review's requirement, `scored()`'s fixture now exposes `raw` independently of `score` (`raw: over.raw ?? over.score ?? 83`, default behavior unchanged for all 19 original tests), and every new threshold test derives its values arithmetically from the imported constant (e.g. `POST_WORKOUT_WINDOW_MIN`, `BRIDGE_PREFER_GAP_MIN - 1`) rather than hardcoding the numbers, so a future constant change can't silently stop testing its own boundary. Each of the ten mutations was re-applied individually, confirmed to fail the suite, then reverted; the suite was confirmed green after every revert. The re-review independently repeated the full battery — all ten mutations plus reverting each structural fix in turn — and found zero survivors, with each mutation failing exactly one test (precise coverage, not over-broad). Final state: 138/138 Jest tests passing (31 in `eatNext.test.ts`, up from 19), `tsc --noEmit` 0 errors.

#### Second round: code-quality review

A follow-up code-quality review (verdict: "Ready to merge with fixes," no Critical issues, purity and the reason-generation seam praised) found four further untested guards via its own mutation pass, plus four smaller correctness/hygiene issues. None change §5 behavior; spec compliance had already been re-verified and was explicitly out of scope for this pass.

- **Four more untested guards, found by mutation testing against the (already 31-test) suite from the first round:**
  1. Dropping `calorieGoal > 0` from the goal_hit guard — survived. A user with `target_calories` unset (`null`) or explicitly `0` would have `goal_hit` fire immediately regardless of `dayTotals.calories`, silently killing the Home card for that account all day. Reachable: `MacroGoals.calories` is typed `number | null`, and `mealPace.ts:97` already treats `goal == null || goal <= 0` as a first-class "no goal" case elsewhere in this codebase — nothing stopped the same state reaching this guard.
  2. Replacing the guard with `dayTotals.calories >= (calorieGoal ?? 0)` — survived (a different mutant hitting the same untested surface: with `calorieGoal` null, `?? 0` makes any positive `dayTotals.calories` satisfy `>= 0`).
  3. `nextSlot`'s `.filter((e) => e.atMinutes > nowMinutes)` mutated to `>=` — survived. At exactly a meal's own time (e.g. `nowMinutes === lunchMinutes`), spec §5.3.6's "strictly after now" means that meal has passed and the *next* slot is the one after it; the `>=` mutant instead treats the just-passed meal as still upcoming. This boundary is load-bearing twice: Task 2's planned code feeds `nextSlot().atMinutes` directly into `fireAtMinutes` for the nudge, so an off-by-one here would also mistime the nudge.
  4. Dropping the catch_up `gap > 0` guard entirely — survived under the existing fixtures, but is a real (if narrow) production hazard, not just a test gap: `Math.abs(0 - 0) <= 0 * CATCH_UP_BAND` is trivially true, so a caller on `behind` pace with a `catchUpAmount` of exactly 0 and a 0-calorie meal in their library (an itemless meal, or a zero-cal drink — both constructible through Phase 2's `MealBuilder`) would see that meal surfaced under the message "0 cal behind pace."
  - **Fix:** no code changes to the guards themselves — all four were already correct, only untested. Four tests added: two for item 1/2 together (`goals.calories: null` and `goals.calories: 0`, both asserting `context === "next_meal"` against `BASE`'s `dayTotals.calories: 900`, which is enough to trip either mutant), one for item 3 (`nowMinutes` set to exactly `BASE.mealTimesMinutes.lunch` with a lunch-category and a dinner-category candidate, asserting the dinner meal is recommended and the lunch meal is not), and one for item 4 (`caloriePace: { status: "behind", catchUpAmount: 0 }` with a single 0-calorie candidate, asserting `context !== "catch_up"`). All four mutations were re-applied individually to `eatNext.ts`, confirmed to fail the suite, then reverted. Measured precisely on re-review: item 1 fails **only** the zero-goal test (dropping `calorieGoal > 0` leaves `calorieGoal != null` intact, so a null goal still falls through correctly); item 2 fails **both** null/zero tests; items 3 and 4 each fail exactly their own new test.
- **The `as never` casts in the test fixture were removed.** `scored()`'s `over.category`/`over.role` were typed `string`/`string | null` and force-cast through `as never` into the `Meal` shape (plus one more `as never` on the whole meal-literal). This repo's Supabase client is untyped (see the Task 1 amendment on Task 1 in the Meal Library plan), so for fixtures built by hand rather than fetched, `tsc` checking the fixture's shape against `Meal`/`MealWithItems` is the *only* validation that exists — no query, no runtime row, nothing else would catch a fixture drifting from the real row shape. `over.category`/`over.role` are now typed `MealCategory` / `MealRole | null` (imported from `@/src/types/meal-library`), and both `as never` casts are gone; the meal literal now type-checks structurally against `MealWithItems`. Verified: 0 `tsc` errors, all tests still green — the fixture was already valid, so this only restores the check going forward (e.g. a future required field added to `Meal` will now fail the fixture at compile time instead of compiling silently past it).
- **`EMPTY_LIBRARY_MESSAGE` exported as a constant — a plan flaw in Task 8's code, fixed at its source (Task 1).** Task 8's transcribed plan code contains `const isEmptyLibrary = result.message === "No meals in your library yet.";` in `EatNextHomeCard` — a consumer string-matching across a module boundary to re-derive a fact (`meals.length === 0`) that `recommendEatNext` already knows and has already branched on. This is exactly the pattern the plan itself forbids one screen later for score bands ("never re-declare band cutoffs locally" — Task 11's `mealScore.ts` constants). A copy edit to the message (e.g. "yet" → "so far", or a dropped period) would silently break the "build your Meal Library" CTA with no type error and no failing test to catch it, since the two strings live in different files with no shared symbol. **Fix:** `export const EMPTY_LIBRARY_MESSAGE = "No meals in your library yet.";` added to `eatNext.ts` and used at the `next_meal` branch's empty-library return. **Task 8 must import and compare against `EMPTY_LIBRARY_MESSAGE` instead of the inline string literal in its plan text** — flagged here as a required deviation from Task 8's plan code when that task executes.
- **`calorieGoalHit(goals, dayTotals)` extracted as its own function**, called from the goal_hit branch instead of the inline `calorieGoal != null && calorieGoal > 0 && dayTotals.calories >= calorieGoal` expression. Task 2's planned `computeNudge` re-derives this exact expression (and separately re-derives `nowMinutes > windowEndMinutes` for its own after-window check) to decide when *not* to schedule a nudge. Left as two copies, the predicate can drift the next time either the goal-hit rule or the null/zero-goal treatment changes — and per the guard above, only the copy under test would be protected. Extracted now, while Task 2 is still only plan text and the second call site doesn't exist yet, specifically so that text can be corrected before it's transcribed. **Task 2 must call `calorieGoalHit(goals, dayTotals)` rather than re-inlining the predicate its plan text currently contains** — `computeNudge` lives in the same module, so it calls the helper directly; `calorieGoalHit` is deliberately NOT exported and must not be, since it has no consumer outside `eatNext.ts` — flagged here as a required deviation from Task 2's plan code when that task executes.
- **Minor, non-behavioral cleanups**, all reviewer-verified to compile and pass before being applied: `preferredCategories` (in `candidate()`) and `slotCategories`/`preferredCategories` (in the `next_meal` branch) are now typed `ReadonlyArray<MealCategory>` instead of `ReadonlyArray<string>`, matching the already-correctly-typed `preferredRoles: ReadonlyArray<MealRole>` — `tsc` is this repo's only vocabulary check on these values (e.g. `["snak", "shake"]` previously compiled), so the loosened type was silently giving up that check. The dead `proteinGoal ?? 0` fallback in the protein-short reason string was collapsed by hoisting `const proteinGap = proteinGoal != null ? proteinGoal - dayTotals.protein : 0;` once and reading `Math.round(proteinGap)` in the reason — the fallback was unreachable today (the branch is already guarded by `proteinGoal != null`), but a future restructuring of that guard could silently turn "no protein goal" into "short by all of it" instead of failing loudly. A comment was added at the emergency branch's `candidate()` call noting that its `roleRank` is deliberately unread by the calories-descending sort immediately after it (spec §5.3.4 — rescue size decides order, not role or score), so a future reader doesn't "fix" the apparent dead value. A comment was added to `EatNextInput` noting `windowStartMinutes` and `proteinPace` are carried for spec §5.1 fidelity but unused by this task and by Task 2's planned code, and explaining why the protein-short check reads raw `goals`/`dayTotals` instead of `proteinPace` (`MealPaceState.status` has no "≥15 g short" case). Three assertions that were negative-only (`expect(r.context).not.toBe("post_workout")`, with no positive counterpart) gained the positive `.toBe("next_meal")` alongside the existing negative, matching the stronger pattern already used elsewhere in the suite — a negative-only assertion passes for *any* other context, not just the correct fall-through.
- **Explicitly not changed, per the review's judgment:** `recommendEatNext` was not decomposed into per-context handler functions (six sequential guards numbered to spec §5.3.1–6, read top-to-bottom in the spec's own order, over six signatures plus a dispatch array); the threshold tests were not table-driven (each needs different input plumbing, and a table would hide that); the reason-string regex assertions were left as-is (they assert behavior derived from input, not literal wording); the raw enum values left in reason copy (`next: ${slot}`, `Nothing in the library fits ${slot}`) stay as the plan wrote them — a cosmetic convention, not worth a copy change outside the plan; `rank()`'s `[...cands]` defensive copy stays.
- **Final state after this round:** 142/142 Jest tests passing (35 in `eatNext.test.ts`, up from 31), `tsc --noEmit` 0 errors. The full mutation battery — the original 10, the 2 structural reverts, plus these 4 new ones (16 total) — was re-run end-to-end against the final code: each mutation applied individually, confirmed to fail the suite, then reverted; tree confirmed clean after the last revert.

### Task 2

Three corrections to the plan's Task 2 text were pre-flagged by Task 1's reviews (see the Task 1 amendment above) and applied here rather than debated fresh.

- **Correction A — call `calorieGoalHit`, don't re-inline it.** The plan's Task 2 code block (the `computeNudge` listing under "Step 3: Replace the stub") still contains the inlined predicate `calorieGoal != null && calorieGoal > 0 && dayTotals.calories >= calorieGoal`, unchanged from when it was originally written — the Task 1 amendment flagged this as a required deviation for whenever Task 2 executed, and this is that execution. The implemented `computeNudge` calls `calorieGoalHit(goals, dayTotals)` instead, drops the now-unneeded `calorieGoal` local, and leaves `calorieGoalHit` unexported (module-private, no consumer outside `eatNext.ts`). The `nowMinutes > windowEndMinutes` check stays inline, per the correction's own instruction — it isn't shared with anything else in the module.
  - **Empirical finding beyond what the correction anticipated:** mutation-testing "drop the `calorieGoalHit` call" against `recommendEatNext`'s public output (rather than against `computeNudge` directly, which isn't exported) produced **zero test failures** — all 48 `eatNext.test.ts` tests still passed with the check removed. Root cause, verified by tracing the call sites: `recommendEatNext` calls `computeNudge(input)` once, unconditionally, near the top of the function (before context resolution), then separately evaluates the *same* `calorieGoalHit(goals, dayTotals)` predicate at its own context-detection step 2. Whenever that predicate is true, step 2's `goal_hit` branch is taken (or step 1's `after_window` branch, if also past `windowEndMinutes` — in which case `computeNudge`'s own `nowMinutes > windowEndMinutes` guard already returns null first), and both of `goal_hit`'s early returns hardcode `nudge: null` in the returned object, overriding whatever `computeNudge` computed. Since both call sites read the identical `goals`/`dayTotals` off the same `input` object with no mutation in between, `calorieGoalHit`'s truth value inside `computeNudge` can never diverge from the outer branch's — so through the exported API, the check is unreachable in a way that changes output; it is an equivalent mutant, not a load-bearing guard. It is still correct to keep: it makes `computeNudge` correct as a standalone unit (defensive invariant — "never nudge when the goal is hit" holds even if a future refactor calls or extracts `computeNudge` independently of the context chain, e.g. if Task 6's service were ever changed to call it directly instead of consuming `result.nudge`), and removing it would be a regression in code-level correctness even though today it is a regression in nothing test-observable. This is reported rather than silently worked around: no test in the suite kills this specific mutation, and none can, short of exporting `computeNudge` for direct unit testing — which the task's constraints explicitly forbid ("Do NOT export `calorieGoalHit`"; the same architectural reasoning extends to `computeNudge` itself, which stays private by the same "Decided here... the engine never touches expo-notifications" contract Task 1 established). The `it.each` "goal hit" row was still strengthened (see below) to at least test the intended combination correctly, even though it cannot isolate this one guard.

- **Correction B — the docstring's justification was rewritten, behavior unchanged.** The plan's docstring for `computeNudge` claimed "The nudge references the top recommendation the SAME result computes, so message and ranking cannot disagree" — false: `computeNudge` runs before the context chain and re-derives its own catch-up-band pick independently, so in `post_workout`/`emergency`/`next_meal` contexts the nudge body can name a different meal than `recommendations[0]`. Per the plan's explicit instruction, the **behavior was not changed** (the plan's own test, `"nudge fires even when the surfaced context is post_workout (independent decisions)"`, encodes this independence as intended design and is included verbatim). The docstring was rewritten to state the independence and its rationale: the nudge fires later, while the app is closed, as a static message about closing a calorie gap, so a meal sized to close that specific gap is the right content — not whatever context happens to be current when the notification is scheduled (a small `next_meal` bridge snack would not close a 650 cal gap). Spec §5.6's "the top recommendation" is read, per the plan's instruction, as "the top recommendation *for closing the gap*" — exactly what the independent catch-up-band ranking produces. No disagreement with this ruling was found after reading spec §5.6 and Task 1's code; behavior stands as the plan wrote it.

- **Correction C — added the positive companion assertion.** `eatNext.test.ts`'s existing catch_up `gap > 0` guard test (0-calorie candidate, `catchUpAmount: 0`) previously asserted only `expect(r.context).not.toBe("catch_up")`. Added `expect(r.context).toBe("next_meal")` alongside it, matching the stronger pattern already used elsewhere in the suite (a negative-only assertion passes for any other context, not just the correct fall-through).

**Nudge-constant edge tests (spec §10: "threshold edges for every §5.7 constant") — six mutations, mutation-tested individually against the full suite, each applied then reverted:**

1. `gap < NUDGE_MIN_GAP_CAL` → `gap <= NUDGE_MIN_GAP_CAL` — **killed**, exactly 1 failure (`"gap exactly 250 still nudges (the minimum is inclusive)"`).
2. `fireAt <= nowMinutes` → `fireAt < nowMinutes` — **killed**, exactly 1 failure (`"a computed fire time landing exactly on now still bumps forward, not left in place"`), which pins the `atMinutes === null` branch at `nowMinutes = windowEndMinutes − EMERGENCY_CHECK_BEFORE_END_MIN` (chosen so the unbumped `fireAt` collides exactly with `nowMinutes`).
3. `fireAt > windowEndMinutes` → `fireAt >= windowEndMinutes` — **killed**, exactly 1 failure (`"a fire time landing exactly on windowEnd still nudges (the cap is inclusive)"`), which overrides `mealTimesMinutes.dinner` to place the milestone-plus-offset fire time exactly on `windowEndMinutes`.
4. `nowMinutes > windowEndMinutes` → `nowMinutes >= windowEndMinutes` (in `computeNudge`) — **not killed; the guard is wholly redundant, not merely equivalent under `>=`.** All 48 tests still passed with this mutation applied. Proof: after the `fireAt <= nowMinutes` bump step, `fireAt > nowMinutes` is a hard invariant (either `fireAt` came from `atMinutes + 20` with `atMinutes > nowMinutes` by construction of `nextSlot`'s filter, or it was just forced to `nowMinutes + 20`). So whenever `nowMinutes >= windowEndMinutes`, `fireAt > nowMinutes >= windowEndMinutes` forces the later `fireAt > windowEndMinutes` check to return null regardless of this guard — for every input, not just the `>=` boundary tested here. This proof generalizes past the specific mutation: **deleting the guard outright** (not just relaxing `>` to `>=`) produces identical output for every input, since the downstream clamp already subsumes it entirely. The `"now exactly at windowEnd never nudges"` test still asserts the correct (`null`) result at the boundary, but cannot distinguish either mutation from correct code, since all three (correct code, `>=`, and outright deletion) produce `null` there. Documented here rather than replaced with a synthetic test engineered to defeat the proof. **Independently confirmed** by the spec-compliance review's 134,063-point input sweep (dense around every boundary — the goal edge, the protein-short edge, all nine `MealPaceStatus` values — with a control mutation that differed at 2,184 points to validate the sweep's own discriminating power): both the `>=` relaxation and outright deletion of this guard produced identical output at all 134,063 points. The guard is kept anyway as a defensive invariant / early documentation of intent, not because any test or proof requires it.
5. Dropping the `nudgesEnabled` check — **killed**, exactly 1 failure (`"no nudge when disabled"`, from the plan's own `it.each` block).
6. Dropping the `calorieGoalHit` check (Correction A) — **not killed; confirmed equivalent mutant**, per the finding under Correction A above. The `it.each` "goal hit" row was strengthened to set `caloriePace: { status: "behind", catchUpAmount: 300 }` explicitly (rather than leaving it at `BASE`'s `on_pace` default) so the row at least isolates the goal-hit guard from the earlier `caloriePace.status !== "behind"` guard — the original plan-text version of this row passed even before Correction A was applied, for the unrelated reason that `caloriePace.status` was still `"on_pace"`. With the strengthened row, the mutation-drop still passes 48/48, confirming the equivalence proven above rather than a test gap.

**Task 1 spot-check:** `rank()`'s sort key mutated `b.score.raw - a.score.raw` → `b.score.score - a.score.score` — re-confirmed **killed**, exactly 1 failure (`"ranks by raw, not the rounded score..."`), unaffected by this task's changes.

**Final state:** 155/155 Jest tests passing (48 in `eatNext.test.ts`, up from 35), `tsc --noEmit` 0 errors. Working tree confirmed to match the post-implementation `eatNext.ts` exactly (`diff` against a saved copy) after every mutation was reverted, before committing.

#### Second round: spec-compliance review follow-up

A spec-compliance review of the commit above passed with no must-fix deviations, independently re-verified Corrections A/B/C and both equivalent-mutant claims via a 134,063-point input grid, and caught that the plan's own `it.each` "goal hit" row (transcribed verbatim from the plan text) passed for the wrong reason before Correction A's strengthening — the same class of gap the mutation pass itself surfaced. It flagged four further observable survivors against spec §10 ("the full §5.6 nudge matrix") plus a docstring gap and a spec-ambiguity ruling.

- **Four observable survivors, each mutation-tested individually (applied, confirmed failure, reverted):**
  1. **The no-band fallback pick** (`eligible.map(...)` fallback on `inBand[0] ?? ...` at what is now `eatNext.ts:365`) — reducing it to just `inBand[0]` silently drops the suggestion clause whenever nothing lands in the ±`CATCH_UP_BAND` window, reviewer-measured to differ at 1,092 grid points. **Killed**, exactly 1 failure: new test `"falls back to the best-ranked eligible meal when nothing lands in the catch-up band"` uses a gap of 500 with a single eligible meal at 3× the gap (`1500` cal, band is 325–675), asserting the body still names that meal.
  2. **The nudge band's role preference** (`candidate(m, ["bridge"], maxPrepMinutes)` inside the in-band `.map(...)`) — replacing `["bridge"]` with `[]` makes ranking fall through to raw-descending, so a higher-raw plain meal beats an in-band `role: "bridge"` meal. **Killed**, exactly 1 failure: new test `"within the catch-up band, prefers role=bridge over a higher-raw plain meal"` puts a `role: "bridge"` meal at `raw: 10` against a plain meal at `raw: 95`, both at exactly the gap (500 cal, trivially in-band), asserting the bridge meal is named.
  3. **`caloriePace.catchUpAmount ?? 0`**, present at two call sites — `computeNudge` (now `eatNext.ts:349`) and Task 1's `catch_up`-context `gap` (now `eatNext.ts:240`). `{ status: "behind" }` with `catchUpAmount` omitted is a legitimate input (`MealPaceState.catchUpAmount` is declared optional in `mealPace.ts`), and comparisons against `undefined` are `false` the same way comparisons against `0` are, which is exactly what makes this bug-shaped. Reviewer-measured to differ at 2,184 grid points overall.
     - `computeNudge`'s copy: **killed**, exactly 1 failure. Mutating `?? 0` away (`caloriePace.catchUpAmount as number`, i.e. `undefined` flows through) makes `gap < NUDGE_MIN_GAP_CAL` evaluate `undefined < 250` → `false`, so the guard that's supposed to block the nudge no longer does — new test `"behind pace with no catchUpAmount produces no nudge (?? 0 default, not NaN)"` confirms the un-mutated code returns `nudge: null` and fails loudly (a nudge with `body: "~undefined cal to go — ..."`) under the mutation.
     - Task 1's `catch_up`-branch copy: **not killed; confirmed equivalent, for the same reason as items 4/6 above.** Every place `gap` gates context selection (`gap >= EMERGENCY_MIN_GAP_CAL`, `gap > 0`) is a `>`/`>=` comparison, and `undefined compared-to-number` is `false` exactly where `0 compared-to-number` is `false` for these specific thresholds — so with the fallback removed, control flow still lands on `next_meal`, identical to correct code. New test `"behind pace with no catchUpAmount does not enter catch_up either (gap defaults to 0)"` was added anyway, per the review's request, because it correctly pins the intended contract (a `behind` pace with an absent `catchUpAmount` must not enter `catch_up`) even though it cannot distinguish this specific mutation from its removal — the same honest-reporting-over-tautological-test standard applied to items 4 and 6.
  4. **The `title` field** — no assertion anywhere checked `EatNextNudge.title`, despite spec §5.6 ("Title/body carry the gap and the top recommendation"). Reviewer-measured to differ at 4,368 grid points. **Killed**, exactly 1 failure: `expect(r.nudge!.title).toBe("Eat something")` added to the existing first nudge test (`"fires at next milestone + offset with gap and top rec in the body"`) rather than as a new test, per the review's instruction.
  - Net: 4 new tests plus one strengthened existing assertion. 52 tests in `eatNext.test.ts` (up from 48), 159 total (up from 155).

- **Docstring caveat fixed.** The Correction B docstring justified the nudge's independence from the context chain by arguing a small `next_meal` bridge snack wouldn't close a 650 cal gap — true for the in-band pick, but silent on its own fallback path (item 1 above), which can name exactly such an undersized (or oversized) meal when nothing is in band. Added a clause: when nothing lands in the ±`CATCH_UP_BAND` window, `computeNudge` falls back to the single best-ranked eligible meal of any size, on the grounds that a concrete suggestion beats a bare number. An inaccurate replacement comment is the same defect Correction B fixed, in a new costume, so this was corrected rather than left standing.

- **Spec ambiguity found and ruled on (by the reviewer, not this task) — recorded here, not acted on in code.** Spec §5.6's sentence "fire at next milestone + 20 min — the next meal time after now, or `windowEnd − 90 min` when no meal time remains (the emergency check)" is ambiguous: read strictly, the dash-clause defines "next milestone," which would make the no-meal-time case `(windowEnd − 90) + 20` = `windowEnd − 70`. The implementation (and this task's tests) use `windowEnd − 90` with no added offset. The reviewer ruled the implementation correct and is tightening the spec sentence directly (not this task's file, to avoid a collision) — two signals cited: the plan's own gloss already reads the `windowEnd − 90` value as the fire time itself, not an input to a further `+20`, and `EMERGENCY_CHECK_BEFORE_END_MIN = 90` would be a misnomer if the actual check landed 70 minutes before window close. No code change resulted from this; `eatNext.ts` and `eatNext.test.ts` are unchanged by this finding.

**Final state after this round:** 159/159 Jest tests passing (52 in `eatNext.test.ts`, up from 48), `tsc --noEmit` 0 errors. All four new mutations applied individually, three confirmed killed (exactly 1 failure each) and one confirmed equivalent (consistent with items 4 and 6's pattern), then reverted; working tree confirmed to match the post-fix `eatNext.ts` exactly before committing.

#### Third round: code-quality review follow-up

A code-quality review returned "Ready to merge with fixes," no Critical issues, and independently reproduced all eleven prior mutation results (including both equivalence claims, in their stronger deletion form). It found one further coverage gap both prior mutation batteries missed, one reopened type hole, and flagged several documentation/hygiene items.

- **The `emergency` context's `nudge` attachment was unpinned.** `eatNext.ts`'s `emergency` return (`return { context: "emergency", ..., nudge };`) is one of four places `computeNudge`'s result is attached to a non-terminal context (`post_workout`, `emergency`, `catch_up`, `next_meal`); `post_workout`'s attachment is killed by the "independent decisions" test and `catch_up`'s by three tests, but nothing exercised `emergency`'s. Root cause: every existing `emergency`-context test left `nudgesEnabled` at `BASE`'s default `false`, so `computeNudge` always returned `null` there regardless of whether the attachment itself was wired — the field was never observed non-null in that context, by any test, in either prior round. This is a real gap, not a restatement of an equivalent mutant: mutating `nudge` to `nudge: null` in the `emergency` return **is** test-observable and was previously just untested. **Fix:** added `nudgesEnabled: true` to the existing `"emergency: past dinner + behind ≥400 → ..."` test's input (nowMinutes 20:00, gap 600 — already comfortably clears `NUDGE_MIN_GAP_CAL` and lands `computeNudge` in its `atMinutes === null` branch, `fireAt = windowEnd − 90`, well within bounds) and an `expect(r.nudge).not.toBeNull()` assertion. **Killed**, exactly 1 failure, confirmed by mutating the return's `nudge` to `nudge: null` and reverting.

- **The `it.each` `as Partial<EatNextInput>` cast reopened the type hole round 1's fixture-typing fix was meant to close.** With the cast in place, `caloriePace: { status: "behnid", ... }` inside the table compiled clean — the cast erases the literal-tuple element types `it.each` would otherwise infer, so `tsc` stopped checking the table's row shapes against `EatNextInput` at all. This is worse than a generic loosely-typed fixture: a typo'd status makes `caloriePace.status !== "behind"` true, `computeNudge` returns `null`, and `expect(r.nudge).toBeNull()` passes — a silently vacuous row, invisible to both the type checker and the test result, in a codebase where (per the repo-wide untyped-Supabase-client note this feature's fixtures already lean on) `tsc` checking a hand-built fixture's shape is the *only* validation standing between a typo and a false pass. **Fix:** replaced `it.each([...])(...)` + the inline `input(over as Partial<EatNextInput>, ...)` cast with `it.each<[string, Partial<EatNextInput>]>([...])(...)` + an uncast `input(over, ...)` call — the explicit tuple-array type annotation gives `tsc` the row shape up front without erasing it inside the callback. **Verified two ways:** (1) re-ran the full suite with the fix in place — 52/52 green, unchanged; (2) reintroduced the exact `"behnid"` typo from the review and confirmed `tsc --noEmit` rejects it with `TS2769: No overload matches this call. ... Type '"behnid"' is not assignable to type 'MealPaceStatus'. Did you mean '"behind"'?` — then reverted the typo and re-confirmed 0 `tsc` errors.

- **The catch-up band, implemented verbatim twice (spec §5.3.5), was extracted to `catchUpCandidates(eligible, gap, maxPrepMinutes)`.** Both the `catch_up` context (previously inline at what was `eatNext.ts:277-279`) and the nudge's own body pick (previously inline at what was `eatNext.ts:363-365`) filtered by `Math.abs(m.totals.calories - gap) <= gap * CATCH_UP_BAND` and mapped through `candidate(m, ["bridge"], maxPrepMinutes)` — one policy, two copies, two independent test obligations (round 2 had to add a dedicated nudge-copy test, `"within the catch-up band, prefers role=bridge..."`, specifically because Task 1's existing band tests only ever exercised the `catch_up` copy). Extracted with a docblock citing spec §5.3.5 and stating the sharing rationale; both call sites now read `catchUpCandidates(eligible, gap, maxPrepMinutes)` (the `catch_up` context directly, the nudge wrapping it in `rank(...)`). **Re-ran both band mutations against the shared function post-extraction, each applied then reverted:** the boundary mutation (`<=` → `<`) is **killed**, exactly 1 failure (`"catch_up band: exactly gap × 0.35 away qualifies..."`); the role-preference mutation (`["bridge"]` → `[]`) is **killed**, exactly 1 failure (`"within the catch-up band, prefers role=bridge..."`) — coverage did not shift or merge into a single failure in either direction; each mutation still fails only the test that targets its own call site's consumer.

- **`fireAtMinutes`'s contract documented on the interface, ahead of Task 6.** Added a doc comment to `EatNextNudge.fireAtMinutes` stating it is minutes since local midnight *on the same local day as the `nowMinutes` that produced it*, always `> nowMinutes` and `<= windowEndMinutes`, and that consumers must resolve it against that same day rather than a fresh `new Date()`. This wasn't a code-behavior gap in this task — the field has always meant this — but an undocumented cross-module invariant: today's correctness rests on `windowEndMinutes` landing before local midnight, `mealPace.ts` returning `before_window` (not `behind`) below `windowStart` so no nudge is produced overnight, and this task's own guards bounding `fireAt` to `(nowMinutes, windowEndMinutes]`. If Task 6 (not yet written) resolves the value against a freshly-constructed `Date` instead of the same day the hook computed `nowMinutes` from, a `fireAtMinutes` produced shortly before local midnight would resolve to *tomorrow* at that minute — roughly a day late — while Task 6's own "is this still in the future" check would still pass, since the miscomputed timestamp is in the future. Today's margin (the closest `fireAtMinutes` can land to midnight) is about 60 minutes on default settings; `water_window_end` (the source of `windowEndMinutes`) has no enforced upper bound, so a user configuring a 23:59 window end shrinks that margin to effectively nothing. Recorded here rather than fixed in Task 6's code, since Task 6 doesn't exist yet in this branch — the coordinator is carrying the corresponding instruction into Task 6's brief directly.

- **"fixes it in 0 min" fixed — a copy bug beyond the plan's text, recorded per the constraint on scope deviations.** `meals.prep_minutes` is `integer not null default 0` (migration `20260729100000`), so a meal saved without an explicit prep time reaches the nudge body as `"... fixes it in 0 min"`, which reads as a claim rather than the "no prep time set" case it actually is. Changed the nudge body's suggestion clause from an unconditional `` `fixes it in ${n} min` `` to a ternary: `pick.meal.prep_minutes > 0 ? \`fixes it in ${n} min\` : "is ready now"`. No test added — the review characterized this as a copy fix, not a behavior the suite needs to pin, and no existing fixture's default `prep: 5` (all `scored()` calls that don't override `prep`) would have caught either wording.

- **Three comment corrections, plus the discipline that should have caught them.** All three are the same defect class the review named directly: a comment describing what a test does, without having mutation-tested the claim.
  1. **The redundant-guards comment** (`computeNudge`'s `nowMinutes > windowEndMinutes` and `calorieGoalHit` checks) previously existed only in this plan doc, ~1,940 lines from the code it defends — a future dead-code sweep would have no in-file signal before deleting either guard. Added an in-code comment at the guards themselves, cross-referencing this amendment, stating both are unreachable-in-effect through the current call path (the caller discards the value in `goal_hit`/`after_window`; the `fireAt > windowEndMinutes` clamp subsumes the window check) and are kept only so `computeNudge` is correct standalone.
  2. **The `?? 0` fallback** on `caloriePace.catchUpAmount` (`computeNudge`'s copy) got an in-code comment explaining *why* it's the one load-bearing default in this function, in contrast to the two guards immediately above it: `catchUpAmount` is optional on `MealPaceState`, and without the fallback, `undefined < NUDGE_MIN_GAP_CAL` evaluates `false`, silently passing the guard and emitting a nudge body reading "~undefined cal to go" — round 2 mutation-tested this exact failure mode.
  3. **The `it.each` "goal hit" row's comment was backwards and overclaiming, corrected.** It previously read "leaving `caloriePace` at `on_pace` would let the nudge through anyway" — the opposite of what happens: the *earlier* `status !== "behind"` guard returns `null` first, which is exactly why the row would pass without ever reaching the goal-hit guard. It also claimed "this row isolates the goal-hit guard," disproved by this task's own round-1 finding (dropping that guard leaves 52/52 green, because `recommendEatNext` independently forces `nudge: null` whenever the same predicate is true). Rewritten to state plainly what the row actually pins — the engine-level contract "goal hit ⇒ no nudge" — and that it does not isolate the guard, with a pointer to the Correction A finding for the proof. **Discipline going forward, stated explicitly per the review's instruction:** before writing a comment claiming a test isolates a specific guard or branch, kill-test that guard first — this is the third instance of a comment misdescribing its own code in this feature (the plan's original `computeNudge` docstring claiming the nudge references `recommendations[0]`; its Correction-B replacement, which then failed to cover its own out-of-band fallback path; and now this comment), and the fix each time was empirical, not inferential. *(Enumeration corrected by the coordinator: an earlier draft of this bullet counted the negative-only `gap > 0` assertion as one of the three, but a weak assertion is a coverage gap, not a comment misdescribing code.)*

- **Five bare `r.nudge!` assertions were given a preceding `expect(r.nudge).not.toBeNull()` guard** (the existing tests at what were `eatNext.test.ts:488, 496, 551, 591`, plus the new emergency assertion), matching the pattern already used at three other nudge tests. Without the guard, a regression that nulls the nudge on any of these paths would report `TypeError: Cannot read properties of null (reading 'fireAtMinutes')` / `(reading 'body')` instead of the clean, actionable `expect(received).not.toBeNull() — Received: null`.

- **Hardcoded threshold values replaced with their constant-derived equivalents.** `"fires at next milestone..."`'s `18 * 60` → `BASE.mealTimesMinutes.dinner`; `"no meal time remaining..."`'s `23 * 60` → `BASE.windowEndMinutes`; `"even now + offset exceeds windowEnd → null"`'s `22 * 60 + 50` → `BASE.windowEndMinutes - NUDGE_MILESTONE_OFFSET_MIN + 1`, with a comment explaining it as the boundary value ("the last minute at which `now + NUDGE_MILESTONE_OFFSET_MIN` still overshoots `windowEnd`") rather than an arbitrary literal a future constant change could silently detach from. Verified: 1360 (one minute earlier) reaches the existing "fire time landing exactly on windowEnd still nudges" case; 1361 is the first minute that overshoots — consistent with the new comment.

**Final state after this round:** 159/159 Jest tests passing (52 in `eatNext.test.ts`, unchanged — this round strengthened existing tests and added assertions rather than new `it` blocks, except the one new emergency assertion folded into an existing test), `tsc --noEmit` 0 errors. Mutation-verified: the emergency-attachment gap (killed, 1 failure), both re-run band mutations post-extraction (each killed, 1 failure, coverage unchanged), and the type-hole fix (typo rejected with `TS2769`, reverted). Working tree confirmed to match the intended post-fix `eatNext.ts`/`eatNext.test.ts` exactly (`diff` against saved copies) after every mutation was reverted, before committing.

### Task 3

The plan's 11-case block (Step 1) was transcribed verbatim and passed 11/11 on the first run — every hand-derived expectation in the plan text matched `mealPace.ts`'s actual behavior, so no correction was needed to the plan's own tests. `mealPace.ts` was not modified.

Per the task's explicit instruction, the suite was then mutation-tested against the lib (every comparison operator, boundary, constant, rounding call, branch, **and string-formatting call** — this last category was missing from the first pass's enumeration and is the reason the `padStart` survivor below was found only on review, not on the original sweep), one mutation at a time: apply, run the 11-test suite, record kill/survive, revert. Thirteen mutations survived the plan's original 11 tests; of those, ten were genuine observable survivors, closed by nine new tests (the three tolerance-boundary tests jointly close four survivors — the calorie-floor, protein-floor, and 5%-tolerance-constant mutations, plus the tolerance comparison's `<=`), and three were proven to be equivalent mutants (documented below, no test added). Two further tests were added not to close survivors but to convert two *coincidental* kills (the before/after-window boundary, previously killed only by the unrelated degenerate-window test) into direct ones — bringing the total to 11 new tests. The full battery was then re-run against the resulting 22-test suite (23 after this round's padStart fix, below) to confirm every closed mutation is now killed and every equivalent-mutant finding still holds.

**Spec review follow-up.** An independent spec-compliance review re-derived all 11 plan expectations from scratch in `node`, confirmed `mealPace.ts` byte-identical, confirmed the plan's tests were transcribed verbatim, and independently re-verified all three equivalence proofs via a 166,319-point adversarial input sweep (7 windows including inverted/degenerate, 5 meal-time sets, goals including `null`/`0`/negative, both macros; a control mutation differed at 95 points, confirming the sweep discriminates) — attacking the `Math.max(0, ...)` clamp specifically with inverted windows, degenerate windows, a milestone at-or-before now, and `currentValue` above the milestone target, none of which broke the invariant. It also traced `goal == null`'s production reachability through `useMacroGoals.ts:48-54`, which normalizes with `?? null`, confirming `undefined` is unreachable in production, not merely through the typed API. The review found one further observable survivor the original battery's enumeration missed (string formatting wasn't in the "comparison operator, boundary, constant, rounding call, branch" list) and two further equivalent mutants, closed/documented below.

**Mutation table (killed by the plan's original 11 tests, no action needed):**

| # | Mutation | Line (pre-change) | Result |
|---|---|---|---|
| B1 | `currentValue >= goal` → `>` | `mealPace.ts:100` | killed — "currentValue ≥ goal → goal_hit" (equal-value fixture) |
| C1 | `nowMin < startMin` → `<=` | `mealPace.ts:106` | killed — "degenerate window" (coincidental: `nowMin===startMin===endMin`) |
| D1 | `nowMin > endMin` → `>=` | `mealPace.ts:107` | killed — "degenerate window" (same coincidence) |
| E1 | `endMin <= startMin` → `<` | `mealPace.ts:108` | killed — "degenerate window" (falls through to a `0/0` NaN cascade, status becomes `"behind"`) |
| F1 | `windowLen = endMin - startMin` → `+` | `mealPace.ts:110` | killed, 4 failures |
| F2 | `elapsedRatio` numerator `nowMin - startMin` → `+` | `mealPace.ts:111` | killed, 5 failures |
| G1 | `expected = goal * elapsedRatio` → `+` | `mealPace.ts:112` | killed |
| H1 | `delta = currentValue - expected` → `+` | `mealPace.ts:113` | killed, 7 failures |
| J2 | `Math.max(goal*0.05, floor)` → `Math.min` | `mealPace.ts:117` | killed, 2 failures |
| M (floor variant) | ahead's `Math.round(delta)` → `Math.floor` | `mealPace.ts:120` | killed (187 vs 186) |
| behind-delta (floor variant) | `Math.round(-delta)` → `Math.floor` | `mealPace.ts:129` | killed (367 vs 366) |
| catchUp (ceil variant) | `Math.round(expectedAtTarget - currentValue)` → `Math.ceil` | `mealPace.ts:126` | killed (1133 vs 1134) |
| sort direction | `.sort((a,b)=>a.minutes-b.minutes)` → `b.minutes-a.minutes` | `mealPace.ts:56` | killed — "half-hour meal times" (two upcoming candidates, lunch/dinner) |
| O1 | `h >= 12 ? "PM" : "AM"` → `h > 12` | `formatHourLabel`, `mealPace.ts:33` | killed — "half-hour meal times" (lunch at exactly noon, h=12) |
| `timeToMinutes` | `h * 60` → `h * 61` | `mealPace.ts:27` | killed, 6 failures (broad breakage, as expected) |
| P (targetRatio numerator) | `next.minutes - startMin` → `+` | `mealPace.ts:124` | killed, 2 failures |
| expectedAtTarget | `goal * targetRatio` → `+` | `mealPace.ts:125` | killed, 2 failures |
| macro ternary | `macro === "calories"` → `"protein"` | `mealPace.ts:116` | killed — "protein floor" fixture flips which branch it hits |

**Mutation table (survived the plan's 11 tests — closed with new tests, then re-confirmed killed):**

| # | Mutation | Survived because | Closing test | Re-verified |
|---|---|---|---|---|
| A1 | `goal == null` → `goal === null` | `goal` is typed `number \| null` (no `undefined` in the signature) | **Not closed — equivalent mutant** (see below) | 23/23 pass under mutation |
| I1 | calories floor `100` → `99` | plan's floor test sits 23.3 inside the floor, not at it | "calories, floor binding: exactly at the floor…" | killed, 1 failure |
| I2 | protein floor `8` → `7` | plan's floor test sits 1.3 inside the floor, not at it | "protein, floor binding: exactly at the floor…" | killed, 1 failure |
| J1 | tolerance `0.05` → `0.06` | no test's `abs(delta)` straddles both the real and mutated tolerance | "calories, 5% binding: exactly at tolerance…" (over-boundary case) | killed, 1 failure |
| K1 | `Math.abs(delta) <= tolerance` → `<` | no test lands exactly on the tolerance boundary | all three "tolerance boundary" tests (at-boundary case) | killed, 3 failures |
| L1 | `delta > 0` → `delta >= 0` | `delta === 0` is unreachable at this branch | **Not closed — equivalent mutant** (see below) | 23/23 pass under mutation |
| M (ceil variant) | ahead's `Math.round` → `Math.ceil` | plan's fixture (186.667) has fractional ≥ .5, so round and ceil agree | "ahead delta below the midpoint rounds down…" (fractional .2) | killed, 1 failure |
| behind-delta (ceil variant) | `Math.round(-delta)` → `Math.ceil` | plan's fixture (366.667) has fractional ≥ .5, round and ceil agree | "behind delta below the midpoint rounds down…" (fractional .2) | killed, 1 failure |
| catchUp (floor variant) | `Math.round(...)` → `Math.floor` | plan's fixture (1133.333) has fractional < .5, round and floor agree | "catch-up amount at/above the midpoint rounds up…" (fractional .533) | killed, 1 failure |
| Q | `Math.max(0, Math.round(...))` clamp dropped | unreachable given inputs reachable through the public API | **Not closed — equivalent mutant** (see below) | 23/23 pass under mutation |
| N1 | milestone filter `c.minutes > nowMin` → `>=` | no fixture has a meal time exactly equal to `now` | "a meal exactly at now has already passed…" | killed, 1 failure |
| N2 | milestone filter `c.minutes <= windowEndMin` → `<` | no fixture has a meal time exactly equal to `windowEnd` | "a meal exactly at windowEnd is still a reachable milestone…" | killed, 1 failure |
| O2 | `h === 0 ? 12 : ...` → wrong display value | no fixture's clock time lands at midnight/hour-0 | "midnight wraparound: hour 0 displays as 12, not 0" (`windowEnd: "24:00"`) | killed, 1 failure |
| padStart | `String(m).padStart(2, "0")` → `String(m)` | no fixture has a single-digit minutes value on a meal-time label (12:30/12:05's ":30"/":05" are the only minute-bearing labels, and 30 is two digits already; a 12:05 fixture wasn't present until this fix) | "single-digit minutes are zero-padded" (lunch at 12:05, added per spec-compliance review) | killed, 1 failure |

**Provenance note (spec-compliance review finding, not a code change).** The O2 closing test's `windowEnd: "24:00"` fixture is DB-reachable but not app-reachable: Postgres accepts `"24:00:00"` for the `water_window_end TIME` column and it passes the `water_window_end > water_window_start` CHECK, and `useMacroGoals.ts`'s `.slice(0,5)` passes `"24:00"` through unchanged — but `GoalsScreen.tsx:55` derives the window-end string from `d.getHours()` (always 0–23), so the app's own UI can never produce it. The review also closed both alternative routes into the `h === 0` branch: a `00:00` meal time is pickable but can never be *selected* as a milestone (`c.minutes > nowMin` can't hold for `0`), and `windowEnd: "00:00"` is rejected by the same CHECK constraint. So `mealPace.ts:34`'s `h === 0 ? 12` is a real branch of a shipped lib, reachable only via an out-of-band DB write, not through the app itself — the test's in-code comment and this note now say so plainly rather than calling the input merely "unusual." `mealPace.ts` was not changed; the dead-under-app-input branch is being carried to the code-quality review as a separate finding.

**Equivalent mutants (no test added — proofs):**

1. **A1 — `goal == null` vs `goal === null`.** `ComputeMealPaceOpts.goal` is typed `number \| null`; the function signature admits no `undefined`. `tsc` on the call sites (this repo's only shape check on hand-built fixtures, per the untyped-Supabase-client note) rejects any attempt to pass `undefined` as `goal`. Since `==` and `===` against `null` differ only on `undefined`, and `undefined` cannot reach this line through the typed API, the two are behaviorally identical for every input the public API can produce. Re-confirmed against the final 23-test suite: 23/23 pass under the mutation.

2. **L1 — `delta > 0` vs `delta >= 0`.** This branch is only reached after `Math.abs(delta) <= tolerance` has already returned `on_pace` (line 119) for `false`. `tolerance` is `Math.max(goal * 0.05, floor)` with `floor` either 100 or 8 — always strictly positive since `goal > 0` is already guaranteed by the earlier `goal <= 0` guard. So `delta === 0` implies `Math.abs(0) === 0 <= tolerance` (tolerance > 0), which always returns `on_pace` first — `delta` can never be exactly `0` at line 120. `delta > 0` and `delta >= 0` therefore agree on every reachable input. Re-confirmed: 23/23 pass under the mutation.

3. **Q — the `Math.max(0, ...)` clamp on `catchUp`.** This is reached only inside the `behind` branch, i.e. only when `delta < -tolerance` (so `currentValue < expected - tolerance < expected`, using `tolerance > 0`). `nextMilestone` only ever returns a milestone at `next.minutes >= nowMin` (either a candidate strictly `> nowMin`, or the `windowEndMin` fallback which is `>= nowMin` because the earlier `nowMin > endMin` guard already returned `after_window` otherwise). Since `windowLen > 0` (guarded at line 108) and `targetRatio = (next.minutes - startMin) / windowLen`, `next.minutes >= nowMin` implies `targetRatio >= elapsedRatio`, hence `expectedAtTarget = goal * targetRatio >= goal * elapsedRatio = expected > currentValue`. So `expectedAtTarget - currentValue > 0` on every input that reaches this line — the `Math.max(0, ...)` floor can never actually clamp anything through the public API. Re-confirmed: 23/23 pass under the mutation (dropping the `Math.max` call outright, i.e. `Math.max(0, X)` → `X`). The independent spec-compliance review additionally attacked this claim with an adversarial input sweep specifically targeting the counterexamples this proof depends on — inverted windows, degenerate windows, a milestone at or before `now`, and `currentValue` above the milestone target — and found none that clamp, over 166,319 grid points.

4. **`parseInt(s, 10)` vs `parseInt(s)` (`timeToMinutes`, `mealPace.ts:26`) — found by the spec-compliance review, independently re-confirmed here.** Every fixture's time string (`"08:00"`, `"12:00"`, `"18:00"`, `"12:05"`, `"12:30"`, `"20:00"`, `"24:00"`) splits on `:` into two-digit numeral substrings with no leading-zero ambiguity that the radix argument would resolve differently — `parseInt("05")` and `parseInt("05", 10)` agree in every modern JS engine (the legacy octal-detection behavior the radix argument guards against only ever applied historically to strings JS itself doesn't reach here). The two would differ only for a colon-less time string (e.g. parsing `"0800"` as one token instead of splitting on `:`), which neither the app's time picker nor a PostgREST `time` column's rendered value can produce. Re-tested: 23/23 pass under the mutation.

5. **`(m || 0)` vs `m` (`timeToMinutes`, `mealPace.ts:27`) — found by the spec-compliance review, independently re-confirmed here.** `m` is always the result of `parseInt` on the substring after `:`, i.e. always a number (never `undefined`) for any string containing a `:`, and `0 || 0` evaluates to `0` regardless, so the `|| 0` fallback changes nothing even at the one value (`m === 0`) where `||`'s falsy-coercion behavior could in principle matter. It would only diverge from bare `m` if `m` could be `NaN` (from a malformed, colon-less minutes segment) — again not producible by the picker or a `time` column. Re-tested: 23/23 pass under the mutation.

**Timezone sensitivity:** none found. `computeMealPace` reads `now.getHours()`/`now.getMinutes()` (local time), and the test file's `at()` helper constructs dates with the local `Date(y, m, d, h, min)` constructor — both sides interpret "now" in the machine's local timezone consistently, so no test's pass/fail depends on which timezone the runner executes in. The one deliberately unusual fixture (`windowEnd: "24:00"`, i.e. 1440 minutes) is pure integer-minutes arithmetic with no `Date` object involved on that side, so it isn't a timezone concern either.

**Final state:** 182/182 Jest tests passing (7 suites; 23 in `mealPace.test.ts`, up from the plan's 11), `tsc --noEmit` 0 errors. `mealPace.ts` confirmed byte-for-byte unmodified — `git diff 9572b9f..HEAD -- mobile/src/lib/mealPace.ts` returns empty.

**Mutation ledger (both rounds combined), each mutation individually applied to a working-tree copy, run, recorded, then reverted with `git checkout --`, never left in place:**

- **34 distinct mutations exercised: 29 killed, 5 proven equivalent, 0 open.**
- Of the 29 killed: 18 were killed immediately by the plan's original 11-test suite (2 of those 18 — C1 and D1 — only coincidentally, via the unrelated degenerate-window test); 10 were survivors closed by round 1's new tests; 1 (`padStart`) was a survivor closed by round 2's new test.
- Of the 5 equivalent: 3 found and proven in round 1 (A1, L1, Q); 2 more (`parseInt` radix, `m || 0`) found by the spec-compliance review and independently re-derived and empirically re-confirmed here in round 2.
- **12 new tests were written in total**, taking `mealPace.test.ts` from the plan's 11 to 23: 11 in round 1 (9 closing genuine survivors — one test each for M-ceil/behind-ceil/catchUp-floor/N1/N2/O2, plus 3 tolerance-boundary tests that jointly close 4 survivors, I1/I2/J1/K1 — and 2 direct window-boundary tests that convert C1/D1 from coincidental kills into direct ones, without adding new mutation coverage), plus 1 in round 2 (`padStart`).

**Tally note.** An earlier draft of this amendment's opening paragraph said "eleven observable survivors... closed with 11 new tests," conflating two different counts: the survivor table listed 13 rows, of which 3 are equivalent mutants (not survivors) and 10 are genuine survivors closed by 9 tests; the other 2 of the original 11 new tests are the window-boundary cases described above, which don't close survivors at all. Corrected above, and re-tallied to 34/29/5 after this round's additions. This number differs from a "36 exercised / 31 killed / 5 equivalent" figure floated mid-review; that figure isn't reproduced here because it doesn't correspond to any mutation list this task actually applied and verified — every count in this document traces to a specific `git checkout`-reverted edit recorded above, and 34/29/5 is what that ledger sums to.


**Coordinator addenda after the code-quality review (Task 3).** The review re-derived the 34/29/5 ledger from the tables above and confirmed it reconciles exactly (18 + 10 + 1 = 29 killed; 3 + 2 = 5 equivalent; 11 + 1 = 12 new tests taking 11 → 23), then ran an independent 41-mutation battery: **36 killed, 5 survived, and the 5 were exactly the 5 disclosed equivalents — no undisclosed survivors.** Seven of its mutations were not in this amendment's enumeration and all died (`goal <= 0` → `< 0`; `Math.round(-delta)` → `Math.round(delta)`; `upcoming.length > 0` → `>= 0`; `h > 12` → `>= 12` in the display ternary; dropping `% 24`; `totalMinutes % 60` → `% 30`; `if (m === 0)` → `if (m !== 0)`). All five equivalence proofs were also confirmed analytically, not just empirically — including the observation that the `==`/`===` proof correctly rests on `undefined` being unreachable rather than on the operators being equivalent, and that the `parseInt` radix case is the strongest of the five since ES5 removed octal parsing.

Three follow-ups from that review, applied here:

- **The 5%-binding tolerance test was missing the sanity assertion its two floor-binding siblings carry.** It asserted the 5% term was binding only in a comment, and it is the *sole* killer of a `0.05 → 0.06` mutation — so editing its `goal` from 2300 to anything where 5% falls under the 100 cal floor would silently convert it into a third floor-binding test under a name claiming otherwise, unpinning `TOLERANCE_PCT` with no failure anywhere. `expect(tolerance).toBe(goal * TOLERANCE_PCT)` added.
- **`mealPace.test.ts`'s one formula-mirroring expectation was replaced with a literal.** The ahead-delta assertion read `Math.round(800 - (2300 * 4) / 15)` — re-expressing the lib's own arithmetic — while every sibling asserts a literal with the derivation in a comment. Now `expect(r.delta).toBe(187)`. It was verified non-vacuous either way (it is the sole killer of the ahead-`round` → `floor` mutation), but a characterization test that recomputes the implementation's formula pins less than one that states the answer.
- **The `h === 0 ? 12` branch is NOT dead code awaiting cleanup — reframed.** An earlier reading of the spec review treated it as a removal candidate. That is wrong: the identical expression exists at `GoalsScreen.tsx:50` where it *is* reachable, because `h === 0 → 12` is simply correct 12-hour-clock formatting. `formatHourLabel` is a general-purpose formatter; deleting the branch would make it incorrect for an input it may legitimately receive later. The accurate description is "correct, currently unexercised by app-producible input" — no cleanup task is warranted, and the `"24:00"` characterization test earns its place by killing two mutations (`? 12` → `? 0`, and dropping `% 24`).

**Deferred finding, out of scope for Phase 3 (do not act on it in this plan):** `mealPace.ts` does not export its tolerance percentage or its two macro floors, so the test declares local stand-ins for them. That is the right call while the lib is frozen, and it is what makes the `0.05 → 0.06` mutation detectable at all — but it makes `mealPace.ts` the outlier among its siblings: `mealScore.ts:21-31` exports `COMPONENT_MAX` with an explicit comment saying it is exported *so consumers don't re-declare it*, and `rampProgress.ts` and `eatNext.ts` take the same stance. A future task should export `TOLERANCE_PCT` and the two floors from `mealPace.ts` and have the test import them. Also note for future readers: `useMacroGoals.ts`, cited above, lives at `mobile/src/components/track/meals/useMacroGoals.ts`, not under `src/hooks/`.

### Task 4

The SQL was written byte-for-byte as the plan specifies (md5 `fcd7afe6ae6cc46e2b6f39edee659cff` before the comment expansion below) and **not applied** — Task 11 remains the owner gate. Because the file drops two objects from the only copy of the owner's real data, both reviews were directed at re-verifying spec §9's 2026-07-29 assertions rather than trusting them. Findings, all independently reproduced by the spec reviewer:

- **Both views are genuinely unconsumed, including via dynamic access.** A repo-wide grep with no extension filter returns only: the two definitions (`20250206_tracking_tables.sql:350,364`, re-created identically at `20250208_complete_tracking_schema.sql:278,291`), the 2025 security pass (`20251031000001_fix_security_definer_views.sql:8,10,17,19` — `ALTER VIEW … security_invoker` and `COMMENT ON VIEW`), this migration, and doc mentions in the spec and plan. Zero hits in `mobile/src`, `mobile/app`, `scripts/`, or `.github/`. The review went further than a name grep and ruled out indirect access four ways: it enumerated **every distinct `.from("…")` literal in the app (27 tables)** — neither view appears; confirmed the only three `.rpc()` targets are `consume_inventory_units` / `refund_inventory_units` / `set_active_ramp_level`; confirmed there is no template-literal, variable, or property-access argument to `.from()` anywhere in the codebase; and confirmed no view-name constant or config object exists.
- **No dependent objects, and nothing is even orphaned.** Both are single-table `SELECT … GROUP BY` aggregates over base tables — no nesting, no function/trigger/index involvement, and no `grant`/`revoke`/`policy` statement anywhere in `supabase/migrations/` names either view. The `security_invoker` reloption and the `COMMENT ON VIEW`s are attributes *of the view object*, so they are removed with it.
- **The drop destroys no rows and is recoverable.** This corrects the framing carried into the task: "irreversible" is true of `drop table`, not of these two objects. `meal_logs` and `water_logs` are untouched (the file contains no `cascade`, `drop table`, `truncate`, `delete`, `drop column`, or `alter column`), and the recovery SQL is already in git at the definition sites above. Recovery is forward-only — a new migration re-creating them — but it is a copy-paste.
- **The client path is strictly richer than both views, so the drop loses nothing.** `daily_nutrition_summary` exposes 5 nutrients (calories, protein, carbs, fats, sugars) plus `total_meals`; `MacroTotals` (`mobile/src/lib/mealMacros.ts:15-23`) carries all 7, adding `sodium_mg` and `fiber_g`. The staleness is verifiable rather than merely asserted: `meal_logs.sodium_mg`/`fiber_g` have existed since `20260528211349_meals_tier1.sql:17-19`, so the data was always there and the view simply never exposed it. `daily_water_summary` exposes `SUM(amount_oz)` and `log_count`; the client path at `WaterScreen.tsx:233-243` computes the same totals **and** respects `water_only_counts`, which the view ignores. The only columns not literally reproduced are the `COUNT(*)` aggregates, which are the fetched array's length.
- **Checks 3–7 confirmed:** `eat_nudges_enabled` appears nowhere else in `supabase/` or app code (a genuine add, not a no-op); `not null default false` on a base table is catalog-metadata-only in modern Postgres, cannot fail on existing rows, and leaves the existing row reading `false` per spec §8.2; both precedent quotes are exact (`20260528044049_water_pace_bonus_reminders.sql:6`, `20260528224335_meals_tier3.sql:19`); `20260729110000` sorts last in the directory, immediately after `20260729100400`; the filename matches all three places the plan expects it (the file-structure table, Task 11's pre-flight, Task 12's grep).
- **A stale premise in the spec's own grep scope, corrected.** Spec §9 and the migration comment both scoped their verification to `mobile/src` and `mobile/app` on the assumption that a legacy Next.js web tree still existed at the repo root. It does not — it was deleted in `1c05504` ("chore: remove legacy Next.js web app", 2026-07-05; 90 files, 18,060 deletions, including `types/database.ts`, which was the one plausible place a generated type could still have referenced these views). The consequence *strengthens* the safety case: that two-directory scope is now complete rather than partial, because no second consumer tree exists. The migration comment was updated to say "the whole repo" accordingly.

**Deviations from the plan's SQL:** none in the three statements. The comment header was expanded (after both reviews) to add a `-- Plan:` pointer alongside the `-- Spec:` one, to record where the dropped definitions live in git, to state that no rows are destroyed, and to explain why `cascade` is deliberately omitted — an unforeseen dependent should fail the apply loudly and roll the whole file back rather than be silently taken down with it. Rationale: the dated grep claim matches house precedent (`20260729100300` and `20260729100400` both carry dated prod-verification notes) and is falsifiable, but it can never be re-verified after the fact once the code moves on, whereas the plan amendment is the durable trail — so the file now carries both. One cosmetic fix: an em dash that began a comment line.

**One pre-flight step ADDED to Task 11 (Step 1b above): capture `pg_get_viewdef` for both views before dropping them.** Not for reconstructibility — git already covers that — but for **drift detection**. If either live definition differs from `20250206_tracking_tables.sql:350,364`, someone hand-edited these views directly in production, which undermines the "consumed by nothing" premise D6 rests on, and the apply should stop. Since this DB is not rebuildable from the repo, drift is a live possibility that no amount of static analysis can exclude. A `pg_depend` query was considered and rejected as redundant: with no `cascade`, `drop view` already fails loudly on any internal dependent, and the file applies as one transaction, so such a failure is a clean no-op rollback.

**Packaging question, resolved as-is (one file).** Both an additive feature flag and an unrelated destructive cleanup live in one migration, which sits awkwardly against the standing separate-commits-per-logical-change preference. Kept as one file: migrations here are forward-only, so undoing a view drop means writing a new migration either way — splitting buys nothing on the revert axis, costs a spec §9 and plan deviation, and doubles the owner-gated applies. The one real cost of the coupling is that the owner cannot apply the feature flag without also applying the cleanup, so that is stated explicitly as a live choice at the Task 11 gate rather than discovered mid-apply.

**Noted, not acted on:** `20251031000001_fix_security_definer_views.sql` uses bare `ALTER VIEW`/`COMMENT ON VIEW` with no `if exists`, so it is not independently re-runnable once these views are gone. Forward replay from scratch is unaffected (create → alter → drop, in timestamp order). Pre-existing condition, not introduced here. Also: `add column if not exists` is idempotent on the column *name*, not its definition — which is why Task 11's "confirm the column doesn't exist" step should be read as a type check, not merely an existence check.

### Task 5

The hook was written as the plan specifies except for the deviations below. It carries no tests by design (I/O + React; this project's Jest scope is `testEnvironment: node` and pure-TS only), so every claim here rests on static verification against `supabase/migrations/` and on reading the Phase 1/2 sources — **not** on the green typecheck, which proves nothing about names against an untyped client (`mobile/src/lib/supabase.ts` calls `createClient` with no `Database` generic).

**Correction A applied: `eat_nudges_enabled` omitted from the select, `nudgesEnabled: false` hardcoded.** The column is added *only* by `20260729110000_recommender_profile_and_view_cleanup.sql` (line 26), which is written but unapplied — Task 11 is the owner gate, six tasks away. Re-verified: `grep -rn "eat_nudges_enabled" supabase/migrations/` returns hits only in that one file (lines 6 and 26). PostgREST rejects the **entire** select when any named column is unknown (`42703` → HTTP 400), so the plan's Step-1 code would have set `profile.error` on *every* call for the whole Task 5 → Task 11 window: the hook throws, and Tasks 8 and 10 render their error states instead of a recommendation. Phase 2's Task 1 amendment records the same failure from the same cause (naming a not-yet-existing column, even as `null`, broke `logMealTemplate` for its whole pre-migration window). The omission is the fix — not a caught error, not `select("*")`, not a fallback query. `false` is both the migration's default and the correct pre-migration behavior, since nudges are opt-in. The hardcode carries a block comment naming the migration, the failure mode, and the exact three edits to make afterwards; `ProfileRow` carries a pointer to it so the absence reads as deliberate. **A `Step 4: post-apply wiring` checkbox was added to Task 11** (after its existing Step 3; no existing step renumbered or rewritten) spelling out those three edits by file, select-string, interface field, and call argument, plus the re-verify. Until that step runs the nudge path is dead code, which is stated there so it is not mistaken for a Task 6 bug.

**Every column and table this hook names, verified against a migration:**

| Reference | Defined at | Result |
| --- | --- | --- |
| `meal_logs` (`select("*")`), `.date` | `20250208_complete_tracking_schema.sql:107,110` (`date DATE NOT NULL`) | matches |
| `meal_logs.sodium_mg` / `fiber_g` (read by `sumNutrition`) | `20260528211349_meals_tier1.sql:17-19` | matches — not in the 2025 base table, so `select("*")` (not a name list) is load-bearing here |
| `profiles.target_calories` | `20200101000000_bootstrap.sql:10` (`INTEGER`, nullable) | matches |
| `profiles.target_protein_g` / `target_carbs_g` / `target_sodium_mg` / `target_fats_g` / `target_sugars_g` / `target_fiber_g` | `20260528211349_meals_tier1.sql:9-14` (all `INTEGER`, nullable) | matches — all six, exact spellings (`_g` on protein/carbs/fats/sugars/fiber, `_mg` on sodium) |
| `profiles.breakfast_time` / `lunch_time` / `dinner_time` | `20260528224335_meals_tier3.sql:9-11` (`TIME NOT NULL DEFAULT`) | matches; NOT NULL, so `ProfileRow` types them `string` and `hhmm()` cannot fault |
| `profiles.water_window_start` / `water_window_end` | `20260528044049_water_pace_bonus_reminders.sql:2-3` (`TIME NOT NULL DEFAULT`) | matches |
| `profiles.eat_nudges_enabled` | `20260729110000_…:26` — **UNAPPLIED** | correctly **absent** from this hook (Correction A) |
| `nutrition_constraints.max_prep_minutes` | `20260728100000_nutrition_preference_schema.sql:46,54` (`integer not null default 5`) | matches; `DEFAULT_MAX_PREP_MINUTES = 5` now documents that it mirrors this default and fires only when the *row* is missing |
| `workout_instances.scheduled_date` / `status` / `completed_at` | `20250211000000_training_program_schema.sql:248,253,255` | matches |
| `status = 'completed'` | CHECK is `('scheduled','in_progress','completed','skipped')` (`:253`); writers `training.ts:611-613`, `todaysWorkout.ts:250-253`, `app/workout/[id].tsx:1240-1245` all write exactly `'completed'` + `completed_at` together | correct value — the silent-no-rows hazard does not apply. (Note `todaysWorkout.ts` also writes a *separate* `completion_status` column; `status` is the right one.) |
| single-row reads without `.eq()` | `profiles`: `auth.uid() = id` select policy; `nutrition_constraints`: `unique (user_id)` + `auth.uid() = user_id` select policy (`20260728100000_…:155-158`) | safe — RLS narrows each to one row, so `maybeSingle()` cannot see a second. Same reasoning `fetchMealLibrary` documents |

**Every Phase 1/2 export the plan's code assumes, verified by reading the source:** `fetchMealLibrary(): Promise<MealLibraryData>` returns `meals: MealWithItems[]`, `conceptsById: Map<string, FoodConcept>`, `conceptIdsBySavedFoodId: Map<string, string[]>` — all three names and both `Map` types are exactly as the plan uses them (`mealLibrary.ts:31-39`). `computeMealTotals(items: MealItemWithFood[])` takes precisely `MealWithItems["items"]` (`:142`). `computeBrianScore`'s `BrianScoreInput` matches field-for-field: `prepMinutes`, `role: MealRole | null`, `tasteOverride: ConceptRating | null`, `items[].{calories, protein, servings, smallPiecesOk, concepts}`, `concepts[].{rating, requiresSmallPieces, prepIntensive}` (`mealScore.ts:78-97`), and the snake_case sources on the row types line up (`FoodConcept.requires_small_pieces` / `.prep_intensive`, `MealItem.small_pieces_ok`). `sumNutrition` is generic over `Partial<{calories, protein, carbs, fats, sugars, sodium_mg, fiber_g}>`, so a raw `meal_logs` row satisfies it, and `MacroGoals` has exactly the seven keys the hook sets (`mealMacros.ts:25-33,152-160`). `computeMealPace`'s options are `currentValue`, `goal`, `windowStart`, `windowEnd`, `mealTimes`, `macro`, plus an optional `now`, and it accepts `"HH:MM"` *or* `"HH:MM:SS"` (`mealPace.ts:70-84`) — so `hhmm()` is normalization, not a requirement. `getLocalDateString(date = new Date())` returns local `YYYY-MM-DD` built from `getFullYear/getMonth/getDate` (`mealsHelpers.ts:22-27`), which is the format `meal_logs.date` (a `DATE`) round-trips.

**No shared Brian-Score assembly helper exists, so the plan's duplication stands.** Re-checked as the plan's note instructs: the only `computeBrianScore` call sites are `MealLibraryModal.tsx:100` (the `scores` memo) and `MealBuilder.tsx:81` (single meal), and both inline the same item mapping — Phase 2 extracted nothing. This hook is the third copy, and says so in a comment.

**Defect fixed (not in the plan's code): the surfaced error was guaranteed to read `[object Object]`, with nothing logged.** PostgREST returns query errors as **plain objects**, not `Error` instances — `PostgrestError` (which does extend `Error`) is constructed only on the `.throwOnError()` path, `@supabase/postgrest-js` 2.75.0 `PostgrestBuilder.js:154`, and this client does not use it; the non-throwing path assigns `error = JSON.parse(body)` (`:127` — corrected from `:126` after review). So the plan's `setError(e instanceof Error ? e : new Error(String(e)))` took `false` on the `instanceof` and collapsed a real `{code: "42703", message: 'column "…" does not exist', hint, details}` into `Error("[object Object]")`. Combined with `errs.slice(1).forEach(console.error)` — which logs every error *except* the one that is thrown — a failing hook produced an error state with no detail and a console with no trace. That is precisely the diagnostic a 400 needs, and precisely what Correction A's window would have produced. Two minimal fixes: a `toError()` normalizer that preserves `message` (and appends `code` when present), which also covers `fetchMealLibrary`'s own raw-object re-throws; and a `console.error("useEatNext:", e)` in the `catch`, so the thrown error is logged exactly once while the `slice(1)` house idiom keeps logging the secondaries (relabelled `(secondary)`). No `as any` — the object branch narrows via `"message" in e` and a `{message?: unknown; code?: unknown}` cast in the established style.

**Second defect fixed: `order("completed_at", {ascending: false})` puts NULLS FIRST.** Postgres (and PostgREST, which inherits it) sorts `DESC` as `NULLS FIRST`, so a `status = 'completed'` row with a null `completed_at` would win `limit(1)`, yield `workoutCompletedAtMinutes = null`, and silently disable the post-workout context for the entire day even when a properly-stamped completion existed. All three current writers set `status` and `completed_at` in the same update, so this can only bite historical rows — but the failure is invisible and the fix is one chained `.not("completed_at", "is", null)`, which also makes the query say what it means.

**Third guard added: the completion must be on the same LOCAL day.** `workoutCompletedAtMinutes` is minutes since local midnight, compared against `nowMinutes`; a `completed_at` from another day is not expressible in that coordinate system. The app lets you complete an instance scheduled for a later date, so a workout with `scheduled_date = today` can legitimately carry a `completed_at` of *yesterday* — which would contribute yesterday's clock time as if it were today's and fabricate a post-workout window (e.g. finished 18:00 yesterday, opened at 18:30 today → "30 minutes post-workout"). Guarded with `getLocalDateString(d) === today`. This does **not** attempt the converse case (a workout scheduled yesterday, finished after midnight today, which the `scheduled_date = today` filter misses) — that is the spec's query shape and out of scope here.

**Deviation: one clock for the whole assembly.** The plan sampled `new Date()` twice inside `load` — once implicitly, since `computeMealPace` defaults `now` to its own `new Date()`, and once for `nowMinutes` — and called `getLocalDateString()` with no argument for a third. A single `const now = new Date()` at the top of `load` now feeds `getLocalDateString(now)`, `nowMinutes`, the same-day workout comparison, and both `computeMealPace` calls (via its existing optional `now`, whose doc comment says "for tests" but which is exactly the right seam here). Justification: pace-vs-context skew across a minute boundary is cosmetically wrong, and across local midnight the day's logs would be fetched for one date while pace was computed against another. Also makes the assembly deterministic given a fixed clock, which is what "no two surfaces disagree" (spec §6) is for.

**Deviation: a stale-response guard (`runIdRef`).** Judged worth the four lines given the actual consumers: Task 8's card refetches on focus and Task 10's screen refetches after every meal write, so a focus change during a slow reload leaves two `load()` calls in flight, and the slower one would publish an *older* recommendation computed from the day's totals from before the write — a wrong suggestion with no error to explain it. A monotonic `runId` is compared before `setResult`, before `setError`, and before `setLoading(false)`; the `console.error` deliberately stays outside the guard so a stale run's failure is still visible. Minimal and self-contained: no AbortController, no cleanup function, no change to the hook's signature or return shape.

**Assessed and left alone, now commented so the next reader does not "fix" them:**
- **`setLoading(true)` is absent from `load` on purpose.** Task 8's card spins only while `loading && !result` (plan line 1470), so keeping `loading` false on refetch is what makes it hold the previous recommendation instead of flashing a spinner on every focus and every meal write. The initial `useState(true)` covers the first load, which is the only one with nothing to show. The comment states this and points at that card.
- **The `useEffect` eslint-disable stays.** What it suppresses is precisely an *unnecessary*-dependency report: `refreshKey` is in the effect's dep array but is not read by `load`, and bumping it is the consumers' documented way to force a reload, so the dep is the entire point. The cleaner-looking alternative — moving `refreshKey` into `load`'s own `useCallback` deps and dropping the disable — would churn `refetch`'s identity for every consumer that lists it in a dep array, to delete one comment; not worth it. Worth recording: **no ESLint is configured in this repo at all** (no config file, no `eslint` dependency in `mobile/package.json`), so the directive is documentation today, not an active suppression — the comment says so, so nobody hunts for the rule that needs it.

#### Task 5 — review round 1

Spec review approved with zero must-fix defects in the code and independently re-verified all three defect diagnoses above (installed `@supabase/postgrest-js` is exactly 2.75.0; `NULLS FIRST`; the `now` seam). Two must-fixes came from the review pass itself, plus four smaller items. The `status`-vs-`completion_status` choice was also re-checked and confirmed: the reverse would be **worse**, because `completion_status` alone would match `app/workout/[id].tsx:1179-1185`'s "Save Progress" rows (`completion_status = 'completed'`, `status = 'in_progress'`, no `completed_at`) while missing `:1240-1245`'s real-but-partial completions (`status = 'completed'`, `completion_status = 'partial'`, `completed_at` set).

- **MUST FIX 1 — the retry path published an unrenderable state.** `setError(null)` ran unguarded at the top of `load`, while `loading` deliberately stays false on refetch. So from the moment retry was tapped until the request resolved, consumers saw `{loading: false, result: null, error: null}`. Traced against Task 8's card as planned: `loading && !result` is false, `error && !result` is false, then `if (!result) return null` — **the card unmounts for the duration of the retry**, and `onPress={refetch}` on that card is its only interactive path, so the affordance deletes itself when used. Fixed by moving `setError(null)` inside the `runId` guard, next to `setResult`, making `error` obey the same stale-while-revalidate rule already applied to `result`: the previous error stays on screen until a result or a fresh error supersedes it. No special case, one fewer.

- **MUST FIX 2 — the workout query missed a reachable completion; spec §6's query shape amended by coordinator ruling (not my choice).** The four-step trace, verified end to end in the code: (1) yesterday the user taps "Save Progress", and `app/workout/[id].tsx:1179-1185` writes `status = 'in_progress'`, `completion_status = 'partial'`, leaving `completed_at` null on a row whose `scheduled_date` is yesterday; (2) today `getTodaysWorkout` (`todaysWorkout.ts:65-95`) selects the latest instance for the active program and resumes it whenever `status === 'in_progress' || completion_status === 'partial'` — **with no constraint that its `scheduled_date` is today**; (3) the user finishes, and `app/workout/[id].tsx:1240-1245` stamps `status = 'completed'`, `completed_at = now()` on that row, still dated yesterday; (4) `.eq("scheduled_date", today)` misses it, so `post_workout` — one of the six contexts — silently never fires despite a workout finished minutes earlier. The coordinator ruled `scheduled_date = today` a defective expression of spec §2's "workouts completed today" rather than an independent design choice, and directed the filter to key off `completed_at` within today's **local** range. Implemented as `.eq("status","completed").gte("completed_at", startOfDay).lt("completed_at", startOfNextDay)`, with both bounds built from `now` (the assembly's single clock) via `setHours(0,0,0,0)` and `setDate(+1)` — the latter so the upper bound stays *local* midnight across a DST change — then `.toISOString()`, since `completed_at` is `timestamptz` and UTC-midnight bounds would slide the window by the machine's offset. Spec §6 carries a dated one-sentence amendment in the style of §5.6's existing clarification; the plan's Task 5 code block is left as originally written, per the standing convention that amendments record deviations rather than rewriting the plan.
  - **The same-local-day guard was removed, not kept.** The range predicate makes an out-of-range `completed_at` unreturnable, so the downstream check was dead defense. Its comment (which carried the unverifiable reachability claim called out below) went with it.
  - **`.not("completed_at","is",null)` was DROPPED.** Reason: NULL fails any range comparison under SQL three-valued logic, so a null-`completed_at` row can no longer pass the filter at all — which also disarms the `NULLS FIRST` hazard the filter was added for, since no null row can reach the `order`/`limit(1)`. Keeping it would have been redundant machinery implying a case that can no longer occur. The knowledge is preserved as a comment on the query explaining that the range subsumes both guards, so the next reader does not re-add either.

- **Reachability discipline (Task 2's third-round standard) applied to the remaining comments.** The removed guard had asserted "the app lets you complete an instance scheduled for a later date"; review could not substantiate it (the only routes to `/workout/[id]` are `TodaysWorkoutCard.tsx:186` and `workout-preview/[id].tsx:270`, itself reachable only from `TodaysWorkoutCard.tsx:174`; `program-instance/[id].tsx:345-347`'s handler is an empty stub; `[id].tsx:982` creates instances dated today; and a future-dated row cannot bootstrap into `in_progress`). It is gone with the guard. Auditing what remains: the `runIdRef` comment cited "Task 8's card refetches on focus / Task 10's screen refetches after every meal write" as fact when both files are unwritten — softened to state that this is the plan's intent, not verified code. The workout-query and Phase 2-precedent comments now cite only file:line facts read during execution (`todaysWorkout.ts:65-95`, `app/workout/[id].tsx:1179-1185` and `:1240-1245`, and the Phase 2 Task 1 amendment on `meal_logs.meal_id` at `2026-07-29-nutrition-meal-library.md:3491`, quoted rather than paraphrased from memory).

- **`brianScoreInputFor` extracted to `mobile/src/lib/mealScoreInput.ts`, with tests.** Type-only imports (`FoodConcept`, `MealWithItems`, `BrianScoreInput`), which ts-jest erases, so the module has zero runtime imports and drops straight into the `testEnvironment: node` suite — the only part of this hook that can be covered at all. **9 tests, all mutation-verified** (each mutant applied to the module, suite run, module restored and confirmed byte-identical): dropping `?? []` → 3 fail; dropping the dangling-concept `.filter` → 2 fail; swapping `requiresSmallPieces`/`prepIntensive` sources → 2 fail; swapping `calories`/`protein` → 2 fail; negating `smallPiecesOk`'s source → 2 fail; sourcing `prepMinutes` from `items.length` → 1 fail. The fixtures deliberately give every neighbouring boolean and number a distinct value, because same-valued fixtures let a swapped rename pass — the failure mode that Task 1's amendment records for its own `bridge`/`snack` fixture. Scope held: `MealLibraryModal.tsx` and `MealBuilder.tsx` were **not** touched.

- **Three smaller improvements.** (a) `toError` now folds `details` and `hint` into the message alongside `code`; for the 42703 class this correction exists for, `hint` carries PostgREST's "Perhaps you meant to reference the column …", and the surfaced `Error` is what a human actually reads while the raw logged object is not. (b) The `loading` contract moved from a `finally` comment to a doc comment on the interface field, where every consumer sees it, and states the honest consequence — no consumer can currently distinguish refetching from idle — instead of justifying the hook's semantics by one future component's render internals. (c) The profiles select list is now **derived** from `ProfileRow`: `PROFILE_COLUMNS` is an object literal checked with `satisfies Record<keyof ProfileRow, true>` and joined into the select string. This is checked in *both* directions, verified by deliberately breaking each: adding a field to `ProfileRow` alone gives `TS1360 … Property 'eat_nudges_enabled' is missing`, and adding a key alone gives `TS2353 … does not exist in type 'Record<keyof ProfileRow, true>'`. Since this client is untyped, select-string-vs-interface drift is the one column-name error class `tsc` can catch, and it is precisely the half-done edit Task 11 Step 4 invites — whose text was updated to match the new shape (two edits, one of which the compiler forces).

**Kept deliberately, per review:** the eslint-disable and its explanation (inert today, since no ESLint is configured — which the comment discloses — but the reasoning about `refreshKey` and `refetch`'s identity earns its place); `runIdRef` as the mechanism (a cleanup closure cannot neuter an imperative `refetch()`, and an `AbortController` would mean plumbing a signal through a Phase 2 file); and `load` undecomposed in this task.

**Follow-ups, all out of scope here:**
- Migrate `MealLibraryModal.tsx:102-122` (byte-identical to the extracted block) and `MealBuilder.tsx:79-97` (a cousin sharing only the innermost concept mapping) onto `brianScoreInputFor`.
- Export `mealPace.ts`'s private `timeToMinutes` — this hook's `toMinutes` duplicates it verbatim, `(m || 0)` guard included — alongside the `TOLERANCE_PCT` and macro floors already queued by Task 3's review.
- Move `computeMealTotals` out of `lib/supabase/mealLibrary.ts` to a pure home. It is the **one** blocker preventing a pure, testable `assembleEatNextInput()` from being extracted from this hook: `getLocalDateString` is *not* a second blocker, since `mealsHelpers.ts` imports only `types/track.ts` and nothing from react-native.

**Coordinator addenda after review round 2 (Task 5).** Both reviews returned ✅ with no must-fix items. Two findings worth keeping in the record because they were verified rather than asserted:

- **The DST reasoning behind the `completed_at` bounds was proven, not assumed.** The spec reviewer ran the bound construction under `America/Los_Angeles` across both 2026 transitions. `setDate(getDate() + 1)` yields local midnight on all three of 3/8 (23 h span), 11/1 (25 h span), and an ordinary day; a naive `+24h` would have **overshot into tomorrow** in spring and **excluded the day's last hour** in autumn — wrong in both directions, twice a year. Also confirmed: `.toISOString()` on a local-midnight `Date` is the correct UTC instant for a `timestamptz` comparison (UTC-midnight bounds would have slid the window 7–8 hours and pulled in yesterday evening), and `gte`/`lt` is the right half-open pair with no gap or double-count at the boundary.
- **Removing the hook's own local-day guard is safe *because* of a Task 1 guard.** A future-skewed `completed_at` later today can still be returned by the range query, but the engine's `nowMinutes - workoutCompletedAtMinutes >= 0` check rejects it. Worth knowing that the two guards are load-bearing together — deleting the engine-side one would reopen this.
- **`satisfies Record<keyof ProfileRow, true>` was verified bidirectional**, which matters because Task 11 Step 4's mechanism depends on it: a field on the interface alone gives `TS1360`, a key in the object alone gives `TS2353`, a misspelled key gives `TS2561` *with a did-you-mean suggestion*, and both edits together compile. This is strictly stronger than the `as const satisfies readonly (keyof ProfileRow)[]` array shape originally suggested in review, which would have rejected extras but let a **missing** column compile clean. The generated select string is byte-identical to the literal it replaced (12 columns, order preserved), and the key-order dependency is ES-spec-guaranteed (insertion order for non-integer string keys) rather than incidental — though select-list order is irrelevant to PostgREST anyway, so byte-identity is reassurance rather than a load-bearing property.
- **Mutation testing methodology, worth carrying forward:** the quality reviewer's first pass mis-reported one `mealScoreInput` mutant as surviving because ts-jest served a **cached compilation** inside a tight apply/run/revert loop. `--no-cache` is required for trustworthy per-mutation results. On re-run with it, all 14 mutants died — the implementer's six at exactly their reported failure counts, plus eight the reviewer designed independently (concept `.map` ignoring its id argument; `servings` hardcoded to 1; `smallPiecesOk` mis-sourced; the concept map keyed by `meal_id`; `role`↔`tasteOverride` swapped; concepts order reversed; items order reversed; `rating` pinned to a constant).

Two cosmetic items applied by the coordinator: the `toError` docstring's claim that its enriched message "gets read off a screen" was trimmed, since Task 8's card renders a fixed string and never reads `error.message` — the enrichment's real audience is the console and any future consumer. And one item was **deliberately deferred rather than applied**: `brianScoreInputFor` takes three positional arguments, diverging from the options-object style every other pure lib here uses (`assessRampProgress`, `computeMealPace`, `computeBrianScore`, `recommendEatNext`). The reviewer rated the risk contained — the two `Map` types have different value types, so transposing them will not compile — and identified the natural moment to change it as the follow-up that migrates `MealLibraryModal` and `MealBuilder` onto this helper, since a signature change costs less before three call sites exist than after. Folding it in now would have meant rewriting ~10 test call sites for style alone, so it is queued with that follow-up instead:

- **Follow-up (queued, not in Phase 3 scope):** migrate `MealLibraryModal.tsx` and `MealBuilder.tsx` onto `brianScoreInputFor` and, in the same change, convert its signature to `(meal, library: Pick<MealLibraryData, "conceptIdsBySavedFoodId" | "conceptsById">)` — `MealLibraryData` is type-only, so purity and node-Jest reachability are unaffected. (Note the amendment above describes `MealLibraryModal.tsx:102-122` as "byte-identical" to the extracted block; it is identical in logic but reads `data.conceptIdsBySavedFoodId` where the helper takes parameters.)

### Task 6

`mobile/src/services/eatNudgeService.ts` was written essentially as the plan specifies (Step 1's code block, verbatim except for one added `Correction A` doc-comment block and an expanded midnight-caveat comment — see below). `NotificationsScreen.tsx` was extended per Step 2 with two deviations from the plan's snippet, both applying Correction A and matching this file's own conventions rather than the plan's guess at them.

**Correction A applied exactly as specified: `eat_nudges_enabled` NOT added to the screen's profile `select(...)`.** `eatNudges` is seeded from `useState(false)` only, with a block comment (`NotificationsScreen.tsx`, right above the `useState`) naming the migration (`supabase/migrations/20260729110000_recommender_profile_and_view_cleanup.sql`), the 42703/HTTP-400 failure mode, and the two edits to make post-apply (add the column to the select, seed from `!!data.eat_nudges_enabled`) — mirroring the shape of `useEatNext.ts`'s existing hardcode comment (`:41-42, 297-311`) rather than inventing new wording. The toggle's `.update({ eat_nudges_enabled: value })` is unchanged from the plan: it will 42703 on every write until Task 11 lands, surfaced through the existing alert-on-failure idiom (`Alert.alert("Failed to save", error.message)`), which is honest and — per Correction A's own reasoning — never user-visible before Task 12's on-device pass, since the owner applies the migration at Task 11 first.

**`### Task 11` `Step 4: post-apply wiring` — CORRECTED in review round 1.** The initial pass claimed to have "appended a `NotificationsScreen.tsx` sub-item to the existing Step 4," but that was false: only this amendment (as a blockquote, ~300 lines from Step 4 itself) carried the third edit — Step 4's actual text at plan:1900-1904 still read "two edits" with no mention of `NotificationsScreen.tsx`. Caught in round-1 review (see below) because it's exactly the kind of gap that bites at the owner gate: anyone following Step 4 literally would wire `useEatNext` and stop, leaving the toggle seeded `useState(false)` forever — post-migration the write would succeed but the switch would visibly reset on every screen entry. **Fixed by editing Step 4's text directly** (plan:1900 region), following the precedent Task 5 set for that same step: it now reads "three edits," the third being the `NotificationsScreen.tsx` select/seed change quoted below, plus a note on `computedAt` (see Verification 6 / item 5's disposition further down) and an on-device check specific to the failure mode of forgetting edit 3 alone.

> 3. In `mobile/src/components/profile/NotificationsScreen.tsx`: add `eat_nudges_enabled` to the profile `.select(...)` string (alongside `water_reminders_enabled, water_reminder_times, meal_reminders_enabled, meal_reminder_times, meal_reminder_types`), delete the `Pace nudges … Seeded false rather than loaded from …` block comment above `const [eatNudges, setEatNudges] = useState(false)`, and change that line to seed from `!!data.eat_nudges_enabled` inside the existing profile-load `useEffect`, the same way `enabled`/`mealEnabled` are seeded a few lines above it.

Re-run `cd mobile && npx tsc --noEmit && npm test` as Step 4 directs, and the on-device checklist there now specifically calls out toggling Pace nudges off and back on to confirm the setting survives leaving and re-entering the screen.

**Verification 1 — mirrors `mealReminderService.ts`.** Read in full before writing. Family-tag shape (`data: { type: … }`), the `getAllScheduledNotificationsAsync` → filter-by-`content.data?.type` → `cancelScheduledNotificationAsync` enumeration loop, the `requestPermissions()` gate before scheduling, and the try/catch + `console.error("<fnName>:", error)` idiom are all identical between `cancelAllMealReminders`/`sendTestMealReminder` (`mealReminderService.ts:26-37, 97-122`) and `cancelAllEatNudges`/`sendTestEatNudge` as shipped. **One structural divergence, judged an improvement, not a deviation to fix:** `syncMealReminders` (`:70-91`) defers its `cancelAllMealReminders()` call until inside each branch (once in the `!enabled` early-return, once in the denied-permission path, once right before the schedule loop), whereas `syncEatNudge` calls `cancelAllEatNudges()` unconditionally as its first line. Both reach the same end state on every path (nothing stale survives), but the eat-nudge version reads the "at most one, ever" invariant directly off the function's first line rather than needing all three branches traced to confirm it — a stronger property for a family with a stricter budget (≤1 slot vs. meal-reminder's per-time-slot budget). Kept as the plan wrote it.

**Verification 2 — `requestPermissions` export confirmed.** `mobile/src/services/notificationService.ts:33`, `export async function requestPermissions(): Promise<boolean>` — name and signature match every call site (`eatNudgeService.ts`, `mealReminderService.ts`, `waterReminderService.ts`) exactly.

**Verification 3 — trigger API confirmed current.** `mobile/package.json:30` pins `"expo-notifications": "~0.32.17"`. `Notifications.SchedulableTriggerInputTypes.{DATE,TIME_INTERVAL,DAILY}` is the form used by every existing scheduler in this codebase with no exceptions: `mealReminderService.ts:55` (`DAILY`), `:112` (`TIME_INTERVAL`); `waterReminderService.ts:38` (`DAILY`), `:70` (`TIME_INTERVAL`); `notificationService.ts:193` (`DATE`); `useNotifications.ts:68` (`DATE`); `WeightScreen.tsx:202` (`DAILY`). No call site anywhere in `mobile/src` uses the older bare-trigger-object shape (e.g. `{ hour, minute, repeats: true }` with no `type` field). The plan's `DATE`/`TIME_INTERVAL` usage is the current, sole, house-standard form.

**Verification 4 — full family-tag inventory (grepped `data.*type` and `type:` across `mobile/src`, cross-checked against every `scheduleNotificationAsync` call site):**

| Family | Tag string | Defined at |
| --- | --- | --- |
| Water reminder | `"water-reminder"` (`WATER_REMINDER_TYPE`) | `waterReminderService.ts:4` |
| Meal reminder | `"meal-reminder"` (`MEAL_REMINDER_TYPE`) | `mealReminderService.ts:5` |
| Weight reminder | `"weight_reminder"` (inline literal, no named const) | `WeightScreen.tsx:199` |
| Event reminder | `"event_reminder"` (inline literal, no named const) | `notificationService.ts:187` |
| Eat nudge (new) | `"eat-nudge"` (`EAT_NUDGE_TYPE`) | `eatNudgeService.ts` (this task) |

All five are distinct strings; `cancelAllEatNudges`'s `n.content.data?.type === EAT_NUDGE_TYPE` filter cannot match any other family's scheduled notification, so the family-scoped cancel is provably scoped. Noted for the record, not fixed here (out of scope/file-list): the family naming is inconsistent (hyphen vs. underscore) and two of the four existing families inline their tag string at every call site rather than naming a constant — `eat-nudge` follows the newer, better `water`/`meal` convention (named `SCREAMING_SNAKE` const, hyphenated string), consistent with "mirror the house pattern" reading `mealReminderService.ts`/`waterReminderService.ts` as the pattern to mirror over the two older ad hoc call sites.

**Correction (round-1 review): a 9th scheduler exists and was missing from the inventory above.** `useNotifications.ts:61`, the SNOOZE action's re-schedule (`Notifications.scheduleNotificationAsync` inside `addNotificationResponseReceivedListener`'s `actionIdentifier === 'SNOOZE'` branch), was not counted as a distinct family because it carries no tag of its own — `data: notification.request.content.data` (`useNotifications.ts:65`) copies whatever `data` object the ORIGINAL notification had, so a snoozed copy is tagged transitively with its source family's string. Checked reachability: the handler at `useNotifications.ts:41-48` only reaches the `SNOOZE` branch after reading `eventId` off `notification.request.content.data?.eventId` and early-returning `if (!eventId) return`, and only `event_reminder` payloads (`notificationService.ts:184-188`) carry an `eventId` — so in practice only `event_reminder` notifications can ever be snoozed, and a snoozed one is still tagged `event_reminder`. This does not add a 6th distinct tag string to the table above; it means `event_reminder` has two producers instead of one. Consequence carried into Task 7's brief: its family-scoped `event_reminder` cancel will correctly sweep snoozed copies too, since they carry the identical tag.

**Verification 5 — anchors found by content, not line number; `userId` sourced correctly.** The plan's `~:257-285` had already drifted (actual meal-reminders card block is `NotificationsScreen.tsx:484-554` pre-edit); the sibling card was placed by matching the closing `)}\n            </View>\n          )}` of the meal-reminders `{!loading && (...)}` block, directly before `</ScrollView>`. Local component names matched exactly as used by both existing cards: `styles.card` / `styles.cardHeaderRow` / `styles.cardTitle` / `styles.cardSubtitle` / `Switch` with the same `trackColor`/`thumbColor` shape (new accent `#A855F7`, distinct from water's `#3B82F6` and meal's `#F97316` — checked against `waterUnits.ts` and both existing cards, no collision) / `styles.timesSection` / `styles.testButton` / `styles.testButtonText` / `BellRing`. **`userId` does not exist as a variable anywhere in this file** — the plan's `handleEatNudgesToggle` snippet assumed one (`.eq("id", userId)`), which would not have compiled. Every existing handler (`persist`, `persistMeals`) instead calls `const { data: { user } } = await supabase.auth.getUser()` inline and guards `if (!user) { Alert.alert("Error", "You must be logged in"); return; }` before using `user.id`. `handleEatNudgesToggle` was written to match that exact pattern instead of the plan's snippet.

**One further convention match beyond what the plan's Step 2 text called out:** both existing cards disable their `Switch` while a write is in flight (`disabled={saving}` / `disabled={mealSaving}`) to prevent a double-toggle race during the async round trip. The plan's snippet had no equivalent. Added `const [eatNudgesSaving, setEatNudgesSaving] = useState(false)`, set around the body of `handleEatNudgesToggle` in a `try/finally`, and wired to `disabled={eatNudgesSaving}` on the new `Switch` — matching the file's actual convention rather than the plan's incomplete snippet.

**Verification 6 (original pass) — midnight edge in `syncEatNudge`: initially assessed as a latent-but-currently-unreachable gap, left unfixed. SUPERSEDED — see "review round 1" below, where this became a scope-expanded MUST FIX.** `EatNextNudge.fireAtMinutes`'s doc comment (`eatNext.ts:71-73`) is explicit: minutes-since-local-midnight on the SAME local day `nowMinutes` was computed on, and "Consumers must resolve it against that same day, not a fresh `new Date()`." **The plan's original `syncEatNudge` violated that contract** — `fireDate = new Date(); fireDate.setHours(...)` is precisely the "fresh `new Date()`" the doc comment forbids, not compliance with it (an earlier draft of this paragraph phrased that backwards; corrected here). Traced the failure mode precisely: if a decision is computed shortly before local midnight (requires `windowEndMinutes` itself to be within minutes of midnight, since `fireAtMinutes <= windowEndMinutes` is an engine invariant) and `syncEatNudge` is not invoked until after local midnight, `new Date()` resolves to the new calendar day, and `fireDate.setHours(...)` reconstructs a time on that new day — up to ~24h later than the decision intended, silently, no error. The existing `fireDate.getTime() <= Date.now()` guard does not catch this: it only detects "the target clock time already passed today," not "today is a different day than the one the decision was computed for." **Originally concluded not genuinely unsafe today**, and left unchanged, on the grounds that no call path existed yet that could trigger it (`useEatNext`'s `load()` computes `now`/`nowMinutes` and the resulting decision in one synchronous pass, and nothing in the codebase persisted an `EatNextResult` across a background/foreground cycle before calling `syncEatNudge`). Both independent reviewers in round 1 accepted that specific reachability call as correct **for today**, while noting Task 8/10 were about to create the first reachable call site — see the round-1 disposition below for the fix that landed instead of leaving this as a documented risk.

**Assess 1 — `cancelAllEatNudges` swallows its error; `syncEatNudge` proceeds regardless. Judged: pre-existing house-pattern risk, not a new defect, left as-is.** If `getAllScheduledNotificationsAsync`/`cancelScheduledNotificationAsync` throws, the `catch` in `cancelAllEatNudges` logs and returns normally, and `syncEatNudge` schedules the new nudge anyway — which could, in principle, leave two pending nudges, violating this family's stricter "≤1, ever" budget. Checked whether the house pattern differs: it does not — `mealReminderService.syncMealReminders` calls `cancelAllMealReminders()` (same swallow-and-return-normally shape) and unconditionally proceeds to the schedule loop on every path, so the identical risk already exists for the meal-reminder family today, just against a looser budget where an extra stale entry is cosmetic rather than invariant-breaking. `getAllScheduledNotificationsAsync`/`cancelScheduledNotificationAsync` failing is an expo-notifications-internal failure mode (not user-triggered, no reproduction found in this codebase or its issue-adjacent code), so the actual risk is low-probability infrastructure failure, not a design gap Task 6 introduced. Given the explicit instruction to mirror `mealReminderService.ts` "exactly," and that propagating the error here would make `eatNudgeService.ts` diverge from its own model for a risk that model already accepts, left unchanged. Worth a future decision (not made here): if the ≤1 invariant is ever load-bearing enough to justify it, `syncEatNudge` could re-run `cancelAllEatNudges()` once before the final schedule call, or `cancelAllEatNudges` could return a success boolean the caller checks — neither implemented, since neither is what the house pattern does anywhere today.

**Assess 2 — `requestPermissions()` called on every resync: not a UX defect.** Read `requestPermissions` in full (`notificationService.ts:33-68`). It calls `Notifications.getPermissionsAsync()` first; when `existingStatus === 'granted'`, it returns `true` immediately without calling `requestPermissionsAsync()` at all — no native prompt on the common repeat-call path. When status is `'denied'`, it does call `requestPermissionsAsync()` again, but both iOS and Android suppress a second system permission dialog once the user has answered once (platform behavior, not app code) — the call resolves with the existing denied status rather than re-prompting. So even in the denied case, a resync storm (Task 8's card resyncing on every load + every focus, per its plan description) cannot produce repeated OS prompts. The one real cost found: on iOS, a granted call still re-runs `Notifications.setNotificationCategoryAsync('event', […])` every time (`:48-64`) — idempotent (re-registering the same category is a no-op from the user's perspective) but wasted work on every resync, unrelated to eat-nudge specifically since it fires for every family's `requestPermissions()` call today. Not fixed: it's pre-existing, out of this task's file list (`notificationService.ts` is explicitly Task 7's, not Task 6's), and not a UX defect.

**Assess 3 — no test coverage possible for `eatNudgeService.ts` itself; confirmed, not worked around. The one piece of pure logic inside it WAS since extracted and tested — see "review round 1" below.** `jest.config.js`: `testEnvironment: "node"`, `roots: ["<rootDir>/src"]`, `testMatch: ["**/__tests__/**/*.test.ts"]` — note precisely what these settings do and don't do: they do **not** by themselves scope the suite to pure-TS libraries (a test file placed at `src/services/__tests__/eatNudgeService.test.ts` would be matched by `testMatch` and would run); what makes `eatNudgeService.ts` untestable is that it imports `expo-notifications` at module scope, which fails to load under `testEnvironment: node` with no React Native mocks configured — so importing the module at all, before any test body runs, throws. Confirmed by precedent — neither `mealReminderService.ts` nor `waterReminderService.ts`, both years-old and in the same family, has a test file. No test was added for the service itself, matching that precedent exactly. The `fireAtMinutes` → `Date` conversion (the exact midnight-edge logic in Verification 6) was originally left in-line and un-extracted, flagged as a follow-up, because of this task's explicit file-touch list. The coordinator's round-1 review authorized exactly this extraction as a scope expansion — see below; it is no longer a follow-up, it shipped in this task.

#### Task 6 — review round 1

Both reviewers verified the service a "genuinely faithful peer" of `mealReminderService.ts`/`waterReminderService.ts` — every mirror property in Verification 1 checked byte-for-byte — and confirmed all three original judgment calls correct: the serial cancel-enumerate loop (house idiom; this family holds ≤1 pending so the loop body runs at most once), `{ok, permissionDenied?}` on `sendTestEatNudge` (family convention, not an inconsistency — both siblings' test functions return that shape beside `void`-returning cancels), and the private, non-exported `EAT_NUDGE_TYPE` (the app's only notification-response listener, `useNotifications.ts:42-48`, keys off `data?.eventId` and never inspects `data.type`, so nothing could consume an export today). The `getUser()`-inline correction, the `eatNudgesSaving` guard, reusing all seven existing style keys with zero new ones, and the `#A855F7` hardcoded-hex choice were all confirmed right. The family-tag inventory was confirmed, with the 9th-scheduler addition folded into Verification 4 above. Six items came back requiring a change; two MUST FIX safety defects, one MUST FIX UX gap, one MUST FIX error-handling gap, one authorized scope expansion, and one set of amendment/comment corrections. All are implemented; disposition below.

**1. MUST FIX — re-entrancy: `syncEatNudge` was not safe against overlapping invocations, and the ≤1-slot budget is a spec invariant (§8.1, §5.6), not a nice-to-have.** Confirmed the trace: three `await`s sit between the original cancel and schedule (`cancelAllEatNudges`, `requestPermissions`, `scheduleNotificationAsync`), each a real native-module round trip, and spec §8.1 defines two resync points (Home card after every load, MealsScreen after every meal-log write) that can genuinely overlap — Task 5's `runIdRef` exists precisely because overlapping loads are the documented expectation here. Two overlapping calls could each observe "0 pending" from their own cancel, then both schedule, leaving 2 pending. Fixed with a module-level promise chain (`eatNudgeService.ts`, `queue`/`serialize`): every exported mutation (`cancelAllEatNudges`, `syncEatNudge`) is queued through the same chain, so each queued operation's body runs only after the previous one has fully settled (success or failure), and at most one cancel-then-maybe-schedule sequence is ever in flight. The internal `cancelAllEatNudgesCore`/`syncEatNudgeCore` split exists so `syncEatNudgeCore`'s own cancel step calls the core function directly rather than the exported, already-queued `cancelAllEatNudges` — routing an in-flight queued operation back through `serialize` would enqueue it behind itself and deadlock (traced explicitly: `queue` is reassigned to a promise that resolves only after the *current* operation finishes, so a nested `serialize` call from inside that operation would await a promise that can only resolve after itself). Explicitly NOT pushed onto Task 8/10 as a "call this correctly" convention, per the coordinator's framing: the invariant now holds regardless of caller discipline, inside the module that owns it.

**2. MUST FIX — turning the toggle ON never requested notification permission; the gap wasn't closed downstream either.** Confirmed both halves of the diagnosis by reading the code: `persistMeals` (`NotificationsScreen.tsx`, pre-fix `:283-298`) calls `syncMealReminders` after a successful write, which calls `requestPermissions()` and, on denial, alerts with an Open-Settings action, writes the flag back to `false`, and reverts local state — `handleEatNudgesToggle` had none of that. And `syncEatNudge`'s own `requestPermissions()` failure is deliberately swallowed behind `Promise<void>` (by design — see item 1's fix and the disposition below), so Task 8's eventual background resync could never surface a denial either; "Send Test Nudge" was the only discovery path, and it only renders once the toggle is already on. Fixed by adding a `value === true` branch in `handleEatNudgesToggle` (`NotificationsScreen.tsx`) that runs `requestPermissions()` after the successful DB write and, on denial, shows the identical "Notifications Disabled" + Open-Settings alert pattern already used three times in this file, writes `eat_nudges_enabled: false` back, and reverts `setEatNudges(false)` — mirroring `persistMeals` exactly. Per the coordinator's explicit instruction, `syncEatNudge` itself was NOT changed to alert: it runs on every background resync with no user gesture to attach an alert to, and permission denial is surfaced once, at the gesture that actually turned the setting on.

**3. MUST FIX — `handleEatNudgesToggle` had a `try`/`finally` with no `catch`, on top of an optimistic update.** Confirmed the hole: both explicit failure paths (`!user`, `error`) reverted correctly, but a *thrown* error (not currently reachable through `supabase.auth.getUser()`, which resolves `{data:{user:null}, error}` rather than throwing, but reachable through any future network-layer throw in that call chain) would leave `setEatNudges(value)`'s optimistic update stuck permanently ON with no alert and no DB write — exactly the failure mode an optimistic update without a catch produces. Fixed by adding `catch (error) { console.error(...); setEatNudges(!value); Alert.alert(...) }` before the existing `finally`, matching both siblings' `catch` shape (`persist`/`persistMeals`, `:170-176`/`:283-289` region pre-edit). The optimistic-then-revert order itself was kept, per the coordinator's instruction — the missing `catch` was what made it consequential, not the ordering.

**4. MUST FIX — cancel failure should stop the schedule, by a second route to the same ≤1-slot violation as item 1.** `cancelAllEatNudges` swallowing its error and `syncEatNudge` proceeding anyway (documented as Assess 1 in the original pass, judged then as "pre-existing house-pattern risk, not a new defect") is now fixed rather than left, per the coordinator's ruling that the invariant is this family's obligation regardless of what the house pattern accepts elsewhere. `cancelAllEatNudgesCore` now returns `Promise<boolean>` (true = the enumerate-and-cancel loop completed; false = it threw, logged, and the actual pending state is now unknown), and `syncEatNudgeCore` checks that result and returns early — without scheduling — when it's `false`. The public `cancelAllEatNudges` (called directly by the Notifications-screen toggle-off path) keeps the same `Promise<boolean>` return, queued through `serialize` like everything else; its caller in `NotificationsScreen.tsx` still just `await`s it and ignores the boolean, which is fine — toggle-off has nothing further to gate on a cancel outcome. Assess 1's original paragraph in this amendment is superseded by this fix; left in place above rather than deleted, since it correctly diagnoses the *original* risk and its reasoning (mirrors the house pattern; low-probability infrastructure failure) is why the coordinator had to explicitly override it rather than it being self-evidently wrong.

**5. Authorized scope expansion — `nudgeFireDate` extracted to `eatNext.ts`, made `sourceDay` required in `syncEatNudge`, `useEatNext` exposes `computedAt`.** Implemented exactly as specified:
   - `nudgeFireDate(fireAtMinutes: number, sourceDay: Date, now: Date): Date | null` added to `mobile/src/lib/eatNext.ts`, immediately after the `EatNextNudge` interface it resolves (co-located per the coordinator's instruction, "so the two can't drift"). Pure — takes `now`, never reads the clock. Returns `null` when `sourceDay` and `now` fall on different local calendar days (a `sameLocalDay` helper compares year/month/date), or when the resolved instant is not strictly after `now`. `computeNudge` and the six `recommendEatNext` contexts are byte-unchanged; this is a pure addition.
   - **Tests added to `eatNext.test.ts`** (new `describe("nudgeFireDate")` block, 9 cases): same-day resolution to the correct instant; hour/minute correctness using a fixture where hour (2) and minute (15) are numerically distinct so a transposed pair can't pass by accident; the `fireAtMinutes=0` boundary (proved to be an *always-null* case — local midnight can never be strictly after any same-day `now`, which is a real property of the function, not a gap); `fireAtMinutes=1439` (23:59, the last valid minute); a stale-decision case in the "realistic" direction (`sourceDay` a day behind `now` — documented as *also* caught by the after-now guard, so it alone doesn't prove the day-guard does independent work); a second stale-decision case with `sourceDay` a day AHEAD of `now`, specifically constructed so the naive (day-guard-less) instant would be strictly after `now` and therefore wrongly accepted — this is the case that actually isolates the day guard; the equals-now boundary (rejected — not strictly after); and 1ms on either side of that boundary (rejected / accepted respectively).
   - **Mutation-verified**, `--no-cache`, five mutants applied one at a time directly to `eatNext.ts`, suite run, file restored from a clean copy and diffed byte-identical before the next mutant:
     1. Day-guard short-circuited off (`if (false && !sameLocalDay(...))`) — **caught** (1 test fails: the day-ahead isolation case). The day-behind "realistic" case, as documented, does NOT catch this mutant by itself — confirmed by first attempting the day-guard-removal mutant with only the day-behind test in place, watching it survive, and adding the day-ahead case specifically to kill it. Left both tests in, each carrying a comment explaining which mutant it does and doesn't cover.
     2. After-now boundary changed `<=` → `<` — **caught** (the equals-now-exactly test fails).
     3. Hour/minute arguments to `new Date(...)` swapped — **caught** (4 tests fail: same-day resolution, the dedicated hour/minute-distinctness case, the 23:59 case, and the 1ms-after-now case).
     4. `sourceDay`'s Y/M/D swapped for `now`'s Y/M/D in the `new Date(...)` construction — **survived (61/61 pass), and this is expected, not a test gap.** Once `sameLocalDay` has gated execution, `sourceDay` and `now` are provably on the same calendar day at that point, so their Y/M/D components are equal by construction — the swap is a no-op under every input the guard lets through. This is the same "reachability discipline" already established in this plan's amendments (Task 5's mutation-testing methodology note): a mutant with no path to a distinguishable outcome is correctly unkillable, and forcing a test to kill it would mean testing something the code doesn't actually do (reading `now`'s date instead of `sourceDay`'s) under conditions where the two are indistinguishable.
     5. `sameLocalDay`'s `getDate()` comparison dropped (year+month only) — **caught** (the day-ahead isolation case fails: same month, different date, wrongly accepted as "same day").
   - `syncEatNudge(decision: EatNextNudge | null, sourceDay: Date)` — `sourceDay` is required, no default. `syncEatNudgeCore` calls `nudgeFireDate(decision.fireAtMinutes, sourceDay, new Date())` and bails (no schedule) on `null`; the old local `setHours`/`getTime() <= Date.now()` arithmetic is gone entirely, replaced by the single call.
   - `useEatNext.ts`'s `UseEatNextValue` gained `computedAt: Date | null`, documented on the interface field (not a comment buried in `load`), set via `setComputedAt(now)` alongside `setResult(next)` — same stale-while-revalidate rule already applied to `result`/`error`: an in-flight or failed refetch never makes `computedAt` describe a different `result` than the one on screen, because both are set together or neither is.
   - **Recorded for Task 8/10, not left implicit:** `useEatNext.ts`'s `computedAt` doc comment states outright that it exists so callers can pass it as `syncEatNudge`'s `sourceDay`, and warns explicitly against substituting a fresh `new Date()`. `eatNudgeService.ts`'s `syncEatNudge` doc comment states the same requirement from the other side. Task 11 Step 4 (corrected above) also carries a pointer to this obligation, even though `computedAt` itself needs no migration and is live today — so a reader of Step 4 while wiring the *other* two edits doesn't miss it.

**6. Amendment and comment corrections — all applied.** The false "Step 4 was already extended" sentence is corrected in place (see the Task 11 Step 4 section above — Step 4's actual text was edited, not just this amendment). The backwards "which is exactly what the plan's `syncEatNudge` does" framing in the original Verification 6 is corrected in place (the contract forbids a fresh `new Date()`; the original code did exactly that, which is a violation, not compliance) and that whole paragraph is marked superseded, pointing here. `eatNudgeService.ts`'s top-of-file comment and its `syncEatNudge` doc comment were rewritten (not just amended) to describe the current code, which no longer does fresh-`new Date()` arithmetic at all. The Jest-scope claim is corrected both in `eatNudgeService.ts`'s header comment and in this amendment's Assess 3 paragraph: `roots`/`testMatch` do not scope the suite to pure-TS files by themselves (a test file here would be matched and run); it's the `expo-notifications` import failing to load under `testEnvironment: node` that makes the service untestable. The 9th scheduler (`useNotifications.ts:61`) is folded into Verification 4 above, with the Task 7 consequence (family-scoped `event_reminder` cancel correctly sweeps snoozed copies too) noted for that task's brief. No action taken on the two "note only" items — tag-naming inconsistency across families, and `#A855F7` having no home in a shared palette file — both correctly assessed as pre-existing/legitimate and out of scope; left as-is, now on the record twice.

**Full gates after all six items:** `cd mobile && npx tsc --noEmit` → 0 errors. `cd mobile && npm test` → 8/8 suites, 200/200 tests (191 original + 9 new `nudgeFireDate` cases). Files touched beyond the original Task 6 list, per the item-5 scope expansion: `mobile/src/lib/eatNext.ts`, `mobile/src/lib/__tests__/eatNext.test.ts`, `mobile/src/hooks/useEatNext.ts` — no other engine behavior changed in any of the three. No database-connecting command was run at any point in this round; verification 3's expo-notifications version check and the family-tag inventory were both static (`package.json`, `grep`).

#### Task 6 — re-review (round 2)

Quality: ✅ ready to merge, no fixes — and independently defended the core/serialized split against the reviewer's own alternative (pre-resolving the nudge in the hook), concluding it would trade the calendar-day correctness this round's fix bought for a freshness bug, since `syncEatNudge` runs in a `useEffect` after render and a `Date` resolved earlier could already fail its own `<= now` check by the time scheduling actually happens. Spec review confirmed the serialization's four interleavings (concurrent `syncEatNudge`; `cancelAllEatNudges` interleaved with `syncEatNudge`; a rejection inside a queued op; the core/serialized split's no-self-reentry property), `nudgeFireDate`'s purity and non-mutation, and re-ran the M5 "unobservable by design" call across maximally-divergent times, DST days, and invalid-Date inputs — all confirmed. Two must-fix items came back, both applied; several smaller items applied; several recorded as observations only.

**MUST FIX 1 — spec §8.1 was documenting the pre-Task-6-review-round-1 signatures.** `docs/superpowers/specs/2026-07-29-nutrition-recommender-design.md` §8.1 read `syncEatNudge(decision: EatNextResult["nudge"])` (no `sourceDay`) and implied `cancelAllEatNudges(): void` — exactly the paragraph Tasks 8/10 will read for the resync contract, so it was missing the one parameter that exists to prevent the cross-midnight bug. Fixed with a dated, coordinator-attributed in-place amendment appended directly after the original §8.1 paragraph (same style as the existing §5.6/§6 amendments: `*(Amended 2026-07-29 during Task 6 execution, ruled by the coordinator: ...)*`), left un-rewritten per that convention. The amendment states the actual `syncEatNudge(decision, sourceDay: Date)` signature with `sourceDay` required; re-glosses "at `fireAtMinutes` (today, local)" as "on `sourceDay`, which callers must confirm is `now`'s local calendar day"; names `computedAt` (§6) as the correct argument, never a fresh `new Date()`; and states `cancelAllEatNudges()`'s `Promise<boolean>` return with why (a failed cancel must not be followed by a schedule, or the ≤1-slot budget breaks by a second route).

**MUST FIX 2 — `sameLocalDay`'s three comparisons were unevenly covered; two (plus a third the quality reviewer found independently) were killable with real inputs and weren't killed.** The original 5-mutant battery only ever varied day-of-month (`getDate()`), so dropping `getMonth()` (Jan 15 vs Feb 15, same year+day-of-month) or dropping `getFullYear()` (2025-07-29 vs 2026-07-29, same month+day) shipped green, along with a third the quality reviewer found: substituting `getDay()` (weekday) for `getDate()`. All three are now covered by dedicated tests, each constructed to isolate exactly one comparison — same on every dimension except the one under test, with the naive (guard-less) instant landing strictly after `now`, so only the targeted comparison stands between correct-reject and wrongly-scheduled:
  - Distinct date only, same year+month (kept from round 1, unchanged: Jul 30 vs Jul 29).
  - Distinct date only, same weekday+month+year (Jul 22 vs Jul 29 — both Wednesdays, 7 days apart, same July): isolates the `getDay()`-substitution mutant.
  - Distinct month only, same year+day-of-month (Feb 15 vs Jan 15): isolates dropping `getMonth()`.
  - Distinct year only, same month+day-of-month (2025-07-29 vs 2026-07-29): isolates dropping `getFullYear()`.

  **The reviewer's efficient-fix suggestion (change the existing isolating test's `sourceDay` from Jul 30 to Aug 5, "which kills the `getDay()` mutant and the year+month mutant while still killing the drop-the-guard mutant") was tried and empirically did NOT kill the `getDay()`-substitution mutant, and this is recorded rather than silently worked around.** Aug 5 differs from Jul 29 in month as well as date-of-month; a `getDay()`-substituted `sameLocalDay` that still compares `getFullYear()` and `getMonth()` correctly rejects an Aug-vs-Jul pair on the month check alone, so the weekday-vs-date defect never gets exercised — confirmed by running that exact mutant against an Aug-5 fixture and watching it survive (64/64 pass) before switching to the same-month Jul-22 fixture, which kills it. The working fixture keeps month constant (both July) and varies only date-of-month, using a date exactly 7 days off so the weekday coincides — verified with `Date.prototype.getDay()` directly, both fixtures asserted equal at the top of the test as a guard against the fixture itself drifting under a future edit. The Jul-30 test was kept alongside (not replaced), since replacing it would have silently dropped mutation coverage of the already-verified "drop `getDate()` entirely" mutant (year+month-only comparison) — that mutant is caught by Jul-30-vs-Jul-29 (same year+month, different date) but NOT by Aug-5-vs-Jul-29 (month already differs, so that mutant is masked there too), confirmed the same way.

  **Full mutation table, `--no-cache`, all 8 mutants for `nudgeFireDate` (5 from round 1 re-confirmed against the current, larger test file; 3 new from this round), each applied in isolation and the file restored byte-identical (diffed) before the next:**

  | # | Mutant | Result |
  | --- | --- | --- |
  | M1 | Day guard short-circuited off (`if (false && !sameLocalDay(...))`) | **Killed** — 4 tests fail (all four day-isolation cases) |
  | M2 | After-now boundary `<=` → `<` | **Killed** — 1 test fails (equals-now-exactly) |
  | M3 | Hour/minute arguments swapped in `new Date(...)` | **Killed** — 4 tests fail |
  | M4 | `sourceDay`'s Y/M/D swapped for `now`'s in `new Date(...)` | **Survives (64/64 pass) — expected, unobservable by construction** once `sameLocalDay` has gated execution (see round 1) |
  | M5 | `sameLocalDay` drops `getDate()` (year+month only) | **Killed** — 2 tests fail (date-isolation, getDay-isolation) |
  | M6 | `sameLocalDay` drops `getMonth()` (year+date only) | **Killed** — 1 test fails (month-isolation) |
  | M7 | `sameLocalDay` drops `getFullYear()` (month+date only) | **Killed** — 1 test fails (year-isolation) |
  | M8 | `sameLocalDay`'s `getDate()` replaced with `getDay()` | **Killed** — 1 test fails (getDay-isolation) |

  7 of 8 killed; M4 is the same provably-unobservable survivor documented in round 1 (re-verified against the current, larger suite — still 64/64 clean).

**Also applied (all four):**
- `eatNudgeService.ts`'s `queue.then(op, op)` — kept the two-argument form (not switched to `.catch(() => {}).then(op)`, to avoid an extra microtask-timing change on top of a line the reviewer already traced correctly) and added a comment explaining both outcomes are handled by the same handler, plus a note that `queue`'s own re-normalization makes the rejection branch a defensive no-op today rather than a currently-reachable path — worth keeping visible precisely because it's exactly the kind of correctness a future edit to the queue could quietly break.
- The sibling-adoption rationale (why `mealReminderService`/`waterReminderService` don't need this queue) is rewritten around the stronger reason: those services are only invoked from persist handlers already gated by a `saving`/`mealSaving` flag that disables the triggering control, so overlapping invocation there requires defeating a UI guard first — this family's two resync points are automatic (Home-card load, meal-log write), with no gesture to guard against. Phrased as a forward-looking trigger: if either sibling ever gains an automatic resync point, that's the moment it needs this same queue.
- `computedAt`'s doc comment (`useEatNext.ts`) trimmed: the cross-midnight rationale was fully re-derived in three places (`nudgeFireDate`'s doc, `syncEatNudge`'s doc, `computedAt`'s own doc); the third was cut down to the field's definition, the stale-while-revalidate pairing invariant, a pointer to `syncEatNudge` for the why, and a new one-sentence warning that it's a mutable `Date` held in hook state, not to be mutated in place.
- `NotificationsScreen.tsx`'s toggle-ON denial path now `return`s after reverting (previously fell through harmlessly only because nothing followed it in the same branch — matches `persistMeals`' equivalent branch, which does return).

**Recorded as observations, no code change (all four):** `Math.floor` on the hour in `nudgeFireDate` is redundant with the `Date` constructor's own truncation (verified, including on a DST day) — commented so it isn't deleted as dead code or chased as a coverage gap. `sendTestEatNudge` staying outside the `serialize` queue (transient possible double-pending for ~1s, accepted because neither resync point is active while the Notifications modal is open) is now stated as a reasoned choice in its own doc comment, not left implicit. The unguarded `await requestPermissions()` inside `syncEatNudgeCore` is commented as intentionally matching `syncMealReminders`' identical shape. `nudgeFireDate`'s doc comment now states explicitly that its one `new Date(` call is deterministic construction, not a clock read, so a future purity grep doesn't flag it.

**Gates after round 2:** `cd mobile && npx tsc --noEmit` → 0 errors. `cd mobile && npm test` → 8/8 suites, 203/203 tests (200 from round 1 + 3 net-new `nudgeFireDate` isolation cases — the original single "isolates the day guard" test was kept and three more added alongside it, per the Jul-30-vs-Aug-5 coverage finding above). Files touched this round: `docs/superpowers/specs/2026-07-29-nutrition-recommender-design.md` (§8.1 amendment — new to this task's touch list, added because the coordinator's fix explicitly required it), `mobile/src/lib/eatNext.ts`, `mobile/src/lib/__tests__/eatNext.test.ts`, `mobile/src/hooks/useEatNext.ts`, `mobile/src/services/eatNudgeService.ts`, `mobile/src/components/profile/NotificationsScreen.tsx`, this plan doc. No database-connecting command run.

### Task 7

Implemented exactly as the plan's Step 1 snippet specifies, byte-for-byte: `cancelAllEventReminders` added below `cancelAllNotifications`, and `rescheduleAllNotifications`'s `await cancelAllNotifications();` (with its `// Cancel all existing notifications` comment) replaced by the plan's two-line block. No deviations — this is the smallest task in the plan and needed none.

**Call-site classification (`grep -rn "cancelAllNotifications" mobile/src mobile/app`).** Three hits, all in `notificationService.ts`: the definition (`:271`, unchanged, still exported), and — after the edit — no caller at all inside `rescheduleAllNotifications` anymore (the line was replaced, not added to). Widened the search before editing (`grep -rn "cancelAllNotifications\|rescheduleAllNotifications"` across `src/` and `app/`) to find every caller of both functions, not just the one the plan named: `cancelAllNotifications` had exactly **one** call site in the entire app — the line inside `rescheduleAllNotifications` that this task replaced — plus its own definition. **No sign-out call site exists anywhere in the codebase today**, despite the plan's Step 1 text asserting "`cancelAllNotifications` itself stays exported (sign-out semantics)." Checked directly: no `signOut` call anywhere in `mobile/src`/`mobile/app` references `notificationService` or any cancel function (confirmed by grepping `signOut` filtered to files importing `notificationService`, zero hits, and by listing every file that imports `notificationService` — `NotificationSettings.tsx`, `NotificationsScreen.tsx`, `useNotifications.ts`, `eatNudgeService.ts`, `waterReminderService.ts`, `mealReminderService.ts`, `app/_layout.tsx` — none call `cancelAllNotifications`). So the global wipe currently has **zero** remaining callers post-fix; `cancelAllNotifications` is dead code from this task onward, kept exported per the plan's explicit instruction (anticipating a future sign-out path, not serving an existing one). Not removed — the plan says keep it exported, and this task's brief doesn't authorize deleting it. Consequence: verification is complete and stronger than the plan expected — there was no "sign-out call site" to leave alone; the fix's blast radius is exactly the one line it touched, with nothing left depending on the global wipe's side effect.

**Tag-coverage confirmation.** Re-grepped every `scheduleNotificationAsync`/`cancelScheduledNotificationAsync`/`cancelAllScheduledNotificationsAsync` call site across `mobile/src`/`mobile/app` (9 scheduler call sites, matching Task 6's inventory exactly — no 10th site appeared). `event_reminder` is written at exactly one point, `scheduleEventNotification` (`notificationService.ts:184-188`, `data: { eventId, eventDate, type: 'event_reminder' }`), which is the sole producer both `scheduleRecurringNotifications` and the direct single-event path in `rescheduleAllNotifications` funnel through — there is no second call to `Notifications.scheduleNotificationAsync` anywhere in the event-notification path that could omit the tag. Read `useNotifications.ts:42-61` directly (not re-derived from Task 6's account): the response listener destructures `eventId` from `notification.request.content.data?.eventId` at `:45` and early-returns `if (!eventId) return` at `:47` before either the `MARK_COMPLETE` or `SNOOZE` branch can run; the `SNOOZE` branch's `scheduleNotificationAsync` call (`:61-71`) sets `data: notification.request.content.data` verbatim (`:65`), i.e. it copies the *entire* original data object, not just `eventId`. Since the only producer of a payload containing `eventId` is `scheduleEventNotification`, and that same payload always also carries `type: 'event_reminder'`, every reachable SNOOZE re-schedule is provably tagged `event_reminder` too — confirmed by reading the code, not assumed. **No event notification is or can be scheduled untagged**; `cancelAllEventReminders` will not leave an orphaned event reminder pending.

**Trace of `rescheduleAllNotifications` for duplicates.** Read the full function (`:282-337`) post-edit. Sequence: (1) load settings, (2) `await cancelAllEventReminders()` — removes every currently-pending `event_reminder`-tagged notification (including inherited-tag SNOOZE copies, per the tag-coverage finding above), (3) early-return if disabled, (4) loop over the full `events` array passed in by the caller and call `scheduleRecurringNotifications`/`scheduleEventNotification` for each, which are the same two functions that produced every notification just cancelled in step 2 — so step 4 rebuilds the complete event-reminder state from the same source of truth (the `events` array), not from some other list that could include notifications step 2 didn't touch. No duplicates: everything cancelled in step 2 is exactly the set step 4 is about to regenerate, one-for-one, from scratch. This is unchanged from the pre-fix behavior for the `event_reminder` family itself — the fix only narrows *which* families step 2 touches, not the cancel-then-rebuild shape for events.

**Other global-wipe sites: none found.** Grepped `cancelAllScheduledNotificationsAsync` (the actual expo-notifications global-wipe primitive, as opposed to this app's `cancelAllNotifications` wrapper) across `mobile/src`/`mobile/app`: exactly one call, inside `cancelAllNotifications` itself (`notificationService.ts:273`). No other function in the app calls the SDK's global-cancel primitive directly or indirectly. The "64-slot landmine" pattern (a global cancel used where a family-scoped one was needed) exists nowhere else to fix — Task 7 closes the only instance.

**Shared-implementation recommendation: keep `cancelAllEventReminders` and `eatNudgeService.ts`'s `cancelAllEatNudgesCore` separate, do not extract a shared helper.** Read `eatNudgeService.ts` in full for the comparison (not modified). The two functions' bodies are structurally identical (`getAllScheduledNotificationsAsync` → filter on `content.data?.type === TAG` → `cancelScheduledNotificationAsync` loop, wrapped in try/catch), but three things argue against merging them: (1) **return type/semantics differ and both are correct for their family.** `cancelAllEventReminders` returns `Promise<void>` because the event-reminder family has no invariant tighter than "eventually consistent with the `events` list" — an extra stray notification that survives a failed cancel is cosmetic, corrected on the next reschedule. `cancelAllEatNudgesCore` returns `Promise<boolean>` because the eat-nudge family has a hard ≤1-pending invariant (spec §8.1/§5.6) that a swallowed cancel failure could silently violate, so its caller (`syncEatNudgeCore`) needs to know whether to bail. A shared helper would have to either drop that signal for eat-nudge (regressing a Task-6 MUST-FIX) or force it onto event-reminder's caller for no reason. (2) **Serialization differs.** `eatNudgeService.ts` wraps its cancel in a module-level `serialize` queue because its callers (Home-card load, meal-log write) are automatic and gesture-free; `rescheduleAllNotifications`'s callers are debounced off a single `useEffect` timer (see the "also assess" finding below) — a shared helper is the wrong abstraction boundary if only one caller needs to be queue-aware. (3) **House precedent already chose duplication over abstraction four times over** — `waterReminderService.ts`, `mealReminderService.ts`, `WeightScreen.tsx`, and now `eatNudgeService.ts` each inline this identical enumerate-and-cancel shape rather than sharing one; Task 6's amendment (Verification 4) explicitly noted and left the resulting inconsistencies (hyphen vs. underscore tags, const vs. inline literal) as out of scope rather than using them as a reason to refactor. Extracting a shared helper now would touch `eatNudgeService.ts` (explicitly forbidden by this task's file list) for a partial deduplication that still leaves three other near-identical loops untouched. If this is ever worth doing, it should be one dedicated task that touches all five family services at once and settles the tag-naming/const-vs-literal inconsistency at the same time — not a byproduct of Task 7's one-line fix.

**Also assess — testability.** Confirmed `notificationService.ts` cannot enter this repo's `testEnvironment: node` Jest scope, for the identical reason established in Task 6's Assess 3: it `import`s `expo-notifications` at module scope (`:1`), which fails to load under `node` with no React Native mocks configured, so the whole file throws on import before any test body runs — `roots`/`testMatch` alone don't exclude it. `cancelAllEventReminders` has no pure logic to extract: its entire body is three sequential calls into the `expo-notifications` SDK (enumerate, filter by a field access, cancel), with no computation resembling `nudgeFireDate`'s date arithmetic (the one piece of comparable logic Task 6 did extract and test). `rescheduleAllNotifications` itself already delegates its only pure computation — `calculateTriggerDate` (`:139-143`) and `formatTime` (`:342-348`) — to private, unexported functions in this same file; both predate this task, are unchanged by it, and remain untested for the same import-failure reason, not a gap this task introduced or could close within its file list. No test was added, matching Task 6's precedent exactly.

**Also assess — overlap/serialization.** Traced what actually debounces `rescheduleAllNotifications`: `app/(tabs)/schedule.tsx:110-129`, a `useEffect` that clears and resets a single `rescheduleTimer` ref on every dependency change (`events`, `selectedDate`, `loading`, `notificationSettings`, `notificationsEnabled`, `rescheduleAll`) and fires `void rescheduleAll(events, selectedDate)` fire-and-forget 500ms after the last change, with the effect's cleanup clearing any still-pending timer before the next run schedules a new one. This coalesces rapid *successive* changes into at most one *scheduled* call — but it does not prevent two *in-flight* calls from overlapping, and a second call path exists that bypasses the debounce entirely: `useNotifications.ts`'s `updateSettings` (`:114-120`, invoked from the Notifications settings toggle) calls `rescheduleAllNotifications` directly, un-debounced. If a user changes a notification setting at the same moment the Schedule screen's debounced effect fires (e.g. right after editing an event), two `rescheduleAllNotifications` calls can genuinely run concurrently, each doing cancel-then-loop-and-schedule against the same `event_reminder` tag — structurally the same overlap risk Task 6 found for `eatNudgeService` and fixed with a `serialize` queue. **Judged: a real, pre-existing risk, but not a new defect introduced by this task, and not fixed here.** This task's change swaps which tag gets cancelled (`event_reminder` instead of everything); it does not change whether two calls can overlap — that race existed identically before this fix (two concurrent calls to the old global `cancelAllNotifications` + reschedule loop were exactly as capable of duplicating/dropping event reminders as two concurrent calls to the new `cancelAllEventReminders` + reschedule loop are now). Unlike eat-nudge's ≤1-pending invariant, event-reminder has no hard slot budget — worst case of an overlap here is a duplicate or a transiently-missing reminder for one event, self-correcting on the next reschedule (daily, or on the next event/settings change), not a silently-broken invariant. Fixing it would mean adding a serialize-style queue to `rescheduleAllNotifications`, which is a real design change beyond "one new function plus one changed line" and would need its own review — recorded here as a follow-up, matching the coordinator's standing instruction to report rather than expand scope.

**Gates:** `cd mobile && npx tsc --noEmit` → 0 errors. `cd mobile && npm test` → 8/8 suites, 203/203 tests, unchanged from baseline (this task adds no test-eligible code). Files touched: `mobile/src/services/notificationService.ts`, this plan doc. No database-connecting command run at any point.

**Coordinator addenda after review (Task 7).** Both reviews returned ✅ on the code — two hunks, no changes requested. Four record corrections and one escalation:

- **ESCALATED AND FILED SEPARATELY: sign-out never cancels notifications.** The spec's premise that `cancelAllNotifications` "remains available only for sign-out flows" turned out to be describing an intent rather than an existing call site — and chasing that down exposed a real pre-existing bug. `app/(tabs)/profile.tsx:132-149` deletes the SecureStore auth keys, calls `supabase.auth.signOut()`, and routes to `/(auth)/sign-in` without cancelling a single notification; `app/_layout.tsx:35-40`'s `onAuthStateChange` listener only calls `setSession(session)`. So a signed-out user keeps receiving reminders from **all five families** indefinitely, and a second user signing in on that device inherits the previous user's reminders, built from their water window, meal times, weight schedule, and calorie pace. Correctness bug with a privacy edge. Pre-existing and independent of Phase 3, and out of scope here (`profile.tsx` and auth teardown are not Phase 3 files) — **filed as its own task**, with `cancelAllNotifications` deliberately retained as the correct primitive for it. Spec §8.3 carries a dated amendment recording this rather than leaving the false rationale standing; the function is explicitly NOT left dead behind a "kept per the plan" comment, since that would enshrine a justification now known to be wrong. Phase 3 sharpens the gap without causing it: eat-nudge is the fifth family that now correctly survives a reschedule, and will therefore also correctly survive sign-out.
- **The swallowed cancel error is CORRECT here, unlike Task 6's — ruled, so nobody later "harmonizes" the two.** `cancelAllEventReminders` catches and returns `void`, so a cancel failure lets the rebuild proceed and duplicate. Task 6's equivalent was made to return `Promise<boolean>` and bail. The asymmetry is principled: eat-nudge carries a hard ≤1-pending **spec invariant**, so scheduling onto unknown state risks violating the spec; event reminders have no such invariant, and bailing would leave the user holding **stale** reminders for deleted or moved events with no fresh ones — for that family, worse than transient duplicates the next reschedule sweeps. Note also the failure mode is unchanged rather than introduced: `cancelAllNotifications` swallowed identically and the rebuild also proceeded pre-fix.
- **Correction to this amendment's concurrency finding.** The claim that "the same race existed against the old global cancel" is only half right. The *race* is pre-existing, but the **duplicate outcome is newly reachable**: pre-fix both paths called `cancelAllScheduledNotificationsAsync()`, one atomic SDK call with no enumerate-then-loop window, so an interleaved second call wiped everything the first had scheduled and the end state was a single correct set. The enumerate-and-filter loop that makes the fix family-scoped is the same thing that opens the interleaving window. Still defers — the outcome is cosmetic and self-healing (any later reschedule cancels all `event_reminder`s including duplicates and rebuilds one-for-one), the trigger needs a settings change landing inside the 500 ms debounce window, and it cannot threaten the eat-nudge invariant since `cancelAllEventReminders` touches only `event_reminder` and `syncEatNudge` has its own queue. Cheapest future fix: route `updateSettings` through the debounced `rescheduleAll`, or give `rescheduleAllNotifications` Task 6's module-level queue.
- **`rescheduleAllNotifications` should NOT be renamed.** Considered and rejected: it never claimed to reschedule other families — its "all" contrasts with the singular `scheduleEventNotification` (all *events* vs one event), and the file's existing doc comment already says exactly that. The bug was that its cancel was broader than its schedule; the fix makes the function internally consistent with the name it already had. Renaming would churn two call sites for a worse name.
- **Grep count correction:** this amendment says the `cancelAllNotifications` grep returns "three hits"; post-edit it returns **two** (the definition plus the new doc-comment mention). The third was the pre-edit caller.

**Follow-up refined (queued, not Phase 3 scope): a typed notification-family module.** Deduplicating the five copies of the enumerate-filter-cancel loop was correctly deferred — this task's file list forbids touching the other four, and a shared helper with one migrated caller and four unmigrated ones is worse than five consistent copies. But two of the reasons recorded for deferring don't hold and shouldn't be carried into the follow-up: `Promise<boolean>` is a **superset** of `Promise<void>` (callers without an invariant ignore the result), and differing serialization needs are no obstacle either — `eatNudgeService` already separates `cancelAllEatNudgesCore` (the loop) from `cancelAllEatNudges` (the queued wrapper), which is exactly the factoring a shared helper wants, since serialization wraps the caller rather than the loop. The real prize is not the ~10 saved lines: **five bare untyped string literals in five files are currently the only thing keeping five families from evicting each other, and `tsc` checks none of them** — a typo in any one silently reproduces exactly the bug this task just fixed. Suggested shape, in a small dedicated `mobile/src/services/notificationFamily.ts` rather than in the already-380-line `notificationService.ts` (which owns schedule-event logic specifically and imports none of the family services today — keep it that way): a `NOTIFICATION_FAMILY` const object with a derived union type, and `cancelFamily(type: NotificationFamily): Promise<boolean>`. Note `weight_reminder`'s underscore is legacy and must be preserved — normalizing it to a hyphen would orphan every pending tag.
