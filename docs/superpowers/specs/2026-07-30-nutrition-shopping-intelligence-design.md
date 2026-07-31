# Nutrition OS — Phase 5: Shopping Intelligence

**Date:** 2026-07-30
**Status:** Approved design, pending implementation plan
**Companion docs:** Phase 1–4 specs in this directory (all four phases live in prod; Phase 4 merged as `24d1138`), *FitTracker — Software Architecture Reference* / *Concept Map* (snapshot 2026-07-28).

## 1. Context

The final Nutrition OS phase. After it, every arrow in the loop the initiative was named for — *Inventory → Ingredients → Meals → Recommendations → Shopping → vendors → Inventory* — exists in running code.

What exists today (verified on merged `main`, 2026-07-30): the `shopping_list` **table** is canonical and unchanged since Feb 2025 ("Replenishment output goes into this table, not a new list entity" — Architecture §22; "sub-aggregate of Inventory" — Concept Map §6). Everything around it is scaffolding: exactly one insert site (long-press in FoodInventoryScreen, gated out-of-stock-only, sized by the wrong threshold), one belt-and-braces delete, **zero reads, no route, no UI**; `is_purchased`/`purchased_at` have never been written; the `ShoppingListItem` TS type has zero importers and omits the (never-written) `category` column; the `shopping_list_active` view was dropped by Phase 4. **No product↔vendor association exists anywhere** — Phase 1's spec reserved exactly this: "Vocabulary only this phase; the shopping phase adds FKs into it."

Phase 4 also left a scheduled decision in writing: take the atomic `replace_item_locations` RPC or explicitly re-accept the non-atomic edit-save risk. **Taken** (§4, §5.4).

## 2. Goals

- The first shopping surface: Track-hub card → `ShoppingListScreen` with suggested demand, a vendor-grouped list with deep links, and the purchased lifecycle.
- **Suggest-confirm demand** from four sources (out-of-stock, missing-for-meals, low-stock, forecast), each with reason strings, deduped against the live list. Nothing enters the list without a tap.
- Products learn a **preferred vendor** (`food_inventory.preferred_vendor_id`); list rows carry a **snapshot** (`shopping_list.vendor_id`), overridable per row.
- **Purchased → restock**: one-tap stock increment via the existing `transferInventoryUnits` "from store" mode.
- **Honest forecasting**: per-item consumption rate from logged decrements with hard minimum-data gates — `null` (show nothing) beats a confident wrong number.
- Close the Phase 1 vendor-UI gap (name/URL editing; tappable URLs) and the type drift (drop the dead `category` column).
- Ship the scheduled `replace_item_locations` RPC — the last non-atomic inventory write path dies.

## 3. Non-goals (explicitly out; the initiative's post-loop ideas stay post-loop)

Automated ordering or any vendor API integration (none exist for Amazon Fresh/Costco/Instacart — deep links are the honest ceiling, per the Phase-0 assessment); auto-add without confirmation; forecast-driven quantities/timing ("buy 6 by Friday"); price/cost data; vendor add/delete/reorder UI (four stable vendors — YAGNI); auto-creating inventory items from name-only purchased rows; per-vendor product catalogs; notification families for shopping; LLM anything.

## 4. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Demand mode | Suggest-confirm | The list stays "things I decided to buy"; ramp-advancement precedent |
| Vendor association | Product default (`preferred_vendor_id`) + per-row snapshot (`vendor_id`) | Products remember where you buy them; one-off overrides don't rewrite the default |
| Forecasting depth | Estimate + suggestion reason only; hard honesty gates | Weeks of container-unit data with a known biased-low window; no auto-add, no quantities from forecasts |
| `replace_item_locations` RPC | Take it now | Rides this phase's already-scheduled migration + owner gate; marginal cost ≈ one function |
| `shopping_list.category` | Drop (emptiness-guarded) | Never written, absent from the TS type; the category system owns that concern (`meal_template_id` precedent) |
| Demand engine placement | Pure client lib | Sixth sibling of rampProgress/mealScore/eatNext/conceptMatch/stockState; the twice-executed "client math wins" ruling |
| Suggestion quantity | `max(1, threshold − total + 1)` for threshold sources; 1 otherwise | Enough to *exit* the low state — finally `total_restock_threshold`'s documented purpose |
| Missing-ingredient rows | Name-only `shopping_list` rows (`food_inventory_id` null) | The FK was always nullable; no new entity (Concept Map ruling) |

## 5. Data model — one migration, owner-gated

`20260731100000_shopping_intelligence.sql` (house style: idempotent, `public.`-qualified, `raise notice` counts):

### 5.1 Vendor FKs

```sql
alter table public.food_inventory
  add column if not exists preferred_vendor_id uuid
  references public.nutrition_vendors(id) on delete set null;
alter table public.shopping_list
  add column if not exists vendor_id uuid
  references public.nutrition_vendors(id) on delete set null;
```

No new indexes — both tables are tens of rows; deliberate.

### 5.2 Drop `shopping_list.category`

Guard first (`raise exception` if any row has `category is not null` — provably dead, re-proven at apply time), then `alter table public.shopping_list drop column if exists category;`.

### 5.3 TS mirrors

`ShoppingListItem` gains `vendor_id: string | null` (and its first importer); `FoodInventoryItem` gains `preferred_vendor_id: string | null`.

### 5.4 `replace_item_locations(p_item_id uuid, p_rows jsonb) returns void`

plpgsql, `security invoker`, `search_path = ''`, one transaction. Validates: `p_rows` is a non-empty JSON array; each element has a valid `location` (fridge/freezer/pantry/cabinet), integer `quantity >= 0`, boolean `is_ready_to_consume`, optional `notes`; the item exists (its `user_id` is read from `food_inventory` — `raise exception` if not found — and stamped onto the inserted rows). Delete existing rows → insert new → resync `food_inventory.quantity = Σ`. `revoke` from `public` and `anon`, `grant execute to authenticated`. The client `replaceItemLocations` in `lib/supabase/inventory.ts` becomes a thin RPC wrapper (same signature; its non-atomic body and the honest-zero failure path are deleted). This closes Phase 4's Task-4 deferral and gives the locations-as-truth invariant ongoing enforcement.

## 6. Demand engine — pure lib `src/lib/shoppingDemand.ts`

Sixth pure lib; options-object input assembled by the query module; exported policy constants; Jest-covered.

**Input:** inventory items (`{id, name, unit, preferredVendorId, state: ItemStockState}`), meal gaps (`{mealName, missing: string[]}` from each non-assemblable meal's `MealAssemblability` — gate on `missing.length > 0`, not `!assemblable`, per Phase 4's Task-8 fix), the forecast map (§7), and current **unpurchased** list rows (`{foodInventoryId | null, name}`).

**Output:** `ShoppingSuggestion[]` — `{name, foodInventoryId: string | null, vendorId: string | null, quantity, unit: string | null, priority: 1 | 2 | 3, reasons: string[]}`, ordered by priority then name (deterministic).

**Sources:**

| Source | Trigger | Priority | Quantity | Reason |
|---|---|---|---|---|
| Out of stock | `state.isOut` | 1 | `max(1, lowThreshold − total + 1)` | "out of stock" |
| Missing for meals | a meal's `missing` includes the name | 1 | 1 | "needed for {meal}" (meals merge) |
| Low stock | `state.isLow` | 2 | same formula | "below threshold ({total} left)" |
| Forecast | `daysUntilOut ≤ FORECAST_LEAD_DAYS` and not low/out | 3 | 1 | "~{n}d left at your pace" |

(`lowThreshold` = the same storage-type-appropriate threshold `stockState` uses.)

**Dedupe, two layers:** (1) cross-source merge — same inventory id, else case-folded trimmed name → one suggestion, `min` priority, threshold-formula quantity wins over 1, union of reasons; a missing-for-meal name that matches an inventory item adopts its id/vendor/unit. (2) suppression — any suggestion matching an unpurchased list row (id, else case-folded name) is dropped entirely.

**Constant:** `FORECAST_LEAD_DAYS = 3`.

## 7. Forecasting — pure lib `src/lib/consumptionRate.ts`

**Input:** decrement events (`{inventoryId, dateLocal}`, one per consumed unit — expanded from `meal_logs.inventory_items` on `uses_inventory` rows), per-item `totalQuantity`, `todayLocalDate`.

**Per item:** units consumed in the trailing `RATE_WINDOW_DAYS = 28` → `ratePerDay = units / RATE_WINDOW_DAYS`; `daysUntilOut = ceil(totalQuantity / ratePerDay)` (0 when already out).

**Honesty gates (the design):** an estimate exists only when ≥ `MIN_UNITS = 3` units were consumed inside the window AND the item's event history spans ≥ `MIN_SPAN_DAYS = 14` days (oldest event to today, not window-bounded). Otherwise the item maps to nothing — UI shows nothing.

**Output:** `Map<inventoryId, {ratePerDay, daysUntilOut}>`. All four constants exported. The lib header documents the two known bias sources: units are containers (not servings), and the Phase 4 pre-apply gap window undercounts — this is a heuristic, not calibrated science.

**Display:** "~{n}d left" on inventory rows when an estimate exists; the §6 reason string.

## 8. Query module — `src/lib/supabase/shopping.ts` + purchased→restock

- `fetchShoppingData(todayLocalDate)` — parallel: `shopping_list` (all rows), `fetchInventoryWithState` (reused), `fetchMealLibrary` (reused; provides meals + assemblability inputs), vendors, and 28 days of `meal_logs` (`uses_inventory = true`, selecting `date, inventory_items`) expanded to events. Computes assemblability per meal (same per-meal `assessAssemblability` calls the modal makes), runs both engines, returns `{listRows, suggestions, vendors, ratesById}`. The screen renders; it never computes.
- Mutations (throw for the alert idiom): `addSuggestions(userId, suggestions[])` — bulk insert `{user_id, food_inventory_id, name, quantity, unit: unit ?? "item", vendor_id, priority, notes: reasons.join(" · ")}`; `updateListItem(id, patch)` (`vendor_id`, `quantity`, `notes`); `markPurchased(id)` → `{is_purchased: true, purchased_at: now}`; `unmarkPurchased(id)` → `{is_purchased: false, purchased_at: null}`; `deleteListItem(id)`; `clearPurchased()`.
- **Purchased→restock:** after `markPurchased` on a row with `food_inventory_id`, the screen offers one alert — "Add {qty} {unit} to stock?" — accepting calls the existing `transferInventoryUnits(itemId, null, targetLocationId, qty)` (atomic, cache-resyncing). Target = the item's ready-to-consume location, else its first location; if the item has somehow lost all location rows, the offer is skipped (never a crash). Declining just leaves it purchased. Name-only rows: no offer.

## 9. Surfaces

### 9.1 Track hub

`"shopping"` joins the `TrackingCategory` closed union; fourth nutrition card (`ShoppingCart` icon — imported unused since Feb, finally consumed) fills the grid's odd-count spacer slot; route in the track `_layout`; thin `app/(tabs)/track/shopping/index.tsx` → `ShoppingListScreen`.

### 9.2 `ShoppingListScreen` (house container patterns: SectionList root, memo rows, `loadFailed` → Retry, alert idiom, `useSafeAreaInsets`)

1. **Suggested** — pinned first, hidden when empty. Rows: name · quantity · reasons; ＋ per row; "Add all" header action. Adding stamps the vendor snapshot.
2. **The list, grouped by vendor** — one section per vendor in `display_order`; unassigned rows under **"Anywhere"**, last. Vendor headers show a tappable deep link (`Linking.openURL(app_url)`) when set. Rows: checkbox (→ purchased + §8 restock offer), name, quantity, and a per-row vendor chip opening a small picker (active vendors + Anywhere) that writes the row's `vendor_id` only.
3. **Purchased** — collapsed section with count; expand to review; un-check restores; "Clear purchased" bulk-deletes with confirm.

### 9.3 Inventory tie-ins

The long-press "Add to Shopping List" is rewired through the module (correct threshold-exit quantity, vendor stamping) and un-gated (any item, not just out-of-stock). Inventory rows show "~{n}d left" when the forecast map has an entry. The edit screen gains a **Preferred vendor** picker (chips: active vendors + None) writing `preferred_vendor_id`.

### 9.4 Vendor management (Phase 1 gap closed)

`VendorsSection` rows become tap-to-expand editors: name + URL `TextInput`s wired to the existing `updateVendor` capability (untouched since Phase 1, finally consumed), URL rendered tappable. The `is_active` switch stays. Add/delete/reorder remain non-goals.

## 10. Testing & verification

- `shoppingDemand.test.ts` — every source's trigger and reason; the quantity formula at threshold boundaries (incl. threshold 0 → 1); both dedupe layers (id-match, name-case-fold-match, cross-source merge keeps min priority + union reasons + threshold quantity; suppression by unpurchased rows only — purchased rows do NOT suppress); name-only rows carry null id/vendor; deterministic ordering; `missing.length > 0` gating (item-less meals suggest nothing).
- `consumptionRate.test.ts` — rate math; both gates at exact boundaries (2 vs 3 units; 13 vs 14 span days); window exclusion (event at day 29 doesn't count toward units but does toward span); `daysUntilOut` ceil + already-out 0; empty history.
- `tsc` 0; suite grows from 279. No native changes — Metro reload.
- Migration owner-gated: pre-flight proves `category` all-null and the four vendors present; post-verify confirms FKs + RPC + grants and the column gone.
- On-device: hub card; suggestions with correct reasons/quantities; Add all → vendor-grouped list; Instacart deep link opens the app; purchase → restock offer → stock increments and inventory reflects it; forecast line on a well-logged item; vendor rename + URL edit stick; per-row vendor override moves the row's group without touching the product default.

## 11. Sequencing & cross-phase pins

- **No execution gate — Phase 4 is merged**; execution branches off current `main` (`nutrition-os/shopping` suggested) whenever the owner starts it.
- Phase 4 pins (verified at design time, 2026-07-30): `ItemStockState`/`projectItemStock`/`assessAssemblability`/`AssemblabilityInventoryRow`/`MealAssemblability` shapes; `InventoryItemWithState.state` as the only quantity read; `transferInventoryUnits(itemId, null, …)` "from store" semantics; `fetchMealLibrary()`'s `MealLibraryData` (meals + `conceptIdsBySavedFoodId` + `inventory`); the `missing.length > 0` vs `!assemblable` distinction; Phase 4's three-copies-of-assemblability doc comment (`eatNext.ts:88-161`) — the shopping module's per-meal computation is a sanctioned fourth *call site*, not a fourth definition.
- The plan must carry the standard preconditions block (baseline test count check, amendments-recording protocol) and reconcile against any post-design commits to `main` before execution starts.

## Execution deviations (appended during implementation — the approved text above is unchanged)

Convention: the approved text above is never edited in place. Execution-time divergences are appended here, dated, with a pointer into the implementation plan's `## ⚠️ Execution amendments`.

**2026-07-30 — §9.2, memoized rows not implemented.** `ShoppingListScreen` does not memoize its rows. At this list's realistic size (a single user's shopping list — tens of rows at the outside) the gain is unmeasurable, and extracting a row component from a 365-line screen that could not be exercised against real data until Task 10's migration applied carried more regression risk than the gain justified. Full rationale: the implementation plan's `### Task 7` amendment, "Deferred, not fixed — the 'memo rows' house-pattern claim was unmet."
