import {
  recommendEatNext,
  EMERGENCY_MIN_GAP_CAL,
  PREP_HARD_CAP_FACTOR,
  POST_WORKOUT_WINDOW_MIN,
  POST_WORKOUT_MIN_PROTEIN_G,
  PROTEIN_SHORT_G,
  PROTEIN_SHORT_MAX_CAL,
  BRIDGE_PREFER_GAP_MIN,
  CATCH_UP_BAND,
  NUDGE_MIN_GAP_CAL,
  NUDGE_MILESTONE_OFFSET_MIN,
  EMERGENCY_CHECK_BEFORE_END_MIN,
  type EatNextInput,
  type ScoredMeal,
} from "../eatNext";
import { EMPTY_TOTALS } from "../mealMacros";
import type { MealCategory, MealRole } from "@/src/types/meal-library";

// ── fixtures ───────────────────────────────────────────────────────────────
// Minutes: window 08:00–23:00 (480–1380); meals 08:00/12:00/18:00.
const BASE: Omit<EatNextInput, "meals"> = {
  nowMinutes: 13 * 60, // 13:00
  windowStartMinutes: 8 * 60,
  windowEndMinutes: 23 * 60,
  mealTimesMinutes: { breakfast: 8 * 60, lunch: 12 * 60, dinner: 18 * 60 },
  dayTotals: { ...EMPTY_TOTALS, calories: 900, protein: 60 },
  goals: {
    calories: 2300, protein: 160, carbs: null, sodium_mg: null,
    fats: null, sugars: null, fiber_g: null,
  },
  caloriePace: { status: "on_pace" },
  proteinPace: { status: "on_pace" },
  maxPrepMinutes: 5,
  workoutCompletedAtMinutes: null,
  nudgesEnabled: false,
};

let nextId = 0;
function scored(over: {
  name?: string;
  category?: MealCategory;
  role?: MealRole | null;
  prep?: number;
  calories?: number;
  protein?: number;
  score?: number;
  raw?: number;
  containsNever?: boolean;
  approved?: boolean;
}): ScoredMeal {
  const id = `m${nextId++}`;
  const calories = over.calories ?? 600;
  const protein = over.protein ?? 35;
  return {
    meal: {
      id,
      user_id: "u",
      name: over.name ?? id,
      slug: id,
      category: over.category ?? "lunch",
      role: over.role ?? null,
      default_meal_type: null,
      prep_minutes: over.prep ?? 5,
      taste_override: null,
      notes: null,
      created_at: "",
      updated_at: "",
      items: [],
    },
    totals: {
      calories, protein, carbs: 0, fats: 0, sugars: 0, sodium_mg: 0, fiber_g: 0,
    },
    score: {
      taste: 22, convenience: 20, protein: 12, eoe: 15, calories: 10,
      // Ranking reads `raw` (Phase 2 amendment: the /100 score's rounding
      // creates ties raw doesn't have). Default keeps the single-knob
      // convenience most tests use; `raw` can be driven independently of
      // `score` to prove ranking actually reads `raw` (see "ranks by raw,
      // not the rounded score" below).
      raw: over.raw ?? over.score ?? 83, score: over.score ?? 83,
      tasteUnknown: false,
      containsNever: over.containsNever ?? false,
      approved: over.approved ?? true,
      totalCalories: calories, totalProtein: protein,
    },
  };
}
const input = (over: Partial<EatNextInput>, meals: ScoredMeal[]): EatNextInput =>
  ({ ...BASE, ...over, meals });

beforeEach(() => { nextId = 0; });

// ── terminal contexts ──────────────────────────────────────────────────────
describe("terminal contexts", () => {
  it("after_window: nothing recommended past windowEnd", () => {
    const r = recommendEatNext(input({ nowMinutes: 23 * 60 + 10 }, [scored({})]));
    expect(r.context).toBe("after_window");
    expect(r.recommendations).toHaveLength(0);
  });

  it("goal_hit with protein satisfied: terminal, no recommendations", () => {
    const r = recommendEatNext(
      input(
        {
          dayTotals: { ...EMPTY_TOTALS, calories: 2350, protein: 158 },
          caloriePace: { status: "goal_hit" },
        },
        [scored({})],
      ),
    );
    expect(r.context).toBe("goal_hit");
    expect(r.recommendations).toHaveLength(0);
    expect(r.message).toMatch(/target hit/i);
  });

  it("goal_hit but protein ≥15g short: one high-protein bridge/booster under 300 cal", () => {
    const bridgeSmall = scored({ role: "bridge", calories: 290, protein: 25 });
    const boosterBig = scored({ role: "calorie_booster", calories: 690, protein: 27 });
    const plain = scored({ calories: 250, protein: 30 });
    const r = recommendEatNext(
      input(
        { dayTotals: { ...EMPTY_TOTALS, calories: 2400, protein: 140 } },
        [boosterBig, plain, bridgeSmall],
      ),
    );
    expect(r.context).toBe("goal_hit");
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0].mealId).toBe(bridgeSmall.meal.id);
    expect(r.recommendations[0].reasons.join(" ")).toMatch(/protein/i);
  });

  it("goal_hit protein-short with NO qualifying meal stays terminal (no fall-through)", () => {
    const r = recommendEatNext(
      input(
        { dayTotals: { ...EMPTY_TOTALS, calories: 2400, protein: 140 } },
        [scored({ calories: 600 })], // too big to qualify
      ),
    );
    expect(r.context).toBe("goal_hit");
    expect(r.recommendations).toHaveLength(0);
  });

  it("at exactly windowEndMinutes the window is still open (spec §5.3.1: 'past', not 'at')", () => {
    const snack = scored({ category: "snack" });
    const r = recommendEatNext(input({ nowMinutes: BASE.windowEndMinutes }, [snack]));
    expect(r.context).not.toBe("after_window");
    expect(r.context).toBe("next_meal");
  });

  it(`goal_hit protein exception: exactly ${PROTEIN_SHORT_G}g short qualifies, ${PROTEIN_SHORT_G - 1}g short does not`, () => {
    const bridge = scored({ role: "bridge", calories: 250, protein: 20 });
    const rAt = recommendEatNext(
      input(
        { dayTotals: { ...EMPTY_TOTALS, calories: 2300, protein: 160 - PROTEIN_SHORT_G } },
        [bridge],
      ),
    );
    expect(rAt.context).toBe("goal_hit");
    expect(rAt.recommendations).toHaveLength(1);
    expect(rAt.recommendations[0].mealId).toBe(bridge.meal.id);

    const rUnder = recommendEatNext(
      input(
        { dayTotals: { ...EMPTY_TOTALS, calories: 2300, protein: 160 - (PROTEIN_SHORT_G - 1) } },
        [bridge],
      ),
    );
    expect(rUnder.context).toBe("goal_hit");
    expect(rUnder.recommendations).toHaveLength(0);
  });

  it(`goal_hit protein exception: calories must be strictly under ${PROTEIN_SHORT_MAX_CAL} (at-cap excluded)`, () => {
    const dayTotals = { ...EMPTY_TOTALS, calories: 2300, protein: 140 }; // 20g short
    const atCap = scored({ role: "bridge", calories: PROTEIN_SHORT_MAX_CAL, protein: 30 });
    const rAtCap = recommendEatNext(input({ dayTotals }, [atCap]));
    expect(rAtCap.context).toBe("goal_hit");
    expect(rAtCap.recommendations).toHaveLength(0);

    const underCap = scored({ role: "bridge", calories: PROTEIN_SHORT_MAX_CAL - 1, protein: 30 });
    const rUnderCap = recommendEatNext(input({ dayTotals }, [underCap]));
    expect(rUnderCap.recommendations).toHaveLength(1);
    expect(rUnderCap.recommendations[0].mealId).toBe(underCap.meal.id);
  });

  it("a null calorie goal never counts as goal_hit, no matter how many calories are logged", () => {
    const meal = scored({ category: "dinner" });
    const r = recommendEatNext(
      input({ goals: { ...BASE.goals, calories: null } }, [meal]),
    );
    expect(r.context).toBe("next_meal");
  });

  it("a zero calorie goal never counts as goal_hit, no matter how many calories are logged", () => {
    const meal = scored({ category: "dinner" });
    const r = recommendEatNext(
      input({ goals: { ...BASE.goals, calories: 0 } }, [meal]),
    );
    expect(r.context).toBe("next_meal");
  });
});

// ── post-workout ───────────────────────────────────────────────────────────
describe("post_workout", () => {
  const trained = { workoutCompletedAtMinutes: 12 * 60 }; // 12:00, now 13:00
  it("prefers role=post_workout, then ≥25g protein meals", () => {
    const pw = scored({ role: "post_workout", score: 70 });
    const highP = scored({ protein: 40, score: 90 });
    const lowP = scored({ protein: 10, score: 99 });
    const r = recommendEatNext(input(trained, [lowP, highP, pw]));
    expect(r.context).toBe("post_workout");
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      pw.meal.id, highP.meal.id,
    ]); // lowP excluded entirely
  });
  it("window closes 180 min after completion", () => {
    const r = recommendEatNext(
      input({ workoutCompletedAtMinutes: 13 * 60 - 181 }, [scored({})]),
    );
    expect(r.context).not.toBe("post_workout");
    expect(r.context).toBe("next_meal");
  });
  it("falls through when no candidate meal qualifies", () => {
    const r = recommendEatNext(input(trained, [scored({ protein: 5 })]));
    expect(r.context).toBe("next_meal");
  });

  it(`post-workout window includes exactly ${POST_WORKOUT_WINDOW_MIN} minutes elapsed`, () => {
    const pw = scored({ role: "post_workout" });
    const r = recommendEatNext(
      input({ workoutCompletedAtMinutes: BASE.nowMinutes - POST_WORKOUT_WINDOW_MIN }, [pw]),
    );
    expect(r.context).toBe("post_workout");
  });

  it("a workout completed_at in the future (clock skew) does not trigger post_workout", () => {
    const pw = scored({ role: "post_workout" });
    const r = recommendEatNext(
      input({ workoutCompletedAtMinutes: BASE.nowMinutes + 30 }, [pw]),
    );
    expect(r.context).not.toBe("post_workout");
    expect(r.context).toBe("next_meal");
  });

  it(`post-workout protein bar: exactly ${POST_WORKOUT_MIN_PROTEIN_G}g qualifies, ${POST_WORKOUT_MIN_PROTEIN_G - 1}g does not`, () => {
    const atBar = scored({ protein: POST_WORKOUT_MIN_PROTEIN_G });
    const rAt = recommendEatNext(input(trained, [atBar]));
    expect(rAt.context).toBe("post_workout");
    expect(rAt.recommendations.map((x) => x.mealId)).toEqual([atBar.meal.id]);

    const underBar = scored({ protein: POST_WORKOUT_MIN_PROTEIN_G - 1 });
    const rUnder = recommendEatNext(input(trained, [underBar]));
    expect(rUnder.context).not.toBe("post_workout");
    expect(rUnder.context).toBe("next_meal");
  });
});

// ── emergency / catch_up ───────────────────────────────────────────────────
describe("emergency and catch_up", () => {
  const behind = (catchUpAmount: number): Partial<EatNextInput> => ({
    caloriePace: { status: "behind", delta: catchUpAmount, catchUpAmount },
  });

  it("emergency: past dinner + behind ≥400 → emergency/booster meals, calories descending", () => {
    const small = scored({ category: "emergency", calories: 400 });
    const big = scored({ category: "emergency", calories: 700 });
    const booster = scored({ role: "calorie_booster", category: "shake", calories: 750 });
    const r = recommendEatNext(
      input({ nowMinutes: 20 * 60, ...behind(600) }, [small, booster, big]),
    );
    expect(r.context).toBe("emergency");
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      booster.meal.id, big.meal.id, small.meal.id,
    ]);
  });

  it(`emergency requires gap ≥ EMERGENCY_MIN_GAP_CAL (${EMERGENCY_MIN_GAP_CAL})`, () => {
    // gap 399 misses the emergency bar; 450 cal is within ±35% of 399, so
    // the same meal is caught by catch_up instead.
    const r = recommendEatNext(
      input({ nowMinutes: 20 * 60, ...behind(399) }, [
        scored({ category: "emergency", calories: 450 }),
      ]),
    );
    expect(r.context).toBe("catch_up");
  });

  it("catch_up: candidates within ±35% of catchUpAmount, ranked by score", () => {
    const fits = scored({ calories: 500, score: 80 });
    const fitsBetter = scored({ calories: 450, score: 95 });
    const tooBig = scored({ calories: 900 });
    const tooSmall = scored({ calories: 200 });
    const r = recommendEatNext(input(behind(500), [fits, tooBig, tooSmall, fitsBetter]));
    expect(r.context).toBe("catch_up");
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      fitsBetter.meal.id, fits.meal.id,
    ]);
    expect(r.recommendations[0].reasons.join(" ")).toMatch(/500 cal/);
  });

  it("catch_up with no meal in band falls through to next_meal", () => {
    const r = recommendEatNext(input(behind(500), [scored({ calories: 2000, category: "dinner" })]));
    expect(r.context).toBe("next_meal");
  });

  it("emergency requires being PAST dinner time, even with a huge gap and an emergency-category meal", () => {
    // Same gap (600) and same emergency-eligible meal as the passing "emergency"
    // test above, but now (13:00) is still before dinner (18:00): must not
    // short-circuit into "emergency" — it falls through to catch_up instead.
    const rescue = scored({ category: "emergency", calories: 700 });
    const r = recommendEatNext(input({ ...behind(600) }, [rescue]));
    expect(r.context).not.toBe("emergency");
    expect(r.context).toBe("catch_up");
  });

  it("catch_up requires gap > 0 — a 0-calorie meal must not match a 0 gap", () => {
    // A 0-cal meal (itemless, or a zero-cal drink — both constructible in
    // Phase 2's builder) sits at Math.abs(0 - 0) = 0, which satisfies the
    // ±35% band trivially. The `gap > 0` guard is what keeps a "behind" pace
    // with nothing actually owed from surfacing it under "0 cal behind pace".
    const zeroCal = scored({ calories: 0, category: "dinner" });
    const r = recommendEatNext(input(behind(0), [zeroCal]));
    expect(r.context).not.toBe("catch_up");
    expect(r.context).toBe("next_meal");
  });

  it(`catch_up band: exactly gap × ${CATCH_UP_BAND} away qualifies, one calorie further does not`, () => {
    const gap = 100;
    const bandWidth = gap * CATCH_UP_BAND; // 35
    const atEdge = scored({ calories: gap + bandWidth }); // 135
    const pastEdge = scored({ calories: gap + bandWidth + 1 }); // 136
    const r = recommendEatNext(input(behind(gap), [atEdge, pastEdge]));
    expect(r.context).toBe("catch_up");
    const ids = r.recommendations.map((x) => x.mealId);
    expect(ids).toContain(atEdge.meal.id);
    expect(ids).not.toContain(pastEdge.meal.id);
  });
});

// ── next_meal ──────────────────────────────────────────────────────────────
describe("next_meal", () => {
  it("13:00 → next slot dinner; dinner-category meals win", () => {
    const dinner = scored({ category: "dinner" });
    const breakfast = scored({ category: "breakfast" });
    const r = recommendEatNext(input({ nowMinutes: 13 * 60 + 1 }, [breakfast, dinner]));
    expect(r.context).toBe("next_meal");
    expect(r.recommendations[0].mealId).toBe(dinner.meal.id);
  });
  it("≥120 min before next meal prefers bridge/snack", () => {
    // 13:00, dinner 18:00 → 300 min out
    const bridge = scored({ role: "bridge", category: "snack", calories: 300 });
    const dinner = scored({ category: "dinner", score: 99 });
    const r = recommendEatNext(input({}, [dinner, bridge]));
    expect(r.recommendations[0].mealId).toBe(bridge.meal.id);
  });
  it("after dinner time (on pace) → snack slot; shakes count as snacks; emergency never surfaces", () => {
    const shake = scored({ category: "shake" });
    const emergency = scored({ category: "emergency", score: 100 });
    const r = recommendEatNext(input({ nowMinutes: 19 * 60 }, [emergency, shake]));
    expect(r.context).toBe("next_meal");
    expect(r.recommendations.map((x) => x.mealId)).toEqual([shake.meal.id]);
  });
  it("before window behaves as next_meal for breakfast", () => {
    const b = scored({ category: "breakfast" });
    const r = recommendEatNext(
      input({ nowMinutes: 7 * 60, caloriePace: { status: "before_window" } }, [b]),
    );
    expect(r.context).toBe("next_meal");
    expect(r.recommendations[0].mealId).toBe(b.meal.id);
  });

  it(`bridge/snack preference kicks in at exactly ${BRIDGE_PREFER_GAP_MIN} minutes out, not at ${BRIDGE_PREFER_GAP_MIN - 1}`, () => {
    const dinnerMin = BASE.mealTimesMinutes.dinner;
    const bridge = scored({ role: "bridge", category: "snack", score: 10 }); // low raw
    const dinner = scored({ category: "dinner", score: 99 }); // high raw

    const rAt = recommendEatNext(
      input({ nowMinutes: dinnerMin - BRIDGE_PREFER_GAP_MIN }, [dinner, bridge]),
    );
    expect(rAt.recommendations[0].mealId).toBe(bridge.meal.id); // preferred despite lower raw

    const rUnder = recommendEatNext(
      input({ nowMinutes: dinnerMin - (BRIDGE_PREFER_GAP_MIN - 1) }, [dinner, bridge]),
    );
    const idsUnder = rUnder.recommendations.map((x) => x.mealId);
    expect(idsUnder).not.toContain(bridge.meal.id); // pool not expanded — snack category doesn't match slot "dinner"
  });

  it("prefers category=snack even without role=bridge when far from the next meal (spec §5.3.6)", () => {
    const snackMeal = scored({ category: "snack", role: null, score: 10 }); // low raw
    const dinner = scored({ category: "dinner", score: 99 }); // high raw
    // default nowMinutes 13:00, dinner 18:00 → 300 min out, well past BRIDGE_PREFER_GAP_MIN
    const r = recommendEatNext(input({}, [dinner, snackMeal]));
    expect(r.recommendations[0].mealId).toBe(snackMeal.meal.id);
  });

  it("emergency-category meal never surfaces in next_meal, even with role=bridge (spec §5.3.6)", () => {
    const emergencyBridge = scored({ category: "emergency", role: "bridge", score: 100 });
    const dinner = scored({ category: "dinner", score: 50 });
    const r = recommendEatNext(input({}, [dinner, emergencyBridge])); // 300 min out, pool expanded
    expect(r.context).toBe("next_meal");
    expect(r.recommendations.map((x) => x.mealId)).not.toContain(emergencyBridge.meal.id);
  });

  it("at exactly the lunch meal time, lunch has passed and dinner is next (spec §5.3.6: strictly after now)", () => {
    const lunch = scored({ category: "lunch" });
    const dinner = scored({ category: "dinner" });
    const r = recommendEatNext(
      input({ nowMinutes: BASE.mealTimesMinutes.lunch }, [lunch, dinner]),
    );
    expect(r.context).toBe("next_meal");
    expect(r.recommendations.map((x) => x.mealId)).toContain(dinner.meal.id);
    expect(r.recommendations.map((x) => x.mealId)).not.toContain(lunch.meal.id);
  });
});

// ── filters + ranking ──────────────────────────────────────────────────────
describe("filters and ranking", () => {
  it("containsNever never surfaces in any context", () => {
    const never = scored({ category: "dinner", score: 100, containsNever: true });
    const ok = scored({ category: "dinner", score: 50 });
    const r = recommendEatNext(input({}, [never, ok]));
    expect(r.recommendations.map((x) => x.mealId)).toEqual([ok.meal.id]);
  });

  it(`prep > maxPrep×${PREP_HARD_CAP_FACTOR} never surfaces; (maxPrep, ×${PREP_HARD_CAP_FACTOR}] surfaces with a budget reason`, () => {
    const way = scored({ category: "dinner", prep: 11 });   // > 10 → gone
    const over = scored({ category: "dinner", prep: 8 });    // (5,10] → reason
    const fine = scored({ category: "dinner", prep: 4 });
    const r = recommendEatNext(input({}, [way, over, fine]));
    const ids = r.recommendations.map((x) => x.mealId);
    expect(ids).not.toContain(way.meal.id);
    expect(ids).toContain(over.meal.id);
    const overRec = r.recommendations.find((x) => x.mealId === over.meal.id)!;
    expect(overRec.reasons.join(" ")).toMatch(/prep budget/i);
  });

  it("deterministic order: raw desc, then prep asc, then name asc; top 3 cap", () => {
    const a = scored({ name: "A", category: "dinner", score: 90, prep: 5 });
    const b = scored({ name: "B", category: "dinner", score: 90, prep: 3 });
    const c = scored({ name: "C", category: "dinner", score: 95 });
    const d = scored({ name: "D", category: "dinner", score: 90, prep: 5 });
    const r1 = recommendEatNext(input({}, [a, d, c, b]));
    const r2 = recommendEatNext(input({}, [d, b, a, c]));
    expect(r1.recommendations.map((x) => x.mealId)).toEqual([
      c.meal.id, b.meal.id, a.meal.id,
    ]);
    expect(r2.recommendations).toEqual(r1.recommendations);
  });

  it("empty library → next_meal with empty recommendations and a message", () => {
    const r = recommendEatNext(input({}, []));
    expect(r.recommendations).toHaveLength(0);
    expect(r.message).not.toBeNull();
  });

  it("ranks by raw, not the rounded score (Phase 2 amendment) — raw and score set independently", () => {
    const highRawLowScore = scored({ category: "dinner", raw: 95, score: 10 });
    const lowRawHighScore = scored({ category: "dinner", raw: 50, score: 99 });
    const r = recommendEatNext(input({}, [lowRawHighScore, highRawLowScore]));
    expect(r.recommendations[0].mealId).toBe(highRawLowScore.meal.id);
  });
});

// ── nudge decision ──────────────────────────────────────────────────────────
describe("nudge decision", () => {
  const behindBy = (catchUpAmount: number): Partial<EatNextInput> => ({
    nudgesEnabled: true,
    caloriePace: { status: "behind", delta: catchUpAmount, catchUpAmount },
  });
  const meal = () => scored({ category: "dinner", calories: 500 });

  it("fires at next milestone + offset with gap and top rec in the body", () => {
    // now 13:00 → next milestone dinner 18:00 → fire 18:20
    const m = meal();
    const r = recommendEatNext(input(behindBy(500), [m]));
    expect(r.nudge).not.toBeNull();
    expect(r.nudge!.fireAtMinutes).toBe(18 * 60 + NUDGE_MILESTONE_OFFSET_MIN);
    expect(r.nudge!.title).toBe("Eat something");
    expect(r.nudge!.body).toMatch(/500 cal/);
    expect(r.nudge!.body).toContain(m.meal.name);
  });

  it("no meal time remaining → windowEnd − 90", () => {
    const r = recommendEatNext(
      input({ ...behindBy(600), nowMinutes: 19 * 60 }, [meal()]),
    );
    expect(r.nudge!.fireAtMinutes).toBe(23 * 60 - EMERGENCY_CHECK_BEFORE_END_MIN);
  });

  it("computed time already past → now + offset", () => {
    // 22:00: windowEnd−90 = 21:30 is past → 22:20
    const r = recommendEatNext(
      input({ ...behindBy(600), nowMinutes: 22 * 60 }, [meal()]),
    );
    expect(r.nudge!.fireAtMinutes).toBe(22 * 60 + NUDGE_MILESTONE_OFFSET_MIN);
  });

  it("even now + offset exceeds windowEnd → null", () => {
    const r = recommendEatNext(
      input({ ...behindBy(600), nowMinutes: 22 * 60 + 50 }, [meal()]),
    );
    expect(r.nudge).toBeNull();
  });

  it.each([
    ["disabled", { ...behindBy(600), nudgesEnabled: false }],
    [`gap below ${NUDGE_MIN_GAP_CAL}`, behindBy(NUDGE_MIN_GAP_CAL - 1)],
    ["on pace", { nudgesEnabled: true }],
    [
      "goal hit",
      {
        // caloriePace is set to "behind" (not the BASE default "on_pace") so
        // this row isolates the goal-hit guard: without it, the "behind" +
        // sufficient-gap checks below it would let the nudge through anyway,
        // and the test would pass for the wrong reason.
        nudgesEnabled: true,
        caloriePace: { status: "behind", delta: 300, catchUpAmount: 300 },
        dayTotals: { ...EMPTY_TOTALS, calories: 2400, protein: 170 },
      },
    ],
  ])("no nudge when %s", (_label, over) => {
    const r = recommendEatNext(input(over as Partial<EatNextInput>, [meal()]));
    expect(r.nudge).toBeNull();
  });

  it("nudge fires even when the surfaced context is post_workout (independent decisions)", () => {
    const r = recommendEatNext(
      input({ ...behindBy(500), workoutCompletedAtMinutes: 12 * 60 }, [
        scored({ role: "post_workout", calories: 500 }),
      ]),
    );
    expect(r.context).toBe("post_workout");
    expect(r.nudge).not.toBeNull();
  });

  // ── threshold edges (spec §10: "for every §5.7 constant") ────────────────
  it(`gap exactly ${NUDGE_MIN_GAP_CAL} still nudges (the minimum is inclusive)`, () => {
    const r = recommendEatNext(input(behindBy(NUDGE_MIN_GAP_CAL), [meal()]));
    expect(r.nudge).not.toBeNull();
  });

  it("a computed fire time landing exactly on now still bumps forward, not left in place", () => {
    // atMinutes=null branch (no meal time left) puts fireAt at
    // windowEnd − EMERGENCY_CHECK_BEFORE_END_MIN; choosing now to equal that
    // makes the "already past" bump trigger at the equality boundary.
    const now = BASE.windowEndMinutes - EMERGENCY_CHECK_BEFORE_END_MIN;
    const r = recommendEatNext(
      input({ ...behindBy(600), nowMinutes: now }, [meal()]),
    );
    expect(r.nudge!.fireAtMinutes).toBe(now + NUDGE_MILESTONE_OFFSET_MIN);
  });

  it("a fire time landing exactly on windowEnd still nudges (the cap is inclusive)", () => {
    const dinner = BASE.windowEndMinutes - NUDGE_MILESTONE_OFFSET_MIN;
    const r = recommendEatNext(
      input(
        {
          ...behindBy(600),
          nowMinutes: dinner - 60,
          mealTimesMinutes: { breakfast: 100, lunch: 200, dinner },
        },
        [meal()],
      ),
    );
    expect(r.nudge).not.toBeNull();
    expect(r.nudge!.fireAtMinutes).toBe(BASE.windowEndMinutes);
  });

  it("now exactly at windowEnd never nudges (no room for a strictly-future fire time)", () => {
    const r = recommendEatNext(
      input({ ...behindBy(600), nowMinutes: BASE.windowEndMinutes }, [meal()]),
    );
    expect(r.nudge).toBeNull();
  });

  it("falls back to the best-ranked eligible meal when nothing lands in the catch-up band", () => {
    const gap = 500;
    // Band is ±CATCH_UP_BAND of the gap (325–675 here) — well clear of it.
    const outOfBand = scored({ category: "dinner", calories: gap * 3 });
    const r = recommendEatNext(input(behindBy(gap), [outOfBand]));
    expect(r.nudge).not.toBeNull();
    expect(r.nudge!.body).toContain(outOfBand.meal.name);
  });

  it("within the catch-up band, prefers role=bridge over a higher-raw plain meal", () => {
    const gap = 500;
    const bridgeMeal = scored({ role: "bridge", category: "snack", calories: gap, raw: 10 });
    const plainMeal = scored({ category: "dinner", calories: gap, raw: 95 });
    const r = recommendEatNext(input(behindBy(gap), [plainMeal, bridgeMeal]));
    expect(r.nudge!.body).toContain(bridgeMeal.meal.name);
  });

  it("behind pace with no catchUpAmount produces no nudge (?? 0 default, not NaN)", () => {
    const r = recommendEatNext(
      input({ nudgesEnabled: true, caloriePace: { status: "behind" } }, [meal()]),
    );
    expect(r.nudge).toBeNull();
  });

  it("behind pace with no catchUpAmount does not enter catch_up either (gap defaults to 0)", () => {
    const r = recommendEatNext(
      input({ caloriePace: { status: "behind" } }, [meal()]),
    );
    expect(r.context).not.toBe("catch_up");
    expect(r.context).toBe("next_meal");
  });
});
