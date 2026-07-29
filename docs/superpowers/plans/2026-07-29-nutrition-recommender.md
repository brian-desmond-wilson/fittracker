# Nutrition OS Phase 3 — Recommender + "Eat Next" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic, explainable "Eat Next" recommender — pure engine + Home card + in-Meals suggestions + ramp banner + pace-aware nudge family — per `docs/superpowers/specs/2026-07-29-nutrition-recommender-design.md`.

**Architecture:** One pure lib (`eatNext.ts`) does all ranking and reason generation; one hook (`useEatNext`) assembles its input from existing fetchers (`fetchMealLibrary`, `sumNutrition`, `computeMealPace`, `computeBrianScore`, the workout-today query); surfaces and the nudge scheduler are thin renderers of the same result. One small migration (profiles column + dropping the two dead aggregation views).

**Tech Stack:** Expo SDK 54 / RN 0.81.5, TypeScript strict, Supabase (Postgres 17), Jest + ts-jest (pure TS libs only), expo-notifications.

**Branch:** `nutrition-os/recommender` (exists; spec committed).

---

## ⛔ Preconditions — read before Task 1

1. **Phase 2 must be merged before execution starts.** This plan's Tasks 5–9 modify/consume files Phase 2 creates (`lib/supabase/mealLibrary.ts`, `components/track/meals/library/MealLibraryModal.tsx`). Rebase `nutrition-os/recommender` onto the merged result first, resolve nothing silently, and re-run `cd mobile && npm test` before starting.
2. **Re-read the "⚠️ Execution amendments" section of `docs/superpowers/plans/2026-07-29-nutrition-meal-library.md`** and verify this plan's Phase 2 API references against the *landed* files. Already reconciled into this plan (as of Phase 2 head `a208503`): `mealScore.ts` exports `RAW_MAX`, `COMPONENT_MAX`, `SCORE_BAND_CORE_MIN = 95`, `SCORE_BAND_MID_MIN = 71`, rounds `totalCalories`/`totalProtein` to 2 dp and `raw` to 1 dp; `BrianScoreResult` field names are unchanged. If later amendments changed `fetchMealLibrary`/`MealLibraryData`/`computeMealTotals` shapes, update Tasks 5–8 accordingly and record it in this plan's amendments section.
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
      raw: 79, score: over.score ?? 83,
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

  it("deterministic order: score desc, then prep asc, then name asc; top 3 cap", () => {
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
      b.score.score - a.score.score ||
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

- [ ] **Step 2: Apply** — `npx supabase db push --yes`.

- [ ] **Step 3: Post-verify (read-only)** — `eat_nudges_enabled` exists with default false and the single profiles row reads `false`; both views are gone; nothing else changed.

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

None yet. Record every review-driven deviation here, per task, as execution proceeds.



