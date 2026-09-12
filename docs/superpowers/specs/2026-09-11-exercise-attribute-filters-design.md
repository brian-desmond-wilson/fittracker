# Exercise Attribute Filters — Design Spec

**Date:** 2026-09-11
**Status:** Approved, not yet built.
**Surface:** The exercise detail page's hero badge and meta row (`mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx`), the Exercises tab filter model (`mobile/src/types/exerciseFilters.ts`, `mobile/src/lib/exerciseFilters.ts`), its filter sheet, the page→tab link seam (`mobile/src/lib/exerciseFilterLink.ts`), and the catalog read that feeds client-side filtering (`mobile/src/lib/supabase/capture.ts`, `mobile/src/types/capture.ts`).
**Companion spec:** `docs/superpowers/specs/2026-09-11-exercise-detail-page-v2-design.md` (§4.1 meta row, §4.4 chip→filtered-tab handoff) — this extends that handoff to the remaining attributes.

## 1. Problem

The exercise page shows five descriptive attributes — a hero rank badge (CORE or TIER n) and a meta row of Category, Goal, Skill and Scored by — but only the muscle, equipment and creator chips lower on the page are tappable. Every one of these attributes answers a browse question the reader plainly has ("show me the other Gymnastics exercises", "the other Tier 1 movements"), and the tab that would answer it can't filter on three of them at all. The result is a page full of dead-looking labels next to a filter sheet that doesn't know most of them.

## 2. Goals / non-goals

**Goals**
- The hero badge and all four meta cells open the Exercises tab filtered to that attribute value, laid on top of the reader's saved filters and shown as removable chips — the exact behaviour muscle/equipment/creator chips already have.
- The Exercises filter sheet gains the axes it lacks (Category, Rank, Scored by) so a filter arriving from the page is also reachable and removable by hand.
- Human-facing behaviour stays consistent with the existing filters: AND across axes, any-of within an axis — with one deliberate, labelled exception (Scored by).

**Non-goals**
- No change to what the attributes mean or how they're stored.
- No new sort options.
- No server-side filtering: the catalog is already one client-side result set and every axis runs there (existing spec §5).
- No filtering on the 50 unranked exercises (they show no badge, so there is nothing to tap).

## 3. Decisions (user-approved 2026-09-11)

1. **Rank is one axis, not two.** Core is tier 0 in the data (48 rows), then Tier 1 (152), Tier 2 (35), Tier 3 (5). The hero badge tap sets a single `tiers` axis: CORE → `[0]`, TIER 2 → `[2]`. In the sheet it is one multi-select — Core, Tier 1, Tier 2, Tier 3 — matched any-of like the other axes.
2. **Scored by matches all-of.** An exercise's Scored-by cell is often compound ("Reps · Load"). Tapping it means "exercises scored the same way as this one", so the exercise must carry **every** named type. This is the lone all-of axis; the sheet labels it ("scored by all selected") so it is not a silent surprise.
3. **Goal and Skill are wiring only.** Both already exist as filter axes (`goalTypes`, `skills`); the meta cells just need to become pressable and route into them. A cell that lists several goals applies all of them (any-of).
4. **On top of saved filters.** Like every existing chip tap (spec §4.4), the value is added to the reader's current saved filters rather than replacing them, and is individually removable.

## 4. Experience

**On the page.** The hero badge and each meta cell become pressable with the same affordance the muscle chips use. Tapping one navigates to the Exercises tab with a single axis value applied:

| Tap | Applies |
|---|---|
| Category "Gymnastics" | `categories: ["Gymnastics"]` |
| Goal "Strength" (or "Strength, Skill") | `goalTypes: [<all goals shown>]` |
| Skill "Intermediate" | `skills: ["Intermediate"]` |
| Scored by "Reps · Load" | `scoringTypes: ["Reps", "Load"]` (all-of) |
| Hero badge CORE | `tiers: [0]` |
| Hero badge TIER 2 | `tiers: [2]` |

A cell that isn't rendered (no category, no scoring types, unranked exercise) is simply not there to tap; nothing new appears.

**On the tab.** The arriving value merges onto saved filters and renders as removable chips exactly like a muscle chip does today. Category and Rank read as any-of; picking Tier 1 and Tier 2 by hand shows both tiers. Scored by reads as all-of; picking Reps and Time shows only exercises scored on both.

**In the sheet.** Three new controls join the existing ones, in this top-to-bottom order: creator, muscle, equipment, **category**, goal, skill, **rank**, **scored by**, picture. Category, Rank and Scored by are multi-select pill rows; Scored by carries a one-line "scored by all selected" hint.

## 5. Filter model

Three axes added to `ExerciseFilters`:

| Axis | Shape | Match rule |
|---|---|---|
| `categories` | `string[]` (movement category name) | any-of; a null category never matches when the axis is on |
| `tiers` | `number[]` (0 = Core, 1–3 = Tier n) | any-of; a null tier (the 50 unranked) never matches when the axis is on |
| `scoringTypes` | `string[]` (scoring type name) | **all-of**: the exercise must include every listed type |

`EMPTY_EXERCISE_FILTERS` gains `categories: []`, `tiers: []`, `scoringTypes: []`. The predicate in `passes()` gains three clauses mirroring the table above — `categories`/`tiers` use `includes`, `scoringTypes` uses `.every(t => e.scoringTypes.includes(t))`. `countActiveExerciseFilters`, `activeExerciseFilterChips`, `removeExerciseChip`, `clearExerciseAxis` and `AXIS_ORDER` all learn the three new axes. Chip labels: the category name; `"Core"` / `"Tier n"` for a tier; the scoring-type name (each removable on its own).

## 6. Data and query

`CatalogEntry` gains `category: string | null`, `tier: number | null`, `scoringTypes: string[]`. The catalog read (`fetchCatalog` in `mobile/src/lib/supabase/capture.ts`) adds to its select:
- `tier` (column; 0 for core movements per the data),
- `movement_category:movement_categories(name)`,
- `scoring_rows:exercise_scoring_types(scoring_type:scoring_types(name))`,

and maps them onto the entry (`tier: row.tier ?? null`, `category: row.movement_category?.name ?? null`, `scoringTypes` = the joined names). Sheet option lists are derived from the loaded entries the same way goal-type options already are: distinct categories A–Z, distinct scoring types A–Z, and a fixed Core / Tier 1–3 list for rank.

## 7. Link seam

`ExerciseFilterLink` widens from `creators | muscles | equipment` to also carry `goalTypes`, `skills`, `categories`, `tiers`, `scoringTypes`. `parseExerciseFilterParam` validates each incoming value against what the model can represent — categories and scoring types against the catalog's known names, tiers against `{0,1,2,3}`, skills against the skill enum — and drops anything unknown, returning null when nothing survives (existing §8 rule). `mergeExerciseFilters` unions each new axis onto the base, fresh arrays. The page's `openFiltered` already takes an `ExerciseFilterLink`; the five taps call it with the values in §4.

## 8. Edge cases

- **Merge tightening Scored by.** Because the tap adds to saved filters and Scored by is all-of, a reader who already has a scoring type saved and taps a differently-scored exercise can land on zero results. This is the documented "on top of saved filters" behaviour; the chips make it visible and each is removable. Accepted, not worked around.
- **Unranked / uncategorised / unscored exercises** never render that control on the page, so they cannot originate a tap; when such an axis is on in the sheet, those rows fail the axis (null never matches), consistent with the existing skill rule.
- **Stale link values** (a category renamed, a junk param) are dropped by parse, opening the tab with no extra filter rather than erroring.

## 9. Testing

- Pure-lib Jest on `passes()`: category any-of, tier any-of, scoring all-of (including the compound case and the near-miss that must fail), null category/tier rejection when the axis is on, and AND across a mix.
- Pure-lib Jest on `mergeExerciseFilters` and `parseExerciseFilterParam` for the new axes: union onto base, unknown-value dropping, empty-after-filter → null.
- Device walk on FitTracker-walk3: on Push-Up (Core, single-scored) and on a Tier / compound-scored exercise, tap each of the five attributes; confirm the tab opens with the right chips, the right rows, and that every chip removes cleanly.

## 10. Out of scope

Sorting by these attributes; filtering the unranked 50 as a group; any server-side query change; editing attributes from the page; changes to the muscle/equipment/creator taps that already work.
