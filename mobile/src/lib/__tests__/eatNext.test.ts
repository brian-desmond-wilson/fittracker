import {
  recommendEatNext,
  buildStockByMealId,
  eatNextStockBadge,
  eatNextExpiringLine,
  nudgeFireDate,
  prepBudgetVerdict,
  prepBudgetLabel,
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
  type StockAssessmentMeal,
} from "../eatNext";
import type { AssemblabilityInventoryRow } from "../stockState";
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
      // Deliberately NOT `id`. `slug`, `name` and `id` were all the same
      // `m{n}` string, so a `stockByMealId.get(m.meal.slug)` (or `.name`)
      // mutant resolved correctly and survived every stock test. Task 10
      // wires this map; if either side keys by anything but `meal.id`, every
      // meal silently reads unknown-stock. Keeping the three distinct is what
      // makes that mutant die. (Nothing in eatNext.ts reads `slug`.)
      slug: `${id}-slug`,
      category: over.category ?? "lunch",
      role: over.role ?? null,
      default_meal_type: null,
      prep_minutes: over.prep ?? 5,
      taste_override: null,
      is_complete_portion: false,
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
      input({ nowMinutes: 20 * 60, nudgesEnabled: true, ...behind(600) }, [small, booster, big]),
    );
    expect(r.context).toBe("emergency");
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      booster.meal.id, big.meal.id, small.meal.id,
    ]);
    // The nudge decision is independent of context (see "nudge decision"
    // below) but must still be attached to the returned result on every
    // non-terminal context, including this one — the context this feature
    // most exists for (behind pace, past dinner, a large gap owed).
    expect(r.nudge).not.toBeNull();
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

// ── recommendation fields (spec §7.1/§7.2: cal/protein/prep/score) ─────────
describe("recommendation structured fields", () => {
  it("pins calories, protein, and prepMinutes from the meal's own totals", () => {
    const m = scored({ category: "dinner", calories: 512.6, protein: 33.6, prep: 4 });
    const r = recommendEatNext(input({}, [m]));
    expect(r.recommendations[0].calories).toBe(513); // Math.round(512.6)
    expect(r.recommendations[0].protein).toBe(34); // Math.round(33.6)
    expect(r.recommendations[0].prepMinutes).toBe(4);
  });

  it("recommendation.score is the /100 renormalized score, NOT raw (spec §5.5) — raw and score set independently so a raw-projection mutant fails", () => {
    const m = scored({ category: "dinner", raw: 50, score: 99 });
    const r = recommendEatNext(input({}, [m]));
    expect(r.recommendations[0].score).toBe(99);
    expect(r.recommendations[0].score).not.toBe(50);
  });

  it("goal_hit protein-short projection site also carries calories/protein/prepMinutes/score (not just toRecs)", () => {
    const bridgeSmall = scored({
      role: "bridge", calories: 290.2, protein: 25.7, prep: 7, raw: 50, score: 88,
    });
    const r = recommendEatNext(
      input(
        { dayTotals: { ...EMPTY_TOTALS, calories: 2400, protein: 140 } },
        [bridgeSmall],
      ),
    );
    expect(r.context).toBe("goal_hit");
    expect(r.recommendations[0].calories).toBe(290); // Math.round(290.2)
    expect(r.recommendations[0].protein).toBe(26); // Math.round(25.7)
    expect(r.recommendations[0].prepMinutes).toBe(7);
    expect(r.recommendations[0].score).toBe(88); // not raw (50)
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
    expect(r.nudge!.fireAtMinutes).toBe(BASE.mealTimesMinutes.dinner + NUDGE_MILESTONE_OFFSET_MIN);
    expect(r.nudge!.title).toBe("Eat something");
    expect(r.nudge!.body).toMatch(/500 cal/);
    expect(r.nudge!.body).toContain(m.meal.name);
  });

  it("no meal time remaining → windowEnd − 90", () => {
    const r = recommendEatNext(
      input({ ...behindBy(600), nowMinutes: 19 * 60 }, [meal()]),
    );
    expect(r.nudge).not.toBeNull();
    expect(r.nudge!.fireAtMinutes).toBe(BASE.windowEndMinutes - EMERGENCY_CHECK_BEFORE_END_MIN);
  });

  it("computed time already past → now + offset", () => {
    // 22:00: windowEnd−90 = 21:30 is past → 22:20
    const r = recommendEatNext(
      input({ ...behindBy(600), nowMinutes: 22 * 60 }, [meal()]),
    );
    expect(r.nudge).not.toBeNull();
    expect(r.nudge!.fireAtMinutes).toBe(22 * 60 + NUDGE_MILESTONE_OFFSET_MIN);
  });

  it("even now + offset exceeds windowEnd → null", () => {
    // The last minute at which now + NUDGE_MILESTONE_OFFSET_MIN still
    // overshoots windowEnd — one minute earlier, the bumped fire time would
    // land exactly on windowEnd and still nudge (see the boundary test below).
    const r = recommendEatNext(
      input(
        { ...behindBy(600), nowMinutes: BASE.windowEndMinutes - NUDGE_MILESTONE_OFFSET_MIN + 1 },
        [meal()],
      ),
    );
    expect(r.nudge).toBeNull();
  });

  it.each<[string, Partial<EatNextInput>]>([
    ["disabled", { ...behindBy(600), nudgesEnabled: false }],
    [`gap below ${NUDGE_MIN_GAP_CAL}`, behindBy(NUDGE_MIN_GAP_CAL - 1)],
    ["on pace", { nudgesEnabled: true }],
    [
      "goal hit",
      {
        // caloriePace is set to "behind" (not the BASE default "on_pace") —
        // leaving it at on_pace would make the EARLIER `status !== "behind"`
        // guard return null first, so the row would pass without ever
        // reaching the goal-hit guard this row is meant to test. This row
        // pins the engine-level contract "goal hit ⇒ no nudge"; it does NOT
        // isolate the goal-hit guard specifically — dropping that guard
        // alone still leaves this row (and the full suite) green, because
        // `recommendEatNext` independently forces `nudge: null` whenever the
        // same predicate is true (see the Task 2 execution amendment,
        // Correction A finding, for the mutation-tested proof).
        nudgesEnabled: true,
        caloriePace: { status: "behind", delta: 300, catchUpAmount: 300 },
        dayTotals: { ...EMPTY_TOTALS, calories: 2400, protein: 170 },
      },
    ],
  ])("no nudge when %s", (_label, over) => {
    const r = recommendEatNext(input(over, [meal()]));
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
    expect(r.nudge).not.toBeNull();
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
    expect(r.nudge).not.toBeNull();
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

// `nudgeFireDate` resolves `EatNextNudge.fireAtMinutes` (see its doc comment)
// against an explicit `sourceDay`, never a fresh clock read — extracted so
// eatNudgeService.ts's scheduler can't reimplement the contract and drift
// from it. Task 6 execution amendment covers the reachability analysis this
// closes off.
describe("nudgeFireDate", () => {
  // Jul 29 2026, 08:00:00.000 local. Factory, not a shared const — every
  // other fixture in this file is a factory (`meal()`, `scored()`, etc.);
  // a shared mutable `Date` is an unnecessary cross-test-leakage risk that
  // buys nothing here (`new Date(...)` is cheap).
  const DAY = () => new Date(2026, 6, 29, 8, 0, 0, 0);

  it("resolves a same-day, still-future fireAtMinutes to that clock time on sourceDay's date", () => {
    // 10:00 (600 min) is distinct in hour vs. minute from 08:00's own
    // components, so a swapped hour/minute mutant cannot pass by accident.
    const result = nudgeFireDate(600, DAY(), DAY());
    expect(result).not.toBeNull();
    expect(result).toEqual(new Date(2026, 6, 29, 10, 0, 0, 0));
  });

  it("uses distinct hour and minute values so a swapped Math.floor(/60)/%60 pair cannot pass", () => {
    // 135 min = 2h15m. Hour (2) and minute (15) are different numbers, so
    // transposing them produces a visibly different (and wrong) time. `now`
    // is set earlier than 02:15 (rather than reusing DAY's 08:00) so the
    // strictly-after-now guard doesn't itself reject a correct result.
    const now = new Date(2026, 6, 29, 1, 0, 0, 0);
    const result = nudgeFireDate(135, DAY(), now);
    expect(result).toEqual(new Date(2026, 6, 29, 2, 15, 0, 0));
  });

  it("fireAtMinutes=0 (local midnight) can never be strictly after a same-day now", () => {
    // Midnight is the earliest instant of its own day, so any valid
    // same-day `now` is >= it — this is a real, permanent null case, not a
    // gap in the function.
    const now = new Date(2026, 6, 29, 0, 0, 0, 1);
    expect(nudgeFireDate(0, DAY(), now)).toBeNull();
  });

  it("resolves fireAtMinutes=1439 (23:59, the last valid minute of the day)", () => {
    const now = new Date(2026, 6, 29, 23, 0, 0, 0);
    expect(nudgeFireDate(1439, DAY(), now)).toEqual(
      new Date(2026, 6, 29, 23, 59, 0, 0),
    );
  });

  it("rejects a stale decision: sourceDay and now on different local calendar days", () => {
    // Decision computed 23:58 on the 29th; resolved 00:05 on the 30th. Any
    // instant on an earlier calendar day is already behind any instant on a
    // later one, so this direction is also caught by the after-now check —
    // it documents the realistic overnight-background scenario, but does
    // NOT by itself prove the day guard is doing independent work (see the
    // tests below, which isolate that along each of `sameLocalDay`'s three
    // comparisons).
    const sourceDay = new Date(2026, 6, 29, 23, 58, 0, 0);
    const now = new Date(2026, 6, 30, 0, 5, 0, 0);
    expect(nudgeFireDate(1439, sourceDay, now)).toBeNull();
  });

  // The four tests below each isolate ONE of `sameLocalDay`'s three
  // `Date` accessors (year / month / date) from the other two AND from the
  // after-now guard, by picking a `sourceDay`/`now` pair that agrees on
  // every dimension except the one under test, with the naive
  // (day-guard-less) instant landing strictly after `now` — so only the
  // targeted comparison stands between "correctly rejected" and "wrongly
  // scheduled". Mutation-verified: see the Task 6 amendment for the table
  // (drop-the-whole-guard, drop-year, drop-month, drop-date, and
  // getDay()-substituted-for-getDate all die; only the sourceDay-vs-now
  // Y/M/D swap in `nudgeFireDate` itself survives, and is unobservable by
  // construction once any of these guards has passed).

  it("rejects a mismatched sourceDay (differs by date only, same year+month) — isolates the date comparison", () => {
    // sourceDay is a day AHEAD of now, same month/year. Without the day
    // guard, the naive instant (00:00 on the 30th) is strictly after `now`
    // (20:00 on the 29th) and would be wrongly returned.
    const sourceDay = new Date(2026, 6, 30, 0, 0, 0, 0);
    const now = new Date(2026, 6, 29, 20, 0, 0, 0);
    expect(nudgeFireDate(0, sourceDay, now)).toBeNull();
  });

  it("rejects a mismatched sourceDay (differs by date only, same weekday+month+year) — isolates against a getDay()-substitution mutant", () => {
    // -7 days from Jul 29 lands on Jul 22: same year, same month, a
    // different date-of-month, but the SAME weekday (both Wednesdays) —
    // unlike the date-only test above, month is held constant too, so a
    // `sameLocalDay` that compared weekday instead of date-of-month (year
    // and month both still correct) would see "same year, same month, same
    // weekday" and wrongly call this a match. This is the fixture that
    // actually isolates that mutant — an earlier draft used Aug 5 (also
    // same weekday, +7 days), but Aug 5 differs in MONTH too, so a
    // month-preserving getDay() mutant would already be rejected by the
    // month comparison alone and this specific mutant would survive
    // undetected. Verified empirically: the Aug-5 fixture measurably did
    // NOT kill this mutant when tried; this one does.
    const sourceDay = new Date(2026, 6, 29, 0, 0, 0, 0); // Jul 29, 2026 (Wed)
    const now = new Date(2026, 6, 22, 20, 0, 0, 0); // Jul 22, 2026 (Wed), 20:00
    expect(sourceDay.getDay()).toBe(now.getDay()); // guards the fixture itself
    expect(sourceDay.getMonth()).toBe(now.getMonth()); // and that month is held constant
    expect(nudgeFireDate(0, sourceDay, now)).toBeNull();
  });

  it("rejects a mismatched sourceDay (differs by month only, same year+date-of-month) — isolates the month comparison", () => {
    // Feb 15 vs Jan 15: same year, same date-of-month (15), different
    // month. A `sameLocalDay` that dropped the month comparison would see
    // "same year, same date" and wrongly call this a match.
    const sourceDay = new Date(2026, 1, 15, 0, 0, 0, 0); // Feb 15, 2026
    const now = new Date(2026, 0, 15, 20, 0, 0, 0); // Jan 15, 2026, 20:00
    expect(nudgeFireDate(0, sourceDay, now)).toBeNull();
  });

  it("rejects a mismatched sourceDay (differs by year only, same month+date-of-month) — isolates the year comparison", () => {
    // Jul 29, 2026 vs Jul 29, 2025: same month and date-of-month, a year
    // apart. A `sameLocalDay` that dropped the year comparison would see
    // "same month, same date" and wrongly call this a match.
    const sourceDay = new Date(2026, 6, 29, 0, 0, 0, 0);
    const now = new Date(2025, 6, 29, 20, 0, 0, 0);
    expect(nudgeFireDate(0, sourceDay, now)).toBeNull();
  });

  it("rejects when the resolved instant equals now exactly (not strictly after)", () => {
    const now = new Date(2026, 6, 29, 10, 0, 0, 0);
    expect(nudgeFireDate(600, DAY(), now)).toBeNull();
  });

  it("resolves when the resolved instant is 1ms after now", () => {
    const now = new Date(2026, 6, 29, 9, 59, 59, 999);
    expect(nudgeFireDate(600, DAY(), now)).toEqual(
      new Date(2026, 6, 29, 10, 0, 0, 0),
    );
  });

  it("rejects when the resolved instant is 1ms before now", () => {
    const now = new Date(2026, 6, 29, 10, 0, 0, 1);
    expect(nudgeFireDate(600, DAY(), now)).toBeNull();
  });
});

import type { EatNextStockInfo } from "../eatNext";

describe("stock awareness", () => {
  const stock = (entries: Array<[string, Partial<EatNextStockInfo>]>) =>
    new Map(entries.map(([id, o]) => [id, {
      assemblable: true, missingCount: 0, unlinkedCount: 0, expiringItemName: null, expiringDaysLeft: null, ...o,
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

// Mutation-driven coverage. Every test below was added because a specific
// mutant survived the plan's own six stock-awareness tests; each names the
// mutant it kills. See the Task 9 execution amendment for the evidence table.
describe("stock awareness — mutation-driven coverage", () => {
  const stock = (entries: Array<[string, Partial<EatNextStockInfo>]>) =>
    new Map(entries.map(([id, o]) => [id, {
      assemblable: true, missingCount: 0, unlinkedCount: 0, expiringItemName: null, expiringDaysLeft: null, ...o,
    }]));
  const behind = (catchUpAmount: number): Partial<EatNextInput> => ({
    caloriePace: { status: "behind", delta: catchUpAmount, catchUpAmount },
  });

  // The plan's "expiring usage breaks assemblable ties" test is tie-only, and
  // its fixture happens to name the expiring meal first — so the name
  // tiebreak already put it on top and DELETING the expiringRank term passed.
  // expiringRank sits ABOVE raw in the comparator; this pins that.
  it("an expiring rescue outranks a strictly higher-raw fresh meal (expiringRank is above raw, not a tiebreak)", () => {
    const fresh = scored({ category: "dinner", score: 95 });
    const usesExpiring = scored({ category: "dinner", score: 70 });
    const r = recommendEatNext({
      ...input({}, [fresh, usesExpiring]),
      stockByMealId: stock([
        [fresh.meal.id, {}],
        [usesExpiring.meal.id, { expiringItemName: "Sirloin", expiringDaysLeft: 3 }],
      ]),
    });
    expect(r.recommendations[0].mealId).toBe(usesExpiring.meal.id);
  });

  // Task 2's forward-caution, pinned. `expiringDaysLeft: 0` ("expires today")
  // is the MOST urgent value assessAssemblability can return — its window is
  // bounded below at 0 so already-expired rows never reach here — and `0` is
  // falsy. An `expiringRank` derived from `!!expiringDaysLeft` instead of
  // `expiringItemName != null` silently drops exactly this signal, and passed
  // every one of the plan's tests (all of which use a non-zero day).
  it("day 0 (expires today) is the most urgent rescue, not a falsy no-op", () => {
    const fresh = scored({ category: "dinner", score: 95 });
    const expiresToday = scored({ category: "dinner", score: 70 });
    const r = recommendEatNext({
      ...input({}, [fresh, expiresToday]),
      stockByMealId: stock([
        [fresh.meal.id, {}],
        [expiresToday.meal.id, { expiringItemName: "Sirloin", expiringDaysLeft: 0 }],
      ]),
    });
    expect(r.recommendations[0].mealId).toBe(expiresToday.meal.id);
    // The expiring line ACCOMPANIES "in stock", it does not replace it —
    // otherwise a rescue meal stops announcing it is makeable at all.
    expect(r.recommendations[0].reasons).toContain("in stock");
    // Copy matches Task 8's MealDetail treatment of the same value: the most
    // urgent day must not render as "expires in 0d", the least urgent-sounding
    // string the template can produce.
    expect(r.recommendations[0].reasons).toContain("uses Sirloin — expires today");
    expect(r.recommendations[0].reasons.join(" ")).not.toMatch(/0d/);
  });

  it("post_workout candidates are availability-aware within the role tier, and say so", () => {
    // Both qualify on protein alone (role null → equal roleRank), so stock is
    // the only thing that can separate them. Pins the post_workout call site's
    // forwarding, which the plan's post_workout test cannot: that test asserts
    // a roleRank win, which holds whether or not the map is forwarded.
    const outStock = scored({ protein: 40, score: 95 });
    const inStock = scored({ protein: 40, score: 70 });
    const r = recommendEatNext({
      ...input({ workoutCompletedAtMinutes: 12 * 60 }, [outStock, inStock]),
      stockByMealId: stock([
        [inStock.meal.id, {}],
        [outStock.meal.id, { assemblable: false, missingCount: 3 }],
      ]),
    });
    expect(r.context).toBe("post_workout");
    expect(r.recommendations[0].mealId).toBe(inStock.meal.id);
    expect(r.recommendations[0].reasons).toContain("in stock");
    expect(r.recommendations[1].reasons.join(" ")).toMatch(/missing 3 ingredients/);
  });

  it("catch_up candidates are availability-aware", () => {
    const outStock = scored({ calories: 500, score: 95 });
    const inStock = scored({ calories: 500, score: 70 });
    const r = recommendEatNext({
      ...input(behind(500), [outStock, inStock]),
      stockByMealId: stock([
        [inStock.meal.id, {}],
        [outStock.meal.id, { assemblable: false, missingCount: 2 }],
      ]),
    });
    expect(r.context).toBe("catch_up");
    expect(r.recommendations[0].mealId).toBe(inStock.meal.id);
    expect(r.recommendations[0].reasons).toContain("in stock");
  });

  it("the nudge's in-band body pick is availability-aware (same shared catchUpCandidates definition)", () => {
    const outStock = scored({ category: "dinner", calories: 500, raw: 95 });
    const inStock = scored({ category: "dinner", calories: 500, raw: 70 });
    const r = recommendEatNext({
      ...input({ ...behind(500), nudgesEnabled: true }, [outStock, inStock]),
      stockByMealId: stock([
        [inStock.meal.id, {}],
        [outStock.meal.id, { assemblable: false, missingCount: 2 }],
      ]),
    });
    expect(r.nudge).not.toBeNull();
    expect(r.nudge!.body).toContain(inStock.meal.name);
    expect(r.nudge!.body).not.toContain(outStock.meal.name);
  });

  it("the nudge's out-of-band fallback pick is availability-aware too", () => {
    // 1500 cal is well clear of the ±35% band around a 500 gap (325–675), so
    // both meals reach the `rank(eligible.map(candidate(...)))` fallback.
    const outStock = scored({ category: "dinner", calories: 1500, raw: 95 });
    const inStock = scored({ category: "dinner", calories: 1500, raw: 70 });
    const r = recommendEatNext({
      ...input({ ...behind(500), nudgesEnabled: true }, [outStock, inStock]),
      stockByMealId: stock([
        [inStock.meal.id, {}],
        [outStock.meal.id, { assemblable: false, missingCount: 2 }],
      ]),
    });
    expect(r.nudge).not.toBeNull();
    expect(r.nudge!.body).toContain(inStock.meal.name);
    expect(r.nudge!.body).not.toContain(outStock.meal.name);
  });

  it("emergency candidates carry stock reasons but stay ordered by rescue size (spec §5.3.4)", () => {
    // The one context whose order availability must NOT change: a bigger
    // rescue you have to shop for still beats a small one in the fridge.
    const bigOut = scored({ category: "emergency", calories: 700 });
    const smallIn = scored({ category: "emergency", calories: 450 });
    const r = recommendEatNext({
      ...input({ nowMinutes: 20 * 60, ...behind(600) }, [smallIn, bigOut]),
      stockByMealId: stock([
        [smallIn.meal.id, {}],
        [bigOut.meal.id, { assemblable: false, missingCount: 2 }],
      ]),
    });
    expect(r.context).toBe("emergency");
    expect(r.recommendations.map((x) => x.mealId)).toEqual([bigOut.meal.id, smallIn.meal.id]);
    expect(r.recommendations[0].reasons.join(" ")).toMatch(/missing 2 ingredients/);
    expect(r.recommendations[1].reasons).toContain("in stock");
  });

  it("a meal absent from a present map gets NO stock reason (unknown says nothing, it does not guess)", () => {
    const known = scored({ category: "dinner" });
    const unknown = scored({ category: "dinner" });
    const r = recommendEatNext({
      ...input({}, [known, unknown]),
      stockByMealId: stock([[known.meal.id, {}]]),
    });
    const u = r.recommendations.find((x) => x.mealId === unknown.meal.id)!;
    expect(u.reasons).toEqual(["next: dinner"]);
  });
});

// Second mutation round (post-review). Every test below closes a mutant that
// survived the first round's 89 tests. See the Task 9 amendment's round-2 table.
describe("stock awareness — key, precedence, and copy pinning", () => {
  const info = (o: Partial<EatNextStockInfo> = {}): EatNextStockInfo => ({
    assemblable: true, missingCount: 0, unlinkedCount: 0, expiringItemName: null, expiringDaysLeft: null, ...o,
  });
  const stock = (entries: Array<[string, Partial<EatNextStockInfo>]>) =>
    new Map(entries.map(([id, o]) => [id, info(o)]));

  // THE one that matters for Task 10. `scored()` used to set slug === name ===
  // id, so `.get(m.meal.slug)` and `.get(m.meal.name)` both resolved and both
  // survived. If Task 10 keys either side of the seam by anything but
  // `meal.id`, every meal reads unknown-stock: ranking degenerates to Phase 3,
  // every stock reason vanishes, the nudge stops being availability-aware —
  // and without this test, not one assertion fails.
  it("the stock map is keyed by meal.id — not slug, not name", () => {
    const inStock = scored({ category: "dinner", name: "Alpha", score: 60 });
    const outStock = scored({ category: "dinner", name: "Bravo", score: 95 });
    // Guards the fixture itself: all three candidate keys must differ, or a
    // wrong-key mutant could resolve by accident and survive again.
    expect(new Set([inStock.meal.id, inStock.meal.slug, inStock.meal.name]).size).toBe(3);
    const r = recommendEatNext({
      ...input({}, [outStock, inStock]),
      stockByMealId: stock([
        [inStock.meal.id, {}],
        [outStock.meal.id, { assemblable: false, missingCount: 1 }],
      ]),
    });
    expect(r.recommendations[0].mealId).toBe(inStock.meal.id);
    expect(r.recommendations[0].reasons).toContain("in stock");
  });

  // Pins BOTH new comparator terms in their correct order, and pins the
  // containment argument the amendment makes for concern (a) — that
  // `expiringRank` can only reorder WITHIN a stockRank tier and can never
  // lift an unmakeable meal above a makeable one.
  it("stockRank outranks expiringRank: an unmakeable expiring-rescue never beats a makeable meal", () => {
    const inStockPlain = scored({ category: "dinner", name: "Aaa", score: 60 });
    const missingExpiring = scored({ category: "dinner", name: "Bbb", score: 70 });
    const missingPlain = scored({ category: "dinner", name: "Ccc", score: 95 });
    const r = recommendEatNext({
      ...input({}, [missingPlain, missingExpiring, inStockPlain]),
      stockByMealId: stock([
        [inStockPlain.meal.id, {}],
        [missingExpiring.meal.id, {
          assemblable: false, missingCount: 1, unlinkedCount: 0, expiringItemName: "Sirloin", expiringDaysLeft: 1,
        }],
        [missingPlain.meal.id, { assemblable: false, missingCount: 1 }],
      ]),
    });
    // in-stock first despite the LOWEST raw; among the two unmakeable meals
    // the expiring rescue wins despite the LOWER raw of the two.
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      inStockPlain.meal.id, missingExpiring.meal.id, missingPlain.meal.id,
    ]);
    // Task 8's ruling, adopted here: the expiring line renders on an
    // unmakeable meal too — the rescue is about an ingredient already owned.
    // This also stops `expiringRank`/`stockReasons` from disagreeing about
    // whether `assemblable` gates the expiring signal.
    expect(r.recommendations[1].reasons).toEqual([
      "next: dinner", "missing 1 ingredient", "uses Sirloin — expires in 1d",
    ]);
  });

  // Full-array equality, not substring: display order is user-visible, and
  // every other reason assertion in this file is a `toContain`/`toMatch` that
  // survives both appended junk and a reordered `extraReasons` spread.
  it("pins the exact reason array and its order (context, prep budget, stock, expiring)", () => {
    const m = scored({ category: "dinner", prep: 8 }); // maxPrepMinutes is 5
    const r = recommendEatNext({
      ...input({}, [m]),
      stockByMealId: stock([[m.meal.id, { expiringItemName: "Kefir", expiringDaysLeft: 4 }]]),
    });
    expect(r.recommendations[0].reasons).toEqual([
      "next: dinner",
      "8 min — over your prep budget",
      "in stock",
      "uses Kefir — expires in 4d",
    ]);
  });

  it("emergency's calorie tie breaks on name, NOT on availability (spec §5.3.4)", () => {
    // Equal calories is the only case where an availability term smuggled in
    // after the calorie comparison would be observable — and it sits directly
    // under a comment telling future readers not to make this sort
    // availability-aware. ~50 meals makes an exact tie unremarkable.
    const outStockAlpha = scored({ category: "emergency", name: "Alpha", calories: 700 });
    const inStockZulu = scored({ category: "emergency", name: "Zulu", calories: 700 });
    const r = recommendEatNext({
      ...input({ nowMinutes: 20 * 60, caloriePace: { status: "behind", delta: 600, catchUpAmount: 600 } },
        [inStockZulu, outStockAlpha]),
      stockByMealId: stock([
        [inStockZulu.meal.id, {}],
        [outStockAlpha.meal.id, { assemblable: false, missingCount: 1 }],
      ]),
    });
    expect(r.context).toBe("emergency");
    expect(r.recommendations.map((x) => x.name)).toEqual(["Alpha", "Zulu"]);
  });

  // ⚠️ PLAN DEFECT, recorded rather than edited so the Step 1 fence stays
  // byte-verbatim: the plan's "absent map = bit-for-bit prior behavior" test
  // above CANNOT FAIL. `{ ...input(...), stockByMealId: undefined }` and
  // `input(...)` are the same value under TS optional-property semantics, so
  // it compares a result to itself. The load-bearing bit-compat evidence is
  // that all 231 pre-existing tests pass byte-unmodified; this is the
  // assertion with teeth.
  it("no stock map → Phase 3 ordering exactly (raw desc) and no stock reason; an empty map is indistinguishable", () => {
    const low = scored({ category: "dinner", score: 60 });
    const high = scored({ category: "dinner", score: 95 });
    const r = recommendEatNext(input({}, [low, high]));
    expect(r.recommendations.map((x) => x.mealId)).toEqual([high.meal.id, low.meal.id]);
    expect(r.recommendations.flatMap((x) => x.reasons)).toEqual(["next: dinner", "next: dinner"]);
    expect(recommendEatNext({ ...input({}, [low, high]), stockByMealId: new Map() })).toEqual(r);
  });
});

// ── Task 10: the stock-map builder, and the seam it sits on ────────────────
// `buildStockByMealId` is the WRITE half of the lookup-key seam whose READ
// half (`candidate()`'s `.get(m.meal.id)`) Task 9 round 2 found unpinned.
// Both halves fail silently: a wrong key on either side makes every meal read
// unknown-stock, which is Phase 3 ordering with no stock reasons and no
// availability-aware nudge — and not one pre-existing assertion notices. The
// tests below drive the builder's real output into `recommendEatNext` rather
// than hand-writing a map, so they exercise both halves against each other.
describe("buildStockByMealId", () => {
  const invRow = (o: Partial<AssemblabilityInventoryRow> = {}): AssemblabilityInventoryRow => ({
    id: "inv1",
    name: "Boost Very High Calorie",
    barcode: null,
    totalQuantity: 1,
    conceptIds: [],
    daysLeft: null,
    ...o,
  });
  /** Saved-food ids are deliberately unlike the meal ids (`m{n}`), so keying
   *  the map by `items[0].saved_food_id` cannot pass by coincidence — the
   *  same fixture-collision that let `.get(m.meal.slug)` survive 81 tests. */
  const libMeal = (
    id: string,
    items: Array<{ sf: string; name: string; concepts?: string[] }>,
  ): StockAssessmentMeal => ({
    id,
    items: items.map((it) => ({
      saved_food_id: `sf-${it.sf}`,
      savedFood: { name: it.name, barcode: null },
    })),
  });
  const conceptsFor = (entries: Array<[string, string[]]>) =>
    new Map(entries.map(([sf, ids]) => [`sf-${sf}`, ids]));

  it("keys by meal.id, and that key is the one recommendEatNext reads (the seam)", () => {
    // The out-of-stock meal has the STRICTLY HIGHER raw score, so Phase 3
    // ordering puts it first. Only a working map can invert that — which is
    // precisely what breaks, invisibly, if either side keys by anything else.
    const inStock = scored({ category: "dinner", score: 60 });
    const outOfStock = scored({ category: "dinner", score: 95 });
    const stockByMealId = buildStockByMealId({
      meals: [
        libMeal(inStock.meal.id, [{ sf: "boost", name: "Boost" }]),
        libMeal(outOfStock.meal.id, [{ sf: "sauce", name: "Korean BBQ Sauce" }]),
      ],
      conceptIdsBySavedFoodId: conceptsFor([["boost", ["boost"]], ["sauce", ["sauce"]]]),
      inventory: [invRow({ conceptIds: ["boost"] })],
    });
    expect([...stockByMealId.keys()]).toEqual([inStock.meal.id, outOfStock.meal.id]);
    const r = recommendEatNext({
      ...input({}, [outOfStock, inStock]),
      stockByMealId,
    });
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      inStock.meal.id,
      outOfStock.meal.id,
    ]);
    expect(r.recommendations[0].reasons).toContain("in stock");
    expect(r.recommendations[1].reasons).toContain("missing 1 ingredient");
  });

  it("maps every field of the verdict through, including the expiring rescue", () => {
    const m = scored({ category: "dinner" });
    const stockByMealId = buildStockByMealId({
      meals: [libMeal(m.meal.id, [
        { sf: "boost", name: "Boost" },
        { sf: "sauce", name: "Korean BBQ Sauce" },
        { sf: "rice", name: "Rice" },
      ])],
      conceptIdsBySavedFoodId: conceptsFor([
        ["boost", ["boost"]], ["sauce", ["sauce"]], ["rice", ["rice"]],
      ]),
      // Only `boost` resolves: two of the three items are missing, and the one
      // that DOES resolve is expiring — the reachable
      // `{assemblable: false, expiringItemName: "…"}` state Task 9 documented.
      inventory: [invRow({ id: "inv1", name: "Kefir", conceptIds: ["boost"], daysLeft: 4 })],
    });
    expect(stockByMealId.get(m.meal.id)).toEqual({
      assemblable: false,
      missingCount: 2,
      unlinkedCount: 0,
      expiringItemName: "Kefir",
      expiringDaysLeft: 4,
    });
  });

  // 🚩 THE DECISION Task 9 handed to Task 10. `assessAssemblability` returns
  // `{assemblable: false, missing: []}` for an item-less meal — the one input
  // where "not assemblable" and "nothing missing" are both true. Left as-is it
  // would rank `stockRank: 2` (known-missing) and render the nonsense copy
  // "missing 0 ingredients". Ranking it 2 asserts we established the user
  // can't make it; we established nothing, because there was nothing to check.
  // The builder therefore OMITS it, which is `stockRank: 1` (unknown) — the
  // literal epistemic state, using the map's existing "no entry = unknown"
  // semantics rather than a new field. Item-less meals are live state:
  // `updateMeal`'s delete-then-reinsert is non-atomic (mealLibrary.ts:310-313).
  // Kills two mutants that survive every other test in this file: dropping the
  // `items.length === 0` skip, and deriving `stockRank` from `missingCount`
  // instead of `assemblable` (equivalent for every OTHER input).
  it("item-less meal is omitted → ranks unknown-stock, and claims nothing about stock", () => {
    const inStock = scored({ category: "dinner", score: 50 });
    const itemLess = scored({ category: "dinner", score: 70 });
    const knownMissing = scored({ category: "dinner", score: 99 });
    const stockByMealId = buildStockByMealId({
      meals: [
        libMeal(inStock.meal.id, [{ sf: "boost", name: "Boost" }]),
        libMeal(itemLess.meal.id, []),
        libMeal(knownMissing.meal.id, [{ sf: "sauce", name: "Korean BBQ Sauce" }]),
      ],
      conceptIdsBySavedFoodId: conceptsFor([["boost", ["boost"]], ["sauce", ["sauce"]]]),
      inventory: [invRow({ conceptIds: ["boost"] })],
    });
    // Absent from the map entirely — not present-and-false.
    expect(stockByMealId.has(itemLess.meal.id)).toBe(false);
    expect([...stockByMealId.keys()]).toEqual([inStock.meal.id, knownMissing.meal.id]);

    const r = recommendEatNext({
      ...input({}, [knownMissing, itemLess, inStock]),
      stockByMealId,
    });
    // Between in-stock and known-missing, despite `knownMissing` holding the
    // highest raw score of the three.
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      inStock.meal.id, itemLess.meal.id, knownMissing.meal.id,
    ]);
    // Exact array, not a substring probe: pins that NO stock reason is added,
    // including the "missing 0 ingredients" the un-skipped path would render.
    expect(r.recommendations[1].reasons).toEqual(["next: dinner"]);
  });
});

// Two builder paths that the round-1 tests left unexecuted. Both were found by
// mutation, both survived the full 116-test run across this file and
// stockState.test.ts, and both are ordinary production paths rather than edge
// cases — the round-1 fixtures simply never drove them.
describe("buildStockByMealId — paths the first round of tests never executed", () => {
  const invRow = (o: Partial<AssemblabilityInventoryRow> = {}): AssemblabilityInventoryRow => ({
    id: "inv1",
    name: "Boost Very High Calorie",
    barcode: null,
    totalQuantity: 1,
    conceptIds: [],
    daysLeft: null,
    ...o,
  });
  const libMeal = (
    id: string,
    items: Array<{ sf: string; name: string; barcode?: string }>,
  ): StockAssessmentMeal => ({
    id,
    items: items.map((it) => ({
      saved_food_id: `sf-${it.sf}`,
      savedFood: { name: it.name, barcode: it.barcode ?? null },
    })),
  });
  const conceptsFor = (entries: Array<[string, string[]]>) =>
    new Map(entries.map(([sf, ids]) => [`sf-${sf}`, ids]));

  // 🚩 Spec §9's flagship rescue: assemblable AND expiring. `expiringRank` only
  // ever bites INSIDE `stockRank: 0` — `rank()` compares stock first, and its
  // own comment scopes the tiebreak to "the meals you can make" — so if the
  // builder never emits `{assemblable: true, expiringItemName: "…"}` the whole
  // rescue feature is dead in production while every hand-written-map test in
  // this file still passes. Round 1's field-mapping test only drove the
  // `assemblable: false` branch (2 of its 3 items were missing).
  // Kills: `expiringItemName: a.assemblable ? null : a.expiringItemName`,
  // which left all 116 tests green.
  it("assemblable AND expiring: the rescue signal survives a fully-resolved meal, and breaks the in-stock tie", () => {
    const plain = scored({ category: "dinner", score: 95 });
    const rescue = scored({ category: "dinner", score: 60 });
    const stockByMealId = buildStockByMealId({
      meals: [
        libMeal(plain.meal.id, [{ sf: "oats", name: "Oats" }]),
        libMeal(rescue.meal.id, [
          { sf: "boost", name: "Boost" },
          { sf: "rice", name: "Rice" },
        ]),
      ],
      conceptIdsBySavedFoodId: conceptsFor([
        ["oats", ["oats"]], ["boost", ["boost"]], ["rice", ["rice"]],
      ]),
      inventory: [
        invRow({ id: "inv0", name: "Rolled Oats", conceptIds: ["oats"] }),
        // Named unlike the meal item on purpose: pins that `expiringItemName`
        // is read off the INVENTORY row, not the saved food.
        invRow({ id: "inv1", name: "Kefir", conceptIds: ["boost"], daysLeft: 3 }),
        invRow({ id: "inv2", name: "Sticky Rice", conceptIds: ["rice"] }),
      ],
    });
    expect(stockByMealId.get(rescue.meal.id)).toEqual({
      assemblable: true,
      missingCount: 0,
      unlinkedCount: 0,
      expiringItemName: "Kefir",
      expiringDaysLeft: 3,
    });
    // Both meals are stockRank 0, so `expiringRank` is the only term that can
    // separate them — and it must beat a 35-point raw deficit.
    const r = recommendEatNext({ ...input({}, [plain, rescue]), stockByMealId });
    expect(r.recommendations.map((x) => x.mealId)).toEqual([
      rescue.meal.id, plain.meal.id,
    ]);
    expect(r.recommendations[0].reasons).toEqual([
      "next: dinner", "in stock", "uses Kefir — expires in 3d",
    ]);
    expect(r.recommendations[1].reasons).toEqual(["next: dinner", "in stock"]);
  });

  // Barcode is TERMINAL and outranks concept matching regardless of stock
  // (`inventoryResolution.ts`), and it is the dominant production path — saved
  // foods scanned via OpenFoodFacts all carry one. Every round-1 fixture set
  // `barcode: null` on both sides, so the builder's passthrough never ran.
  // `conceptIds: []` on both the item and the row means ONLY the barcode can
  // resolve this, so the assertion cannot pass by the concept route.
  // Kills: `barcode: it.savedFood.barcode` → `barcode: null`, which left all
  // 116 tests green.
  it("passes the saved food's barcode through, so barcode-terminal matching still resolves", () => {
    const m = scored({ category: "dinner" });
    const stockByMealId = buildStockByMealId({
      meals: [libMeal(m.meal.id, [
        { sf: "boost", name: "Boost", barcode: "0123456789012" },
      ])],
      conceptIdsBySavedFoodId: conceptsFor([["boost", []]]),
      inventory: [invRow({ barcode: "0123456789012", conceptIds: [] })],
    });
    expect(stockByMealId.get(m.meal.id)).toEqual({
      assemblable: true,
      missingCount: 0,
      unlinkedCount: 0,
      expiringItemName: null,
      expiringDaysLeft: null,
    });
  });
});

// C4 SUPERSEDES Task 10's counterfactual here. `{assemblable: false,
// missingCount: 0}` used to be an unreachable, self-contradicting value the
// builder refused to produce ("missing 0 ingredients"). It is now a REAL and
// common state with a name: a meal held back purely by ingredients that carry
// no barcode and no concept link, so nothing in the inventory could ever match
// them. That is ignorance, not a shortfall, and the three tiers below are what
// the split buys — a meal we cannot check must not be ranked beneath one we
// checked and found wanting.
describe("stock awareness — the three tiers of stockRank", () => {
  const tri = (o: Partial<EatNextStockInfo>): EatNextStockInfo => ({
    assemblable: false, missingCount: 0, unlinkedCount: 0,
    expiringItemName: null, expiringDaysLeft: null, ...o,
  });

  it("orders makeable, then uncheckable, then confirmed short — regardless of score", () => {
    // Scores run OPPOSITE to the desired order, so only the stock tiers can
    // produce this result.
    const inStock = scored({ category: "dinner", score: 50 });
    const unlinked = scored({ category: "dinner", score: 70 });
    const short = scored({ category: "dinner", score: 99 });
    const r = recommendEatNext({
      ...input({}, [short, unlinked, inStock]),
      stockByMealId: new Map([
        [inStock.meal.id, tri({ assemblable: true })],
        [unlinked.meal.id, tri({ unlinkedCount: 2 })],
        [short.meal.id, tri({ missingCount: 2 })],
      ]),
    });
    expect(r.recommendations.map((x) => x.mealId))
      .toEqual([inStock.meal.id, unlinked.meal.id, short.meal.id]);
  });

  it("ranks an uncheckable meal level with one we know nothing about", () => {
    // Absent entry (item-less meal) and unlinked-only are the same epistemic
    // state, so the score decides between them rather than the stock tier.
    const absent = scored({ category: "dinner", score: 80 });
    const unlinked = scored({ category: "dinner", score: 90 });
    const r = recommendEatNext({
      ...input({}, [absent, unlinked]),
      stockByMealId: new Map([[unlinked.meal.id, tri({ unlinkedCount: 1 })]]),
    });
    expect(r.recommendations[0].mealId).toBe(unlinked.meal.id);
  });

  it("says what is actually wrong, and never 'missing 0 ingredients'", () => {
    const unlinked = scored({ category: "dinner", score: 90 });
    const r = recommendEatNext({
      ...input({}, [unlinked]),
      stockByMealId: new Map([[unlinked.meal.id, tri({ unlinkedCount: 2 })]]),
    });
    expect(r.recommendations[0].reasons).toContain("2 ingredients not linked yet");
    expect(r.recommendations[0].reasons).not.toContain("missing 0 ingredients");
  });

  it("keeps the singular for exactly one, on both branches", () => {
    // Guards the `=== 1 ? "" : "s"` ternary against widening to `<= 1`.
    const one = scored({ category: "dinner", score: 90 });
    const short = recommendEatNext({
      ...input({}, [one]),
      stockByMealId: new Map([[one.meal.id, tri({ missingCount: 1 })]]),
    });
    expect(short.recommendations[0].reasons).toContain("missing 1 ingredient");
    const link = recommendEatNext({
      ...input({}, [one]),
      stockByMealId: new Map([[one.meal.id, tri({ unlinkedCount: 1 })]]),
    });
    expect(link.recommendations[0].reasons).toContain("1 ingredient not linked yet");
  });

  it("badges the three tiers with three distinct tones", () => {
    expect(eatNextStockBadge(tri({ assemblable: true })))
      .toEqual({ assemblable: true, tone: "success", label: "In stock" });
    expect(eatNextStockBadge(tri({ missingCount: 2 })))
      .toEqual({ assemblable: false, tone: "warning", label: "Missing 2" });
    expect(eatNextStockBadge(tri({ unlinkedCount: 2 })))
      .toEqual({ assemblable: false, tone: "neutral", label: "2 not linked" });
  });
});

// ── Task 14: the stock verdict as a TYPED field on the recommendation ──────
// WHY THIS EXISTS. Tasks 9 and 10 made the engine produce "in stock" /
// "missing N ingredients" / "uses X — expires in Nd" and proved, by mutation,
// that it produces them. Neither task checked that anything RENDERS them.
// `EatNextHomeCard` drew `reasons[0]` only — always the context reason, since
// `reasons` is `[contextReason, ...prepReason, ...stockReasons]` — and
// `EatNextRow` drew no reasons at all, so on device the Home card recommended
// meals the owner could not assemble with nothing saying so.
//
// The fix is a typed field, NOT a smarter index into `reasons`: that array is
// flat and its stock entry has no fixed position (`prepReason` is
// conditional), so any position- or substring-based read is one conditional
// away from silently wrong. These tests therefore pin the FIELD — its presence
// at both construction sites, and the two ways it is `undefined` — plus the
// shared copy helper both surfaces call. The React components themselves
// cannot be tested here (`jest.config.js` is `testEnvironment: "node"` with no
// React testing deps), so this file is the whole coverage story and the field
// is deliberately the only thing a surface has to get right.
describe("recommendation.stock — the typed verdict the surfaces render", () => {
  const info = (o: Partial<EatNextStockInfo> = {}): EatNextStockInfo => ({
    assemblable: true, missingCount: 0, unlinkedCount: 0, expiringItemName: null, expiringDaysLeft: null, ...o,
  });
  const stock = (entries: Array<[string, Partial<EatNextStockInfo>]>) =>
    new Map(entries.map(([id, o]) => [id, info(o)]));

  it("carries the FULL verdict for an assemblable meal, not just the ranking tier", () => {
    const m = scored({ category: "dinner" });
    const r = recommendEatNext({
      ...input({}, [m]),
      stockByMealId: stock([[m.meal.id, { expiringItemName: "Kefir", expiringDaysLeft: 4 }]]),
    });
    // All four fields, `toEqual` rather than a spot-check: a surface that only
    // ever needs `assemblable` today is exactly how the next field quietly
    // stops being projected.
    expect(r.recommendations[0].stock).toEqual({
      assemblable: true, missingCount: 0, unlinkedCount: 0, expiringItemName: "Kefir", expiringDaysLeft: 4,
    });
  });

  it("carries the verdict for a NON-assemblable meal — the case the owner hit on device", () => {
    // The live shape of the defect: one meal, unassemblable, still recommended
    // (spec §9 — availability is never a hard filter), previously with nothing
    // on screen to say so.
    const only = scored({ category: "dinner" });
    const r = recommendEatNext({
      ...input({}, [only]),
      stockByMealId: stock([[only.meal.id, { assemblable: false, missingCount: 3 }]]),
    });
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0].stock).toEqual({
      assemblable: false, missingCount: 3, unlinkedCount: 0, expiringItemName: null, expiringDaysLeft: null,
    });
    // And the badge the surfaces derive from it.
    expect(eatNextStockBadge(r.recommendations[0].stock)).toEqual({
      assemblable: false, tone: "warning", label: "Missing 3",
    });
  });

  it("is undefined with NO map at all (unknown, on every recommendation)", () => {
    const meals = [scored({ category: "dinner", score: 95 }), scored({ category: "dinner", score: 60 })];
    const r = recommendEatNext(input({}, meals));
    expect(r.recommendations).toHaveLength(2);
    for (const rec of r.recommendations) expect(rec.stock).toBeUndefined();
  });

  it("is undefined for a meal ABSENT from a PRESENT map — the map's own 'no entry = unknown'", () => {
    // The distinction that makes `undefined` safe to render as silence: a
    // present map does not mean every meal in it is known.
    const known = scored({ category: "dinner", score: 60 });
    const unknown = scored({ category: "dinner", score: 95 });
    const r = recommendEatNext({
      ...input({}, [unknown, known]),
      stockByMealId: stock([[known.meal.id, {}]]),
    });
    const byId = new Map(r.recommendations.map((x) => [x.mealId, x]));
    expect(byId.get(known.meal.id)!.stock).toEqual(info());
    expect(byId.get(unknown.meal.id)!.stock).toBeUndefined();
    // Both are recommended — this is a rendering distinction, not a filter.
    expect(r.recommendations).toHaveLength(2);
  });

  it("goal_hit's INLINE construction site carries it too (it bypasses candidate()/toRecs)", () => {
    // The protein-short pick builds its recommendation by hand rather than
    // through `toRecs`. A missed site here renders no badge in that context
    // and nothing else in this file would notice: the goal_hit tests assert
    // ids and numbers, and every stock test drives a non-terminal context.
    const bridgeSmall = scored({ role: "bridge", calories: 290, protein: 25 });
    const r = recommendEatNext({
      ...input(
        { dayTotals: { ...EMPTY_TOTALS, calories: 2400, protein: 140 } },
        [bridgeSmall],
      ),
      stockByMealId: stock([[bridgeSmall.meal.id, { assemblable: false, missingCount: 2 }]]),
    });
    expect(r.context).toBe("goal_hit");
    expect(r.recommendations[0].stock).toEqual({
      assemblable: false, missingCount: 2, unlinkedCount: 0, expiringItemName: null, expiringDaysLeft: null,
    });
    // Task 9's recorded gap is UNCHANGED and pinned as such: this site still
    // carries no stock REASON strings. The badge is the fix; unifying this
    // site with `toRecs` is not this task's job, and if a future task does it
    // this assertion is the one to update deliberately.
    expect(r.recommendations[0].reasons.join(" ")).not.toMatch(/missing|in stock/i);
  });

  it("goal_hit's inline site is undefined when that meal is absent from the map", () => {
    const bridgeSmall = scored({ role: "bridge", calories: 290, protein: 25 });
    const other = scored({ category: "dinner" });
    const r = recommendEatNext({
      ...input(
        { dayTotals: { ...EMPTY_TOTALS, calories: 2400, protein: 140 } },
        [bridgeSmall],
      ),
      // A present map that knows about a DIFFERENT meal — so a site that
      // hardcoded a lookup, or read the map's first entry, would fail here.
      stockByMealId: stock([[other.meal.id, {}]]),
    });
    expect(r.context).toBe("goal_hit");
    expect(r.recommendations[0].stock).toBeUndefined();
  });

  it("the field is the SAME verdict the comparator ranked on — one lookup, not two", () => {
    // Drives the real builder end-to-end, then asserts every recommendation's
    // `stock` matches the map entry `candidate()` looked up. This is the
    // property that makes the badge trustworthy: a surface can never show
    // "In stock" on a meal the engine sank into the known-missing tier.
    const inStock = scored({ category: "dinner", score: 60 });
    const missing = scored({ category: "dinner", score: 99 });
    const stockByMealId = buildStockByMealId({
      meals: [
        { id: inStock.meal.id, items: [{ saved_food_id: "sf-oats", savedFood: { name: "Oats", barcode: null } }] },
        { id: missing.meal.id, items: [{ saved_food_id: "sf-beef", savedFood: { name: "Beef", barcode: null } }] },
      ],
      conceptIdsBySavedFoodId: new Map([["sf-oats", ["c-oats"]], ["sf-beef", ["c-beef"]]]),
      inventory: [
        { id: "inv-oats", name: "Oats", barcode: null, totalQuantity: 2, conceptIds: ["c-oats"], daysLeft: null },
      ],
    });
    const r = recommendEatNext({ ...input({}, [missing, inStock]), stockByMealId });
    // In-stock wins despite a 39-point raw deficit — proof the same verdict
    // reached the comparator.
    expect(r.recommendations.map((x) => x.mealId)).toEqual([inStock.meal.id, missing.meal.id]);
    for (const rec of r.recommendations) {
      expect(rec.stock).toEqual(stockByMealId.get(rec.mealId));
    }
    expect(eatNextStockBadge(r.recommendations[0].stock)).toEqual({ assemblable: true, tone: "success", label: "In stock" });
    expect(eatNextStockBadge(r.recommendations[1].stock)).toEqual({ assemblable: false, tone: "warning", label: "Missing 1" });
  });

  it("an item-less meal stays unknown all the way to the field (the Task 10 DECISION, end to end)", () => {
    // `buildStockByMealId` omits item-less meals so they rank unknown rather
    // than claiming "missing 0". That decision is worth nothing if the
    // recommendation then carries a verdict anyway — the badge would be the
    // third rendering of a state Task 8 and Task 10 both chose to say nothing
    // about.
    const itemLess = scored({ category: "dinner" });
    const stockByMealId = buildStockByMealId({
      meals: [{ id: itemLess.meal.id, items: [] }],
      conceptIdsBySavedFoodId: new Map(),
      inventory: [],
    });
    expect(stockByMealId.size).toBe(0);
    const r = recommendEatNext({ ...input({}, [itemLess]), stockByMealId });
    expect(r.recommendations[0].stock).toBeUndefined();
    expect(eatNextStockBadge(r.recommendations[0].stock)).toBeNull();
  });
});

// The shared copy definition both Eat Next surfaces call. Tested directly
// because the components cannot be: `EatNextHomeCard` and `EatNextRow` each
// reduce to `eatNextStockBadge(rec.stock)` plus a style lookup, so everything
// below is the entirety of what those two files decide.
describe("eatNextStockBadge", () => {
  const info = (o: Partial<EatNextStockInfo> = {}): EatNextStockInfo => ({
    assemblable: true, missingCount: 0, unlinkedCount: 0, expiringItemName: null, expiringDaysLeft: null, ...o,
  });

  it("unknown renders NOTHING — null, not a badge that guesses", () => {
    expect(eatNextStockBadge(undefined)).toBeNull();
  });

  it("assemblable → the green 'In stock' badge", () => {
    expect(eatNextStockBadge(info())).toEqual({ assemblable: true, tone: "success", label: "In stock" });
    // Pinned as an exact string, not a regex: this is the same copy
    // `MealRow` already shows in the Meal Library, and the two are supposed
    // to read identically.
    expect(eatNextStockBadge(info())!.label).toBe("In stock");
  });

  it("not assemblable → the amber 'Missing N' badge, with the real count", () => {
    expect(eatNextStockBadge(info({ assemblable: false, missingCount: 1 })))
      .toEqual({ assemblable: false, tone: "warning", label: "Missing 1" });
    expect(eatNextStockBadge(info({ assemblable: false, missingCount: 7 })))
      .toEqual({ assemblable: false, tone: "warning", label: "Missing 7" });
    // Two digits. Without this the count was pinned only at {0,1,3,7}, so a
    // "cap the count at 10" edit survived all 270 tests — the badge is the
    // one place a meal's shortfall is quantified, and a silently clamped
    // number is worse than none.
    expect(eatNextStockBadge(info({ assemblable: false, missingCount: 12 })))
      .toEqual({ assemblable: false, tone: "warning", label: "Missing 12" });
  });

  it("expiring info never changes the badge — that signal belongs to the reasons, not here", () => {
    // Both verdicts, both with a rescue attached. The badge answers exactly
    // one question ("can I make this now?"); the expiring line is separate
    // copy the reason strings already carry.
    expect(eatNextStockBadge(info({ expiringItemName: "Kefir", expiringDaysLeft: 0 })))
      .toEqual({ assemblable: true, tone: "success", label: "In stock" });
    expect(eatNextStockBadge(info({ assemblable: false, missingCount: 2, expiringItemName: "Kefir", expiringDaysLeft: 0 })))
      .toEqual({ assemblable: false, tone: "warning", label: "Missing 2" });
  });

  it("never renders 'Missing 0' — the last-resort fallback", () => {
    // Post-C4 this input means "not makeable, nothing confirmed absent, and
    // nothing unlinked either" — no longer reachable from
    // `buildStockByMealId` by any route, but `EatNextStockInfo` is an exported
    // public input so the value stays constructible. "Missing 0" reads as a
    // rendering bug; degrade, don't print it.
    expect(eatNextStockBadge(info({ assemblable: false, missingCount: 0 })))
      .toEqual({ assemblable: false, tone: "warning", label: "Missing items" });
    // Still AMBER, not green: the verdict is what decides the color, and a
    // count we can't state does not become "you can make it".
    expect(eatNextStockBadge(info({ assemblable: false, missingCount: 0 }))!.assemblable).toBe(false);
  });

  it("an unlinked-only verdict reads as neutral, not as a shortfall", () => {
    // The live case that used to land in the fallback above and print
    // "Missing items" for food that may well be in the fridge.
    expect(eatNextStockBadge(info({ assemblable: false, missingCount: 0, unlinkedCount: 3 })))
      .toEqual({ assemblable: false, tone: "neutral", label: "3 not linked" });
  });

  it("a confirmed shortfall outranks an unlinked one in the same verdict", () => {
    // Both buckets populated: the groceries are the actionable half, so the
    // badge states those and stays amber.
    expect(eatNextStockBadge(info({ assemblable: false, missingCount: 2, unlinkedCount: 5 })))
      .toEqual({ assemblable: false, tone: "warning", label: "Missing 2" });
  });
});

// ── Task 14 round 2: spec §10's "names an expiring ingredient" ─────────────
// Round 1 put `expiringItemName`/`expiringDaysLeft` on every recommendation
// and then rendered neither — the exact "computed but never displayed" state
// round 1's own amendment names as this task's finding, reintroduced one field
// over. `MealDetail.tsx:120-125` was the whole app's only renderer of these
// two fields, one tap and one surface away inside the Meal Library modal.
//
// The copy below is MealDetail's, to the character. That is the point: a
// second phrasing of one fact is the drift class this task closes, so these
// assertions are deliberately exact strings rather than regexes — a regex on
// /expires/ would pass for a rewording, which is precisely what must not be
// allowed to happen silently.
describe("eatNextExpiringLine", () => {
  const info = (o: Partial<EatNextStockInfo> = {}): EatNextStockInfo => ({
    assemblable: true, missingCount: 0, unlinkedCount: 0, expiringItemName: null, expiringDaysLeft: null, ...o,
  });

  it("names the ingredient and the days left, in MealDetail's exact words", () => {
    expect(eatNextExpiringLine(info({ expiringItemName: "Kefir", expiringDaysLeft: 4 })))
      .toBe("Uses Kefir — expires in 4d");
    // Capital "Uses" and an EM DASH (—), not a hyphen: this is a standalone
    // line, matching `MealDetail`. The lowercase `uses …` in `stockReasons`
    // is the same sentence as a fragment in a reason list, not a rival
    // phrasing — both take their tail from the shared `expiryClause`.
    expect(eatNextExpiringLine(info({ expiringItemName: "Kefir", expiringDaysLeft: 4 })))
      .not.toBe("uses Kefir — expires in 4d");
  });

  it("day 0 reads 'expires today', never 'expires in 0d' — the most urgent value", () => {
    // `0` is both the most urgent day the projection can return and a falsy
    // number. A gate on the truthiness of `expiringDaysLeft` renders NOTHING
    // here (the Task 2 forward caution), and the plain template renders the
    // most urgent day in the least urgent-sounding words.
    expect(eatNextExpiringLine(info({ expiringItemName: "Sirloin", expiringDaysLeft: 0 })))
      .toBe("Uses Sirloin — expires today");
  });

  it("says nothing when there is no expiring ingredient, and nothing when stock is unknown", () => {
    expect(eatNextExpiringLine(info())).toBeNull();
    expect(eatNextExpiringLine(undefined)).toBeNull();
    // The common case by far: a known, fully-stocked meal with nothing in the
    // 0–7 day window. This line is a rescue notice, not a status field.
    expect(eatNextExpiringLine(info({ assemblable: true }))).toBeNull();
  });

  it("is independent of `assemblable` — a rescue is named on an unmakeable meal too", () => {
    // Task 8's DECISION, re-adopted by Task 9 FIX 3: the expiring item is one
    // the user ALREADY OWNS, which is *more* actionable when the meal can't be
    // made ("buying the two missing items also saves the one about to spoil").
    // `expiringRank` is likewise unconditioned on `assemblable`, so gating the
    // line here would put the UI back to ranking on a signal it never states.
    expect(eatNextExpiringLine(info({
      assemblable: false, missingCount: 2, unlinkedCount: 0, expiringItemName: "Kefir", expiringDaysLeft: 1,
    }))).toBe("Uses Kefir — expires in 1d");
  });

  it("gates on the NAME, not the truthiness of either field — empty string still renders", () => {
    // Deliberately matching `MealDetail` and `expiringRank`: an empty-string
    // name still earns `expiringRank: 0`, so a truthiness gate would rank the
    // meal as a rescue while silently declining to say so. Odd-looking output
    // is the correct trade against a silent divergence, and the state is
    // unreachable from `assessAssemblability` (the name is an inventory row's
    // display name) — recorded here so it reads as chosen, not overlooked.
    expect(eatNextExpiringLine(info({ expiringItemName: "", expiringDaysLeft: 2 })))
      .toBe("Uses  — expires in 2d");
  });

  it("both renderings of the expiring fact share one day-0 rule (the extraction is load-bearing)", () => {
    // `stockReasons`' fragment and this line are the only two producers of
    // this sentence, and after the `expiryClause` extraction a change to the
    // day-0 rule must move BOTH or neither. Asserted together, in one test,
    // so a mutant to that clause cannot die in one place and survive in the
    // other unnoticed.
    const m = scored({ category: "dinner" });
    const r = recommendEatNext({
      ...input({}, [m]),
      stockByMealId: new Map([[m.meal.id, info({ expiringItemName: "Sirloin", expiringDaysLeft: 0 })]]),
    });
    expect(r.recommendations[0].reasons).toContain("uses Sirloin — expires today");
    expect(eatNextExpiringLine(r.recommendations[0].stock)).toBe("Uses Sirloin — expires today");
  });

  it("reads the same fields the engine ranked the rescue on, end to end", () => {
    // Driven through the real builder rather than a hand-written map, so this
    // also pins that `buildStockByMealId` → `candidate()` → `toRecs` carries
    // BOTH expiring fields intact to the surface that renders them.
    const rescue = scored({ category: "dinner", score: 60 });
    const plain = scored({ category: "dinner", score: 95 });
    const stockByMealId = buildStockByMealId({
      meals: [
        { id: rescue.meal.id, items: [{ saved_food_id: "sf-kefir", savedFood: { name: "Kefir", barcode: null } }] },
        { id: plain.meal.id, items: [{ saved_food_id: "sf-oats", savedFood: { name: "Oats", barcode: null } }] },
      ],
      conceptIdsBySavedFoodId: new Map([["sf-kefir", ["c-kefir"]], ["sf-oats", ["c-oats"]]]),
      inventory: [
        { id: "i1", name: "Kefir", barcode: null, totalQuantity: 1, conceptIds: ["c-kefir"], daysLeft: 3 },
        { id: "i2", name: "Oats", barcode: null, totalQuantity: 1, conceptIds: ["c-oats"], daysLeft: null },
      ],
    });
    const r = recommendEatNext({ ...input({}, [plain, rescue]), stockByMealId });
    // The rescue outranks a 35-point raw deficit (spec §9) AND names itself.
    expect(r.recommendations[0].mealId).toBe(rescue.meal.id);
    expect(eatNextExpiringLine(r.recommendations[0].stock)).toBe("Uses Kefir — expires in 3d");
    expect(eatNextExpiringLine(r.recommendations[1].stock)).toBeNull();
  });
});

// The `== null` guard on both helpers. `strict` cannot deliver a `null` here
// today, so this is a defensive-parity test, not a live path: `stockReasons`
// guards the same input with the loose `if (!info)` and these two should not
// be the one place a `null` reaches a property read. The cast is what makes
// the guard observable at all — without it the mutant `=== undefined` is
// unkillable and the guard is decoration.
describe("stock helpers tolerate a null the type system forbids", () => {
  const asStock = null as unknown as EatNextStockInfo | undefined;
  it("eatNextStockBadge(null) is null, not a crash", () => {
    expect(eatNextStockBadge(asStock)).toBeNull();
  });
  it("eatNextExpiringLine(null) is null, not a crash", () => {
    expect(eatNextExpiringLine(asStock)).toBeNull();
  });
});

// C7. Both consequences of the prep budget used to live as inline comparisons:
// "over" earns a caveat but is still suggested, "excluded" is dropped from the
// running entirely. The second is invisible — the meal simply never appears —
// so the rule is named, exported, and stated in the library.
describe("prepBudgetVerdict / prepBudgetLabel", () => {
  it("is within budget at and below the limit", () => {
    expect(prepBudgetVerdict(0, 5)).toBe("within");
    expect(prepBudgetVerdict(5, 5)).toBe("within");
    expect(prepBudgetLabel(5, 5)).toBeNull();
  });

  it("is over budget above the limit, up to the hard cap", () => {
    expect(prepBudgetVerdict(6, 5)).toBe("over");
    expect(prepBudgetVerdict(10, 5)).toBe("over");
    expect(prepBudgetLabel(6, 5)).toBe("Over your 5 min budget");
  });

  it("is excluded past the hard cap — the silent case", () => {
    expect(prepBudgetVerdict(11, 5)).toBe("excluded");
    expect(prepBudgetLabel(11, 5)).toBe("Too long to suggest");
  });

  it("agrees with the filter the recommender actually applies", () => {
    // The point of extracting it: one rule, not two that can drift.
    const overCap = scored({ category: "dinner", prep: 11 });
    const atCap = scored({ category: "dinner", prep: 10 });
    const r = recommendEatNext({ ...input({ maxPrepMinutes: 5 }, [overCap, atCap]) });
    expect(r.recommendations.map((x) => x.mealId)).toEqual([atCap.meal.id]);
    expect(prepBudgetVerdict(11, 5)).toBe("excluded");
    expect(prepBudgetVerdict(10, 5)).toBe("over");
  });
});
