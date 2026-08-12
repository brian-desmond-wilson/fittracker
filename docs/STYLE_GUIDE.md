# FitTracker Style Guide

**Source of truth:** `mobile/src/theme/tokens.ts` + `mobile/src/components/ui/`.
**Spec:** `docs/superpowers/specs/2026-08-01-fittracker-style-guide-design.md`.
**Rationale for every rule below:** the "Execution amendments" section of
`docs/superpowers/plans/2026-08-01-fittracker-style-guide.md`. When this guide
and that plan disagree, the plan is the record of what was decided and why —
but this file is what you are expected to have read.

The app is dark-only, flat everywhere except surfaces that float over content
(one elevation step, §2), and has exactly seven UI primitives. No theme
runtime, no provider, no light mode.

---

## 1. The ten rules

1. **No raw color values** (`#hex`, `hsl()`, `rgba()`) outside
   `src/theme/tokens.ts`. Translucent fills come from `tint(color)` (0.15) and
   `tint(color, 0.3)` for the matching border; modal backdrops use
   `colors.scrim`. A different alpha is allowed only when it is *functional*
   and justified in a comment at the call site (`BarcodeScannerModal` dims a
   live camera image with `tint(colors.bg, 0.6)`); the **color** still comes
   from a token.
2. **Domain accents (`colors.accents.*`) are identity only** — title glyphs,
   hub tiles, badges, data fills. Every interactive control (buttons, links,
   spinners, active tabs/segments, toggles) is `colors.brand`. This rule
   governs the four domain accents (meals orange, water blue, inventory violet,
   shopping teal); `warning`/`danger` are semantic tokens and *may* color a
   control where the meaning is real (see rule 12).
3. **Buttons come from `ui/Button` or `ui/IconButton`.** Never hand-roll a
   `TouchableOpacity`-with-a-background. Disabled = the component's opacity 0.5
   (the only dimming mechanism in the system); in-flight = the `loading` prop,
   never a `"Saving…"` label swap. `Button` blocks presses on
   `disabled || loading`, so `disabled` carries only the validity condition.
4. **Surfaces come from `ui/Card`:** `row` (lists, r12, `spacing.md` padding),
   `panel` (insights/modals, r16, `spacing.lg` padding), `tile` (hub, tint
   fill). Border is always `colors.border`. Placement the primitive cannot
   express (margins, `flex: 1`, a grid width) is passed through `Card.style` —
   that is the sanctioned extension point.
5. **Screens:** root = slim chrome bar + 28pt `typography.titleRoot` + accent
   glyph in the body; detail = bordered bar + centered `typography.titleBar`.
   Use `ui/Screen`; pass `scroll={false}` when the screen owns a
   `FlatList`/`SectionList` (then the list supplies both the gutter and
   `paddingBottom: insets.bottom + spacing.xxl`). `Screen` owns its
   `ScrollView`, so a screen needing a `RefreshControl`, a labelled back
   affordance ("‹ Track"), or a three-slot header keeps its bespoke bar and
   retokenizes it — that is a normal outcome, not a failure.
6. **Section headers via `ui/SectionHeader`** (`typography.section`, 13/700
   uppercase muted). Its `action` is a `ReactNode` slot — pass a
   `Button variant="ghost" size="sm"`. It takes no `style` prop, so wrap it in
   a bare `<View style={{ marginBottom: spacing.md }}>` when you need spacing.
   Status pills via `ui/Badge`; loading/empty via `ui/LoadingState` /
   `ui/EmptyState`.
7. **Spacing on the 4pt scale** (`spacing.*`), gutter `spacing.screenGutter`
   (16). Radii only from `radii.*`. Type only from `typography.*`; weights are
   numeric strings — `"bold"` exists only inside `titleRoot`.
8. **Icons:** lucide-react-native, sizes `icons.sm|md|lg|xl`, `strokeWidth`
   `icons.strokeWidth` (2). Back chevron is always `lg` in `colors.text`.
   Text-glyph controls (`＋ ✓ ⇄ ✕ ↗ −`) are lucide components, and they get an
   `accessibilityRole`/`accessibilityLabel` when they become one. Status glyphs
   inside prose (`✂︎`, `⏱`, `●`) stay text.
9. **Two documented recipes, not components:** the Banner and the centred
   sheet (§4). Copy them verbatim.
10. **Exceptions that are tokens, not violations:** `colors.imageWell` (product
    photos are shot on white, so the wells stay white on dark cards),
    `colors.scrim`, and `colors.labelPaper` / `colors.labelInk` (the Nutrition
    Facts panel is a regulated artifact whose identity IS black on white —
    a dark-themed version reads as "some card about nutrition" rather than as
    the back of the packet). All three are faithful reproductions of something
    physical, never app chrome.

---

## 2. Standing rules

These were settled during the migration, each after a real defect or a real
disagreement. They are binding.

### Spacing

11. **Off-grid values are banned** (10, 14, 18, 22, 38…). Three cases:
    - `token ± n` → drop the `± n`, keep the base token.
    - A bare off-grid literal on a **control's touch-affecting padding** →
      round **up**. Tap targets never shrink as a side effect of tokenization.
    - Anything else (margins, gaps, decorative padding) → nearest step, and
      **ties round up**.

### Color

12. **Destructive controls.** *Labeled* destructive actions use
    `Button variant="destructive"` (calm outline — `danger` border and label,
    never a filled red). *Icon-only* destructive row actions use
    `IconButton tone="danger"`. Stripping the red from an unlabeled delete
    leaves nothing to distinguish it from any other row action.
13. **Outline color.** An outline that **is itself the affordance** — an empty
    checkbox, a radio, a chart's goal reference line — uses `colors.textFaint`.
    An outline that merely **bounds visible content** — a chip, an input, a
    card — uses `colors.border`.
13b. **Shadows are for floating surfaces only.** `elevation.overlay` is the
    single elevation step, and it belongs to transient surfaces that sit **over**
    content and then leave — toasts and snackbars. Cards, sheets, panels and
    headers stay flat: they belong to the page, and a fill step separates them
    adequately. There is no scale and no second step; if a surface seems to want
    one, it probably wants a different fill instead. Never write `shadowColor`
    at a call site — the colour lives in `colors.shadow`, reachable only through
    this token. (Added after the inventory toast: the palette has three neutral
    fills and `surface2`, the lightest, is already every raised panel's fill, so
    no fill could say "this is above the page".)
14. **Unfilled tracks are `colors.surface2`** — the groove a progress ring,
    meter or bar fills into, and the trough behind a segmented control. This is
    *not* a `textFaint` case (rule 13 is about affordance outlines): the fill
    carries the signal, the groove only bounds it, and an opaque mid-grey
    groove competes with its own fill.
15. **`colors.onBrand` means "foreground on a brand fill"** and nothing else. A
    white glyph on a `danger` fill is `colors.text`. There is no `onDanger`.

### Type

16. **Stat-cell values** — the repeated value cells in a stats grid or row —
    use `{ ...typography.rowTitle, fontWeight: "700" }`.
17. **A hero value** — the single dominant number a card is built around, such
    as a progress-ring centre — uses `typography.titleRoot`. It is not a stat
    cell. (This widens spec §4.5's "root-screen title" scoping of `titleRoot`,
    deliberately: a hero number is in the same weight class as a screen title.
    The "one `titleRoot` **title** per surface" constraint still holds.)
18. **Ring- and chart-fitted sizes with no applicable token are held as
    documented literals** with the fitting math in a comment — `MacroRing`'s
    20/10/10 inside a 110pt ring, the weekly summary's 9pt day totals,
    `WaterBarChart`'s SVG axis labels. Do not force them onto a token and do
    not invent a fifth hand-picked size either.
19. **One form-label token, app-wide: `typography.section`.** A label above a
    field or a chip group is 13/700 uppercase muted. A label sitting *beside* a
    control in a row (a switch label) is row copy: `typography.body`.
20. **A row control's primary label is `typography.rowTitle`, not
    `typography.section`** — an accordion header or a tappable disclosure row
    is a control, and 13/700 uppercase would shrink the screen's main
    affordance. `SectionHeader` is for passive headings. Never nest
    `typography.section` inside itself.

### Controls

21. **Active state, chosen by what the control *is*:**
    - **Segmented control** (grouped, mutually exclusive, shared track):
      `surface2` track, `radii.control`, active segment = solid `colors.brand`
      fill + `onBrand` label.
    - **Standalone filter/toggle chip** (independent, no shared track): active
      = `tint(colors.brand)` fill + `colors.brand` border + `colors.brand`
      label.
    - **Category tabs:** active = `colors.text` label + 2px `colors.brand`
      underline.
    Inactive labels are `colors.textMuted` in all three.
22. **Any scroller containing both a text input and a control must carry
    `keyboardShouldPersistTaps="handled"`.** With RN's default, a scroller
    spends the first tap dismissing the keyboard, so the user has to tap every
    chip twice. This applies to on-screen forms, not just modal sheets.

### Layout

23. **One gutter owner per screen.** If a container (`Screen`'s scroll path, or
    a list's `contentContainerStyle`) supplies `paddingHorizontal:
    spacing.screenGutter`, elements carry none. If no container can, every
    element carries it uniformly. Never both.
24. **No percentage grid widths.** `width: "47%"` beside a `gap` double-counts
    the separation. Children get `flex: 1`, the container owns the `gap`.
    Likewise never per-child `marginHorizontal` for separation.
25. **A `flex: 1` primitive needs a parent with a definite main size.**
    `EmptyState`/`LoadingState` are `flex: 1` (`flexBasis: 0`), so they never
    size to their own content — dropped into an auto-height parent they
    collapse onto their padding and spill. Two ways to give them a definite
    parent, and the choice is forced:
    - Where the scroller **can** be at least viewport-height, put `flexGrow: 1`
      on the content container **and every wrapper down to the primitive's
      parent** — the chain must reach all the way down.
    - Where sibling content **guarantees** the scroller already overflows, a
      grow chain is inert at every level while looking like a fix. Give the
      state its own box with a documented `minHeight` instead.
    - Neither is needed when a `flex: 1` ancestor already supplies it directly
      (e.g. `Screen scroll={false}`'s container).
26. **`Button` cannot flex, only stretch.** A side-by-side pair is two
    `<View style={{ flex: 1 }}>` wrappers each holding a `fluid` `Button`.
27. **Trailing space is `insets.bottom + spacing.xxl` on the content
    container** — never a flat magic number and never a trailing spacer
    `<View>`.
28. **Which loading treatment:** `LoadingState` for screen-level or full-list
    loading (it is full-bleed: `flex: 1` + opaque `colors.bg`, and it always
    renders a label). A bare `<ActivityIndicator color={colors.brand} />` for
    loading *inside* a `Card`, a sheet, or any inline region — `LoadingState`
    there paints a `bg` patch over the card and invents a "Loading…" string the
    surface never had. Do not add an `inline` mode to the primitive to unify
    these.

---

## 3. Anti-drift

- **Delete dead style keys as you migrate.** Every migrated file audited its
  stylesheet against its JSX and found fossils — twelve dead keys in
  `home.tsx`, ten in `mealsScreenStyles.ts`. Zero orphaned keys and zero unused
  imports is part of "done".
- **Don't copy a documented exception.** One held literal with a recorded
  reason is tolerable; a second is drift wearing a precedent as a disguise. If
  no token fits, that is an argument for adding **one** token, not for
  repeating the literal.
- **A wrong reason in a comment propagates like a wrong value.** Fix the
  comment when you fix the code.

---

## 4. Recipes

### Banner

```tsx
banner: {
  backgroundColor: tint(colors.warning),          // or colors.success
  borderWidth: 1,
  borderColor: tint(colors.warning, 0.3),
  borderRadius: radii.row,
  padding: spacing.md,
},
bannerTitle: { ...typography.buttonSm, color: colors.warning },  // 14/600
```

Use the `success` half for positive prompts ("Time to advance to Level 3"). Do
not repaint a positive banner amber to make it look like a warning.

### Centred sheet

The canonical modal form. `ui/Sheet` and `ui/TextField` were **declined** — the
primitive set is fixed at seven, and the spec's own precedent is that a
recurring shape can be a documented recipe.

```tsx
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";

<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    style={styles.backdrop}
  >
    <Card variant="panel" style={styles.card}>
      <Text style={styles.title}>Sheet title</Text>
      {/* optional */}
      <Text style={styles.subtitle}>One line of supporting copy.</Text>

      {/* `handled` is required, not optional: a scroller sitting between a
          live keyboard and a control eats the first tap on that control. */}
      <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Field name</Text>
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          editable={!saving}
        />
        <View style={styles.row}>
          <View style={styles.halfField}>{/* … */}</View>
          <View style={styles.halfField}>{/* … */}</View>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <View style={styles.actionButton}>
          <Button variant="secondary" label="Cancel" onPress={onClose}
                  disabled={saving} fluid />
        </View>
        <View style={styles.actionButton}>
          <Button label="Save" onPress={handleSave} loading={saving} fluid />
        </View>
      </View>
    </Card>
  </KeyboardAvoidingView>
</Modal>

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  // `maxHeight: "100%"` resolves against the backdrop's content box (screen
  // minus its padding), so the sheet can never exceed the screen on any device.
  // Never a fixed pixel cap — it cannot adapt, and the chrome alone eats
  // ~146pt, so even a 460pt scroller overflows a 568pt screen.
  card: { width: "100%", maxHeight: "100%" },
  // Shrinks first, so the title and the footer buttons always render.
  sheetScroll: { flexShrink: 1 },

  title: { ...typography.titleBar, color: colors.text, marginBottom: spacing.xs },
  subtitle: { ...typography.caption, marginBottom: spacing.lg },

  // The label owns the field rhythm — no `field` wrapper, no per-field
  // marginBottom. (With no subtitle, `title` takes `marginBottom: spacing.md`.)
  label: { ...typography.section, marginTop: spacing.sm, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token — see §6
    color: colors.text,
  },
  row: { flexDirection: "row", gap: spacing.md },
  halfField: { flex: 1 },

  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  // `Button` can stretch (`fluid`) but cannot flex; the wrapper supplies it.
  actionButton: { flex: 1 },
});
```

Rules that come with it: confirm is `Button` (primary) on the **right**, cancel
is `Button variant="secondary"` on the left; the confirm's in-flight state is
`loading`; grouped single-select chips inside a sheet take the solid-brand
treatment; do not invent field labels that the design did not already have.

---

## 5. Sanctioned exceptions

Each of these is a decision, not an oversight. Do not "clean them up".

| Exception | Why |
|---|---|
| `TabBarIcon`'s focused `strokeWidth: 2.5` | The only weight signal the tab bar has once the glyph and label have both taken the active tint. Every other stroke in the app is `icons.strokeWidth` (2). |
| `colors.imageWell` (`#FFFFFF`) | Product photos are shot on white; the wells stay white on dark cards. |
| `colors.scrim` (`rgba(0,0,0,0.5)`) | The one non-`tint` translucent value; modal backdrops only. Camera veils are **not** scrims — they use `tint(colors.bg, α)` with a justified functional alpha. |
| `colors.macros.*` duplicating `accents.water`/`success`/`warning`/`danger` byte-for-byte | Keyed by progress **state**, not by macro name. These are marks on a meter: changing the water accent must not repaint a carbs bar. |
| `colors.accents.photos`/`workouts` duplicating `warning`/`danger` | Identity ("the camera tile"), not a verdict. A tile must not reach for `colors.danger` to say "Workouts". |
| `MacroRing`'s held 20/10/10 and other ring-fitted sizes | Rule 18. |
| `ui/Badge`'s internal `paddingHorizontal: 10, paddingVertical: 3` | The 4pt scale has no 10 and no 3. A badge hand-rolled for a palette `Badge` cannot express (per-meal-type, per-beverage) copies these two values *on purpose*, so it renders identically to the real thing beside it. |

---

## 6. Open token proposals

Recorded, deliberately **not** implemented — inventing tokens late in a
cosmetic cycle is the scope expansion this system exists to avoid. Each has the
call sites that would justify it:

- **`typography.label` (12/600).** The de-facto chip/badge label. Appears
  verbatim at ~six call sites (`WaterCustomLogForm`, `WaterLogEditorModal`,
  `WaterQuickAddEditorModal`, `WaterHistoryList`, `MealLogEditorModal`,
  `QuickAdjustmentModal`) and is hardcoded inside `ui/Badge`. Adding it should
  point all six plus the primitive at one name. The tab bar's 12/500 label is
  adjacent but not identical.
- **An input token.** `fontSize: 16` is repeated at ~four call sites, each
  carrying the same "§4.5 defines no input token" apology.
- **`colors.mealTypes` (5 hues) and `colors.beverages` (5 hues).** Needed by
  `mealsHelpers.ts` / `MealsDistributionBar` and by `waterUnits.ts`'s
  `beverageColor()`. Both are genuine naming decisions, not renames: three of
  the five meal-type hues collide byte-for-byte with existing accents, and two
  of the five beverage hues (a coffee brown, a tea green) have no token
  anywhere. The alternative answer — that these marks do not need five hues —
  is equally open.

---

## 7. Adopt-on-touch, and the known residue

Screens outside nutrition/Track/Home — training, workout-session, schedule,
non-nutrition profile — were never in this cycle's reach. **Migrate them
whenever a change touches them:** swap `@/src/lib/colors` for
`@/src/theme/tokens`, replace hand-rolled controls with `ui/` primitives, delete
the dead style keys you find, and run the gate below on the file you touched.

Inside the migrated area, these files are **known, accepted residue** — they
still carry raw colors and/or the `@/src/lib/colors` shim. Listed so nobody
mistakes them for files the gates already cover:

| File | What is left |
|---|---|
| `track/MealsPaceLines.tsx` | 3 status hues |
| `track/MealUndoSnackbar.tsx` | a shadow, an orange "Undo" control, no safe-area inset |
| `track/MealsDistributionBar.tsx` | its own copy of the five meal-type hues |
| `track/MealsCalorieChart.tsx`, `MealsMacroChart.tsx` | per-macro chart hues |
| `track/MacroPercentageBar.tsx` | per-macro segment hues |
| `track/meals/RecentFoodChips.tsx` | the favourite amber |
| `track/RestockModal.tsx` | a violet CTA, hand-rolled buttons, its own modal scaffold |
| `track/meals/mealsHelpers.ts` | `MEAL_TYPES`' five hues (duplicated in `MealsDistributionBar`) |
| `lib/waterUnits.ts` | `beverageColor()`'s five hues |
| `track/WeightScreen.tsx`, `MeasurementsScreen.tsx`, `ProgressPhotosScreen.tsx` | Track-hub siblings, never in scope — adopt-on-touch |

Three of them are blocked on the token decisions in §6, not on effort.

---

## 8. The gate

Per file you touch:

```bash
grep -nE '#[0-9A-Fa-f]{3,8}\b|hsl\(' <file>     # must return nothing
grep -n '@/src/lib/colors' <file>               # must return nothing
```

Repo-wide:

```bash
cd mobile
npm run lint          # eslint: raw color literals
npx tsc --noEmit
npm test
```

The ESLint rule (`mobile/eslint.config.js`) is an **error** inside
`src/components/ui/**` — one raw literal in a primitive is one raw literal in
every screen — a **warning** everywhere else, so the adopt-on-touch area does
not block anyone's commit, and **off** inside `src/theme/**`, which is the
sanctioned home for raw values (spec §9).

**Known limitation:** the rule's `Literal[value=/…/]` selectors match string
literals only. An `rgba()` assembled from a template literal or by
concatenation slips straight through, as does a hex built from parts. The rule
is a backstop for the common case, not a proof — reviewers still read the diff.
