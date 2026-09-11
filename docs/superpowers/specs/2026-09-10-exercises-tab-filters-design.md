# Exercises Tab Filters & Sort — Design Spec

**Date:** 2026-09-10
**Status:** Approved, not yet built
**Surface:** Training › Daily mode › Exercises tab (`mobile/src/components/training/daily/CatalogTab.tsx`)
**Visual reference:** The Workouts tab as shipped from the approved mockup (Option A, frames A1–A7, https://claude.ai/code/artifact/e7af83a5-3d87-4ef7-9fba-7c0ca4dd5ac4) and its spec, `docs/superpowers/specs/2026-09-10-workouts-tab-filters-design.md`. The Exercises tab adopts that design one-for-one, with a shorter axis list. Where this spec and the Workouts spec differ, this spec wins for the Exercises tab only.

## 1. Problem

The Exercises tab filters with five stacked single-value pill rails (Muscle, Equipment, Type, Skill, From). They eat a third of the screen, each rail scrolls sideways past dozens of values, only one value per axis can be on, and there is no sort at all. The Workouts tab next to it has a rail, a sort sheet, a filter sheet and removable chips. The two tabs should feel like one screen with two lists.

## 2. Goals / non-goals

**Goals**
- Replace the stacked rails with the Workouts rail-and-sheet: sort chip, Filters chip, active-filter chips, count line, "Nothing matches" rescue.
- Filter captured exercises by creator, muscle group, equipment, type, skill and picture, combined freely, with a live result count.
- Sort by newest captured, oldest captured, or name.
- Filters and sort survive leaving and returning to the tab, remembered separately from the Workouts tab.
- Reuse the Workouts components rather than copying them.
- All filtering and sorting pure, client-side, unit-tested.

**Non-goals**
- No new database columns, joins, or backfills. Everything filters on fields `fetchCatalog` already returns.
- No change to the exercise cards, swipe-to-delete, the capture FAB, the match-review banner, or the header search's behaviour beyond composing with filters.
- No change to the Workouts tab's behaviour. Its files move or gain props; its screens do not change.
- No history, intensity, length or workout-type axes: an exercise has none of that data.

## 3. Decisions (user-approved 2026-09-10)

1. **Same design as Workouts.** Rail, sort sheet, filter sheet, muscle page, creator page, chips, count line, rescue.
2. **Muscle matching is primary-only.** An exercise matches Core only if Core is one of its primary muscles. Secondary muscles never match.
3. **Sort offers exactly three orders:** Newest captured (default), Oldest captured, Name A–Z.
4. **A Picture axis** lets the user find exercises with no generated picture.
5. **Equipment matches directly.** An exercise matches Kettlebell when Kettlebell is one of its own equipment names. No majority rule.
6. **The Workouts pieces are shared, not forked.** Rail, sort sheet, equipment grid, pill and segmented controls, sheet chrome, muscle page and creator page are one implementation used by both tabs.
7. Filters are remembered last-used only, per user, under the Exercises tab's own key.

## 4. Experience

**At rest.** Under the tab band: the rail with the sort chip left ("Newest captured" with a caret) and the Filters chip right. Beneath it the count line: "207 exercises". Then, when there are pending match reviews, the existing review banner. Then the list, unchanged: picture thumbnail or empty square, name, meta line, creator handle, chevron, swipe-to-delete. The capture FAB is unchanged. The five stacked rails are gone.

**Sort sheet.** Tapping the sort chip opens the bottom sheet titled "Sort by" with one group of three orders: Newest captured, Oldest captured, Name A–Z. Single choice; tapping applies and closes. No sub-labels.

**Filter sheet.** Tapping Filters opens the page-sheet titled "Filters", close control left, Reset right. Content in order:
- **Creator** row → pushes the creator page. Value text "Any creator" or the selected handles.
- **Muscle group** row → pushes the muscle page. Value text in brand green when set. The page's sub-line reads "Matches an exercise's primary muscles. Pick as many as you like."
- **Equipment** — the icon grid, multi-select. Section hint: "The exercise's own equipment". Tiles for every equipment name the catalog carries, in the Workouts grid order first and then A–Z for names outside that grid, with a generic icon for names that have none. Support surfaces (Floor, Wall) are never offered. A tile no exercise uses draws dimmed and stays tappable, as on Workouts.
- **Type** — pills, one per goal type present in the catalog, A–Z (today: MetCon, Mobility, Skill, Strength, Stretching, …). Multi-select.
- **Skill** — pills: Beginner, Intermediate, Advanced. Multi-select. Exact match; an unrated exercise matches no skill pill.
- **Picture** — segmented: Any / Has picture / No picture. Single choice.
- A brand button at the **end of the scroll** reading "Show N exercises", N being the live count for the draft combined with the current header search. Never pinned. Tapping applies the draft and closes. Closing without tapping discards the draft.

**Combined result.** Filters chip takes the selected style with a count badge; a horizontal, scrollable row of active-filter chips beneath the rail, one per selected value, each removable; count line "12 of 207 exercises" with "Clear all" on the right. A fully selected muscle group collapses to one "<Group> group" chip, as on Workouts. The Picture axis shows as "Has picture" or "No picture".

**Nothing matches.** Title "Nothing matches"; body names the active filters and the search term in a sentence; a brand button "Drop 'X' · N exercises" for the single most restrictive axis (largest result when cleared; ties to the axis lowest in the sheet); then a quiet "Clear all filters". When no single clearing brings anything back, only "Clear all filters" shows. The existing "Nothing captured yet" state is unchanged when the catalog itself is empty.

**Search.** Stays in the header; narrows whatever the filters produce, matching name or creator handle as today.

## 5. Filter model and matching rules

```ts
// mobile/src/types/exerciseFilters.ts
export type PictureFilter = "any" | "has" | "missing";

export interface ExerciseFilters {
  creators: string[];     // posterHandle values, exact, any source of the exercise
  muscles: string[];      // muscle_regions.name; matches PRIMARY muscles only
  equipment: string[];    // equipment.name values, exact, on the exercise itself
  goalTypes: string[];    // goal_types.name values
  skills: SkillLevel[];   // Beginner | Intermediate | Advanced
  picture: PictureFilter;
}

export type ExerciseSort = "captured_desc" | "captured_asc" | "name";
```

- Within one axis, values OR: Kettlebell or Dumbbell. Across axes, AND.
- An empty list or `"any"` means the axis is off.
- `creators`: matches when any of the exercise's reviewed sources has that handle.
- `muscles`: matches when any selected region is in the exercise's primary muscles.
- `equipment`: matches when any selected name is in `equipmentTypes`.
- `goalTypes`: matches when any selected name is in `goalTypes`.
- `skills`: matches when `skillLevel` equals a selected level. Null never matches.
- `picture`: `"has"` matches a non-empty `imageUrl`; `"missing"` matches null or empty.
- Search: case-insensitive substring on name or any source handle, applied after filters.
- Sort: `captured_desc` and `captured_asc` compare the newest source's `capturedAt` as instants (unparseable last in both directions); `name` is locale, base-sensitivity, ties broken newest-first.
- `SkillLevel` is the type already exported from `types/workoutFilters.ts`; it moves to a shared home (see §6) rather than being redeclared.

## 6. Architecture

Pure logic in `src/lib`, pixels in components. The Workouts pieces are lifted so both tabs share one copy; nothing is duplicated.

**Lifted (moved or generalised, Workouts behaviour unchanged):**

| Was | Becomes | Change |
|---|---|---|
| `daily/WorkoutsRail.tsx` | `daily/FilterRail.tsx` | Rename. Gains a `noun` prop ("workouts" / "exercises") for the count line. Chip type becomes the generic `FilterChip<Axis extends string>`. |
| `daily/SortSheet.tsx` | same file | Takes `groups`, `labels`, `sublabels` as props instead of importing the Workouts constants. Generic over the sort union. |
| `WorkoutFiltersSheet.tsx` internals: `pill`, `segmented`, header, row, section and CTA styles | `daily/filterSheet/` — `FilterSheetFrame.tsx` (modal + header + Reset + scroll + CTA), `FilterPills.tsx`, `FilterSegmented.tsx`, `FilterRow.tsx`, `EquipmentGrid.tsx` (the icon tiles, `EQUIPMENT_ICONS`, dimming) | Extracted. `WorkoutFiltersSheet` is rewritten on top of them with no visual change. |
| `lib/workoutFilters.ts` `FilterChip`, `removeChip`, `clearAxis` shape | `lib/filterChips.ts` | The chip type and the generic list-axis remove/clear helpers move here; `workoutFilters.ts` re-exports what its callers use. |
| `lib/workoutFilterStore.ts` load/save/sanitise pattern | `lib/filterPrefsStore.ts` | A small factory `createPrefsStore({ key, sanitize, defaults })`; the Workouts store becomes one call to it, same key, same behaviour. |
| `types/workoutFilters.ts` `SkillLevel`, `ALL_SKILLS` | `types/skillLevel.ts` | Moved; the Workouts type file re-exports them. |
| `MuscleGroupPicker` | same | Gains a `subline` prop so the Exercises sheet can say "primary muscles of an exercise". Default is the Workouts copy. |
| `CreatorPicker` | same | No change. |

**New:**

| File | Responsibility |
|---|---|
| `src/types/exerciseFilters.ts` | `ExerciseFilters`, `ExerciseSort`, `PictureFilter`, `EMPTY_EXERCISE_FILTERS`, `DEFAULT_EXERCISE_SORT`, `ALL_EXERCISE_SORTS`, `EXERCISE_SORT_LABELS`, `EXERCISE_SORT_GROUPS`, `PICTURE_LABELS`. |
| `src/lib/exerciseFilters.ts` | `applyExerciseFilters(entries, f)`, `applyExerciseFiltersAndSearch(entries, f, search)`, `countActiveExerciseFilters`, `activeExerciseFilterChips` (with the muscle-group collapse), `removeExerciseChip`, `clearExerciseAxis`, `mostRestrictiveExerciseAxis`, `exerciseCreatorCounts`, `catalogEquipmentNames`, `catalogGoalTypes`. |
| `src/lib/exerciseSort.ts` | `sortExercises(entries, sort)`. |
| `src/lib/exerciseFilterStore.ts` | `createPrefsStore` instance under key `training.exercises.filters.v1:${userId}` with its own sanitiser. |
| `src/components/training/daily/ExerciseFiltersSheet.tsx` | The Exercises sheet: owns the draft, the inner navigation to the muscle and creator pages, and the six sections, built from `filterSheet/`. |

**Changed:**
- `CatalogTab.tsx` — drops the five rails, `axisValues`, `toggle`, and `rail`; holds applied `filters` and `sort`; loads prefs before first rail render; saves on every applied change; computes `filtered = sort(search(filter(entries)))`; renders `FilterRail`, `SortSheet`, `ExerciseFiltersSheet`, and the rescue empty state. `onCountUpdate` still reports the total.
- `src/lib/catalogFilter.ts` and `CatalogFilters` in `types/capture.ts` — deleted along with their test; `exerciseFilters.ts` replaces them.
- `WorkoutsTab.tsx` — imports move to the lifted files; behaviour identical.

Sheets come up from the bottom, never inline. Show/Done/Reset sit at the end of their scroll, never pinned.

## 7. State and persistence

- Applied state lives in `CatalogTab`; draft state lives in `ExerciseFiltersSheet`, copied from applied on open.
- Every applied change saves. On mount, load before the rail's first render so the list never flashes from unfiltered to filtered; the rail and list wait behind the spinner until both prefs and rows have landed, as on Workouts.
- Key is per user. Workouts and Exercises keys differ, so the two tabs never share filters.
- Header search is not persisted.
- The tab badge keeps showing the total catalog size; the filtered count lives in the count line.

## 8. Error handling

- A stored value naming a creator, muscle, equipment or goal type that no longer exists is kept as-is (matches nothing) and its chip stays removable.
- A stored skill or picture value outside the enum is dropped; a stored sort outside the enum falls back to `captured_desc`.
- Store read/write failures log and fall back to defaults; the tab always renders.
- An exercise with no reviewed sources is already excluded by `fetchCatalog`; sort never sees a missing `capturedAt`.

## 9. Testing

Unit tests, pure functions, no React:
- `exerciseFilters.test.ts` — each axis alone; primary-only muscles (a secondary-only match is excluded); OR within an axis, AND across; picture has/missing on null, empty and set URLs; skill exact match with null; search on name and handle composed with filters; chip generation including group collapse and the Picture labels; `removeExerciseChip` and `clearExerciseAxis`; `mostRestrictiveExerciseAxis` picks the largest, ties to the lowest axis, null when nothing rescues; `exerciseCreatorCounts` order; `catalogEquipmentNames` excludes Floor and Wall, grid order first then A–Z.
- `exerciseSort.test.ts` — the three orders; instants not strings; name ties newest-first.
- `exerciseFilterStore.test.ts` — sanitiser drops unknown skills, picture, sort; keeps unknown string values; key includes the user id and differs from the Workouts key.
- `filterPrefsStore.test.ts` — the factory: load falls back on garbage, save swallows failures.
- Existing `workoutFilters`, `workoutSort`, `workoutFilterStore` tests keep passing untouched, proving the lift changed nothing.

Manual, on device: the five rails are gone; sort by each of the three orders; a creator, muscle, equipment, type, skill and picture filter each alone and combined; chips remove; "No picture" lists the blank squares; "Nothing matches" with a rescue; leave the tab and return with filters intact; the Workouts tab looks and behaves exactly as before.

## 10. Out of scope

- A bulk "generate missing pictures" action (the No picture filter is the finder; generation stays one exercise at a time).
- Sorting by usage or last logged.
- Adopting the rail on the Strength-mode Exercises tab.
