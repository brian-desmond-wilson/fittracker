# Nutrition OS Phase 2 — Meal Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Meal Library — `meals`/`meal_items` superseding the empty `meal_templates`, a derived Brian Score, one-tap logging with atomic location-aware inventory decrement, the concept↔product linking UI, and an Emergency Calories surface — per `docs/superpowers/specs/2026-07-29-nutrition-meal-library-design.md`.

**Architecture:** Meals compose `saved_foods` only (totals always computed, never stored). Pure libs (`mealScore`, `conceptMatch`, `inventoryResolution`) carry all logic that can be unit-tested without I/O; a `lib/supabase/mealLibrary.ts` query module owns data access; UI follows the Phase 1 container patterns (full-screen modal, FlatList/SectionList root, React.memo rows, alert-on-failure, unconditional header). Four forward-only migrations end by dropping the verified-empty `meal_templates` tables.

**Tech Stack:** Expo SDK 54 / React Native 0.81.5, TypeScript strict, Supabase (Postgres 17, RLS, plpgsql RPCs), Jest + ts-jest.

**Branch:** `nutrition-os/meal-library` (already exists; spec committed as `96351fa`).

**House rules that bind every task:**
- Migrations: idempotent (drop-guards / `if not exists` / `on conflict do nothing`), additive except the sanctioned final drop, fully `public.`-qualified, per-operation RLS policies `to authenticated`. NEVER applied by an implementer — Task 15 is an explicit owner gate.
- Client: `StyleSheet.create` (no NativeWind), `useSafeAreaInsets` (never SafeAreaView), alert-on-failure named per operation, no client-side `updated_at` writes (DB trigger owns it), local dates via `getLocalDateString`.
- Commit after every task; one logical change per commit.
- Read the spec's §4 decisions log before deviating from anything here; record any deviation in the "Execution amendments" section at the bottom of this file.

---

## File structure

| File | Responsibility |
|---|---|
| `mobile/src/types/meal-library.ts` (create) | Row shapes + unions mirroring every CHECK; category/section ordering |
| `mobile/src/types/track.ts` (modify) | `MealLog.meal_id` replaces `meal_template_id`; delete template types |
| `mobile/src/lib/mealScore.ts` (create) + `__tests__/mealScore.test.ts` | Brian Score pure math |
| `mobile/src/lib/conceptMatch.ts` (create) + `__tests__/conceptMatch.test.ts` | TS port of the head-noun matcher |
| `mobile/src/lib/inventoryResolution.ts` (create) + `__tests__/inventoryResolution.test.ts` | saved_food→inventory stock resolution (pure) |
| `supabase/migrations/20260729100000_meal_library_schema.sql` (create) | `meals`, `meal_items`, `meal_logs.meal_id`, RLS, indexes, trigger |
| `supabase/migrations/20260729100100_inventory_consume_rpc.sql` (create) | `consume_inventory_units` / `refund_inventory_units` |
| `supabase/migrations/20260729100200_meal_library_seed.sql` (create) | 20 staples + seed links + Top 10 meals |
| `supabase/migrations/20260729100300_drop_meal_templates.sql` (create) | Emptiness-guarded drop of the superseded tables |
| `mobile/src/lib/supabase/mealLibrary.ts` (create) | Query module: fetch/create/update/delete/log meals, matching queries |
| `mobile/src/services/foodInventoryMatchService.ts` (modify) | consume/refund become RPC wrappers |
| `mobile/src/components/track/meals/library/styles.ts`, `MealRow.tsx`, `MealDetail.tsx`, `MealBuilder.tsx`, `MealLibraryModal.tsx` (create) | Library UI |
| `mobile/src/components/track/MealsScreen.tsx` (modify) | Swap template modal for library modal |
| `mobile/src/components/track/meals/useHistoricalMeals.ts` (modify) | select `meal_id` |
| `mobile/src/components/track/MealTemplatesModal.tsx`, `mobile/src/services/mealTemplatesService.ts` (delete) | Superseded |
| `mobile/src/components/profile/nutrition/FoodMatchingScreen.tsx` (create) | Linking UI |
| `mobile/src/components/profile/nutrition/NutritionPreferencesScreen.tsx` (modify) | "Food Matching" entry + view switch |

Reference files to read before starting any task: the spec; `mobile/src/lib/rampProgress.ts` (pure-lib style), `mobile/src/lib/supabase/nutritionPreferences.ts` (query-module style), `supabase/migrations/20260728100000_nutrition_preference_schema.sql` (RLS/trigger style), `supabase/migrations/20260728100300_set_active_ramp_level_rpc.sql` (RPC style), `mobile/src/components/profile/nutrition/NutritionPreferencesScreen.tsx` (container style).

---

### Task 1: Types

**Files:**
- Create: `mobile/src/types/meal-library.ts`
- Modify: `mobile/src/types/track.ts:107-185`

- [ ] **Step 1: Create the types file**

```ts
// mobile/src/types/meal-library.ts
// Row shapes for Nutrition OS Phase 2 (Meal Library). TS unions mirror the
// CHECK constraints in 20260729100000_meal_library_schema.sql — the practical
// enum contract (house convention).
import type { ConceptRating } from "./nutrition-preferences";
import type { MealType, SavedFood } from "./track";

export type MealCategory =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "shake"
  | "emergency";

/** Library display order: Emergency pinned first (spec §9.1). */
export const CATEGORY_SECTION_ORDER: MealCategory[] = [
  "emergency",
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "shake",
];

export const CATEGORY_LABELS: Record<MealCategory, string> = {
  emergency: "Emergency Calories",
  breakfast: "Breakfasts",
  lunch: "Lunches",
  dinner: "Dinners",
  snack: "Snacks",
  shake: "Shakes",
};

export type MealRole =
  | "pre_workout"
  | "post_workout"
  | "bridge"
  | "calorie_booster"
  | "emergency_catchup";

export const ROLE_LABELS: Record<MealRole, string> = {
  pre_workout: "Pre-Workout",
  post_workout: "Post-Workout",
  bridge: "Bridge",
  calorie_booster: "Calorie Booster",
  emergency_catchup: "Emergency Catch-Up",
};

/** Logging slot when meals.default_meal_type is null (spec §5.1). */
export const CATEGORY_DEFAULT_MEAL_TYPE: Record<MealCategory, MealType> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack",
  shake: "snack",
  emergency: "snack",
};

export interface Meal {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  category: MealCategory;
  role: MealRole | null;
  default_meal_type: MealType | null;
  prep_minutes: number;
  taste_override: ConceptRating | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MealItem {
  id: string;
  user_id: string;
  meal_id: string;
  saved_food_id: string;
  servings: number;
  display_order: number;
  small_pieces_ok: boolean;
  created_at: string;
}

export interface MealItemWithFood extends MealItem {
  savedFood: SavedFood;
}

export interface MealWithItems extends Meal {
  items: MealItemWithFood[];
}

/** Computed from items — never stored (Concept Map hazard #1). */
export interface MealTotals {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  sugars: number;
  sodium_mg: number;
  fiber_g: number;
}
```

- [ ] **Step 2: Update `MealLog` in `mobile/src/types/track.ts`**

At line 123, replace

```ts
  meal_template_id: string | null; // Link to meal_templates table
```

with

```ts
  meal_id: string | null; // Link to meals (Meal Library provenance)
```

Do **not** delete `MealTemplate` / `MealTemplateItem` / `MealTemplateWithItems` (lines 153–185) yet — `mealTemplatesService.ts` and `MealTemplatesModal.tsx` still compile against them until Task 13 deletes all three together.

- [ ] **Step 3: Typecheck — expect exactly two knock-on errors**

```bash
cd mobile && npx tsc --noEmit
```

Expected: errors ONLY in `src/services/mealTemplatesService.ts` (writes `meal_template_id`) and `src/components/track/meals/useHistoricalMeals.ts` (selects `meal_template_id`). Fix the second now: in `useHistoricalMeals.ts:25` change `meal_template_id` to `meal_id` in the select string. For the first, in `mealTemplatesService.ts` change the `meal_template_id: template.id` property (line ~141) to `meal_id: null` with comment `// dying path — template logging is replaced in Task 13`. Re-run; expect 0 errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/types/meal-library.ts mobile/src/types/track.ts mobile/src/components/track/meals/useHistoricalMeals.ts mobile/src/services/mealTemplatesService.ts
git commit -m "feat(nutrition-os): meal-library types; MealLog.meal_id replaces meal_template_id"
```

---

### Task 2: `mealScore.ts` (TDD)

**Files:**
- Create: `mobile/src/lib/mealScore.ts`
- Test: `mobile/src/lib/__tests__/mealScore.test.ts`

Spec §6 is the contract. Policy constants live in code, documented.

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/mealScore.test.ts
import { computeBrianScore, RATING_POINTS, type ScoreItemInput } from "../mealScore";

function item(over: Partial<ScoreItemInput> = {}): ScoreItemInput {
  return {
    calories: 300,
    protein: 20,
    servings: 1,
    smallPiecesOk: false,
    concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: false }],
    ...over,
  };
}

describe("taste", () => {
  it("calorie-weights item ratings (servings × calories)", () => {
    // 100cal love(30) vs 300cal neutral(15): (100*30 + 300*15) / 400 = 18.75
    const r = computeBrianScore({
      prepMinutes: 5,
      role: null,
      tasteOverride: null,
      items: [
        item({ calories: 100, concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: false }] }),
        item({ calories: 300, concepts: [{ rating: "neutral", requiresSmallPieces: false, prepIntensive: false }] }),
      ],
    });
    expect(r.taste).toBeCloseTo(18.75, 2);
    expect(r.tasteUnknown).toBe(false);
  });

  it("excludes unlinked items from the taste average", () => {
    const r = computeBrianScore({
      prepMinutes: 5,
      role: null,
      tasteOverride: null,
      items: [item({ concepts: [] }), item()],
    });
    expect(r.taste).toBe(RATING_POINTS.love); // only the linked item counts
  });

  it("flags tasteUnknown at neutral 15 when no item is linked", () => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [item({ concepts: [] })],
    });
    expect(r.taste).toBe(15);
    expect(r.tasteUnknown).toBe(true);
  });

  it("taste_override replaces the computation entirely", () => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: "love",
      items: [item({ concepts: [{ rating: "dislike", requiresSmallPieces: false, prepIntensive: false }] })],
    });
    expect(r.taste).toBe(30);
    expect(r.tasteUnknown).toBe(false);
  });

  it("falls back to unweighted average when linked items have no calories", () => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [
        item({ calories: null }),
        item({ calories: 0, concepts: [{ rating: "neutral", requiresSmallPieces: false, prepIntensive: false }] }),
      ],
    });
    expect(r.taste).toBeCloseTo((30 + 15) / 2, 2);
  });

  it("averages multiple concepts on one item", () => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [item({
        concepts: [
          { rating: "love", requiresSmallPieces: false, prepIntensive: false },
          { rating: "neutral", requiresSmallPieces: false, prepIntensive: false },
        ],
      })],
    });
    expect(r.taste).toBeCloseTo(22.5, 2);
  });
});

describe("convenience", () => {
  const items = [item()];
  it.each([
    [0, 25], [2, 25], [3, 20], [5, 20], [6, 12], [10, 12], [11, 5],
  ])("prep %i min → %i", (prep, want) => {
    const r = computeBrianScore({ prepMinutes: prep, role: null, tasteOverride: null, items });
    expect(r.convenience).toBe(want);
  });
  it("applies the prep_intensive penalty once", () => {
    const two = [
      item({ concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: true }] }),
      item({ concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: true }] }),
    ];
    const r = computeBrianScore({ prepMinutes: 2, role: null, tasteOverride: null, items: two });
    expect(r.convenience).toBe(22); // 25 - 3, not 25 - 6
  });
});

describe("protein / calories components and totals", () => {
  it("scales totals by servings", () => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [item({ calories: 290, protein: 26, servings: 1.5 })],
    });
    expect(r.totalCalories).toBeCloseTo(435, 1);
    expect(r.totalProtein).toBeCloseTo(39, 1);
    expect(r.protein).toBe(12); // >=30
  });
  it.each([
    [45, 15], [40, 15], [39, 12], [30, 12], [29, 8], [20, 8], [19, 4], [10, 4], [9, 0],
  ])("protein %i g → %i", (p, want) => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [item({ protein: p })],
    });
    expect(r.protein).toBe(want);
  });
  it.each([
    [600, 10], [500, 10], [499, 7], [400, 7], [399, 4], [300, 4], [299, 2],
  ])("non-bridge %i cal → %i", (cal, want) => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [item({ calories: cal })],
    });
    expect(r.calories).toBe(want);
  });
  it.each([
    [250, 10], [400, 10], [300, 10], [249, 4], [401, 4], [690, 4],
  ])("bridge %i cal → %i", (cal, want) => {
    const r = computeBrianScore({
      prepMinutes: 5, role: "bridge", tasteOverride: null,
      items: [item({ calories: cal })],
    });
    expect(r.calories).toBe(want);
  });
});

describe("EoE", () => {
  const flagged = (ok: boolean) =>
    item({ smallPiecesOk: ok, concepts: [{ rating: "like", requiresSmallPieces: true, prepIntensive: false }] });
  it("−5 per unaddressed small-pieces item, floor 0", () => {
    expect(computeBrianScore({ prepMinutes: 5, role: null, tasteOverride: null, items: [flagged(false)] }).eoe).toBe(10);
    expect(
      computeBrianScore({
        prepMinutes: 5, role: null, tasteOverride: null,
        items: [flagged(false), flagged(false), flagged(false), flagged(false)],
      }).eoe,
    ).toBe(0);
  });
  it("small_pieces_ok waives the penalty", () => {
    expect(computeBrianScore({ prepMinutes: 5, role: null, tasteOverride: null, items: [flagged(true)] }).eoe).toBe(15);
  });
});

describe("flags, approval, renormalization", () => {
  it("containsNever disqualifies Approved regardless of score", () => {
    const r = computeBrianScore({
      prepMinutes: 2, role: null, tasteOverride: "love",
      items: [
        item({ calories: 600, protein: 40 }),
        item({ concepts: [{ rating: "never", requiresSmallPieces: false, prepIntensive: false }] }),
      ],
    });
    expect(r.containsNever).toBe(true);
    expect(r.approved).toBe(false);
  });

  it("Korean Beef Bowl seed profile scores as a core meal", () => {
    // ground beef 1.5×(290cal,26p love) + rice 1×(310,6 love) + sauce 1×(60,1 unlinked)
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: "love",
      items: [
        item({ calories: 290, protein: 26, servings: 1.5 }),
        item({ calories: 310, protein: 6 }),
        item({ calories: 60, protein: 1, concepts: [] }),
      ],
    });
    // taste 30 + convenience 20 + protein 15 (46g) + eoe 15 + calories 10 (805) = 90 raw
    expect(r.raw).toBe(90);
    expect(r.score).toBe(Math.round((90 * 100) / 95)); // 95
    expect(r.approved).toBe(true);
  });

  it("PB&J honestly fails Approved on protein", () => {
    const r = computeBrianScore({
      prepMinutes: 3, role: null, tasteOverride: null,
      items: [
        item({ calories: 150, protein: 5 }),   // bread (love)
        item({ calories: 190, protein: 8, servings: 2 }), // PB (love)
        item({ calories: 50, protein: 0, concepts: [] }), // jelly
      ],
    });
    expect(r.totalProtein).toBeCloseTo(21, 1);
    expect(r.approved).toBe(false);
  });

  it("bridge role substitutes for the 500-cal admission bar", () => {
    const r = computeBrianScore({
      prepMinutes: 2, role: "bridge", tasteOverride: null,
      items: [item({ calories: 300, protein: 32 })],
    });
    expect(r.approved).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd mobile && npm test -- mealScore
```

Expected: FAIL — cannot find module `../mealScore`.

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/mealScore.ts
// Brian Score: pure derivation from Phase 1 preference data + meal items.
// No I/O — sibling of rampProgress.ts. Policy constants are code, not schema
// (same stance as the ramp thresholds): they are policy, unlikely to vary,
// and belong under test.
//
// Cost (the original 5-point component) is dropped — no price data exists
// anywhere in the app — so raw max is 95, renormalized to /100 (spec §6).
import type { ConceptRating } from "@/src/types/nutrition-preferences";
import type { MealRole } from "@/src/types/meal-library";

export const RATING_POINTS: Record<ConceptRating, number> = {
  love: 30,
  like: 22,
  neutral: 15,
  dislike: 8,
  never: 0,
};

const RAW_MAX = 95;
const PREP_INTENSIVE_PENALTY = 3;
const EOE_PENALTY_PER_ITEM = 5;
const APPROVED_MAX_PREP_MINUTES = 10;
const APPROVED_MIN_PROTEIN_G = 30;
const APPROVED_MIN_CALORIES = 500;
const APPROVED_MIN_TASTE = RATING_POINTS.like;
const BRIDGE_CAL_MIN = 250;
const BRIDGE_CAL_MAX = 400;

export interface ScoreConceptInput {
  rating: ConceptRating;
  requiresSmallPieces: boolean;
  prepIntensive: boolean;
}

export interface ScoreItemInput {
  calories: number | null;
  protein: number | null;
  servings: number;
  smallPiecesOk: boolean;
  concepts: ScoreConceptInput[];
}

export interface BrianScoreInput {
  prepMinutes: number;
  role: MealRole | null;
  tasteOverride: ConceptRating | null;
  items: ScoreItemInput[];
}

export interface BrianScoreResult {
  taste: number;
  convenience: number;
  protein: number;
  eoe: number;
  calories: number;
  raw: number;
  /** raw renormalized to /100 (× 100/95). */
  score: number;
  tasteUnknown: boolean;
  containsNever: boolean;
  approved: boolean;
  totalCalories: number;
  totalProtein: number;
}

export function computeBrianScore(input: BrianScoreInput): BrianScoreResult {
  const { prepMinutes, role, tasteOverride, items } = input;

  const totalCalories = items.reduce(
    (sum, it) => sum + it.servings * (it.calories ?? 0),
    0,
  );
  const totalProtein = items.reduce(
    (sum, it) => sum + it.servings * (it.protein ?? 0),
    0,
  );

  const containsNever = items.some((it) =>
    it.concepts.some((c) => c.rating === "never"),
  );

  // ── Taste /30 ── calorie-weighted average of per-item concept points;
  // an item with several concepts contributes their plain average.
  const linked = items.filter((it) => it.concepts.length > 0);
  let taste: number;
  let tasteUnknown = false;
  if (tasteOverride !== null) {
    taste = RATING_POINTS[tasteOverride];
  } else if (linked.length === 0) {
    taste = 15; // neutral placeholder — surfaced via the flag, not hidden
    tasteUnknown = true;
  } else {
    const itemPoints = (it: ScoreItemInput) =>
      it.concepts.reduce((s, c) => s + RATING_POINTS[c.rating], 0) /
      it.concepts.length;
    const totalWeight = linked.reduce(
      (s, it) => s + it.servings * (it.calories ?? 0),
      0,
    );
    if (totalWeight > 0) {
      taste =
        linked.reduce(
          (s, it) => s + it.servings * (it.calories ?? 0) * itemPoints(it),
          0,
        ) / totalWeight;
    } else {
      // All linked items lack calorie data — weighting is meaningless, so
      // fall back to the unweighted average rather than divide by zero.
      taste = linked.reduce((s, it) => s + itemPoints(it), 0) / linked.length;
    }
  }

  // ── Convenience /25 ──
  let convenience: number;
  if (prepMinutes <= 2) convenience = 25;
  else if (prepMinutes <= 5) convenience = 20;
  else if (prepMinutes <= 10) convenience = 12;
  else convenience = 5;
  if (items.some((it) => it.concepts.some((c) => c.prepIntensive))) {
    convenience = Math.max(0, convenience - PREP_INTENSIVE_PENALTY);
  }

  // ── Protein /15 ──
  let protein: number;
  if (totalProtein >= 40) protein = 15;
  else if (totalProtein >= 30) protein = 12;
  else if (totalProtein >= 20) protein = 8;
  else if (totalProtein >= 10) protein = 4;
  else protein = 0;

  // ── EoE /15 ──
  const unaddressed = items.filter(
    (it) =>
      !it.smallPiecesOk && it.concepts.some((c) => c.requiresSmallPieces),
  ).length;
  const eoe = Math.max(0, 15 - EOE_PENALTY_PER_ITEM * unaddressed);

  // ── Calories /10 ──
  let calories: number;
  if (role === "bridge") {
    calories =
      totalCalories >= BRIDGE_CAL_MIN && totalCalories <= BRIDGE_CAL_MAX
        ? 10
        : 4;
  } else if (totalCalories >= 500) calories = 10;
  else if (totalCalories >= 400) calories = 7;
  else if (totalCalories >= 300) calories = 4;
  else calories = 2;

  const raw = taste + convenience + protein + eoe + calories;
  const score = Math.round((raw * 100) / RAW_MAX);

  const approved =
    prepMinutes <= APPROVED_MAX_PREP_MINUTES &&
    totalProtein >= APPROVED_MIN_PROTEIN_G &&
    (totalCalories >= APPROVED_MIN_CALORIES || role === "bridge") &&
    eoe === 15 &&
    taste >= APPROVED_MIN_TASTE &&
    !containsNever;

  return {
    taste,
    convenience,
    protein,
    eoe,
    calories,
    raw,
    score,
    tasteUnknown,
    containsNever,
    approved,
    totalCalories,
    totalProtein,
  };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd mobile && npm test -- mealScore
```

Expected: PASS (all tests). Also run `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/mealScore.ts mobile/src/lib/__tests__/mealScore.test.ts
git commit -m "feat(nutrition-os): Brian Score pure lib with Jest coverage"
```

---

### Task 3: `conceptMatch.ts` (TDD)

**Files:**
- Create: `mobile/src/lib/conceptMatch.ts`
- Test: `mobile/src/lib/__tests__/conceptMatch.test.ts`

TS port of `supabase/migrations/20260728100200_nutrition_concept_link_backfill.sql` — read its header comment first; the rules and the *accepted residuals* are the contract. Identical semantics: exact (rank 0) > plural-modulo (rank 1) > head-noun suffix, concept ≥5 chars (rank 2); tie-break by concept-name length descending; no substring/wildcard matching.

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/conceptMatch.test.ts
import { suggestConcepts, type MatchableConcept } from "../conceptMatch";

const C = (id: string, name: string): MatchableConcept => ({ id, name });
const concepts: MatchableConcept[] = [
  C("butter", "Butter"),
  C("pb", "Peanut Butter"),
  C("bananas", "Bananas"),
  C("rice", "Rice"),
  C("mwrice", "Microwave Rice"),
  C("milk", "Whole Milk"),
  C("cheese", "Cheese"),
];

describe("suggestConcepts", () => {
  it("rank 0: exact match, case/whitespace-insensitive", () => {
    expect(suggestConcepts("  butter ", concepts)[0]).toMatchObject({ conceptId: "butter", rank: 0 });
  });

  it("rank 1: plural-modulo equality — 'Banana' matches 'Bananas'", () => {
    expect(suggestConcepts("Banana", concepts)[0]).toMatchObject({ conceptId: "bananas", rank: 1 });
  });

  it("rank 2: head-noun suffix — 'Kerrygold Butter' → Butter", () => {
    const got = suggestConcepts("Kerrygold Butter", concepts);
    expect(got[0]).toMatchObject({ conceptId: "butter", rank: 2 });
  });

  it("does NOT match a non-trailing word — 'Butter Lettuce' → no Butter", () => {
    expect(suggestConcepts("Butter Lettuce", concepts)).toHaveLength(0);
  });

  it("most-specific wins: 'Jif Peanut Butter' prefers Peanut Butter over Butter", () => {
    const got = suggestConcepts("Jif Peanut Butter", concepts);
    expect(got[0].conceptId).toBe("pb");
    expect(got.map((s) => s.conceptId)).toContain("butter"); // still offered, ranked lower
  });

  it("concepts under 5 chars never suffix-match — 'Fried Rice' → nothing", () => {
    expect(suggestConcepts("Fried Rice", concepts)).toHaveLength(0);
  });

  it("no wildcard hazard: '2% Milk' does not match 'Whole Milk'", () => {
    expect(suggestConcepts("2% Milk", concepts)).toHaveLength(0);
  });

  it("documented residual: 'Nutter Butter' still suffix-matches Butter (human confirm filters it)", () => {
    expect(suggestConcepts("Nutter Butter", concepts)[0]).toMatchObject({ conceptId: "butter", rank: 2 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd mobile && npm test -- conceptMatch
```

Expected: FAIL — cannot find module `../conceptMatch`.

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/conceptMatch.ts
// TS port of the head-noun concept matcher from migration
// 20260728100200_nutrition_concept_link_backfill.sql. Keep the two in sync —
// the UI must suggest exactly what the SQL backfill would have linked.
//
// English food names put the head noun LAST ("Kerrygold Butter" is butter;
// "Butter Lettuce" is lettuce), so suffix position is the safe direction.
// No substring/LIKE semantics: literal % or _ in product names cannot
// wildcard. Under-linking is the intended failure mode; the known residual
// ("Nutter Butter" → Butter) is filtered by human confirmation in the UI.
export interface MatchableConcept {
  id: string;
  name: string;
}

export interface ConceptSuggestion {
  conceptId: string;
  /** 0 exact · 1 plural-modulo · 2 head-noun suffix */
  rank: 0 | 1 | 2;
}

const MIN_SUFFIX_CONCEPT_LENGTH = 5;

const norm = (s: string) => s.trim().toLowerCase();
const deplural = (s: string) => s.replace(/s$/, "");

/** All matching concepts, best first (rank asc, longer concept name first). */
export function suggestConcepts(
  productName: string,
  concepts: MatchableConcept[],
): ConceptSuggestion[] {
  const p = norm(productName);
  const out: Array<ConceptSuggestion & { specificity: number }> = [];
  for (const c of concepts) {
    const cn = norm(c.name);
    let rank: 0 | 1 | 2 | null = null;
    if (p === cn) rank = 0;
    else if (deplural(p) === deplural(cn)) rank = 1;
    else if (cn.length >= MIN_SUFFIX_CONCEPT_LENGTH && p.endsWith(" " + cn)) rank = 2;
    if (rank !== null) out.push({ conceptId: c.id, rank, specificity: cn.length });
  }
  out.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.specificity - a.specificity ||
      a.conceptId.localeCompare(b.conceptId),
  );
  return out.map(({ conceptId, rank }) => ({ conceptId, rank }));
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd mobile && npm test -- conceptMatch
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/conceptMatch.ts mobile/src/lib/__tests__/conceptMatch.test.ts
git commit -m "feat(nutrition-os): TS port of head-noun concept matcher"
```

---

### Task 4: `inventoryResolution.ts` (TDD)

**Files:**
- Create: `mobile/src/lib/inventoryResolution.ts`
- Test: `mobile/src/lib/__tests__/inventoryResolution.test.ts`

Spec §7.3. Pure — lives outside `lib/supabase/` so tests never import the supabase client.

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/inventoryResolution.test.ts
import {
  resolveInventoryMatches,
  type ResolutionItem,
  type ResolutionInventoryRow,
} from "../inventoryResolution";

const item = (o: Partial<ResolutionItem> = {}): ResolutionItem => ({
  savedFoodId: "sf1",
  barcode: null,
  conceptIds: [],
  ...o,
});
const inv = (o: Partial<ResolutionInventoryRow> = {}): ResolutionInventoryRow => ({
  id: "inv1",
  barcode: null,
  totalQuantity: 1,
  conceptIds: [],
  ...o,
});

describe("resolveInventoryMatches", () => {
  it("matches by barcode when in stock", () => {
    const got = resolveInventoryMatches(
      [item({ barcode: "123" })],
      [inv({ barcode: "123" })],
    );
    expect(got.get("sf1")).toBe("inv1");
  });

  it("skips barcode matches with zero stock", () => {
    const got = resolveInventoryMatches(
      [item({ barcode: "123" })],
      [inv({ barcode: "123", totalQuantity: 0 })],
    );
    expect(got.has("sf1")).toBe(false);
  });

  it("falls back to a unique shared-concept match", () => {
    const got = resolveInventoryMatches(
      [item({ conceptIds: ["boost"] })],
      [inv({ conceptIds: ["boost"] }), inv({ id: "inv2", conceptIds: ["rice"] })],
    );
    expect(got.get("sf1")).toBe("inv1");
  });

  it("skips when two in-stock products share the concept (ambiguous)", () => {
    const got = resolveInventoryMatches(
      [item({ conceptIds: ["boost"] })],
      [inv({ conceptIds: ["boost"] }), inv({ id: "inv2", conceptIds: ["boost"] })],
    );
    expect(got.has("sf1")).toBe(false);
  });

  it("ambiguity ignores out-of-stock candidates", () => {
    const got = resolveInventoryMatches(
      [item({ conceptIds: ["boost"] })],
      [inv({ conceptIds: ["boost"] }), inv({ id: "inv2", conceptIds: ["boost"], totalQuantity: 0 })],
    );
    expect(got.get("sf1")).toBe("inv1");
  });

  it("barcode wins over concept resolution", () => {
    const got = resolveInventoryMatches(
      [item({ barcode: "123", conceptIds: ["boost"] })],
      [inv({ barcode: "123" }), inv({ id: "inv2", conceptIds: ["boost"] })],
    );
    expect(got.get("sf1")).toBe("inv1");
  });

  it("returns nothing for unmatched items", () => {
    expect(resolveInventoryMatches([item()], [inv()]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd mobile && npm test -- inventoryResolution
```

Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/inventoryResolution.ts
// Resolves a meal item's saved food to the inventory row its logging should
// decrement (spec §7.3). Pure so it is unit-testable; the query module
// assembles the inputs. Precedence:
//   1. exact barcode match with stock
//   2. unique shared-concept match with stock (2+ candidates = ambiguous,
//      0 = none; both skip — under-matching is the intended failure mode)
export interface ResolutionItem {
  savedFoodId: string;
  barcode: string | null;
  conceptIds: string[];
}

export interface ResolutionInventoryRow {
  id: string;
  barcode: string | null;
  /** Sum of location quantities, or the legacy quantity for location-less rows. */
  totalQuantity: number;
  conceptIds: string[];
}

export function resolveInventoryMatches(
  items: ResolutionItem[],
  inventory: ResolutionInventoryRow[],
): Map<string, string> {
  const out = new Map<string, string>();
  const inStock = inventory.filter((r) => r.totalQuantity > 0);
  for (const it of items) {
    const byBarcode = it.barcode
      ? inStock.find((r) => r.barcode === it.barcode)
      : undefined;
    if (byBarcode) {
      out.set(it.savedFoodId, byBarcode.id);
      continue;
    }
    if (it.conceptIds.length === 0) continue;
    const wanted = new Set(it.conceptIds);
    const candidates = inStock.filter((r) =>
      r.conceptIds.some((cid) => wanted.has(cid)),
    );
    if (candidates.length === 1) out.set(it.savedFoodId, candidates[0].id);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd mobile && npm test -- inventoryResolution
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/inventoryResolution.ts mobile/src/lib/__tests__/inventoryResolution.test.ts
git commit -m "feat(nutrition-os): pure saved-food→inventory stock resolution"
```

---

### Task 5: Schema migration

**Files:**
- Create: `supabase/migrations/20260729100000_meal_library_schema.sql`

Style anchor: `supabase/migrations/20260728100000_nutrition_preference_schema.sql` (drop-guarded per-op policies, `public.` everywhere, shared `update_updated_at_column()` trigger). Do **not** apply — Task 15 is the owner gate.

- [ ] **Step 1: Write the migration**

```sql
-- Nutrition OS Phase 2: Meal Library schema.
-- Spec: docs/superpowers/specs/2026-07-29-nutrition-meal-library-design.md
-- Supersedes meal_templates (verified empty in prod 2026-07-29; dropped by
-- 20260729100300 after this feature's code lands).
--
-- meals carry NO nutrition columns — totals are always computed from items
-- (Concept Map hazard #1: no third nutrition-bearing product entity).

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  category text not null check (category in
    ('breakfast','lunch','dinner','snack','shake','emergency')),
  role text check (role in
    ('pre_workout','post_workout','bridge','calorie_booster','emergency_catchup')),
  default_meal_type text check (default_meal_type in
    ('breakfast','lunch','dinner','snack','dessert')),
  prep_minutes integer not null default 0 check (prep_minutes >= 0),
  taste_override text check (taste_override in
    ('love','like','neutral','dislike','never')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid not null references public.meals(id) on delete cascade,
  -- RESTRICT, deliberately breaking with meal_template_items' CASCADE:
  -- deleting a saved food must not silently shrink a meal (and its
  -- calories). The delete fails loudly until the item is removed first.
  saved_food_id uuid not null references public.saved_foods(id) on delete restrict,
  servings numeric(5,2) not null default 1.0 check (servings > 0),
  display_order integer not null default 0,
  -- "This specific product is already in EoE-compliant form" — only
  -- meaningful when the linked concept has requires_small_pieces.
  small_pieces_ok boolean not null default false,
  created_at timestamptz not null default now(),
  unique (meal_id, saved_food_id)
);

alter table public.meal_logs
  add column if not exists meal_id uuid references public.meals(id) on delete set null;

create index if not exists idx_meals_user_category
  on public.meals(user_id, category);
create index if not exists idx_meal_items_meal
  on public.meal_items(meal_id, display_order);
-- Supports the RESTRICT check on saved_foods deletes.
create index if not exists idx_meal_items_saved_food
  on public.meal_items(saved_food_id);
create index if not exists idx_meal_logs_meal
  on public.meal_logs(meal_id) where meal_id is not null;

alter table public.meals enable row level security;
alter table public.meal_items enable row level security;

drop policy if exists "meals_select_own" on public.meals;
create policy "meals_select_own" on public.meals
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "meals_insert_own" on public.meals;
create policy "meals_insert_own" on public.meals
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "meals_update_own" on public.meals;
create policy "meals_update_own" on public.meals
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "meals_delete_own" on public.meals;
create policy "meals_delete_own" on public.meals
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "meal_items_select_own" on public.meal_items;
create policy "meal_items_select_own" on public.meal_items
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "meal_items_insert_own" on public.meal_items;
create policy "meal_items_insert_own" on public.meal_items
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "meal_items_update_own" on public.meal_items;
create policy "meal_items_update_own" on public.meal_items
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "meal_items_delete_own" on public.meal_items;
create policy "meal_items_delete_own" on public.meal_items
  for delete to authenticated using (user_id = auth.uid());

drop trigger if exists meals_updated_at on public.meals;
create trigger meals_updated_at
  before update on public.meals
  for each row execute function public.update_updated_at_column();
```

- [ ] **Step 2: Sanity-check without applying**

```bash
cd /Users/brianwilson/code/fittracker && npx supabase migration list
```

Expected: the four `20260729*` files appear as pending local migrations as they are created (this task adds the first); nothing is pushed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260729100000_meal_library_schema.sql
git commit -m "feat(nutrition-os): meals + meal_items schema, meal_logs.meal_id"
```

---

### Task 6: Inventory consume/refund RPCs

**Files:**
- Create: `supabase/migrations/20260729100100_inventory_consume_rpc.sql`

Style anchor: `20260728100300_set_active_ramp_level_rpc.sql` (`security invoker`, `search_path = ''`, fully-qualified names, revoke/grant). Note: `mobile/CLAUDE.md` warns about empty `search_path` — that warning applies to *unqualified* table names; these bodies qualify everything with `public.`, matching the ramp RPC that is already live in prod.

- [ ] **Step 1: Write the migration**

```sql
-- Nutrition OS Phase 2: atomic, location-aware inventory decrement.
-- Replaces the client-side read-modify-write in foodInventoryMatchService
-- (non-atomic; wrote only the legacy single-location column). One plpgsql
-- body = one implicit transaction, so a multi-item meal decrement commits
-- or rolls back as a unit.
--
-- Unit semantics preserved: 1 unit = 1 discrete container per logged item,
-- regardless of servings. consumed/refunded of 0 means "no stock" — never
-- an error, because logging a meal must not fail on stock bookkeeping.
--
-- Location policy: consume from ready-to-consume locations first, then the
-- fullest; refund mirrors it. Rows with no location records fall back to
-- the legacy food_inventory.quantity column (22 inventory rows, 17 location
-- rows in prod — location-less items are real). After any location write,
-- food_inventory.quantity is resynced to sum(locations) so legacy readers
-- (barcode match "in stock" checks) stay correct.
-- security invoker => RLS applies; callers touch only their own rows.

create or replace function public.consume_inventory_units(p_inventory_ids uuid[])
returns table(inventory_id uuid, consumed integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_loc_id uuid;
  v_count integer;
begin
  foreach v_id in array p_inventory_ids loop
    v_loc_id := null;
    v_count := 0;

    if exists (select 1 from public.food_inventory_locations l
               where l.food_inventory_id = v_id) then
      select l.id into v_loc_id
      from public.food_inventory_locations l
      where l.food_inventory_id = v_id
        and l.quantity > 0
      order by l.is_ready_to_consume desc, l.quantity desc
      limit 1
      for update;

      if v_loc_id is not null then
        update public.food_inventory_locations
           set quantity = quantity - 1
         where id = v_loc_id;
        v_count := 1;

        update public.food_inventory fi
           set quantity = coalesce((
                 select sum(l2.quantity)
                 from public.food_inventory_locations l2
                 where l2.food_inventory_id = v_id), 0)
         where fi.id = v_id;
      end if;
    else
      update public.food_inventory fi
         set quantity = fi.quantity - 1
       where fi.id = v_id
         and fi.quantity > 0;
      get diagnostics v_count = row_count;
    end if;

    inventory_id := v_id;
    consumed := v_count;
    return next;
  end loop;
end;
$$;

create or replace function public.refund_inventory_units(p_inventory_ids uuid[])
returns table(inventory_id uuid, refunded integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_loc_id uuid;
  v_count integer;
begin
  foreach v_id in array p_inventory_ids loop
    v_loc_id := null;
    v_count := 0;

    if exists (select 1 from public.food_inventory_locations l
               where l.food_inventory_id = v_id) then
      -- Mirror of consume: credit the ready-to-consume location first.
      -- Units are containers, so "which location" is an approximation and
      -- that is fine (documented v1 semantics).
      select l.id into v_loc_id
      from public.food_inventory_locations l
      where l.food_inventory_id = v_id
      order by l.is_ready_to_consume desc, l.quantity desc
      limit 1
      for update;

      if v_loc_id is not null then
        update public.food_inventory_locations
           set quantity = quantity + 1
         where id = v_loc_id;
        v_count := 1;

        update public.food_inventory fi
           set quantity = coalesce((
                 select sum(l2.quantity)
                 from public.food_inventory_locations l2
                 where l2.food_inventory_id = v_id), 0)
         where fi.id = v_id;
      end if;
    else
      update public.food_inventory fi
         set quantity = fi.quantity + 1
       where fi.id = v_id;
      get diagnostics v_count = row_count;
    end if;

    inventory_id := v_id;
    refunded := v_count;
    return next;
  end loop;
end;
$$;

revoke all on function public.consume_inventory_units(uuid[]) from public;
grant execute on function public.consume_inventory_units(uuid[]) to authenticated;
revoke all on function public.refund_inventory_units(uuid[]) from public;
grant execute on function public.refund_inventory_units(uuid[]) to authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260729100100_inventory_consume_rpc.sql
git commit -m "feat(nutrition-os): atomic location-aware inventory consume/refund RPCs"
```

---

### Task 7: Seed migration

**Files:**
- Create: `supabase/migrations/20260729100200_meal_library_seed.sql`

Spec §10 is the exact data contract — every staple's 7 nutrients, every meal's items × servings. Style anchor: `20260728100100_nutrition_preference_seed.sql`. Staples are guarded by `not exists` on `(user_id, lower(name))` because `saved_foods` has no slug; meals/links use `on conflict do nothing`.

- [ ] **Step 1: Write the migration**

```sql
-- Nutrition OS Phase 2 seed: staple saved foods, their concept links, and
-- the Top 10 meals (Korean Beef Bowl = gold standard, taste_override love).
-- Spec §10: docs/superpowers/specs/2026-07-29-nutrition-meal-library-design.md
-- Idempotent: staples guarded by not-exists on (user_id, lower(name))
-- (saved_foods has no slug); meals via on conflict (user_id, slug); links
-- and items via their unique keys. Re-running never duplicates and never
-- overwrites user edits.
-- Unlinked staples (sauces, jelly, salsa, chips) are deliberate: no matching
-- Phase 1 concept exists; their small calorie weight keeps taste math honest.

do $$
declare
  v_user_id uuid;
  v_staples integer;
  v_links integer;
  v_meals integer;
  v_items integer;
begin
  select id into v_user_id from auth.users limit 1;
  if v_user_id is null then
    raise exception 'No auth.users row found — cannot seed the Meal Library.';
  end if;

  insert into public.saved_foods
    (user_id, name, calories, protein, carbs, fats, sugars, sodium_mg, fiber_g,
     serving_size)
  select v_user_id, v.name, v.cal, v.p, v.c, v.f, v.sug, v.na, v.fib, v.serving
  from (values
    ('Ground Beef, cooked 85/15',      290, 26,   0,   20,   0,  90,  0,   '4 oz'),
    ('Microwave Sticky White Rice',    310, 6,    68,  1,    0,  10,  1,   '1 cup'),
    ('Grilled Chicken Breast, diced',  180, 34,   0,   4,    0,  380, 0,   '4 oz'),
    ('Teriyaki Sauce',                 60,  2,    12,  0,    10, 900, 0,   '2 tbsp'),
    ('Korean BBQ Sauce',               60,  1,    13,  0.5,  11, 520, 0,   '2 tbsp'),
    ('Greek Yogurt, whole milk plain', 220, 20,   9,   11,   9,  80,  0,   '1 cup'),
    ('Protein Granola',                220, 10,   26,  8,    7,  45,  3,   '1/2 cup'),
    ('Instant Oatmeal, prepared',      160, 4,    33,  2.5,  12, 260, 3,   '1 packet'),
    ('Peanut Butter',                  190, 8,    7,   16,   3,  140, 2,   '2 tbsp'),
    ('Grape Jelly',                    50,  0,    13,  0,    12, 5,   0,   '1 tbsp'),
    ('White Bread',                    150, 5,    28,  2,    3,  230, 1,   '2 slices'),
    ('Banana',                         105, 1.3,  27,  0.4,  14, 1,   3,   '1 medium'),
    ('Blueberries',                    85,  1,    21,  0.5,  15, 1,   3.6, '1 cup'),
    ('Whole Milk',                     150, 8,    12,  8,    12, 105, 0,   '1 cup'),
    ('Boost Very High Calorie',        530, 22,   85,  12,   26, 200, 0,   '1 bottle'),
    ('Cashews',                        160, 5,    9,   13,   2,  95,  1,   '1 oz'),
    ('Shredded Cheddar',               110, 7,    1,   9,    0,  180, 0,   '1/4 cup'),
    ('Salsa',                          10,  0,    2,   0,    1,  220, 0,   '2 tbsp'),
    ('Tortilla Chips',                 140, 2,    19,  7,    0,  115, 1,   '1 oz'),
    ('Whey Protein Powder',            120, 24,   3,   1.5,  2,  130, 0,   '1 scoop')
  ) as v(name, cal, p, c, f, sug, na, fib, serving)
  where not exists (
    select 1 from public.saved_foods sf
    where sf.user_id = v_user_id and lower(sf.name) = lower(v.name)
  );
  get diagnostics v_staples = row_count;

  -- Mark seeded staples so they are identifiable later. Separate update so a
  -- partial re-run (staple pre-existed) never clobbers a user's own notes.
  update public.saved_foods sf
     set notes = 'Nutrition OS staple (seeded)'
   where sf.user_id = v_user_id
     and sf.notes is null
     and lower(sf.name) in (
       'ground beef, cooked 85/15','microwave sticky white rice',
       'grilled chicken breast, diced','teriyaki sauce','korean bbq sauce',
       'greek yogurt, whole milk plain','protein granola',
       'instant oatmeal, prepared','peanut butter','grape jelly','white bread',
       'banana','blueberries','whole milk','boost very high calorie','cashews',
       'shredded cheddar','salsa','tortilla chips','whey protein powder');

  insert into public.food_concept_links (user_id, concept_id, saved_food_id, matched_by)
  select v_user_id, c.id, sf.id, 'seed'
  from (values
    ('Ground Beef, cooked 85/15',      'ground-beef'),
    ('Microwave Sticky White Rice',    'microwave-rice'),
    ('Grilled Chicken Breast, diced',  'chicken-breast'),
    ('Greek Yogurt, whole milk plain', 'greek-yogurt'),
    ('Protein Granola',                'granola'),
    ('Instant Oatmeal, prepared',      'oatmeal'),
    ('Peanut Butter',                  'peanut-butter'),
    ('White Bread',                    'bread'),
    ('Banana',                         'bananas'),
    ('Blueberries',                    'blueberries'),
    ('Whole Milk',                     'whole-milk'),
    ('Boost Very High Calorie',        'boost-high-protein'),
    ('Cashews',                        'cashews'),
    ('Shredded Cheddar',               'cheese'),
    ('Whey Protein Powder',            'protein-shakes')
  ) as v(food_name, concept_slug)
  join public.food_concepts c
    on c.user_id = v_user_id and c.slug = v.concept_slug
  join public.saved_foods sf
    on sf.user_id = v_user_id and lower(sf.name) = lower(v.food_name)
  on conflict (concept_id, saved_food_id) do nothing;
  get diagnostics v_links = row_count;

  insert into public.meals
    (user_id, name, slug, category, role, prep_minutes, taste_override)
  select v_user_id, v.name, v.slug, v.category, v.role, v.prep, v.taste
  from (values
    ('Protein Oatmeal Bowl',  'protein-oatmeal-bowl',  'breakfast', null,                3, null),
    ('Greek Yogurt Bowl',     'greek-yogurt-bowl',     'breakfast', null,                2, null),
    ('Korean Beef Bowl',      'korean-beef-bowl',      'dinner',    null,                5, 'love'),
    ('Teriyaki Chicken Bowl', 'teriyaki-chicken-bowl', 'lunch',     null,                5, null),
    ('Cheeseburger Bowl',     'cheeseburger-bowl',     'dinner',    null,                5, null),
    ('Taco Bowl',             'taco-bowl',             'dinner',    null,                5, null),
    ('PB&J',                  'pb-and-j',              'lunch',     null,                3, null),
    ('Banana + PB',           'banana-pb',             'snack',     'bridge',            2, null),
    ('Boost + Cashews',       'boost-cashews',         'emergency', 'emergency_catchup', 0, null),
    ('Brian Bulk Shake',      'brian-bulk-shake',      'shake',     'calorie_booster',   4, null)
  ) as v(name, slug, category, role, prep, taste)
  on conflict (user_id, slug) do nothing;
  get diagnostics v_meals = row_count;

  insert into public.meal_items
    (user_id, meal_id, saved_food_id, servings, display_order, small_pieces_ok)
  select v_user_id, m.id, sf.id, v.servings, v.ord, v.sp_ok
  from (values
    ('protein-oatmeal-bowl',  'Instant Oatmeal, prepared',      1.0,  0, false),
    ('protein-oatmeal-bowl',  'Whey Protein Powder',            1.0,  1, false),
    ('protein-oatmeal-bowl',  'Peanut Butter',                  1.0,  2, false),
    ('protein-oatmeal-bowl',  'Banana',                         1.0,  3, false),
    ('greek-yogurt-bowl',     'Greek Yogurt, whole milk plain', 1.0,  0, false),
    ('greek-yogurt-bowl',     'Protein Granola',                1.0,  1, false),
    ('greek-yogurt-bowl',     'Blueberries',                    1.0,  2, false),
    ('korean-beef-bowl',      'Ground Beef, cooked 85/15',      1.5,  0, false),
    ('korean-beef-bowl',      'Microwave Sticky White Rice',    1.0,  1, false),
    ('korean-beef-bowl',      'Korean BBQ Sauce',               1.0,  2, false),
    ('teriyaki-chicken-bowl', 'Grilled Chicken Breast, diced',  1.5,  0, true),
    ('teriyaki-chicken-bowl', 'Microwave Sticky White Rice',    1.0,  1, false),
    ('teriyaki-chicken-bowl', 'Teriyaki Sauce',                 1.0,  2, false),
    ('cheeseburger-bowl',     'Ground Beef, cooked 85/15',      1.5,  0, false),
    ('cheeseburger-bowl',     'Microwave Sticky White Rice',    1.0,  1, false),
    ('cheeseburger-bowl',     'Shredded Cheddar',               1.0,  2, false),
    ('taco-bowl',             'Ground Beef, cooked 85/15',      1.25, 0, false),
    ('taco-bowl',             'Microwave Sticky White Rice',    1.0,  1, false),
    ('taco-bowl',             'Shredded Cheddar',               1.0,  2, false),
    ('taco-bowl',             'Salsa',                          1.0,  3, false),
    ('taco-bowl',             'Tortilla Chips',                 1.0,  4, false),
    ('pb-and-j',              'White Bread',                    1.0,  0, false),
    ('pb-and-j',              'Peanut Butter',                  2.0,  1, false),
    ('pb-and-j',              'Grape Jelly',                    1.0,  2, false),
    ('banana-pb',             'Banana',                         1.0,  0, false),
    ('banana-pb',             'Peanut Butter',                  1.0,  1, false),
    ('boost-cashews',         'Boost Very High Calorie',        1.0,  0, false),
    ('boost-cashews',         'Cashews',                        1.0,  1, false),
    ('brian-bulk-shake',      'Whole Milk',                     1.0,  0, false),
    ('brian-bulk-shake',      'Banana',                         1.0,  1, false),
    ('brian-bulk-shake',      'Peanut Butter',                  2.0,  2, false),
    ('brian-bulk-shake',      'Whey Protein Powder',            1.0,  3, false)
  ) as v(meal_slug, food_name, servings, ord, sp_ok)
  join public.meals m
    on m.user_id = v_user_id and m.slug = v.meal_slug
  join public.saved_foods sf
    on sf.user_id = v_user_id and lower(sf.name) = lower(v.food_name)
  on conflict (meal_id, saved_food_id) do nothing;
  get diagnostics v_items = row_count;

  raise notice 'Meal Library seed — staples: %, links: %, meals: %, items: %',
    v_staples, v_links, v_meals, v_items;

  if v_meals > 0 and v_items < v_meals then
    -- Ten meals should have produced 32 items; a tiny count means a
    -- food_name/meal_slug typo silently dropped join rows. Fail loudly.
    raise exception 'Meal items joined incompletely (% items for % meals) — check name spellings', v_items, v_meals;
  end if;
end $$;
```

- [ ] **Step 2: Verify internal name consistency (no DB needed)**

Every `food_name` in the items and links lists must appear verbatim in the staples list. Check mechanically:

```bash
cd /Users/brianwilson/code/fittracker && python3 - <<'EOF'
import re
sql = open('supabase/migrations/20260729100200_meal_library_seed.sql').read()
blocks = re.findall(r"from \(values(.*?)\) as v", sql, re.S)
staples = set(re.findall(r"\('([^']+)'", blocks[0]))
links   = [t[0] for t in re.findall(r"\('([^']+)',\s+'([a-z-]+)'\)", blocks[1])]
items   = [t[1] for t in re.findall(r"\('([a-z-]+)',\s+'([^']+)'", blocks[3])]
missing = [n for n in set(links + items) if n not in staples]
print("MISSING:", missing if missing else "none — OK")
EOF
```

Expected: `MISSING: none — OK`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260729100200_meal_library_seed.sql
git commit -m "feat(nutrition-os): seed 20 staples, concept links, and the Top 10 meals"
```

---

### Task 8: Drop migration

**Files:**
- Create: `supabase/migrations/20260729100300_drop_meal_templates.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Nutrition OS Phase 2: drop the superseded meal_templates feature.
-- Sanctioned supersession (Concept Map §18.7: "extend or supersede — never
-- sibling"; leaving them dormant is the map's cautionary tale). All three
-- targets were verified empty in prod on 2026-07-29; the guard re-proves
-- emptiness at apply time so this can never destroy data.

do $$
begin
  if exists (select 1 from public.meal_templates limit 1) then
    raise exception 'meal_templates has rows — refusing to drop';
  end if;
  if exists (select 1 from public.meal_template_items limit 1) then
    raise exception 'meal_template_items has rows — refusing to drop';
  end if;
  if exists (select 1 from public.meal_logs where meal_template_id is not null limit 1) then
    raise exception 'meal_logs.meal_template_id is referenced — refusing to drop';
  end if;
end $$;

drop index if exists public.idx_meal_logs_template;
alter table public.meal_logs drop column if exists meal_template_id;
drop table if exists public.meal_template_items;
drop table if exists public.meal_templates;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260729100300_drop_meal_templates.sql
git commit -m "feat(nutrition-os): drop superseded meal_templates (emptiness-guarded)"
```

---

### Task 9: `mealLibrary.ts` query module

**Files:**
- Create: `mobile/src/lib/supabase/mealLibrary.ts`

Style anchor: `mobile/src/lib/supabase/nutritionPreferences.ts` (parallel fetches, log-then-throw-first on multi-error, no client `updated_at` writes, thin typed functions that throw for the caller's alert idiom).

- [ ] **Step 1: Write the module**

```ts
// mobile/src/lib/supabase/mealLibrary.ts
// Data access for Nutrition OS Phase 2 (house pattern: domain query module).
import { supabase } from "../supabase";
import { resolveInventoryMatches, type ResolutionInventoryRow } from "../inventoryResolution";
import type { FoodConcept } from "@/src/types/nutrition-preferences";
import type {
  Meal,
  MealItemWithFood,
  MealTotals,
  MealWithItems,
} from "@/src/types/meal-library";
import type { MealType, SavedFood } from "@/src/types/track";
import { CATEGORY_DEFAULT_MEAL_TYPE } from "@/src/types/meal-library";

// ── Fetch ──────────────────────────────────────────────────────────────────

export interface ConceptLinkRow {
  id: string;
  concept_id: string;
  saved_food_id: string | null;
  food_inventory_id: string | null;
  matched_by: "seed" | "auto_name_match" | "user";
}

interface InventoryRowRaw {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  quantity: number;
  locations: Array<{ quantity: number }>;
}

export interface MealLibraryData {
  meals: MealWithItems[];
  conceptsById: Map<string, FoodConcept>;
  /** saved_food_id -> concept ids (a food can carry several links). */
  conceptIdsBySavedFoodId: Map<string, string[]>;
  inventory: ResolutionInventoryRow[];
  /** profiles.target_calories, for the Emergency header. Null if unset. */
  targetCalories: number | null;
}

export async function fetchMealLibrary(): Promise<MealLibraryData> {
  const [meals, items, concepts, links, inventory, profile] = await Promise.all([
    supabase.from("meals").select("*").order("name"),
    supabase
      .from("meal_items")
      .select("*, savedFood:saved_foods(*)")
      .order("display_order"),
    supabase.from("food_concepts").select("*"),
    supabase.from("food_concept_links").select("*"),
    supabase
      .from("food_inventory")
      .select("id, name, brand, barcode, quantity, locations:food_inventory_locations(quantity)"),
    // No .eq() filter: profiles is keyed by `id` (not user_id) and its RLS
    // select policy is `auth.uid() = id`, so this returns exactly the
    // caller's row — maybeSingle() cannot see a second one.
    supabase.from("profiles").select("target_calories").maybeSingle(),
  ]);
  const errors = [meals.error, items.error, concepts.error, links.error, inventory.error, profile.error]
    .filter((e) => e !== null);
  if (errors.length > 0) {
    errors.slice(1).forEach((e) => console.error("fetchMealLibrary:", e));
    throw errors[0];
  }

  const linkRows = (links.data ?? []) as ConceptLinkRow[];
  const conceptIdsBySavedFoodId = new Map<string, string[]>();
  const conceptIdsByInventoryId = new Map<string, string[]>();
  for (const l of linkRows) {
    if (l.saved_food_id) {
      const arr = conceptIdsBySavedFoodId.get(l.saved_food_id) ?? [];
      arr.push(l.concept_id);
      conceptIdsBySavedFoodId.set(l.saved_food_id, arr);
    }
    if (l.food_inventory_id) {
      const arr = conceptIdsByInventoryId.get(l.food_inventory_id) ?? [];
      arr.push(l.concept_id);
      conceptIdsByInventoryId.set(l.food_inventory_id, arr);
    }
  }

  const itemRows = (items.data ?? []) as MealItemWithFood[];
  const byMeal = new Map<string, MealItemWithFood[]>();
  for (const it of itemRows) {
    const arr = byMeal.get(it.meal_id) ?? [];
    arr.push(it);
    byMeal.set(it.meal_id, arr);
  }

  const invRows = (inventory.data ?? []) as unknown as InventoryRowRaw[];
  const resolutionInventory: ResolutionInventoryRow[] = invRows.map((r) => ({
    id: r.id,
    barcode: r.barcode,
    // Location rows are the live stock model; location-less rows fall back
    // to the legacy quantity column (mirrors the consume RPC's policy).
    totalQuantity:
      r.locations.length > 0
        ? r.locations.reduce((s, l) => s + l.quantity, 0)
        : r.quantity,
    conceptIds: conceptIdsByInventoryId.get(r.id) ?? [],
  }));

  return {
    meals: ((meals.data ?? []) as Meal[]).map((m) => ({
      ...m,
      items: byMeal.get(m.id) ?? [],
    })),
    conceptsById: new Map(
      ((concepts.data ?? []) as FoodConcept[]).map((c) => [c.id, c]),
    ),
    conceptIdsBySavedFoodId,
    inventory: resolutionInventory,
    targetCalories:
      (profile.data as { target_calories: number | null } | null)
        ?.target_calories ?? null,
  };
}

/** Calories already logged on a local date — for "~X cal remaining today". */
export async function fetchDayCalories(date: string): Promise<number> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("calories")
    .eq("date", date);
  if (error) throw error;
  return (data ?? []).reduce((s, r) => s + (r.calories ?? 0), 0);
}

// ── Totals (computed, never stored) ────────────────────────────────────────

export function computeMealTotals(items: MealItemWithFood[]): MealTotals {
  const zero: MealTotals = {
    calories: 0, protein: 0, carbs: 0, fats: 0, sugars: 0, sodium_mg: 0, fiber_g: 0,
  };
  return items.reduce((acc, it) => {
    const f = it.savedFood;
    const s = it.servings;
    return {
      calories: acc.calories + s * (f.calories ?? 0),
      protein: acc.protein + s * (f.protein ?? 0),
      carbs: acc.carbs + s * (f.carbs ?? 0),
      fats: acc.fats + s * (f.fats ?? 0),
      sugars: acc.sugars + s * (f.sugars ?? 0),
      sodium_mg: acc.sodium_mg + s * (f.sodium_mg ?? 0),
      fiber_g: acc.fiber_g + s * (f.fiber_g ?? 0),
    };
  }, zero);
}

// ── Mutations ──────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface MealItemInput {
  saved_food_id: string;
  servings: number;
  small_pieces_ok: boolean;
}

export interface MealInput {
  name: string;
  category: Meal["category"];
  role: Meal["role"];
  default_meal_type: Meal["default_meal_type"];
  prep_minutes: number;
  taste_override: Meal["taste_override"];
  notes: string | null;
  items: MealItemInput[];
}

export async function createMeal(userId: string, input: MealInput): Promise<void> {
  const slug = slugify(input.name);
  if (!slug) throw new Error("Name must contain at least one letter or number.");
  if (input.items.length === 0) throw new Error("A meal needs at least one item.");
  const { items, ...meal } = input;
  // Ordering is load-bearing: meal_items carries a composite FK
  // (meal_id, user_id) -> meals(id, user_id), so the parent row must be
  // committed with a MATCHING user_id before any item can reference it.
  const { data, error } = await supabase
    .from("meals")
    .insert({ ...meal, name: input.name.trim(), slug, user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  const { error: itemsError } = await supabase.from("meal_items").insert(
    items.map((it, idx) => ({
      user_id: userId,
      meal_id: data.id,
      saved_food_id: it.saved_food_id,
      servings: it.servings,
      small_pieces_ok: it.small_pieces_ok,
      display_order: idx,
    })),
  );
  if (itemsError) throw itemsError;
}

export async function updateMeal(
  userId: string,
  mealId: string,
  input: MealInput,
): Promise<void> {
  const slug = slugify(input.name);
  if (!slug) throw new Error("Name must contain at least one letter or number.");
  if (input.items.length === 0) throw new Error("A meal needs at least one item.");
  const { items, ...meal } = input;
  const { error } = await supabase
    .from("meals")
    .update({ ...meal, name: input.name.trim(), slug })
    .eq("id", mealId);
  if (error) throw error;
  // Full replace: delete + reinsert. Two client writes, not atomic — a
  // failure between them leaves an item-less meal, which is visible in the
  // UI and recoverable by re-editing (unlike silent divergence). An RPC is
  // not warranted for a single-user editing flow (YAGNI, spec §4).
  const { error: delError } = await supabase
    .from("meal_items")
    .delete()
    .eq("meal_id", mealId);
  if (delError) throw delError;
  const { error: insError } = await supabase.from("meal_items").insert(
    items.map((it, idx) => ({
      user_id: userId,
      meal_id: mealId,
      saved_food_id: it.saved_food_id,
      servings: it.servings,
      small_pieces_ok: it.small_pieces_ok,
      display_order: idx,
    })),
  );
  if (insError) throw insError;
}

export async function deleteMeal(mealId: string): Promise<void> {
  const { error } = await supabase.from("meals").delete().eq("id", mealId);
  if (error) throw error;
}

// ── Logging (spec §8) ──────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface LogMealResult {
  loggedAt: string;
  /** Inventory ids actually decremented — kept for undo refunds. */
  consumedIds: string[];
}

export async function logMeal(
  userId: string,
  meal: MealWithItems,
  opts: {
    date: string; // local YYYY-MM-DD (the viewed day)
    mealType: MealType;
    conceptIdsBySavedFoodId: Map<string, string[]>;
    inventory: ResolutionInventoryRow[];
  },
): Promise<LogMealResult> {
  const matches = resolveInventoryMatches(
    meal.items.map((it) => ({
      savedFoodId: it.saved_food_id,
      barcode: it.savedFood.barcode,
      conceptIds: opts.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
    })),
    opts.inventory,
  );

  const loggedAt = new Date().toISOString();
  // Two meal items can resolve to the SAME inventory row (two saved foods
  // sharing one concept, one in-stock product). The consume call below
  // de-duplicates, so only ONE unit comes off that container — therefore only
  // the FIRST item claiming a given inventory id may record uses_inventory /
  // inventory_items. If both rows claimed {id: X, quantity: 1} the log would
  // assert two units were taken when one was, and any refund driven off those
  // rows would over-credit stock.
  const claimedInventoryIds = new Set<string>();
  const rows = meal.items.map((it) => {
    const f = it.savedFood;
    const s = it.servings;
    const matchedId = matches.get(it.saved_food_id) ?? null;
    const inventoryId =
      matchedId !== null && !claimedInventoryIds.has(matchedId) ? matchedId : null;
    if (inventoryId !== null) claimedInventoryIds.add(inventoryId);
    return {
      user_id: userId,
      date: opts.date,
      meal_type: opts.mealType,
      name: f.name,
      calories: f.calories != null ? Math.round(f.calories * s) : null,
      protein: f.protein != null ? round2(f.protein * s) : null,
      carbs: f.carbs != null ? round2(f.carbs * s) : null,
      fats: f.fats != null ? round2(f.fats * s) : null,
      sugars: f.sugars != null ? round2(f.sugars * s) : null,
      sodium_mg: f.sodium_mg != null ? round2(f.sodium_mg * s) : null,
      fiber_g: f.fiber_g != null ? round2(f.fiber_g * s) : null,
      uses_inventory: inventoryId != null,
      inventory_items: inventoryId != null ? [{ id: inventoryId, quantity: 1 }] : null,
      saved_food_id: it.saved_food_id,
      servings: s,
      meal_id: meal.id,
      logged_at: loggedAt,
    };
  });

  const { error } = await supabase.from("meal_logs").insert(rows);
  if (error) throw error;

  // Decrement AFTER the log commits: the meal was eaten either way, so a
  // stock-bookkeeping failure must never block or roll back the log. The
  // caller surfaces the error (alert idiom) without failing the log.
  // De-duplicate: two meal items can resolve to the SAME inventory row, and
  // the RPC decrements one unit per id passed. See the Task 4 amendment.
  const requestedIds = [...new Set(matches.values())];
  let consumedIds: string[] = [];
  if (requestedIds.length > 0) {
    const { data, error: rpcError } = await supabase.rpc("consume_inventory_units", {
      p_inventory_ids: requestedIds,
    });
    if (rpcError) {
      console.error("consume_inventory_units failed:", rpcError);
      throw new MealLoggedButDecrementFailed(loggedAt, rpcError.message);
    }
    // Keep ONLY the ids a unit was actually taken from. consume is a no-op on
    // a zero-stock row (consumed = 0), but refund has no matching guard — it
    // would CREATE a unit out of nothing on undo. See the Task 6 amendment.
    const results = (data ?? []) as Array<{ inventory_id: string; consumed: number }>;
    consumedIds = results.filter(r => r.consumed > 0).map(r => r.inventory_id);
  }
  return { loggedAt, consumedIds };
}

/** The log rows committed; only the stock decrement failed. */
export class MealLoggedButDecrementFailed extends Error {
  loggedAt: string;
  constructor(loggedAt: string, detail: string) {
    super(`Meal logged, but inventory update failed: ${detail}`);
    this.loggedAt = loggedAt;
  }
}

export async function undoMealLog(
  mealId: string,
  loggedAt: string,
  consumedIds: string[],
): Promise<void> {
  const { error } = await supabase
    .from("meal_logs")
    .delete()
    .eq("meal_id", mealId)
    .eq("logged_at", loggedAt);
  if (error) throw error;
  if (consumedIds.length > 0) {
    const { error: rpcError } = await supabase.rpc("refund_inventory_units", {
      p_inventory_ids: consumedIds,
    });
    if (rpcError) throw rpcError;
  }
}

export function defaultMealTypeFor(meal: Meal): MealType {
  return meal.default_meal_type ?? CATEGORY_DEFAULT_MEAL_TYPE[meal.category];
}

// ── Food Matching (spec §9.2) ──────────────────────────────────────────────

export interface FoodMatchingData {
  savedFoods: SavedFood[];
  inventory: Array<{ id: string; name: string; brand: string | null }>;
  concepts: FoodConcept[];
  links: ConceptLinkRow[];
}

export async function fetchFoodMatching(): Promise<FoodMatchingData> {
  const [savedFoods, inventory, concepts, links] = await Promise.all([
    supabase.from("saved_foods").select("*").order("name"),
    supabase.from("food_inventory").select("id, name, brand").order("name"),
    supabase.from("food_concepts").select("*").order("name"),
    supabase.from("food_concept_links").select("*"),
  ]);
  const errors = [savedFoods.error, inventory.error, concepts.error, links.error]
    .filter((e) => e !== null);
  if (errors.length > 0) {
    errors.slice(1).forEach((e) => console.error("fetchFoodMatching:", e));
    throw errors[0];
  }
  return {
    savedFoods: (savedFoods.data ?? []) as SavedFood[],
    inventory: (inventory.data ?? []) as FoodMatchingData["inventory"],
    concepts: (concepts.data ?? []) as FoodConcept[],
    links: (links.data ?? []) as ConceptLinkRow[],
  };
}

export async function createUserLink(
  userId: string,
  conceptId: string,
  target: { savedFoodId: string } | { foodInventoryId: string },
): Promise<void> {
  const { error } = await supabase.from("food_concept_links").insert({
    user_id: userId,
    concept_id: conceptId,
    saved_food_id: "savedFoodId" in target ? target.savedFoodId : null,
    food_inventory_id: "foodInventoryId" in target ? target.foodInventoryId : null,
    matched_by: "user",
  });
  if (error) throw error;
}

export async function deleteLink(linkId: string): Promise<void> {
  const { error } = await supabase.from("food_concept_links").delete().eq("id", linkId);
  if (error) throw error;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/supabase/mealLibrary.ts
git commit -m "feat(nutrition-os): mealLibrary query module (fetch/mutate/log/matching)"
```

---

### Task 10: Refactor `foodInventoryMatchService` onto the RPCs

**Files:**
- Modify: `mobile/src/services/foodInventoryMatchService.ts:42-96`

- [ ] **Step 1: Replace both mutation functions**

Replace `consumeOneInventoryUnit` (lines 42–69) and `refundOneInventoryUnit` (lines 71–96) — keeping `findInventoryMatchByBarcode` and the exported signatures untouched so `MealsScreen.tsx` call sites don't change:

```ts
/**
 * Decrement an inventory item's quantity. v1 semantics: one log consumes one
 * inventory unit regardless of `servings` — units represent discrete
 * containers (a bag, a bottle), not strict mass.
 *
 * Delegates to the atomic consume_inventory_units RPC (Phase 2): decrements
 * food_inventory_locations (ready-to-consume first) with a legacy-column
 * fallback, and resyncs the legacy total. Replaces the old non-atomic
 * read-modify-write that only touched food_inventory.quantity.
 */
export async function consumeOneInventoryUnit(itemId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc("consume_inventory_units", {
      p_inventory_ids: [itemId],
    });
    if (error) console.error("consumeOneInventoryUnit RPC failed:", error);
  } catch (error) {
    console.error("consumeOneInventoryUnit error:", error);
  }
}

/**
 * Re-credit an inventory unit (used on Undo). Mirror of consume.
 */
export async function refundOneInventoryUnit(itemId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc("refund_inventory_units", {
      p_inventory_ids: [itemId],
    });
    if (error) console.error("refundOneInventoryUnit RPC failed:", error);
  } catch (error) {
    console.error("refundOneInventoryUnit error:", error);
  }
}
```

The swallow-and-log error style is preserved deliberately — these call sites (barcode logging path) already treat decrement as best-effort.

- [ ] **Step 2: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/services/foodInventoryMatchService.ts
git commit -m "refactor(nutrition-os): barcode decrement path delegates to atomic RPCs"
```

---

### Task 11: Library UI — styles, `MealRow`, `MealDetail`

**Files:**
- Create: `mobile/src/components/track/meals/library/styles.ts`
- Create: `mobile/src/components/track/meals/library/MealRow.tsx`
- Create: `mobile/src/components/track/meals/library/MealDetail.tsx`

Dark-palette hexes match the track components (`#0A0F1E` bg, `#111827` cards, `#1F2937` borders, `#9CA3AF` muted). Score chip bands per spec §6: ≥95 green, 71–94 neutral, ≤70 dim.

- [ ] **Step 1: Shared styles**

```ts
// mobile/src/components/track/meals/library/styles.ts
import { StyleSheet } from "react-native";

export const lib = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0A0F1E" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#FFFFFF" },
  headerAction: { fontSize: 17, color: "#3B82F6" },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  emergencyHeader: { color: "#F87171" },
  emergencySub: {
    fontSize: 13,
    color: "#FCA5A5",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
  },
  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mealName: { fontSize: 16, fontWeight: "600", color: "#FFFFFF", flexShrink: 1 },
  mutedText: { fontSize: 13, color: "#9CA3AF" },
  smallMuted: { fontSize: 12, color: "#6B7280" },
  scoreChip: {
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignItems: "center",
  },
  scoreChipCore: { backgroundColor: "rgba(34,197,94,0.18)" },
  scoreChipMid: { backgroundColor: "#1F2937" },
  scoreChipLow: { backgroundColor: "rgba(107,114,128,0.25)" },
  scoreChipText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(59,130,246,0.15)",
  },
  badgeText: { fontSize: 11, fontWeight: "600", color: "#60A5FA" },
  neverFlag: { fontSize: 11, fontWeight: "700", color: "#F87171" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#374151",
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  chipText: { fontSize: 13, color: "#D1D5DB" },
  chipTextActive: { color: "#FFFFFF", fontWeight: "600" },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
  destructiveText: { fontSize: 15, color: "#F87171", fontWeight: "600" },
  input: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#FFFFFF",
    fontSize: 15,
    marginTop: 8,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1F2937",
    flex: 1,
    marginLeft: 8,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 3, backgroundColor: "#3B82F6" },
});

export function scoreChipStyle(score: number) {
  if (score >= 95) return lib.scoreChipCore;
  if (score >= 71) return lib.scoreChipMid;
  return lib.scoreChipLow;
}
```

- [ ] **Step 2: `MealRow`**

```tsx
// mobile/src/components/track/meals/library/MealRow.tsx
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { MealTotals, MealWithItems } from "@/src/types/meal-library";
import { ROLE_LABELS } from "@/src/types/meal-library";
import type { BrianScoreResult } from "@/src/lib/mealScore";
import { lib, scoreChipStyle } from "./styles";

interface MealRowProps {
  meal: MealWithItems;
  totals: MealTotals;
  score: BrianScoreResult;
  onPress: (meal: MealWithItems) => void;
}

export const MealRow = React.memo(function MealRow({
  meal,
  totals,
  score,
  onPress,
}: MealRowProps) {
  return (
    <TouchableOpacity style={lib.card} onPress={() => onPress(meal)} activeOpacity={0.7}>
      <View style={lib.rowBetween}>
        <Text style={lib.mealName} numberOfLines={1}>{meal.name}</Text>
        <View style={[lib.scoreChip, scoreChipStyle(score.score)]}>
          <Text style={lib.scoreChipText}>{score.score}</Text>
        </View>
      </View>
      <View style={[lib.row, { marginTop: 6, gap: 8, flexWrap: "wrap" }]}>
        <Text style={lib.mutedText}>
          {Math.round(totals.calories)} cal · {Math.round(totals.protein)}g protein · {meal.prep_minutes} min
        </Text>
        {score.approved && (
          <View style={lib.badge}>
            <Text style={lib.badgeText}>Brian Approved</Text>
          </View>
        )}
        {meal.role && <Text style={lib.smallMuted}>{ROLE_LABELS[meal.role]}</Text>}
        {score.containsNever && <Text style={lib.neverFlag}>contains a never food</Text>}
      </View>
    </TouchableOpacity>
  );
});
```

- [ ] **Step 3: `MealDetail`**

```tsx
// mobile/src/components/track/meals/library/MealDetail.tsx
import React, { useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { MealTotals, MealWithItems } from "@/src/types/meal-library";
import { ROLE_LABELS } from "@/src/types/meal-library";
import type { MealType } from "@/src/types/track";
import type { BrianScoreResult } from "@/src/lib/mealScore";
import { defaultMealTypeFor } from "@/src/lib/supabase/mealLibrary";
import { lib, scoreChipStyle } from "./styles";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];

interface MealDetailProps {
  meal: MealWithItems;
  totals: MealTotals;
  score: BrianScoreResult;
  logging: boolean;
  onLog: (meal: MealWithItems, mealType: MealType) => void;
  onEdit: (meal: MealWithItems) => void;
  onDelete: (meal: MealWithItems) => void;
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <View style={[lib.row, { marginTop: 6 }]}>
      <Text style={[lib.mutedText, { width: 104 }]}>{label}</Text>
      <Text style={[lib.smallMuted, { width: 52 }]}>
        {Math.round(value * 10) / 10}/{max}
      </Text>
      <View style={lib.barTrack}>
        <View style={[lib.barFill, { width: `${(value / max) * 100}%` }]} />
      </View>
    </View>
  );
}

export function MealDetail({
  meal, totals, score, logging, onLog, onEdit, onDelete,
}: MealDetailProps) {
  const [mealType, setMealType] = useState<MealType>(defaultMealTypeFor(meal));

  const confirmDelete = () =>
    Alert.alert("Delete meal", `Delete "${meal.name}" from your library?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(meal) },
    ]);

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
      <View style={lib.card}>
        <View style={lib.rowBetween}>
          <Text style={lib.mealName}>{meal.name}</Text>
          <View style={[lib.scoreChip, scoreChipStyle(score.score)]}>
            <Text style={lib.scoreChipText}>{score.score}</Text>
          </View>
        </View>
        <Text style={[lib.mutedText, { marginTop: 4 }]}>
          {Math.round(totals.calories)} cal · {Math.round(totals.protein)}g protein · {meal.prep_minutes} min
          {meal.role ? ` · ${ROLE_LABELS[meal.role]}` : ""}
        </Text>
        {score.approved && (
          <View style={[lib.badge, { alignSelf: "flex-start", marginTop: 6 }]}>
            <Text style={lib.badgeText}>Brian Approved</Text>
          </View>
        )}
        {score.containsNever && (
          <Text style={[lib.neverFlag, { marginTop: 6 }]}>
            Contains a food rated “never”
          </Text>
        )}
        {score.tasteUnknown && (
          <Text style={[lib.smallMuted, { marginTop: 6 }]}>
            Taste unknown — no ingredient is linked to a rated food concept yet.
          </Text>
        )}
      </View>

      <View style={lib.card}>
        <Text style={[lib.mutedText, { fontWeight: "700" }]}>Ingredients</Text>
        {meal.items.map((it) => (
          <View key={it.id} style={[lib.rowBetween, { marginTop: 8 }]}>
            <Text style={[lib.mutedText, { color: "#D1D5DB", flexShrink: 1 }]} numberOfLines={1}>
              {it.savedFood.name}
              {it.small_pieces_ok ? " ✂︎" : ""}
            </Text>
            <Text style={lib.smallMuted}>
              ×{it.servings} · {Math.round((it.savedFood.calories ?? 0) * it.servings)} cal
            </Text>
          </View>
        ))}
      </View>

      <View style={lib.card}>
        <Text style={[lib.mutedText, { fontWeight: "700" }]}>Brian Score breakdown</Text>
        <ScoreBar label="Taste" value={score.taste} max={30} />
        <ScoreBar label="Convenience" value={score.convenience} max={25} />
        <ScoreBar label="Protein" value={score.protein} max={15} />
        <ScoreBar label="EoE-Friendly" value={score.eoe} max={15} />
        <ScoreBar label="Calories" value={score.calories} max={10} />
        <Text style={[lib.smallMuted, { marginTop: 8 }]}>
          {score.raw}/95 renormalized to {score.score}/100 (cost unscored — no price data).
        </Text>
      </View>

      <View style={lib.card}>
        <Text style={[lib.mutedText, { fontWeight: "700", marginBottom: 8 }]}>Log as</Text>
        <View style={[lib.row, { flexWrap: "wrap" }]}>
          {MEAL_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[lib.chip, mealType === t && lib.chipActive]}
              onPress={() => setMealType(t)}
            >
              <Text style={[lib.chipText, mealType === t && lib.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[lib.primaryButton, { marginTop: 8, opacity: logging ? 0.6 : 1 }]}
          disabled={logging}
          onPress={() => onLog(meal, mealType)}
        >
          <Text style={lib.primaryButtonText}>
            {logging ? "Logging…" : "Log this meal"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[lib.rowBetween, { marginHorizontal: 16, marginTop: 4 }]}>
        <TouchableOpacity onPress={() => onEdit(meal)}>
          <Text style={lib.headerAction}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmDelete}>
          <Text style={lib.destructiveText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Typecheck, commit**

```bash
cd mobile && npx tsc --noEmit
```

Expected: 0 errors.

```bash
git add mobile/src/components/track/meals/library/styles.ts mobile/src/components/track/meals/library/MealRow.tsx mobile/src/components/track/meals/library/MealDetail.tsx
git commit -m "feat(nutrition-os): meal library styles, row, and detail views"
```

---

### Task 12: `MealBuilder`

**Files:**
- Create: `mobile/src/components/track/meals/library/MealBuilder.tsx`

Create/edit form with live totals + live score (spec §9.1). The `small_pieces_ok` toggle renders only for items whose linked concept has `requires_small_pieces`; adding an item whose saved food has no concept link shows the top head-noun suggestion as a one-tap link chip.

- [ ] **Step 1: Write the component**

```tsx
// mobile/src/components/track/meals/library/MealBuilder.tsx
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert, ScrollView, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import type { FoodConcept, ConceptRating } from "@/src/types/nutrition-preferences";
import type {
  MealCategory, MealRole, MealWithItems,
} from "@/src/types/meal-library";
import { CATEGORY_LABELS, ROLE_LABELS } from "@/src/types/meal-library";
import type { SavedFood } from "@/src/types/track";
import { computeBrianScore } from "@/src/lib/mealScore";
import { suggestConcepts } from "@/src/lib/conceptMatch";
import type { MealInput, MealItemInput } from "@/src/lib/supabase/mealLibrary";
import { lib, scoreChipStyle } from "./styles";

const CATEGORIES: MealCategory[] = ["breakfast", "lunch", "dinner", "snack", "shake", "emergency"];
const ROLES: MealRole[] = ["pre_workout", "post_workout", "bridge", "calorie_booster", "emergency_catchup"];
const RATINGS: ConceptRating[] = ["love", "like", "neutral", "dislike", "never"];
const SERVING_STEP = 0.25;

interface BuilderItem extends MealItemInput {
  savedFood: SavedFood;
}

interface MealBuilderProps {
  /** null = create */
  initial: MealWithItems | null;
  savedFoods: SavedFood[];
  conceptsById: Map<string, FoodConcept>;
  conceptIdsBySavedFoodId: Map<string, string[]>;
  saving: boolean;
  onSave: (input: MealInput) => void;
  onQuickLink: (savedFoodId: string, conceptId: string) => void;
}

export function MealBuilder({
  initial, savedFoods, conceptsById, conceptIdsBySavedFoodId, saving, onSave, onQuickLink,
}: MealBuilderProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<MealCategory>(initial?.category ?? "lunch");
  const [role, setRole] = useState<MealRole | null>(initial?.role ?? null);
  const [prepMinutes, setPrepMinutes] = useState(String(initial?.prep_minutes ?? 5));
  const [tasteOverride, setTasteOverride] = useState<ConceptRating | null>(
    initial?.taste_override ?? null,
  );
  const [items, setItems] = useState<BuilderItem[]>(
    initial?.items.map((it) => ({
      saved_food_id: it.saved_food_id,
      servings: it.servings,
      small_pieces_ok: it.small_pieces_ok,
      savedFood: it.savedFood,
    })) ?? [],
  );
  const [search, setSearch] = useState("");

  const conceptsFor = useCallback(
    (savedFoodId: string): FoodConcept[] =>
      (conceptIdsBySavedFoodId.get(savedFoodId) ?? [])
        .map((id) => conceptsById.get(id))
        .filter((c): c is FoodConcept => !!c),
    [conceptIdsBySavedFoodId, conceptsById],
  );

  const prep = Math.max(0, parseInt(prepMinutes, 10) || 0);
  const score = useMemo(
    () =>
      computeBrianScore({
        prepMinutes: prep,
        role,
        tasteOverride,
        items: items.map((it) => ({
          calories: it.savedFood.calories,
          protein: it.savedFood.protein,
          servings: it.servings,
          smallPiecesOk: it.small_pieces_ok,
          concepts: conceptsFor(it.saved_food_id).map((c) => ({
            rating: c.rating,
            requiresSmallPieces: c.requires_small_pieces,
            prepIntensive: c.prep_intensive,
          })),
        })),
      }),
    [prep, role, tasteOverride, items, conceptsFor],
  );

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(items.map((it) => it.saved_food_id));
    return savedFoods
      .filter((f) => !chosen.has(f.id) && f.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, savedFoods, items]);

  const addItem = (f: SavedFood) => {
    setItems((prev) => [
      ...prev,
      { saved_food_id: f.id, servings: 1, small_pieces_ok: false, savedFood: f },
    ]);
    setSearch("");
  };

  const setServings = (id: string, delta: number) =>
    setItems((prev) =>
      prev.map((it) =>
        it.saved_food_id === id
          ? { ...it, servings: Math.max(SERVING_STEP, Math.round((it.servings + delta) / SERVING_STEP) * SERVING_STEP) }
          : it,
      ),
    );

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Give the meal a name first.");
      return;
    }
    if (items.length === 0) {
      Alert.alert("No ingredients", "Add at least one saved food.");
      return;
    }
    onSave({
      name: name.trim(),
      category,
      role,
      default_meal_type: initial?.default_meal_type ?? null,
      prep_minutes: prep,
      taste_override: tasteOverride,
      notes: initial?.notes ?? null,
      items: items.map(({ savedFood: _sf, ...it }) => it),
    });
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingVertical: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={lib.card}>
        <TextInput
          style={lib.input}
          placeholder="Meal name (e.g. Korean Beef Bowl)"
          placeholderTextColor="#6B7280"
          value={name}
          onChangeText={setName}
        />
        <Text style={[lib.mutedText, { fontWeight: "700", marginTop: 12 }]}>Category</Text>
        <View style={[lib.row, { flexWrap: "wrap", marginTop: 8 }]}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[lib.chip, category === c && lib.chipActive]}
              onPress={() => setCategory(c)}
            >
              <Text style={[lib.chipText, category === c && lib.chipTextActive]}>
                {CATEGORY_LABELS[c]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[lib.mutedText, { fontWeight: "700", marginTop: 8 }]}>Role (optional)</Text>
        <View style={[lib.row, { flexWrap: "wrap", marginTop: 8 }]}>
          {ROLES.map((r) => (
            <TouchableOpacity
              key={r}
              style={[lib.chip, role === r && lib.chipActive]}
              onPress={() => setRole((prev) => (prev === r ? null : r))}
            >
              <Text style={[lib.chipText, role === r && lib.chipTextActive]}>
                {ROLE_LABELS[r]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[lib.mutedText, { fontWeight: "700", marginTop: 8 }]}>Prep minutes</Text>
        <TextInput
          style={lib.input}
          keyboardType="number-pad"
          value={prepMinutes}
          onChangeText={setPrepMinutes}
        />
        <Text style={[lib.mutedText, { fontWeight: "700", marginTop: 12 }]}>
          Taste override (whole meal)
        </Text>
        <View style={[lib.row, { flexWrap: "wrap", marginTop: 8 }]}>
          {RATINGS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[lib.chip, tasteOverride === r && lib.chipActive]}
              onPress={() => setTasteOverride((prev) => (prev === r ? null : r))}
            >
              <Text style={[lib.chipText, tasteOverride === r && lib.chipTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={lib.card}>
        <Text style={[lib.mutedText, { fontWeight: "700" }]}>Ingredients</Text>
        {items.map((it) => {
          const concepts = conceptsFor(it.saved_food_id);
          const needsSmallPieces = concepts.some((c) => c.requires_small_pieces);
          const unlinked = concepts.length === 0;
          const suggestion = unlinked
            ? suggestConcepts(
                it.savedFood.name,
                [...conceptsById.values()].map((c) => ({ id: c.id, name: c.name })),
              )[0]
            : undefined;
          return (
            <View key={it.saved_food_id} style={{ marginTop: 10 }}>
              <View style={lib.rowBetween}>
                <Text style={[lib.mutedText, { color: "#D1D5DB", flexShrink: 1 }]} numberOfLines={1}>
                  {it.savedFood.name}
                </Text>
                <View style={[lib.row, { gap: 10 }]}>
                  <TouchableOpacity onPress={() => setServings(it.saved_food_id, -SERVING_STEP)}>
                    <Text style={lib.headerAction}>−</Text>
                  </TouchableOpacity>
                  <Text style={lib.mutedText}>×{it.servings}</Text>
                  <TouchableOpacity onPress={() => setServings(it.saved_food_id, SERVING_STEP)}>
                    <Text style={lib.headerAction}>＋</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      setItems((prev) => prev.filter((p) => p.saved_food_id !== it.saved_food_id))
                    }
                  >
                    <Text style={lib.destructiveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {needsSmallPieces && (
                <View style={[lib.rowBetween, { marginTop: 4 }]}>
                  <Text style={lib.smallMuted}>Already in small pieces? (EoE)</Text>
                  <Switch
                    value={it.small_pieces_ok}
                    onValueChange={(v) =>
                      setItems((prev) =>
                        prev.map((p) =>
                          p.saved_food_id === it.saved_food_id
                            ? { ...p, small_pieces_ok: v }
                            : p,
                        ),
                      )
                    }
                  />
                </View>
              )}
              {suggestion && (
                <TouchableOpacity
                  style={[lib.chip, { alignSelf: "flex-start", marginTop: 6 }]}
                  onPress={() => onQuickLink(it.saved_food_id, suggestion.conceptId)}
                >
                  <Text style={lib.chipText}>
                    Link to “{conceptsById.get(suggestion.conceptId)?.name}” for scoring
                  </Text>
                </TouchableOpacity>
              )}
              {unlinked && !suggestion && (
                <Text style={[lib.smallMuted, { marginTop: 4 }]}>
                  Not linked to a rated concept — excluded from taste.
                </Text>
              )}
            </View>
          );
        })}
        <TextInput
          style={lib.input}
          placeholder="Search saved foods to add…"
          placeholderTextColor="#6B7280"
          value={search}
          onChangeText={setSearch}
        />
        {results.map((f) => (
          <TouchableOpacity key={f.id} style={{ paddingVertical: 8 }} onPress={() => addItem(f)}>
            <Text style={[lib.mutedText, { color: "#D1D5DB" }]}>
              ＋ {f.name}
              {f.calories != null ? `  ·  ${f.calories} cal` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={lib.card}>
        <View style={lib.rowBetween}>
          <Text style={lib.mutedText}>
            {Math.round(score.totalCalories)} cal · {Math.round(score.totalProtein)}g protein
          </Text>
          <View style={[lib.scoreChip, scoreChipStyle(score.score)]}>
            <Text style={lib.scoreChipText}>{score.score}</Text>
          </View>
        </View>
        {score.approved && (
          <Text style={[lib.badgeText, { marginTop: 6 }]}>Meets the Brian Approved bar</Text>
        )}
      </View>

      <View style={{ marginHorizontal: 16 }}>
        <TouchableOpacity
          style={[lib.primaryButton, { opacity: saving ? 0.6 : 1 }]}
          disabled={saving}
          onPress={handleSave}
        >
          <Text style={lib.primaryButtonText}>
            {saving ? "Saving…" : initial ? "Save changes" : "Add to library"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Typecheck, commit**

```bash
cd mobile && npx tsc --noEmit
```

Expected: 0 errors.

```bash
git add mobile/src/components/track/meals/library/MealBuilder.tsx
git commit -m "feat(nutrition-os): meal builder with live totals and live Brian Score"
```

---

### Task 13: `MealLibraryModal` container + MealsScreen wiring + delete superseded code

**Files:**
- Create: `mobile/src/components/track/meals/library/MealLibraryModal.tsx`
- Modify: `mobile/src/components/track/MealsScreen.tsx` (state ~line 147, button ~1461-1469, modal ~1600-1615, imports)
- Delete: `mobile/src/components/track/MealTemplatesModal.tsx`, `mobile/src/services/mealTemplatesService.ts`
- Modify: `mobile/src/types/track.ts:153-185` (delete template types)

- [ ] **Step 1: Write the container**

The Phase 1 container lessons apply verbatim (see `NutritionPreferencesScreen.tsx`): unconditional header with Done, `loadFailed` → Retry body, `run()` alert-then-silent-resync idiom, `useCallback`-stabilized `renderItem`.

```tsx
// mobile/src/components/track/meals/library/MealLibraryModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, SectionList, StatusBar, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase";
import type { MealCategory, MealWithItems } from "@/src/types/meal-library";
import {
  CATEGORY_LABELS, CATEGORY_SECTION_ORDER, defaultMealTypeFor,
} from "@/src/types/meal-library";
import type { MealType, SavedFood } from "@/src/types/track";
import { computeBrianScore, type BrianScoreResult } from "@/src/lib/mealScore";
import {
  computeMealTotals, createMeal, createUserLink, deleteMeal,
  fetchDayCalories, fetchMealLibrary, logMeal, MealLoggedButDecrementFailed,
  undoMealLog, updateMeal,
  type MealInput, type MealLibraryData,
} from "@/src/lib/supabase/mealLibrary";
import { MealRow } from "./MealRow";
import { MealDetail } from "./MealDetail";
import { MealBuilder } from "./MealBuilder";
import { lib } from "./styles";

type View_ =
  | { mode: "list" }
  | { mode: "detail"; mealId: string }
  | { mode: "builder"; mealId: string | null };

interface MealLibraryModalProps {
  visible: boolean;
  savedFoods: SavedFood[];
  todayDate: string; // the viewed local date — logs land on this day
  onClose: () => void;
  onLogged: () => Promise<void> | void;
}

export function MealLibraryModal({
  visible, savedFoods, todayDate, onClose, onLogged,
}: MealLibraryModalProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MealLibraryData | null>(null);
  const [dayCalories, setDayCalories] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<View_>({ mode: "list" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const [d, cals] = await Promise.all([
        fetchMealLibrary(),
        fetchDayCalories(todayDate),
      ]);
      setData(d);
      setDayCalories(cals);
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      if (!options?.silent) {
        Alert.alert(
          "Failed to load Meal Library",
          e instanceof Error ? e.message : "Unknown error",
        );
      }
    }
  }, [todayDate]);

  useEffect(() => {
    if (visible) {
      setView({ mode: "list" });
      load();
    }
  }, [visible, load]);

  const run = useCallback(
    async (title: string, fn: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      try {
        await fn();
        await load();
        return true;
      } catch (e) {
        Alert.alert(title, e instanceof Error ? e.message : "Unknown error");
        await load({ silent: true });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const scores = useMemo(() => {
    const map = new Map<string, BrianScoreResult>();
    if (!data) return map;
    for (const meal of data.meals) {
      map.set(
        meal.id,
        computeBrianScore({
          prepMinutes: meal.prep_minutes,
          role: meal.role,
          tasteOverride: meal.taste_override,
          items: meal.items.map((it) => ({
            calories: it.savedFood.calories,
            protein: it.savedFood.protein,
            servings: it.servings,
            smallPiecesOk: it.small_pieces_ok,
            concepts: (data.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [])
              .map((id) => data.conceptsById.get(id))
              .filter((c): c is NonNullable<typeof c> => !!c)
              .map((c) => ({
                rating: c.rating,
                requiresSmallPieces: c.requires_small_pieces,
                prepIntensive: c.prep_intensive,
              })),
          })),
        }),
      );
    }
    return map;
  }, [data]);

  const sections = useMemo(() => {
    if (!data) return [];
    return CATEGORY_SECTION_ORDER.map((category) => {
      let meals = data.meals.filter((m) => m.category === category);
      if (category === "emergency") {
        // Biggest rescue first (spec §9.1).
        meals = [...meals].sort(
          (a, b) =>
            computeMealTotals(b.items).calories - computeMealTotals(a.items).calories,
        );
      }
      return { category, data: meals };
    }).filter((s) => s.data.length > 0);
  }, [data]);

  const remaining =
    data?.targetCalories != null && dayCalories != null
      ? Math.round(data.targetCalories - dayCalories)
      : null;

  const getUserId = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    return user.id;
  };

  const handleLog = useCallback(
    async (meal: MealWithItems, mealType: MealType) => {
      if (!data) return;
      setBusy(true);
      try {
        const userId = await getUserId();
        const result = await logMeal(userId, meal, {
          date: todayDate,
          mealType,
          conceptIdsBySavedFoodId: data.conceptIdsBySavedFoodId,
          inventory: data.inventory,
        });
        await onLogged();
        await load({ silent: true });
        Alert.alert("Logged", `${meal.name} → ${mealType}`, [
          {
            text: "Undo",
            style: "destructive",
            onPress: () => {
              run("Failed to undo", async () => {
                await undoMealLog(meal.id, result.loggedAt, result.consumedIds);
                await onLogged();
              });
            },
          },
          { text: "OK", style: "default" },
        ]);
        setView({ mode: "list" });
      } catch (e) {
        if (e instanceof MealLoggedButDecrementFailed) {
          // Rows committed — only stock bookkeeping failed. Never roll back.
          await onLogged();
          await load({ silent: true });
          Alert.alert("Logged (inventory not updated)", e.message);
          setView({ mode: "list" });
        } else {
          Alert.alert("Failed to log meal", e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        setBusy(false);
      }
    },
    [data, todayDate, onLogged, load, run],
  );

  const handleSave = useCallback(
    async (input: MealInput) => {
      const editingId = view.mode === "builder" ? view.mealId : null;
      const ok = await run(
        editingId ? "Failed to save meal" : "Failed to create meal",
        async () => {
          const userId = await getUserId();
          if (editingId) await updateMeal(userId, editingId, input);
          else await createMeal(userId, input);
        },
      );
      if (ok) setView({ mode: "list" });
    },
    [view, run],
  );

  const handleDelete = useCallback(
    async (meal: MealWithItems) => {
      const ok = await run("Failed to delete meal", () => deleteMeal(meal.id));
      if (ok) setView({ mode: "list" });
    },
    [run],
  );

  const handleQuickLink = useCallback(
    (savedFoodId: string, conceptId: string) => {
      run("Failed to link food", async () => {
        const userId = await getUserId();
        await createUserLink(userId, conceptId, { savedFoodId });
      });
    },
    [run],
  );

  const renderItem = useCallback(
    ({ item }: { item: MealWithItems }) => (
      <MealRow
        meal={item}
        totals={computeMealTotals(item.items)}
        score={scores.get(item.id) ?? computeBrianScore({ prepMinutes: item.prep_minutes, role: item.role, tasteOverride: item.taste_override, items: [] })}
        onPress={(m) => setView({ mode: "detail", mealId: m.id })}
      />
    ),
    [scores],
  );

  const detailMeal =
    view.mode === "detail" ? data?.meals.find((m) => m.id === view.mealId) : undefined;
  const builderMeal =
    view.mode === "builder" && view.mealId
      ? data?.meals.find((m) => m.id === view.mealId) ?? null
      : null;

  let body: React.ReactNode;
  if (!data && loadFailed) {
    body = (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={lib.mutedText}>Couldn&apos;t load your Meal Library.</Text>
        <TouchableOpacity style={[lib.primaryButton, { marginTop: 16, paddingHorizontal: 24 }]} onPress={() => load()}>
          <Text style={lib.primaryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!data) {
    body = (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  } else if (view.mode === "detail" && detailMeal) {
    body = (
      <MealDetail
        meal={detailMeal}
        totals={computeMealTotals(detailMeal.items)}
        score={scores.get(detailMeal.id)!}
        logging={busy}
        onLog={handleLog}
        onEdit={(m) => setView({ mode: "builder", mealId: m.id })}
        onDelete={handleDelete}
      />
    );
  } else if (view.mode === "builder") {
    body = (
      <MealBuilder
        initial={builderMeal}
        savedFoods={savedFoods}
        conceptsById={data.conceptsById}
        conceptIdsBySavedFoodId={data.conceptIdsBySavedFoodId}
        saving={busy}
        onSave={handleSave}
        onQuickLink={handleQuickLink}
      />
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View>
            <Text
              style={[
                lib.sectionHeader,
                section.category === "emergency" && lib.emergencyHeader,
              ]}
            >
              {CATEGORY_LABELS[section.category as MealCategory]}
            </Text>
            {section.category === "emergency" && remaining != null && (
              <Text style={lib.emergencySub}>
                ~{remaining} cal remaining today
              </Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={[lib.mutedText, { padding: 24, textAlign: "center" }]}>
            No meals yet — add your first one.
          </Text>
        }
      />
    );
  }

  const headerTitle =
    view.mode === "builder" ? (builderMeal ? "Edit Meal" : "New Meal")
    : view.mode === "detail" ? detailMeal?.name ?? "Meal"
    : "Meal Library";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <View style={[lib.screen, { paddingTop: insets.top }]}>
        {/* Header renders unconditionally: fullScreen modals have no iOS
            swipe-to-dismiss, so no load state may strand the user. */}
        <View style={lib.header}>
          {view.mode === "list" ? (
            <TouchableOpacity onPress={() => setView({ mode: "builder", mealId: null })}>
              <Text style={lib.headerAction}>＋ New</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setView({ mode: "list" })}>
              <Text style={lib.headerAction}>‹ Library</Text>
            </TouchableOpacity>
          )}
          <Text style={lib.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={lib.headerAction}>Done</Text>
          </TouchableOpacity>
        </View>
        {body}
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: Rewire `MealsScreen.tsx`**

1. Imports: remove `MealTemplatesModal` import; add `import { MealLibraryModal } from "./meals/library/MealLibraryModal";`. Remove the `mealTemplatesService` import if present.
2. Line ~147: rename state `templatesVisible` → `libraryVisible` (keep `allSavedFoods`).
3. Lines ~1461–1469 (entry button): keep the `Utensils` icon; change `onPress` to `setLibraryVisible(true)` and the label text to `Meal Library`.
4. Lines ~1600–1615 (modal): replace the `MealTemplatesModal` block with:

```tsx
      {/* Meal Library Modal */}
      <MealLibraryModal
        visible={libraryVisible}
        savedFoods={allSavedFoods}
        todayDate={viewingDateStr}
        onClose={() => setLibraryVisible(false)}
        onLogged={async () => {
          setMealsCache((prev) => {
            const next = new Map(prev);
            next.delete(viewingDateStr);
            return next;
          });
          await fetchMealsForDate(viewingDate, true);
          await fetchRecentAndFavorites();
        }}
      />
```

- [ ] **Step 3: Delete superseded code**

```bash
git rm mobile/src/components/track/MealTemplatesModal.tsx mobile/src/services/mealTemplatesService.ts
```

Then delete `MealTemplate`, `MealTemplateItem`, `MealTemplateWithItems` (lines 153–185) from `mobile/src/types/track.ts`, and grep for stragglers:

```bash
cd mobile && grep -rn "MealTemplate\|mealTemplatesService\|meal_template" src/ app/
```

Expected: no hits (fix any that appear).

- [ ] **Step 4: Typecheck + full test suite**

```bash
cd mobile && npx tsc --noEmit && npm test
```

Expected: 0 type errors; all suites pass.

- [ ] **Step 5: Commit**

```bash
git add -A mobile/src
git commit -m "feat(nutrition-os): Meal Library modal replaces meal templates end-to-end"
```

---

### Task 14: Food Matching screen + Nutrition Preferences entry

**Files:**
- Create: `mobile/src/components/profile/nutrition/FoodMatchingScreen.tsx`
- Modify: `mobile/src/components/profile/nutrition/NutritionPreferencesScreen.tsx`

The linking UI (spec §9.2). Rendered by **view switch** inside the existing Nutrition Preferences modal (not a nested `<Modal>`): `NutritionPreferencesScreen` keeps one full-screen container and swaps its content, which sidesteps nested-modal quirks on iOS.

- [ ] **Step 1: Write the screen**

```tsx
// mobile/src/components/profile/nutrition/FoodMatchingScreen.tsx
// Concept↔product linking UI (Nutrition OS Phase 2, spec §9.2). Two groups:
// "Needs review" (unlinked saved foods + inventory, with head-noun
// suggestions to confirm) and "Linked" (existing links with unlink).
// No rejection memory — unmatched products simply stay in Needs review.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, SectionList, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FoodConcept } from "@/src/types/nutrition-preferences";
import { suggestConcepts } from "@/src/lib/conceptMatch";
import {
  createUserLink, deleteLink, fetchFoodMatching, type FoodMatchingData,
} from "@/src/lib/supabase/mealLibrary";
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

interface ProductRef {
  key: string;
  kind: "saved" | "inventory";
  id: string;
  name: string;
  brand: string | null;
}

interface LinkedRow {
  key: string;
  linkId: string;
  productName: string;
  conceptName: string;
  matchedBy: string;
}

type Row =
  | { type: "product"; product: ProductRef }
  | { type: "linked"; linked: LinkedRow };

interface FoodMatchingScreenProps {
  userId: string;
  onBack: () => void;
}

export function FoodMatchingScreen({ userId, onBack }: FoodMatchingScreenProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<FoodMatchingData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pickingFor, setPickingFor] = useState<string | null>(null); // ProductRef.key
  const [search, setSearch] = useState("");

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      setData(await fetchFoodMatching());
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      if (!options?.silent) {
        Alert.alert("Failed to load food matching", e instanceof Error ? e.message : "Unknown error");
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = useCallback(
    async (title: string, fn: () => Promise<void>) => {
      try {
        await fn();
        await load();
      } catch (e) {
        Alert.alert(title, e instanceof Error ? e.message : "Unknown error");
        await load({ silent: true });
      }
    },
    [load],
  );

  const sections = useMemo(() => {
    if (!data) return [];
    const linkedSaved = new Set(data.links.map((l) => l.saved_food_id).filter(Boolean));
    const linkedInv = new Set(data.links.map((l) => l.food_inventory_id).filter(Boolean));
    const needsReview: Row[] = [
      ...data.savedFoods
        .filter((f) => !linkedSaved.has(f.id))
        .map((f): Row => ({
          type: "product",
          product: { key: `saved:${f.id}`, kind: "saved", id: f.id, name: f.name, brand: f.brand },
        })),
      ...data.inventory
        .filter((i) => !linkedInv.has(i.id))
        .map((i): Row => ({
          type: "product",
          product: { key: `inv:${i.id}`, kind: "inventory", id: i.id, name: i.name, brand: i.brand },
        })),
    ];
    const conceptName = (id: string) =>
      data.concepts.find((c) => c.id === id)?.name ?? "?";
    const linked: Row[] = data.links.map((l) => {
      const productName = l.saved_food_id
        ? data.savedFoods.find((f) => f.id === l.saved_food_id)?.name ?? "?"
        : data.inventory.find((i) => i.id === l.food_inventory_id)?.name ?? "?";
      return {
        type: "linked",
        linked: {
          key: `link:${l.id}`,
          linkId: l.id,
          productName,
          conceptName: conceptName(l.concept_id),
          matchedBy: l.matched_by,
        },
      };
    });
    return [
      { title: `Needs review (${needsReview.length})`, data: needsReview },
      { title: `Linked (${linked.length})`, data: linked },
    ].filter((sec) => sec.data.length > 0);
  }, [data]);

  const confirmLink = useCallback(
    (product: ProductRef, concept: FoodConcept) => {
      setPickingFor(null);
      setSearch("");
      run("Failed to link food", () =>
        createUserLink(
          userId,
          concept.id,
          product.kind === "saved"
            ? { savedFoodId: product.id }
            : { foodInventoryId: product.id },
        ),
      );
    },
    [userId, run],
  );

  const renderProduct = (product: ProductRef) => {
    const suggestions = data
      ? suggestConcepts(
          product.name,
          data.concepts.map((c) => ({ id: c.id, name: c.name })),
        ).slice(0, 3)
      : [];
    const picking = pickingFor === product.key;
    const q = search.trim().toLowerCase();
    const pickerResults =
      picking && data
        ? data.concepts.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 6)
        : [];
    return (
      <View style={s.card}>
        <Text style={s.itemTitle}>{product.name}</Text>
        {product.brand && <Text style={s.mutedText}>{product.brand}</Text>}
        <View style={[s.row, { flexWrap: "wrap", marginTop: 8 }]}>
          {suggestions.map(({ conceptId }) => {
            const c = data!.concepts.find((x) => x.id === conceptId);
            if (!c) return null;
            return (
              <TouchableOpacity
                key={conceptId}
                style={s.chip}
                onPress={() => confirmLink(product, c)}
              >
                <Text style={s.chipText}>✓ {c.name}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={s.chip}
            onPress={() => {
              setPickingFor(picking ? null : product.key);
              setSearch("");
            }}
          >
            <Text style={s.chipText}>{picking ? "Cancel" : "Choose…"}</Text>
          </TouchableOpacity>
        </View>
        {picking && (
          <View>
            <TextInput
              style={s.input}
              placeholder="Search concepts…"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
              autoFocus
            />
            {pickerResults.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={{ paddingVertical: 8 }}
                onPress={() => confirmLink(product, c)}
              >
                <Text style={s.mutedText}>
                  {c.name} · {c.rating}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderLinked = (row: LinkedRow) => (
    <View style={[s.card, s.row, { justifyContent: "space-between" }]}>
      <View style={{ flexShrink: 1 }}>
        <Text style={s.itemTitle} numberOfLines={1}>{row.productName}</Text>
        <Text style={s.mutedText}>
          → {row.conceptName} ({row.matchedBy})
        </Text>
      </View>
      <TouchableOpacity
        onPress={() =>
          Alert.alert("Unlink", `Unlink "${row.productName}" from ${row.conceptName}?`, [
            { text: "Cancel", style: "cancel" },
            {
              text: "Unlink",
              style: "destructive",
              onPress: () => run("Failed to unlink", () => deleteLink(row.linkId)),
            },
          ])
        }
      >
        <Text style={{ color: "#F87171", fontSize: 15 }}>Unlink</Text>
      </TouchableOpacity>
    </View>
  );

  let body: React.ReactNode;
  if (!data && loadFailed) {
    body = (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={s.mutedText}>Couldn&apos;t load food matching.</Text>
        <TouchableOpacity style={[s.primaryButton, { marginTop: 16, paddingHorizontal: 24 }]} onPress={() => load()}>
          <Text style={s.primaryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!data) {
    body = (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(row) => (row.type === "product" ? row.product.key : row.linked.key)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) =>
          item.type === "product" ? renderProduct(item.product) : renderLinked(item.linked)
        }
        renderSectionHeader={({ section }) => (
          <Text style={s.sectionTitle}>{section.title}</Text>
        )}
      />
    );
  }

  return (
    <>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.headerAction}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Food Matching</Text>
        <View style={{ width: 44 }} />
      </View>
      {body}
    </>
  );
}
```

Note: this reuses `nutritionStyles` (`s.card`, `s.chip`, `s.chipText`, `s.itemTitle`, `s.input`, `s.header`, `s.headerTitle`, `s.headerAction`, `s.sectionTitle`, `s.mutedText`, `s.primaryButton`, `s.primaryButtonText`, `s.row`). Check `mobile/src/components/profile/nutrition/styles.ts` first; add any of these names that don't exist yet there (matching its existing visual language) rather than inventing a parallel stylesheet.

- [ ] **Step 2: Wire the entry + view switch in `NutritionPreferencesScreen.tsx`**

1. Add state: `const [showMatching, setShowMatching] = useState(false);`
2. Add import: `import { FoodMatchingScreen } from "./FoodMatchingScreen";`
3. In the `ListHeaderComponent`, directly after `<VendorsSection …/>`, add the entry card:

```tsx
            <TouchableOpacity
              style={[s.card, s.row, { justifyContent: "space-between" }]}
              onPress={() => setShowMatching(true)}
            >
              <View>
                <Text style={s.sectionTitle}>Food Matching</Text>
                <Text style={s.mutedText}>
                  Link products to rated concepts — powers meal scoring & stock tracking
                </Text>
              </View>
              <Text style={s.headerAction}>›</Text>
            </TouchableOpacity>
```

4. View switch — at the top of the returned JSX, short-circuit the whole normal body when matching is open (keep the outer `<View style={[s.screen,{paddingTop: insets.top}]}>` container):

```tsx
  if (showMatching) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[s.screen, { paddingTop: insets.top }]}>
          <FoodMatchingScreen userId={userId} onBack={() => {
            setShowMatching(false);
            load({ silent: true }); // concept links may have changed
          }} />
        </View>
      </>
    );
  }
```

Place this right before the existing `let body: React.ReactNode;` block's `return`.

- [ ] **Step 3: Typecheck + tests, commit**

```bash
cd mobile && npx tsc --noEmit && npm test
```

Expected: 0 errors, all pass.

```bash
git add mobile/src/components/profile/nutrition/FoodMatchingScreen.tsx mobile/src/components/profile/nutrition/NutritionPreferencesScreen.tsx mobile/src/components/profile/nutrition/styles.ts
git commit -m "feat(nutrition-os): food matching (concept↔product linking) screen"
```

---

### Task 15: Apply migrations to prod — ⚠️ OWNER GATE

**Do not execute this task without the owner's explicit go-ahead in the session.** Prod is the only environment and holds real personal data.

- [ ] **Step 1: Pre-flight (read-only)**

```bash
cd /Users/brianwilson/code/fittracker && npx supabase migration list
```

Expected: exactly the four `20260729*` migrations pending; ledger otherwise in sync.

Verify emptiness + seed preconditions via `supabase db query` (read-only): `meal_templates`/`meal_template_items` counts are 0, `meal_logs where meal_template_id is not null` is 0, `auth.users` has exactly 1 row, the 15 concept slugs used by the seed exist, and no `saved_foods.name` collides case-insensitively with a staple name (collisions are fine — they just skip that staple; know before, not after).

- [ ] **Step 2: Apply**

```bash
npx supabase db push --yes
```

Expected: four migrations applied; seed raises `Meal Library seed — staples: 20, links: 15, meals: 10, items: 32`.

- [ ] **Step 3: Post-verify (read-only)**

Query and confirm: 10 `meals` (with `korean-beef-bowl` having `taste_override='love'`), 32 `meal_items` (exactly one with `small_pieces_ok=true` — teriyaki chicken), 20 new staples, 15 new `matched_by='seed'` links, RLS enabled on both new tables with 8 policies total, both RPCs exist with `authenticated` execute grants, `meal_templates`/`meal_template_items` gone, `meal_logs.meal_template_id` gone, `meal_logs.meal_id` present.

- [ ] **Step 3.5: Land the deferred `useHistoricalMeals` select edit** (amended — deferred from Task 1)

Now that `meal_logs.meal_id` actually exists, add it back to the select string in `mobile/src/components/track/meals/useHistoricalMeals.ts:25` (between `saved_food_id` and `servings`, matching spec §5.3). This edit was reverted in Task 1 because selecting a not-yet-existing column makes PostgREST 400 the whole query, and the hook's `catch` swallows it to `console.error` — silently blanking all 365-day surfaces (daily totals, the four streaks, weekly summary, CSV export). **This step is what satisfies spec §5.3 — it does not happen in Task 1.** See the Task 1 entry under "Execution amendments."

Verify: `cd mobile && npx tsc --noEmit` → 0 errors. Note that tsc proves nothing about the column name here (the Supabase client is untyped — see the Task 1 amendment); confirm instead by reloading the app and checking that streaks/insights render non-empty.

```bash
git add mobile/src/components/track/meals/useHistoricalMeals.ts
git commit -m "feat(nutrition-os): useHistoricalMeals selects meal_id now that the column exists"
```

- [ ] **Step 4: Commit only the Step 3.5 change** — apart from that one deferred line, this task changes only the database.

---

### Task 16: Final verification sweep

- [ ] **Step 1: Full clean gate**

```bash
cd mobile && npx tsc --noEmit && npm test
```

Expected: 0 type errors, all Jest suites pass.

- [ ] **Step 2: Grep for leftovers**

```bash
cd /Users/brianwilson/code/fittracker && grep -rn "meal_template\|MealTemplate\|mealTemplatesService" mobile/src mobile/app --include='*.ts' --include='*.tsx'
```

Expected: no hits.

- [ ] **Step 3: On-device smoke test (requires the owner)**

No native changes — Metro reload on the existing dev client suffices (start with a unique `--port`, 8081 is usually taken by voyance-mobile). Checklist: library opens from "Meal Library" button; Emergency section pinned with remaining-cal header; Korean Beef Bowl shows score 95 and Brian Approved; log Teriyaki Chicken Bowl → 3 rows land on the viewed day; logging a meal containing linked in-stock inventory decrements it; undo restores; builder live-score updates; Food Matching links/unlinks and Boost inventory link makes Boost + Cashews decrement on next log.

- [ ] **Step 4: Commit any fixes; stop**

Merging and pushing are the owner's calls — do not open a PR or merge without instruction.

---

## Self-review checklist (run after writing, before execution)

- Spec coverage: §5 → Tasks 1/5, §6 → Task 2, §7 → Tasks 4/6/10, §8 → Tasks 9/13, §9.1 → Tasks 11/12/13, §9.2 → Task 14, §10 → Task 7, §5.4 → Task 8, §11 → Tasks 5–8/15, §12 → Tasks 1–4/16. No gaps found.
- Type consistency spot-checks: `BrianScoreResult`/`computeBrianScore` (Tasks 2→11/12/13), `MealInput`/`MealItemInput` (9→12/13), `ResolutionInventoryRow` (4→9), `ConceptLinkRow` (9→14), `defaultMealTypeFor` (9→11), `CATEGORY_SECTION_ORDER`/`CATEGORY_LABELS`/`ROLE_LABELS` (1→11/12/13).
- Known accepted risks (documented in code comments, not to be "fixed" silently): non-atomic item replace in `updateMeal`; refund-location approximation; `MealsScreen` line numbers are approximate anchors — match on content, not line, if the file has drifted.

## ⚠️ Execution amendments

### Task 1

- Step 3's premise ("expect exactly two knock-on errors") was factually wrong: `mobile/src/lib/supabase.ts:7` calls `createClient` with no `Database` generic, so the client is `any`-schema'd and `tsc` validates zero column names anywhere in this codebase. The typecheck came back green with zero errors, not two — a green `tsc --noEmit` is not evidence of schema correctness. Later tasks must not treat it as such; verify column-name changes via grep and/or runtime testing instead.
- `mealTemplatesService.ts`'s insert now **omits** the `meal_id` key entirely rather than writing `meal_id: null` as originally drafted. `meal_logs.meal_id` does not exist in prod until the Task 5 migration is applied at Task 15 — naming the column at all (even as `null`) makes PostgREST reject the insert (42703/400), breaking `logMealTemplate` for the whole Tasks 1–14 window. Omitting the key is valid against both the pre- and post-migration schema (Postgres defaults an absent column to null once it exists).
- The `useHistoricalMeals.ts:25` select edit (adding `meal_id`) was reverted. The query would 400 against the current schema, and the hook's catch block swallows the error to `console.error` and silently blanks `historicalLogs` — zeroing every 365-day surface (streaks, weekly summary, CSV export) instead of failing loudly. Selecting `meal_id` there is deferred to Task 15 (post-migration-apply), which is where spec §5.3 is actually satisfied, not Task 1.

### Task 2

- **Float-epsilon defects (confirmed by executing the module, not theoretical).** The plan's code as transcribed had three related bugs, all from summing/dividing decimal nutrition values without rounding:
  1. **`taste >= 22` silently denied Brian Approved on an ordinary all-`like` meal.** Two items rated `like`, `smallPiecesOk: true`, prep 5 min, `{calories:474, protein:40, servings:0.5}` and `{calories:798, protein:40, servings:0.33}`: the weighted average is mathematically exactly 22, but computed as `21.999999999999996`, failing the `taste >= APPROVED_MIN_TASTE` gate with every other criterion passing. This is the important one — it's a silent, user-visible false negative on a routine input, not an edge case.
  2. **`raw` was returned unrounded**, so a non-integer taste (e.g. `25.603603603603606`) propagated straight through to `raw` (`76.6036036036036`) — Task 11's `MealDetail` prints `{score.raw}/95` verbatim, so it would render `76.6036036036036/95`.
  3. **Same epsilon class on the protein/calorie band thresholds** — e.g. `0.5×2.3 + 0.75×51.8` evaluates to `39.99999999999999`, one float ULP under the `>= 40` protein band, scoring 12 instead of 15; similarly `0.5×100.9 + 0.75×599.4 = 499.99999999999994` scored 7 instead of 10 on the `>= 500` calorie band.
  - **Fix:** round at three points, since the underlying nutrition data is decimal (not binary), so rounding is semantically correct here, not a hack: `totalCalories`/`totalProtein` to 2 decimals immediately after their `reduce`; `taste` to 4 decimals at the end of the taste block (both the weighted and unweighted-fallback branches; the `tasteOverride` branch is already exact and untouched); `raw` to 1 decimal before returning. All three landed in `mobile/src/lib/mealScore.ts`. Existing tests stayed green with no assertions needing to shift (they already used `toBeCloseTo` where floats were involved).
- **`RAW_MAX`, `COMPONENT_MAX`, and the chip-band cutoffs are now exported** from `mealScore.ts` (`RAW_MAX = 95`; `COMPONENT_MAX = { taste: 30, convenience: 25, protein: 15, eoe: 15, calories: 10 }`; `SCORE_BAND_CORE_MIN = 95`; `SCORE_BAND_MID_MIN = 71`), so Task 11 must import these instead of re-declaring spec §6 policy as hardcoded `>= 95` / `>= 71` comparisons, `max={30}` … `max={10}` component-bar props, and a literal `/95` string. The EoE component's starting value (`15`) is now spelled `COMPONENT_MAX.eoe` internally too, and the Approved gate's `eoe === 15` check now reads `eoe === COMPONENT_MAX.eoe`, so the two spellings of that policy number can't diverge. Similarly, `APPROVED_MIN_CALORIES` (the Approved gate's admission bar) and the Calories-component's own `>= 500` full-score threshold were two literals for one policy number; both now read `CALORIES_FULL_POINTS_MIN`. The `tasteUnknown` placeholder now reads `RATING_POINTS.neutral` instead of a bare `15`.
- **Regression coverage added** for exactly the failure classes above: an all-`like` meal whose taste computes to 22 via the weighted average (not `tasteOverride`) and must be `approved: true`; a non-integer taste driven through to `raw`/`score` without `tasteOverride` (every prior `raw`/`score` assertion used `tasteOverride: "love"`, which only ever produces integer taste, so the weighted-average path to `raw`/`score` was previously untested); Approved failing on the EoE component alone; `items: []` (pinned, since Task 13 calls `computeBrianScore` with an empty item list as its map-miss fallback); and an invariant that the five `COMPONENT_MAX` values sum to `RAW_MAX`.
- **Spec §6 is stale in two small ways**, both implementation-correct and worth reconciling in the spec text later rather than in this fix: it does not document the `totalWeight === 0` unweighted-average fallback (all linked items lack calorie data) in the Taste formula, and it lists the `nutrition_constraints` row as an input even though it states in the same breath that the row is "reserved for future components; not consumed in v1 scoring" — the code never takes it as a parameter, which matches the "not consumed" half of that sentence but not the "input" framing.





### Task 2 (follow-up)

- **`APPROVED_MIN_CALORIES` is restored as a constant distinct from `CALORIES_FULL_POINTS_MIN`.** The earlier Task 2 amendment collapsed them into one name on the grounds that they were "two literals for one policy number." That was wrong: spec §6 states them as two INDEPENDENT clauses that merely coincide at 500 today — the Calories-component full-score threshold ("this meal hits its calorie target") and the Brian Approved admission bar ("this is a substantial meal"). The admission bar could drop to 450 without retuning the scoring ladder. The merge also left the approval gate reading `totalCalories >= CALORIES_FULL_POINTS_MIN`, where "full points" is meaningless in an approval context. Now `const APPROVED_MIN_CALORIES = CALORIES_FULL_POINTS_MIN;` — the DRY link survives so they cannot drift by accident, but each clause reads with its own name and either can be changed alone. Behavior is byte-identical. The `eoe === COMPONENT_MAX.eoe` merge from the same amendment **stands** and was not touched: spec §6's "EoE component = 15" genuinely *is* "the EoE component is maxed," so that is the same number by definition, not a coincidence.
- **The rounded-`raw` → `score` derivation is now documented and pinned.** `score` is computed from the 1dp-rounded `raw`, which diverges from spec §6's literal `Math.round(raw × 100 / 95)` for ~2.6% of values, including at the `SCORE_BAND_CORE_MIN` band edge. **The implementation's behavior is kept — it is the better choice**, because Task 11 renders `{score.raw}/95 renormalized to {score.score}/100` and both numbers must come from the same `raw`; the literal formula could display "89.8/95 renormalized to 94/100" when 89.8 × 100 / 95 = 94.5 → 95, which reads to the user as an arithmetic error. Added a comment at the derivation stating this is deliberate.
- **A DISCRIMINATING test now pins it.** The pre-existing `raw === 69.7 / score === 73` assertion yields 73 under *both* formulas, so it pinned nothing. The new test lands an exact component sum of 89.76 (taste `(970×30 + 30×22)/1000 = 29.76`, convenience 20, protein 15, eoe 15, calories 10) → `raw` 89.8 → `score` 95 under the implementation, 94 under the literal formula, straddling the core/neutral chip band. **Verified to discriminate:** temporarily recomputing `score` from the unrounded sum made exactly this one test fail (`Expected: 95, Received: 94`) with the other 49 green — including the 69.7/73 test, confirming it is not a discriminator. The temporary change was reverted.
- **`COMPONENT_MAX` is now pinned to behavior, not just to its own sum.** Only `COMPONENT_MAX.eoe` was wired into the scoring code; taste/convenience/protein/calories maxima remained inline literals in their band ladders, so `COMPONENT_MAX` ran parallel to the real logic and the existing sum-to-`RAW_MAX` test could not catch drift — retune the convenience ladder top from 25 to 22, leave `COMPONENT_MAX` alone, and the sum is still 95, the test still passes, but Task 11's breakdown bar silently renders "22/25". Added a maximal-input test (prep 0, one `love` item at 600 cal / 50 g protein, `smallPiecesOk: true`) asserting each of the five component values equals its `COMPONENT_MAX` entry, `raw === RAW_MAX`, and `score === 100`. The sum test is retained alongside it.
- **Spec §6 amended** for the three staleness items (two carried over from the original Task 2 amendment, one new): `raw` is now defined as the component sum **rounded to 1 dp**, with `score` explicitly derived from that rounded value rather than the exact sum; the Taste formula now documents the `totalWeight === 0` unweighted-average fallback (the implementation was right, the spec text was silent); and `nutrition_constraints` is dropped from the stated input list, since §6 itself said in the same breath that it is "not consumed in v1 scoring" and `computeBrianScore` never took it.

### Task 3

- **Two surviving mutants in `suggestConcepts` are now covered.** (1) `MIN_SUFFIX_CONCEPT_LENGTH` 5→6 left all 8 original tests green, because no fixture concept was exactly 5 characters. This is live data, not a hypothetical: §10.1 seeds a `bread` concept whose name is exactly 5 characters, so an off-by-one would silently kill its head-noun matching. Added a `C("bread", "Bread")` fixture and a `'White Bread' → {bread, rank 2}` test pinning the INCLUDED side of the boundary. (2) Replacing the `a.conceptId.localeCompare(b.conceptId)` tiebreak with `0` also left all 8 green; that clause is the only thing making the order deterministic when rank and concept-name length both tie, and it decides which concept becomes the single one-tap link chip in Task 14 — non-determinism would shuffle the chip between renders. Added a duplicate-normalized-name test whose input order is reversed relative to the expected output. Both mutants were re-run and confirmed killed by exactly the new tests.
- **The file header comment was corrected.** It said to keep `conceptMatch.ts` "in sync" with migration `20260728100200_nutrition_concept_link_backfill.sql`, which is (a) dangerous — that migration is a one-shot, already-applied, forward-only artifact, and a maintainer reading this literally would go edit an applied migration — and (b) false: the SQL used `distinct on` to link exactly ONE concept per product, whereas `suggestConcepts` returns the full ranked list, so only the head of the list corresponds to what the backfill would have linked. The header now states that this file is the sole living implementation and spells out that difference. `MIN_SUFFIX_CONCEPT_LENGTH` also gained the rationale comment the SQL header carried (short generic words are exactly the ones that mis-link), matching the `rampProgress.ts` house style for policy constants. No behavior changed in this task.

### Task 4

- **A barcode match is now TERMINAL regardless of stock**, deviating from the literal wording of spec §7.3 ("...an *in-stock* inventory row shares it") in favour of §7.3's own stated philosophy that under-matching is the intended failure mode and decrementing the wrong product is the real hazard. As drafted, `resolveInventoryMatches` pre-filtered to in-stock rows before searching barcodes, so a barcode hit on an EMPTY row fell through to the concept path and decremented a different SKU. Seed-data counterexample: saved food "Boost Very High Calorie" (barcode …152, concept `boost-high-protein`) matches an inventory row at qty 0, while "Boost Plus" — a different barcode, same concept — sits at qty 6; logging silently decremented Boost Plus even though the barcode was positive evidence that the item is *not* Boost Plus. The barcode is now searched across the FULL unfiltered inventory; a hit decrements only if it has stock and `continue`s either way. The falsy-barcode guard (`it.barcode ? … : undefined`) is retained deliberately — it makes a `null === null` false match structurally impossible and treats `""` as "no barcode". **Spec §7.3 should be reconciled to match this wording.**
- **`items.slice(0, 1)` on the resolution loop survived** — all 7 original tests passed a single-element `items` array. Added one test that both exercises the multi-item loop and pins the duplicate-value contract: two saved foods sharing one concept resolve independently to the SAME inventory id. Also documented in the file that keying the returned Map by `savedFoodId` is only unambiguous because `meal_items` carries `unique (meal_id, saved_food_id)`.
- **Not tested, deliberately:** removing `if (it.conceptIds.length === 0) continue;` is an *equivalent* mutant, not a coverage gap — an empty `wanted` Set makes `candidates` always empty, so output cannot change. It is a pure performance guard; leave it and do not add a test for it.
- **Task 9 consequence (already applied to its code block above):** `consumedIds` must be `[...new Set(matches.values())]`. `consume_inventory_units` decrements one unit per id passed, so two meal items resolving to one physical container would otherwise take two units off a single container. The same duplication affects the `meal_logs` rows: only the FIRST meal item resolving to a given inventory id may carry `uses_inventory: true` / `inventory_items`, otherwise the log rows collectively claim more units than were actually decremented and `undoMealLog`'s refund over-credits stock.

### Task 5

- **`meal_items` now carries a COMPOSITE foreign key `(meal_id, user_id) → meals(id, user_id)`** instead of a plain `meal_id → meals(id)` reference, and `meals` gained the second unique constraint `unique (id, user_id)` that Postgres requires as the FK target. Rationale: as drafted, `meal_items.user_id` and `meal_items.meal_id` were independent columns. **Foreign-key validation runs with RLS bypassed** — referential-integrity triggers execute as the table owner — so a row with `user_id = A` and `meal_id` pointing at another user's meal satisfied both the plain FK and the `with check (user_id = auth.uid())` policy. Beyond the multi-tenant angle, the everyday value on a single-user app is that it makes a **client bug structurally impossible**: the Task 9 query module passes `user_id` explicitly on both the `meals` and the `meal_items` inserts, and if those two ever disagreed (stale or incorrect `userId`) the item rows would become invisible to RLS with no error at all. The composite FK turns that silent orphaning into a loud constraint violation. `on delete cascade` is retained, so deleting a meal still removes its items exactly as before.
- **This does not reverse spec §5.2's deliberate decision** that `meal_items` RLS uses a direct `user_id = auth.uid()` check rather than an `EXISTS` subquery against `meals`. The eight RLS policies are untouched. The composite FK is a data-integrity constraint, orthogonal to the policy shape — the policies stay cheap and index-friendly, and the FK independently guarantees the two columns agree.
- **Two comment additions, no behavior change.** (1) `meal_logs.meal_id` was the one schema change in the file with no explanation; it now states that it is the Meal Library provenance link replacing `meal_template_id` (spec §5.3), that migration `20260729100300` drops the old column, and why `on delete set null` is correct (deleting a library meal must not erase historical logs). (2) The file header now records that snake_case policy names (`meals_select_own`) and `<table>_updated_at` trigger names are the intentional convention going forward, since Phase 1's `20260728100000` used sentence-style policy names and `update_<table>_updated_at` and the repo now legitimately carries both.
- **Reviewed and deliberately NOT changed:** dropping `idx_meals_user_category` as redundant against `unique (user_id, slug)` (it is house-consistent with the Phase 1 anchor and harmless at this table size); `saved_food_id`'s `on delete restrict` (deliberate spec §4 decision); adding any nutrition column to `meals` (deliberate spec §4 decision).
- **Static verification only — the migration remains UNAPPLIED and no database command was run.** Confirmed by read-through: parentheses balance to depth 0 with no negative excursion; single and double quotes both even; all 27 statements are idempotent (`if not exists` / `drop … if exists` guarded); DDL order still creates `meals` before `meal_items` references it; the composite FK's target `meals(id, user_id)` is genuinely unique via the new `unique (id, user_id)`; every constraint/index/trigger name Postgres will auto-generate (`meals_id_user_id_key`, `meal_items_meal_id_user_id_fkey`, …) is unused elsewhere in `supabase/migrations/`; and the four CHECK lists still match their TS unions (`MealCategory`, `MealRole` in `meal-library.ts`, `MealType` in `track.ts`, `ConceptRating` in `nutrition-preferences.ts`).

### Task 6

- **The migration was written byte-identical to the plan's SQL block** (verified by `diff`) and remains **UNAPPLIED**; no database-connecting command was run. Schema reality confirmed against the migration history: `food_inventory.quantity` is `INTEGER NOT NULL CHECK (quantity >= 0)` (`20250208_complete_tracking_schema.sql:84`), and `food_inventory_locations` carries exactly the columns the RPC uses — `id`, `food_inventory_id`, `quantity INTEGER NOT NULL CHECK (quantity >= 0)`, `is_ready_to_consume BOOLEAN NOT NULL DEFAULT false` (`20250217000003_add_multi_location_inventory.sql:11-21`), the `is_` prefix included. Both are plain `integer`, so `sum(l2.quantity)` returns `bigint` and is assigned into an `integer` column — in range at these magnitudes, and the `coalesce(..., 0)` guards the all-rows-deleted case. Both `CHECK (quantity >= 0)` constraints are respected: consume only ever decrements a row it selected with `quantity > 0`, the legacy fallback carries `and fi.quantity > 0`, and the resync writes a non-negative sum.
- **RLS is sufficient for these writes — this was the main open risk and it clears.** `food_inventory_locations` has all four policies including `FOR UPDATE USING (auth.uid() = user_id)` (`20250217000003:41-43`) and `FOR SELECT USING (auth.uid() = user_id)` (`:33-35`); `food_inventory` has the same four (`20250208_complete_tracking_schema.sql:101-104`). No later migration drops, replaces, or narrows any of them. So the feared silent-no-op failure mode (RLS enabled with no UPDATE policy) does **not** apply. The UPDATE policies have `USING` but no `WITH CHECK`, which Postgres resolves by applying `USING` as the check on the new row — the updated rows keep their `user_id`, so they pass.
- **`food_inventory_locations` has its own `user_id`** (`20250217000003:14`), so RLS is a direct column comparison, not an `EXISTS` join through `food_inventory`. Ownership therefore holds end to end: a caller passing someone else's inventory id sees `exists(...)` return **false** (their location rows are hidden by the SELECT policy), falls into the legacy branch, and the `update public.food_inventory` there matches 0 rows under the UPDATE policy — `consumed = 0`, nothing mutated. The resync subquery is likewise RLS-filtered, so it can never be steered by a foreign id. `consumed = 0` is genuinely ambiguous between "not yours", "no stock", and "no such row", and that is **accepted**: this is a single-user app, the value is advisory bookkeeping, and per the unit semantics a 0 must never be treated as an error.
- **⚠️ Consume and refund are NOT inverses when stock was already 0 — the RPCs are correct as specified, but the caller must compensate.** Consume filters `l.quantity > 0` in the location selector **and** guards `and fi.quantity > 0` in the legacy single-column branch; refund does **neither**, because it must be able to credit a location (or a legacy row) that is currently empty. **The asymmetry therefore exists in BOTH branches, not just the location one** — an earlier version of this amendment described only the location branch, which risked someone later "simplifying" the legacy branch on the false belief it was never affected. A location-less item at `quantity = 0` invents a unit exactly as a location-having item with every location at 0 does. Consequence in either shape: for an item matched at **zero stock**, consume returns `consumed = 0` and writes nothing, while a later refund of that same id writes `+1` and returns `refunded = 1`. Reachable in normal use (log a meal whose matched item is out of stock, then tap Undo). The pre-existing client-side `consumeOneInventoryUnit`/`refundOneInventoryUnit` pair has the identical flaw, so this is not a regression, but it must not be carried forward. **Fix applied in Task 9's code block above (not in the SQL):** `logMeal` now reads the RPC's returned rows and keeps only the ids with `consumed > 0` as `consumedIds`, so `undoMealLog` refunds exactly what was taken. The RPC's per-id return value exists precisely so the caller can do this — do not "simplify" it back to passing the requested ids through.
- **Considered and deliberately REJECTED: moving the `food_inventory.quantity` resync out of `if v_loc_id is not null` so drift self-heals on every call.** It would make the resync fire even when nothing was consumed or refunded, rewriting `food_inventory.quantity` on a no-op call. That worsens a separate, unresolved conflict: the app deliberately pins that column to 0 for multi-location items (`mobile/src/components/track/EditFoodScreen.tsx:474`), so a self-healing resync would fight the client for ownership of the value on calls that changed nothing. The resync stays exactly where it is — inside the branch that actually wrote to a location.
- **Location drift on undo is accepted, not a defect.** With locations `A(ready, qty 0)` and `B(storage, qty 5)`, consume takes from B (the only one with stock) and refund credits A (ready wins the `order by`). Total stock and the resynced `food_inventory.quantity` both return to their starting values; only the container's location moved. That is the documented v1 approximation ("units are containers").
- **Traced edge cases.** All location rows at qty 0 → the `exists` branch is entered, the `quantity > 0` select finds nothing, `v_loc_id` stays null, `consumed = 0`, and — correctly — there is **no** fallback to the legacy column (the `else` is on the `exists` test, not on `v_loc_id`), so a multi-location item can never be double-decremented. No location rows and legacy `quantity = 0` → the `and fi.quantity > 0` guard matches 0 rows, `consumed = 0`, quantity never goes negative. Nonexistent id → `exists` false, legacy update matches nothing, `consumed = 0`, no error. Duplicate id in the array → two independent iterations, two units decremented (each statement sees the prior statement's write via the command-counter increment); that is the intended per-container semantics, and Task 9's `new Set(...)` de-dup is what keeps it from double-charging one physical container. NULL element inside the array → `exists` on `= null` is false, legacy update matches nothing, `consumed = 0`, no error.
- **`p_inventory_ids` must never be NULL** (empty is fine). `foreach ... in array` over a NULL array raises `FOREACH expression must not be null`; over `'{}'` it iterates zero times and returns an empty set. Task 9 already guards with `if (requestedIds.length > 0)`, and supabase-js sends `[]` rather than `null` for an empty array, so no `coalesce(p_inventory_ids, '{}')` default was added — recording the constraint here instead of deviating from the plan's SQL.
- **No prior definition of either function exists** anywhere in `supabase/migrations/` (grep: only this file and the plan/spec docs), so `create or replace` cannot be silently overwriting a different implementation. `20260729100100` sorts after Task 5's `20260729100000_meal_library_schema.sql` and after all 103 pre-existing migrations.
- **Static syntax verification:** parentheses balance to depth 0 with no negative excursion; four `$$` delimiters (lines 24/70/77/124) pair correctly; single quotes even (the two `set search_path = ''`); per function one `begin`/`end;`, one `loop`/`end loop;`, two `if`/`end if;`. `returns table(inventory_id uuid, consumed integer)` implicitly declares those names as OUT parameters, so assigning to them and calling `return next` with no expression is the canonical plpgsql set-returning idiom — and the declared OUT names do not collide with any column referenced in the bodies (every table reference is aliased or qualified).

### Task 7

- **⚠️ `public.saved_foods` has no `notes` column — the plan's SQL would have failed at apply time.** Spec §10.1 and the plan's Step 1 both stamp seeded staples with `notes = 'Nutrition OS staple (seeded)'`, but the column has never existed: `20251229000000_saved_foods.sql:5-23` creates the table without it, and the only columns added since are `sodium_mg`/`fiber_g` (`20260528211349_meals_tier1.sql:21-23`), `user_corrected` (`20260529191825`) and `auto_scaled` (`20260529193452`). `mobile/src/types/track.ts:129-151` (`SavedFood`) has no `notes` field either, and no app code reads or writes one. `food_inventory` *does* have `notes` (`20250209_extend_food_inventory.sql:25`), which is the likely source of the spec's assumption. Left unfixed, the `update public.saved_foods sf set notes = …` would abort the whole migration with `column "notes" of relation "saved_foods" does not exist` — at Task 15, against prod. **Fix applied:** `alter table public.saved_foods add column if not exists notes text;` — placed in the **schema** migration `20260729100000_meal_library_schema.sql`, not in the seed. Both files are unapplied and `…100000` sorts first, so the column exists before the seed runs, and a `_seed` file should carry data, not DDL. Additive, nullable, idempotent, and it preserves the spec's stated intent rather than dropping the staple marker. (An earlier pass placed this `alter` at the top of the seed file; it was moved.)
- **The marker is now stamped inline in the INSERT; the separate `update` is deleted.** The plan's shape was a follow-up `update … set notes = '…' where notes is null and lower(name) in (…20 names…)`. Because `notes` is a brand-new column, EVERY pre-existing row has `notes is null`, so any food the owner already created whose name collides with a staple (e.g. a personal "Peanut Butter") would be labelled `'Nutrition OS staple (seeded)'` even though the seed deliberately skipped inserting it — the marker would mean "matches a staple name," not "created by this seed." **Fix applied:** `notes` joined the INSERT's column list with the literal selected as its value, and the entire `update` statement (plus its comment) was removed. Only rows the seed actually inserted are stamped; no pre-existing row is touched. This still satisfies the plan's original stated intent ("a partial re-run never clobbers a user's own notes") — more completely, in fact, since the seed can no longer write to an existing row at all.
- **The completeness guard could not catch the failure it described, and has been replaced.** `if v_meals > 0 and v_items < v_meals` fires only when fewer than 10 items were inserted for 10 meals, so a `food_name` typo silently dropping 12 of 32 items — precisely the case its own comment claimed to catch — passed silently. **Fix applied:** the guard now checks the ACTUAL final state — `select count(*) into v_check from public.meal_items mi join public.meals m on m.id = mi.meal_id where m.user_id = v_user_id and m.slug in (…the 10 seeded slugs…)` — and raises unless it equals 32, with `v_check integer` declared alongside the other variables. Counting final state instead of rows-inserted-this-run makes it correct on a first run AND on a re-run (where every `get diagnostics` counter is legitimately 0, so it fires only if the data is genuinely wrong), and restricting to the 10 seeded slugs makes it immune to meals the owner creates later. The `raise notice` with the four insert counters is retained.
- **Duplicate-name hazard on re-use of existing rows.** `saved_foods` has no unique constraint on `(user_id, name)` — only `(user_id, barcode) where barcode is not null` (`20251229000000_saved_foods.sql:26-28`). If prod already holds two rows with the same name as a staple (e.g. two "Banana" rows from separate barcode scans), the `not exists` guard skips the insert and both the links and items joins match **both** rows, producing two concept links and two meal items for that food — inflating that meal's calories. `on conflict` cannot catch it because the `saved_food_id`s differ. Not a code defect in the seed; a data precondition. Task 15 should run `select lower(name), count(*) from saved_foods group by 1 having count(*) > 1` before applying. **The new final-state guard now catches this too:** duplicate rows produce more than 32 items across the 10 seeded slugs, so `v_check <> 32` raises and the migration rolls back rather than quietly inflating a meal's calories.

### Task 8

- **Written byte-identical to the plan's SQL block** (verified programmatically against the fenced block in Task 8 Step 1) and **UNAPPLIED**; no database-connecting command was run. Filename `20260729100300_drop_meal_templates.sql` sorts after `…100200`, so it runs last of the four.
- **All four drop targets exist**, so none of the `if exists` clauses is a silent no-op: `public.meal_templates` (`20260528211349_meals_tier1.sql:29`), `public.meal_template_items` (`:42`), `meal_logs.meal_template_id` (`:79-80`), and the index `idx_meal_logs_template` (`:82`).
- **The emptiness guard is trustworthy — this is the load-bearing check, since `drop table` itself does not care whether rows exist.** A bare `do $$ … $$` block is not `security definer`; it runs as the migration-applying role, which for `supabase db push` is the project's `postgres` superuser role. That role sees every row for two independent reasons: (a) it owns these tables, and Postgres does **not** apply RLS policies to a table's owner unless the table is set to `FORCE ROW LEVEL SECURITY` — `grep` confirms no migration in this repo ever issues `FORCE`, only `ENABLE`; and (b) the Supabase `postgres` role carries `BYPASSRLS`. Either alone is sufficient. This matters concretely: had the guard instead run under a role subject to RLS, `auth.uid()` would be NULL on a non-JWT connection, every `auth.uid() = user_id` policy would evaluate to NULL (not true), all three `exists(...)` probes would return **false**, and the guard would sail through while data sat in the tables — the exact silent-destruction scenario it is written to prevent.
- **No dependent object can be silently destroyed, and the drop order is what makes that true.** `meal_template_items.template_id` FK-references `meal_templates` (`:44`), and all four `meal_template_items` RLS policies reference `meal_templates` in `EXISTS` subqueries (`:65-76`) — both are real pg_depend edges that would make a bare `drop table public.meal_templates` **abort** ("cannot drop … because other objects depend on it"). The migration uses plain `drop table` with **no `cascade`**, which is the right call: a dependency aborts the migration rather than quietly taking something else with it. It nonetheless applies cleanly because it drops in dependency order — the `meal_logs.meal_template_id` column (and its FK) first, then the child table `meal_template_items` (taking its policies and `idx_meal_template_items_template` with it), then `meal_templates` (taking `idx_meal_templates_user`). By the time the parent is dropped nothing references it. Grep across `supabase/migrations/` finds **no** view, materialized view, function, or trigger referencing either table (`meal_templates` has an `updated_at` column but never had a trigger on it).
- **⚠️ ORDERING PRECONDITION: this migration must not be applied before Task 13 lands.** Task 13 deletes the last TypeScript consumers, and it has not run yet — `mobile/src/services/mealTemplatesService.ts` still queries `meal_templates` (lines 22, 74, 106) and `meal_template_items` (lines 31, 93), and `mobile/src/components/track/MealTemplatesModal.tsx` still drives it. Applying this migration against prod today would make every one of those calls fail (PostgREST 42P01) in the running app. The plan's sequencing already protects against this — the only apply step is Task 15, which comes after Task 13 — so no code change is needed, but the dependency is implicit in the task numbering and is recorded here explicitly. Those five call sites are the complete set: a repo-wide grep for `meal_template` outside `docs/` and `supabase/migrations/` matches nothing else.

### Task 9

- **The `uses_inventory` first-item-only rule is applied** (recorded in the Task 4 amendment, but not previously reflected in Task 9's code block — it now is). Two meal items can resolve to the same inventory id, and `resolveInventoryMatches`' own header warns of exactly this. `consumedIds` already de-duplicated via `new Set(matches.values())`, so only ONE unit comes off that container; without this rule both `meal_logs` rows would still carry `uses_inventory: true` and `inventory_items: [{id: X, quantity: 1}]`, collectively asserting two units were taken when one was, and any refund driven off those rows would over-credit stock. `logMeal` now tracks a `claimedInventoryIds` Set while mapping items in order; the first item claiming an id keeps it, later items resolving to the same id get `uses_inventory: false` / `inventory_items: null`. **The rule is keyed off the de-duplicated match set, not the RPC's `consumed` counts** — deliberately, because the log rows are inserted BEFORE the consume RPC runs (the meal was eaten either way, so stock bookkeeping must never block or roll back the log), so the true counts are not knowable at insert time. The undo path is the one that uses the truthful `consumed > 0` ids.
- **Static schema verification (the client is `any`-schema'd — `mobile/src/lib/supabase.ts:7` calls `createClient` with no `Database` generic, so a green `tsc` proves nothing about column or table names).** Every name the module uses was checked against the migrations: `profiles.target_calories` (`20200101000000_bootstrap.sql:10`); `meal_logs` columns `user_id/date/meal_type/name/calories/protein/carbs/fats/sugars/uses_inventory/inventory_items/logged_at` (`20250208_complete_tracking_schema.sql:109-120`), `sodium_mg/fiber_g` (`20260528211349_meals_tier1.sql:18-19`), `saved_food_id/servings` (`20251229000000_saved_foods.sql:75-76`), `meal_id` (`20260729100000_meal_library_schema.sql:69-70`, **unapplied**); `saved_foods.barcode` (`20251229000000_saved_foods.sql:10`); `food_concept_links.id/concept_id/saved_food_id/food_inventory_id/matched_by` (`20260728100000_nutrition_preference_schema.sql:19-30`); all `meals`/`meal_items` columns written by `createMeal`/`updateMeal` (`20260729100000:14-63`).
- **Both PostgREST embeds resolve via a real FK.** `locations:food_inventory_locations(quantity)` → `food_inventory_locations.food_inventory_id references public.food_inventory(id)` (`20250217000003_add_multi_location_inventory.sql:13`), the only FK between the two tables, so the alias is unambiguous. `savedFood:saved_foods(*)` → `meal_items.saved_food_id references public.saved_foods(id)` (`20260729100000:45`). Note that **no existing app code embeds `food_inventory_locations`** (every current call site queries it as a top-level table), so this embed is the first of its kind in the repo and is unexercised at runtime until Task 13.
- **`profiles`' bare `.select("target_calories").maybeSingle()` with no filter is correct, and is in fact the only correct form.** `profiles` has no `user_id` column at all — it is keyed by `id uuid primary key references auth.users(id)` (`20200101000000_bootstrap.sql:5`), so an `.eq("user_id", …)` would 42703. Its RLS select policy is `USING (auth.uid() = id)` (`:48`), one row per user, so `maybeSingle()` cannot see a second row and cannot throw. A comment recording this was added at the call site.
- **The composite FK's ordering requirement is satisfied by both mutations.** `createMeal` awaits the `meals` insert (a separate HTTP request, hence a separate committed transaction) before inserting items, and passes the same `userId` to both — a comment was added marking the ordering as load-bearing. `updateMeal` operates on an already-committed parent. **If `updateMeal`'s reinsert fails after the delete, the error is surfaced sanely:** `insError` is thrown to the caller's alert idiom, and the meal is left visibly item-less and re-editable — the documented accepted risk, unchanged. The composite FK improves this case rather than worsening it: were the passed `userId` ever wrong, the RLS-filtered `meals` update would match zero rows *silently* while the item insert now fails *loudly* on the FK, instead of orphaning rows invisibly.
- **`consume_inventory_units` returns `table(inventory_id uuid, consumed integer)`** (`20260729100100_inventory_consume_rpc.sql:26-27`), so supabase-js `.rpc()` yields `data` as an array of `{inventory_id, consumed}`. The code reads exactly that shape and guards with `(data ?? [])`, so a null/undefined `data` degrades to an empty `consumedIds` (undo refunds nothing) rather than throwing.
- **Minor mismatch noted, not fixed (out of scope, not reachable through the planned UI):** `meal_items.servings` is `numeric(5,2)` (max 999.99, `20260729100000:46`) but `meal_logs.servings` is `numeric(4,2)` (max 99.99, `20251229000000_saved_foods.sql:76`). A meal item with servings above 99.99 would insert fine into `meal_items` and then fail the `meal_logs` insert at log time. Task 12's builder should keep servings in a sane range; widening `meal_logs.servings` is not warranted for this feature.
- **Verification gate: `npx tsc --noEmit` 0 errors; `npm test` 4 suites / 80 tests, all passing** (unchanged from baseline — this task adds no tests, since the pure logic it depends on is already covered by `inventoryResolution.test.ts` and `mealScore.test.ts`, and everything new here is Supabase I/O that would need a mocked client to reach). **No database command was run.**

### Task 10

- **⚠️ DEVIATION FROM THE PLAN'S CODE BLOCK (approved): both wrappers return `Promise<boolean>`, not `Promise<void>`, and `MealsScreen.tsx` DOES change.** The plan's Step 1 says "keeping `findInventoryMatchByBarcode` and the exported signatures untouched so `MealsScreen.tsx` call sites don't change." Shipping the `void` wrappers as drafted would have introduced a **regression that does not exist today** — an inventory unit created out of nothing on Undo:
  - `MealsScreen.tsx:509-510` gates the barcode path on `(inventoryMatch.quantity ?? 0) > 0`, where `quantity` comes from `findInventoryMatchByBarcode`, which selects **only** `food_inventory.quantity` (`mobile/src/services/foodInventoryMatchService.ts:26`) and never reads `food_inventory_locations`.
  - The new `consume_inventory_units` decides entirely from `food_inventory_locations` whenever any exist (`20260729100100_inventory_consume_rpc.sql:41-63`), falling back to the legacy column only for location-less rows. Gate and write therefore consult **different sources of truth** and can disagree.
  - On disagreement the old code was safe and the new code is not: gate passes → RPC returns `consumed = 0` and writes nothing → the previously-unconditional `showUndoFor(..., inventoryMatch.id)` armed Undo with that id → `handleUndoLastLog` (`:413`) called `refundOneInventoryUnit`, which has **no zero-stock guard in either branch** — no `l.quantity > 0` filter in the location selector (`20260729100100:99-104`, cf. consume's `:46`) and no `and fi.quantity > 0` in the legacy branch (`:128-130`, cf. consume's `:68`); see also the Task 6 amendment → **+1 unit invented.** Before this refactor `consumeOneInventoryUnit` decremented the very column the gate read, so gate-passed implied decrement-happened and the invented unit was unreachable. This is a genuine regression, not a pre-existing flaw.
  - It is currently **masked** by `mobile/src/components/track/EditFoodScreen.tsx:474`, which pins `quantity` to 0 for every multi-location item (so the gate simply fails). The RPC's own resync sets that column to `sum(locations)` after any location write, which **un-masks** it. Relying on the mask was not acceptable.
- **Fix as implemented.** `consumeOneInventoryUnit` reads the RPC's returned rows and returns `true` only when a row for that id reports `consumed > 0`; `refundOneInventoryUnit` mirrors it on `refunded`. `handleLogMealFromPreview` now records `consumedInventoryId` from that boolean (`MealsScreen.tsx:544-548`) and passes it to `showUndoFor` (`:563`). This is the same "keep only what was actually taken" discipline `logMeal` already applies in `mobile/src/lib/supabase/mealLibrary.ts:331-335` (Task 9), now applied to the single-item barcode path.
- **The log-row deletion on Undo is unchanged and stays unconditional.** `showUndoFor(id, label, inventoryItemId)` sets `lastLogId` (which drives the `meal_logs` delete at `MealsScreen.tsx:411`) and `lastLogInventoryId` (which drives the refund at `:413`) as two independent pieces of state, and the refund is already behind `if (invId)`. Making the refund conditional therefore required changing only the **third argument** at the call site — no restructuring of the Undo affordance, and the snackbar still appears and still deletes the log row when a unit was not consumed.
- `Promise<boolean>` is source-compatible with `Promise<void>` at every call site that ignores the value, so widening the return type breaks nothing.
- **Static schema verification (`tsc` proves nothing here — `mobile/src/lib/supabase.ts:7` calls `createClient` with no `Database` generic, so RPC names, parameter names and returned column names are all unchecked strings).** RPC names and the parameter name `p_inventory_ids` match `20260729100100_inventory_consume_rpc.sql:26` and `:79`. The returned column names **differ between the two functions** and were read individually rather than assumed: `returns table(inventory_id uuid, consumed integer)` (`:27`) vs `returns table(inventory_id uuid, refunded integer)` (`:80`). Both wrappers guard `data` with `(data ?? [])`, so a null/undefined payload degrades to `false` rather than throwing. Call sites of the changed functions are exactly three: `MealsScreen.tsx:413` (refund, return value ignored — correct, it is the terminal compensating action) and `:546` (consume, return value now used); `:67-68` are the imports.
- **`findInventoryMatchByBarcode` is untouched** — same select list, same `InventoryMatchSummary` return type, same null-on-error behavior. Its `quantity` field remains legacy-column-only; that is the gate/write divergence described above, and it is now compensated at the Undo arming point rather than by changing the query (widening the gate to read locations is a UI-behavior change belonging to a later task, not to this refactor).
- **Verification gate: `npx tsc --noEmit` 0 errors; `npm test` 4 suites / 80 tests, all passing** (unchanged from baseline; this task adds no tests — everything changed is Supabase I/O or React state that would need a mocked client to reach). **No database command was run; the RPC migration remains unapplied.**

### Task 11

- **Spec §6 policy is now imported, not re-declared, at all three sites the plan's code block hardcoded it.** The Task 2 amendment's exports exist under exactly the documented names and were verified by reading `mobile/src/lib/mealScore.ts` before use: `SCORE_BAND_CORE_MIN` / `SCORE_BAND_MID_MIN` (`:34-35`) now drive `scoreChipStyle`'s two comparisons in `styles.ts` instead of literal `>= 95` / `>= 71`; `COMPONENT_MAX` (`:25-31`) supplies all five `<ScoreBar max=…>` props in `MealDetail.tsx` instead of `30 / 25 / 15 / 15 / 10`; `RAW_MAX` (`:19`) is interpolated into the breakdown footer instead of the literal string `/95`. Spec §6 now has exactly one home.
- **`{score.raw}/{RAW_MAX}` renders cleanly — confirmed against real values, not assumed.** `raw` is `round(…, 1)`, and JS number→string drops a trailing `.0`, so the footer reads `89.8/95`, `90/95`, `76.6/95` — never `76.6036036036036/95` (the pre-Task-2 defect) and never `90.0/95`. The per-component `{Math.round(value * 10) / 10}` in `ScoreBar` behaves identically; only `taste` is ever fractional (the other four components are integers from ladders), and it is already 4dp-rounded upstream, so 1dp display rounding there is a display concern only.
- **No clamp added to `ScoreBar`'s `width: ${(value / max) * 100}%` — it would be dead code.** Every component is bounded by construction in `mealScore.ts`: `taste` is a weighted mean of `RATING_POINTS` whose max entry is `love: 30`, or `RATING_POINTS[tasteOverride]`, so ≤ 30; `convenience` starts at ≤ 25 and only ever loses points; `protein`/`calories` are ladders topping out at 15/10; `eoe` is `Math.max(0, COMPONENT_MAX.eoe - …)`. `max` is always a nonzero literal from `COMPONENT_MAX`, so division by zero is unreachable. The Task 2 maximal-input test pins each component to exactly its `COMPONENT_MAX` entry, which is the case a clamp would guard, and it is an equality not an overflow. Overflow could only arrive via a future scoring change, and that change would break the maximal-input test first.
- **`MealRow`'s `React.memo` is currently decorative, and the cause is on Task 13's side of the prop contract — reported, not redesigned.** Task 13's `renderItem` passes `totals={computeMealTotals(item.items)}` (a fresh object literal every invocation) and `onPress={(m) => setView(…)}` (a fresh closure every invocation), so `Object.is` fails on two of the four props on every comparison and the memo can never short-circuit. It is not harmful — `renderItem` itself is `useCallback([scores])`-stabilized, so FlatList does not re-invoke it on unrelated renders, and the list is single-user-sized — but the memo buys nothing as written. The prop contract belongs to Task 13; fixing it there (memoize a `totalsById` map alongside the existing `scores` map, and hoist `onPress` to a `useCallback`) is the natural place, and Task 13 already builds `scores` in exactly that shape.
- **Every declared `MealDetailProps` member is used**: `meal` (title/items/`defaultMealTypeFor`/all three handlers), `totals` (header line), `score` (chip, badges, breakdown), `logging` (button `disabled` + `opacity` + label), `onLog`, `onEdit`, `onDelete`. No unused imports in any of the three files.
- **⚠️ DEVIATION FROM THE PLAN'S CODE BLOCK (fourth, beyond the three required policy imports): a one-line legend for the `✂︎` glyph.** The plan marks `small_pieces_ok` items with a bare `✂︎` suffix and nothing explains it; the glyph is not defined anywhere in the UI, and spec §9.1 does not name it either. Added `✂︎ already cut small — EoE-safe` as a `smallMuted` line at the foot of the Ingredients card, rendered only when at least one item actually carries the flag (`hasSmallPieces`). Additive copy inside the existing card — no restructuring, no new component, nothing moved.
- **Architectural smell, reported and left in place: `MealDetail.tsx` imports `defaultMealTypeFor` from `mobile/src/lib/supabase/mealLibrary.ts`, which imports the Supabase client at its line 3.** The function itself is pure — `meal.default_meal_type ?? CATEGORY_DEFAULT_MEAL_TYPE[meal.category]` (`:368-370`) — and its only real dependency, `CATEGORY_DEFAULT_MEAL_TYPE`, already lives in `types/meal-library.ts`. As written, a presentational component pulls the entire I/O module (and the client singleton) into its graph for a two-line lookup, which is also what would make this component untestable under the repo's `testEnvironment: node` Jest setup. The plan's import was kept as-is to avoid moving a function other tasks import; relocating `defaultMealTypeFor` to `types/meal-library.ts` (or a pure sibling) and re-exporting would resolve it cleanly.
- **Verification gate: `npx tsc --noEmit` 0 errors; `npm test` 4 suites / 80 tests, all passing** (unchanged from baseline — this task adds no tests: these are presentational RN components and the repo has no component-test harness, `jest.config.js` being scoped to pure TS libs with `testEnvironment: node`). Unlike the migration and query tasks, `tsc` is meaningful evidence here: these files are pure TypeScript/React with no untyped Supabase strings. **No database command was run.**


### Task 9 (follow-up)

Code review of `mobile/src/lib/supabase/mealLibrary.ts` found six defects. All are fixed; the file's behavior changed in four user-visible ways.

- **⚠️ `createMeal` left an UNRECOVERABLE dead end; a compensating delete was added.** The two sequential inserts are not atomic, and the Task 9 amendment's "recoverable by re-editing" framing (written for `updateMeal`) does **not** transfer: if the `meal_items` insert fails, the `meals` row is already committed, Task 13 keeps the builder open, and the user's natural retry re-runs the `meals` insert — which now violates `unique (user_id, slug)` and surfaces a raw Postgres 23505. They can never save under that name, and a phantom item-less meal sits in the library. `createMeal` now issues `await supabase.from("meals").delete().eq("id", data.id)` before rethrowing `itemsError`. Best-effort by design: if the compensating delete also fails, the original error is still what reaches the caller, since that is the actionable one.
- **⚠️ `logMeal` silently "succeeded" on an item-less meal.** With `meal.items` empty, `rows` is `[]`, PostgREST accepts the empty insert without error, and the caller shows a "Logged" toast plus a working-but-useless Undo — for zero rows written. `mealTemplatesService.ts:147` guarded exactly this (`if (rows.length === 0) return;`), so dropping it was a regression, and it is now reachable in a way it was not there: the `createMeal` failure above is precisely what produces an item-less meal. `logMeal` now throws `"This meal has no items."` at the top, making the orphan visible instead of lying about it.
- **`servings` is now coerced exactly once, in `fetchMealLibrary`.** `numeric` columns come back from PostgREST as JSON **strings** in some configurations — which is why the superseded module wrapped every read in `Number(it.servings)` (`mealTemplatesService.ts:46`, `:124`). There is no live bug *inside* this module (every use is multiplication, which coerces), but `MealItem.servings` is declared `number` and Task 12's builder does `it.servings + delta` (string concatenation) and renders it. The coercion sits where `meal_items` rows are mapped, which grep confirms is the **only** site in the app that constructs `MealItemWithFood` values — so every downstream consumer gets the `number` the type promises.
- **Slug collisions now map to a human message in BOTH mutations.** `slugify` collapses runs of non-alphanumerics, so "PB&J" and "PB J" both become `pb-j`; renaming via `updateMeal` re-slugifies and hits the same wall. Because the *displayed* names differ, the raw 23505 reads as an app bug. `error.code === "23505"` (`UNIQUE_VIOLATION`) now produces a message naming the meal and explaining that punctuation/spacing does not distinguish names.
- **`computeMealTotals` now rounds to 2dp.** `computeBrianScore` already rounds its `totalCalories`/`totalProtein` to 2dp (Task 2 amendment) for exactly this reason; this function did not, and its output goes straight to `MealRow`, so `1234.5600000000002` would render verbatim. These are two independent implementations of the same sum over the same rows and **must agree on rounding**, or a meal's calories read differently in the list row and in the score card — a comment at the return records that constraint. `round2` moved above its first use (it was declared in the Logging section, below).
- **Comments and nits.** The `inventory_items` write is now documented as recording **intent, not outcome** — the log rows are inserted *before* the consume RPC runs, so a row can claim a unit that a zero-stock no-op never took; no current path treats it as truth (undo uses the RPC's `consumed > 0` ids) but a future refund-from-row path would over-credit. The `MealLoggedButDecrementFailed` comment previously implied the failure is always clean; that holds for an RPC **error** (one plpgsql call, a raise aborts the whole body) but a **network timeout** lands in the same branch and is genuinely unrecoverable — the decrement may have committed server-side with no `consumedIds` to refund. `InventoryRowRaw`'s `name`/`brand` were declared and selected but never read; removed from both the interface and the select string. `uses_inventory`/`inventory_items` used `!= null` on the same variable the two lines above compared with `!== null`; both are now `!==`. The `MealLoggedButDecrementFailed` class declaration moved above `logMeal`, its first use (no TDZ bug — `class` is hoisted-but-dead only until module evaluation completes, and `logMeal` cannot run before then — but it read backwards).
- **Verification gate: `npx tsc --noEmit` 0 errors; `npm test` 4 suites / 80 tests, all passing** (unchanged from baseline; no tests added — everything changed is Supabase I/O that would need a mocked client to reach, and `computeMealTotals`' rounding is not reachable from the pure-lib Jest scope). Per the Task 1/9 amendments, a green `tsc` proves nothing here: `mobile/src/lib/supabase.ts:7` creates the client with no `Database` generic. **No database command was run; all four Phase 2 migrations remain unapplied.**

### Task 11 (follow-up)

- **`defaultMealTypeFor` was relocated from `lib/supabase/mealLibrary.ts` to `types/meal-library.ts`**, resolving the architectural smell the Task 11 amendment reported and left in place. `MealDetail.tsx` — a presentational component — was pulling the entire I/O module, and with it the Supabase client singleton, into its import graph for a two-line pure lookup, which is also what would keep it untestable under the repo's `testEnvironment: node` Jest config. The function's only real dependency, `CATEGORY_DEFAULT_MEAL_TYPE`, already lived in the types module, and it now sits directly beneath it.
- **Deliberately NOT re-exported from `mealLibrary.ts`.** A single home is the point; a compatibility re-export would leave the smell reachable and let new call sites reintroduce it silently.
- **Call sites updated: exactly one.** A repo-wide grep found `MealDetail.tsx:9` as the sole importer — Task 13 is not written yet, so nothing else could break. Task 13's code block in this plan was updated in the same commit to import `defaultMealTypeFor` from `@/src/types/meal-library` alongside `CATEGORY_LABELS`/`CATEGORY_SECTION_ORDER` (which it already imports from there), so executing Task 13 as written stays correct. Task 9's code block is left as the historical record of what was originally specified; this amendment is the correction.

### Task 12

- **⚠️ The servings stepper is now clamped at a MAXIMUM (`MAX_SERVINGS = 20`), not just the `SERVING_STEP` minimum.** This closes the save-then-fail-later trap recorded in the Task 9 amendment ("Task 12's builder should keep servings in a sane range"): `meal_items.servings` is `numeric(5,2)` (max 999.99) while `meal_logs.servings` is `numeric(4,2)` (max 99.99), so an item saved above 99.99 saves cleanly and then fails at **log** time, long after the mistake was made and with nothing on screen connecting the two. 20 is far beyond any real single-food serving and is comfortably under 99.99, so the failure is now unreachable through the UI without widening `meal_logs.servings`.
- **⚠️ An empty prep-minutes field no longer inflates the live score.** The plan's `Math.max(0, parseInt(prepMinutes, 10) || 0)` maps a blank (or unparseable) field to `0` — which is the **best possible** convenience score, 25/25 — so clearing the field to retype it made the score jump *up*, and a half-filled form advertised an inflated number. A typed `"0"` is a legitimate answer (`prep_minutes integer not null default 0`, `20260729100000:25`) and must keep scoring 25, so blank and zero have to be distinguished rather than collapsed: `enteredPrep` is `/^\d+$/`-tested and is `null` only when the field is genuinely blank, and scoring falls back to `DEFAULT_PREP_MINUTES = 5`. **5, not 0 and not a punitive number**, because it is the same value the field is seeded with for a new meal — so the fallback is the form's own stated default rather than an invented one. The blank state is annotated under the live score ("Prep time is blank — scored (and saved) as 5 min."), and `handleSave` writes the same `prep` value that was displayed, so the score shown is always the score saved.
- **`suggestConcepts` is passed `[...conceptsById.values()]` directly**, dropping the plan's `.map((c) => ({ id: c.id, name: c.name }))`. `FoodConcept` has `id: string` and `name: string`, so `FoodConcept[]` is assignable to `MatchableConcept[]` — excess-property checks apply only to fresh object literals, not to a typed array — and the mapping allocated one throwaway object per concept, per unlinked ingredient row, per render. **Verified: `npx tsc --noEmit` returns 0 errors with the map removed.**
- **`suggestConcepts(...)[0]` is left as written and is correct**, not an oversight: the function returns every match ranked best-first by design (Task 3 amendment), Task 14's screen shows the top 3, and the builder deliberately shows a single one-tap chip. Recorded so a later pass does not "fix" it.
- **Deviation, cosmetic: the `useState` seed reads `String(initial?.prep_minutes ?? DEFAULT_PREP_MINUTES)` instead of the plan's literal `5`.** Identical value; it names the constant so the seed and the blank-field fallback cannot drift apart, which is the whole basis for choosing 5 above.
- **Review items checked, no change needed.** (1) **Per-item `concepts` are passed correctly, including the no-link case**: `conceptsFor` returns `[]` for a saved food with no concept link, and `computeBrianScore` filters `linked = items.filter(it => it.concepts.length > 0)` for taste only — such an item still contributes to `totalCalories`/`totalProtein`, EoE and the calorie band, which is the intended "counts toward the meal, excluded from taste" behavior surfaced by the row's own "excluded from taste" line. (2) **`setServings`' snap-to-grid is float-safe**: `SERVING_STEP` is 0.25, a power of two, so dividing by it and multiplying back are both exact operations, and every reachable value is an exact multiple of 0.25 — no `1.2999999999999998` is producible. This depends on `servings` arriving as a `number`; the Task 9 follow-up commit coerces it at the single `MealItemWithFood` construction site, so `initial?.items` can no longer seed the state with a PostgREST numeric string that `it.servings + delta` would concatenate. A non-grid value loaded from an older row (e.g. 1.33) snaps to the grid on first tap, which is correct for a stepper. (3) **Every declared prop is used** — `initial` (six seeds plus the button label), `savedFoods` (search), `conceptsById` (`conceptsFor` + the suggestion chip's label), `conceptIdsBySavedFoodId` (`conceptsFor`), `saving` (`disabled`/opacity/label), `onSave`, `onQuickLink` — and there are no unused imports. (4) **Keying the item list by `saved_food_id` is safe**: `meal_items` carries `unique (meal_id, saved_food_id)` so `initial.items` cannot contain a duplicate, and the search results filter out already-chosen foods (`chosen` Set) so `addItem` cannot introduce one. The remove filter and the `small_pieces_ok` toggle both match on that same id and rely on the same uniqueness. (5) **`defaultMealTypeFor` is not used by this file at all** — the builder passes `default_meal_type: initial?.default_meal_type ?? null` straight through — so the Task 11 follow-up relocation does not affect its imports.
- **Verification gate: `npx tsc --noEmit` 0 errors; `npm test` 4 suites / 80 tests, all passing** (unchanged from baseline; no tests added — this is a presentational RN component and `jest.config.js` is scoped to pure TS libs with `testEnvironment: node`). As in Task 11, `tsc` **is** meaningful evidence here: the file is pure TypeScript/React with no untyped Supabase strings. **No database command was run; all four Phase 2 migrations remain unapplied.**

### Task 13

- **The map-miss score fallback was removed, not kept.** The plan's `renderItem` did `score={scores.get(item.id) ?? computeBrianScore({prepMinutes, role, tasteOverride, items: []})}`, which renders a **confident-looking chip (55/100)** for a meal whose score was simply never computed — indistinguishable from a real score, so a derivation bug would ship as a wrong number rather than as a visible defect. The miss is in fact structurally impossible (`scores` and the new `totalsById` are both built from `data.meals`, and `sections` is derived from the same array), so the fallback was never reachable in the first place — it only stood ready to hide a future bug. `renderItem` now reads both maps, and on a miss logs a `console.error` naming the meal and returns `null`. Chosen over throwing (a render-phase throw with no error boundary takes down the whole Track tab for an invariant violation that costs the user one row) and over making `MealRow.score` optional (that redesigns a prop contract for an unreachable case). Note `MealDetail`'s `scores.get(detailMeal.id)!` rests on the same invariant and is left as the plan wrote it.
- **⚠️ The `MealLoggedButDecrementFailed` branch now offers Undo.** Previously it alerted "Logged (inventory not updated)" with an OK button only, leaving the user to delete the rows one at a time from the day view — a worse outcome than the ordinary success path, for a *more* broken outcome. `undoMealLog(meal.id, e.loggedAt, [])` is the correct call: `consume_inventory_units` is plpgsql, so a raise aborts the whole function body and **no unit was taken**, meaning there is nothing to refund and the empty `consumedIds` is truthful, not a shortcut. The caught error is copied into a `const` before the closure captures it — a catch binding is not `const`, so TS narrowing does not survive into a callback. **Documented caveat (from the Task 9 follow-up amendment):** a network *timeout* lands in this same branch and the decrement may genuinely have committed server-side with no ids to refund; Undo then removes the log rows and leaves stock reading one unit short. That is strictly better than leaving the rows behind as well, and the comment at the call site says so.
- **`MealRow`'s `React.memo` is now load-bearing** — the Task 11 amendment flagged it as decorative and correctly located the cause on this side of the prop contract. A `totalsById` map is memoized alongside `scores` (same `[data]` dep, same keying) so `totals` is a stable object, and `onPress` is a `useCallback`-stabilized `handleOpenDetail` instead of a fresh arrow per invocation. All four props are now referentially stable across unrelated renders. `MealRow` itself was not touched. The emergency-section sort still calls `computeMealTotals` inline rather than reading `totalsById`; left as the plan wrote it (correct, and it runs once per `data` change).
- **`defaultMealTypeFor` is NOT imported by this container.** The Task 11 follow-up amendment updated this plan's Task 13 block to import it from `@/src/types/meal-library` — the right *source*, but the container never calls it (only `MealDetail` does, and it imports it itself). Adding the import as written would have shipped dead code, so it was dropped. The relocation itself is verified: the file imports `CATEGORY_LABELS`/`CATEGORY_SECTION_ORDER` from the types module and nothing pure from `lib/supabase/mealLibrary.ts` beyond the query/mutation surface it genuinely uses.
- **Deletion is complete and Task 15's `20260729100300_drop_meal_templates.sql` is now safe to apply.** `git rm` removed `mobile/src/components/track/MealTemplatesModal.tsx` and `mobile/src/services/mealTemplatesService.ts`; `MealTemplate`/`MealTemplateItem`/`MealTemplateWithItems` were deleted from `mobile/src/types/track.ts`. `grep -rn "MealTemplate\|mealTemplatesService\|meal_template" src/ app/` returns **zero** hits — the one straggler was a *comment* in `mealLibrary.ts:334` citing `mealTemplatesService.ts:147` as the precedent for the empty-items guard; the reasoning is still valuable so the citation was reworded to name the deleted module rather than a line number in a file that no longer exists. This satisfies the ⚠️ ORDERING PRECONDITION recorded in the Task 8 amendment: nothing in `mobile/` reads `meal_templates` or `meal_template_items` any more, so dropping those tables at Task 15 cannot break the running app.
- **MealsScreen was rewired by content, not by the plan's line numbers** (Task 10 had already shifted them). `templatesVisible` → `libraryVisible`, `allSavedFoods` kept, entry-button label "My Meals — log a saved template" → "Meal Library" (same `Utensils` icon, same `styles.templatesButton`), modal block swapped. **Task 10's `showUndoFor(inserted.id, label, consumedInventoryId)` third argument is untouched** (verified in the diff). The `styles.templatesButton`/`templatesButtonText` style keys keep their old names — renaming them is pure churn with no reader outside this one button, and the plan says not to rename.
- **`todayDate={viewingDateStr}` is the VIEWED day, not today.** `viewingDateStr = getLocalDateString(viewingDate)`, and the container passes it to both `logMeal({date})` and `fetchDayCalories()` — so logging from a past date lands rows on that date, and the Emergency header's "~N cal remaining" is computed against the same day being looked at. The prop name is inherited from the superseded modal and is now misleading; the interface comment says "the viewed local date — logs land on this day".
- **`onLogged`'s cache handling matches the house idiom exactly** — copy the Map, `delete(viewingDateStr)`, then `fetchMealsForDate(viewingDate, true)`; the `force` flag is required because the queued `setMealsCache` has not committed inside that closure, and it additionally triggers `refreshHistory()` (`MealsScreen.tsx:247`), so insights/streaks refresh too. Same shape as the six other mutation paths in that file.
- **Known limitation, pre-existing and inherited: `allSavedFoods` is fetched once on mount** (`fetchAllSavedFoods` in a `[]`-dep `useEffect`) and refetched only after a saved-food *correction*. A saved food created later in the session (e.g. via a barcode scan) will not appear in the builder's food picker until the Track screen remounts. Identical to the superseded templates modal's behavior, so not a regression, but the Meal Library's builder makes it more noticeable.
- **Verification gate: `npx tsc --noEmit` 0 errors; `npm test` 4 suites / 80 tests, all passing** (unchanged from baseline; no tests added — the container is an RN component and `jest.config.js` is scoped to pure TS libs with `testEnvironment: node`). As in Tasks 11/12, `tsc` **is** meaningful here: the container is pure TypeScript/React and the only untyped-Supabase surface it touches is behind `lib/supabase/mealLibrary.ts`. **The modal cannot be exercised at runtime until Task 15** — `meals`/`meal_items` do not exist yet, so `fetchMealLibrary` will fail and the Retry body is what renders. **No database command was run; all four Phase 2 migrations remain unapplied.**

### Task 14b (plan gap)

- **Spec §5.2 had no implementing task; this entry records the one that fills it.** The spec states the RESTRICT consequence as a *product* requirement, not just a schema fact: "`deleteSavedFood` on a food used by a meal fails; the alert idiom surfaces 'remove it from meal X first.' This is deliberate." Nothing in Tasks 1–16 touches `mobile/src/services/savedFoodsService.ts`, so the plan as written would have shipped `deleteSavedFood` doing a bare `.delete().eq("id", id)` and rethrowing — surfacing raw Postgres text naming `meal_items_saved_food_id_fkey` to the user. **Sequenced before Task 15 on purpose:** the gap goes live the instant the seed migration (`20260729100200`) lands, because the seed creates meals whose items reference the seeded staples, so the very first saved food a user tries to delete after the apply can hit it.
- **Implementation.** `deleteSavedFood` now maps Postgres `23503` (foreign_key_violation) to a human error that **names the blocking meals** — first three quoted, then "and N more" — with singular/plural wording and the "remove it from those meals first" instruction. Constant + mapping follow the house idiom already established by `mealLibrary.ts`'s `UNIQUE_VIOLATION = "23505"` (`createMeal`/`updateMeal`).
- **The name lookup uses two queries, not a PostgREST embed.** `meal_items` references `meals` through a **composite** FK on `(meal_id, user_id)` (`20260729100000:61`), not the single-column shape every other embed in this codebase relies on, so `select("meal:meals(name)")` is not a safe assumption to bake into a path that only runs when something has already failed. `meal_items → meal_id`, then `meals → name`, is unambiguous under any PostgREST version.
- **The lookup can never mask the original error.** `findBlockingMealNames` catches everything (including `meal_items` not existing yet, pre-Task-15), logs, and returns `[]`; an empty list produces the generic-but-still-human "used by a meal in your Meal Library — remove it from that meal first" message. The user always gets an actionable sentence, never a swallowed failure and never a raw SQLSTATE.
- **⚠️ `deleteSavedFood` currently has ZERO call sites.** A repo-wide grep (`mobile/src`, `mobile/app`, and the whole tree) finds only its own definition; `MealsScreen.tsx` imports `getSavedFoodByBarcode`/`createSavedFood`/`getSavedFoods`/`toggleFavorite` from this module and not this one, and no other code path deletes from `saved_foods`. So there was no alert idiom to fix — nothing swallows the message today because nothing calls it. This work makes the function *correct in advance* of the UI that will call it; **whoever wires up a "delete saved food" affordance must surface the thrown `Error.message` through the standard `Alert.alert(title, e instanceof Error ? e.message : "Unknown error")` idiom**, or this whole path is wasted.
- **Verification limits, stated plainly.** `tsc` proves nothing here: `mobile/src/lib/supabase.ts:7` creates the client with no `Database` generic, so `error` is `any` and the code string is unchecked (same caveat as the Task 1 amendment). Evidence instead: (1) the FK is `saved_food_id uuid not null references public.saved_foods(id) on delete restrict` at `20260729100000:45`, auto-named `meal_items_saved_food_id_fkey`, and `20260729100000:85` adds `idx_meal_items_saved_food` explicitly "to support the RESTRICT check on saved_foods deletes"; (2) a RESTRICT/NO ACTION referential violation is SQLSTATE 23503, and PostgREST passes the SQLSTATE through as `error.code` — demonstrated in this repo by `mealLibrary.ts:187/233/273` matching `"23505"` for the `meals` unique constraint. The 23503 branch cannot be exercised at runtime until Task 15 applies the migrations.
- **Verification gate: `npx tsc --noEmit` 0 errors; `npm test` 4 suites / 80 tests, all passing** (unchanged from baseline; no tests added — `jest.config.js` is scoped to pure TS libs and this path needs a live Supabase error). **No database command was run; all four Phase 2 migrations remain unapplied.**

### Task 14

- **Commit `896b638` deviated from the plan's Task 14 code in several styling respects; all are deliberate.** (1) The concept chips use **`s.chipRow`, not the plan's `[s.row, {flexWrap: "wrap"}]`** — `s.row` carries `justifyContent: "space-between"` and no `gap`, so a wrapped row of chips would have spread edge-to-edge with ragged spacing; `chipRow` is the existing sibling-screen key (`flexDirection: "row"`, `flexWrap: "wrap"`, `gap: 8`) that `ConceptRow.tsx` and `ConstraintsSection.tsx` already use for exactly this. (2) The picker block uses **`s.chipPickerContainer`**, matching `ConstraintsSection.tsx`. (3) **Section headers gained horizontal padding** so they align with the cards' `marginHorizontal: 16` rather than sitting flush to the screen edge. (4) **Inline styles were lifted into a local `StyleSheet.create`**, mirroring how the sibling nutrition screens are organized. (5) **`s.itemTitle` was ADDED to `mobile/src/components/profile/nutrition/styles.ts`** because the plan's code referenced a key that did not exist — it is `rowLabel` at the same size, one weight heavier, so an item's name reads above its muted secondary lines.
- **⚠️ `deleteSavedFood` still has ZERO call sites**, so Task 14b's error handling remains correct-in-advance rather than exercised. Restating the obligation recorded there because it is easy to lose: **whoever wires up a delete affordance must surface the thrown `Error.message` through the standard `Alert.alert(title, e instanceof Error ? e.message : "Unknown error")` idiom**, or the 23503 → "remove it from meal X first" mapping is dead code and the user sees a raw Postgres constraint name instead.

### Tasks 11/12 (follow-up)

Two commits: a test-first extraction of inline policy, then UI polish. No behavior in the builder changed in the first; the second is all user-visible.

- **⚠️ Three pieces of policy were extracted out of components and under test.** All three sat in files the Jest scope cannot reach (`testEnvironment: node`, `roots: <rootDir>/src`, pure TS only — `MealBuilder.tsx` and `styles.ts` both import `react-native`), so a later "simplification" would have changed behavior with nothing to catch it. **(1) `parsePrepMinutes(raw): number | null`** → new `mobile/src/lib/mealBuilderInputs.ts`. This is the high-value one: it distinguishes a BLANK field from a typed `"0"`, and collapsing it back to `parseInt(raw, 10) || 0` would score every half-filled meal at the best possible convenience (25/25) — precisely the defect the Task 12 amendment records fixing. **(2) `snapServings(current, delta)`** → same module, with `SERVING_STEP`/`MAX_SERVINGS` moved beside it. The expression is `Math.round(x / 0.25) * 0.25` with clamps; what is invisible in it — and is now pinned by walking the full range in both directions — is that the result is ALWAYS an exact multiple of `SERVING_STEP` inside `[SERVING_STEP, MAX_SERVINGS]`, which is what lets `numeric(5,2)` store it losslessly. 0.25 being a power of two is *why* the round-trip is exact; a step of 0.1 would emit off-grid floats that Postgres rounds server-side, desyncing the stored meal from the score the user saw. **(3) `scoreBand(score)`** → `mobile/src/lib/mealScore.ts`, beside `SCORE_BAND_CORE_MIN`/`SCORE_BAND_MID_MIN`, where `mealScore.test.ts` already pins every other spec §6 threshold; `scoreChipStyle` in `styles.ts` is now a pure `{core, mid, low}` → style lookup. Tests were written first and observed failing. **Behavior is identical**: same trim/regex/`parseInt`, same snap-then-clamp order, same style objects — the caption condition, the saved `prep_minutes`, and the stepper are unchanged.
- **⚠️ The quick-link chip is now `disabled={saving}`.** The parent is already correct and was NOT redesigned: `handleQuickLink` goes through `MealLibraryModal`'s `run()` idiom, which `await load()`s on success, so the chip does disappear and the score does update once the refetch lands. The gap was only the round-trip window — `handleQuickLink` is not awaited, so for ~300ms the chip stayed tappable and a second tap re-ran `createUserLink`, violated `unique (concept_id, saved_food_id)` → 23505 → a **false "Failed to link food" alert for an operation that had already succeeded**. `saving` is the parent's `busy`, already passed for the save button; the chip dims to 0.6 opacity like the other disabled affordances.
- **The blank-prep caption was lying for some inputs.** Its condition is `enteredPrep === null`, which is also true for `"3.5"`, `"-3"` and `"abc"` — so the field would visibly show `3.5` while the caption read "Prep time is blank". Reworded to match the actual condition: "Prep time isn't a whole number of minutes — scored (and saved) as 5 min."
- **Prep minutes had a floor but no ceiling.** `/^\d+$/` accepts arbitrarily long digit strings, so 11+ digits overflow `int4` and the save fails with a raw Postgres **22003 at the very end of the form** — the same save-then-fail-later class of trap `MAX_SERVINGS` was added to close. `maxLength={4}` on the `TextInput` (9999 minutes ≈ 7 days) makes it unreachable through the UI.
- **`MAX_SERVINGS` was enforced on the stepper but not on save.** An item seeded from `initial.items` above the cap would be re-saved unclamped if the user never tapped ±. Not reachable today, but an invariant that holds on only one path is not an invariant, so `handleSave` now maps through a new `clampServings`. It deliberately clamps **without** snapping to the grid: a stored off-grid value is the user's real data, and rewriting it on save — rather than on the deliberate tap `snapServings` handles — would change a number they never touched.
- **Tap targets.** The `−`/`＋`/`✕` glyphs are bare `Text` at roughly 12×20pt in a `gap: 10` row, with the destructive `✕` sitting 10pt from `＋` — a missed tap costs an ingredient. All three gained `hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}`. **Accessibility labels/roles were deliberately NOT added** — single-user app, explicitly out of scope.
- **`MealDetail`'s meal-type chips no longer render raw lowercase enum values** (`breakfast`, `dessert`). A `MEAL_TYPE_LABELS` map now lives in `mobile/src/types/meal-library.ts` beside `CATEGORY_LABELS`/`ROLE_LABELS`, so every enum these screens display goes through a labels map. (`MealBuilder`'s taste-override chips still render the raw `ConceptRating` values — `love`/`like`/`neutral` read acceptably as-is and Phase 1's screens render them the same way, so they were left alone rather than diverging from the sibling screens for one file.)
- **Verification gate: `npx tsc --noEmit` 0 errors; `npm test` 5 suites / 107 tests, all passing** (baseline was 4 suites / 80 — 27 added, all pure-function coverage of the extracted policy). As in Tasks 11/12/13, `tsc` **is** meaningful evidence here: everything touched is pure TypeScript/React with no untyped-Supabase surface. **No database command was run; all four Phase 2 migrations remain unapplied.**
