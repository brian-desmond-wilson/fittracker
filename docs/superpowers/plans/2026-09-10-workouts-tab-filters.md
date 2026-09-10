# Workouts Tab Filters & Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-chip rail on the Daily-mode Workouts tab with Option A from the spec: a sort chip, a Filters sheet covering nine axes with a live count, illustrated muscle and creator pickers, removable active-filter chips, remembered state, and a helpful empty state.

**Architecture:** Pure, unit-tested logic in `mobile/src/lib` (equipment derivation, filtering, sorting, persistence), one read change in `mobile/src/lib/supabase/capture.ts` so each workout item carries its exercise's equipment, and five new components under `mobile/src/components/training/daily` composed by `WorkoutsTab.tsx`. No schema change, no edge-function change, no native module change.

**Tech Stack:** Expo / React Native, TypeScript, Supabase JS client (untyped), Jest + ts-jest for `src/lib` only (no RN imports in tests), `@react-native-async-storage/async-storage` 2.2.0, `lucide-react-native`, `react-native-svg` via the existing `BodyFigure`.

**Spec:** `docs/superpowers/specs/2026-09-10-workouts-tab-filters-design.md`. Mockup: https://claude.ai/code/artifact/e7af83a5-3d87-4ef7-9fba-7c0ca4dd5ac4 (frames A1–A7). Build the frames as drawn; propose deviations in chat, never ship them.

**Project rules that bind every task**
- All commands run from `mobile/`. Tests: `npx jest <path>`. Typecheck: `npx tsc --noEmit` (expected: no output, exit 0).
- Colours, spacing, radii and type come from `@/src/theme/tokens` (`colors.bg`, `colors.surface`, `colors.surface2`, `colors.border`, `colors.text`, `colors.textMuted`, `colors.textFaint`, `colors.brand`, `colors.onBrand`, `colors.scrim`, `tint()`, `spacing`, `radii`, `typography`). Never a raw hex. Existing files that still import `@/src/lib/colors` (the shim) may keep doing so; new files use tokens.
- Pickers and sheets come up from the bottom as modals. Primary buttons sit at the end of scrollable content, never pinned.
- **Commits:** this project commits only when the user asks. Each task ends with a "Commit" step listing the files; run it only if the user has asked for commits this session, otherwise stage and move on.
- No PRs. Work on a branch off `main`; the user merges to `main` directly.

---

## File map

| Path (under `mobile/`) | Status | Responsibility |
|---|---|---|
| `src/types/workoutFilters.ts` | create | `WorkoutFilters`, `WorkoutSort`, `LengthBand`, defaults, labels |
| `src/types/capture.ts` | modify | `CapturedWorkoutItemEntry.equipment?`, `CapturedWorkoutEntry.derivedEquipment`, `.isBodyweight` |
| `src/lib/workoutEquipment.ts` | create | majority-rule derivation, support-surface exclusion, grid order |
| `src/lib/workoutFilters.ts` | create | apply filters, active count, chips (with group collapse), most-restrictive axis, creator counts |
| `src/lib/workoutSort.ts` | create | the eight orders |
| `src/lib/workoutFilterStore.ts` | create | load/save `{filters, sort}` per user in AsyncStorage |
| `src/lib/dailyCoverage.ts` | modify | export `MUSCLE_GROUPS` |
| `src/lib/supabase/capture.ts` | modify | select exercise equipment on items; mapper derives equipment |
| `src/lib/__tests__/workoutFilter.test.ts` | modify | fixture gains the two new entry fields |
| `src/lib/__tests__/workoutEquipment.test.ts` | create | |
| `src/lib/__tests__/workoutFilters.test.ts` | create | |
| `src/lib/__tests__/workoutSort.test.ts` | create | |
| `src/lib/__tests__/workoutFilterStore.test.ts` | create | |
| `src/components/training/daily/SwipeableWorkoutCard.tsx` | modify | equipment tag, "Never done" line |
| `src/components/training/daily/WorkoutsRail.tsx` | create | sort chip, Filters chip, active chips, count line |
| `src/components/training/daily/SortSheet.tsx` | create | A2 |
| `src/components/training/daily/WorkoutFiltersSheet.tsx` | create | A3 + inner pages |
| `src/components/training/daily/MuscleGroupPicker.tsx` | create | A4 |
| `src/components/training/daily/CreatorPicker.tsx` | create | A5 |
| `src/components/training/daily/WorkoutsTab.tsx` | modify | composition, persistence, empty states |

---

### Task 1: Filter and sort types

**Files:**
- Create: `mobile/src/types/workoutFilters.ts`
- Modify: `mobile/src/types/capture.ts` (the `CapturedWorkoutItemEntry` and `CapturedWorkoutEntry` interfaces)
- Modify: `mobile/src/lib/__tests__/workoutFilter.test.ts` (fixture)

- [ ] **Step 1: Create the types module**

```ts
// mobile/src/types/workoutFilters.ts
// The Workouts tab's filter and sort vocabulary.
// Spec: docs/superpowers/specs/2026-09-10-workouts-tab-filters-design.md §5
import type { BlockRole, WorkoutIntensity } from "./dailyBlocks";

export type LengthBand = "short" | "medium" | "long" | "xlong";
export type SkillLevel = "Beginner" | "Intermediate" | "Advanced";
export type HistoryFilter = "any" | "never" | "done";

/** Every axis. An empty list, null, or "any" means the axis is off. */
export interface WorkoutFilters {
  creators: string[];
  muscles: string[];
  equipment: string[];
  blockRoles: BlockRole[];
  intensity: WorkoutIntensity | null;
  lengths: LengthBand[];
  skills: SkillLevel[];
  history: HistoryFilter;
}

export type WorkoutSort =
  | "captured_desc" | "captured_asc"
  | "last_done" | "stale" | "most_done"
  | "name" | "shortest" | "longest";

export const EMPTY_FILTERS: WorkoutFilters = {
  creators: [], muscles: [], equipment: [], blockRoles: [],
  intensity: null, lengths: [], skills: [], history: "any",
};

export const DEFAULT_SORT: WorkoutSort = "captured_desc";

export const ALL_SORTS: WorkoutSort[] = [
  "captured_desc", "captured_asc", "last_done", "stale", "most_done",
  "name", "shortest", "longest",
];

/** Minutes → band. Boundaries per spec §5: ≤15, 16–30, 31–45, >45. */
export const LENGTH_BANDS: { band: LengthBand; label: string; min: number; max: number }[] = [
  { band: "short",  label: "≤ 15 min", min: 0,  max: 15 },
  { band: "medium", label: "15–30",    min: 16, max: 30 },
  { band: "long",   label: "30–45",    min: 31, max: 45 },
  { band: "xlong",  label: "45+",      min: 46, max: Number.POSITIVE_INFINITY },
];

export const SORT_LABELS: Record<WorkoutSort, string> = {
  captured_desc: "Newest captured",
  captured_asc: "Oldest captured",
  last_done: "Last done",
  stale: "Not done in a while",
  most_done: "Most done",
  name: "Name A–Z",
  shortest: "Shortest",
  longest: "Longest",
};

/** Sort sheet groups, in display order (mockup A2). */
export const SORT_GROUPS: { title: string; sorts: WorkoutSort[] }[] = [
  { title: "Captured", sorts: ["captured_desc", "captured_asc"] },
  { title: "History", sorts: ["last_done", "stale", "most_done"] },
  { title: "Workout", sorts: ["name", "shortest", "longest"] },
];

export const SORT_SUBLABELS: Partial<Record<WorkoutSort, string>> = {
  last_done: "Most recently trained first",
  stale: "Never-done workouts rise to the top",
};

/** The five roles the filter offers. "bfr" is built-in-only and never a
 *  catalog workout's tag (see types/dailyBlocks.ts), so it is not offered. */
export const FILTERABLE_ROLES: BlockRole[] = ["warmup", "mobility", "main", "conditioning", "cooldown"];
export const ALL_INTENSITIES: WorkoutIntensity[] = ["low", "moderate", "high"];
export const ALL_SKILLS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced"];
```

- [ ] **Step 2: Extend the capture types**

In `mobile/src/types/capture.ts`, change `CapturedWorkoutItemEntry` to:

```ts
/** One movement inside a captured workout, as the creator prescribed it. */
export interface CapturedWorkoutItemEntry {
  exerciseId: string;
  name: string;
  sets: number | null;
  reps: string | null;
  weight: string | null;
  duration: string | null;
  restSeconds: number | null;
  notes: string | null;
  /** The exercise's equipment names (junction rows, else the core default).
   *  Absent when the item was built without the join — an edit-screen draft,
   *  or a failed join — and such items are left out of equipment derivation. */
  equipment?: string[];
}
```

and add two fields to `CapturedWorkoutEntry` after `tags`:

```ts
  /** Equipment most of the movements need, derived at read time (spec §5.1).
   *  Empty when nothing reaches a majority. */
  derivedEquipment: string[];
  /** True only when every resolved movement is bodyweight. */
  isBodyweight: boolean;
```

- [ ] **Step 3: Fix the existing fixture**

In `mobile/src/lib/__tests__/workoutFilter.test.ts`, inside the `workout` factory, add after the `tags` object:

```ts
  derivedEquipment: [],
  isBodyweight: false,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `src/lib/supabase/capture.ts` (the mapper does not yet set the two new fields). Any other error is a regression; fix it before moving on.

- [ ] **Step 5: Commit**

```bash
git add src/types/workoutFilters.ts src/types/capture.ts src/lib/__tests__/workoutFilter.test.ts
git commit -m "feat(workouts): filter and sort vocabulary; entries carry derived equipment"
```

---

### Task 2: Equipment derivation

**Files:**
- Create: `mobile/src/lib/workoutEquipment.ts`
- Test: `mobile/src/lib/__tests__/workoutEquipment.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/workoutEquipment.test.ts
import { deriveWorkoutEquipment, EQUIPMENT_GRID, primaryEquipmentLabel } from "../workoutEquipment";
import type { CapturedWorkoutItemEntry } from "../../types/capture";

const item = (equipment?: string[]): CapturedWorkoutItemEntry => ({
  exerciseId: "e", name: "x", sets: null, reps: null, weight: null,
  duration: null, restSeconds: null, notes: null, equipment,
});

describe("deriveWorkoutEquipment", () => {
  it("needs a strict majority: 2 of 4 is not enough, 3 of 4 is", () => {
    const two = [item(["Kettlebell"]), item(["Kettlebell"]), item(["Dumbbell"]), item(["Barbell"])];
    expect(deriveWorkoutEquipment(two).derivedEquipment).toEqual([]);
    const three = [item(["Kettlebell"]), item(["Kettlebell"]), item(["Kettlebell"]), item(["Barbell"])];
    expect(deriveWorkoutEquipment(three).derivedEquipment).toEqual(["Kettlebell"]);
  });

  it("can name more than one implement when each clears the bar", () => {
    const items = [item(["Kettlebell", "Bench"]), item(["Kettlebell", "Bench"]), item(["Dumbbell"])];
    expect(deriveWorkoutEquipment(items).derivedEquipment).toEqual(["Kettlebell", "Bench"]);
  });

  it("ignores Floor and Wall as surfaces, not equipment", () => {
    const items = [item(["Bodyweight", "Floor"]), item(["Floor"]), item(["Wall"])];
    const out = deriveWorkoutEquipment(items);
    expect(out.derivedEquipment).toEqual([]);
    expect(out.isBodyweight).toBe(true);
  });

  it("counts a pull-up bar as equipment, so pull-ups are not bodyweight", () => {
    const items = [item(["Bar"]), item(["Bodyweight"])];
    const out = deriveWorkoutEquipment(items);
    expect(out.isBodyweight).toBe(false);
    expect(out.derivedEquipment).toEqual([]);
  });

  it("is bodyweight only when every movement is", () => {
    expect(deriveWorkoutEquipment([item(["Bodyweight"]), item([])]).isBodyweight).toBe(true);
    expect(deriveWorkoutEquipment([item(["Bodyweight"]), item(["Kettlebell"])]).isBodyweight).toBe(false);
  });

  it("never lists Bodyweight as derived equipment", () => {
    expect(deriveWorkoutEquipment([item(["Bodyweight"]), item(["Bodyweight"])]).derivedEquipment).toEqual([]);
  });

  it("leaves items without an equipment array out of the count", () => {
    const items = [item(undefined), item(undefined), item(["Kettlebell"])];
    expect(deriveWorkoutEquipment(items).derivedEquipment).toEqual(["Kettlebell"]);
  });

  it("derives nothing and is not bodyweight with no countable items", () => {
    expect(deriveWorkoutEquipment([])).toEqual({ derivedEquipment: [], isBodyweight: false });
    expect(deriveWorkoutEquipment([item(undefined)])).toEqual({ derivedEquipment: [], isBodyweight: false });
  });

  it("orders derived names by the grid order, unknown names last alphabetically", () => {
    const items = [item(["Zebra Machine", "Bench", "Kettlebell"]), item(["Zebra Machine", "Bench", "Kettlebell"])];
    expect(deriveWorkoutEquipment(items).derivedEquipment).toEqual(["Kettlebell", "Bench", "Zebra Machine"]);
  });
});

describe("primaryEquipmentLabel", () => {
  it("names the first derived implement, else Bodyweight, else null", () => {
    expect(primaryEquipmentLabel({ derivedEquipment: ["Dumbbell", "Bench"], isBodyweight: false })).toBe("Dumbbell");
    expect(primaryEquipmentLabel({ derivedEquipment: [], isBodyweight: true })).toBe("Bodyweight");
    expect(primaryEquipmentLabel({ derivedEquipment: [], isBodyweight: false })).toBeNull();
  });
  it("shows the friendly label for Bar", () => {
    expect(primaryEquipmentLabel({ derivedEquipment: ["Bar"], isBodyweight: false })).toBe("Pull-up bar");
  });
});

describe("EQUIPMENT_GRID", () => {
  it("starts with the four the mockup leads with and includes Bodyweight once", () => {
    expect(EQUIPMENT_GRID.slice(0, 4).map((e) => e.name)).toEqual(["Kettlebell", "Dumbbell", "Barbell", "Bodyweight"]);
    expect(EQUIPMENT_GRID.filter((e) => e.name === "Bodyweight")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/__tests__/workoutEquipment.test.ts`
Expected: FAIL, "Cannot find module '../workoutEquipment'".

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/workoutEquipment.ts
// What a captured workout needs, derived from its movements.
//
// Equipment is a property of exercises, not of workouts, and the user's rule
// is a majority: a workout is a kettlebell workout when most of its movements
// need one, and a bodyweight workout only when every movement is bodyweight.
// A pull-up bar is equipment. The floor and a wall are where a movement
// happens, not what it needs. Spec §5.1.
import type { CapturedWorkoutItemEntry } from "../types/capture";

/** Surfaces that never count as equipment. */
const SUPPORT_SURFACES = new Set(["Floor", "Wall"]);
const BODYWEIGHT = "Bodyweight";

export interface DerivedEquipment {
  derivedEquipment: string[];
  isBodyweight: boolean;
}

/** The filter sheet's grid, in display order. `name` is the live
 *  equipment.name value; `label` is what the tile says. */
export const EQUIPMENT_GRID: { name: string; label: string }[] = [
  { name: "Kettlebell", label: "Kettlebell" },
  { name: "Dumbbell", label: "Dumbbell" },
  { name: "Barbell", label: "Barbell" },
  { name: BODYWEIGHT, label: "Bodyweight" },
  { name: "Bands", label: "Bands" },
  { name: "Bar", label: "Pull-up bar" },
  { name: "Box", label: "Box" },
  { name: "Jump Rope", label: "Jump rope" },
  { name: "Bench", label: "Bench" },
  { name: "Sled", label: "Sled" },
  { name: "Cable", label: "Cable" },
  { name: "Machine", label: "Machine" },
  { name: "Rings", label: "Rings" },
  { name: "Wall Ball", label: "Wall ball" },
  { name: "Bike", label: "Bike" },
  { name: "Rower", label: "Rower" },
];

const GRID_INDEX = new Map(EQUIPMENT_GRID.map((e, i) => [e.name, i]));

export function equipmentLabel(name: string): string {
  return EQUIPMENT_GRID.find((e) => e.name === name)?.label ?? name;
}

/** Grid order first, then anything the grid does not know, alphabetically. */
function byGridOrder(a: string, b: string): number {
  const ia = GRID_INDEX.get(a);
  const ib = GRID_INDEX.get(b);
  if (ia !== undefined && ib !== undefined) return ia - ib;
  if (ia !== undefined) return -1;
  if (ib !== undefined) return 1;
  return a.localeCompare(b);
}

/** A movement's countable equipment: surfaces dropped, Bodyweight dropped. */
function needsOf(item: CapturedWorkoutItemEntry): Set<string> {
  return new Set(
    (item.equipment ?? []).filter((n) => !SUPPORT_SURFACES.has(n) && n !== BODYWEIGHT),
  );
}

export function deriveWorkoutEquipment(items: CapturedWorkoutItemEntry[]): DerivedEquipment {
  const countable = items.filter((it) => it.equipment !== undefined);
  const n = countable.length;
  if (n === 0) return { derivedEquipment: [], isBodyweight: false };

  const tally = new Map<string, number>();
  let bodyweightMovements = 0;
  for (const it of countable) {
    const needs = needsOf(it);
    if (needs.size === 0) bodyweightMovements += 1;
    for (const name of needs) tally.set(name, (tally.get(name) ?? 0) + 1);
  }

  const derivedEquipment = [...tally.entries()]
    .filter(([, count]) => count * 2 > n)
    .map(([name]) => name)
    .sort(byGridOrder);

  return { derivedEquipment, isBodyweight: bodyweightMovements === n };
}

/** The one word a card shows. */
export function primaryEquipmentLabel(d: DerivedEquipment): string | null {
  if (d.derivedEquipment.length > 0) return equipmentLabel(d.derivedEquipment[0]);
  return d.isBodyweight ? "Bodyweight" : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/__tests__/workoutEquipment.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workoutEquipment.ts src/lib/__tests__/workoutEquipment.test.ts
git commit -m "feat(workouts): derive a workout's equipment from its movements by majority"
```

---

### Task 3: Muscle groups vocabulary

**Files:**
- Modify: `mobile/src/lib/dailyCoverage.ts` (add an export after `TRAINABLE_MUSCLES`)

- [ ] **Step 1: Add the grouped vocabulary**

After the `TRAINABLE_MUSCLES` declaration in `mobile/src/lib/dailyCoverage.ts`, add:

```ts
/** The muscle picker's groups, in display order (mockup A4). Names are
 *  muscle_regions.name verbatim. "Full Body" is offered here as a pickable
 *  tag even though it is not a trainable muscle for coverage. */
export const MUSCLE_GROUPS: { title: string; muscles: string[] }[] = [
  { title: "Upper body", muscles: ["Chest", "Upper Back", "Shoulders", "Lats", "Biceps", "Triceps", "Forearms / Grip", "Neck / Traps"] },
  { title: "Core", muscles: ["Core", "Obliques", "Lower Back"] },
  { title: "Lower body", muscles: ["Quads", "Hamstrings", "Glutes", "Calves", "Hip Flexors", "Hip Abductors", "Hip Adductors"] },
  { title: "Whole body", muscles: ["Full Body"] },
];
```

- [ ] **Step 2: Typecheck and run the coverage tests**

Run: `npx tsc --noEmit && npx jest src/lib/__tests__/dailyCoverage`
Expected: only the pre-existing `capture.ts` mapper error from Task 1 in tsc; jest PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/dailyCoverage.ts
git commit -m "feat(workouts): one grouped muscle vocabulary for the picker"
```

---

### Task 4: Filter logic

**Files:**
- Create: `mobile/src/lib/workoutFilters.ts`
- Test: `mobile/src/lib/__tests__/workoutFilters.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/workoutFilters.test.ts
import {
  applyWorkoutFilters, countActiveFilters, activeFilterChips, removeChip,
  mostRestrictiveAxis, creatorCounts,
} from "../workoutFilters";
import { EMPTY_FILTERS } from "../../types/workoutFilters";
import type { WorkoutFilters } from "../../types/workoutFilters";
import type { CapturedWorkoutEntry } from "../../types/capture";
import type { CompletionMap } from "../workoutCompletion";

const workout = (o: Partial<CapturedWorkoutEntry> & { id?: string } = {}): CapturedWorkoutEntry => ({
  workoutId: o.id ?? "w-1",
  name: "KB Upper",
  rounds: null, rawProtocol: null, description: null, notes: null,
  capturedAt: "2026-09-01T00:00:00Z",
  source: {
    sourceId: "s-1", platform: "instagram", sourceUrl: "https://x",
    posterHandle: "@onlinewod", thumbnailUrl: null, captionText: null,
  },
  items: [],
  tags: {
    blockRoles: ["main"], muscles: [{ name: "Chest", isPrimary: true }, { name: "Triceps", isPrimary: false }],
    estMinutes: 20, intensity: "moderate", skillLevel: "Intermediate", classifiedAt: "2026-09-01T00:00:00Z",
  },
  derivedEquipment: ["Kettlebell"],
  isBodyweight: false,
  ...o,
});
const f = (o: Partial<WorkoutFilters>): WorkoutFilters => ({ ...EMPTY_FILTERS, ...o });
const none: CompletionMap = {};

describe("applyWorkoutFilters", () => {
  it("passes everything when every axis is off", () => {
    expect(applyWorkoutFilters([workout()], EMPTY_FILTERS, none)).toHaveLength(1);
  });

  it("creator: exact handle; no source never matches", () => {
    expect(applyWorkoutFilters([workout()], f({ creators: ["@onlinewod"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([workout()], f({ creators: ["@other"] }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([workout({ source: null })], f({ creators: ["@onlinewod"] }), none)).toHaveLength(0);
  });

  it("muscle: primary only, and Full Body is not a wildcard", () => {
    expect(applyWorkoutFilters([workout()], f({ muscles: ["Chest"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([workout()], f({ muscles: ["Triceps"] }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([workout()], f({ muscles: ["Full Body"] }), none)).toHaveLength(0);
  });

  it("equipment: derived list, or Bodyweight flag", () => {
    expect(applyWorkoutFilters([workout()], f({ equipment: ["Kettlebell"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([workout()], f({ equipment: ["Bodyweight"] }), none)).toHaveLength(0);
    const bw = workout({ derivedEquipment: [], isBodyweight: true });
    expect(applyWorkoutFilters([bw], f({ equipment: ["Bodyweight"] }), none)).toHaveLength(1);
  });

  it("type: any selected role", () => {
    expect(applyWorkoutFilters([workout()], f({ blockRoles: ["warmup", "main"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([workout()], f({ blockRoles: ["cooldown"] }), none)).toHaveLength(0);
  });

  it("intensity, length, skill: unclassified never matches an active axis", () => {
    const untagged = workout({ tags: { blockRoles: [], muscles: [], estMinutes: null, intensity: null, skillLevel: null, classifiedAt: null } });
    expect(applyWorkoutFilters([untagged], f({ intensity: "moderate" }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([untagged], f({ lengths: ["short"] }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([untagged], f({ skills: ["Beginner"] }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([untagged], EMPTY_FILTERS, none)).toHaveLength(1);
  });

  it("length bands: 15 is short, 16 is medium, 45 is long, 46 is xlong", () => {
    const at = (m: number) => workout({ tags: { ...workout().tags, estMinutes: m } });
    expect(applyWorkoutFilters([at(15)], f({ lengths: ["short"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([at(16)], f({ lengths: ["short"] }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([at(16)], f({ lengths: ["medium"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([at(45)], f({ lengths: ["long"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([at(46)], f({ lengths: ["xlong"] }), none)).toHaveLength(1);
  });

  it("history: never / done", () => {
    const done: CompletionMap = { "w-1": { count: 2, lastCompleted: "2026-09-01" } };
    expect(applyWorkoutFilters([workout()], f({ history: "never" }), done)).toHaveLength(0);
    expect(applyWorkoutFilters([workout()], f({ history: "done" }), done)).toHaveLength(1);
    expect(applyWorkoutFilters([workout()], f({ history: "never" }), none)).toHaveLength(1);
  });

  it("ANDs across axes and ORs within one", () => {
    const list = [workout({ id: "a" }), workout({ id: "b", derivedEquipment: ["Dumbbell"] })];
    expect(applyWorkoutFilters(list, f({ equipment: ["Kettlebell", "Dumbbell"] }), none)).toHaveLength(2);
    expect(applyWorkoutFilters(list, f({ equipment: ["Kettlebell"], intensity: "high" }), none)).toHaveLength(0);
  });
});

describe("countActiveFilters", () => {
  it("counts one per selected value, one per active single-choice axis", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters(f({ equipment: ["Kettlebell"], muscles: ["Chest", "Lats"], intensity: "low", history: "never" }))).toBe(5);
  });
});

describe("activeFilterChips / removeChip", () => {
  it("collapses a fully selected muscle group into one chip and removes it whole", () => {
    const filters = f({ muscles: ["Core", "Obliques", "Lower Back", "Chest"], equipment: ["Bar"] });
    const chips = activeFilterChips(filters);
    expect(chips.map((c) => c.label)).toEqual(["Core group", "Chest", "Pull-up bar"]);
    const after = removeChip(filters, chips[0]);
    expect(after.muscles).toEqual(["Chest"]);
    expect(after.equipment).toEqual(["Bar"]);
  });

  it("labels the single-choice axes and removes them to their off value", () => {
    const filters = f({ intensity: "high", history: "never", creators: ["@onlinewod"], blockRoles: ["main"], lengths: ["short"], skills: ["Advanced"] });
    const chips = activeFilterChips(filters);
    expect(chips.map((c) => c.label)).toEqual(["@onlinewod", "Main workout", "High", "≤ 15 min", "Advanced", "Never done"]);
    let out = filters;
    for (const c of chips) out = removeChip(out, c);
    expect(out).toEqual(EMPTY_FILTERS);
  });
});

describe("mostRestrictiveAxis", () => {
  it("names the axis whose removal restores the most workouts, with its count", () => {
    const list = [
      workout({ id: "a", tags: { ...workout().tags, blockRoles: ["cooldown"] } }),
      workout({ id: "b", tags: { ...workout().tags, blockRoles: ["cooldown"] } }),
      workout({ id: "c", derivedEquipment: ["Dumbbell"], tags: { ...workout().tags, blockRoles: ["main"] } }),
    ];
    const filters = f({ equipment: ["Kettlebell"], blockRoles: ["main"] });
    expect(applyWorkoutFilters(list, filters, none)).toHaveLength(0);
    expect(mostRestrictiveAxis(list, filters, none, "")).toEqual({ axis: "blockRoles", label: "Main workout", count: 2 });
  });

  it("returns null when no single removal helps", () => {
    const list = [workout({ id: "a", derivedEquipment: ["Dumbbell"], tags: { ...workout().tags, blockRoles: ["cooldown"] } })];
    expect(mostRestrictiveAxis(list, f({ equipment: ["Kettlebell"], blockRoles: ["main"] }), none, "")).toBeNull();
  });

  it("respects the header search", () => {
    const list = [workout({ id: "a", name: "Zulu", tags: { ...workout().tags, blockRoles: ["cooldown"] } })];
    expect(mostRestrictiveAxis(list, f({ blockRoles: ["main"] }), none, "zzz")).toBeNull();
    expect(mostRestrictiveAxis(list, f({ blockRoles: ["main"] }), none, "zulu")?.count).toBe(1);
  });
});

describe("creatorCounts", () => {
  it("orders by count desc then handle, skipping missing handles", () => {
    const list = [
      workout({ id: "a" }), workout({ id: "b" }),
      workout({ id: "c", source: { ...workout().source!, posterHandle: "@abc" } }),
      workout({ id: "d", source: null }),
    ];
    expect(creatorCounts(list)).toEqual([{ handle: "@onlinewod", count: 2 }, { handle: "@abc", count: 1 }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/__tests__/workoutFilters.test.ts`
Expected: FAIL, "Cannot find module '../workoutFilters'".

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/workoutFilters.ts
// Client-side filtering of captured workouts. The whole library is one
// query's result, so every axis runs here — instantly, offline, testable.
// Spec §5. AND across axes, OR within an axis; an off axis passes everything;
// an unclassified workout never matches an axis that is on.
import type { CapturedWorkoutEntry } from "../types/capture";
import type { WorkoutFilters, LengthBand } from "../types/workoutFilters";
import { EMPTY_FILTERS, LENGTH_BANDS } from "../types/workoutFilters";
import type { CompletionMap } from "./workoutCompletion";
import { filterWorkouts } from "./workoutFilter";
import { BLOCK_TITLES } from "./dailyBlockCompose";
import { MUSCLE_GROUPS } from "./dailyCoverage";
import { equipmentLabel } from "./workoutEquipment";

const BODYWEIGHT = "Bodyweight";

function bandOf(minutes: number): LengthBand | null {
  const hit = LENGTH_BANDS.find((b) => minutes >= b.min && minutes <= b.max);
  return hit ? hit.band : null;
}

function passes(w: CapturedWorkoutEntry, f: WorkoutFilters, completions: CompletionMap): boolean {
  if (f.creators.length > 0) {
    const h = w.source?.posterHandle;
    if (!h || !f.creators.includes(h)) return false;
  }
  if (f.muscles.length > 0) {
    if (!w.tags.muscles.some((m) => m.isPrimary && f.muscles.includes(m.name))) return false;
  }
  if (f.equipment.length > 0) {
    const wantsBodyweight = f.equipment.includes(BODYWEIGHT);
    const implements_ = f.equipment.filter((e) => e !== BODYWEIGHT);
    const hitImplement = implements_.some((e) => w.derivedEquipment.includes(e));
    const hitBodyweight = wantsBodyweight && w.isBodyweight;
    if (!hitImplement && !hitBodyweight) return false;
  }
  if (f.blockRoles.length > 0) {
    if (!w.tags.blockRoles.some((r) => f.blockRoles.includes(r))) return false;
  }
  if (f.intensity !== null) {
    if (w.tags.intensity !== f.intensity) return false;
  }
  if (f.lengths.length > 0) {
    const band = w.tags.estMinutes === null ? null : bandOf(w.tags.estMinutes);
    if (band === null || !f.lengths.includes(band)) return false;
  }
  if (f.skills.length > 0) {
    if (w.tags.skillLevel === null || !f.skills.includes(w.tags.skillLevel)) return false;
  }
  if (f.history === "never" && completions[w.workoutId]) return false;
  if (f.history === "done" && !completions[w.workoutId]) return false;
  return true;
}

export function applyWorkoutFilters(
  entries: CapturedWorkoutEntry[],
  filters: WorkoutFilters,
  completions: CompletionMap,
): CapturedWorkoutEntry[] {
  return entries.filter((w) => passes(w, filters, completions));
}

/** Filters, then the header search — the order the tab uses. */
export function applyFiltersAndSearch(
  entries: CapturedWorkoutEntry[],
  filters: WorkoutFilters,
  completions: CompletionMap,
  search: string,
): CapturedWorkoutEntry[] {
  return filterWorkouts(applyWorkoutFilters(entries, filters, completions), search);
}

/** What the Filters chip's badge shows. */
export function countActiveFilters(f: WorkoutFilters): number {
  return (
    f.creators.length + f.muscles.length + f.equipment.length + f.blockRoles.length +
    f.lengths.length + f.skills.length +
    (f.intensity !== null ? 1 : 0) + (f.history !== "any" ? 1 : 0)
  );
}

export type FilterAxis = keyof WorkoutFilters;

/** One removable chip above the list. `values` are the raw values the chip
 *  stands for on its axis — several when a muscle group collapsed. */
export interface FilterChip {
  axis: FilterAxis;
  label: string;
  values: string[];
}

const INTENSITY_LABELS = { low: "Low", moderate: "Moderate", high: "High" } as const;
const HISTORY_LABELS = { never: "Never done", done: "Done before" } as const;

/** Chips in sheet order: creator, muscle, equipment, type, intensity, length,
 *  skill, history. A fully selected muscle group becomes one "<Group> group"
 *  chip (mockup A6). */
export function activeFilterChips(f: WorkoutFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const c of f.creators) chips.push({ axis: "creators", label: c, values: [c] });

  const remaining = new Set(f.muscles);
  for (const g of MUSCLE_GROUPS) {
    // A one-region group (Whole body) is just its region; no collapse.
    if (g.muscles.length > 1 && g.muscles.every((m) => remaining.has(m))) {
      chips.push({ axis: "muscles", label: `${g.title} group`, values: [...g.muscles] });
      for (const m of g.muscles) remaining.delete(m);
    }
  }
  for (const m of f.muscles) if (remaining.has(m)) chips.push({ axis: "muscles", label: m, values: [m] });

  for (const e of f.equipment) chips.push({ axis: "equipment", label: equipmentLabel(e), values: [e] });
  for (const r of f.blockRoles) chips.push({ axis: "blockRoles", label: BLOCK_TITLES[r], values: [r] });
  if (f.intensity !== null) chips.push({ axis: "intensity", label: INTENSITY_LABELS[f.intensity], values: [f.intensity] });
  for (const l of f.lengths) chips.push({ axis: "lengths", label: LENGTH_BANDS.find((b) => b.band === l)!.label, values: [l] });
  for (const s of f.skills) chips.push({ axis: "skills", label: s, values: [s] });
  if (f.history !== "any") chips.push({ axis: "history", label: HISTORY_LABELS[f.history], values: [f.history] });
  return chips;
}

/** The filters with one chip's values taken away. */
export function removeChip(f: WorkoutFilters, chip: FilterChip): WorkoutFilters {
  switch (chip.axis) {
    case "intensity": return { ...f, intensity: null };
    case "history": return { ...f, history: "any" };
    case "creators": return { ...f, creators: f.creators.filter((v) => !chip.values.includes(v)) };
    case "muscles": return { ...f, muscles: f.muscles.filter((v) => !chip.values.includes(v)) };
    case "equipment": return { ...f, equipment: f.equipment.filter((v) => !chip.values.includes(v)) };
    case "blockRoles": return { ...f, blockRoles: f.blockRoles.filter((v) => !chip.values.includes(v)) };
    case "lengths": return { ...f, lengths: f.lengths.filter((v) => !chip.values.includes(v)) };
    case "skills": return { ...f, skills: f.skills.filter((v) => !chip.values.includes(v)) };
  }
}

/** Clears one whole axis. */
function withoutAxis(f: WorkoutFilters, axis: FilterAxis): WorkoutFilters {
  return { ...f, [axis]: EMPTY_FILTERS[axis] };
}

/** Sheet order, top to bottom. Ties in mostRestrictiveAxis go to the axis
 *  furthest DOWN this list. */
const AXIS_ORDER: FilterAxis[] = [
  "creators", "muscles", "equipment", "blockRoles", "intensity", "lengths", "skills", "history",
];

/** A human name for an axis's current selection, for the empty state's
 *  "Drop 'X'" button. A multi-value axis is named by its first chip. */
function axisLabel(f: WorkoutFilters, axis: FilterAxis): string {
  const chip = activeFilterChips(f).find((c) => c.axis === axis);
  return chip ? chip.label : axis;
}

export interface RestrictiveAxis {
  axis: FilterAxis;
  label: string;
  /** How many workouts the list would show with this axis cleared. */
  count: number;
}

/** When the list is empty: which single axis, if cleared, brings back the
 *  most workouts. Null when no single clearing brings back any. */
export function mostRestrictiveAxis(
  entries: CapturedWorkoutEntry[],
  f: WorkoutFilters,
  completions: CompletionMap,
  search: string,
): RestrictiveAxis | null {
  let best: RestrictiveAxis | null = null;
  for (const axis of AXIS_ORDER) {
    const isOn = axis === "intensity" ? f.intensity !== null
      : axis === "history" ? f.history !== "any"
      : (f[axis] as string[]).length > 0;
    if (!isOn) continue;
    const count = applyFiltersAndSearch(entries, withoutAxis(f, axis), completions, search).length;
    if (count > 0 && (best === null || count >= best.count)) {
      best = { axis, label: axisLabel(f, axis), count };
    }
  }
  return best;
}

/** Handles present in the library, most workouts first, then A–Z. */
export function creatorCounts(entries: CapturedWorkoutEntry[]): { handle: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const w of entries) {
    const h = w.source?.posterHandle;
    if (h) tally.set(h, (tally.get(h) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([handle, count]) => ({ handle, count }))
    .sort((a, b) => b.count - a.count || a.handle.localeCompare(b.handle));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/__tests__/workoutFilters.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workoutFilters.ts src/lib/__tests__/workoutFilters.test.ts
git commit -m "feat(workouts): pure filter logic — nine axes, chips, most-restrictive axis"
```

---

### Task 5: Sort logic

**Files:**
- Create: `mobile/src/lib/workoutSort.ts`
- Test: `mobile/src/lib/__tests__/workoutSort.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/workoutSort.test.ts
import { sortWorkouts } from "../workoutSort";
import type { CapturedWorkoutEntry } from "../../types/capture";
import type { CompletionMap } from "../workoutCompletion";

const w = (id: string, o: { name?: string; capturedAt?: string; minutes?: number | null } = {}): CapturedWorkoutEntry => ({
  workoutId: id,
  name: o.name ?? id,
  rounds: null, rawProtocol: null, description: null, notes: null,
  capturedAt: o.capturedAt ?? "2026-09-01T00:00:00Z",
  source: null, items: [],
  tags: { blockRoles: [], muscles: [], estMinutes: o.minutes === undefined ? null : o.minutes, intensity: null, skillLevel: null, classifiedAt: null },
  derivedEquipment: [], isBodyweight: false,
});
const ids = (list: CapturedWorkoutEntry[]) => list.map((x) => x.workoutId);
const today = "2026-09-10";

describe("sortWorkouts", () => {
  const a = w("a", { name: "Zeta", capturedAt: "2026-09-03T00:00:00Z", minutes: 30 });
  const b = w("b", { name: "alpha", capturedAt: "2026-09-01T00:00:00Z", minutes: null });
  const c = w("c", { name: "Mid", capturedAt: "2026-09-02T00:00:00Z", minutes: 10 });
  const list = [b, c, a];
  const done: CompletionMap = {
    a: { count: 1, lastCompleted: "2026-09-08" },
    c: { count: 5, lastCompleted: "2026-08-01" },
  };

  it("captured_desc / captured_asc", () => {
    expect(ids(sortWorkouts(list, "captured_desc", done, today))).toEqual(["a", "c", "b"]);
    expect(ids(sortWorkouts(list, "captured_asc", done, today))).toEqual(["b", "c", "a"]);
  });

  it("last_done: most recent first, never-done last (by newest capture)", () => {
    expect(ids(sortWorkouts(list, "last_done", done, today))).toEqual(["a", "c", "b"]);
  });

  it("stale: never-done first, then oldest completion", () => {
    expect(ids(sortWorkouts(list, "stale", done, today))).toEqual(["b", "c", "a"]);
  });

  it("most_done: count desc, never-done last", () => {
    expect(ids(sortWorkouts(list, "most_done", done, today))).toEqual(["c", "a", "b"]);
  });

  it("name: case-insensitive A–Z", () => {
    expect(ids(sortWorkouts(list, "name", done, today))).toEqual(["b", "c", "a"]);
  });

  it("shortest / longest: null minutes last either way", () => {
    expect(ids(sortWorkouts(list, "shortest", done, today))).toEqual(["c", "a", "b"]);
    expect(ids(sortWorkouts(list, "longest", done, today))).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the input", () => {
    const copy = [...list];
    sortWorkouts(list, "name", done, today);
    expect(list).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/__tests__/workoutSort.test.ts`
Expected: FAIL, "Cannot find module '../workoutSort'".

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/workoutSort.ts
// The eight orders of the Workouts tab. Pure; sorts a copy. Spec §5.2.
import type { CapturedWorkoutEntry } from "../types/capture";
import type { WorkoutSort } from "../types/workoutFilters";
import type { CompletionMap } from "./workoutCompletion";
import { sortByStaleness } from "./workoutCompletion";

type Cmp = (a: CapturedWorkoutEntry, b: CapturedWorkoutEntry) => number;

const capturedDesc: Cmp = (a, b) => b.capturedAt.localeCompare(a.capturedAt);
const capturedAsc: Cmp = (a, b) => a.capturedAt.localeCompare(b.capturedAt);
const name: Cmp = (a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || capturedDesc(a, b);

/** Nulls last in both directions: "shortest" must not open with the
 *  workouts nobody has timed. */
const byMinutes = (dir: 1 | -1): Cmp => (a, b) => {
  const ma = a.tags.estMinutes;
  const mb = b.tags.estMinutes;
  if (ma === null && mb === null) return capturedDesc(a, b);
  if (ma === null) return 1;
  if (mb === null) return -1;
  return (ma - mb) * dir || capturedDesc(a, b);
};

export function sortWorkouts(
  entries: CapturedWorkoutEntry[],
  sort: WorkoutSort,
  completions: CompletionMap,
  today: string,
): CapturedWorkoutEntry[] {
  const list = [...entries];
  switch (sort) {
    case "captured_desc": return list.sort(capturedDesc);
    case "captured_asc": return list.sort(capturedAsc);
    case "name": return list.sort(name);
    case "shortest": return list.sort(byMinutes(1));
    case "longest": return list.sort(byMinutes(-1));
    case "stale":
      // Stable, so pre-sorting newest-first fixes the never-done group's order.
      return sortByStaleness(list.sort(capturedDesc), (w) => w.workoutId, completions, today);
    case "last_done":
      return list.sort((a, b) => {
        const ca = completions[a.workoutId];
        const cb = completions[b.workoutId];
        if (!ca && !cb) return capturedDesc(a, b);
        if (!ca) return 1;
        if (!cb) return -1;
        return cb.lastCompleted.localeCompare(ca.lastCompleted) || capturedDesc(a, b);
      });
    case "most_done":
      return list.sort((a, b) => {
        const ca = completions[a.workoutId];
        const cb = completions[b.workoutId];
        if (!ca && !cb) return capturedDesc(a, b);
        if (!ca) return 1;
        if (!cb) return -1;
        return (cb.count - ca.count)
          || cb.lastCompleted.localeCompare(ca.lastCompleted)
          || capturedDesc(a, b);
      });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/__tests__/workoutSort.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workoutSort.ts src/lib/__tests__/workoutSort.test.ts
git commit -m "feat(workouts): eight sort orders with defined tie-breaks"
```

---

### Task 6: Remembered filters

**Files:**
- Create: `mobile/src/lib/workoutFilterStore.ts`
- Test: `mobile/src/lib/__tests__/workoutFilterStore.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/workoutFilterStore.test.ts
const mockMemory = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockMemory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockMemory.set(k, v); }),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadWorkoutPrefs, saveWorkoutPrefs, prefsKey } from "../workoutFilterStore";
import { EMPTY_FILTERS, DEFAULT_SORT } from "../../types/workoutFilters";

beforeEach(() => mockMemory.clear());

describe("workoutFilterStore", () => {
  it("round-trips filters and sort per user", async () => {
    const filters = { ...EMPTY_FILTERS, equipment: ["Kettlebell"], intensity: "high" as const };
    await saveWorkoutPrefs("u1", { filters, sort: "stale" });
    expect(await loadWorkoutPrefs("u1")).toEqual({ filters, sort: "stale" });
    expect(await loadWorkoutPrefs("u2")).toEqual({ filters: EMPTY_FILTERS, sort: DEFAULT_SORT });
  });

  it("keys by user", () => {
    expect(prefsKey("u1")).toBe("training.workouts.filters.v1:u1");
  });

  it("falls back to defaults on malformed JSON", async () => {
    mockMemory.set(prefsKey("u1"), "{not json");
    expect(await loadWorkoutPrefs("u1")).toEqual({ filters: EMPTY_FILTERS, sort: DEFAULT_SORT });
  });

  it("drops unknown enum values but keeps the rest", async () => {
    mockMemory.set(prefsKey("u1"), JSON.stringify({
      filters: { ...EMPTY_FILTERS, intensity: "extreme", history: "sometimes", blockRoles: ["main", "nap"], lengths: ["short", "huge"], skills: ["Advanced", "God"] },
      sort: "random",
    }));
    expect(await loadWorkoutPrefs("u1")).toEqual({
      filters: { ...EMPTY_FILTERS, blockRoles: ["main"], lengths: ["short"], skills: ["Advanced"] },
      sort: DEFAULT_SORT,
    });
  });

  it("keeps free-text values it cannot validate (creators, muscles, equipment)", async () => {
    mockMemory.set(prefsKey("u1"), JSON.stringify({ filters: { ...EMPTY_FILTERS, creators: ["@gone"], muscles: ["Chest"], equipment: ["Sled"] }, sort: "name" }));
    expect((await loadWorkoutPrefs("u1")).filters.creators).toEqual(["@gone"]);
  });

  it("survives a storage failure on read and write", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    expect(await loadWorkoutPrefs("u1")).toEqual({ filters: EMPTY_FILTERS, sort: DEFAULT_SORT });
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    await expect(saveWorkoutPrefs("u1", { filters: EMPTY_FILTERS, sort: "name" })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/__tests__/workoutFilterStore.test.ts`
Expected: FAIL, "Cannot find module '../workoutFilterStore'".

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/workoutFilterStore.ts
// Last-used filters and sort for the Workouts tab, per user. Spec §7.
// A preference must never stop the list rendering: every failure here is a
// logged fallback to the defaults.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WorkoutFilters, WorkoutSort } from "../types/workoutFilters";
import {
  EMPTY_FILTERS, DEFAULT_SORT, ALL_SORTS, FILTERABLE_ROLES, ALL_INTENSITIES,
  ALL_SKILLS, LENGTH_BANDS,
} from "../types/workoutFilters";

export interface WorkoutPrefs {
  filters: WorkoutFilters;
  sort: WorkoutSort;
}

export const prefsKey = (userId: string) => `training.workouts.filters.v1:${userId}`;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
const manyOf = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  strings(v).filter((x): x is T => (allowed as readonly string[]).includes(x));

/** Coerce whatever was stored into a valid preference set. Exported for
 *  tests; the tab only calls load/save. */
export function sanitizePrefs(raw: unknown): WorkoutPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (r.filters && typeof r.filters === "object" ? r.filters : {}) as Record<string, unknown>;
  const filters: WorkoutFilters = {
    creators: strings(f.creators),
    muscles: strings(f.muscles),
    equipment: strings(f.equipment),
    blockRoles: manyOf(f.blockRoles, FILTERABLE_ROLES),
    intensity: oneOf(f.intensity, ALL_INTENSITIES),
    lengths: manyOf(f.lengths, LENGTH_BANDS.map((b) => b.band)),
    skills: manyOf(f.skills, ALL_SKILLS),
    history: oneOf(f.history, ["never", "done"] as const) ?? "any",
  };
  return { filters, sort: oneOf(r.sort, ALL_SORTS) ?? DEFAULT_SORT };
}

export async function loadWorkoutPrefs(userId: string): Promise<WorkoutPrefs> {
  try {
    const raw = await AsyncStorage.getItem(prefsKey(userId));
    if (!raw) return { filters: EMPTY_FILTERS, sort: DEFAULT_SORT };
    return sanitizePrefs(JSON.parse(raw));
  } catch (e) {
    console.warn("loadWorkoutPrefs fell back to defaults:", e);
    return { filters: EMPTY_FILTERS, sort: DEFAULT_SORT };
  }
}

export async function saveWorkoutPrefs(userId: string, prefs: WorkoutPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
  } catch (e) {
    console.warn("saveWorkoutPrefs failed:", e);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/__tests__/workoutFilterStore.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workoutFilterStore.ts src/lib/__tests__/workoutFilterStore.test.ts
git commit -m "feat(workouts): remember last-used filters and sort per user"
```

---

### Task 7: Read equipment with each workout

**Files:**
- Modify: `mobile/src/lib/supabase/capture.ts` — `toCapturedWorkoutEntry` (around line 330), `fetchCapturedWorkouts` (around line 430), `fetchCapturedWorkout` (around line 473)

- [ ] **Step 1: Widen both selects**

In both `fetchCapturedWorkouts` and `fetchCapturedWorkout`, replace the items sub-select

```
      items:captured_workout_exercises(
        exercise_order, target_sets, target_reps, target_weight,
        target_duration, rest_seconds, notes,
        exercise:exercises(id, name)
      )
```

with

```
      items:captured_workout_exercises(
        exercise_order, target_sets, target_reps, target_weight,
        target_duration, rest_seconds, notes,
        exercise:exercises(
          id, name, core_default_equipment,
          equipment_rows:exercise_equipment(equipment(name))
        )
      )
```

- [ ] **Step 2: Map equipment and derive**

At the top of `capture.ts`, `equipmentNamesOf` is already imported from `../exerciseEquipment`. Add:

```ts
import { deriveWorkoutEquipment } from "../workoutEquipment";
```

Replace the whole `toCapturedWorkoutEntry` function with this. Items are built first because the entry's derived equipment depends on them; every existing field is unchanged.

```ts
/** Shared by the list and the single-workout screen so both read a row the
 *  same way. `pendingItems` come from the match-review join — names the
 *  capture could not resolve, waiting in the queue. */
function toCapturedWorkoutEntry(
  row: any,
  pendingItems: PendingWorkoutItemEntry[] = [],
): CapturedWorkoutEntry {
  const items = (row.items ?? [])
    .slice()
    .sort((a: any, b: any) => a.exercise_order - b.exercise_order)
    .map((it: any) => ({
      exerciseId: it.exercise?.id ?? "",
      name: it.exercise?.name ?? "Unknown movement",
      sets: it.target_sets ?? null,
      reps: it.target_reps ?? null,
      weight: it.target_weight ?? null,
      duration: it.target_duration ?? null,
      restSeconds: it.rest_seconds ?? null,
      notes: it.notes ?? null,
      // Absent (not empty) when the exercise did not join, so derivation
      // leaves the movement out rather than calling it bodyweight.
      equipment: it.exercise ? equipmentNamesOf(it.exercise) : undefined,
    }));
  const derived = deriveWorkoutEquipment(items);
  return {
    pendingItems,
    workoutId: row.id,
    name: row.name,
    rounds: row.rounds ?? null,
    rawProtocol: row.raw_protocol ?? null,
    description: row.description ?? null,
    notes: row.notes ?? null,
    capturedAt: row.created_at,
    source: row.source
      ? {
          sourceId: row.source.id,
          platform: row.source.platform,
          sourceUrl: row.source.source_url,
          posterHandle: row.source.poster_handle,
          thumbnailUrl: row.source.thumbnail_url,
          // Stored as the platform's HTML; decoded here so every reader gets
          // the creator's actual characters rather than "&#x2705;".
          captionText: decodeCaption(row.source.caption_text) || null,
        }
      : null,
    items,
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
    derivedEquipment: derived.derivedEquipment,
    isBodyweight: derived.isBodyweight,
  };
}
```

- [ ] **Step 3: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npx jest`
Expected: tsc clean (no output); jest all green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/capture.ts
git commit -m "feat(workouts): each captured item carries its exercise equipment; entries derive theirs"
```

---

### Task 8: Card equipment tag and never-done line

**Files:**
- Modify: `mobile/src/components/training/daily/SwipeableWorkoutCard.tsx`

- [ ] **Step 1: Import the label helper**

Add:

```ts
import { primaryEquipmentLabel } from "@/src/lib/workoutEquipment";
```

- [ ] **Step 2: Show "Never done" when there is no history**

Replace the `{completion && ( <View style={styles.histLine}> ... )}` block with:

```tsx
          {completion ? (
            <View style={styles.histLine}>
              <Check
                size={13}
                strokeWidth={2.4}
                color={stale ? colors.mutedForeground : colors.primary}
              />
              <Text style={[styles.histCount, stale && styles.histCountStale]}>
                {completion.count}×
              </Text>
              {lastLabel && <Text style={styles.histWhen}>· {lastLabel}</Text>}
            </View>
          ) : (
            // Said out loud now that the list can be sorted and filtered by
            // history: a blank line no longer reads as "nothing to say".
            <Text style={styles.histNever}>Never done</Text>
          )}
```

Add to styles:

```ts
  histNever: { fontSize: 13, color: colors.mutedForeground, marginTop: 5 },
```

- [ ] **Step 3: Add the equipment tag after the role pills**

Compute once near `roles`:

```ts
  const equipmentTag = primaryEquipmentLabel(workout);
```

Change the role row so the tag renders in the same row whenever there is one. Replace the whole `classifiedAt === null ? ... : roles.length > 0 ? ... : null` expression with:

```tsx
          {(workout.tags.classifiedAt === null || roles.length > 0 || equipmentTag) && (
            <View style={styles.roleRow}>
              {workout.tags.classifiedAt === null ? (
                <Text style={[styles.rolePill, styles.rolePillUntagged]}>Untagged</Text>
              ) : (
                roles.map((role) => (
                  <Text key={role} style={styles.rolePill}>
                    {BLOCK_TITLES[role]}
                  </Text>
                ))
              )}
              {equipmentTag && (
                <Text style={[styles.rolePill, styles.rolePillEquipment]}>{equipmentTag}</Text>
              )}
            </View>
          )}
```

Add to styles:

```ts
  rolePillEquipment: { color: colors.mutedForeground, borderColor: colors.border },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/training/daily/SwipeableWorkoutCard.tsx
git commit -m "feat(workouts): cards say their equipment and when they were never done"
```

---

### Task 9: The rail

**Files:**
- Create: `mobile/src/components/training/daily/WorkoutsRail.tsx`

- [ ] **Step 1: Write the component**

```tsx
// mobile/src/components/training/daily/WorkoutsRail.tsx
// The strip under the tab band (mockup A1/A6): sort chip left, Filters chip
// right, one removable chip per active filter beneath, then the count line.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { ArrowUpDown, ChevronDown, SlidersHorizontal, X } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import type { FilterChip } from "@/src/lib/workoutFilters";

interface WorkoutsRailProps {
  sortLabel: string;
  onOpenSort: () => void;
  activeCount: number;
  onOpenFilters: () => void;
  chips: FilterChip[];
  onRemoveChip: (chip: FilterChip) => void;
  onClearAll: () => void;
  /** Workouts after filters and search. */
  shown: number;
  /** The whole library. */
  total: number;
}

export function WorkoutsRail({
  sortLabel, onOpenSort, activeCount, onOpenFilters, chips, onRemoveChip, onClearAll, shown, total,
}: WorkoutsRailProps) {
  const filtered = activeCount > 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.rail}>
        <TouchableOpacity style={styles.chip} onPress={onOpenSort}
          accessibilityRole="button" accessibilityLabel={`Sort by ${sortLabel}. Change sort.`}>
          <ArrowUpDown size={13} color={colors.textMuted} />
          <Text style={styles.chipText}>{sortLabel}</Text>
          <ChevronDown size={12} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.gap} />
        <TouchableOpacity style={[styles.chip, filtered && styles.chipSelected]} onPress={onOpenFilters}
          accessibilityRole="button"
          accessibilityLabel={filtered ? `Filters, ${activeCount} active` : "Filters"}>
          <SlidersHorizontal size={13} color={filtered ? colors.brand : colors.textMuted} />
          <Text style={[styles.chipText, filtered && styles.chipTextSelected]}>Filters</Text>
          {filtered && (
            <View style={styles.badge}><Text style={styles.badgeText}>{activeCount}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      {chips.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {chips.map((chip) => (
            <TouchableOpacity key={`${chip.axis}:${chip.label}`}
              style={[styles.chip, styles.chipSelected]}
              onPress={() => onRemoveChip(chip)}
              accessibilityRole="button" accessibilityLabel={`Remove filter ${chip.label}`}>
              <Text style={[styles.chipText, styles.chipTextSelected]}>{chip.label}</Text>
              <X size={12} color={colors.brand} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.count}>
        <Text style={styles.countText}>
          {filtered
            ? <><Text style={styles.countStrong}>{shown} of {total}</Text> workouts</>
            : <Text style={styles.countStrong}>{total} {total === 1 ? "workout" : "workouts"}</Text>}
        </Text>
        {filtered && (
          <TouchableOpacity onPress={onClearAll} accessibilityRole="button">
            <Text style={styles.clear}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rail: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.screenGutter, paddingTop: 10, paddingBottom: spacing.sm,
  },
  gap: { flex: 1 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5, height: 30,
    paddingHorizontal: 11, borderRadius: radii.pill,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  chipSelected: { backgroundColor: tint(colors.brand), borderColor: tint(colors.brand, 0.3) },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextSelected: { color: colors.brand, fontWeight: "600" },
  badge: {
    backgroundColor: colors.brand, borderRadius: radii.pill, paddingHorizontal: 5, minWidth: 16,
    alignItems: "center",
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: colors.onBrand, lineHeight: 15 },
  chips: { paddingHorizontal: spacing.screenGutter, paddingBottom: spacing.sm, gap: 6 },
  count: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.screenGutter, paddingBottom: spacing.sm,
  },
  countText: { fontSize: 12, color: colors.textFaint },
  countStrong: { color: colors.textMuted, fontWeight: "600" },
  clear: { fontSize: 12, color: colors.brand, fontWeight: "600" },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (the component is not yet used; that is fine).

- [ ] **Step 3: Commit**

```bash
git add src/components/training/daily/WorkoutsRail.tsx
git commit -m "feat(workouts): rail with sort chip, Filters chip, active chips and count line"
```

---

### Task 10: Sort sheet

**Files:**
- Create: `mobile/src/components/training/daily/SortSheet.tsx`

- [ ] **Step 1: Write the component**

```tsx
// mobile/src/components/training/daily/SortSheet.tsx
// Mockup A2. Comes up from the bottom; a tap picks and closes.
import React from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable } from "react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";
import type { WorkoutSort } from "@/src/types/workoutFilters";
import { SORT_GROUPS, SORT_LABELS, SORT_SUBLABELS } from "@/src/types/workoutFilters";

interface SortSheetProps {
  visible: boolean;
  value: WorkoutSort;
  onSelect: (sort: WorkoutSort) => void;
  onClose: () => void;
}

export function SortSheet({ visible, value, onSelect, onClose }: SortSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close sort" />
      <View style={styles.sheet}>
        <View style={styles.grab} />
        <Text style={styles.title}>Sort by</Text>
        {SORT_GROUPS.map((g) => (
          <View key={g.title}>
            <Text style={styles.section}>{g.title}</Text>
            {g.sorts.map((s) => {
              const on = s === value;
              const sub = SORT_SUBLABELS[s];
              return (
                <TouchableOpacity key={s} style={styles.row}
                  onPress={() => { onSelect(s); onClose(); }}
                  accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <View style={styles.rowText}>
                    <Text style={styles.label}>{SORT_LABELS[s]}</Text>
                    {sub ? <Text style={styles.sub}>{sub}</Text> : null}
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]}>
                    {on ? <View style={styles.radioDot} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radii.panel, borderTopRightRadius: radii.panel,
    paddingBottom: spacing.xxxl,
  },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, alignSelf: "center", marginTop: spacing.sm, marginBottom: spacing.xs },
  title: { fontSize: 16, fontWeight: "600", color: colors.text, textAlign: "center", paddingVertical: spacing.sm },
  section: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase",
    color: colors.textMuted, paddingHorizontal: spacing.screenGutter, paddingTop: 10, paddingBottom: 4,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.screenGutter, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  rowText: { flex: 1 },
  label: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, color: colors.textFaint, marginTop: 1 },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.textFaint,
    alignItems: "center", justifyContent: "center",
  },
  radioOn: { borderColor: colors.brand, backgroundColor: colors.brand },
  radioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.onBrand },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/training/daily/SortSheet.tsx
git commit -m "feat(workouts): sort sheet"
```

---

### Task 11: Wire rail, sort and persistence into the tab

**Files:**
- Modify: `mobile/src/components/training/daily/WorkoutsTab.tsx`

This task swaps the old rail for the new one, adds sort and remembered state, and keeps the filter sheet as a stub that Task 12 fills in. The tab must build and run at the end of this task.

- [ ] **Step 1: Replace imports and state**

Replace the imports of `filterWorkouts`, `filterNeverDone`, `sortByStaleness` with:

```ts
import { applyFiltersAndSearch, activeFilterChips, countActiveFilters, removeChip } from "@/src/lib/workoutFilters";
import { sortWorkouts } from "@/src/lib/workoutSort";
import { loadWorkoutPrefs, saveWorkoutPrefs } from "@/src/lib/workoutFilterStore";
import { EMPTY_FILTERS, DEFAULT_SORT, SORT_LABELS } from "@/src/types/workoutFilters";
import type { WorkoutFilters, WorkoutSort } from "@/src/types/workoutFilters";
import { WorkoutsRail } from "./WorkoutsRail";
import { SortSheet } from "./SortSheet";
```

Keep `CompletionMap` type import. Delete the `SortMode` type and the `workoutId` helper (no longer used). Replace the `sort` and `neverDoneOnly` state with:

```ts
  const [userId, setUserId] = useState<string | null>(null);
  const [filters, setFilters] = useState<WorkoutFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<WorkoutSort>(DEFAULT_SORT);
  // Prefs are read before the first list paint so the list does not flash
  // from unfiltered to filtered (spec §7).
  const [prefsReady, setPrefsReady] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
```

- [ ] **Step 2: Load prefs alongside the list**

In `load`, after `if (!user) return;`, add:

```ts
    setUserId(user.id);
    if (!prefsReady) {
      const prefs = await loadWorkoutPrefs(user.id);
      setFilters(prefs.filters);
      setSort(prefs.sort);
      setPrefsReady(true);
    }
```

and add `prefsReady` to the `useCallback` deps: `[onCountUpdate, prefsReady]`.

- [ ] **Step 3: Save on change**

Add two setters that persist, and use them everywhere instead of the raw `setFilters` / `setSort` (except inside `load`):

```ts
  const applyFilters = useCallback((next: WorkoutFilters) => {
    setFilters(next);
    if (userId) saveWorkoutPrefs(userId, { filters: next, sort });
  }, [userId, sort]);

  const applySort = useCallback((next: WorkoutSort) => {
    setSort(next);
    if (userId) saveWorkoutPrefs(userId, { filters, sort: next });
  }, [userId, filters]);
```

- [ ] **Step 4: Compute the list**

Replace the `filtered` memo with:

```ts
  const filtered = useMemo(() => {
    const list = applyFiltersAndSearch(workouts, filters, completions, searchQuery);
    return sortWorkouts(list, sort, completions, today);
  }, [workouts, filters, completions, searchQuery, sort, today]);

  const chips = useMemo(() => activeFilterChips(filters), [filters]);
  const activeCount = countActiveFilters(filters);
```

- [ ] **Step 5: Replace the rail JSX**

Delete the `chip` helper and the `<View style={styles.rail}>…</View>` block. In its place:

```tsx
      <WorkoutsRail
        sortLabel={SORT_LABELS[sort]}
        onOpenSort={() => setSortOpen(true)}
        activeCount={activeCount}
        onOpenFilters={() => setFiltersOpen(true)}
        chips={chips}
        onRemoveChip={(chip) => applyFilters(removeChip(filters, chip))}
        onClearAll={() => applyFilters(EMPTY_FILTERS)}
        shown={filtered.length}
        total={workouts.length}
      />
```

and, just before `<CaptureFab …/>`:

```tsx
      <SortSheet visible={sortOpen} value={sort} onSelect={applySort} onClose={() => setSortOpen(false)} />
```

Change the loading condition from `loading ?` to `loading || !prefsReady ?`.

Temporarily, until Task 12, make the Filters chip a no-op by leaving `filtersOpen` unused except for its setter; add `void filtersOpen;` after the state declarations so lint does not complain. Task 12 removes that line.

- [ ] **Step 6: Update the empty-state copy for now**

Replace the `ListEmptyComponent` title/body ternaries with:

```tsx
            <Text style={styles.emptyTitle}>
              {workouts.length === 0 ? "No workouts captured yet" : "Nothing matches"}
            </Text>
            <Text style={styles.emptyText}>
              {workouts.length === 0
                ? "When a post lays out a full session — movements with reps and rounds — it lands here, kept the way the creator wrote it."
                : "Change the search or clear a filter."}
            </Text>
```

(Task 13 replaces this with the A7 empty state.)

- [ ] **Step 7: Remove dead styles**

Delete `rail`, `railGap`, `chip`, `chipActive`, `chipText`, `chipTextActive` from the StyleSheet.

- [ ] **Step 8: Typecheck, lint, and run on the simulator**

Run: `npx tsc --noEmit && npx eslint src/components/training/daily/WorkoutsTab.tsx`
Expected: clean.

Then run the app on the dedicated simulator instance with its own Metro port (project rule), open Training › flame › Workouts, and check: the rail shows "Newest captured" and "Filters"; the sort sheet opens, picks, closes; the order changes; cards show "Never done" or the count line, and an equipment tag where one derives; kill and relaunch the app and the sort is remembered.

- [ ] **Step 9: Commit**

```bash
git add src/components/training/daily/WorkoutsTab.tsx
git commit -m "feat(workouts): rail, sort sheet and remembered sort on the Workouts tab"
```

---

### Task 12: Filter sheet with muscle and creator pages

**Files:**
- Create: `mobile/src/components/training/daily/MuscleGroupPicker.tsx`
- Create: `mobile/src/components/training/daily/CreatorPicker.tsx`
- Create: `mobile/src/components/training/daily/WorkoutFiltersSheet.tsx`
- Modify: `mobile/src/components/training/daily/WorkoutsTab.tsx`

- [ ] **Step 1: Muscle group page (A4)**

```tsx
// mobile/src/components/training/daily/MuscleGroupPicker.tsx
// Mockup A4: one tile per region over the app's own body figure, grouped,
// with Select all per group. Multi-select. Primary muscles only — said in
// the sub-line so nobody wonders why a triceps-secondary workout is missing.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { colors, spacing, tint } from "@/src/theme/tokens";
import { MUSCLE_GROUPS } from "@/src/lib/dailyCoverage";
import { BodyFigure } from "./BodyFigure";

/** Regions the front view cannot show. Everything else is drawn from the front. */
const BACK_ONLY = new Set(["Upper Back", "Lats", "Triceps", "Lower Back", "Glutes", "Hamstrings"]);

interface MuscleGroupPickerProps {
  selected: string[];
  onChange: (next: string[]) => void;
  onBack: () => void;
}

export function MuscleGroupPicker({ selected, onChange, onBack }: MuscleGroupPickerProps) {
  const isOn = (m: string) => selected.includes(m);
  const toggle = (m: string) =>
    onChange(isOn(m) ? selected.filter((x) => x !== m) : [...selected, m]);
  const toggleGroup = (muscles: string[]) => {
    const all = muscles.every(isOn);
    onChange(all
      ? selected.filter((x) => !muscles.includes(x))
      : [...selected, ...muscles.filter((m) => !isOn(m))]);
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityLabel="Back to filters">
          <ChevronLeft size={24} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={styles.title}>Muscle groups</Text>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={styles.done}>Done</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sub}>Matches a workout's primary muscles. Pick as many as you like.</Text>
      <ScrollView contentContainerStyle={styles.scroll}>
        {MUSCLE_GROUPS.map((g) => {
          const all = g.muscles.every(isOn);
          return (
            <View key={g.title}>
              <View style={styles.sectionRow}>
                <Text style={styles.section}>{g.title}</Text>
                {g.muscles.length > 1 && (
                  <TouchableOpacity onPress={() => toggleGroup(g.muscles)} accessibilityRole="button">
                    <Text style={styles.link}>{all ? "Clear" : "Select all"}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.grid}>
                {g.muscles.map((m) => {
                  const on = isOn(m);
                  const full = m === "Full Body";
                  return (
                    <TouchableOpacity key={m} style={[styles.tile, on && styles.tileOn]}
                      onPress={() => toggle(m)}
                      accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                      accessibilityLabel={m}>
                      <BodyFigure
                        view={BACK_ONLY.has(m) ? "back" : "front"}
                        width={46}
                        fillFor={(region) =>
                          (full || region === m) ? (on ? colors.brand : colors.textMuted) : colors.surface2}
                      />
                      <Text style={[styles.tileLabel, on && styles.tileLabelOn]} numberOfLines={2}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.text },
  done: { fontSize: 15, fontWeight: "600", color: colors.brand },
  sub: { fontSize: 12, color: colors.textFaint, paddingHorizontal: spacing.screenGutter, paddingBottom: spacing.sm },
  scroll: { paddingBottom: spacing.xxxl },
  sectionRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "baseline",
    paddingHorizontal: spacing.screenGutter, paddingTop: 10, paddingBottom: 4,
  },
  section: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", color: colors.textMuted },
  link: { fontSize: 12, fontWeight: "600", color: colors.brand },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.screenGutter, paddingBottom: spacing.sm },
  tile: {
    width: "31%", flexGrow: 1, alignItems: "center", gap: 2, paddingVertical: 6, paddingHorizontal: 4,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
  },
  tileOn: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  tileLabel: { fontSize: 10.5, color: colors.textMuted, textAlign: "center", lineHeight: 12 },
  tileLabelOn: { color: colors.brand, fontWeight: "600" },
});
```

- [ ] **Step 2: Creator page (A5)**

```tsx
// mobile/src/components/training/daily/CreatorPicker.tsx
// Mockup A5: handles by workout count, a find field, multi-select.
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from "react-native";
import { ChevronLeft, Search } from "lucide-react-native";
import { colors, spacing } from "@/src/theme/tokens";

interface CreatorPickerProps {
  creators: { handle: string; count: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
  onBack: () => void;
}

export function CreatorPicker({ creators, selected, onChange, onBack }: CreatorPickerProps) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? creators.filter((c) => c.handle.toLowerCase().includes(q)) : creators;
  }, [creators, query]);
  const toggle = (h: string) =>
    onChange(selected.includes(h) ? selected.filter((x) => x !== h) : [...selected, h]);

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityLabel="Back to filters">
          <ChevronLeft size={24} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={styles.title}>Creator</Text>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={styles.done}>Done</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.find}>
        <Search size={14} color={colors.textFaint} />
        <TextInput style={styles.findInput} value={query} onChangeText={setQuery}
          placeholder="Find a creator" placeholderTextColor={colors.textFaint}
          autoCapitalize="none" autoCorrect={false} />
      </View>
      <ScrollView>
        {shown.map((c) => {
          const on = selected.includes(c.handle);
          return (
            <TouchableOpacity key={c.handle} style={styles.row} onPress={() => toggle(c.handle)}
              accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{c.handle.replace(/^@/, "").charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.handle}>{c.handle}</Text>
              <Text style={styles.count}>{c.count} {c.count === 1 ? "workout" : "workouts"}</Text>
              <View style={[styles.box, on && styles.boxOn]} />
            </TouchableOpacity>
          );
        })}
        {shown.length === 0 && <Text style={styles.none}>No creator matches.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.text },
  done: { fontSize: 15, fontWeight: "600", color: colors.brand },
  find: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 34,
    marginHorizontal: spacing.screenGutter, marginBottom: 10, paddingHorizontal: 10,
    backgroundColor: colors.surface2, borderRadius: 10,
  },
  findInput: { flex: 1, fontSize: 13, color: colors.text, padding: 0 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: spacing.screenGutter, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  handle: { flex: 1, fontSize: 15, color: colors.text },
  count: { fontSize: 12, color: colors.textFaint },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.textFaint },
  boxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  none: { padding: spacing.xxl, textAlign: "center", color: colors.textMuted, fontSize: 13 },
});
```

- [ ] **Step 3: Filter sheet (A3)**

```tsx
// mobile/src/components/training/daily/WorkoutFiltersSheet.tsx
// Mockup A3. A page-sheet holding every axis. The draft lives here and is
// copied from the applied filters on open; Show applies it, closing discards
// it. Creator and Muscle group push their own pages inside this modal.
import React, { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import {
  Bike, Box, Cable, ChevronRight, Circle, CircleDashed, CircleDot, Cog, Dumbbell, Minus, Move,
  PersonStanding, RectangleHorizontal, Repeat, Waves, Weight, X,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { KettlebellIcon } from "@/src/components/ui/KettlebellIcon";
import type { WorkoutFilters, LengthBand, SkillLevel, HistoryFilter } from "@/src/types/workoutFilters";
import {
  EMPTY_FILTERS, FILTERABLE_ROLES, ALL_INTENSITIES, ALL_SKILLS, LENGTH_BANDS,
} from "@/src/types/workoutFilters";
import type { BlockRole, WorkoutIntensity } from "@/src/types/dailyBlocks";
import { BLOCK_TITLES } from "@/src/lib/dailyBlockCompose";
import { EQUIPMENT_GRID } from "@/src/lib/workoutEquipment";
import { MuscleGroupPicker } from "./MuscleGroupPicker";
import { CreatorPicker } from "./CreatorPicker";

/** A glyph per grid tile. The kettlebell is the app's own; the rest are the
 *  nearest lucide shapes. */
const EQUIPMENT_ICONS: Record<string, LucideIcon | "kettlebell"> = {
  Kettlebell: "kettlebell", Dumbbell, Barbell: Weight, Bodyweight: PersonStanding, Bands: CircleDashed,
  Bar: Minus, Box, "Jump Rope": Repeat, Bench: RectangleHorizontal, Sled: Move, Cable, Machine: Cog,
  Rings: Circle, "Wall Ball": CircleDot, Bike, Rower: Waves,
};

const INTENSITY_LABELS: Record<WorkoutIntensity, string> = { low: "Low", moderate: "Moderate", high: "High" };

interface WorkoutFiltersSheetProps {
  visible: boolean;
  applied: WorkoutFilters;
  creators: { handle: string; count: number }[];
  /** Live count for a draft, including the header search. */
  countFor: (draft: WorkoutFilters) => number;
  /** Equipment names at least one workout derives; other tiles draw dimmed. */
  availableEquipment: Set<string>;
  onApply: (next: WorkoutFilters) => void;
  onClose: () => void;
}

type Page = "root" | "muscles" | "creators";

export function WorkoutFiltersSheet({
  visible, applied, creators, countFor, availableEquipment, onApply, onClose,
}: WorkoutFiltersSheetProps) {
  const [draft, setDraft] = useState<WorkoutFilters>(applied);
  const [page, setPage] = useState<Page>("root");
  useEffect(() => {
    if (visible) { setDraft(applied); setPage("root"); }
  }, [visible, applied]);

  const count = useMemo(() => countFor(draft), [countFor, draft]);
  const toggleIn = <T extends string>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const pill = (label: string, on: boolean, onPress: () => void) => (
    <TouchableOpacity key={label} style={[styles.pill, on && styles.pillOn]} onPress={onPress}
      accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  const segmented = <T extends string>(options: { value: T; label: string }[], value: T, onPick: (v: T) => void) => (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity key={o.value} style={[styles.segItem, on && styles.segItemOn]} onPress={() => onPick(o.value)}
            accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const musclesValue = draft.muscles.length === 0 ? null : draft.muscles.join(", ");
  const creatorsValue = draft.creators.length === 0 ? null : draft.creators.join(", ");

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {page === "muscles" ? (
        <MuscleGroupPicker selected={draft.muscles}
          onChange={(muscles) => setDraft((d) => ({ ...d, muscles }))}
          onBack={() => setPage("root")} />
      ) : page === "creators" ? (
        <CreatorPicker creators={creators} selected={draft.creators}
          onChange={(c) => setDraft((d) => ({ ...d, creators: c }))}
          onBack={() => setPage("root")} />
      ) : (
        <View style={styles.page}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button" accessibilityLabel="Close filters">
              <X size={22} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={styles.title}>Filters</Text>
            <TouchableOpacity onPress={() => setDraft(EMPTY_FILTERS)} accessibilityRole="button">
              <Text style={styles.reset}>Reset</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.scroll}>
            <TouchableOpacity style={[styles.row, styles.rowFirst]} onPress={() => setPage("creators")}
              accessibilityRole="button" accessibilityLabel="Creator">
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Creator</Text>
                <Text style={[styles.rowValue, creatorsValue && styles.rowValueOn]} numberOfLines={1}>
                  {creatorsValue ?? "Any creator"}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textFaint} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => setPage("muscles")}
              accessibilityRole="button" accessibilityLabel="Muscle group">
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Muscle group</Text>
                <Text style={[styles.rowValue, musclesValue && styles.rowValueOn]} numberOfLines={1}>
                  {musclesValue ?? "Any muscle"}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textFaint} />
            </TouchableOpacity>

            <View style={styles.sectionRow}>
              <Text style={styles.section}>Equipment</Text>
              <Text style={styles.hint}>Most of the movements</Text>
            </View>
            <View style={styles.grid}>
              {EQUIPMENT_GRID.map((e) => {
                const on = draft.equipment.includes(e.name);
                const dim = !on && !availableEquipment.has(e.name);
                const Icon = EQUIPMENT_ICONS[e.name];
                const color = on ? colors.brand : colors.textMuted;
                return (
                  <TouchableOpacity key={e.name} style={[styles.tile, on && styles.tileOn, dim && styles.tileDim]}
                    onPress={() => setDraft((d) => ({ ...d, equipment: toggleIn(d.equipment, e.name) }))}
                    accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={e.label}>
                    {Icon === "kettlebell"
                      ? <KettlebellIcon size={24} color={color} />
                      : <Icon size={24} color={color} strokeWidth={1.6} />}
                    <Text style={[styles.tileLabel, on && styles.tileLabelOn]} numberOfLines={1}>{e.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.section}>Workout type</Text>
            <View style={styles.pills}>
              {FILTERABLE_ROLES.map((r: BlockRole) =>
                pill(BLOCK_TITLES[r], draft.blockRoles.includes(r),
                  () => setDraft((d) => ({ ...d, blockRoles: toggleIn(d.blockRoles, r) }))))}
            </View>

            <Text style={styles.section}>Intensity</Text>
            {segmented<WorkoutIntensity | "any">(
              [{ value: "any", label: "Any" }, ...ALL_INTENSITIES.map((i) => ({ value: i, label: INTENSITY_LABELS[i] }))],
              draft.intensity ?? "any",
              (v) => setDraft((d) => ({ ...d, intensity: v === "any" ? null : v })),
            )}

            <Text style={styles.section}>Length</Text>
            <View style={styles.pills}>
              {LENGTH_BANDS.map((b) =>
                pill(b.label, draft.lengths.includes(b.band),
                  () => setDraft((d) => ({ ...d, lengths: toggleIn<LengthBand>(d.lengths, b.band) }))))}
            </View>

            <Text style={styles.section}>Skill</Text>
            <View style={styles.pills}>
              {ALL_SKILLS.map((s: SkillLevel) =>
                pill(s, draft.skills.includes(s),
                  () => setDraft((d) => ({ ...d, skills: toggleIn(d.skills, s) }))))}
            </View>

            <Text style={styles.section}>History</Text>
            {segmented<HistoryFilter>(
              [{ value: "any", label: "Any" }, { value: "never", label: "Never done" }, { value: "done", label: "Done before" }],
              draft.history,
              (v) => setDraft((d) => ({ ...d, history: v })),
            )}

            {/* At the end of the scroll, never pinned. */}
            <TouchableOpacity style={styles.cta} onPress={() => { onApply(draft); onClose(); }}
              accessibilityRole="button">
              <Text style={styles.ctaText}>Show {count} {count === 1 ? "workout" : "workouts"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.text },
  reset: { fontSize: 15, fontWeight: "600", color: colors.brand },
  scroll: { paddingBottom: spacing.xxxl },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: spacing.screenGutter, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowFirst: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, color: colors.text },
  rowValue: { fontSize: 12, color: colors.textFaint, marginTop: 1 },
  rowValueOn: { color: colors.brand },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingRight: spacing.screenGutter },
  section: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase",
    color: colors.textMuted, paddingHorizontal: spacing.screenGutter, paddingTop: 14, paddingBottom: 6,
  },
  hint: { fontSize: 12, fontWeight: "600", color: colors.brand },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.screenGutter },
  tile: {
    width: "22%", flexGrow: 1, alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 4,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
  },
  tileOn: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  tileDim: { opacity: 0.5 },
  tileLabel: { fontSize: 10, color: colors.textMuted, textAlign: "center" },
  tileLabelOn: { color: colors.brand, fontWeight: "600" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: spacing.screenGutter },
  pill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  pillOn: { backgroundColor: tint(colors.brand), borderColor: tint(colors.brand, 0.3) },
  pillText: { fontSize: 13, color: colors.textMuted },
  pillTextOn: { color: colors.brand, fontWeight: "600" },
  seg: { flexDirection: "row", marginHorizontal: spacing.screenGutter, backgroundColor: colors.surface2, borderRadius: radii.control, padding: 3 },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 6 },
  segItemOn: { backgroundColor: colors.brand },
  segText: { fontSize: 13, color: colors.textMuted },
  segTextOn: { color: colors.onBrand, fontWeight: "600" },
  cta: {
    marginHorizontal: spacing.screenGutter, marginTop: spacing.xl, height: 46,
    backgroundColor: colors.brand, borderRadius: radii.control, alignItems: "center", justifyContent: "center",
  },
  ctaText: { color: colors.onBrand, ...typography.button },
});
```

- [ ] **Step 4: Mount the sheet in the tab**

In `WorkoutsTab.tsx`, add imports:

```ts
import { WorkoutFiltersSheet } from "./WorkoutFiltersSheet";
import { creatorCounts } from "@/src/lib/workoutFilters";
```

Remove the `void filtersOpen;` line. Add, after the `chips` memo:

```ts
  const creators = useMemo(() => creatorCounts(workouts), [workouts]);
  const availableEquipment = useMemo(() => {
    const s = new Set<string>();
    for (const w of workouts) {
      for (const e of w.derivedEquipment) s.add(e);
      if (w.isBodyweight) s.add("Bodyweight");
    }
    return s;
  }, [workouts]);
  const countFor = useCallback(
    (draft: WorkoutFilters) => applyFiltersAndSearch(workouts, draft, completions, searchQuery).length,
    [workouts, completions, searchQuery],
  );
```

and next to `<SortSheet …/>`:

```tsx
      <WorkoutFiltersSheet
        visible={filtersOpen}
        applied={filters}
        creators={creators}
        countFor={countFor}
        availableEquipment={availableEquipment}
        onApply={applyFilters}
        onClose={() => setFiltersOpen(false)}
      />
```

- [ ] **Step 5: Typecheck, lint, simulator**

Run: `npx tsc --noEmit && npx eslint src/components/training/daily`
Expected: clean.

On the simulator, walk A3 → A4 → A5 → A6: open Filters, pick Kettlebell, open Muscle group, Select all on Upper body, Done, set Intensity Moderate, watch the Show count change, tap Show, see the chips ("Kettlebell", "Upper body group", "Moderate") and "N of 48 workouts", remove one chip, Clear all. Kill and relaunch: the filters are still applied.

- [ ] **Step 6: Commit**

```bash
git add src/components/training/daily/WorkoutFiltersSheet.tsx src/components/training/daily/MuscleGroupPicker.tsx src/components/training/daily/CreatorPicker.tsx src/components/training/daily/WorkoutsTab.tsx
git commit -m "feat(workouts): filter sheet with equipment grid, muscle and creator pages"
```

---

### Task 13: The empty state that helps (A7)

**Files:**
- Modify: `mobile/src/components/training/daily/WorkoutsTab.tsx`

- [ ] **Step 1: Compute the escape hatch**

Add imports:

```ts
import { mostRestrictiveAxis } from "@/src/lib/workoutFilters";
import type { FilterAxis } from "@/src/lib/workoutFilters";
```

Add, after `countFor`:

```ts
  // Only when the list is empty because of us, not because the library is.
  const rescue = useMemo(
    () => (workouts.length > 0 && filtered.length === 0 && activeCount > 0
      ? mostRestrictiveAxis(workouts, filters, completions, searchQuery)
      : null),
    [workouts, filtered.length, activeCount, filters, completions, searchQuery],
  );
  const dropAxis = (axis: FilterAxis) => applyFilters({ ...filters, [axis]: EMPTY_FILTERS[axis] });
```

- [ ] **Step 2: Replace the empty component**

Replace the whole `ListEmptyComponent` with:

```tsx
        ListEmptyComponent={
          <View style={styles.empty}>
            {workouts.length === 0 ? (
              <>
                <Text style={styles.emptyTitle}>No workouts captured yet</Text>
                <Text style={styles.emptyText}>
                  When a post lays out a full session — movements with reps and rounds — it lands here, kept the way the creator wrote it.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>Nothing matches</Text>
                <Text style={styles.emptyText}>
                  {activeCount > 0
                    ? `No workout is ${chips.map((c) => c.label.toLowerCase()).join(" and ")}${searchQuery.trim() ? ` matching “${searchQuery.trim()}”` : ""}.`
                    : "Change the search."}
                </Text>
                {rescue && (
                  <TouchableOpacity style={styles.rescue} onPress={() => dropAxis(rescue.axis)}
                    accessibilityRole="button">
                    <Text style={styles.rescueText}>
                      Drop “{rescue.label}” · {rescue.count} {rescue.count === 1 ? "workout" : "workouts"}
                    </Text>
                  </TouchableOpacity>
                )}
                {activeCount > 0 && (
                  <TouchableOpacity style={styles.rescueGhost} onPress={() => applyFilters(EMPTY_FILTERS)}
                    accessibilityRole="button">
                    <Text style={styles.rescueGhostText}>Clear all filters</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        }
```

Add styles:

```ts
  rescue: {
    marginTop: 16, height: 46, paddingHorizontal: 20, borderRadius: 8, alignSelf: "stretch",
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
  },
  rescueText: { fontSize: 15, fontWeight: "600", color: colors.primaryForeground },
  rescueGhost: { marginTop: 4, height: 34, alignItems: "center", justifyContent: "center" },
  rescueGhostText: { fontSize: 14, color: colors.mutedForeground },
```

(`WorkoutsTab.tsx` still imports the `colors` shim; `colors.primary` and `colors.primaryForeground` are the shim names for brand and onBrand.)

- [ ] **Step 3: Typecheck, lint, simulator**

Run: `npx tsc --noEmit && npx eslint src/components/training/daily/WorkoutsTab.tsx`
Expected: clean.

On the simulator: pick a creator plus Cooldown plus High so nothing matches; the empty state names them, offers "Drop 'X' · N workouts", and tapping it brings the list back with the other filters still applied.

- [ ] **Step 4: Commit**

```bash
git add src/components/training/daily/WorkoutsTab.tsx
git commit -m "feat(workouts): an empty state that names the filters and offers a way out"
```

---

### Task 14: Verification pass

**Files:** none new.

- [ ] **Step 1: Full suite and typecheck**

Run: `npx tsc --noEmit && npx jest && npx eslint src app`
Expected: tsc silent; jest all green; eslint reports no new warnings in the files this plan touched (the repo carries ~1,291 pre-existing raw-colour warnings elsewhere; none may be added).

- [ ] **Step 2: Device walk, A1–A7 in order**

On the simulator (or the user's device), with the Workouts tab open, confirm each frame against the artifact:
1. A1: rail, count line, cards with equipment tag and history line.
2. A2: sort sheet groups, sub-labels, tap-to-close, order actually changes for each of the eight.
3. A3: every axis present in the stated order; Reset clears the draft; the Show button's count moves as you tap; the button is at the end of the scroll.
4. A4: 19 tiles in four groups; Select all / Clear; selected tile is green with its region filled.
5. A5: counts descending; find field narrows; multi-select.
6. A6: chips per value, group collapse, per-chip removal, Clear all, "N of M workouts".
7. A7: names the filters, Drop button restores, Clear all resets.
8. Persistence: kill the app, reopen, filters and sort still applied; sign out and in as a different user (if available) and they are not.

Record anything that deviates from the mockup in chat before changing it; the mockup is the decision record.

- [ ] **Step 3: Update the spec status line**

In `docs/superpowers/specs/2026-09-10-workouts-tab-filters-design.md`, change `**Status:** Approved design (Option A), pending implementation plan` to `**Status:** Implemented (plan: docs/superpowers/plans/2026-09-10-workouts-tab-filters.md)`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-10-workouts-tab-filters-design.md
git commit -m "docs: workouts tab filters spec marked implemented"
```

Then tell the user the branch is ready to merge to `main` (no PR).
