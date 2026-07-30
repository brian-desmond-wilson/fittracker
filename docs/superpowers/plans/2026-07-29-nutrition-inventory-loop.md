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
--     effect: a re-run reproduces the same state. The apply REFUSES (raise
--     exception, whole file rolls back) if any single-location item's
--     location rows hold more than its legacy column — that is stock
--     destruction, not reconciliation, and no assertion downstream can see
--     it after the fact.
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
  --    §4 says legacy wins here, but "wins" must not mean "destroys": if the
  --    location rows hold MORE than the legacy column, this item is Task 12
  --    Step 1's abort condition and the whole apply refuses. Assertion D
  --    cannot catch that case — it compares fi.quantity against the row A
  --    just wrote FROM fi.quantity, so destruction is tautologically
  --    satisfied at 0 = 0. The guard has to be here, before the delete.
  for r in
    select fi.id, fi.name, fi.quantity, fi.location,
           coalesce((select sum(l.quantity) from public.food_inventory_locations l
                      where l.food_inventory_id = fi.id), 0) as loc_total,
           (select count(*) from public.food_inventory_locations l
             where l.food_inventory_id = fi.id)              as loc_rows
    from public.food_inventory fi
    where fi.user_id = v_user_id
      and coalesce(fi.storage_type, 'single-location') = 'single-location'
  loop
    if r.loc_total > r.quantity then
      raise exception 'Refusing to destroy stock: single-location item "%" (%) holds % units across % location row(s) but legacy quantity is %. This is Task 12 Step 1''s abort condition. Reconcile by hand, then re-run.',
        r.name, r.id, r.loc_total, r.loc_rows, r.quantity;
    end if;
    delete from public.food_inventory_locations where food_inventory_id = r.id;
    insert into public.food_inventory_locations
      (food_inventory_id, user_id, location, quantity, is_ready_to_consume)
    values (r.id, v_user_id, coalesce(r.location, 'pantry'), r.quantity, true);
    v_replaced := v_replaced + 1;
    raise notice '  single-location canonicalized: % — % row(s) totalling % replaced by 1 row of % at %',
      r.name, r.loc_rows, r.loc_total, r.quantity, coalesce(r.location, 'pantry');
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

-- Drop order matters: low_stock_items, out_of_stock_items and expiring_soon_items
-- are all defined FROM food_inventory_with_locations (20250217000003:106,122,130),
-- so the parent must go last. Deliberately NOT `cascade` — an unforeseen dependent
-- should abort the apply loudly rather than be silently dropped.
drop view if exists public.low_stock_items;
drop view if exists public.out_of_stock_items;
drop view if exists public.expiring_soon_items;
drop view if exists public.food_inventory_with_locations;
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
  FoodLocation,
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
 * insert → cache update), and it is NOT atomic: there is no transaction
 * around it, and — this is the part that matters — nothing re-checks the
 * invariant afterwards. The migration's assertion D lives inside a one-shot
 * `do $$` block that runs once at apply time; there is no CHECK, no
 * trigger, and no scheduled job behind it. A mid-sequence failure is
 * therefore permanent until the item is re-saved.
 *
 * What bounds the damage is the failure-path resync below: the cache is
 * driven to the true Σ locations on BOTH paths, so all three readers agree
 * the item is out of stock rather than the location rows and the legacy
 * column telling two different stories.
 */
export async function replaceItemLocations(
  userId: string,
  itemId: string,
  rows: Array<{ location: FoodLocation; quantity: number; is_ready_to_consume: boolean; notes?: string | null }>,
): Promise<void> {
  // Zero rows would satisfy the cache invariant (0 = 0) while breaking the
  // migration's other post-condition — §6.1(4), every item keeps >= 1
  // location row. This module owns that invariant, so it refuses here
  // instead of trusting each caller's own validation.
  if (rows.length === 0) throw new Error("replaceItemLocations: an item must keep at least one location row");

  const { error: delError } = await supabase
    .from("food_inventory_locations")
    .delete()
    .eq("food_inventory_id", itemId);
  if (delError) throw delError;

  const { error: insError } = await supabase.from("food_inventory_locations").insert(
    // Fields are listed rather than spread: `rows` elements are structurally
    // compatible with full FoodInventoryLocation rows, and a spread would
    // forward their `id`/`created_at`/`updated_at` into the insert — so a
    // "duplicate this item's locations" caller would insert with the source
    // rows' primary keys.
    rows.map((r) => ({
      food_inventory_id: itemId,
      user_id: userId,
      location: r.location,
      quantity: r.quantity,
      is_ready_to_consume: r.is_ready_to_consume,
      notes: r.notes ?? null,
    })),
  );

  // The delete has already committed, so Σ locations is 0 if the insert
  // failed and `total` if it succeeded — resync to whichever actually holds.
  // Writing `total` on the failure path would just swap one divergence for
  // another: the cache would claim stock no location row backs, which is
  // precisely what re-arms mealLibrary's `locations.length > 0 ? … : quantity`
  // fallback and the consume RPC's legacy branch. Zero is the honest answer.
  const total = insError ? 0 : rows.reduce((s, r) => s + r.quantity, 0);
  const { error: cacheError } = await supabase
    .from("food_inventory")
    .update({ quantity: total })
    .eq("id", itemId);

  // The insert error is the one the caller has to see; a failed best-effort
  // resync must not mask it.
  if (insError) {
    if (cacheError) {
      console.error("replaceItemLocations: cache resync after failed insert also failed:", cacheError);
    }
    throw insError;
  }
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

Keep the catch-refetch exactly as it is (the RPC throwing lands in the existing catch).

> **Corrected in place — the original text read "keep the optimistic local-state update and the catch-refetch exactly as they are", which is wrong.** The optimistic update MUST be reworked: once the grid reads `item.state.*`, an update that refreshes only the legacy `total_quantity`/`ready_quantity`/`storage_quantity` mirrors leaves `state` stale, and there is no success-path refetch to repair it. Rebuild the row with `projectItemStock` over the updated locations, and carry `quantity` from it too. See "⚠️ Execution amendments → Task 5".

- [ ] **Step 4: Detail + edit routes** — in both `[id].tsx` and `edit/[id].tsx`, replace the inline fetch + quantity math (`:35-91`) with a single call:

```ts
      const items = await fetchInventoryWithState(getLocalDateString());
      const item = items.find((it) => it.id === id);
      if (!item) { /* keep the existing not-found handling */ }
```

Delete both local projection blocks. (Fetching the whole list to find one item matches current data volume — 25 rows — and keeps one code path; note it in a comment.)

**Also retype the item annotations in this step — Task 6 depends on it.** Assigning an `InventoryItemWithState` into a `FoodInventoryItemWithCategories`-typed slot compiles (the former is assignable to the latter) but *erases* `state` at the boundary, so a later `item.state.…` read fails with `TS2339`. Task 6's caution requires reading `item.state.totalQuantity` inside `EditFoodScreen`, so the edit side must be retyped here:

- `mobile/src/components/track/EditFoodScreen.tsx:29` — `EditFoodScreenProps.item`: `FoodInventoryItemWithCategories` → `InventoryItemWithState`
- `mobile/app/(tabs)/track/food-inventory/edit/[id].tsx:14` — `useState<FoodInventoryItemWithCategories | null>` → `useState<InventoryItemWithState | null>`
- `mobile/app/(tabs)/track/food-inventory/add.tsx:25` — **third render site of `EditFoodScreen`, not otherwise named in this plan.** Its `newItem` literal is a hand-built `FoodInventoryItemWithCategories` and will fail with `TS2741: Property 'state' is missing`. Give it an empty-stock projection — `projectItemStock({ item: newItem, locations: [], todayLocalDate: getLocalDateString() })` is the non-duplicating spelling — rather than hand-writing an `ItemStockState` literal that can drift from the projection.

The detail side is **optional now, mandatory at Task 11**: `ViewFoodDetailsScreen` reads only `total_quantity`/`ready_quantity`/`storage_quantity` (`:187-191`), which are the legacy mirrors `InventoryItemWithState` still carries and which survive the widening — so `ViewFoodDetailsScreen.tsx:24`, `[id].tsx:14` and `preview.tsx:37` compile untouched today. Task 11 deletes those mirrors, at which point all three must move to `state.*` and take the same treatment (`preview.tsx:37` builds a synthetic literal exactly like `add.tsx`). Doing all three here, for symmetry, is cheaper than splitting the change across two tasks.

**Verified** (throwaway probe, reverted): retyping all four annotations at once yields exactly four errors — `[id].tsx:113` and `edit/[id].tsx:113` (the *old* inline `setItem` calls, which this step deletes anyway, so they self-resolve), plus `add.tsx:77` and `preview.tsx:85` (`TS2741: Property 'state' is missing in type 'FoodInventoryItemWithCategories'`). Nothing inside `EditFoodScreen` or `ViewFoodDetailsScreen` itself breaks.

- [ ] **Step 5: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add -A mobile/src/components/track/FoodInventoryScreen.tsx mobile/src/components/track/EditFoodScreen.tsx mobile/src/components/track/RestockModal.tsx "mobile/app/(tabs)/track/food-inventory/"
# add mobile/src/components/track/ViewFoodDetailsScreen.tsx too if you took the optional detail-side retype in Step 4
# RestockModal.tsx was added by the Task 5 review round — see "⚠️ Execution amendments → Task 5", FIX 1.
git commit -m "refactor(nutrition-os): inventory screens read the one stock projection; expiring section; atomic restock"
```

---

### Task 6: EditFoodScreen invariant-keeping saves

**Files:**
- Modify: `mobile/src/components/track/EditFoodScreen.tsx` (save flow ~`:435-655`)

**Caution (Task 4 amendment carry-forward) — REQUIRED change, not optional:** `EditFoodScreen.tsx:59` seeds the editable quantity from `useState((item.quantity ?? 0).toString())` — the legacy **cache**, not the projection. Change it to read `item.state.totalQuantity`. On the one path where the two diverge, the current code shows the stale cache and the "fixed by re-saving" mitigation then writes that stale number back as canonical truth — laundering drift into the location rows and inverting the very mitigation `replaceItemLocations` relies on.

**The type plumbing this depends on is Task 5's, not yours** — Task 5 Step 4 retypes `EditFoodScreenProps.item` (`:29`) to `InventoryItemWithState`, retypes `edit/[id].tsx:14` to match, and adds the missing `state` to `add.tsx:25`'s synthetic `newItem` literal. If `item.state` does not resolve when you get here, Task 5 Step 4 was skipped — go do it there rather than patching around it, or you will erase `state` at the prop boundary again. Also note that Task 4's `replaceItemLocations` now **throws on an empty `rows` array**, so the multi-location branch must keep its existing empty-`locationEntries` guard (`:416-422`) as the user-facing message; the module-side throw is a backstop, not a substitute.

- [ ] **Step 1: Single-location save** — after the item insert/update (~~which keeps writing `quantity` and `location` as today~~ — **corrected in place: `location` is still written as today, `quantity` is NOT.** Step 2 removes `quantity` from `itemData` outright, and the create path re-adds a literal `quantity: 0` seed at the `.insert()` call site only, because the column is `NOT NULL` with no default. This clause predated Step 2 and contradicted it; see "⚠️ Execution amendments → Task 6". `:467-526`/`:563-597`), replace any location-row handling for the single-location branch with:

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

> **The `parseInt(quantity, 10)` above did not ship, and must not be reintroduced.** It is the write half of a validate-with-`parseFloat` / write-with-`parseInt` split that a review round proved to be a deterministic stock-loss bug once `quantity` left `itemData` — `".5"` passes `parseFloat` validation and reaches the insert as `NaN`, after the delete has already committed. The landed code parses once via a `parseQuantityInput` helper and **builds this row inside the validation block**, so the validated number and the written number are the same value by construction. See "⚠️ Execution amendments → Task 6", FIX 1.

- [ ] **Step 2: Multi-location save** — replace the existing delete-all-then-reinsert block (`:573-597`) with a `replaceItemLocations(user.id, savedItemId, locationEntries.map(e => ({ location: e.location, quantity: parseInt(e.quantity, 10), is_ready_to_consume: e.isReady, notes: e.notes || null })))` call, and **stop writing `quantity: 0`** in `itemData` for multi-location items (`:474`) — the cache is set by `replaceItemLocations`. Remove `quantity` from `itemData` entirely; the cache is owned by the location writes now. (Two spellings above are wrong against the shipped code and were corrected during execution: the `LocationEntry` field is `isReadyToConsume`, not `isReady`. **And removing `quantity` from `itemData` outright breaks the INSERT path** — `food_inventory.quantity` is `INTEGER NOT NULL` with no default, so the create path re-adds a literal `quantity: 0` seed at the `.insert()` call site only. See "⚠️ Execution amendments → Task 6".)

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
 *
 * Pre-Task-12 note: an item with zero location rows projects 0, so the pantry
 * toggle reads "out of stock" for it until the reconcile seeds its canonical
 * row. Deliberate — this is the same direction Task 5 took for the grid, and
 * the alternative is a legacy-cache fallback, which is the divergence this
 * phase exists to remove.
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
      // Nothing stops two items sharing a barcode — food_inventory has only a
      // plain index on it (20250209_extend_food_inventory.sql:28), and the
      // edit screen does not dedupe. Without an ORDER BY the winner is
      // arbitrary AND unstable: the consume RPC's resync UPDATE rewrites the
      // tuple, which can move it in a heap scan. Oldest-first is at least
      // deterministic, and it matters more now that duplicates project
      // different totals.
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Inventory lookup failed:", error);
      return null;
    }
    if (!data) return null;
    // `Omit<…, "quantity">` because the select drops the legacy column. Buys:
    // the projection is load-bearing — delete `quantity:` below and it stops
    // compiling. Does not buy: a field added here but missing from the select
    // string still compiles (no cast can catch that — grep the migrations).
    const { locations, ...rest } = data as Omit<
      InventoryMatchSummary,
      "quantity"
    > & {
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

> **The cast above was `data as InventoryMatchSummary & { locations: … }` in the plan as written, and it was dishonest — corrected in place to `Omit<InventoryMatchSummary, "quantity">`. See "⚠️ Execution amendments → Task 7". The pre-Task-12 paragraph in the docstring is also an addition, recorded there.**

Update the stale divergence comments at both files to state the gate and the RPC now read the same truth. `InventoryMatchSummary` keeps its shape (`quantity` redefined as projected total — spec §7); MealsScreen's `willUseInventory` gate needs no code change. **"The same truth" needed hedging to stay true before Task 12 — the shipped comments say the divergence is closed *and* that what remains is one-directional and safe; see the amendment.**

- [ ] **Step 2: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add mobile/src/services/foodInventoryMatchService.ts mobile/src/components/track/MealsScreen.tsx
# The plan doc is staged too — house rule #4, and Task 12's banner needed a
# correction this task caused. See "⚠️ Execution amendments → Task 7".
git add docs/superpowers/plans/2026-07-29-nutrition-inventory-loop.md
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

and the mapping to produce `AssemblabilityInventoryRow[]` (type change on `MealLibraryData.inventory` — additive for existing consumers). **Updated in place to the landed code** — the synthetic-row fabrication is gone (Task 1's deferred `Pick<>` widening was taken here) and the clock is hoisted out of the callback; see "⚠️ Execution amendments → Task 8":

```ts
  const todayLocalDate = getLocalDateString();
  const resolutionInventory: AssemblabilityInventoryRow[] = invRows.map((r) => {
    const state = projectItemStock({
      item: { storage_type: null, restock_threshold: null, fridge_restock_threshold: null,
              total_restock_threshold: null, requires_refrigeration: null,
              expiration_date: r.expiration_date },
      locations: r.locations,
      todayLocalDate,
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

> **🚨 Pre-migration consequence the plan did not price in — removing this fallback also stops meal logging from decrementing stock.** Not just badges. `logMeal` resolves through this same array, and `resolveInventoryMatches` drops every row with `totalQuantity === 0` (including on the *terminal barcode* branch, `inventoryResolution.ts:43`), so a zero-location-row item is never in `matches`, never in `requestedIds`, and `consume_inventory_units` is never called for it — its legacy `else` branch (`20260729100100:64-70`) becomes unreachable from this path. Per Task 6's Finding A that class is most of the single-location pantry. **Correct anyway, and the fallback must NOT be restored** — it is the divergence Phase 4 closes, and section A fixes the class wholesale. Task 12's banner is updated to say so. Full trace in "⚠️ Execution amendments → Task 8".

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

plus an `inStockOnly` boolean state toggled by a header chip ("In stock only"); when on, section data filters to `assemblabilityById.get(m.id)?.assemblable`. **The chip landed as a filter bar row between the header and `body`, list mode only** — the three-slot header (`＋ New` / title / `Done`) has no room, and a chip inside the `SectionList` would scroll away while still hiding rows. **`ListEmptyComponent` is now conditional on `inStockOnly`** — `sections` drops empty sections, so an over-narrow filter produces the same `[]` as an empty library and would otherwise tell the user "No meals yet — add your first one." Pass `assemblability={assemblabilityById.get(item.id)}` into `MealRow` (stable object from the memo — keeps the memo contract) and into `MealDetail`; pass `inventory={data.inventory}` into `MealBuilder` (it already receives `conceptIdsBySavedFoodId`).

- [ ] **Step 3: Surface rendering**

`MealRow` — new optional prop `assemblability?: MealAssemblability`; after the Approved badge:

```tsx
        {assemblability?.assemblable && (
          <View style={[lib.badge, lib.inStockBadge]}>
            <Text style={[lib.badgeText, lib.inStockBadgeText]}>In stock</Text>
          </View>
        )}
```

`MealDetail` — same prop; under the ingredients card:

```tsx
        {assemblability && assemblability.missing.length > 0 && (
          <Text style={[lib.smallMuted, lib.warnText, { marginTop: 8 }]}>
            Missing: {assemblability.missing.join(", ")}
          </Text>
        )}
        {assemblability?.expiringItemName && (
          <Text style={[lib.smallMuted, lib.warnText, { marginTop: 4 }]}>
            Uses {assemblability.expiringItemName} —{" "}
            {assemblability.expiringDaysLeft === 0
              ? "expires today"
              : `expires in ${assemblability.expiringDaysLeft}d`}
          </Text>
        )}
```

(Three corrections to the plan's own code above, all recorded in "⚠️ Execution amendments → Task 8". **(a)** The missing-list gate is `assemblability.missing.length > 0`, **not** the plan's `!assemblability.assemblable` — the two are not the same predicate, and the verdict form renders a bare `Missing:` with nothing after it for an item-less meal. **(b)** The `expiringDaysLeft === 0` branch: day 0 is a *retained* rescue case, so `expires in 0d` was reachable, not hypothetical. **(c)** The inline colors moved into named `styles.ts` entries.)

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

rendered as `●` colored `#22C55E` when true / `#6B7280` when false, `null` renders nothing. (Landed as a nested inline `<Text>` with the trailing space inside the literal — margins on inline nested `Text` are unreliable on iOS, and a third sibling would break the row's `space-between` layout.)

- [ ] **Step 4: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add mobile/src/lib/stockState.ts mobile/src/lib/supabase/mealLibrary.ts mobile/src/components/track/meals/library/
git commit -m "feat(nutrition-os): in-stock badge/filter, missing list, builder availability dots"
```

(`stockState.ts` added to the `git add` line: the `Pick<>` widening Task 1 deferred here lives there and is compile-forced for the fabrication-free mapping above. The plan doc is staged too — house rule #4.)

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
  const out = info.assemblable
    ? ["in stock"]
    : [`missing ${info.missingCount} ingredient${info.missingCount === 1 ? "" : "s"}`];
  if (info.expiringItemName != null) {
    out.push(
      info.expiringDaysLeft === 0
        ? `uses ${info.expiringItemName} — expires today`
        : `uses ${info.expiringItemName} — expires in ${info.expiringDaysLeft}d`,
    );
  }
  return out;
}
```

*(Fence corrected during execution to match the landed source, in three places: **(1)** `!= null` rather than truthiness on `expiringItemName` — see the round-2 amendment for why this is a behavior change, not the "legibility fix" the round-1 amendment called it; **(2)** the day-0 special case, reconciling this copy with the "expires today" treatment Task 8's DECISION 2 shipped in `MealDetail` for the same field; **(3)** the early `return` on the not-assemblable branch replaced by a ternary seed, so the expiring line is appended on **both** branches — adopting Task 8's ruling that the rescue signal is more actionable, not less, when the meal is unmakeable, and keeping `stockReasons` in agreement with `expiringRank`, which is deliberately not conditioned on `assemblable`. See "⚠️ Execution amendments → Task 9".)*

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
- ~~*(as planned — one file)*~~ **Corrected during execution: also `mobile/src/lib/eatNext.ts` (the builder moved there as an exported pure function), `mobile/src/lib/__tests__/eatNext.test.ts` and `mobile/src/lib/__tests__/stockState.test.ts` (the pinning tests Task 9's hand-off made mandatory).** The fence below is left as originally written — its *body* landed token-for-token identical, only its container changed. See "⚠️ Execution amendments → Task 10".

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

and pass `stockByMealId` into `recommendEatNext`. ~~Import `assessAssemblability` from `@/src/lib/stockState`.~~ **Corrected: the hook imports `buildStockByMealId` from `@/src/lib/eatNext` and the whole block above collapses to `const stockByMealId = buildStockByMealId(library);`. The `assessAssemblability` import moved into `eatNext.ts` along with the block. The block's *body* is byte-identical to the fence (verified by token-level comparison, not by eye) — what changed is (a) its home, so it is reachable from Jest, and (b) an added `if (meal.items.length === 0) continue;`. Both recorded in "⚠️ Execution amendments → Task 10".**

- [ ] **Step 2: Verify + commit**

```bash
cd mobile && npx tsc --noEmit && npm test
git add mobile/src/hooks/useEatNext.ts
# Extended during execution — the builder's new home, its two pinning test
# files, and this plan doc. See "⚠️ Execution amendments → Task 10".
git add mobile/src/lib/eatNext.ts mobile/src/lib/__tests__/eatNext.test.ts \
        mobile/src/lib/__tests__/stockState.test.ts \
        docs/superpowers/plans/2026-07-29-nutrition-inventory-loop.md
git commit -m "feat(nutrition-os): Eat Next surfaces receive live stock signals"
```

---

### Task 11: Delete the dead client copies + comment cleanup sweep

**Before starting, read the "Deliberately routed to Task 11" lists in "⚠️ Execution amendments"** (under `### Task 5`, `### Task 6` and `### Task 7`). They are this task's real backlog — the uncapped/unscrollable "Expiring soon" section, the duplicate-location restock rows, the two synthetic literals hand-writing the mirrors, the `expiration_date` sort key and `formatExpirationDate`'s UTC parse, the `location: null` vs `"pantry"` disagreement on single-location saves, and the four sibling numeric fields that still validate and write with mismatched parsers (a straight reuse of Task 6's `parseQuantityInput`). One item in the Task 6 list is explicitly **not** a Task 11 fix — the integer-vs-continuous-units schema question — and is recorded there as an open product decision only. The greps below are the mechanical half only.

> **⚠️ Two comment-sweep boundaries, both from Task 7 — this task runs BEFORE Task 12 (apply).**
> 1. **Do NOT remove the four "before Task 12's reconcile" hedges** (`foodInventoryMatchService.ts`'s two docstrings, `MealsScreen.tsx`'s refund-arming comment, and — added by Task 8 — the `⚠️ Until the Phase 4 reconcile runs` paragraph in `mealLibrary.ts`'s `fetchMealLibrary`). They are **still true** when this sweep runs and only become false after the migration applies. **Task 13 Step 2b owns their removal** and names all four sites.
> 2. The Phase 2 divergence comments this sweep might otherwise hunt for are **already updated by Task 7** — do not re-edit them.

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

> ## 🛑 Before the gate opens: DO NOT EDIT-AND-SAVE ANY INVENTORY ITEM
>
> **From the moment a Task 5/6 bundle is on the phone until this migration is applied, saving a single-location item destroys its stock — permanently.**
>
> Almost certainly **most single-location items have zero location rows today** (evidence in "⚠️ Execution amendments → Task 6": the Feb-2025 backfill only seeded items with `location IS NOT NULL`, and every app write path since gated location-row creation on `storage_type === 'multi-location'`). Task 5 made every reader project Σ location rows, so those items already render **`Qty: 0` / out of stock** in the grid, the detail view and the edit screen. Task 6 then makes a save write what the screen shows: one location row at `0`, plus `fi.quantity` resynced to `0`. **The legacy number is the only copy, and the save overwrites it.** There is no undo short of the Step 2 snapshot, which does not exist yet at that point.
>
> ~~What still works meanwhile: **consumption via the Meal Library**. `mealLibrary.ts:105-108` falls back to `r.quantity` when an item has no location rows, and `consume_inventory_units` takes its legacy branch for the same reason — so logging a meal from the library still decrements a zero-row item.~~ **No longer true as of Task 8 — see the second narrowing below.** What remains true unconditionally: **logging a meal is never blocked on either path**, and no meal-logging path writes anything destructive to an item.
>
> **⚠️ Narrowed by Task 7 — the barcode path no longer participates.** `findInventoryMatchByBarcode` used to gate "Use from pantry" on `food_inventory.quantity`; as of Task 7 it projects Σ location rows with **no legacy fallback** (deliberately — the fallback is the divergence this phase removes). So for a zero-row item, scanning its barcode now shows the pantry toggle **off and disabled**, where before the gate it read the cache and worked — and the line beside it (`FoodPreviewModal.tsx:387`) reads **"0 {unit} · {name}"**, since that string renders the same projected number the gate uses. Both halves are the same one-line change and both revert to normal when section A seeds the rows. Conversely, the §1 canary (legacy `0` / locations `60`) now reads **"60 …"** with a working toggle, which is the defect this task fixes. Non-destructive: the meal still logs in full, the item's stock is simply not decremented, and nothing is overwritten — so unlike the edit-save hazard above there is no data to lose and no need to avoid the flow. It is a *functional* gap for the exposure window, and it closes wholesale the moment section A seeds the canonical rows. One more reason the sequencing note at the end of this task matters: this widens the pre-gate cost from "display and edit-save" to "display, edit-save, and barcode-path pantry decrements".
>
> **⚠️ Narrowed again by Task 8 — the Meal Library path no longer participates either, and NO decrement path is left for a zero-row item.** Task 8 removed `mealLibrary.ts`'s `r.locations.length > 0 ? … : r.quantity` fallback, so `fetchMealLibrary` now projects Σ location rows with no fallback — exactly like Task 7 did to the barcode path, and for the same reason. Trace: a zero-row item gets `totalQuantity: 0` → `resolveInventoryMatches` drops it (`inventoryResolution.ts:43` gates even the *terminal barcode* branch on `> 0`, and `:33` excludes it from the concept candidates) → its id is never in `matches`, so never in `requestedIds` (`mealLibrary.ts`, `logMeal`) → **`consume_inventory_units` is never called for it**, and the legacy `else` branch that used to decrement `fi.quantity` (`20260729100100:64-70`) is now unreachable from every app path. User-visible: no "In stock" badge and the item appears in MealDetail's `Missing:` list; the meal still logs in full, with `uses_inventory: false` on the row.
>
> **Assessment — the largest pre-gate functional gap of the phase, but still not a data hazard.** Nothing is written to the item, nothing is overwritten, and the log itself is complete and correct. **But it is not merely cosmetic like the barcode narrowing:** before Task 8 a meal logged from the library *did* take a unit off `fi.quantity`, and that decrement was preserved by the reconcile (section A seeds the canonical row **from** `fi.quantity`). Now those consumptions are not recorded anywhere, so **every unit eaten between this bundle landing and the apply is invisible to section A** — the reconcile will seed each affected item at a stale, too-high number, and the owner's pantry will over-report by exactly the units consumed in the window. Nothing detects or corrects that afterwards. It is a *silent, accumulating, un-auditable* count drift, unlike the barcode gap which simply did nothing. **Restoring the fallback is still the wrong fix** — it re-arms the divergence Phase 4 exists to close, and the drift is bounded by elapsed time whereas the divergence is permanent. **The right fix is to shorten the window**: this is now the strongest of the three arguments for the sequencing recommendation at the end of this task. Pre-gate cost is now "display, edit-save, barcode-path decrements, **and Meal-Library decrements**" — i.e. **no inventory decrement happens at all** for zero-row items until section A runs. If the window has been long, expect to correct a few quantities by hand after the apply.
>
> **The fix is this migration.** Spec §6.1(3) — in the file, **section A** (`20260730100000:40-61`), which loops over *every* single-location item, not only ones with rows: for a zero-row item the `loc_total > quantity` guard passes trivially (`0 > n` is false), the `delete` is a no-op, and it inserts one canonical row at `fi.quantity` / `coalesce(fi.location,'pantry')`. Wholesale, for the entire class. Nothing needs doing by hand.
>
> ### The two warnings in this task point in opposite directions — both are true
>
> They are about different bundles on either side of the apply, so read them as one rule:
>
> | | Before the apply | After the apply |
> |---|---|---|
> | **Pre-Task-6 bundle** (old code, writes `quantity` directly) | Safe — this is today's behaviour | ❌ **Step 3's warning:** re-breaks the invariant the reconcile just established |
> | **Task 6 bundle** (writes location rows) | ❌ **This warning:** zero-row items save as `0` and lose their stock | ✅ The only safe combination |
>
> **One rule that covers both: do not save an inventory item until the Task 6 bundle is loaded AND this migration is applied.** The exposure window is real elapsed time on the owner's phone, not repo state — see the sequencing note at the end of this task.
>
> ### Second, narrower pre-gate hazard: a failed save can *block* this apply
>
> Different class from the zero-row one above, and non-destructive — but it stops the migration rather than being fixed by it. If `replaceItemLocations`' insert **succeeds** and its cache resync then **fails** (`inventory.ts:145-158`), a single-location item is left holding `Σ locations = N` against a stale, smaller `fi.quantity`. Section A's destroy-guard (`20260730100000:51-53`) fires on exactly `loc_total > quantity`, raises `Refusing to destroy stock…`, and **rolls back the entire migration**. Only reachable at all because single-location saves now write location rows — before Task 6 they never did.
>
> Narrow window (it needs the second of two consecutive requests to fail) and nothing is lost, but the consequence is that the apply refuses until the item is reconciled by hand. Unlike the zero-row class, **Step 1b's classifier does catch this one** — it surfaces as `STOCK DESTROYED`, whose existing decision rule already says STOP and reconcile. So the pre-flight will tell you; this note exists so that when it does, you recognise a failed save rather than assuming the historical stale-row class.
>
> **Narrower than it first looks: this is reachable from an edit-save only, never from an add.** `food_inventory_locations.food_inventory_id` is `REFERENCES public.food_inventory(id) ON DELETE CASCADE` (`20250217000003:13`), and Task 6's create path deletes the item row it just created whenever the location write throws — so the cascade takes the freshly-inserted location rows with it and a failed *create* leaves nothing at all behind, not even this state. Only the update path, which must not delete the pre-existing item, can leave it.

- [ ] **Step 1: Pre-flight (read-only).** `npx supabase migration list` → exactly `20260730100000_inventory_locations_truth` pending (Phase 3's `20260729110000` must be APPLIED — else the merge-order precondition was violated; stop). Then run every query block in 1a–1c below **verbatim**, in order, and capture their full output.

  **1a. Measure the single-user assumption.** The reconcile picks its target with `select id from auth.users limit 1` — no `ORDER BY`, so with more than one user row the choice is arbitrary. The consequence is not a crash but a *silent no-op*: if the wrong user is picked, A/B/C touch nothing, assertion D passes **vacuously over zero rows**, the closing notice reads `canonicalized: 0, resynced: 0`, and the apply is green while nothing was reconciled.

```sql
-- READ-ONLY. Does the single-user assumption the reconcile relies on hold?
select (select count(*) from auth.users)              as auth_user_count,
       (select id from auth.users limit 1)            as reconcile_target_user,
       (select count(*) from public.food_inventory
         where user_id is distinct from (select id from auth.users limit 1))
                                                      as items_outside_target;

-- READ-ONLY. Location rows whose owner differs from their item's owner.
select count(*) as cross_user_location_rows
from public.food_inventory_locations l
join public.food_inventory fi on fi.id = l.food_inventory_id
where l.user_id is distinct from fi.user_id;
```

  **🛑 STOP if `auth_user_count <> 1`, or `items_outside_target > 0`, or `cross_user_location_rows > 0`.** The first two mean the reconcile would skip real data while still reporting success. The third is subtler and worth spelling out: **nothing at the schema level ties `food_inventory_locations.user_id` to its item's owner** — it is an independent `NOT NULL REFERENCES auth.users(id)` with no constraint linking it to `food_inventory.user_id`. Where the two diverge, the migration and the app disagree about Σ locations: the migration runs as owner with **RLS bypassed** and sums every row, while the app reads under **RLS enforced** and sees only rows matching `auth.uid()`. Assertion D would pass over data the app renders as broken.

  **1b. The classified divergence table.** Read this table only **after 1a confirms a single user** — it is deliberately unscoped, and the migration is not (it filters `fi.user_id = v_user_id`). The two agree only because 1a stops the run unless there is exactly one user, so the ordering of 1a before 1b is load-bearing, not cosmetic. This is the query that decides whether the apply may proceed. It must carry `storage_type` per item, because the reconcile's winner rule branches on it (spec §4) and the two branches move stock in opposite directions — and it must *classify* rather than just report, because the lossy cases are not all visible as a nonzero `difference`.

```sql
-- READ-ONLY. Everything section A of the reconcile will overwrite, classified.
select
  fi.id, fi.name, fi.storage_type,
  fi.location                                                            as item_location,
  fi.quantity                                                            as legacy_quantity,
  coalesce(sum(l.quantity), 0)                                           as locations_sum,
  coalesce(sum(l.quantity), 0) - fi.quantity                             as difference,
  count(l.id)                                                            as location_row_count,
  coalesce(sum(l.quantity) filter (where l.is_ready_to_consume), 0)      as ready_sum,
  coalesce(sum(l.quantity) filter (where not l.is_ready_to_consume), 0)  as storage_sum,
  string_agg(distinct l.location, ',' order by l.location)               as row_locations,
  case
    when coalesce(fi.storage_type, 'single-location') <> 'single-location' then null
    when coalesce(sum(l.quantity), 0) > fi.quantity                     then 'STOCK DESTROYED'
    when count(l.id) > 1
      or coalesce(sum(l.quantity) filter (where not l.is_ready_to_consume), 0) > 0
                                                                        then 'STRATA COLLAPSED'
    when count(l.id) = 1 and coalesce(fi.location, 'pantry') <> min(l.location)
                                                                        then 'LOCATION MOVED'
  end                                                                    as section_a_effect
from public.food_inventory fi
left join public.food_inventory_locations l on l.food_inventory_id = fi.id
group by fi.id, fi.name, fi.storage_type, fi.location, fi.quantity
order by (case
  when coalesce(fi.storage_type, 'single-location') <> 'single-location' then 3
  when coalesce(sum(l.quantity), 0) > fi.quantity                        then 0
  when count(l.id) > 1
    or coalesce(sum(l.quantity) filter (where not l.is_ready_to_consume), 0) > 0 then 1
  when count(l.id) = 1 and coalesce(fi.location, 'pantry') <> min(l.location)    then 1
  else 2 end),
  abs(coalesce(sum(l.quantity), 0) - fi.quantity) desc, fi.name;
```

  Decision rules, by `section_a_effect`:

  - **`STOCK DESTROYED` → STOP.** Section A makes the legacy column win for single-location items: it deletes their location rows and re-inserts one row at `fi.quantity`. Where the rows hold more than the legacy column, the excess is destroyed **irreversibly**. As of the Task 3 amendment the migration itself now refuses this case (`raise exception`, whole file rolls back), so a missed row fails loudly rather than silently — but the query is still how you find out *before* burning an apply attempt. Two distinct populations land here, and the remediation differs: the historical stale-row class below, and — see the second banner at the top of this task — an item whose recent single-location save had its cache resync fail after the location insert succeeded, which needs only the cache corrected. This generalizes past the one known canary to the entire "the edit flow never cleaned up stale location rows" class the spec describes in §1: `migrate_single_location_items()` (20250217000003) seeded location rows for single-location items in Feb 2025, and every subsequent single-location edit wrote only `food_inventory.quantity`, leaving those rows frozen. Any item edited *downward* since then carries stale rows above its legacy number. The count is unknown until this query runs — do not assume it is one, and do not assume it is zero.
  - **`STRATA COLLAPSED` → surface to the owner, get an explicit acknowledgement, then proceed.** Spec-prescribed but lossy. The item has either multiple location rows or a not-ready (storage) stratum; section A merges all of it into **one row, `is_ready_to_consume = true`**. The unit total is preserved — this is not stock loss — but the ready/storage split and the per-row breakdown are gone for good. Read `ready_sum`, `storage_sum` and `row_locations` to see exactly what is being flattened.
  - **`LOCATION MOVED` → surface to the owner, get an explicit acknowledgement, then proceed.** Also spec-prescribed but lossy. The item has exactly one location row whose `location` differs from `coalesce(fi.location, 'pantry')`, and section A's canonical row takes the *item's* location. So e.g. a single `freezer` row on an item whose `fi.location` is null becomes a `pantry` row. Quantity is preserved; where it lives is rewritten.
  - **`null` → nothing to review** *as far as section A's overwrite behaviour goes*. Either a multi-location item (untouched by A), a single-location item already in canonical shape, **or — and the classifier cannot distinguish this — a single-location item with no location rows at all.** Every arm evaluates false for a zero-row item (`sum` is `0`, not `> fi.quantity`; `count(l.id)` is `0`, so neither `> 1` nor `= 1`), so it lands in `null` alongside the genuinely-fine items. That is correct about the migration — section A *seeds* those items rather than overwriting anything (the `delete` hits nothing, the `insert` creates the row), and nothing is lost — but it means this table gives the owner **no signal at all** about the class described in the banner at the top of this task. Measure it explicitly:

```sql
-- READ-ONLY. Single-location items with NO location rows and non-zero legacy stock.
select count(*) from public.food_inventory fi
 where coalesce(fi.storage_type,'single-location') = 'single-location'
   and fi.quantity > 0
   and not exists (select 1 from public.food_inventory_locations l
                    where l.food_inventory_id = fi.id);
```

  **Expect this to be large, and a large number is NOT a red flag — it is NOT a STOP condition.** Section A is precisely its fix, and it seeds rather than destroys. What the number tells you is **how urgent the gate is**: it is the count of items that currently render `0`, and that the banner's "do not edit-and-save" rule is protecting. If it comes back `0`, the banner's hazard does not apply to this database and you can relax about the exposure window; if it comes back in the dozens, apply sooner rather than later.

  **Expected benign case.** The known canary should report `storage_type = 'multi-location'` → `section_a_effect = null`, `legacy_quantity = 0`, `locations_sum = 60`, `difference = +60`. That is the *safe* direction: multi-location items take the locations-win branch, so section C resyncs the cache to 60. This is also the expected shape for **every** multi-location item, because the pre-Task-6 `EditFoodScreen` wrote `quantity: storageType === 'single-location' ? parseInt(quantity) : 0` — it deliberately parked the legacy column at 0 for multi-location items. (Task 6 removed that write; the data it left behind is what this query sees.) A large block of `multi-location` rows with `legacy_quantity = 0` is normal and **not** a cause to stop.

  **1c. Confirm the five views still exist** (expect exactly 5 rows):

```sql
-- READ-ONLY.
select table_name from information_schema.views
 where table_schema = 'public'
   and table_name in ('food_inventory_with_locations','low_stock_items',
                      'out_of_stock_items','expiring_soon_items','shopping_list_active');
```

- [ ] **Step 2: Snapshot before applying (owner-run — this step WRITES).** Section A issues a hard `DELETE` against production. The plan must not silently rely on Supabase PITR being enabled, so take an explicit in-database snapshot first — this is the recovery path if post-verify finds something wrong:

```sql
create table public.zz_backup_fil_20260730 as select * from public.food_inventory_locations;
create table public.zz_backup_fi_20260730  as select id, user_id, name, storage_type, location, quantity
                                              from public.food_inventory;
```

  These are **owner-drops-when-satisfied** — Task 13 carries the reminder. One caveat worth acting on: `create table as` produces tables with **RLS disabled**, and Supabase's default privileges grant `anon`/`authenticated` access to new tables in `public`, so until they are dropped these snapshots are reachable through PostgREST by anyone holding the anon key. Close that immediately after creating them:

```sql
alter table public.zz_backup_fil_20260730 enable row level security;
alter table public.zz_backup_fi_20260730  enable row level security;
revoke all on public.zz_backup_fil_20260730, public.zz_backup_fi_20260730 from anon, authenticated;
```

  With RLS on and **no policies defined**, both tables are readable by the table owner and `service_role` but by nobody coming through the API — which is exactly what a transient snapshot wants. The `revoke` is belt-and-braces on top of that, and earns its place twice over: it survives someone later adding a permissive policy, and it makes PostgREST stop advertising the tables as resources at all, rather than exposing them as always-empty endpoints.

  **Restore path.** If post-verify shows the apply was wrong, this is the undo — do not compose it under pressure:

```sql
-- RESTORE — only if post-verify shows the apply was wrong. One transaction.
begin;
  delete from public.food_inventory_locations;
  insert into public.food_inventory_locations
    select * from public.zz_backup_fil_20260730;
  update public.food_inventory fi
     set quantity = b.quantity
    from public.zz_backup_fi_20260730 b
   where b.id = fi.id and fi.quantity is distinct from b.quantity;
commit;
-- Then, to make the migration re-appliable:
--   npx supabase migration repair --status reverted 20260730100000
```

  Why each part is safe, and what it does *not* cover:

  - **The unqualified `delete` is safe.** `zz_backup_fil_20260730` is a full-table copy and it is re-inserted in the same transaction, so the table is never observably empty. Nothing in the repo has an FK referencing `food_inventory_locations.id` (verified repo-wide), so re-inserting the original ids is clean — no dependent rows to orphan or renumber. The `insert … select *` relies on positional column matching, which holds because the migration performs **no DDL** on either table, so the snapshot's column order is still the live order.
  - **Restoring only `quantity` on `food_inventory` is exactly right, not a subset shortcut.** `quantity` is the *only* column the migration writes on that table (section C's resync), and the migration never inserts or deletes `food_inventory` rows — so an `update … from` join restores it completely. The other captured columns (`user_id`, `name`, `storage_type`, `location`) are there so the Step 1 classification can be re-derived forensically after the fact, not because the restore needs them.
  - **A partial apply needs no restore.** The migration file is applied as a single unit (see Step 3), so an aborted apply leaves prod unchanged; running the restore anyway is harmless (the re-insert reproduces identical rows and the `is distinct from` guard makes the update a no-op). The case this restore actually exists for is the *successful* apply that turns out to have been wrong.
  - **It is a data restore, not a migration rollback.** The five dropped views stay dropped and `transfer_inventory_units` stays created. Both are fine — the views are unread, and re-applying later is clean because `drop view if exists` and `create or replace function` are idempotent.
  - **It discards everything since the snapshot.** Restore before resuming normal app use; any meal logged or item edited in between is rolled back to snapshot state. Relatedly, if an inventory item was *deleted* in the app after the snapshot, the re-insert will fail the `food_inventory_id` FK and abort the whole transaction — loudly, which is the right outcome.
  - **The `migration repair --status reverted` line is load-bearing.** Without it the version stays recorded as applied and `db push` will not re-run the file.

- [ ] **Step 3: Apply.** `npx supabase db push --yes`.

  - **Expected output:** one notice line per canonicalized/seeded item + the closing counts; no exception from the guard in section A or from the post-condition assertion.
  - **⚠️ Absent notice output is NOT a failure — and this is unverified.** The Supabase CLI applies migrations through a `pgx.SendBatch` pipeline, and pgx only relays server `NOTICE` messages when an `OnNotice` handler is configured; whether the CLI installs one **could not be confirmed**. So a silent, successful push is expected-possible and proves nothing either way. **Step 4 is the real gate** — do not treat seen-notices as verification, and do not treat missing notices as an error.
  - **Reload the app bundle around the apply.** The reconcile makes `fi.quantity = Σ locations` a live invariant, but the pre-Task-6 `EditFoodScreen` still writes `quantity` directly until **Task 6 is running on the device**. Task 12 runs after Task 6 in the repo; the owner's phone runs whatever bundle is loaded. A multi-location save from a pre-Task-6 bundle re-breaks the invariant minutes after the apply. Reload Metro / rebuild before or immediately after pushing, and **do not save any inventory item from a pre-Task-6 bundle.** (This is the *post*-apply half of the rule; the banner at the top of this task is the *pre*-apply half, and the table there reconciles the two. They are not in conflict — the only safe combination is Task 6 bundle **and** applied migration.)
  - **If the push fails:** re-run `npx supabase migration list` and confirm the version is still **pending** before retrying. If it shows applied, use `supabase migration repair` rather than pushing again. Re-running after a mid-apply abort **should be** safe: the same `pgx.SendBatch` mechanism behind the NOTICE caveat above also appears to batch a migration file into one implicit transaction, so an abort should leave prod byte-identical and the version unrecorded. That is the same class of claim as the NOTICE one and gets the same hedge — but you do not have to take it on faith, because the `migration list` check in the previous sentence confirms it empirically before you retry.

- [ ] **Step 4: Post-verify (read-only).** Every item has ≥1 location row and `quantity = Σ locations` — re-run the §6.1(4) post-condition query (labelled `D` inside the migration), expect 0 violations. The canary's **legacy column and locations sum both read 60** (note: not "both strata" — this plan uses *strata* for the ready/storage split, and the canary is 20 ready / 40 storage; the claim here is about the two *sources of truth* agreeing). `transfer_inventory_units` exists with `authenticated`-only execute. All five views are gone — re-run the Step 1c query, expect **0** rows.

  **If any of these fail, the undo is the restore block in Step 2** — run it before touching the app, then `migration repair --status reverted 20260730100000`.

**📌 Sequencing recommendation (owner's call, not a plan reordering).** This task is numbered 12, but the hazard in the banner above is measured in **elapsed time on the owner's phone**, not in repo position: the exposure window opens the moment a Task 5/6 bundle is loaded and closes only when this migration is applied. Tasks 7–11 do not depend on the apply — they are client-side features and a cleanup sweep, and none of them read or write anything the reconcile touches — so **running Task 12 as soon as the owner is available, ahead of Tasks 7–11, shortens the window to near zero at no cost to those tasks.**

  The tradeoff, stated so the choice is informed: applying earlier means the Step 2 snapshots sit in prod for longer (Task 13 Step 3 drops them only after the on-device checklist passes, which still comes at the end), and Task 13's on-device sweep will exercise Tasks 7–11's surfaces against already-reconciled data rather than against the pre-apply state — which is arguably the more realistic test anyway. Nothing about the apply becomes harder or riskier by moving it earlier. The task order stays as written; this is a note to the owner, not an instruction to renumber.

---

### Task 13: Final verification sweep

- [ ] **Step 1:** `cd mobile && npx tsc --noEmit && npm test` — all suites green (stockState + extended eatNext + all prior).
- [ ] **Step 2 (owner, on device — Metro reload, free `--port`):** list/detail/edit show identical quantities for the same item; restock (both "from store" and location→location) updates instantly and survives refresh with both strata equal; "Use from pantry" now offered on the canary item; multi→single edit leaves exactly one location row (verify via detail view); expiring section lists the right items; Meal Library "In stock" badges + filter; MealDetail missing list; Eat Next top pick prefers an in-stock meal and names an expiring ingredient when applicable; log a meal consuming the canary → quantities drop coherently everywhere.

  **Plus one check added by Task 7's review — the multi-location refund approximation.** On a multi-location item whose **ready row is empty** (so consume must take from a non-ready row), log a meal using it, then **Undo**. The unit comes back to the **ready** row, not the row it left — `20260729100100:96-98` documents this as the deliberate v1 approximation. Σ is conserved and nothing user-visible diverges, so this is a "see it once on real data" check, not a pass/fail gate. Record what you observe; if Σ is *not* conserved, that is a real bug and stops the sweep.

- [ ] **Step 2b: Remove the pre-migration hedges (code, one commit).** **Four** comments (three from Task 7, one added by Task 8 — the fourth site is listed after the original three) describe the *pre-reconcile* world and become false the moment Task 12 applies. **Task 11's sweep runs BEFORE Task 12, so it must NOT remove them** (they are still true when it runs) — that is why they land here instead. Delete the "before Task 12's reconcile / zero-row item projects 0" qualifiers, keeping the surrounding statements, at exactly these four sites:
  - `mobile/src/services/foodInventoryMatchService.ts` — the `findInventoryMatchByBarcode` docstring's "Pre-Task-12 note" paragraph (delete the paragraph entirely).
  - `mobile/src/services/foodInventoryMatchService.ts` — `consumeOneInventoryUnit`'s docstring, the "Where the two still differ … unreachable from the barcode path" sentences. **Keep** the "callers MUST NOT infer / arm on outcome" guidance and the TOCTOU reason — those survive the migration.
  - `mobile/src/components/track/MealsScreen.tsx` — the refund-arming comment's "Not yet identical, though … which is what makes it safe" sentences. **Keep** "arm on outcome, never on intent" and its reasons.
  - **(Added by Task 8)** `mobile/src/lib/supabase/mealLibrary.ts` — in `fetchMealLibrary`, the `⚠️ Until the Phase 4 reconcile runs (Task 12) …` paragraph above `resolutionInventory` (delete that paragraph only). **Keep** the two sentences above it — "Location rows are the ONLY quantity truth … restoring it would re-arm it" is a permanent statement of the invariant and the reason the fallback must never come back.

  After the reconcile the plain claim ("the gate and the RPC read the same truth") is finally literally true, which is what these hedges were waiting on. Full context in "⚠️ Execution amendments → Task 7".
- [ ] **Step 3 (owner):** Once **Task 13 Step 2's** on-device checklist is fully satisfied, drop the **Task 12 Step 2** snapshots — they are a recovery path, not a permanent table, and they hold a copy of the inventory:

```sql
drop table if exists public.zz_backup_fil_20260730;
drop table if exists public.zz_backup_fi_20260730;
```

  Do **not** drop them before the on-device checklist passes; they are the only in-plan undo for section A's `DELETE`, and Task 12 Step 2 carries the restore SQL that consumes them.

- [ ] **Step 4:** Stop. Merge/push are the owner's calls.

---

## Self-review checklist (run after writing, before execution)

- Spec coverage: §5.1 → Task 1; §5.2 → Task 2; §6.1/§6.3 → Task 3; §6.2 → Tasks 5/6; §7 → Tasks 4/7; §8 → Tasks 5/8; §9 → Tasks 9/10; §10 → Tasks 1/2/9/13; §11 → Preconditions; views decision → Task 3; three-copy deletion → Tasks 5/11. No gaps.
- Type consistency: `ItemStockState`/`projectItemStock` (1→4/5/8), `AssemblabilityInventoryRow`/`assessAssemblability`/`MealAssemblability` (2→8/10), `transferInventoryUnits`/`replaceItemLocations` (4→5/6), `EatNextStockInfo`/`stockByMealId` (9→10), `InventoryItemWithState` (4→5).
- Known accepted risks: `replaceItemLocations` is a non-atomic client sequence — ~~reconcile assertion is the backstop~~ **corrected by the Task 4 amendment: there is no backstop.** Assertion D is a one-shot `do $$` block that runs once at apply time; no CHECK, no trigger, no job re-checks the invariant afterwards. What bounds the damage is the failure-path cache resync in `replaceItemLocations` (writes 0, the true Σ locations, so every reader agrees the item is out of stock). The actual cure — an atomic `replace_item_locations` RPC — is **deferred to Phase 5 at a cost of a third migration plus a second owner gate**; see "⚠️ Execution amendments → Task 4". Also: detail/edit routes fetch the whole list (25 rows, one code path — deliberate); `MealLibraryData.inventory` type change is additive but Phase 3's `useEatNext` compiled against the old shape — Task 8 must run `npm test` + `tsc` to prove compatibility.

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

### Task 3

Task 3 landed byte-identical to the plan's Step 1 block (verified by extracting the fence and `diff`-ing it against the written file, not by eye) and was committed as `51cb638`. Since the migration is owner-gated (Task 12) and nothing here is executable in CI, the static analysis *was* the quality gate — no database-connecting command was run at any point, by design. That analysis found one apply-blocking defect in the plan's own SQL and three documentation gaps. The blocker is fixed below and in the Step 1 block above, in the same commit as this amendment; the other three are recorded as deliberate decisions so a future reader doesn't "fix" them.

- **🚨 BLOCKING: the five `drop view` statements were ordered parent-first, which would have aborted the entire migration.** `low_stock_items`, `out_of_stock_items` and `expiring_soon_items` are each defined `FROM public.food_inventory_with_locations` (`20250217000003_add_multi_location_inventory.sql:106`, `:122`, `:130` — they were re-pointed at the aggregate view in that migration, having originally been plain `SELECT * FROM food_inventory` views at `20250209_extend_food_inventory.sql:121,127,135`). The plan dropped the parent `food_inventory_with_locations` **first**, with all three dependents still present and no `cascade`, which raises `2BP01: cannot drop view food_inventory_with_locations because other objects depend on it`. `if exists` does not help — it suppresses *absent*-object errors, not dependency errors. Because `supabase db push` runs the file in a transaction, this would have rolled back **everything**: the reconcile, the RPC, and the grants — a total no-op apply presenting as a hard error at the very last statement, after the owner had already seen the reconcile's `raise notice` output scroll past and had every reason to think it worked. **Fix:** dependents dropped first (`low_stock_items`, `out_of_stock_items`, `expiring_soon_items`), then the parent, then the independent `shopping_list_active`; a comment at the site records the dependency and cites the defining lines. **Deliberately still not `cascade`** — this preserves Phase 3's stance (`20260729110000`: "an unforeseen dependent should fail the apply loudly and roll the whole file back, not be silently taken down with it"). The four-line ordering is exhaustive against the known dependency graph; `cascade` would trade a loud failure on an *unknown* dependent for a silent one.
- **Task 12's pre-flight was an inference, not a measurement — now hardened (see Task 12 Step 1 above).** The spec's §4 winner rule (single-location → legacy wins) and Task 12's post-verify (the canary must read 60) can only both hold if the canary is `multi-location`. Static evidence says it is: `EditFoodScreen.tsx:474` writes `quantity: storageType === 'single-location' ? parseInt(quantity) : 0`, i.e. the app deliberately parks the legacy column at 0 for multi-location items, which is exactly the mechanism that manufactures "legacy 0 / locations 60" and fires *only* for multi-location. Corroborating: spec §1 calls "Use from pantry" **wrongly** disabled on the canary, which requires the owner to be seeing 60 — only true if the item's UI reads locations. But this is inference from client code, and the failure mode if it is wrong is silent, irreversible destruction of real stock (section A would delete the canary's 60 units and re-insert one row at 0; assertion D then passes, because 0 = 0 is internally consistent). **Fix:** Task 12 Step 1 now carries a verbatim read-only divergence query that surfaces `storage_type` per item alongside legacy/locations/difference, plus an explicit abort condition — STOP if any `single-location` item has `locations_sum > legacy_quantity`. This generalizes past the one known canary to the whole stale-location-row class §1 describes; the affected count is unknown until the query runs. The §4 winner rules themselves are unchanged — this measures the blast radius of a deliberate owner decision rather than overriding it.
- **Spec §6.1(1) says "Skip items already in exactly this shape (idempotency)"; the SQL does not implement that skip — kept as-is, deliberately.** Section A unconditionally deletes and re-inserts a canonical row for every single-location item on every run. The end state is correct and *idempotent in effect* — traced explicitly: on a second run, A re-inserts at `fi.quantity`, which run 1's section C already set equal to that same single row's quantity; B's `not exists` then matches nothing (A and B together guarantee ≥1 row per item), so there is **no doubling**; C's `is distinct from` guard makes it a no-op (`v_resynced = 0`); D passes. Idempotent-in-effect is what the file's own header claims and what actually matters for a once-run, owner-gated migration, and a shape-comparison skip is complexity for zero behavioral gain. Known and accepted consequences: location-row UUIDs churn on every run (harmless — `grep -rn "REFERENCES.*food_inventory_locations"` over `supabase/migrations/` returns no matches, so no FK depends on those ids); any `notes` on the replaced rows are dropped, including the `'Migrated from single-location'` marker that `migrate_single_location_items()` wrote; `created_at` resets to now; and one `raise notice` fires per single-location item on every run. Note also that `v_replaced` is a *processed* count, not a *changed* count — a re-run still reports the same nonzero number. Its notice text says "canonicalized", which is accurate. (`v_resynced`, by contrast, comes from `get diagnostics row_count` on an UPDATE whose WHERE includes the `is distinct from` guard, so it honestly counts only caches that were actually wrong and got fixed.)
- **`select id into v_user_id from auth.users limit 1` is non-deterministic without an ORDER BY — recorded as a known single-user limitation.** Additionally, the migration runs as the migration owner, so **RLS is bypassed** and `where fi.user_id = v_user_id` is the only scoping in play. That filter is applied consistently across A, B, C's UPDATE **and** the D assertion, so the block is internally consistent — but it asserts only over the arbitrarily-picked user, and a second user's `food_inventory` rows would be silently skipped by the reconcile *and* excluded from the post-condition. Correct for a single-user app; revisit if the app ever goes multi-user. (Related, and also fine as-is: section A's `delete` has no `user_id` predicate, which is the correct orphan-cleanup behavior here; and section C's `sub` subquery aggregates location rows without a user filter, which only matters in a multi-user world.)
- **`transfer_inventory_units` locks the target row before the source — deadlock-prone in principle, nil risk here.** Two concurrent opposing transfers (A→B and B→A on the same item) could deadlock. The app is single-user with a serial UI, so this is recorded rather than fixed; a fix would mean ordering the two `for update` selects by location id, which buys nothing today.

A second code-quality review then found that the abort condition added above was, on its own, not a real guard — one finding that reframes the owner gate. The remaining bullets are that round; the `.sql` changes among them are a knowing, recorded deviation from the plan's Step 1 SQL (the fence above has been updated to match the landed file).

- **🚨 CRITICAL: assertion D cannot detect stock destruction — by construction — so section A now refuses instead.** D checks `fi.quantity = Σ locations`, but for a single-location item section A has *just written* that sole location row **from** `fi.quantity`. The two sides of the comparison come from the same number, so D is tautologically satisfied for exactly the case it most needs to catch: the canary shape (legacy 0, locations 60) canonicalizes to 0, and D cheerfully confirms `0 = 0`. No post-condition, no post-verify query, and no notice can distinguish "destroyed 60 units" from "was already empty" **after** the delete. That left the entire defense as prose in Task 12 that a human had to remember to run, read, and interpret correctly, before a one-shot irreversible apply. **Fix:** section A's cursor now also selects `loc_total` (`coalesce(sum(quantity), 0)`) and `loc_rows` (`count(*)`) per item via correlated subqueries, and raises before the `delete` when `r.loc_total > r.quantity`, naming the item, its id, the units and row count at risk, and the legacy value. **This enforces rather than overrides spec §4:** it refuses only in the direction Task 12 Step 1 already declares must stop the apply; when `legacy >= locations`, legacy still wins exactly as §4 specifies, and the location row is rewritten upward as before. **Idempotency is preserved** — traced: after a successful run, A leaves one row at `q0 = fi.quantity` and C leaves `fi.quantity = q0`, so on any re-run `loc_total = q0 = r.quantity`, the strict `>` is false, the guard does not fire, and the loop proceeds to reproduce the same state. The guard can therefore never fire on a database the migration itself produced; it only fires on the pre-existing divergence class. (Snapshot note: the `FOR ... IN <query>` cursor is opened once against the transaction snapshot, so `loc_total`/`loc_rows` reflect state *before* the loop's own writes — which is what the guard wants, and is safe regardless because each item's subqueries are scoped to that item's own rows.)
- **The reconcile's per-item notice could not distinguish success from destruction.** The original text printed `r.quantity` — the value being *written* — so a canary being zeroed logged `single-location canonicalized: Boost (qty 0)`, indistinguishable from a genuinely empty item. **Fix:** with `loc_total`/`loc_rows` now in scope from the guard above, the notice reports what was replaced as well as what replaced it: `'  single-location canonicalized: % — % row(s) totalling % replaced by 1 row of % at %'` with `r.name, r.loc_rows, r.loc_total, r.quantity, coalesce(r.location, 'pantry')`. A destructive rewrite is now self-evident in the log even in the counterfactual where the guard were absent. **Verified:** all 11 `raise` statements in the file were machine-checked for format-placeholder count vs. argument count (a mismatch inside the guard would itself be a runtime error, defeating the purpose) — the new 5-placeholder exception and 5-placeholder notice both match their 5 arguments, and the escaped `''` in `Step 1''s` parses as one apostrophe inside the literal without terminating it.
- **Task 12 was materially rewritten — its text now differs substantially from the plan as originally written.** (a) **Step 1a added:** the `auth.users limit 1` non-determinism is measured rather than assumed, with a stop rule on `auth_user_count <> 1`, `items_outside_target > 0`, or `cross_user_location_rows > 0`; the failure mode being guarded is a *silent no-op* (wrong user picked → A/B/C touch nothing → D passes vacuously over zero rows → green apply, nothing reconciled). The cross-user check exists because nothing at the schema level ties `food_inventory_locations.user_id` to its item's owner, and where they diverge the migration (RLS bypassed) and the app (RLS enforced) compute different sums. (b) **Step 1's divergence query (sub-block 1b) replaced with a classifying version.** The previous query had confirmed false negatives: it selected `location_row_count` but nothing said it mattered, and `order by abs(difference) desc` sorted every `difference = 0` row to the *bottom* — so strata-collapse and location-move cases, both of which are lossy at `difference = 0`, were present in the output and invisible in practice. The replacement emits a `section_a_effect` classification (`STOCK DESTROYED` / `STRATA COLLAPSED` / `LOCATION MOVED` / null) and sorts by severity class first. Decision rules: destroyed → stop; collapsed or moved → surface as spec-prescribed-but-lossy and obtain explicit owner acknowledgement, do not stop. (c) **A snapshot step added** — `create table as` backups of both tables before the apply, so the plan carries its own undo instead of relying on PITR being enabled (this is the step that later became Step 2 in the renumbering below). (d) **The apply step gained three operational notes:** absent NOTICE output is a CLI limitation and not a failure (the CLI applies through `pgx.SendBatch` and pgx relays NOTICEs only with an `OnNotice` handler configured — whether the CLI installs one is **unverified**, so post-verify is the real gate); a stale-bundle warning (the invariant is live the moment the migration applies, but `EditFoodScreen.tsx:474` keeps writing `quantity` directly until Task 6 is running *on the device*, so a save from a pre-Task-6 bundle re-breaks it minutes later); and a failed-push recovery note (re-check `migration list` for still-pending before retrying, `migration repair` if it shows applied; re-running should be safe because the file appears to be applied in one implicit transaction — hedged to match the NOTICE claim, since both rest on the same `pgx.SendBatch` mechanism, and confirmed empirically by the `migration list` check either way). (e) **Minor operator-clarity fixes:** "the canary reads 60 in both strata" reworded — this plan uses *strata* for the ready/storage split and the canary is 20 ready / 40 storage, so the intended claim is that the legacy column and the locations sum agree; the "§6.1(D)" citation corrected to "§6.1(4)" (D is the migration's internal label, not a spec section); and a verbatim `information_schema.views` query added for the five-views check in the pre-flight and post-verify steps (expect 5, then 0), which previously asked the operator to confirm something with no SQL to run.

- **Task 12's steps renumbered, and the snapshot given an actual restore.** Two follow-on problems from the hardening above. (i) **`Step 1b` named two different things** — the classified divergence query (a read-only sub-block of Step 1) and the snapshot (a top-level step that *writes*), which made Task 13's "drop the Task 12 Step 1b snapshots" genuinely ambiguous and left the amendment above using one label for both in adjacent clauses. The snapshot could not be folded under Step 1's lettering either, since Step 1 is explicitly "(read-only)". **Fix:** the snapshot is promoted to **Step 2**, apply becomes **Step 3**, post-verify becomes **Step 4**; Step 1 keeps its internal 1a/1b/1c lettering. All back-references were swept by grep rather than by reading — the load-bearing one was inside the apply step, where "**Step 3** is the real gate" pointed at *itself* after renumbering and now correctly reads Step 4; Task 13's cross-task references are now explicitly qualified ("Task 13 Step 2's on-device checklist", "the Task 12 Step 2 snapshots") because bare step numbers are ambiguous across two adjacent tasks. (ii) **The snapshot shipped without a restore.** It was described as "the recovery path" and "the only in-plan undo" while giving no SQL, which asks whoever reaches for it — by definition someone who has just made an irreversible mistake on live data — to compose a restore under maximum pressure. **Fix:** a one-transaction restore added to Step 2, with `migration repair --status reverted 20260730100000` (load-bearing: without it the version stays recorded as applied and `db push` will not re-run the file). Verified against the schema rather than assumed: the unqualified `delete` is safe because nothing in the repo FKs to `food_inventory_locations.id` and the full-table copy is re-inserted in the same transaction; `insert … select *` positional matching holds because the migration performs no DDL; and restoring **only** `quantity` on `food_inventory` is complete, not a shortcut, because that is the sole column the migration writes there and it never inserts or deletes rows. Documented limits: it is a data restore, not a migration rollback (views stay dropped, the RPC stays created — both harmless and idempotent on re-apply); a *partial* apply needs no restore at all and running it anyway is a no-op; and it discards everything since the snapshot, including a post-snapshot item deletion, which will abort the transaction on the `food_inventory_id` FK rather than restore inconsistently. (iii) Also in this round: the snapshot's `enable row level security` is now paired with an explicit `revoke all … from anon, authenticated` (survives a later permissive policy, and stops PostgREST advertising the tables at all rather than exposing empty endpoints); a note that Step 1b is deliberately unscoped while the migration is not, so it may only be read after 1a confirms a single user; and the single-transaction atomicity claim softened to match the NOTICE hedge, since both rest on the same unverified `pgx.SendBatch` behavior.
- **Deliberately not changed, per review:** a dedicated `p_to_location_id is null` guard in `transfer_inventory_units` (current behavior already fails loudly and correctly via the not-found path — only the message is worse), plus the §4 winner rules, the `%rowtype` idiom, the not-`cascade` stance, and the RPC lock ordering.

Explicitly checked and left alone: the `%rowtype` + `if v_to.id is null` no-rows idiom is valid — plpgsql assigns NULL to *all* fields of a record target when `select into` returns no row, and `id` is the PK (`NOT NULL`), so a found row always has a non-null `id`. `found` would be more idiomatic but is exactly equivalent here.

Verification performed (all static, no DB): a dollar-quote-aware parser over the final file reports paren depth 0 at EOF, no unterminated string literals, and 4 `$$` tokens forming 2 correct pairs (DO block, function body, no nesting); every NOT NULL column without a default on `food_inventory_locations` (`20250217000003:11-22`) is supplied by both INSERTs, and `notes` is nullable; there is no unique constraint on `(food_inventory_id, location)` for section A's delete-then-insert to violate — verified **repo-wide**, not just in the defining migration: a case-insensitive `unique` grep across all of `supabase/migrations/` (covering both the `UNIQUE(...)` and lowercase `unique (...)` spellings, and `alter table ... add constraint`) returns no hit mentioning `food_inventory_locations` at all; the nearest neighbours are `food_categories(user_id, name)` (`20250209_extend_food_inventory.sql:47`), `food_inventory_category_map(food_inventory_id, category_id)` and `food_inventory_subcategory_map(food_inventory_id, subcategory_id)` (`20251018014408_food_category_system_fixed.sql:66,76`), and `food_concept_links(concept_id, food_inventory_id)` (`20260728100000_nutrition_preference_schema.sql:29`); the `location` CHECK admits `fridge|freezer|pantry|cabinet` on **both** tables (widened identically by `20250217000004`), so `coalesce(r.location, 'pantry')` always satisfies the target constraint; `storage_type` is `NOT NULL` with a two-value CHECK, making sections A and B exhaustive (a hypothetical third value falls through both and is caught by D); `grep -rn "transfer_inventory_units"` across `*.sql`/`*.ts`/`*.tsx` matches only the new migration (no collision); none of the five dropped views is referenced by any app code, function, or grant — only their own historical definitions, the `20251031000001` `security_invoker` ALTERs, and COMMENTs — so the adopt-or-drop premise holds; and `20260730100000` sorts last among all migration filenames, with Phase 3's `20260729110000` present in the tree.

### Task 4

Task 4 landed byte-identical to the plan's Step 1 block (SHA-matched, and the schema verification behind it was independently re-derived) and was committed as `9f6a4e1`. Since this module does I/O it gets no unit tests — `tsc` plus column-by-column verification against `supabase/migrations/` was the gate, and no database-connecting command was run at any point. A follow-up code-quality review returned "With fixes": no spec drift, but one important defect in the plan's own code plus three narrower ones and a false claim in the plan's own docstring. All five are fixed below and in the Step 1 block above, in the same commit as this amendment.

- **🚨 A partial `replaceItemLocations` failure re-armed the exact legacy-fallback divergence this phase exists to eliminate.** Concrete trace through the plan's original sequence: the delete succeeds → the insert fails → `throw insError` → **the cache update never runs**. Prod is then left with **zero location rows** while `food_inventory.quantity` still holds its old value (say 60), and the three readers disagree: `fetchInventoryWithState` projects over zero rows and reports `isOut: true` (renders **out of stock**); `fetchMealLibrary` (`mealLibrary.ts:105-108`) takes its `r.locations.length > 0 ? … : r.quantity` fallback and reads **60**, leaving "Use from pantry" enabled; and `consume_inventory_units` (`20260729100100:41,64-70`) finds `if exists (location rows)` now **false**, takes the `else` branch, and decrements the legacy column. Spec §3 calls that RPC's legacy branch "a dead-code safety net" — one failed insert makes it live again. The failure does not announce itself either: the UI shows a plausible "out of stock" rather than an obvious error. **Fix:** the cache resync now runs on the failure path too, and — the load-bearing nuance — writes **0**, not `total`. Because the delete has already committed, the true Σ locations after a failed insert *is* 0; writing `total` would swap one divergence for another, leaving the cache claiming stock that no location row backs, which is precisely what re-arms the two legacy readers above. A zeroed item is honest: all three readers agree it is out of stock, the consume RPC's legacy branch reads 0 rather than phantom stock, and the user re-saves. The original insert error is still rethrown, and a secondary failure of the best-effort resync is logged rather than allowed to mask it. Rationale is recorded in-line at both the `const total = insError ? 0 : …` site and the rethrow.
- **Deliberately not fixed — the real fix is an atomic RPC. 📌 DEFERRED TO PHASE 5, and the price rises once Task 12 runs.** Moving delete+insert+resync server-side into a single `security invoker` `replace_item_locations(p_item_id, p_user_id, p_rows jsonb)` would make the whole sequence transactional and retire this entire failure class — the client-side resync below is a damage bound, not a cure. Not done now because it would mean either editing the already-reviewed, owner-gated migration (`20260730100000`) or adding a second one, and both re-gate Task 12: a much larger blast radius than the defect. **Cost if picked up after Task 12 burns the gate: a third migration and a second owner gate** — so this is a scheduled decision, not a floating observation. Phase 5 should either take it or explicitly re-accept the risk. Noted for completeness, since it is the same class: the **insert-succeeds / cache-write-fails** path also leaves a stale cache, but it is not merely benign — it is **self-healing**, and cannot accumulate. The location rows are correct, so `fetchInventoryWithState`, `fetchMealLibrary` and the consume RPC all read locations and agree; and `fi.quantity` is resynced from `sum(locations)` by `consume_inventory_units` (`20260729100100:57-62`), by `transfer_inventory_units` (`20260730100000:153-157`), and by the next successful `replaceItemLocations`. The only reader that sees the stale value before one of those fires is `EditFoodScreen.tsx:59` — the carry-forward at the bottom of this amendment, which is where that path correctly collapses.
- **The docstring's mitigation claim was false, and it was the justification for accepting the non-atomic sequence in the first place.** The plan's docstring read "a mid-sequence failure is visible in the UI and fixed by re-saving; the reconcile assertion also catches drift." It does not. Assertion D lives inside a one-shot `do $$` block in `20260730100000_inventory_locations_truth.sql:90-101`, and migrations run **once**; Task 12 Step 4 re-runs the equivalent query by hand, once, at apply time. There is no CHECK, no trigger, no scheduled job, and nothing in Task 13. **After Task 12 the invariant has no ongoing enforcement at all** — drift introduced on day 3 is permanent and silent. **Fix:** the docstring now states that plainly (one-shot assertion, nothing re-checks afterwards, a failure persists until the item is re-saved) and points at the failure-path resync as what actually bounds the damage. This is a correction to the plan's stated accepted-risk rationale, not just wording: the risk was accepted on the strength of a backstop that does not exist.
- **`location: string` was a type hole that fed directly into the failure mode above.** The `rows` param typed `location` as `string`, but the column carries `CHECK (location IN ('fridge','freezer','pantry','cabinet'))` (`20250217000003:15`, widened by `20250217000004:21`). The repo already had the right type — `FoodLocation` at `mobile/src/types/track.ts:2`. A `location: "garage"` compiled clean and became a runtime `23514` **after the delete had committed**, i.e. straight into the zero-rows/stale-cache state. **Fix:** `location: string` → `location: FoodLocation`, imported alongside the other four types. Costs nothing — Task 6's callers are already `FoodLocation`. **Verified:** a throwaway module passing `location: "garage"` was compiled before deleting it; `tsc` now rejects it with `src/lib/__probe_fix3.ts(3,5): error TS2322: Type '"garage"' is not assignable to type 'FoodLocation'.`, and the same probe with `location: "pantry"` compiles clean.
- **No empty-`rows` guard.** `rows: []` satisfies the cache invariant (0 = 0) while violating the migration's §6.1(4) post-condition that every item keeps **≥1 location row** — and per the correction above there is no downstream backstop to catch it. Caller-side validation does exist (`EditFoodScreen.tsx:416-422` blocks empty `locationEntries` with a specific alert, so Task 6 inherits a good message), but `replaceItemLocations` is the stated owner of this invariant and was not enforcing its half. **Fix:** `if (rows.length === 0) throw new Error("replaceItemLocations: an item must keep at least one location row");` at the top. **The plan's `if (rows.length > 0)` wrapper around the insert was dropped rather than kept** — with the guard above it, that branch can never be false, and a `rows.length > 0` test three lines after a `rows.length === 0` throw actively misleads a reader into thinking the empty case is supported. One statement now owns the question of what an empty array means.
- **The `{ ...r, … }` spread forwarded more than intended.** Excess-property checking only fires on fresh object literals, so passing existing `FoodInventoryLocation` rows type-checks, and the spread would forward their `id`, `created_at` and `updated_at` into the insert — a "duplicate this item's locations" caller would insert with the *source* rows' primary keys. **Fix:** the four intended fields are listed explicitly (`location`, `quantity`, `is_ready_to_consume`, `notes`), with `notes: r.notes ?? null` normalizing the optional param's `undefined` to the nullable column's `NULL`.

Assessed and deliberately left alone, so a future reader does not "fix" them: `throw errors[0]` with `errors.slice(1)` logged (`PostgrestError extends Error`, the predicate narrows correctly, `.error` is never `undefined` — every error surfaces somewhere); `InventoryItemWithState extends FoodInventoryItem` re-exposing `quantity` (**keep it** — it is what makes Task 5's drop-in assignability compile); the three `total_quantity`/`ready_quantity`/`storage_quantity` mirrors (assigned from `state.*` one line apart, cannot drift by construction — Task 11 cleanup); and the auth-check UX delta, the missing `.order()`, and the O(n·m) per-item filtering.

**Verified after the fixes:** the Step 1 fence above was updated in place and confirmed byte-identical to the landed file by extracting the fence and `diff`-ing it, not by eye (`diff` exit 0). The Task 5 drop-in property was re-proved after FIX 3/5 touched the module's types — a throwaway `(x: InventoryItemWithState): FoodInventoryItemWithCategories => x` compiles clean, then deleted. Both probes left no residue. Final state: `tsc --noEmit` 0 errors, 9 Jest suites / 231 tests passing (unchanged — this module has no unit tests by design).

**Carry-forward, required in Task 6 (see the caution added to that section):** `EditFoodScreen.tsx:59` seeds its editable quantity from `useState((item.quantity ?? 0).toString())` — the legacy cache, not the projection. Once Task 5 feeds it an `InventoryItemWithState`, the truth is `item.state.totalQuantity`. On the one path where they diverge, the edit screen shows the stale cache and "fixed by re-saving" then writes that stale number back as canonical truth, laundering drift into the location rows and inverting the mitigation this module depends on.

### Task 5

Landed as `2056ef0` (implementation) + this commit (review fixes + amendment). Steps 1, 2 and 4 went in essentially as written; Step 3 contained a plan defect, corrected in place above. The optional detail-side retype in Step 4 was taken, so all four annotations moved at once and Task 11 inherits no type plumbing. Spec-compliance review passed; a code-quality review returned "With fixes" with one blocking item. No database-connecting command was run at any point. Gates on the final tree: `tsc --noEmit` 0 errors, 9 Jest suites / 231 tests green, no test file touched (these are React screens — the suite covers pure TS libs only, by design).

**🚨 PLAN DEFECT — Step 3's "keep the optimistic local-state update … exactly as they are" would have shipped a silently broken restock.** The instruction was written before Step 1 retyped the grid to read `item.state.*`. Following it literally leaves the optimistic row's `state` holding pre-restock numbers while only the legacy mirrors advance, and nothing repairs it: `fetchInventory()` is called from exactly four places — mount (`:104`), pull-to-refresh (`:124`), the delete-failure revert (`:163`) and the restock-failure catch (`:348`) — so there is **no success-path refetch**. The user would see a "Success" alert over a tile whose quantity had not moved and whose Low Stock / Restock Fridge badges still showed the pre-restock state, until they happened to pull to refresh. **Fix:** the callback now rebuilds the row with `projectItemStock` over `updatedLocations` and assigns `state` plus all three mirrors from it — the same non-duplicating spelling Step 4 prescribes for the synthetic literals, and it keeps quantity math in exactly one place. Step 3's text above is corrected rather than left standing.

- **Dropping the `sourceLocation === "store" ? item.total_quantity + quantity : item.total_quantity` special case — recorded accurately, because the review round's stated reason does not hold.** The review justified the removal as preventing a double-count. It does not: traced on both paths, the old expression and the projection agree exactly. Fridge(ready)=1, pantry=10, restock 3 — from store, old expression gives `11 + 3 = 14` and the projection over `[fridge 4, pantry 10]` gives 14; location→location, old gives `11` and the projection over `[fridge 4, pantry 7]` gives 11. They cannot diverge, because after Task 4 `item.total_quantity` is itself assigned from `state.totalQuantity` = Σ locations, so `item.total_quantity + quantity` and Σ `updatedLocations` are two spellings of the same number. The branch was **dead compensation, not a live bug**: it existed because single-location `total_quantity` used to come from the legacy column, and single-location items cannot even reach this handler (`needsFridgeRestock` is `!single && …`, so "Restock Fridge" never appears for them). The real reasons to delete it are that it encodes "locations are not the truth here", which is the exact invariant this phase establishes, and that Task 11 deletes `total_quantity` — at which point the expression stops compiling. Left in the record so a future reader does not go looking for a double-count that was never there.
- **The dead `supabase.auth.getUser()` in `handleRestockConfirm` was removed, along with the two routes' "You must be logged in" checks.** After the RPC swap `user` had no remaining consumer in the handler; the route checks died with the inline fetches Step 4 deletes. Behaviour delta: a logged-out user previously got a silent no-op, and now gets the RLS failure through the existing error alert. Consistent with the auth-check UX delta already accepted for `fetchInventoryWithState` in the Task 4 amendment, and unreachable in practice — a logged-out list is empty, so there is no item to long-press.
- **`handleViewItem` was extracted.** Step 2 says to reuse "whatever the long-press 'View' action calls", but no such function existed — `router.push` to the detail route was inlined in the action sheet and again on the grid tile. Hoisting it gave the expiring rows the one navigation path Step 2 asks for instead of a third copy. No behaviour change.

**Review-round fixes (this commit):**

- **🚨 FIX 1 (blocking) — `RestockModal` offered a source the RPC now rejects.** `availableSources` (`RestockModal.tsx:49-54`) was built from every location with `quantity > 0`, **including** the `is_ready_to_consume` row that `FoodInventoryScreen` picks as the transfer target — and "Restock Fridge" only appears when `needsFridgeRestock` fires, which is satisfiable with `readyQuantity > 0`, so the target was selectable on exactly the items where the action is offered. Concrete break: fridge(ready)=1, pantry=10, `fridge_restock_threshold`=2 → long-press → "Restock Fridge" → select **Fridge** → qty 1 → Confirm → `sourceLocationId === targetLocation.id` → the RPC raises `source and target locations must differ` (`20260730100000:125-127`) → generic "Failed to restock item" + full refetch. The preview panel actively invited it, rendering two contradictory rows for the same location (Fridge 1→2 *and* Fridge 1→0) with Total Inventory unchanged. Pre-existing in origin — the old client fired two UPDATEs at the same row id and let last-writer-win corrupt the quantity silently — so the RPC swap is strictly safer, but it converted a silent corruption into a hard user-visible failure on an offered option. **Fix:** `targetLocation` is hoisted above `availableSources` and the target row is excluded from it. **Extended beyond the prescribed fix in two places, because the prescribed one is necessary but not sufficient:** there is no `UNIQUE (food_inventory_id, location)` constraint (`20250217000003:11-21`) and `EditFoodScreen` does not dedupe `locationEntries`, so an item can legitimately hold two rows in the same location — and both `getSourceQuantity` and `handleRestockConfirm`'s source lookup resolve by location *name*, so either could still land on the target row. Both now carry the same `&& loc.id !== targetLocation?.id` clause. With all three in place `sourceLocationId !== targetLocation.id` is guaranteed, so the RPC's "must differ" can no longer be reached from this path; if the target is the only row at the chosen location, the lookup falls through to the existing "Could not find source location" alert instead of a generic RPC failure.
- **FIX 2 — the optimistic callback re-derived the source row instead of using the id it already had.** `item.locations.find(l => l.location === sourceLocation)` ran once per row inside the `.map`, and against a *different array* (`prevItems`' rows) than the lookup that fed the RPC (`restockingItem.locations`), so a refetch landing between modal-open and confirm could decrement a different row than the server did. Vanishingly unlikely in a serial single-user UI, and the shape predates this task. Now `loc.id === sourceLocationId`. The `sourceLocation !== "store"` guard was dropped with it: `sourceLocationId` is `null` on the store path and no row id equals `null`, so the branch is inert without one.
- **FIX 3 — the optimistic object now carries `quantity`.** The RPC resyncs `food_inventory.quantity` to Σ locations (`20260730100000:153-157`), but the returned row left `quantity` at its pre-restock value, so the in-memory row held two truths until the next fetch. Nothing reads it today (zero hits in `FoodInventoryScreen`; `RestockModal` reads only `total_quantity`) — but it is precisely the divergence class this phase exists to kill, and Task 11 deletes the mirrors while `quantity` survives. Now `quantity: state.totalQuantity`.
- **FIX 4 — `restockingItem` retyped to `InventoryItemWithState`.** It was still `FoodInventoryItemWithLocations | null`, which erased `state` at that boundary and left two idioms side by side in one file. `RestockModal`'s prop type accepts the wider type unchanged. This retired the file's last use of `FoodInventoryItemWithLocations`, so that import was dropped too.

**Deliberately routed to Task 11 rather than fixed here:**

- **The pinned "Expiring soon" section is uncapped, unscrollable, and expired items never age out — PLAN DEFECT in Step 2's markup, which landed byte-faithful.** The `"expired"` band has no lower bound, so an in-stock item that expired six months ago stays pinned forever, permanently squeezing the grid; worst case is ~25 rows of chrome above the content. Fix with a cap plus "+k more", or a `maxHeight` with internal scroll. Recorded here so the sweep amends plan-prescribed markup with a trail rather than silently.
- **Two rows in the same location are indistinguishable in the restock source list.** FIX 1 stops the target from being offered, but the radio list is keyed by location *name*, so a second stocked row in the same location renders a duplicate React key and only the first is reachable. The real fix changes `onConfirm`'s contract from `FoodLocation | "store"` to a location id, which ripples into `handleRestockConfirm` — too wide for a review round.
- **The two synthetic literals hand-write the mirrors** (`add.tsx:57-59`, `preview.tsx:69-71`) three lines above the `projectItemStock` call that derives the same numbers. Self-resolves when Task 11 deletes the mirrors.
- **Already queued, restated so they are not lost:** the grid sort keys off raw `expiration_date` rather than `state.daysLeft` (proven ordering-equivalent, but §8's letter), and `formatExpirationDate`'s "later" branch still does `new Date("YYYY-MM-DD").toLocaleDateString(…)`, a UTC parse that renders the previous calendar day in negative-offset timezones.

**User-visible deltas, all intended:**

- **Expiration labels can shift by one day — a fix, not a regression.** The shipped code did `Math.ceil((UTC-midnight − local-now) / 86_400_000)`, which overstates the remaining days for most of the day in negative UTC offsets; an item expiring today read "Exp: 1d left" until late afternoon, and by evening the same arithmetic tips it to "Expired". `stockState`'s local-noon whole-day math is correct. Copy strings and colours (`#EF4444` expired, `#F59E0B` today/soon) are otherwise byte-identical.
- An unparseable `expiration_date` previously rendered "Exp: Invalid Date" and now renders no expiration line. Unreachable with a real `DATE` column.
- `Qty:` and the low-stock / restock-fridge badges now read Σ location rows for single-location items instead of `food_inventory.quantity`. That is the point of the phase; the two agree only after Task 12's reconcile runs, so items whose cache and location rows disagree will display differently before the gate opens.
- Over-transferring now fails loudly (`insufficient stock in source location`) instead of silently writing a negative location quantity.
- Dropping the client's explicit `updated_at` writes on location rows is a no-op: a `BEFORE UPDATE` trigger maintains the column (`20250217000003:66-70`).

### Task 6

Steps 1 and 2 landed as written except for the two spellings corrected in place above; Step 3 required no change. No database-connecting command was run at any point; the schema claims below are grep evidence from `supabase/migrations/`, not a live query. Gates on the final tree: `tsc --noEmit` 0 errors, 9 Jest suites / 231 tests green, no test file touched (`EditFoodScreen` is a React screen — the suite covers pure TS libs only, by design). Both storage-type branches now build one `locationRows` array before the `isNew` fork and hand it to a single `replaceItemLocations` call per path, so single-location saves leave exactly one row, multi-location saves leave one row per entry, and a multi→single flip leaves exactly one row with no orphans.

**🚨 PLAN DEFECT — "Remove `quantity` from `itemData` entirely" breaks item creation outright.** `food_inventory.quantity` is declared `quantity INTEGER NOT NULL CHECK (quantity >= 0)` with **no default** (`20250206_tracking_tables.sql:14`, re-declared identically at `20250208_complete_tracking_schema.sql:84`; no later migration does `ALTER COLUMN quantity … SET DEFAULT` or `DROP NOT NULL` — the only `DROP NOT NULL`s in the tree are on `food_categories.user_id`, `exercises.*` and `workout_exercises.target_sets`). An `INSERT` omitting the column therefore fails `23502 not-null violation` before the item row ever exists, so `replaceItemLocations` never runs and *every* add — barcode or manual — is dead. The `UPDATE` path is unaffected: omitting a column there simply leaves it alone, which is exactly what Step 2 wants. **Deviation taken:** `quantity` is gone from the shared `itemData` literal as the plan says, and the create path re-supplies it at the call site as `.insert({ ...itemData, quantity: 0 })`. **`0`, not `parseInt(quantity)`** — this is the load-bearing part, not a shortcut. The seed is only alive for the moment between the item insert and the `replaceItemLocations` that immediately overwrites it, and if that call fails the item is left with zero location rows; a `0` cache alongside zero rows is the state every reader agrees on, which is precisely the damage bound `replaceItemLocations` chose for its own failure path (see "→ Task 4"). Seeding the user's typed quantity instead would leave a cache claiming stock no location row backs — re-arming `mealLibrary`'s `locations.length > 0 ? … : r.quantity` fallback and the consume RPC's legacy branch, i.e. the exact divergence this task exists to close. Rationale is recorded in-line at the `.insert()`.

- **Step 3 — the add flow needed no change, confirmed by reading it.** `app/(tabs)/track/food-inventory/add.tsx` has no insert of its own: it builds a synthetic `newItem` literal and renders `<EditFoodScreen item={newItem} isNew />`. Its local `handleSave` is only the `onSave` navigation callback (`router.replace` to the new item's detail route); the actual write is `EditFoodScreen`'s shared `handleSave`. So the file is not in this commit, and the plan's `git add` line naming it was left unstaged rather than committed empty.
- **`isReady` → `isReadyToConsume`.** Step 2's `.map` used a field that does not exist on `LocationEntry` (`edit-food/constants.ts:14-20`); with the untyped supabase client this would have inserted `is_ready_to_consume: undefined` on every multi-location row had `replaceItemLocations` not been typed. It is, so `tsc` caught it.
- **The caution's required change landed:** `useState((item.quantity ?? 0).toString())` → `useState(item.state.totalQuantity.toString())`, with the reason in-line. Task 5's retype made `item.state` resolve with no plumbing needed here.
- **The multi-location branch's empty-`locationEntries` guard was left exactly as it was** (`:417-423`), per the Task 4 amendment: it is the user-facing message, and `replaceItemLocations`'s throw is the backstop behind it.
- **Assessed and deliberately left alone**, so a future reader does not "fix" them: the radix inconsistency between `parseQuantityInput` and the untouched `parseInt(restockThreshold)` / `parseFloat(protein)` neighbours in `itemData` (cosmetic — it would widen the diff for no behaviour change); `EditFoodScreen.tsx`'s overall size and structure; the `.quantity ?? 0` readers in `FoodPreviewModal.tsx:86,396` and `MealsScreen.tsx:567` (Task 7/8 scope); and the `location: null` vs `"pantry"` disagreement, which is routed to Task 11 below rather than merely tolerated. **The `parseFloat`-validates / `parseInt`-writes split was originally listed here as "unchanged, predates this task" — that assessment was wrong and the review round reversed it; see FIX 1.**

**Pre-gate hazard, not introduced here but sharpened by it.** Before Task 12's reconcile backfills location rows, a single-location item can have a non-zero `food_inventory.quantity` and zero location rows. The edit screen now seeds its quantity field from Σ locations, so such an item opens showing `0`, and saving writes `0` as canonical truth. This is the same delta the Task 5 amendment already recorded for the grid ("items whose cache and location rows disagree will display differently before the gate opens"), and it is the correct direction — the alternative is laundering the stale cache into the location rows — but it means **editing inventory between now and Task 12 can zero an item's stock**. Task 12 is the gate for exactly this reason.

**🚨 The paragraph above under-called the size of the class by an order of magnitude — corrected here after review, and this is the most important finding in Task 6.** It was written as an edge case ("a single-location item **can** have…"). It is not an edge case.

- **Finding A — no app-created single-location item has ever had a location row, so the class is essentially all of them.** Three independent legs, all from repo history: (1) `migrate_single_location_items()` (`20250217000003:138-175`) is a one-shot backfill that ran once on 2025-02-17 and seeded **only** items with `location IS NOT NULL`; (2) every app write path since has gated location-row creation on `storageType === 'multi-location'` — `AddEditFoodModal.tsx` at `41c6f76:643,685`, `EditFoodScreen.tsx` at `41c6f76:646`, unchanged all the way to `bdd7fe6`, i.e. the code this task just replaced; (3) `git log -S "food_inventory_locations" -- mobile` returned **11 commits as of `bdd7fe6`** (the pin matters — Task 6's own commits change the occurrence count, so the figure reads 12 from `5d21ce4` and will keep rising; re-run it against `bdd7fe6` to reproduce), **none** of which inserts a single-location row, and no other writer creates rows at all (consume / refund / transfer only mutate existing ones). So the affected class is *every single-location item created by the app since 2025-02-17, plus any pre-existing item whose `location` was null* — in practice, most of the single-location inventory. Post-Task-5 they all project `totalQuantity = 0` and render out of stock; post-Task-6 a save writes `0` into a real location row **and** resyncs `fi.quantity = 0`, destroying the only copy of the legacy number irreversibly. What softens it: consumption is unaffected (`mealLibrary.ts:105-108` falls back to `r.quantity`, and `consume_inventory_units` takes its legacy branch), so the breakage is display + edit-save, not function — and the reconcile fixes the entire class wholesale (spec §6.1(3); in the file it is section A, `20260730100000:40-61`, which loops every single-location item — for a zero-row one the destroy-guard passes trivially, the delete is a no-op and the insert seeds the canonical row). **Written up as a banner at the top of Task 12**, with a table reconciling it against Step 3's opposite-facing pre-Task-6-bundle warning.
- **Finding B — Task 12 Step 1b could not have surfaced this class.** For a zero-row single-location item every arm of the `section_a_effect` classifier evaluates false (`sum` is `0`, so not `> fi.quantity`; `count(l.id)` is `0`, so neither `> 1` nor `= 1`), yielding `null` — "nothing to review" — indistinguishable from an item already in canonical shape. That is *correct about section A's behaviour*, since §6.1(3) seeds rather than overwrites, but it meant the owner would open the gate with no idea how many items were currently rendering `0` and one edit away from permanent zeroing. Step 1b now carries an explicit `count(*)` for the class, flagged **not a STOP condition** — a large number is expected and is the fix's justification, not a red flag; it measures how *urgent* the gate is. Step 1's prose discussed the stale-row half of the §1 story (rows frozen above the legacy value) but never the zero-row half; both are now covered.
- **Task 12 also gained a sequencing recommendation** (owner's call, explicitly not a reordering): the exposure window is elapsed time on the phone, not repo position, and Tasks 7–11 don't depend on the apply — so applying as soon as the owner is available shortens the window to near zero at no cost. Tradeoff stated in place.

**Review-round fixes (third commit):** a code-quality review returned "With fixes" with one serious item. All four are below.

- **🚨 FIX 1 (the serious one) — validating with `parseFloat` while writing with `parseInt` became a deterministic, user-triggerable stock-loss bug.** The split predates this task; its *consequence* is new. Validation used `parseFloat` (`:415`, `:433`), the write used `parseInt` (`:513`, `:519`), and they disagree on inputs typeable on the iOS numeric keypad — which includes `.`. `".5"` passed validation (`0.5 >= 0`) and reached the insert as `parseInt(".5") = NaN` → `{"quantity":null}` → `23502`. **Before this task that was harmless**, because the single-location UPDATE carried `parseInt(quantity)` inside `itemData`, so the item UPDATE failed first and nothing else had run. After removing `quantity` from `itemData` the item UPDATE *succeeds*, and then `replaceItemLocations` deletes every location row, fails its insert, resyncs the cache to 0 and throws. Net: **the user types `.5`, sees "Failed to save item", and the item is now at zero stock with no rows** — repeatable, not a network flake. `"1.5"` was silently truncated to 1, and `"99999999999"` passed validation and overflowed int4 (`22003`). **Fix:** one `parseQuantityInput(raw: string): number | null` helper (`Number` + `Number.isInteger` + `0 <= n <= 2_147_483_647`, with an explicit `raw.trim() === ""` check first because `Number("")` and `Number(" ")` are both `0`), used at both validation sites — and `locationRows` is now **built inside the validation block** rather than rebuilt later, so the numbers that are validated are by construction the numbers that are written. There is no second parse left to disagree. `Number` rather than `parseInt` is deliberate: `parseInt("1.5")` returns 1, accepting a value the user did not type, and `parseInt("12abc")` returns 12. Enumerated against `"" / " " / "0" / ".5" / "1.5" / "-1" / "abc" / "1e3" / "99999999999" / "2147483647" / "2147483648"` by extracting the shipped function from the file and running it, not by reasoning about it. One case the review's table did not list: the old code wrote `parseInt("1e3") = 1` for an input `parseFloat` had validated as 1000 — a 1000× silent under-write, now accepted correctly as 1000.
- **FIX 2 — a failed create left an orphan item, and every retry left another.** Creating used to be one atomic `INSERT`; it is now insert → delete → insert → update, and a failure past the first step strands an item row with `quantity: 0` and zero location rows, which the grid renders as a real out-of-stock product. Combined with FIX 1 that was one junk item per tap. **Fix:** the create path's `replaceItemLocations` call is wrapped so a failure deletes the item row it just created, then rethrows. A failing rollback is logged and never rethrown — the location error is the one the user must see, the same precedent as `replaceItemLocations`' own failed cache resync. **Applied to the create path only**, with the reason stated at both call sites: on the update path the item pre-existed the save, so the same delete would destroy the user's data.
- **The category/subcategory mapping writes that follow deliberately get no rollback, and their failure is benign.** By the time they run the item is already complete and invariant-clean: a real row, ≥1 location row, cache in sync. A failure leaves it merely untagged, and it stays fully reachable — `FoodInventoryScreen`'s "All Products" tab filters on `!item.state.isOut`, not on categories (`:384-386`), and the grid already renders a dedicated `hasNoCategories` badge (`:442`). The user can re-open and re-save to add tags. Rolling back here would be strictly worse: it would delete an item whose stock had been written correctly.
- **FIX 2's rollback has a bonus property, found in re-review:** because `food_inventory_locations.food_inventory_id` is `ON DELETE CASCADE` (`20250217000003:13`), deleting the item also removes any location rows the failed call had already inserted. So a failed create cannot leave the insert-succeeded/cache-resync-failed state either — **FIX 4's Task-12-blocking hazard is update-path-only**, and the runbook note says so.
- **FIX 3 — "Failed to save item" became a lie on the update path, and the lie destroyed the recovery story.** That blanket alert (`:649-651`) was accurate while a single-location update was all-or-nothing. Now a `replaceItemLocations` failure on the update path means the metadata *was* committed and the stock *was* driven to 0 — and the entire value of that damage bound is that the state is recoverable **if the user knows to re-save**. Telling them the save didn't happen throws that away. **Fix:** the update path catches the failure separately and alerts "Stock Not Saved — The item's details were saved, but its stock could not be written and now reads 0. Tap Save again to restore the quantity.", then `return`s without `onSave()`, so the screen stays open with the typed quantity intact and re-saving is one tap. The create path keeps the generic message, which is accurate there now that FIX 2 makes a failed create leave nothing behind. **(The wording quoted above is superseded — the re-review found it accurate in only one of three reachable branches. See the first two re-review bullets below for the shipped copy.)**
- **FIX 4 — a second pre-gate hazard added to the Task 12 banner.** If `replaceItemLocations`' insert succeeds but its cache resync fails, a single-location item holds `Σ locations = N` against a stale smaller `fi.quantity`; section A's destroy-guard (`20260730100000:51-53`) fires on exactly `loc_total > quantity` and **rolls back the whole migration**. Reachable only because single-location saves now write location rows. Non-destructive and narrow (it needs the second of two consecutive requests to fail), but it can block the apply until hand-reconciled. Unlike the zero-row class this one **is** caught by Step 1b — it surfaces as `STOCK DESTROYED`, whose rule already says stop and reconcile — so the note exists to help the operator recognise a recent failed save rather than assuming the historical stale-row class. The `STOCK DESTROYED` decision rule now names both populations.

**Re-review fixes (fourth commit) — "Ready to merge: Yes", three minor copy/doc items:**

- **The failure copy claimed a state that holds in only one of its three reachable branches.** `replaceItemLocations` can throw on the delete (rows and cache **unchanged** — stock fully intact), on the insert (rows gone, cache 0), or on the cache resync after a successful insert (rows at the **new correct** quantity, cache stale). The empty-`rows` throw is unreachable — validation guarantees ≥1 row. "…and now reads 0" was therefore false in two of the three, and in the resync case it told the user they had lost stock they still had. **The prescribed action was right in all three** — re-saving is idempotent and repairs every one of them, including the stale-cache case that is exactly FIX 4's Task-12-blocking state — so only the diagnosis is hedged, never the action: "its stock **may** not have been saved and **may** now read 0. Tap Save again to restore the quantity."
- **"The item's details were saved" overclaimed, and the fix was structural rather than a reword.** The `return` skipped the category/subcategory mapping writes that followed, so a user who edited tags *and* hit a location-write failure lost the tag edits while being told their details were saved. **The mapping block was moved above the `replaceItemLocations` call** instead of hedging the sentence. Clean move — the mappings depend only on `item.id` (the item pre-existed) and `user.id`, and `replaceItemLocations` neither reads nor writes the mapping tables, so there is no ordering dependency in either direction. Two things fall out: the claim becomes literally true, and — because nothing before that line writes a location row — **every earlier failure on the update path now leaves the stock completely untouched**, which is a strictly better failure state than the previous ordering gave. Copy still says "the item's *other* details" so it does not have to enumerate what "details" covers.
- **Finding A's leg-3 figure pinned rather than updated.** It is presented as a reproducible command, and Task 6's own commits change the occurrence count (11 at `bdd7fe6`, 12 from `5d21ce4`), so the citation now names the ref instead of a number that silently rots.

**Deliberately routed to Task 11 rather than fixed here:**

- **The sibling numeric fields still have the validate/write mismatch FIX 1 removed from `quantity` — and `parseQuantityInput` is now sitting right there for reuse.** `restock_threshold`, `fridge_restock_threshold`, `total_restock_threshold` and `calories` (`:539-543`) all still go through a bare `parseInt` with only a truthiness check in front of it. The failure mode differs from the `quantity` one because these columns are **nullable**: `parseInt(".5")` is `NaN`, which serialises to `null`, so a fat-fingered threshold is silently *cleared* rather than rejected. No stock-loss path — they are written in `itemData`, before `replaceItemLocations` runs — which is why this stayed out of Task 6, but it is the same bug class and the fix is a straight reuse of the existing helper at four call sites.
- **`"0x10"` now writes 16 where the old code wrote 0.** `Number("0x10")` is 16; `parseInt("0x10", 10)` stopped at the `x` and returned 0. Not typeable on the numeric keypad (paste only), and the new reading is the more defensible of the two, but it is a behaviour change worth having on record so it is not discovered as a surprise.
- **Open product question, not a Task 11 fix: the quantity columns are integers but half the units are continuous.** `UNITS` (`edit-food/constants.ts:11`) is `["oz","lbs","g","kg","ml","L","count","servings"]`, and both `food_inventory.quantity` and `food_inventory_locations.quantity` are `INTEGER`. FIX 1's rejection of `"1.5"` is what surfaced this: the old truncation stored "1 lb" for a user who typed "1.5 lbs" — silent data corruption — whereas rejecting turns an int-only column into a visible product decision. The real resolution is a schema one (a `numeric` quantity column, or unit-aware precision), which means a migration and another owner gate, so it belongs to a future phase. Recorded here with the evidence so the decision is made deliberately rather than inherited.
- **A single-location save writes `location: null` to `food_inventory` while its location row falls back to `"pantry"`.** The item row keeps its existing `storageType === 'single-location' ? location : null` expression (Step 1 says leave it), and the location row uses the plan's own `location ?? "pantry"` — so an item saved without picking a location ends up with the two disagreeing. Harmless today: `food_inventory.location` is display-only and no quantity math reads it. Task 11 is the sweep that decides whether that column survives at all; if it does, the two spellings should be made to agree (either default the item column to `"pantry"` too, or derive the display from the location row). Recorded here so it has a written home rather than living only in a review comment.

### Task 7

Landed as `3e2e56c` (implementation) + a second commit (spec-review fixes) + a third (quality-review fixes). Steps 1 and 2 went in essentially as written, with one correction to the plan's own code (the cast) and two additions to what it prescribed (a docstring paragraph, and a correction to Task 12's banner that this task caused). Spec review returned **"the shipped code is correct"** with four documentation-accuracy defects, all fixed in the second commit; quality review returned **"Ready to merge: Yes"** with four minor items, fixed in the third — of which only the `.order("created_at")` determinism fix changed behaviour. Both rounds are listed below. No database-connecting command was run at any point; every schema claim below is grep evidence from `supabase/migrations/`, not a live query. Gates on the final tree: `tsc --noEmit` 0 errors, 9 Jest suites / 231 tests green, no test file touched (this module does I/O — the suite covers pure TS libs only, by design).

**Embed verified against the FK, not assumed.** `locations:food_inventory_locations(quantity)` resolves through `food_inventory_locations.food_inventory_id UUID NOT NULL REFERENCES public.food_inventory(id) ON DELETE CASCADE` (`20250217000003_add_multi_location_inventory.sql:13`). It is the **only** FK between that pair — the table's other FK is `user_id → auth.users(id)` (`:14`), and the two later migrations that reference `public.food_inventory` do so from *different* tables (`20250209_extend_food_inventory.sql:76`, `20260728100000_nutrition_preference_schema.sql:24`), which cannot make this embed ambiguous. The Phase 4 migration adds no FK. So PostgREST has exactly one relationship to pick and the alias cannot misresolve. Independently, the identical string already ships and works against prod in `mealLibrary.ts:52` — same table, same alias, same embedded column — so this is a copy of a proven idiom rather than a new spelling.

**🚨 PLAN DEFECT (minor, latent) — the prescribed cast lied about the row's shape.** `data as InventoryMatchSummary & { locations: … }` asserts that `data` carries `quantity`, but the select deliberately stops fetching it, so `rest.quantity` is `undefined` at runtime. Harmless *today* only by luck of statement order: `{ ...rest, quantity: locations.reduce(…) }` overwrites it on the very next line. **Fix:** `Omit<InventoryMatchSummary, "quantity">`, so the cast describes exactly what the query returns. Column-by-column the two now match 1:1 — the select names `id, name, brand, barcode, unit, storage_type`, the `Omit` requires those same six — which is the property a reviewer can check by diffing two lines instead of reasoning about spread precedence.

**What that fix does and does not buy, established by probe rather than by argument.** Both spellings were compiled side by side in a throwaway module with the `quantity:` line deleted from the return literal. The plan's cast **compiles clean** — the projection can silently vanish and ship a row whose `quantity` is `undefined`, which every consumer's `(x.quantity ?? 0) > 0` then reads as out-of-stock. The landed cast fails: `error TS2741: Property 'quantity' is missing in type '{ id: string; name: string; unit: string | null; brand: string | null; barcode: string | null; storage_type: … }' but required in type 'InventoryMatchSummary'`. So the guarantee gained is precisely **"the projection is load-bearing and cannot be dropped"** — narrow, but it is the one line of this function that the whole task exists for. The probe was deleted; it left no residue. **It buys nothing against a future field added to `InventoryMatchSummary` but forgotten in the select string** — an earlier draft of this amendment claimed it did, and that is wrong: `Omit` would include the new field, the cast would assert it, and the return would compile. A type *assertion* cannot police an opaque query string, and against an untyped supabase client nothing in `tsc` can. Grepping `supabase/migrations/` remains the only real check, which is why the embed verification above is not optional.

**`locations` is `[]`, never `null`, and `.reduce` is additionally inside the existing `try`.** PostgREST returns an empty array for a to-many embed with no children, and the repo's proven precedent agrees: `mealLibrary.ts:106` does a bare `r.locations.length > 0` with no null guard and has shipped against prod since Phase 3. `.reduce` is given an explicit `0` seed so `[]` yields `0`. No `?? []` was added — it would diverge from the working idiom for a case that cannot occur, and the surrounding `try/catch` already degrades a hypothetical throw to "no match" rather than a crash. Deliberate, recorded so a future reader does not add one thinking it was overlooked.

- **`willUseInventory` needs no change — confirmed by reading it, not assumed.** `MealsScreen.tsx:566-567` is `useInventory && !!inventoryMatch && (inventoryMatch.quantity ?? 0) > 0`. It asks one question — "is there stock" — and never assumes cache semantics, so redefining `quantity` as the projected total changes the answer without touching the expression.

**The complete consumer sweep of `InventoryMatchSummary.quantity` — all three sites.** Derived by grepping every reference to the type and to the `inventoryMatch` binding across `mobile/src` and `mobile/app`, not by inheriting a list:

| Site | Reads `quantity` as | Effect of the redefinition |
|---|---|---|
| `MealsScreen.tsx:567` | `> 0` predicate (the gate) | The fix itself |
| `FoodPreviewModal.tsx:86` | `> 0` predicate (initial toggle state) | Matches the gate |
| `FoodPreviewModal.tsx:396` | `<= 0` predicate (`disabled=`) | Matches the gate |
| **`FoodPreviewModal.tsx:387`** | **rendered number** — `{inventoryMatch.quantity} {inventoryMatch.unit ?? "in stock"} · {inventoryMatch.name}` | **Displays the projected total instead of the cache** |

The rest of the `inventoryMatch` surface reads other fields only: `.id` (`MealsScreen.tsx:569,605,606`), `.name`/`.unit` (`FoodPreviewModal.tsx:387-388`), plus null-checks and the prop hand-off at `MealsScreen.tsx:1679`. `findInventoryMatchByBarcode` has exactly two call sites (`MealsScreen.tsx:379,414`), both binding straight into `setInventoryMatch`.

**🚨 An earlier draft of this amendment asserted "no consumer reads `quantity` as a displayed number" and enumerated only the two predicate sites in `FoodPreviewModal`. That was wrong — `:387` renders it.** The Task 6 amendment's "assessed and deliberately left alone" list makes the same omission (it names `FoodPreviewModal.tsx:86,396` and not `:387`), so this was inherited rather than invented — **which is the point: that list should not be trusted as a complete sweep by Tasks 8 or 11 either.** Re-derive it by grep. No adverse functional impact from the display site: the §1 canary (legacy `0` / locations `60`) now renders "60 …" where it rendered "0 …", which is part of the fix, and a zero-row item renders "0 …" beside a correctly-disabled toggle — consistent with the `Qty: 0` Task 5 already ships on the grid for the same items. But it **is** a user-visible Task 7 effect, so it is named in Task 12's banner alongside the disabled toggle.

- The `?? 0` at all three predicate sites is dead defensiveness — the field is non-optional `number` — and is Task 8/11's to remove, not this task's.
- **The prescribed comment wording — "the gate and the RPC now read the same truth" — is not yet literally true, so it shipped hedged.** Post-Task-7 the two agree exactly for any item with ≥1 location row. For a zero-row item (per Task 6's Finding A, most single-location items today) they still differ: the gate projects `0` and the RPC's legacy branch would have taken a unit. What makes this safe rather than a surviving defect is that the residual divergence is **one-directional** — the gate is strictly more conservative, so when it is off the RPC is never called and its legacy branch is unreachable from this path, and when it is on the item has location rows and both read them. The gate can no longer claim stock the RPC will not take, which was half of the §1 defect; the canary (legacy `0` / locations `60`) is the other half and is fully fixed. Both comments say this rather than overclaiming (the `MealsScreen` one only after the review round — see FIX 3 below), and the `findInventoryMatchByBarcode` docstring gained a paragraph naming the pre-Task-12 behaviour explicitly. Writing "the same truth" flat would have been a comment that is false for most of the inventory on the day it landed.
- **The inline `locations.reduce(…)` was kept over `projectItemStock`, and the plan is right here.** Routing through the shared projection would require the select to fetch `id, location, is_ready_to_consume` per location row plus `storage_type`, three threshold columns, `requires_refrigeration` and `expiration_date` off the item — roughly triple the payload — to compute one number from a `StockItemInput`/`StockLocationRow[]` pair this call site has no other use for. `projectItemStock` earns its keep where the bands and badges are consumed; here only `totalQuantity` is. Assessed and left as prescribed, noted so it is not "fixed" later.

**Review-round fixes (second commit) — spec review returned "the shipped code is correct"; all four items were documentation accuracy, no logic changed.**

- **FIX 1 — the consumer sweep was incomplete, and the method was the cause.** `FoodPreviewModal.tsx:387` displays `quantity`; the first draft said no consumer did. Corrected in the table above, with the inherited-from-Task-6 provenance recorded so the earlier list is not trusted blindly. **Process note, worth more than the fix:** Tasks 1, 2 and 6 verified their claims by mutating source and observing the failure; this sweep was done by reading a list carried over from the Task 6 amendment, and the list was wrong. Redone by grepping every reference to `InventoryMatchSummary` and to the `inventoryMatch` binding across `mobile/src` and `mobile/app`. A sweep asserted from a secondary source is not a sweep.
- **FIX 2 — the self-correction had landed only in the least-read place.** The amendment said the `Omit` gives no protection against a field added to the interface but missing from the select; the **code comment and the plan fence still claimed it did**. The reviewer ran the probe I had not: adding `future_field_probe: string` to `InventoryMatchSummary` and leaving the select alone gives `tsc` exit 0. Both the comment (`foodInventoryMatchService.ts`) and the fence in Step 1 above are rewritten to the narrower true claim — the `Omit` makes the projection load-bearing, and nothing in `tsc` can police an opaque query string. Correcting the record in the amendment while shipping the overclaim in the source is the wrong half to fix.
- **FIX 3 — only one of the two comments was actually hedged.** The service docstring carried the pre-Task-12 qualifier; `MealsScreen.tsx`'s said flatly that the gate and the RPC "now read the same truth", which is untrue for zero-row items today — while this amendment claimed both were hedged. The MealsScreen comment now carries the same one-directional qualifier. Its operative guidance ("arm on outcome, never on intent") was correct and is unchanged.
- **FIX 4 — SPEC DEFECT, now recorded.** Spec §7's second bullet still specified `(quantity, is_ready_to_consume)` and `totalQuantity` "from the shared projection". The first report noted the tradeoff but framed it as "the plan is right here" without naming that it *conflicts with the spec*, leaving the spec disagreeing with prod code with nothing on record. Adjudicated **plan right, spec wrong**, on a stronger ground than the payload argument I gave: **spec §7 is internally incoherent** — its own column list cannot construct a `projectItemStock` call (`stockState.ts:55-59` needs a full `StockItemInput` plus `id`/`location` per row, none of which §7 fetches), and the projection's `totalQuantity` is byte-identical to the inline reduce (`stockState.ts:60`), so it specifies extra I/O for zero behavioral difference. `docs/superpowers/specs/2026-07-29-nutrition-inventory-loop-design.md` §7 is amended to `(quantity)` + inline Σ, corrected in place with a dated italic note — matching the post-hoc-correction convention the Phase 3 spec already uses (e.g. its §5.2/§6/§8.1 notes), including that convention's rule of folding the correction into the normative block rather than leaving a stale block under a correcting note. **First spec edit of this phase.**

**Quality-review fixes (third commit) — "Ready to merge: Yes"; four minor items, one of them a real correctness improvement.**

- **The review proved the one-directional claim outright, rather than by trace.** `food_inventory_locations.quantity` carries `CHECK (quantity >= 0)` (`20250217000003:16`), so `Σ > 0` implies at least one strictly-positive row; and the consume RPC filters on `l.quantity > 0` **alone**, using `is_ready_to_consume` only as an `ORDER BY` tiebreak, never as a filter (`20260729100100:43-49`). Therefore whenever the gate is on, the RPC has something to take — the gate is *never* optimistic relative to the RPC, not merely "conservative in the cases traced". **This also retroactively justifies dropping `is_ready_to_consume` from the select**: spec §7 originally asked for it, and including it would have been an active error, since a ready-only Σ would *under*-count what the RPC will actually consume.
- **FIX 1 — the barcode match was non-deterministic, and Task 7 raised the stakes.** `.limit(1).maybeSingle()` had no `ORDER BY`. There is **no** unique constraint on `food_inventory(user_id, barcode)` — only a plain index (`20250209_extend_food_inventory.sql:28`; the partial unique index at `20251229000000_saved_foods.sql:26-28` is on `saved_foods`, a different table) — and `EditFoodScreen.tsx:561-569` inserts with no barcode dedupe, so duplicates are reachable. The winner was not just arbitrary but **unstable across calls**: the consume RPC's resync `UPDATE` (`20260729100100:57-62`) rewrites the `food_inventory` tuple, which can move it in a heap scan. Pre-existing, but this task sharpens it — two duplicates now project two *different* totals, so the arbitrary pick decides what the pantry toggle says. **Fix:** `.order("created_at", { ascending: true })`. Column verified present before use: `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` at `20250206_tracking_tables.sql:17`, re-declared identically at `20250208_complete_tracking_schema.sql:87`, with no `DROP COLUMN`/`RENAME COLUMN` against it anywhere in the tree. Oldest-first is a deterministic choice, not a *correct* one — the real fix is a unique constraint or a merge flow, which is a schema question and therefore a future phase.
- **FIX 2 — the pre-migration hedges had no scheduled removal.** All three ("before Task 12's reconcile…") would have gone stale silently: **Task 11's comment sweep runs before Task 12**, so it correctly must not touch them, and Task 13 had no comment step at all. **Added Task 13 Step 2b**, naming all three sites and what to keep versus delete, plus a boundary note at the top of Task 11 telling the sweep to leave them alone. Sequencing hazard, not a code defect.
- **FIX 3 — the cast comment was longer than the function's logic.** Ten lines reproducing this amendment nearly verbatim, in a file already carrying a 14-line docstring on `consumeOneInventoryUnit`. Trimmed to four: what `Omit` buys, what it does not, and "grep the migrations". The hedged divergence docstrings were left alone — they are load-bearing and Task 13 Step 2b is what retires them. The plan fence above was trimmed in lockstep and re-verified byte-identical.

**Deliberately routed to Task 11 rather than fixed here:**

- **`storage_type` is fetched and read by nobody.** It is declared on `InventoryMatchSummary` (`foodInventoryMatchService.ts:10`) and selected (`:34`), but `grep -rn "inventoryMatch.storage_type\|match.storage_type" mobile/src mobile/app` returns **zero hits**. Pre-existing dead payload, not introduced here — Task 7 merely rewrote the select around it and deliberately did not widen its own scope to drop a field. Removing it means touching the interface and the select together.

**Found here, deliberately NOT absorbed — tracked outside this phase.** The review surfaced an Important pre-existing defect: **deleting a logged meal never refunds the consumed unit**, and `meal_logs.inventory_items` is written from `willUseInventory` *before* `consumeOneInventoryUnit` runs (`MealsScreen.tsx:568-570` vs `:604-606`) — so the row persists **intent, not outcome**, which makes a §11-safe delete-refund impossible until the actual outcome is persisted. Dates from Phase 2 and is owned by no task in this plan or spec. Task 7 makes it **newly reachable for the stale-zero-cache class**: an item with a `0` legacy cache but stocked location rows (the §1 canary shape) previously failed the gate and so was never consumed, and now it is. The coordinator has tracked it as separate work; recorded here so the record shows it was seen and consciously left rather than missed.

**Task 12's banner needed a correction, and this task caused it.** The banner asserted "What still works meanwhile: **consumption** … so logging meals is fine. The breakage is display and edit-save only." That was accurate when written and is now too broad: Task 7 removed the legacy fallback from the barcode gate, so for a zero-row item the "Use from pantry" toggle is off and disabled where it previously worked off the cache. **Assessment: a real pre-gate functional gap, not covered by the existing banners, but not a data hazard** — the meal still logs in full, nothing is written to the item, and no stock is destroyed, which puts it in a different class from the edit-save warning it now sits beside. It needs no operator action beyond awareness and it closes wholesale when section A seeds the canonical rows. The banner, **as of this task**, distinguished the Meal Library path (still fell back, still decremented) from the barcode path (no longer did), and the sequencing recommendation gains one more argument. Recorded rather than "fixed" in code: restoring a legacy fallback here would re-arm precisely the divergence Task 7 exists to close.

> **⛔ SUPERSEDED by Task 8 — the clause above is a dated record, not a description of the banner's current content.** Task 8 removed the Meal Library's legacy fallback too, so "still falls back, still decrements" is **false as of `1fcdae2`**, and the banner sentence this paragraph describes has been struck there. **No decrement path remains for a zero-row item.** Do not read this paragraph as current; see "⚠️ Execution amendments → Task 8" for the trace and for why the drift it introduces is unrecoverable.


### Task 8

Steps 1–3 landed essentially as written, with two deliberate deviations from the plan's own code (both resolutions of decisions earlier tasks explicitly deferred here), one copy correction, and one finding that is materially larger than the plan knew. No database-connecting command was run at any point; every schema claim below is grep evidence from `supabase/migrations/`, not a live query. Gates on the final tree: `tsc --noEmit` 0 errors, 9 Jest suites / 231 tests green, **no test file touched** (these are React components and an I/O module — the suite covers pure TS libs only, by design; the pure logic underneath, `assessAssemblability`, already carries 25 tests from Task 2).

**🚨 THE FINDING — removing the legacy fallback also stops meal logging from decrementing inventory, not just badges. The plan and Task 12's banner both said the opposite.** The banner read "What still works meanwhile: **consumption via the Meal Library** … so logging a meal from the library still decrements a zero-row item." As of this task that is false. Traced end to end rather than inferred:

1. `fetchMealLibrary` now projects `totalQuantity = Σ r.locations` with no `: r.quantity` arm, so a zero-location-row item is `0`.
2. `logMeal` (`mealLibrary.ts`) resolves through **that same array** — `resolveInventoryMatches(items, opts.inventory)`.
3. `resolveInventoryMatches` excludes `totalQuantity === 0` rows on **both** branches: `:33` (`inStock` filter, concept path) and — the one that is easy to miss — `:43`, where even the *terminal barcode* hit requires `barcodeRow.totalQuantity > 0` before it is recorded.
4. So the id is never in `matches`, never in `requestedIds`, and **`consume_inventory_units` is never invoked for it**. Its legacy `else` branch (`20260729100100:64-70`), which decrements `fi.quantity` when an item has no location rows, is now unreachable from every app path — Task 7 closed the barcode one, this task closes the last one.

**Verified by execution, not by reading:** a throwaway Jest probe asserted that an item with `locations: []` projects `totalQuantity: 0` and that `assessAssemblability` with an exact barcode match against that row returns `{ assemblable: false, missing: ["Yogurt"] }` — i.e. the barcode-terminal branch really does refuse a zero-stock row. Probe deleted; it left no residue.

**Why it was not "fixed" by restoring the fallback:** that is the divergence Phase 4 exists to close, it is what re-arms the consume RPC's legacy branch and `EditFoodScreen`'s laundering path, and the reconcile repairs the whole class wholesale. The right lever is the *window*, not the fallback.

**Why it is nonetheless a bigger deal than Task 7's equivalent narrowing, and is written up that way in the banner.** The barcode gap was inert — the toggle did nothing, and nothing was lost. This one is not: before this task a Meal-Library log *did* take a unit off `fi.quantity`, and section A seeds each canonical location row **from** `fi.quantity`, so those decrements survived the migration. They no longer happen, so **every unit eaten between this bundle landing on the phone and the apply is invisible to the reconcile** — section A will seed a stale, too-high number and nothing downstream detects it. Silent, accumulating, un-auditable count drift, bounded only by elapsed time. Still not a *data hazard* in the edit-save sense (nothing is overwritten, no meal is blocked, the log rows are complete and correctly carry `uses_inventory: false`), but it is the strongest argument yet for the sequencing recommendation. Task 12's banner now: strikes the false "consumption still works" sentence, adds a third narrowing paragraph with the trace and the drift analysis, and tells the operator to expect to hand-correct a few quantities if the window was long.

**DECISION 1 — the `Pick<>` widening Task 1 deferred here: TAKEN.** `projectItemStock`'s `locations` param is now `ReadonlyArray<StockQuantityRow>` where `StockQuantityRow = Pick<StockLocationRow, "quantity" | "is_ready_to_consume">`, and the plan's `r.locations.map((l, i) => ({ id: String(i), location: "", ...l }))` fabrication is deleted. Reasoning: the fabrication does not merely add noise, it manufactures **two false values** — an `id` that is a list index rather than a location row's UUID, and `location: ""`, which no row can hold (`CHECK (location IN ('fridge','freezer','pantry','cabinet'))`, `20250217000003:15` as widened by `20250217000004:21`). Today `projectItemStock` reads neither, so it is harmless; the hazard is that the *type* says otherwise, so any future read of `locations[i].id` or `.location` inside the projection would compile and be silently wrong for this caller only. The widening makes the signature state exactly what the function reads, which is the same "make the type describe the query" property Task 7 argued for. **Verified as a true widening by mutation, not by assertion:** the param was reverted to `StockLocationRow[]` and `tsc` re-run — it produced **exactly one** error, at the new Task 8 call site (`mealLibrary.ts(133,7): TS2322 … missing the following properties … id, location`), proving both that no pre-existing caller relied on the narrow type and that the fabrication would otherwise be mandatory. Reverted; `tsc` 0 errors and the 25 `stockState` tests pass **unmodified** — `StockLocationRow` is still exported and still what the test helper `loc()` builds, so the tests exercise the wider signature with the narrower value, which is the assignability that matters.

**DECISION 2 — the "expires in 0d" copy Task 2 flagged: SPECIAL-CASED.** MealDetail renders `expires today` for `expiringDaysLeft === 0` and `expires in {n}d` otherwise. Reasoning: day 0 is a *deliberately retained* rescue case (Task 2's FIX 1 bounded the window below at 0 precisely so "expires today" stays actionable while already-expired rows are excluded), so `0` is not an edge case that "shouldn't happen" — it is the most urgent value the field can hold, and it would have rendered as the least urgent-sounding string in the template. **Verified reachable end-to-end by the same probe:** an item dated today projects `{ daysLeft: 0, expiration: "today" }` and `assessAssemblability` returns `expiringDaysLeft: 0` with a non-null `expiringItemName`. The alternative — surfacing `projectItemStock`'s `"today"` band through `MealAssemblability` — was rejected as a wider type change for one string; the band is not otherwise needed and `daysLeft === 0` is the same predicate. Note the render guard is `assemblability?.expiringItemName`, **not** truthiness on `expiringDaysLeft`, per Task 2's forward note; the plan already had this right and a comment now records why.

- **`ListEmptyComponent` had to become conditional, or the filter strands the user.** `sections` drops empty sections, so `inStockOnly` with nothing makeable yields `[]` — byte-identical to an empty library, which renders "No meals yet — add your first one." A user with 40 meals would be told they have none, with no hint that a filter caused it. The message now branches on `inStockOnly` and names the way out. Not in the plan; a filter that can silently misreport the library's contents is a defect, not a polish item.
- **The chip landed as a filter-bar row under the header, not "in" the header.** The header is a fixed three-slot `space-between` row (`＋ New` / title / `Done`); a fourth child breaks it. Putting the chip inside the `SectionList` (as a `ListHeaderComponent`) was rejected for a specific reason: it would scroll out of view while still hiding rows, which is exactly the state that must stay visible. The bar is gated on `view.mode === "list" && data`.
- **Memoization contract preserved and checked against the existing pattern.** `assemblabilityById` is built in a `useMemo` keyed `[data]`, alongside `scores`/`totalsById` and for the same stated reason (`totalsById`'s comment: a fresh object per `renderItem` call defeats `MealRow`'s `React.memo`). `renderItem`'s dep array gained `assemblabilityById`; `sections`' gained `assemblabilityById` and `inStockOnly`. `MealRow`'s new prop is documented as requiring a stable object. A miss is structurally impossible for the same reason the existing `scores`/`totals` miss is — all three maps and `sections` derive from the one `data.meals` array — and is deliberately not papered over.
- **The `MealBuilder` per-item call degenerates correctly, and the cost is nil.** `assessAssemblability` over a one-item array returns `assemblable = (missing.length === 0)`, and `missing` is empty iff that item is in `matches` — so the dot agrees **by construction** with whether the whole-meal call would list the item as missing (resolution is per-item and stateless; no cross-item interaction exists in `resolveInventoryMatches`). Cost per call is `O(inventory)`: one `inStock` filter plus one `find`. At ~25 inventory rows × ~10 builder items that is ~250 comparisons per render, recomputed on every keystroke in the name/search fields. Measured against the alternative (a `useMemo` map keyed by `saved_food_id`) and left inline **as the plan prescribes** — the memo would add a dependency on `items`, which changes on every ± tap anyway, for a saving that is below noise at this scale.
- **Embed and columns verified against the FK and the DDL, not assumed.** `locations:food_inventory_locations(quantity, is_ready_to_consume)` resolves through `food_inventory_locations.food_inventory_id UUID NOT NULL REFERENCES public.food_inventory(id) ON DELETE CASCADE` (`20250217000003:13`) — the only FK between that pair (the table's other FK is `user_id → auth.users(id)`, `:14`), so PostgREST has exactly one relationship to pick. The identical alias already ships against prod one line above, at `mealLibrary.ts:52` pre-change, and Task 7 re-derived the same conclusion independently. New columns: `food_inventory.name` — `name TEXT NOT NULL` (`20250206_tracking_tables.sql:13`, re-declared identically at `20250208_complete_tracking_schema.sql:83`); `food_inventory.expiration_date` — `ADD COLUMN IF NOT EXISTS expiration_date DATE` (`20250209_extend_food_inventory.sql:17`, nullable, hence `string | null`); `food_inventory_locations.is_ready_to_consume` — `BOOLEAN NOT NULL DEFAULT false` (`20250217000003:17`). A repo-wide `grep -rn "DROP COLUMN\|RENAME COLUMN" supabase/migrations/` returns **nine** hits — `20251028000000` (`exercises.category`, `.equipment`, `.muscle_groups`), `20251028000001` (`.demo_video_url`, `.thumbnail_url`, `.setup_instructions`, `.execution_cues`, `.common_mistakes`) and `20251028000002` (`.full_name`) — **all nine on `exercises`, none touching `food_inventory` or `food_inventory_locations`**, so none of the three columns has been dropped or renamed since. *(Corrected during the Task 8 review round: the first draft of this bullet stated "exactly one hit, `exercises.full_name`." The conclusion was right and the stated evidence was not — the grep returns nine. Re-run and counted, not recalled. This amendment set requires verification claims to be literally true, including the ones whose conclusion happens to survive.)*
- **Every consumer of `MealLibraryData.inventory`, re-derived by grep rather than inherited** — the Task 7 amendment's FIX 1 is explicit that a sweep taken from a secondary source is not a sweep. `grep -rn "MealLibraryData\|fetchMealLibrary" mobile/src mobile/app` returns four consuming files, and only two touch `.inventory`: `MealLibraryModal.tsx` (passes `data.inventory` to `logMeal`, and now to `assessAssemblability` and `MealBuilder`) and `mealLibrary.ts` itself (`logMeal`'s `opts.inventory`, still typed `ResolutionInventoryRow[]` — deliberately, since resolution is all it needs; the widened value is assignable because `AssemblabilityInventoryRow extends ResolutionInventoryRow`). **`useEatNext.ts` never reads `library.inventory` at all** — it reads only `library.meals`, `library.conceptIdsBySavedFoodId` and `library.conceptsById` (`:272-279`), which is why the plan's self-review worry about Phase 3 compiling against the old shape came to nothing. `mealScoreInput.ts` mentions `fetchMealLibrary` in prose only. The type change is additive and `tsc` is 0 with the full suite green.
- **The clock is hoisted out of the `.map` callback.** The plan's `todayLocalDate: getLocalDateString()` sampled a fresh `new Date()` per inventory row; a list crossing local midnight would band two items against different "today"s. Same "ONE clock for the whole assembly" reasoning `useEatNext.ts:166-170` already states for its own load.
- **Inline hex colors moved into named `styles.ts` entries** (`inStockBadge`, `inStockBadgeText`, `warnText`, `availableDot`, `unavailableDot`, `filterBar`). The plan wrote them inline; every other color in this directory is a named style, and inline style objects are freshly allocated per render, which is the specific thing this file's memo comments care about.
- **The builder dot is a nested inline `<Text>` with the trailing space inside the string literal.** A third sibling in the row would break its `space-between` layout, and `marginRight` on inline nested `Text` is unreliable on iOS.

**Deliberately routed to Task 11 rather than fixed here:**

- **`food_inventory.quantity` is still selected by `fetchMealLibrary` and now read by nobody.** With the fallback gone, `InventoryRowRaw.quantity` is dead payload — the same class as the `storage_type` Task 7 routed to Task 11 from `InventoryMatchSummary`. Kept for now because the plan's select string prescribes it verbatim and removing it is a query change, not a compile-forced one; the field carries an inline `Selected but NEVER read` comment so the state is not mistaken for an oversight. There is a mild argument for dropping it sooner — an absent column makes re-adding the fallback impossible without editing the query — but that is Task 11's sweep to make, alongside `storage_type`.
- **The `?? 0` dead defensiveness at `FoodPreviewModal.tsx:86,396` and `MealsScreen.tsx:567`**, which Task 7 named as "Task 8/11's to remove", was left alone. It is in `MealsScreen`/`FoodPreviewModal`, neither of which Task 8 touches, and folding an unrelated three-site edit into this commit would widen the diff past the task's stated file list for no behavioral change. Task 11 owns it; recorded here so the hand-off is not dropped.

**Review-round fixes (second commit) — spec review returned "✅ compliant, no code defects"; all four items were documentation accuracy, no logic changed and no source file touched.**

- **FIX 1 — an evidence claim in this amendment was literally false.** The "embed and columns" bullet said `grep -rn "DROP COLUMN\|RENAME COLUMN" supabase/migrations/` returns "exactly one hit, `exercises.full_name`." It returns **nine**, across three migrations. Corrected in place above, with all nine enumerated. The conclusion was and remains right — every one is on `exercises`, none touches `food_inventory` or `food_inventory_locations` — which is exactly why this needed fixing rather than shrugging at: a claim whose conclusion survives is the easiest kind to leave wrong, and this amendment set's whole standard is that verification claims be literally true. Re-run and counted, not recalled. Root cause, stated exactly because this fix is about literal accuracy: the command actually run was `grep -rn "DROP COLUMN\|RENAME COLUMN" supabase/migrations/ | grep -i "food_inventory\|name\|expiration"`, whose second stage narrowed nine hits to one — and that one, `20251028000002_remove_exercises_full_name.sql`, survived only because the word "name" appears in its *filename*, not because it touches a column of interest. The **piped** result was then written up as the output of the **unpiped** command. The lesson generalizes past this bullet: when a grep's output is going to be quoted as evidence, quote the command that produced it, and prefer running the broad form and reading all of it over narrowing and reporting the count.
- **FIX 2 — stale word count.** Task 13 Step 2b's intro was updated to "**Four** comments" and a fourth bullet added, but the sentence still ended "at exactly these **three** sites". Now four.
- **FIX 3 — the Task 7 amendment's closing paragraph had become false in the present tense.** It read "The banner now distinguishes the Meal Library path (**still falls back, still decrements**) from the barcode path" — a present-tense claim about the banner's content, and Task 8 struck exactly that sentence from the banner. Past-tensed and given an explicit **⛔ SUPERSEDED by Task 8** block naming the commit, rather than being rewritten: amendments are a dated record of what each task found, so silently correcting Task 7's finding would erase the fact that the Meal Library path *did* still work at that point — which is the whole reason Task 8's removal of it is a change in kind and not a continuation.
- **FIX 4 — an unlabeled SPEC DEFECT, now recorded. Second spec edit of this phase.** Spec §8 said the container computes "one `assemblabilityByMealId` map … that **all of these** read", with "these" including MealBuilder's per-item dots. That is structurally impossible: the map is keyed by **meal id** and its values are whole-meal `MealAssemblability` objects with no per-item resolution (`missing` is a list of display names, not a keyed structure), and MealBuilder is editing an unsaved draft with no meal id at all on the create path. Adjudicated **plan right, spec wrong** — and on a stronger ground than "the plan said so": the plan's per-item call is *provably equivalent* to what §8 intended, because `resolveInventoryMatches` has no cross-item state, so a one-item `assemblable` is exactly "this item is not in the whole-meal `missing` list". The same amendment folds in the **chip-placement divergence**, which also contradicts §8 ("header gains an 'In stock only' filter toggle") and had been recorded only in the plan — a process inconsistency the reviewer was right to flag, since a deviation captured in one document and not the other is how a spec rots. `docs/superpowers/specs/2026-07-29-nutrition-inventory-loop-design.md` §8 is corrected in place with a dated italic note, matching the convention §7 established in Task 7.
- **Also corrected: the consume RPC citation was off by two.** The legacy `else` branch was cited as `20260729100100:66-70` at all three sites it appears in this plan; `:66-67` are the middle of the `update`'s `set`/`where`. Verified by line-numbered read: `else` is at **`:64`**, the decrement `update` spans `:65-68`, `get diagnostics` is `:69`, `end if` is `:70`. All three citations now read `20260729100100:64-70`.

**Note on fence fidelity — stated as measured, because the first draft of this very bullet overclaimed.** Earlier tasks verified their fences "byte-identical to the landed file" by extracting and `diff`-ing. **That property does not hold for Task 8's fences and is not claimed.** They are snippets rather than whole files, the landed source carries four explanatory comments the fences omit for readability (the ONE-clock note, the pre-migration hedge, the synthetic-item note, the `expiringItemName`-not-truthiness note), and the source is formatted one property per line where the fences pack several onto a line.

What **is** verified, by a token-level comparator run over all six Task 8 fences rather than by eye: after stripping comments and normalizing trailing commas, **every fence's token stream appears verbatim and contiguously inside its landed source file** — `mealLibrary.ts` (×2), `MealLibraryModal.tsx`, `MealRow.tsx`, `MealDetail.tsx`, `MealBuilder.tsx`. Line wrapping and trailing commas are the *only* differences; there is no token of divergence in identifiers, literals, operators or structure.

Two things were caught by running this rather than asserting it. **(1)** The first draft of this bullet claimed the fences matched "statement for statement, after comment removal" — a line-oriented claim that is **false**, as the comparator showed immediately (three of six fences fail a line-level match purely on wrapping). It has been narrowed to the token-level claim that is actually true. **(2)** It found a genuinely stale fence: MealDetail's `Missing:` line still carried the plan's original inline `{ marginTop: 8, color: "#F59E0B" }` after the shipped code had moved that color into the named `lib.warnText` style — the sibling `expiringItemName` line had been updated and this one had not. Fence corrected. That is exactly the drift this check exists to catch, and it would have survived any amount of re-reading.

**Quality-review fixes (third commit) — "Ready to merge: Yes"; one Minor code defect, four Task 11 hand-offs, two judgement calls made explicit.**

- **FIX 1 (the only code change) — a dangling `Missing:` label on an item-less meal.** `assessAssemblability` defines `assemblable: items.length > 0 && missing.length === 0` (`stockState.ts:182`), so a meal with **no items** returns `{ assemblable: false, missing: [] }`. The plan's gate `assemblability && !assemblability.assemblable` passes on that, and `missing.join(", ")` yields `""` — an amber `Missing:` with nothing after it. **The verdict and the list are not the same predicate**, and the plan conflated them; they diverge on exactly the zero-item case. **Fix:** gate on the list — `assemblability && assemblability.missing.length > 0`. Behaviour is identical for every meal with ≥1 item, so this is a pure defect fix, not a semantic change. **Not hypothetical:** `updateMeal`'s delete-then-reinsert is explicitly non-atomic and its own comment says "a failure between them leaves an item-less meal, which is visible in the UI and recoverable by re-editing" (`mealLibrary.ts:310-313`), and `MealLibraryModal`'s `renderItem` already carries a comment treating empty item lists as a live state (`:341-345`). The plan fence was updated in lockstep and the token-level comparator re-run.

**Two judgement calls, decided rather than left as side effects:**

- **`inStockOnly` persists across modal close/reopen — KEPT STICKY, deliberately.** The `visible` effect (`MealLibraryModal.tsx:78-87`) resets `view` but not the filter, so a user who closes with the filter on reopens into a shortened library. Decided to keep it, on three grounds: it is **self-announcing** (the chip renders in its active style at the top of the list, above the fold, and is the only chip there), the failure mode it could cause is **already explained** by the conditional `ListEmptyComponent` added earlier in this task, and "show me what I can cook" is a **standing preference** rather than a per-visit one — this modal is opened many times a day from several entry points, and resetting would make the user re-apply it every time. Recorded as a decision so a future reader does not "fix" the asymmetry with `view` by resetting it. The counter-argument, noted for completeness: the deep-link entry (`initialMealId`) opens straight onto a detail, and backing out of that lands the user in a filtered list they did not filter *this* session. Judged acceptable because the chip is visible at that moment and one tap undoes it.
- **The expiring line renders even when the meal is NOT assemblable — LEFT AS IS.** A meal can therefore read `Missing: A, B` immediately above `Uses C — expires in 2d`, which is slightly odd copy ("uses" a meal you can't currently make). Left alone because the two lines answer genuinely independent questions and suppressing one would lose information: the expiring signal is about **an ingredient you already own and should rescue**, which is *more* actionable when the meal is unmakeable, not less — it tells the user that buying the two missing items also saves C. It also matches the spec's own model (§9 attaches expiring and missing as independent reason strings on the same candidate) and Task 9 will rank on both signals independently, so suppressing one here would put the detail view out of step with the recommender's reasoning. If the copy is ever revisited, the fix is wording ("Also uses C — expires in 2d"), not suppression.

**Routed to Task 11 rather than fixed here (recorded only, per review):**

- **🔴 HIGH PRIORITY for the sweep — `inventoryResolution.ts:19`'s docstring is now flatly false.** It documents `ResolutionInventoryRow.totalQuantity` as "Sum of location quantities, **or the legacy quantity for location-less rows**." `mealLibrary.ts` is the only producer of `ResolutionInventoryRow` in the app, and as of `1fcdae2` it has no legacy arm. **This one is not cosmetic:** it is precisely the comment that would tell a future reader the fallback is expected behaviour and invite them to restore it — silently undoing the closure traced in the 🚨 finding above, and re-arming the consume RPC's legacy branch. It should be the first item the sweep fixes, and the replacement text should state the invariant (Σ location rows, no fallback) rather than merely deleting the clause.
- **`mealLibrary.ts:6` is the app's only `src/lib/**` → `src/components/**` import.** `getLocalDateString` from `@/src/components/track/meals/mealsHelpers`. Harmless today and verified so rather than assumed — that helper imports only `@/src/types/track`, no `react-native`, so it cannot poison the node test scope — but a data-access module now depends on a components subtree, and `stockState.ts` already owns the adjacent date math (`daysBetweenLocalDates`). Natural home is `stockState.ts` or a new `src/lib/dates.ts`; five call sites to move.
- **`is_ready_to_consume` is dead payload at this call site too — but "keep it" may be the right answer, so do not delete it reflexively.** It is selected at `mealLibrary.ts:60` and fed to `projectItemStock`, yet only `totalQuantity` and `daysLeft` reach `AssemblabilityInventoryRow`, so nothing reads the ready/storage split here. Same class as the `quantity` column routed above, and the hand-off note listed only `quantity` — corrected here. **However, spec §9 prescribes selecting it for the `useEatNext` read**, so the sweep must check §9 before touching the select; the right outcome may be to keep it and document why. Flagged so it is a decision, not an oversight in either direction.
- **`StockLocationRow` now has zero production importers.** Only `stockState.test.ts` and the `Pick<>` in `stockState.ts` reference it; `inventory.ts` passes `FoodInventoryLocation`, a structurally compatible but separate type. Not worth changing and explicitly **not** a cleanup target — recorded only so that if those two types ever drift, the reason the compiler stayed quiet is on the record.

**Explicitly NOT done, per review:** no `stockState.test.ts` case passing a bare `StockQuantityRow`. The compile gate already catches a re-narrowing at `mealLibrary.ts:133`, as the mutation above proved, and the suite stays unmodified at 231.

### Task 9

Steps 1–4 landed as written: the Step 1 test fence was appended **byte-for-byte verbatim** (verified by substring-matching the extracted fence against the landed test file, not by eye), and the Step 3 additions match the plan's prose seam-for-seam with one deliberate copy deviation, recorded below. `eatNext.ts` is a pure lib, so unlike Tasks 4–8 this task is fully test-covered. No database-connecting command was run at any point. Gates on the final tree: `tsc --noEmit` 0 errors; **9 Jest suites / 245 tests** (was 231 — +6 from the plan's Step 1 block, +8 mutation-driven), with **every pre-existing test byte-unmodified** (`git diff --numstat` on the test file: `236 0`, i.e. additions only, zero deletions).

**The five landed-API facts the preconditions record were re-verified against the source before coding, not inherited.** `rank()` compared `roleRank → score.raw → prep → name` with the banding comment (`eatNext.ts:170-181` pre-change); `candidate()` took four params with `roleRank` 0 on role **OR** category match (`:195-208`); `catchUpCandidates(eligible, gap, maxPrepMinutes)` was shared by the `catch_up` context (`:367`) and the nudge's body pick (`:474`); `EatNextRecommendation` already carried `calories/protein/prepMinutes/score`, populated in `toRecs` and the `goal_hit` inline site; the emergency context's calorie-desc sort was intact with its "do not route through `rank()`" comment. No drift.

**All five `candidate()` call sites forward the map — enumerated by grep, then each one independently mutation-proven load-bearing.** `grep -rn "candidate(" mobile/src mobile/app` returns the definition plus exactly five calls, all inside `eatNext.ts`: `catchUpCandidates` (`:284`), post_workout (`:370`), emergency (`:405`), next_meal (`:457`), and the nudge's out-of-band fallback (`:537`) — line numbers as landed. `catchUpCandidates` gained a fifth parameter and both of **its** call sites forward it too, so the shared band definition stays availability-aware from either entry point. Reading the list was not treated as evidence — see the mutation table.

**🚨 THE FINDING — the plan's own six tests do not pin the feature. Nine of eighteen mutants survived them, including the exact bug the plan's bolded forward-caution warns about.** Every mutant below was applied to `eatNext.ts` individually, run against `npx jest eatNext.test.ts`, then reverted; `git status --porcelain` was confirmed clean of residue before committing. "Plan-only" is the six-test suite; "final" is after the eight mutation-driven tests were added.

| # | Mutant | Plan-only | Final | Killed by |
|---|---|---|---|---|
| M1 | delete `a.stockRank - b.stockRank` | KILLED (2) | KILLED | *assemblable beats higher raw*; *unknown-stock ordering* |
| M2 | invert to `b.stockRank - a.stockRank` | KILLED (2) | KILLED | same two |
| M3 | **delete `a.expiringRank - b.expiringRank`** | **SURVIVED** | KILLED (2) | *expiring rescue outranks higher raw*; *day 0* |
| M4 | invert to `b.expiringRank - a.expiringRank` | KILLED (1) | KILLED | *expiring usage breaks assemblable ties* |
| M5 | **`expiringRank` from `!!info.expiringDaysLeft`** | **SURVIVED** | KILLED (1) | *day 0 is the most urgent rescue* |
| M6 | `stockRank` folds unknown into in-stock | KILLED (1) | KILLED | *unknown-stock ordering* |
| M7 | `stockRank` folds unknown into known-missing | KILLED (1) | KILLED | *unknown-stock ordering* |
| M8 | pluralization always `"s"` | KILLED (1) | KILLED | *never a hard filter* (`missing 1 ingredient\b`) |
| M9 | pluralization always `""` | KILLED (1) | KILLED | *assemblable beats higher raw* (`missing 2 ingredients`) |
| M10 | **`catchUpCandidates` drops the map** | **SURVIVED** | KILLED (2) | *catch_up availability-aware*; *nudge in-band pick* |
| M11 | **post_workout call site drops the map** | **SURVIVED** | KILLED (1) | *post_workout availability-aware within the role tier* |
| M12 | **emergency call site drops the map** | **SURVIVED** | KILLED (1) | *emergency carries stock reasons, order unchanged* |
| M13 | next_meal call site drops the map | KILLED (4) | KILLED | four of the plan's six |
| M14 | **nudge out-of-band fallback drops the map** | **SURVIVED** | KILLED (1) | *nudge out-of-band fallback availability-aware* |
| M15 | **`catch_up` context drops the map arg** | **SURVIVED** | KILLED (1) | *catch_up availability-aware* |
| M16 | **nudge drops the map arg to `catchUpCandidates`** | **SURVIVED** | KILLED (1) | *nudge in-band pick* |
| M17 | **delete the day-0 "expires today" branch** | **SURVIVED** | KILLED (1) | *day 0* |
| M18 | `stockReasons` returns a string for unknown | (n/a — new code) | KILLED (1) | *absent from a present map gets NO stock reason* |

Three of those survivals are worth naming individually, because each is a different way for a test to look like it covers something it does not.

- **M5 is the plan's own bolded caution, and the plan's tests do not catch it.** Every plan test uses `expiringDaysLeft: 2`, so `!!2` and `expiringItemName != null` agree on all of them. The caution was correct and load-bearing; it was simply unenforced. Now pinned by a `expiringDaysLeft: 0` test.
- **M3 survived because the plan's expiring test is accidentally vacuous on ordering.** Its fixture constructs `usesExpiring` **first**, so `scored()` gives it `m0` and the pre-existing `name.localeCompare` tiebreak already placed it on top with the two meals tied on `raw` and `prep` — the `mealId` assertion passed with the whole `expiringRank` term deleted, leaving only the reason-string assertion doing work. The replacement test gives the expiring meal a strictly **lower** raw (70 vs 95), which pins the term's real semantics: `expiringRank` sits *above* `raw`, so a rescue outranks a better-scoring fresh meal rather than merely breaking its ties.
- **M11 survived despite the plan having a post_workout test.** *"role match still beats availability"* asserts a `roleRank` win, which holds identically whether or not the map reaches that call site — it is a test of the comparator's ordering, not of the call site's wiring. The new test gives both candidates the same `roleRank` (both qualify on protein, both `role: null`) so stock is the only separator, and additionally asserts the reason strings.

The general lesson, consistent with the Task 7 amendment's FIX 1: **a call site is not covered because some test exercises its context.** Four of the five call sites were exercised by a passing test and four were unpinned. Only per-call-site mutation showed which.

**DEVIATION — the day-0 reason string. `expires today`, not `expires in 0d`.** The Step 3 fence prescribed `uses ${name} — expires in ${days}d` unconditionally; the landed code special-cases `expiringDaysLeft === 0`, and the fence above is corrected to match. Grounds: this is **reconciliation with a decision made after Task 9's fence was written**, not an override of it. Task 8's DECISION 2 special-cased the identical value in `MealDetail` on the reasoning that day 0 is a *deliberately retained* rescue case (Task 2's FIX 1 bounded the expiring window below at 0 precisely so "expires today" stays actionable), i.e. the most urgent value the field can hold — and it would otherwise render as the least urgent-sounding string the template can produce. Two surfaces of the same app rendering the same field two different ways is a defect regardless of which reading is better, and `expires in 0d` is the worse of the two on its own merits. The fence's `if (info.expiringItemName)` was also tightened to `!= null` to match the caution's own wording; the two are equivalent in practice (`expiringItemName` is a non-empty saved-food display name whenever it is set), so this is a legibility fix, not a behavior change — unlike the `expiringDaysLeft` truthiness the caution actually warns about, which is a live bug.

**Bit-compatibility is real, not just asserted by the plan's `toEqual` test.** `stockReasons(undefined)` returns `[]`, so `extraReasons` is unchanged when there is no info; `stockRank`/`expiringRank` both default to `1`, so an absent map leaves every candidate tied on both new terms and the comparator falls through to `raw` exactly as before; and neither new field appears on `EatNextRecommendation`, so they cannot leak into the output. `reasons` is therefore present and identical on both paths — the array is built the same way, not merely equal by luck of an empty spread. The plan's test passed unmodified from the first implementation attempt.

**Verified and deliberately left alone**, so a future reader does not "fix" them:

- **The emergency context deliberately does not reorder on availability**, per spec §5.3.4 — a bigger rescue you have to shop for still beats a small one in the fridge. The map is forwarded there **only** for the reason strings; `rank()` is never called on that set. The site's existing "do not route this through `rank()`" comment was extended to name `stockRank`/`expiringRank` alongside `roleRank`, and the new emergency test asserts both halves: the stock reasons appear *and* the calorie-descending order is unchanged. Without that second assertion the test would not distinguish "emergency is availability-aware in its reasons" from "emergency was accidentally made availability-aware in its ordering".
- **The `goal_hit` protein-short site gets no stock reasons.** It builds its `EatNextRecommendation` inline rather than through `candidate()`/`toRecs`, and is a terminal single-pick sorted by protein desc. Adding stock there would mean a second construction path for stock reasons and is outside Task 9's stated seam (`rank`/`candidate`/`catchUpCandidates`). Recorded as a known gap rather than silently skipped: a protein-short pick can name a meal the user cannot currently assemble, with no reason saying so. Small — it is one meal in a terminal context the user reaches only after hitting their calorie goal — but real, and the natural home is whichever future task unifies that site with `toRecs`.
- **A non-assemblable meal can still carry `expiringRank: 0`, and the reason string does not say so — LEFT AS IS, per the plan's own fence.** `expiringRank` is derived from `expiringItemName != null` alone, unconditioned on `assemblable`, while `stockReasons` early-returns the `missing N ingredients` string and never reaches the expiring push. The state is reachable: `assessAssemblability` computes `expiringItemName` from the items that *did* resolve, so a meal missing two ingredients while using a third that expires tomorrow returns `{ assemblable: false, expiringItemName: "X" }`. Effect: among out-of-stock meals it ranks first, silently. Left alone on three grounds — the plan's `stockReasons` fence is explicit about the early return; the *ordering* is the one Task 8 argued for when it decided to render the expiring line even on unmakeable meals ("buying the two missing items also saves C"), so suppressing it here would put the recommender out of step with `MealDetail` in the opposite direction; and `stockRank` (2) dominates `expiringRank` in the comparator, so this can only reorder *within* the out-of-stock tier and can never lift an unmakeable meal above a makeable one. Recorded because it is a one-directional weakening of this file's stated invariant: the docstring promises "the UI can never claim a reason the ranking didn't use", which still holds — but the converse now does not, and that was previously true by construction. If it is ever revisited, the fix is to append the expiring reason to the not-assemblable branch too, not to condition `expiringRank` on `assemblable`.
- **`stockRank` is `number`, not a union or enum.** It is consumed only by subtraction inside `rank()`, matching the existing `roleRank: number` idiom one line above; a three-value union would need a widening cast at the subtraction for no gain.

**Forward note for Task 10:** `EatNextStockInfo`'s four fields are a structural subset of `MealAssemblability` except for `missingCount`, which is `missing.length`. Task 10's mapping block in the plan already spells this correctly (`missingCount: a.missing.length`). Note also that `assemblable` is `items.length > 0 && missing.length === 0` (`stockState.ts:182`), so an **item-less** meal maps to `{ assemblable: false, missingCount: 0 }` and this task's `stockReasons` renders `missing 0 ingredients` for it — the same predicate divergence Task 8's FIX 1 fixed in `MealDetail` by gating on the list rather than the verdict. Left unfixed here because the fix belongs at the boundary that *creates* the info (Task 10's map), not at the string formatter: an item-less meal should arguably be `stockRank: 1` (unknown) rather than 2, since nothing is actually known to be missing. **Task 10 should decide this explicitly and record the decision**; `updateMeal`'s non-atomic delete-then-reinsert makes item-less meals a live, reachable state, not a hypothetical.

**Round-2 fixes (second commit) — spec review returned "✅ compliant" with all three headline mutation claims independently reproduced; quality review returned "with fixes" with two Important test-only gaps. One source change, five new tests, `scored()`'s `slug` widened.**

Round 1 shipped 89 tests and a correct implementation, and still left the **single highest-value seam in the task unpinned**. The pattern is the same one the Task 7 amendment's FIX 1 named and that round 1's own headline finding restated: *coverage of a context is not coverage of the wiring inside it.* Round 1 applied that lesson to call sites and missed it one level down, at the lookup key.

- **🚨 FIX 1 (the one that matters for Task 10) — the map's lookup key was unpinned. `stockByMealId?.get(m.meal.id)` → `.get(m.meal.slug)` left 81/81 passing; so did `.get(m.meal.name)`.** Cause is in the fixture, not the tests: `scored()` set `slug: id` (`:61`) and `name: over.name ?? id` (`:60`), so `id`, `slug` and `name` were the same `m{n}` string in every stock test and a wrong-key lookup resolved correctly by coincidence. **Task 10 is the wiring task**, and if either side of that seam keys by anything but `meal.id`, every meal reads unknown-stock: ranking silently degenerates to Phase 3, every stock reason vanishes, the nudge stops being availability-aware — and not one assertion fails. **Fix:** `scored()` now builds `slug: \`${id}-slug\``, and a new test constructs meals with explicit distinct names, guards the fixture itself (`new Set([id, slug, name]).size === 3` — so a future fixture change cannot silently re-merge the keys), and asserts the id-keyed map still resolves. **Verified:** `.get(m.meal.slug)` now fails **14** tests, `.get(m.meal.name)` fails **2**. **`scored()`'s `slug` change is the only edit to an existing line in this task, and its blast radius is nil:** `grep -rn "\.slug" src/lib/eatNext.ts` returns **zero** hits (the field reaches `Candidate` only through the `...m` spread and is never read), and the suite was green at 81/81 immediately after the change with no assertion touched.
- **🚨 FIX 2 — the `stockRank` → `expiringRank` precedence was unpinned, and it was the one claim in round 1 with no test behind it.** Swapping the two terms passed 81/81. Not an equivalent mutant: `assessAssemblability` derives `expiringItemName` from the items that *did* resolve, independently of `missing`, so `{ assemblable: false, expiringItemName: "X" }` is reachable — round 1's own concern (a) says exactly that. Under the swap an **unmakeable** meal using an expiring item outranks a makeable one, inverting spec §9's key order and letting the nudge name a meal the user cannot make. Round 1's containment argument for concern (a) — "`stockRank` (2) dominates, so this can only reorder within the out-of-stock tier" — was asserted, never tested. **Fix:** one three-meal test (in-stock plain at the **lowest** raw, missing-but-expiring, missing-plain at the **highest** raw) pins both terms, their order, and the containment claim at once. **Verified:** the swap now fails it.
- **FIX 3 — concern (a) resolved by adopting Task 8's ruling, not by re-arguing it.** Round 1 justified the "expires today" deviation with *"two surfaces of the same app rendering the same field two ways is a defect regardless of which reading is better"* — and then, three bullets later, called the opposite way on exactly that case: `MealDetail.tsx:115-122` renders the expiring line on unmakeable meals, `stockReasons` early-returned before it. Same principle, opposite call, in one amendment. The spec reviewer was right to flag it. Task 8 had already ruled deliberately and recorded why — the rescue is about an ingredient the user **already owns**, which is *more* actionable when the meal is unmakeable ("buying the two missing items also saves the one about to spoil"). **Fix:** the not-assemblable early `return` becomes a ternary seed, so the expiring line appends on both branches; `expiringRank` stays unconditioned on `assemblable`, so the ranking signal and the reason text now agree by construction rather than by luck. This also closes the round-1 gap where the recommender ranked on a signal the UI never stated. Fence updated. **Verified:** gating the reason on `assemblable` now fails a test (it survived before).
- **FIX 4 — four minor survivors closed.** (a) Dropping `"in stock"` whenever `expiringItemName != null` survived — the two were never asserted together; the day-0 test gained `toContain("in stock")` and the new full-array test covers it. (b) Reason arrays were pinned by substring everywhere, so appending junk to the `missing N` branch and **swapping the prep-reason/stock-reason order** in `extraReasons` both survived — display order is user-visible; one `toEqual` on a complete four-element reason array (`["next: dinner", "8 min — over your prep budget", "in stock", "uses Kefir — expires in 4d"]`) now pins content *and* order. (c) The emergency sort's calorie **tie** was unguarded: inserting `a.stockRank - b.stockRank` after the calorie term survived, directly beneath a comment telling readers not to make that sort availability-aware. Equal-calorie emergency meals are unremarkable at ~50 meals; a two-meal tie now asserts the name tiebreak still decides.
- **FIX 5 (PLAN DEFECT) — the test named `absent map = bit-for-bit prior behavior` does not test that, and cannot fail.** `{ ...input(...), stockByMealId: undefined }` and `input(...)` are the same value under TS optional-property semantics, so it compares a result to itself. **The plan's Step 1 fence is left byte-verbatim and the test is not edited** — instead a new test immediately after it carries the correction in a comment and makes the assertions that have teeth: with no map the order is exactly Phase 3's `raw` desc, no reason mentions stock, and an **empty** map is `toEqual` an absent one (a genuine comparison of two different inputs). The load-bearing bit-compat evidence remains what it always was: **231 pre-existing tests passing byte-unmodified**.

**Round-2 mutant table.** Every entry applied individually, run, reverted; `git status --porcelain` clean before committing.

| Mutant | Before round 2 | After |
|---|---|---|
| `.get(m.meal.slug)` | **SURVIVED** 81/81 | KILLED (14) |
| `.get(m.meal.name)` | **SURVIVED** 81/81 | KILLED (2) |
| swap `stockRank`/`expiringRank` order | **SURVIVED** 81/81 | KILLED (1) |
| `expiringRank &&= info.assemblable` | **SURVIVED** 81/81 | KILLED (1) |
| expiring *reason* gated on `assemblable` | **SURVIVED** | KILLED (1) |
| drop `"in stock"` when expiring | **SURVIVED** | KILLED (1) |
| append junk to the `missing N` reason | **SURVIVED** | KILLED (1) |
| swap prep/stock order in `extraReasons` | **SURVIVED** | KILLED (1) |
| emergency calorie tie made availability-aware | **SURVIVED** | KILLED (1) |

All 18 round-1 mutants were **re-run after the FIX 3 source change** and still die (M1 kills 8, M13 kills 9, the rest 1–3 each). Final: `tsc` 0 errors, **9 suites / 250 tests**, test-file diff still additions-only apart from the one `scored()` fixture line.

**Recorded, deliberately not fixed:**

- **The item-less-meal seam is doubly unpinned *here*, and Task 10 must not assume otherwise.** Both `missingCount <= 1` (in the pluralization ternary) and deriving `stockRank` from `missingCount === 0` survive against this suite. Round 1 correctly routed the decision to Task 10 — but **whichever way Task 10 decides, no test in `eatNext.test.ts` will notice**, so Task 10 must land its pinning test *here* as well as against the map builder. Without that, the decision is unenforced on both sides of the seam.
- **Two provably equivalent mutants — do not re-run them.** (a) `expiringRank`'s default `1` → `0` for a missing map entry: `stockRank: 1` is produced *only* by `info === undefined`, so every member of that tier receives whatever value the mutant assigns and the term can never separate two of them. (b) `expiringDaysLeft != null` in place of `expiringItemName != null`: `stockState.ts:174-177` assigns both inside one branch, so they are always both null or both set. Neither is a coverage hole.
- **Spec §9 line 135's parenthetical is literally unsatisfiable, and this task resolves it as a *reading*.** "(also inherited by the nudge body via the top pick)" implies the nudge body carries reasons; the body template (`eatNext.ts:538-544`) has no reasons slot and never had one — it renders `~{gap} cal to go — {name} fixes it in {n} min`. Plan `:1431` silently resolves this as **ordering** inheritance (the nudge's pick comes from the same `rank()`, so it inherits availability-awareness without inheriting reason text), which is what the implementation does and is almost certainly what §9 meant. Naming it here because it *is* an interpretation, not a literal reading, and the next person to compare spec to code will trip on the same line.
- **Round 1 understated one of its own changes.** It called the fence's `if (info.expiringItemName)` → `!= null` tightening "a legibility fix, not a behavior change". It is a behavior change when `expiringItemName === ""`: under truthiness the reason drops while `expiringRank` — already `!= null` — still ranks the meal 0, which is precisely the "ranks on a signal the UI doesn't state" divergence FIX 3 exists to remove. The change is correct; the characterization was too modest. **Task 11 sweep item:** `MealDetail.tsx:115` still gates on truthiness of the same field, so the two surfaces disagree again for the empty-string case.

### Task 10

Step 1's mapping block landed **token-for-token identical to the plan's fence** — verified mechanically, by extracting both the `assessAssemblability({…})` call and the four-field payload from the landed source with a regex, tokenising each (71 tokens for the call), and comparing the token lists programmatically. Not by eye. What changed is the block's **container**, and one added line. No database-connecting command was run at any point. Gates on the final tree: `tsc --noEmit` **0 errors**; **9 Jest suites / 255 tests** (was 250 — +5, all additive; `git diff --numstat` on both test files is `133 0` and `25 0`, i.e. **zero deletions, every pre-existing test byte-unmodified**).

**Also verified before coding, not inherited:** the Task 8 review's claim that `useEatNext.ts` contained **zero** occurrences of the string `inventory` (`grep -c` → `0`), so this task adds the file's first read of `library.inventory` — indirectly, via `buildStockByMealId(library)`. And `grep -rn "recommendEatNext" src app` returns exactly **one** call site outside `eatNext.ts` and its test: `useEatNext.ts:295`. The nudge is **not** a second caller — `eatNudgeService.ts` consumes the `nudge` field of this hook's `EatNextResult` and only *mentions* `recommendEatNext` in a comment; the nudge's own candidate picks happen **inside** `recommendEatNext`, and Task 9 already forwarded the map to both of them. So one call site, and wiring it makes every surface and the scheduler availability-aware at once.

**🚩 DECISION (assigned to this task by Task 9's hand-off) — an ITEM-LESS meal is OMITTED from the map, i.e. `stockRank: 1` (unknown), not `2` (known-missing).**

`assessAssemblability` defines `assemblable = items.length > 0 && missing.length === 0`, so an item-less meal is the **one** input for which "not assemblable" and "nothing missing" are simultaneously true. Left alone it ranks 2 and renders `missing 0 ingredients`. Item-less meals are live state, not hypothetical: `updateMeal`'s delete-then-reinsert is non-atomic and its own comment says so (`mealLibrary.ts:310-313`).

- **Rank 2 is a claim with no evidence behind it.** The `Candidate` docstring defines 2 as "known-missing … one we've positively established the user can't make". For a meal with no recorded ingredients we established nothing — `missing` is empty because there was nothing to check, not because nothing is missing. Beyond being wrong about this meal, it makes the tier's own definition untrue for one of its members.
- **Rank 0 is the opposite over-claim and is strictly the worst option.** It would render `in stock` about a meal we cannot verify and promote a corrupt record *above* meals we positively confirmed the user can assemble.
- **Rank 1 is the literal epistemic state** — and it is exactly what this map's existing "no entry = unknown" semantics already mean, so it needs no new field, no tri-state, and creates no second way to be unknown. Omission also drops the reason string **for free**, which is why this is not the "string-formatter patch that hides a ranking question" the hand-off warned against: the ranking decision and the copy fix are the same one-line change, and they cannot drift apart.
- **It keeps the app self-consistent.** Task 8's FIX 1 fixed the identical divergence in `MealDetail` by gating on the missing LIST rather than the verdict, so `MealDetail` already renders nothing for an item-less meal. Omitting here means the recommender also says nothing. Ranking it 2 would have been a third rendering of one state.
- **The honest failure mode.** Under rank 1 a broken meal can surface above a real meal the user genuinely can't assemble — and surfacing it is the *recovery path*, since `updateMeal`'s comment notes item-less meals are "visible in the UI and recoverable by re-editing". Under rank 2 it is buried in the bottom tier behind copy (`missing 0 ingredients`) that any user reads as a rendering bug and ignores. (Containment: an item-less meal has 0 calories, so it is band-filtered out of `catch_up` entirely and sinks on `raw` elsewhere. Rank 1 does not put it anywhere near the top of a real recommendation set.)

**🚨 DEVIATION — the builder moved out of `useEatNext.ts` into an exported `buildStockByMealId` in `eatNext.ts`. Forced by the hand-off, not preference.** Task 9's amendment requires this task to *"land its pinning test … as well as against the map builder"*, and separately Task 9 round 2's FIX 1 proved the lookup key fails **silently** on both sides (`.get(m.meal.slug)` left 81/81 green). `useEatNext.ts` is a React hook and this repo's Jest run covers pure TS libs only, so the plan's inline placement would have left **both** the key and the DECISION above structurally unpinnable — the plan would have mandated a test it also made impossible to write. `eatNext.ts` was chosen over `stockState.ts` or a new module because it already owns `EatNextStockInfo` and already imports `MealWithItems`, its test file is the one the hand-off names, and — the real point — it puts the **write** side of the key seam ~200 lines from the **read** side (`candidate()`'s `.get(m.meal.id)`) in one file, reviewable together. Cost: `eatNext.ts` gains a value import of `stockState.ts` (pure → pure, one-directional, no cycle: nothing in `stockState.ts` imports `eatNext.ts`). A narrow structural `StockAssessmentMeal` (`id` + `items[].saved_food_id` + `items[].savedFood.{name,barcode}`) keeps `eatNext.ts` from taking on the meal-library surface and makes the test fixture three fields instead of a full `Meal` plus a full `SavedFood`; `MealWithItems[]` is assignable to it with no cast.

**Mutation table.** Every mutant applied individually to `eatNext.ts`, run against `npx jest eatNext.test.ts`, then reverted; `git status --porcelain` confirmed free of residue before committing. "Before" = the tree with the plan's Step 1 only (89 tests); "After" = final (90).

| # | Mutant | Before | After |
|---|---|---|---|
| A | **write key** `map.set(meal.id, …)` → `map.set(meal.items[0].saved_food_id, …)` | KILLED (3) | KILLED (3) |
| B | **read key** `.get(m.meal.id)` → `.get(m.meal.slug)` | KILLED (16) | KILLED (16) |
| C | **delete the `items.length === 0` skip** (the DECISION) | KILLED (1) | KILLED (1) |
| D | `missingCount: a.missing.length` → `0` | KILLED (2) | KILLED (2) |
| E | `expiringItemName` dropped to `null` | KILLED (1) | KILLED (1) |
| K | `expiringDaysLeft` dropped to `null` | KILLED (1) | KILLED (1) |
| J | skip condition inverted (`> 0`) | KILLED (3) | KILLED (3) |
| F | **`stockRank` from `missingCount === 0`** instead of `assemblable` | **SURVIVED** | KILLED (1) |
| I | **pluralization `missingCount <= 1`** instead of `=== 1` | **SURVIVED** | KILLED (1) |
| H | builder's `assemblable: a.assemblable` → `a.missing.length === 0` | SURVIVED | **SURVIVED — provably equivalent** |

- **B is the seam mutation the task demanded, and it confirms the two sides agree.** `.get(m.meal.slug)` killed **16** tests — the 14 Task 9 round 2 established plus **2** added here, i.e. the new builder tests independently re-pin the read key. A alone proves the write key: without it, keying by `saved_food_id` would pass, because the fixture deliberately names saved foods `sf-*` while meals are `m{n}` — the same fixture-collision that let `.get(m.meal.slug)` survive 81 tests in round 1.
- **F and I are exactly the two survivors Task 9's amendment predicted** ("*whichever way Task 10 decides, no test in `eatNext.test.ts` will notice*"), and killing them is the other half of the hand-off. Both are unreachable from `buildStockByMealId` once the skip exists — `{assemblable: false, missingCount: 0}` is no longer producible — but `EatNextStockInfo` is an exported optional public input, so the value stays constructible. The new counterfactual test hands it in directly and asserts the two things that follow: `stockRank` derives from the **verdict** (a rank-2 meal with the highest raw still loses to an in-stock one), and the copy pluralises at zero. Read as documentation of what the DECISION avoids, not endorsed behavior.
- **H is a genuine equivalent mutant — do not chase it.** `a.assemblable` and `a.missing.length === 0` disagree on exactly one input, `items.length === 0`, and the `continue` above returns before that line. That the mutant *is* equivalent is the DECISION working: at this boundary the divergent predicate no longer has a divergent input.

**⚠️ RESIDUAL GAP, measured rather than assumed — the hook's own wiring is still unpinned, and nothing in this repo can pin it.** Deleting *both* the `buildStockByMealId(library)` line and the `stockByMealId,` argument from `useEatNext.ts` leaves `tsc` at **0 errors** (the field is optional; `noUnusedLocals` is off, so even the orphaned import passes) and **255/255 tests green**. Verified by applying it, not inferred. Extraction shrank the exposure — the untested surface went from ~25 lines of inline logic to a two-token call site whose absence is obvious on sight — but it did not remove it. Closing it would need a hook-level test harness, which this repo does not have and which is out of Phase 4's scope. Recorded so Task 13's sweep can eyeball those two lines rather than trust the suite.

**Verified and deliberately left alone:**

- **`MealLibraryModal`'s `assemblabilityById` is NOT shared, and duplicating the work is correct.** They compute the same predicate over the same inputs but are not the same value: the modal holds `MealAssemblability` because it renders the missing item **names** and filters `inStockOnly` on the verdict; this holds the four-field `EatNextStockInfo` and feeds a comparator. Their lifetimes differ more than their shapes — the modal's is a `useMemo` keyed on that modal's own `data`, alive while a sheet is open; this one is a per-`load` local in a hook whose consumers include the background nudge scheduler and which refetches on focus and after every meal write. Sharing would mean a cache coupling two independent fetch lifetimes, whose staleness bugs would be silent, to save arithmetic that is already free (below). `MealBuilder` holds a third copy for a third reason (a draft meal that has no row yet). Duplicate computation, single **definition** — all three call the one `assessAssemblability`.
- **Cost and cadence are a non-issue at this scale, stated plainly.** ~50 meals × ~10 items × ~25 inventory rows ≈ 12.5k pure array/Map operations per build, sub-millisecond, and dwarfed by the six-query round trip that produced its inputs. It runs **once per `load`** — mount, `refreshKey` bump, screen focus, and after every meal write — never per render. It is deliberately inside `load` rather than a `useMemo`: its inputs are the response just awaited, so anything coarser would rank fresh meals against stale inventory. If the library ever reaches a size where this matters, the fix is to hoist `resolveInventoryMatches`' per-item concept index out of the per-meal loop inside `assessAssemblability`, not to cache the map.
- **The plan's fence compiles as written.** Checked explicitly, because `new Map(arr.map(() => [k, v]))` is a classic place for TS to infer `(string | T)[]` instead of a tuple: pasted verbatim into a scratch file and annotated `: Map<string, EatNextStockInfo>`, it type-checks. The container change is not a bug fix.
- **The `goal_hit` protein-short gap Task 9 recorded is unchanged by this task** — that site builds its `EatNextRecommendation` inline and never consults the map, so wiring the map does not reach it. Still the known gap Task 9 named.
