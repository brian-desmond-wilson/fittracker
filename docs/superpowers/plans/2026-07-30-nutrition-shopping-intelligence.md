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
// one. This is a heuristic, not calibrated science.
import { daysBetweenLocalDates } from "./stockState";

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
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";

export interface ShoppingData {
  listRows: ShoppingListItem[];
  suggestions: ShoppingSuggestion[];
  vendors: NutritionVendor[];
  ratesById: Map<string, ConsumptionEstimate>;
  /** For the purchased→restock offer: itemId → target location id. */
  restockTargetByItemId: Map<string, string>;
}

export async function fetchShoppingData(todayLocalDate: string): Promise<ShoppingData> {
  const since = new Date();
  since.setDate(since.getDate() - (RATE_WINDOW_DAYS + 7)); // small slack for span
  const [listRes, inventory, library, vendorsRes, logsRes] = await Promise.all([
    supabase.from("shopping_list").select("*").order("created_at"),
    fetchInventoryWithState(todayLocalDate),
    fetchMealLibrary(),
    supabase.from("nutrition_vendors").select("*").order("display_order"),
    supabase
      .from("meal_logs")
      .select("date, inventory_items")
      .eq("uses_inventory", true)
      .gte("date", getLocalDateString(since)),
  ]);
  const errors = [listRes.error, vendorsRes.error, logsRes.error].filter((e) => e !== null);
  if (errors.length > 0) {
    errors.slice(1).forEach((e) => console.error("fetchShoppingData:", e));
    throw errors[0];
  }

  const listRows = (listRes.data ?? []) as ShoppingListItem[];

  // Decrement events: one per unit, dated by the log's local date.
  const events: DecrementEvent[] = [];
  for (const log of (logsRes.data ?? []) as Array<{ date: string; inventory_items: InventoryUsage[] | null }>) {
    for (const u of log.inventory_items ?? []) {
      for (let i = 0; i < u.quantity; i++) {
        events.push({ inventoryId: u.id, dateLocal: log.date });
      }
    }
  }
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
    const target =
      it.locations.find((l) => l.is_ready_to_consume) ?? it.locations[0];
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
  ActivityIndicator, Alert, Linking, SectionList, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
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
  const [showPurchased, setShowPurchased] = useState(false);
  const [vendorPickerFor, setVendorPickerFor] = useState<string | null>(null);

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

  const run = useCallback(
    async (title: string, fn: () => Promise<void>) => {
      try {
        await fn();
        await load();
      } catch (e) {
        Alert.alert(title, e instanceof Error ? e.message : "Unknown error");
        await load({ silent: true });
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
      await run("Failed to mark purchased", () => markPurchased(item.id));
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
            <TouchableOpacity style={styles.addButton} onPress={() => handleAdd([s])}>
              <Text style={styles.addButtonText}>＋</Text>
            </TouchableOpacity>
          </View>
        );
      }
      const item = row.item;
      const purchased = row.kind === "purchased";
      return (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.checkbox, purchased && styles.checkboxChecked]}
            onPress={() =>
              purchased
                ? run("Failed to restore", () => unmarkPurchased(item.id))
                : handlePurchase(item)
            }
          >
            {purchased && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
          <View style={styles.rowMain}>
            <Text style={[styles.rowName, purchased && styles.rowNamePurchased]} numberOfLines={1}>
              {item.name} <Text style={styles.rowQty}>×{item.quantity} {item.unit}</Text>
            </Text>
            {item.notes ? <Text style={styles.rowReason} numberOfLines={1}>{item.notes}</Text> : null}
            {vendorPickerFor === item.id && data && (
              <View style={styles.vendorPicker}>
                {[...data.vendors.filter((v) => v.is_active), null].map((v) => (
                  <TouchableOpacity
                    key={v?.id ?? ANYWHERE}
                    style={styles.vendorChip}
                    onPress={() => {
                      setVendorPickerFor(null);
                      run("Failed to set vendor", () =>
                        updateListItem(item.id, { vendor_id: v?.id ?? null }),
                      );
                    }}
                  >
                    <Text style={styles.vendorChipText}>{v?.name ?? "Anywhere"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {!purchased && (
            <TouchableOpacity
              onPress={() => setVendorPickerFor((p) => (p === item.id ? null : item.id))}
            >
              <Text style={styles.vendorAction}>⇄</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() =>
              Alert.alert("Remove", `Remove "${item.name}" from the list?`, [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive",
                  onPress: () => run("Failed to remove", () => deleteListItem(item.id)) },
              ])
            }
          >
            <Text style={styles.deleteAction}>✕</Text>
          </TouchableOpacity>
        </View>
      );
    },
    [data, vendorPickerFor, handleAdd, handlePurchase, run],
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={renderRow}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <TouchableOpacity
              disabled={section.key !== "purchased"}
              onPress={() => setShowPurchased((p) => !p)}
            >
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </TouchableOpacity>
            {section.key === "suggested" && (
              <TouchableOpacity onPress={() => handleAdd(data!.suggestions)}>
                <Text style={styles.headerAction}>Add all</Text>
              </TouchableOpacity>
            )}
            {section.url && (
              <TouchableOpacity onPress={() => Linking.openURL(section.url!)}>
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
              >
                <Text style={styles.deleteAction}>Clear</Text>
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
  vendorPicker: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  vendorChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    borderWidth: 1, borderColor: "#374151",
  },
  vendorChipText: { fontSize: 12, color: "#D1D5DB" },
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

- [ ] **Step 1: Rewire the long-press add** — replace `handleAddToShoppingList`'s insert body with a call through the module, correct quantity, vendor stamped:

```ts
      const { lowThresholdFor } = await import("@/src/lib/stockState"); // or top-level import
      await addSuggestions(user.id, [{
        name: item.name,
        foodInventoryId: item.id,
        vendorId: item.preferred_vendor_id,
        quantity: Math.max(1, lowThresholdFor(item) - item.state.totalQuantity + 1),
        unit: item.unit,
        priority: item.state.isOut ? 1 : 2,
        reasons: ["added from inventory"],
      }]);
```

(Use a top-level import of `addSuggestions` from `@/src/lib/supabase/shopping` and `lowThresholdFor` from `@/src/lib/stockState` — the dynamic-import line above is illustrative of *what*, not *how*.) Un-gate the action-sheet entry: the `if (isOutOfStock)` splice (~:219-222) becomes unconditional (the option always appears). Keep the success/failure alerts.

- [ ] **Step 2: "~Nd left" line** — `FoodInventoryScreen` already fetches via `fetchInventoryWithState`; add a lightweight rates fetch alongside (`meal_logs` query + `estimateConsumption`, same shape as `fetchShoppingData`'s — extract a small `fetchConsumptionRates(todayLocalDate, totalsById)` helper into `mobile/src/lib/supabase/shopping.ts` and call it from both places rather than duplicating the events expansion). Import `MAX_DISPLAY_DAYS` alongside `estimateConsumption` from `@/src/lib/consumptionRate` and gate the render on it — beyond that horizon the estimate's error bar swamps its resolution (see the constant's comment in `consumptionRate.ts`), so the line must be omitted, not printed with a three-digit day count. Render, next to the existing quantity text on each grid card:

```tsx
              {ratesById.get(item.id) && ratesById.get(item.id)!.daysUntilOut <= MAX_DISPLAY_DAYS && (
                <Text style={styles.forecastText}>
                  ~{ratesById.get(item.id)!.daysUntilOut}d left
                </Text>
              )}
```

with `forecastText: { fontSize: 11, color: "#14B8A6" }`.

- [ ] **Step 3: Preferred-vendor picker in EditFoodScreen** — add state + fetch:

```tsx
  const [preferredVendorId, setPreferredVendorId] = useState<string | null>(
    foodItem?.preferred_vendor_id ?? null,
  );
  const [vendors, setVendors] = useState<NutritionVendor[]>([]);
  useEffect(() => {
    supabase.from("nutrition_vendors").select("*").order("display_order")
      .then(({ data, error }) => {
        if (error) console.error("vendors fetch:", error);
        else setVendors((data ?? []) as NutritionVendor[]);
      });
  }, []);
```

(import `NutritionVendor` from `@/src/types/nutrition-preferences`; match the screen's existing seeding pattern for edit-vs-add). Render in the details section, after the notes field, reusing the screen's existing location-button styles for the chips:

```tsx
        <Text style={styles.fieldLabel}>Preferred vendor</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[...vendors.filter((v) => v.is_active), null].map((v) => {
            const selected = (v?.id ?? null) === preferredVendorId;
            return (
              <TouchableOpacity
                key={v?.id ?? "none"}
                style={[styles.locationButton, selected && styles.locationButtonActive]}
                onPress={() => setPreferredVendorId(v?.id ?? null)}
              >
                <Text style={[styles.locationButtonText, selected && styles.locationButtonTextActive]}>
                  {v?.name ?? "None"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
```

(`fieldLabel`/`locationButton*` are the screen's existing style names — verify the exact names at the location-buttons block and reuse them; if they differ, use the actual names, do not invent new styles.) Finally, include `preferred_vendor_id: preferredVendorId` in the save's `itemData` object.

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
import React, { useState } from "react";
import { Linking, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

interface VendorsSectionProps {
  vendors: NutritionVendor[];
  onToggleActive: (vendor: NutritionVendor, isActive: boolean) => void;
  onPatch: (vendor: NutritionVendor, patch: { name?: string; app_url?: string | null }) => void;
}

export function VendorsSection({ vendors, onToggleActive, onPatch }: VendorsSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const startEdit = (v: NutritionVendor) => {
    setEditingId(v.id);
    setName(v.name);
    setUrl(v.app_url ?? "");
  };
  const commit = (v: NutritionVendor) => {
    setEditingId(null);
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const patch: { name?: string; app_url?: string | null } = {};
    if (trimmedName && trimmedName !== v.name) patch.name = trimmedName;
    if ((trimmedUrl || null) !== v.app_url) patch.app_url = trimmedUrl || null;
    if (Object.keys(patch).length > 0) onPatch(v, patch);
  };

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Vendors</Text>
      {vendors.map((v) => (
        <View key={v.id}>
          <View style={s.row}>
            <TouchableOpacity
              style={s.flexShrinkColumn}
              onPress={() => (editingId === v.id ? commit(v) : startEdit(v))}
            >
              <Text style={s.rowLabel}>{v.name}</Text>
              {v.app_url ? (
                <Text
                  style={[s.mutedText, { color: colors.primary }]}
                  onPress={() => Linking.openURL(v.app_url!)}
                >
                  {v.app_url} ↗
                </Text>
              ) : null}
            </TouchableOpacity>
            <Switch
              value={v.is_active}
              onValueChange={(val) => onToggleActive(v, val)}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          {editingId === v.id && (
            <View style={{ marginBottom: 8 }}>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="Vendor name"
                placeholderTextColor={colors.mutedForeground}
              />
              <TextInput
                style={s.input}
                value={url}
                onChangeText={setUrl}
                placeholder="App / web URL (optional)"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                keyboardType="url"
                onEndEditing={() => commit(v)}
              />
            </View>
          )}
        </View>
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
- Known accepted risks: `handleAddToShoppingList` bypasses suggestion dedupe (a manual add can duplicate a pending suggestion — suppressed on next screen load since the row now exists); Task 8's rates helper extraction (`fetchConsumptionRates`) is specified by shape, not full code — implementer lifts the events-expansion block from Task 6 verbatim; screen `keyExtractor` for name-only suggestions uses the name (unique post-merge by construction).

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

Spec review passed outright: both files as originally committed were byte-identical to this plan's Task 4 code blocks, and every §6 clause (all four sources, both dedupe layers, the quantity formula, `FORECAST_LEAD_DAYS`) and §10's coverage expectations were confirmed present. Code-quality review's mutation battery killed 21 of 27 mutations on the first pass, and separately confirmed the quantity formula is exactly right by reading it against the actual comparator it has to clear: `stockState.ts:105`'s `isLow` check is `totalQuantity > 0 && totalQuantity <= lowThreshold`, so `max(1, lowThreshold − total + 1)` produces `lowThreshold − total + 1` units above `total` — one past the boundary the `<=` compares against, not landing on it — verified by hand across seven `(total, lowThreshold)` pairs. None of that machinery needed a fix. The six survivors resolve to three distinct findings, all genuine and all in the two areas the task brief flagged as needing especially careful guarding: the dedupe rules (two separate gaps) and the forecast source's "not low/out" guard. Three further Minor items (one dead variable, one unreachable branch, one header/comment nit) were found by inspection rather than mutation. All are fixed below; each Important fix is mutation-proved with the actual observed output. Source and plan-block changes were re-diffed programmatically against the committed files after every edit in this section, the same check used for Tasks 1 and 3.

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
   Restoring the filtered version and re-running confirmed it passes again. All 12 of the original commit's tests were confirmed to pass under the unfiltered (broken) version too — which is itself the finding the reviewer named: the broader, wrong behaviour was entirely unpinned by the original suite.

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

**Minor, also fixed (found by inspection, not mutation testing):**

4. **`const byId = new Map(items.map((it) => [it.id, it]));` was dead.** Not a placeholder for later use: every item-keyed lookup in the function uses `it.id` directly from the loop variable, and the one name-keyed lookup the merge logic needs (matching a meal gap's missing-item name against inventory) is `byName`, not `byId`. Deleted.

5. **The `existing.foodInventoryId === null && base.foodInventoryId !== null` merge branch was unreachable, and wrong when forced.** The reviewer tried to construct an input that reaches it and could not: a null-`foodInventoryId` draft only exists under a folded-name `drafts` key, that key shape is only ever produced by an *unmatched* meal-gap upsert (`byName.get(...)` returned nothing), and an unmatched upsert's `base` always carries `foodInventoryId: null` too — so `base.foodInventoryId !== null` can never be true for a draft that got there via a name key. The only way in is a key-namespace collision between the two "keys share one Map" schemes (`drafts` keys are inventory UUIDs *or* folded names) — a saved food literally named to match a `food_inventory.id` (a `uuid primary key default gen_random_uuid()`). And when artificially forced to fire, the output is actively wrong, not merely dead: an unrelated item's id/vendor/unit gets grafted onto a name-only suggestion whose name doesn't match that item. The spec's actual stated outcome — a missing-for-meal name adopting a matching item's id/vendor/unit — is fully achieved elsewhere, at upsert-creation time via the `match ? itemBase(match) : …` lookup in the meal-gap loop, which is tested and passing independent of this branch. Deleted the branch and its comment; kept the creation-time lookup, which is the real mechanism.

6. **Header ordinal and an unmarked tiebreak.** The header called this "the seventh sibling lib" — spec §6 calls it the "Sixth pure lib," and neither count survives a literal file tally; no sibling lib (`stockState`, `eatNext`, `mealScore`, `rampProgress`, `conceptMatch`, `inventoryResolution`, `consumptionRate`) numbers itself at all. Dropped the ordinal, kept the rest of the header (it was accurate) and reworded to name siblings the way `eatNext.ts`/`mealScore.ts` already do ("sibling of …"), so nothing is left to rot the next time a lib is added or removed. Separately, `byName` is last-wins on a folded-name collision between two inventory items sharing a name — defensible (the id-first merge identity still produces two suggestions for two distinct items via their own id keys) but arbitrary, and previously unmarked as a choice. Added a one-line comment at the `byName` construction site saying so.

**Considered, no change:**

- **`!existing.thresholdQuantity` in the merge is a dead condition, but an equivalent mutant, not a coverage gap.** Mutating it to bare `thresholdQuantity` survives the full suite, because the only two threshold-quantity sources — out-of-stock and low-stock — are mutually exclusive on any single item (`isOut` requires `totalQuantity === 0`; `isLow` requires `totalQuantity > 0`) and both call the same `exitLowQty(it)` formula on the same item's current fields, so even in a hypothetical world where both fired for one item the computed quantity would be identical either way. Left as written — it's the plan's original defensive structure and it's harmless — but recorded so a future reviewer doesn't re-chase this survivor.
- **`Math.max(1, …)` in `exitLowQty` is unreachable for any input that can actually trigger it, but spec-mandated, so it stays.** The floor only binds when `totalQuantity > lowThreshold`, which contradicts both flags that call `exitLowQty` (`isOut` ⇒ `totalQuantity === 0`; `isLow` ⇒ `totalQuantity <= lowThreshold` per `stockState.ts:105`), and both threshold columns carry `CHECK (… >= 0)` with `lowThresholdFor` coalescing `null` to `0` — so a negative formula result is not constructible from real data. Spec §6 states the formula with the `max` explicitly, so it stays regardless. The existing test named "threshold 0 out-of-stock still suggests quantity 1" pins the `lowThreshold: 0` case (`0 − 0 + 1 = 1`), which passes identically with or without the floor — it is not evidence the floor itself is exercised, and no test was added that could be, since the floor has no reachable input.
- **Cross-task, verified rather than re-flagged:** `ShoppingSuggestion.unit` is `string | null`, while `shopping_list.unit` is `TEXT NOT NULL` (`supabase/migrations/20250209_extend_food_inventory.sql:79`), and this plan's Phase 5 migration (Task 1) doesn't relax that constraint. Read Task 6's `addSuggestions` (this plan, ~:960-978): `unit: s.unit ?? "item"` already covers the null case before the insert. Confirmed here, not fixed here — recorded so Task 6's own reviewer can verify the coverage exists rather than rediscover the question from scratch.

**Verification:** `cd mobile && npx tsc --noEmit` → exit 0. `npm test`:
```
Test Suites: 11 passed, 11 total
Tests:       308 passed, 308 total
```
(308 = the 305 left by the Task 4 commit, +3 new tests from this round — the cross-priority merge case, and the two per-row suppression cases; the forecast test's expanded assertions and the three Minor fixes added no additional test cases.) The plan's Task 4 code blocks were re-diffed programmatically against `mobile/src/lib/shoppingDemand.ts` and `mobile/src/lib/__tests__/shoppingDemand.test.ts` after every edit in this section and found byte-identical (module the code fence's own banner-comment line and trailing newline, the same convention used for Tasks 1 and 3).


