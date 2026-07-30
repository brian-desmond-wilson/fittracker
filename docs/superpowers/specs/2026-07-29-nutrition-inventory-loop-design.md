# Nutrition OS — Phase 4: Inventory Loop Closure

**Date:** 2026-07-29
**Status:** Approved design, pending implementation plan
**Companion docs:** Phase 1–3 specs in this directory (Phases 1–2 live in prod; Phase 3 executing concurrently), *FitTracker — Software Architecture Reference* / *Concept Map* (snapshot 2026-07-28).

## 1. Context

Phase 4 closes the inventory side of the loop: the app should know what can be made *right now*, what's about to go bad, and recommend accordingly. Exploration (2026-07-29) found the foundation is cracked and must be fixed first: the app holds **two contradictory stock truths**. The client UI derives quantities by `storage_type` (legacy `food_inventory.quantity` for single-location items), while the Phase 2 consume RPC, `fetchMealLibrary`, and the server views prefer `food_inventory_locations` rows whenever they exist — and both kinds of data exist for the same rows, because `migrate_single_location_items()` (20250217000003) created location rows that the edit flow never cleans up.

Concrete defects this phase fixes:

- A single-location item can display one quantity while consume decrements another; the RPC's resync then overwrites the legacy column with the stale location sum.
- Three byte-identical copies of the client quantity projection (`FoodInventoryScreen.tsx:137-152`, `app/(tabs)/track/food-inventory/[id].tsx:75-91`, `edit/[id].tsx:75-91`).
- `findInventoryMatchByBarcode` and MealsScreen's `willUseInventory` gate read only the legacy column (prod canary: an item with legacy `quantity: 0` and 60 units across locations — "Use from pantry" is wrongly disabled).
- RestockModal's transfer is two independent UPDATEs (non-atomic) and never resyncs the legacy column.
- Flipping an item multi→single orphans its location rows.
- Expiration exists only as a list badge + sort; the five inventory views are consumed by nothing (the standing adopt-or-drop rule lands here).

## 2. Goals

- **One stock truth: location rows, for every item.** Legacy `quantity` demoted to a maintained cache. One-time reconcile migration; all write paths keep the invariant.
- **One projection:** pure lib `stockState.ts` replaces the three client copies and the four stock views; Jest-tested.
- **One fetch:** `lib/supabase/inventory.ts` query module replaces the three inline fetch copies.
- **Atomic restock:** `transfer_inventory_units` RPC replaces RestockModal's paired UPDATEs.
- **Fixed pantry gate:** `findInventoryMatchByBarcode` returns location-aware stock; `willUseInventory` uses it.
- **Assemblable-now:** per-meal availability (badge, filter, missing-list) reusing Phase 2's resolution precedence.
- **Expiration surfacing:** pinned "Expiring soon" section; states from `stockState`.
- **Recommender integration:** availability + expiring signals as optional `eatNext` input — ranking preferences with reasons, never hard filters.
- **Execute the views decision:** drop all five (`food_inventory_with_locations`, `low_stock_items`, `out_of_stock_items`, `expiring_soon_items`, `shopping_list_active`).

## 3. Non-goals (Phase 5 / explicitly out)

Shopping-list UI, auto-add on threshold, vendor grouping, demand forecasting (Phase 5 — the `shopping_list` **table** is untouched and remains canonical); a new expiration notification family (the signal rides Eat Next; revisit only if passive surfacing proves insufficient); per-location expiration dates; changes to the consume/refund RPCs (locations-preferred is already their behavior; the legacy fallback branch stays as a dead-code safety net); barcode-scan/product-data flows; category system changes.

## 4. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Stock truth | Location rows for everything; legacy column = maintained cache | Matches what the consume RPC already prefers; kills the divergence class instead of patching instances |
| Reconcile winner | Single-location items: legacy column wins (replace location rows with one row); multi-location: locations win (resync legacy) | The legacy number is what the owner has been *seeing* for single-location items; locations were already truth for multi |
| Views | Drop all five | Same reasoning as Phase 3's nutrition-view drop, plus the views' logic disagrees with the shipped UI (low_stock ORs thresholds, ignores `requires_refrigeration`) |
| Projection home | Pure client lib (`stockState.ts`) | Jest-reachable; one language for stock logic; three divergent copies collapse to one |
| Assemblability strictness | Unresolvable item = missing | Under-claiming is the honest failure mode (Phase 2 §7.3 stance) |
| Availability in ranking | Sort key after role-match, before `raw`; never a filter | An in-stock 79 beats an out-of-stock 90; but role fit is the job and non-assemblable meals must stay visible (you might be about to shop) |
| Eat-soon delivery | Via recommender reasons + existing eat-nudge body | A second nudge family spends 64-slot budget on noise for a ~25-item pantry |
| `storage_type` | Survives as UI presentation hint only | Quantity semantics no longer branch on it anywhere |

## 5. `stockState.ts` — the one projection (pure lib)

`src/lib/stockState.ts`, sibling of `mealScore`/`eatNext`: no I/O, options-object API, exported policy constants, Jest-covered.

### 5.1 Per-item projection

```
projectItemStock({ item, locations, todayLocalDate }) → ItemStockState {
  totalQuantity      // Σ locations.quantity — always, no storage_type branch
  readyQuantity      // Σ where is_ready_to_consume
  storageQuantity    // Σ where !is_ready_to_consume
  isOut              // totalQuantity === 0
  isLow              // multi-location: total > 0 && total <= (total_restock_threshold ?? 0)
                     // single-location: total > 0 && total <= (restock_threshold ?? 0)
  needsFridgeRestock // multi-location && requires_refrigeration
                     //   && (fridge_restock_threshold ?? 0) > 0
                     //   && readyQuantity <= fridge_restock_threshold
  expiration         // "expired" | "today" | "soon" | "later" | null (null = no date)
  daysLeft           // signed integer, null when no date
}
```

Threshold semantics are preserved from the shipped **UI** (not the dropped views): `needsFridgeRestock` keeps the `requires_refrigeration` gate; low-stock keeps the two-threshold split by storage type. `EXPIRING_SOON_DAYS = 7` exported. Local-date strings throughout (`getLocalDateString` convention); "expired" is `daysLeft < 0`, "today" is `0`, "soon" is `1..7`.

### 5.2 Assemblability

```
assessAssemblability({ mealItems, inventory, links }) → {
  assemblable: boolean
  missing: string[]          // saved-food display names, meal display_order
  expiringItemName: string | null   // most-urgent expiring in-stock item the meal uses
  expiringDaysLeft: number | null
}
```

Resolution reuses `resolveInventoryMatches` (Phase 2) verbatim — barcode terminal, else unique shared-concept among in-stock rows. `assemblable` = every meal item resolved AND its resolved inventory item has stock. Items resolving to nothing count as **missing** (deliberate under-claiming). Duplicate resolution (two items → one inventory row) counts stock per the map, not cumulatively — v1 units are containers, not mass (Phase 2 stance), so one in-stock container satisfies both.

## 6. Locations-as-truth: migration + write paths

### 6.1 Reconcile migration — `20260730100000_inventory_locations_truth.sql` (owner-gated)

One `do $$` block, idempotent, per-item `raise notice`, closing counts:

1. **Single-location items** (`storage_type = 'single-location'`): delete their location rows, insert exactly one — `location = coalesce(item.location, 'pantry')`, `quantity = fi.quantity`, `is_ready_to_consume = true`. Legacy wins because it is what the UI displayed. Skip items already in exactly this shape (idempotency).
2. **Multi-location items**: `fi.quantity = Σ locations` (locations win).
3. **Items with no location rows at all** (any storage_type): create the single row from the legacy columns as in (1).
4. Post-condition assertion: every `food_inventory` row has ≥1 location row and `fi.quantity = Σ locations`; `raise exception` otherwise.

Same file: `transfer_inventory_units` RPC (§6.3) with grants (`revoke` from `public` **and** `anon` — the Phase 2 `20260729100400` lesson), and `drop view if exists` × 5. The `shopping_list` table is untouched.

### 6.2 Write paths that keep the invariant

- **EditFoodScreen save (single-location):** writes the item, then replaces its location rows with the canonical single row, then sets the legacy cache to the same quantity. Multi→single flips therefore clean up orphans by construction.
- **EditFoodScreen save (multi-location):** keeps delete-and-reinsert of location rows, then resyncs `fi.quantity = Σ`.
- **Restock (§6.3)** and the existing consume/refund RPCs maintain the cache server-side.
- **Add flows** create the initial location row alongside the item.

### 6.3 `transfer_inventory_units` RPC

`public.transfer_inventory_units(p_item_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_quantity integer) returns void` — plpgsql, `security invoker`, `search_path = ''`. `p_from_location_id` null = "from store" (no source decrement). Validates: locations belong to `p_item_id`; `p_quantity > 0`; source has ≥ `p_quantity` (`raise exception` otherwise — a failed transfer must be loud, unlike consume's silent-0 which is correct for logging). Decrements source, increments target, resyncs the legacy cache, all in one transaction. RestockModal's write path becomes a single RPC call.

## 7. One inventory query module — `src/lib/supabase/inventory.ts`

- `fetchInventoryWithState(todayLocalDate)` — the single fetch (items + locations + category maps), returning rows joined with their `ItemStockState`. Consumed by FoodInventoryScreen, the detail route, and the edit route; the three inline fetch/projection copies are deleted.
- `findInventoryMatchByBarcode` (existing service) now selects `locations:food_inventory_locations(quantity)` and sums it inline (`locations.reduce((s, l) => s + l.quantity, 0)`); `InventoryMatchSummary.quantity` is redefined to carry that projected total. MealsScreen's `willUseInventory` gate needs no code change beyond the semantic fix flowing through — but its in-code divergence comments (MealsScreen ~:539-543, foodInventoryMatchService ~:64-70) are updated to say the divergence is closed.

*(Amended 2026-07-30 during Task 7 execution, ruled by the coordinator: this bullet previously selected `(quantity, is_ready_to_consume)` and returned `totalQuantity` "from the shared projection" — the corrected text is folded into the block above rather than left stale beneath this note, per the convention used in the Phase 3 spec. **The original was internally incoherent, which is why the plan's inline Σ was upheld over it.** `projectItemStock` cannot be called with the columns this bullet listed: its signature (`stockState.ts:55-59`) takes a full `StockItemInput` — `storage_type` plus all three thresholds plus `requires_refrigeration` plus `expiration_date` — and a `StockLocationRow[]` requiring `id, location, quantity, is_ready_to_consume` per row. The listed select fetches neither the per-row `id`/`location` nor any of the five extra item columns, so no call could be constructed from it. And the projection's own `totalQuantity` is literally `locations.reduce((s, l) => s + l.quantity, 0)` (`stockState.ts:60`) — byte-identical to the inline expression — so routing through it is zero behavioral difference at roughly triple the payload, with `is_ready_to_consume` fetched and never read. `projectItemStock` earns its keep where the bands and badges are consumed; this call site wants one number. Full reasoning in the plan's "⚠️ Execution amendments → Task 7".)*

## 8. Surfaces

- **FoodInventoryScreen:** quantities/badges/sort come from `stockState`; a pinned **"Expiring soon"** section renders above the grid when any in-stock item has `expiration ∈ {expired, today, soon}` (existing badge colors retained). Existing filters/action-sheet behavior unchanged otherwise.
- **Meal Library:** rows get an **"In stock"** badge; header gains an "In stock only" filter toggle; MealDetail lists `missing` when not assemblable ("Missing: Korean BBQ Sauce"); MealBuilder shows per-item availability dots. The container computes one `assemblabilityByMealId` map (memoized like `scores`/`totalsById`) that all of these read.
- **Eat Next (§9)** carries "in stock" / "uses {item} expiring in {n} days" / "missing N ingredients" reason strings.

## 9. Recommender integration — gated on Phase 3 merge

`eatNext.ts` gains one **optional** input:

```
stockByMealId?: Map<string, { assemblable: boolean; missingCount: number;
                              expiringItemName: string | null; expiringDaysLeft: number | null }>
```

- **Ranking key order becomes:** role-match → assemblable (in-stock first) → uses-expiring (rescue food first) → `raw` desc → `prep_minutes` asc → name asc.
- **Never a hard filter** — non-assemblable meals remain candidates with "missing N ingredients" appended to reasons; assemblable adds "in stock"; expiring adds "uses {item} expiring in {n} days" (also inherited by the nudge body via the top pick).
- **`undefined` map = bit-for-bit current behavior.** Phase 3's shipped tests must pass unmodified; new tests cover the extended ordering.
- `useEatNext` builds and passes the map — it already fetches inventory via `fetchMealLibrary`; that read gains location `is_ready_to_consume`, `expiration_date`, and item names to feed `assessAssemblability`.

## 10. Testing & verification

- `stockState.test.ts` — projection totals/ready/storage; threshold-badge semantics pinned against fixtures lifted from the current UI logic (including the `requires_refrigeration` gate and the two-threshold split); expiration banding with boundary days (−1/0/1/7/8, no date); assemblability: full/partial/none, missing names in display order, barcode-terminal-out-of-stock (not assemblable, correctly not mis-resolved to a concept sibling), duplicate-resolution single-container case, expiring-item selection (most urgent wins).
- `eatNext.test.ts` additions — new key order (assemblable beats higher `raw`; role still beats assemblable; expiring breaks assemblable ties), absent-map bit-compatibility, reason strings.
- Migration pre-flight pins the **prod canary**: the item with legacy 0 / locations 60 must read 60 everywhere post-apply; post-verify runs the §6.1(4) assertion query read-only.
- On-device checklist: identical quantities across list/detail/edit; atomic restock updates both strata; "Use from pantry" appears for the canary item; library badge + filter; Eat Next prefers an in-stock meal and names an expiring ingredient; a deliberately-orphaned test edit (multi→single flip) leaves no stray location rows.

## 11. Sequencing & cross-phase pins

- Spec/plan now; **execution starts only after Phase 3 merges** (this phase edits `eatNext.ts` and `useEatNext`). Re-read Phase 3's "⚠️ Execution amendments" before finalizing/executing the plan and reconcile any engine-API drift — the ranking-comparator shape and `useEatNext`'s fetch layout are the exposure points.
- Phase 2 pins: `resolveInventoryMatches` signature/precedence (barcode terminal), consume/refund RPC semantics (unchanged), `MealRow`/container memoization pattern (`scores`/`totalsById` maps — `assemblabilityByMealId` follows it).
- The known `refund_inventory_units` caveat stands: callers refund only ids with `consumed > 0`; nothing in this phase changes that contract.
