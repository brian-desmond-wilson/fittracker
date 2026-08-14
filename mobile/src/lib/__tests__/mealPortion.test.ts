import {
  baseMacros,
  clampPercent,
  isDeletion,
  PORTION_MAX,
  portionImpactLine,
  portionPercentOf,
  scaleMacros,
  servingsForPercent,
  type PortionMacros,
} from "../mealPortion";

const muesli: PortionMacros = {
  calories: 440, protein: 14, carbs: 0, fats: 0, sugars: 0, sodium_mg: 0, fiber_g: 10,
  // Distinct from its neighbours so a scale that dropped or duplicated it
  // would show up in the arithmetic rather than in a zero.
  saturated_fat_g: 4,
};

describe("portionPercentOf", () => {
  it("reads the stored multiplier back as a percentage", () => {
    expect(portionPercentOf(0.65)).toBe(65);
    expect(portionPercentOf(1)).toBe(100);
  });

  it("a row nobody portioned reads as 100%", () => {
    // Legacy rows, hand-typed rows, and anything with a broken multiplier:
    // what is stored IS what was eaten.
    expect(portionPercentOf(null)).toBe(100);
    expect(portionPercentOf(undefined)).toBe(100);
    expect(portionPercentOf(0)).toBe(100);
    expect(portionPercentOf(-1)).toBe(100);
    expect(portionPercentOf(NaN)).toBe(100);
  });
});

describe("baseMacros / scaleMacros", () => {
  it("scales every macro and rounds by unit", () => {
    const half = scaleMacros(muesli, 50);
    expect(half.calories).toBe(220);
    expect(half.protein).toBe(7);
    expect(half.fiber_g).toBe(5);
  });

  it("grams keep a tenth, calories and sodium stay whole", () => {
    const third = scaleMacros({ ...muesli, sodium_mg: 205, protein: 14 }, 65);
    expect(third.calories).toBe(286);      // 440 × .65
    expect(third.sodium_mg).toBe(133);     // 205 × .65 = 133.25 → whole
    expect(third.protein).toBe(9.1);       // 14 × .65 = 9.1
  });

  it("nulls stay null — an unknown macro is not zero", () => {
    const scaled = scaleMacros({ ...muesli, protein: null }, 50);
    expect(scaled.protein).toBeNull();
    expect(scaled.calories).toBe(220);
  });

  it("recovers the 100% amounts from an already-portioned row", () => {
    const stored = scaleMacros(muesli, 65);
    expect(baseMacros(stored, 0.65).calories).toBe(440);
  });

  it("the round trip is stable: editing twice does not compound", () => {
    // The defect this whole design exists to prevent — 50% of 50% of 50%.
    let stored = scaleMacros(muesli, 50);
    let servings = servingsForPercent(50);
    for (let i = 0; i < 3; i++) {
      const base = baseMacros(stored, servings);
      expect(base.calories).toBe(440);
      stored = scaleMacros(base, 50);
      servings = servingsForPercent(50);
    }
    expect(stored.calories).toBe(220);
  });

  it("a legacy row edits from what it stores", () => {
    // servings = 1 with hand-typed macros: 100% is those macros, so half is
    // half of them and nothing has to know where they came from.
    const base = baseMacros(muesli, 1);
    expect(base).toEqual(muesli);
    expect(scaleMacros(base, 50).calories).toBe(220);
  });
});

describe("clampPercent", () => {
  it("cannot exceed all of it, or go below none", () => {
    expect(clampPercent(140)).toBe(PORTION_MAX);
    expect(clampPercent(-20)).toBe(0);
  });
  // Stepping is `nudgeOnGrid` in numericInput, shared with the quantity
  // steppers and covered by that file's tests.
});

describe("servingsForPercent", () => {
  it("is the inverse of reading it back", () => {
    expect(portionPercentOf(servingsForPercent(65))).toBe(65);
    expect(servingsForPercent(100)).toBe(1);
  });
});

describe("portionImpactLine", () => {
  it("says how far the day moves, not just where it ends", () => {
    expect(
      portionImpactLine({
        storedCalories: 440, nextCalories: 286, dayCalories: 1145, goalCalories: 2300,
      }),
    ).toEqual({ text: "Takes off 154 cal — your day becomes 991 cal", worse: true });
  });

  it("names an increase as an increase, and calls it an improvement", () => {
    // Under goal, adding calories moves you toward it.
    expect(
      portionImpactLine({
        storedCalories: 220, nextCalories: 440, dayCalories: 925, goalCalories: 2300,
      }),
    ).toEqual({ text: "Adds 220 cal — your day becomes 1,145 cal", worse: false });
  });

  it("adding past the goal is worse, not better", () => {
    // The direction of the delta is not the point; distance from goal is.
    const r = portionImpactLine({
      storedCalories: 100, nextCalories: 900, dayCalories: 2250, goalCalories: 2300,
    });
    expect(r?.worse).toBe(true);
  });

  it("an untouched portion reports no change", () => {
    expect(
      portionImpactLine({
        storedCalories: 440, nextCalories: 440, dayCalories: 1145, goalCalories: 2300,
      }),
    ).toEqual({ text: "No change — your day stays at 1,145 cal", worse: false });
  });

  it("never says the word this page reserves for the projection", () => {
    // "lands" belongs to the verdict strip's end-of-day projection; this is
    // the running total, and two meanings for one word on one screen is one
    // too many.
    const r = portionImpactLine({
      storedCalories: 440, nextCalories: 286, dayCalories: 1145, goalCalories: 2300,
    });
    expect(r?.text).not.toContain("lands");
  });

  it("stays quiet with no goal and no change", () => {
    expect(
      portionImpactLine({
        storedCalories: 440, nextCalories: 440, dayCalories: 1145, goalCalories: null,
      }),
    ).toBeNull();
  });

  it("with no goal, a real change still reports, and never as worse", () => {
    const r = portionImpactLine({
      storedCalories: 440, nextCalories: 220, dayCalories: 1145, goalCalories: null,
    });
    expect(r?.text).toBe("Takes off 220 cal — your day becomes 925 cal");
    expect(r?.worse).toBe(false);
  });
});

describe("isDeletion", () => {
  it("none of it is a deletion, not a zero-calorie receipt", () => {
    expect(isDeletion(0)).toBe(true);
    expect(isDeletion(5)).toBe(false);
  });
});
