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
  const rows = meal.items.map((it) => {
    const f = it.savedFood;
    const s = it.servings;
    const inventoryId = matches.get(it.saved_food_id) ?? null;
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
  const consumedIds = [...matches.values()];
  if (consumedIds.length > 0) {
    const { error: rpcError } = await supabase.rpc("consume_inventory_units", {
      p_inventory_ids: consumedIds,
    });
    if (rpcError) {
      console.error("consume_inventory_units failed:", rpcError);
      throw new MealLoggedButDecrementFailed(loggedAt, rpcError.message);
    }
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
import { CATEGORY_LABELS, CATEGORY_SECTION_ORDER } from "@/src/types/meal-library";
import type { MealType, SavedFood } from "@/src/types/track";
import { computeBrianScore, type BrianScoreResult } from "@/src/lib/mealScore";
import {
  computeMealTotals, createMeal, createUserLink, deleteMeal, defaultMealTypeFor,
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





