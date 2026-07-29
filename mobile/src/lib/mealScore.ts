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

const RAW_MAX = 95;
const PREP_INTENSIVE_PENALTY = 3;
const EOE_PENALTY_PER_ITEM = 5;
const APPROVED_MAX_PREP_MINUTES = 10;
const APPROVED_MIN_PROTEIN_G = 30;
const APPROVED_MIN_CALORIES = 500;
const APPROVED_MIN_TASTE = RATING_POINTS.like;
const BRIDGE_CAL_MIN = 250;
const BRIDGE_CAL_MAX = 400;

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
  role: MealRole | null;
  tasteOverride: ConceptRating | null;
  items: ScoreItemInput[];
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
  const { prepMinutes, role, tasteOverride, items } = input;

  const totalCalories = items.reduce(
    (sum, it) => sum + it.servings * (it.calories ?? 0),
    0,
  );
  const totalProtein = items.reduce(
    (sum, it) => sum + it.servings * (it.protein ?? 0),
    0,
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
    taste = 15; // neutral placeholder — surfaced via the flag, not hidden
    tasteUnknown = true;
  } else {
    const itemPoints = (it: ScoreItemInput) =>
      it.concepts.reduce((s, c) => s + RATING_POINTS[c.rating], 0) /
      it.concepts.length;
    const totalWeight = linked.reduce(
      (s, it) => s + it.servings * (it.calories ?? 0),
      0,
    );
    if (totalWeight > 0) {
      taste =
        linked.reduce(
          (s, it) => s + it.servings * (it.calories ?? 0) * itemPoints(it),
          0,
        ) / totalWeight;
    } else {
      // All linked items lack calorie data — weighting is meaningless, so
      // fall back to the unweighted average rather than divide by zero.
      taste = linked.reduce((s, it) => s + itemPoints(it), 0) / linked.length;
    }
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
  const eoe = Math.max(0, 15 - EOE_PENALTY_PER_ITEM * unaddressed);

  // ── Calories /10 ──
  let calories: number;
  if (role === "bridge") {
    calories =
      totalCalories >= BRIDGE_CAL_MIN && totalCalories <= BRIDGE_CAL_MAX
        ? 10
        : 4;
  } else if (totalCalories >= 500) calories = 10;
  else if (totalCalories >= 400) calories = 7;
  else if (totalCalories >= 300) calories = 4;
  else calories = 2;

  const raw = taste + convenience + protein + eoe + calories;
  const score = Math.round((raw * 100) / RAW_MAX);

  const approved =
    prepMinutes <= APPROVED_MAX_PREP_MINUTES &&
    totalProtein >= APPROVED_MIN_PROTEIN_G &&
    (totalCalories >= APPROVED_MIN_CALORIES || role === "bridge") &&
    eoe === 15 &&
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
