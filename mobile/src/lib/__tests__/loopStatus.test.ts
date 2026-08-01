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
});

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
      { vendor_id: null, is_purchased: false },
      { vendor_id: "v1", is_purchased: false },
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
  // Contract: SIX stations, SIX connectors. Station 6's connector is the loop
  // CLOSING ("purchased → restock ↺ inventory"), not an off-by-one to be
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
