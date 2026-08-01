# Goals Restructure — Design

**Date:** 2026-08-01
**Branch:** `worktree-goals-restructure` (off `main`)
**Approved by:** Brian (brainstorming session, 2026-08-01)

## Problem

The Goals page (`mobile/src/components/profile/GoalsScreen.tsx`) conflates
three kinds of data:

1. **Goals** — targets the user is working toward (weight, calories, macros,
   water).
2. **Static personal facts** — height, which is not a goal.
3. **Tracking settings** — meal times, water pace window, water display unit,
   "only water counts" — configuration for how tracking behaves, not targets.

It is also entirely pre-style-guide: raw hex colors, hand-rolled buttons and
unit toggles, a bespoke time-picker modal. `docs/STYLE_GUIDE.md` §7 lists
non-nutrition profile screens as adopt-on-touch: any change that touches them
must migrate them.

## Decisions made

| Decision | Choice |
|---|---|
| Branch base | `main` (no `develop` branch exists) |
| Scope | Restructure + light schema. No new tracking domains (sleep stays dropped) |
| Settings home | New **Tracking Settings** profile sub-page |
| Personal info home | Extend existing **ProfileScreen** with a Personal Details card |
| New static fields | `birthdate`, `sex`, `health_notes`. Current weight is **derived** from `weight_logs`, not a column |
| Goals layout | Single scrolling page with `SectionHeader` groups (option A; hub-with-tiles deferred as a possible future evolution) |

## Information architecture

| Destination | Fields |
|---|---|
| **Goals** (restructured) | target weight · calories, protein, carbs, fats, sugars, fiber, sodium · water goal (oz/L entry toggle) · workout water bonus |
| **Tracking Settings** (new) | breakfast/lunch/dinner times · water pace window start/end · water display unit · only-water-counts |
| **Profile → Personal Details** (extended) | height (ft/in) · birthdate · sex · health notes · current weight (read-only, latest `weight_logs` entry) |

ProfileMenu gains one item, **Tracking Settings**, below Nutrition
Preferences. All three screens remain full-screen modals wired through
`mobile/app/(tabs)/profile.tsx`.

## Screen designs

All three screens follow the migrated patterns in
`profile/nutrition/NutritionPreferencesScreen.tsx`: `@/src/theme/tokens`,
`ui/` primitives, the centred-sheet recipe's input styling, labelled
"‹ Profile" back bar retokenized per STYLE_GUIDE rule 5, and
`keyboardShouldPersistTaps="handled"` on scrollers containing inputs
(rule 22).

### Goals

- Title becomes **"Goals"** (no longer just fitness).
- Three `SectionHeader` groups, each above a `Card variant="panel"`:
  - **Body** — target weight (lbs entry, stored kg).
  - **Nutrition** — daily calories, protein, carbs, fats, sugars, fiber,
    sodium.
  - **Hydration** — daily water goal with oz/L segmented entry toggle
    (solid-brand active, rule 21), workout water bonus.
- One primary `Button label="Save Changes"` using the `loading` prop.
- Behavior fix: validation/save failures render an inline `colors.danger`
  message above the save button instead of silent `console.error`.

### Tracking Settings (new)

`mobile/src/components/profile/TrackingSettingsScreen.tsx`.

- **Meal Times** — three time pickers (centred-sheet recipe); validation
  breakfast < lunch < dinner.
- **Water** — pace window start/end pickers (end > start validation),
  display-unit segmented control, only-water-counts `Switch`.
- Own save button writing: `breakfast_time`, `lunch_time`, `dinner_time`,
  `water_window_start`, `water_window_end`, `water_display_unit`,
  `water_only_counts`.
- Time-picker helpers (`formatTimeLabel`, `hhmmFromDate`, `dateFromHhmm`,
  picker modal state) move from GoalsScreen into shared code (see Shared
  helpers).

### Profile — Personal Details

ProfileScreen grows a **Personal Details** card and gains `userId` + save:

- Height (ft/in entry, stored `height_cm`).
- Birthdate — native date picker; display includes computed age.
- Sex — segmented control Male / Female (stores `'male' | 'female'`);
  tapping the selected segment again deselects it and stores null.
- Health notes — multiline `TextInput` → `health_notes`.
- Current weight — read-only, latest `weight_logs` entry for the user;
  no editing here (Track → Weight owns logging).

Whole file migrates to tokens (adopt-on-touch), as does `ProfileMenu.tsx`
(touched to add the menu item).

## Shared helpers

Pure logic extracted to `mobile/src/lib/`:

- `bodyUnits.ts` — `cmToFtIn`, `ftInToCm`, `kgToLbs`, `lbsToKg`, and
  `intOrNull` (moved from GoalsScreen).
- `timeFields.ts` — `formatTimeLabel`, `hhmmFromDate`, `dateFromHhmm`,
  hh:mm ordering validation (moved from GoalsScreen).
- oz↔L conversion: **reuse existing `waterUnits.ts`**
  (`ozToLiters`/`litersToOz`); GoalsScreen's duplicate `OZ_PER_LITER`
  constant is deleted.

New modules get unit tests in `mobile/src/lib/__tests__/` (TDD at
implementation).

## Schema

One additive migration in `supabase/migrations/`:

```sql
ALTER TABLE profiles
  ADD COLUMN birthdate DATE,
  ADD COLUMN sex TEXT CHECK (sex IN ('male', 'female')),
  ADD COLUMN health_notes TEXT;
```

All nullable, no backfill, applied via `npx supabase db push`. The Supabase
client is untyped — column names are hand-verified against the migration;
a green typecheck proves nothing about schema correctness.

## Data flow

`profile.tsx` keeps its single `loadUserData()` with `select("*")`. The
monolithic `formData` splits into per-screen slices passed as `initialData`:

- Goals slice → GoalsScreen (loses height/settings fields).
- Settings slice → TrackingSettingsScreen.
- Personal slice → ProfileScreen (gains height + new fields).

Each modal's save/close triggers a reload (existing NutritionPreferences
pattern). `ModalScreen` union gains `"tracking-settings"`.

## Error handling

- Client-side validation renders inline `colors.danger` text near the save
  button; save stays enabled (validation runs on press).
- Supabase errors surface the same way ("Couldn't save. Try again.") rather
  than console-only.

## Testing & gates

- Unit tests for all extracted helpers (jest, existing 321-test suite must
  stay green).
- Per-file style gates (STYLE_GUIDE §8): no raw hex / `hsl(`, no
  `@/src/lib/colors` import, zero dead style keys.
- Repo-wide: `npm run lint`, `npx tsc --noEmit`, `npm test` in `mobile/`.
- Visual verification on a dedicated simulator instance (unique Metro port).

## Out of scope

- Sleep goals (feature was deliberately dropped; would be its own project).
- Hub-with-tiles Goals layout (possible future evolution of option A).
- Any change to weight logging, calorie math, or the pace coach beyond
  reading the same columns from their new editing homes.
- PRs — solo repo; merge to `main` directly when approved.
