// mobile/src/lib/__tests__/mealPace.test.ts
// Pins the existing pace lib (untested since meals-tier3; audit item R2).
import { computeMealPace, type ComputeMealPaceOpts } from "../mealPace";

const at = (h: number, m = 0) => new Date(2026, 6, 29, h, m, 0, 0);

const base: Omit<ComputeMealPaceOpts, "currentValue" | "now"> = {
  goal: 2300,
  windowStart: "08:00",
  windowEnd: "23:00",
  mealTimes: { breakfast: "08:00", lunch: "12:00", dinner: "18:00" },
  macro: "calories",
};

describe("short-circuits", () => {
  it("null/zero goal → on_pace", () => {
    expect(computeMealPace({ ...base, goal: null, currentValue: 0, now: at(12) }).status).toBe("on_pace");
    expect(computeMealPace({ ...base, goal: 0, currentValue: 0, now: at(12) }).status).toBe("on_pace");
  });
  it("currentValue ≥ goal → goal_hit, even outside the window", () => {
    expect(computeMealPace({ ...base, currentValue: 2300, now: at(6) }).status).toBe("goal_hit");
  });
  it("before/after window", () => {
    expect(computeMealPace({ ...base, currentValue: 0, now: at(7, 59) }).status).toBe("before_window");
    expect(computeMealPace({ ...base, currentValue: 100, now: at(23, 1) }).status).toBe("after_window");
  });
  it("degenerate window (end ≤ start) → on_pace", () => {
    // Note: an inverted window (23:00→08:00) hits the after_window check
    // first for any now > end, so the only reachable degenerate case is
    // start === end with now exactly on it — that is what this pins.
    expect(
      computeMealPace({
        ...base, windowStart: "08:00", windowEnd: "08:00",
        currentValue: 500, now: at(8, 0),
      }).status,
    ).toBe("on_pace");
  });
});

describe("linear expected-by-now", () => {
  // window 480–1380 (900 min). At 12:00: elapsed (720−480)/900 = 4/15,
  // expected 2300 × 4/15 = 613.33; tolerance max(2300×0.05, 100) = 115.
  it("within tolerance → on_pace", () => {
    expect(computeMealPace({ ...base, currentValue: 550, now: at(12) }).status).toBe("on_pace");
  });
  it("ahead beyond tolerance → ahead with rounded delta", () => {
    const r = computeMealPace({ ...base, currentValue: 800, now: at(12) });
    expect(r.status).toBe("ahead");
    expect(r.delta).toBe(Math.round(800 - (2300 * 4) / 15)); // 187
  });
  it("behind: delta, catch-up aimed at next milestone (dinner)", () => {
    // 13:00: expected 2300×(780−480)/900 = 766.67; current 400 → behind 367.
    // Next milestone = dinner 18:00 (1080): target 2300×600/900 = 1533.33
    // → catchUp round(1533.33−400) = 1133, label "dinner (6 PM)".
    const r = computeMealPace({ ...base, currentValue: 400, now: at(13) });
    expect(r.status).toBe("behind");
    expect(r.delta).toBe(367);
    expect(r.catchUpAmount).toBe(1133);
    expect(r.catchUpLabel).toBe("dinner (6 PM)");
  });
  it("after all meals → catch-up aimed at end of day", () => {
    const r = computeMealPace({ ...base, currentValue: 1200, now: at(19) });
    expect(r.status).toBe("behind");
    expect(r.catchUpLabel).toBe("end of day (11 PM)");
    // target ratio 1 → catchUp = 2300 − 1200
    expect(r.catchUpAmount).toBe(1100);
  });
});

describe("tolerance floors", () => {
  it("calories floor 100 beats 5% for small goals", () => {
    // goal 1000 → 5% = 50 < floor 100. At 12:00 expected 266.67; 190 behind
    // by 76.67 → within the 100 floor → on_pace.
    expect(
      computeMealPace({ ...base, goal: 1000, currentValue: 190, now: at(12) }).status,
    ).toBe("on_pace");
  });
  it("protein floor 8 g", () => {
    // goal 100g → 5% = 5 < floor 8. At 12:00 expected 26.67; 20 → behind 6.67
    // → within floor → on_pace.
    expect(
      computeMealPace({
        ...base, macro: "protein", goal: 100, currentValue: 20, now: at(12),
      }).status,
    ).toBe("on_pace");
  });
});

describe("milestone label formatting", () => {
  it("half-hour meal times format with minutes", () => {
    const r = computeMealPace({
      ...base,
      mealTimes: { breakfast: "08:00", lunch: "12:30", dinner: "18:00" },
      currentValue: 100,
      now: at(11),
    });
    expect(r.status).toBe("behind");
    expect(r.catchUpLabel).toBe("lunch (12:30 PM)");
  });

  it("midnight wraparound: hour 0 displays as 12, not 0", () => {
    // windowEnd "24:00" parses to 1440 minutes; formatHourLabel(1440) hits
    // the h===0 (Math.floor(1440/60)%24 === 24%24 === 0) branch, which
    // mealPace.ts's `h === 0 ? 12 : ...` maps to display "12". now=23:30
    // is after all three main meals, so nextMilestone falls through to its
    // windowEnd default ("end of day").
    const r = computeMealPace({
      ...base,
      windowEnd: "24:00",
      currentValue: 1900,
      now: at(23, 30),
    });
    expect(r.status).toBe("behind");
    expect(r.catchUpLabel).toBe("end of day (12 AM)");
  });
});

describe("tolerance boundary (5% vs the per-macro floor)", () => {
  // A shared local constant standing in for mealPace.ts's private 0.05
  // tolerance-percentage literal (not exported by the lib) — used below to
  // derive tolerance arithmetically instead of hardcoding it.
  const TOLERANCE_PCT = 0.05;

  it("calories, 5% binding (goal large enough that 5% > the 100 cal floor): exactly at tolerance is on_pace, one more is behind", () => {
    // window 480–1380 (900 min); now 15:30 → elapsed (930−480)/900 = 0.5
    // exactly, so expected = 2300 × 0.5 = 1150 (whole, no rounding noise).
    // tolerance = max(2300 × 0.05, 100) = max(115, 100) = 115 (5% wins).
    const goal = 2300;
    const expected = goal * 0.5;
    const tolerance = Math.max(goal * TOLERANCE_PCT, 100);
    const atBoundary = computeMealPace({
      ...base, goal, currentValue: expected - tolerance, now: at(15, 30),
    });
    expect(atBoundary.status).toBe("on_pace");
    const overBoundary = computeMealPace({
      ...base, goal, currentValue: expected - tolerance - 1, now: at(15, 30),
    });
    expect(overBoundary.status).toBe("behind");
  });

  it("calories, floor binding (small goal, 5% < the 100 cal floor): exactly at the floor is on_pace, one more is behind", () => {
    // Same 0.5 elapsed point → expected = 1000 × 0.5 = 500.
    // tolerance = max(1000 × 0.05, 100) = max(50, 100) = 100 (floor wins).
    const CALORIE_FLOOR = 100; // mealPace.ts's private "100 cal" floor literal
    const goal = 1000;
    const expected = goal * 0.5;
    const tolerance = Math.max(goal * TOLERANCE_PCT, CALORIE_FLOOR);
    expect(tolerance).toBe(CALORIE_FLOOR); // sanity: floor is actually binding here
    const atBoundary = computeMealPace({
      ...base, goal, currentValue: expected - tolerance, now: at(15, 30),
    });
    expect(atBoundary.status).toBe("on_pace");
    const overBoundary = computeMealPace({
      ...base, goal, currentValue: expected - tolerance - 1, now: at(15, 30),
    });
    expect(overBoundary.status).toBe("behind");
  });

  it("protein, floor binding (5% < the 8 g floor): exactly at the floor is on_pace, one more is behind", () => {
    // Same 0.5 elapsed point → expected = 100 × 0.5 = 50.
    // tolerance = max(100 × 0.05, 8) = max(5, 8) = 8 (floor wins).
    const PROTEIN_FLOOR = 8; // mealPace.ts's private "8 g" floor literal
    const goal = 100;
    const expected = goal * 0.5;
    const tolerance = Math.max(goal * TOLERANCE_PCT, PROTEIN_FLOOR);
    expect(tolerance).toBe(PROTEIN_FLOOR); // sanity: floor is actually binding here
    const atBoundary = computeMealPace({
      ...base, macro: "protein", goal, currentValue: expected - tolerance, now: at(15, 30),
    });
    expect(atBoundary.status).toBe("on_pace");
    const overBoundary = computeMealPace({
      ...base, macro: "protein", goal, currentValue: expected - tolerance - 1, now: at(15, 30),
    });
    expect(overBoundary.status).toBe("behind");
  });
});

describe("rounding: Math.round, not Math.floor or Math.ceil", () => {
  it("ahead delta below the midpoint rounds down (not up, as Math.ceil would)", () => {
    // goal 901, now 20:00 → elapsed (1200−480)/900 = 0.8; expected =
    // 901 × 0.8 = 720.8. currentValue 900 → raw delta = 900 − 720.8 = 179.2,
    // fractional .2 < .5, so Math.round and Math.ceil disagree (179 vs 180).
    const r = computeMealPace({ ...base, goal: 901, currentValue: 900, now: at(20) });
    expect(r.status).toBe("ahead");
    expect(r.delta).toBe(179);
  });

  it("behind delta below the midpoint rounds down (not up, as Math.ceil would)", () => {
    // goal 901, now 11:00 → elapsed (660−480)/900 = 0.2; expected =
    // 901 × 0.2 = 180.2. currentValue 50 → raw delta = 50 − 180.2 = −130.2,
    // so −delta = 130.2, fractional .2 < .5: Math.round and Math.ceil
    // disagree (130 vs 131).
    const r = computeMealPace({ ...base, goal: 901, currentValue: 50, now: at(11) });
    expect(r.status).toBe("behind");
    expect(r.delta).toBe(130);
  });

  it("catch-up amount at/above the midpoint rounds up (not down, as Math.floor would)", () => {
    // goal 902, now 10:00 → elapsed (600−480)/900 = 2/15; expected =
    // 902 × 2/15 = 120.2667. currentValue 10 → raw delta = 10 − 120.2667 =
    // −110.2667 (tolerance max(902×0.05,100)=100, so behind).
    // Next milestone (lunch, 12:00): targetRatio (720−480)/900 = 4/15;
    // expectedAtTarget = 902 × 4/15 = 240.5333. catch-up raw = 240.5333 − 10
    // = 230.5333, fractional .533 ≥ .5: Math.round and Math.floor disagree
    // (231 vs 230).
    const r = computeMealPace({ ...base, goal: 902, currentValue: 10, now: at(10) });
    expect(r.status).toBe("behind");
    expect(r.catchUpAmount).toBe(231);
    expect(r.catchUpLabel).toBe("lunch (12 PM)");
  });
});

describe("milestone selection: strict inequalities", () => {
  it("a meal exactly at now has already passed — not selected as the next milestone", () => {
    // now is exactly lunch time (12:00). If the milestone filter used
    // `>=` instead of `> nowMin`, lunch would still count as "upcoming"
    // and win (it sorts earliest); the strictly-after rule means dinner
    // is the next milestone instead.
    const r = computeMealPace({ ...base, currentValue: 400, now: at(12) });
    expect(r.status).toBe("behind");
    expect(r.catchUpLabel).toBe("dinner (6 PM)");
  });

  it("a meal exactly at windowEnd is still a reachable milestone (inclusive upper bound)", () => {
    // dinner is set to exactly windowEnd (20:00). If the milestone filter
    // used `< windowEndMin` instead of `<=`, dinner would be excluded and
    // the milestone would fall through to the generic "end of day" label
    // even though it names the identical clock time.
    const r = computeMealPace({
      ...base,
      windowEnd: "20:00",
      mealTimes: { breakfast: "08:00", lunch: "12:00", dinner: "20:00" },
      currentValue: 1900,
      now: at(19),
    });
    expect(r.status).toBe("behind");
    expect(r.catchUpLabel).toBe("dinner (8 PM)");
  });
});

describe("window boundary: exact edges are inside the window", () => {
  it("exactly at windowStart is not before_window", () => {
    const r = computeMealPace({ ...base, currentValue: 50, now: at(8, 0) });
    expect(r.status).toBe("on_pace");
  });

  it("exactly at windowEnd is not after_window", () => {
    const r = computeMealPace({ ...base, currentValue: 2290, now: at(23, 0) });
    expect(r.status).toBe("on_pace");
  });
});
