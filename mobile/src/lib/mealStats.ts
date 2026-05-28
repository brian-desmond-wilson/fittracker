import { MacroGoals, MacroTotals, EMPTY_TOTALS, sumNutrition } from "./mealMacros";

export type DailyTotalsByDate = Record<string, MacroTotals>;

function getLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/**
 * Build per-date totals from a flat list of meal_logs.
 */
export function buildDailyTotalsByDate<T extends { date: string }>(
  logs: T[],
): DailyTotalsByDate {
  const byDate: Record<string, T[]> = {};
  for (const l of logs) {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  }
  const out: DailyTotalsByDate = {};
  for (const [date, rows] of Object.entries(byDate)) {
    out[date] = sumNutrition(rows as any);
  }
  return out;
}

export type MacroForStreak = "calories" | "protein";

function valueFor(totals: MacroTotals, m: MacroForStreak): number {
  return m === "calories" ? totals.calories : totals.protein;
}

function goalFor(goals: MacroGoals, m: MacroForStreak): number | null {
  return m === "calories" ? goals.calories : goals.protein;
}

/**
 * Current streak for a given macro using hit-or-exceed rule
 * (totals[date][macro] >= goal). Today is grace — if today isn't hit
 * yet, the streak walks back from yesterday so the user has until
 * midnight to preserve it.
 */
export function computeMacroStreak(
  totalsByDate: DailyTotalsByDate,
  goals: MacroGoals,
  macro: MacroForStreak,
): number {
  const goal = goalFor(goals, macro);
  if (goal == null || goal <= 0) return 0;
  const today = new Date();
  const todayKey = getLocalDate(today);
  const todayTotal = totalsByDate[todayKey] ?? EMPTY_TOTALS;
  const todayHit = valueFor(todayTotal, macro) >= goal;

  let streak = 0;
  let cursor = todayHit ? 0 : 1;
  while (true) {
    const key = getLocalDate(addDays(today, -cursor));
    const t = totalsByDate[key] ?? EMPTY_TOTALS;
    if (valueFor(t, macro) >= goal) {
      streak++;
      cursor++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Best streak for the given macro: longest consecutive run of days
 * where the macro met-or-exceeded its goal. Iterates from the earliest
 * date with logs to today.
 */
export function computeMacroBestStreak(
  totalsByDate: DailyTotalsByDate,
  goals: MacroGoals,
  macro: MacroForStreak,
): number {
  const goal = goalFor(goals, macro);
  if (goal == null || goal <= 0) return 0;
  const dates = Object.keys(totalsByDate);
  if (dates.length === 0) return 0;
  dates.sort();
  const earliest = new Date(dates[0]);
  const today = new Date();
  let best = 0;
  let running = 0;
  for (let d = new Date(earliest); d <= today; d = addDays(d, 1)) {
    const key = getLocalDate(d);
    const t = totalsByDate[key] ?? EMPTY_TOTALS;
    if (valueFor(t, macro) >= goal) {
      running++;
      if (running > best) best = running;
    } else {
      running = 0;
    }
  }
  return best;
}

/**
 * Rolling 7-day window ending today: average daily calories and the
 * number of those 7 days where the calorie goal was met or exceeded.
 */
export function computeMealsRollingStats(
  totalsByDate: DailyTotalsByDate,
  goals: MacroGoals,
): { avgCalsPerDay: number; daysHit: number; daysInWindow: number } {
  const days = 7;
  const today = new Date();
  let sum = 0;
  let daysHit = 0;
  const goal = goals.calories ?? 0;
  for (let i = 0; i < days; i++) {
    const key = getLocalDate(addDays(today, -i));
    const t = totalsByDate[key] ?? EMPTY_TOTALS;
    sum += t.calories;
    if (goal > 0 && t.calories >= goal) daysHit++;
  }
  return {
    avgCalsPerDay: sum / days,
    daysHit,
    daysInWindow: days,
  };
}

export interface MealsSeriesEntry {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  calorieGoal: number;
}

/**
 * Last `days` daily entries (oldest -> newest) with per-day macro totals
 * and the calorie goal for each day (currently a constant since we have
 * a single profile goal — leaves room for per-day overrides later).
 */
export function buildMealsSeries(
  totalsByDate: DailyTotalsByDate,
  days: number,
  goals: MacroGoals,
): MealsSeriesEntry[] {
  const today = new Date();
  const calGoal = goals.calories ?? 0;
  const out: MealsSeriesEntry[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = getLocalDate(addDays(today, -i));
    const t = totalsByDate[key] ?? EMPTY_TOTALS;
    out.push({
      date: key,
      calories: t.calories,
      protein: t.protein,
      carbs: t.carbs,
      fats: t.fats,
      calorieGoal: calGoal,
    });
  }
  return out;
}

/**
 * Compute the macro calorie split for a single day.
 * Returns ratios that sum to 1 (or all zero if no macros). Each ratio
 * is the share of CALORIES (not grams) coming from that macro:
 *   protein: 4 cal/g, carbs: 4 cal/g, fats: 9 cal/g.
 */
export function computeMacroSplit(totals: MacroTotals): {
  protein: number;
  carbs: number;
  fats: number;
} {
  const pCal = totals.protein * 4;
  const cCal = totals.carbs * 4;
  const fCal = totals.fats * 9;
  const total = pCal + cCal + fCal;
  if (total <= 0) return { protein: 0, carbs: 0, fats: 0 };
  return {
    protein: pCal / total,
    carbs: cCal / total,
    fats: fCal / total,
  };
}
