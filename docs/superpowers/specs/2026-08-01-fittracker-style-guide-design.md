# FitTracker Style Guide — Design Spec

**Date:** 2026-08-01
**Status:** Approved design, pending implementation plan
**Sequencing:** Sub-project 1 of 2. The Nutrition Loop Hub (separate spec, not yet written) is built on top of this system.
**Visual reference:** Approved mockup artifact — https://claude.ai/code/artifact/c6173886-38e6-4426-9108-7de42c2d3486 (tokens, primitives, applied frames incl. the Food Inventory before/after). Where prose and mockup disagree, this spec wins.

## 1. Problem

A code sweep of all 158 components (2026-08-01) found: 9 distinct button implementations; 57 hardcoded hex values competing with the 13-token `src/lib/colors.ts` (e.g. muted text is both token `#94A3B8` and literal `#9CA3AF` ×182; borders both `#1E293B` and `#1F2937` ×128); five card background colors; four "destructive" reds; 15 corner radii; 4 screen-title patterns; 10 disabled-state conventions; two screens (Food Inventory, EditFood) light-themed inside a dark app; and zero shared UI primitives in active use (`ThemedScreen` has one consumer). `EatNextHomeCard.tsx:254-263` documents deliberate style copy-paste because nothing shared existed.

## 2. Goals / non-goals

**Goals**
- One typed token module and seven UI primitives that make the consistent thing the easy thing.
- Migrate all nutrition/Track/Home surfaces to them; convert the two light-themed screens to dark.
- A written guide + lint backstop so drift is visible at review time.

**Non-goals**
- No theme runtime, no provider, no new dependencies, no light mode (the app is deliberately dark-only).
- No migration of training/workout/schedule/non-nutrition-profile screens this cycle (adopt-on-touch later).
- No navigation-semantics changes (back behavior stays as fixed in #28).
- No Loop Hub — next spec.

## 3. Decisions (user-approved 2026-08-01)

1. **Sequencing:** style guide first, Loop Hub second.
2. **Migration reach:** nutrition surfaces + Home + Track hub + the two light-themed screens; rest of app adopt-on-touch.
3. **Accent policy:** domain accents (meals orange, water blue, inventory violet, shopping teal) are **identity only** — glyphs, tiles, badges, tints. Every interactive control (buttons, links, spinners, active segments/tabs) uses brand green.
4. **Header convention:** by depth — root screens use a slim chrome bar + 28pt title in the scroll body; detail screens use a compact bar with centered 17/600 title.
5. **Architecture:** tokens module + primitive components (Approach A). No tokens-only shortcut, no theme runtime.
6. **Mockup approved** as the visual definition of all of the above.

## 4. Token module — `mobile/src/theme/tokens.ts`

Flat, typed, `as const` constants. No runtime. `mobile/src/lib/colors.ts` becomes a re-export shim mapping every existing token name to its new value so all ~100 current imports keep compiling until each file migrates (`card` → `surface2`, `mutedForeground` → `textMuted`, `destructive` → `danger`, etc.).

### 4.1 `colors`

| Token | Value | Notes |
|---|---|---|
| `bg` | `#0A0F1E` | screen background (unchanged) |
| `surface` | `#111827` | cards, rows, tiles — the de-facto winner (128 uses) becomes official |
| `surface2` | `#1E293B` | raised elements: modal sheets, inputs, chips, segmented tracks |
| `border` | `#1F2937` | the only border color |
| `text` | `#F9FAFB` | primary text |
| `textMuted` | `#9CA3AF` | secondary text (wins over `#94A3B8`) |
| `textFaint` | `#6B7280` | captions, timestamps, placeholders |
| `brand` | `#22C55E` | ALL interactive controls; also `success` |
| `onBrand` | `#FFFFFF` | label color on brand fills |
| `success` | `#22C55E` | alias of brand, kept for semantic call sites |
| `warning` | `#F59E0B` | expiring, missing, behind-pace |
| `danger` | `#EF4444` | the one red (replaces `#F87171`, `#DC2626`, `#B91C1C`) |
| `imageWell` | `#FFFFFF` | documented exception: product-photo wells stay white on dark cards |
| `scrim` | `rgba(0,0,0,0.5)` | modal backdrops — the only non-`tint` translucent value |
| `accents.meals` | `#F97316` | identity only |
| `accents.water` | `#3B82F6` | identity only |
| `accents.inventory` | `#8B5CF6` | identity only |
| `accents.shopping` | `#14B8A6` | identity only |
| `accents.brand` | `#22C55E` | identity slot for brand-owned surfaces (Home, Loop Hub later) |

### 4.2 `tint(hex: string, alpha?: number): string`

Pure helper returning `rgba()` at `alpha` default **0.15** — the one translucent-fill recipe (tiles, badges, banners). Borders on tinted banners use `tint(color, 0.3)`. Replaces ~60 hand-typed `rgba()` literals across seven arbitrary alpha levels. Lives in `tokens.ts`; unit-tested (it is the only logic in the module).

### 4.3 `spacing`

`{ xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 }` plus `screenGutter: 16`. Track hub and Meals converge from 20 to 16. Off-grid values (10, 14, 18, 22, 38…) are banned; nearest step wins.

### 4.4 `radii`

`{ control: 8, row: 12, panel: 16, pill: 999 }`. All fifteen current radii map to these.

### 4.5 `type`

| Token | Size/weight | Use |
|---|---|---|
| `titleRoot` | 28 / `"bold"` | root-screen title in scroll body (only sanctioned use of `"bold"`) |
| `titleBar` | 17 / `"600"` | detail-screen centered bar title (Shopping's 20/700 shrinks) |
| `section` | 13 / `"700"`, uppercase, `letterSpacing: 0.5`, `textMuted` | section headers everywhere (Track hub's 12/600 and Meals' 18/600 both converge here) |
| `rowTitle` | 16 / `"600"` | list-row titles |
| `body` | 14 / `"400"` | body copy, row subtitles |
| `caption` | 12 / `"400"`, `textMuted` | metadata lines |
| `button` | 16 / `"600"` | button labels (`sm`: 14) |

Weights are numeric strings only; `"bold"` is banned outside `titleRoot`.

### 4.6 `icons`

lucide-react-native only (already true). Sizes `sm: 16, md: 20, lg: 24`; back chevron always `lg` in `text` color; default `strokeWidth: 2`. Text-glyph controls (Shopping's `＋ ✓ ⇄ ✕ ↗`) are replaced by lucide equivalents (`Plus`, `Check`, `ArrowLeftRight`, `X`, `ArrowUpRight`).

## 5. Primitives — `mobile/src/components/ui/`

Seven components. Each `StyleSheet.create`s internally from tokens; none accepts raw color/size props (identity accents pass as `accent` keys, not hex). All exported from `mobile/src/components/ui/index.ts`.

### 5.1 `Button`
`{ label, onPress, variant?: "primary" | "secondary" | "destructive" | "ghost", size?: "md" | "sm", loading?, disabled?, fluid?, icon? }`
- Geometry always: `radii.control`, paddingVertical 12 (`sm`: 8), `type.button` label, row layout gap 8, `activeOpacity` 0.7.
- `primary`: brand fill, `onBrand` label. `secondary`: transparent, 1px `border`, `text` label. `destructive`: transparent, 1px `danger` border, `danger` label (the calm outline treatment; no filled red). `ghost`: text-only brand label, horizontal padding 8.
- `disabled`: opacity 0.5 (the only dimming mechanism). `loading`: `ActivityIndicator` (small, `onBrand` on primary, `brand` otherwise) replaces the label; control keeps its rendered width via `minWidth` capture; press disabled.

### 5.2 `IconButton`
`{ icon, onPress, variant?: "square" | "circle", accessibilityLabel, disabled? }`
- `square`: 44×44, `radii.control`, brand fill, `onBrand` icon `md` — the header add-button.
- `circle`: 32×32, `radii.pill`, `tint(brand)` fill, brand icon `sm` — the inline row action. Hit-slop pads circle to ≥44pt.

### 5.3 `Card`
`{ variant: "row" | "panel" | "tile", accent?, onPress?, children }`
- `row`: `surface`, `radii.row`, padding `spacing.md`, 1px `border`.
- `panel`: `surface`, `radii.panel`, padding `spacing.lg`, 1px `border`.
- `tile`: `radii.panel`, padding `spacing.lg`, square aspect, `tint(accents[accent])` fill, no border (Track hub).
- With `onPress`, wraps in `TouchableOpacity` `activeOpacity` 0.7.

### 5.4 `Screen`
`{ variant: "root" | "detail", title, accent?, icon?, onBack?, headerLeft?/headerCenter?/headerRight? slots, scroll?: boolean, children }`
- Both: `SafeAreaView`/insets handling, `<StatusBar barStyle="light-content" />`, `bg` background, bottom inset `insets.bottom + spacing.xxl` on the scroll container.
- `root`: slim chrome bar (back chevron if `onBack`, then slots — e.g. search pill, IconButton); `titleRoot` + accent glyph rendered as the first element of the body; no bar border.
- `detail`: bordered bar — back chevron, centered `titleBar` title, right action slot (ghost text or IconButton); content starts immediately.
- `scroll: false` renders header only and lets the screen own its FlatList/SectionList (Inventory, Shopping).

### 5.5 `SectionHeader`
`{ title, action?: { label | icon, onPress }, badge? }` — `type.section` title, brand-colored action on the right, optional `Badge` beside the title.

### 5.6 `Badge`
`{ label, tone: "warning" | "danger" | "success" | "neutral" | keyof accents }` — `radii.pill`, padding 3×10, 12/`"600"`, `tint(color)` fill + full-strength label. Replaces the copy-pasted score chips / stock badges (`EatNextHomeCard` ↔ meal library) and all expired/missing labels.

### 5.7 `EmptyState`
`{ icon, title, body?, action? }` — centered layout; also exports the standard loading treatment (`ActivityIndicator` in `brand` + `caption` text) so per-screen spinner colors die.

**Banner is a recipe, not a component:** `Card variant="row"` (or bare `View`) with `tint(warning)` fill, `tint(warning, 0.3)` 1px border, `warning` 14/`"600"` heading — documented in the guide with copy-paste source. Used by ramp banner and expiring-soon.

## 6. Screen anatomy conventions

- **Root screens** (Track hub, Meals, Water, Food Inventory, Home): `Screen variant="root"`. Title glyph uses the domain accent; all controls brand.
- **Detail screens** (Shopping List, item detail/edit, Meal Library modal header, Nutrition Preferences): `Screen variant="detail"`.
- Modals keep `Card variant="panel"` sheets on `scrim` backdrops; confirm/cancel is `Button primary` + `Button secondary` at equal flex with `spacing.md` gap.
- Segmented controls: track `surface2` `radii.control`, active segment brand fill `onBrand` (Meals Today/Insights toggle converges here).
- Category tabs (Inventory): active = `text` label + 2px brand underline; inactive `textMuted`.

## 7. Light→dark conversions

- **FoodInventoryScreen:** body `#FFFFFF` → `bg`; grid tiles → `Card row` with `imageWell` photo wells (`radii.control`, centered contain image); title/tabs/banner per §6; violet survives in the package glyph and location badges only; add-button → brand `IconButton square`.
- **EditFoodScreen + edit-food/styles.ts:** white sections → `Card panel` on `bg`; `#111827` headings → `text`; violet save button → `Button primary`; accordion `SectionHeader` reuses the ui primitive with a chevron action.
- **ViewFoodDetailsScreen:** same recipe; preview variant included.
- **Route wrappers** `food-inventory/[id].tsx`, `edit/[id].tsx`, `preview.tsx`: hardcoded light loading states → `EmptyState` loading on `bg`.

## 8. Migration order

Nine stages, each independently shippable and device-checkable:
1. `theme/tokens.ts` + `tint` (+ unit test) + `lib/colors.ts` shim.
2. Seven primitives + `ui/index.ts`.
3. Light→dark conversions (§7).
4. Shopping List + Meal Library modal (incl. glyph→icon swap).
5. Home surfaces (EatNextHomeCard, MealsHomeCard, WaterIntakeHomeCard, RampHomeBanner, dead duplicate styles in `home.tsx` deleted) + Track hub (`TrackingCard`, `track/index.tsx`).
6. Meals screen + modal fleet (FoodPreview, FoodCorrection, ManualFoodEntry, MealLogEditor, QuickAdjustment, MealsWeeklySummary, BarcodeScanner chrome).
7. Water screen + four modals.
8. Nutrition Preferences + FoodMatching (incl. `profile/nutrition/styles.ts` retirement).
9. Closeout: tab-bar HSL strings → tokens; `docs/STYLE_GUIDE.md`; ESLint backstop; final grep sweep.

## 9. Verification

- Per stage: `npx tsc --noEmit` = 0 errors; `npm test` fully green (existing suites are a regression tripwire; no new snapshot tests — deliberate YAGNI).
- Per migrated file: `grep -nE '#[0-9A-Fa-f]{3,8}\b|hsl\(' <file>` returns nothing (token module and its shim excepted). This is the mechanical "done" for subagents.
- Simulator screenshot pass per stage (deep-link + `simctl io screenshot` on the dedicated FitTracker sim, Metro port 8090); final on-device owner checklist in the plan's last task.
- ESLint `no-restricted-syntax` on hex/hsl literals: **error** within `src/theme/` and `src/components/ui/`, **warn** elsewhere.

## 10. Risks

- **Purely visual regressions** are the main risk (no logic changes anywhere); mitigated by per-stage screenshots and the owner checklist.
- **The shim hides stragglers:** `lib/colors.ts` re-export means unmigrated files still compile — intended for out-of-scope screens, but stages 3–8 must remove the shim import from every file they touch (grep gate covers this).
- **Meals screen size** (1,766 lines): stage 6 is the largest diff; it goes late, after the patterns are proven on four smaller stages.
