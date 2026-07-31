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
const daysAgo = (n: number): string => {
  const d = new Date(2026, 6, 30, 12);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
// undercounts. This is a heuristic, not calibrated science.
import { daysBetweenLocalDates } from "./stockState";

export const RATE_WINDOW_DAYS = 28;
export const MIN_UNITS = 3;
export const MIN_SPAN_DAYS = 14;

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
    if (age < 0) continue; // future-dated logs never count
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
    const rates = new Map<string, ConsumptionEstimate>([
      [soon.id, { ratePerDay: 1, daysUntilOut: FORECAST_LEAD_DAYS }],
      [later.id, { ratePerDay: 1, daysUntilOut: FORECAST_LEAD_DAYS + 1 }],
      [alreadyLow.id, { ratePerDay: 1, daysUntilOut: 1 }],
    ]);
    const got = run({ items: [soon, later, alreadyLow], rates });
    const forecastOnly = got.find((s) => s.foodInventoryId === soon.id)!;
    expect(forecastOnly).toMatchObject({ priority: 3, quantity: 1 });
    expect(forecastOnly.reasons[0]).toBe(`~${FORECAST_LEAD_DAYS}d left at your pace`);
    expect(got.find((s) => s.foodInventoryId === later.id)).toBeUndefined();
    // alreadyLow appears as the LOW source (priority 2), not forecast
    expect(got.find((s) => s.foodInventoryId === alreadyLow.id)!.priority).toBe(2);
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
// the seventh sibling lib. Four sources with fixed priorities; two dedupe
// layers; nothing here writes anything — suggestions become shopping_list
// rows only when the owner taps.
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
  const byId = new Map(items.map((it) => [it.id, it]));
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
    // A merge may also teach a name-only draft its inventory identity.
    if (existing.foodInventoryId === null && base.foodInventoryId !== null) {
      existing.foodInventoryId = base.foodInventoryId;
      existing.vendorId = base.vendorId;
      existing.unit = base.unit;
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

  // Suppression: anything already on the (unpurchased) list, by id or name.
  const suppressedIds = new Set(
    unpurchased.map((r) => r.foodInventoryId).filter((x): x is string => x !== null),
  );
  const suppressedNames = new Set(unpurchased.map((r) => fold(r.name)));

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

- [ ] **Step 2: "~Nd left" line** — `FoodInventoryScreen` already fetches via `fetchInventoryWithState`; add a lightweight rates fetch alongside (`meal_logs` query + `estimateConsumption`, same shape as `fetchShoppingData`'s — extract a small `fetchConsumptionRates(todayLocalDate, totalsById)` helper into `mobile/src/lib/supabase/shopping.ts` and call it from both places rather than duplicating the events expansion). Render, next to the existing quantity text on each grid card:

```tsx
              {ratesById.get(item.id) && (
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
- [ ] **Step 3 (owner, on device — Metro reload, free `--port`):** hub shows the Shopping List card filling the grid slot; suggestions appear with correct reasons/quantities (verify the threshold-exit quantity on a low item); ＋ and Add all move rows into vendor groups; Instacart deep link opens; per-row vendor swap moves the row's group and does NOT change the product default; purchase → restock offer → inventory quantity rises (check in Food Inventory); un-check restores a purchased row; Clear purchased empties the section; "~Nd left" shows on a well-logged item and is absent on sparse ones; long-press add from inventory works on an in-stock item now; vendor rename + URL edit stick and the URL opens; EditFoodScreen vendor picker persists.
- [ ] **Step 4:** Stop. Merge/push are the owner's calls — after this merge, the Nutrition OS loop is closed.

---

## Self-review checklist (run after writing, before execution)

- Spec coverage: §5.1-5.2 → Task 1; §5.3 → Task 5; §5.4 → Tasks 1/5; §6 → Task 4 (+Task 2 threshold export); §7 → Task 3; §8 → Task 6 (+restock in Task 7's `handlePurchase`); §9.1-9.2 → Task 7; §9.3 → Task 8; §9.4 → Task 9; §10 → Tasks 3/4/10/11. No gaps.
- Type consistency: `DemandInventoryItem`/`computeShoppingSuggestions` (4→6), `ConsumptionEstimate`/`estimateConsumption` (3→6/8), `lowThresholdFor` (2→6/8), `ShoppingSuggestion` (4→6/7/8), `ShoppingData`/`fetchShoppingData` (6→7), `addSuggestions(userId, s[])` (6→7/8), `transferInventoryUnits(itemId, null, target, qty)` (Phase 4 API, used in 7), `replaceItemLocations(itemId, rows)` new signature (5→EditFoodScreen call sites).
- Known accepted risks: `handleAddToShoppingList` bypasses suggestion dedupe (a manual add can duplicate a pending suggestion — suppressed on next screen load since the row now exists); Task 8's rates helper extraction (`fetchConsumptionRates`) is specified by shape, not full code — implementer lifts the events-expansion block from Task 6 verbatim; screen `keyExtractor` for name-only suggestions uses the name (unique post-merge by construction).

## ⚠️ Execution amendments

None yet. Record every review-driven deviation here, per task, as execution proceeds.

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


