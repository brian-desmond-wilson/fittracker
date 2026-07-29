// Input policy for the Meal Library builder's two free-form numeric controls:
// the prep-minutes field and the servings stepper. Pure — no I/O, nothing from
// `react-native` — so it is reachable from the repo's `testEnvironment: node`
// Jest scope, which the builder component itself is not.
//
// This lives outside `MealBuilder.tsx` on purpose. Both rules read as trivial
// arithmetic at the call site while actually encoding decisions that are
// expensive to rediscover: one distinguishes a blank field from a typed zero,
// the other keeps a value on a grid that Postgres can store losslessly. Both
// are exactly the kind of expression a later "simplification" collapses.

/** Servings step for the ± stepper. 0.25 is a power of two, which is *why*
 * the divide-and-multiply snap in `snapServings` is exact: every reachable
 * value is representable in binary floating point, so `numeric(5,2)` stores
 * what the user saw. Changing this to e.g. 0.1 would produce off-grid floats
 * (1.2999999999999998) that Postgres rounds server-side, silently desyncing
 * the stored meal from the score the user was shown. */
export const SERVING_STEP = 0.25;

/** `meal_items.servings` is numeric(5,2) (max 999.99) but `meal_logs.servings`
 * is numeric(4,2) (max 99.99) — so a meal item saved above 99.99 saves fine
 * and then FAILS at log time, long after the mistake was made. Cap well below
 * that: 20 servings of a single food is already far beyond anything real. */
export const MAX_SERVINGS = 20;

/** Used when the prep-minutes field is blank. NOT 0 — `parseInt("", 10) || 0`
 * would score a half-filled form as an instant meal (convenience 25/25, the
 * best possible), inflating the live score exactly while the user is still
 * typing. 5 matches the value a new meal's field is seeded with, so the score
 * on screen is the score that gets saved. An explicitly typed "0" is a real
 * answer and is scored as 0. */
export const DEFAULT_PREP_MINUTES = 5;

/**
 * Parse the prep-minutes field into whole minutes.
 *
 * ⚠️ Returns `null` ONLY for a blank/unparseable field — a typed `"0"` returns
 * `0`, which is a legitimate open-and-eat answer scoring the full 25/25
 * convenience (`prep_minutes integer not null default 0`). Blank and zero must
 * NOT be collapsed: `parseInt(raw, 10) || 0` maps both to 0, so every
 * half-filled meal would advertise the best possible convenience score, which
 * is precisely the defect this function exists to prevent.
 *
 * Callers substitute `DEFAULT_PREP_MINUTES` for `null` and say so on screen.
 *
 * Whole non-negative digits only: `"3.5"`, `"-3"`, `"+5"`, `"1e3"` and `"abc"`
 * are all rejected rather than silently truncated, because the field feeds an
 * `integer` column and a truncated value would be saved without the user ever
 * seeing the number that was stored.
 */
export function parsePrepMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return parseInt(trimmed, 10);
}

/**
 * Apply one stepper increment to a servings value.
 *
 * Invariant — invisible in the expression, so it is pinned by tests: the
 * result is ALWAYS an exact multiple of `SERVING_STEP` within
 * `[SERVING_STEP, MAX_SERVINGS]`. The snap is what makes an off-grid value
 * loaded from an older row (e.g. 1.33) correct itself on the first tap, and
 * the lower clamp is what keeps a zero/negative serving unreachable.
 */
export function snapServings(current: number, delta: number): number {
  const snapped = Math.round((current + delta) / SERVING_STEP) * SERVING_STEP;
  return clampServings(snapped);
}

/**
 * Clamp a servings value that is already in hand — one seeded from a stored
 * row rather than produced by the stepper.
 *
 * `snapServings` enforces `MAX_SERVINGS` only on values the user stepped
 * through, so an item loaded from a row above the cap would be re-saved
 * unclamped if they never tapped ±. Not reachable through today's UI, but the
 * bound exists to keep `meal_logs.servings` (numeric(4,2)) from failing at log
 * time, and an invariant that holds only on one path is not an invariant.
 *
 * Deliberately does NOT snap to the grid: a stored off-grid value is the
 * user's real data, and silently rewriting it on save (rather than on the
 * deliberate tap that `snapServings` handles) would change a number they never
 * touched.
 */
export function clampServings(servings: number): number {
  return Math.min(MAX_SERVINGS, Math.max(SERVING_STEP, servings));
}
