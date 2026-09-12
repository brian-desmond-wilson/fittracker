# Exercise Attribute Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the exercise page's hero rank badge and the Category/Goal/Skill/Scored-by meta cells tappable filters that open the Exercises tab, and give that tab the Category, Rank and Scored-by axes it lacks.

**Architecture:** The Exercises catalog is one client-side result set; every filter axis runs in a pure predicate (`mobile/src/lib/exerciseFilters.ts`). This plan adds three axes to the filter model, teaches the pure predicate/chip/link helpers about them, widens the catalog read to carry the three new fields, adds three controls to the filter sheet, and makes five page elements call the existing `openFiltered` handoff.

**Tech Stack:** React Native (Expo, expo-router), TypeScript, Jest (ts-jest, pure libs only), Supabase (untyped client — a green typecheck proves nothing about column names, so DB-read changes are verified on device).

**Spec:** `docs/superpowers/specs/2026-09-11-exercise-attribute-filters-design.md`

**All commands run from `/Users/brianwilson/code/fittracker/mobile`.** The typecheck command is `npx tsc --noEmit`. A single Jest file runs with `npx jest <path> -t "<name>"`.

**One deliberate exception to note throughout:** `scoringTypes` matches **all-of** (the exercise must carry every selected type). Every other axis is any-of. This is intentional (spec §3.2).

---

### Task 1: Model shapes for the three new axes

**Files:**
- Modify: `mobile/src/types/exerciseFilters.ts`
- Modify: `mobile/src/types/capture.ts` (the `CatalogEntry` interface, around line 120)
- Modify: `mobile/src/lib/exerciseFilters.ts` (add `rankLabel` + `RANK_OPTIONS`)
- Test: `mobile/src/lib/__tests__/exerciseFilters.test.ts`

- [ ] **Step 1: Write the failing test for the rank label helper**

Add to `mobile/src/lib/__tests__/exerciseFilters.test.ts` (import `rankLabel` in the top import from `../exerciseFilters`):

```ts
describe("rankLabel", () => {
  it("names tier 0 Core and the rest Tier n", () => {
    expect(rankLabel(0)).toBe("Core");
    expect(rankLabel(1)).toBe("Tier 1");
    expect(rankLabel(3)).toBe("Tier 3");
  });
});
```

- [ ] **Step 2: Run it, expect a compile/failure**

Run: `npx jest src/lib/__tests__/exerciseFilters.test.ts -t "rankLabel"`
Expected: FAIL — `rankLabel` is not exported.

- [ ] **Step 3: Add the axes to the filter type**

In `mobile/src/types/exerciseFilters.ts`, extend the `ExerciseFilters` interface (after `skills`) and the `EMPTY_EXERCISE_FILTERS` constant:

```ts
export interface ExerciseFilters {
  creators: string[];
  /** Matches PRIMARY muscles only. */
  muscles: string[];
  /** The exercise's own equipment names, direct match. */
  equipment: string[];
  goalTypes: string[];
  skills: SkillLevel[];
  /** Movement category name, any-of. */
  categories: string[];
  /** Hierarchy rank: 0 = Core, 1–3 = Tier n. Any-of. */
  tiers: number[];
  /** Scoring type names. ALL-of: an exercise must carry every listed type. */
  scoringTypes: string[];
  picture: PictureFilter;
}

export const EMPTY_EXERCISE_FILTERS: ExerciseFilters = {
  creators: [], muscles: [], equipment: [], goalTypes: [], skills: [],
  categories: [], tiers: [], scoringTypes: [], picture: "any",
};
```

- [ ] **Step 4: Add the three fields to `CatalogEntry`**

In `mobile/src/types/capture.ts`, inside `interface CatalogEntry` (after `goalTypes: string[];`):

```ts
  /** Movement category name (Weightlifting/Gymnastics/Recovery/Monostructural), or null. */
  category: string | null;
  /** Hierarchy rank: 0 = core movement, 1–3 = tier, null = unranked. */
  tier: number | null;
  /** Scoring type names this exercise carries, e.g. ["Reps", "Load"]. */
  scoringTypes: string[];
```

- [ ] **Step 5: Add the rank helpers**

In `mobile/src/lib/exerciseFilters.ts`, near the top of the file (after the imports):

```ts
/** The rank axis's fixed values: Core (tier 0) then Tier 1–3. */
export const RANK_OPTIONS: number[] = [0, 1, 2, 3];

/** A rank's chip/pill label. */
export function rankLabel(tier: number): string {
  return tier === 0 ? "Core" : `Tier ${tier}`;
}
```

- [ ] **Step 6: Run the test, expect PASS**

Run: `npx jest src/lib/__tests__/exerciseFilters.test.ts -t "rankLabel"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/types/exerciseFilters.ts mobile/src/types/capture.ts mobile/src/lib/exerciseFilters.ts mobile/src/lib/__tests__/exerciseFilters.test.ts
git commit -m "feat(filters): add category, rank and scoring axes to the exercise filter model"
```

---

### Task 2: The three match rules in the predicate

**Files:**
- Modify: `mobile/src/lib/exerciseFilters.ts` (`passes`, around lines 15-34)
- Test: `mobile/src/lib/__tests__/exerciseFilters.test.ts` (the `ex()` fixture builder, around line 14, and new cases)

- [ ] **Step 1: Give the fixture builder defaults for the new fields**

In `mobile/src/lib/__tests__/exerciseFilters.test.ts`, add to the object the `ex()` builder returns (after `goalTypes: ["Strength"],`):

```ts
    category: "Weightlifting",
    tier: 1,
    scoringTypes: ["Reps"],
```

- [ ] **Step 2: Write the failing tests**

Add inside the `describe("applyExerciseFilters", ...)` block:

```ts
  it("category: any-of, null never matches when on", () => {
    expect(applyExerciseFilters([ex()], f({ categories: ["Weightlifting"] }))).toHaveLength(1);
    expect(applyExerciseFilters([ex()], f({ categories: ["Gymnastics"] }))).toHaveLength(0);
    expect(applyExerciseFilters([ex({ category: null })], f({ categories: ["Weightlifting"] }))).toHaveLength(0);
    const two = [ex({ id: "a", category: "Weightlifting" }), ex({ id: "b", category: "Gymnastics" })];
    expect(ids(applyExerciseFilters(two, f({ categories: ["Weightlifting", "Gymnastics"] })))).toEqual(["a", "b"]);
  });

  it("rank: any-of on tier, null never matches when on", () => {
    expect(applyExerciseFilters([ex({ tier: 0 })], f({ tiers: [0] }))).toHaveLength(1);
    expect(applyExerciseFilters([ex({ tier: 2 })], f({ tiers: [0] }))).toHaveLength(0);
    expect(applyExerciseFilters([ex({ tier: null })], f({ tiers: [1] }))).toHaveLength(0);
    const mix = [ex({ id: "core", tier: 0 }), ex({ id: "t2", tier: 2 })];
    expect(ids(applyExerciseFilters(mix, f({ tiers: [0, 2] })))).toEqual(["core", "t2"]);
  });

  it("scoring: ALL-of — the exercise must carry every selected type", () => {
    const both = ex({ scoringTypes: ["Reps", "Load"] });
    expect(applyExerciseFilters([both], f({ scoringTypes: ["Reps"] }))).toHaveLength(1);
    expect(applyExerciseFilters([both], f({ scoringTypes: ["Reps", "Load"] }))).toHaveLength(1);
    const repsOnly = ex({ scoringTypes: ["Reps"] });
    expect(applyExerciseFilters([repsOnly], f({ scoringTypes: ["Reps", "Load"] }))).toHaveLength(0);
  });
```

- [ ] **Step 3: Run them, expect FAIL**

Run: `npx jest src/lib/__tests__/exerciseFilters.test.ts -t "category|rank|scoring"`
Expected: FAIL — the new axes aren't matched yet (category/rank cases return the wrong count).

- [ ] **Step 4: Add the three clauses to `passes`**

In `mobile/src/lib/exerciseFilters.ts`, in `passes`, immediately before `if (f.picture === "has" ...`:

```ts
  if (f.categories.length > 0) {
    if (e.category === null || !f.categories.includes(e.category)) return false;
  }
  if (f.tiers.length > 0) {
    if (e.tier === null || !f.tiers.includes(e.tier)) return false;
  }
  if (f.scoringTypes.length > 0) {
    if (!f.scoringTypes.every((t) => e.scoringTypes.includes(t))) return false;
  }
```

- [ ] **Step 5: Run the tests, expect PASS**

Run: `npx jest src/lib/__tests__/exerciseFilters.test.ts`
Expected: PASS (the whole file — the fixture change must not break existing cases).

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/exerciseFilters.ts mobile/src/lib/__tests__/exerciseFilters.test.ts
git commit -m "feat(filters): match category (any-of), rank (any-of) and scoring (all-of)"
```

---

### Task 3: Generalize `toggleIn` to any value type

The rank axis holds numbers; `toggleIn` is currently constrained to strings. Relax it — its body is type-agnostic.

**Files:**
- Modify: `mobile/src/lib/filterChips.ts` (line 14)
- Test: `mobile/src/lib/__tests__/filterChips.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `mobile/src/lib/__tests__/filterChips.test.ts`:

```ts
import { toggleIn } from "../filterChips";

describe("toggleIn with numbers", () => {
  it("adds and removes a numeric value", () => {
    expect(toggleIn<number>([], 2)).toEqual([2]);
    expect(toggleIn<number>([0, 2], 2)).toEqual([0]);
  });
});
```

- [ ] **Step 2: Run it, expect a type failure**

Run: `npx jest src/lib/__tests__/filterChips.test.ts -t "toggleIn with numbers"`
Expected: FAIL — `number` does not satisfy `T extends string`.

- [ ] **Step 3: Relax the constraint**

In `mobile/src/lib/filterChips.ts`, change the signature:

```ts
/** Add or remove one value in a list-valued axis. */
export function toggleIn<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `npx jest src/lib/__tests__/filterChips.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/filterChips.ts mobile/src/lib/__tests__/filterChips.test.ts
git commit -m "refactor(filters): toggleIn works for any value type"
```

---

### Task 4: Chip machinery for the new axes

**Files:**
- Modify: `mobile/src/lib/exerciseFilters.ts` (`countActiveExerciseFilters`, `activeExerciseFilterChips`, `removeExerciseChip`, `clearExerciseAxis` uses `AXIS_ORDER`)
- Test: `mobile/src/lib/__tests__/exerciseFilters.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `mobile/src/lib/__tests__/exerciseFilters.test.ts`:

```ts
describe("chips for the new axes", () => {
  it("counts category, rank and scoring", () => {
    expect(countActiveExerciseFilters(f({ categories: ["Gymnastics"], tiers: [0, 2], scoringTypes: ["Reps"] }))).toBe(4);
  });

  it("labels a rank chip Core / Tier n and round-trips removal", () => {
    const filters = f({ tiers: [0, 2] });
    const chips = activeExerciseFilterChips(filters);
    const rank = chips.filter((c) => c.axis === "tiers");
    expect(rank.map((c) => c.label)).toEqual(["Core", "Tier 2"]);
    const afterCore = removeExerciseChip(filters, rank[0]);
    expect(afterCore.tiers).toEqual([2]);
  });

  it("category and scoring chips remove by value", () => {
    const filters = f({ categories: ["Gymnastics"], scoringTypes: ["Reps", "Load"] });
    const chips = activeExerciseFilterChips(filters);
    const load = chips.find((c) => c.axis === "scoringTypes" && c.label === "Load")!;
    expect(removeExerciseChip(filters, load).scoringTypes).toEqual(["Reps"]);
    const cat = chips.find((c) => c.axis === "categories")!;
    expect(removeExerciseChip(filters, cat).categories).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them, expect FAIL**

Run: `npx jest src/lib/__tests__/exerciseFilters.test.ts -t "chips for the new axes"`
Expected: FAIL — count is wrong and no chips are produced for the new axes.

- [ ] **Step 3: Update the four helpers**

In `mobile/src/lib/exerciseFilters.ts`:

`countActiveExerciseFilters` — extend the sum:

```ts
export function countActiveExerciseFilters(f: ExerciseFilters): number {
  return (
    f.creators.length + f.muscles.length + f.equipment.length + f.goalTypes.length + f.skills.length +
    f.categories.length + f.tiers.length + f.scoringTypes.length +
    (f.picture !== "any" ? 1 : 0)
  );
}
```

`activeExerciseFilterChips` — insert category after equipment, rank after skill, scoring after rank (sheet order). The function becomes:

```ts
export function activeExerciseFilterChips(f: ExerciseFilters): ExerciseFilterChip[] {
  const chips: ExerciseFilterChip[] = [];
  for (const c of f.creators) chips.push({ axis: "creators", label: c, values: [c] });

  chips.push(...muscleChips("muscles", f.muscles));

  for (const e of f.equipment) chips.push({ axis: "equipment", label: equipmentLabel(e), values: [e] });
  for (const c of f.categories) chips.push({ axis: "categories", label: c, values: [c] });
  for (const g of f.goalTypes) chips.push({ axis: "goalTypes", label: g, values: [g] });
  for (const s of f.skills) chips.push({ axis: "skills", label: s, values: [s] });
  for (const t of f.tiers) chips.push({ axis: "tiers", label: rankLabel(t), values: [String(t)] });
  for (const s of f.scoringTypes) chips.push({ axis: "scoringTypes", label: s, values: [s] });
  if (f.picture !== "any") chips.push({ axis: "picture", label: PICTURE_LABELS[f.picture], values: [f.picture] });
  return chips;
}
```

`removeExerciseChip` — add three cases (note `tiers` maps its string chip values back to numbers):

```ts
    case "categories": return { ...f, categories: f.categories.filter((v) => !chip.values.includes(v)) };
    case "tiers": return { ...f, tiers: f.tiers.filter((v) => !chip.values.includes(String(v))) };
    case "scoringTypes": return { ...f, scoringTypes: f.scoringTypes.filter((v) => !chip.values.includes(v)) };
```

`AXIS_ORDER` — insert the new axes so `clearExerciseAxis` and the restrictive-axis logic cover them:

```ts
const AXIS_ORDER: ExerciseFilterAxis[] = ["creators", "muscles", "equipment", "categories", "goalTypes", "skills", "tiers", "scoringTypes", "picture"];
```

- [ ] **Step 4: Run the tests, expect PASS**

Run: `npx jest src/lib/__tests__/exerciseFilters.test.ts`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/exerciseFilters.ts mobile/src/lib/__tests__/exerciseFilters.test.ts
git commit -m "feat(filters): chips, count and clear for category, rank and scoring"
```

---

### Task 5: Sheet option helpers

**Files:**
- Modify: `mobile/src/lib/exerciseFilters.ts` (near `catalogGoalTypes`, around line 157)
- Test: `mobile/src/lib/__tests__/exerciseFilters.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `mobile/src/lib/__tests__/exerciseFilters.test.ts` (add `catalogCategories, catalogScoringTypes` to the import from `../exerciseFilters`):

```ts
describe("catalog option helpers", () => {
  it("distinct categories A–Z, skipping null", () => {
    const list = [ex({ id: "1", category: "Weightlifting" }), ex({ id: "2", category: "Gymnastics" }), ex({ id: "3", category: null })];
    expect(catalogCategories(list)).toEqual(["Gymnastics", "Weightlifting"]);
  });
  it("distinct scoring types A–Z", () => {
    const list = [ex({ id: "1", scoringTypes: ["Reps", "Load"] }), ex({ id: "2", scoringTypes: ["Reps", "Time"] })];
    expect(catalogScoringTypes(list)).toEqual(["Load", "Reps", "Time"]);
  });
});
```

- [ ] **Step 2: Run them, expect FAIL**

Run: `npx jest src/lib/__tests__/exerciseFilters.test.ts -t "catalog option helpers"`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Add the helpers**

In `mobile/src/lib/exerciseFilters.ts`, next to `catalogGoalTypes`:

```ts
/** Distinct movement-category names in the catalog, A–Z. */
export function catalogCategories(entries: CatalogEntry[]): string[] {
  return [...new Set(entries.map((e) => e.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
}

/** Distinct scoring-type names in the catalog, A–Z. */
export function catalogScoringTypes(entries: CatalogEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => e.scoringTypes))].filter(Boolean).sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 4: Run the tests, expect PASS**

Run: `npx jest src/lib/__tests__/exerciseFilters.test.ts -t "catalog option helpers"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/exerciseFilters.ts mobile/src/lib/__tests__/exerciseFilters.test.ts
git commit -m "feat(filters): catalog option lists for category and scoring"
```

---

### Task 6: Widen the page→tab link seam

**Files:**
- Modify: `mobile/src/lib/exerciseFilterLink.ts`
- Test: `mobile/src/lib/__tests__/exerciseFilterLink.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `mobile/src/lib/__tests__/exerciseFilterLink.test.ts` (reuse the file's existing imports; add any missing named imports it flags):

```ts
describe("new axes on the link", () => {
  it("parses category, rank, scoring, goal and skill", () => {
    const raw = exerciseFilterParam({ categories: ["Gymnastics"], tiers: [0, 2], scoringTypes: ["Reps", "Load"], goalTypes: ["Strength"], skills: ["Beginner"] });
    expect(parseExerciseFilterParam(raw)).toEqual({
      categories: ["Gymnastics"], tiers: [0, 2], scoringTypes: ["Reps", "Load"], goalTypes: ["Strength"], skills: ["Beginner"],
    });
  });

  it("drops out-of-range tiers and non-skill strings, returns null when nothing survives", () => {
    expect(parseExerciseFilterParam(JSON.stringify({ tiers: [9], skills: ["Wizard"] }))).toBeNull();
  });

  it("merges each new axis onto the base as a union", () => {
    const base = { ...EMPTY_EXERCISE_FILTERS, tiers: [1], categories: ["Weightlifting"] };
    const merged = mergeExerciseFilters(base, { tiers: [2], categories: ["Weightlifting", "Gymnastics"], scoringTypes: ["Reps"] });
    expect(merged.tiers).toEqual([1, 2]);
    expect(merged.categories).toEqual(["Weightlifting", "Gymnastics"]);
    expect(merged.scoringTypes).toEqual(["Reps"]);
  });
});
```

- [ ] **Step 2: Run them, expect FAIL**

Run: `npx jest src/lib/__tests__/exerciseFilterLink.test.ts -t "new axes on the link"`
Expected: FAIL — the link type and parse/merge don't handle the new axes.

- [ ] **Step 3: Widen the type, parser and merge**

In `mobile/src/lib/exerciseFilterLink.ts`:

Add imports at the top:

```ts
import { ALL_SKILLS } from "../types/skillLevel";
import type { SkillLevel } from "../types/skillLevel";
```

Widen the link type:

```ts
export type ExerciseFilterLink = Partial<Pick<ExerciseFilters,
  "creators" | "muscles" | "equipment" | "goalTypes" | "skills" | "categories" | "tiers" | "scoringTypes">>;
```

Add a numeric reader beside `strings` (structural validation only — taps and sheet selections always emit real values; a hand-edited deep link is the only junk source, and an unknown category/scoring value simply filters to nothing and stays removable as a chip):

```ts
function nums(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : [];
}
```

In `parseExerciseFilterParam`, after the existing `creators`/`muscles`/`equipment` blocks, add:

```ts
  const goalTypes = strings(r.goalTypes);
  const skills = strings(r.skills).filter((s): s is SkillLevel => (ALL_SKILLS as string[]).includes(s));
  const categories = strings(r.categories);
  const scoringTypes = strings(r.scoringTypes);
  const tiers = nums(r.tiers).filter((n) => n >= 0 && n <= 3);
  if (goalTypes.length > 0) link.goalTypes = goalTypes;
  if (skills.length > 0) link.skills = skills;
  if (categories.length > 0) link.categories = categories;
  if (scoringTypes.length > 0) link.scoringTypes = scoringTypes;
  if (tiers.length > 0) link.tiers = tiers;
```

Generalize `union` and extend `mergeExerciseFilters`:

```ts
const union = <T>(a: T[], b: T[] | undefined): T[] =>
  b ? [...a, ...b.filter((v) => !a.includes(v))] : [...a];

export function mergeExerciseFilters(base: ExerciseFilters, link: ExerciseFilterLink): ExerciseFilters {
  return {
    ...base,
    creators: union(base.creators, link.creators),
    muscles: union(base.muscles, link.muscles),
    equipment: union(base.equipment, link.equipment),
    goalTypes: union(base.goalTypes, link.goalTypes),
    skills: union(base.skills, link.skills),
    categories: union(base.categories, link.categories),
    tiers: union(base.tiers, link.tiers),
    scoringTypes: union(base.scoringTypes, link.scoringTypes),
  };
}
```

- [ ] **Step 4: Run the tests, expect PASS**

Run: `npx jest src/lib/__tests__/exerciseFilterLink.test.ts`
Expected: PASS (whole file — existing cases must still pass).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/exerciseFilterLink.ts mobile/src/lib/__tests__/exerciseFilterLink.test.ts
git commit -m "feat(filters): carry category, rank, scoring, goal and skill on the tab link"
```

---

### Task 7: Carry the new fields in the catalog read

Untyped Supabase client — verified by `tsc` plus the device walk in Task 10, not by a unit test.

**Files:**
- Modify: `mobile/src/lib/supabase/capture.ts` (the `fetchCatalog` select and map, around lines 547-575)

- [ ] **Step 1: Add the columns/joins to the select**

In `mobile/src/lib/supabase/capture.ts`, in the `.select(...)` string that starts `id, name, image_url, skill_level, core_default_equipment,`, add `tier,` after `skill_level,` and add these two lines alongside the other joins:

```
      tier,
      movement_category:movement_categories(name),
      scoring_rows:exercise_scoring_types(scoring_type:scoring_types(name)),
```

- [ ] **Step 2: Map them onto the entry**

In the `entries` map for that query, add after `goalTypes: (row.goal_types ?? ...),`:

```ts
    category: row.movement_category?.name ?? null,
    tier: row.tier ?? null,
    scoringTypes: (row.scoring_rows ?? []).map((r: any) => r.scoring_type?.name).filter(Boolean),
```

(Core movements store `tier = 0`, so `row.tier ?? null` yields `0` for them, `null` only for the unranked.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/supabase/capture.ts
git commit -m "feat(catalog): read movement category, tier and scoring types for filtering"
```

---

### Task 8: Three new controls in the filter sheet

**Files:**
- Modify: `mobile/src/components/training/daily/ExerciseFiltersSheet.tsx`
- Modify: `mobile/src/components/training/daily/CatalogTab.tsx`

UI wiring — verified by `tsc` and the device walk.

- [ ] **Step 1: Add props and controls to the sheet**

In `mobile/src/components/training/daily/ExerciseFiltersSheet.tsx`:

Add to the imports:

```ts
import { RANK_OPTIONS, rankLabel } from "@/src/lib/exerciseFilters";
```

Add two props to `ExerciseFiltersSheetProps`:

```ts
  /** Movement-category names present in the catalog, A–Z. */
  categories: string[];
  /** Scoring-type names present in the catalog, A–Z. */
  scoringTypes: string[];
```

Add them to the destructured parameter list:

```ts
  visible, applied, creators, avatars, countFor, equipmentTiles, availableEquipment, goalTypes, categories, scoringTypes, onApply, onClose,
```

Insert a Category section between the Equipment grid and the `Type` section:

```tsx
      <FilterSection title="Category" />
      <FilterPillRow>
        {categories.map((c) => (
          <FilterPill key={c} label={c} on={draft.categories.includes(c)}
            onPress={() => setDraft((d) => ({ ...d, categories: toggleIn(d.categories, c) }))} />
        ))}
      </FilterPillRow>
```

Insert a Rank section immediately after the `Skill` section:

```tsx
      <FilterSection title="Rank" />
      <FilterPillRow>
        {RANK_OPTIONS.map((t) => (
          <FilterPill key={t} label={rankLabel(t)} on={draft.tiers.includes(t)}
            onPress={() => setDraft((d) => ({ ...d, tiers: toggleIn(d.tiers, t) }))} />
        ))}
      </FilterPillRow>
```

Insert a Scored-by section immediately after Rank (the hint names the all-of rule):

```tsx
      <FilterSection title="Scored by" hint="Scored by all selected" />
      <FilterPillRow>
        {scoringTypes.map((s) => (
          <FilterPill key={s} label={s} on={draft.scoringTypes.includes(s)}
            onPress={() => setDraft((d) => ({ ...d, scoringTypes: toggleIn(d.scoringTypes, s) }))} />
        ))}
      </FilterPillRow>
```

- [ ] **Step 2: Compute and pass the option lists in CatalogTab**

In `mobile/src/components/training/daily/CatalogTab.tsx`:

Add `catalogCategories, catalogScoringTypes` to the existing import from `@/src/lib/exerciseFilters`.

Next to `const goalTypes = useMemo(() => catalogGoalTypes(entries), [entries]);` add:

```ts
  const categories = useMemo(() => catalogCategories(entries), [entries]);
  const scoringTypes = useMemo(() => catalogScoringTypes(entries), [entries]);
```

In the `<ExerciseFiltersSheet ... />` element, add the two props beside `goalTypes={goalTypes}`:

```tsx
        categories={categories}
        scoringTypes={scoringTypes}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/training/daily/ExerciseFiltersSheet.tsx mobile/src/components/training/daily/CatalogTab.tsx
git commit -m "feat(filters): Category, Rank and Scored-by controls in the exercise sheet"
```

---

### Task 9: Make the page attributes tappable

**Files:**
- Modify: `mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx`

The `openFiltered(link: ExerciseFilterLink)` handler already exists (around line 369) and navigates to the tab. Wrap the four meta cells and the hero badge so they call it. UI wiring — verified by `tsc` and the device walk.

- [ ] **Step 1: Make the hero badge pressable**

The badge is built around line 456 as `item.is_core ? <CORE view> : tier > 0 ? <TIER view> : null`. Wrap each rendered badge in a `Pressable` (import `Pressable` from `react-native` if not already imported) that carries the rank link. Core sends tier 0; a tiered exercise sends its own tier:

```tsx
  const badge = item.is_core === true ? (
    <Pressable onPress={() => openFiltered({ tiers: [0] })} hitSlop={8}>
      <View style={styles.heroCoreBadge}><Text style={styles.heroBadgeText}>CORE</Text></View>
    </Pressable>
  ) : tier > 0 ? (
    <Pressable onPress={() => openFiltered({ tiers: [tier] })} hitSlop={8}>
      <View style={styles.heroTierBadge}><Text style={styles.heroBadgeText}>TIER {tier}</Text></View>
    </Pressable>
  ) : null;
```

- [ ] **Step 2: Make the four meta cells pressable**

In the meta row (around lines 544-572), turn each cell's wrapping `View` into a `Pressable` that fires the matching link. Goal and Scored-by send the exercise's whole set:

```tsx
            {item.movement_category?.name && (
              <Pressable style={styles.metaItem} hitSlop={4}
                onPress={() => openFiltered({ categories: [item.movement_category!.name] })}>
                <Text style={styles.metaLabel}>Category</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{item.movement_category.name}</Text>
              </Pressable>
            )}
            {(item.goal_rows?.length ?? 0) > 0 && (
              <Pressable style={styles.metaItem} hitSlop={4}
                onPress={() => openFiltered({ goalTypes: item.goal_rows!.map((g) => g.goal_type?.name).filter((n): n is string => !!n) })}>
                <Text style={styles.metaLabel}>Goal</Text>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {item.goal_rows!.map((g) => g.goal_type?.name).filter(Boolean).join(', ')}
                </Text>
              </Pressable>
            )}
            {item.skill_level && (
              <Pressable style={styles.metaItem} hitSlop={4}
                onPress={() => openFiltered({ skills: [item.skill_level as SkillLevel] })}>
                <Text style={styles.metaLabel}>Skill</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{item.skill_level}</Text>
              </Pressable>
            )}
            {scoredBy !== '' && (
              <Pressable style={styles.metaItem} hitSlop={4}
                onPress={() => openFiltered({ scoringTypes: scoringRowsOf(item.scoring_rows).map((r) => r.name) })}>
                <Text style={styles.metaLabel}>Scored by</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{scoredBy}</Text>
              </Pressable>
            )}
```

Add a `SkillLevel` import if the file lacks one: `import type { SkillLevel } from "@/src/types/skillLevel";`. `scoringRowsOf` is already imported (used to compute `scoredBy`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx
git commit -m "feat(exercise-page): tap category, goal, skill, scored-by and rank to filter"
```

---

### Task 10: Full-suite check, device walk, merge

**Files:** none (verification + integration).

- [ ] **Step 1: Run the whole test suite and the typecheck**

Run: `npx jest src/lib && npx tsc --noEmit`
Expected: all pure-lib suites green, tsc exit 0.

- [ ] **Step 2: Device walk on FitTracker-walk3**

With Metro running for the sim, open the exercise page for a Core exercise (e.g. Push-Up) and for a tiered, compound-scored exercise (e.g. Crush Push-Up, Tier 1, and one scored "Reps · Load"). Verify each tap opens the Exercises tab with the right chip(s) and rows:
- Category → that category only.
- Goal → the exercise's goal(s).
- Skill → that level.
- Scored by → exercises carrying **all** of that exercise's scoring types.
- CORE badge → the 48 core movements; TIER n badge → all tier-n exercises.
- Each chip removes cleanly; open the sheet and confirm Category, Rank and Scored-by controls reflect and toggle the same state.

- [ ] **Step 3: Merge to main and push**

```bash
git checkout main && git merge --ff-only <this-branch> && git push
```

---

## Self-review notes

- **Spec coverage:** §4 taps → Task 9; §5 axes/predicate → Tasks 1-2, chips → Task 4; §6 data/query → Tasks 1, 7; §7 link seam → Task 6; sheet controls → Task 8; testing §9 → Tasks 2-6, 10.
- **Deliberate deviation from spec §7:** parse validates structurally (tiers ∈ 0–3, skills ∈ ALL_SKILLS) rather than checking category/scoring against the live catalog vocabulary, because the parser is pure and has no catalog access. Taps and sheet selections only ever emit real values; a stale hand-edited deep-link value filters to nothing and remains removable. Called out in Task 6, Step 3.
- **Type consistency:** `tiers` is `number[]` in the model; chip `values` are `string[]`, so rank chips stringify on create (`String(t)`) and parse back on remove (`String(v)` compare). `toggleIn` is generalized (Task 3) before it's used with numbers (Task 8).
