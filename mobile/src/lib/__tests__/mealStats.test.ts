import {
  buildDailyTotalsByDate,
  buildMealsSeries,
  computeMacroBestStreak,
  computeMacroSplit,
  computeMacroStreak,
  computeMealsRollingStats,
  type DailyTotalsByDate,
} from "../mealStats";
import { EMPTY_TOTALS, type MacroGoals, type MacroTotals } from "../mealMacros";

// Fixed local noon, so nothing depends on when the suite runs.
const TODAY = new Date(2026, 7, 14, 12, 0);

const GOALS: MacroGoals = {
  calories: 2000,
  protein: 150,
  carbs: null,
  sodium_mg: null,
  fats: null,
  sugars: null,
  fiber_g: null,
};

const totals = (over: Partial<MacroTotals> = {}): MacroTotals => ({
  ...EMPTY_TOTALS,
  ...over,
});

/** Per-day totals for consecutive days ending on TODAY, most recent first. */
function daysBack(entries: Array<Partial<MacroTotals>>): DailyTotalsByDate {
  const out: DailyTotalsByDate = {};
  entries.forEach((e, i) => {
    const d = new Date(TODAY);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out[key] = totals(e);
  });
  return out;
}

describe("buildDailyTotalsByDate", () => {
  it("groups logs by their date and sums each day", () => {
    const byDate = buildDailyTotalsByDate([
      { date: "2026-08-14", calories: 500, protein: 30, carbs: 40, fats: 10 },
      { date: "2026-08-14", calories: 700, protein: 50, carbs: 60, fats: 20 },
      { date: "2026-08-13", calories: 300, protein: 20, carbs: 10, fats: 5 },
    ] as never);
    expect(byDate["2026-08-14"].calories).toBe(1200);
    expect(byDate["2026-08-14"].protein).toBe(80);
    expect(byDate["2026-08-13"].calories).toBe(300);
  });

  it("has no entry for a day nothing was logged", () => {
    expect(buildDailyTotalsByDate([])).toEqual({});
  });
});

describe("computeMacroStreak", () => {
  it("counts days that met the goal", () => {
    const t = daysBack([{ calories: 2100 }, { calories: 2000 }, { calories: 2050 }, { calories: 900 }]);
    expect(computeMacroStreak(t, GOALS, "calories", TODAY)).toBe(3);
  });

  it("leaves today out rather than breaking the streak on an unfinished day", () => {
    const t = daysBack([{ calories: 400 }, { calories: 2100 }, { calories: 2100 }]);
    expect(computeMacroStreak(t, GOALS, "calories", TODAY)).toBe(2);
  });

  it("tracks each macro separately", () => {
    const t = daysBack([
      { calories: 2100, protein: 100 },
      { calories: 2100, protein: 160 },
    ]);
    expect(computeMacroStreak(t, GOALS, "calories", TODAY)).toBe(2);
    // Today's protein missed, yesterday's hit.
    expect(computeMacroStreak(t, GOALS, "protein", TODAY)).toBe(1);
  });

  it("is zero when the macro has no goal set", () => {
    const t = daysBack([{ carbs: 300 }]);
    expect(computeMacroStreak(t, { ...GOALS, protein: null }, "protein", TODAY)).toBe(0);
  });
});

describe("computeMacroBestStreak", () => {
  it("finds the longest run rather than the latest", () => {
    const t = daysBack([
      { calories: 2100 },
      { calories: 2100 },
      { calories: 100 },
      { calories: 2100 },
      { calories: 2100 },
      { calories: 2100 },
    ]);
    expect(computeMacroBestStreak(t, GOALS, "calories", TODAY)).toBe(3);
  });

  it("counts a lone logged day — the walk must not start late", () => {
    // Regression: the range began at `new Date("YYYY-MM-DD")`, UTC midnight,
    // which is the day before west of Greenwich.
    expect(computeMacroBestStreak(daysBack([{ calories: 2100 }]), GOALS, "calories", TODAY)).toBe(1);
  });

  it("is zero with no history", () => {
    expect(computeMacroBestStreak({}, GOALS, "calories", TODAY)).toBe(0);
  });
});

describe("computeMealsRollingStats", () => {
  it("averages across the full seven days, not just the logged ones", () => {
    const t = daysBack([{ calories: 2100 }, { calories: 2100 }]);
    const { avgCalsPerDay, daysHit, daysInWindow } = computeMealsRollingStats(t, GOALS, TODAY);
    expect(daysInWindow).toBe(7);
    expect(daysHit).toBe(2);
    expect(avgCalsPerDay).toBeCloseTo(4200 / 7);
  });
});

describe("buildMealsSeries", () => {
  it("runs oldest to newest and fills the gaps with zeros", () => {
    const series = buildMealsSeries(daysBack([{ calories: 2100 }, {}, { calories: 800 }]), 4, GOALS, TODAY);
    expect(series.map((e) => e.calories)).toEqual([0, 800, 0, 2100]);
    expect(series[3].date).toBe("2026-08-14");
    expect(series.every((e) => e.calorieGoal === 2000)).toBe(true);
  });
});

describe("computeMacroSplit", () => {
  it("splits by calories, not by grams — fat counts more than its weight", () => {
    // 100g each: protein 400, carbs 400, fats 900 → 1700 cal.
    const split = computeMacroSplit(totals({ protein: 100, carbs: 100, fats: 100 }));
    expect(split.protein).toBeCloseTo(400 / 1700);
    expect(split.carbs).toBeCloseTo(400 / 1700);
    expect(split.fats).toBeCloseTo(900 / 1700);
    expect(split.protein + split.carbs + split.fats).toBeCloseTo(1);
  });

  it("returns all zeros for an empty day rather than dividing by zero", () => {
    expect(computeMacroSplit(EMPTY_TOTALS)).toEqual({ protein: 0, carbs: 0, fats: 0 });
  });
});
