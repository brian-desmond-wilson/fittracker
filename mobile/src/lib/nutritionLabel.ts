// The Nutrition Facts panel, as a data structure.
//
// The app stores nine nutrition fields; a real FDA panel carries about
// fifteen. This module decides what can honestly be printed from what we
// have, and — importantly — what must be left off. A panel that invents a
// figure is worse than a panel that admits it doesn't know one, and a panel is
// exactly the artifact people trust literally.
//
// Percent Daily Values use the FDA reference amounts for adults and children
// 4+ (21 CFR 101.9(c)(8)(iv)), the same 2,000-calorie basis the printed panel
// footnotes. They are computed, never stored.

/** FDA daily reference values. Grams unless noted. */
export const DAILY_VALUES = {
  totalFat: 78,
  saturatedFat: 20,
  cholesterolMg: 300,
  sodiumMg: 2300,
  totalCarbohydrate: 275,
  dietaryFiber: 28,
  addedSugars: 50,
} as const;

export interface LabelRow {
  /** "Total Fat" — bold on the printed panel unless `indented`. */
  label: string;
  /** "0.5g" — already formatted with its unit. */
  amount: string;
  /** Percent daily value, or null where the panel prints none. */
  dv: number | null;
  /** Sub-nutrients ("Dietary Fiber", "Total Sugars") sit indented, not bold. */
  indented?: boolean;
}

export interface NutritionLabel {
  servingSize: string | null;
  calories: number | null;
  rows: LabelRow[];
  /** Nutrients a real panel carries that we hold no value for. */
  missing: string[];
  /** True when there is nothing worth flipping the card over to see. */
  isEmpty: boolean;
}

export interface LabelSource {
  serving_size: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  /** Optional so the two synthetic callers that predate the column (the
   *  add/preview routes' stub items) still typecheck; absent reads the same
   *  as null — the row is left off and named among the missing. */
  fiber_g?: number | null;
  /** Grams, like the fat it sits under. Optional for the same reason. */
  saturated_fat_g?: number | null;
  /** Milligrams, as the panel prints sodium — the one figure here that is
   *  not in grams. Optional for the same reason. */
  sodium_mg?: number | null;
}

const pctOf = (value: number, dv: number): number => Math.round((value / dv) * 100);

/** Trailing ".0" is noise on a panel: 0.5g stays, 6.0g becomes 6g. */
const grams = (n: number): string => `${Number.isInteger(n) ? n : Number(n.toFixed(1))}g`;

/** The same rounding for the one nutrient the panel prints in milligrams. */
const milligrams = (n: number): string => `${Number.isInteger(n) ? n : Number(n.toFixed(1))}mg`;

/** Absent and null both mean "we hold no figure" — see LabelSource. */
const has = (v: number | null | undefined): v is number => v !== null && v !== undefined;

export function buildNutritionLabel(item: LabelSource): NutritionLabel {
  const rows: LabelRow[] = [];

  // Panel order is fixed by regulation: fat, then carbohydrate and its
  // sub-nutrients, then protein. Ours is a subset of that sequence, not a
  // rearrangement of it.
  if (has(item.fats)) {
    rows.push({ label: "Total Fat", amount: grams(item.fats), dv: pctOf(item.fats, DAILY_VALUES.totalFat) });
  }
  if (has(item.saturated_fat_g)) {
    // A sub-nutrient of total fat, and one of the few the FDA sets a real
    // reference value for. It prints even when total fat is missing: the panel
    // reads a row at a time, and a saturated figure we hold is worth more than
    // the tidiness of only showing it under its parent.
    rows.push({
      label: "Saturated Fat",
      amount: grams(item.saturated_fat_g),
      dv: pctOf(item.saturated_fat_g, DAILY_VALUES.saturatedFat),
      indented: true,
    });
  }
  if (has(item.sodium_mg)) {
    // Top-level, between the fats and the carbohydrate block, and the only
    // row here in milligrams.
    rows.push({
      label: "Sodium",
      amount: milligrams(item.sodium_mg),
      dv: pctOf(item.sodium_mg, DAILY_VALUES.sodiumMg),
    });
  }
  if (item.carbs !== null && item.carbs !== undefined) {
    rows.push({
      label: "Total Carbohydrate",
      amount: grams(item.carbs),
      dv: pctOf(item.carbs, DAILY_VALUES.totalCarbohydrate),
    });
  }
  if (item.fiber_g !== null && item.fiber_g !== undefined) {
    // Fiber precedes sugars on the printed panel and carries a real %DV —
    // unlike total sugars, the FDA sets a reference value for it.
    rows.push({
      label: "Dietary Fiber",
      amount: grams(item.fiber_g),
      dv: pctOf(item.fiber_g, DAILY_VALUES.dietaryFiber),
      indented: true,
    });
  }
  if (item.sugars !== null && item.sugars !== undefined) {
    // No %DV: the printed panel gives one only for ADDED sugars, and this
    // column does not distinguish added from naturally occurring.
    rows.push({ label: "Total Sugars", amount: grams(item.sugars), dv: null, indented: true });
  }
  if (item.protein !== null && item.protein !== undefined) {
    // Protein %DV is optional on the panel and conventionally omitted.
    rows.push({ label: "Protein", amount: grams(item.protein), dv: null });
  }

  const missing: string[] = [];
  if (!has(item.fats)) missing.push("total fat");
  if (!has(item.saturated_fat_g)) missing.push("saturated fat");
  // Trans fat and cholesterol have no column anywhere in the app, so nothing
  // can ever fill these two — they are named unconditionally.
  missing.push("trans fat", "cholesterol");
  if (!has(item.sodium_mg)) missing.push("sodium");
  if (item.carbs === null || item.carbs === undefined) missing.push("total carbohydrate");
  if (item.fiber_g === null || item.fiber_g === undefined) missing.push("dietary fiber");
  missing.push("added sugars");
  if (item.protein === null || item.protein === undefined) missing.push("protein");
  missing.push("vitamin D", "calcium", "iron", "potassium");

  return {
    servingSize: item.serving_size ?? null,
    calories: item.calories ?? null,
    rows,
    missing,
    isEmpty: rows.length === 0 && (item.calories === null || item.calories === undefined),
  };
}
