# Workouts Tab Filters & Sort — Design Spec

**Date:** 2026-09-10
**Status:** Implemented and device-verified 2026-09-10 on branch `workouts-tab-filters` (plan: docs/superpowers/plans/2026-09-10-workouts-tab-filters.md)
**Surface:** Training › Daily mode › Workouts tab (`mobile/src/components/training/daily/WorkoutsTab.tsx`)
**Visual reference:** Approved mockup artifact, Option A frames A1–A7 — https://claude.ai/code/artifact/e7af83a5-3d87-4ef7-9fba-7c0ca4dd5ac4. Where prose and mockup disagree, this spec wins.

## 1. Problem

The Workouts tab lists every captured workout with one text search and a three-chip rail (Newest, Not done in a while, Never done). With 48 workouts and growing, that is not enough to find anything by intent. There is no way to narrow by creator, muscle group, equipment, workout type, or intensity; no way to combine criteria ("kettlebell, upper body, moderate"); and the sort is a single alternate order rather than a real control.

Five of the six requested axes already have data. Every captured workout carries block roles, primary/secondary muscles, estimated minutes, intensity, and skill level (AI-classified at capture, user-editable), plus the creator handle on its source. The gap is equipment, which lives on each movement's catalog exercise rather than on the workout.

## 2. Goals / non-goals

**Goals**
- Filter captured workouts by creator, muscle group, equipment, workout type, intensity, length, skill, and history, combined freely, with a live result count.
- A granular sort, separate from filtering, with eight orders.
- Filters and sort survive leaving and returning to the tab.
- All filtering and sorting is pure, client-side, and unit-tested, in the same doctrine as `workoutFilter.ts` and `catalogFilter.ts`.

**Non-goals**
- No named or saved filter presets.
- No new database columns or backfills. Equipment is derived at read time.
- No change to the Exercises (Catalog) tab, the Strength-mode Workouts tab, or the header search field's behaviour beyond composing with filters. Adopting this rail-and-sheet on the Exercises tab is a later, separate piece of work.
- No change to how workouts are classified or edited.

## 3. Decisions (user-approved 2026-09-10)

1. **Option A** from the mockup: a rail with a sort chip and a Filters button, one bottom sheet holding every axis, the muscle grid and creator list as pushed pages inside that sheet, and active filters shown as removable chips above the list.
2. **Muscle matching is primary-only.** A workout matches Chest only if Chest is one of its primary muscles.
3. **Equipment is a majority rule.** A workout matches Kettlebell when more than half of its resolved movements require a kettlebell. Bodyweight matches only when every movement is bodyweight. A pull-up bar is equipment, so a workout of pull-ups is not a bodyweight workout.
4. **Filters are remembered, last-used only.** No presets.
5. **Sort offers:** Newest captured (default), Oldest captured; Last done, Not done in a while, Most done; Name A–Z, Shortest, Longest.
6. **"Never done" leaves the rail** and becomes the History axis inside the sheet (Any / Never done / Done before).
7. **Length and Skill ride along** as bonus axes because the data is already there.
8. **Search stays in the header** and narrows whatever the filters produce.

## 4. Experience

All frames are in the approved artifact. Summary of each:

**A1 — At rest.** Under the tab band: a rail with the sort chip on the left ("Newest" with a caret) and the Filters chip on the right. Beneath it a count line ("48 workouts"). Cards gain two things: a muted equipment tag after the type tags (the workout's dominant equipment, or "Bodyweight"), and a history phrase in the meta line ("Never done", "Done 12 days ago") drawn from the existing completion map. The capture FAB and swipe-to-delete are unchanged.

**A2 — Sort sheet.** Tapping the sort chip opens a bottom sheet titled "Sort by" with the eight orders in three labelled groups (Captured / History / Workout). Single choice; tapping an order applies it and closes the sheet. Two orders carry a one-line sub-label: Last done ("Most recently trained first") and Not done in a while ("Never-done workouts rise to the top").

**A3 — Filter sheet.** Tapping Filters opens a page-sheet titled "Filters" with a close control on the left and Reset on the right. Content, in order:
- **Creator** row → pushes A5. Value text shows "Any creator" or the selected handles.
- **Muscle group** row → pushes A4. Value text shows selected regions in brand green.
- **Equipment** — a 4-column icon grid, multi-select. Section header carries the hint "Most of the movements".
- **Workout type** — pills: Warmup, Mobility, Main, Conditioning, Cooldown. Multi-select.
- **Intensity** — segmented: Any / Low / Moderate / High. Single choice.
- **Length** — pills: ≤ 15 min, 15–30, 30–45, 45+. Multi-select.
- **Skill** — pills: Beginner, Intermediate, Advanced. Multi-select.
- **History** — segmented: Any / Never done / Done before. Single choice.
- A brand button at the **end of the scroll** reading "Show N workouts", where N is the live count for the draft filter set combined with the current header search. It is never pinned. Tapping it applies the draft and closes the sheet. Closing the sheet without tapping it discards the draft.

**A4 — Muscle group page.** Title "Muscle groups", back control on the left, Done on the right. Sub-line: "Matches a workout's primary muscles. Pick as many as you like." Then four groups, each with a section header and a "Select all" link that toggles to "Clear" when every region in the group is selected: Upper body (Chest, Upper Back, Shoulders, Lats, Biceps, Triceps, Forearms / Grip, Neck / Traps), Core (Core, Obliques, Lower Back), Lower body (Quads, Hamstrings, Glutes, Calves, Hip Flexors, Hip Abductors, Hip Adductors), Whole body (Full Body). Each tile is the existing `BodyFigure` (front view, or back view for back-only regions) with the region filled brand green when selected and muted grey otherwise, over a label. Three columns. Selected tiles take the brand tint fill and brand border. Done returns to A3 with the draft updated.

**A5 — Creator page.** Title "Creator", back control, Done. A find field ("Find a creator") that filters the list as you type. Rows: an initial avatar, the handle, a workout count, a checkbox. Ordered by count descending, then handle. Multi-select. Done returns to A3.

**A6 — Combined result.** With filters applied the rail's Filters chip takes the selected style with a count badge; beneath the rail a horizontal, scrollable row of active-filter chips, one per selected value (e.g. "Kettlebell", "Upper body", "Moderate", "@onlinewod"), each with a remove glyph that drops just that value; the count line reads "7 of 48 workouts" with a "Clear all" link on the right. A muscle group selected via "Select all" collapses to one chip named for the group ("Upper body"); removing it removes all its regions. Sort chip shows the current order's name.

**A7 — Nothing matches.** When filters (with or without search) empty the list, the empty state's title is "Nothing matches" and its body names the active filters in a sentence. Beneath it, a brand button offers to drop the single most restrictive filter, labelled with the count that would restore ("Drop 'Cooldown' · 3 workouts"), followed by a quiet "Clear all filters" action. The most restrictive filter is the one axis whose removal yields the largest result; ties go to the axis furthest down the sheet order. If removing any one axis still yields zero, only "Clear all filters" is shown. The existing "No workouts captured yet" empty state is unchanged when the library itself is empty.

Sheets come up from the bottom, per the app's picker rule. The filter sheet is a `pageSheet` modal (as `SetupSheet` uses); the sort sheet is a shorter bottom sheet. A4 and A5 are pushed inside the filter sheet's own stack, not new root modals.

## 5. Filter model and matching rules

```ts
// mobile/src/types/workoutFilters.ts
export interface WorkoutFilters {
  creators: string[];          // posterHandle values, exact
  muscles: string[];           // muscle_regions.name values
  equipment: string[];         // equipment.name values, plus "Bodyweight"
  blockRoles: BlockRole[];     // warmup | mobility | main | conditioning | cooldown
  intensity: WorkoutIntensity | null;
  lengths: LengthBand[];       // "short" | "medium" | "long" | "xlong"
  skills: ("Beginner" | "Intermediate" | "Advanced")[];
  history: "any" | "never" | "done";
}
export type WorkoutSort =
  | "captured_desc" | "captured_asc"
  | "last_done" | "stale" | "most_done"
  | "name" | "shortest" | "longest";
```

A workout passes when it passes **every** axis (AND across axes). Within an axis with a list, a workout passes when it matches **any** selected value (OR). An empty list or `null`/`"any"` means the axis is off. Search from the header is applied after filters using the existing `filterWorkouts`.

| Axis | Match rule |
|---|---|
| Creator | `source.posterHandle` equals a selected handle. Workouts with no source or handle never match a creator filter. |
| Muscle group | Some `tags.muscles` entry with `isPrimary === true` has a selected name. "Full Body" matches only workouts tagged Full Body as primary; it is not a wildcard. |
| Equipment | See §5.1. |
| Workout type | `tags.blockRoles` intersects the selection. |
| Intensity | `tags.intensity === selected`. Unclassified (`null`) never matches when the axis is on. |
| Length | `tags.estMinutes` falls in a selected band: short ≤ 15, medium 16–30, long 31–45, xlong > 45. `null` never matches when the axis is on. |
| Skill | `tags.skillLevel` is in the selection. `null` never matches when the axis is on. |
| History | `never`: no entry in the completion map. `done`: an entry exists. |

The rule "unclassified never matches an active axis" mirrors `catalogFilter`'s skill rule: an untagged workout is untagged, not "any intensity", and it stays visible only while that axis is off.

### 5.1 Equipment derivation

Equipment is not stored on workouts. It is derived per workout at load time from its resolved movements and cached on the entry as `derivedEquipment: string[]` (the names that pass the majority rule) plus `isBodyweight: boolean`.

Per movement, its equipment set is `equipmentNamesOf(exercise)` (junction rows, else the core's default string), with the support surfaces **Floor** and **Wall** removed. Those are where a movement happens, not what it needs; a floor push-up is a bodyweight movement. Everything else counts, including Bar (pull-up bar), Bench, Box, Rings, Parallettes, GHD, and Jump Rope. A movement whose set is then empty, or is exactly `{Bodyweight}`, is a bodyweight movement.

For a workout with `n` resolved movements (pending review items are ignored):
- `derivedEquipment` contains equipment name `E` when the number of movements whose set includes `E` is strictly greater than `n / 2`.
- `isBodyweight` is true when `n > 0` and every movement is a bodyweight movement.
- A workout with `n = 0` has no derived equipment and is not bodyweight.

The Equipment axis matches when any selected name is in `derivedEquipment`, or when "Bodyweight" is selected and `isBodyweight` is true. The card's equipment tag shows the first `derivedEquipment` entry by the equipment table's display order, or "Bodyweight", or nothing.

The Equipment grid in A3 shows the fixed, ordered set: Kettlebell, Dumbbell, Barbell, Bodyweight, Bands, Bar (labelled "Pull-up bar"), Box, Jump Rope, Bench, Sled, Cable, Machine, Rings, Med Ball, Bike, Rower (all live `equipment.name` values; "Wall Ball" was dropped because it is not one). Names that no workout in the library currently derives are shown dimmed but still tappable, so the grid is stable and learnable. "Bands" maps to the equipment names Band and Resistance Band if both exist; the plan verifies the live names before wiring.

### 5.2 Sort definitions

| Sort | Order | Ties |
|---|---|---|
| captured_desc | `capturedAt` descending (today's default) | — |
| captured_asc | `capturedAt` ascending | — |
| last_done | `lastCompleted` descending; never-done workouts at the end | captured_desc |
| stale | existing `sortByStaleness` (never-done first, then oldest `lastCompleted` first) | existing |
| most_done | completion `count` descending; never-done at the end | last_done |
| name | `name` ascending, locale-aware, case-insensitive | captured_desc |
| shortest | `estMinutes` ascending; `null` at the end | captured_desc |
| longest | `estMinutes` descending; `null` at the end | captured_desc |

Sort applies after filters and search.

## 6. Architecture

Pure logic in `src/lib`, reads in `src/lib/supabase`, pixels in components. New files:

| File | Responsibility |
|---|---|
| `src/types/workoutFilters.ts` | `WorkoutFilters`, `WorkoutSort`, `LengthBand`, `EMPTY_FILTERS`, `DEFAULT_SORT`. |
| `src/lib/workoutEquipment.ts` | `deriveWorkoutEquipment(items) → { derivedEquipment, isBodyweight }`; the support-surface exclusion list; the fixed grid order. |
| `src/lib/workoutFilters.ts` | `applyWorkoutFilters(entries, filters, completions)`, `countActiveFilters(filters)`, `activeFilterChips(filters)` (with the group-collapse rule), `mostRestrictiveAxis(entries, filters, completions, search)`, `creatorCounts(entries)`. |
| `src/lib/workoutSort.ts` | `sortWorkouts(entries, sort, completions, today)`; reuses `sortByStaleness`. |
| `src/lib/workoutFilterStore.ts` | Load/save `{ filters, sort }` under one AsyncStorage key, `training.workouts.filters.v1`, scoped by user id. Validates on load; any malformed or unknown value falls back to defaults rather than throwing. |
| `src/components/training/daily/WorkoutsRail.tsx` | Sort chip, Filters chip with badge, active-chip row, count line. |
| `src/components/training/daily/SortSheet.tsx` | A2. |
| `src/components/training/daily/WorkoutFiltersSheet.tsx` | A3, owning the draft state and the inner navigation to A4/A5. |
| `src/components/training/daily/MuscleGroupPicker.tsx` | A4; renders `BodyFigure` per tile. |
| `src/components/training/daily/CreatorPicker.tsx` | A5. |

Changed files:
- `WorkoutsTab.tsx` — replaces the three-chip rail with `WorkoutsRail`; holds applied `filters` and `sort`; loads them from the store on mount and saves on every change; computes `filtered = sort(search(filter(entries)))`; passes the empty-state variant.
- `src/lib/supabase/capture.ts` — `fetchCapturedWorkouts` selects each item's exercise equipment (`core_default_equipment` and `equipment_rows:exercise_equipment(equipment(name))`) and `toCapturedWorkoutEntry` calls `deriveWorkoutEquipment`. `CapturedWorkoutEntry` gains `derivedEquipment: string[]` and `isBodyweight: boolean`. `fetchCapturedWorkout` (single) gets the same select so the type stays honest.
- `SwipeableWorkoutCard.tsx` (or the card it wraps) — adds the equipment tag and the history phrase using the existing completion-label helper.
- `dailyCoverage.ts` — the muscle group lists for A4 are exported from one place (`MUSCLE_GROUPS`) so the picker and any future group logic share the vocabulary. `TRAINABLE_MUSCLES` is unchanged.

`BodyFigure` is reused as-is; the picker passes a `fillFor` that returns brand green for the tile's region and a muted fill for the rest, and sets `width` small. No changes to the figure.

The `WhenSheet` rule applies: sheets, never inline pickers. Reset/Done/Show controls sit at the end of their scroll, never pinned.

## 7. State and persistence

- Applied state lives in `WorkoutsTab`; draft state lives in `WorkoutFiltersSheet` and is copied from applied on open.
- On any applied change, save to AsyncStorage. On mount, load before the first render of the rail so the list does not flash from unfiltered to filtered; while loading, render the list unfiltered with the rail disabled for one frame at most.
- The stored key is per user (`${userId}`), so a sign-out/sign-in as someone else does not inherit filters.
- The header search is not persisted; that matches today's behaviour.
- `onCountUpdate` continues to report the **total** library size to the tab badge (48), not the filtered count. The filtered count lives in the count line.

## 8. Error handling

- A workout whose exercise rows fail to join still renders; it derives no equipment and never matches an equipment filter.
- A stored filter set naming a creator, muscle, or equipment that no longer exists in the library is kept as-is (it simply matches nothing) and its chip is still removable, so the user can see why the list is short.
- A stored sort value not in the enum falls back to `captured_desc`.
- Store read/write failures log and fall back to defaults; the tab never fails to render because of a preference.

## 9. Testing

Unit tests, all pure, in `src/lib/__tests__`:
- `workoutEquipment.test.ts` — majority strictly greater than half (2 of 4 is not a match, 3 of 4 is); Floor/Wall ignored; Bar counts; bodyweight requires every movement; empty item list; pending items ignored.
- `workoutFilters.test.ts` — each axis alone; AND across axes; OR within an axis; primary-only muscle rule; Full Body is not a wildcard; unclassified never matches an active axis; history never/done; `countActiveFilters`; chip collapse for a fully selected group; `mostRestrictiveAxis` picks the axis whose removal restores the most and returns null when no single removal helps.
- `workoutSort.test.ts` — every order and its tie-break; nulls at the end for shortest/longest; never-done placement for last_done and most_done.
- `workoutFilterStore.test.ts` — round trip; malformed JSON; unknown enum values; user scoping.

Component tests are not required; the on-device walk is the acceptance test, per the approved-mock rule (build exactly A1–A7, propose deviations in chat).

## 10. Rollout

One branch, merged straight to main. No migration, no edge-function change, no dev-client rebuild (pure JS). Backfill is not needed because equipment is derived at read time.

Suggested phase order for the plan: (1) types, equipment derivation, filter and sort libs with tests; (2) fetch changes and card tags; (3) rail, sort sheet, persistence; (4) filter sheet with equipment grid and inline axes; (5) muscle and creator pages; (6) empty state and chip collapse; (7) device walk against A1–A7.
