import {
  computeLoopStatus,
  DETAIL_MAX_ROWS,
  type LoopStatusInputs,
} from "../loopStatus";
import type { ItemStockState } from "../stockState";
import type { EatNextStockInfo } from "../eatNext";
import { MAX_DISPLAY_DAYS } from "../consumptionRate";
import { FORECAST_LEAD_DAYS } from "../shoppingDemand";

const state = (over: Partial<ItemStockState> = {}): ItemStockState => ({
  totalQuantity: 3, readyQuantity: 3, storageQuantity: 0,
  isOut: false, isLow: false, needsFridgeRestock: false,
  expiration: null, daysLeft: null, ...over,
});

const stock = (over: Partial<EatNextStockInfo> = {}): EatNextStockInfo => ({
  assemblable: true, missingCount: 0, unlinkedCount: 0,
  expiringItemName: null, expiringDaysLeft: null, ...over,
});

const baseInputs = (): LoopStatusInputs => ({
  inventory: [
    { id: "i1", name: "Eggs", state: state() },
    { id: "i2", name: "Bananas", state: state({ totalQuantity: 0, isOut: true }) },
    { id: "i3", name: "Milk", state: state({ expiration: "soon", daysLeft: 2 }) },
  ],
  meals: [
    { id: "m1", name: "Banana + PB", raw: 80, display: 84 },
    { id: "m2", name: "Korean Beef Bowl", raw: 90, display: 95 },
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
        protein: 45, prepMinutes: 10, score: 95, faceUrl: null, stock: stock() },
      { mealId: "m1", name: "Banana + PB", reasons: [], calories: 295,
        protein: 11, prepMinutes: 2, score: 84, faceUrl: null,
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
    { vendor_id: "v1", is_purchased: false },
    { vendor_id: "v1", is_purchased: false },
    { vendor_id: null, is_purchased: true },
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
    expect(s.connector).toBe("what you have makes 1 of 2 meals");
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
  it("C1/C3: stale expired items and out-of-stock items leave the expiring count", () => {
    const inp = baseInputs();
    inp.inventory = [
      // long-expired perishable (no categories → perishable grace 14) → stale
      { id: "a", name: "Old Milk", state: state({ expiration: "expired", daysLeft: -273 }) },
      // long-expired but shelf-stable and within its 90d grace → still counts
      { id: "b", name: "Oats Overnight", state: state({ expiration: "expired", daysLeft: -35 }), categories: ["Breakfast Foods"] },
      // expiring soon but out of stock → nothing to use or toss → excluded
      { id: "c", name: "Ghost Yogurt", state: state({ totalQuantity: 0, isOut: true, expiration: "soon", daysLeft: 2 }) },
      // freshly expired perishable, inside grace → counts
      { id: "d", name: "New Casualty", state: state({ expiration: "expired", daysLeft: -3 }) },
    ];
    const s = computeLoopStatus(inp).stations[0];
    expect(s.headline).toBe("4 items · 1 out · 2 expiring");
    // stale item also stays out of the detail-sheet expiring lines
    expect(s.detail.lines.find((l) => l.label === "Old Milk")).toBeUndefined();
    expect(s.detail.lines.find((l) => l.label === "Oats Overnight")).toBeDefined();
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
  // Day zero is the MOST urgent value; "0d left" makes it read as the least
  // urgent-sounding string. `expiryClause` already ruled this for station 3
  // ("expires today"), so station 1 must not answer differently.
  it("the 'today' band reads 'today', never '0d left'", () => {
    const inp = baseInputs();
    inp.inventory = [
      { id: "a", name: "Yogurt", state: state({ expiration: "today", daysLeft: 0 }) },
      { id: "b", name: "Milk", state: state({ expiration: "soon", daysLeft: 2 }) },
    ];
    const d = computeLoopStatus(inp).stations[0].detail;
    expect(d.lines).toEqual([
      { label: "Yogurt", value: "today" },
      { label: "Milk", value: "2d left" },
    ]);
  });
});

describe("station 2: library", () => {
  it("headline names the top meal by RAW score with its display score", () => {
    const s = computeLoopStatus(baseInputs()).stations[1];
    expect(s.headline).toBe("Korean Beef Bowl 95 · 2 meals");
    expect(s.badge).toEqual({ label: "1 ready", tone: "success" });
    expect(s.attention).toBe(false);
  });
  it("0 ready with meals present is a warning that demands attention", () => {
    const inp = baseInputs();
    inp.stockByMealId = new Map([
      ["m1", stock({ assemblable: false, missingCount: 2 })],
      ["m2", stock({ assemblable: false, missingCount: 1 })],
    ]);
    const s = computeLoopStatus(inp).stations[1];
    expect(s.badge).toEqual({ label: "0 ready", tone: "warning" });
    expect(s.attention).toBe(true);
  });
  it("an empty library prompts you to build one, without demanding attention", () => {
    const inp = baseInputs();
    inp.meals = []; inp.stockByMealId = new Map();
    const empty = computeLoopStatus(inp).stations[1];
    expect(empty.headline).toBe("0 meals — build your library");
    expect(empty.badge).toBeNull();
    expect(empty.attention).toBe(false);
  });
  // An absent `stockByMealId` entry is UNKNOWN, not missing — the same
  // semantics station 3 honors by rendering no badge at all. "missing ?"
  // would assert a verdict over data we never had.
  it("a meal absent from stockByMealId gets a neutral 'unknown' chip, never 'missing ?'", () => {
    const inp = baseInputs();
    inp.stockByMealId = new Map([["m2", stock()]]); // m1 deliberately absent
    const chips = computeLoopStatus(inp).stations[1].detail.chips;
    expect(chips).toContainEqual({ label: "Korean Beef Bowl: ready", tone: "success" });
    expect(chips).toContainEqual({ label: "Banana + PB: unknown", tone: "neutral" });
    expect(chips.some((c) => c.label.includes("?"))).toBe(false);
  });
  // Single-definition copy: `eatNextStockBadge` already ruled how an
  // unresolved count renders ("Missing items", never "Missing 0"), so station 2
  // borrows that verdict rather than printing a second, self-contradictory
  // answer. Tone stays `warning` — the non-assemblable verdict is real, only
  // the count is unknown, which is what separates it from the neutral chip
  // above. This assertion is also what holds the `toLowerCase()` assumption
  // that the helper's labels carry no proper nouns.
  it("an unresolved missing count borrows the helper's 'missing items', never 'missing 0'", () => {
    const inp = baseInputs();
    inp.stockByMealId = new Map([
      ["m1", stock({ assemblable: false, missingCount: 0 })],
      ["m2", stock()],
    ]);
    const chips = computeLoopStatus(inp).stations[1].detail.chips;
    expect(chips).toContainEqual({ label: "Banana + PB: missing items", tone: "warning" });
    expect(chips.some((c) => c.label.includes("missing 0"))).toBe(false);
    // and the resolved-count form is untouched by the helper reshape
    expect(computeLoopStatus(baseInputs()).stations[1].detail.chips)
      .toContainEqual({ label: "Banana + PB: missing 2", tone: "warning" });
  });
  it("detail lines score the top meals out of 100, ranked by raw", () => {
    expect(computeLoopStatus(baseInputs()).stations[1].detail.lines).toEqual([
      { label: "Korean Beef Bowl", value: "95 / 100" },
      { label: "Banana + PB", value: "84 / 100" },
    ]);
  });
  // Count and content come from ONE array now, so a meal can never contribute
  // a headline it isn't counted in.
  it("readyCount cannot exceed the library size when the stock map holds a stale meal", () => {
    const inp = baseInputs();
    inp.stockByMealId = new Map([
      ["m1", stock()], ["m2", stock()], ["deleted-meal", stock()],
    ]);
    const r = computeLoopStatus(inp);
    expect(r.stations[1].badge).toEqual({ label: "2 ready", tone: "success" });
    expect(r.stations[0].connector).toBe("what you have makes 2 of 2 meals");
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
  it("the detail sheet body carries context, macros and prep · score", () => {
    expect(computeLoopStatus(baseInputs()).stations[2].detail.lines).toEqual([
      { label: "Context", value: "next meal" },
      { label: "Calories", value: "640" },
      { label: "Protein", value: "45g" },
      { label: "Prep · Score", value: "10 min · 95/100" },
    ]);
  });
  // Title states only what this asserts: badge + attention. The sheet chip
  // carries a COUNT, never ingredient names — `EatNextStockInfo` has no names
  // to carry (see `eatNextStation`'s comment).
  it("warning badge and attention when the pick is missing items", () => {
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
  // Spec §5's second attention clause: a LOADED result that produced no pick
  // while the library has meals is a stalled loop, not a quiet one. Distinct
  // from `eatNext === null` above, which means "not loaded yet".
  it("loaded result with no recommendations and a non-empty library needs attention", () => {
    const inp = baseInputs();
    inp.eatNext = { context: "goal_hit", message: "Goal hit — nothing needed", recommendations: [], nudge: null };
    expect(inp.meals.length).toBeGreaterThan(0);
    expect(computeLoopStatus(inp).stations[2].attention).toBe(true);
  });
  // Contract: the badge comes from the shipped `eatNextStockBadge` helper, not
  // a re-derived string. A re-derivation would print "Missing 0" here.
  it("countless missing stock renders the helper's 'Missing items', never 'Missing 0'", () => {
    const inp = baseInputs();
    inp.eatNext!.recommendations = [
      { ...inp.eatNext!.recommendations[0], stock: stock({ assemblable: false, missingCount: 0 }) },
    ];
    const s = computeLoopStatus(inp).stations[2];
    expect(s.badge).toEqual({ label: "Missing items", tone: "warning" });
    expect(s.detail.chips).toContainEqual({ label: "Missing items", tone: "warning" });
  });
  // Contract #2's other half: the expiring line is the shipped
  // `eatNextExpiringLine`'s output verbatim, and it must actually reach the
  // detail sheet — a computed-but-never-displayed value is the Phase 4 Task 14
  // failure this station exists to avoid.
  it("surfaces eatNextExpiringLine's rescue notice as an 'Expiring' detail line", () => {
    const inp = baseInputs();
    inp.eatNext!.recommendations = [
      {
        ...inp.eatNext!.recommendations[0],
        stock: stock({ expiringItemName: "Spinach", expiringDaysLeft: 2 }),
      },
    ];
    expect(computeLoopStatus(inp).stations[2].detail.lines).toContainEqual({
      label: "Expiring", value: "Uses Spinach — expires in 2d",
    });
  });
  // `expiringDaysLeft: 0` is the MOST urgent value and it is FALSY — a
  // truthiness gate anywhere on this path drops the line exactly when it
  // matters most (the trap `eatNext.ts`'s own doc comment warns about).
  it("day-zero expiry still renders, as 'expires today'", () => {
    const inp = baseInputs();
    inp.eatNext!.recommendations = [
      {
        ...inp.eatNext!.recommendations[0],
        stock: stock({ expiringItemName: "Spinach", expiringDaysLeft: 0 }),
      },
    ];
    expect(computeLoopStatus(inp).stations[2].detail.lines).toContainEqual({
      label: "Expiring", value: "Uses Spinach — expires today",
    });
  });
});

describe("station 4: pace", () => {
  it("behind on either macro wins: warning badge + attention", () => {
    const s = computeLoopStatus(baseInputs()).stations[3];
    expect(s.headline).toBe("900 / 2,300 cal · 60 / 160g protein");
    expect(s.badge).toEqual({ label: "Behind", tone: "warning" });
    expect(s.attention).toBe(true);
    expect(s.detail.lines).toContainEqual({ label: "Catch up", value: "400 cal by dinner (6 PM)" });
  });
  it("goal hit on both macros is a success badge", () => {
    const inp = baseInputs();
    inp.paceCalories = { status: "goal_hit" }; inp.paceProtein = { status: "goal_hit" };
    expect(computeLoopStatus(inp).stations[3].badge).toEqual({ label: "Goal hit", tone: "success" });
  });
  it("one goal hit and one ahead is 'On pace'", () => {
    const inp = baseInputs();
    inp.paceCalories = { status: "goal_hit" }; inp.paceProtein = { status: "ahead", delta: 20 };
    expect(computeLoopStatus(inp).stations[3].badge).toEqual({ label: "On pace", tone: "success" });
  });
  it("before_window on both is neutral and quiet", () => {
    const inp = baseInputs();
    inp.paceCalories = { status: "before_window" }; inp.paceProtein = { status: "before_window" };
    const s = computeLoopStatus(inp).stations[3];
    expect(s.badge).toEqual({ label: "Before window", tone: "neutral" });
    expect(s.attention).toBe(false);
  });
  // `computeMealPace` returns `{ status: "on_pace" }` as its NO-GOAL sentinel,
  // so reading status alone treats an untracked macro as a pace verdict and
  // pins the badge to "On pace" all day — even before the window opens.
  it("a null goal cannot manufacture 'On pace' before the window opens", () => {
    const inp = baseInputs();
    inp.goals = { calories: 2300, protein: null };
    inp.paceCalories = { status: "before_window" };
    inp.paceProtein = { status: "on_pace" }; // the no-goal sentinel, not a verdict
    expect(computeLoopStatus(inp).stations[3].badge)
      .toEqual({ label: "Before window", tone: "neutral" });
  });
  it("a null goal cannot manufacture 'On pace' after the window closes either", () => {
    const inp = baseInputs();
    inp.goals = { calories: 2300, protein: null };
    inp.paceCalories = { status: "after_window" };
    inp.paceProtein = { status: "on_pace" };
    expect(computeLoopStatus(inp).stations[3].badge)
      .toEqual({ label: "Day done", tone: "neutral" });
  });
  // The unit-pairing walk exists so a shared MealPaceState object can't label
  // both lines "cal"; without a behind protein fixture the second iteration
  // never runs. Asserting both lines also pins their order.
  it("protein catch-up carries the g unit and falls back to end of day", () => {
    const inp = baseInputs();
    inp.paceProtein = { status: "behind", catchUpAmount: 30 };
    const lines = computeLoopStatus(inp).stations[3].detail.lines;
    expect(lines).toContainEqual({ label: "Catch up", value: "400 cal by dinner (6 PM)" });
    expect(lines).toContainEqual({ label: "Catch up", value: "30 g by end of day" });
  });
  // The pair-walk's ACTUAL purpose: with two distinct objects an identity
  // check (`p === pc ? "cal" : "g"`) also passes. Only ONE shared object for
  // both macros — legal, since MealPaceState is a plain record — exposes it,
  // and then the identity check labels both lines "cal".
  it("a MealPaceState object shared by both macros still labels each line's own unit", () => {
    const inp = baseInputs();
    const shared = { status: "behind" as const, catchUpAmount: 200, catchUpLabel: "lunch (12 PM)" };
    inp.paceCalories = shared;
    inp.paceProtein = shared;
    const lines = computeLoopStatus(inp).stations[3].detail.lines;
    expect(lines).toContainEqual({ label: "Catch up", value: "200 cal by lunch (12 PM)" });
    expect(lines).toContainEqual({ label: "Catch up", value: "200 g by lunch (12 PM)" });
  });
  // `goalHit`'s null gate is the twin of `paceish`'s — pinning one and not the
  // other is the exact shape of the defect the previous round caught.
  it("a null goal cannot manufacture 'Goal hit' either", () => {
    const inp = baseInputs();
    inp.goals = { calories: null, protein: null };
    inp.paceCalories = { status: "goal_hit" }; inp.paceProtein = { status: "goal_hit" };
    expect(computeLoopStatus(inp).stations[3].badge).toEqual({ label: "Day done", tone: "neutral" });
  });
  it("null goals render em-dashes", () => {
    const inp = baseInputs();
    inp.goals = { calories: null, protein: null };
    expect(computeLoopStatus(inp).stations[3].headline).toBe("900 / — cal · 60 / —g protein");
  });
  // The other side of the neutral window branch: only `before_window` was
  // pinned, so the "Day done" label had no coverage at all.
  it("after_window is the other neutral window state: 'Day done'", () => {
    const inp = baseInputs();
    inp.paceCalories = { status: "after_window" };
    inp.paceProtein = { status: "after_window" };
    const s = computeLoopStatus(inp).stations[3];
    expect(s.badge).toEqual({ label: "Day done", tone: "neutral" });
    expect(s.attention).toBe(false);
  });
  it("thousands separators apply to protein as well as calories", () => {
    const inp = baseInputs();
    inp.totals = { calories: 3200, protein: 1200 };
    inp.goals = { calories: 3400, protein: 1600 };
    expect(computeLoopStatus(inp).stations[3].headline)
      .toBe("3,200 / 3,400 cal · 1,200 / 1,600g protein");
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
  // BOUNDARY: the gate is `<=`, so an item due in exactly FORECAST_LEAD_DAYS
  // is urgent. Flipping `<=` to `<` must turn this test red.
  it("FORECAST_LEAD_DAYS is inclusive — an item due exactly at the lead is urgent", () => {
    const inp = baseInputs();
    inp.rates = new Map([["i1", { ratePerDay: 1, daysUntilOut: FORECAST_LEAD_DAYS }]]);
    const s = computeLoopStatus(inp).stations[4];
    expect(s.badge).toEqual({ label: "1 urgent", tone: "shopping" });
    expect(s.attention).toBe(true);
  });
  // BOUNDARY: the display cap is `<=`, so an item at exactly MAX_DISPLAY_DAYS
  // still earns its "~Nd left" in both the headline and the detail line.
  it("MAX_DISPLAY_DAYS is inclusive — an item at the cap still shows '~Nd left'", () => {
    const inp = baseInputs();
    inp.rates = new Map([["i1", { ratePerDay: 0.05, daysUntilOut: MAX_DISPLAY_DAYS }]]);
    const s = computeLoopStatus(inp).stations[4];
    expect(s.headline).toBe(`Eggs ~${MAX_DISPLAY_DAYS}d left · 1 item tracked`);
    expect(s.detail.lines).toContainEqual({ label: "Eggs", value: `~${MAX_DISPLAY_DAYS}d left` });
    expect(s.badge).toBeNull();
  });
  // Both kinds of overflow at once: 10 tracked, 7 within the display cap, 5
  // rows shown. The footnote must account for all 5 missing items (2 capped +
  // 3 beyond MAX_DISPLAY_DAYS), not just the 2 `capLines` could see — the
  // headline's "10 items tracked" and the footnote name the same set.
  it("the tracked footnote counts every item the rows omit, cap and filter alike", () => {
    const inp = baseInputs();
    inp.inventory = Array.from({ length: 10 }, (_, i) => ({
      id: `x${i}`, name: `Item ${i}`, state: state(),
    }));
    inp.rates = new Map(
      Array.from({ length: 10 }, (_, i) => [
        `x${i}`,
        { ratePerDay: 1, daysUntilOut: i < 7 ? i + 1 : MAX_DISPLAY_DAYS + 10 },
      ]),
    );
    const s = computeLoopStatus(inp).stations[4];
    expect(s.headline).toBe("Item 0 ~1d left · 10 items tracked");
    expect(s.detail.lines).toHaveLength(DETAIL_MAX_ROWS);
    expect(s.detail.footnote).toBe("+5 more tracked");
  });
});

describe("station 6: shopping + assembly", () => {
  it("headline counts unpurchased rows with vendor breakdown; suggested badge", () => {
    const s = computeLoopStatus(baseInputs()).stations[5];
    expect(s.headline).toBe("2 on list · Costco 2");
    expect(s.badge).toEqual({ label: "2 suggested", tone: "shopping" });
    expect(s.attention).toBe(true);
    expect(s.connector).toBe("what you buy comes back as stock");
  });
  it("unassigned bucket renders last", () => {
    const inp = baseInputs();
    inp.listRows = [
      { vendor_id: null, is_purchased: false },
      { vendor_id: "v1", is_purchased: false },
    ];
    expect(computeLoopStatus(inp).stations[5].headline).toBe("2 on list · Costco 1 · unassigned 1");
  });
  it("an empty list with no suggestions says so and stays quiet", () => {
    const inp = baseInputs();
    inp.listRows = [];
    inp.suggestions = [];
    const s = computeLoopStatus(inp).stations[5];
    expect(s.headline).toBe("0 on list");
    expect(s.badge).toBeNull();
    expect(s.attention).toBe(false);
  });
  // The most plausible real-data anomaly on this path: a row pointing at a
  // vendor that has since been deleted. It must land in `unassigned`, not
  // render an "undefined 1" bucket.
  it("a row whose vendor is missing from the vendor list counts as unassigned", () => {
    const inp = baseInputs();
    inp.listRows = [
      { vendor_id: "ghost-vendor", is_purchased: false },
      { vendor_id: "v1", is_purchased: false },
    ];
    expect(computeLoopStatus(inp).stations[5].headline).toBe("2 on list · Costco 1 · unassigned 1");
  });
  // Equal counts must not order by first appearance in `listRows` — that
  // reshuffles as rows get purchased, so the breakdown visibly reorders
  // between refreshes with nothing having changed.
  it("equal-count vendors break the tie by name, not by row order", () => {
    const inp = baseInputs();
    inp.vendors = [{ id: "v1", name: "Costco" }, { id: "v2", name: "Aldi" }];
    inp.listRows = [
      { vendor_id: "v1", is_purchased: false },
      { vendor_id: "v2", is_purchased: false },
    ];
    expect(computeLoopStatus(inp).stations[5].headline).toBe("2 on list · Aldi 1 · Costco 1");
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
  // BOUNDARY: at exactly DETAIL_MAX_ROWS + 1 a summary chip would occupy the
  // row it summarises — same chip count, one fewer name. Truncation must buy
  // back at least one row, so this many passes through whole.
  it("capChips leaves DETAIL_MAX_ROWS + 1 chips intact rather than wasting a slot", () => {
    const outItems = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `x${i}`, name: `Item ${i}`, state: state({ totalQuantity: 0, isOut: true }),
      }));
    const inp = baseInputs();
    inp.inventory = outItems(DETAIL_MAX_ROWS + 1);
    const atBoundary = computeLoopStatus(inp).stations[0].detail.chips;
    expect(atBoundary).toHaveLength(DETAIL_MAX_ROWS + 1);
    expect(atBoundary.some((c) => c.label.includes("more"))).toBe(false);
    // one past the boundary, truncation finally pays for itself
    inp.inventory = outItems(DETAIL_MAX_ROWS + 2);
    const past = computeLoopStatus(inp).stations[0].detail.chips;
    expect(past).toHaveLength(DETAIL_MAX_ROWS + 1);
    expect(past[DETAIL_MAX_ROWS]).toEqual({ label: "+2 more", tone: "neutral" });
  });
  // LINE lists cap differently from CHIP lists: they truncate at
  // DETAIL_MAX_ROWS and account for the remainder in the footnote rather than
  // appending a "+N more" chip. All three line-bearing stations, so a footnote
  // wired to the wrong station's overflow count cannot hide.
  it("expiring lines cap at DETAIL_MAX_ROWS with a '+N more expiring' footnote", () => {
    const inp = baseInputs();
    inp.inventory = Array.from({ length: 8 }, (_, i) => ({
      id: `x${i}`, name: `Item ${i}`,
      state: state({ expiration: "soon", daysLeft: i + 1 }),
    }));
    const d = computeLoopStatus(inp).stations[0].detail;
    expect(d.lines).toHaveLength(DETAIL_MAX_ROWS);
    expect(d.lines[0]).toEqual({ label: "Item 0", value: "1d left" });
    expect(d.footnote).toBe("+3 more expiring");
  });
  it("tracked lines cap at DETAIL_MAX_ROWS with a '+N more tracked' footnote", () => {
    const inp = baseInputs();
    inp.inventory = Array.from({ length: 8 }, (_, i) => ({
      id: `x${i}`, name: `Item ${i}`, state: state(),
    }));
    inp.rates = new Map(
      Array.from({ length: 8 }, (_, i) => [`x${i}`, { ratePerDay: 1, daysUntilOut: i + 1 }]),
    );
    const d = computeLoopStatus(inp).stations[4].detail;
    expect(d.lines).toHaveLength(DETAIL_MAX_ROWS);
    expect(d.footnote).toBe("+3 more tracked");
  });
  // Also pins plan:659's "overflow wins": the count REPLACES the decorative
  // "restock returns units to Inventory ↺" footnote when both apply.
  it("suggestion lines cap with a '+N more suggested' footnote that displaces the restock line", () => {
    const inp = baseInputs();
    inp.suggestions = Array.from({ length: 8 }, (_, i) => ({
      name: `Sug ${i}`, priority: 1 as const, reasons: [`reason ${i}`],
    }));
    const d = computeLoopStatus(inp).stations[5].detail;
    expect(d.lines).toHaveLength(DETAIL_MAX_ROWS);
    expect(d.footnote).toBe("+3 more suggested");
    expect(computeLoopStatus(baseInputs()).stations[5].detail.footnote)
      .toBe("restock returns units to Inventory ↺");
  });
  // Every LoopDestination value typechecks in any station, so a
  // copy-paste error routes the user to the wrong screen with a green suite.
  // Node-env Jest means this assertion is the only automated protection these
  // strings will ever get.
  it("each station deep-links to its own screen", () => {
    expect(computeLoopStatus(baseInputs()).stations.map((s) => [s.key, s.destination])).toEqual([
      ["inventory", "/(tabs)/track/food-inventory"], ["library", "/(tabs)/track/meal-library"],
      ["eatNext", "/(tabs)/track/fuel"], ["pace", "/(tabs)/track/fuel"],
      ["forecast", "/(tabs)/track/shopping"], ["shopping", "/(tabs)/track/shopping"],
    ]);
  });
  it("each station carries its own title and destination label", () => {
    expect(computeLoopStatus(baseInputs()).stations.map((s) => [s.title, s.destinationLabel]))
      .toEqual([
        ["Inventory", "Open Inventory"], ["Meal Library", "Open Meal Library"],
        ["Eat Next", "Open Fuel"], ["Today's Pace", "Open Fuel"],
        ["Forecast", "Open Shopping"], ["Shopping", "Open Shopping"],
      ]);
  });
  // Contract: SIX stations, SIX connectors. Station 6's connector is the loop
  // CLOSING ("what you buy comes back as stock"), not an off-by-one to be
  // "fixed" away by a later reader who counts five gaps between six rows.
  it("every station carries a non-empty trailing connector, station 6 included", () => {
    const stations = computeLoopStatus(baseInputs()).stations;
    expect(stations).toHaveLength(6);
    for (const s of stations) {
      expect(typeof s.connector).toBe("string");
      expect(s.connector.length).toBeGreaterThan(0);
    }
  });
});
