import {
  ATTRIBUTION_SLOP_MIN,
  attributeLogs,
  buildFuelRail,
  DEFAULT_BUDGET_WEIGHTS,
  fuelVerdict,
  LEGACY_WINDOW_SPAN_MIN,
  mergeAiPicks,
  pickForWindows,
  planProjection,
  portionFactor,
  portionLabel,
  redistributionNote,
  timeToMinutes,
  windowsFromLegacyTimes,
  windowsFromRows,
  windowStates,
  windowTargets,
  type AttributedLog,
  type FuelCandidate,
  type FuelLogInput,
  type FuelWindow,
} from "../fuelPlan";

// -- fixtures ---------------------------------------------------------------

const win = (over: Partial<FuelWindow> = {}): FuelWindow => ({
  id: "w-breakfast",
  label: "Breakfast",
  mealType: "breakfast",
  startMinutes: 7 * 60,
  endMinutes: 9 * 60,
  budgetWeight: 1,
  ...over,
});

const DAY: FuelWindow[] = [
  win(),
  win({ id: "w-lunch", label: "Lunch", mealType: "lunch", startMinutes: 12 * 60, endMinutes: 13.5 * 60, budgetWeight: 1.2 }),
  win({ id: "w-dinner", label: "Dinner", mealType: "dinner", startMinutes: 18 * 60, endMinutes: 19.5 * 60, budgetWeight: 1.4 }),
];

const log = (over: Partial<FuelLogInput> = {}): FuelLogInput => ({
  id: "l1",
  mealType: "breakfast",
  loggedAtMinutes: 8 * 60,
  calories: 440,
  protein: 24,
  name: "Muesli",
  ...over,
});

const cand = (over: Partial<FuelCandidate> = {}): FuelCandidate => ({
  mealId: "m1",
  name: "Meal",
  calories: 470,
  protein: 28,
  prepMinutes: 0,
  score: 80,
  mealType: "lunch",
  assemblable: true,
  rescueCount: 0,
  rescueSoonestDays: null,
  faceUrl: null,
  ...over,
});

// -- windows ----------------------------------------------------------------

describe("windowsFromLegacyTimes", () => {
  it("derives three 90-minute windows from the profile point times", () => {
    const w = windowsFromLegacyTimes({ breakfast: "08:00", lunch: "12:00", dinner: "18:00" });
    expect(w.map((x) => x.label)).toEqual(["Breakfast", "Lunch", "Dinner"]);
    expect(w[0].startMinutes).toBe(480);
    expect(w[0].endMinutes).toBe(480 + LEGACY_WINDOW_SPAN_MIN);
    expect(w[2].budgetWeight).toBe(DEFAULT_BUDGET_WEIGHTS.dinner);
  });
});

describe("windowsFromRows", () => {
  it("sorts by start time and fills default weights", () => {
    const w = windowsFromRows([
      { id: "b", label: "Dinner", meal_type: "dinner", start_time: "18:00:00", end_time: "19:30:00", budget_weight: null },
      { id: "a", label: "Breakfast", meal_type: "breakfast", start_time: "07:00", end_time: "09:00", budget_weight: 2 },
    ]);
    expect(w.map((x) => x.id)).toEqual(["a", "b"]);
    expect(w[0].budgetWeight).toBe(2);
    expect(w[1].budgetWeight).toBe(DEFAULT_BUDGET_WEIGHTS.dinner);
    expect(w[1].startMinutes).toBe(timeToMinutes("18:00"));
  });
});

// -- attribution ------------------------------------------------------------

describe("attributeLogs", () => {
  it("puts a log inside its window", () => {
    const [a] = attributeLogs([log()], DAY);
    expect(a.windowId).toBe("w-breakfast");
  });

  it("prefers the matching meal type when windows overlap", () => {
    const overlapping = [
      win({ id: "w-snack", label: "Snack", mealType: "snack", startMinutes: 7 * 60, endMinutes: 10 * 60 }),
      win(),
    ];
    const [a] = attributeLogs([log()], overlapping);
    expect(a.windowId).toBe("w-breakfast");
  });

  it("pulls a late breakfast into the breakfast window within the slop", () => {
    const [a] = attributeLogs([log({ loggedAtMinutes: 9 * 60 + 40 })], DAY);
    expect(a.windowId).toBe("w-breakfast");
  });

  it("gives up past the slop: an unplanned log has no window", () => {
    const [a] = attributeLogs(
      [log({ mealType: "snack", loggedAtMinutes: 15 * 60 })],
      DAY,
    );
    expect(a.windowId).toBeNull();
  });

  it("slop boundary is inclusive", () => {
    const [a] = attributeLogs(
      [log({ loggedAtMinutes: 9 * 60 + ATTRIBUTION_SLOP_MIN })],
      DAY,
    );
    expect(a.windowId).toBe("w-breakfast");
  });
});

// -- states -----------------------------------------------------------------

describe("windowStates", () => {
  const attributed = attributeLogs([log()], DAY);

  it("reads the whole day off one clock", () => {
    const s = windowStates(DAY, attributed, 13 * 60); // 1 PM
    expect(s.map((x) => x.status)).toEqual(["done", "live", "upcoming"]);
  });

  it("an empty window past its end is missed", () => {
    const s = windowStates(DAY, [], 14 * 60);
    expect(s.map((x) => x.status)).toEqual(["missed", "missed", "upcoming"]);
  });

  it("eaten outranks in-progress: a live window with a log is done", () => {
    const lunchLog = attributeLogs([log({ id: "l2", mealType: "lunch", loggedAtMinutes: 12.5 * 60 })], DAY);
    const s = windowStates(DAY, lunchLog, 13 * 60);
    expect(s[1].status).toBe("done");
  });
});

// -- targets ----------------------------------------------------------------

describe("windowTargets", () => {
  it("splits the remaining budget by weight over open windows only", () => {
    const states = windowStates(DAY, attributeLogs([log()], DAY), 11 * 60);
    // Remaining: 2300-440 = 1860 cal over lunch(1.2) + dinner(1.4) = 2.6
    const t = windowTargets({
      states,
      goalCalories: 2300,
      goalProtein: 160,
      consumedCalories: 440,
      consumedProtein: 24,
    });
    expect(t).toHaveLength(2);
    expect(t[0]).toEqual({ windowId: "w-lunch", targetCalories: 858, targetProtein: 63 });
    expect(t[1].targetCalories).toBe(1002);
  });

  it("a missed window's share flows to the others", () => {
    const missedBreakfast = windowTargets({
      states: windowStates(DAY, [], 10 * 60), // breakfast missed, nothing eaten
      goalCalories: 2600,
      goalProtein: null,
      consumedCalories: 0,
      consumedProtein: 0,
    });
    // Full 2600 over lunch+dinner — breakfast's weight is out of the denominator.
    expect(missedBreakfast.map((t) => t.targetCalories)).toEqual([1200, 1400]);
  });

  it("returns nothing when every window is closed", () => {
    expect(
      windowTargets({
        states: windowStates(DAY, [], 23 * 60),
        goalCalories: 2300,
        goalProtein: 160,
        consumedCalories: 0,
        consumedProtein: 0,
      }),
    ).toEqual([]);
  });

  it("never plans negative food when ahead of goal", () => {
    const t = windowTargets({
      states: windowStates(DAY, [], 6 * 60),
      goalCalories: 2000,
      goalProtein: 100,
      consumedCalories: 2400,
      consumedProtein: 120,
    });
    expect(t.every((x) => x.targetCalories === 0 && x.targetProtein === 0)).toBe(true);
  });
});

describe("redistributionNote", () => {
  it("says roughly what moved and where", () => {
    const note = redistributionNote({
      missed: DAY[0],
      allWindows: DAY,
      openLabels: ["Snack", "Dinner"],
      goalCalories: 2300,
    });
    // breakfast weight 1 of 3.6 total ≈ 639 → rounded to tens
    expect(note).toBe("~640 cal moved to Snack & Dinner");
  });

  it("stays quiet without a goal or open windows", () => {
    expect(
      redistributionNote({ missed: DAY[0], allWindows: DAY, openLabels: [], goalCalories: 2300 }),
    ).toBeNull();
    expect(
      redistributionNote({ missed: DAY[0], allWindows: DAY, openLabels: ["Dinner"], goalCalories: null }),
    ).toBeNull();
  });
});

// -- portioning -------------------------------------------------------------

describe("portionFactor / portionLabel", () => {
  it("never scales down", () => {
    expect(portionFactor(300, 470)).toBe(1);
  });
  it("scales up in kitchen steps, capped", () => {
    expect(portionFactor(590, 470)).toBe(1.25);
    expect(portionFactor(2000, 470)).toBe(1.5);
  });
  it("labels only when worth saying", () => {
    expect(portionLabel(1.1)).toBeNull();
    expect(portionLabel(1.25)).toBe("portion 1.25×");
  });
  it("handles a zero-calorie meal", () => {
    expect(portionFactor(500, 0)).toBe(1);
  });
});

// -- picks ------------------------------------------------------------------

describe("pickForWindows", () => {
  const openStates = windowStates(DAY, attributeLogs([log()], DAY), 11 * 60);
  const targets = windowTargets({
    states: openStates,
    goalCalories: 2300,
    goalProtein: 160,
    consumedCalories: 440,
    consumedProtein: 24,
  });

  it("expiring food jumps the queue (R11)", () => {
    const picks = pickForWindows({
      states: openStates,
      targets,
      candidates: [
        cand({ mealId: "high", name: "High score", score: 95 }),
        cand({ mealId: "rescue", name: "Rescue", score: 60, rescueCount: 1, rescueSoonestDays: 1 }),
      ],
      maxPrepMinutes: 5,
    });
    expect(picks[0].mealId).toBe("rescue");
    expect(picks[0].reasons).toContain("uses food expiring in 1d");
  });

  it("sooner expiry beats more items rescued", () => {
    const picks = pickForWindows({
      states: openStates,
      targets,
      candidates: [
        cand({ mealId: "three", name: "Saves three", rescueCount: 3, rescueSoonestDays: 3 }),
        cand({ mealId: "today", name: "Saves one today", rescueCount: 1, rescueSoonestDays: 0 }),
      ],
      maxPrepMinutes: 5,
    });
    expect(picks[0].mealId).toBe("today");
    expect(picks[0].reasons).toContain("uses food expiring today");
  });

  it("each meal is picked at most once across the day", () => {
    const picks = pickForWindows({
      states: openStates,
      targets,
      candidates: [cand({ mealId: "only", name: "Only meal" })],
      maxPrepMinutes: 5,
    });
    expect(picks).toHaveLength(1);
  });

  it("window affinity nudges, big score gaps still win", () => {
    const picks = pickForWindows({
      states: openStates,
      targets,
      candidates: [
        cand({ mealId: "lunchy", name: "Lunchy", mealType: "lunch", score: 80 }),
        cand({ mealId: "dinnery", name: "Dinnery", mealType: "dinner", score: 85 }),
      ],
      maxPrepMinutes: 5,
    });
    // lunch window: 80+12 affinity beats 85 → Lunchy takes lunch
    expect(picks[0].mealId).toBe("lunchy");
    expect(picks[1].mealId).toBe("dinnery");
  });

  it("prep budget gates the live window but not tonight", () => {
    const picks = pickForWindows({
      states: openStates, // lunch live at 11:00? — lunch starts 12:00 so lunch is upcoming
      targets,
      candidates: [cand({ mealId: "slow", name: "Slow", prepMinutes: 30 })],
      maxPrepMinutes: 5,
    });
    // No live windows at 11:00, so the slow meal is allowed for upcoming lunch.
    expect(picks[0].mealId).toBe("slow");

    const liveStates = windowStates(DAY, attributeLogs([log()], DAY), 12.5 * 60);
    const liveTargets = windowTargets({
      states: liveStates, goalCalories: 2300, goalProtein: 160,
      consumedCalories: 440, consumedProtein: 24,
    });
    const livePicks = pickForWindows({
      states: liveStates,
      targets: liveTargets,
      candidates: [cand({ mealId: "slow", name: "Slow", prepMinutes: 30 })],
      maxPrepMinutes: 5,
    });
    // Lunch is live now: the 30-minute meal is out for lunch, in for dinner.
    expect(livePicks.map((p) => p.windowId)).toEqual(["w-dinner"]);
  });

  it("adds a portion reason when the window budget outgrows the meal", () => {
    const bigTarget = [{ windowId: "w-dinner", targetCalories: 1200, targetProtein: 70 }];
    const dinnerOnly = windowStates(
      [DAY[2]],
      [],
      17 * 60,
    );
    const picks = pickForWindows({
      states: dinnerOnly,
      targets: bigTarget,
      candidates: [cand({ mealId: "bowl", name: "Bowl", calories: 900, mealType: "dinner" })],
      maxPrepMinutes: 5,
    });
    expect(picks[0].portion).toBe(1.35); // 1200/900 = 1.33, nearest kitchen step up
    expect(picks[0].reasons.join(" ")).toContain("portion 1.35× to close the gap");
  });
});

// -- AI merge ---------------------------------------------------------------

describe("mergeAiPicks", () => {
  const states = windowStates(DAY, attributeLogs([log()], DAY), 11 * 60);
  const targets = windowTargets({
    states, goalCalories: 2300, goalProtein: 160,
    consumedCalories: 440, consumedProtein: 24,
  });
  const candidates = [
    cand({ mealId: "pasta", name: "Pasta", mealType: "lunch" }),
    cand({ mealId: "bowl", name: "Bowl", mealType: "dinner", calories: 990 }),
    cand({ mealId: "slow", name: "Slow", prepMinutes: 30 }),
  ];
  const rulesPicks = pickForWindows({ states, targets, candidates, maxPrepMinutes: 5 });

  it("honors a valid assignment and carries the model's sentence", () => {
    const merged = mergeAiPicks({
      states, targets, candidates, rulesPicks,
      ai: [{ windowId: "w-lunch", mealId: "bowl", reason: "protein now beats protein at nine" }],
      maxPrepMinutes: 5,
    });
    const lunch = merged.find((p) => p.windowId === "w-lunch");
    expect(lunch?.mealId).toBe("bowl");
    expect(lunch?.reasons[0]).toBe("protein now beats protein at nine");
    // Bowl is taken, so dinner falls back to a different rules-consistent meal.
    const dinner = merged.find((p) => p.windowId === "w-dinner");
    expect(dinner?.mealId).not.toBe("bowl");
  });

  it("an unknown meal id falls back to the rules pick", () => {
    const merged = mergeAiPicks({
      states, targets, candidates, rulesPicks,
      ai: [{ windowId: "w-lunch", mealId: "ghost", reason: null }],
      maxPrepMinutes: 5,
    });
    expect(merged.find((p) => p.windowId === "w-lunch")?.mealId).toBe(
      rulesPicks.find((p) => p.windowId === "w-lunch")?.mealId,
    );
  });

  it("the live-window prep gate outranks the model", () => {
    const liveStates = windowStates(DAY, attributeLogs([log()], DAY), 12.5 * 60);
    const liveTargets = windowTargets({
      states: liveStates, goalCalories: 2300, goalProtein: 160,
      consumedCalories: 440, consumedProtein: 24,
    });
    const liveRules = pickForWindows({
      states: liveStates, targets: liveTargets, candidates, maxPrepMinutes: 5,
    });
    const merged = mergeAiPicks({
      states: liveStates, targets: liveTargets, candidates, rulesPicks: liveRules,
      ai: [{ windowId: "w-lunch", mealId: "slow", reason: "worth the wait" }],
      maxPrepMinutes: 5,
    });
    expect(merged.find((p) => p.windowId === "w-lunch")?.mealId).not.toBe("slow");
  });

  it("portions stay rules-owned even on AI picks", () => {
    const bigTargets = [{ windowId: "w-dinner", targetCalories: 1400, targetProtein: 80 }];
    const dinnerStates = windowStates([DAY[2]], [], 17 * 60);
    const merged = mergeAiPicks({
      states: dinnerStates, targets: bigTargets, candidates,
      rulesPicks: [],
      ai: [{ windowId: "w-dinner", mealId: "bowl", reason: null }],
      maxPrepMinutes: 5,
    });
    expect(merged[0].portion).toBe(1.4); // 1400/990 → 1.414 → nearest 0.05 down
  });
});

// -- projection + verdict ---------------------------------------------------

describe("planProjection", () => {
  it("projects consumed plus portioned picks", () => {
    const p = planProjection({
      consumedCalories: 560,
      consumedProtein: 44,
      picks: [
        { windowId: "w", mealId: "m", name: "x", calories: 470, protein: 28, portion: 1, faceUrl: null, reasons: [] },
        { windowId: "w2", mealId: "m2", name: "y", calories: 990, protein: 64, portion: 1.25, faceUrl: null, reasons: [] },
      ],
      goalCalories: 2300,
      goalProtein: 160,
    });
    expect(p.calories).toBe(560 + 470 + Math.round(990 * 1.25));
    expect(p.protein).toBe(44 + 28 + 80);
    expect(p.onGoal).toBe(true);
  });

  it("a projected protein shortfall fails the landing", () => {
    const p = planProjection({
      consumedCalories: 2200,
      consumedProtein: 90,
      picks: [],
      goalCalories: 2300,
      goalProtein: 160,
    });
    expect(p.onGoal).toBe(false);
  });
});

describe("fuelVerdict", () => {
  it("behind on either macro is behind", () => {
    expect(
      fuelVerdict({ calorieStatus: "on_pace", proteinStatus: "behind", nowMinutes: 800, windowEndMinutes: 1380 }).tone,
    ).toBe("behind");
  });
  it("both goals hit reads as done", () => {
    expect(
      fuelVerdict({ calorieStatus: "goal_hit", proteinStatus: "goal_hit", nowMinutes: 800, windowEndMinutes: 1380 }).tone,
    ).toBe("goal_hit");
  });
  it("after the window the day is closed", () => {
    expect(
      fuelVerdict({ calorieStatus: "behind", proteinStatus: "behind", nowMinutes: 1400, windowEndMinutes: 1380 }).tone,
    ).toBe("closed");
  });
});

// -- rail -------------------------------------------------------------------

describe("buildFuelRail", () => {
  const attributed = attributeLogs(
    [log(), log({ id: "l2", mealType: "snack", loggedAtMinutes: 11 * 60 + 5, name: "Shake", calories: 120, protein: 20 })],
    DAY,
  );

  const mkToday = (nowMinutes: number) => {
    const states = windowStates(DAY, attributed, nowMinutes);
    const targets = windowTargets({
      states, goalCalories: 2300, goalProtein: 160,
      consumedCalories: 560, consumedProtein: 44,
    });
    const picks = pickForWindows({
      states,
      targets,
      candidates: [
        cand({ mealId: "pasta", name: "Pasta", mealType: "lunch", rescueCount: 1, rescueSoonestDays: 1 }),
        cand({ mealId: "bowl", name: "Bowl", mealType: "dinner", calories: 990, protein: 64 }),
      ],
      maxPrepMinutes: 5,
    });
    const projection = planProjection({
      consumedCalories: 560, consumedProtein: 44, picks,
      goalCalories: 2300, goalProtein: 160,
    });
    return buildFuelRail({ states, logs: attributed, picks, projection, nowMinutes, goalCalories: 2300 });
  };

  it("orders the whole day: receipts, retro, NOW, plan, landing", () => {
    const rows = mkToday(13 * 60 + 25); // 1:25 PM, lunch live
    expect(rows.map((r) => r.kind)).toEqual([
      "logged", "logged", "retro", "now", "suggestion", "suggestion", "landing",
    ]);
    const nowIdx = rows.findIndex((r) => r.kind === "now");
    const firstSugg = rows.findIndex((r) => r.kind === "suggestion");
    expect(firstSugg).toBeGreaterThan(nowIdx);
  });

  it("a live window's suggestion renders at now, flagged when closing", () => {
    const rows = mkToday(13 * 60 + 25); // lunch ends 13:30 — 5 min left
    const sugg = rows.find((r) => r.kind === "suggestion" && r.window.id === "w-lunch");
    expect(sugg && sugg.kind === "suggestion" && sugg.closingSoon).toBe(true);
  });

  it("a missed window appears on the rail with its note", () => {
    const noBreakfast = attributeLogs([], DAY);
    const states = windowStates(DAY, noBreakfast, 10 * 60);
    const rows = buildFuelRail({
      states, logs: noBreakfast, picks: [], projection: null,
      nowMinutes: 10 * 60, goalCalories: 2300,
    });
    const missed = rows.find((r) => r.kind === "missed");
    expect(missed && missed.kind === "missed" && missed.note).toContain("moved to");
  });

  it("past days are receipts only (R6)", () => {
    const rows = buildFuelRail({
      states: windowStates(DAY, attributed, 23 * 60),
      logs: attributed,
      picks: [],
      projection: null,
      nowMinutes: null,
      goalCalories: 2300,
    });
    expect(rows.every((r) => r.kind === "logged")).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("an open window with no candidates renders as an empty slot", () => {
    const states = windowStates(DAY, attributed, 17 * 60);
    const rows = buildFuelRail({
      states, logs: attributed, picks: [], projection: null,
      nowMinutes: 17 * 60, goalCalories: 2300,
    });
    expect(rows.some((r) => r.kind === "empty-slot")).toBe(true);
  });
});
