# Nutrition Loop Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Nutrition Loop Hub — a read-only screen off Track showing the closed loop as a station pipeline with live engine data, per `docs/superpowers/specs/2026-08-01-nutrition-loop-hub-design.md` (incl. its §4.2 pre-execution revision).

**Architecture:** Pure `loopStatus.ts` engine (TDD) → `useLoopHub` hook composing shipped fetchers + the `useEatNext` result → four dumb components built from `ui/` primitives → route + Track-hub entry. Zero DB work, zero mutations.

**Tech Stack:** React Native (Expo SDK 54), TypeScript strict, expo-router, lucide-react-native, Jest (node env — engine only).

---

## ⛔ Preconditions

- Branch `loop-hub/flow` off `main` (must include spec `70b06dd` and this plan's commit).
- Baseline: `cd mobile && npx tsc --noEmit` → 0 errors; `npm test` → all green (12+ suites / 321+ tests — record actuals).
- Spec is **append-only**; deviations found in review go in "⚠️ Execution amendments" below, same commit as the fix. Mutation-test every threshold/comparator change.
- This plan was written against `main` at `70b06dd`. **Task 1 Step 0 verifies the handful of field names the plan could not pin** (listed there). If any differ, adjust the code accordingly and record one amendment covering the set.
- No database-connecting commands anywhere. Nothing in this plan touches Supabase schema; all reads go through shipped fetchers.

Simulator verification (controller-run, Tasks 7–9): dedicated sim `iPhone 17 Pro (FitTracker)` UDID `3B0EBB05-97BE-4325-91D2-C28FFEA2EF11`, Metro on port **8090** (never 8081). Setup/rebuild commands are in `docs/superpowers/plans/2026-08-01-fittracker-style-guide.md` §Preconditions — same recipe. Hub route deep link: `fittracker://track/loop`.

## File structure

```
mobile/src/lib/loopStatus.ts                       # NEW — engine (pure)
mobile/src/lib/__tests__/loopStatus.test.ts        # NEW — engine tests
mobile/src/hooks/useLoopHub.ts                     # NEW — fetch composition
mobile/src/components/track/loop/Connector.tsx     # NEW
mobile/src/components/track/loop/StationRow.tsx    # NEW
mobile/src/components/track/loop/StationDetailSheet.tsx  # NEW
mobile/src/components/track/loop/LoopHubScreen.tsx # NEW
mobile/app/(tabs)/track/loop.tsx                   # NEW — route
mobile/src/components/ui/Screen.tsx                # MODIFY — +refreshControl prop
mobile/app/(tabs)/track/_layout.tsx                # MODIFY — +Stack.Screen "loop"
mobile/app/(tabs)/track/index.tsx                  # MODIFY — +entry card above nutrition grid
```

---

### Task 1: Engine part A — types, constants, stations 1–3

**Files:**
- Create: `mobile/src/lib/loopStatus.ts`
- Test: `mobile/src/lib/__tests__/loopStatus.test.ts`

- [ ] **Step 0: Verify the unpinnable field names** (record results; amend if they differ from the plan's assumptions)

```bash
cd mobile
grep -n "raw" src/lib/mealScore.ts | head -20          # computeBrianScore return: expect fields `raw` and `score`
grep -n "purchased" src/types/track.ts                  # ShoppingListItem purchased flag: expect `purchased: boolean` (or similar)
grep -n "export function eatNextStockBadge" -A4 src/lib/eatNext.ts   # exact params
grep -n "interface ShoppingListItem" -A15 src/types/track.ts
```

- [ ] **Step 1: Write failing tests for stations 1–3** (fixture builders + assertions; file grows in Task 2)

```ts
// mobile/src/lib/__tests__/loopStatus.test.ts
import {
  computeLoopStatus,
  DETAIL_MAX_ROWS,
  type LoopStatusInputs,
} from "../loopStatus";
import type { ItemStockState } from "../stockState";
import type { EatNextStockInfo } from "../eatNext";

const state = (over: Partial<ItemStockState> = {}): ItemStockState => ({
  totalQuantity: 3, readyQuantity: 3, storageQuantity: 0,
  isOut: false, isLow: false, needsFridgeRestock: false,
  expiration: null, daysLeft: null, ...over,
});

const stock = (over: Partial<EatNextStockInfo> = {}): EatNextStockInfo => ({
  assemblable: true, missingCount: 0,
  expiringItemName: null, expiringDaysLeft: null, ...over,
});

const baseInputs = (): LoopStatusInputs => ({
  todayLocalDate: "2026-08-01",
  inventory: [
    { id: "i1", name: "Eggs", state: state() },
    { id: "i2", name: "Bananas", state: state({ totalQuantity: 0, isOut: true }) },
    { id: "i3", name: "Milk", state: state({ expiration: "soon", daysLeft: 2 }) },
  ],
  meals: [
    { id: "m1", name: "Banana + PB" },
    { id: "m2", name: "Korean Beef Bowl" },
  ],
  mealScores: [
    { mealId: "m1", name: "Banana + PB", raw: 80, display: 84 },
    { mealId: "m2", name: "Korean Beef Bowl", raw: 90, display: 95 },
  ],
  stockByMealId: new Map([
    ["m1", stock({ assemblable: false, missingCount: 2 })],
    ["m2", stock()],
  ]),
  eatNext: {
    context: "next_meal",
    message: null,
    recommendations: [
      { mealId: "m2", name: "Korean Beef Bowl", reasons: [], calories: 640,
        protein: 45, prepMinutes: 10, score: 95, stock: stock() },
      { mealId: "m1", name: "Banana + PB", reasons: [], calories: 295,
        protein: 11, prepMinutes: 2, score: 84,
        stock: stock({ assemblable: false, missingCount: 2 }) },
    ],
    nudge: null,
  },
  paceCalories: { status: "behind", delta: 400, catchUpAmount: 400, catchUpLabel: "dinner (6 PM)" },
  paceProtein: { status: "on_pace" },
  totals: { calories: 900, protein: 60 },
  goals: { calories: 2300, protein: 160 },
  rates: new Map([["i1", { ratePerDay: 2, daysUntilOut: 2 }]]),
  suggestions: [
    { name: "Bananas", priority: 1, reasons: ["out of stock"] },
    { name: "Spinach", priority: 1, reasons: ["needed for Teriyaki Bowl"] },
  ],
  listRows: [
    { vendor_id: "v1", purchased: false },
    { vendor_id: "v1", purchased: false },
    { vendor_id: null, purchased: true },
  ],
  vendors: [{ id: "v1", name: "Costco" }],
});

describe("station 1: inventory", () => {
  it("counts items, out, expiring; danger badge wins when anything is out", () => {
    const s = computeLoopStatus(baseInputs()).stations[0];
    expect(s.key).toBe("inventory");
    expect(s.headline).toBe("3 items · 1 out · 1 expiring");
    expect(s.badge).toEqual({ label: "1 out", tone: "danger" });
    expect(s.attention).toBe(true);
    expect(s.connector).toBe("assemblability → 1 of 2 meals ready");
    expect(s.destination).toBe("/(tabs)/track/food-inventory");
  });
  it("warning badge when only expiring; success when clean", () => {
    const inp = baseInputs();
    inp.inventory = [
      { id: "i3", name: "Milk", state: state({ expiration: "soon", daysLeft: 2 }) },
    ];
    expect(computeLoopStatus(inp).stations[0].badge)
      .toEqual({ label: "1 expiring", tone: "warning" });
    inp.inventory = [{ id: "i1", name: "Eggs", state: state() }];
    const s = computeLoopStatus(inp).stations[0];
    expect(s.badge).toEqual({ label: "Stocked", tone: "success" });
    expect(s.attention).toBe(false);
  });
  it("expired band counts as expiring; 'later' does not", () => {
    const inp = baseInputs();
    inp.inventory = [
      { id: "a", name: "A", state: state({ expiration: "expired", daysLeft: null }) },
      { id: "b", name: "B", state: state({ expiration: "later", daysLeft: 20 }) },
    ];
    expect(computeLoopStatus(inp).stations[0].headline).toBe("2 items · 0 out · 1 expiring");
  });
  it("detail: out names as danger chips, expiring lines soonest-first, expired shows 'expired'", () => {
    const inp = baseInputs();
    inp.inventory = [
      { id: "a", name: "Oats", state: state({ expiration: "expired", daysLeft: null }) },
      { id: "b", name: "Milk", state: state({ expiration: "soon", daysLeft: 2 }) },
      { id: "c", name: "Bananas", state: state({ totalQuantity: 0, isOut: true }) },
    ];
    const d = computeLoopStatus(inp).stations[0].detail;
    expect(d.chips[0]).toEqual({ label: "Bananas", tone: "danger" });
    expect(d.lines[0]).toEqual({ label: "Oats", value: "expired" });
    expect(d.lines[1]).toEqual({ label: "Milk", value: "2d left" });
  });
});

describe("station 2: library", () => {
  it("headline names the top meal by RAW score with its display score", () => {
    const s = computeLoopStatus(baseInputs()).stations[1];
    expect(s.headline).toBe("2 meals · top: Korean Beef Bowl 95");
    expect(s.badge).toEqual({ label: "1 ready", tone: "success" });
    expect(s.attention).toBe(false);
  });
  it("0 ready with meals present = warning + attention; empty library = build prompt", () => {
    const inp = baseInputs();
    inp.stockByMealId = new Map([
      ["m1", stock({ assemblable: false, missingCount: 2 })],
      ["m2", stock({ assemblable: false, missingCount: 1 })],
    ]);
    const s = computeLoopStatus(inp).stations[1];
    expect(s.badge).toEqual({ label: "0 ready", tone: "warning" });
    expect(s.attention).toBe(true);
    inp.meals = []; inp.mealScores = []; inp.stockByMealId = new Map();
    const empty = computeLoopStatus(inp).stations[1];
    expect(empty.headline).toBe("0 meals — build your library");
    expect(empty.attention).toBe(false);
  });
});

describe("station 3: eat next", () => {
  it("headline from the top recommendation; success badge when in stock", () => {
    const s = computeLoopStatus(baseInputs()).stations[2];
    expect(s.headline).toBe("Korean Beef Bowl · 640 cal · 10 min");
    expect(s.badge).toEqual({ label: "In stock", tone: "success" });
    expect(s.attention).toBe(false);
    expect(s.detail.footnote).toBe("Runner-up: Banana + PB · 295 cal · Missing 2");
  });
  it("warning badge + missing-name chips when the pick is missing items", () => {
    const inp = baseInputs();
    inp.eatNext!.recommendations = [inp.eatNext!.recommendations[1]];
    const s = computeLoopStatus(inp).stations[2];
    expect(s.badge).toEqual({ label: "Missing 2", tone: "warning" });
    expect(s.attention).toBe(true);
  });
  it("no result yet → em-dash headline, no badge, no attention", () => {
    const inp = baseInputs();
    inp.eatNext = null;
    const s = computeLoopStatus(inp).stations[2];
    expect(s.headline).toBe("—");
    expect(s.badge).toBeNull();
    expect(s.attention).toBe(false);
  });
  it("engine message shown when there are no recommendations", () => {
    const inp = baseInputs();
    inp.eatNext = { context: "goal_hit", message: "Goal hit — nothing needed", recommendations: [], nudge: null };
    expect(computeLoopStatus(inp).stations[2].headline).toBe("Goal hit — nothing needed");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd mobile && npx jest src/lib/__tests__/loopStatus.test.ts`
Expected: FAIL — cannot find module `../loopStatus`.

- [ ] **Step 3: Implement types, constants, and stations 1–3**

```ts
// mobile/src/lib/loopStatus.ts
// Pure projection of the Nutrition OS loop: six StationStatus entries built
// from data the shipped engines already computed. No fetching, no fabrication:
// forecast entries absent from `rates` (honesty gates) are simply absent here,
// and Eat Next stock display mirrors eatNextStockBadge's contract rather than
// re-deriving from `reasons` (the Phase 4 Task 14 lesson).
import type { ItemStockState } from "./stockState";
import type { EatNextResult, EatNextStockInfo } from "./eatNext";
import { eatNextExpiringLine } from "./eatNext";
import type { MealPaceState } from "./mealPace";
import type { ConsumptionEstimate } from "./consumptionRate";
import { MAX_DISPLAY_DAYS } from "./consumptionRate";
import { FORECAST_LEAD_DAYS } from "./shoppingDemand";

export type StationKey = "inventory" | "library" | "eatNext" | "pace" | "forecast" | "shopping";
/** Structurally a subset of ui/Badge's BadgeTone — the engine must not import
 *  from src/components (layering rule; see Phase 5 amendments). */
export type StationTone = "warning" | "danger" | "success" | "neutral" | "inventory" | "shopping" | "meals" | "brand";

export interface StationChip { label: string; tone: StationTone }
export interface StationDetailLine { label: string; value: string }
export interface StationDetail {
  lines: StationDetailLine[];
  chips: StationChip[];
  footnote: string | null;
}

export type LoopDestination =
  | "/(tabs)/track/food-inventory"
  | "/(tabs)/track/meals"
  | "/(tabs)/track/shopping";

export interface StationStatus {
  key: StationKey;
  title: string;
  headline: string;
  badge: StationChip | null;
  attention: boolean;
  connector: string;
  detail: StationDetail;
  destination: LoopDestination;
  destinationLabel: string;
}

export interface LoopStatus { stations: StationStatus[]; attentionCount: number }

export interface LoopStatusInputs {
  todayLocalDate: string;
  inventory: Array<{ id: string; name: string; state: ItemStockState }>;
  meals: Array<{ id: string; name: string }>;
  /** ranked source for station 2; useLoopHub computes via the pure scoring trio */
  mealScores: Array<{ mealId: string; name: string; raw: number; display: number }>;
  stockByMealId: Map<string, EatNextStockInfo>;
  eatNext: EatNextResult | null;
  paceCalories: MealPaceState;
  paceProtein: MealPaceState;
  totals: { calories: number; protein: number };
  goals: { calories: number | null; protein: number | null };
  rates: Map<string, ConsumptionEstimate>;
  suggestions: Array<{ name: string; priority: 1 | 2 | 3; reasons: string[] }>;
  listRows: Array<{ vendor_id: string | null; purchased: boolean }>;
  vendors: Array<{ id: string; name: string }>;
}

export const DETAIL_MAX_ROWS = 5;

/** Row-order context labels for station 3's detail. */
export const CONTEXT_LABELS: Record<EatNextResult["context"], string> = {
  after_window: "after eating window",
  goal_hit: "goal hit",
  post_workout: "post-workout",
  emergency: "emergency",
  catch_up: "catch-up",
  next_meal: "next meal",
};

const capChips = (chips: StationChip[]): StationChip[] =>
  chips.length <= DETAIL_MAX_ROWS
    ? chips
    : [...chips.slice(0, DETAIL_MAX_ROWS), { label: `+${chips.length - DETAIL_MAX_ROWS} more`, tone: "neutral" }];

const capLines = (lines: StationDetailLine[]): { lines: StationDetailLine[]; overflow: number } =>
  lines.length <= DETAIL_MAX_ROWS
    ? { lines, overflow: 0 }
    : { lines: lines.slice(0, DETAIL_MAX_ROWS), overflow: lines.length - DETAIL_MAX_ROWS };

const isExpiring = (s: ItemStockState): boolean =>
  s.expiration !== null && s.expiration !== "later";

function inventoryStation(inp: LoopStatusInputs, readyCount: number): StationStatus {
  const out = inp.inventory.filter((i) => i.state.isOut);
  const expiring = inp.inventory.filter((i) => isExpiring(i.state));
  const badge: StationChip =
    out.length > 0 ? { label: `${out.length} out`, tone: "danger" }
    : expiring.length > 0 ? { label: `${expiring.length} expiring`, tone: "warning" }
    : { label: "Stocked", tone: "success" };
  const expiringSorted = [...expiring].sort(
    (a, b) => (a.state.daysLeft ?? -1) - (b.state.daysLeft ?? -1),
  );
  const rawLines = expiringSorted.map((i) => ({
    label: i.name,
    value: i.state.expiration === "expired" ? "expired" : `${i.state.daysLeft}d left`,
  }));
  const { lines, overflow } = capLines(rawLines);
  return {
    key: "inventory",
    title: "Inventory",
    headline: `${inp.inventory.length} items · ${out.length} out · ${expiring.length} expiring`,
    badge,
    attention: out.length > 0 || expiring.length > 0,
    connector: `assemblability → ${readyCount} of ${inp.meals.length} meals ready`,
    detail: {
      lines,
      chips: capChips(out.map((i) => ({ label: i.name, tone: "danger" as const }))),
      footnote: overflow > 0 ? `+${overflow} more expiring` : null,
    },
    destination: "/(tabs)/track/food-inventory",
    destinationLabel: "Open Inventory",
  };
}

function libraryStation(inp: LoopStatusInputs, readyCount: number): StationStatus {
  const n = inp.meals.length;
  const top = [...inp.mealScores].sort((a, b) => b.raw - a.raw)[0] ?? null;
  const topThree = [...inp.mealScores].sort((a, b) => b.raw - a.raw).slice(0, 3);
  return {
    key: "library",
    title: "Meal Library",
    headline: n === 0 ? "0 meals — build your library"
      : `${n} meals · top: ${top!.name} ${top!.display}`,
    badge: n === 0 ? null
      : readyCount === 0 ? { label: "0 ready", tone: "warning" }
      : { label: `${readyCount} ready`, tone: "success" },
    attention: n > 0 && readyCount === 0,
    connector: "ranked for right now",
    detail: {
      lines: topThree.map((m) => ({ label: m.name, value: `${m.display} / 100` })),
      chips: capChips(topThree.map((m) => {
        const s = inp.stockByMealId.get(m.mealId);
        return s?.assemblable
          ? { label: `${m.name}: ready`, tone: "success" as const }
          : { label: `${m.name}: missing ${s?.missingCount ?? "?"}`, tone: "warning" as const };
      })),
      footnote: null,
    },
    destination: "/(tabs)/track/meals",
    destinationLabel: "Open Meals",
  };
}

function eatNextStation(inp: LoopStatusInputs): StationStatus {
  const r = inp.eatNext;
  const pick = r?.recommendations[0] ?? null;
  const runnerUp = r?.recommendations[1] ?? null;
  const badge: StationChip | null = !pick || !pick.stock ? null
    : pick.stock.assemblable
      ? { label: "In stock", tone: "success" }
      : { label: `Missing ${pick.stock.missingCount}`, tone: "warning" };
  const missingChips: StationChip[] = []; // names come from station 2's map — see below
  if (pick && pick.stock && !pick.stock.assemblable) {
    // EatNextStockInfo carries a COUNT, not names. Names for the pick's meal are
    // not in any current engine output; the sheet shows the count chip only.
    // (Adding per-meal missing NAMES to EatNextStockInfo is out of scope.)
    missingChips.push({ label: `Missing ${pick.stock.missingCount}`, tone: "warning" });
  }
  return {
    key: "eatNext",
    title: "Eat Next",
    headline: pick ? `${pick.name} · ${pick.calories} cal · ${pick.prepMinutes} min`
      : r?.message ?? "—",
    badge,
    attention: !!pick && !!pick.stock && !pick.stock.assemblable,
    connector: "you eat → units − · log +",
    detail: {
      lines: pick ? [
        { label: "Context", value: r ? CONTEXT_LABELS[r.context] : "—" },
        { label: "Calories", value: String(pick.calories) },
        { label: "Protein", value: `${pick.protein}g` },
        { label: "Prep · Score", value: `${pick.prepMinutes} min · ${pick.score}/100` },
        // spec §5: the shipped expiring line, when present (verify exact param
        // shape in Task 1 Step 0 — the helper may take (stock) or (stock, …))
        ...(() => {
          const exp = eatNextExpiringLine(pick.stock);
          return exp ? [{ label: "Expiring", value: exp }] : [];
        })(),
      ] : [],
      chips: missingChips,
      footnote: runnerUp
        ? `Runner-up: ${runnerUp.name} · ${runnerUp.calories} cal · ${runnerUp.stock && !runnerUp.stock.assemblable ? `Missing ${runnerUp.stock.missingCount}` : "In stock"}`
        : null,
    },
    destination: "/(tabs)/track/meals",
    destinationLabel: "Open Meals",
  };
}
```

(Stations 4–6 + `computeLoopStatus` land in Task 2 — until then add a temporary
`export function computeLoopStatus(): never { throw new Error("not implemented"); }`
ONLY if you want tsc green mid-task; otherwise proceed straight to Task 2 before running tsc.)

- [ ] **Step 4: Run tests** — station 1–3 describes still fail (no `computeLoopStatus`); that's expected. Do **not** commit yet; Tasks 1–2 commit together as the engine.

---

### Task 2: Engine part B — stations 4–6, assembly, remaining tests

**Files:**
- Modify: `mobile/src/lib/loopStatus.ts`
- Test: `mobile/src/lib/__tests__/loopStatus.test.ts` (append)

- [ ] **Step 1: Append failing tests**

```ts
describe("station 4: pace", () => {
  it("behind on either macro wins: warning badge + attention", () => {
    const s = computeLoopStatus(baseInputs()).stations[3];
    expect(s.headline).toBe("900 / 2,300 cal · 60 / 160g protein");
    expect(s.badge).toEqual({ label: "Behind", tone: "warning" });
    expect(s.attention).toBe(true);
    expect(s.detail.lines).toContainEqual({ label: "Catch up", value: "400 cal by dinner (6 PM)" });
  });
  it("goal hit on both; on-pace otherwise; window states are neutral", () => {
    const inp = baseInputs();
    inp.paceCalories = { status: "goal_hit" }; inp.paceProtein = { status: "goal_hit" };
    expect(computeLoopStatus(inp).stations[3].badge).toEqual({ label: "Goal hit", tone: "success" });
    inp.paceProtein = { status: "ahead", delta: 20 };
    expect(computeLoopStatus(inp).stations[3].badge).toEqual({ label: "On pace", tone: "success" });
    inp.paceCalories = { status: "before_window" }; inp.paceProtein = { status: "before_window" };
    const s = computeLoopStatus(inp).stations[3];
    expect(s.badge).toEqual({ label: "Before window", tone: "neutral" });
    expect(s.attention).toBe(false);
  });
  it("null goals render em-dashes", () => {
    const inp = baseInputs();
    inp.goals = { calories: null, protein: null };
    expect(computeLoopStatus(inp).stations[3].headline).toBe("900 / — cal · 60 / —g protein");
  });
});

describe("station 5: forecast", () => {
  it("most urgent tracked item leads; urgent badge at the lead-days gate", () => {
    const s = computeLoopStatus(baseInputs()).stations[4];
    expect(s.headline).toBe("Eggs ~2d left · 1 item tracked");
    expect(s.badge).toEqual({ label: "1 urgent", tone: "shopping" });
    expect(s.attention).toBe(true);
  });
  it("no urgency at daysUntilOut > FORECAST_LEAD_DAYS; empty rates say so", () => {
    const inp = baseInputs();
    inp.rates = new Map([["i1", { ratePerDay: 0.2, daysUntilOut: 10 }]]);
    const s = computeLoopStatus(inp).stations[4];
    expect(s.badge).toBeNull();
    expect(s.attention).toBe(false);
    inp.rates = new Map();
    expect(computeLoopStatus(inp).stations[4].headline).toBe("no items tracked yet");
  });
  it("skips ids missing from inventory; caps '~Nd' display at MAX_DISPLAY_DAYS", () => {
    const inp = baseInputs();
    inp.rates = new Map([
      ["ghost", { ratePerDay: 1, daysUntilOut: 1 }],
      ["i1", { ratePerDay: 0.01, daysUntilOut: 200 }],
    ]);
    const s = computeLoopStatus(inp).stations[4];
    expect(s.headline).toBe("1 item tracked");        // ghost skipped, 200d > cap → no "~Nd" lead
    expect(s.detail.lines.find((l) => l.label === "Eggs")).toBeUndefined();
  });
});

describe("station 6: shopping + assembly", () => {
  it("headline counts unpurchased rows with vendor breakdown; suggested badge", () => {
    const s = computeLoopStatus(baseInputs()).stations[5];
    expect(s.headline).toBe("2 on list · Costco 2");
    expect(s.badge).toEqual({ label: "2 suggested", tone: "shopping" });
    expect(s.attention).toBe(true);
    expect(s.connector).toBe("purchased → restock ↺ inventory");
  });
  it("unassigned bucket renders last; empty list says so", () => {
    const inp = baseInputs();
    inp.listRows = [
      { vendor_id: null, purchased: false },
      { vendor_id: "v1", purchased: false },
    ];
    expect(computeLoopStatus(inp).stations[5].headline).toBe("2 on list · Costco 1 · unassigned 1");
    inp.listRows = [];
    inp.suggestions = [];
    const s = computeLoopStatus(inp).stations[5];
    expect(s.headline).toBe("0 on list");
    expect(s.badge).toBeNull();
    expect(s.attention).toBe(false);
  });
  it("six stations in fixed order; attentionCount sums attention flags", () => {
    const r = computeLoopStatus(baseInputs());
    expect(r.stations.map((s) => s.key)).toEqual(
      ["inventory", "library", "eatNext", "pace", "forecast", "shopping"],
    );
    expect(r.attentionCount).toBe(4); // inventory, pace, forecast, shopping (eatNext pick is in stock)
  });
  it("detail chips cap at DETAIL_MAX_ROWS with a +N more chip", () => {
    const inp = baseInputs();
    inp.inventory = Array.from({ length: 8 }, (_, i) => ({
      id: `x${i}`, name: `Item ${i}`, state: state({ totalQuantity: 0, isOut: true }),
    }));
    const chips = computeLoopStatus(inp).stations[0].detail.chips;
    expect(chips).toHaveLength(DETAIL_MAX_ROWS + 1);
    expect(chips[DETAIL_MAX_ROWS]).toEqual({ label: "+3 more", tone: "neutral" });
  });
});
```

- [ ] **Step 2: Implement stations 4–6 and the assembly** (append to `loopStatus.ts`)

```ts
const fmt = (n: number): string => n.toLocaleString("en-US");

function paceStation(inp: LoopStatusInputs): StationStatus {
  const { paceCalories: pc, paceProtein: pp } = inp;
  const behind = pc.status === "behind" || pp.status === "behind";
  const bothGoal = pc.status === "goal_hit" && pp.status === "goal_hit";
  const anyPaceish = ["on_pace", "ahead", "goal_hit"].includes(pc.status)
    || ["on_pace", "ahead", "goal_hit"].includes(pp.status);
  const windowLabel = pc.status === "before_window" ? "Before window" : "Day done";
  const badge: StationChip = behind ? { label: "Behind", tone: "warning" }
    : bothGoal ? { label: "Goal hit", tone: "success" }
    : anyPaceish ? { label: "On pace", tone: "success" }
    : { label: windowLabel, tone: "neutral" };
  const goalStr = (g: number | null) => (g === null ? "—" : fmt(g));
  const lines: StationDetailLine[] = [
    { label: "Calories", value: `${fmt(inp.totals.calories)} / ${goalStr(inp.goals.calories)} · ${pc.status}` },
    { label: "Protein", value: `${inp.totals.protein}g / ${goalStr(inp.goals.protein)}g · ${pp.status}` },
  ];
  const catchUps = [pc, pp].filter((p) => p.status === "behind" && p.catchUpAmount != null);
  for (const p of catchUps) {
    lines.push({
      label: "Catch up",
      value: `${p.catchUpAmount} ${p === pc ? "cal" : "g"} by ${p.catchUpLabel ?? "end of day"}`,
    });
  }
  return {
    key: "pace",
    title: "Today's Pace",
    headline: `${fmt(inp.totals.calories)} / ${goalStr(inp.goals.calories)} cal · ${inp.totals.protein} / ${goalStr(inp.goals.protein)}g protein`,
    badge,
    attention: behind,
    connector: "meal_logs → consumption rates",
    detail: { lines, chips: [], footnote: null },
    destination: "/(tabs)/track/meals",
    destinationLabel: "Open Meals",
  };
}

function forecastStation(inp: LoopStatusInputs): StationStatus {
  const nameById = new Map(inp.inventory.map((i) => [i.id, i.name]));
  const tracked = [...inp.rates.entries()]
    .filter(([id]) => nameById.has(id))
    .map(([id, est]) => ({ name: nameById.get(id)!, ...est }))
    .sort((a, b) => a.daysUntilOut - b.daysUntilOut);
  const urgent = tracked.filter((t) => t.daysUntilOut <= FORECAST_LEAD_DAYS);
  const first = tracked[0] ?? null;
  const itemWord = (n: number) => (n === 1 ? "item" : "items");
  const headline = tracked.length === 0 ? "no items tracked yet"
    : first!.daysUntilOut <= MAX_DISPLAY_DAYS
      ? `${first!.name} ~${first!.daysUntilOut}d left · ${tracked.length} ${itemWord(tracked.length)} tracked`
      : `${tracked.length} ${itemWord(tracked.length)} tracked`;
  const { lines, overflow } = capLines(
    tracked
      .filter((t) => t.daysUntilOut <= MAX_DISPLAY_DAYS)
      .map((t) => ({ label: t.name, value: `~${t.daysUntilOut}d left` })),
  );
  return {
    key: "forecast",
    title: "Forecast",
    headline,
    badge: urgent.length > 0 ? { label: `${urgent.length} urgent`, tone: "shopping" } : null,
    attention: urgent.length > 0,
    connector: "gaps + forecasts → suggestions",
    detail: { lines, chips: [], footnote: overflow > 0 ? `+${overflow} more tracked` : null },
    destination: "/(tabs)/track/shopping",
    destinationLabel: "Open Shopping",
  };
}

function shoppingStation(inp: LoopStatusInputs): StationStatus {
  const active = inp.listRows.filter((r) => !r.purchased);
  const vendorName = new Map(inp.vendors.map((v) => [v.id, v.name]));
  const byVendor = new Map<string, number>();
  let unassigned = 0;
  for (const r of active) {
    if (r.vendor_id === null || !vendorName.has(r.vendor_id)) unassigned += 1;
    else byVendor.set(r.vendor_id, (byVendor.get(r.vendor_id) ?? 0) + 1);
  }
  const parts = [...byVendor.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${vendorName.get(id)} ${n}`);
  if (unassigned > 0) parts.push(`unassigned ${unassigned}`);
  const s = inp.suggestions.length;
  const { lines, overflow } = capLines(
    inp.suggestions.map((sg) => ({ label: sg.name, value: sg.reasons[0] ?? "" })),
  );
  return {
    key: "shopping",
    title: "Shopping",
    headline: `${active.length} on list${parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}`,
    badge: s > 0 ? { label: `${s} suggested`, tone: "shopping" } : null,
    attention: s > 0,
    connector: "purchased → restock ↺ inventory",
    detail: { lines, chips: [], footnote: overflow > 0 ? `+${overflow} more suggested` : "restock returns units to Inventory ↺" },
    destination: "/(tabs)/track/shopping",
    destinationLabel: "Open Shopping",
  };
}

export function computeLoopStatus(inp: LoopStatusInputs): LoopStatus {
  const readyCount = [...inp.stockByMealId.values()].filter((s) => s.assemblable).length;
  const stations = [
    inventoryStation(inp, readyCount),
    libraryStation(inp, readyCount),
    eatNextStation(inp),
    paceStation(inp),
    forecastStation(inp),
    shoppingStation(inp),
  ];
  return { stations, attentionCount: stations.filter((s) => s.attention).length };
}
```

Note: when both an overflow and the restock footnote apply to station 6, overflow wins (the ↺ line is decorative; the count is information). That is what the code above does.

- [ ] **Step 3: Run the full engine suite**

Run: `cd mobile && npx jest src/lib/__tests__/loopStatus.test.ts` → all green. Then `npx tsc --noEmit` → 0. Then full `npm test` → green.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/loopStatus.ts mobile/src/lib/__tests__/loopStatus.test.ts
git commit -m "feat(loop-hub): loopStatus engine — six stations, connectors, detail payloads (TDD)"
```

---

### Task 3: `Screen` gains `refreshControl` (additive)

**Files:**
- Modify: `mobile/src/components/ui/Screen.tsx`

- [ ] **Step 1: Add the prop.** In `ScreenProps` after `scroll?: boolean;`:

```ts
  /** Forwarded to the internal ScrollView (scroll=true only). Closes the gap
   *  recorded in the style-guide amendments (pull-to-refresh screens). */
  refreshControl?: React.ReactElement;
```

Destructure `refreshControl` in the component signature, and change the ScrollView open tag to:

```tsx
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing.xxl }]}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
          >
```

- [ ] **Step 2: Gates + commit**

`npx tsc --noEmit` → 0; `npm test` → green.

```bash
git add mobile/src/components/ui/Screen.tsx
git commit -m "feat(ui): Screen accepts a refreshControl for its ScrollView"
```

---

### Task 4: `useLoopHub` hook

**Files:**
- Create: `mobile/src/hooks/useLoopHub.ts`

- [ ] **Step 1: Implement.** Mirrors `useEatNext`'s conventions exactly (stale-while-revalidate, runId guard, `toError`-style normalization — reuse the pattern, and copy the small `toError` helper since it is not exported; note that as acceptable duplication in a comment pointing at `useEatNext.ts:130`).

> ⚠️ **SUPERSEDED — the `computeLoopStatus` call in the snippet below is stale.** It builds a separate `const mealScores = …` and passes both `meals` and `mealScores`; those two inputs are now ONE array, and `todayLocalDate` has been dropped. See "Input shape: `meals` and `mealScores` collapsed" in ⚠️ Execution amendments and use the corrected assembly there. The rest of the snippet (fetch composition, runId guard, pace/profile handling) stands.

```ts
// mobile/src/hooks/useLoopHub.ts
// Data assembly for the Loop Hub (spec §4.2 as revised): composes shipped
// fetchers and takes the useEatNext RESULT as a parameter — LoopHubScreen runs
// both hooks; this one never duplicates useEatNext's assembly.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { fetchInventoryWithState } from "@/src/lib/supabase/inventory";
import { fetchMealLibrary } from "@/src/lib/supabase/mealLibrary";
import { fetchShoppingData } from "@/src/lib/supabase/shopping";
import { computeMealPace } from "@/src/lib/mealPace";
import { sumNutrition } from "@/src/lib/mealMacros";
import { computeBrianScore } from "@/src/lib/mealScore";
import { brianScoreInputFor } from "@/src/lib/mealScoreInput";
import { buildStockByMealId, type EatNextResult } from "@/src/lib/eatNext";
import { computeLoopStatus, type LoopStatus } from "@/src/lib/loopStatus";
import { getLocalDateString } from "@/src/lib/dates";

interface PaceProfileRow {
  target_calories: number | null;
  target_protein_g: number | null;
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  water_window_start: string;
  water_window_end: string;
}
const PACE_PROFILE_SELECT =
  "target_calories, target_protein_g, breakfast_time, lunch_time, dinner_time, water_window_start, water_window_end";

const hhmm = (t: string) => t.slice(0, 5);

export interface UseLoopHubValue {
  status: LoopStatus | null;
  loading: boolean;          // first load only (stale-while-revalidate)
  error: Error | null;
  refetch: () => void;
}

export function useLoopHub(eatNext: EatNextResult | null): UseLoopHubValue {
  const [status, setStatus] = useState<LoopStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const runIdRef = useRef(0);
  // The engine needs the CURRENT eatNext result at compute time, including
  // recomputes triggered by a data refetch that eatNext didn't participate in.
  const eatNextRef = useRef(eatNext);
  eatNextRef.current = eatNext;

  const load = useCallback(async () => {
    const runId = ++runIdRef.current;
    const now = new Date();
    try {
      const today = getLocalDateString(now);
      const [inventory, library, shopping, logs, profile] = await Promise.all([
        fetchInventoryWithState(today),
        fetchMealLibrary(),
        fetchShoppingData(today),
        supabase.from("meal_logs").select("*").eq("date", today),
        supabase.from("profiles").select(PACE_PROFILE_SELECT).maybeSingle(),
      ]);
      const errs = [logs.error, profile.error].filter((e) => e !== null);
      if (errs.length > 0) {
        errs.slice(1).forEach((e) => console.error("useLoopHub (secondary):", e));
        throw errs[0];
      }
      const p = profile.data as PaceProfileRow | null;
      if (!p) throw new Error("No profile row");
      const totals = sumNutrition(logs.data ?? []);
      const mealTimes = {
        breakfast: hhmm(p.breakfast_time), lunch: hhmm(p.lunch_time), dinner: hhmm(p.dinner_time),
      };
      const paceFor = (macro: "calories" | "protein") =>
        computeMealPace({
          currentValue: macro === "calories" ? totals.calories : totals.protein,
          goal: macro === "calories" ? p.target_calories : p.target_protein_g,
          windowStart: hhmm(p.water_window_start),
          windowEnd: hhmm(p.water_window_end),
          mealTimes, macro, now,
        });
      const mealScores = library.meals.map((meal) => {
        const s = computeBrianScore(
          brianScoreInputFor(meal, library.conceptIdsBySavedFoodId, library.conceptsById),
        );
        return { mealId: meal.id, name: meal.name, raw: s.raw, display: s.score };
      });
      const next = computeLoopStatus({
        todayLocalDate: today,
        inventory: inventory.map((i) => ({ id: i.id, name: i.name, state: i.state })),
        meals: library.meals.map((m) => ({ id: m.id, name: m.name })),
        mealScores,
        stockByMealId: buildStockByMealId(library),
        eatNext: eatNextRef.current,
        paceCalories: paceFor("calories"),
        paceProtein: paceFor("protein"),
        totals: { calories: totals.calories, protein: totals.protein },
        goals: { calories: p.target_calories, protein: p.target_protein_g },
        rates: shopping.ratesById,
        suggestions: shopping.suggestions,
        listRows: shopping.listRows,
        vendors: shopping.vendors,
      });
      if (runId !== runIdRef.current) return;
      setError(null);
      setStatus(next);
    } catch (e) {
      console.error("useLoopHub:", e);
      if (runId !== runIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String((e as { message?: unknown })?.message ?? e)));
    } finally {
      if (runId === runIdRef.current) setLoading(false);
    }
  }, []);

  // Recompute when the eatNext result lands/changes (cheap: refetches too, by
  // design — the eatNext result usually changes because data changed).
  useEffect(() => { load(); }, [load, eatNext]);

  return { status, loading, error, refetch: load };
}
```

Implementation notes for the reviewer: (a) verify `computeBrianScore`'s return field names against `mealScore.ts` (Task 1 Step 0) — the plan assumes `.raw` and `.score`; (b) verify `ShoppingListItem`'s purchased field and `FoodInventoryItem.name` vs a display-name field; (c) if `meal_logs` `.select("*")` differs from what `sumNutrition` needs, mirror `useEatNext` exactly; (d) the simplified error normalization is acceptable because `fetchInventoryWithState`/`fetchShoppingData` already throw real errors — if review disagrees, lift `toError` verbatim with attribution.

- [ ] **Step 2: Gates + commit**

`npx tsc --noEmit` → 0; `npm test` → green.

```bash
git add mobile/src/hooks/useLoopHub.ts
git commit -m "feat(loop-hub): useLoopHub composes shipped fetchers with the useEatNext result"
```

---

### Task 5: `Connector` + `StationRow`

**Files:**
- Create: `mobile/src/components/track/loop/Connector.tsx`, `mobile/src/components/track/loop/StationRow.tsx`

- [ ] **Step 1: `Connector.tsx`**

```tsx
// mobile/src/components/track/loop/Connector.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/src/theme/tokens";

export function Connector({ label }: { label: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.line} />
      <Text style={styles.label}>{label} ▾</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.xs,
    // indent to the icon-circle centerline: card padding (12) + half of 34
    paddingLeft: spacing.md + 17,
  },
  line: { width: 2, height: 20, backgroundColor: colors.border },
  label: {
    fontFamily: "Menlo", fontSize: 11, color: colors.textFaint,
  },
});
```

- [ ] **Step 2: `StationRow.tsx`**

```tsx
// mobile/src/components/track/loop/StationRow.tsx
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography, type AccentKey } from "@/src/theme/tokens";
import { Badge, Card, type BadgeTone } from "@/src/components/ui";
import type { StationStatus } from "@/src/lib/loopStatus";

export const STATION_ACCENTS: Record<StationStatus["key"], AccentKey> = {
  inventory: "inventory",
  library: "meals",
  eatNext: "brand",
  pace: "meals",
  forecast: "shopping",
  shopping: "shopping",
};

interface StationRowProps {
  station: StationStatus;
  icon: LucideIcon;
  onPressBody: () => void;     // opens the detail sheet
  onPressChevron: () => void;  // deep-links to station.destination
}

export function StationRow({ station, icon: Icon, onPressBody, onPressChevron }: StationRowProps) {
  const accent = colors.accents[STATION_ACCENTS[station.key]];
  return (
    <Card variant="row" onPress={onPressBody}>
      <View style={styles.line}>
        <View style={[styles.iconCircle, { backgroundColor: tint(accent) }]}>
          <Icon size={18} color={accent} strokeWidth={icons.strokeWidth} />
        </View>
        <View style={styles.textBlock}>
          <Text style={[typography.rowTitle, styles.title]} numberOfLines={1}>{station.title}</Text>
          <Text style={[typography.caption, styles.sub]} numberOfLines={1}>{station.headline}</Text>
        </View>
        {station.badge ? (
          <Badge label={station.badge.label} tone={station.badge.tone as BadgeTone} />
        ) : null}
        <TouchableOpacity
          onPress={onPressChevron}
          hitSlop={{ top: 14, bottom: 14, left: 10, right: 14 }}
          accessibilityRole="button"
          accessibilityLabel={station.destinationLabel}
        >
          <ChevronRight size={icons.md} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2 },
  iconCircle: {
    width: 34, height: 34, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
  },
  textBlock: { flex: 1, minWidth: 0 },
  title: { color: colors.text },
  sub: { marginTop: 1 },
});
```

`StationTone → BadgeTone` cast is sound: every `StationTone` member is a valid `BadgeTone` (engine defines the subset deliberately to avoid a lib→components import; see `loopStatus.ts` comment).

- [ ] **Step 3: Gates + commit**

`npx tsc --noEmit` → 0; `npm test` → green.

```bash
git add mobile/src/components/track/loop/
git commit -m "feat(loop-hub): Connector and StationRow with dual touch targets"
```

---

### Task 6: `StationDetailSheet`

**Files:**
- Create: `mobile/src/components/track/loop/StationDetailSheet.tsx`

- [ ] **Step 1: Implement** (renders the engine payload verbatim; zero station logic)

```tsx
// mobile/src/components/track/loop/StationDetailSheet.tsx
import React from "react";
import { Modal, StyleSheet, Text, TouchableWithoutFeedback, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography, type AccentKey } from "@/src/theme/tokens";
import { Badge, Button, type BadgeTone } from "@/src/components/ui";
import type { StationStatus } from "@/src/lib/loopStatus";

interface StationDetailSheetProps {
  station: StationStatus | null;   // null = hidden
  icon: LucideIcon | null;
  accent: AccentKey;
  onClose: () => void;
  onOpenDestination: () => void;   // dismiss + router.push(station.destination)
}

export function StationDetailSheet({
  station, icon: Icon, accent, onClose, onOpenDestination,
}: StationDetailSheetProps) {
  const a = colors.accents[accent];
  return (
    <Modal visible={station !== null} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} />
      </TouchableWithoutFeedback>
      {station ? (
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.head}>
            {Icon ? (
              <View style={[styles.iconCircle, { backgroundColor: tint(a) }]}>
                <Icon size={18} color={a} strokeWidth={icons.strokeWidth} />
              </View>
            ) : null}
            <View>
              <Text style={[typography.rowTitle, styles.title]}>{station.title}</Text>
              <Text style={typography.caption}>{station.headline}</Text>
            </View>
          </View>
          {station.detail.lines.map((l) => (
            <View key={`${l.label}:${l.value}`} style={styles.statLine}>
              <Text style={[typography.body, styles.statLabel]}>{l.label}</Text>
              <Text style={[typography.body, styles.statValue]}>{l.value}</Text>
            </View>
          ))}
          {station.detail.chips.length > 0 ? (
            <View style={styles.chips}>
              {station.detail.chips.map((c) => (
                <Badge key={c.label} label={c.label} tone={c.tone as BadgeTone} />
              ))}
            </View>
          ) : null}
          {station.detail.footnote ? (
            <Text style={[typography.caption, styles.footnote]}>{station.detail.footnote}</Text>
          ) : null}
          <Button label={station.destinationLabel} onPress={onOpenDestination} fluid />
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel, borderTopRightRadius: radii.panel,
    borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border,
    padding: spacing.lg, paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  grabber: { width: 36, height: 4, borderRadius: radii.pill, backgroundColor: colors.surface2, alignSelf: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 2 },
  iconCircle: { width: 34, height: 34, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text },
  statLine: { flexDirection: "row", justifyContent: "space-between" },
  statLabel: { color: colors.textMuted },
  statValue: { color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm - 2 },
  footnote: { marginTop: spacing.xs },
});
```

- [ ] **Step 2: Gates + commit**

`npx tsc --noEmit` → 0; `npm test` → green.

```bash
git add mobile/src/components/track/loop/StationDetailSheet.tsx
git commit -m "feat(loop-hub): StationDetailSheet renders engine detail payloads"
```

---

### Task 7: `LoopHubScreen` + route + layout

**Files:**
- Create: `mobile/src/components/track/loop/LoopHubScreen.tsx`, `mobile/app/(tabs)/track/loop.tsx`
- Modify: `mobile/app/(tabs)/track/_layout.tsx`

- [ ] **Step 1: `LoopHubScreen.tsx`**

```tsx
// mobile/src/components/track/loop/LoopHubScreen.tsx
import React, { useCallback, useRef, useState } from "react";
import { RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ClipboardList, Package, ShoppingCart, TrendingUp, Utensils, Zap,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors } from "@/src/theme/tokens";
import { EmptyState, LoadingState, Screen } from "@/src/components/ui";
import { useEatNext } from "@/src/hooks/useEatNext";
import { useLoopHub } from "@/src/hooks/useLoopHub";
import type { StationKey, StationStatus } from "@/src/lib/loopStatus";
import { Connector } from "./Connector";
import { StationRow, STATION_ACCENTS } from "./StationRow";
import { StationDetailSheet } from "./StationDetailSheet";

const STATION_ICONS: Record<StationKey, LucideIcon> = {
  inventory: Package,
  library: Utensils,
  eatNext: Zap,
  pace: ClipboardList,
  forecast: TrendingUp,
  shopping: ShoppingCart,
};

export function LoopHubScreen({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const eatNext = useEatNext();
  const hub = useLoopHub(eatNext.result);
  const [openStation, setOpenStation] = useState<StationStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refetchBoth = useCallback(() => {
    eatNext.refetch();
    hub.refetch();
  }, [eatNext.refetch, hub.refetch]);

  // House focus-refresh pattern (EatNextHomeCard refinement): skip the
  // mount-time focus so the hooks' own mount effects aren't doubled.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) { firstFocus.current = false; return; }
      refetchBoth();
    }, [refetchBoth]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refetchBoth();
    // The hooks are stale-while-revalidate and don't expose an in-flight
    // signal (documented on UseEatNextValue.loading) — a short fixed spinner
    // acknowledges the gesture without inventing state the hooks don't have.
    setTimeout(() => setRefreshing(false), 800);
  }, [refetchBoth]);

  const openDestination = useCallback((station: StationStatus) => {
    setOpenStation(null);
    router.push(station.destination);
  }, [router]);

  const firstLoading = (hub.loading || eatNext.loading) && hub.status === null;
  const failed = !firstLoading && hub.status === null && (hub.error ?? eatNext.error);

  return (
    <Screen
      variant="detail"
      title="Nutrition Loop"
      onBack={onBack}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
      }
    >
      {firstLoading ? (
        <LoadingState />
      ) : failed ? (
        <EmptyState
          title="Couldn't load the loop"
          body={failed.message}
          action={{ label: "Retry", onPress: refetchBoth }}
        />
      ) : hub.status ? (
        <>
          {hub.status.stations.map((station) => (
            <React.Fragment key={station.key}>
              <StationRow
                station={station}
                icon={STATION_ICONS[station.key]}
                onPressBody={() => setOpenStation(station)}
                onPressChevron={() => router.push(station.destination)}
              />
              <Connector label={station.connector} />
            </React.Fragment>
          ))}
          <StationDetailSheet
            station={openStation}
            icon={openStation ? STATION_ICONS[openStation.key] : null}
            accent={openStation ? STATION_ACCENTS[openStation.key] : "brand"}
            onClose={() => setOpenStation(null)}
            onOpenDestination={() => openStation && openDestination(openStation)}
          />
        </>
      ) : null}
    </Screen>
  );
}
```

Design notes the reviewer should hold the line on: `LoadingState`/`EmptyState` are full-bleed — they are direct children of `Screen`'s scroll body here, which is their sanctioned container; every station renders a trailing `Connector` (station 6's is the loop-closing `restock ↺` label, spec §5 — do NOT "fix" the apparent off-by-one).

- [ ] **Step 2: Route file `mobile/app/(tabs)/track/loop.tsx`**

```tsx
import React from "react";
import { useRouter } from "expo-router";
import { LoopHubScreen } from "@/src/components/track/loop/LoopHubScreen";

export default function LoopRoute() {
  const router = useRouter();
  return <LoopHubScreen onBack={() => router.back()} />;
}
```

- [ ] **Step 3: Register the route.** In `mobile/app/(tabs)/track/_layout.tsx`, add alongside the existing screens:

```tsx
      <Stack.Screen name="loop" />
```

- [ ] **Step 4: Gates + screenshot**

`npx tsc --noEmit` → 0; `npm test` → green. Launch the sim (preconditions), `xcrun simctl openurl <UDID> "fittracker://track/loop"`, screenshot, and READ it: six stations with live numbers, connectors between them, no clipped text; tap-targets can't be verified headlessly — note for the owner checklist.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/track/loop/LoopHubScreen.tsx "mobile/app/(tabs)/track/loop.tsx" "mobile/app/(tabs)/track/_layout.tsx"
git commit -m "feat(loop-hub): LoopHubScreen, route, and stack registration"
```

---

### Task 8: Track hub entry card

**Files:**
- Modify: `mobile/app/(tabs)/track/index.tsx`

- [ ] **Step 1: Add imports** — `RefreshCw` to the lucide import list, `ChevronRight` too; `Card` from `@/src/components/ui`; `tint`, `radii` added to the tokens import.

- [ ] **Step 2: Insert the entry above the nutrition grid.** In the Nutrition & Food section (currently `index.tsx:150-154`), between the section title and `renderCategoryGrid(nutritionCategories)`:

```tsx
          <Card
            variant="row"
            onPress={() => router.push("/(tabs)/track/loop")}
            style={styles.loopEntry}
          >
            <View style={styles.loopEntryLine}>
              <View style={styles.loopIcon}>
                <RefreshCw size={18} color={colors.brand} strokeWidth={2} />
              </View>
              <View style={styles.loopText}>
                <Text style={styles.loopTitle}>Nutrition Loop</Text>
                <Text style={styles.loopSub}>Inventory → Meals → Shopping → back ↺</Text>
              </View>
              <ChevronRight size={20} color={colors.textFaint} strokeWidth={2} />
            </View>
          </Card>
```

And add to the StyleSheet:

```ts
  loopEntry: {
    marginBottom: spacing.lg,
  },
  loopEntryLine: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  loopIcon: {
    width: 34, height: 34, borderRadius: radii.pill,
    backgroundColor: tint(colors.brand),
    alignItems: "center", justifyContent: "center",
  },
  loopText: { flex: 1 },
  loopTitle: { ...typography.rowTitle, color: colors.text },
  loopSub: { ...typography.caption, marginTop: 1 },
```

Static by design (spec §7): no fetch, no badge, no `TrackingCategory` entry — the route is pushed directly, so `handleCardPress`/`trackingCategories`/`iconMap` are untouched.

- [ ] **Step 3: Gates + screenshot + commit**

`npx tsc --noEmit` → 0; `npm test` → green; screenshot `fittracker://track` — entry card sits above the four nutrition tiles.

```bash
git add "mobile/app/(tabs)/track/index.tsx"
git commit -m "feat(loop-hub): Nutrition Loop entry card on the Track hub"
```

---

### Task 9: Final sweep + owner handoff

- [ ] **Step 1: Full gates.** `cd mobile && npx tsc --noEmit` (0) && `npm test` (all green; loopStatus suite included — record final counts vs the baseline).

- [ ] **Step 2: Style-guide compliance.** Both greps clean on every new/modified file:

```bash
cd mobile
FILES="src/lib/loopStatus.ts src/hooks/useLoopHub.ts src/components/track/loop src/components/ui/Screen.tsx app/(tabs)/track/loop.tsx app/(tabs)/track/index.tsx"
grep -rnE '#[0-9A-Fa-f]{3,8}\b|hsl\(|rgba\(' $FILES
grep -rn 'from "@/src/lib/colors"' $FILES
```

- [ ] **Step 3: Screenshot pass.** `track` (entry card), `track/loop` (pipeline), and after killing/relaunching the app once more to confirm cold-start load. Read each screenshot.

- [ ] **Step 4: Commit any stragglers, then STOP for the owner** with this checklist (Metro reload only — no native changes): 1) Track → Nutrition Loop entry → hub renders six live stations; 2) numbers match the owning screens (open Inventory and Shopping side-by-side against stations 1 and 6); 3) tap a station body → sheet slides up, swipe-down and scrim-tap both dismiss; 4) sheet CTA lands on the owning screen; 5) chevron tap skips the sheet and deep-links directly; 6) pull-to-refresh spins briefly and numbers update after logging a meal in Meals and returning; 7) Eat Next station matches the Home card's pick; 8) open the hub and the Meals screen — the top meal's score must read identically on both. (Meals already renders `score`/100; if the hub shows a lower number, `raw` and `display` are swapped in `useLoopHub`'s assembly. This is the one crossing error in that seam that is silent: `score = Math.round((raw * 100) / 95)` is monotonic, so station 2's RANKING is unchanged and only the displayed number shifts ~5% low.) **No merge, no push — owner's call.**

---

## ⚠️ Execution amendments

*(Record every deviation here, per task, in the same commit as the fix — including the Task 1 Step 0 field-name verifications if any assumption differed.)*

### Task 1 — Step 0 field-name verification (one amendment covering the set)

Baseline recorded before any change: `npx tsc --noEmit` → 0 errors; `npm test` → **12 suites / 321 tests**, all green.

Four names the plan could not pin, verified against `main@7abe149`:

1. **`computeBrianScore` return — plan was RIGHT.** `BrianScoreResult` (`src/lib/mealScore.ts:99`) exposes `raw: number` (max 95) and `score: number` (raw renormalized to /100). `useLoopHub`'s `{ raw: s.raw, display: s.score }` mapping stands unchanged. Note `EatNextRecommendation.score` is already the /100 value (`eatNext.ts:201` warns against swapping it for `raw`), so station 3's `{score}/100` line is correct as written.

2. **`ShoppingListItem` purchased flag — plan was WRONG.** The field is **`is_purchased: boolean`** (`src/types/track.ts:88`), not `purchased`. Changes:
   - `LoopStatusInputs.listRows` → `Array<{ vendor_id: string | null; is_purchased: boolean }>`
   - `shoppingStation`'s filter → `inp.listRows.filter((r) => !r.is_purchased)`
   - all `listRows` test fixtures in Tasks 1–2 use `is_purchased`.
   The structural-subset input still accepts a real `ShoppingListItem[]` with no cast, which is the point of the §4.2 refinement.

3. **`eatNextStockBadge` params — plan's signature assumption was right, its USAGE was wrong.** The helper is `eatNextStockBadge(stock: EatNextStockInfo | undefined): { assemblable: boolean; label: string } | null` (`src/lib/eatNext.ts:262`); it tolerates `undefined`, so `pick.stock` needs no guard. But the plan's `eatNextStation` hand-rolls the badge label inline, which is exactly the re-derivation spec §4.1/§5 forbids ("Eat Next stock display goes through the shipped `eatNextStockBadge` / `eatNextExpiringLine` helpers"). Station 3's badge and its missing-chip now **call the helper** and use its `label` verbatim, mapping `assemblable → "success"` / `!assemblable → "warning"` for tone.
   *Behavioral delta this corrects:* the helper renders **`"Missing items"`** when `missingCount === 0` (a known-unassemblable meal with an unresolved count); the plan's inline string would have rendered `"Missing 0"`. A test pins the helper's output for that case.

4. **`eatNextExpiringLine` param shape — plan was RIGHT.** Single param `(stock: EatNextStockInfo | undefined) => string | null` (`src/lib/eatNext.ts:321`), returning `"Uses {name} — {expiry clause}"`. `eatNextExpiringLine(pick.stock)` stands unchanged.

**Related ruling (spec §5 vs. plan code, station 3 attention).** Spec §5 sets station 3's attention rule as "badge is warning ∨ no pick with meals>0"; the plan's code implements only the first clause. Resolution: where the plan pins behavior with an explicit test it governs (`eatNext === null` → `attention: false`, because null means *not loaded yet*, not *no pick*); where the plan is merely silent, spec §5 fills the gap. So a loaded result with `recommendations: []` and `meals.length > 0` sets `attention: true`. Both cases are tested.

### Task 2 — one implementation deviation (no behavioral change to any asserted output)

**`paceStation`'s catch-up unit no longer comes from an identity check.** The plan's draft recovered the unit with `p === pc ? "cal" : "g"` while iterating a filtered `[pc, pp]`. That is correct only while `paceCalories` and `paceProtein` are distinct objects; a caller passing the SAME `MealPaceState` object for both macros (two identical literals hoisted to a shared const — cheap and legal, since the type is a plain record) would render both catch-up lines as "cal". Replaced with a `[[pc, "cal"], [pp, "g"]] as const` walk so the unit travels with its state by construction. Output is byte-identical for distinct inputs, which is every case the tests cover.

**~~Forward constraint this task discovered, for Task 3 (`useLoopHub`)~~ — WITHDRAWN, superseded by the structural fix.** This entry previously bound Task 3 to maintain a paired invariant between `meals` and `mealScores` by hand. The code-quality review round rejected documenting an invariant that could be made unrepresentable instead: the two arrays are now **one** (`meals: Array<{ id; name; raw; display }>`), so there is no pairing to maintain, no `top!`, and no crash to avoid. **Task 3 carries no obligation from this entry** — see "Tasks 1–2 — code-quality review outcomes" below for the input shape it must actually build.

### Tasks 1–2 — spec-compliance review outcomes (2026-08-01)

Review verified all four project-critical contracts and amendments 1–4 independently, with no test bending found. Six issues raised; three were fixed in code, three are recorded here as deliberate divergences where the plan governs.

**Fixed in code (same commit as this entry):**

- **Station 2's unknown-stock chip.** `libraryStation` rendered `"{name}: missing ?"` for a meal ABSENT from `stockByMealId`. Absence means *unknown* — `buildStockByMealId` skips item-less meals by design (see its DECISION in `eatNext.ts`), and station 3 already honors this by rendering no badge at all for `eatNextStockBadge(undefined)`. A warning-toned "missing" verdict over data we never had is the fabrication §4.1 forbids. Now emits a **neutral** `"{name}: unknown"`. Neutral rather than omitted: dropping the meal from a 3-row chip list leaves an unexplained gap, and "unknown" is the honest word. `warning` + `"missing {n}"` is retained only for a present, non-assemblable entry. Tested.
- **Boundary and cap coverage.** Added mutation-verified boundary tests for `FORECAST_LEAD_DAYS` (`daysUntilOut === 3` is urgent) and `MAX_DISPLAY_DAYS` (an item at exactly 56 still shows `~Nd left`); both were previously survivable `<=` → `<` mutations. Added `capLines` overflow coverage for all three line-bearing stations (`+N more expiring` / `tracked` / `suggested`), the `eatNextExpiringLine` detail line including the falsy `expiringDaysLeft: 0` case, and the `after_window` → `"Day done"` badge. Corrected a test title that promised "missing-name chips" while asserting only badge and attention.
- **`paceStation` formatting symmetry.** `totals.protein` now runs through `fmt` like calories and both goals, so a >999 g day no longer reads `1200 / 1,600g`. Byte-identical for every pre-existing fixture.

**Recorded, code unchanged (plan governs):**

- **D. Station 3's headline omits the `{context label}` segment.** Spec §5 row 3 patterns `{pick} · {cal} cal · {prep} min · {context label}`; the plan's code and test pin only the first three. **Plan wins.** The station row is `numberOfLines={1}` and already carries name + calories + prep beside a badge and a chevron; a fourth segment risks truncating the meal name, the one segment that must survive. The context label is not lost — it is the first line of the detail sheet via `CONTEXT_LABELS[r.context]`. Recorded so it is not re-litigated.
- **E. Line lists overflow into a footnote, not a `+N more` chip.** Spec §5 says all chip/line lists cap with a `+N more` final chip. Chip lists do; line lists truncate at `DETAIL_MAX_ROWS` and account for the remainder in the footnote. **Plan's code, plan governs.** Spec-visible consequence, stated explicitly: at station 6 with >5 suggestions the overflow footnote REPLACES the `"restock returns units to Inventory ↺"` footnote. Plan:659 already rules "overflow wins" (the ↺ line is decorative, the count is information); this records that the substitution is user-visible, and a test now pins both halves.
- **F. Label templates are inline literals, not exported constants.** Spec §4.1 says "All label templates, caps, and attention rules are exported constants"; only `DETAIL_MAX_ROWS` and `CONTEXT_LABELS` are exported. **Plan's code, plan governs.** Hoisting every literal into an exported constant was declined as over-engineering with no consumer — nothing outside this module reads them, and an exported constant that exists only to be interpolated once buys indirection, not safety. The strings are asserted verbatim by tests, which is the actual protection that spec sentence was reaching for.

**Follow-up ruling — station 2's unresolved missing count (review round 2).** The first round fixed the ABSENT entry (`"missing ?"` → neutral `"unknown"`). A PRESENT entry with `{ assemblable: false, missingCount: 0 }` still printed `"{name}: missing 0"`. Now fixed. The principle is **single-definition copy**, not §4.1 no-fabrication — unlike `"missing ?"`, `assemblable: false` is a real assessment and only the count is unresolved. `eatNext.ts:255-261` already ruled how this exact input renders (`"Missing 0"` reads as a rendering bug, so it degrades to a countless `"Missing items"`); station 2 printing its own `missing 0` was a second, self-contradictory answer to a question the codebase had answered once.

Implementation takes the **helper-derived** form — `` `${m.name}: ${eatNextStockBadge(s)!.label.toLowerCase()}` `` — rather than a mirrored ternary, because a mirror is exactly what drifts. Two assumptions made explicit in the code comment and pinned by test: the `!` is sound because `eatNextStockBadge` returns null for exactly one input (`undefined`) and `s` is narrowed non-undefined at that point; and `toLowerCase()` assumes the helper's labels carry no proper nouns. Tone stays `warning` in both non-assemblable branches — the verdict is earned even when the number isn't, which is what distinguishes it from the neutral `unknown` chip. Existing copy (`"Banana + PB: missing 2"`) is unchanged and now regression-tested alongside the zero case.

*Reachability, for the record:* this input is **not producible through the shipped fetch path** — `buildStockByMealId`'s item-less DECISION removed its only producer. It stays CONSTRUCTIBLE because `EatNextStockInfo` is a public exported input, which is the identical reason the shipped helper guards it. Latent-defect hygiene, not a live bug.

### Task 3 — `Screen.refreshControl` prop type (forced deviation)

The plan specifies `refreshControl?: React.ReactElement;`. **That does not compile here.** This app is on React 19.1 / `@types/react` 19.1, where `ReactElement`'s prop parameter defaults to `unknown` rather than the pre-19 `any`; `ScrollView` declares `refreshControl?: React.ReactElement<RefreshControlProps>`, and `ReactElement<unknown>` is not assignable to it (TS2769, both `ScrollView` overloads).

Shipped as `refreshControl?: React.ReactElement<RefreshControlProps>` with a `import type { RefreshControlProps } from "react-native"`. This is the type `ScrollView` actually accepts, so it is also strictly tighter than the plan intended — a non-RefreshControl element is now rejected at the call site instead of at the primitive's internals. No behavioral change; the prop is still purely additive and still forwarded only on the `scroll={true}` path.

Everything else in Task 3 landed as written: `Screen.tsx` was unchanged from the `main@70b06dd` shape the plan was drafted against, the `ScrollView` block matched literally, and the diff is three touchpoints (prop declaration, destructure, forward) with nothing else touched. The JSDoc additionally states that `scroll={false}` renders no `ScrollView` and therefore ignores the prop.

### Tasks 1–2 — code-quality review outcomes (2026-08-01)

Review returned approve-with-changes; all nine issues taken. One input-shape change (below) supersedes both spec §4.2's revision and the withdrawn forward constraint above; the rest are behavioral fixes and coverage.

#### Input shape: `meals` and `mealScores` collapsed into one array

**Deviates from spec §4.2's pre-execution revision, which named `mealScores` as its own input.** Recorded in the spec's "Execution deviations" section as well.

```ts
// was: meals: Array<{ id; name }>  +  mealScores: Array<{ mealId; name; raw; display }>
meals: Array<{ id: string; name: string; raw: number; display: number }>;
```

Two parallel arrays let station 2 take its COUNT from one and its CONTENT from the other. Non-empty `meals` with empty `mealScores` made `top!` throw a `TypeError` that took down all six stations — station 2 was the only place in the file where missing data was fatal rather than degrading. The silent sibling was worse: `meals: [m1]` with `mealScores: [m1, ghost]` rendered `"1 meals · top: Ghost 99"`, a headline naming a meal the count excluded. One array makes both unrepresentable — `top === undefined ⟺ meals.length === 0` by construction, so the non-null assertion is gone.

**Task 4's assembly changes accordingly.** The snippet at plan:796-806 is superseded; it built the two arrays with two `.map`s over the SAME `library.meals`, so collapsing removes a map rather than adding work:

```ts
meals: library.meals.map((meal) => {
  const s = computeBrianScore(
    brianScoreInputFor(meal, library.conceptIdsBySavedFoodId, library.conceptsById),
  );
  return { id: meal.id, name: meal.name, raw: s.raw, display: s.score };
}),
// (no separate `mealScores` field, and NO `todayLocalDate` — see below)
```

`readyCount` moved with it, from counting `stockByMealId.values()` to counting over `inp.meals`: a stale map entry for a deleted meal previously inflated the count past the library size (`"assemblability → 3 of 2 meals ready"`, `"3 ready"` on a 2-meal library). Same number for consistent inputs, now structurally incapable of exceeding `meals.length`. Mutation-verified.

#### Behavioral fixes

- **A null goal no longer manufactures "On pace" (badge change).** `computeMealPace` returns `{ status: "on_pace" }` as its **no-goal sentinel** (`mealPace.ts:97-99`), and `goals.protein` is legitimately nullable — the station already em-dashes it. Reading status alone made `anyPaceish` permanently true for a user with no protein goal, pinning the badge to "On pace" before the window opened and after it closed while calories correctly reported `before_window`/`after_window`. Both `paceish` and `goalHit` now gate on `goal !== null`. The status enum cannot express "never asked to track this"; the goal can, and the engine already holds it. The ladder itself is unchanged — review confirmed it exhaustive across all 6×6 status combinations. Mutation-verified.
- **`capChips` no longer wastes a row at exactly `DETAIL_MAX_ROWS + 1`.** Six chips in yielded five names plus `"+1 more"` — same row count, one fewer name. Cap is now `<= DETAIL_MAX_ROWS + 1`; truncation must buy back at least one row to be worth doing. `capLines` is unaffected (its overflow goes to a footnote, not a row). Mutation-verified.
- **Forecast headline and footnote now count the same set.** `capLines` only ever saw the list already filtered to `daysUntilOut <= MAX_DISPLAY_DAYS`, so with 10 tracked / 7 displayable the headline said "10 items tracked" while the footnote said `"+2 more tracked"` — three items vanished unaccounted, same noun describing two different sets one tap apart. Now `tracked.length - lines.length`. Mutation-verified.
- **Station 1 renders the `"today"` band as `"today"`, not `"0d left"`.** `projectItemStock` bands day zero as `"today"` (`stockState.ts:121`) and `expiryClause` exists specifically so the most urgent value doesn't read as the least urgent-sounding string (`eatNext.ts:291-293`, ruled twice). Station 1 saying `"0d left"` while station 3 said `"expires today"` was two answers in one sheet stack.
- **Vendor breakdown breaks count ties by name.** Equal-count vendors previously ordered by first appearance in `listRows`, so the breakdown visibly reordered between refreshes as rows were purchased, with nothing having changed.
- **Dead ternary removed.** Station 3's `Context` line used `r ? CONTEXT_LABELS[r.context] : "—"` inside the `pick ? […]` branch; `pick` derives from `r?.recommendations[0]`, so the `"—"` arm was unreachable and read as a real case. Now `CONTEXT_LABELS[r!.context]` with the soundness note stated inline.

#### Coverage added

Pace unit-pairing (no fixture had ever set `paceProtein` behind, so the Task 2 shared-object fix and the `catchUpLabel ?? "end of day"` fallback were both unpinned); station 2's and station 3's full `detail.lines`; every station's `title`, `destination` and `destinationLabel` (all three `LoopDestination` values typecheck in any station, so a copy-paste error routed the user to the wrong screen with a green suite — and node-env Jest means these assertions are the only automated protection these strings will ever get); a `listRows` row whose vendor is absent from `vendors`; the vendor tiebreak; the `capChips` boundary; the dual-overflow forecast case; and the `"today"` band. Three progressively-mutating multi-assertion tests were split so a first-assertion failure no longer hides the rest.

#### `todayLocalDate` removed from `LoopStatusInputs`

**Deviates from spec §4.1's input list, which included it.** Also recorded in the spec's "Execution deviations" section.

The field was declared and never read — flagged after Tasks 1–2, again after the first review round, and raised a third time before being ruled on. Removed rather than retained "in case a station needs it", for the same reason the `meals`/`mealScores` collapse landed: **this engine is a projection over already-resolved data.** Every date-relative quantity a station renders is computed upstream — `ItemStockState.daysLeft` and `.expiration` (banded against today by `projectItemStock`), `ConsumptionEstimate.daysUntilOut`, `MealPaceState`. For a station to need `todayLocalDate` it would have to derive a date-relative fact *itself*, which this file's header comment explicitly forbids. So the speculative case isn't merely unlikely: if it ever arrived, needing the date here would be the signal that the computation belongs upstream in an engine that already has tests for it.

Meanwhile the field obliged `useLoopHub` to thread a value with no consumer. Task 4's assembly drops the `todayLocalDate: today` line; `today` is still needed there for the fetchers (`fetchInventoryWithState(today)`, `fetchShoppingData(today)`, the `meal_logs` date filter), just not for `computeLoopStatus`.

### Task 4 — `toError` lifted verbatim (plan note (d) was wrong on the facts)

Task 4's implementation note (d) offered a simplified error normalization, justified as "acceptable because `fetchInventoryWithState`/`fetchShoppingData` already throw real errors". **They do not.** Verified against the shipped code:

- `fetchInventoryWithState` → `throw errors[0]` (`inventory.ts:48`) — a raw PostgREST error object.
- `fetchShoppingData` → `throw errors[0]` (`shopping.ts:80`) — same.
- `fetchMealLibrary` re-throws raw PostgREST objects too, which is exactly what `useEatNext`'s own `toError` doc comment already documented (`useEatNext.ts:120-122`, citing `mealLibrary.ts:62,134,234`).
- The `logs.error` / `profile.error` values thrown by this hook's own guard are the same kind of object.

So `useLoopHub` faces precisely the condition `toError` exists for, and the simplified form would have discarded `details`, `hint` and `code`. For the 42703 column-name class these hooks guard against, `hint` carries PostgREST's "Perhaps you meant to reference the column …" — the most actionable line available. Per the plan's own fallback in note (d), `toError` is lifted **verbatim** from `useEatNext.ts:130` with attribution, and both copies are marked "change both or neither" (verified byte-identical at commit time).

Everything else in Task 4 landed as the (superseded-header) snippet specified: fetch composition unchanged, runId stale-guard unchanged, pace/profile handling unchanged, `eatNextRef` render-phase sync unchanged. Applied on top: the collapsed `meals` array (one `.map`, replacing `meals` + `mealScores`) and the removal of `todayLocalDate` from the `computeLoopStatus` call — `today` is still resolved for the three fetchers that take it.

**No infinite-loop risk from `[load, eatNext]`**, checked explicitly: `load` is `useCallback(…, [])` and therefore stable, and nothing in this hook writes `eatNext` — it is owned by the caller's `useEatNext`. The effect re-runs only when that hook publishes a new result.

### Task 5 — `Connector` label font size (plan governs, recorded for completeness)

Spec §6 describes the connector label as mono, `typography.caption`-sized; `typography.caption` is `fontSize: 12` (`tokens.ts:103`). The shipped label uses `fontSize: 11`, which is the plan's own value (plan:884). **Plan governs, code unchanged** — 11 sits deliberately below caption so the connector reads as subordinate to the station rows it links, and there is no smaller type token to name it with. Recorded only because every other divergence this run carries an entry in both documents and this one had none.

Not a divergence: §6's prose orders the connector "tick + ▾ + label" while the code renders `{label} ▾`. The plan's snippet matches the code and the approved mockup is the visual authority, so that is prose ordering, not a layout requirement.

### Task 7 — the plan's "sanctioned container" note was wrong (correction, fixed in code)

The plan's Task 7 design points asserted that `LoadingState`/`EmptyState` "are full-bleed and are direct children of `Screen`'s scroll body here — that is their sanctioned container." **That is the opposite of the truth, and it shipped in a comment that would have stopped the next reader from fixing it.**

Both primitives are `flex: 1` (`flexBasis: 0`, `EmptyState.tsx:39`), so they never size to their own content. `Screen`'s scrolling body puts them in an auto-height parent: `scrollContent` is `{ paddingHorizontal, gap }` (`Screen.tsx:117`) with **no `flexGrow: 1`**. Style guide rule 25 names this exact trap in these words — "dropped into an auto-height parent they collapse onto their padding and spill" — so the state boxes collapsed onto their `spacing.xxxl` padding and spilled.

Fix: `firstLoading || failed` now early-returns a **non-scrolling** `Screen`. Rule 25's third bullet carves this out — "Neither is needed when a `flex: 1` ancestor already supplies it directly (e.g. `Screen scroll={false}`'s container)" — and `Screen.tsx:91-92` confirms that container is `flex: 1`. Same shape as `ShoppingListScreen.tsx:380`, which renders both of its states under `scroll={false}`. Not a fourth variant of the fix; the same rule-25 bullet, reached by early return because the happy path still needs the scroller and its `refreshControl`.

The happy path was unaffected, which is why the device pass looked clean — the defect lived only in the loading and error states, i.e. exactly the path the preceding commit (`ccb23c2`) had been written to make visible.

Two internal refinements landed in the same commit:

- **Failure decision split from failure payload.** `(hub.error ?? eatNext.error)` had served as both the truthiness gate and the message source, making `failed` a `false | null | Error` that silently depended on an unenforced cross-hook invariant (that whenever the stations aren't showable, some error is non-null). If it ever broke, render fell through to the trailing `: null` and the screen went blank with no Retry — the same bug class as `ccb23c2` by another route. Now `stationsShowable` / `failure` / `failed` are three named values, and `body` carries a total fallback message so no path can render nothing. A seventh station needs no change here; a third hook adds one `&& !thirdDead` and one `??`.
- **Open station derived, not snapshotted.** `openStation` held a `StationStatus` captured at tap time. Rows render as soon as the first hub load lands while `eatNext` is still resolving, so tapping station 3 in that window captured the `eatNext: null` payload (headline `"—"`); the row behind updated on the second load, the open sheet did not. State is now the `StationKey`, with the station re-found from `hub.status` each render. `hub.status` never returns to null once populated, so it cannot flicker, and the sheet's `lastRef` still covers the dismissal animation.

**Logged as a follow-up, deliberately not done on this branch:** the Track hub entry card is the third copy of the 34pt tinted accent circle (with `StationRow` and `StationDetailSheet`), which meets the extraction threshold for an `AccentGlyph` primitive. Out of scope here.
