# Exercises Tab Filters & Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Exercises tab's five stacked pill rails with the Workouts tab's rail, sort sheet and filter sheet, sharing one implementation between the two tabs.

**Architecture:** Tasks 1–7 lift the Workouts pieces into shared, prop-driven files with no behaviour change (the existing Workouts tests and screens are the regression net). Tasks 8–11 add the pure exercise filter/sort/store logic under TDD. Tasks 12–13 build the Exercises sheet and rewrite the tab on top of it. Task 14 verifies on device.

**Tech Stack:** React Native (Expo), TypeScript, Jest (ts-jest, pure libs only — never import React Native in a tested file), AsyncStorage, lucide-react-native icons, the app's `@/src/theme/tokens` palette.

**Spec:** `docs/superpowers/specs/2026-09-10-exercises-tab-filters-design.md`

**Conventions for every task:**
- Work from `mobile/`. Run tests with `npx jest <path>`; typecheck with `npx tsc --noEmit -p .` (must print nothing).
- Commit after each task with the message given. End every commit message with a blank line and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- The Workouts tab must look and behave exactly as before after Tasks 1–7. Do not "improve" it.
- Never import `@/src/lib/colors` (the legacy shim) in a new file; use `@/src/theme/tokens`.

---

## File map

**Lifted (Workouts pieces made shared):**
- `mobile/src/types/skillLevel.ts` — new home for `SkillLevel`, `ALL_SKILLS`.
- `mobile/src/lib/filterChips.ts` — generic `FilterChip<Axis>`.
- `mobile/src/lib/filterPrefsStore.ts` — `createPrefsStore` factory.
- `mobile/src/components/training/daily/FilterRail.tsx` — was `WorkoutsRail.tsx`; gains `noun`.
- `mobile/src/components/training/daily/SortSheet.tsx` — takes its orders as props.
- `mobile/src/components/training/daily/filterSheet/FilterSheetFrame.tsx` — modal, header, Reset, scroll, CTA.
- `mobile/src/components/training/daily/filterSheet/FilterRow.tsx` — the Creator / Muscle group push rows.
- `mobile/src/components/training/daily/filterSheet/FilterPills.tsx` — a pill and a pill row.
- `mobile/src/components/training/daily/filterSheet/FilterSegmented.tsx` — the segmented control.
- `mobile/src/components/training/daily/filterSheet/EquipmentGrid.tsx` — the icon tiles.
- `mobile/src/components/training/daily/MuscleGroupPicker.tsx` — gains `subline`.

**New (Exercises):**
- `mobile/src/types/exerciseFilters.ts`
- `mobile/src/lib/exerciseFilters.ts` (+ `__tests__/exerciseFilters.test.ts`)
- `mobile/src/lib/exerciseSort.ts` (+ `__tests__/exerciseSort.test.ts`)
- `mobile/src/lib/exerciseFilterStore.ts` (+ `__tests__/exerciseFilterStore.test.ts`)
- `mobile/src/components/training/daily/ExerciseFiltersSheet.tsx`

**Changed:** `WorkoutsTab.tsx`, `WorkoutFiltersSheet.tsx`, `workoutFilters.ts`, `workoutFilterStore.ts`, `types/workoutFilters.ts`, `CatalogTab.tsx`.

**Deleted:** `lib/catalogFilter.ts`, `lib/__tests__/catalogFilter.test.ts`, `CatalogFilters` in `types/capture.ts`, `WorkoutsRail.tsx`.

---

### Task 1: Shared `SkillLevel` type

**Files:**
- Create: `mobile/src/types/skillLevel.ts`
- Modify: `mobile/src/types/workoutFilters.ts`

- [ ] **Step 1: Create the shared type**

```ts
// mobile/src/types/skillLevel.ts
// The three-step difficulty ladder both catalog tabs filter on. One home so
// the Workouts and Exercises filter vocabularies cannot drift apart.
export type SkillLevel = "Beginner" | "Intermediate" | "Advanced";
export const ALL_SKILLS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced"];
```

- [ ] **Step 2: Re-export from the Workouts types**

In `mobile/src/types/workoutFilters.ts`, replace the line
```ts
export type SkillLevel = "Beginner" | "Intermediate" | "Advanced";
```
with
```ts
export type { SkillLevel } from "./skillLevel";
```
and replace the line
```ts
export const ALL_SKILLS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced"];
```
with
```ts
export { ALL_SKILLS } from "./skillLevel";
```
Because `SkillLevel` is now only re-exported, the file's own uses of the name (`skills: SkillLevel[]` in `WorkoutFilters`) need it imported. Add at the top, under the existing import:
```ts
import type { SkillLevel } from "./skillLevel";
```

- [ ] **Step 3: Typecheck and run the Workouts tests**

Run: `npx tsc --noEmit -p . && npx jest src/lib/__tests__/workoutFilters.test.ts src/lib/__tests__/workoutFilterStore.test.ts`
Expected: tsc prints nothing; both suites PASS.

- [ ] **Step 4: Commit**

```bash
git add src/types/skillLevel.ts src/types/workoutFilters.ts
git commit -m "refactor(filters): SkillLevel gets one shared home"
```

---

### Task 2: Generic `FilterChip`

**Files:**
- Create: `mobile/src/lib/filterChips.ts`
- Modify: `mobile/src/lib/workoutFilters.ts:94-104`

- [ ] **Step 1: Create the generic chip type**

```ts
// mobile/src/lib/filterChips.ts
// One removable chip above a filtered list. Shared by the Workouts and
// Exercises tabs; each names its own axis union.
export interface FilterChip<Axis extends string = string> {
  axis: Axis;
  label: string;
  /** The raw values the chip stands for on its axis — several when a muscle
   *  group collapsed into one chip. */
  values: string[];
}
```

- [ ] **Step 2: Point the Workouts library at it**

In `mobile/src/lib/workoutFilters.ts`, replace
```ts
export type FilterAxis = keyof WorkoutFilters;

/** One removable chip above the list. `values` are the raw values the chip
 *  stands for on its axis — several when a muscle group collapsed. */
export interface FilterChip {
  axis: FilterAxis;
  label: string;
  values: string[];
}
```
with
```ts
export type FilterAxis = keyof WorkoutFilters;

/** The Workouts tab's chip: the shared shape, named for its axes. */
export type FilterChip = GenericFilterChip<FilterAxis>;
```
and add to the imports at the top:
```ts
import type { FilterChip as GenericFilterChip } from "./filterChips";
```

- [ ] **Step 3: Typecheck and test**

Run: `npx tsc --noEmit -p . && npx jest src/lib/__tests__/workoutFilters.test.ts`
Expected: nothing from tsc; PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/filterChips.ts src/lib/workoutFilters.ts
git commit -m "refactor(filters): FilterChip is generic over its axis"
```

---

### Task 3: `createPrefsStore` factory

**Files:**
- Create: `mobile/src/lib/filterPrefsStore.ts`
- Create: `mobile/src/lib/__tests__/filterPrefsStore.test.ts`
- Modify: `mobile/src/lib/workoutFilterStore.ts`

- [ ] **Step 1: Write the failing factory test**

```ts
// mobile/src/lib/__tests__/filterPrefsStore.test.ts
const mockMemory = new Map<string, string>();
let failWrites = false;
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockMemory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      if (failWrites) throw new Error("disk full");
      mockMemory.set(k, v);
    }),
  },
}));

import { createPrefsStore } from "../filterPrefsStore";

interface Prefs { colour: "red" | "blue"; count: number }
const defaults: Prefs = { colour: "red", count: 0 };
const store = createPrefsStore<Prefs>({
  keyPrefix: "test.prefs.v1",
  defaults,
  sanitize: (raw) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      colour: r.colour === "blue" ? "blue" : "red",
      count: typeof r.count === "number" ? r.count : 0,
    };
  },
});

beforeEach(() => { mockMemory.clear(); failWrites = false; });

describe("createPrefsStore", () => {
  it("round-trips per user", async () => {
    await store.save("u1", { colour: "blue", count: 3 });
    expect(await store.load("u1")).toEqual({ colour: "blue", count: 3 });
    expect(await store.load("u2")).toEqual(defaults);
  });

  it("keys by prefix and user", () => {
    expect(store.key("u1")).toBe("test.prefs.v1:u1");
  });

  it("falls back to defaults on malformed JSON", async () => {
    mockMemory.set(store.key("u1"), "{not json");
    expect(await store.load("u1")).toEqual(defaults);
  });

  it("runs the sanitizer on whatever was stored", async () => {
    mockMemory.set(store.key("u1"), JSON.stringify({ colour: "green", count: "many" }));
    expect(await store.load("u1")).toEqual(defaults);
  });

  it("swallows a failed write", async () => {
    failWrites = true;
    await expect(store.save("u1", { colour: "blue", count: 1 })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/lib/__tests__/filterPrefsStore.test.ts`
Expected: FAIL, "Cannot find module '../filterPrefsStore'".

- [ ] **Step 3: Write the factory**

```ts
// mobile/src/lib/filterPrefsStore.ts
// Last-used filters and sort for a list tab, per user. A preference must
// never stop a list rendering: every failure here is a logged fallback to
// the defaults. Each tab creates its own store with its own key and
// sanitizer; the load/save/fallback discipline is written once.
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PrefsStore<T> {
  key: (userId: string) => string;
  load: (userId: string) => Promise<T>;
  save: (userId: string, prefs: T) => Promise<void>;
}

export function createPrefsStore<T>(opts: {
  keyPrefix: string;
  defaults: T;
  /** Coerce whatever was stored into a valid preference set. */
  sanitize: (raw: unknown) => T;
}): PrefsStore<T> {
  const key = (userId: string) => `${opts.keyPrefix}:${userId}`;
  return {
    key,
    async load(userId) {
      try {
        const raw = await AsyncStorage.getItem(key(userId));
        if (!raw) return opts.defaults;
        return opts.sanitize(JSON.parse(raw));
      } catch (e) {
        console.warn(`${opts.keyPrefix} load fell back to defaults:`, e);
        return opts.defaults;
      }
    },
    async save(userId, prefs) {
      try {
        await AsyncStorage.setItem(key(userId), JSON.stringify(prefs));
      } catch (e) {
        console.warn(`${opts.keyPrefix} save failed:`, e);
      }
    },
  };
}
```

- [ ] **Step 4: Run the factory test**

Run: `npx jest src/lib/__tests__/filterPrefsStore.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Rebuild the Workouts store on the factory**

Replace everything in `mobile/src/lib/workoutFilterStore.ts` from the line `export const prefsKey = ...` down to the end of the file with:

```ts
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
    formats: manyOf(f.formats, [...ALL_FORMATS, "untagged"] as const),
    scores: manyOf(f.scores, ALL_SCORES),
    intensity: oneOf(f.intensity, ALL_INTENSITIES),
    lengths: manyOf(f.lengths, LENGTH_BANDS.map((b) => b.band)),
    skills: manyOf(f.skills, ALL_SKILLS),
    history: oneOf(f.history, ["never", "done"] as const) ?? "any",
  };
  return { filters, sort: oneOf(r.sort, ALL_SORTS) ?? DEFAULT_SORT };
}

const store = createPrefsStore<WorkoutPrefs>({
  keyPrefix: "training.workouts.filters.v1",
  defaults: { filters: EMPTY_FILTERS, sort: DEFAULT_SORT },
  sanitize: sanitizePrefs,
});

export const prefsKey = store.key;
export const loadWorkoutPrefs = store.load;
export const saveWorkoutPrefs = store.save;
```

Then change the imports at the top of the file: delete `import AsyncStorage from "@react-native-async-storage/async-storage";` and add `import { createPrefsStore } from "./filterPrefsStore";`.

- [ ] **Step 6: The existing Workouts store test must still pass unchanged**

Run: `npx tsc --noEmit -p . && npx jest src/lib/__tests__/workoutFilterStore.test.ts src/lib/__tests__/filterPrefsStore.test.ts`
Expected: nothing from tsc; both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/filterPrefsStore.ts src/lib/__tests__/filterPrefsStore.test.ts src/lib/workoutFilterStore.ts
git commit -m "refactor(filters): one prefs-store factory; the Workouts store is an instance of it"
```

---

### Task 4: `FilterRail` (was `WorkoutsRail`)

**Files:**
- Rename: `mobile/src/components/training/daily/WorkoutsRail.tsx` → `FilterRail.tsx`
- Modify: `mobile/src/components/training/daily/WorkoutsTab.tsx`

- [ ] **Step 1: Rename the file**

Run: `git mv src/components/training/daily/WorkoutsRail.tsx src/components/training/daily/FilterRail.tsx`

- [ ] **Step 2: Generalise it**

Edit `FilterRail.tsx`:
- Change the header comment's first line to `// mobile/src/components/training/daily/FilterRail.tsx`.
- Replace `import type { FilterChip } from "@/src/lib/workoutFilters";` with `import type { FilterChip } from "@/src/lib/filterChips";`.
- Rename the interface and component, and make both generic over the axis so a tab's `onRemoveChip` receives its own chip type: `interface WorkoutsRailProps {` → `interface FilterRailProps<Axis extends string> {`, and `export function WorkoutsRail({` … `}: WorkoutsRailProps) {` → `export function FilterRail<Axis extends string>({` … `}: FilterRailProps<Axis>) {`. Inside the interface, `chips: FilterChip[]` becomes `chips: FilterChip<Axis>[]` and `onRemoveChip: (chip: FilterChip) => void` becomes `onRemoveChip: (chip: FilterChip<Axis>) => void`.
- Add to the props interface, after `total: number;`:
  ```ts
  /** Count-line wording: ["workout", "workouts"] or ["exercise", "exercises"]. */
  noun: [singular: string, plural: string];
  ```
- Add `noun` to the destructured parameter list.
- Change `/** Workouts after filters and search. */` to `/** Items after filters and search. */`.
- Replace the count-line text
  ```tsx
  {" "}{total === 1 && !narrowed ? "workout" : "workouts"}
  ```
  with
  ```tsx
  {" "}{total === 1 && !narrowed ? noun[0] : noun[1]}
  ```

- [ ] **Step 3: Update the Workouts tab**

In `WorkoutsTab.tsx`: replace `import { WorkoutsRail } from "./WorkoutsRail";` with `import { FilterRail } from "./FilterRail";`, replace `<WorkoutsRail` with `<FilterRail`, and add the prop `noun={["workout", "workouts"]}` directly after `total={workouts.length}`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: nothing. Also `grep -rn "WorkoutsRail" src app` must print nothing.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/training/daily/FilterRail.tsx src/components/training/daily/WorkoutsTab.tsx
git commit -m "refactor(filters): WorkoutsRail becomes FilterRail with a noun prop"
```

---

### Task 5: `SortSheet` takes its orders as props

**Files:**
- Modify: `mobile/src/components/training/daily/SortSheet.tsx`
- Modify: `mobile/src/components/training/daily/WorkoutsTab.tsx`

- [ ] **Step 1: Rewrite the sheet's head**

Replace everything in `SortSheet.tsx` above `const styles = StyleSheet.create({` with:

```tsx
// mobile/src/components/training/daily/SortSheet.tsx
// Mockup A2. Comes up from the bottom; a tap picks and closes. Generic over
// the sort union: each tab hands in its own groups and labels.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { colors, spacing } from "@/src/theme/tokens";

interface SortSheetProps<S extends string> {
  visible: boolean;
  value: S;
  groups: { title: string; sorts: S[] }[];
  labels: Record<S, string>;
  sublabels?: Partial<Record<S, string>>;
  onSelect: (sort: S) => void;
  onClose: () => void;
}

export function SortSheet<S extends string>({
  visible, value, groups, labels, sublabels, onSelect, onClose,
}: SortSheetProps<S>) {
  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel="Close sort" padded={false}>
      <Text style={styles.title}>Sort by</Text>
      {groups.map((g) => (
        <View key={g.title}>
          <Text style={styles.section}>{g.title}</Text>
          {g.sorts.map((s) => {
            const on = s === value;
            const sub = sublabels?.[s];
            return (
              <TouchableOpacity key={s} style={styles.row}
                onPress={() => { onSelect(s); onClose(); }}
                accessibilityRole="radio" accessibilityState={{ selected: on }}>
                <View style={styles.rowText}>
                  <Text style={styles.label}>{labels[s]}</Text>
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
    </BottomSheet>
  );
}
```
The styles block stays exactly as it is.

- [ ] **Step 2: Update the Workouts tab**

In `WorkoutsTab.tsx`, change the import line
```ts
import { EMPTY_FILTERS, DEFAULT_SORT, SORT_LABELS } from "@/src/types/workoutFilters";
```
to
```ts
import { EMPTY_FILTERS, DEFAULT_SORT, SORT_LABELS, SORT_GROUPS, SORT_SUBLABELS } from "@/src/types/workoutFilters";
```
and replace
```tsx
<SortSheet visible={sortOpen} value={sort} onSelect={applySort} onClose={() => setSortOpen(false)} />
```
with
```tsx
<SortSheet visible={sortOpen} value={sort} groups={SORT_GROUPS} labels={SORT_LABELS} sublabels={SORT_SUBLABELS}
  onSelect={applySort} onClose={() => setSortOpen(false)} />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: nothing.

- [ ] **Step 4: Commit**

```bash
git add src/components/training/daily/SortSheet.tsx src/components/training/daily/WorkoutsTab.tsx
git commit -m "refactor(filters): SortSheet takes its orders as props"
```

---

### Task 6: Filter-sheet building blocks

**Files:**
- Create: `mobile/src/components/training/daily/filterSheet/FilterSheetFrame.tsx`
- Create: `mobile/src/components/training/daily/filterSheet/FilterRow.tsx`
- Create: `mobile/src/components/training/daily/filterSheet/FilterPills.tsx`
- Create: `mobile/src/components/training/daily/filterSheet/FilterSegmented.tsx`
- Create: `mobile/src/components/training/daily/filterSheet/EquipmentGrid.tsx`
- Modify: `mobile/src/components/training/daily/WorkoutFiltersSheet.tsx` (rewritten on the blocks)

- [ ] **Step 1: The frame**

```tsx
// mobile/src/components/training/daily/filterSheet/FilterSheetFrame.tsx
// The page-sheet shell every filter sheet shares (mockup A3): close on the
// left, title, Reset on the right, a scroll for the axes, and the "Show N"
// button at the END of the scroll — never pinned. A pushed page (muscles,
// creators) replaces the whole body; the caller decides which.
import React from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

interface FilterSheetFrameProps {
  visible: boolean;
  /** When set, this page renders instead of the root content. */
  pushed: React.ReactNode | null;
  onClose: () => void;
  /** Android back / swipe-down: pops the pushed page or closes the sheet. */
  onRequestClose: () => void;
  onReset: () => void;
  /** "Show 12 exercises" */
  ctaLabel: string;
  onCta: () => void;
  children: React.ReactNode;
}

export function FilterSheetFrame({
  visible, pushed, onClose, onRequestClose, onReset, ctaLabel, onCta, children,
}: FilterSheetFrameProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onRequestClose}>
      {pushed ?? (
        <View style={styles.page}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button" accessibilityLabel="Close filters">
              <X size={22} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={styles.title}>Filters</Text>
            <TouchableOpacity onPress={onReset} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.reset}>Reset</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
            {children}
            <TouchableOpacity style={styles.cta} onPress={onCta} accessibilityRole="button">
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

/** Section header; shared so every sheet's headings match. */
export function FilterSection({ title, hint }: { title: string; hint?: string }) {
  if (!hint) return <Text style={styles.section}>{title}</Text>;
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
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
  reset: { fontSize: 15, fontWeight: "600", color: colors.brand },
  sectionRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    paddingRight: spacing.screenGutter,
  },
  section: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase",
    color: colors.textMuted, paddingHorizontal: spacing.screenGutter, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  hint: { fontSize: 12, fontWeight: "600", color: colors.brand, paddingBottom: spacing.sm },
  cta: {
    marginHorizontal: spacing.screenGutter, marginTop: spacing.xl, height: 48,
    backgroundColor: colors.brand, borderRadius: radii.control, alignItems: "center", justifyContent: "center",
  },
  ctaText: { color: colors.onBrand, ...typography.button },
});
```

- [ ] **Step 2: The push row**

```tsx
// mobile/src/components/training/daily/filterSheet/FilterRow.tsx
// A row that pushes a page inside the sheet: label, current value, chevron.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, spacing } from "@/src/theme/tokens";

interface FilterRowProps {
  label: string;
  /** Null shows the placeholder in faint text; a value shows in brand green. */
  value: string | null;
  placeholder: string;
  first?: boolean;
  onPress: () => void;
}

export function FilterRow({ label, value, placeholder, first, onPress }: FilterRowProps) {
  return (
    <TouchableOpacity style={[styles.row, first && styles.rowFirst]} onPress={onPress}
      accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, value !== null && styles.rowValueOn]} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textFaint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.screenGutter, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowFirst: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, color: colors.text },
  rowValue: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  rowValueOn: { color: colors.brand },
});
```

- [ ] **Step 3: Pills**

```tsx
// mobile/src/components/training/daily/filterSheet/FilterPills.tsx
// Multi-select pills. `dashed` marks a state rather than a value (Workouts'
// "Untagged").
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";

export function FilterPill({ label, on, dashed, onPress }: {
  label: string; on: boolean; dashed?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.pill, dashed && styles.pillDashed, on && styles.pillOn]} onPress={onPress}
      accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function FilterPillRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.pills}>{children}</View>;
}

/** Add or remove one value in a list-valued axis. */
export function toggleIn<T extends string>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

const styles = StyleSheet.create({
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.screenGutter },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  pillOn: { backgroundColor: tint(colors.brand), borderColor: tint(colors.brand, 0.3) },
  pillDashed: { borderStyle: "dashed", borderColor: colors.textFaint },
  pillText: { fontSize: 13, color: colors.textMuted },
  pillTextOn: { color: colors.brand, fontWeight: "600" },
});
```

- [ ] **Step 4: Segmented**

```tsx
// mobile/src/components/training/daily/filterSheet/FilterSegmented.tsx
// Single-choice control for a small closed set (Intensity, History, Picture).
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";

export function FilterSegmented<T extends string>({ options, value, onPick }: {
  options: { value: T; label: string }[]; value: T; onPick: (v: T) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity key={o.value} style={[styles.segItem, on && styles.segItemOn]}
            onPress={() => onPick(o.value)}
            accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: {
    flexDirection: "row", marginHorizontal: spacing.screenGutter,
    backgroundColor: colors.surface2, borderRadius: radii.control, padding: spacing.xs,
  },
  segItem: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radii.control - 2 },
  segItemOn: { backgroundColor: colors.brand },
  segText: { fontSize: 13, color: colors.textMuted },
  segTextOn: { color: colors.onBrand, fontWeight: "600" },
});
```

- [ ] **Step 5: Equipment grid**

```tsx
// mobile/src/components/training/daily/filterSheet/EquipmentGrid.tsx
// The 4-column icon tiles. The caller hands in the tile list: Workouts uses
// the fixed EQUIPMENT_GRID, Exercises whatever its catalog carries.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import {
  Bike, Box, Cable, Circle, CircleDashed, CircleDot, Cog, Dumbbell, Minus, Move,
  PersonStanding, RectangleHorizontal, Repeat, Waves, Weight,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import { KettlebellIcon } from "@/src/components/ui/KettlebellIcon";

/** A glyph per known name. The kettlebell is the app's own; the rest are the
 *  nearest lucide shapes. Anything unknown gets the box. */
const EQUIPMENT_ICONS: Record<string, LucideIcon | "kettlebell"> = {
  Kettlebell: "kettlebell", Dumbbell, Barbell: Weight, Bodyweight: PersonStanding, Bands: CircleDashed,
  Bar: Minus, Box, "Jump Rope": Repeat, Bench: RectangleHorizontal, Sled: Move, Cable, Machine: Cog,
  Rings: Circle, "Med Ball": CircleDot, Bike, Rower: Waves,
};

interface EquipmentGridProps {
  tiles: { name: string; label: string }[];
  selected: string[];
  /** Names at least one item carries; the rest draw dimmed but stay tappable. */
  available: Set<string>;
  /** Accessibility hint on a dimmed tile. */
  dimHint: string;
  onToggle: (name: string) => void;
}

export function EquipmentGrid({ tiles, selected, available, dimHint, onToggle }: EquipmentGridProps) {
  return (
    <View style={styles.grid}>
      {tiles.map((e) => {
        const on = selected.includes(e.name);
        const dim = !on && !available.has(e.name);
        const Icon = EQUIPMENT_ICONS[e.name] ?? Box;
        const color = on ? colors.brand : colors.textMuted;
        return (
          <TouchableOpacity key={e.name} style={[styles.tile, on && styles.tileOn, dim && styles.tileDim]}
            onPress={() => onToggle(e.name)}
            accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={e.label}
            accessibilityHint={dim ? dimHint : undefined}>
            {Icon === "kettlebell"
              ? <KettlebellIcon size={24} color={color} />
              : <Icon size={24} color={color} strokeWidth={1.6} />}
            <Text style={[styles.tileLabel, on && styles.tileLabelOn]} numberOfLines={1}>{e.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.screenGutter },
  tile: {
    width: "22%", flexGrow: 1, alignItems: "center", gap: spacing.xs,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row,
  },
  tileOn: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  tileDim: { opacity: 0.5 },
  tileLabel: { fontSize: 10, color: colors.textMuted, textAlign: "center" },
  tileLabelOn: { color: colors.brand, fontWeight: "600" },
});
```

- [ ] **Step 6: Rewrite `WorkoutFiltersSheet` on the blocks**

Replace the entire file `mobile/src/components/training/daily/WorkoutFiltersSheet.tsx` with:

```tsx
// mobile/src/components/training/daily/WorkoutFiltersSheet.tsx
// Mockup A3. A page-sheet holding every axis. The draft lives here and is
// copied from the applied filters on open; Show applies it, closing discards
// it. Creator and Muscle group push their own pages inside this modal.
import React, { useEffect, useMemo, useState } from "react";
import type { WorkoutFilters, LengthBand, SkillLevel, HistoryFilter, FormatFilter } from "@/src/types/workoutFilters";
import {
  EMPTY_FILTERS, FILTERABLE_ROLES, ALL_INTENSITIES, ALL_SKILLS, LENGTH_BANDS,
  INTENSITY_LABELS, HISTORY_LABELS,
} from "@/src/types/workoutFilters";
import type { BlockRole, WorkoutIntensity, WorkoutScoreType } from "@/src/types/dailyBlocks";
import { BLOCK_TITLES } from "@/src/lib/dailyBlockCompose";
import { EQUIPMENT_GRID } from "@/src/lib/workoutEquipment";
import { ALL_FORMATS, FORMAT_LABELS, ALL_SCORES, SCORE_LABELS } from "@/src/lib/workoutFormatVocab";
import { MuscleGroupPicker } from "./MuscleGroupPicker";
import { CreatorPicker } from "./CreatorPicker";
import type { CreatorAvatarMap } from "@/src/lib/supabase/creators";
import { FilterSheetFrame, FilterSection } from "./filterSheet/FilterSheetFrame";
import { FilterRow } from "./filterSheet/FilterRow";
import { FilterPill, FilterPillRow, toggleIn } from "./filterSheet/FilterPills";
import { FilterSegmented } from "./filterSheet/FilterSegmented";
import { EquipmentGrid } from "./filterSheet/EquipmentGrid";

interface WorkoutFiltersSheetProps {
  visible: boolean;
  applied: WorkoutFilters;
  creators: { handle: string; count: number }[];
  /** Keyed by normalised handle. */
  avatars: CreatorAvatarMap;
  /** Fired when the Creator page opens, so the tab can refresh stale rows. */
  onCreatorsOpen?: () => void;
  /** Live count for a draft, including the header search. */
  countFor: (draft: WorkoutFilters) => number;
  /** Equipment names at least one workout derives; other tiles draw dimmed. */
  availableEquipment: Set<string>;
  onApply: (next: WorkoutFilters) => void;
  onClose: () => void;
}

type Page = "root" | "muscles" | "creators";

export function WorkoutFiltersSheet({
  visible, applied, creators, avatars, onCreatorsOpen, countFor, availableEquipment, onApply, onClose,
}: WorkoutFiltersSheetProps) {
  const [draft, setDraft] = useState<WorkoutFilters>(applied);
  const [page, setPage] = useState<Page>("root");
  // `applied` must be referentially stable while the sheet is open: a new
  // object identity here discards the draft. The tab only replaces it
  // through applyFilters, which cannot run while this modal is up.
  useEffect(() => {
    if (visible) { setDraft(applied); setPage("root"); }
  }, [visible, applied]);

  const count = useMemo(() => countFor(draft), [countFor, draft]);
  const musclesValue = draft.muscles.length === 0 ? null : draft.muscles.join(", ");
  const creatorsValue = draft.creators.length === 0 ? null : draft.creators.join(", ");

  const pushed =
    page === "muscles" ? (
      <MuscleGroupPicker selected={draft.muscles}
        onChange={(muscles) => setDraft((d) => ({ ...d, muscles }))}
        onBack={() => setPage("root")} />
    ) : page === "creators" ? (
      <CreatorPicker creators={creators} avatars={avatars} selected={draft.creators}
        onChange={(c) => setDraft((d) => ({ ...d, creators: c }))}
        onBack={() => setPage("root")} />
    ) : null;

  return (
    <FilterSheetFrame
      visible={visible}
      pushed={pushed}
      onClose={onClose}
      onRequestClose={() => (page === "root" ? onClose() : setPage("root"))}
      onReset={() => setDraft(EMPTY_FILTERS)}
      ctaLabel={`Show ${count} ${count === 1 ? "workout" : "workouts"}`}
      onCta={() => { onApply(draft); onClose(); }}
    >
      <FilterRow label="Creator" value={creatorsValue} placeholder="Any creator" first
        onPress={() => { setPage("creators"); onCreatorsOpen?.(); }} />
      <FilterRow label="Muscle group" value={musclesValue} placeholder="Any muscle"
        onPress={() => setPage("muscles")} />

      <FilterSection title="Equipment" hint="Most of the movements" />
      <EquipmentGrid tiles={EQUIPMENT_GRID} selected={draft.equipment} available={availableEquipment}
        dimHint="No saved workout uses this yet"
        onToggle={(name) => setDraft((d) => ({ ...d, equipment: toggleIn(d.equipment, name) }))} />

      <FilterSection title="Workout type" />
      <FilterPillRow>
        {FILTERABLE_ROLES.map((r: BlockRole) => (
          <FilterPill key={r} label={BLOCK_TITLES[r]} on={draft.blockRoles.includes(r)}
            onPress={() => setDraft((d) => ({ ...d, blockRoles: toggleIn(d.blockRoles, r) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Format" />
      <FilterPillRow>
        {ALL_FORMATS.map((fm) => (
          <FilterPill key={fm} label={FORMAT_LABELS[fm]} on={draft.formats.includes(fm)}
            onPress={() => setDraft((d) => ({ ...d, formats: toggleIn<FormatFilter>(d.formats, fm) }))} />
        ))}
        {/* Dashed: a state, not a value. It finds what the classifier
            skipped so the backfill can be reviewed by filtering. */}
        <FilterPill key="untagged" label="Untagged" dashed on={draft.formats.includes("untagged")}
          onPress={() => setDraft((d) => ({ ...d, formats: toggleIn<FormatFilter>(d.formats, "untagged") }))} />
      </FilterPillRow>

      <FilterSection title="Score" />
      <FilterPillRow>
        {ALL_SCORES.map((sc: WorkoutScoreType) => (
          <FilterPill key={sc} label={SCORE_LABELS[sc]} on={draft.scores.includes(sc)}
            onPress={() => setDraft((d) => ({ ...d, scores: toggleIn(d.scores, sc) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Intensity" />
      <FilterSegmented<WorkoutIntensity | "any">
        options={[{ value: "any", label: "Any" }, ...ALL_INTENSITIES.map((i) => ({ value: i, label: INTENSITY_LABELS[i] }))]}
        value={draft.intensity ?? "any"}
        onPick={(v) => setDraft((d) => ({ ...d, intensity: v === "any" ? null : v }))} />

      <FilterSection title="Length" />
      <FilterPillRow>
        {LENGTH_BANDS.map((b) => (
          <FilterPill key={b.band} label={b.label} on={draft.lengths.includes(b.band)}
            onPress={() => setDraft((d) => ({ ...d, lengths: toggleIn<LengthBand>(d.lengths, b.band) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Skill" />
      <FilterPillRow>
        {ALL_SKILLS.map((s: SkillLevel) => (
          <FilterPill key={s} label={s} on={draft.skills.includes(s)}
            onPress={() => setDraft((d) => ({ ...d, skills: toggleIn(d.skills, s) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="History" />
      <FilterSegmented<HistoryFilter>
        options={[{ value: "any", label: "Any" }, { value: "never", label: HISTORY_LABELS.never }, { value: "done", label: HISTORY_LABELS.done }]}
        value={draft.history}
        onPick={(v) => setDraft((d) => ({ ...d, history: v }))} />
    </FilterSheetFrame>
  );
}
```

- [ ] **Step 7: Typecheck and the full suite**

Run: `npx tsc --noEmit -p . && npx jest`
Expected: nothing from tsc; all suites PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/training/daily/filterSheet src/components/training/daily/WorkoutFiltersSheet.tsx
git commit -m "refactor(filters): filter-sheet frame, rows, pills, segmented and equipment grid as shared blocks"
```

---

### Task 7: `MuscleGroupPicker` sub-line prop

**Files:**
- Modify: `mobile/src/components/training/daily/MuscleGroupPicker.tsx:16-47`

- [ ] **Step 1: Add the prop**

In the props interface add, after `onBack: () => void;`:
```ts
  /** The one-line rule under the title. Defaults to the Workouts wording. */
  subline?: string;
```
Change the destructure to `{ selected, onChange, onBack, subline }` and replace
```tsx
<Text style={styles.sub}>Matches a workout&apos;s primary muscles. Pick as many as you like.</Text>
```
with
```tsx
<Text style={styles.sub}>{subline ?? "Matches a workout’s primary muscles. Pick as many as you like."}</Text>
```

- [ ] **Step 2: Typecheck, commit**

Run: `npx tsc --noEmit -p .` → nothing.
```bash
git add src/components/training/daily/MuscleGroupPicker.tsx
git commit -m "refactor(filters): MuscleGroupPicker sub-line is a prop"
```

---

### Task 8: Exercise filter types

**Files:**
- Create: `mobile/src/types/exerciseFilters.ts`

- [ ] **Step 1: Write the types**

```ts
// mobile/src/types/exerciseFilters.ts
// The Exercises tab's filter and sort vocabulary.
// Spec: docs/superpowers/specs/2026-09-10-exercises-tab-filters-design.md §5
import type { SkillLevel } from "./skillLevel";

export type PictureFilter = "any" | "has" | "missing";

/** Every axis. An empty list or "any" means the axis is off. */
export interface ExerciseFilters {
  creators: string[];
  /** Matches PRIMARY muscles only. */
  muscles: string[];
  /** The exercise's own equipment names, direct match. */
  equipment: string[];
  goalTypes: string[];
  skills: SkillLevel[];
  picture: PictureFilter;
}

export type ExerciseSort = "captured_desc" | "captured_asc" | "name";

export const EMPTY_EXERCISE_FILTERS: ExerciseFilters = {
  creators: [], muscles: [], equipment: [], goalTypes: [], skills: [], picture: "any",
};

export const DEFAULT_EXERCISE_SORT: ExerciseSort = "captured_desc";
export const ALL_EXERCISE_SORTS: ExerciseSort[] = ["captured_desc", "captured_asc", "name"];
export const ALL_PICTURE_FILTERS: PictureFilter[] = ["any", "has", "missing"];

export const EXERCISE_SORT_LABELS: Record<ExerciseSort, string> = {
  captured_desc: "Newest captured",
  captured_asc: "Oldest captured",
  name: "Name A–Z",
};

/** One group: three orders do not need headings between them. */
export const EXERCISE_SORT_GROUPS: { title: string; sorts: ExerciseSort[] }[] = [
  { title: "Order", sorts: ["captured_desc", "captured_asc", "name"] },
];

export const PICTURE_LABELS: Record<Exclude<PictureFilter, "any">, string> = {
  has: "Has picture",
  missing: "No picture",
};
```

- [ ] **Step 2: Typecheck, commit**

Run: `npx tsc --noEmit -p .` → nothing.
```bash
git add src/types/exerciseFilters.ts
git commit -m "feat(exercises): filter and sort vocabulary"
```

---

### Task 9: `exerciseFilters.ts` (TDD)

**Files:**
- Create: `mobile/src/lib/__tests__/exerciseFilters.test.ts`
- Create: `mobile/src/lib/exerciseFilters.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/exerciseFilters.test.ts
import {
  applyExerciseFilters, applyExerciseFiltersAndSearch, countActiveExerciseFilters,
  activeExerciseFilterChips, removeExerciseChip, clearExerciseAxis,
  mostRestrictiveExerciseAxis, exerciseCreatorCounts, catalogEquipmentNames, catalogGoalTypes,
} from "../exerciseFilters";
import { EMPTY_EXERCISE_FILTERS } from "../../types/exerciseFilters";
import type { ExerciseFilters } from "../../types/exerciseFilters";
import type { CatalogEntry, CaptureSource } from "../../types/capture";

const source = (handle: string, capturedAt = "2026-09-01T00:00:00Z"): CaptureSource => ({
  sourceId: `s-${handle}`, platform: "instagram", sourceUrl: "https://x",
  posterHandle: handle, thumbnailUrl: null, capturedAt,
});

const ex = (o: Partial<CatalogEntry> & { id?: string } = {}): CatalogEntry => {
  const { id, ...rest } = o;
  return {
    exerciseId: id ?? "e-1",
    name: "Kettlebell Swing",
    imageUrl: "https://img/1.png",
    skillLevel: "Intermediate",
    equipmentTypes: ["Kettlebell", "Floor"],
    muscles: [{ name: "Glutes", isPrimary: true }, { name: "Hamstrings", isPrimary: false }],
    goalTypes: ["Strength"],
    sources: [source("@a")],
    ...rest,
  };
};
const f = (o: Partial<ExerciseFilters>): ExerciseFilters => ({ ...EMPTY_EXERCISE_FILTERS, ...o });
const ids = (list: CatalogEntry[]) => list.map((e) => e.exerciseId);

describe("applyExerciseFilters", () => {
  it("passes everything when every axis is off", () => {
    expect(applyExerciseFilters([ex()], EMPTY_EXERCISE_FILTERS)).toHaveLength(1);
  });

  it("creator: any reviewed source's handle, exact", () => {
    const two = ex({ sources: [source("@a"), source("@b")] });
    expect(applyExerciseFilters([two], f({ creators: ["@b"] }))).toHaveLength(1);
    expect(applyExerciseFilters([two], f({ creators: ["@c"] }))).toHaveLength(0);
  });

  it("muscle: primary only", () => {
    expect(applyExerciseFilters([ex()], f({ muscles: ["Glutes"] }))).toHaveLength(1);
    expect(applyExerciseFilters([ex()], f({ muscles: ["Hamstrings"] }))).toHaveLength(0);
  });

  it("equipment: direct match on the exercise's own list", () => {
    expect(applyExerciseFilters([ex()], f({ equipment: ["Kettlebell"] }))).toHaveLength(1);
    expect(applyExerciseFilters([ex()], f({ equipment: ["Dumbbell"] }))).toHaveLength(0);
    expect(applyExerciseFilters([ex({ equipmentTypes: ["Bodyweight"] })], f({ equipment: ["Bodyweight"] }))).toHaveLength(1);
  });

  it("goal type", () => {
    expect(applyExerciseFilters([ex()], f({ goalTypes: ["Strength"] }))).toHaveLength(1);
    expect(applyExerciseFilters([ex()], f({ goalTypes: ["Mobility"] }))).toHaveLength(0);
  });

  it("skill: exact; an unrated exercise never matches", () => {
    expect(applyExerciseFilters([ex()], f({ skills: ["Intermediate"] }))).toHaveLength(1);
    expect(applyExerciseFilters([ex()], f({ skills: ["Beginner"] }))).toHaveLength(0);
    expect(applyExerciseFilters([ex({ skillLevel: null })], f({ skills: ["Intermediate"] }))).toHaveLength(0);
  });

  it("picture: has / missing on set, null and empty URLs", () => {
    const blank = ex({ id: "blank", imageUrl: null });
    const empty = ex({ id: "empty", imageUrl: "" });
    const all = [ex(), blank, empty];
    expect(ids(applyExerciseFilters(all, f({ picture: "has" })))).toEqual(["e-1"]);
    expect(ids(applyExerciseFilters(all, f({ picture: "missing" })))).toEqual(["blank", "empty"]);
  });

  it("OR within an axis, AND across axes", () => {
    const a = ex({ id: "a", equipmentTypes: ["Kettlebell"] });
    const b = ex({ id: "b", equipmentTypes: ["Dumbbell"], goalTypes: ["Mobility"] });
    expect(ids(applyExerciseFilters([a, b], f({ equipment: ["Kettlebell", "Dumbbell"] })))).toEqual(["a", "b"]);
    expect(ids(applyExerciseFilters([a, b], f({ equipment: ["Kettlebell", "Dumbbell"], goalTypes: ["Mobility"] })))).toEqual(["b"]);
  });
});

describe("applyExerciseFiltersAndSearch", () => {
  it("search on name or handle, after filters", () => {
    const a = ex({ id: "a", name: "Goblet Squat", sources: [source("@kb_guy")] });
    const b = ex({ id: "b", name: "Swing", sources: [source("@other")] });
    expect(ids(applyExerciseFiltersAndSearch([a, b], EMPTY_EXERCISE_FILTERS, "goblet"))).toEqual(["a"]);
    expect(ids(applyExerciseFiltersAndSearch([a, b], EMPTY_EXERCISE_FILTERS, "KB_GUY"))).toEqual(["a"]);
    expect(ids(applyExerciseFiltersAndSearch([a, b], f({ goalTypes: ["Mobility"] }), "swing"))).toEqual([]);
    expect(ids(applyExerciseFiltersAndSearch([a, b], EMPTY_EXERCISE_FILTERS, "  "))).toEqual(["a", "b"]);
  });
});

describe("chips", () => {
  it("counts one per value, one for a set picture", () => {
    expect(countActiveExerciseFilters(EMPTY_EXERCISE_FILTERS)).toBe(0);
    expect(countActiveExerciseFilters(f({ creators: ["@a"], equipment: ["Kettlebell", "Bar"], picture: "missing" }))).toBe(4);
  });

  it("lists chips in sheet order with equipment labels and picture wording", () => {
    const chips = activeExerciseFilterChips(f({
      picture: "missing", skills: ["Beginner"], goalTypes: ["Strength"], equipment: ["Bar"], muscles: ["Chest"], creators: ["@a"],
    }));
    expect(chips.map((c) => `${c.axis}:${c.label}`)).toEqual([
      "creators:@a", "muscles:Chest", "equipment:Pull-up bar", "goalTypes:Strength", "skills:Beginner", "picture:No picture",
    ]);
  });

  it("collapses a fully selected muscle group into one chip", () => {
    const core = ["Core", "Obliques", "Lower Back"];
    const chips = activeExerciseFilterChips(f({ muscles: [...core, "Chest"] }));
    expect(chips.map((c) => c.label)).toEqual(["Core group", "Chest"]);
    expect(chips[0].values).toEqual(core);
  });

  it("removeExerciseChip drops the chip's values; picture goes back to any", () => {
    const start = f({ muscles: ["Core", "Obliques", "Lower Back", "Chest"], picture: "has" });
    const [group, , pic] = activeExerciseFilterChips(start);
    expect(removeExerciseChip(start, group).muscles).toEqual(["Chest"]);
    expect(removeExerciseChip(start, pic).picture).toBe("any");
  });

  it("clearExerciseAxis switches one axis off with a fresh array", () => {
    const cleared = clearExerciseAxis(f({ equipment: ["Bar"], picture: "has" }), "equipment");
    expect(cleared.equipment).toEqual([]);
    expect(cleared.picture).toBe("has");
    expect(cleared.equipment).not.toBe(EMPTY_EXERCISE_FILTERS.equipment);
    expect(clearExerciseAxis(f({ picture: "has" }), "picture").picture).toBe("any");
  });
});

describe("mostRestrictiveExerciseAxis", () => {
  const a = ex({ id: "a", equipmentTypes: ["Kettlebell"], goalTypes: ["Strength"], skillLevel: "Beginner" });
  const b = ex({ id: "b", equipmentTypes: ["Dumbbell"], goalTypes: ["Strength"], skillLevel: "Beginner" });
  const c = ex({ id: "c", equipmentTypes: ["Dumbbell"], goalTypes: ["Mobility"], skillLevel: "Advanced" });

  it("names the axis whose clearing brings back the most", () => {
    // equipment=Kettlebell AND goalTypes=Mobility → nothing. Clearing equipment → c (1); clearing goalTypes → a (1). Tie → lower axis wins: goalTypes.
    const r = mostRestrictiveExerciseAxis([a, b, c], f({ equipment: ["Kettlebell"], goalTypes: ["Mobility"] }), "");
    expect(r).toEqual({ axis: "goalTypes", label: "Mobility", count: 1 });
  });

  it("prefers the larger rescue", () => {
    const r = mostRestrictiveExerciseAxis([a, b, c], f({ equipment: ["Dumbbell"], skills: ["Intermediate"] }), "");
    expect(r?.axis).toBe("skills");
    expect(r?.count).toBe(2);
  });

  it("is null when no single clearing helps", () => {
    expect(mostRestrictiveExerciseAxis([a, b, c], f({ equipment: ["Bar"], goalTypes: ["Skill"] }), "")).toBeNull();
  });

  it("respects the search", () => {
    expect(mostRestrictiveExerciseAxis([a, b, c], f({ equipment: ["Bar"] }), "zzz")).toBeNull();
  });
});

describe("catalog vocab", () => {
  it("exerciseCreatorCounts: most exercises first, then A–Z", () => {
    const list = [
      ex({ id: "1", sources: [source("@b")] }),
      ex({ id: "2", sources: [source("@a"), source("@b")] }),
      ex({ id: "3", sources: [source("@c")] }),
    ];
    expect(exerciseCreatorCounts(list)).toEqual([
      { handle: "@b", count: 2 }, { handle: "@a", count: 1 }, { handle: "@c", count: 1 },
    ]);
  });

  it("catalogEquipmentNames: grid order first, then A–Z, surfaces dropped", () => {
    const list = [
      ex({ id: "1", equipmentTypes: ["Floor", "Trap Bar", "Dumbbell"] }),
      ex({ id: "2", equipmentTypes: ["Kettlebell", "Wall", "Landmine"] }),
    ];
    expect(catalogEquipmentNames(list)).toEqual([
      { name: "Kettlebell", label: "Kettlebell" },
      { name: "Dumbbell", label: "Dumbbell" },
      { name: "Landmine", label: "Landmine" },
      { name: "Trap Bar", label: "Trap Bar" },
    ]);
  });

  it("catalogGoalTypes: distinct, A–Z", () => {
    const list = [ex({ id: "1", goalTypes: ["Strength", "MetCon"] }), ex({ id: "2", goalTypes: ["MetCon"] })];
    expect(catalogGoalTypes(list)).toEqual(["MetCon", "Strength"]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest src/lib/__tests__/exerciseFilters.test.ts`
Expected: FAIL, "Cannot find module '../exerciseFilters'".

- [ ] **Step 3: Write the library**

```ts
// mobile/src/lib/exerciseFilters.ts
// Client-side filtering of the captured exercise catalog. The whole catalog
// is one query's result, so every axis runs here — instantly, offline,
// testable. Spec §5: AND across axes, OR within an axis; an off axis passes
// everything; a null skill never matches a skill that is on.
import type { CatalogEntry } from "../types/capture";
import type { ExerciseFilters } from "../types/exerciseFilters";
import { EMPTY_EXERCISE_FILTERS, PICTURE_LABELS } from "../types/exerciseFilters";
import type { FilterChip } from "./filterChips";
import { MUSCLE_GROUPS } from "./dailyCoverage";
import { EQUIPMENT_GRID, equipmentLabel } from "./workoutEquipment";

/** Not equipment: what the movement is done on. Same list workoutEquipment keeps. */
const SUPPORT_SURFACES = new Set(["Floor", "Wall"]);

const hasPicture = (e: CatalogEntry): boolean => !!e.imageUrl && e.imageUrl.trim() !== "";

function passes(e: CatalogEntry, f: ExerciseFilters): boolean {
  if (f.creators.length > 0) {
    if (!e.sources.some((s) => s.posterHandle !== null && f.creators.includes(s.posterHandle))) return false;
  }
  if (f.muscles.length > 0) {
    if (!e.muscles.some((m) => m.isPrimary && f.muscles.includes(m.name))) return false;
  }
  if (f.equipment.length > 0) {
    if (!e.equipmentTypes.some((n) => f.equipment.includes(n))) return false;
  }
  if (f.goalTypes.length > 0) {
    if (!e.goalTypes.some((g) => f.goalTypes.includes(g))) return false;
  }
  if (f.skills.length > 0) {
    if (e.skillLevel === null || !f.skills.includes(e.skillLevel)) return false;
  }
  if (f.picture === "has" && !hasPicture(e)) return false;
  if (f.picture === "missing" && hasPicture(e)) return false;
  return true;
}

export function applyExerciseFilters(entries: CatalogEntry[], f: ExerciseFilters): CatalogEntry[] {
  return entries.filter((e) => passes(e, f));
}

/** Filters, then the header search — the order the tab uses. Search is a
 *  case-insensitive substring on the name or any source handle. */
export function applyExerciseFiltersAndSearch(
  entries: CatalogEntry[], f: ExerciseFilters, search: string,
): CatalogEntry[] {
  const q = search.trim().toLowerCase();
  const filtered = applyExerciseFilters(entries, f);
  if (!q) return filtered;
  return filtered.filter((e) =>
    e.name.toLowerCase().includes(q) ||
    e.sources.some((s) => s.posterHandle?.toLowerCase().includes(q)),
  );
}

/** What the Filters chip's badge shows. */
export function countActiveExerciseFilters(f: ExerciseFilters): number {
  return (
    f.creators.length + f.muscles.length + f.equipment.length + f.goalTypes.length + f.skills.length +
    (f.picture !== "any" ? 1 : 0)
  );
}

export type ExerciseFilterAxis = keyof ExerciseFilters;
export type ExerciseFilterChip = FilterChip<ExerciseFilterAxis>;

/** Chips in sheet order: creator, muscle, equipment, type, skill, picture.
 *  A fully selected muscle group becomes one "<Group> group" chip. */
export function activeExerciseFilterChips(f: ExerciseFilters): ExerciseFilterChip[] {
  const chips: ExerciseFilterChip[] = [];
  for (const c of f.creators) chips.push({ axis: "creators", label: c, values: [c] });

  const remaining = new Set(f.muscles);
  for (const g of MUSCLE_GROUPS) {
    if (g.muscles.length > 1 && g.muscles.every((m) => remaining.has(m))) {
      chips.push({ axis: "muscles", label: `${g.title} group`, values: [...g.muscles] });
      for (const m of g.muscles) remaining.delete(m);
    }
  }
  for (const m of f.muscles) if (remaining.has(m)) chips.push({ axis: "muscles", label: m, values: [m] });

  for (const e of f.equipment) chips.push({ axis: "equipment", label: equipmentLabel(e), values: [e] });
  for (const g of f.goalTypes) chips.push({ axis: "goalTypes", label: g, values: [g] });
  for (const s of f.skills) chips.push({ axis: "skills", label: s, values: [s] });
  if (f.picture !== "any") chips.push({ axis: "picture", label: PICTURE_LABELS[f.picture], values: [f.picture] });
  return chips;
}

/** The filters with one chip's values taken away. */
export function removeExerciseChip(f: ExerciseFilters, chip: ExerciseFilterChip): ExerciseFilters {
  if (chip.axis === "picture") return { ...f, picture: "any" };
  const list = f[chip.axis] as string[];
  return { ...f, [chip.axis]: list.filter((v) => !chip.values.includes(v)) };
}

/** The filters with one whole axis switched off. Fresh arrays, not the
 *  EMPTY constant's own, because the result can land in React state. */
export function clearExerciseAxis(f: ExerciseFilters, axis: ExerciseFilterAxis): ExerciseFilters {
  const empty = EMPTY_EXERCISE_FILTERS[axis];
  return { ...f, [axis]: Array.isArray(empty) ? [...empty] : empty } as ExerciseFilters;
}

/** Sheet order, top to bottom. Ties in mostRestrictiveExerciseAxis go to the
 *  axis furthest DOWN this list. */
const AXIS_ORDER: ExerciseFilterAxis[] = ["creators", "muscles", "equipment", "goalTypes", "skills", "picture"];

function axisLabel(f: ExerciseFilters, axis: ExerciseFilterAxis): string {
  const labels = activeExerciseFilterChips(f).filter((c) => c.axis === axis).map((c) => c.label);
  return labels.length > 0 ? labels.join(" + ") : axis;
}

export interface RestrictiveExerciseAxis {
  axis: ExerciseFilterAxis;
  label: string;
  /** How many exercises the list would show with this axis cleared. */
  count: number;
}

/** When the list is empty: which single axis, if cleared, brings back the
 *  most exercises. Null when no single clearing brings back any. */
export function mostRestrictiveExerciseAxis(
  entries: CatalogEntry[], f: ExerciseFilters, search: string,
): RestrictiveExerciseAxis | null {
  let best: RestrictiveExerciseAxis | null = null;
  for (const axis of AXIS_ORDER) {
    const isOn = axis === "picture" ? f.picture !== "any" : (f[axis] as string[]).length > 0;
    if (!isOn) continue;
    const count = applyExerciseFiltersAndSearch(entries, clearExerciseAxis(f, axis), search).length;
    if (count > 0 && (best === null || count >= best.count)) {
      best = { axis, label: axisLabel(f, axis), count };
    }
  }
  return best;
}

/** Handles present in the catalog, most exercises first, then A–Z. An
 *  exercise captured twice from the same handle counts once for it. */
export function exerciseCreatorCounts(entries: CatalogEntry[]): { handle: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const e of entries) {
    const handles = new Set(e.sources.map((s) => s.posterHandle).filter((h): h is string => !!h));
    for (const h of handles) tally.set(h, (tally.get(h) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([handle, count]) => ({ handle, count }))
    .sort((a, b) => b.count - a.count || a.handle.localeCompare(b.handle));
}

const GRID_INDEX = new Map(EQUIPMENT_GRID.map((e, i) => [e.name, i]));

/** Tiles for the equipment grid: every name the catalog carries, the fixed
 *  grid's order first and then A–Z, surfaces never offered. */
export function catalogEquipmentNames(entries: CatalogEntry[]): { name: string; label: string }[] {
  const names = new Set<string>();
  for (const e of entries) for (const n of e.equipmentTypes) if (!SUPPORT_SURFACES.has(n)) names.add(n);
  return [...names]
    .sort((a, b) => {
      const ia = GRID_INDEX.get(a);
      const ib = GRID_INDEX.get(b);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return a.localeCompare(b);
    })
    .map((name) => ({ name, label: equipmentLabel(name) }));
}

/** Distinct goal-type names in the catalog, A–Z. */
export function catalogGoalTypes(entries: CatalogEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => e.goalTypes))].filter(Boolean).sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/lib/__tests__/exerciseFilters.test.ts`
Expected: PASS, every test. If `catalogEquipmentNames` fails on label text, check `EQUIPMENT_GRID` in `workoutEquipment.ts`: "Bar" is labelled "Pull-up bar" there and that is what the chip test expects.

- [ ] **Step 5: Typecheck, commit**

Run: `npx tsc --noEmit -p .` → nothing.
```bash
git add src/lib/exerciseFilters.ts src/lib/__tests__/exerciseFilters.test.ts
git commit -m "feat(exercises): pure filter, chip, rescue and vocabulary helpers"
```

---

### Task 10: `exerciseSort.ts` (TDD)

**Files:**
- Create: `mobile/src/lib/__tests__/exerciseSort.test.ts`
- Create: `mobile/src/lib/exerciseSort.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/exerciseSort.test.ts
import { sortExercises } from "../exerciseSort";
import type { CatalogEntry } from "../../types/capture";

const e = (id: string, name: string, capturedAt: string): CatalogEntry => ({
  exerciseId: id, name, imageUrl: null, skillLevel: null, equipmentTypes: [], muscles: [], goalTypes: [],
  sources: [{ sourceId: `s-${id}`, platform: "instagram", sourceUrl: "https://x", posterHandle: null, thumbnailUrl: null, capturedAt }],
});
const ids = (list: CatalogEntry[]) => list.map((x) => x.exerciseId);

describe("sortExercises", () => {
  const a = e("a", "Zeta", "2026-09-03T00:00:00Z");
  const b = e("b", "alpha", "2026-09-01T00:00:00Z");
  const c = e("c", "Mid", "2026-09-02T00:00:00.000+00:00");
  const list = [b, c, a];

  it("captured_desc / captured_asc compare instants, not strings", () => {
    expect(ids(sortExercises(list, "captured_desc"))).toEqual(["a", "c", "b"]);
    expect(ids(sortExercises(list, "captured_asc"))).toEqual(["b", "c", "a"]);
  });

  it("name: case-insensitive, ties newest first", () => {
    const tie1 = e("t1", "Swing", "2026-09-01T00:00:00Z");
    const tie2 = e("t2", "swing", "2026-09-05T00:00:00Z");
    expect(ids(sortExercises([a, b, c, tie1, tie2], "name"))).toEqual(["b", "c", "t2", "t1", "a"]);
  });

  it("an unparseable stamp sorts last both ways", () => {
    const bad = e("bad", "Bad", "not a date");
    expect(ids(sortExercises([bad, a, b], "captured_desc"))).toEqual(["a", "b", "bad"]);
    expect(ids(sortExercises([bad, a, b], "captured_asc"))).toEqual(["b", "a", "bad"]);
  });

  it("sorts a copy", () => {
    const input = [b, a];
    sortExercises(input, "captured_desc");
    expect(ids(input)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest src/lib/__tests__/exerciseSort.test.ts`
Expected: FAIL, "Cannot find module '../exerciseSort'".

- [ ] **Step 3: Write the sort**

```ts
// mobile/src/lib/exerciseSort.ts
// The three orders of the Exercises tab. Pure; sorts a copy. Spec §5.
import type { CatalogEntry } from "../types/capture";
import type { ExerciseSort } from "../types/exerciseFilters";

type Cmp = (a: CatalogEntry, b: CatalogEntry) => number;

/** fetchCatalog puts the newest source first, so sources[0] is the capture
 *  the tab orders by. Compared as instants: Postgres may write "+00:00" or
 *  "Z" for the same moment. Unparseable → null → last either way. */
const capturedMs = (e: CatalogEntry): number | null => {
  const stamp = e.sources[0]?.capturedAt;
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : ms;
};

const byCaptured = (dir: 1 | -1): Cmp => (a, b) => {
  const ma = capturedMs(a);
  const mb = capturedMs(b);
  if (ma === null && mb === null) return 0;
  if (ma === null) return 1;
  if (mb === null) return -1;
  return (ma - mb) * dir;
};
const capturedDesc: Cmp = byCaptured(-1);
const capturedAsc: Cmp = byCaptured(1);
const name: Cmp = (a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || capturedDesc(a, b);

const CMP: Record<ExerciseSort, Cmp> = { captured_desc: capturedDesc, captured_asc: capturedAsc, name };

export function sortExercises(entries: CatalogEntry[], sort: ExerciseSort): CatalogEntry[] {
  return [...entries].sort(CMP[sort]);
}
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx jest src/lib/__tests__/exerciseSort.test.ts && npx tsc --noEmit -p .` → PASS; nothing from tsc.
```bash
git add src/lib/exerciseSort.ts src/lib/__tests__/exerciseSort.test.ts
git commit -m "feat(exercises): three sort orders"
```

---

### Task 11: `exerciseFilterStore.ts` (TDD)

**Files:**
- Create: `mobile/src/lib/__tests__/exerciseFilterStore.test.ts`
- Create: `mobile/src/lib/exerciseFilterStore.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/exerciseFilterStore.test.ts
const mockMemory = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockMemory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockMemory.set(k, v); }),
  },
}));

import { loadExercisePrefs, saveExercisePrefs, exercisePrefsKey, sanitizeExercisePrefs } from "../exerciseFilterStore";
import { prefsKey as workoutPrefsKey } from "../workoutFilterStore";
import { EMPTY_EXERCISE_FILTERS, DEFAULT_EXERCISE_SORT } from "../../types/exerciseFilters";

beforeEach(() => mockMemory.clear());

describe("exerciseFilterStore", () => {
  it("round-trips per user", async () => {
    const filters = { ...EMPTY_EXERCISE_FILTERS, equipment: ["Kettlebell"], picture: "missing" as const };
    await saveExercisePrefs("u1", { filters, sort: "name" });
    expect(await loadExercisePrefs("u1")).toEqual({ filters, sort: "name" });
    expect(await loadExercisePrefs("u2")).toEqual({ filters: EMPTY_EXERCISE_FILTERS, sort: DEFAULT_EXERCISE_SORT });
  });

  it("keys by user, and never shares a key with the Workouts tab", () => {
    expect(exercisePrefsKey("u1")).toBe("training.exercises.filters.v1:u1");
    expect(exercisePrefsKey("u1")).not.toBe(workoutPrefsKey("u1"));
  });

  it("drops unknown skill, picture and sort but keeps free-text values", () => {
    expect(sanitizeExercisePrefs({
      filters: { creators: ["@gone"], muscles: ["Chest", 7], equipment: ["Laser"], goalTypes: ["Strength"], skills: ["Advanced", "God"], picture: "blurry" },
      sort: "random",
    })).toEqual({
      filters: { creators: ["@gone"], muscles: ["Chest"], equipment: ["Laser"], goalTypes: ["Strength"], skills: ["Advanced"], picture: "any" },
      sort: DEFAULT_EXERCISE_SORT,
    });
  });

  it("falls back to defaults on garbage", async () => {
    mockMemory.set(exercisePrefsKey("u1"), "{not json");
    expect(await loadExercisePrefs("u1")).toEqual({ filters: EMPTY_EXERCISE_FILTERS, sort: DEFAULT_EXERCISE_SORT });
    expect(sanitizeExercisePrefs(null)).toEqual({ filters: EMPTY_EXERCISE_FILTERS, sort: DEFAULT_EXERCISE_SORT });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest src/lib/__tests__/exerciseFilterStore.test.ts`
Expected: FAIL, "Cannot find module '../exerciseFilterStore'".

- [ ] **Step 3: Write the store**

```ts
// mobile/src/lib/exerciseFilterStore.ts
// Last-used filters and sort for the Exercises tab, per user. Its own key,
// so the Workouts and Exercises tabs never share a filter set. Spec §7.
import type { ExerciseFilters, ExerciseSort } from "../types/exerciseFilters";
import {
  EMPTY_EXERCISE_FILTERS, DEFAULT_EXERCISE_SORT, ALL_EXERCISE_SORTS, ALL_PICTURE_FILTERS,
} from "../types/exerciseFilters";
import { ALL_SKILLS } from "../types/skillLevel";
import { createPrefsStore } from "./filterPrefsStore";

export interface ExercisePrefs {
  filters: ExerciseFilters;
  sort: ExerciseSort;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
const manyOf = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  strings(v).filter((x): x is T => (allowed as readonly string[]).includes(x));

/** Coerce whatever was stored into a valid preference set. Free-text axes
 *  (a creator, a muscle, an equipment or goal-type name) are kept as-is: a
 *  value the catalog no longer has simply matches nothing and its chip
 *  stays removable. Closed enums are checked. */
export function sanitizeExercisePrefs(raw: unknown): ExercisePrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (r.filters && typeof r.filters === "object" ? r.filters : {}) as Record<string, unknown>;
  const filters: ExerciseFilters = {
    creators: strings(f.creators),
    muscles: strings(f.muscles),
    equipment: strings(f.equipment),
    goalTypes: strings(f.goalTypes),
    skills: manyOf(f.skills, ALL_SKILLS),
    picture: oneOf(f.picture, ALL_PICTURE_FILTERS) ?? "any",
  };
  return { filters, sort: oneOf(r.sort, ALL_EXERCISE_SORTS) ?? DEFAULT_EXERCISE_SORT };
}

const store = createPrefsStore<ExercisePrefs>({
  keyPrefix: "training.exercises.filters.v1",
  defaults: { filters: EMPTY_EXERCISE_FILTERS, sort: DEFAULT_EXERCISE_SORT },
  sanitize: sanitizeExercisePrefs,
});

export const exercisePrefsKey = store.key;
export const loadExercisePrefs = store.load;
export const saveExercisePrefs = store.save;
```

- [ ] **Step 4: Run, typecheck, commit**

Run: `npx jest src/lib/__tests__/exerciseFilterStore.test.ts && npx tsc --noEmit -p .` → PASS; nothing.
```bash
git add src/lib/exerciseFilterStore.ts src/lib/__tests__/exerciseFilterStore.test.ts
git commit -m "feat(exercises): remembered filters and sort under their own key"
```

---

### Task 12: `ExerciseFiltersSheet`

**Files:**
- Create: `mobile/src/components/training/daily/ExerciseFiltersSheet.tsx`

- [ ] **Step 1: Write the sheet**

```tsx
// mobile/src/components/training/daily/ExerciseFiltersSheet.tsx
// The Exercises tab's filter sheet: the Workouts sheet's frame and blocks
// with the axes an exercise actually has. Draft lives here, copied from the
// applied filters on open; Show applies it, closing discards it.
import React, { useEffect, useMemo, useState } from "react";
import type { ExerciseFilters, PictureFilter } from "@/src/types/exerciseFilters";
import { EMPTY_EXERCISE_FILTERS, PICTURE_LABELS } from "@/src/types/exerciseFilters";
import type { SkillLevel } from "@/src/types/skillLevel";
import { ALL_SKILLS } from "@/src/types/skillLevel";
import type { CreatorAvatarMap } from "@/src/lib/supabase/creators";
import { MuscleGroupPicker } from "./MuscleGroupPicker";
import { CreatorPicker } from "./CreatorPicker";
import { FilterSheetFrame, FilterSection } from "./filterSheet/FilterSheetFrame";
import { FilterRow } from "./filterSheet/FilterRow";
import { FilterPill, FilterPillRow, toggleIn } from "./filterSheet/FilterPills";
import { FilterSegmented } from "./filterSheet/FilterSegmented";
import { EquipmentGrid } from "./filterSheet/EquipmentGrid";

interface ExerciseFiltersSheetProps {
  visible: boolean;
  applied: ExerciseFilters;
  creators: { handle: string; count: number }[];
  /** Keyed by normalised handle. */
  avatars: CreatorAvatarMap;
  /** Live count for a draft, including the header search. */
  countFor: (draft: ExerciseFilters) => number;
  /** Every equipment name the catalog carries, in grid order. */
  equipmentTiles: { name: string; label: string }[];
  /** Names at least one exercise uses right now; the rest draw dimmed. */
  availableEquipment: Set<string>;
  /** Goal-type names present in the catalog, A–Z. */
  goalTypes: string[];
  onApply: (next: ExerciseFilters) => void;
  onClose: () => void;
}

type Page = "root" | "muscles" | "creators";

export function ExerciseFiltersSheet({
  visible, applied, creators, avatars, countFor, equipmentTiles, availableEquipment, goalTypes, onApply, onClose,
}: ExerciseFiltersSheetProps) {
  const [draft, setDraft] = useState<ExerciseFilters>(applied);
  const [page, setPage] = useState<Page>("root");
  // `applied` must be referentially stable while the sheet is open: a new
  // identity here discards the draft. The tab only replaces it through
  // applyFilters, which cannot run while this modal is up.
  useEffect(() => {
    if (visible) { setDraft(applied); setPage("root"); }
  }, [visible, applied]);

  const count = useMemo(() => countFor(draft), [countFor, draft]);
  const musclesValue = draft.muscles.length === 0 ? null : draft.muscles.join(", ");
  const creatorsValue = draft.creators.length === 0 ? null : draft.creators.join(", ");

  const pushed =
    page === "muscles" ? (
      <MuscleGroupPicker selected={draft.muscles}
        subline="Matches an exercise’s primary muscles. Pick as many as you like."
        onChange={(muscles) => setDraft((d) => ({ ...d, muscles }))}
        onBack={() => setPage("root")} />
    ) : page === "creators" ? (
      <CreatorPicker creators={creators} avatars={avatars} selected={draft.creators}
        onChange={(c) => setDraft((d) => ({ ...d, creators: c }))}
        onBack={() => setPage("root")} />
    ) : null;

  return (
    <FilterSheetFrame
      visible={visible}
      pushed={pushed}
      onClose={onClose}
      onRequestClose={() => (page === "root" ? onClose() : setPage("root"))}
      onReset={() => setDraft(EMPTY_EXERCISE_FILTERS)}
      ctaLabel={`Show ${count} ${count === 1 ? "exercise" : "exercises"}`}
      onCta={() => { onApply(draft); onClose(); }}
    >
      <FilterRow label="Creator" value={creatorsValue} placeholder="Any creator" first
        onPress={() => setPage("creators")} />
      <FilterRow label="Muscle group" value={musclesValue} placeholder="Any muscle"
        onPress={() => setPage("muscles")} />

      <FilterSection title="Equipment" hint="The exercise’s own equipment" />
      <EquipmentGrid tiles={equipmentTiles} selected={draft.equipment} available={availableEquipment}
        dimHint="No captured exercise uses this yet"
        onToggle={(name) => setDraft((d) => ({ ...d, equipment: toggleIn(d.equipment, name) }))} />

      <FilterSection title="Type" />
      <FilterPillRow>
        {goalTypes.map((g) => (
          <FilterPill key={g} label={g} on={draft.goalTypes.includes(g)}
            onPress={() => setDraft((d) => ({ ...d, goalTypes: toggleIn(d.goalTypes, g) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Skill" />
      <FilterPillRow>
        {ALL_SKILLS.map((s: SkillLevel) => (
          <FilterPill key={s} label={s} on={draft.skills.includes(s)}
            onPress={() => setDraft((d) => ({ ...d, skills: toggleIn(d.skills, s) }))} />
        ))}
      </FilterPillRow>

      <FilterSection title="Picture" />
      <FilterSegmented<PictureFilter>
        options={[{ value: "any", label: "Any" }, { value: "has", label: PICTURE_LABELS.has }, { value: "missing", label: PICTURE_LABELS.missing }]}
        value={draft.picture}
        onPick={(v) => setDraft((d) => ({ ...d, picture: v }))} />
    </FilterSheetFrame>
  );
}
```

- [ ] **Step 2: Typecheck, commit**

Run: `npx tsc --noEmit -p .` → nothing.
```bash
git add src/components/training/daily/ExerciseFiltersSheet.tsx
git commit -m "feat(exercises): filter sheet built from the shared blocks"
```

---

### Task 13: Rewrite `CatalogTab` and delete the old rails

**Files:**
- Modify: `mobile/src/components/training/daily/CatalogTab.tsx` (full rewrite)
- Delete: `mobile/src/lib/catalogFilter.ts`, `mobile/src/lib/__tests__/catalogFilter.test.ts`
- Modify: `mobile/src/types/capture.ts` (remove `CatalogFilters`)

- [ ] **Step 1: Rewrite the tab**

Replace the entire file with:

```tsx
// mobile/src/components/training/daily/CatalogTab.tsx
// The captured Exercises tab: the Workouts rail-and-sheet over the exercise
// catalog. Spec: docs/superpowers/specs/2026-09-10-exercises-tab-filters-design.md
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { AlertCircle, ChevronRight } from "lucide-react-native";
import { colors } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { fetchCatalog } from "@/src/lib/supabase/capture";
import { fetchPendingReviewCount } from "@/src/lib/supabase/matchReviews";
import { fetchCreators } from "@/src/lib/supabase/creators";
import type { CreatorAvatarMap } from "@/src/lib/supabase/creators";
import {
  applyExerciseFiltersAndSearch, activeExerciseFilterChips, countActiveExerciseFilters,
  removeExerciseChip, clearExerciseAxis, mostRestrictiveExerciseAxis,
  exerciseCreatorCounts, catalogEquipmentNames, catalogGoalTypes,
} from "@/src/lib/exerciseFilters";
import { sortExercises } from "@/src/lib/exerciseSort";
import { loadExercisePrefs, saveExercisePrefs } from "@/src/lib/exerciseFilterStore";
import {
  EMPTY_EXERCISE_FILTERS, DEFAULT_EXERCISE_SORT, EXERCISE_SORT_LABELS, EXERCISE_SORT_GROUPS,
} from "@/src/types/exerciseFilters";
import type { ExerciseFilters, ExerciseSort } from "@/src/types/exerciseFilters";
import { CaptureFab } from "./CaptureFab";
import { MatchReviewSheet } from "./MatchReviewSheet";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import { SwipeableCatalogCard } from "./SwipeableCatalogCard";
import { FilterRail } from "./FilterRail";
import { SortSheet } from "./SortSheet";
import { ExerciseFiltersSheet } from "./ExerciseFiltersSheet";
import type { CatalogEntry } from "@/src/types/capture";

interface CatalogTabProps {
  searchQuery: string;
  onCountUpdate: (count: number) => void;
}

/** "a", "a and b", "a, b and c" — labels verbatim. */
const listed = (items: string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export default function CatalogTab({ searchQuery, onCountUpdate }: CatalogTabProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [avatars, setAvatars] = useState<CreatorAvatarMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<ExerciseFilters>(EMPTY_EXERCISE_FILTERS);
  const [sort, setSort] = useState<ExerciseSort>(DEFAULT_EXERCISE_SORT);
  // Prefs are read before the first list paint so the list does not flash
  // from unfiltered to filtered (spec §7). The ref remembers WHOSE prefs are
  // loaded, so a different user signing in on a surviving tab gets their own.
  const prefsFor = useRef<string | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The match-review queue's entry point: captures park unmatched names in
  // exercise_match_reviews, and this banner is where they get resolved.
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingReviews, setPendingReviews] = useState(0);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    if (prefsFor.current !== user.id) {
      prefsFor.current = user.id;
      const prefs = await loadExercisePrefs(user.id);
      setFilters(prefs.filters);
      setSort(prefs.sort);
      setPrefsReady(true);
    }
    // Creators ride along: the picker is decoration on the list, and a
    // missing map just means letters.
    const [list, pending, faces] = await Promise.all([
      fetchCatalog(user.id),
      fetchPendingReviewCount(user.id),
      fetchCreators(),
    ]);
    setEntries(list);
    setPendingReviews(pending);
    setAvatars(faces);
    onCountUpdate(list.length);
    setLoading(false);
  }, [onCountUpdate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const applyFilters = useCallback((next: ExerciseFilters) => {
    setFilters(next);
    if (userId) saveExercisePrefs(userId, { filters: next, sort });
  }, [userId, sort]);

  const applySort = useCallback((next: ExerciseSort) => {
    setSort(next);
    if (userId) saveExercisePrefs(userId, { filters, sort: next });
  }, [userId, filters]);

  const filtered = useMemo(
    () => sortExercises(applyExerciseFiltersAndSearch(entries, filters, searchQuery), sort),
    [entries, filters, searchQuery, sort],
  );

  const chips = useMemo(() => activeExerciseFilterChips(filters), [filters]);
  const activeCount = countActiveExerciseFilters(filters);
  const creators = useMemo(() => exerciseCreatorCounts(entries), [entries]);
  const equipmentTiles = useMemo(() => catalogEquipmentNames(entries), [entries]);
  const availableEquipment = useMemo(() => new Set(equipmentTiles.map((t) => t.name)), [equipmentTiles]);
  const goalTypes = useMemo(() => catalogGoalTypes(entries), [entries]);
  // The sheet's live "Show N" count: the draft, composed with the header
  // search exactly as the applied list is.
  const countFor = useCallback(
    (draft: ExerciseFilters) => applyExerciseFiltersAndSearch(entries, draft, searchQuery).length,
    [entries, searchQuery],
  );

  // Only when the list is empty because of us, not because the catalog is.
  const rescue = useMemo(
    () => (entries.length > 0 && filtered.length === 0 && activeCount > 0
      ? mostRestrictiveExerciseAxis(entries, filters, searchQuery)
      : null),
    [entries, filtered.length, activeCount, filters, searchQuery],
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* The rail waits with the list: a sort or filter tapped before the
          remembered ones arrive would be overwritten by them. */}
      {prefsReady && !loading && (
        <FilterRail
          sortLabel={EXERCISE_SORT_LABELS[sort]}
          onOpenSort={() => setSortOpen(true)}
          activeCount={chips.length}
          onOpenFilters={() => setFiltersOpen(true)}
          chips={chips}
          onRemoveChip={(chip) => applyFilters(removeExerciseChip(filters, chip))}
          onClearAll={() => applyFilters(EMPTY_EXERCISE_FILTERS)}
          shown={filtered.length}
          total={entries.length}
          noun={["exercise", "exercises"]}
        />
      )}

      {pendingReviews > 0 && !loading && (
        <TouchableOpacity
          style={styles.reviewBanner}
          onPress={() => setReviewSheetOpen(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${pendingReviews} captured names need review`}
        >
          <AlertCircle size={16} color={colors.brand} />
          <Text style={styles.reviewBannerText}>
            {pendingReviews === 1
              ? "1 captured name needs review"
              : `${pendingReviews} captured names need review`}
          </Text>
          <ChevronRight size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {loading || !prefsReady ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        // The wrapper is what the indicator floats against, so a pull draws
        // it over the list and not over the rail. iOS never draws
        // RefreshControl's own spinner.
        <View style={styles.listWrap}>
        <RefreshIndicator visible={refreshing} />
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.exerciseId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={colors.brand} colors={[colors.brand]} />
          }
          renderItem={({ item }) => (
            <SwipeableCatalogCard
              entry={item}
              onPress={() =>
                router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
              }
              onDeleted={load}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              {entries.length === 0 ? (
                <>
                  <Text style={styles.emptyTitle}>Nothing captured yet</Text>
                  <Text style={styles.emptyText}>
                    See an exercise on Instagram or TikTok? Paste its link here with the + button.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Nothing matches</Text>
                  <Text style={styles.emptyText}>
                    {activeCount > 0
                      ? `No exercise matches all of ${listed([
                          ...chips.map((c) => c.label),
                          ...(searchQuery.trim() ? [`“${searchQuery.trim()}”`] : []),
                        ])}.`
                      : "Change the search."}
                  </Text>
                  {rescue && (
                    <TouchableOpacity style={styles.rescue} onPress={() => applyFilters(clearExerciseAxis(filters, rescue.axis))}
                      accessibilityRole="button">
                      <Text style={styles.rescueText}>
                        Drop “{rescue.label}” · {rescue.count} {rescue.count === 1 ? "exercise" : "exercises"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {activeCount > 0 && (
                    <TouchableOpacity style={styles.rescueGhost} onPress={() => applyFilters(EMPTY_EXERCISE_FILTERS)}
                      accessibilityRole="button">
                      <Text style={styles.rescueGhostText}>Clear all filters</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          }
        />
        </View>
      )}

      <SortSheet visible={sortOpen} value={sort} groups={EXERCISE_SORT_GROUPS} labels={EXERCISE_SORT_LABELS}
        onSelect={applySort} onClose={() => setSortOpen(false)} />

      <ExerciseFiltersSheet
        visible={filtersOpen}
        applied={filters}
        creators={creators}
        avatars={avatars}
        countFor={countFor}
        equipmentTiles={equipmentTiles}
        availableEquipment={availableEquipment}
        goalTypes={goalTypes}
        onApply={applyFilters}
        onClose={() => setFiltersOpen(false)}
      />

      <CaptureFab onSaved={load} />

      <MatchReviewSheet
        visible={reviewSheetOpen}
        userId={userId}
        onClose={() => setReviewSheetOpen(false)}
        onResolved={load}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  reviewBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.surface2, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  reviewBannerText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  // The card's own gap lives on its swipe container, so `gap` here would
  // double it.
  listWrap: { flex: 1 },
  listContent: { padding: 16 },
  empty: { padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  rescue: {
    marginTop: 16, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 8, alignSelf: "stretch",
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
  },
  rescueText: { fontSize: 15, fontWeight: "600", color: colors.onBrand, textAlign: "center" },
  rescueGhost: { marginTop: 4, height: 36, alignItems: "center", justifyContent: "center" },
  rescueGhostText: { fontSize: 14, color: colors.textMuted },
});
```

- [ ] **Step 2: Delete the old rail filter and its type**

Run: `git rm src/lib/catalogFilter.ts src/lib/__tests__/catalogFilter.test.ts`

In `mobile/src/types/capture.ts`, delete the whole `CatalogFilters` interface (the block starting `export interface CatalogFilters {` through its closing `}`), and any comment line directly above it that only describes it.

- [ ] **Step 3: Typecheck and full suite**

Run: `npx tsc --noEmit -p . && npx jest && grep -rn "catalogFilter\b\|CatalogFilters\|WorkoutsRail" src app; echo "grep exit $?"`
Expected: nothing from tsc; all suites PASS; the grep prints no matches (exit 1).

- [ ] **Step 4: Commit**

```bash
git add -A src/components/training/daily/CatalogTab.tsx src/lib/catalogFilter.ts src/lib/__tests__/catalogFilter.test.ts src/types/capture.ts
git commit -m "feat(exercises): rail, sort and filter sheet replace the stacked pill rails"
```

---

### Task 14: Device verification and spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-exercises-tab-filters-design.md` (Status line)

- [ ] **Step 1: Run the app on the isolated simulator**

Boot `FitTracker-walk3` (UDID `883E9323-DFCB-4B68-BE22-A0A45836206F`; it has the dev client installed and is signed in). Start Metro from `mobile/` with `npx expo start --dev-client --port 8097 --clear` in the background, then `xcrun simctl openurl 883E9323-DFCB-4B68-BE22-A0A45836206F "fittracker-local://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8097"` and tap Open at device points (275, 473) with idb. Drive with `idb ui tap` and `xcrun simctl io <udid> screenshot`.

- [ ] **Step 2: Walk the spec's manual list**

Training › fire button › Exercises. Confirm, with a screenshot for each:
1. No stacked rails; rail shows "Newest captured" and "Filters"; count line "N exercises".
2. Sort sheet: three orders; pick "Name A–Z", list reorders, chip label updates.
3. Filter sheet: Creator page, Muscle page (sub-line says "exercise"), Equipment grid with catalog names (no Floor tile), Type pills, Skill pills, Picture segmented, "Show N exercises" at the end of the scroll.
4. Apply "No picture": only empty-square rows remain; chip "No picture"; count line "x of N exercises".
5. Remove the chip from the rail; count returns.
6. Combine Kettlebell + Advanced into an empty result; "Nothing matches" with a Drop button; tap it.
7. Leave the tab (Today) and come back: filters and sort intact.
8. Workouts tab: rail, sort sheet and filter sheet look and behave as before.

- [ ] **Step 3: Mark the spec**

Change the spec's `**Status:**` line to `**Status:** Implemented and device-verified 2026-09-10 (plan: docs/superpowers/plans/2026-09-10-exercises-tab-filters.md)`.

- [ ] **Step 4: Commit and push**

```bash
git add docs/superpowers/specs/2026-09-10-exercises-tab-filters-design.md
git commit -m "docs(exercises): filters spec marked device-verified"
git push origin main
```

Stop Metro and shut the simulator down afterwards.
