# Nutrition OS Phase 5 — Shopping Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The final Nutrition OS phase — suggest-confirm shopping demand, the first shopping-list surface (vendor-grouped, deep-linked, purchased lifecycle with restock-back), honest consumption forecasting, vendor FKs, and the scheduled atomic `replace_item_locations` RPC — per `docs/superpowers/specs/2026-07-30-nutrition-shopping-intelligence-design.md`.

**Architecture:** Two new pure libs (`shoppingDemand`, `consumptionRate`) compute everything; `lib/supabase/shopping.ts` owns all `shopping_list` I/O and assembles engine inputs from existing fetchers; `ShoppingListScreen` renders and never computes. One owner-gated migration: two vendor FKs, drop the dead `category` column, the atomic RPC.

**Tech Stack:** Expo SDK 54 / RN 0.81.5, TypeScript strict, Supabase (Postgres 17, plpgsql), Jest + ts-jest (pure TS libs only).

---

## ⛔ Preconditions — read before Task 1

1. Branch `nutrition-os/shopping` off current `main` (must include `440fa83`, the spec). Run `cd mobile && npm test` — baseline is **9 suites / 279 tests** green (record actual numbers; all four prior phases are merged and live in prod).
2. **Reconcile against any `main` commits after `440fa83`** before starting; the spec's §11 pins were verified against `24d1138`/`440fa83` on 2026-07-30.
3. A green `tsc` proves nothing about DB column names (untyped supabase client) — verify columns by grep against `supabase/migrations/`.
4. House rules as all prior phases: migrations idempotent + `public.`-qualified + never applied by implementers (Task 10 is the owner gate); `StyleSheet.create`; `useSafeAreaInsets`; alert-on-failure; commit per task; record every deviation in "⚠️ Execution amendments" at the bottom, amending this doc in the same commit as the fix (mutation-test threshold/comparator changes, per Phase 2–4 precedent).

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260731100000_shopping_intelligence.sql` (create) | Vendor FKs, drop `category`, `replace_item_locations` RPC |
| `mobile/src/lib/stockState.ts` (modify) + test | Export `lowThresholdFor` (extracted, not duplicated) |
| `mobile/src/lib/consumptionRate.ts` (create) + test | Per-item rate + daysUntilOut with honesty gates |
| `mobile/src/lib/shoppingDemand.ts` (create) + test | Four-source suggestions, merge + suppression |
| `mobile/src/types/track.ts` (modify) | `vendor_id`, `preferred_vendor_id`, `"shopping"` in `TrackingCategory` |
| `mobile/src/lib/supabase/inventory.ts` (modify) | `replaceItemLocations` → thin RPC wrapper |
| `mobile/src/components/track/EditFoodScreen.tsx` (modify) | Wrapper call sites; preferred-vendor picker |
| `mobile/src/lib/supabase/shopping.ts` (create) | All shopping_list I/O + engine-input assembly |
| `mobile/app/(tabs)/track/index.tsx`, `_layout.tsx`, `shopping/index.tsx` (modify/create) | Hub card + route |
| `mobile/src/components/track/ShoppingListScreen.tsx` (create) | The surface |
| `mobile/src/components/track/FoodInventoryScreen.tsx` (modify) | Rewired add-to-list; "~Nd left" line |
| `mobile/src/components/profile/nutrition/VendorsSection.tsx` (modify) | Name/URL editors, tappable links |

Reference reading: the spec; `mobile/src/lib/stockState.ts` + `shoppingDemand`'s sibling libs for house style; `mobile/src/lib/supabase/inventory.ts:88-160` (the wrapper being replaced — its comments explain what the RPC fixes); `eatNext.ts:88-161` (why assemblability call sites are not shared); Phase 4's plan amendments Task 4 (the RPC's mandate).

---

### Task 1: The migration

**Files:**
- Create: `supabase/migrations/20260731100000_shopping_intelligence.sql`

Do **not** apply — Task 10 is the owner gate.

- [ ] **Step 1: Write the migration**

```sql
-- Nutrition OS Phase 5: shopping intelligence schema.
-- Spec: docs/superpowers/specs/2026-07-30-nutrition-shopping-intelligence-design.md §5
--
-- (1) Vendor FKs: food_inventory.preferred_vendor_id (product default) and
--     shopping_list.vendor_id (per-row snapshot, stamped at add time,
--     overridable). Phase 1 reserved exactly this: "the shopping phase adds
--     FKs into it." No new indexes — both tables are tens of rows.
-- (2) Drop shopping_list.category: never written by anything, absent from
--     the TS type since it was authored, duplicates the category system.
--     Emptiness-guarded (meal_template_id precedent).
-- (3) replace_item_locations: the atomic replacement Phase 4's Task 4
--     amendment scheduled for this phase. One transaction ends the
--     delete→insert→resync client sequence whose partial failure could
--     strand a half-written item; the locations-as-truth invariant gets
--     ongoing enforcement.

alter table public.food_inventory
  add column if not exists preferred_vendor_id uuid
  references public.nutrition_vendors(id) on delete set null;

alter table public.shopping_list
  add column if not exists vendor_id uuid
  references public.nutrition_vendors(id) on delete set null;

do $$
declare
  v_nonnull integer;
begin
  select count(*) into v_nonnull from public.shopping_list where category is not null;
  if v_nonnull > 0 then
    raise exception 'shopping_list.category has % non-null rows — refusing to drop', v_nonnull;
  end if;
  raise notice 'shopping_list.category guard: % non-null rows found — safe to drop', v_nonnull;
end $$;

alter table public.shopping_list drop column if exists category;

create or replace function public.replace_item_locations(
  p_item_id uuid,
  p_rows jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  r jsonb;
  v_total integer := 0;
  v_qty integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'p_rows must be a non-empty JSON array — an item must keep >= 1 location row';
  end if;

  -- security invoker: RLS on food_inventory scopes this read, so a caller
  -- can only resolve (and therefore only rewrite) their own items.
  select fi.user_id into v_user_id from public.food_inventory fi where fi.id = p_item_id for update;
  if v_user_id is null then
    raise exception 'inventory item % not found', p_item_id;
  end if;

  -- Validate every row up front, so a bad element raises this message
  -- rather than a raw constraint violation once the insert reaches it.
  for r in select * from jsonb_array_elements(p_rows) loop
    if (r->>'location') is null
       or (r->>'location') not in ('fridge','freezer','pantry','cabinet') then
      raise exception 'invalid location: %', r->>'location';
    end if;
    v_qty := (r->>'quantity')::integer;
    if v_qty is null or v_qty < 0 then
      raise exception 'quantity must be a non-negative integer';
    end if;
    if jsonb_typeof(r->'is_ready_to_consume') is distinct from 'boolean' then
      raise exception 'is_ready_to_consume must be a boolean';
    end if;
  end loop;

  delete from public.food_inventory_locations where food_inventory_id = p_item_id;

  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.food_inventory_locations
      (food_inventory_id, user_id, location, quantity, is_ready_to_consume, notes)
    values
      (p_item_id, v_user_id, r->>'location', (r->>'quantity')::integer,
       (r->>'is_ready_to_consume')::boolean, r->>'notes');
    v_total := v_total + (r->>'quantity')::integer;
  end loop;

  update public.food_inventory set quantity = v_total where id = p_item_id;
end;
$$;

revoke all on function public.replace_item_locations(uuid, jsonb) from public;
revoke execute on function public.replace_item_locations(uuid, jsonb) from anon;
grant execute on function public.replace_item_locations(uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Static checks** — quotes/parens balance; `grep -rn "replace_item_locations" supabase/migrations/` → only this file; every statement idempotent or guarded.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260731100000_shopping_intelligence.sql
git commit -m "feat(nutrition-os): vendor FKs, drop dead category column, atomic replace_item_locations"
```

---

### Task 2: `lowThresholdFor` export (TDD, tiny)

**Files:**
- Modify: `mobile/src/lib/stockState.ts` (~:95-99)
- Test: `mobile/src/lib/__tests__/stockState.test.ts` (append)

The demand engine needs the threshold *value*; `projectItemStock` computes it inline. Extract — one definition, not a copy.

- [ ] **Step 1: Append the failing tests**

```ts
// append to mobile/src/lib/__tests__/stockState.test.ts
import { lowThresholdFor } from "../stockState";

describe("lowThresholdFor", () => {
  it("single-location → restock_threshold", () => {
    expect(lowThresholdFor(item({ storage_type: "single-location", restock_threshold: 4 }))).toBe(4);
  });
  it("multi-location → total_restock_threshold; nulls → 0", () => {
    expect(lowThresholdFor(item({ total_restock_threshold: 6 }))).toBe(6);
    expect(lowThresholdFor(item({ total_restock_threshold: null }))).toBe(0);
    expect(lowThresholdFor(item({ storage_type: "single-location", restock_threshold: null }))).toBe(0);
  });
});
```

- [ ] **Step 2: Run — FAIL (no export)**

- [ ] **Step 3: Implement** — in `stockState.ts`, add above `projectItemStock`:

```ts
/** The threshold `isLow` compares against — exported for the demand engine's
 *  restock-quantity math (spec §6). One definition; projectItemStock uses it. */
export function lowThresholdFor(item: StockItemInput): number {
  return item.storage_type === "single-location"
    ? item.restock_threshold ?? 0
    : item.total_restock_threshold ?? 0;
}
```

and replace the inline `const lowThreshold = single ? … : …` in `projectItemStock` with `const lowThreshold = lowThresholdFor(item);` (keep the `single` const — `needsFridgeRestock` still uses it).

- [ ] **Step 4: Run — PASS (all stockState tests); tsc 0. Commit**

```bash
git add mobile/src/lib/stockState.ts mobile/src/lib/__tests__/stockState.test.ts
git commit -m "refactor(nutrition-os): extract lowThresholdFor (one threshold definition)"
```

---

### Task 3: `consumptionRate.ts` (TDD)

**Files:**
- Create: `mobile/src/lib/consumptionRate.ts`
- Test: `mobile/src/lib/__tests__/consumptionRate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/consumptionRate.test.ts
import {
  estimateConsumption,
  RATE_WINDOW_DAYS,
  MIN_UNITS,
  MIN_SPAN_DAYS,
  type DecrementEvent,
} from "../consumptionRate";

const TODAY = "2026-07-30";
// dateLocal N days before TODAY (local-date arithmetic, matching the lib's).
// Derived from TODAY itself (not a second hardcoded literal) so there is one
// source of truth for the anchor every assertion in this file hangs off; the
// noon anchor and the independence from the lib's own daysBetweenLocalDates
// implementation are both intentional and preserved.
const daysAgo = (n: number): string => {
  const [y, m, d] = TODAY.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() - n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
const ev = (inventoryId: string, n: number): DecrementEvent => ({ inventoryId, dateLocal: daysAgo(n) });

const run = (events: DecrementEvent[], total = 10) =>
  estimateConsumption({
    events,
    totalsById: new Map([["a", total]]),
    todayLocalDate: TODAY,
  });

describe("estimateConsumption", () => {
  it("computes rate over the window and ceil(total/rate)", () => {
    // 4 units in 28 days → 1/7 per day; total 10 → ceil(70) = 70
    const r = run([ev("a", 20), ev("a", 15), ev("a", 10), ev("a", 2)]);
    expect(r.get("a")).toEqual({ ratePerDay: 4 / RATE_WINDOW_DAYS, daysUntilOut: 70 });
  });

  it(`gate: fewer than MIN_UNITS (${MIN_UNITS}) in-window units → no estimate`, () => {
    expect(run([ev("a", 20), ev("a", 10)]).has("a")).toBe(false);          // 2 < 3
    expect(run([ev("a", 20), ev("a", 15), ev("a", 10)]).has("a")).toBe(true); // exactly 3
  });

  it(`gate: history span under MIN_SPAN_DAYS (${MIN_SPAN_DAYS}) → no estimate`, () => {
    expect(run([ev("a", 13), ev("a", 7), ev("a", 2)]).has("a")).toBe(false);  // span 13
    expect(run([ev("a", 14), ev("a", 7), ev("a", 2)]).has("a")).toBe(true);   // span exactly 14
  });

  it("an event outside the window doesn't count toward units but DOES span", () => {
    // day-30 event: excluded from the 28-day unit count, but proves history depth.
    const r = run([ev("a", 30), ev("a", 6), ev("a", 4), ev("a", 2)]);
    expect(r.get("a")!.ratePerDay).toBe(3 / RATE_WINDOW_DAYS);
  });

  it("window boundary: day RATE_WINDOW_DAYS−1 counts, day RATE_WINDOW_DAYS doesn't", () => {
    const inWin = run([ev("a", RATE_WINDOW_DAYS - 1), ev("a", 20), ev("a", 2)]);
    expect(inWin.has("a")).toBe(true); // 3 units
    const outWin = run([ev("a", RATE_WINDOW_DAYS), ev("a", 20), ev("a", 2)]);
    expect(outWin.has("a")).toBe(false); // only 2 in window
  });

  it("already out → daysUntilOut 0", () => {
    const r = run([ev("a", 20), ev("a", 10), ev("a", 2)], 0);
    expect(r.get("a")!.daysUntilOut).toBe(0);
  });

  it("no events / unknown item → empty map entry absent", () => {
    expect(run([]).size).toBe(0);
    const r = estimateConsumption({
      events: [ev("b", 5), ev("b", 4), ev("b", 3)],
      totalsById: new Map([["a", 10]]), // b has events but no total → skipped
      todayLocalDate: TODAY,
    });
    expect(r.size).toBe(0);
  });

  it("rejects a non-finite event age instead of letting it silently clear the span gate", () => {
    // A malformed/empty dateLocal makes daysBetweenLocalDates return NaN.
    // Unguarded, NaN < 0 is false (so the event isn't dropped) and
    // Math.max(...ages) becomes NaN, and NaN < MIN_SPAN_DAYS is ALSO false —
    // so the span gate silently passes. The real span here (day 0 to day 2)
    // is only 2 days, well under MIN_SPAN_DAYS, so this must NOT estimate.
    const events: DecrementEvent[] = [
      { inventoryId: "a", dateLocal: "" },
      ev("a", 0),
      ev("a", 1),
      ev("a", 2),
    ];
    expect(run(events).has("a")).toBe(false);
  });

  it("rounds daysUntilOut up (ceil), not down or to nearest", () => {
    // 3 in-window units (span 18, clears both gates) → rate 3/28;
    // total 10 → 10 / (3/28) = 93.33... → ceil is 94, floor would be 93.
    const r = run([ev("a", 20), ev("a", 15), ev("a", 2)]);
    expect(r.get("a")!.daysUntilOut).toBe(94);
  });

  it("rejects future-dated events (never fabricates demand from a clock/timezone skew)", () => {
    // Ages [-11, 10, 25]: with the guard, only 10 and 25 are legitimate
    // in-window units (2 < MIN_UNITS) → no estimate. Without the guard, the
    // future-dated event would count as a third in-window unit and produce one.
    const events: DecrementEvent[] = [ev("a", -11), ev("a", 10), ev("a", 25)];
    expect(run(events).has("a")).toBe(false);
  });

  it("counts a same-day (age 0) event toward the window, not just strictly-past ones", () => {
    // Ages [0, 14, 20]: age 0 is a meal logged today. If the future-date
    // guard were age <= 0 instead of age < 0, this event would be dropped,
    // leaving only 2 in-window units (< MIN_UNITS) and no estimate at all —
    // a real day's log shouldn't be invisible for the rest of that day.
    const r = run([ev("a", 0), ev("a", 14), ev("a", 20)]);
    expect(r.get("a")).toEqual({ ratePerDay: 3 / RATE_WINDOW_DAYS, daysUntilOut: 94 });
  });
});
```

- [ ] **Step 2: Run — FAIL (module not found)**

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/consumptionRate.ts
// Per-item consumption estimates (Nutrition OS Phase 5, spec §7). Pure.
//
// The honesty gates ARE the design: an estimate exists only with >= MIN_UNITS
// consumed inside the trailing window AND >= MIN_SPAN_DAYS of event history.
// Below that: no map entry, and the UI shows nothing — null beats a
// confident wrong number.
//
// Known bias, documented not hidden: (1) units are CONTAINERS, not servings —
// half-finishing a bottle counts the same as finishing it; (2) the Phase 4
// pre-apply gap window (zero-location items logged without decrements)
// undercounts; (3) ratePerDay divides unitsInWindow by the FULL
// RATE_WINDOW_DAYS even when the item's actual history is shorter — the
// MIN_SPAN_DAYS gate bounds this to a known factor (span >= MIN_SPAN_DAYS,
// window = RATE_WINDOW_DAYS, so the worst-case underestimate of the true
// rate is RATE_WINDOW_DAYS / MIN_SPAN_DAYS = 2x), and it's biased in the
// conservative direction for suggest-confirm: rate reads low, daysUntilOut
// reads high, so the failure mode is a missed suggestion, never a spurious
// one. (1)-(3) are all UNDER-count sources. (4) is not: the caller's events
// come from meal_logs.inventory_items, which records what a meal log CLAIMED
// against inventory, not what the consume RPC actually took
// (lib/supabase/mealLibrary.ts:417-422) — a failed decrement
// (MealLoggedButDecrementFailed, deliberately not cleaned up) or a
// resolve/consume stale-read race can leave a row claiming a unit that was
// never really removed from stock. Phantom claimed units inflate ratePerDay
// and deflate daysUntilOut, and near the MIN_UNITS boundary can manufacture
// an estimate — and a spurious forecast suggestion — for an item that wasn't
// actually being drawn down that fast. No cheap fix: actual decrements
// aren't persisted anywhere this lib could read instead, so this bias is
// carried, not corrected. This is a heuristic, not calibrated science.
import { daysBetweenLocalDates } from "./stockState";
import type { InventoryUsage } from "@/src/types/track";

export const RATE_WINDOW_DAYS = 28;
export const MIN_UNITS = 3;
export const MIN_SPAN_DAYS = 14;

// Expressed as a multiple of RATE_WINDOW_DAYS, not a bare literal, because
// that relationship is what makes the value defensible — retuning the
// window keeps the horizon at the same implied error bar instead of
// silently becoming some other fraction of a window. The bar itself: since
// spanDays is always >= MIN_SPAN_DAYS and the divisor is RATE_WINDOW_DAYS,
// every displayed daysUntilOut = n carries an implicit interval of
// [n/2, n] (the bias-3 note above, worst case 2x). At n = MAX_DISPLAY_DAYS
// (= 60 today) that's a 30-day band — already at the edge of actionable.
// Left unbounded, at n = 934 (a real measured case for a 100-count item on
// 3 logs) the interval is [467, 934]: three-digit precision the gates can't
// stand behind. Two windows is exactly where the error bar swamps the
// resolution. The lib still returns the true value below — daysUntilOut is
// NOT capped here, because the demand engine (spec §6) needs the real number
// and capping it in the lib would corrupt that input. This constant governs
// rendering only: surfaces should omit the "~Nd left" line rather than print
// a number the honesty gates can't actually stand behind.
export const MAX_DISPLAY_DAYS = RATE_WINDOW_DAYS * 2;

export interface DecrementEvent {
  inventoryId: string;
  dateLocal: string; // YYYY-MM-DD, the meal log's local date
}

export interface ConsumptionEstimate {
  ratePerDay: number;
  daysUntilOut: number;
}

// A `meal_logs` row's `inventory_items` is unvalidated JSONB (no DB-side
// shape check), so the expansion below is defensive: a non-array value must
// not throw out of `for…of` and take the whole caller down with it, and a
// malformed `quantity` (huge, negative, or fractional) must not grow the
// output without bound. This is hardening, not a bug fix — every writer,
// current and historical, hardcodes `quantity: 1`
// (`lib/supabase/mealLibrary.ts:423`, `components/track/MealsScreen.tsx:568-570`,
// and no other writer exists anywhere in the repo's history), so the inner
// loop below is currently dead generality.
export const MAX_CLAIMED_UNITS_PER_ROW = 1000;

/**
 * One `DecrementEvent` per unit a `meal_logs` row CLAIMS against an inventory
 * item — not a confirmed decrement. `inventory_items` records intent, not
 * outcome (`lib/supabase/mealLibrary.ts:417-422`): a row can claim a unit
 * that was never actually taken, e.g. a failed `consume_inventory_units`
 * call (`mealLibrary.ts:441-453`, deliberately not cleaned up) or a
 * stale-read race in `resolveInventoryMatches`. See the 4th bias in this
 * file's header for what that costs the estimate below. Pure, so it lives
 * here (not in `lib/supabase/shopping.ts`, its only caller) — this is the
 * one file in the pure-lib layer that owns `DecrementEvent`, and keeping the
 * adapter beside the type it produces is what makes it reachable by Jest
 * (`jest.config.js` scopes suites to pure TypeScript libs with no React
 * Native imports; `shopping.ts` pulls in `../supabase` → `expo-secure-store`
 * at module load, which is exactly what that scope excludes).
 */
export function expandDecrementEvents(
  rows: Array<{ date: string; inventory_items: InventoryUsage[] | null }>,
): DecrementEvent[] {
  const events: DecrementEvent[] = [];
  for (const log of rows) {
    if (!Array.isArray(log.inventory_items)) continue; // malformed JSONB — never throw the caller down over it
    for (const u of log.inventory_items) {
      const claimed = Math.min(Math.max(Math.trunc(u.quantity), 0), MAX_CLAIMED_UNITS_PER_ROW);
      for (let i = 0; i < claimed; i++) {
        events.push({ inventoryId: u.id, dateLocal: log.date });
      }
    }
  }
  return events;
}

export function estimateConsumption(opts: {
  events: DecrementEvent[];
  totalsById: Map<string, number>;
  todayLocalDate: string;
}): Map<string, ConsumptionEstimate> {
  const { events, totalsById, todayLocalDate } = opts;
  const byItem = new Map<string, number[]>(); // ages in days
  for (const e of events) {
    const age = daysBetweenLocalDates(e.dateLocal, todayLocalDate);
    // Reject non-finite ages (a malformed/empty dateLocal makes
    // daysBetweenLocalDates return NaN, which is falsy in every comparison —
    // NaN < 0 is false, and unguarded it would silently clear the
    // MIN_SPAN_DAYS gate below; see stockState.ts:125-129 for the sibling
    // hazard) together with future-dated logs, which never count either.
    if (!Number.isFinite(age) || age < 0) continue;
    const arr = byItem.get(e.inventoryId) ?? [];
    arr.push(age);
    byItem.set(e.inventoryId, arr);
  }

  const out = new Map<string, ConsumptionEstimate>();
  for (const [inventoryId, ages] of byItem) {
    const total = totalsById.get(inventoryId);
    if (total === undefined) continue;
    const unitsInWindow = ages.filter((a) => a < RATE_WINDOW_DAYS).length;
    const spanDays = Math.max(...ages);
    if (unitsInWindow < MIN_UNITS || spanDays < MIN_SPAN_DAYS) continue;
    const ratePerDay = unitsInWindow / RATE_WINDOW_DAYS;
    out.set(inventoryId, {
      ratePerDay,
      daysUntilOut: total <= 0 ? 0 : Math.ceil(total / ratePerDay),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run — PASS; tsc 0. Commit**

```bash
git add mobile/src/lib/consumptionRate.ts mobile/src/lib/__tests__/consumptionRate.test.ts
git commit -m "feat(nutrition-os): consumption-rate estimates with honesty gates"
```

---

### Task 4: `shoppingDemand.ts` (TDD)

**Files:**
- Create: `mobile/src/lib/shoppingDemand.ts`
- Test: `mobile/src/lib/__tests__/shoppingDemand.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/shoppingDemand.test.ts
import {
  computeShoppingSuggestions,
  FORECAST_LEAD_DAYS,
  type DemandInventoryItem,
} from "../shoppingDemand";
import type { ConsumptionEstimate } from "../consumptionRate";

let n = 0;
const item = (over: Partial<DemandInventoryItem> = {}): DemandInventoryItem => ({
  id: `i${n++}`,
  name: `Item ${n}`,
  unit: "bottle",
  preferredVendorId: "v1",
  lowThreshold: 2,
  totalQuantity: 5,
  isOut: false,
  isLow: false,
  ...over,
});
const run = (opts: Partial<Parameters<typeof computeShoppingSuggestions>[0]>) =>
  computeShoppingSuggestions({
    items: [], mealGaps: [], rates: new Map<string, ConsumptionEstimate>(), unpurchased: [], ...opts,
  });

beforeEach(() => { n = 0; });

describe("sources", () => {
  it("out of stock → priority 1, threshold-exit quantity, reason", () => {
    const [s] = run({ items: [item({ totalQuantity: 0, isOut: true, lowThreshold: 2 })] });
    expect(s).toMatchObject({ priority: 1, quantity: 3, reasons: ["out of stock"] }); // 2−0+1
  });
  it("threshold 0 out-of-stock still suggests quantity 1", () => {
    const [s] = run({ items: [item({ totalQuantity: 0, isOut: true, lowThreshold: 0 })] });
    expect(s.quantity).toBe(1);
  });
  it("low stock → priority 2 with count in reason", () => {
    const [s] = run({ items: [item({ totalQuantity: 2, isLow: true, lowThreshold: 3 })] });
    expect(s).toMatchObject({ priority: 2, quantity: 2, reasons: ["below threshold (2 left)"] });
  });
  it("missing-for-meal without inventory match → name-only row, priority 1", () => {
    const [s] = run({ mealGaps: [{ mealName: "Korean Beef Bowl", missing: ["Korean BBQ Sauce"] }] });
    expect(s).toMatchObject({
      name: "Korean BBQ Sauce", foodInventoryId: null, vendorId: null,
      quantity: 1, unit: null, priority: 1, reasons: ["needed for Korean Beef Bowl"],
    });
  });
  it("missing name matching an inventory item adopts its id/vendor/unit", () => {
    const boost = item({ name: "Boost Very High Calorie" });
    const [s] = run({
      items: [boost],
      mealGaps: [{ mealName: "Boost + Cashews", missing: ["boost very high calorie"] }],
    });
    expect(s.foodInventoryId).toBe(boost.id);
    expect(s.vendorId).toBe("v1");
    expect(s.unit).toBe("bottle");
  });
  it("byName's folded-name lookup is last-wins on a collision between two inventory items: the meal-gap reason attaches to whichever came later in `items` (deliberate, per the comment at the byName construction site — not an oversight)", () => {
    const first = item({ name: "Ground Beef" });
    const second = item({ name: "Ground Beef" });
    const got = run({
      items: [first, second],
      mealGaps: [{ mealName: "Taco Bowl", missing: ["Ground Beef"] }],
    });
    expect(got).toHaveLength(1);
    expect(got[0].foodInventoryId).toBe(second.id);
  });
  it(`forecast → priority 3 only when daysUntilOut <= ${FORECAST_LEAD_DAYS} and not low/out`, () => {
    const soon = item({});
    const later = item({});
    const alreadyLow = item({ isLow: true, totalQuantity: 1, lowThreshold: 2 });
    const alreadyOut = item({ isOut: true, totalQuantity: 0, lowThreshold: 2 });
    const rates = new Map<string, ConsumptionEstimate>([
      [soon.id, { ratePerDay: 1, daysUntilOut: FORECAST_LEAD_DAYS }],
      [later.id, { ratePerDay: 1, daysUntilOut: FORECAST_LEAD_DAYS + 1 }],
      [alreadyLow.id, { ratePerDay: 1, daysUntilOut: 1 }],
      [alreadyOut.id, { ratePerDay: 1, daysUntilOut: 1 }],
    ]);
    const got = run({ items: [soon, later, alreadyLow, alreadyOut], rates });
    const forecastOnly = got.find((s) => s.foodInventoryId === soon.id)!;
    expect(forecastOnly).toMatchObject({ priority: 3, quantity: 1 });
    expect(forecastOnly.reasons[0]).toBe(`~${FORECAST_LEAD_DAYS}d left at your pace`);
    expect(got.find((s) => s.foodInventoryId === later.id)).toBeUndefined();
    // alreadyLow must appear as the LOW source ONLY. min(2,3) stays 2
    // whether or not the forecast source also fires, so priority alone
    // can't prove the `it.isLow` guard half — only the reasons array
    // reveals whether a second, spurious forecast reason snuck in.
    const lowSuggestion = got.find((s) => s.foodInventoryId === alreadyLow.id)!;
    expect(lowSuggestion.priority).toBe(2);
    expect(lowSuggestion.reasons).toEqual(["below threshold (1 left)"]);
    // Same proof shape for the guard's `it.isOut` half.
    const outSuggestion = got.find((s) => s.foodInventoryId === alreadyOut.id)!;
    expect(outSuggestion.priority).toBe(1);
    expect(outSuggestion.reasons).toEqual(["out of stock"]);
  });
});

describe("merge + suppression", () => {
  it("cross-source merge: min priority, union reasons, threshold quantity wins", () => {
    const beef = item({ name: "Ground Beef", totalQuantity: 0, isOut: true, lowThreshold: 2 });
    const got = run({
      items: [beef],
      mealGaps: [
        { mealName: "Korean Beef Bowl", missing: ["Ground Beef"] },
        { mealName: "Taco Bowl", missing: ["Ground Beef"] },
      ],
    });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ priority: 1, quantity: 3 });
    expect(got[0].reasons).toEqual([
      "out of stock", "needed for Korean Beef Bowl", "needed for Taco Bowl",
    ]);
  });
  it("cross-priority merge takes the min, not the max: a meal gap (p1) merged with the low source (p2) stays p1", () => {
    const beef = item({ name: "Ground Beef", isLow: true, totalQuantity: 1, lowThreshold: 2 });
    const got = run({
      items: [beef],
      mealGaps: [{ mealName: "Taco Bowl", missing: ["Ground Beef"] }],
    });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ priority: 1, quantity: 2 }); // 2−1+1
    expect(got[0].reasons).toEqual(["needed for Taco Bowl", "below threshold (1 left)"]);
  });
  it("suppressed by an unpurchased row matching by id", () => {
    const beef = item({ totalQuantity: 0, isOut: true });
    expect(run({
      items: [beef],
      unpurchased: [{ foodInventoryId: beef.id, name: "whatever" }],
    })).toHaveLength(0);
  });
  it("suppressed by an unpurchased row matching by case-folded name (name-only rows)", () => {
    expect(run({
      mealGaps: [{ mealName: "PB&J", missing: ["Grape Jelly"] }],
      unpurchased: [{ foodInventoryId: null, name: "  grape jelly " }],
    })).toHaveLength(0);
  });
  it("a null-id unpurchased row still suppresses an id-carrying suggestion by name (manual entry, or an ON DELETE SET NULL orphan)", () => {
    const beef = item({ name: "Ground Beef", totalQuantity: 0, isOut: true });
    expect(run({
      items: [beef],
      unpurchased: [{ foodInventoryId: null, name: "ground beef" }],
    })).toHaveLength(0);
  });
  it("suppression is per-row: an id-carrying unpurchased row does NOT suppress by name — food_inventory has no unique constraint on name, so a different item sharing the name must still surface", () => {
    const a = item({ name: "Ground Beef", totalQuantity: 0, isOut: true });
    const b = item({ name: "Ground Beef", totalQuantity: 0, isOut: true });
    const got = run({
      items: [a, b],
      unpurchased: [{ foodInventoryId: a.id, name: "Ground Beef" }],
    });
    // a is suppressed by id; b is a distinct item and must not be swept up
    // by a's name via an unfiltered name-suppression set.
    expect(got).toHaveLength(1);
    expect(got[0].foodInventoryId).toBe(b.id);
  });
  it("purchased rows do NOT suppress (caller passes only unpurchased)", () => {
    // Contract test: the input is named `unpurchased` — this pins that a
    // suggestion re-appears once its row is purchased and thus absent here.
    const beef = item({ totalQuantity: 0, isOut: true });
    expect(run({ items: [beef], unpurchased: [] })).toHaveLength(1);
  });
  it("item-less meals suggest nothing (missing.length gate)", () => {
    expect(run({ mealGaps: [{ mealName: "Empty", missing: [] }] })).toHaveLength(0);
  });
  it("deterministic order: priority, then name", () => {
    const a = item({ name: "Zebra", totalQuantity: 0, isOut: true });
    const b = item({ name: "Apple", isLow: true, totalQuantity: 1 });
    const c = item({ name: "Mango", totalQuantity: 0, isOut: true });
    const got = run({ items: [b, a, c] });
    expect(got.map((s) => s.name)).toEqual(["Mango", "Zebra", "Apple"]);
  });
});
```

- [ ] **Step 2: Run — FAIL (module not found)**

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/shoppingDemand.ts
// Suggest-confirm shopping demand (Nutrition OS Phase 5, spec §6). Pure —
// sibling of stockState/eatNext/mealScore/rampProgress/conceptMatch/
// consumptionRate. Four sources with fixed priorities; two dedupe layers;
// nothing here writes anything — suggestions become shopping_list rows
// only when the owner taps.
import type { ConsumptionEstimate } from "./consumptionRate";

export const FORECAST_LEAD_DAYS = 3;

export interface DemandInventoryItem {
  id: string;
  name: string;
  unit: string | null;
  preferredVendorId: string | null;
  /** lowThresholdFor(item) — the same value isLow compares against. */
  lowThreshold: number;
  totalQuantity: number;
  isOut: boolean;
  isLow: boolean;
}

export interface MealGap {
  mealName: string;
  missing: string[];
}

export interface UnpurchasedRow {
  foodInventoryId: string | null;
  name: string;
}

export interface ShoppingSuggestion {
  name: string;
  foodInventoryId: string | null;
  vendorId: string | null;
  quantity: number;
  unit: string | null;
  priority: 1 | 2 | 3;
  reasons: string[];
}

const fold = (s: string) => s.trim().toLowerCase();

interface Draft extends ShoppingSuggestion {
  /** Threshold-formula quantities beat the default 1 on merge (spec §6). */
  thresholdQuantity: boolean;
}

export function computeShoppingSuggestions(opts: {
  items: DemandInventoryItem[];
  mealGaps: MealGap[];
  rates: Map<string, ConsumptionEstimate>;
  unpurchased: UnpurchasedRow[];
}): ShoppingSuggestion[] {
  const { items, mealGaps, rates, unpurchased } = opts;
  // last-wins on a folded-name collision between two inventory items: the
  // meal-gap reason attaches to whichever came later in `items`. Defensible
  // under the id-first merge identity (two distinct items still produce two
  // suggestions via their own id keys) — a deliberate choice, not an
  // oversight.
  const byName = new Map(items.map((it) => [fold(it.name), it]));

  // key = inventory id when known, else folded name (the merge identity).
  const drafts = new Map<string, Draft>();

  const upsert = (
    key: string,
    base: Omit<Draft, "priority" | "reasons" | "quantity" | "thresholdQuantity">,
    priority: 1 | 2 | 3,
    reason: string,
    quantity: number,
    thresholdQuantity: boolean,
  ) => {
    const existing = drafts.get(key);
    if (!existing) {
      drafts.set(key, { ...base, priority, reasons: [reason], quantity, thresholdQuantity });
      return;
    }
    existing.priority = Math.min(existing.priority, priority) as 1 | 2 | 3;
    existing.reasons.push(reason);
    if (thresholdQuantity && !existing.thresholdQuantity) {
      existing.quantity = quantity;
      existing.thresholdQuantity = true;
    }
  };

  const itemBase = (it: DemandInventoryItem) => ({
    name: it.name,
    foodInventoryId: it.id,
    vendorId: it.preferredVendorId,
    unit: it.unit,
  });
  const exitLowQty = (it: DemandInventoryItem) =>
    Math.max(1, it.lowThreshold - it.totalQuantity + 1);

  // Source order fixes the reason ordering within a merged suggestion:
  // out → meals → low → forecast (spec §6 table order).
  for (const it of items) {
    if (it.isOut) upsert(it.id, itemBase(it), 1, "out of stock", exitLowQty(it), true);
  }
  for (const gap of mealGaps) {
    for (const missingName of gap.missing) {
      const match = byName.get(fold(missingName));
      const key = match ? match.id : fold(missingName);
      const base = match
        ? itemBase(match)
        : { name: missingName, foodInventoryId: null, vendorId: null, unit: null };
      upsert(key, base, 1, `needed for ${gap.mealName}`, 1, false);
    }
  }
  for (const it of items) {
    if (it.isLow) {
      upsert(it.id, itemBase(it), 2, `below threshold (${it.totalQuantity} left)`, exitLowQty(it), true);
    }
  }
  for (const it of items) {
    const est = rates.get(it.id);
    if (!est || it.isOut || it.isLow) continue;
    if (est.daysUntilOut <= FORECAST_LEAD_DAYS) {
      upsert(it.id, itemBase(it), 3, `~${est.daysUntilOut}d left at your pace`, 1, false);
    }
  }

  // Suppression: anything already on the (unpurchased) list. Per row, id
  // else name (spec §6) — a row with a known foodInventoryId suppresses by
  // id ONLY; a row without one (typed manually, or orphaned by a deleted
  // item via shopping_list.food_inventory_id's ON DELETE SET NULL)
  // suppresses by case-folded name. food_inventory has no unique constraint
  // on name, so folding every row's name into the suppression set — even
  // id-carrying rows — would let an unpurchased row for item A silently
  // drop a suggestion for a distinct item B that merely shares its name.
  // Accepted residual, the other direction: if an item is renamed after its
  // list row was created, that row's now-stale `name` won't id-match a
  // fresh name-only suggestion for the same item (e.g. a meal gap citing
  // the item's current display name) — a visible duplicate the owner can
  // decline in this suggest-confirm UI, not a silent drop. See the Task 4
  // amendment.
  const suppressedIds = new Set(
    unpurchased.map((r) => r.foodInventoryId).filter((x): x is string => x !== null),
  );
  const suppressedNames = new Set(
    unpurchased.filter((r) => r.foodInventoryId === null).map((r) => fold(r.name)),
  );

  return [...drafts.values()]
    .filter(
      (d) =>
        !(d.foodInventoryId !== null && suppressedIds.has(d.foodInventoryId)) &&
        !suppressedNames.has(fold(d.name)),
    )
    .map(({ thresholdQuantity: _tq, ...s }) => s)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run — PASS; tsc 0. Commit**

```bash
git add mobile/src/lib/shoppingDemand.ts mobile/src/lib/__tests__/shoppingDemand.test.ts
git commit -m "feat(nutrition-os): four-source shopping demand engine"
```

---

### Task 5: Types + `replaceItemLocations` RPC wrapper

**Files:**
- Modify: `mobile/src/types/track.ts` (`ShoppingListItem` ~:74-88, `FoodInventoryItem` ~:5-34, `TrackingCategory` ~:230-237)
- Modify: `mobile/src/lib/supabase/inventory.ts:88-160`
- Modify: `mobile/src/components/track/EditFoodScreen.tsx:728, :867` (call sites)
- Modify: `mobile/app/(tabs)/track/food-inventory/add.tsx` and `mobile/app/(tabs)/track/food-inventory/preview.tsx` — each builds a full `Omit<InventoryItemWithState, "state">` literal for a synthetic placeholder item, so `FoodInventoryItem` gaining a required `preferred_vendor_id` breaks both under `tsc` unless each literal also gains `preferred_vendor_id: null` (see execution amendment below — this pair was missing from the original file list).

- [ ] **Step 1: Types** — `ShoppingListItem` gains `vendor_id: string | null;` (after `food_inventory_id`); `FoodInventoryItem` gains `preferred_vendor_id: string | null;` (after `notes`); `TrackingCategory` union gains `| "shopping"`.

- [ ] **Step 2: Wrapper** — replace `replaceItemLocations` (`inventory.ts:88-160`, including its long non-atomicity comment block) with:

```ts
/**
 * Replace an item's location rows and resync the legacy cache — atomically,
 * via the replace_item_locations RPC (Phase 5; scheduled by Phase 4's Task 4
 * amendment). One transaction: the partial-failure divergence the previous
 * client-side delete→insert→resync sequence could produce is now impossible,
 * and the locations-as-truth invariant has ongoing server-side enforcement.
 * The RPC refuses empty arrays (an item must keep >= 1 location row) and
 * validates every row before any write.
 */
export async function replaceItemLocations(
  itemId: string,
  rows: Array<{ location: FoodLocation; quantity: number; is_ready_to_consume: boolean; notes?: string | null }>,
): Promise<void> {
  const { error } = await supabase.rpc("replace_item_locations", {
    p_item_id: itemId,
    p_rows: rows.map((r) => ({
      location: r.location,
      quantity: r.quantity,
      is_ready_to_consume: r.is_ready_to_consume,
      notes: r.notes ?? null,
    })),
  });
  if (error) throw error;
}
```

The `userId` parameter is gone — the RPC resolves ownership server-side. Update both call sites (`EditFoodScreen.tsx:728` and `:867`): `replaceItemLocations(user.id, foodItemId, locationRows)` → `replaceItemLocations(foodItemId, locationRows)`. Read the surrounding comment blocks at both sites (`:635-736`, `:855-867`) and trim any sentence that describes the now-dead client-sequence failure modes — replace with one line pointing at the RPC. Keep the surrounding error handling as-is (the RPC throwing lands in the same catches).

- [ ] **Step 3: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add mobile/src/types/track.ts mobile/src/lib/supabase/inventory.ts mobile/src/components/track/EditFoodScreen.tsx
git commit -m "feat(nutrition-os): shopping types; replaceItemLocations goes atomic via RPC"
```

---

### Task 6: `shopping.ts` query module

**Files:**
- Create: `mobile/src/lib/supabase/shopping.ts`

- [ ] **Step 1: Write the module**

```ts
// mobile/src/lib/supabase/shopping.ts
// All shopping_list I/O + engine-input assembly (Nutrition OS Phase 5).
// The screen renders what this returns; it never computes.
import { supabase } from "../supabase";
import {
  assessAssemblability,
  lowThresholdFor,
} from "../stockState";
import {
  estimateConsumption,
  expandDecrementEvents,
  RATE_WINDOW_DAYS,
  type ConsumptionEstimate,
  type DecrementEvent,
} from "../consumptionRate";
import {
  computeShoppingSuggestions,
  type ShoppingSuggestion,
} from "../shoppingDemand";
import { fetchInventoryWithState } from "./inventory";
import { fetchMealLibrary } from "./mealLibrary";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import type { InventoryUsage, ShoppingListItem } from "@/src/types/track";
// `src/lib/**` must not import from `src/components/**` — see the rule at
// `lib/dates.ts:1-9` (this module's own home, and the one prior edge that
// rule closed). Import the definition directly rather than through the
// components-tree re-export `mealsHelpers.ts` carries for its own callers.
import { getLocalDateString } from "../dates";

export interface ShoppingData {
  listRows: ShoppingListItem[];
  suggestions: ShoppingSuggestion[];
  vendors: NutritionVendor[];
  ratesById: Map<string, ConsumptionEstimate>;
  /** For the purchased→restock offer: itemId → target location id. */
  restockTargetByItemId: Map<string, string>;
}

/** The trailing meal_logs window expanded to one DecrementEvent per claimed unit. */
export async function fetchDecrementEvents(): Promise<DecrementEvent[]> {
  const since = new Date();
  since.setDate(since.getDate() - (RATE_WINDOW_DAYS + 7)); // small slack for span
  const { data, error } = await supabase
    .from("meal_logs")
    .select("date, inventory_items")
    .eq("uses_inventory", true)
    .gte("date", getLocalDateString(since));
  if (error) throw error;
  return expandDecrementEvents((data ?? []) as Array<{ date: string; inventory_items: InventoryUsage[] | null }>);
}

/**
 * Task 8's entry point (the "~Nd left" line on `FoodInventoryScreen`) — one
 * round trip, rates only. Not folded into `fetchShoppingData` because that
 * caller also needs `totalsById` derived from a concurrently-fetched
 * `inventory`; this one lets a caller who already has its own totals skip
 * the rest of `fetchShoppingData`'s work entirely.
 */
export async function fetchConsumptionRates(
  todayLocalDate: string,
  totalsById: Map<string, number>,
): Promise<Map<string, ConsumptionEstimate>> {
  return estimateConsumption({ events: await fetchDecrementEvents(), totalsById, todayLocalDate });
}

export async function fetchShoppingData(todayLocalDate: string): Promise<ShoppingData> {
  const [listRes, inventory, library, vendorsRes, events] = await Promise.all([
    supabase.from("shopping_list").select("*").order("created_at"),
    fetchInventoryWithState(todayLocalDate),
    fetchMealLibrary(),
    supabase.from("nutrition_vendors").select("*").order("display_order"),
    fetchDecrementEvents(),
  ]);
  // `fetchInventoryWithState` and `fetchMealLibrary` throw on their own
  // errors before returning (see each module's own Promise.all), so only the
  // two raw-query results here carry a `.error` to check; `events` is
  // already resolved data, having thrown internally if its own query failed.
  const errors = [listRes.error, vendorsRes.error].filter((e) => e !== null);
  if (errors.length > 0) {
    errors.slice(1).forEach((e) => console.error("fetchShoppingData:", e));
    throw errors[0];
  }

  const listRows = (listRes.data ?? []) as ShoppingListItem[];

  const ratesById = estimateConsumption({
    events,
    totalsById: new Map(inventory.map((it) => [it.id, it.state.totalQuantity])),
    todayLocalDate,
  });

  // Meal gaps: sanctioned additional CALL SITE of assessAssemblability, not a
  // fourth definition (see eatNext.ts's canonical comment). Gate on
  // missing.length > 0, not !assemblable (item-less meals must not suggest).
  const mealGaps = library.meals
    .map((meal) => ({
      mealName: meal.name,
      missing: assessAssemblability({
        items: meal.items.map((it) => ({
          savedFoodId: it.saved_food_id,
          name: it.savedFood.name,
          barcode: it.savedFood.barcode,
          conceptIds: library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
        })),
        inventory: library.inventory,
      }).missing,
    }))
    .filter((g) => g.missing.length > 0);

  const suggestions = computeShoppingSuggestions({
    items: inventory.map((it) => ({
      id: it.id,
      name: it.name,
      unit: it.unit,
      preferredVendorId: it.preferred_vendor_id,
      lowThreshold: lowThresholdFor(it),
      totalQuantity: it.state.totalQuantity,
      isOut: it.state.isOut,
      isLow: it.state.isLow,
    })),
    mealGaps,
    rates: ratesById,
    unpurchased: listRows
      .filter((r) => !r.is_purchased)
      .map((r) => ({ foodInventoryId: r.food_inventory_id, name: r.name })),
  });

  const restockTargetByItemId = new Map<string, string>();
  for (const it of inventory) {
    // `fetchInventoryWithState`'s locations select has no `.order()`
    // (inventory.ts:40), so "first location" is otherwise whichever row the
    // DB happens to return first — not stable across loads. Sort by id for a
    // deterministic pick (spec §8 sanctions "else its first location"; this
    // just defines "first").
    const sortedLocations = [...it.locations].sort((a, b) => a.id.localeCompare(b.id));
    const target =
      sortedLocations.find((l) => l.is_ready_to_consume) ?? sortedLocations[0];
    if (target) restockTargetByItemId.set(it.id, target.id);
  }

  return {
    listRows,
    suggestions,
    vendors: (vendorsRes.data ?? []) as NutritionVendor[],
    ratesById,
    restockTargetByItemId,
  };
}

// ── Mutations (throw for the alert idiom) ──────────────────────────────────

export async function addSuggestions(
  userId: string,
  suggestions: ShoppingSuggestion[],
): Promise<void> {
  if (suggestions.length === 0) return;
  const { error } = await supabase.from("shopping_list").insert(
    suggestions.map((s) => ({
      user_id: userId,
      food_inventory_id: s.foodInventoryId,
      name: s.name,
      quantity: s.quantity,
      unit: s.unit ?? "item",
      vendor_id: s.vendorId,
      priority: s.priority,
      notes: s.reasons.join(" · "),
    })),
  );
  if (error) throw error;
}

export async function updateListItem(
  id: string,
  patch: Partial<Pick<ShoppingListItem, "vendor_id" | "quantity" | "notes">>,
): Promise<void> {
  const { error } = await supabase.from("shopping_list").update(patch).eq("id", id);
  if (error) throw error;
}

export async function markPurchased(id: string): Promise<void> {
  const { error } = await supabase
    .from("shopping_list")
    .update({ is_purchased: true, purchased_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function unmarkPurchased(id: string): Promise<void> {
  const { error } = await supabase
    .from("shopping_list")
    .update({ is_purchased: false, purchased_at: null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteListItem(id: string): Promise<void> {
  const { error } = await supabase.from("shopping_list").delete().eq("id", id);
  if (error) throw error;
}

export async function clearPurchased(): Promise<void> {
  const { error } = await supabase.from("shopping_list").delete().eq("is_purchased", true);
  if (error) throw error;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd mobile && npx tsc --noEmit
git add mobile/src/lib/supabase/shopping.ts
git commit -m "feat(nutrition-os): shopping query module (fetch, engines, lifecycle)"
```

---

### Task 7: Track hub card + route + `ShoppingListScreen`

Design spec §9.2 names "memo rows" among this screen's house container patterns. That was not implemented — `renderRow` is a `useCallback`, which buys nothing without a `React.memo` row-component boundary, and the code block below has none. See the Task 7 amendment for the deliberate-deferral rationale; the spec heading has been corrected to say so.

**Files:**
- Modify: `mobile/app/(tabs)/track/index.tsx` (~:22-92 `trackingCategories` + `iconMap`)
- Modify: `mobile/app/(tabs)/track/_layout.tsx` (route declaration)
- Create: `mobile/app/(tabs)/track/shopping/index.tsx`
- Create: `mobile/src/components/track/ShoppingListScreen.tsx`

- [ ] **Step 1: Hub wiring** — in `track/index.tsx`, append to the nutrition group of `trackingCategories` (after `food-inventory`):

```ts
    {
      id: "shopping",
      title: "Shopping List",
      icon: "ShoppingCart",
      iconColor: "#14B8A6",
      backgroundColor: "rgba(20, 184, 166, 0.15)",
      section: "nutrition",
    },
```

Add `ShoppingCart` to the `lucide-react-native` import and to `iconMap`. In `_layout.tsx`, add `<Stack.Screen name="shopping/index" />` beside the food-inventory declarations. Route file:

```tsx
// mobile/app/(tabs)/track/shopping/index.tsx
import { router } from "expo-router";
import { ShoppingListScreen } from "@/src/components/track/ShoppingListScreen";

export default function ShoppingRoute() {
  return (
    <ShoppingListScreen
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/track"))}
    />
  );
}
```

- [ ] **Step 2: The screen**

```tsx
// mobile/src/components/track/ShoppingListScreen.tsx
// The first shopping surface (Nutrition OS Phase 5, spec §9.2). Renders what
// fetchShoppingData computes: Suggested (confirm-to-add), the list grouped
// by vendor with deep links, and the purchased lifecycle with restock-back.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, RefreshControl, SectionList, StatusBar,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ShoppingCart } from "lucide-react-native";
import { supabase } from "@/src/lib/supabase";
import type { ShoppingListItem } from "@/src/types/track";
import type { ShoppingSuggestion } from "@/src/lib/shoppingDemand";
import {
  addSuggestions, clearPurchased, deleteListItem, fetchShoppingData,
  markPurchased, unmarkPurchased, updateListItem, type ShoppingData,
} from "@/src/lib/supabase/shopping";
import { transferInventoryUnits } from "@/src/lib/supabase/inventory";
import { getLocalDateString } from "./meals/mealsHelpers";

const ANYWHERE = "__anywhere__";

type Row =
  | { kind: "suggestion"; suggestion: ShoppingSuggestion }
  | { kind: "item"; item: ShoppingListItem }
  | { kind: "purchased"; item: ShoppingListItem };

interface ShoppingListScreenProps {
  onClose: () => void;
}

export function ShoppingListScreen({ onClose }: ShoppingListScreenProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ShoppingData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPurchased, setShowPurchased] = useState(false);
  const [vendorPickerFor, setVendorPickerFor] = useState<string | null>(null);
  // Gates every mutating control while a run() is in flight. fetchShoppingData
  // is 13 Supabase round trips plus two engine passes (~0.5-2s on device), and
  // nothing else marks a row as "in progress" — without this a second tap
  // before the reload lands double-fires the mutation (see amendment Fix 2).
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      setData(await fetchShoppingData(getLocalDateString()));
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      if (!options?.silent) {
        Alert.alert("Failed to load shopping list", e instanceof Error ? e.message : "Unknown error");
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Returns whether fn() succeeded, so callers can gate follow-on work (e.g.
  // the restock offer) on an actual success rather than "we attempted it and
  // ate the error" (see amendment Fix 1).
  const run = useCallback(
    async (title: string, fn: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      try {
        await fn();
        await load();
        return true;
      } catch (e) {
        Alert.alert(title, e instanceof Error ? e.message : "Unknown error");
        await load({ silent: true });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const getUserId = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    return user.id;
  };

  const handleAdd = useCallback(
    (suggestions: ShoppingSuggestion[]) =>
      run("Failed to add", async () => addSuggestions(await getUserId(), suggestions)),
    [run],
  );

  const handlePurchase = useCallback(
    async (item: ShoppingListItem) => {
      const purchasedOk = await run("Failed to mark purchased", () => markPurchased(item.id));
      if (!purchasedOk) return;
      const targetLocationId = item.food_inventory_id
        ? data?.restockTargetByItemId.get(item.food_inventory_id)
        : undefined;
      if (item.food_inventory_id && targetLocationId) {
        Alert.alert("Purchased", `Add ${item.quantity} ${item.unit} to stock?`, [
          { text: "Not now", style: "cancel" },
          {
            text: "Add to stock",
            onPress: () =>
              run("Failed to restock", () =>
                transferInventoryUnits(item.food_inventory_id!, null, targetLocationId, item.quantity),
              ),
          },
        ]);
      }
    },
    [run, data],
  );

  const sections = useMemo(() => {
    if (!data) return [];
    const out: Array<{ key: string; title: string; url: string | null; data: Row[] }> = [];
    if (data.suggestions.length > 0) {
      out.push({
        key: "suggested",
        title: `Suggested (${data.suggestions.length})`,
        url: null,
        data: data.suggestions.map((s) => ({ kind: "suggestion" as const, suggestion: s })),
      });
    }
    const active = data.listRows.filter((r) => !r.is_purchased);
    const vendorSections = [
      ...data.vendors
        .filter((v) => v.is_active)
        .map((v) => ({ key: v.id, title: v.name, url: v.app_url })),
      { key: ANYWHERE, title: "Anywhere", url: null as string | null },
    ];
    for (const vs of vendorSections) {
      const rows = active.filter((r) =>
        vs.key === ANYWHERE
          ? r.vendor_id === null || !data.vendors.some((v) => v.id === r.vendor_id && v.is_active)
          : r.vendor_id === vs.key,
      );
      if (rows.length > 0) {
        out.push({ ...vs, data: rows.map((item) => ({ kind: "item" as const, item })) });
      }
    }
    const purchased = data.listRows.filter((r) => r.is_purchased);
    if (purchased.length > 0) {
      out.push({
        key: "purchased",
        title: `Purchased (${purchased.length})`,
        url: null,
        data: showPurchased ? purchased.map((item) => ({ kind: "purchased" as const, item })) : [],
      });
    }
    return out;
  }, [data, showPurchased]);

  const renderRow = useCallback(
    ({ item: row }: { item: Row }) => {
      if (row.kind === "suggestion") {
        const s = row.suggestion;
        return (
          <View style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowName} numberOfLines={1}>
                {s.name} <Text style={styles.rowQty}>×{s.quantity}</Text>
              </Text>
              <Text style={styles.rowReason} numberOfLines={2}>{s.reasons.join(" · ")}</Text>
            </View>
            <TouchableOpacity
              style={[styles.addButton, busy && styles.controlDisabled]}
              onPress={() => handleAdd([s])}
              disabled={busy}
            >
              <Text style={styles.addButtonText}>＋</Text>
            </TouchableOpacity>
          </View>
        );
      }
      const item = row.item;
      const purchased = row.kind === "purchased";
      return (
        <View>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.checkbox, purchased && styles.checkboxChecked, busy && styles.controlDisabled]}
              onPress={() =>
                purchased
                  ? run("Failed to restore", () => unmarkPurchased(item.id))
                  : handlePurchase(item)
              }
              disabled={busy}
            >
              {purchased && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
            <View style={styles.rowMain}>
              <Text style={[styles.rowName, purchased && styles.rowNamePurchased]} numberOfLines={1}>
                {item.name} <Text style={styles.rowQty}>×{item.quantity} {item.unit}</Text>
              </Text>
              {item.notes ? <Text style={styles.rowReason} numberOfLines={1}>{item.notes}</Text> : null}
            </View>
            {!purchased && (
              <TouchableOpacity
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => setVendorPickerFor((p) => (p === item.id ? null : item.id))}
              >
                <Text style={styles.vendorAction}>⇄</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() =>
                Alert.alert("Remove", `Remove "${item.name}" from the list?`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive",
                    onPress: () => run("Failed to remove", () => deleteListItem(item.id)) },
                ])
              }
              disabled={busy}
            >
              <Text style={[styles.deleteAction, busy && styles.controlDisabled]}>✕</Text>
            </TouchableOpacity>
          </View>
          {vendorPickerFor === item.id && data && (
            <View style={styles.vendorPicker}>
              {[...data.vendors.filter((v) => v.is_active), null].map((v) => {
                const selected = (v?.id ?? null) === item.vendor_id;
                return (
                  <TouchableOpacity
                    key={v?.id ?? ANYWHERE}
                    style={[styles.vendorChip, selected && styles.vendorChipSelected, busy && styles.controlDisabled]}
                    onPress={() => {
                      setVendorPickerFor(null);
                      run("Failed to set vendor", () =>
                        updateListItem(item.id, { vendor_id: v?.id ?? null }),
                      );
                    }}
                    disabled={busy}
                  >
                    <Text style={[styles.vendorChipText, selected && styles.vendorChipTextSelected]}>
                      {v?.name ?? "Anywhere"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      );
    },
    [data, vendorPickerFor, handleAdd, handlePurchase, run, busy],
  );

  let body: React.ReactNode;
  if (!data && loadFailed) {
    body = (
      <View style={styles.centerFill}>
        <Text style={styles.mutedText}>Couldn&apos;t load your shopping list.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!data) {
    body = (
      <View style={styles.centerFill}>
        <ActivityIndicator color="#14B8A6" />
      </View>
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(row) =>
          row.kind === "suggestion"
            ? `s:${row.suggestion.foodInventoryId ?? row.suggestion.name}`
            : row.item.id
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        renderItem={renderRow}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#14B8A6"
            colors={["#14B8A6"]}
            title="Pull to refresh"
            titleColor="#9CA3AF"
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            {section.key === "purchased" ? (
              <TouchableOpacity onPress={() => setShowPurchased((p) => !p)}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            )}
            {section.key === "suggested" && (
              <TouchableOpacity onPress={() => handleAdd(data!.suggestions)} disabled={busy}>
                <Text style={[styles.headerAction, busy && styles.controlDisabled]}>Add all</Text>
              </TouchableOpacity>
            )}
            {section.url && (
              <TouchableOpacity
                onPress={() =>
                  Linking.openURL(section.url!).catch((e) =>
                    Alert.alert("Failed to open link", e instanceof Error ? e.message : "Unknown error"),
                  )
                }
              >
                <Text style={styles.headerAction}>Open ↗</Text>
              </TouchableOpacity>
            )}
            {section.key === "purchased" && showPurchased && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Clear purchased", "Delete all purchased rows?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Clear", style: "destructive",
                      onPress: () => run("Failed to clear", () => clearPurchased()) },
                  ])
                }
                disabled={busy}
              >
                <Text style={[styles.deleteAction, busy && styles.controlDisabled]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.centerFill}>
            <ShoppingCart size={32} color="#374151" strokeWidth={2} />
            <Text style={[styles.mutedText, { marginTop: 12 }]}>
              Nothing to buy — stock looks good.
            </Text>
          </View>
        }
      />
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shopping List</Text>
          <View style={{ width: 32 }} />
        </View>
        {body}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0A0F1E" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#1F2937",
  },
  backButton: { width: 32 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#FFFFFF" },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: "700", color: "#9CA3AF",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  headerAction: { fontSize: 14, color: "#14B8A6", fontWeight: "600" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#111827", borderRadius: 12, borderWidth: 1, borderColor: "#1F2937",
    marginHorizontal: 16, marginBottom: 8, padding: 12,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  rowNamePurchased: { color: "#6B7280", textDecorationLine: "line-through" },
  rowQty: { fontSize: 13, fontWeight: "400", color: "#9CA3AF" },
  rowReason: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  addButton: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(20,184,166,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  addButtonText: { color: "#14B8A6", fontSize: 18, fontWeight: "700" },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#374151",
    alignItems: "center", justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#14B8A6", borderColor: "#14B8A6" },
  checkmark: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  vendorAction: { fontSize: 16, color: "#9CA3AF", paddingHorizontal: 4 },
  deleteAction: { fontSize: 14, color: "#F87171", paddingHorizontal: 4 },
  controlDisabled: { opacity: 0.5 },
  vendorPicker: {
    flexDirection: "row", flexWrap: "wrap", gap: 6,
    marginHorizontal: 16, marginTop: -4, marginBottom: 8,
  },
  vendorChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    borderWidth: 1, borderColor: "#374151",
  },
  vendorChipSelected: { backgroundColor: "rgba(20,184,166,0.15)", borderColor: "#14B8A6" },
  vendorChipText: { fontSize: 12, color: "#D1D5DB" },
  vendorChipTextSelected: { color: "#14B8A6", fontWeight: "600" },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  mutedText: { fontSize: 14, color: "#9CA3AF", textAlign: "center" },
  retryButton: {
    marginTop: 16, backgroundColor: "#14B8A6", borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  retryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
});
```

- [ ] **Step 3: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add "mobile/app/(tabs)/track/index.tsx" "mobile/app/(tabs)/track/_layout.tsx" "mobile/app/(tabs)/track/shopping/" mobile/src/components/track/ShoppingListScreen.tsx
git commit -m "feat(nutrition-os): Shopping List screen + Track hub card"
```

---

### Task 8: Inventory tie-ins

**Files:**
- Modify: `mobile/src/components/track/FoodInventoryScreen.tsx` (`handleAddToShoppingList` ~:170-196; action sheet ~:219-222; grid row quantity line)
- Modify: `mobile/src/components/track/EditFoodScreen.tsx` (preferred-vendor picker)

- [ ] **Step 1: Rewire the long-press add** — replace `handleAddToShoppingList`'s insert body with a call through the module, correct quantity, vendor stamped, guarded against duplicating itself (see the Task 8 amendment's Fix 1 for why the guard is load-bearing, not decoration):

```ts
    // In-flight guard, keyed by item id: the success alert only fires after
    // the insert returns, so a slow connection can leave a user with no
    // feedback long enough to long-press and tap "Add to Shopping List"
    // again before the first request lands. No unique constraint on
    // shopping_list stops two identical rows from landing, and un-gating
    // this action sheet entry below widens exposure to every item instead
    // of only out-of-stock ones.
    if (addingToShoppingListIds.current.has(item.id)) return;
    addingToShoppingListIds.current.add(item.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Belt-and-suspenders alongside the in-flight guard: a deliberate
      // second add always duplicates without this. Unpurchased rows only —
      // a purchased row doesn't mean one is already pending (spec §6).
      const { data: existing, error: existingError } = await supabase
        .from("shopping_list")
        .select("id")
        .eq("food_inventory_id", item.id)
        .eq("is_purchased", false)
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) {
        Alert.alert("Already on your list", `${item.name} is already on your shopping list.`);
        return;
      }

      await addSuggestions(user.id, [{
        name: item.name,
        foodInventoryId: item.id,
        vendorId: item.preferred_vendor_id ?? null,
        quantity: Math.max(1, lowThresholdFor(item) - item.state.totalQuantity + 1),
        unit: item.unit,
        priority: item.state.isOut ? 1 : 2,
        reasons: ["added from inventory"],
      }]);
      Alert.alert("Success", `${item.name} added to shopping list`);
    } catch (error: any) {
      console.error("Error adding to shopping list:", error);
      Alert.alert("Error", "Failed to add to shopping list");
    } finally {
      addingToShoppingListIds.current.delete(item.id);
    }
```

(Top-level imports: `addSuggestions` from `@/src/lib/supabase/shopping`, `lowThresholdFor` from `@/src/lib/stockState`. `addingToShoppingListIds` is a `useRef<Set<string>>(new Set())` alongside the screen's other refs/state — a ref, not state, since nothing renders off it. `?? null` on `vendorId`, not a bare read: `preferred_vendor_id` comes back `undefined`, not `null`, on rows fetched before the column-adding migration lands, since the untyped client casts through `as FoodInventoryItem[]` regardless of what the row actually has.) Un-gate the action-sheet entry: the `if (isOutOfStock)` splice (~:219-222) becomes unconditional (the option always appears) — and update the "Restock Fridge" insertion index that used to branch on `isOutOfStock ? 3 : 2`, now always `3`, since "Add to Shopping List" always occupies position 2. Keep the success/failure alerts.

- [ ] **Step 2: "~Nd left" line** — `FoodInventoryScreen` already fetches via `fetchInventoryWithState`; add a lightweight rates fetch alongside by calling `fetchConsumptionRates(todayLocalDate, totalsById)`, already exported from `mobile/src/lib/supabase/shopping.ts` (Task 6 built it precisely for this call site — it wraps `fetchDecrementEvents()` + `estimateConsumption()` in one round trip, so there is no events-expansion code to duplicate or lift here). Build `totalsById` the same way `fetchShoppingData` does: `new Map(items.map((it) => [it.id, it.state.totalQuantity]))` over the screen's own fetched inventory. Import `MAX_DISPLAY_DAYS` (and `type ConsumptionEstimate`, for the state) from `@/src/lib/consumptionRate`, and `fetchConsumptionRates` from `@/src/lib/supabase/shopping`. Store the result as `ratesById`. Gate the render on `MAX_DISPLAY_DAYS` **and** `daysUntilOut > 0` — beyond the horizon the estimate's error bar swamps its resolution (see the constant's comment in `consumptionRate.ts`), so the line must be omitted, not printed with a three-digit day count; at exactly 0 (an out-of-stock item can still carry an estimate) `~0d left` is technically correct but adds nothing next to `Qty: 0`, so it's suppressed too. Render, next to the existing quantity text on each grid card:

```tsx
              {ratesById.get(item.id) && ratesById.get(item.id)!.daysUntilOut > 0 && ratesById.get(item.id)!.daysUntilOut <= MAX_DISPLAY_DAYS && (
                <Text style={styles.forecastText}>
                  ~{ratesById.get(item.id)!.daysUntilOut}d left
                </Text>
              )}
```

with `forecastText: { fontSize: 11, color: "#14B8A6" }`.

`fetchInventory` is called from four places (mount, pull-to-refresh, the delete-failure revert, the restock-failure revert) with no cancellation between them, and this step makes it stay in flight one round trip longer (the rates fetch, sequenced after `items` since it needs `totalsById`). Guard it with a generation counter — a `useRef(0)` incremented once per call — and have both `setItems`/`setRatesById` no-op when their own call's generation has since been superseded by a newer one; see the Task 8 amendment's Fix 2 for the concrete clobber this closes (a slow mount fetch resolving after an optimistic delete, resurrecting the deleted row). While in there, flip `setLoading(false)`/`setRefreshing(false)` immediately after `setItems` succeeds rather than in a shared `finally` after the rates fetch, so the spinner clears the moment the grid has data instead of waiting on the decoration.

- [ ] **Step 3: Preferred-vendor picker in EditFoodScreen** — add state + fetch. The component's prop is `item`, not `foodItem` (see the Task 8 amendment — an earlier draft of this step used `foodItem` before that was checked against the actual signature):

```tsx
  const [preferredVendorId, setPreferredVendorId] = useState<string | null>(
    item.preferred_vendor_id ?? null,
  );
  const [vendors, setVendors] = useState<NutritionVendor[]>([]);
  useEffect(() => {
    fetchVendors();
  }, []);
```

with `fetchVendors` defined alongside the screen's other small fetchers (next to `fetchLocationEntries`), wrapped in `try`/`catch` like every other fetch in this file — a failure here is benign (the picker just falls back to rendering only "None"), but leaving it as the file's one unwrapped fetch was a consistency gap, not a live bug (supabase-js v2 resolves rather than rejects on fetch failure):

```tsx
  const fetchVendors = async () => {
    try {
      const { data, error } = await supabase
        .from("nutrition_vendors")
        .select("*")
        .order("display_order");
      if (error) throw error;
      setVendors((data ?? []) as NutritionVendor[]);
    } catch (error) {
      console.error("Error fetching vendors:", error);
    }
  };
```

(import `NutritionVendor` from `@/src/types/nutrition-preferences`; match the screen's existing seeding pattern for edit-vs-add — `item.preferred_vendor_id ?? null`, not a bare read, since the column comes back `undefined` rather than `null` on rows fetched before the migration lands).

Render in the **Quantity & Storage** section (`sectionKey="storage"`), after the Ready/Total Threshold fields and outside the single-location/multi-location branches (so it renders once, for both storage types) — **not** under Notes, where this step's first draft put it by following the adjacency clause ("after the notes field") literally. Notes is its own collapsed accordion, and burying the sole editor for a value three other surfaces read (the manual add, the demand engine, this same screen's own threshold math) inside it made the field hard to find. Storage is where the value's actual siblings live: `lowThresholdFor`, the restock thresholds immediately above it, and — once Step 2 lands — the "~Nd left" forecast that reads the same item. Reuse the screen's existing location-button styles for the chips — `styles.label` for the field label (the screen has no `styles.fieldLabel`; that name doesn't exist, see the amendment) and `styles.locationButton`/`locationButtonActive`/`locationButtonText`/`locationButtonTextActive` for the chips themselves:

```tsx
                <View style={styles.field}>
                  <Text style={styles.label}>Preferred vendor</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {/* Keep the current vendor in the list even if it's since
                        gone inactive (Task 9 adds the deactivate toggle) —
                        otherwise a deactivated vendor has no chip AND
                        doesn't match `null`, so nothing highlights and the
                        field silently reads as unset even though the value
                        is untouched. Labelled "(inactive)" so the state is
                        legible rather than just mysteriously present. */}
                    {[...vendors.filter((v) => v.is_active || v.id === preferredVendorId), null].map((v) => {
                      const selected = (v?.id ?? null) === preferredVendorId;
                      return (
                        <TouchableOpacity
                          key={v?.id ?? "none"}
                          style={[styles.locationButton, selected && styles.locationButtonActive]}
                          onPress={() => setPreferredVendorId(v?.id ?? null)}
                        >
                          <Text style={[styles.locationButtonText, selected && styles.locationButtonTextActive]}>
                            {v?.name ?? "None"}{v && !v.is_active ? " (inactive)" : ""}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
```

Finally, include `preferred_vendor_id: preferredVendorId` in the save's `itemData` object — it flows into both the create and update branches, since both spread/pass `itemData` as-is. This writes only `food_inventory.preferred_vendor_id` (the product default); it does not touch `shopping_list.vendor_id` (the per-row snapshot §9.2's vendor chip writes).

- [ ] **Step 4: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add mobile/src/components/track/FoodInventoryScreen.tsx mobile/src/components/track/EditFoodScreen.tsx mobile/src/lib/supabase/shopping.ts
git commit -m "feat(nutrition-os): inventory tie-ins — rewired add-to-list, forecast line, vendor picker"
```

---

### Task 9: `VendorsSection` editors

**Files:**
- Modify: `mobile/src/components/profile/nutrition/VendorsSection.tsx` (full rewrite, currently 31 lines)
- Modify: `mobile/src/components/profile/nutrition/NutritionPreferencesScreen.tsx` (pass an `onPatch` handler)

- [ ] **Step 1: Rewrite the section**

```tsx
// mobile/src/components/profile/nutrition/VendorsSection.tsx
import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

export type VendorPatch = { name?: string; app_url?: string | null };

interface VendorsSectionProps {
  vendors: NutritionVendor[];
  onToggleActive: (vendor: NutritionVendor, isActive: boolean) => void;
  onPatch: (vendor: NutritionVendor, patch: VendorPatch) => void;
}

// Matches a URI scheme prefix per RFC 3986 §3.1 (a letter, then any run of
// letters/digits/+/-/.), followed by ":" — e.g. "https:" or "instacart:".
// A bare host/path like "instacart.com" has no match and gets "https://"
// prefixed on save; a deep link like "instacart://" already has one and
// passes through untouched. This field is explicitly "App / web URL", so
// app schemes are a first-class case, not an edge case to strip.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
}

interface VendorRowProps {
  vendor: NutritionVendor;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: (vendor: NutritionVendor, isActive: boolean) => void;
  onPatch: (vendor: NutritionVendor, patch: VendorPatch) => void;
}

const VendorRow = React.memo(function VendorRow({
  vendor,
  expanded,
  onToggleExpand,
  onToggleActive,
  onPatch,
}: VendorRowProps) {
  const [name, setName] = useState(vendor.name);
  const [url, setUrl] = useState(vendor.app_url ?? "");

  // Same hazard ConceptRow.tsx documents for its form-note field: modal
  // teardown (Done button, Android back) unmounts this row without a
  // guaranteed native blur, and switching to another vendor row collapses
  // this one the same way — so onEndEditing alone can silently drop an
  // in-progress edit. This effect's cleanup is guaranteed to run on unmount
  // (and on every collapse, since it's keyed on `expanded`), giving one code
  // path that flushes a dirty edit regardless of how the row goes away.
  // `dirtyRef` avoids re-sending an edit onEndEditing already saved, and the
  // value comparison avoids sending a no-op patch for an edit that
  // round-tripped back to the original values. Crucially, `flush` never
  // collapses the row itself — closing is the header tap's job alone — so
  // moving focus between the Name and URL fields (both call `flush` on
  // blur) can't collapse the editor out from under the user.
  const dirtyRef = useRef(false);
  const latest = useRef({ vendor, onPatch, name, url });
  latest.current = { vendor, onPatch, name, url };

  const flush = () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const { vendor: v, onPatch: patch, name: n, url: u } = latest.current;
    const trimmedName = n.trim();
    const normalizedUrl = normalizeUrl(u);
    const patchObj: VendorPatch = {};
    if (trimmedName) {
      if (trimmedName !== v.name) patchObj.name = trimmedName;
    } else {
      // An empty name is never persisted (nutrition_vendors.name is NOT
      // NULL with no other guard) — reject it visibly by snapping the field
      // back to the last-saved name rather than silently discarding it.
      setName(v.name);
    }
    if (normalizedUrl !== u) setUrl(normalizedUrl);
    if ((normalizedUrl || null) !== v.app_url) patchObj.app_url = normalizedUrl || null;
    if (Object.keys(patchObj).length > 0) patch(v, patchObj);
  };

  useEffect(() => {
    return () => flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  return (
    <View>
      <View style={s.row}>
        <TouchableOpacity
          style={s.flexShrinkColumn}
          onPress={onToggleExpand}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.rowLabel}>{vendor.name}</Text>
          {vendor.app_url ? (
            <Text
              style={[s.mutedText, { color: colors.primary }]}
              onPress={() =>
                Linking.openURL(vendor.app_url!).catch((e) =>
                  Alert.alert("Failed to open link", e instanceof Error ? e.message : "Unknown error")
                )
              }
            >
              {vendor.app_url} ↗
            </Text>
          ) : null}
        </TouchableOpacity>
        <Switch
          value={vendor.is_active}
          onValueChange={(val) => onToggleActive(vendor, val)}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      {expanded && (
        <View style={{ marginBottom: 8 }}>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={(text) => {
              setName(text);
              dirtyRef.current = true;
            }}
            onEndEditing={flush}
            placeholder="Vendor name"
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={s.input}
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              dirtyRef.current = true;
            }}
            onEndEditing={flush}
            placeholder="App / web URL (optional)"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="URL"
            keyboardType="url"
          />
        </View>
      )}
    </View>
  );
});

export function VendorsSection({ vendors, onToggleActive, onPatch }: VendorsSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Vendors</Text>
      {vendors.map((v) => (
        <VendorRow
          key={v.id}
          vendor={v}
          expanded={expandedId === v.id}
          onToggleExpand={() => setExpandedId((prev) => (prev === v.id ? null : v.id))}
          onToggleActive={onToggleActive}
          onPatch={onPatch}
        />
      ))}
      <Text style={s.mutedText}>Tap a vendor to edit its name or link.</Text>
    </View>
  );
}
```

- [ ] **Step 2: Wire the handler** — in `NutritionPreferencesScreen.tsx`, next to `handleVendorToggle`:

```tsx
  const handleVendorPatch = useCallback(
    (vendor: NutritionVendor, patch: { name?: string; app_url?: string | null }) => {
      run("Failed to save vendor", () => updateVendor(vendor.id, patch));
    },
    [run]
  );
```

and pass `onPatch={handleVendorPatch}` to `<VendorsSection …/>`. (`updateVendor` has accepted `name`/`app_url` since Phase 1 — this is its first consumer.)

- [ ] **Step 3: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add mobile/src/components/profile/nutrition/VendorsSection.tsx mobile/src/components/profile/nutrition/NutritionPreferencesScreen.tsx
git commit -m "feat(nutrition-os): vendor name/URL editing + tappable links (Phase 1 gap closed)"
```

---

### Task 10: Apply migration to prod — ⚠️ OWNER GATE

**Do not execute without the owner's explicit go-ahead in the session.**

- [ ] **Step 1: Pre-flight (read-only).** `npx supabase migration list` → exactly `20260731100000_shopping_intelligence` pending (all `2026073…` and earlier APPLIED). Read-only queries: `shopping_list.category` is all-null (count = 0 non-null); the four `nutrition_vendors` rows exist; current `shopping_list` row count (expect small — historical manual adds).

- [ ] **Step 2: Apply.** `npx supabase db push --yes`. Expected: no guard exception; migration applies cleanly.

- [ ] **Step 3: Post-verify (read-only).** `preferred_vendor_id` / `vendor_id` columns exist with FKs to `nutrition_vendors` and `on delete set null`; `shopping_list.category` gone; `replace_item_locations` exists with `authenticated`-only execute (`anon` revoked); RLS unchanged on both tables.

---

### Task 11: Final verification sweep

- [ ] **Step 1:** `cd mobile && npx tsc --noEmit && npm test` — all suites green (shoppingDemand + consumptionRate + stockState additions + all prior; expect ~300+ tests).
- [ ] **Step 2:** Greps: `grep -rn "\"category\"" mobile/src/types/track.ts` → no shopping reference; `grep -rn "replaceItemLocations(user" mobile/` → nothing (old signature gone); `grep -rn "from(\"shopping_list\")" mobile/src` → only `shopping.ts` and the legacy delete in `FoodInventoryScreen.tsx`'s `handleDeleteItem` (which stays — deleting an item still clears its demand).
- [ ] **Step 3 (owner, on device — Metro reload, free `--port`):** hub shows the Shopping List card filling the grid slot; suggestions appear with correct reasons/quantities (verify the threshold-exit quantity on a low item); ＋ and Add all move rows into vendor groups; Instacart deep link opens; per-row vendor swap moves the row's group and does NOT change the product default; purchase → restock offer → inventory quantity rises (check in Food Inventory); un-check restores a purchased row; Clear purchased empties the section; "~Nd left" shows on a well-logged item, is absent on sparse ones, and is also absent on a high-count item with thin history (e.g. a 100-count item logged only 3 times — the raw estimate lands well past `MAX_DISPLAY_DAYS`, so the line must not render it); long-press add from inventory works on an in-stock item now; vendor rename + URL edit stick and the URL opens; EditFoodScreen vendor picker persists.
- [ ] **Step 4:** Stop. Merge/push are the owner's calls — after this merge, the Nutrition OS loop is closed.

---

## Self-review checklist (run after writing, before execution)

- Spec coverage: §5.1-5.2 → Task 1; §5.3 → Task 5; §5.4 → Tasks 1/5; §6 → Task 4 (+Task 2 threshold export); §7 → Task 3; §8 → Task 6 (+restock in Task 7's `handlePurchase`); §9.1-9.2 → Task 7; §9.3 → Task 8; §9.4 → Task 9; §10 → Tasks 3/4/10/11. No gaps.
- Type consistency: `DemandInventoryItem`/`computeShoppingSuggestions` (4→6), `ConsumptionEstimate`/`estimateConsumption` (3→6/8), `lowThresholdFor` (2→6/8), `ShoppingSuggestion` (4→6/7/8), `ShoppingData`/`fetchShoppingData` (6→7), `addSuggestions(userId, s[])` (6→7/8), `transferInventoryUnits(itemId, null, target, qty)` (Phase 4 API, used in 7), `replaceItemLocations(itemId, rows)` new signature (5→EditFoodScreen call sites).
- Known accepted risks: `handleAddToShoppingList` bypasses suggestion dedupe (a manual add can duplicate a pending suggestion — suppressed on next screen load since the row now exists); screen `keyExtractor` for name-only suggestions uses the name (unique post-merge by construction). (Task 8's rates helper is no longer a risk: Task 6 now exports `fetchConsumptionRates(todayLocalDate, totalsById)` fully implemented — see the Task 6 amendment — so Task 8 Step 2 calls it directly and there is no events-expansion code left to duplicate or lift.)

## ⚠️ Execution amendments

Record every review-driven deviation here, per task, as execution proceeds.

### Task 1 — the migration

Code-quality review of the Task 1 commit found two genuine defects in this plan's SQL, reproduced faithfully by the implementer. Both are fixed in the migration and in the code block above, along with one observational house-style addition (not a defect). Facts below were empirically proven in a throwaway PostgreSQL 17.8 cluster (since destroyed). A re-review afterward confirmed all three code changes correct and found a further deadlock risk introduced by the row-lock fix itself, and a non-obvious RLS coupling it depends on — both recorded below.

**Fixed (two defects):**

1. **`is_ready_to_consume` validation was a no-op for absent keys.** `jsonb_typeof(r->'is_ready_to_consume')` on a missing key evaluates to SQL NULL, not the string `'null'` or any type name. `NULL <> 'boolean'` is itself NULL, and plpgsql's `if` treats a NULL condition as not-taken — so the `raise exception` was skipped and validation silently passed. The neighbouring `location` and `quantity` checks each carry an explicit `is null` arm; this one didn't, which is what let the gap through. Fixed by replacing `<>` with `is distinct from`, which is NULL-aware. Mutation-proved: broken and fixed variants were generated programmatically from the committed file (not retyped) and run across a nine-case matrix — JSON null, `true`, `false`, string `"yes"`, absent key, bad location, empty array, negative quantity, float quantity. The two variants differed in exactly one case, the absent key: broken returned `RAISED[23502]: null value in column "is_ready_to_consume" ... violates not-null constraint` (validation passed, and the row died at the insert instead); fixed returned `RAISED[P0001]: is_ready_to_consume must be a boolean` before any write. The other eight cases were byte-identical between variants, confirming the fix changes exactly the null arm and nothing else.

2. **No row lock — concurrent calls could duplicate rows and desync the cache.** Without a lock, under READ COMMITTED two concurrent calls for the same item can interleave so that T2's `delete` blocks on T1's uncommitted delete, then on T1's commit re-evaluates its snapshot and finds T1's *old* rows already gone (so it deletes nothing) while T1's newly inserted rows sit outside T2's snapshot (so T2 doesn't see them to delete either). T2 then appends its own rows on top, leaving T1's rows plus T2's rows on the table with `food_inventory.quantity` holding only T2's total — a locations-as-truth violation, which is exactly the invariant this RPC exists to enforce. Fixed by adding `for update` to the initial `select ... from food_inventory` — the row-lock *mechanism* matches the idiom `transfer_inventory_units` already establishes (`supabase/migrations/20260730100000_inventory_locations_truth.sql` lines 129-131), but that precedent locks `food_inventory_locations` first; this fix locks the **parent** `food_inventory` row first instead. Same mechanism, opposite table order — see the deadlock entry below for what that difference costs. Lock acquisition confirmed: with one session holding `for update` on the item row, a second session's `for update nowait` failed with `ERROR: could not obtain lock on row in relation "food_inventory"`. This confirms the lock is taken; it does not by itself exercise the two-concurrent-`replace_item_locations` interleaving narrated above, which was not separately reproduced. Practically bounded in a single-user app whose Save button disables while saving, but the RPC's mandate is ongoing enforcement, not probabilistic safety.

Also reworded the pre-write validation comment: it previously credited the two-pass loop with a guarantee the surrounding transaction already provides unconditionally (rollback holds even on paths that skip validation entirely — verified). The loop's actual value is producing a legible error before Postgres produces an illegible one, which is precisely what defect 1 forfeited. Reworded to say that.

**Also added (not a defect):** a `raise notice` on the guard's success path. Spec §5 names "idempotent, `public.`-qualified, `raise notice` counts" as house style; the guard computed `v_nonnull` but reported nothing. Added a `raise notice` reporting the count (0, by construction of the preceding check) so Task 10's owner gate gets visible confirmation at apply time.

**Considered and declined:**

- **Non-integer `quantity` raises a raw cast error rather than the validation message**, because the `::integer` cast precedes the check. Verified: `"quantity": 2.5` yields `RAISED[22P02]: invalid input syntax for type integer: "2.5"`. Behaviour-identical to the PostgREST client path it replaces, still atomic, still a refusal — not a defect, and the typed client is the only caller. Left as-is.
- **The `do $$` guard is not re-runnable** (after the drop, `where category is not null` references a missing column). Identical in shape to the cited `meal_template_id` precedent in `20260729100300_drop_meal_templates.sql`; Supabase records applied migrations and never re-runs them, and a `db reset` replays from a schema where the column still exists. Non-issue.
- **`comment on column` for the two new FKs** (neighbours in `20250217000003` carry them). Not named by the spec; skipped as scope creep.

**Accepted risk, introduced by our own fix — ABBA deadlock against `transfer_inventory_units`:** the `for update` added above closes the corruption hole in defect 2, but it also inverts lock order relative to the sibling RPC. The two functions now acquire the same two tables' row locks in opposite order:

- `transfer_inventory_units` (`20260730100000_inventory_locations_truth.sql:129-131`): locks `food_inventory_locations` row(s) first (`select ... for update` on `v_to`/`v_from`), then `food_inventory` (its final `update`).
- `replace_item_locations` (this migration): locks `food_inventory` row first (the new `for update`), then `food_inventory_locations` (the `delete`).

That's a classic ABBA cycle. Reproduced deterministically in a throwaway Postgres — the real `replace_item_locations` in one session against a faithful replay of `transfer_inventory_units`'s lock sequence in another:

```
ERROR:  deadlock detected
DETAIL:  Process 20366 waits for ShareLock on transaction 6620181; blocked by process 20367.
         Process 20367 waits for ShareLock on transaction 6620180; blocked by process 20366.
CONTEXT: while updating tuple (0,1) in relation "food_inventory"
```

Reinstalling the pre-`for update` function and re-running the identical scenario produced no deadlock, confirming the `for update` is what inverted the order.

Accepted, not fixed, and why: reverting the `for update` is not on the table — without it the failure mode is silent corruption (duplicate location rows plus a desynced cache, the very locations-as-truth violation this RPC exists to enforce). With it, the worst case is Postgres detecting the cycle in about a second, aborting one side with `40P01`, and rolling it back cleanly; the repro left consistent state (`freezer:4, cache=4`). A clean abort strictly beats corruption. Triggering it also requires genuine simultaneous writes to the *same item* from the edit screen and the restock flow — two devices acting within milliseconds, in a single-user app.

The remedy is deliberately deferred to the owner: hoisting `select … from public.food_inventory where id = p_item_id for update;` to the top of `transfer_inventory_units` makes both functions parent-first and eliminates the cycle. It is declined *here* because plpgsql has no partial-redefinition facility — it would mean restating roughly sixty lines of a working production function inside an owner-gated migration, outside this plan's scope, with transcription risk plausibly exceeding the risk it removes. **Flagged explicitly as a decision for the owner at the Task 10 gate.**

**Verified, no change needed** (the review's negative space): the insert supplies every NOT NULL column; there is no unique constraint on `(food_inventory_id, location)`, so multi-row-same-location payloads are legal; the location allowlist matches the live CHECK exactly; `food_inventory.user_id` is NOT NULL, so the `v_user_id is null` check cannot conflate "not found" with "null owner"; the `updated_at` BEFORE UPDATE trigger never fires on the insert path and is search_path-safe; every in-body reference is `public.`-qualified so `search_path = ''` holds; RLS's `auth.uid() = user_id` passes for all three statements because `v_user_id` comes from an RLS-filtered read. Atomicity was directly confirmed: after a mid-array failure the pre-existing rows and cache were untouched (`fridge:5, pantry:3, cache=8`), and a successful replace swapped both rows and resynced the cache to the new sum (`freezer:4, cabinet:6, cache=10`). One more non-obvious coupling from the re-review: `select ... for update` applies the target table's **UPDATE** policy `USING` clause, not just SELECT's — so the new `for update` on `food_inventory` passes RLS only because that table has an UPDATE policy (`"Users can update their own food inventory"`, `20250208_complete_tracking_schema.sql:103`, `USING (auth.uid() = user_id)`). The RPC's ownership read now silently depends on that policy continuing to exist.

### Task 2 — lowThresholdFor

**Added:** one assertion in `mobile/src/lib/__tests__/stockState.test.ts`'s `lowThresholdFor` describe block, pinning the unknown/null `storage_type` → multi-location fallback:

```ts
it("unknown/null storage_type falls back to multi-location (projectItemStock's documented contract; mealLibrary.ts passes storage_type: null)", () => {
  expect(lowThresholdFor(item({ storage_type: null, total_restock_threshold: 6 }))).toBe(6);
});
```

`projectItemStock`'s own comment (`stockState.ts` :90-94, unchanged by this task) documents as an explicit contract that anything other than exactly `"single-location"` — including a null/unknown `storage_type` — is treated as multi-location. This isn't hypothetical: `mobile/src/lib/supabase/mealLibrary.ts:131` really does construct a synthetic item with `storage_type: null` on every call. But neither the two tests this task's plan specified nor the pre-existing suite exercised that branch — both new tests, and every existing `projectItemStock` test, only ever pass the two literal values (`"single-location"` or the `item()` factory's `"multi-location"` default). Code-quality review confirmed the extraction itself was behaviour-preserving, then grepped the suite and found this specific gap.

Consequence: mutating the comparison from `=== "single-location"` to `!== "multi-location"` swaps which branch a null/unknown `storage_type` lands in, but is otherwise behaviourally identical for the two literal values — so it passed both new tests and the entire pre-existing suite untouched. Under that mutant, an item with `storage_type: null`, `restock_threshold: 3`, `total_restock_threshold: 10` returns `3` instead of `10`; fed into the demand engine's planned restock-quantity math (`Math.max(1, lowThresholdFor(item) - item.state.totalQuantity + 1)`, spec §6, Task 4/8), that under-reads the threshold and would size the restock suggestion too small — a silent under-ordering bug, not a crash.

Mutation-test evidence: with `lowThresholdFor` temporarily mutated to `item.storage_type !== "multi-location"`, `npx jest src/lib/__tests__/stockState.test.ts -t "lowThresholdFor"` produced:

```
✓ single-location → restock_threshold (1 ms)
✓ multi-location → total_restock_threshold; nulls → 0
✕ unknown/null storage_type falls back to multi-location (projectItemStock's documented contract; mealLibrary.ts passes storage_type: null) (1 ms)

  ● lowThresholdFor › unknown/null storage_type falls back to multi-location ...

    expect(received).toBe(expected) // Object.is equality

    Expected: 6
    Received: 1
```

confirming the new assertion — and only the new assertion — is load-bearing against this mutant. Reverting the mutation and re-running the full suite produced `Test Suites: 9 passed, 9 total / Tests: 282 passed, 282 total` (9 suites, +1 test over the 281 the Task 2 commit left at).

`StockItemInput.storage_type` is already typed `string | null` (`stockState.ts` :25), so `mealLibrary.ts:131` needs no cast and neither did this test — the null case was always type-legal, just untested.

Live impact today is nil, which is why this was a Minor finding rather than a defect: `food_inventory.storage_type` is a NOT NULL column with a two-value CHECK, so no real row can ever carry a null `storage_type` to trigger the mutant branch-swap in production; and `mealLibrary.ts`'s synthetic item — the one real caller that does pass `storage_type: null` — sets every threshold field to `null` too, so both branches of the (correct or mutant) comparison return `0` regardless. The gap was purely latent: real coverage of a documented contract, with zero present-day consequence, but load-bearing the moment the demand engine (Task 4) starts calling `lowThresholdFor` against real threshold values.

**Recorded, no action needed:** the reviewer also checked whether a `??` → `||` mutation on either fallback (`item.restock_threshold ?? 0`, `item.total_restock_threshold ?? 0`) exposes a further gap, and concluded it doesn't — it's an *equivalent* mutant, not a coverage gap. Both fields are typed `number | null`; with a `0` fallback, `??` and `||` diverge only on a falsy-but-not-nullish operand, and the only candidate for a `number | null` is `0` itself, where both operators yield `0` regardless. The sole value where `??` and `||` truly diverge is `NaN` (falsy, not nullish), which an `integer` column can never produce. No test can distinguish the two operators here without a value the type can't carry, so no assertion for it was added. Recorded so a future reviewer doesn't re-chase this.

**Noted, already scheduled — not a defect here:** `mobile/src/components/track/FoodInventoryScreen.tsx:183` computes `quantity: item.restock_threshold || 1`, a third and *divergent* reading of "this item's threshold" — it is storage-type-blind (a multi-location item gets `restock_threshold`, not `total_restock_threshold`) and uses `||` instead of `??`. This doesn't undermine Task 2's "one definition" premise — `lowThresholdFor` is the one definition of the `isLow` threshold; this call site is answering a different question (a restock quantity default) with a rule the design spec already flags as wrong. Plan Task 8 is scoped to rewire this exact line to `Math.max(1, lowThresholdFor(item) - item.state.totalQuantity + 1)`. Recorded here so Task 8's reviewer can confirm that rewiring actually happens.

### Task 3 — consumptionRate

Spec review passed outright. Code-quality review mutation-tested the module and confirmed the honesty gates and window logic were already well covered: 6/6 constant-value mutations and 4/4 core gate-logic mutations (`<`→`<=` in the window filter, `<`→`<=` in both the `MIN_UNITS` and `MIN_SPAN_DAYS` gates, `||`→`&&` joining the two gates) were killed by the plan's original tests — none of that machinery needed a fix.

The same mutation pass against the surrounding code surfaced 4 surviving mutations, which resolve to only 3 distinct code-location findings: `Math.ceil`'s two mutants (→`floor`, →`round`) are one finding; the future-date guard's outright deletion is a second; `total <= 0` → `total < 0` is a third and is *not* a defect (see "Considered, no change" below — it survives only because the one test that probes it uses the value where both comparators agree). These three are not uniformly "after the gates," contrary to how a first pass of this section described them: `Math.ceil` is post-gate arithmetic, but the future-date guard sits earlier, in the events loop that filters and collects `ages` *before* any per-item gate runs.

A fourth, and the most significant, finding did not come from the mutation battery at all — a malformed `dateLocal` was never one of the mutants tried. It came from tracing NaN propagation through the span gate by hand: `daysBetweenLocalDates` can return `NaN`, and `NaN` is falsy in every comparison the gate relies on, so it silently defeats the gate instead of tripping it. A fifth and separate line of inquiry — direct measurement of `daysUntilOut` at a range of totals, again not mutation testing — surfaced an unbounded-display hazard, which is a rendering-design gap rather than a code defect and was resolved as a recorded decision rather than a bug fix.

Four items are fixed as of this round: NaN and the future-date guard (found and fixed on the first pass), `Math.ceil` (found and fixed on the first pass), and the display horizon — added as a constant on the first pass, but only genuinely *landed* this second round, once the render gate was wired into the plan's own Task 8 and Task 11 blocks (below) rather than resting on a verbal instruction to a future implementer. The `total <= 0` survivor remains the sole accepted, unfixed mutation. Source and plan-block changes are re-diffed programmatically against the committed files after every edit in this section, the same check used for Task 1.

**Fixed (four items, three discovery methods — mutation testing, manual NaN-propagation tracing, and direct measurement):**

1. **`NaN` silently bypassed the `MIN_SPAN_DAYS` honesty gate.** `daysBetweenLocalDates("", today)` returns `NaN` (malformed/empty `dateLocal`). The original guard was `if (age < 0) continue;` — `NaN < 0` is `false`, so the event was kept, not dropped, and `NaN` landed in `ages`. Then `Math.max(...ages)` became `NaN`, and the gate check `spanDays < MIN_SPAN_DAYS` — `NaN < 14` — is *also* `false`, so the gate that exists specifically to suppress an estimate instead let it through. Reviewer's empirical repro: events at `["", today, today−1, today−2]` — a real span of 2 days, nowhere near `MIN_SPAN_DAYS` — produced `{ratePerDay: 0.107, daysUntilOut: 94}` on the unpatched code. That is precisely the "confident wrong number" the module's own header (:5-6) says cannot happen. Flagged as a regression against the sibling: `stockState.ts:117` guards the identical `daysBetweenLocalDates` call with `if (Number.isFinite(rawDaysLeft))`, and its comment at :125-129 names this exact hazard — "NaN is silently false in every band/filter comparison." Fixed at the same call site (`consumptionRate.ts`, the age-computation loop) by folding the NaN check into the existing guard: `if (!Number.isFinite(age) || age < 0) continue;`, with a comment citing the sibling file and line. This rejects NaN and keeps rejecting negatives in one explicit condition, matching house style rather than inventing a new one.

   **Reachability:** not currently reachable via the Task 6 path — `meal_logs.date` is `DATE NOT NULL` (`supabase/migrations/20250208_complete_tracking_schema.sql:109`), so every `dateLocal` this lib receives today is a real, always-serialized `YYYY-MM-DD`, never an empty string. This is a latent contract hole on an exported, typed lib (`dateLocal: string` accepts anything, including `""`), not a live bug — and it gains a second caller in Task 8, so leaving it live would have compounded the risk rather than merely inheriting it.

   **Pinned with a test**, `consumptionRate.test.ts` — "rejects a non-finite event age instead of letting it silently clear the span gate":
   ```ts
   const events: DecrementEvent[] = [
     { inventoryId: "a", dateLocal: "" },
     ev("a", 0),
     ev("a", 1),
     ev("a", 2),
   ];
   expect(run(events).has("a")).toBe(false);
   ```
   **Mutation-proved** by reverting the guard to `if (age < 0) continue;`, re-running just this test, and confirming it fails for the predicted reason:
   ```
   ● estimateConsumption › rejects a non-finite event age instead of letting it silently clear the span gate
     expect(received).toBe(expected) // Object.is equality
     Expected: false
     Received: true
   ```
   Restoring the guard and re-running the same test confirmed it passes again; the full suite (below) confirms nothing else broke.

2. **`Math.ceil` was unpinned — `Math.floor` and `Math.round` both survived the suite.** The only pre-existing test asserting a non-zero `daysUntilOut` (`consumptionRate.test.ts:31-35`, "computes rate over the window and ceil(total/rate)") used an exactly-divisible case — 4 units → rate 1/7, total 10 → exactly `70.0` — where `ceil`, `floor`, and `round` all agree, so the test's own name asserted a property its value couldn't distinguish. Spec §10 requires `daysUntilOut` to be `ceil` (plus already-out `0`), so this was an unsatisfied spec clause, not a stylistic nit. Added a second, non-divisible case: 3 in-window units → rate 3/28, total 10 → `10 / (3/28) = 93.33...` → `ceil` is `94`, `floor` would be `93`. Left the original exactly-divisible test in place unmodified (it's still a valid basic-arithmetic check) and added the discriminating one alongside it.

   **Mutation-proved** by changing `Math.ceil` to `Math.floor` in the source and re-running the new test:
   ```
   ● estimateConsumption › rounds daysUntilOut up (ceil), not down or to nearest
     expect(received).toBe(expected) // Object.is equality
     Expected: 94
     Received: 93
   ```
   Restored `Math.ceil` and re-ran; passes again.

3. **The future-date guard (`age < 0`) had zero coverage of its own — deleting it entirely also survived.** No existing test exercised a future-dated event. Reviewer's discriminator: ages `[-11, 10, 25]` with `total: 10` — with the guard, only `10` and `25` are legitimate in-window units (`2 < MIN_UNITS`) → no estimate; without it, all three count → `3/28` → an entry, i.e. a future log fabricates a whole unit of demand. Added the assertion (`"rejects future-dated events (never fabricates demand from a clock/timezone skew)"`) using the same `[-11, 10, 25]` ages. Reachability is low but non-zero, per the review: `MealAddForm.tsx:88` sets `maximumDate={new Date()}`, which prevents deliberately future-dated entry from the picker, but doesn't prevent `todayLocalDate` (the caller's "now") from landing *behind* an already-stored `date` after a timezone crossing — logging a meal in Tokyo, then flying east before the estimate is computed.

   **Mutation-proved** by removing the `age < 0` half of the guard entirely (leaving only the `Number.isFinite` check from Fix 1) and re-running the new test:
   ```
   ● estimateConsumption › rejects future-dated events (never fabricates demand from a clock/timezone skew)
     expect(received).toBe(expected) // Object.is equality
     Expected: false
     Received: true
   ```
   Restored the full guard and re-ran; passes again.

4. **Unbounded `daysUntilOut` was a rendering hazard, not a lib defect — resolved by adding a display-only constant, not by capping the lib's output.** `ratePerDay` floors at `MIN_UNITS / RATE_WINDOW_DAYS = 3/28 ≈ 0.107/day`, so `daysUntilOut ≈ total × 9.33` with no ceiling: measured at total 12 → ~112d, total 30 → ~280d, total 100 → ~934d. Spec §6's forecast trigger is unaffected (it only fires at `≤ FORECAST_LEAD_DAYS`), but plan Task 8 Step 2 renders `~{daysUntilOut}d left` on every inventory grid card with a map entry, with no ceiling — a three-digit day count derived from as few as three data points, in an accent colour, asserting a precision the module's own header disclaims. Decision (the reviewer's, recorded as a decision rather than applied unilaterally, so the owner can override): keep `estimateConsumption` pure and honest — it still returns the true `daysUntilOut`, because the demand engine (spec §6) consumes the real number and capping it inside the lib would corrupt that input. Bound the *display* instead. Added `export const MAX_DISPLAY_DAYS = RATE_WINDOW_DAYS * 2;` to `consumptionRate.ts` (retuned from a bare `60` literal on the second pass — see Fix 3 in the re-review below), in the same exported-constant house style as `RATE_WINDOW_DAYS`/`MIN_UNITS`/`MIN_SPAN_DAYS`, with a comment deriving the bound from the same `RATE_WINDOW_DAYS`/`MIN_SPAN_DAYS` relationship as bias (3) above, and stating explicitly that it governs rendering only. On the first pass Task 8 itself was deliberately **not** touched, since that task hadn't run yet — but a constant with zero consumers and only a verbal instruction to a future implementer is a decision recorded, not a fix landed. The second pass (below) closes that gap by wiring the gate into the plan's own Task 8 Step 2 code block and Task 11 Step 3 checklist, so the durable artifact — not just this amendment — carries the bound forward.

**Minor, also fixed:**

5. **The header's "Known bias, documented not hidden" list claimed two sources and omitted the largest one.** `ratePerDay = unitsInWindow / RATE_WINDOW_DAYS` divides by the full 28-day window even when the item's actual history is shorter than that — a structural, quantifiable bias the header's enumerated list read as exhaustive without covering. The `MIN_SPAN_DAYS = 14` gate bounds it cleanly: since span is always `>= MIN_SPAN_DAYS` and the window is `RATE_WINDOW_DAYS`, the worst-case underestimate of the true rate is exactly `RATE_WINDOW_DAYS / MIN_SPAN_DAYS = 2x`. Verified at the boundary: span exactly 14, 3 units, total 4 → the lib returns `daysUntilOut: 38`, where the observed-history rate (`3/14`) would give `19` — a 2x gap, as predicted. Added as a third numbered bias in the header, stating the mechanism, the 2x bound, and the direction (rate reads low, `daysUntilOut` reads high — optimistic, meaning the real out-of-stock date arrives *sooner* than the estimate implies). Per the review, the underlying simplification itself is not being changed and is not a defect: the window average is the honest definition of "units per day over the trailing 28 days," the error direction is the conservative one for a suggest-confirm UI (a missed suggestion, never a spurious one), and design spec §4's decisions table already blesses this exact choice as "a known biased-low window." The only defect was the header claiming completeness it didn't have.

6. **The test file's date anchor existed in two representations that had to be kept in sync by hand.** `TODAY = "2026-07-30"` and a separately-hardcoded `new Date(2026, 6, 30, 12)` inside `daysAgo` were two sources of truth for the same value — every assertion in the file hangs off this anchor, and changing one without the other would silently shift every computed age while the suite kept passing under different semantics. Fixed by deriving the `Date` inside `daysAgo` from `TODAY` itself (`TODAY.split("-").map(...)`), leaving the noon-anchoring and the test's independence from the lib's own `daysBetweenLocalDates` implementation both intact, per instruction — the test does not call the lib's date-diff function to compute its fixtures.

**Considered, no change — recorded so a future reviewer doesn't re-chase it:**

- **`total <= 0` → `total < 0`** also survives the suite, because the "already out" test uses `total = 0`, where `Math.ceil(0 / ratePerDay)` is `0` under either comparator — the guard is behaviourally invisible at exactly the value the test probes. It's only load-bearing for `total < 0`, which the review confirmed is unreachable: `food_inventory_locations.quantity` is `INTEGER NOT NULL CHECK (quantity >= 0)` (`supabase/migrations/20250217000003_add_multi_location_inventory.sql:16`), and `totalsById`'s values are a plain sum of those. The code is correct and `0` is the right answer at that boundary; no test was added.
- **`Math.max(...ages)` on an empty array** would be `-Infinity`, but the review (and my own read at implementation time) confirmed `ages` can never be empty at that call site: `byItem` is only ever populated by pushing at least one age per key inside the events loop, so every array iterated in `for (const [inventoryId, ages] of byItem)` has length >= 1 by construction.

**Spec-text inaccuracies noted, no code change — the code is correct, the spec prose is wrong or, in one case, stale:**

- Design spec §7 says "All four constants exported," but only three (`RATE_WINDOW_DAYS`, `MIN_UNITS`, `MIN_SPAN_DAYS`) belong in this lib — `FORECAST_LEAD_DAYS` lives in `shoppingDemand.ts` per §6. The spec's count is wrong; this lib correctly exports three (plus, as of this amendment, the display-only `MAX_DISPLAY_DAYS` — four total now, coincidentally, but for a different reason than the spec's original miscount).
- Spec §10's illustrative example ("event at day 29 doesn't count toward units") is true but imprecise, not wrong: day 29 genuinely doesn't count (`29 >= RATE_WINDOW_DAYS`), so the spec's statement holds. It just isn't the tightest boundary — day 28, not day 29, is the first excluded day (`age < RATE_WINDOW_DAYS`). The plan's actual tests were unaffected either way — they use day 30 for the qualitative "outside the window" case and the exact `RATE_WINDOW_DAYS − 1` / `RATE_WINDOW_DAYS` pair for the tight boundary case — so coverage was always correct; only the spec's illustrative example picked a looser day than necessary.
- **Stale as of this commit, not wrong when written:** design spec §7 (`design.md:102`) also says "the lib header documents the two known bias sources." That was true through the first pass of this amendment; Minor fix 5 above added a third numbered bias (the window/span divergence), so the header now documents three and this spec line needs updating to match. No code change — the code and this amendment are both correct; the spec prose is what's now behind.

**Re-review (second pass) — four more items, all cheap:**

Re-review confirmed the first-pass source fix as correct and complete: 6/6 constant mutations and 4/4 gate-logic mutations re-verified killed, each of the three new tests confirmed to fail for the *right* reason and to pin the guard's two halves (NaN, negative) independently, and `Math.ceil` finally discriminated from `floor`/`round`. Four residual items remained, addressed here:

1. **The display horizon had zero consumers — landed in the plan's Task 8 and Task 11 blocks, not just the lib.** `MAX_DISPLAY_DAYS` existed but nothing read it, and the plan's own Task 8 Step 2 code block (an implementer's actual checklist, not this amendment) still specified the unbounded render. Fixed by editing that block directly: imported `MAX_DISPLAY_DAYS` alongside `estimateConsumption` and gated the `~Nd left` render on `ratesById.get(item.id)!.daysUntilOut <= MAX_DISPLAY_DAYS`, matching the block's existing repeated-`.get()` style rather than introducing a new pattern. Also added a clause to Task 11 Step 3's on-device checklist: the "~Nd left" line must be absent not only on sparse items but also "on a high-count item with thin history (e.g. a 100-count item logged only 3 times — the raw estimate lands well past `MAX_DISPLAY_DAYS`, so the line must not render it)." No Task 8 *source* was written — that task hasn't run; only the plan's own text changed, exactly as instructed.

2. **Age 0 (a same-day log) was untested at the future-date-guard boundary.** `age < 0` → `age <= 0` survives the suite: the existing NaN test contains an `ev("a", 0)` event, but asserts `false` regardless of which comparator is used, so it doesn't discriminate. Verified discriminator: ages `[0, 14, 20]` with `total: 10` — kept, 3 in-window units → `{ratePerDay: 3/28, daysUntilOut: 94}`; dropped, only 2 in-window units → no entry at all. A meal logged today is load-bearing at the `MIN_UNITS` boundary, so silently dropping age-0 events would suppress an otherwise-valid estimate for the rest of that day. Added the assertion (`"counts a same-day (age 0) event toward the window, not just strictly-past ones"`), using the same `[0, 14, 20]` ages and asserting the full `{ratePerDay, daysUntilOut}` shape.

   **Mutation-proved** by changing the guard from `age < 0` to `age <= 0` and re-running just the new test:
   ```
   ● estimateConsumption › counts a same-day (age 0) event toward the window, not just strictly-past ones
     expect(received).toEqual(expected) // deep equality
     Expected: {"daysUntilOut": 94, "ratePerDay": 0.10714285714285714}
     Received: undefined
   ```
   Restored `age < 0` and re-ran; passes again. A byte-diff against a pre-mutation backup confirmed the restored source matched the intended fix exactly, with no mutation residue.

3. **`MAX_DISPLAY_DAYS` was a bare `60` literal with a comment that argued from human attention span, not from the module's own math.** Retuning `RATE_WINDOW_DAYS` would have silently detached the horizon from the relationship that actually justifies it. Changed the declaration to `RATE_WINDOW_DAYS * 2` (name and effective value unchanged — still `60` today) and replaced the comment with the real derivation: since `spanDays` is always `>= MIN_SPAN_DAYS` and the divisor is `RATE_WINDOW_DAYS`, every displayed `daysUntilOut = n` carries an implicit interval of `[n/2, n]` (the same 2x bound as bias (3) in the header). At `n = MAX_DISPLAY_DAYS` (60) that's a 30-day band, already at the edge of actionable; left unbounded, at the measured `n = 934` case the interval is `[467, 934]` — three-digit precision the gates can't stand behind. The existing "governs rendering only; the lib still returns the true value" clause was kept verbatim. Mirrored into the plan's Task 3 implementation code block and re-diffed (see Verification below) — both stayed byte-identical to source.

4. **Five corrections to this amendment's own text**, per the re-review's independent re-verification of every citation and measured figure (all held; only the framing needed correction): (a) the claim that every survivor sat in post-gate arithmetic was false — the future-date guard survivor is in the pre-gate events loop — corrected in the opening paragraph above; (b) the ambiguous "four" was disambiguated into 4 surviving mutations / 3 distinct code-location findings / 4 fixed items, three different counts that had been conflated; (c) the NaN finding is now correctly attributed to manual code-tracing, not the mutation battery, since it was never one of the mutants tried; (d) "all four are fixed" is corrected to state plainly that the horizon item was a decision recorded on the first pass and only genuinely landed once this second pass wired it into Tasks 8 and 11; (e) the spec-inaccuracy list gained the stale "two known bias sources" citation this commit itself caused, and the day-29 entry was downgraded from "off by one / wrong" to "true but imprecise," since day 29 does not count and the spec's statement is correct, just not the tightest possible illustration.

**Verification:** re-review re-ran the full 14-mutation battery (6 constant + 4 gate-logic + the 4 post-gate/pre-gate arithmetic mutations from the first pass, now including age's `<`→`<=`) against the fixed source with no regressions; `total <= 0` → `total < 0` remains the sole accepted, unfixed survivor. `cd mobile && npx tsc --noEmit` → exit 0. `npm test`:
```
Test Suites: 10 passed, 10 total
Tests:       293 passed, 293 total
```
(293 = the 289 left by the Task 3 commit, +3 from the first pass's Fixes 1–3, +1 from this pass's Fix 2 age-0 test; the horizon retune, the plan wiring, and the five documentation corrections added no new test cases.) The plan's Task 3 code blocks were re-diffed programmatically against `mobile/src/lib/consumptionRate.ts` and `mobile/src/lib/__tests__/consumptionRate.test.ts` after every edit in this section and found byte-identical each time, the same check used for Task 1.

### Task 4 — shoppingDemand

Spec review passed outright: both files as originally committed were byte-identical to this plan's Task 4 code blocks, and every §6 clause (all four sources, both dedupe layers, the quantity formula, `FORECAST_LEAD_DAYS`) and §10's coverage expectations were confirmed present. Code-quality review's first-pass mutation battery ran **24 mutations: 16 killed, 8 survived.** Separately — not via mutation testing — the quantity formula was confirmed exactly right by executing it against the actual comparator it has to clear: `stockState.ts:105`'s `isLow` check is `totalQuantity > 0 && totalQuantity <= lowThreshold`, so `max(1, lowThreshold − total + 1)` must produce `lowThreshold − total + 1` units above `total` — one past the boundary the `<=` compares against, not landing on it. This was verified by *executing* the formula and asserting each of seven `(total, lowThreshold)` pairs actually clears `isLow`, not by eyeballing arithmetic — the evidence for an off-by-one that would otherwise have shipped needs to be run, not merely computed by hand. None of that machinery needed a fix.

The 8 survivors map one-to-one onto this section's findings: `Math.min` → Fix 2; the forecast source's `it.isLow` guard half → Fix 3; its `it.isOut` guard half → Fix 3 (two independent survivors, one finding); the dead merge branch → Fix 5; the dead `byId` → Fix 4; `byName`'s last-wins tiebreak → Fix 6; and two — `Math.max(1, …)`'s floor and `!existing.thresholdQuantity` — resolve to the "Considered, no change" items below, not fixes. Of the six survivors that became fixes, all six (`Math.min`, both guard halves, dead `byId`, the dead merge branch, and `byName`'s tiebreak) were themselves how those findings were discovered — the mutation battery surfaced them directly. **Fix 1, the suppression over-fire, was not surfaced by mutation testing at all** — the battery had nothing to try that would expose it, since it requires a second, same-named inventory item that no existing test constructed. It was found by reasoning about `food_inventory`'s schema (no unique constraint on `name`) against the suppression code, then confirmed by checking that applying the narrower rule left all 12 of the original commit's tests green — itself evidence the broader, wrong behaviour had been entirely unpinned. Fix 6's header-ordinal half (the "seventh sibling lib" / spec's "Sixth pure lib" mismatch) was the one item found by inspection, not mutation; its `byName` tiebreak half *was* a mutation survivor, initially fixed with a comment only and left unpinned — a re-review caught that the comment could go stale silently, and this round adds the missing test (see Fix 6 below). All Important fixes are mutation-proved with the actual observed output. Source and plan-block changes were re-diffed programmatically against the committed files after every edit in this section, the same check used for Tasks 1 and 3.

**Fixed (three findings, all Important — the dedupe and forecast-guard contracts the task brief called out):**

1. **Suppression over-fired: a row's case-folded name suppressed by name even when the row also carried an id.** `suppressedNames` was built from *every* unpurchased row's name, and the filter at the end ANDed it unconditionally onto every draft, including id-carrying ones. `food_inventory` has no unique constraint on `name` (verified against `supabase/migrations/20250208_complete_tracking_schema.sql:80-89`), so two distinct items can share a name — and an unpurchased row referencing item A by id would silently also suppress a live suggestion for item B, a different item that merely has the same name. Read literally, spec §6 already says "id, **else** name" — per row, not per suggestion-set — which only a row with no id can trigger. Fixed by filtering `suppressedNames` to rows where `foodInventoryId === null` before folding:
   ```ts
   const suppressedNames = new Set(
     unpurchased.filter((r) => r.foodInventoryId === null).map((r) => fold(r.name)),
   );
   ```
   **Pinned with two tests:** the failure case — two same-named out-of-stock items, an unpurchased row referencing only the first by id, asserting the second still surfaces (`"suppression is per-row: an id-carrying unpurchased row does NOT suppress by name…"`) — and the companion confirmation that the narrow rule still keeps the case that genuinely needs name matching: a manually-typed (or `ON DELETE SET NULL`-orphaned) null-id row still suppresses an id-carrying suggestion by name (`"a null-id unpurchased row still suppresses an id-carrying suggestion by name…"`).

   **Mutation-proved** by reverting to the unfiltered `new Set(unpurchased.map((r) => fold(r.name)))` and re-running the new discriminating test:
   ```
   ● suppression is per-row: an id-carrying unpurchased row does NOT suppress by name …
     expect(received).toHaveLength(expected)
     Expected length: 1
     Received length: 0
     Received array:  []
   ```
   Restoring the filtered version and re-running confirmed it passes again. All 12 of the original commit's tests were confirmed to pass under the unfiltered (broken) version too — which is itself the finding the reviewer named: the broader, wrong behaviour was entirely unpinned by the original suite. As noted above, this fix was found by schema reasoning, not by the mutation battery.

   **Accepted residual, the other direction:** the narrowed rule can still miss a real duplicate if an item is renamed *after* its list row was created (rows created from suggestions start in sync, so this needs a subsequent rename): a stale row named `"Korean BBQ Sauce"` for an item now called `"Korean BBQ Sauce (Bibigo)"` won't id-match a fresh name-only suggestion citing the item's current display name, and won't name-match either. This is the correct trade, not an oversight: the old rule's failure mode was a *silent drop* of something the owner is genuinely out of; the new rule's is a *visible duplicate* the owner can decline in this suggest-confirm UI. Documented with a clause in the suppression comment (`shoppingDemand.ts`, at the `suppressedNames` construction site) rather than fixed — no code change, since fixing it would require joining list rows back to their linked item's current name, which is Task 6/8's I/O layer, not this pure lib's job.

2. **`Math.min` in the priority merge was unpinned — `Math.max` survived.** The only test exercising the merge (`"cross-source merge: min priority…"`) merges two sources that are both priority 1 (out-of-stock + two meal gaps), so `min` and `max` are indistinguishable there. The cross-priority path — a priority-1 source merging with a priority-2 source on the same item — was live and untested. No source change was needed (the code already reads `Math.min`); the gap was purely in coverage. Added a test that merges a meal gap (p1) with the low-stock source (p2) on the same item and asserts the merged priority stays 1, not 2.

   **Mutation-proved** by changing `Math.min` to `Math.max` at the merge and re-running the new test:
   ```
   ● cross-priority merge takes the min, not the max: a meal gap (p1) merged with the low source (p2) stays p1
     expect(received).toMatchObject(expected)
     - Expected  - 1
     + Received  + 1
       Object {
     -   "priority": 1,
     +   "priority": 2,
         "quantity": 2,
       }
   ```
   Confirmed the pre-existing "cross-source merge" test still passes unmodified under this same mutant (both its sources are p1, so it can't see the bug) — reproducing the reviewer's exact observation. Restored `Math.min` and re-ran; both tests pass again.

3. **The forecast source's "not low/out" guard (`it.isOut || it.isLow`) had both halves unpinned.** The original test's `alreadyLow` case asserted only `priority === 2`; with either half of the guard removed, the merged priority is still `min(2, 3) = 2` (a p2 source merging with a would-be p3 forecast source), so priority alone can't distinguish a correctly-suppressed forecast source from one that fired and got silently absorbed into the merge. What actually changes under the mutant is the `reasons` array, which the original test never inspected — a low (or out) item would gain a second, spurious `"~Nd left at your pace"` reason with nobody noticing. Fixed by extending the existing test (no source change — the guard `it.isOut || it.isLow` was already correct) to assert the full `reasons` array on both an already-low item and a new already-out item, each given a rates-map entry that would trigger the forecast source if either guard half were missing.

   **Mutation-proved**, both halves independently. Removing `it.isLow` (guard → `!est || it.isOut`):
   ```
   ● forecast → priority 3 only when daysUntilOut <= 3 and not low/out
     expect(received).toEqual(expected)
     - Expected  - 0
     + Received  + 1
       Array [
         "below threshold (1 left)",
     +   "~1d left at your pace",
       ]
   ```
   Restored, then removing `it.isOut` (guard → `!est || it.isLow`):
   ```
   ● forecast → priority 3 only when daysUntilOut <= 3 and not low/out
     expect(received).toEqual(expected)
     - Expected  - 0
     + Received  + 1
       Array [
         "out of stock",
     +   "~1d left at your pace",
       ]
   ```
   Restored the full guard (`!est || it.isOut || it.isLow`) and re-ran; passes again.

**Minor, also fixed:**

4. **`const byId = new Map(items.map((it) => [it.id, it]));` was dead.** Surfaced as a surviving mutation (deleting it changes nothing observable) and confirmed by code inspection: every item-keyed lookup in the function uses `it.id` directly from the loop variable, and the one name-keyed lookup the merge logic needs (matching a meal gap's missing-item name against inventory) is `byName`, not `byId`. Deleted.

5. **The `existing.foodInventoryId === null && base.foodInventoryId !== null` merge branch was unreachable, and wrong when forced.** Also surfaced as a surviving mutation (deleting the whole branch changes nothing observable in the suite). The reviewer then tried to construct an input that reaches it and could not: a null-`foodInventoryId` draft only exists under a folded-name `drafts` key, that key shape is only ever produced by an *unmatched* meal-gap upsert (`byName.get(...)` returned nothing), and an unmatched upsert's `base` always carries `foodInventoryId: null` too — so `base.foodInventoryId !== null` can never be true for a draft that got there via a name key. The only way in is a key-namespace collision between the two "keys share one Map" schemes (`drafts` keys are inventory UUIDs *or* folded names) — a saved food literally named to match a `food_inventory.id` (a `uuid primary key default gen_random_uuid()`). And when artificially forced to fire, the output is actively wrong, not merely dead: an unrelated item's id/vendor/unit gets grafted onto a name-only suggestion whose name doesn't match that item. The spec's actual stated outcome — a missing-for-meal name adopting a matching item's id/vendor/unit — is fully achieved elsewhere, at upsert-creation time via the `match ? itemBase(match) : …` lookup in the meal-gap loop, which is tested and passing independent of this branch. Deleted the branch and its comment; kept the creation-time lookup, which is the real mechanism. Verified by test across all three draft-creation orderings (out-first, meal-first, low-first) that removing the branch changes no observable output.

6. **Header ordinal (found by inspection) and an unpinned tiebreak (a mutation survivor).** The header called this "the seventh sibling lib" — spec §6 calls it the "Sixth pure lib," and neither count survives a literal file tally; no sibling lib (`stockState`, `eatNext`, `mealScore`, `rampProgress`, `conceptMatch`, `inventoryResolution`, `consumptionRate`) numbers itself at all. This half was found by inspection, not mutation testing (there is no mutant for prose). Dropped the ordinal, kept the rest of the header (it was accurate) and reworded to name siblings the way `eatNext.ts`/`mealScore.ts` already do ("sibling of …"), so nothing is left to rot the next time a lib is added or removed.

   Separately — and this half *is* a mutation survivor — `byName` is last-wins on a folded-name collision between two inventory items sharing a name: mutating the construction to first-wins (`[...items].reverse().map(...)`) changed no test's outcome. A first pass fixed this with a comment asserting the choice was deliberate, but a re-review flagged that a comment alone can't stop a refactor from silently making it false. This round adds a real pin: a test with two inventory items sharing a folded name plus one meal gap, asserting the meal-gap reason attaches to whichever item came later in `items` (`"byName's folded-name lookup is last-wins on a collision between two inventory items…"`).

   **Mutation-proved** by changing the `byName` construction to `new Map([...items].reverse().map((it) => [fold(it.name), it]))` (first-wins) and re-running the new test:
   ```
   ● sources › byName's folded-name lookup is last-wins on a collision between two inventory items: the meal-gap reason attaches to whichever came later in `items` (deliberate, per the comment at the byName construction site — not an oversight)
     expect(received).toBe(expected)
     Expected: "i1"
     Received: "i0"
   ```
   Restored the original last-wins construction (`new Map(items.map((it) => [fold(it.name), it]))`) and re-ran; passes again, along with the full suite.

**Considered, no change:**

- **`!existing.thresholdQuantity` in the merge is a dead condition, but an equivalent mutant, not a coverage gap.** Mutating it to bare `thresholdQuantity` survives the full suite, because the only two threshold-quantity sources — out-of-stock and low-stock — are mutually exclusive on any single item (`isOut` requires `totalQuantity === 0`; `isLow` requires `totalQuantity > 0`) and both call the same `exitLowQty(it)` formula on the same item's current fields, so even in a hypothetical world where both fired for one item the computed quantity would be identical either way. Left as written — it's the plan's original defensive structure and it's harmless — but recorded so a future reviewer doesn't re-chase this survivor.
- **`Math.max(1, …)` in `exitLowQty` is unreachable for any input that can actually trigger it, but spec-mandated, so it stays.** The floor only binds when `totalQuantity > lowThreshold`, which contradicts both flags that call `exitLowQty` (`isOut` ⇒ `totalQuantity === 0`; `isLow` ⇒ `totalQuantity <= lowThreshold` per `stockState.ts:105`), and both threshold columns carry `CHECK (… >= 0)` with `lowThresholdFor` coalescing `null` to `0` — so a negative formula result is not constructible from real data. Spec §6 states the formula with the `max` explicitly, so it stays regardless. The existing test named "threshold 0 out-of-stock still suggests quantity 1" pins the `lowThreshold: 0` case (`0 − 0 + 1 = 1`), which passes identically with or without the floor — it is not evidence the floor itself is exercised, and no test was added that could be, since the floor has no reachable input.
- **A second equivalent mutant in the suppression filter, recorded so it isn't re-chased.** `!(d.foodInventoryId !== null && suppressedIds.has(d.foodInventoryId))` → `!suppressedIds.has(d.foodInventoryId as string)` survives the full suite. `suppressedIds` is built via `.filter((x): x is string => x !== null)`, so it can never contain `null`; the `d.foodInventoryId !== null` half of the original guard is a TypeScript narrowing device (it makes `suppressedIds.has(...)` accept a non-nullable argument without a cast) with no behavioural effect of its own. Not a coverage gap — there is no reachable input the two variants disagree on.
- **Cross-task, verified rather than re-flagged:** `ShoppingSuggestion.unit` is `string | null`, while `shopping_list.unit` is `TEXT NOT NULL` (`supabase/migrations/20250209_extend_food_inventory.sql:79`), and this plan's Phase 5 migration (Task 1) doesn't relax that constraint. Read Task 6's `addSuggestions` (this plan, ~:960-978): `unit: s.unit ?? "item"` already covers the null case before the insert. Confirmed here, not fixed here — recorded so Task 6's own reviewer can verify the coverage exists rather than rediscover the question from scratch.

**Carry-forward — recorded for Task 6's reviewer, no action here:**

- **Suppression-by-id depends on Task 6 passing the full inventory list.** `computeShoppingSuggestions`'s id-suppression path only works if the `items` it receives includes every inventory item a list row could reference — if `fetchShoppingData` (Task 6) were ever to pass a filtered subset (e.g. only currently low/out items, as an optimization), id matches would silently degrade to name-only matches for the excluded items, making the accepted rename-drift residual (Fix 1, above) far more common than the rare case it's meant to be. Task 6's own reviewer should verify explicitly that the full inventory list is what's passed, not rediscover this dependency from scratch.

**Verification:** `cd mobile && npx tsc --noEmit` → exit 0. `npm test`:
```
Test Suites: 11 passed, 11 total
Tests:       309 passed, 309 total
```
(309 = the 308 left by the prior round's commit, +1 new test this round — the `byName` last-wins pin, Code item 2. Code item 1, the suppression-comment residual note, and Fix 6's header-ordinal wording added no test cases; none were expected to.) The plan's Task 4 code blocks were re-diffed programmatically against `mobile/src/lib/shoppingDemand.ts` and `mobile/src/lib/__tests__/shoppingDemand.test.ts` after every edit in this section and found byte-identical, modulo the code fence's own banner-comment line and trailing newline — the same convention used for Tasks 1 and 3.

### Task 5 — types and the RPC wrapper

Spec review found the plan's own file list incomplete for its own mandatory `tsc` gate to pass — a genuine plan gap, not implementer scope creep. Everything else in the task (the three type additions, the wrapper rewrite, both call-site updates) was implemented exactly as specified and verified correct against the migration and the repo, below.

**Plan file-scope gap, fixed:** Task 5's declared **Files** list named only `track.ts`, `inventory.ts`, and `EditFoodScreen.tsx`. It omitted `mobile/app/(tabs)/track/food-inventory/add.tsx` and `mobile/app/(tabs)/track/food-inventory/preview.tsx`, which each build a full `Omit<InventoryItemWithState, "state">` object literal for a synthetic placeholder item (the "add new item" and "barcode-scan preview" flows). `FoodInventoryItem` gaining a required `preferred_vendor_id: string | null` field makes both literals incomplete, and `npx tsc --noEmit` — Step 3's own gate — cannot pass without fixing them:

```
app/(tabs)/track/food-inventory/add.tsx(27,9): error TS2741: Property 'preferred_vendor_id' is missing in type '{ ... }' but required in type 'Omit<InventoryItemWithState, "state">'.
app/(tabs)/track/food-inventory/preview.tsx(39,9): error TS2741: Property 'preferred_vendor_id' is missing in type '{ ... }' but required in type 'Omit<InventoryItemWithState, "state">'.
```

Since the plan's own verification step could not have passed without touching these two files, the omission was self-evidently unintended rather than a deliberate scope boundary. Fixed with one line each, `preferred_vendor_id: null,` placed beside the existing `notes: null,` line — matching the pattern every other nullable field on these literals already follows.

**Blast radius confirmed complete**, since `tsc` alone is necessary but not sufficient here — the Supabase client is untyped, so a `select("*")` result cast with `as FoodInventoryItem[]` (`inventory.ts:51`) would never be flagged by a missing-property error the way a literal is. Grepped for every construction and every type-reference site rather than trusting the two `tsc` errors alone:
- `grep -rln "FoodInventoryItem\|InventoryItemWithState" mobile --include="*.ts" --include="*.tsx"` → 11 files. Read each reference: `useFoodImages.ts` only imports the type for a function parameter; `inventory.ts`'s own `as FoodInventoryItem[]` is a cast on data read from the table, not a literal construction, and needs no change (once the migration in Task 10 lands, `select("*")` genuinely returns the column; until then the cast is silently wrong regardless of this task, which is expected — see below); the four `app/(tabs)/track/food-inventory/*` route files and the three `src/components/track/*` screens only ever consume the type (props, destructuring), never construct a full literal.
- `grep -rn "Omit<InventoryItemWithState" mobile --include="*.ts" --include="*.tsx"` → exactly the two sites now fixed, confirming `tsc`'s two errors were the complete set, not a partial one it happened to catch first.
- `grep -rln "ShoppingListItem" mobile --include="*.ts" --include="*.tsx"` → only `track.ts` itself (the interface definition). Zero consumers exist yet, so `vendor_id` needed no companion fix anywhere — expected, since nothing in the app reads or writes `ShoppingListItem` before Task 6 wires up `shopping.ts`.

**RPC parameter names verified against the migration, not assumed** (`tsc` cannot check RPC argument names against an untyped client — a typo here fails only at runtime, after Task 10's owner-gated apply): `grep -n "create or replace function public.replace_item_locations\|p_item_id\|p_rows" supabase/migrations/20260731100000_shopping_intelligence.sql` confirms the function signature is `replace_item_locations(p_item_id uuid, p_rows jsonb)` and every reference inside the function body uses those same two names throughout (`p_item_id` in the ownership lookup, the delete, the insert, and the not-found error; `p_rows` in the array-length guard, the validation loop, and the insert loop). The wrapper's `supabase.rpc("replace_item_locations", { p_item_id: itemId, p_rows: rows.map(...) })` matches exactly.

**What the old `replaceItemLocations` did, and what the wrapper preserves:** the pre-Task-5 function ran a client-side sequence — delete every location row for the item, insert the replacement rows (fields listed explicitly rather than spread, so a caller could never forward a source row's `id`/`created_at`/`updated_at` into the insert), then resync `food_inventory.quantity` to Σ(rows) on success or to `0` on an insert failure (never attempted on a delete failure, since a failed delete threw before the insert ran at all), and finally surfaced the insert's error in preference to a failed resync's error so a masking failure could never hide the one the caller actually needed to see. The atomic wrapper preserves every outcome a caller depends on — rows genuinely replaced, the cache genuinely resynced, empty arrays genuinely rejected (now server-side, before any write, rather than by the client's own guard), and exactly one meaningful error surfacing per call — while making the partial-failure states that motivated the old resync-to-0 path unreachable. That path is **gone by design, not merely refactored away**: a failed `replace_item_locations` call now rolls back the whole transaction, so the item's prior rows and prior cache value are left exactly as they were before the call, and there is nothing left to resync. The "honest zero" the old code wrote on a failed insert was a damage bound for a client-side sequence that could get halfway through; the RPC's atomicity removes the halfway state it was bounding.

**Verified, no change needed** (checked directly, not inferred from the plan's line numbers): `grep -rn "replaceItemLocations" mobile/` finds exactly three references repo-wide — the definition in `inventory.ts` and the two calls in `EditFoodScreen.tsx` — confirming the plan's cited call-site line numbers (`:728`, `:867`) were accurate and no third call site exists anywhere in the app. `FoodLocation` was already imported into `inventory.ts`'s existing type-only import block, so the new signature needed no import change. `user`/`user.id` remains live at both call sites after dropping the RPC's now-unnecessary `userId` argument: in the create-path branch it feeds `itemData.user_id` and the category/subcategory mapping inserts; in the update-path branch it feeds the same two mapping inserts — dropping the argument orphaned nothing. `TrackingCategory` has exactly two consumers repo-wide (its own definition and `app/(tabs)/track/index.tsx`); that file resolves category cards from a hand-written literal array filtered by section, and routes by template string (`` `/(tabs)/track/${categoryId}` `` against Expo Router's file-based routing) rather than an exhaustive `switch` or a keyed lookup map, so adding `"shopping"` to the union is inert today — no partial-wiring hazard, and no map anywhere needs a matching entry until Task 7 adds the hub card and route.

**Known and expected between now and Task 10:** `replace_item_locations` exists only in the migration file as of this commit — it has not been applied to any database, because applying it is Task 10's owner-gated step. Until that apply happens, every call to `replaceItemLocations` from `EditFoodScreen` (both the create and the update save paths) will fail at the Supabase RPC call with a "function does not exist" error, and the screen's existing error handling will surface it as the create-path rollback or the "Stock Not Saved" alert, respectively. This is a real, if temporary, regression window on device — location edits cannot be saved from `EditFoodScreen` between this commit and Task 10's apply — and the owner should know that plainly before testing this branch on a real device or simulator, rather than discovering it as a surprising save failure.

**Code-quality review (second pass) confirmed the wrapper is a faithful, improved replacement**, not just a shorter one: identical column set on the insert; `notes` JSON-null semantics equivalent (`r.notes ?? null` on both sides of the RPC boundary); `location` is `TEXT` with a `CHECK` constraint, so handing it through the untyped `rpc()` call carries the same runtime safety the old typed `.insert()` call had; the `quantity` value reaching the RPC is safe to cast to `integer` because every caller already ran it through `parseQuantityInput`'s `Number.isInteger` gate before it reached `locationRows`. Dropping the `userId` parameter is a **fix**, not a scope reduction: the RPC stamps `food_inventory_locations.user_id` from `food_inventory.user_id` server-side rather than trusting whatever the caller happened to pass, and its `select ... for update` acquires a row lock the old client-side sequence never took (see the Task 1 amendment's ABBA-deadlock entry for the lock's own cost). The review also confirmed the create-path rollback (the `try`/`catch` around the RPC call that deletes the just-inserted item row on failure) still compensates for a live failure mode — an RPC failure genuinely can leave a freshly-created item with zero location rows — not a dead one the atomicity has since closed.

That review surfaced two copy/comment-accuracy findings in `EditFoodScreen.tsx`, both fixed in this round with **no control-flow change** — the plan's Step 2 instruction to keep error handling as-is is about `try`/`catch`/`return` structure, and that stayed byte-identical; only comment text and one `Alert.alert` string changed:

1. **(Important) The update-path failure alert asserted an impossible state.** The alert at `EditFoodScreen.tsx:870` (pre-fix) read: *"The item's other details were saved, but its stock may not have been saved and may now read 0. Tap Save again to restore the quantity."* Under the RPC, "may now read 0" cannot happen: every failure mode (the validation `raise`, the not-found `raise`, or an insert/update error) rolls back inside PostgREST's per-request transaction, leaving the prior location rows and the prior cache byte-identical to before the call — and the update path never writes `quantity` from `itemData` in the first place (dropped deliberately; see the comment at `:634-636`). Even a lost-response case (the RPC actually succeeded server-side but the client never saw the response) yields the *new* total, never `0`. So post-failure the quantity reliably reads the item's **previous** stock, not a fabricated zero. Concrete cost of leaving it as-was: the owner edits a 12-unit item, the save fails, the alert claims the quantity may now read 0, they open the inventory grid, see 12, and start hunting for cache/grid divergence that atomicity has made impossible — exactly the confusion the old code's honest-zero resync path existed to prevent, re-introduced at the copy layer even though the underlying mechanism it was warning about no longer exists. Rewritten to state what's now true: *"The item's other details were saved, but its stock was not — it still shows the previous quantity. Tap Save again to retry."* The comment directly above it (`:853-861` pre-fix), which said the copy "still hedges rather than promising" the previous-quantity guarantee, was also wrong post-fix — the rewritten copy is a positive claim, not a hedge — and was reworded to match (see Fix 2 below for the rest of that comment's rewrite).

2. **(Minor) The rollback-reasoning comment overstated its own guarantee.** The comment above the RPC call said a failure "rolls the whole transaction back, so the stock is left exactly as it was before this save." True for the location rows and the cache, but the `food_inventory` UPDATE a few lines above has already committed independently, and `itemData` can carry `storage_type`/`location` changes. A single → multi flip that then fails leaves `storage_type = 'multi-location'` committed against the surviving single-location rows, and `lowThresholdFor` branches on `storage_type` (`mobile/src/lib/stockState.ts:81`), so the item's low/out badge is computed against the wrong threshold column until the user re-saves successfully. Not a regression — the pre-Task-5 code had the identical statement ordering and was strictly worse (it also zeroed the stock on top of this same residual) — but the sentence claimed more than the code delivers. Narrowed to name the location rows and cache specifically, and added the `storage_type` residual as its own clause with the `stockState.ts:81` citation, folded into the same rewritten comment block as Fix 1.

**The interim window (Task 10 not yet applied) is worse than first recorded above.** Every update-path save between now and Task 10's apply hits PostgREST's `PGRST202` ("Could not find the function public.replace_item_locations in the schema cache"). Neither alert path surfaces `error.message` to the user — the raw error only reaches `console.error` at `:867` (create path) and the equivalent line on the update path — so on device the owner sees only the generic alert text, taps Save again exactly as instructed, and loops indefinitely without a diagnostic clue that the RPC itself doesn't exist yet. The **create path degrades more gracefully by contrast**: its rollback deletes the newly-inserted item row, `throw locationError` propagates to the outer `catch`, and the generic `"Failed to save item"` alert at `:880` (unaffected by this round's changes) is accurate as written — it doesn't claim anything about *why*. Recorded explicitly so the owner knows not to exercise location edits on device before Task 10's apply lands, rather than filing this as a new bug.

**Required vs. optional `preferred_vendor_id` — required is correct, recorded with its one soft spot.** `FoodInventoryItem.preferred_vendor_id` is `string | null`, so making it `preferred_vendor_id?: string | null` would only add `undefined` to a union every consumer already has to null-check — no expressiveness gained — while permanently weakening the type for every reader added after Task 10, just to save the two one-line literal fixes this round already made in `add.tsx`/`preview.tsx`. Left required. The soft spot is untyped-client-shaped, not a design flaw: `fetchInventoryWithState`'s `as FoodInventoryItem[]` cast (`mobile/src/lib/supabase/inventory.ts:51`) will hand back real rows where `preferred_vendor_id` is `undefined` (the column simply won't exist in the untyped response) rather than `null`, for every query issued before Task 10's migration applies. No consumer of the field exists yet — Task 8 adds the first (the preferred-vendor picker) — so this is a live hazard only if Task 8 is built and exercised on device before Task 10's apply. **Carried forward to Task 8's reviewer**, who should verify the picker's read of this field tolerates `undefined` as well as `null` until the migration is confirmed applied, or verify Task 10 has landed first.

**Non-issues checked and cleared** (the second review's negative space, recorded so a future reviewer doesn't re-chase any of it): the client-side empty-array guard the old function threw (`rows.length === 0`) was removed without a replacement client-side check, and that's safe — both call sites structurally guarantee ≥1 row before calling `replaceItemLocations` (`locationRows` for a single-location item always pushes exactly one row; the multi-location path returns early at `:507` when `locationEntries.length === 0`, before `replaceItemLocations` is ever reached), and the RPC's own `p_rows` array-length guard is the actual enforcement point regardless. The old code's insert-error-preferred-over-cache-error masking logic has no equivalent in the wrapper and needs none — one RPC call produces one error, so there's nothing left to mask. Location-row insert ordering was confirmed to have no reader anywhere (no code sorts or indexes into `food_inventory_locations` by insertion order). And the old code's caller-supplied `userId` versus the RPC's server-resolved `food_inventory.user_id` can only diverge for an item the caller doesn't own in the first place, which RLS already blocks upstream of this function entirely — so dropping the parameter closes a redundant trust boundary, not a load-bearing one.

**Verification:** `cd mobile && npx tsc --noEmit` → exit 0. `npm test`:
```
Test Suites: 11 passed, 11 total
Tests:       309 passed, 309 total
```
(309 = unchanged across both rounds — the initial task added no new tests, since it is a type/wrapper change with no new pure-lib logic to pin, and this round's fixes are copy/comment-only with no behaviour to pin either; the existing suite's silence on `replaceItemLocations` was expected and confirmed by grep — nothing in `mobile/src/lib/__tests__` references it.) The plan's Task 5 code block (the wrapper) was re-diffed programmatically against `mobile/src/lib/supabase/inventory.ts` and found byte-identical, the same check used for Tasks 1, 3, and 4; this round's `EditFoodScreen.tsx` changes were confirmed by direct diff to touch only comment lines and the one `Alert.alert` string — zero lines of `try`/`catch`/`return` control flow changed.

### Task 6 — the shopping query module

Spec review independently re-derived the full table/column checklist and confirmed it against the migrations; verified RLS sound on every table and verb touched by this module, including `clearPurchased` (`DELETE ... WHERE is_purchased = true`, running under the RLS policy at `20250209_extend_food_inventory.sql:106-108`, so the effective predicate is `is_purchased = true AND auth.uid() = user_id` — a caller can only ever clear their own purchased rows); confirmed `transferInventoryUnits`'s argument order (`itemId, fromLocationId, toLocationId, quantity` — `inventory.ts:75-88`) against both the client wrapper and the `transfer_inventory_units` RPC's plpgsql (`20260730100000_inventory_locations_truth.sql:107`), so the purchased→restock offer in Task 7 moves stock the right direction; confirmed the error-handling asymmetry between the three raw queries and the two fetcher calls was correct, not a gap; and confirmed no off-by-one in `errors.slice(1)`. Five findings came back, three Important and two Minor, plus four items explicitly checked and accepted with no change. All are addressed in this round.

**Fix 1 (Important) — restored the `src/lib` → `src/components` layering invariant.** The original commit imported `getLocalDateString` from `@/src/components/track/meals/mealsHelpers`. `mobile/src/lib/dates.ts:1-9` states the rule this module's own home exists to enforce: `src/lib/**` must not import from `src/components/**`, and `lib/supabase/mealLibrary.ts` importing `getLocalDateString` from the components tree was the app's only such edge — closed by moving the definition to `lib/dates.ts` and leaving `mealsHelpers.ts` as a re-export for its own (components-tree) callers. The Task 6 commit put that edge back. Fixed: `import { getLocalDateString } from "../dates";`, matching the sibling `mealLibrary.ts:6`'s form exactly. Confirmed with the same grep the rule's own comment prescribes: `grep -rn 'from "@/src/components' mobile/src/lib/` returned the one hit (this line) before the fix and zero after.

**Fix 2 (Important) — restructured the module so Task 8's extraction is possible without a serialized round trip; this is a deliberate structural deviation from the plan's original verbatim Task 6 code block.** Plan Task 8 Step 2 told its implementer to extract `fetchConsumptionRates(todayLocalDate, totalsById)` into this file "rather than duplicating the events expansion." But as originally written, `totalsById` derives from `inventory`, which itself only resolves *inside* the same `Promise.all` as the raw `meal_logs` query — so a helper taking `totalsById` as a parameter could only be called *after* that `Promise.all` settled, turning what should be one parallel round trip into a sixth, sequential one on the shopping screen's cold load. The plan's own Task 5 risk list then quietly waved this through as "implementer lifts the events-expansion block verbatim" — i.e., exactly the duplication Step 2's own instruction forbade. The plan contradicted itself between what Task 6 built and what Task 8 Step 2 told its implementer to do with it; resolved here rather than carried forward for Task 8 to discover.

Restructured into three pieces: `expandDecrementEvents(rows)` — pure, exported, the row→events expansion in isolation, unit-testable independent of any fetch; `fetchDecrementEvents()` — the trailing-window `meal_logs` query (same `RATE_WINDOW_DAYS + 7` slack and its "slack for the span gate" comment, unchanged) piped through the expansion, throwing on its own query error; and `fetchConsumptionRates(todayLocalDate, totalsById)` — Task 8's entry point, `estimateConsumption({ events: await fetchDecrementEvents(), totalsById, todayLocalDate })`, one round trip, rates only. `fetchShoppingData` now puts `fetchDecrementEvents()` directly into the `Promise.all` slot the raw query occupied, and calls `estimateConsumption` after the whole batch settles — restoring the parallelism Task 8's naive extraction would have cost. The `errors` array shrank from `[listRes.error, vendorsRes.error, logsRes.error]` to `[listRes.error, vendorsRes.error]`, with a new comment explaining why: `fetchInventoryWithState` and `fetchMealLibrary` already throw on their own internal errors before returning (verified by reading both — `inventory.ts:44-49` and `mealLibrary.ts:72-77` each collect their own parallel-call errors and throw the first), and `fetchDecrementEvents` now does the same, so `events` at the `Promise.all` destructure is already-resolved, already-validated data with nothing left to check. `slice(1)`-log-then-throw-first is preserved unchanged for the two that remain.

**Both plan sections were updated to agree, not just the source.** Task 6's code block above now matches the restructured source exactly (re-diffed, see Verification). Task 8 Step 2's instruction was rewritten from "extract a helper … rather than duplicating the events expansion" to a direct call — `fetchConsumptionRates(todayLocalDate, totalsById)` is already fully built and exported by Task 6, so Task 8 has no extraction left to perform and no events-expansion code to lift, verbatim or otherwise. The Task 5 risk-list bullet describing the lift was removed and replaced with a note that Task 6 already closed it.

**Fix 3 (Important) — stopped asserting a fidelity the source data doesn't have.** The original comment above the events loop read "Decrement events: one per unit" — stated as fact. But `mealLibrary.ts:417-422`, directly above the only current writer of `inventory_items`, says the opposite in its own words: *"this records INTENT, not outcome. These rows are written before the consume RPC runs below, so a row can claim {id, quantity: 1} for a unit that was never taken … No current code path treats it as truth … Read consumed > 0, not this."* `fetchShoppingData` (via `fetchDecrementEvents`/`expandDecrementEvents`) is now that code path, and two reachable routes make it an over-count, not merely an approximation: (a) `mealLibrary.ts:441-453` — a failed `consume_inventory_units` call throws `MealLoggedButDecrementFailed` and *deliberately does not delete* the just-inserted log row, so the phantom claimed unit has no cleanup path and persists indefinitely; (b) a stale-read race in `resolveInventoryMatches` where the snapshot used to build `inventory_items` and the live state the consume RPC reads have already diverged, so the RPC decrements 0 while the log row still claims 1. Near `MIN_UNITS = 3`, two such phantom units in a month is the difference between "no estimate" and an estimate built mostly from units never actually eaten — inflating `ratePerDay`, deflating `daysUntilOut`, and capable of firing a spurious priority-3 forecast suggestion with a wrong "~Nd left" line.

There is no cheap code fix — actual decrements aren't persisted anywhere this lib could read instead — so this is documented, not patched. Added a fourth bias to `consumptionRate.ts`'s header, explicit that it's unlike the first three: bias (1)-(3) are all *under*-counts (containers-not-servings, the Phase 4 pre-apply gap, and the `RATE_WINDOW_DAYS`-vs-`MIN_SPAN_DAYS` divisor slack), and omitting an over-count source would have made that list read as exhaustive when it isn't. Mirrored into the plan's Task 3 code block and re-diffed (see Verification — both stayed in sync, same discipline as the Task 3 amendment's `MAX_DISPLAY_DAYS` change). `shopping.ts`'s own comment was rewritten from the flat "one per unit" claim to name what the events actually are — *claimed* units, cross-referencing `mealLibrary.ts:417-422` and the writer-side failure modes by line number — on `expandDecrementEvents`'s doc comment, the function that now owns the expansion.

**Fix 4 (Minor) — made the restock-target tiebreak deterministic.** `it.locations[0]` as the "else its first location" fallback (spec §8 sanctions this fallback explicitly; only "first" was undefined) was non-deterministic: `fetchInventoryWithState`'s locations select carries no `.order()` (`inventory.ts:40`), so for a multi-location item with no ready-to-consume row, which row Postgres/PostgREST hands back first can differ between requests — the same purchase could land in the pantry today and the freezer tomorrow with no code change in between. Fixed by sorting a copy of `it.locations` by `id` before either the `find` or the `[0]` fallback, with a one-line comment naming both the cause (`inventory.ts:40` has no `.order()`) and the fix's contract (spec §8 sanctions the fallback; this defines "first" as stable).

**Fix 5 (Minor) — hardened the expansion against unvalidated JSONB while already rewriting the block for Fix 2.** `inventory_items` is JSONB with no DB-side shape constraint. Traced two reachable failure modes if a row is malformed: a non-array value (e.g. a stray object) sent `for…of` into `TypeError: not iterable`, escaping `fetchShoppingData` entirely and failing the **whole screen load**, not just the forecast section; and an unbounded or fractional `quantity` could grow `events` without limit (heap exhaustion) or silently mis-loop. Guarded with `Array.isArray(log.inventory_items)` (skip, don't throw, on a non-array row) and clamped the per-row claimed-unit count to `Math.min(Math.max(Math.trunc(u.quantity), 0), MAX_CLAIMED_UNITS_PER_ROW)` (truncated, non-negative, capped at 1000). **Recorded explicitly as hardening, not a bug fix**: every writer of `inventory_items`, current and historical, hardcodes `quantity: 1` (`mealLibrary.ts:423`, `MealsScreen.tsx:568-570`, and grep confirms no other writer exists anywhere in the repo's history) — so as of this commit the inner loop's guard is dead generality, defending against a shape the app has never actually produced, not one observed in the wild.

**Considered, no change — recorded so a future reviewer doesn't re-chase any of it:**
- *Silent zero-row updates.* `update(...).eq("id", id)` matching no row resolves with `error: null` — the mutation reports success and the change simply doesn't show up. Reachable only via a concurrently-deleted row, in a single-user app whose ids all come from the RLS-scoped select in the same fetch cycle; the re-fetch self-corrects on the next load and nothing looks visibly wrong in between. Adding `.select("id")` existence assertions to every mutation would diverge from the pattern every other mutation module in `src/lib/supabase/` already follows. Accepted as-is.
- *`addSuggestions`'s explicit `userId` parameter is justified, not a smell — even though Task 5's `replaceItemLocations` just dropped its own `userId` parameter in the opposite direction.* `shopping_list.user_id` is `NOT NULL` with `WITH CHECK (auth.uid() = user_id)`, so a direct PostgREST `.insert()` has no server-side identity to fall back on and must supply `user_id` client-side. Task 5's RPC could drop `userId` only because a plpgsql function reads `auth.uid()` server-side; an `.insert()` through PostgREST has no equivalent — there is no RPC boundary here to resolve identity behind. The other five mutations in this file all target existing rows by `id`, where RLS alone (no explicit `user_id` needed in the call) already scopes the operation to the caller's own rows.
- *`food_inventory` is read three times per `fetchShoppingData` call* (`fetchInventoryWithState`, and twice inside `fetchMealLibrary` — once for its own resolution inventory, once transitively for assemblability), but all three sit inside the same top-level `Promise.all`, so it costs one round trip of wall clock, not three sequential ones. The two shapes genuinely differ and aren't a slip: `assessAssemblability` needs `AssemblabilityInventoryRow`, which carries a top-level `daysLeft` that only `fetchMealLibrary`'s query produces — so `library.inventory` feeding `mealGaps` while `inventory` (from `fetchInventoryWithState`) separately feeds `suggestions` is the correct shape match, not redundancy to collapse. A write interleaving between the two concurrent reads could in principle make `mealGaps` and `suggestions` disagree by one unit for a single render; benign in a single-user app that re-fetches on every screen focus.
- *`.filter((e) => e !== null)` lacks a type predicate*, so `errors[0]` is statically `PostgrestError | null` even though the runtime guarantee is stronger. Identical in both sibling modules (`inventory.ts`, `mealLibrary.ts`) and never actually null at the point it's thrown (the length check above it guards that). Left alone for consistency with the established pattern.

**Verification:** `cd mobile && npx tsc --noEmit` → exit 0. `npm test`:
```
Test Suites: 11 passed, 11 total
Tests:       309 passed, 309 total
```
(309 = unchanged — no new test file was added for the now-pure, now-exported `expandDecrementEvents`; the fixes are a layering correction, a structural extraction with no behavior change to the numbers `estimateConsumption` already had test coverage for via `consumptionRate.test.ts`, a comment/documentation change, and two small guards with no currently-reachable input that exercises them, per Fix 5's own dead-generality note.) The plan's Task 6 code block was re-diffed programmatically against `mobile/src/lib/supabase/shopping.ts` and found byte-identical (modulo the banner line, the established convention since Task 3); the plan's Task 3 code block was independently re-diffed against `mobile/src/lib/consumptionRate.ts` for the 4th-bias header addition and also found byte-identical.

**Re-review (second round).** Behaviour-preservation of the round-one restructure was independently verified: the `Promise.all` destructuring alignment was checked slot by slot against the pre-restructure commit (`0547d20`) — the 5th slot (raw `meal_logs` query) was replaced in place by `fetchDecrementEvents()`, no positional shift into `listRes`/`inventory`/`library`/`vendorsRes`; `estimateConsumption`'s three arguments (`events`, `totalsById`, `todayLocalDate`) were confirmed unchanged in both call sites; `ratesById` was confirmed still reaching both its consumers (`ShoppingData.ratesById` and `computeShoppingSuggestions`'s `rates`); and parallelism was confirmed genuinely preserved — no `await` sits before the `Promise.all` batch. The clamp in `expandDecrementEvents` was run against every input class the reviewer could construct — `NaN`, `Infinity`, negative, float, string, `null`, `[]` — and every path was confirmed to terminate; `Infinity` clamping to `MAX_CLAIMED_UNITS_PER_ROW` was flagged as the sharpest catch, since the pre-Fix-5 loop (`i < u.quantity`) would have hung forever on that input. The restock-target sort (Fix 4, prior round) was independently confirmed non-mutating (`[...it.locations].sort(...)`, not `it.locations.sort(...)`), which matters because `it.locations` is the same array reference the `inventory` the caller reads elsewhere in the function holds — an in-place sort would have been a silent side effect on shared state. Three further findings came back from this round, addressed below, plus one behaviour change explicitly judged benign rather than a defect.

**Fix 1 (Important) — `expandDecrementEvents` moved into `consumptionRate.ts`; the earlier "exported so it's unit-testable" claim was wrong, and now it actually is.** Round one exported the function from `shopping.ts` on the theory that exporting makes a pure function testable. It doesn't, and `mobile/jest.config.js` explains why in its own opening comment: *"Jest is scoped to pure TypeScript libs only (no React Native imports)"* — `ts-jest`, `testEnvironment: "node"`, no RN preset, no setup file. A `shopping.test.ts` importing `shopping.ts` would transitively pull in `../supabase` (`createClient(...)`) and `./largeSecureStore` (`expo-secure-store`) at module load — exactly the class of import the config exists to keep out of the suite, and exactly why, before this fix, zero of the 11 suites covered anything under `src/lib/supabase/` despite that directory existing since Phase 2. The convention isn't "only some libs get test coverage" — it's "only modules that don't drag the Supabase client into their import graph," and `expandDecrementEvents` was pure logic sitting on the wrong side of that line.

Moved to `consumptionRate.ts`, which already owns `DecrementEvent` (the type the function produces) and imports only `./stockState` (pure). Added one new import, `type { InventoryUsage } from "@/src/types/track"` — checked for a cycle risk before adding: `types/track.ts` has zero imports of its own (confirmed by reading the file's first lines), so it's a types-only leaf and the import is safe. `shopping.ts` now imports `expandDecrementEvents` alongside `estimateConsumption` from `../consumptionRate` instead of defining it locally; `fetchDecrementEvents` and `fetchConsumptionRates` stayed in `shopping.ts`, since both genuinely need the Supabase client and have no reason to move.

Pinned with eight new cases in `consumptionRate.test.ts`'s new `describe("expandDecrementEvents", ...)` block — the hardening branches are the entire point of the coverage, since every real writer of `inventory_items` hardcodes `quantity: 1` (`mealLibrary.ts:423`, `MealsScreen.tsx:568-570`) and nothing else will ever reach them on device:

1. Happy path (two rows, `quantity: 1` each) → 2 events, correct `inventoryId`/`dateLocal` pairing.
2. `quantity: 3` on one row → 3 events, all carrying that row's `date`.
3. `inventory_items: null` → skipped, no throw.
4. `inventory_items` as a JSON object `{}` (not an array) → skipped, no throw — the case that would otherwise fail the entire screen load, not just the forecast section.
5. `quantity: 0` and `quantity: -5` → 0 events.
6. `quantity: 1e9` → exactly `MAX_CLAIMED_UNITS_PER_ROW` events, asserted against the exported constant rather than a re-typed literal — pins the cap and proves the loop terminates.
7. `quantity: NaN` and `quantity` missing entirely → 0 events — proves no infinite loop on either malformed shape.
8. An entry missing `id` → an event with `inventoryId: undefined`, then fed through `estimateConsumption` to assert the pair's contract holds: `totalsById.get(undefined)` is `undefined`, so the phantom event is silently dropped rather than crashing or fabricating an estimate.

All eight pass (see Verification below); `MAX_CLAIMED_UNITS_PER_ROW` was already exported (round one), so case 6 needed no further change to reference it directly.

**Fix 2 (Important) — corrected a stale "three raw-query results" comment that had drifted from its own `errors` array.** `shopping.ts`'s comment above `fetchShoppingData`'s error check read "only the three raw-query results here carry a `.error` to check," written when the array was `[listRes.error, vendorsRes.error, logsRes.error]`. Round one's own restructure shrank that array to two elements (`[listRes.error, vendorsRes.error]`) two lines below but left the prose unchanged — a self-contradiction sitting in the same ten lines. Because the plan's Task 6 code block is kept byte-identical to source, the same wrong word was sitting in the plan too, and would have been copied forward verbatim by anyone re-deriving the module from the doc rather than reading the live file. Fixed in both places: "three" → "two." (The amendment prose above, in the Fix 2 entry for the *first* round, deliberately still says "the three raw queries and the two fetcher calls" — that describes the pre-restructure commit under review at the time and remains correct as a historical description; only the source comment and the plan's mirrored code block needed the correction.)

**Fix 3 (Important) — Task 8 Step 2's import sentence was stale and would not have compiled.** The rewritten Step 2 (this file's own prior-round fix) correctly told the implementer to call `fetchConsumptionRates(todayLocalDate, totalsById)` directly, and the re-review confirmed the prescribed `totalsById` construction — `new Map(items.map((it) => [it.id, it.state.totalQuantity]))` — works verbatim against `FoodInventoryScreen.tsx`'s actual `items` variable (`:63`, `:109`), and that `getLocalDateString()` is already imported there (`:35`), so neither needed a companion fix. But one retained sentence, held over from before the rewrite, still read: *"Import `MAX_DISPLAY_DAYS` alongside `estimateConsumption`'s type from `@/src/lib/consumptionRate`"* — stale, since Task 8 no longer calls `estimateConsumption` at all after the rewrite, so "`estimateConsumption`'s type" has no referent, and an implementer following it literally would write `import { MAX_DISPLAY_DAYS, type estimateConsumption }`, which is not valid TypeScript as a type-only import target. Replaced with a sentence that names the actual imports needed (`MAX_DISPLAY_DAYS`, `type ConsumptionEstimate` for the rates-map type, and `fetchConsumptionRates` from `@/src/lib/supabase/shopping`) and explicitly names the result `ratesById` — the missing piece that mattered, since the step's own render block references `ratesById` but no prior sentence had introduced that name.

**One behaviour change judged benign, recorded rather than silently accepted.** If `meal_logs` and `shopping_list` both error on the same `fetchShoppingData` call, `fetchDecrementEvents()` — being one of the five `Promise.all` slots and throw-style rather than result-style — now rejects the whole `Promise.all` as soon as its own error surfaces, so the `meal_logs` error is what propagates and the `shopping_list` error (sitting in `listRes.error`, never inspected because the destructure itself never completes) is not the one the caller sees. This is not new in kind: `fetchInventoryWithState` and `fetchMealLibrary` were already two of five throw-style slots mixed into the same result-style `Promise.all` before this round's restructure ever touched the file — round two just adds a third throw-style slot alongside them, changing which of several possible simultaneous failures wins the race, not whether the failure surfaces at all. The user still gets an accurate, real error either way; which one, when two fire in the same request, was already non-deterministic before this commit and remains so after it.

**Verification:** `cd mobile && npx tsc --noEmit` → exit 0. `npm test`:
```
Test Suites: 11 passed, 11 total
Tests:       317 passed, 317 total
```
(317 = 309 + the 8 new `expandDecrementEvents` cases; no other suite's count moved.) The plan's Task 3 and Task 6 code blocks were both re-diffed programmatically against their now-updated source files (`consumptionRate.ts` gained the moved function; `shopping.ts` lost it and gained the `expandDecrementEvents` import plus the two-vs-three comment fix) and both remain byte-identical to source, modulo the banner line.

### Task 7 — the Shopping List screen

Spec review passed with no findings. Code-quality review of the Task 7 commit found one Critical defect and several worth taking, all reproduced faithfully by the implementer from this plan's own Step 2 code block — these are plan defects, not implementation slips. One Critical, two Important, and two Minor fixes are below, plus one deliberate deferral resolved as a documentation correction rather than a code change, plus the review's negative space, which is substantial and preserved here so a future reader doesn't re-chase any of it. Line numbers below (`:NN`) refer to the pre-fix commit unless stated otherwise.

**Fix 1 (Critical) — a failed `markPurchased` still offered the restock, and accepting it corrupted stock.** `run` (`:55-66`) caught its own error, alerted, reloaded, and returned `Promise<void>` — no success signal. `handlePurchase` (`:80-100`) did `await run("Failed to mark purchased", ...)` and fell straight through to the restock-offer block on *any* outcome, success or failure, because there was nothing in the return value to branch on. Verified reachable: drop the connection on a checkbox tap → "Failed to mark purchased" alert fires, reload runs silently → the restock `Alert.alert` then stacks on top of it (each `Alert.alert` call allocates its own `UIWindow` above the previous one, so both are independently dismissable and the second is not gated on the first). Tap "Add to stock" and `transferInventoryUnits` succeeds on its own terms — the item's on-hand quantity rises for a row whose `is_purchased` is still `false`. That inflated total feeds `projectItemStock` → `isLow`/`isOut` → `computeShoppingSuggestions`, so the item silently stops being suggested while the unpurchased row still sits on the list, and there is no user-visible sign anything went wrong beyond the first alert, which reads as fully resolved. Spec §8 sanctions the offer *after* `markPurchased`; the plan's code offered it after merely *attempting* it.

Fixed by making `run` return `Promise<boolean>` — `true` on the try path (after `fn()` and the reload both succeed), `false` in the catch, with `setBusy`'s bracketing (Fix 2) moved into a `finally` so the flag clears on every exit. `handlePurchase` now does `const purchasedOk = await run(...); if (!purchasedOk) return;` before ever reading `data?.restockTargetByItemId`. Every other `run(...)` call site (`handleAdd`, the checkbox's `unmarkPurchased` branch, the vendor-chip `updateListItem`, the remove confirm, the restock offer itself, "Clear purchased") already discarded the return value with no sequencing after it, so the signature change is additive — none of those call sites needed a companion change, and `tsc` would have caught it if one had.

**Fix 2 (Important) — no in-flight guard, and the refetch was invisible, which made two separate double-write bugs reachable.** `fetchShoppingData` is 13 Supabase round trips (1 `shopping_list` + 4 from `fetchInventoryWithState` + 6 from `fetchMealLibrary` + 1 vendors + 1 `meal_logs`) plus two engine passes — plausibly 0.5–2s on a phone. During that window the plan's code changed nothing on screen: `data` stayed non-null so the list kept rendering pre-mutation state, no spinner, no disabled control. A tapped checkbox stayed visibly unchecked through the whole round trip, which invites a second tap. Two concrete double-write paths were confirmed reachable: double-tapping a checkbox runs `handlePurchase` twice, surfacing two restock offers whose acceptance adds `2 × quantity` to stock; double-tapping "Add all" or a suggestion's ＋ inserts the same suggestion rows twice, since suppression only applies on the *next* load, after the duplicate rows already exist server-side — the plan's own "Known accepted risks" note about manual-add duplicates does not cover this path, which fires within a single load cycle. Overlapping `load()` calls could also resolve out of order and leave a stale snapshot rendered over a newer one.

Fixed with a single `busy` boolean, set `true` at the top of `run` and cleared in a `finally` (so it clears on the success path, the alert-and-reload catch path, and — trivially — if `fn()` throws synchronously). Every mutating control reads it: the checkbox, the suggestion's ＋, "Add all", each vendor chip, the row's remove ✕, and "Clear purchased" all pass `disabled={busy}`, matching the sibling `saving`/`disabled` idiom used throughout `src/components/track/*Modal.tsx` (`WaterGoalEditorModal.tsx:68,95,102`, `QuickAdjustmentModal.tsx:113,189,200`) rather than inventing a new one. Visual feedback reuses the same siblings' `opacity: 0.5` dimming pattern (`QuickAdjustmentModal.tsx:300`'s `buttonDisabled`) via a new shared `controlDisabled` style, applied alongside `disabled` on each of those same controls. The vendor-picker toggle (⇄) and the "Open ↗" deep link are intentionally left ungated — neither calls `run`, so neither can double-fire a mutation.

**Fix 3 (Important) — a failed reload was unrecoverable after the first successful load, and there was no pull-to-refresh.** `loadFailed` was effectively write-only: the Retry affordance was gated on `!data && loadFailed`, but `data` is never set back to `null` on a later failure, so after one successful load, a subsequent failed `load()` sets `loadFailed` and nothing ever reads it again — one alert, then stale rows with no way to re-fetch short of leaving and re-entering the screen. Confirmed this also compounds the empty state: `ListEmptyComponent` ("Nothing to buy — stock looks good.") renders whenever `sections.length === 0`, so in the failed-reload case it would confidently assert an empty list based on the last *successful* load rather than the failed one. The reviewer confirmed no track-tab container uses `useFocusEffect` and this screen has no forward navigation of its own, so it remounts on every re-entry from the hub — a focus-refetch was checked and correctly judged unnecessary, not added.

Fixed with a `RefreshControl` on the `SectionList`, matching `FoodInventoryScreen.tsx:669-676`'s existing pull-to-refresh (`tintColor`/`colors` `#14B8A6`, `title="Pull to refresh"`, `titleColor="#9CA3AF"`) — a new `refreshing` boolean, set `true` before `load()` and `false` after it resolves (`load` never throws out of its own try/catch, so the `false` always runs). This is the real recovery path the empty-state risk above needed; the empty state's rendering logic itself was left alone per Fix 5's scope note, since a correct pull-to-refresh removes the actual gap (being stuck on a stale snapshot) without needing to distinguish "empty because failed" from "empty because actually empty" in the render branch itself.

**Fix 4 (Minor) — four one-liners:**
- **The empty state wasn't centered.** `styles.centerFill` (`flex: 1`) has no height to fill inside the `SectionList`'s content container when the section list is empty, so it collapsed to content height and sat under the header instead of centering, unlike the loading/error branches (direct children of the `flex: 1` screen `View`). Fixed by adding `flexGrow: 1` to `contentContainerStyle`.
- **`Linking.openURL(section.url!)` was unguarded.** `nutrition_vendors.app_url` is free text the owner types into a `TextInput` (Task 9), so a malformed URL or an uninstalled scheme rejects the promise with no handler — an unhandled rejection, and to the user the "Open ↗" tap silently does nothing. The repo's other two `openURL` call sites are also unguarded, but neither of those URLs is user-authored, so they weren't touched. Fixed with a `.catch` that alerts, using the same `title, e instanceof Error ? e.message : "Unknown error"` idiom `run` already uses elsewhere in this file.
- **The section-title `TouchableOpacity` was `disabled` for every non-purchased header.** Visually identical either way, but `disabled` sets `accessibilityState.disabled`, so VoiceOver announced "Suggested (4), dimmed button" on every header that isn't actually a button. Fixed by rendering a plain `Text` for the "Suggested" and per-vendor/"Anywhere" headers, and wrapping only the "Purchased" header's title in the collapse-toggle `TouchableOpacity`.
- **The ⇄ and ✕ row controls had touch targets well under the 44pt guideline** — bare `Text` with `paddingHorizontal: 4`, roughly 19pt tall, ~18pt apart, destructive control on the right. Fixed with `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}` on both.

**Fix 5 (Minor) — the vendor picker moved the toggle control out from under the finger.** The picker rendered inside `rowMain`, which sits in `styles.row` (`alignItems: "center"`) alongside the checkbox and the ⇄ toggle. Growing `rowMain`'s height by opening the picker re-centered the whole cross-axis, so the ⇄ toggle shifted down by roughly half the picker's height the instant it was tapped — sliding it partly out from under the finger — and every row below jumped as the list reflowed. Fixed structurally: the row's `View` and the (conditionally rendered) picker `View` are now siblings inside an outer wrapping `View`, with the picker below the row rather than nested inside its `alignItems: center` cross-axis, so opening it no longer moves the toggle that opened it. `vendorPicker`'s style gained `marginHorizontal: 16` to align with the row's own edges now that it's no longer inheriting `rowMain`'s indentation, and `marginTop` changed from `8` to `-4` to sit visually attached to the row above it rather than doubling up with the row's own `marginBottom: 8`. While restructuring, added the current-value feedback a picker implies but didn't have: the chip matching the row's `vendor_id` (or the `null`/"Anywhere" chip when `vendor_id` is `null`) now renders with a `vendorChipSelected`/`vendorChipTextSelected` style (the same teal-on-dark treatment used for `checkboxChecked` elsewhere in this file), so the picker shows which vendor is currently set rather than presenting six identical-looking options.

**Deferred, not fixed — the "memo rows" house-pattern claim was unmet, and is resolved as a documentation correction.** `renderRow` is a `useCallback`, but that buys nothing without a `React.memo` boundary around the row component it returns: rows are inline JSX with no memo, and RN's list-cell renderer (`CellRenderer`) has no `shouldComponentUpdate` of its own, so every parent re-render re-renders every mounted row regardless of whether that row's own data changed. The house pattern for this really is a memoized row component, e.g. `src/components/track/meals/library/MealRow.tsx`. The reviewer was explicit, though, that at this list's realistic size (a single user's shopping list — tens of rows at the outside) the re-render cost is unmeasurable, and extracting a row component from a screen that cannot be exercised against real data until Task 10 applies the (owner-gated) migration carries more regression risk right now than the unmeasurable gain is worth. Resolved by correcting the claim instead of the code: design spec §9.2's heading no longer lists "memo rows" among this screen's house container patterns, and a note was added directly above Task 7 in this plan pointing here. This is a recorded, deliberate deferral, not an oversight — a future reader should not conclude a memo boundary exists here when it doesn't, and should not conclude one was owed and missed without this rationale attached.

**Considered, no change — recorded so a future reviewer doesn't re-chase any of it:**
- *`keyExtractor` uniqueness holds.* `computeShoppingSuggestions`'s internal `drafts` Map keys each suggestion by inventory id or folded name, so post-merge every suggestion carries either a distinct UUID or a distinct folded name — `s:${foodInventoryId ?? name}` cannot collide within the Suggested section. `VirtualizedSectionList` additionally namespaces cell keys by section internally, so even an identical key string reused across two different sections (Suggested vs. a vendor section, say) could not collide structurally.
- *The collapsed "Purchased" section still renders its header when `showPurchased` is `false`.* Verified in RN source rather than assumed: `VirtualizedSectionList`'s `getItemCount` adds 2 per section unconditionally (header + footer slots), and `_subExtractor` returns the header item at `itemIndex === -1` before it ever reaches the branch that inspects the section's (possibly empty) `data` array — so an empty `data: []` collapses the rows, not the header.
- *Restock-alert string interpolation (`Add ${item.quantity} ${item.unit} to stock?`) is null-safe.* `shopping_list.quantity` is `INTEGER NOT NULL CHECK (quantity > 0)` and `.unit` is `TEXT NOT NULL` at the schema level, so neither interpolation slot can render `"undefined"` or `"null"`.
- *Rows whose `vendor_id` points at an inactive vendor correctly fall through to "Anywhere."* The `sections` builder's `ANYWHERE` predicate is `r.vendor_id === null || !data.vendors.some((v) => v.id === r.vendor_id && v.is_active)` — a row pointed at a vendor that still exists but was deactivated is not filtered out of every section (which would silently vanish it from the list); it's caught by the second disjunct and lands under "Anywhere" instead.
- *The stale `data` read inside `handlePurchase` is safe.* `restockTargetByItemId` derives from inventory *locations*, which `markPurchased` (a `shopping_list` mutation) cannot alter, so reading the pre-reload `data` snapshot to compute `targetLocationId` is correct, not a race. The only staleness window is a concurrent cross-device edit to that item's locations between this render and the restock tap — which, if it happened, would surface as a "Failed to restock" alert from the RPC (a stale target location id), not a wrong write.
- *All `useCallback` dependency arrays are complete*, including the one addition this round (`renderRow` gained `busy`), checked against every free variable each callback body actually closes over.

**Verification:** `cd mobile && npx tsc --noEmit` → exit 0. `npm test`:
```
Test Suites: 11 passed, 11 total
Tests:       317 passed, 317 total
```
(317 = unchanged — this task adds no test surface; `ShoppingListScreen.tsx` is a React Native component and, per `jest.config.js`'s own scoping to pure-TypeScript libs, is not and has never been covered by this suite.) The plan's Task 7 code block was re-diffed programmatically against `mobile/src/components/track/ShoppingListScreen.tsx` (the `run`/`busy`/`refreshing` rewrite, the row-structure change for Fix 5, and all Minor fixes) and found byte-identical, modulo the banner line — same discipline as the Task 3 and Task 6 amendments.



### Task 8 — Inventory tie-ins

This entry was missing from the original dispatch — an omission on the plan side, not the implementer's. Spec review passed with no findings on the first pass, and separately confirmed two plan-snippet inaccuracies the implementer had already worked around under the plan's own escape hatch. Code-quality review then found two Important issues and four Minor ones, all reproduced faithfully from this plan's own Step 1–3 text — plan defects, not implementation slips, same as Tasks 1 and 7. Two Important, four Minor, one declined-with-reasoning, and the review's negative space are below.

**Two plan-snippet inaccuracies, worked around under the plan's own escape hatch.** Step 3's code block referenced `styles.fieldLabel`, which does not exist in `mobile/src/components/track/edit-food/styles.ts` — the real name is `styles.label` (`edit-food/styles.ts:81`). The same block also destructured a `foodItem` prop; the component's actual prop is `item` (`EditFoodScreen.tsx:90`). Both were handled under Step 3's own instruction ("if they differ, use the actual names, do not invent new styles") rather than treated as blockers. This plan's Step 3 text has been corrected in place to use `styles.label` and `item` throughout, so a future reader doesn't have to rediscover and re-work-around the same two mismatches.

**Fix 1 (Important) — the manual add had no in-flight guard and no dedupe.** `handleAddToShoppingList` only surfaced feedback after the `addSuggestions` call returned. On a slow connection a user who sees nothing yet can long-press the same item and tap "Add to Shopping List" again before the first request lands — two inserts in flight, two identical `shopping_list` rows (same `food_inventory_id`, `name`, `quantity`, `vendor_id`, `notes`). Confirmed no unique constraint exists on `shopping_list` in `20260731100000_shopping_intelligence.sql`, so both rows land and both render. Even with instant feedback, a *deliberate* second add always duplicated, because nothing consulted existing rows before inserting. This plan's own "Known accepted risks" note covers a manual add duplicating a pending *engine suggestion*; it does not cover a manual add duplicating **itself** — a distinct gap. And Step 1's own un-gating (correct per spec §9.3) put "Add to Shopping List" on every item's action sheet instead of only out-of-stock ones, which widened exposure to this gap rather than narrowing it.

Fixed with two additions to `handleAddToShoppingList`, keyed by item id: (1) an in-flight guard — a `useRef<Set<string>>(new Set())` checked at entry and populated for the call's duration, cleared in a `finally` — so a second invocation for the same item while the first is still in flight is a silent no-op; (2) a pre-insert existence check — `select id from shopping_list where food_inventory_id = item.id and is_purchased = false limit 1` — that turns a genuine repeat into an "Already on your list" alert instead of a second row. Scoped to unpurchased rows only, matching the demand engine's own suppression rule (spec §6): a purchased row for this item doesn't mean one is already pending. Existing success/failure alerts kept as-is. The plan's Step 1 code block above has been updated to match.

**Fix 2 (Important) — the rates fetch widened a pre-existing race in `fetchInventory`.** Step 2's `finally`-style `setLoading(false)`/`setRefreshing(false)` sat after the rates round trip, not after `items` landed — visibly, the pull-to-refresh spinner and the first-run "Loading…" placeholder both outlived the data being on screen by one extra RTT. The real cost was structural: `fetchInventory` now stays in flight one round trip longer, with no generation token and no cancellation, and it's called from four places — the mount effect, `handleRefresh`, the delete-failure revert, and the restock-failure revert. Concrete failure traced: a slow mount fetch is in flight; the user long-press-deletes an item; the optimistic drop and the DB delete both succeed; the late mount fetch resolves and its `setItems` call **restores the deleted row into the grid**. Pre-existing for `items` before this task; `ratesById` now joins it as a second clobberable target, and the added RTT lengthens the window in which any of the four callers can race each other.

Fixed with a generation counter — `fetchGenerationRef`, a `useRef(0)` incremented once at the top of every `fetchInventory` call — checked before each of `setItems`, the loading-flag flips, and `setRatesById`; a result whose generation no longer matches `fetchGenerationRef.current` by the time it resolves is dropped rather than applied. Also hoisted `setLoading(false)`/`setRefreshing(false)` to immediately after `setItems` succeeds, ahead of the rates fetch, so the spinner clears the moment the grid has data rather than waiting on decoration. Unmount-during-fetch was checked and correctly judged not a problem — React 18 makes a post-unmount `setState` call a silent no-op — so no cleanup was added for that case; the generation token exists solely for the cross-call clobber, not for unmount safety. The plan's Step 2 text above now describes this guard.

**Fix 3 (Minor) — an inactive preferred vendor was invisible in the picker.** With `preferred_vendor_id = X` where X has since gone inactive, the original filter `vendors.filter(v => v.is_active)` dropped X's chip entirely, and `null !== X` meant "None" didn't highlight either — no chip selected, field reads as unset. Saving without touching the picker does not clear the value (state is untouched, so no silent data loss), but the user has no way to see what's actually set, and once they tap any chip they can't get back to X from this screen without leaving and re-entering with knowledge of the id. Unreachable until Task 9 ships the deactivate toggle; reachable the moment it does. Fixed by keeping the current vendor in the option list even when inactive — `[...vendors.filter(v => v.is_active || v.id === preferredVendorId), null]` — and labelling it `"{name} (inactive)"` so the state stays legible instead of just mysteriously present.

**Fix 4 (Minor) — `~0d left` rendered for out-of-stock items.** The dangerous half was already unreachable: for `total > 0`, `estimateConsumption`'s `daysUntilOut` is always `>= 1` (`Math.ceil` of a positive numerator), so a genuinely *stocked* item could never show `~0d left`. But the zero case (`total <= 0`) is reachable and visible — the "Out of Stock" tab and every category tab render `isOut` items, so a just-finished staple with enough logged history to clear the honesty gates showed `Qty: 0 … ~0d left`, which states the obvious without adding anything. Fixed by adding `daysUntilOut > 0` to the render gate, alongside the existing `<= MAX_DISPLAY_DAYS` check. The plan's Step 2 render snippet above reflects both conditions.

**Fix 5 (Minor) — the vendor fetch was the file's one unwrapped fetch.** Every other data fetch in this 1700+-line file — categories/subcategories, location entries, image uploads — runs inside its own `try`/`catch`; Step 3's vendor fetch, as originally written, was a bare `.then()` with only the `{ error }` destructure checked, no `try`/`catch` around it. Its failure mode was already benign (a failure leaves `vendors: []`, so the picker renders just "None" and stays functional) and supabase-js v2 resolves rather than rejects on fetch failure, so this was a consistency gap, not a live bug. Fixed by extracting a named `fetchVendors` function, matching the shape of its neighbour `fetchLocationEntries` (`try`/`catch`, `console.error` only, no `Alert` — the same "log and move on" idiom used for other non-critical background fetches in this file), called from the mount effect. The plan's Step 3 text above shows the wrapped version.

**Fix 6 (Minor) — the picker was filed under the collapsed Notes accordion, which is hard to find.** Step 3's placement text said "the details section, after the notes field," and the implementation followed that adjacency literally — reasonably, since the plan was written without accounting for Notes being its own collapsed accordion (`sectionKey="notes"`), separate from every other section. A shopping field buried inside a notes accordion is not discoverable, and this is the sole editor for a value three other surfaces read (the manual add in `FoodInventoryScreen.tsx`, the demand engine in `lib/shoppingDemand.ts` via `lib/supabase/shopping.ts`, and this same screen's own restock-threshold math). Moved to the **Quantity & Storage** section (`sectionKey="storage"`), rendered once after the Ready/Total Threshold fields and outside the single-location/multi-location conditionals so it appears regardless of which storage type is active. Storage is where the value's actual siblings already live — `lowThresholdFor`, the restock thresholds immediately above it, and the "~Nd left" forecast Step 2 adds to the same screen's sibling `FoodInventoryScreen` — rather than a field about restocking sitting beside a free-text notes box. This plan's Step 3 text and file-list comment above have been updated to describe the storage-section placement rather than the notes-section one.

**Declined, recorded for the owner:** `"~{n}d left"` is an upper bound dressed as an approximation — the lib's rate reads low by design (see `consumptionRate.ts`'s header), so the true remaining days lie in `[n/2, n]`; `~60d left` may mean 30. `~` reads as "give or take," which understates how one-sided the error actually is; `≤60d left` would say the true thing. Declined here: design spec §7 explicitly specifies the display string as `"~{n}d left"`, the owner approved that string, and the 2× bound is already documented in the lib's own header comment for anyone who goes looking. Recorded as a one-line change (`~` → `≤` in the template literal) the owner may want, to be surfaced at the Task 10 gate rather than changed unilaterally against an approved spec string.

**The review's negative space, preserved so a future reader doesn't re-chase any of it:**
- The grid paints before the rates land — `setItems` (and the now-hoisted loading-flag flips) precede the `await fetchConsumptionRates(...)` — so the forecast line fills in after the screen is already usable rather than delaying it.
- The added network cost is **one** extra round trip, not five: `fetchInventoryWithState`'s four internal queries are already `Promise.all`'d, and `fetchConsumptionRates` wraps its own `fetchDecrementEvents()` + `estimateConsumption()` as a single additional round trip on top of that.
- `MAX_DISPLAY_DAYS` (`= 60`) caps the rendered string at two digits, so `~60d left` (roughly 50pt wide at `fontSize: 11` against a roughly 104pt-wide grid card) cannot wrap or clip within the card.
- The silent `console.error` on a rates-fetch failure (no `Alert`) is correct, not an oversight: the forecast line's absence on a failed fetch is indistinguishable from the honesty gates in `consumptionRate.ts` legitimately suppressing it for insufficient history, and surfacing an alert for a decorative line that's *routinely* absent would just train the user to dismiss alerts.
- `ShoppingCart` remains imported-but-unused at `FoodInventoryScreen.tsx:22` (pre-existing since February) — this task's changes never render it, and it's a distinct, unrelated import from the `ShoppingCart` Task 7 already consumed in `app/(tabs)/track/index.tsx`. Left untouched, out of scope.

**Verification:** `cd mobile && npx tsc --noEmit` → exit 0. `npm test`:
```
Test Suites: 11 passed, 11 total
Tests:       317 passed, 317 total
```
(317 = unchanged — this task, like Task 7, adds no test surface; both files touched are React Native components outside `jest.config.js`'s pure-TypeScript-lib scope.) The plan's Task 8 Step 1–3 code blocks were updated in place to match the shipped `FoodInventoryScreen.tsx`/`EditFoodScreen.tsx` **behaviour**. Unlike Tasks 3, 4, 6 and 7 — whose blocks are byte-identical source mirrors, re-diffed programmatically each round — Task 8's blocks were always illustrative snippets by design (Step 1 said so explicitly), so no byte-identity claim is made or possible: the shipped code differs in comment wording, blank lines, and the `supabase.auth.getUser()` destructure's line breaks. Read them as intent, not as source of truth.

### Task 9 — vendor editors

Spec review passed outright: the shipped Step 1 block was byte-identical to this plan's own snippet, every style/prop it used (`s.card`, `s.sectionTitle`, `s.row`, `s.flexShrinkColumn`, `s.rowLabel`, `s.mutedText`, `s.input`) and every import (`colors.primary`/`border`/`mutedForeground`, `NutritionVendor.app_url: string | null`, `updateVendor`'s `Partial<Pick<…, "name"|"app_url"|"is_active">>` signature) checked out against the real files — the first task in this plan whose UI snippet needed no correction. The migration-safety premise held too: `20260731100000_shopping_intelligence.sql` only adds FK columns to *other* tables that reference `nutrition_vendors(id)`; it never alters `nutrition_vendors` itself, so this is the one Phase 5 surface that works against the current, unmigrated schema.

**One sanctioned deviation, kept:** a `.catch` on `Linking.openURL`, matching the pattern `ShoppingListScreen.tsx:313-315` already established for Task 7. `app_url` is user-authored free text on both surfaces, but here is where the text is *authored* — a missing scheme (`instacart.com` typed with no `https://`) is the expected failure on this screen, not an exotic one, so the guard earns its keep more here than anywhere else it's used.

**Code-quality review adjudicated three flags raised during implementation, plus one it found independently:**

- **Lost edit on vendor switch** — confirmed correct as traced: expanding vendor A, editing, then tapping vendor B's header calls `startEdit(B)` (in the original shared-state design), which overwrites the shared `name`/`url` state before any commit against B could run — so A's edit is discarded, never misapplied to B. Corruption was genuinely unreachable, for a precise reason: `commit(v)` was only ever called from handlers rendered under `editingId === v.id`, and the discard and any later commit were separate touch events with a React flush in between. But per the refactor below, this was reclassified from "an acceptable UX gap" to "a symptom of the actual defect" — shared editor state across all rows — and fixed structurally rather than accepted.
- **Double-commit via `onEndEditing` + the row's `onPress`** — the flagged mechanism (both handlers firing off stale closures that still read `editingId === v.id`) does **not reach production**: `NutritionPreferencesScreen.tsx`'s `FlatList` sets `keyboardShouldPersistTaps="handled"`, which (per `ScrollView.js`'s responder-release logic) only returns true in the bubble phase — so a row tap lets the child touchable win the responder negotiation and the ScrollView's own `_handleResponderRelease` (the sole caller of `blurTextInput`) never runs. A row tap therefore does not blur a focused sibling `TextInput`, so `onEndEditing` does not fire alongside `onPress` for that gesture — one gesture, one commit path, no double-fire, no guard needed. The original write-up's fallback reasoning — "harmless because the second patch would be empty" — was also incorrect, in a way that didn't end up mattering: had the double-fire been reachable, both calls would have read the *same* stale, un-refetched vendor object and the *same* edited text, so the second patch would have been an exact duplicate of the first (not empty) — idempotent at the database level, hence still harmless, but not for the reason originally given. Recorded here so neither the mechanism nor the reasoning gets re-chased.
- **Empty name silently kept the old name** — kept, and elevated: `nutrition_vendors.name` is `not null` with no other check constraint, so shipping the original "just don't patch" behavior unmodified would have been fine at the DB layer, but the refactor's `flush` now also snaps the input back to the last-saved name so the rejection is visible instead of merely harmless.
- **Nested touchable (URL `Text.onPress` inside the row `TouchableOpacity`)** — confirmed against RN's renderer, not just inferred from convention: `Text` with an `onPress` prop supplies its own `onStartShouldSetResponder`, and the touch-responder dispatch walks the view tree bubble-phase and stops at the first listener that returns true; `Text` is the deeper (more specific) node, so it wins the negotiation and tapping the URL opens the link rather than toggling the row. One side effect worth keeping in mind: because the URL `Text` claims the responder, the URL line is not itself an edit affordance (there's no way to tap *into* editing the link from that line — the row header must be tapped instead), and while a row is expanded the URL line still shows `vendor.app_url` (the last-saved value), not whatever is currently typed in the URL `TextInput` below it.

**The main change — a four-symptom, one-cause refactor, adopting `ConceptRow.tsx`'s already-established pattern.** The originally-shipped `VendorsSection` used one editor's worth of `name`/`url` state shared across every row (`editingId` selecting which vendor it currently applied to) and closed the editor as a side effect of its own blur handler (`commit` called both `setEditingId(null)` and the patch). `ConceptRow.tsx:52-73` — same directory, same problem shape (an inline editable field inside a modal that can be torn down by the Done button) — had already solved this with per-row state, a `dirtyRef`, and a `useEffect` cleanup that flushes on unmount *or* collapse, documented in a comment describing the exact failure mode this plan's Task 9 snippet re-introduced. That comment is echoed (adapted for two fields instead of one) in the shipped `VendorRow`'s own cleanup-rationale comment above. Four symptoms, one root cause:

1. Tapping the header **Done** button silently discarded any in-progress edit — `onClose()` unmounts the whole modal; the native field resigns first responder during teardown after the JS handler is already detached, so `onEndEditing` never reaches React. Only a cleanup effect guaranteed to run on unmount (not a blur handler) can catch this.
2. A name-only edit had no blur-commit path at all — only the URL field carried `onEndEditing` in the original snippet. Tapping empty space collapsed nothing (`keyboardShouldPersistTaps="handled"` again — the ScrollView *does* still blur on an actual empty-space tap, since that tap has no more-specific responder to lose to), so the keyboard would drop with the edit un-saved and the row left open, and the only advertised save path (re-tapping the header) was never mentioned by the helper text.
3. Moving focus from the URL field to the Name field within the same row collapsed the whole editor — the URL field's blur fired `onEndEditing` → `commit(v)` → `setEditingId(null)`, unmounting the very Name field the user had just tapped into. `commit` conflated "save" with "close." Fixed by splitting them: `flush()` (renamed from `commit`) now only ever saves; closing is exclusively the header tap's job (`onToggleExpand`, which the row's `TouchableOpacity` calls directly, no longer routed through the save function).
4. All three of the above traced back to one cause: state shared across every rendered row. The refactor's `VendorRow` (`React.memo`, keyed per-vendor by `vendors.map`) gives each row its own `name`/`url`/`dirtyRef`, making the discard in (A) structurally impossible — switching from vendor A to vendor B now flips `expanded` on both rows in the same state update, running A's cleanup (flushing A's edit) while B mounts its own untouched state seeded from `vendor.name`/`vendor.app_url` — rather than something that has to be reasoned about per-interaction.

**Also folded in, all per the review:**
- `autoCorrect={false}`, `spellCheck={false}`, `textContentType="URL"` added to the URL `TextInput`, alongside the pre-existing `autoCapitalize="none"`/`keyboardType="url"` — iOS autocorrect was otherwise free to mangle a typed hostname at commit time. `ParentMovementSearch.tsx:136` is the only prior site in the codebase setting `autoCorrect={false}`; this field needs the full set more than that one does, since it's the one place in the app where a wrong keystroke silently breaks a stored deep link.
- `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}` added to the row `TouchableOpacity`, matching the established convention (`ShoppingListScreen.tsx:209`, `TodaysWorkoutCard.tsx:228`, and others). The touchable carries only `s.flexShrinkColumn` (`{flexShrink: 1}`); `s.row`'s `paddingVertical: 10` lives on the parent `View`, outside the touchable's own bounds — so a vendor with no `app_url` (a single line of text) had a tap target well under iOS's 44pt guidance before this.
- URL scheme normalization on save — `normalizeUrl()` prefixes `https://` onto a bare host/path (`instacart.com` → `https://instacart.com`) so a typo-free hostname doesn't fail silently at open-time with "Failed to open link" the first time it's tapped, while explicitly **not** touching a value that already has a scheme, tested via `/^[a-z][a-z0-9+.-]*:/i` (RFC 3986 §3.1's scheme grammar) rather than a narrower `https?` check — `instacart://` (a first-class case, since the field is labelled "App / web URL", not just "web URL") matches the regex and passes through untouched; `https://instacart.com` matches and passes through untouched; `instacart.com` does not match and gets `https://` prepended. If the normalized value differs from what's currently in the field, the visible input is updated to match what was actually saved (`if (normalizedUrl !== u) setUrl(normalizedUrl)`), so the field never silently disagrees with the link it renders after collapsing.
- Empty-name feedback — `flush()` now calls `setName(v.name)` when the trimmed name is empty (instead of just skipping the `name` key in the patch, as the original `commit` did), so clearing the field and blurring visibly snaps back to the last-saved name rather than leaving the rejection undiscoverable.

**Not doing, recorded instead:** accessibility roles (`accessibilityRole="button"` on the row, `"link"` on the URL text, and the literal `↗` glyph being read by VoiceOver as "north east arrow"). Flagged low-priority by the review because the codebase carries roughly a dozen accessibility props total across all screens — adding them to just this one row would be an inconsistency, not a correction. Left as a known gap for whenever the app takes on accessibility as its own pass, not folded into Task 9.

**Negative space, checked and confirmed clean:**
- The write-then-refetch cycle (`run()` → `load()` → `setData`) never clobbers in-progress typing: it replaces the `vendors` prop passed down to `VendorsSection`, but `VendorRow`'s own `name`/`url` state is seeded once at mount from `useState(vendor.name)`/`useState(vendor.app_url ?? "")` and is never resynced from props afterward — matching `ConceptRow.tsx`'s `formNote` precedent exactly.
- `commit`/`flush` never diffs against a stale vendor object: `latest.current` is reassigned unconditionally on every render (`latest.current = { vendor, onPatch, name, url }`), so any call into `flush()` — whether from `onEndEditing` or the unmount/collapse cleanup — always reads the just-rendered `vendor` prop, never a captured-at-mount snapshot.
- Nothing in `src/` reads a vendor's `.slug` outside of `nutritionPreferences.ts`'s own fetch/insert paths (confirmed by grep), so a rename leaving `slug` stale is cosmetic only — the `unique (user_id, slug)` constraint keys off the value set at creation time, which this task never touches.

**Verification:** `cd mobile && npx tsc --noEmit` → exit 0. `npm test`:
```
Test Suites: 11 passed, 11 total
Tests:       317 passed, 317 total
```
(317 = unchanged both before and after the refactor — this task, like Tasks 7 and 8, adds no test surface; `VendorsSection.tsx`/`NutritionPreferencesScreen.tsx` are React Native components outside `jest.config.js`'s pure-TypeScript-lib scope.) Unlike Task 8, this task's Step 1 block **is** a byte-identical source mirror, re-diffed programmatically against the shipped `VendorsSection.tsx` after the refactor (same discipline as Tasks 3, 4, 6, and 7) — confirmed identical. Step 2's `handleVendorPatch` block is likewise byte-identical (modulo the plan's own leading-indentation convention) to the shipped `NutritionPreferencesScreen.tsx` handler.
