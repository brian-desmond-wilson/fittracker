# Nutrition Loop Hub — Design Spec

**Date:** 2026-08-01
**Status:** Approved design, pending implementation plan
**Sequencing:** Sub-project 2 of 2 (after the shipped style guide). Built entirely from `src/theme/tokens.ts` + `src/components/ui/`.
**Visual reference:** Approved mockup artifact — https://claude.ai/code/artifact/13b5334f-9446-4499-962b-e8b3d101487b, concept **"Flow + Tap-through"** (section 3). Where prose and mockup disagree, this spec wins.
**Append-only during execution** (house rule since Phase 5): implementers never edit approved text; deviations go in a dated "Execution deviations" section here pointing into the plan's amendments.

## 1. Problem

Nutrition OS Phases 1–5 shipped a closed loop (Inventory → Meals → Eat Next → eating → Forecast → Shopping → restock → Inventory), but the app presents its stations as four unrelated Track tiles. Nothing shows the loop as a loop, and the connective data the engines already compute — assemblability counts, pace, days-until-out, suggestion demand — is visible only one screen at a time.

## 2. Goals / non-goals

**Goals**
- One screen that shows the whole loop live, with each station a window into its owning screen.
- Per-station depth on demand (detail sheet) without leaving the loop.
- Zero new persistence: the hub is a pure projection over shipped engines and fetchers.

**Non-goals**
- No mutations of any kind (decision: "windows + launcher"). No logging, confirming, or restocking from the hub.
- No new tables, RPCs, views, or migrations. No DB work at all.
- No ring/carousel rendering (rejected concepts; the wrap-swipe carousel and SVG ring are documented in the mockup history).
- No live badge on the Track-hub entry (the Track hub stays fetch-free).
- Water is not a loop station; it keeps its tile untouched.

## 3. Decisions (user-approved 2026-08-01)

1. **Placement:** dedicated screen reached from the Track hub — new route `/(tabs)/track/loop`; full-width entry card at the top of Track's "Nutrition & Food" section.
2. **Interactivity:** read-only windows + launcher. Station **row body** opens the station's detail sheet; station **chevron** deep-links straight to the owning screen (two touch targets per row).
3. **Layout:** "Flow + Tap-through" — vertical station pipeline with data-bearing connectors, plus a shared bottom-sheet `StationDetail` per station.

## 4. Architecture

House pattern instance #9: pure engine + hook + dumb components.

### 4.1 Engine — `mobile/src/lib/loopStatus.ts` (pure, TDD)

```ts
export type StationKey = "inventory" | "library" | "eatNext" | "pace" | "forecast" | "shopping";

export interface StationChip { label: string; tone: BadgeTone }          // BadgeTone from ui/Badge
export interface StationDetailLine { label: string; value: string }
export interface StationDetail {
  lines: StationDetailLine[];      // stat rows for the sheet
  chips: StationChip[];            // e.g. missing-item names, out-of-stock names (capped, see §5)
  footnote: string | null;         // e.g. "Runner-up: …", "restock returns units to Inventory ↺"
}

export interface StationStatus {
  key: StationKey;
  title: string;                   // "Inventory", "Meal Library", "Eat Next", "Today's Pace", "Forecast", "Shopping"
  headline: string;                // the row subline, e.g. "22 items · 4 out · 15 expiring"
  badge: StationChip | null;       // row badge; null renders no badge
  attention: boolean;              // drives nothing visual on the row beyond the badge; summed for attentionCount
  connector: string;               // label rendered AFTER this station; station 6's is the loop-closing label
  detail: StationDetail;           // sheet payload — sheet renders it verbatim, no logic
  destination: LoopDestination;    // route to push
  destinationLabel: string;        // sheet CTA text, e.g. "Open Meals"
}

export type LoopDestination =
  | "/(tabs)/track/food-inventory"
  | "/(tabs)/track/meals"
  | "/(tabs)/track/shopping";

export interface LoopStatus {
  stations: StationStatus[];       // always length 6, fixed loop order
  attentionCount: number;
}

export function computeLoopStatus(inputs: LoopStatusInputs): LoopStatus;

export interface LoopStatusInputs {
  todayLocalDate: string;
  inventory: InventoryItemWithState[];                    // fetchInventoryWithState
  library: MealLibraryData;                               // fetchMealLibrary
  stockByMealId: Map<string, EatNextStockInfo>;           // buildStockByMealId(library)
  eatNext: EatNextResult | null;                          // useEatNext result (null while absent)
  paceCalories: MealPaceState;                            // computeMealPace(macro: "calories")
  paceProtein: MealPaceState;                             // computeMealPace(macro: "protein")
  totals: { calories: number; protein: number };          // today's logged totals
  goals: { calories: number | null; protein: number | null };
  rates: Map<string, ConsumptionEstimate>;                // ShoppingData.ratesById (inventory id → estimate)
  suggestions: ShoppingSuggestion[];                      // ShoppingData.suggestions
  listRows: ShoppingListItem[];                           // ShoppingData.listRows
  vendors: NutritionVendor[];                             // ShoppingData.vendors
}
```

All label templates, caps, and attention rules are exported constants. The engine never fabricates numbers: forecast entries absent from `rates` (honesty gates) are simply not represented, and Eat Next stock display goes through the shipped `eatNextStockBadge` / `eatNextExpiringLine` helpers — never re-derived from `reasons` (the Phase 4 Task 14 computed-but-never-displayed lesson).

### 4.2 Hook — `mobile/src/hooks/useLoopHub.ts`

Composes shipped fetchers; **no new query code**:
`Promise.all([fetchInventoryWithState(today), fetchMealLibrary(), fetchShoppingData(today), <today's meal_logs totals + profiles goals/meal-times — the same queries useEatNext performs>])`, then computes pace both macros and `computeLoopStatus`. Duplicate inventory/library fetching inside `fetchShoppingData` is **accepted deliberately** (single-user app, ~22 rows; reuse beats a new query layer and cannot drift from the owning screens).

Contract mirrors `useEatNext`: `{ status: LoopStatus | null, loading /* first load only */, error, refetch, computedAt }`; stale-while-revalidate with a `runId` stale-response guard; refresh via the house `useFocusEffect` + `firstFocus`-ref pattern (EatNextHomeCard refinement) plus pull-to-refresh.

For Eat Next this hook does NOT nest `useEatNext` (its internal fetches would double the load); it calls the exported engine `computeEatNext`-equivalent path exactly as `useEatNext` does with the data already fetched. The plan pins the exact call.

**Design revision 2026-08-01 (pre-execution, by the designer — not an execution deviation):** reading `useEatNext.ts` as landed showed the paragraph above underestimated the duplication: the Eat Next data path is ~80 lines of review-hardened assembly (scoring trio, constraints fallback, the local-midnight workout-completion query with its documented bug history). Replicating it in `useLoopHub` is the drift risk §10 warns about. Revised mechanics: **`LoopHubScreen` composes both hooks** — `useEatNext()` runs as-is, and `useLoopHub(eatNextResult: EatNextResult | null)` takes its result as a parameter, recomputing `computeLoopStatus` when either side updates. Combined loading = either first-load; combined error = either error; Retry calls both refetches. The extra fetch overlap this creates is accepted under the same reasoning already stated above. Additionally, `LoopStatusInputs` is refined in the plan to structural subsets (e.g. `inventory: Array<{ id; name; state: ItemStockState }>`, `vendors: Array<{ id; name }>`) plus a `mealScores` input that `useLoopHub` computes with the same pure trio `useEatNext` uses (`computeMealTotals` + `brianScoreInputFor` + `computeBrianScore`) — station 2's "top by raw" needs scores, and structural inputs keep the engine import-light and trivially testable.

## 5. Stations (fixed order; all values live)

| # | key | Headline pattern | Badge | Attention rule | Connector after |
|---|---|---|---|---|---|
| 1 | `inventory` | `{N} items · {out} out · {exp} expiring` | `danger "{out} out"` if out>0, else `warning "{exp} expiring"` if exp>0, else `success "Stocked"` | out>0 ∨ exp>0 | `assemblability → {ready} of {meals} meals ready` |
| 2 | `library` | `{N} meals · top: {name} {score}` (top by raw score; "no meals yet" when empty) | `success "{ready} ready"` / `warning "0 ready"` | ready = 0 ∧ meals > 0 | `ranked for right now` |
| 3 | `eatNext` | `{pick} · {cal} cal · {prep} min · {context label}`; engine `message` when no pick | from `eatNextStockBadge` (warning Missing N / success In stock); null when no pick | badge is warning ∨ no pick with meals>0 | `you eat → units − · log +` |
| 4 | `pace` | `{cal} / {goal} cal · {prot} / {goal}g protein` (goal null → "no goal set") | worst of the two `MealPaceState`s: behind→`warning "Behind"`, goal_hit→`success "Goal hit"`, ahead/on_pace→`success "On pace"`, before/after_window→`neutral` window label | either macro `behind` | `meal_logs → consumption rates` |
| 5 | `forecast` | most urgent tracked item: `{name} ~{d}d left · {n} items tracked`; `no items tracked yet` when rates empty | `shopping "{u} urgent"` when any `daysUntilOut ≤ FORECAST_LEAD_DAYS`, else null | that same condition | `gaps + forecasts → suggestions` |
| 6 | `shopping` | `{n} on list · {vendor breakdown}` (breakdown from listRows' vendor_id → vendor name, "unassigned" bucket last) | `shopping "{s} suggested"` when s>0, else null | s>0 | `purchased → restock ↺ inventory` (always rendered — the loop-closing label) |

Detail-sheet payloads (engine-built): station 1 lists out-of-stock names then soonest-expiring lines (`{name} · {daysLeft}d`); station 2 lists top-3 meals by raw score with ready/missing chips; station 3 shows cal/protein/prep/score lines, missing-item name chips, runner-up footnote, and the `eatNextExpiringLine` when present; station 4 shows both `MealPaceState`s including `catchUpAmount`/`catchUpLabel`; station 5 lists tracked items ascending `daysUntilOut` (respecting `MAX_DISPLAY_DAYS` render cap — items above it are counted but get no "~Nd" line); station 6 lists top suggestions with their first reason. **All chip/line lists cap at `DETAIL_MAX_ROWS = 5`** with a `+N more` final chip; caps are exported constants.

Forecast name resolution: `rates` is keyed by inventory id; the engine resolves names via the `inventory` input. An id absent from `inventory` (deleted item, stale event) is skipped, never rendered as "unknown".

## 6. Components — `mobile/src/components/track/loop/`

- **`LoopHubScreen.tsx`** — `Screen variant="detail"` title "Nutrition Loop"; `LoadingState` on first load; `EmptyState` ("Couldn't load the loop", Retry action → `refetch`) on error — all-or-nothing, no per-station degradation. Renders `StationRow` + `Connector` alternating, then manages the sheet's `visible/stationKey` state. Pull-to-refresh via the extended `Screen` (below).
- **`StationRow.tsx`** — `Card variant="row"`; accent-tinted icon circle (station accents: inventory `inventory`, library+pace `meals`, eatNext `brand`, forecast+shopping `shopping`); title + headline; `Badge` from `station.badge`; chevron. **Two touch targets:** row body (`Card onPress`) → open sheet; chevron = separate `TouchableOpacity` (own `accessibilityLabel`, hitSlop to ≥44pt) → `router.push(station.destination)`.
- **`Connector.tsx`** — 2px tick + `▾` + mono `typography.caption`-sized label in `textFaint`, indented to the icon-circle centerline.
- **`StationDetailSheet.tsx`** — RN `Modal transparent animationType="slide"`; `colors.scrim` backdrop dismisses on tap; bottom sheet: `colors.surface`, top corners `radii.panel`, grabber (`surface2`), station header (icon + title + context caption), `detail.lines` as label/value rows, `detail.chips` as `Badge`s, footnote in `caption`, then `Button primary fluid` `{destinationLabel}` → dismiss + `router.push(destination)`. Renders the `StationDetail` payload verbatim — zero station-specific logic.

**Primitive extension (sanctioned):** `ui/Screen` gains optional `refreshControl?: React.ReactElement` forwarded to its internal `ScrollView`. Purely additive; closes the gap recorded in the style-guide amendments (ViewFoodDetailsScreen's RefreshControl). No other primitive changes.

## 7. Navigation & entry

- Route file `mobile/app/(tabs)/track/loop.tsx` (renders `LoopHubScreen` with `router.back()` on back); `<Stack.Screen name="loop" />` added to `mobile/app/(tabs)/track/_layout.tsx`.
- Track hub entry: full-width `Card variant="row"` rendered above the Nutrition & Food grid in `mobile/app/(tabs)/track/index.tsx` — `RefreshCw` glyph in `tint(colors.brand)` circle, title "Nutrition Loop", subline "Inventory → Meals → Shopping → back ↺", chevron; static (no fetch, no badge). Not a `TrackingCategory` tile — it is its own entry with `router.push("/(tabs)/track/loop")`.
- Deep-link map: stations 1 → food-inventory; 2, 3, 4 → meals; 5, 6 → shopping. Opening the Meal Library modal directly (station 2) would require a route param MealsScreen doesn't support — **out of scope**, recorded here so it isn't smuggled in.

## 8. States

- **Loading:** first load only; revisits show stale data while refetching.
- **Error:** whole-screen `EmptyState` + Retry. No alerts (read-only screen; the house alert-on-failure idiom is for mutations).
- **Empty-but-healthy:** 0 meals → station 2 headline "0 meals — build your library", stations 2–3 unassemblable states are *content*, not errors; empty `rates` → station 5 "no items tracked yet"; all six stations always render — the loop never has holes.

## 9. Testing

`mobile/src/lib/loopStatus.test.ts`, TDD, hand-derived fixtures: each station's headline/badge/attention against §5 exactly; connector interpolation; pace worst-of mapping incl. window states and null goals; forecast gate pass-through + `MAX_DISPLAY_DAYS` cap + deleted-id skip; detail caps (`DETAIL_MAX_ROWS`, `+N more`); empty-library and empty-inventory cases; `attentionCount`. No component tests (Jest is node-env — the engine carries the coverage; rendering is verified on device). `npx tsc --noEmit` 0; suite stays green.

## 10. Scope & risks

- New: engine + test, hook, 4 components, route file. Touched: track `_layout.tsx`, `track/index.tsx`, `ui/Screen.tsx` (one additive prop). Nothing else.
- Risks: **fetch weight** — the hub triggers the app's heaviest composed read (accepted; single user, small tables; stale-while-revalidate hides it after first load). **Drift between hub numbers and owning screens** — mitigated by consuming the same fetchers/engines the screens use, and by the pins below.

## 11. Pins (interfaces this design consumes, verified 2026-08-01)

- `useEatNext` internals for the pace/eat-next data path; `EatNextResult`/`EatNextRecommendation.stock?: EatNextStockInfo` — `src/lib/eatNext.ts:191`; helpers `eatNextStockBadge` (:262), `eatNextExpiringLine` (:321), `buildStockByMealId` (:162).
- `fetchInventoryWithState` → `InventoryItemWithState.state: ItemStockState` (`isOut`, `isLow`, `expiration`, `daysLeft`) — `src/lib/stockState.ts:55`; `EXPIRING_SOON_DAYS = 7`.
- `fetchShoppingData` → `{ listRows, suggestions, vendors, ratesById }` — `src/lib/supabase/shopping.ts:29`; `ShoppingSuggestion.priority/reasons` — `src/lib/shoppingDemand.ts:32`; `FORECAST_LEAD_DAYS = 3` (:8).
- `estimateConsumption` gates (`RATE_WINDOW_DAYS 28`, `MIN_UNITS 3`, `MIN_SPAN_DAYS 14`) and `MAX_DISPLAY_DAYS = 56` render cap — `src/lib/consumptionRate.ts`.
- `computeMealPace(opts) → MealPaceState { status, delta?, catchUpAmount?, catchUpLabel? }` — `src/lib/mealPace.ts:86`.
- `fetchMealLibrary` → `MealLibraryData` — `src/lib/supabase/mealLibrary.ts:38`; `computeMealTotals` (:182).
- ui primitives as shipped (post-amendment contracts): `Screen` has no `headerLeft`; `scroll={false}` supplies no gutter/insets; `Card` has `onPress`/`onLongPress`; `SectionHeader.action` is a slot; `EmptyState` is full-bleed only.
