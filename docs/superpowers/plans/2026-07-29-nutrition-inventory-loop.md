# Nutrition OS Phase 4 — Inventory Loop Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One stock truth (location rows everywhere), one projection (`stockState.ts`), assemblable-now + expiration surfacing, and availability-aware Eat Next — per `docs/superpowers/specs/2026-07-29-nutrition-inventory-loop-design.md`.

**Architecture:** A pure `stockState.ts` lib replaces three duplicated client projections and four dropped views; an `inventory.ts` query module replaces three inline fetches; one owner-gated migration reconciles stock data to locations-as-truth, adds an atomic `transfer_inventory_units` RPC, and drops all five unread views. Assemblability reuses Phase 2's `resolveInventoryMatches`; Eat Next gains an optional stock map that reorders ranking without ever filtering.

**Tech Stack:** Expo SDK 54 / RN 0.81.5, TypeScript strict, Supabase (Postgres 17, plpgsql RPCs), Jest + ts-jest (pure TS libs only).

---

## ⛔ Preconditions — read before Task 1

1. **SATISFIED 2026-07-30: Phase 3 is merged to `main`** (merge `c17f16f`) and its migration applied. Create a fresh `nutrition-os/inventory-loop` branch from current `main`; run `cd mobile && npm test` and confirm the baseline (8 suites, 206 tests) is green before Task 1.
2. **RECONCILED 2026-07-30 against Phase 3's final execution amendments and the landed code.** Verified seams: `rank()` compares `roleRank` → `score.raw` → prep → name (eatNext.ts ~:170, with the banding comment) — Task 9 inserts `stockRank`/`expiringRank` between `roleRank` and `raw` exactly as planned. Deltas already folded into Task 9's instructions: **(a)** `candidate()` now takes FOUR params — `(m, preferredRoles, maxPrepMinutes, preferredCategories = [])`, and `roleRank` is 0 on role OR category match — the stock lookup is added as a fifth optional param, not a fourth; **(b)** the catch-up band lives in a shared `catchUpCandidates(eligible, gap, maxPrepMinutes)` used by both the `catch_up` context and the nudge's body pick — it must gain and forward the stock map so both call sites stay availability-aware through one definition; **(c)** `EatNextRecommendation` now also carries `calories/protein/prepMinutes/score` (populated in `toRecs` and the goal_hit inline site) — Task 9 only appends `reasons`; leave those fields untouched. Also verified: `useEatNext` builds `meals: ScoredMeal[]` at ~:272 and calls `recommendEatNext` at ~:295 (Task 10's insertion points); `MealLibraryModal` has the `scores`/`totalsById` memos and the landed `initialMealId` prop with stale-recovery (Task 8 adds alongside, touches neither); `fetchMealLibrary`'s inventory select is still `id, barcode, quantity, locations(quantity)` (Task 8's change applies cleanly); `eatNudgeService`'s serialize-queue internals are Phase 4-untouched.
3. **A green `tsc` proves nothing about DB column names** (untyped supabase client). Verify columns by grep against `supabase/migrations/`.
4. House rules as Phases 1–3: migrations idempotent + `public.`-qualified + never applied by implementers (Task 12 is the owner gate); `StyleSheet.create`; alert-on-failure; commit per task; record every deviation in "⚠️ Execution amendments" at the bottom of this file, amending this doc in the same commit as the fix.

## File structure

| File | Responsibility |
|---|---|
| `mobile/src/lib/stockState.ts` (create) + `__tests__/stockState.test.ts` | Per-item stock projection + meal assemblability (pure) |
| `supabase/migrations/20260730100000_inventory_locations_truth.sql` (create) | Reconcile, `transfer_inventory_units`, drop 5 views |
| `mobile/src/lib/supabase/inventory.ts` (create) | Single inventory fetch + save/transfer wrappers |
| `mobile/src/components/track/FoodInventoryScreen.tsx` (modify) | Use module + projection; expiring section; RPC restock |
| `mobile/app/(tabs)/track/food-inventory/[id].tsx`, `edit/[id].tsx` (modify) | Use module; delete inline copies |
| `mobile/src/components/track/EditFoodScreen.tsx` (modify) | Invariant-keeping saves |
| `mobile/src/services/foodInventoryMatchService.ts` (modify) | Location-aware match |
| `mobile/src/lib/supabase/mealLibrary.ts` (modify) | Inventory read gains name/expiration/ready fields |
| `mobile/src/components/track/meals/library/*` (modify) | In-stock badge/filter, missing list, builder dots |
| `mobile/src/lib/eatNext.ts` + test, `mobile/src/hooks/useEatNext.ts` (modify) | Optional stock map, extended ranking |

Reference reading: the spec; the Phase 4 exploration facts embedded in it (§1); `mobile/src/lib/inventoryResolution.ts`; `supabase/migrations/20260729100100_inventory_consume_rpc.sql` (RPC house style); `20250217000003_add_multi_location_inventory.sql` (locations schema + the old `migrate_single_location_items`).

---

### Task 1: `stockState.ts` — projection (TDD)

**Files:**
- Create: `mobile/src/lib/stockState.ts`
- Test: `mobile/src/lib/__tests__/stockState.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/src/lib/__tests__/stockState.test.ts
import {
  projectItemStock,
  EXPIRING_SOON_DAYS,
  type StockItemInput,
  type StockLocationRow,
} from "../stockState";

const item = (over: Partial<StockItemInput> = {}): StockItemInput => ({
  storage_type: "multi-location",
  restock_threshold: 1,
  fridge_restock_threshold: null,
  total_restock_threshold: null,
  requires_refrigeration: false,
  expiration_date: null,
  ...over,
});
let locId = 0;
const loc = (quantity: number, ready = true): StockLocationRow => ({
  id: `l${locId++}`,
  location: "fridge",
  quantity,
  is_ready_to_consume: ready,
});
const TODAY = "2026-07-29";

describe("quantity projection — locations always, no storage_type branch", () => {
  it("sums total/ready/storage from location rows", () => {
    const s = projectItemStock({
      item: item(),
      locations: [loc(3, true), loc(5, false), loc(2, true)],
      todayLocalDate: TODAY,
    });
    expect(s).toMatchObject({ totalQuantity: 10, readyQuantity: 5, storageQuantity: 5 });
    expect(s.isOut).toBe(false);
  });
  it("single-location items also read locations (post-reconcile invariant)", () => {
    const s = projectItemStock({
      item: item({ storage_type: "single-location" }),
      locations: [loc(4, true)],
      todayLocalDate: TODAY,
    });
    expect(s.totalQuantity).toBe(4);
  });
  it("no locations → 0/out (reconcile guarantees this can't persist, but never NaN)", () => {
    const s = projectItemStock({ item: item(), locations: [], todayLocalDate: TODAY });
    expect(s.totalQuantity).toBe(0);
    expect(s.isOut).toBe(true);
    expect(s.isLow).toBe(false); // out ≠ low
  });
});

describe("thresholds — UI semantics preserved", () => {
  it("single-location low uses restock_threshold", () => {
    const s = projectItemStock({
      item: item({ storage_type: "single-location", restock_threshold: 2 }),
      locations: [loc(2)],
      todayLocalDate: TODAY,
    });
    expect(s.isLow).toBe(true);
  });
  it("multi-location low uses total_restock_threshold (null → 0 → never low while stocked)", () => {
    const low = projectItemStock({
      item: item({ total_restock_threshold: 4 }),
      locations: [loc(4)],
      todayLocalDate: TODAY,
    });
    const notLow = projectItemStock({
      item: item({ total_restock_threshold: null }),
      locations: [loc(1)],
      todayLocalDate: TODAY,
    });
    expect(low.isLow).toBe(true);
    expect(notLow.isLow).toBe(false);
  });
  it("needsFridgeRestock requires refrigeration AND positive threshold AND ready <= threshold", () => {
    const base = {
      item: item({ requires_refrigeration: true, fridge_restock_threshold: 2 }),
      locations: [loc(2, true), loc(9, false)],
      todayLocalDate: TODAY,
    };
    expect(projectItemStock(base).needsFridgeRestock).toBe(true);
    expect(
      projectItemStock({ ...base, item: item({ requires_refrigeration: false, fridge_restock_threshold: 2 }) })
        .needsFridgeRestock,
    ).toBe(false);
    expect(
      projectItemStock({ ...base, item: item({ requires_refrigeration: true, fridge_restock_threshold: 0 }) })
        .needsFridgeRestock,
    ).toBe(false);
    expect(
      projectItemStock({
        ...base,
        item: item({ requires_refrigeration: true, fridge_restock_threshold: 2, storage_type: "single-location" }),
      }).needsFridgeRestock,
    ).toBe(false); // multi-location concept only
    // pins the (threshold ?? 0) > 0 guard: no threshold configured, empty fridge stratum
    expect(
      projectItemStock({
        item: item({ requires_refrigeration: true, fridge_restock_threshold: null }),
        locations: [loc(9, false)],
        todayLocalDate: TODAY,
      }).needsFridgeRestock,
    ).toBe(false);
    // pins the <= boundary from above: ready stock exceeds the threshold
    expect(
      projectItemStock({ ...base, locations: [loc(3, true), loc(9, false)] }).needsFridgeRestock,
    ).toBe(false);
  });
});

describe("expiration banding", () => {
  const exp = (date: string | null) =>
    projectItemStock({ item: item({ expiration_date: date }), locations: [loc(1)], todayLocalDate: TODAY });
  it.each([
    ["2026-07-28", "expired", -1],
    ["2026-07-29", "today", 0],
    ["2026-07-30", "soon", 1],
    ["2026-08-05", "soon", EXPIRING_SOON_DAYS],
    ["2026-08-06", "later", EXPIRING_SOON_DAYS + 1],
  ])("%s → %s (daysLeft %i)", (date, band, days) => {
    const s = exp(date);
    expect(s.expiration).toBe(band);
    expect(s.daysLeft).toBe(days);
  });
  it("no date → null/null", () => {
    const s = exp(null);
    expect(s.expiration).toBeNull();
    expect(s.daysLeft).toBeNull();
  });
  it("malformed date → null/null, not NaN", () => {
    expect(exp("not-a-date")).toMatchObject({ expiration: null, daysLeft: null });
  });
});
```

- [ ] **Step 2: Run — expect module-not-found FAIL**

```bash
cd mobile && npm test -- stockState
```

- [ ] **Step 3: Implement**

```ts
// mobile/src/lib/stockState.ts
// THE stock projection (Nutrition OS Phase 4). Pure, no I/O. Replaces the
// three byte-identical client computations (FoodInventoryScreen and the two
// detail/edit routes) and the four dropped stock views. Locations are the
// only quantity truth — storage_type never branches quantity math; it
// survives solely as a threshold-semantics + UI presentation hint.
// Threshold semantics are pinned to the SHIPPED UI, not the dropped views
// (the views OR'd thresholds and ignored requires_refrigeration).
export const EXPIRING_SOON_DAYS = 7;

export type ExpirationBand = "expired" | "today" | "soon" | "later";

export interface StockItemInput {
  storage_type: string | null;
  restock_threshold: number | null;
  fridge_restock_threshold: number | null;
  total_restock_threshold: number | null;
  requires_refrigeration: boolean | null;
  expiration_date: string | null; // YYYY-MM-DD
}

export interface StockLocationRow {
  id: string;
  location: string;
  quantity: number;
  is_ready_to_consume: boolean;
}

export interface ItemStockState {
  totalQuantity: number;
  readyQuantity: number;
  storageQuantity: number;
  isOut: boolean;
  isLow: boolean;
  needsFridgeRestock: boolean;
  expiration: ExpirationBand | null;
  daysLeft: number | null;
}

/** Whole-day difference between two local YYYY-MM-DD strings (b − a). */
export function daysBetweenLocalDates(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map((s) => parseInt(s, 10));
  const [by, bm, bd] = b.split("-").map((s) => parseInt(s, 10));
  // Local-noon anchors sidestep DST edges: a midnight anchor could land on
  // either side of a spring-forward/fall-back transition and shift the
  // whole-day diff by an hour; noon is never within an hour of a transition.
  const da = new Date(ay, am - 1, ad, 12).getTime();
  const db = new Date(by, bm - 1, bd, 12).getTime();
  return Math.round((db - da) / 86_400_000);
}

export function projectItemStock(opts: {
  item: StockItemInput;
  locations: StockLocationRow[];
  todayLocalDate: string;
}): ItemStockState {
  const { item, locations, todayLocalDate } = opts;
  const totalQuantity = locations.reduce((s, l) => s + l.quantity, 0);
  const readyQuantity = locations
    .filter((l) => l.is_ready_to_consume)
    .reduce((s, l) => s + l.quantity, 0);
  const storageQuantity = totalQuantity - readyQuantity;

  // Anything that isn't exactly "single-location" — including a null/unknown
  // storage_type — is treated as multi-location. Real rows can't hit this:
  // storage_type is NOT NULL with a two-value CHECK. Synthetic callers (e.g.
  // Task 8's assemblability inputs) can pass null; that's intentional here,
  // not an oversight.
  const single = item.storage_type === "single-location";
  const lowThreshold = single
    ? item.restock_threshold ?? 0
    : item.total_restock_threshold ?? 0;
  const isLow = totalQuantity > 0 && totalQuantity <= lowThreshold;

  const needsFridgeRestock =
    !single &&
    item.requires_refrigeration === true &&
    (item.fridge_restock_threshold ?? 0) > 0 &&
    readyQuantity <= (item.fridge_restock_threshold ?? 0);

  let expiration: ExpirationBand | null = null;
  let daysLeft: number | null = null;
  if (item.expiration_date) {
    const rawDaysLeft = daysBetweenLocalDates(todayLocalDate, item.expiration_date);
    if (Number.isFinite(rawDaysLeft)) {
      daysLeft = rawDaysLeft;
      expiration =
        daysLeft < 0 ? "expired"
        : daysLeft === 0 ? "today"
        : daysLeft <= EXPIRING_SOON_DAYS ? "soon"
        : "later";
    }
    // Else: an unparseable expiration_date behaves as "no date" rather than
    // poisoning downstream comparisons — NaN is silently false in every
    // band/filter comparison (NaN < 0, NaN === 0, NaN <= 7 all false), which
    // would otherwise land the row in "later" carrying daysLeft: NaN and
    // defeat callers that treat `daysLeft === null` as the "skip" case.
  }

  return {
    totalQuantity,
    readyQuantity,
    storageQuantity,
    isOut: totalQuantity === 0,
    isLow,
    needsFridgeRestock,
    expiration,
    daysLeft,
  };
}
```

- [ ] **Step 4: Run — PASS; `npx tsc --noEmit` → 0**

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/stockState.ts mobile/src/lib/__tests__/stockState.test.ts
git commit -m "feat(nutrition-os): stock projection pure lib (one truth for quantities)"
```

---

### Task 2: `stockState.ts` — assemblability (TDD)

**Files:**
- Modify: `mobile/src/lib/stockState.ts` (append)
- Test: `mobile/src/lib/__tests__/stockState.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

```ts
// append to mobile/src/lib/__tests__/stockState.test.ts
import { assessAssemblability, type AssemblabilityInventoryRow } from "../stockState";

const invRow = (o: Partial<AssemblabilityInventoryRow> = {}): AssemblabilityInventoryRow => ({
  id: "inv1",
  name: "Boost, Very High Calorie",
  barcode: null,
  totalQuantity: 1,
  conceptIds: [],
  daysLeft: null,
  ...o,
});
const mealItem = (o: Partial<{ savedFoodId: string; name: string; barcode: string | null; conceptIds: string[] }> = {}) => ({
  savedFoodId: "sf1",
  name: "Boost Very High Calorie",
  barcode: null,
  conceptIds: [] as string[],
  ...o,
});

describe("assessAssemblability", () => {
  it("assemblable when every item resolves to in-stock inventory", () => {
    const r = assessAssemblability({
      items: [mealItem({ conceptIds: ["boost"] })],
      inventory: [invRow({ conceptIds: ["boost"] })],
    });
    expect(r.assemblable).toBe(true);
    expect(r.missing).toEqual([]);
  });
  it("unresolvable item counts as missing (under-claiming is honest)", () => {
    const r = assessAssemblability({
      items: [mealItem({ name: "Korean BBQ Sauce" })],
      inventory: [invRow()],
    });
    expect(r.assemblable).toBe(false);
    expect(r.missing).toEqual(["Korean BBQ Sauce"]);
  });
  it("barcode-terminal-but-out-of-stock is missing, NOT resolved to a concept sibling", () => {
    // Phase 2 amendment: barcode is terminal evidence of identity.
    const r = assessAssemblability({
      items: [mealItem({ barcode: "123", conceptIds: ["boost"] })],
      inventory: [
        invRow({ barcode: "123", totalQuantity: 0 }),
        invRow({ id: "inv2", name: "Boost Plus", conceptIds: ["boost"], totalQuantity: 6 }),
      ],
    });
    expect(r.assemblable).toBe(false);
    expect(r.missing).toEqual(["Boost Very High Calorie"]);
  });
  it("missing preserves item order", () => {
    const r = assessAssemblability({
      items: [
        mealItem({ savedFoodId: "a", name: "A-Food" }),
        mealItem({ savedFoodId: "b", name: "B-Food", conceptIds: ["boost"] }),
        mealItem({ savedFoodId: "c", name: "C-Food" }),
      ],
      inventory: [invRow({ conceptIds: ["boost"] })],
    });
    expect(r.missing).toEqual(["A-Food", "C-Food"]);
  });
  it("two items resolving to one in-stock container are both satisfied (units are containers)", () => {
    const r = assessAssemblability({
      items: [
        mealItem({ savedFoodId: "a", conceptIds: ["boost"] }),
        mealItem({ savedFoodId: "b", name: "Other", barcode: "123" }),
      ],
      inventory: [invRow({ barcode: "123", conceptIds: ["boost"], totalQuantity: 1 })],
    });
    expect(r.assemblable).toBe(true);
  });
  it("reports the most urgent expiring in-stock item the meal uses, and a later skipped row does not clobber it", () => {
    const r = assessAssemblability({
      items: [
        mealItem({ savedFoodId: "a", conceptIds: ["beef"] }),
        mealItem({ savedFoodId: "b", name: "Rice", conceptIds: ["rice"] }),
        mealItem({ savedFoodId: "c", name: "Pasta", conceptIds: ["pasta"] }),
      ],
      inventory: [
        invRow({ id: "i1", name: "Sirloin", conceptIds: ["beef"], daysLeft: 2 }),
        invRow({ id: "i2", name: "Sticky Rice", conceptIds: ["rice"], daysLeft: 5 }),
        // Matched but non-qualifying (already expired), visited AFTER the
        // winner above — pins that a skip does not reset the running minimum.
        invRow({ id: "i3", name: "Stale Pasta", conceptIds: ["pasta"], daysLeft: -3 }),
      ],
    });
    expect(r.expiringItemName).toBe("Sirloin");
    expect(r.expiringDaysLeft).toBe(2);
  });
  it("expiring ignores items beyond the soon window", () => {
    const r = assessAssemblability({
      items: [mealItem({ conceptIds: ["beef"] })],
      inventory: [invRow({ conceptIds: ["beef"], daysLeft: EXPIRING_SOON_DAYS + 1 })],
    });
    expect(r.expiringItemName).toBeNull();
  });
  it("expiring includes the EXPIRING_SOON_DAYS boundary itself (inclusive upper bound)", () => {
    const r = assessAssemblability({
      items: [mealItem({ conceptIds: ["beef"] })],
      inventory: [invRow({ conceptIds: ["beef"], daysLeft: EXPIRING_SOON_DAYS })],
    });
    expect(r.expiringItemName).toBe("Boost, Very High Calorie");
    expect(r.expiringDaysLeft).toBe(EXPIRING_SOON_DAYS);
  });
  it("expiring excludes already-expired rows — a throw-out is not a rescue", () => {
    const r = assessAssemblability({
      items: [mealItem({ conceptIds: ["beef"] })],
      inventory: [invRow({ conceptIds: ["beef"], daysLeft: -3 })],
    });
    expect(r.expiringItemName).toBeNull();
    expect(r.expiringDaysLeft).toBeNull();
  });
  it("a matched row with no expiration date is not 'expiring'", () => {
    const r = assessAssemblability({
      items: [mealItem({ conceptIds: ["beef"] })],
      inventory: [invRow({ conceptIds: ["beef"], daysLeft: null })],
    });
    expect(r.expiringItemName).toBeNull();
    expect(r.expiringDaysLeft).toBeNull();
  });
  it("a tie between two matched rows favors the first meal item's resolution", () => {
    const r = assessAssemblability({
      items: [
        mealItem({ savedFoodId: "a", conceptIds: ["beef"] }),
        mealItem({ savedFoodId: "b", name: "Rice", conceptIds: ["rice"] }),
      ],
      inventory: [
        invRow({ id: "i1", name: "Sirloin", conceptIds: ["beef"], daysLeft: 3 }),
        invRow({ id: "i2", name: "Sticky Rice", conceptIds: ["rice"], daysLeft: 3 }),
      ],
    });
    expect(r.expiringItemName).toBe("Sirloin");
    expect(r.expiringDaysLeft).toBe(3);
  });
  it("empty meal is not assemblable", () => {
    expect(assessAssemblability({ items: [], inventory: [invRow()] }).assemblable).toBe(false);
  });
});
```

> **Landed vs. planned:** the four `expiring…` tests above (boundary-inclusive, already-expired exclusion, null-date, and tie-order) were added by the Task 2 execution amendment below, after a code-quality review found the plan's original single "expiring ignores items beyond the soon window and null dates" test didn't actually exercise the null-date and boundary cases it claimed to. See "⚠️ Execution amendments → Task 2".

- [ ] **Step 2: Run — new tests FAIL**

- [ ] **Step 3: Append the implementation**

```ts
// append to mobile/src/lib/stockState.ts
import {
  resolveInventoryMatches,
  type ResolutionInventoryRow,
} from "./inventoryResolution";

export interface AssemblabilityInventoryRow extends ResolutionInventoryRow {
  name: string;
  /** From projectItemStock().daysLeft — null when no expiration date. */
  daysLeft: number | null;
}

export interface MealAssemblability {
  assemblable: boolean;
  /** Saved-food display names, in meal item order. */
  missing: string[];
  expiringItemName: string | null;
  expiringDaysLeft: number | null;
}

/**
 * "Can I make this meal right now?" — resolution reuses Phase 2's
 * resolveInventoryMatches verbatim (barcode terminal, else unique shared
 * concept among in-stock rows). An item that resolves to nothing counts as
 * MISSING: under-claiming is the honest failure mode. Duplicate resolution
 * (two items → one container) satisfies both — v1 units are containers.
 */
export function assessAssemblability(opts: {
  items: Array<{ savedFoodId: string; name: string; barcode: string | null; conceptIds: string[] }>;
  inventory: AssemblabilityInventoryRow[];
}): MealAssemblability {
  const { items, inventory } = opts;
  const matches = resolveInventoryMatches(items, inventory);
  const missing = items.filter((it) => !matches.has(it.savedFoodId)).map((it) => it.name);

  // "Expiring" is a rescue signal (eat this soon), not a spoilage report:
  // bounded below at 0 so already-expired rows (daysLeft < 0) never win the
  // minimum — they're a throw-out, not a rescue, and can't share the
  // "expires in {n}d" copy template. Day 0 (expires today) is retained.
  const byId = new Map(inventory.map((r) => [r.id, r]));
  let expiringItemName: string | null = null;
  let expiringDays: number | null = null;
  for (const invId of new Set(matches.values())) {
    const row = byId.get(invId);
    if (!row) continue;
    const d = row.daysLeft;
    if (d === null || d < 0 || d > EXPIRING_SOON_DAYS) continue;
    // Strict `<` (not `<=`): on a tie, the first-encountered row wins, which
    // — since matches preserves meal-item insertion order — means the
    // earlier meal item's resolution wins. Deliberate, not incidental.
    if (expiringDays === null || d < expiringDays) {
      expiringItemName = row.name;
      expiringDays = d;
    }
  }

  return {
    assemblable: items.length > 0 && missing.length === 0,
    missing,
    expiringItemName,
    expiringDaysLeft: expiringDays,
  };
}
```

> **Landed vs. planned:** the expiring-window filter and tie-break above differ from the plan's original code — see "⚠️ Execution amendments → Task 2" for the defects (unbounded-below window, `<=` tie-break, `as number` cast) and their fixes.

- [ ] **Step 4: Run — PASS (all stockState + existing suites); tsc 0**

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/stockState.ts mobile/src/lib/__tests__/stockState.test.ts
git commit -m "feat(nutrition-os): meal assemblability + expiring-item detection"
```

---

### Task 3: The migration — reconcile, transfer RPC, view drops

**Files:**
- Create: `supabase/migrations/20260730100000_inventory_locations_truth.sql`

Do **not** apply — Task 12 is the owner gate.

- [ ] **Step 1: Write the migration**

```sql
-- Nutrition OS Phase 4: locations become the ONLY stock truth.
-- Spec: docs/superpowers/specs/2026-07-29-nutrition-inventory-loop-design.md §6
--
-- (1) Reconcile: single-location items — the LEGACY column wins (it is what
--     the UI displayed); their location rows are replaced by one canonical
--     row. Multi-location items — LOCATIONS win; legacy column resynced.
--     Location-less items get their canonical row created. Idempotent in
--     effect: a re-run reproduces the same state.
-- (2) transfer_inventory_units: atomic restock transfer (replaces two
--     independent client UPDATEs). Loud failure on insufficient stock —
--     deliberately unlike consume's silent-0, which is correct for logging.
-- (3) Drop the five unread views (adopt-or-drop rule; client stockState.ts
--     is the adopted path). shopping_list TABLE is untouched (canonical).

do $$
declare
  v_user_id uuid;
  r record;
  v_replaced integer := 0;
  v_resynced integer := 0;
  v_bad integer;
begin
  select id into v_user_id from auth.users limit 1;
  if v_user_id is null then
    raise exception 'No auth.users row found — cannot reconcile inventory.';
  end if;

  -- A. Single-location (or null storage_type) items: replace location rows
  --    with the one canonical row derived from the legacy columns.
  for r in
    select fi.id, fi.name, fi.quantity, fi.location
    from public.food_inventory fi
    where fi.user_id = v_user_id
      and coalesce(fi.storage_type, 'single-location') = 'single-location'
  loop
    delete from public.food_inventory_locations where food_inventory_id = r.id;
    insert into public.food_inventory_locations
      (food_inventory_id, user_id, location, quantity, is_ready_to_consume)
    values (r.id, v_user_id, coalesce(r.location, 'pantry'), r.quantity, true);
    v_replaced := v_replaced + 1;
    raise notice '  single-location canonicalized: % (qty %)', r.name, r.quantity;
  end loop;

  -- B. Multi-location items with no location rows at all: same treatment.
  for r in
    select fi.id, fi.name, fi.quantity, fi.location
    from public.food_inventory fi
    where fi.user_id = v_user_id
      and fi.storage_type = 'multi-location'
      and not exists (select 1 from public.food_inventory_locations l
                      where l.food_inventory_id = fi.id)
  loop
    insert into public.food_inventory_locations
      (food_inventory_id, user_id, location, quantity, is_ready_to_consume)
    values (r.id, v_user_id, coalesce(r.location, 'pantry'), r.quantity, true);
    v_replaced := v_replaced + 1;
    raise notice '  location-less multi item seeded: % (qty %)', r.name, r.quantity;
  end loop;

  -- C. Resync the legacy cache for EVERY item: quantity = sum(locations).
  update public.food_inventory fi
     set quantity = sub.total
    from (select l.food_inventory_id, sum(l.quantity) as total
            from public.food_inventory_locations l
           group by l.food_inventory_id) sub
   where sub.food_inventory_id = fi.id
     and fi.user_id = v_user_id
     and fi.quantity is distinct from sub.total;
  get diagnostics v_resynced = row_count;

  -- D. Post-condition: every item has >= 1 location row and cache = sum.
  select count(*) into v_bad
  from public.food_inventory fi
  where fi.user_id = v_user_id
    and (not exists (select 1 from public.food_inventory_locations l
                     where l.food_inventory_id = fi.id)
         or fi.quantity <> coalesce((select sum(l2.quantity)
                                     from public.food_inventory_locations l2
                                     where l2.food_inventory_id = fi.id), 0));
  if v_bad > 0 then
    raise exception 'Reconcile failed: % items still violate locations-as-truth', v_bad;
  end if;

  raise notice 'Inventory reconcile — canonicalized: %, legacy caches resynced: %',
    v_replaced, v_resynced;
end $$;

create or replace function public.transfer_inventory_units(
  p_item_id uuid,
  p_from_location_id uuid,   -- null = "from store" (no source decrement)
  p_to_location_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_from public.food_inventory_locations%rowtype;
  v_to public.food_inventory_locations%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'transfer quantity must be positive';
  end if;
  if p_from_location_id is not null and p_from_location_id = p_to_location_id then
    raise exception 'source and target locations must differ';
  end if;

  select * into v_to from public.food_inventory_locations
   where id = p_to_location_id and food_inventory_id = p_item_id
   for update;
  if v_to.id is null then
    raise exception 'target location % not found on item %', p_to_location_id, p_item_id;
  end if;

  if p_from_location_id is not null then
    select * into v_from from public.food_inventory_locations
     where id = p_from_location_id and food_inventory_id = p_item_id
     for update;
    if v_from.id is null then
      raise exception 'source location % not found on item %', p_from_location_id, p_item_id;
    end if;
    if v_from.quantity < p_quantity then
      raise exception 'insufficient stock in source location (% < %)', v_from.quantity, p_quantity;
    end if;
    update public.food_inventory_locations
       set quantity = quantity - p_quantity where id = p_from_location_id;
  end if;

  update public.food_inventory_locations
     set quantity = quantity + p_quantity where id = p_to_location_id;

  update public.food_inventory fi
     set quantity = coalesce((select sum(l.quantity)
                              from public.food_inventory_locations l
                              where l.food_inventory_id = p_item_id), 0)
   where fi.id = p_item_id;
end;
$$;

revoke all on function public.transfer_inventory_units(uuid, uuid, uuid, integer) from public;
revoke execute on function public.transfer_inventory_units(uuid, uuid, uuid, integer) from anon;
grant execute on function public.transfer_inventory_units(uuid, uuid, uuid, integer) to authenticated;

drop view if exists public.food_inventory_with_locations;
drop view if exists public.low_stock_items;
drop view if exists public.out_of_stock_items;
drop view if exists public.expiring_soon_items;
drop view if exists public.shopping_list_active;
```

- [ ] **Step 2: Static checks** — parentheses/quotes balance; every statement idempotent or idempotent-in-effect (the reconcile reproduces its own output); no name collisions with existing functions (`grep -rn "transfer_inventory_units" supabase/migrations/` → only this file).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260730100000_inventory_locations_truth.sql
git commit -m "feat(nutrition-os): locations-as-truth reconcile, transfer RPC, drop 5 views"
```

---

### Task 4: `inventory.ts` query module

**Files:**
- Create: `mobile/src/lib/supabase/inventory.ts`

- [ ] **Step 1: Write the module**

```ts
// mobile/src/lib/supabase/inventory.ts
// Data access for the inventory domain (Nutrition OS Phase 4). Replaces the
// three inline fetch+projection copies (FoodInventoryScreen and the two
// detail/edit routes). Every quantity the app displays comes from
// projectItemStock over location rows — the one truth.
import { supabase } from "../supabase";
import {
  projectItemStock,
  type ItemStockState,
} from "../stockState";
import type {
  FoodCategory,
  FoodInventoryItem,
  FoodInventoryLocation,
  FoodSubcategory,
} from "@/src/types/track";

export interface InventoryItemWithState extends FoodInventoryItem {
  locations: FoodInventoryLocation[];
  categories: FoodCategory[];
  subcategories: FoodSubcategory[];
  state: ItemStockState;
  // Legacy projection names kept so existing render code needs minimal
  // change; always mirror state.* (delete once all readers use state).
  total_quantity: number;
  ready_quantity: number;
  storage_quantity: number;
}

export async function fetchInventoryWithState(
  todayLocalDate: string,
): Promise<InventoryItemWithState[]> {
  const [items, locations, categoryMaps, subcategoryMaps] = await Promise.all([
    supabase.from("food_inventory").select("*"),
    supabase.from("food_inventory_locations").select("*"),
    supabase.from("food_inventory_category_map").select("*, food_categories(*)"),
    supabase.from("food_inventory_subcategory_map").select("*, food_subcategories(*)"),
  ]);
  const errors = [items.error, locations.error, categoryMaps.error, subcategoryMaps.error]
    .filter((e) => e !== null);
  if (errors.length > 0) {
    errors.slice(1).forEach((e) => console.error("fetchInventoryWithState:", e));
    throw errors[0];
  }
  const locRows = (locations.data ?? []) as FoodInventoryLocation[];
  return ((items.data ?? []) as FoodInventoryItem[]).map((item) => {
    const itemLocations = locRows.filter((l) => l.food_inventory_id === item.id);
    const state = projectItemStock({
      item,
      locations: itemLocations,
      todayLocalDate,
    });
    return {
      ...item,
      locations: itemLocations,
      categories: ((categoryMaps.data ?? []) as Array<{ food_inventory_id: string; food_categories: FoodCategory | null }>)
        .filter((m) => m.food_inventory_id === item.id)
        .map((m) => m.food_categories)
        .filter((c): c is FoodCategory => !!c),
      subcategories: ((subcategoryMaps.data ?? []) as Array<{ food_inventory_id: string; food_subcategories: FoodSubcategory | null }>)
        .filter((m) => m.food_inventory_id === item.id)
        .map((m) => m.food_subcategories)
        .filter((c): c is FoodSubcategory => !!c),
      state,
      total_quantity: state.totalQuantity,
      ready_quantity: state.readyQuantity,
      storage_quantity: state.storageQuantity,
    };
  });
}

/** Atomic restock transfer; null fromLocationId = "from store". */
export async function transferInventoryUnits(
  itemId: string,
  fromLocationId: string | null,
  toLocationId: string,
  quantity: number,
): Promise<void> {
  const { error } = await supabase.rpc("transfer_inventory_units", {
    p_item_id: itemId,
    p_from_location_id: fromLocationId,
    p_to_location_id: toLocationId,
    p_quantity: quantity,
  });
  if (error) throw error;
}

/**
 * Replace an item's location rows and resync the legacy cache — the
 * invariant-keeping save used by EditFoodScreen for BOTH storage types
 * (single-location = exactly one row). Client-side sequence (delete →
 * insert → cache update); a mid-sequence failure is visible in the UI and
 * fixed by re-saving; the reconcile assertion also catches drift.
 */
export async function replaceItemLocations(
  userId: string,
  itemId: string,
  rows: Array<{ location: string; quantity: number; is_ready_to_consume: boolean; notes?: string | null }>,
): Promise<void> {
  const { error: delError } = await supabase
    .from("food_inventory_locations")
    .delete()
    .eq("food_inventory_id", itemId);
  if (delError) throw delError;
  if (rows.length > 0) {
    const { error: insError } = await supabase.from("food_inventory_locations").insert(
      rows.map((r) => ({ ...r, food_inventory_id: itemId, user_id: userId })),
    );
    if (insError) throw insError;
  }
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  const { error: cacheError } = await supabase
    .from("food_inventory")
    .update({ quantity: total })
    .eq("id", itemId);
  if (cacheError) throw cacheError;
}
```

- [ ] **Step 2: Typecheck; commit**

```bash
cd mobile && npx tsc --noEmit
git add mobile/src/lib/supabase/inventory.ts
git commit -m "feat(nutrition-os): inventory query module (single fetch + invariant saves)"
```

---

### Task 5: Refactor the three inventory read sites

**Files:**
- Modify: `mobile/src/components/track/FoodInventoryScreen.tsx:103-184` (fetch), `:500-540` (badges/sort), `:593-603` (display)
- Modify: `mobile/app/(tabs)/track/food-inventory/[id].tsx:35-91`, `mobile/app/(tabs)/track/food-inventory/edit/[id].tsx:35-91`

Line numbers are anchors from 2026-07-29 — match on content.

- [ ] **Step 1: FoodInventoryScreen** — replace the body of `fetchInventory` (`:103-184`) with:

```ts
  const fetchInventory = async () => {
    try {
      setLoading(true);
      const items = await fetchInventoryWithState(getLocalDateString());
      setItems(items);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      Alert.alert("Error", "Failed to load inventory");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
```

Imports: `fetchInventoryWithState, transferInventoryUnits, type InventoryItemWithState` from `@/src/lib/supabase/inventory`; `getLocalDateString` from `./meals/mealsHelpers`; `EXPIRING_SOON_DAYS` if referenced. Change the screen's item state type from `FoodInventoryItemWithCategories[]` to `InventoryItemWithState[]` and delete the now-unused local type import if it has no other use. The badge computations (`needsRestockFridge`, `isLowTotalStock` around `:528-537`) become reads of `item.state.needsFridgeRestock` / `item.state.isLow`; the `total_quantity === 0` filters/action-sheet gates become `item.state.isOut`. `formatExpirationDate` (`:511-522`) now derives from `item.state.expiration`/`item.state.daysLeft` (same labels/colors: expired `#EF4444`, today/soon `#F59E0B`).

- [ ] **Step 2: Expiring-soon pinned section** — above the category grid render, add:

```tsx
        {(() => {
          const expiring = filteredItems.filter(
            (it) => !it.state.isOut &&
              (it.state.expiration === "expired" || it.state.expiration === "today" || it.state.expiration === "soon"),
          );
          if (expiring.length === 0) return null;
          return (
            <View style={styles.expiringSection}>
              <Text style={styles.expiringTitle}>Expiring soon</Text>
              {expiring.map((it) => (
                <TouchableOpacity key={it.id} onPress={() => handleViewItem(it)} style={styles.expiringRow}>
                  <Text style={styles.expiringName} numberOfLines={1}>{it.name}</Text>
                  <Text style={[styles.expiringWhen, it.state.expiration === "expired" && { color: "#EF4444" }]}>
                    {it.state.expiration === "expired" ? "Expired"
                      : it.state.expiration === "today" ? "Today"
                      : `${it.state.daysLeft}d left`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })()}
```

with styles (amber accent to match existing badge language):

```ts
  expiringSection: {
    backgroundColor: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.35)",
    borderWidth: 1, borderRadius: 12, marginHorizontal: 16, marginBottom: 12, padding: 12,
  },
  expiringTitle: { fontSize: 13, fontWeight: "700", color: "#F59E0B", marginBottom: 6 },
  expiringRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  expiringName: { color: "#D1D5DB", fontSize: 14, flexShrink: 1 },
  expiringWhen: { color: "#F59E0B", fontSize: 13, fontWeight: "600" },
```

(`handleViewItem` = whatever the long-press "View" action calls — reuse it; if only inline navigation exists, `router.push` to the detail route.)

- [ ] **Step 3: Restock via RPC** — in `handleRestockConfirm` (`:332-440`), replace the two write branches (store / other-location, `:350-390`) with:

```ts
      const sourceLocationId =
        sourceLocation === "store"
          ? null
          : restockingItem.locations.find((loc) => loc.location === sourceLocation)?.id ?? null;
      if (sourceLocation !== "store" && sourceLocationId === null) {
        Alert.alert("Error", "Could not find source location");
        return;
      }
      await transferInventoryUnits(
        restockingItem.id,
        sourceLocationId,
        targetLocation.id,
        quantity,
      );
```

Keep the optimistic local-state update and the catch-refetch exactly as they are (the RPC throwing lands in the existing catch).

- [ ] **Step 4: Detail + edit routes** — in both `[id].tsx` and `edit/[id].tsx`, replace the inline fetch + quantity math (`:35-91`) with a single call:

```ts
      const items = await fetchInventoryWithState(getLocalDateString());
      const item = items.find((it) => it.id === id);
      if (!item) { /* keep the existing not-found handling */ }
```

Delete both local projection blocks. (Fetching the whole list to find one item matches current data volume — 25 rows — and keeps one code path; note it in a comment.)

- [ ] **Step 5: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add -A mobile/src/components/track/FoodInventoryScreen.tsx "mobile/app/(tabs)/track/food-inventory/"
git commit -m "refactor(nutrition-os): inventory screens read the one stock projection; expiring section; atomic restock"
```

---

### Task 6: EditFoodScreen invariant-keeping saves

**Files:**
- Modify: `mobile/src/components/track/EditFoodScreen.tsx` (save flow ~`:435-655`)

- [ ] **Step 1: Single-location save** — after the item insert/update (which keeps writing `quantity` and `location` as today, `:467-526`/`:563-597`), replace any location-row handling for the single-location branch with:

```ts
        await replaceItemLocations(user.id, savedItemId, [
          {
            location: location ?? "pantry",
            quantity: parseInt(quantity, 10),
            is_ready_to_consume: true,
          },
        ]);
```

(`savedItemId` = the id from the insert response or the route param on update.) This is what kills the stale-row and multi→single-orphan classes: a single-location save now always leaves exactly one row.

- [ ] **Step 2: Multi-location save** — replace the existing delete-all-then-reinsert block (`:573-597`) with a `replaceItemLocations(user.id, savedItemId, locationEntries.map(e => ({ location: e.location, quantity: parseInt(e.quantity, 10), is_ready_to_consume: e.isReady, notes: e.notes || null })))` call, and **stop writing `quantity: 0`** in `itemData` for multi-location items (`:474`) — the cache is set by `replaceItemLocations`. Remove `quantity` from `itemData` entirely; the cache is owned by the location writes now.

- [ ] **Step 3: Add flows** — `app/(tabs)/track/food-inventory/add.tsx` path ends in the same EditFoodScreen save; verify by reading that `handleSave` is shared. If the add flow has an independent insert, apply the same `replaceItemLocations` call there.

- [ ] **Step 4: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add mobile/src/components/track/EditFoodScreen.tsx "mobile/app/(tabs)/track/food-inventory/add.tsx"
git commit -m "fix(nutrition-os): saves keep locations-as-truth invariant (no stale/orphan rows)"
```

---

### Task 7: Location-aware barcode match

**Files:**
- Modify: `mobile/src/services/foodInventoryMatchService.ts:17-40` (+ the divergence comments there and at `MealsScreen.tsx:~539-543`)

- [ ] **Step 1: Rewrite the lookup**

```ts
/**
 * Look up an inventory item matching a barcode for the current user.
 * `quantity` is the PROJECTED total across location rows (locations are the
 * stock truth as of Phase 4) — the legacy column is a cache and is not read.
 * Returns null when there's no match (or no barcode to match against).
 */
export async function findInventoryMatchByBarcode(
  barcode: string | null,
): Promise<InventoryMatchSummary | null> {
  if (!barcode) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("food_inventory")
      .select("id, name, brand, barcode, unit, storage_type, locations:food_inventory_locations(quantity)")
      .eq("user_id", user.id)
      .eq("barcode", barcode)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Inventory lookup failed:", error);
      return null;
    }
    if (!data) return null;
    const { locations, ...rest } = data as InventoryMatchSummary & {
      locations: Array<{ quantity: number }>;
    };
    return {
      ...rest,
      quantity: locations.reduce((s, l) => s + l.quantity, 0),
    };
  } catch (error) {
    console.error("findInventoryMatchByBarcode error:", error);
    return null;
  }
}
```

Update the stale divergence comments at both files to state the gate and the RPC now read the same truth. `InventoryMatchSummary` keeps its shape (`quantity` redefined as projected total — spec §7); MealsScreen's `willUseInventory` gate needs no code change.

- [ ] **Step 2: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add mobile/src/services/foodInventoryMatchService.ts mobile/src/components/track/MealsScreen.tsx
git commit -m "fix(nutrition-os): pantry gate reads projected stock, closing the Phase 2 follow-up"
```

---

### Task 8: Meal Library availability surfaces

**Files:**
- Modify: `mobile/src/lib/supabase/mealLibrary.ts` (inventory select + `MealLibraryData`)
- Modify: `mobile/src/components/track/meals/library/MealLibraryModal.tsx`, `MealRow.tsx`, `MealDetail.tsx`, `MealBuilder.tsx`, `styles.ts`

- [ ] **Step 1: Extend the library fetch** — in `fetchMealLibrary`, change the inventory select to

```ts
    supabase
      .from("food_inventory")
      .select("id, name, barcode, quantity, expiration_date, locations:food_inventory_locations(quantity, is_ready_to_consume)"),
```

and the mapping to produce `AssemblabilityInventoryRow[]` (type change on `MealLibraryData.inventory` — additive for existing consumers):

```ts
  const resolutionInventory: AssemblabilityInventoryRow[] = invRows.map((r) => {
    const state = projectItemStock({
      item: { storage_type: null, restock_threshold: null, fridge_restock_threshold: null,
              total_restock_threshold: null, requires_refrigeration: null,
              expiration_date: r.expiration_date },
      locations: r.locations.map((l, i) => ({ id: String(i), location: "", ...l })),
      todayLocalDate: getLocalDateString(),
    });
    return {
      id: r.id,
      name: r.name,
      barcode: r.barcode,
      totalQuantity: state.totalQuantity,
      daysLeft: state.daysLeft,
      conceptIds: conceptIdsByInventoryId.get(r.id) ?? [],
    };
  });
```

(The location-less legacy fallback disappears deliberately — post-reconcile every item has rows; imports: `projectItemStock`, `AssemblabilityInventoryRow` from `../stockState`, `getLocalDateString`.) Update the `InventoryRowRaw` interface to include `name`, `expiration_date`, and `is_ready_to_consume` on locations.

- [ ] **Step 2: Container map** — in `MealLibraryModal`, alongside the `scores`/`totalsById` memos, add:

```ts
  const assemblabilityById = useMemo(() => {
    const map = new Map<string, MealAssemblability>();
    if (!data) return map;
    for (const meal of data.meals) {
      map.set(meal.id, assessAssemblability({
        items: meal.items.map((it) => ({
          savedFoodId: it.saved_food_id,
          name: it.savedFood.name,
          barcode: it.savedFood.barcode,
          conceptIds: data.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
        })),
        inventory: data.inventory,
      }));
    }
    return map;
  }, [data]);
```

plus an `inStockOnly` boolean state toggled by a header chip ("In stock only"); when on, section data filters to `assemblabilityById.get(m.id)?.assemblable`. Pass `assemblability={assemblabilityById.get(item.id)}` into `MealRow` (stable object from the memo — keeps the memo contract) and into `MealDetail`; pass `inventory={data.inventory}` into `MealBuilder` (it already receives `conceptIdsBySavedFoodId`).

- [ ] **Step 3: Surface rendering**

`MealRow` — new optional prop `assemblability?: MealAssemblability`; after the Approved badge:

```tsx
        {assemblability?.assemblable && (
          <View style={[lib.badge, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
            <Text style={[lib.badgeText, { color: "#22C55E" }]}>In stock</Text>
          </View>
        )}
```

`MealDetail` — same prop; under the ingredients card:

```tsx
        {assemblability && !assemblability.assemblable && (
          <Text style={[lib.smallMuted, { marginTop: 8, color: "#F59E0B" }]}>
            Missing: {assemblability.missing.join(", ")}
          </Text>
        )}
        {assemblability?.expiringItemName && (
          <Text style={[lib.smallMuted, { marginTop: 4, color: "#F59E0B" }]}>
            Uses {assemblability.expiringItemName} — expires in {assemblability.expiringDaysLeft}d
          </Text>
        )}
```

`MealBuilder` — new optional props `inventory?: AssemblabilityInventoryRow[]` + reuse of `conceptIdsBySavedFoodId` it already has; per item row, a leading dot:

```tsx
              const available = inventory
                ? assessAssemblability({
                    items: [{ savedFoodId: it.saved_food_id, name: it.savedFood.name,
                              barcode: it.savedFood.barcode,
                              conceptIds: conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [] }],
                    inventory,
                  }).assemblable
                : null;
```

rendered as `●` colored `#22C55E` when true / `#6B7280` when false, `null` renders nothing.

- [ ] **Step 4: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add mobile/src/lib/supabase/mealLibrary.ts mobile/src/components/track/meals/library/
git commit -m "feat(nutrition-os): in-stock badge/filter, missing list, builder availability dots"
```

---

### Task 9: `eatNext` stock awareness (TDD) — ⚠️ verify against Phase 3 amendments first

**Files:**
- Modify: `mobile/src/lib/eatNext.ts`
- Test: `mobile/src/lib/__tests__/eatNext.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

```ts
// append to mobile/src/lib/__tests__/eatNext.test.ts
import type { EatNextStockInfo } from "../eatNext";

describe("stock awareness", () => {
  const stock = (entries: Array<[string, Partial<EatNextStockInfo>]>) =>
    new Map(entries.map(([id, o]) => [id, {
      assemblable: true, missingCount: 0, expiringItemName: null, expiringDaysLeft: null, ...o,
    }]));

  it("assemblable beats higher raw", () => {
    const inStock = scored({ category: "dinner", score: 79 });
    const outStock = scored({ category: "dinner", score: 90 });
    const r = recommendEatNext({
      ...input({}, [outStock, inStock]),
      stockByMealId: stock([
        [inStock.meal.id, {}],
        [outStock.meal.id, { assemblable: false, missingCount: 2 }],
      ]),
    });
    expect(r.recommendations[0].mealId).toBe(inStock.meal.id);
    expect(r.recommendations[0].reasons).toContain("in stock");
    const out = r.recommendations.find((x) => x.mealId === outStock.meal.id)!;
    expect(out.reasons.join(" ")).toMatch(/missing 2 ingredients/);
  });

  it("role match still beats availability", () => {
    const pwOut = scored({ role: "post_workout", protein: 40, score: 70 });
    const plainIn = scored({ protein: 40, score: 95 });
    const r = recommendEatNext({
      ...input({ workoutCompletedAtMinutes: 12 * 60 }, [plainIn, pwOut]),
      stockByMealId: stock([
        [pwOut.meal.id, { assemblable: false, missingCount: 1 }],
        [plainIn.meal.id, {}],
      ]),
    });
    expect(r.context).toBe("post_workout");
    expect(r.recommendations[0].mealId).toBe(pwOut.meal.id);
  });

  it("expiring usage breaks assemblable ties and lands in reasons", () => {
    const usesExpiring = scored({ category: "dinner", score: 80 });
    const fresh = scored({ category: "dinner", score: 80 });
    const r = recommendEatNext({
      ...input({}, [fresh, usesExpiring]),
      stockByMealId: stock([
        [fresh.meal.id, {}],
        [usesExpiring.meal.id, { expiringItemName: "Sirloin", expiringDaysLeft: 2 }],
      ]),
    });
    expect(r.recommendations[0].mealId).toBe(usesExpiring.meal.id);
    expect(r.recommendations[0].reasons.join(" ")).toMatch(/Sirloin.*2/);
  });

  it("never a hard filter: all-out-of-stock still recommends, with reasons", () => {
    const only = scored({ category: "dinner" });
    const r = recommendEatNext({
      ...input({}, [only]),
      stockByMealId: stock([[only.meal.id, { assemblable: false, missingCount: 1 }]]),
    });
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0].reasons.join(" ")).toMatch(/missing 1 ingredient\b/);
  });

  it("absent map = bit-for-bit prior behavior", () => {
    const meals = [scored({ category: "dinner", score: 90 }), scored({ category: "dinner", score: 80 })];
    const withUndefined = recommendEatNext({ ...input({}, meals), stockByMealId: undefined });
    const without = recommendEatNext(input({}, meals));
    expect(withUndefined).toEqual(without);
  });

  it("meal missing from the map ranks as unknown-stock (after in-stock, before known-missing)", () => {
    const known = scored({ category: "dinner", score: 70 });
    const unknown = scored({ category: "dinner", score: 95 });
    const out = scored({ category: "dinner", score: 99 });
    const r = recommendEatNext({
      ...input({}, [out, unknown, known]),
      stockByMealId: stock([
        [known.meal.id, {}],
        [out.meal.id, { assemblable: false, missingCount: 1 }],
      ]),
    });
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      known.meal.id, unknown.meal.id, out.meal.id,
    ]);
  });
});
```

- [ ] **Step 2: Run — new tests FAIL**

- [ ] **Step 3: Implement** — additions to `eatNext.ts` (adapt mechanically if Phase 3 amendments moved these seams):

```ts
export interface EatNextStockInfo {
  assemblable: boolean;
  missingCount: number;
  expiringItemName: string | null;
  expiringDaysLeft: number | null;
}
// EatNextInput gains:  stockByMealId?: Map<string, EatNextStockInfo>;
```

`Candidate` gains `stockRank: number` (0 in-stock, 1 unknown, 2 known-missing) and `expiringRank: number` (0 uses-expiring, 1 not). `candidate()` gains a **fifth** optional parameter — its landed signature is `(m, preferredRoles, maxPrepMinutes, preferredCategories = [])` — becoming `(m, preferredRoles, maxPrepMinutes, preferredCategories = [], stockByMealId?)`; it looks up `stockByMealId?.get(m.meal.id)`, computes both ranks (undefined map or missing entry → `stockRank: 1`, `expiringRank: 1`), and appends stock reasons to `extraReasons`. Every `candidate()` call site forwards the map, **including `catchUpCandidates`**, which gains and forwards a `stockByMealId` parameter so the `catch_up` context and the nudge's body pick stay availability-aware through the one shared definition:

**Caution (Task 2 amendment carry-forward):** compute `expiringRank` from `info.expiringItemName != null`, never from a truthiness check on `info.expiringDaysLeft` — `expiringDaysLeft: 0` (expires today) is a valid, retained rescuable case from `assessAssemblability`, and `0` is falsy in JS. A truthiness check would silently drop the expires-today rescue signal from the ranking.

```ts
function stockReasons(info: EatNextStockInfo | undefined): string[] {
  if (!info) return [];
  if (!info.assemblable) {
    return [`missing ${info.missingCount} ingredient${info.missingCount === 1 ? "" : "s"}`];
  }
  const out = ["in stock"];
  if (info.expiringItemName) {
    out.push(`uses ${info.expiringItemName} — expires in ${info.expiringDaysLeft}d`);
  }
  return out;
}
```

`rank()` comparator becomes: `roleRank` → `stockRank` → `expiringRank` → `raw` desc → prep asc → name. The emergency context's calorie-desc sort is unchanged (rescue size stays king there); its candidates still get stock reasons. `computeNudge`'s pick inherits the new ordering automatically because it calls the same `rank()`.

- [ ] **Step 4: Run — ALL eatNext tests pass (Phase 3's unmodified)**

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/eatNext.ts mobile/src/lib/__tests__/eatNext.test.ts
git commit -m "feat(nutrition-os): Eat Next prefers assemblable and expiring-rescue meals"
```

---

### Task 10: `useEatNext` builds the stock map

**Files:**
- Modify: `mobile/src/hooks/useEatNext.ts`

- [ ] **Step 1:** After the `meals: ScoredMeal[]` construction, build the map from data the hook already fetches (the Task 8 `fetchMealLibrary` changes provide `AssemblabilityInventoryRow[]`):

```ts
      const stockByMealId = new Map(
        library.meals.map((meal) => {
          const a = assessAssemblability({
            items: meal.items.map((it) => ({
              savedFoodId: it.saved_food_id,
              name: it.savedFood.name,
              barcode: it.savedFood.barcode,
              conceptIds: library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
            })),
            inventory: library.inventory,
          });
          return [meal.id, {
            assemblable: a.assemblable,
            missingCount: a.missing.length,
            expiringItemName: a.expiringItemName,
            expiringDaysLeft: a.expiringDaysLeft,
          }];
        }),
      );
```

and pass `stockByMealId` into `recommendEatNext`. Import `assessAssemblability` from `@/src/lib/stockState`.

- [ ] **Step 2: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add mobile/src/hooks/useEatNext.ts
git commit -m "feat(nutrition-os): Eat Next surfaces receive live stock signals"
```

---

### Task 11: Delete the dead client copies + comment cleanup sweep

- [ ] **Step 1:** Grep for leftovers of the old projection and views:

```bash
cd /Users/brianwilson/code/fittracker && grep -rn "storage_type === 'single-location'" mobile/src mobile/app | grep -v stockState
grep -rn "food_inventory_with_locations\|low_stock_items\|out_of_stock_items\|expiring_soon_items\|shopping_list_active" mobile/ supabase/migrations/20260730100000* docs/ --include='*.ts' --include='*.tsx' --include='*.sql'
```

Expected: first grep → only presentation-hint uses (EditFoodScreen storage-type toggle UI, `stockState.ts` threshold selection); no quantity math. Second → only the drop migration. Fix any others.

- [ ] **Step 2:** `cd mobile && npx tsc --noEmit && npm test` → green. Commit any fixes:

```bash
git add -A mobile/src mobile/app
git commit -m "chore(nutrition-os): remove last storage_type quantity branches"
```

(Skip the commit if Step 1 found nothing — do not create an empty commit.)

---

### Task 12: Apply migration to prod — ⚠️ OWNER GATE

**Do not execute without the owner's explicit go-ahead in the session.**

- [ ] **Step 1: Pre-flight (read-only).** `npx supabase migration list` → exactly `20260730100000_inventory_locations_truth` pending (Phase 3's `20260729110000` must be APPLIED — else the merge-order precondition was violated; stop). Read-only queries: per-item legacy quantity vs locations sum (capture the full divergence table — expect the known canary: one item legacy 0 / locations 60); count of single-location items with location rows; confirm all five views still exist.

- [ ] **Step 2: Apply.** `npx supabase db push --yes`. Expected notices: one line per canonicalized/seeded item + the closing counts; no exception from the post-condition assertion.

- [ ] **Step 3: Post-verify (read-only).** Every item has ≥1 location row and `quantity = Σ locations` (re-run the §6.1(D) query — expect 0 violations); the canary reads 60 in both strata; `transfer_inventory_units` exists with `authenticated`-only execute; all five views gone.

---

### Task 13: Final verification sweep

- [ ] **Step 1:** `cd mobile && npx tsc --noEmit && npm test` — all suites green (stockState + extended eatNext + all prior).
- [ ] **Step 2 (owner, on device — Metro reload, free `--port`):** list/detail/edit show identical quantities for the same item; restock (both "from store" and location→location) updates instantly and survives refresh with both strata equal; "Use from pantry" now offered on the canary item; multi→single edit leaves exactly one location row (verify via detail view); expiring section lists the right items; Meal Library "In stock" badges + filter; MealDetail missing list; Eat Next top pick prefers an in-stock meal and names an expiring ingredient when applicable; log a meal consuming the canary → quantities drop coherently everywhere.
- [ ] **Step 3:** Stop. Merge/push are the owner's calls.

---

## Self-review checklist (run after writing, before execution)

- Spec coverage: §5.1 → Task 1; §5.2 → Task 2; §6.1/§6.3 → Task 3; §6.2 → Tasks 5/6; §7 → Tasks 4/7; §8 → Tasks 5/8; §9 → Tasks 9/10; §10 → Tasks 1/2/9/13; §11 → Preconditions; views decision → Task 3; three-copy deletion → Tasks 5/11. No gaps.
- Type consistency: `ItemStockState`/`projectItemStock` (1→4/5/8), `AssemblabilityInventoryRow`/`assessAssemblability`/`MealAssemblability` (2→8/10), `transferInventoryUnits`/`replaceItemLocations` (4→5/6), `EatNextStockInfo`/`stockByMealId` (9→10), `InventoryItemWithState` (4→5).
- Known accepted risks: `replaceItemLocations` is a non-atomic client sequence (documented; reconcile assertion is the backstop); detail/edit routes fetch the whole list (25 rows, one code path — deliberate); `MealLibraryData.inventory` type change is additive but Phase 3's `useEatNext` compiled against the old shape — Task 8 must run `npm test` + `tsc` to prove compatibility.

## ⚠️ Execution amendments

### Task 1

Task 1 landed spec-compliant on first pass (verbatim to the plan's Step 1/3 blocks, 12/12 tests, `tsc` 0 errors) and a follow-up code-quality review returned "Ready to merge: with fixes" — no spec drift, but four defects in the plan's own code/tests. All four are fixed below, in the same commit as this amendment.

- **`needsFridgeRestock`'s two conjuncts — `(fridge_restock_threshold ?? 0) > 0` and the `readyQuantity <= threshold` boundary — were unpinned by the plan's own test.** The plan's single `needsFridgeRestock` test reused `base.locations = [loc(2, true), loc(9, false)]` (`readyQuantity = 2`) for every sub-case, so `2 <= 0` was already false whenever the threshold guard was disabled — the last conjunct did the work and the guard itself was never exercised. Mutation testing confirmed two surviving mutants against the plan's 12-test suite: (1) replacing `(item.fridge_restock_threshold ?? 0) > 0 &&` with `true &&` — all 12 tests still passed; (2) replacing `readyQuantity <= (item.fridge_restock_threshold ?? 0)` with `readyQuantity <= (item.fridge_restock_threshold ?? 0) + 1` — all 12 tests still passed. Without the first guard, a refrigerated multi-location item with `fridge_restock_threshold: null` and an empty fridge stratum evaluates `0 <= 0` → `true`, producing a permanently-stuck "Restock Fridge" badge on the most common item shape (Task 5 reads `state.needsFridgeRestock` for exactly that badge + action-sheet entry). **Fix:** two assertions added to the existing `needsFridgeRestock` test in `stockState.test.ts` — one with `fridge_restock_threshold: null` and an empty (not-ready) fridge stratum, one with `readyQuantity` (3) one unit past the threshold (2). No source change; the predicate itself (`stockState.ts` lines ~74–78) was already correct. **Verified:** both mutants re-applied individually to `stockState.ts`, each run against `npm test -- stockState`, each observed to fail exactly the newly-added assertion (mutant 1 fails the "no threshold configured" case; mutant 2 fails the "ready stock exceeds threshold" case), then reverted; suite confirmed green after each revert.
- **NaN propagation on a malformed `expiration_date`.** `daysBetweenLocalDates` returns `NaN` for an unparseable date string, and since `NaN < 0`, `NaN === 0`, and `NaN <= 7` are all `false`, the original banding chain silently fell through to `"later"` while carrying `daysLeft: NaN`. Task 2's planned expiring-filter (plan line 436, `row.daysLeft === null || row.daysLeft > EXPIRING_SOON_DAYS`) does not skip this row (`NaN > 7` is also `false`), so a malformed date would become the "most urgent expiring item," surfacing "expires in NaNd" in Eat Next reason strings and MealDetail. **Fix:** `projectItemStock` now checks `Number.isFinite(rawDaysLeft)` before assigning `daysLeft`/computing `expiration`; a non-finite result leaves both `null`, i.e. an unparseable date behaves as "no date" — normalized once at the source instead of defended at three downstream read sites. **New test:** `exp("not-a-date")` asserts `{ expiration: null, daysLeft: null }`. 219/219 tests green (was 218) after this fix, `tsc` 0 errors.
- **Stale comment attribution.** The `daysBetweenLocalDates` local-noon-anchor comment cited "(rampProgress precedent)" — but `rampProgress.ts`'s `isoWeekAnchor`/`daysBetween` use `Date.UTC` anchors, not local noon; both are DST-safe, but the citation was simply wrong and would mislead a reader about this repo's actual idiom. **Fix:** comment reworded to state the DST reasoning directly (a midnight anchor can straddle a spring-forward/fall-back transition and shift the diff by an hour; noon never does) without the false citation. No arithmetic change.
- **Undocumented `storage_type: null` classification.** `single = item.storage_type === "single-location"` treats any non-`"single-location"` value — including `null` — as multi-location. For real rows this is moot (`storage_type` is `NOT NULL` with a two-value `CHECK`), but Task 8 deliberately passes a synthetic item with `storage_type: null`, which is therefore silently classified multi-location; Task 8 only reads `totalQuantity`/`daysLeft` so this is harmless today, but was undocumented. **Fix:** comment-only — added at the `const single = ...` site, explaining the null/unknown-storage_type behavior is intentional so a future caller isn't surprised by it. No logic change.

Not fixed, per the review's explicit scope: widening the `locations` param to a `Pick<...>` to avoid Task 8's synthetic-row fabrication (deferred to Task 8, if it ends up touching that signature) — flagged here as a possible required deviation from Task 8's plan code when that task executes. Also not added: a direct unit test for `daysBetweenLocalDates` (transitively covered by the projection tests).

Final state: 9 Jest suites / 219 tests passing (13 in `stockState.test.ts`, up from 12), `tsc --noEmit` 0 errors.

### Task 2

Task 2 landed spec-compliant on first pass (byte-identical to the plan's Step 1/3 blocks, 21/21 tests, `tsc` 0 errors; the barcode-terminal test was independently mutation-verified as load-bearing). A follow-up code-quality review returned "Ready to merge: with fixes" — no spec drift, but one important behavioral defect and three coverage gaps in the plan's own code/tests. All five are fixed below, in the same commit as this amendment.

- **The expiring window had no lower bound — already-expired rows could win the "expiring" minimum.** The plan's filter (`row.daysLeft === null || row.daysLeft > EXPIRING_SOON_DAYS`) only bounds `daysLeft` above; a negative `daysLeft` (already expired — `projectItemStock` deliberately bands this as `"expired"`, distinct from `"soon"`, at `stockState.ts` ~92–94, so negatives are an expected, not exceptional, value) passes the filter, and since expired food has the smallest `daysLeft`, it always wins the `<` minimum over anything actually rescuable. Confirmed empirically pre-fix: `daysLeft: -3` alone produced `{ expiringItemName: "Rotten Sirloin", expiringDaysLeft: -3 }`; `-9` vs. `+1` produced `{ expiringItemName: "Rotten Sirloin", expiringDaysLeft: -9 }`. **Blast radius once downstream tasks land:** Task 8's `MealDetail` would render `Uses Rotten Sirloin — expires in -3d`; Task 9's `expiringRank` (`roleRank → stockRank → expiringRank → raw` comparator) would promote that meal above every fresh in-stock meal — "rescue food first" inverted into "eat the worst thing first," silently, in production, the first time an expired item shared a concept with something fresh. **Fix:** the skip condition now also excludes `d < 0`; day 0 (expires today) is retained as rescuable, matching `projectItemStock`'s own `"today"`/`"soon"` bands. Rationale recorded in-line at `stockState.ts`: "expiring" is a rescue signal (eat this soon), not a spoilage report, and can't share the `expires in {n}d` copy template once negative. **Verified:** the `d < 0` guard removed from `stockState.ts` and run against `npm test -- stockState` → the new "expiring excludes already-expired rows" test failed (`expiringItemName` received `"Boost, Very High Calorie"`, expected `null`); reverted, suite green again.
- **The `daysLeft === null` skip was untested — mutant SURVIVED.** The existing test titled "expiring ignores items beyond the soon window and null dates" never actually exercised a null `daysLeft`; only `EXPIRING_SOON_DAYS + 1` was tested. Removing the null check in a type-valid way (casting both read sites to `number`, since a bare removal is a genuine `tsc` error, not a test kill) left all 21 original tests passing — a matched row with `daysLeft: null` would render `expires in nulld`. **Fix:** the implementation was restructured to narrow `d` via a local `const` (`const d = row.daysLeft; if (d === null || d < 0 || d > EXPIRING_SOON_DAYS) continue;`) instead of re-reading `row.daysLeft`/casting; a dedicated test ("a matched row with no expiration date is not 'expiring'") now pins `daysLeft: null → expiringItemName: null, expiringDaysLeft: null`. **Verified:** null-check removed via `(d as number) < 0 || (d as number) > EXPIRING_SOON_DAYS` (plus a matching cast at the tie-break comparison, since removing only the guard's null-narrowing still left a downstream `tsc` error) — this compiled clean and failed the new test (`expiringItemName` received `"Boost, Very High Calorie"`, expected `null`); reverted, suite green.
- **The inclusive `EXPIRING_SOON_DAYS` boundary was unpinned — mutant SURVIVED.** `> EXPIRING_SOON_DAYS` → `>= EXPIRING_SOON_DAYS` passed all 21 tests: the only "beyond window" test used `EXPIRING_SOON_DAYS + 1`, never the boundary value itself. Real behavior includes day 7 (matching `projectItemStock`'s own `<= EXPIRING_SOON_DAYS → "soon"` band). **Fix:** new test pins `daysLeft: EXPIRING_SOON_DAYS` as still-expiring. **Verified:** `>` mutated to `>=`, run against `npm test -- stockState` → the new boundary test failed (`expiringItemName` received `null`, expected `"Boost, Very High Calorie"`); reverted, suite green.
- **The tie-break's strict `<` was unpinned — mutant SURVIVED.** `<` → `<=` in `d < expiringDays` also passed all 21 tests: no test put two matched rows at the same `daysLeft`. Two rows tied on `daysLeft` resolve to whichever the loop visits first — which, since `matches` (and therefore `new Set(matches.values())`) preserves meal-item insertion order, means the earlier meal item's resolution wins. That was already the real behavior; it just wasn't a decision anyone could point to. **Fix:** new test ties two rows at `daysLeft: 3` and pins the first item's row as the winner; a comment at the tie-break site now states the intent explicitly. **Verified:** `<` mutated to `<=`, run against `npm test -- stockState` → the new tie-order test failed (`expiringItemName` received `"Sticky Rice"`, expected `"Sirloin"`); reverted, suite green.
- **The `(expiring.daysLeft as number)` cast was an escape hatch, not a necessity.** It was safe at the time (the code guarantees non-null at that point) but is exactly the kind of cast that would have silently absorbed a future loosening of the null/range guard above it — and in fact, the FIX-2 mutant above was killable only because the *guard's own* `row.daysLeft` was left type-checked; the cast on the comparison side would not itself have caught anything. **Fix:** replaced the `expiring: AssemblabilityInventoryRow | null` + cast pattern with two parallel locals (`expiringItemName: string | null`, `expiringDays: number | null`) populated only inside the already-narrowed branch, so no cast is needed anywhere in the function; `tsc --noEmit` remains 0 errors. Behavior is unchanged — this is a pure "delete the escape hatch" refactor.
- **The skip branch's non-mutation of the running minimum was untested — mutant SURVIVED.** Resetting `expiringItemName`/`expiringDays` to `null` inside the skip branch (`if (... ) { expiringItemName = null; expiringDays = null; continue; }`) passed all 25 tests, because no test had a qualifying matched row followed by a non-qualifying matched row in the same `assessAssemblability` call — the multi-row tests had every row qualify, and every skip-only test had a single row. **Fix:** extended "reports the most urgent expiring in-stock item the meal uses" with a third meal item resolving to a matched-but-expired row (`daysLeft: -3`), positioned after the winning row in match order, still asserting `Sirloin`/`2`. **Verified:** the reset-on-skip mutant applied to `stockState.ts`, run against `npm test -- stockState` → the extended test failed (`expiringItemName` received `null`, expected `"Sirloin"`); reverted, suite green.

Not in scope for this amendment, confirmed rather than assumed: the `new Set(matches.values())` dedup is not itself a coverage hole. Mutating it away (iterating `matches.values()` directly, without the `Set`) is a provably **equivalent** mutant here — revisiting the same inventory row a second time re-evaluates `d < expiringDays` with `d` equal to the already-recorded `expiringDays`, which is `false`, so the second visit is a no-op and the result is byte-identical either way. No test should be written to try to kill it.

**Forward note for Task 9:** when Task 9 computes `expiringRank` from `MealAssemblability`, it must key off `expiringItemName != null`, not a truthiness check on `expiringDaysLeft` — `expiringDaysLeft: 0` (expires today, a retained rescuable case per the FIX above) is falsy in JS and a truthiness check would silently drop the expires-today rescue signal from the ranking. See also the caution added directly in Task 9's section below.

Final state: 9 Jest suites / 231 tests passing (25 in `stockState.test.ts`, up from 21), `tsc --noEmit` 0 errors.


