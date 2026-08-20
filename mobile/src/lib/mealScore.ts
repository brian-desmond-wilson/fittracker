// Brian Score: pure derivation from Phase 1 preference data + meal items.
// No I/O — sibling of rampProgress.ts. Policy constants are code, not schema
// (same stance as the ramp thresholds): they are policy, unlikely to vary,
// and belong under test.
//
// Cost (the original 5-point component) is dropped — no price data exists
// anywhere in the app — so raw max is 95, renormalized to /100 (spec §6).
import type { ConceptRating } from "@/src/types/nutrition-preferences";
import type { MealRole } from "@/src/types/meal-library";

export const RATING_POINTS: Record<ConceptRating, number> = {
  love: 30,
  like: 22,
  neutral: 15,
  dislike: 8,
  never: 0,
};

export const RAW_MAX = 95;

/** Per-component maxima (spec §6). Exported so consumers (chip bars,
 * per-component breakdown bars) render the same numbers this file scores
 * against, instead of re-declaring them. Their sum must equal RAW_MAX —
 * see the invariant test in mealScore.test.ts. */
export const COMPONENT_MAX = {
  taste: 30,
  convenience: 25,
  protein: 15,
  eoe: 15,
  calories: 10,
} as const;

/**
 * Chip bands: >= CORE green, >= MID neutral, below that flagged.
 *
 * RECALIBRATED (A8) against the real library rather than the round numbers the
 * spec guessed at. The core line sat at 95, which is 90.25 of a possible 95
 * raw — near-perfect — while the seventeen meals actually in the library score
 * 77 to 95. Two of them were green and the other fifteen, including every
 * Brian Approved meal, wore the same amber chip as the worst thing in the
 * library. A badge that says "not the best" about almost everything is not
 * grading, it is decoration.
 *
 * 85 is where the observed distribution genuinely separates: the approved,
 * high-protein, low-prep meals cluster at 87 and up, and the ones held back by
 * thin protein or an unrated concept sit at 77 to 80. The floor moves 71 → 70
 * for no cleverer reason than that a round number is easier to reason about,
 * and nothing real lands between them.
 *
 * These are policy, and policy is expected to move as the library grows —
 * which is exactly why they are constants under test rather than literals in
 * the chip's style function.
 */
export const SCORE_BAND_CORE_MIN = 85;
export const SCORE_BAND_MID_MIN = 70;

export type ScoreBand = "core" | "mid" | "low";

/** Which band a /100 score falls in (spec §6). The DECISION lives here, next
 * to the thresholds and under test with every other §6 threshold; the chip's
 * `scoreTone` is left a pure band → Badge-tone lookup. Deliberately not
 * inlined in `styles.ts`, which imports `react-native` and so can never be
 * reached by the repo's `testEnvironment: node` Jest scope. */
export function scoreBand(score: number): ScoreBand {
  if (score >= SCORE_BAND_CORE_MIN) return "core";
  if (score >= SCORE_BAND_MID_MIN) return "mid";
  return "low";
}

const PREP_INTENSIVE_PENALTY = 3;
const EOE_PENALTY_PER_ITEM = 5;
const APPROVED_MAX_PREP_MINUTES = 10;
const APPROVED_MIN_PROTEIN_G = 30;
const APPROVED_MIN_TASTE = RATING_POINTS.like;
const BRIDGE_CAL_MIN = 250;
const BRIDGE_CAL_MAX = 400;

/** Calories-component full-score threshold: "this meal hits its calorie
 * target" (spec §6, Calories /10). */
const CALORIES_FULL_POINTS_MIN = 500;

/**
 * The same threshold for a meal that arrives already portioned.
 *
 * The 500 above is calibrated for meals you ASSEMBLE, where falling short is a
 * choice you made: a 440-kcal plate you built really is a partial meal because
 * you could have put more on it. A delivered meal is not that — its portion
 * was set by whoever made it and cannot be topped up — so the same 440 is a
 * complete breakfast, and scoring it as 70% of a meal judges the wrong thing.
 * Dropped by exactly one band rather than removed: portion size still matters
 * on a calorie ramp, and a 200-kcal cup is still a snack whoever made it.
 */
export const COMPLETE_PORTION_FULL_POINTS_MIN = 400;
/** Brian Approved calorie admission bar: "this is a substantial meal"
 * (spec §6, Brian Approved). Spec §6 states these as two INDEPENDENT
 * clauses that merely coincide at 500 today — this bar could drop to 450
 * without retuning the scoring ladder — so it stays a distinct knob, while
 * the alias keeps them from drifting apart by accident. */
const APPROVED_MIN_CALORIES = CALORIES_FULL_POINTS_MIN;
/** The admission bar for an already-portioned meal, aliased to its own band
 *  for the same reason: two knobs that coincide today, not one knob. */
const APPROVED_MIN_CALORIES_COMPLETE_PORTION = COMPLETE_PORTION_FULL_POINTS_MIN;

/** Round away float-epsilon noise (e.g. 21.999999999999996 instead of 22)
 * from summing/dividing decimal nutrition values, so threshold comparisons
 * against exact policy numbers (taste >= 22, protein total === 40, ...)
 * don't silently miss. The underlying data is decimal, not binary, so
 * rounding here is semantically correct, not a hack. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface ScoreConceptInput {
  rating: ConceptRating;
  requiresSmallPieces: boolean;
  prepIntensive: boolean;
}

export interface ScoreItemInput {
  calories: number | null;
  protein: number | null;
  servings: number;
  smallPiecesOk: boolean;
  concepts: ScoreConceptInput[];
}

export interface BrianScoreInput {
  prepMinutes: number;
  /** Every job the meal can do. `bridge` among them relaxes the calorie band
   *  and the Approved bar — a bridge is meant to be small, and a meal that is
   *  a bridge AND something else is still meant to be small when used as one. */
  roles: readonly MealRole[];
  tasteOverride: ConceptRating | null;
  items: ScoreItemInput[];
  /** `meals.is_complete_portion` — sold as one finished portion. Optional so
   *  every existing caller and fixture keeps compiling; absent reads false,
   *  which is the pre-existing behaviour exactly. */
  completePortion?: boolean;
}

export interface BrianScoreResult {
  taste: number;
  convenience: number;
  protein: number;
  eoe: number;
  calories: number;
  raw: number;
  /** raw renormalized to /100 (× 100/95). */
  score: number;
  tasteUnknown: boolean;
  containsNever: boolean;
  approved: boolean;
  totalCalories: number;
  totalProtein: number;
}

export function computeBrianScore(input: BrianScoreInput): BrianScoreResult {
  const { prepMinutes, roles, tasteOverride, items, completePortion = false } = input;
  const isBridge = roles.includes("bridge");
  // Two thresholds, kept distinct on purpose (see the constants): the calorie
  // COMPONENT's full-points line and the Brian Approved admission bar coincide
  // today but are separate policy knobs. Both shift together for a meal that
  // arrives already portioned, because both are asking the same question —
  // "is this a whole meal?" — of an object whose size someone else chose.
  const caloriesFullPointsMin = completePortion
    ? COMPLETE_PORTION_FULL_POINTS_MIN
    : CALORIES_FULL_POINTS_MIN;
  const approvedMinCalories = completePortion
    ? APPROVED_MIN_CALORIES_COMPLETE_PORTION
    : APPROVED_MIN_CALORIES;

  const totalCalories = round(
    items.reduce((sum, it) => sum + it.servings * (it.calories ?? 0), 0),
    2,
  );
  const totalProtein = round(
    items.reduce((sum, it) => sum + it.servings * (it.protein ?? 0), 0),
    2,
  );

  const containsNever = items.some((it) =>
    it.concepts.some((c) => c.rating === "never"),
  );

  // ── Taste /30 ── calorie-weighted average of per-item concept points;
  // an item with several concepts contributes their plain average.
  const linked = items.filter((it) => it.concepts.length > 0);
  let taste: number;
  let tasteUnknown = false;
  if (tasteOverride !== null) {
    taste = RATING_POINTS[tasteOverride];
  } else if (linked.length === 0) {
    taste = RATING_POINTS.neutral; // neutral placeholder — surfaced via the flag, not hidden
    tasteUnknown = true;
  } else {
    const itemPoints = (it: ScoreItemInput) =>
      it.concepts.reduce((s, c) => s + RATING_POINTS[c.rating], 0) /
      it.concepts.length;
    const totalWeight = linked.reduce(
      (s, it) => s + it.servings * (it.calories ?? 0),
      0,
    );
    const computed =
      totalWeight > 0
        ? linked.reduce(
            (s, it) => s + it.servings * (it.calories ?? 0) * itemPoints(it),
            0,
          ) / totalWeight
        : // All linked items lack calorie data — weighting is meaningless, so
          // fall back to the unweighted average rather than divide by zero.
          linked.reduce((s, it) => s + itemPoints(it), 0) / linked.length;
    taste = round(computed, 4);
  }

  // ── Convenience /25 ──
  let convenience: number;
  if (prepMinutes <= 2) convenience = 25;
  else if (prepMinutes <= 5) convenience = 20;
  else if (prepMinutes <= 10) convenience = 12;
  else convenience = 5;
  if (items.some((it) => it.concepts.some((c) => c.prepIntensive))) {
    convenience = Math.max(0, convenience - PREP_INTENSIVE_PENALTY);
  }

  // ── Protein /15 ──
  let protein: number;
  if (totalProtein >= 40) protein = 15;
  else if (totalProtein >= 30) protein = 12;
  else if (totalProtein >= 20) protein = 8;
  else if (totalProtein >= 10) protein = 4;
  else protein = 0;

  // ── EoE /15 ──
  const unaddressed = items.filter(
    (it) =>
      !it.smallPiecesOk && it.concepts.some((c) => c.requiresSmallPieces),
  ).length;
  const eoe = Math.max(0, COMPONENT_MAX.eoe - EOE_PENALTY_PER_ITEM * unaddressed);

  // ── Calories /10 ──
  let calories: number;
  if (isBridge) {
    calories =
      totalCalories >= BRIDGE_CAL_MIN && totalCalories <= BRIDGE_CAL_MAX
        ? 10
        : 4;
  } else {
    // The WHOLE ladder shifts for an already-portioned meal, not just its top
    // rung. Moving only the 10-point line would leave the 7 stranded above it
    // and drop a 399-kcal delivered meal straight from 10 to 4 — a cliff at a
    // one-calorie difference, and a harsher verdict than the assembled ladder
    // gives the same food.
    const [full, most, some] = completePortion
      ? [COMPLETE_PORTION_FULL_POINTS_MIN, 300, 200]
      : [CALORIES_FULL_POINTS_MIN, 400, 300];
    if (totalCalories >= full) calories = 10;
    else if (totalCalories >= most) calories = 7;
    else if (totalCalories >= some) calories = 4;
    else calories = 2;
  }

  const raw = round(taste + convenience + protein + eoe + calories, 1);
  // Deliberately derived from the ROUNDED raw, not the exact component sum:
  // Task 11 renders "{raw}/95 renormalized to {score}/100", so both numbers
  // must come from the same raw or the card contradicts itself (e.g. showing
  // "89.8/95 renormalized to 94/100" when 89.8 × 100 / 95 = 94.5 → 95).
  // Diverges from the exact sum for ~2.6% of values; pinned by the
  // "89.8 raw lands on the core band" test in mealScore.test.ts.
  const score = Math.round((raw * 100) / RAW_MAX);

  const approved =
    prepMinutes <= APPROVED_MAX_PREP_MINUTES &&
    totalProtein >= APPROVED_MIN_PROTEIN_G &&
    (totalCalories >= approvedMinCalories || isBridge) &&
    eoe === COMPONENT_MAX.eoe &&
    taste >= APPROVED_MIN_TASTE &&
    !containsNever;

  return {
    taste,
    convenience,
    protein,
    eoe,
    calories,
    raw,
    score,
    tasteUnknown,
    containsNever,
    approved,
    totalCalories,
    totalProtein,
  };
}
