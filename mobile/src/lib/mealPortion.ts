// How much of it did you actually eat?
//
// The log editor used to hand you seven raw macro fields — the only way to
// say "I ate half" was to divide seven numbers by two yourself. This replaces
// them with one percentage, and this file is the arithmetic underneath it.
//
// The whole design rests on one question: what does 100% mean? It means THE
// AMOUNT ORIGINALLY LOGGED, and the answer has to survive a round trip, or
// editing to 50% twice would leave you at a quarter without ever saying so.
// `meal_logs.servings` is what makes that possible: the stored macros are
// always `base × servings`, so the base is recoverable (`macros ÷ servings`)
// and the percentage is readable back (`servings × 100`). Nothing new is
// stored and no column changes.

/** The four answers that cover almost every real edit. */
export const PORTION_PRESETS = [25, 50, 75, 100] as const;
/** Stepper granularity — finer than this is false precision about food. */
export const PORTION_STEP = 5;
/**
 * You cannot eat more than all of it. A second helping is a second log, and
 * an over-portion that isn't (a bigger bowl than the label assumed) is what
 * the exact-amounts escape hatch is for.
 */
export const PORTION_MAX = 100;

/** The macro columns a percentage scales. Names match `meal_logs`. */
export interface PortionMacros {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  saturated_fat_g: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
}

const MACRO_KEYS: Array<keyof PortionMacros> = [
  "calories", "protein", "carbs", "fats", "sugars", "saturated_fat_g",
  "sodium_mg", "fiber_g",
];

/**
 * The percentage a stored log represents, from its servings multiplier.
 *
 * Legacy and hand-typed rows carry `servings = 1`, which reads as 100% — the
 * truthful answer for a row nobody has portioned: what is stored IS what was
 * eaten. A missing, zero or negative multiplier is treated the same way
 * rather than propagating a division by zero into every macro on screen.
 */
export function portionPercentOf(servings: number | null | undefined): number {
  if (servings == null || !Number.isFinite(servings) || servings <= 0) return 100;
  return clampPercent(Math.round(servings * 100));
}

export function clampPercent(pct: number): number {
  if (!Number.isFinite(pct)) return 100;
  return Math.max(0, Math.min(PORTION_MAX, Math.round(pct)));
}

/**
 * The 100% amounts, recovered from what is stored.
 *
 * This is the number the "was" line shows and every scaled value derives
 * from, so it must be computed from the multiplier rather than assumed to be
 * the stored macros — on a log already saved at 65%, the stored macros are
 * the 65% ones.
 */
export function baseMacros(stored: PortionMacros, servings: number | null | undefined): PortionMacros {
  const pct = portionPercentOf(servings);
  const factor = pct / 100;
  const out = {} as PortionMacros;
  for (const k of MACRO_KEYS) {
    const v = stored[k];
    out[k] = v == null ? null : roundMacro(k, v / factor);
  }
  return out;
}

/** What to store for a given percentage of the base. */
export function scaleMacros(base: PortionMacros, pct: number): PortionMacros {
  const factor = clampPercent(pct) / 100;
  const out = {} as PortionMacros;
  for (const k of MACRO_KEYS) {
    const v = base[k];
    out[k] = v == null ? null : roundMacro(k, v * factor);
  }
  return out;
}

/** Calories and sodium are whole units; grams keep one decimal. Rounding at
 *  the boundary (not at render) keeps the stored row and the screen agreeing. */
function roundMacro(key: keyof PortionMacros, value: number): number {
  if (key === "calories" || key === "sodium_mg") return Math.round(value);
  return Math.round(value * 10) / 10;
}

/** The multiplier to store alongside the scaled macros. */
export function servingsForPercent(pct: number): number {
  return clampPercent(pct) / 100;
}

export interface PortionImpact {
  text: string;
  /** True when the edit moves the day's total FURTHER from the goal. Drives
   *  the panel's tone: a correction that costs you is not good news, and
   *  painting every edit green would make the colour meaningless. */
  worse: boolean;
}

/**
 * What the edit does to the day, in the day's own terms.
 *
 * Deliberately phrased as a DELTA and not just a new total: you opened this
 * sheet because a number was wrong, so the useful sentence is how far it
 * moves — the running total is already on screen above. It says "your day"
 * and never "lands", which on this page means the projected end of day the
 * verdict strip computes; this is the total so far.
 */
export function portionImpactLine(opts: {
  storedCalories: number | null;
  nextCalories: number | null;
  dayCalories: number;
  goalCalories: number | null;
}): PortionImpact | null {
  const before = opts.storedCalories ?? 0;
  const after = opts.nextCalories ?? 0;
  const delta = Math.round(after - before);
  const dayAfter = Math.round(opts.dayCalories - before + after);
  if (delta === 0) {
    return opts.goalCalories == null
      ? null
      : { text: `No change — your day stays at ${dayAfter.toLocaleString()} cal`, worse: false };
  }
  const direction = delta > 0 ? "Adds" : "Takes off";
  const size = Math.abs(delta).toLocaleString();
  const worse =
    opts.goalCalories != null &&
    Math.abs(opts.goalCalories - dayAfter) > Math.abs(opts.goalCalories - opts.dayCalories);
  return {
    text: `${direction} ${size} cal — your day becomes ${dayAfter.toLocaleString()} cal`,
    worse,
  };
}

/** True when the percentage means "I didn't eat this", which is a deletion
 *  rather than a zero-calorie receipt. */
export function isDeletion(pct: number): boolean {
  return clampPercent(pct) === 0;
}
