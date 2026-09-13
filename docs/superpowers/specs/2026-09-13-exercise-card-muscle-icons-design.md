# Exercise card redesign + Flaticon muscle icons

**Date:** 2026-09-13
**Decision records:** card layout — Option A in
https://claude.ai/code/artifact/0ff3d560-b9c1-437c-bf21-def8254f227e ;
icon set + card treatment — https://claude.ai/code/artifact/5c0dd5f9-4b4b-40ae-8a15-7e48cd421cdb
(red target as shipped, primary large + secondaries small and dimmed).

## Goal

Make the captured-exercise card (Training › flame › Exercises) scannable at a
glance by replacing its run-on text line with icons, and give the Muscle Groups
picker real anatomical muscle icons. Both use one shared icon set: the
24-icon "Muscles" pack by cube29 on Flaticon.

## Scope

In:
- `SwipeableCatalogCard` — new Option A layout.
- `MuscleGroupPicker` — tiles show the Flaticon icon instead of the body figure.
- A shared `MuscleIcon` component and a name → asset map.
- Licence attribution line in the About screen.

Out (unchanged): the curated Exercises page card (`SwipeableMovementCard`),
`BodyScreen`, `MiniMuscleMap`, `BodyFigure` itself (still used by those), the
exercise detail screen, filters other than the muscle picker.

## Assets

- Folder: `mobile/assets/muscles/`, one PNG per muscle, 512×512, straight from
  the Flaticon pack download (the pack ships SVG + PNG; PNG is used because the
  app has no SVG transformer and `Image` is enough at every size we render —
  56 pt tile @3× = 168 px, 36 pt card icon @3× = 108 px).
- Files are named by a slug of `muscle_regions.name`:

| muscle_regions.name | file | Flaticon id |
|---|---|---|
| Chest | chest.png | 14228745 |
| Shoulders | shoulders.png | 14228735 |
| Triceps | triceps.png | 14228747 |
| Upper Back | upper-back.png | 14228749 |
| Lats | lats.png | 14228764 |
| Biceps | biceps.png | 14228758 |
| Forearms / Grip | forearms-grip.png | 14228752 |
| Neck / Traps | neck-traps.png | 14228737 |
| Core | core.png | 14228733 |
| Obliques | obliques.png | 14228734 |
| Lower Back | lower-back.png | 14228736 |
| Quads | quads.png | 14228739 |
| Hamstrings | hamstrings.png | 14228742 |
| Glutes | glutes.png | 14228740 |
| Calves | calves.png | 14228756 |
| Hip Flexors | hip-flexors.png | 14228754 |
| Hip Abductors | hip-abductors.png | 14228744 |
| Hip Adductors | hip-adductors.png | 14228760 |

- Six pack icons are unused (shins 14228746, rear delts 14228761, lower abs
  14228741, alternates 14228743 / 14228738 / 14228748). Not copied in.
- **Full Body** is a pickable tag, not a muscle, and the pack has no whole-body
  icon: its picker tile keeps the current `BodyFigure` with every region lit.
- Colours stay as shipped (grey-blue body, red target). No recolouring.
- Licence: Flaticon free licence → attribution required. The About screen
  gets one line: "Muscle icons by cube29 – Flaticon".

## Components

### `src/lib/muscleIcons.ts`

```ts
export const MUSCLE_ICONS: Record<string, ImageSourcePropType> = {
  "Chest": require("../../assets/muscles/chest.png"), …
};
export const muscleIcon = (name: string) => MUSCLE_ICONS[name] ?? null;
```
Keys are `muscle_regions.name` verbatim (same vocabulary as
`TRAINABLE_MUSCLES`). A unit test asserts every `TRAINABLE_MUSCLES` entry has
an icon, so a renamed region fails loudly instead of rendering nothing.

### `src/components/ui/MuscleIcon.tsx`

```ts
<MuscleIcon muscle="Chest" size={36} dim />
```
Renders `Image` with `resizeMode="contain"`, `width/height = size`, and
`accessibilityLabel = muscle`. `dim` → `opacity: 0.5` (secondary muscles).
Unknown name → renders nothing (returns `null`) so a stray region name never
shows a broken image.

### `src/components/ui/SkillPill.tsx` (extracted)

The 3-segment skill pill currently inlined in `SwipeableMovementCard` moves
into a shared component, colours from tokens instead of hardcoded hex
(`colors.brand` / `colors.warning` / `colors.danger`, empty segment
`colors.border`). Props: `level: "Beginner" | "Intermediate" | "Advanced"`,
`showLabel?: boolean`. `SwipeableMovementCard` switches to it; behaviour there
is unchanged.

## Muscle Groups picker

In `MuscleGroupPicker`, each tile renders `<MuscleIcon muscle={m} size={56} />`
in place of `<BodyFigure width={46} …>`. Full Body keeps `BodyFigure`
(front view, every region `colors.brand` when on, `colors.textMuted` when off).
Tile chrome, selection state, Select all / Clear, and layout are unchanged.
The tile background note about `surface2` no longer applies to icon tiles;
they stay on `colors.surface` for consistency with the Full Body tile.

## Exercise card (Option A)

`SwipeableCatalogCard` becomes:

```
┌──────────────────────────────────────────────────────┐
│ [thumb 76×76 r12]  Name…………………………………  [TIER 2]     › │
│                    ▮▮▯ Intermediate │ ⌀ ⌐ │ [P][s] Chest │
│                                              Shoulders  │
│                    (Load) (Reps)                         │
└──────────────────────────────────────────────────────┘
```

- **Card:** `padding: 12`, `gap: 12`, row layout, `borderRadius 12`, same
  surface/border as today. Swipe-to-delete unchanged.
- **Thumbnail:** 76×76, `borderRadius: 12`, inset by the card padding
  (matches the curated page). No image → same-size `colors.surface` block so
  rows align.
- **Row 1:** name (`flex: 1`, wraps) + tier badge. Badge rule mirrors the
  curated card: `tier === 0` → green "Core"; `tier` 1–3 → blue "Tier n";
  `null` → no badge. Colours via `tint(colors.brand)` and a new
  `colors.tier = "#3B82F6"` token (the blue the curated card currently
  hardcodes; `SwipeableMovementCard` switches to the token too).
- **Row 2 (rail, wraps):** `SkillPill` with label → divider → equipment glyphs
  (`EquipmentGlyph`, size 18, one per `equipmentTypes` entry) → divider →
  muscle cluster: primary `MuscleIcon size 36`, then each secondary
  `MuscleIcon size 26 dim`, then a two-line label (primary name bold on line
  one; secondaries comma-joined, muted, on line two). Dividers are 1×18
  `colors.border` bars. Any empty part (no skill, no equipment, no muscles)
  is omitted along with its divider.
- **Row 3:** score chips, one per `scoringTypes` entry (Reps / Load / Time /
  other — Lucide `Hash`, `Weight`, `Timer`, fallback `Target`; label = the
  value). No scoring types → row omitted. **No creator on the card** (Brian,
  2026-09-13): attribution belongs to the exercise page, not the list.
- **Chevron:** unchanged, right edge, vertically centred.
- Primary muscle = first `muscles[]` entry with `isPrimary`; secondaries = the
  rest (non-primary, in order). Several primaries: the first is the large
  icon, the others join the secondary set so nothing is lost.

All data is already on `CatalogEntry` (`skillLevel`, `equipmentTypes`,
`muscles`, `tier`, `scoringTypes`, `sources`). No schema or query changes.

## Testing

- Unit: `muscleIcons` covers all `TRAINABLE_MUSCLES`; `MuscleIcon` returns
  `null` for an unknown name; `SkillPill` renders 1/2/3 filled segments.
- Render: `SwipeableCatalogCard` with a full entry, a bare entry (no skill /
  equipment / muscles / scores / source) and a `tier: 0` entry.
- Device: walk3 sim — captured Exercises list (long names wrap, cards align,
  swipe-delete still works), Muscle Groups picker (all 18 icons + Full Body,
  select / Select all), About screen credit line.

## Changed during build (2026-09-13)

Deviations from the sections above, all kept deliberately:

- **Icon map split in two.** Jest here is pure TypeScript, so
  `src/lib/muscleIconCatalog.ts` (name → slug, tested against
  `TRAINABLE_MUSCLES` and the PNG folder) replaces the planned single
  `muscleIcons.ts`; `src/components/ui/muscleIconAssets.ts` holds the
  `require()`s, keyed by the slug union so a missing picture is a compile error.
- **`MuscleIcon` is decorative** (`accessible={false}`), not labelled — its name
  is always printed beside it on both screens, so a label would double-speak.
- **Picker tiles render at 56 pt**, and the Full Body figure is drawn at width
  34 so its height matches the icon tiles.
- **Creator removed from the card** after the first device look — Brian
  didn't want it there. (For the record: handles in `sources[].posterHandle`
  already carry the "@"; anything that prints one must not add a second.)
- **Scoring chips** skip the catalogue's "Not Scored / N/A" placeholder row.
- **Card cluster:** at most two secondary icons are drawn (all names still
  listed); the card is top-aligned; the VoiceOver label is composed from the
  card's facts; equipment wraps.
- **`SkillPill`** unlit segments use `tint(colors.text, 0.12)` (the border
  token vanished against a card); an unrecognised level prints in `textMuted`.
- **Testing:** the repo has no React Native render harness, so the planned
  render tests became pure tests on `catalogCardFacts` / `skillFill` /
  `muscleIconCatalog` (8 + 4 + 6 cases) plus the device walk, which covered
  every screen listed above.

## Not doing

- No 3D / rotatable figure, no new muscle art, no changes to how muscles are
  stored or matched, no recolouring to brand green, no touch to the curated
  Exercises page beyond the `SkillPill` extraction.
