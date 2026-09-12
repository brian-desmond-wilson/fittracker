# Exercise Page: Equipment vs. Surface — Design Spec

**Date:** 2026-09-11
**Status:** Approved, not yet built.
**Surface:** The exercise detail page's Equipment section (`mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx`).

## 1. Problem

A bodyweight-on-floor exercise like Push-Up shows "Floor" as an Equipment tile. Floor (and Wall) are support surfaces, not equipment, so this both misrepresents the exercise and lets the reader tap "Floor" to filter by it as equipment — a filter the Exercises sheet deliberately never offers. The page conflates two different things the rest of the app already keeps apart: the codebase has a canonical `SUPPORT_SURFACES` set (`Floor`, `Wall`) in `mobile/src/lib/workoutEquipment.ts`, and the Exercises filter already excludes those from its equipment options. The page just doesn't apply the same distinction.

## 2. Goals / non-goals

**Goals**
- The Equipment section lists real equipment only — never a surface, never bodyweight.
- Surfaces are shown separately, clearly not gear, and are not tappable.
- The page and the Exercises filter agree on what counts as equipment.
- An exercise with no real equipment says so, rather than showing a blank or vanished section.

**Non-goals**
- No new filter axis for surfaces (the sheet still doesn't filter by surface).
- No data/schema change — surfaces already ride in the exercise's equipment names; `SUPPORT_SURFACES` already identifies them.
- No change to how real equipment tiles look or to their tap-to-filter behavior.

## 3. Decision (user-approved 2026-09-11)

Surfaces get their own **"Surface"** section, shown only when the exercise uses one, non-tappable, directly below Equipment, using the same tile look under its own header so it reads as separate from gear. Equipment shows real gear only, and shows an affirmative "No equipment needed" when there is none.

## 4. Experience

For each exercise, the page derives two lists from the exercise's equipment names (`equipmentNamesOf(item)`):
- **Real equipment** — names that are neither a support surface (`SUPPORT_SURFACES`) nor "Bodyweight".
- **Surfaces** — names in `SUPPORT_SURFACES` (Floor, Wall).

**Equipment section** (shown whenever the exercise has loaded):
- With real equipment: the tiles as today — icon + label, each tappable to open the Exercises tab filtered by that equipment.
- With none: a single muted line, "No equipment needed", in place of tiles.

**Surface section** (shown only when the exercise has a surface): header "Surface", then the surface name(s) rendered with the same tile visual (icon + label) but as plain, non-interactive views — no tap, no filter. It sits immediately after the Equipment section.

Worked examples:
- **Push-Up** (Bodyweight, Floor): Equipment → "No equipment needed"; Surface → Floor.
- **Barbell floor press** (Barbell, Floor): Equipment → Barbell (tappable); Surface → Floor.
- **Standing bodyweight move** (Bodyweight only): Equipment → "No equipment needed"; no Surface section.
- **Kettlebell swing** (Kettlebell): Equipment → Kettlebell; no Surface section.

## 5. Rules

- A name is a **surface** iff `SUPPORT_SURFACES.has(name)` (exact match; the set holds `Floor`, `Wall` in the same casing the equipment names use).
- A name is **real equipment** iff it is not a surface and not "Bodyweight" (the existing case-insensitive bodyweight exclusion is kept).
- Surfaces are display-only: no `onPress`, no `openFiltered`, not announced as a button.
- The Equipment section is always present once the exercise loads (so "No equipment needed" can show); the Surface section is conditional on there being a surface.

## 6. Architecture

One file changes: `mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx`.

- Import `SUPPORT_SURFACES` from `@/src/lib/workoutEquipment`.
- Replace the single `equipmentChips` derivation with two: `realEquipment` (not a surface, not bodyweight) and `surfaces` (in `SUPPORT_SURFACES`), both from `equipmentNamesOf(item)`.
- The Equipment block renders `realEquipment` tiles, or a "No equipment needed" muted line when that list is empty; it is no longer gated on a non-empty list.
- A new Surface block renders `surfaces` as non-interactive tiles under a "Surface" header, only when `surfaces.length > 0`. It reuses `getEquipmentIcon` and the existing tile styles (`equipmentContainer`, `equipmentItem`, `equipmentIconContainer`, `equipmentLabel`); the tile is a `View`, not a `TouchableOpacity`.
- One new muted-text style for the empty state (reusing `colors.textMuted`, matching the page's other muted text).

## 7. Testing

- Typecheck: `npx tsc --noEmit` exit 0.
- Device walk on FitTracker-walk3: open Push-Up → Equipment shows "No equipment needed", Surface shows Floor, and Floor is not tappable; open a real-equipment exercise → its equipment tile still opens the filtered Exercises tab; confirm an exercise with equipment + a surface shows both sections, and one with only equipment shows no Surface section.

(No unit test: this is presentational logic in a screen component; the repo's Jest covers pure libs only, and the surface/equipment split reuses already-tested `SUPPORT_SURFACES` and `equipmentNamesOf`.)

## 8. Out of scope

A surface filter axis; changing the equipment icon set; any change to capture/extraction or to how equipment names are stored; the tap-to-filter behavior of real equipment tiles.
