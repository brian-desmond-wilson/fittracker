// Relative, not the `@/` alias: this module is covered by the Jest suite
// (via `eatNext.test.ts`) and `jest.config.js` declares no `moduleNameMapper`.
// Every other `src/lib` cross-import is relative for the same reason.
import { colors, tint } from "../theme/tokens";

// Priority tiers for the user's macros (calories + protein > carbs + sodium >
// fats + saturated fat + sugars + fiber)
export type MacroKey =
  | "calories"
  | "protein"
  | "carbs"
  | "sodium"
  | "fats"
  | "saturatedFat"
  | "sugars"
  | "fiber";

export const MACRO_TIER_A: MacroKey[] = ["calories", "protein"];
export const MACRO_TIER_B: MacroKey[] = ["carbs", "sodium"];
// Saturated fat rides with the fat it comes out of rather than at the end,
// so the bottom tier reads in panel order.
export const MACRO_TIER_C: MacroKey[] = ["fats", "saturatedFat", "sugars", "fiber"];

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  sodium_mg: number;
  fats: number;
  saturated_fat_g: number;
  sugars: number;
  fiber_g: number;
}

export interface MacroGoals {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  sodium_mg: number | null;
  fats: number | null;
  saturated_fat_g: number | null;
  sugars: number | null;
  fiber_g: number | null;
}

export const EMPTY_TOTALS: MacroTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  sodium_mg: 0,
  fats: 0,
  saturated_fat_g: 0,
  sugars: 0,
  fiber_g: 0,
};

// What goal/total field a macro maps to (sodium uses _mg, fiber uses _g).
export function totalForMacro(t: MacroTotals, m: MacroKey): number {
  switch (m) {
    case "calories": return t.calories;
    case "protein": return t.protein;
    case "carbs": return t.carbs;
    case "sodium": return t.sodium_mg;
    case "fats": return t.fats;
    case "saturatedFat": return t.saturated_fat_g;
    case "sugars": return t.sugars;
    case "fiber": return t.fiber_g;
  }
}

export function goalForMacro(g: MacroGoals, m: MacroKey): number | null {
  switch (m) {
    case "calories": return g.calories;
    case "protein": return g.protein;
    case "carbs": return g.carbs;
    case "sodium": return g.sodium_mg;
    case "fats": return g.fats;
    case "saturatedFat": return g.saturated_fat_g;
    case "sugars": return g.sugars;
    case "fiber": return g.fiber_g;
  }
}

export function macroLabel(m: MacroKey): string {
  switch (m) {
    case "calories": return "Calories";
    case "protein": return "Protein";
    case "carbs": return "Carbs";
    case "sodium": return "Sodium";
    case "fats": return "Fats";
    // "Sat. Fat" beside "Fats" would read as an abbreviation of the row above
    // it; the full words are worth the width on a two-column meter.
    case "saturatedFat": return "Saturated Fat";
    case "sugars": return "Sugars";
    case "fiber": return "Fiber";
  }
}

export function macroUnit(m: MacroKey): string {
  switch (m) {
    case "calories": return "";
    case "sodium": return "mg";
    default: return "g";
  }
}

/**
 * Format a macro value. Calories are integer; sodium is integer mg;
 * grams are 1 decimal.
 */
export function formatMacroValue(value: number, m: MacroKey): string {
  if (m === "calories" || m === "sodium") {
    return Math.round(value).toLocaleString();
  }
  // C6. Gram values used to be unconditionally `toFixed(1)`, so a protein goal
  // of 160 rendered "of 160.0g" and an untouched day read "0.0" — a decimal of
  // precision on numbers that have none, and one the reader has to look past
  // on every screen. Round to a tenth (the display precision), then drop the
  // trailing zero: 160 → "160", 12.5 → "12.5". Same rule the Nutrition Facts
  // panel already applies to its own gram figures.
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * "324 / 2,000" or "324" when no goal.
 */
export function formatMacroProgress(
  value: number,
  goal: number | null,
  m: MacroKey,
): string {
  const unit = macroUnit(m);
  const v = formatMacroValue(value, m);
  if (goal == null) return unit ? `${v}${unit}` : v;
  const g = formatMacroValue(goal, m);
  return unit ? `${v} / ${g} ${unit}` : `${v} / ${g}`;
}

/**
 * Ratio of current to goal, clamped to [0, 1] for visual fills.
 * Returns 0 if goal is null/0.
 */
export function macroProgress(value: number, goal: number | null): number {
  if (!goal || goal <= 0) return 0;
  return Math.min(value / goal, 1);
}

/**
 * Color for the macro's progress: blue while under, green at/over goal.
 * For "should not exceed" macros like sodium, callers can pass `cap` to
 * flip to amber/red when over.
 */
export function macroColor(
  value: number,
  goal: number | null,
  m: MacroKey,
): string {
  // Cap-type macros: hitting the goal is fine, exceeding is a warning.
  // Saturated fat joins them — it is a ceiling on every dietary guideline
  // that names it, never something to finish the day short of.
  const isCap = m === "sodium" || m === "sugars" || m === "saturatedFat";
  if (!goal || goal <= 0) return colors.macros.under;
  const ratio = value / goal;
  if (isCap) {
    if (ratio >= 1.1) return colors.macros.overCap; // over by >10%: red
    if (ratio >= 1.0) return colors.macros.atCap; // at cap: amber
    if (ratio >= 0.8) return colors.macros.under; // approaching
    // Comfortably under a cap: the same blue, dimmed. `tint()` at 0.7 rather
    // than the system's 0.15/0.3 because this is a meter fill, not a tinted
    // surface — it has to stay a legible mark on `surface2`.
    return tint(colors.macros.under, 0.7);
  }
  return ratio >= 1.0 ? colors.macros.met : colors.macros.under;
}

/**
 * Sum nutrition fields across an array of rows. Each row should have
 * the columns we care about; missing/null values are treated as 0.
 */
export function sumNutrition<T extends Partial<{
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  saturated_fat_g: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
}>>(rows: T[]): MacroTotals {
  const out: MacroTotals = { ...EMPTY_TOTALS };
  for (const r of rows) {
    out.calories += Number(r.calories ?? 0);
    out.protein += Number(r.protein ?? 0);
    out.carbs += Number(r.carbs ?? 0);
    out.fats += Number(r.fats ?? 0);
    out.sugars += Number(r.sugars ?? 0);
    out.saturated_fat_g += Number(r.saturated_fat_g ?? 0);
    out.sodium_mg += Number(r.sodium_mg ?? 0);
    out.fiber_g += Number(r.fiber_g ?? 0);
  }
  return out;
}
