// mobile/src/types/meal-library.ts
// Row shapes for Nutrition OS Phase 2 (Meal Library). TS unions mirror the
// CHECK constraints in 20260729100000_meal_library_schema.sql — the practical
// enum contract (house convention).
import type { ConceptRating } from "./nutrition-preferences";
import type { BeverageKind, MealType, SavedFood } from "./track";

export type MealCategory =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "dessert"
  | "shake"
  | "emergency"
  | "beverage";

/** Emergency Calories is held ALONE. It is deliberately excluded from ordinary
 *  suggestions, so "this is an emergency meal and also a breakfast" has no
 *  defined meaning for the recommender. Enforced in the database by trigger;
 *  this is the same rule where the UI can act on it. */
export const EXCLUSIVE_CATEGORY: MealCategory = "emergency";

/** A meal is filed under one or more of these, and appears on every shelf it
 *  holds. Returns the set the picker should end up with after `next` is
 *  toggled — the exclusivity rule in one place rather than in each caller. */
export function toggleCategory(
  current: readonly MealCategory[],
  next: MealCategory,
): MealCategory[] {
  if (next === EXCLUSIVE_CATEGORY) {
    // Selecting it clears everything else; tapping it again would leave the
    // meal filed nowhere, so it stays.
    return [EXCLUSIVE_CATEGORY];
  }
  const without = current.filter((c) => c !== next && c !== EXCLUSIVE_CATEGORY);
  if (current.includes(next)) {
    // Never down to nothing: a meal filed nowhere appears on no shelf and the
    // database refuses it at commit.
    return without.length > 0 ? without : current.filter((c) => c === next);
  }
  return [...without, next];
}

/** Library display order: Emergency pinned first (spec §9.1). */
export const CATEGORY_SECTION_ORDER: MealCategory[] = [
  "emergency",
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
  "shake",
  "beverage",
];

export const CATEGORY_LABELS: Record<MealCategory, string> = {
  emergency: "Emergency Calories",
  breakfast: "Breakfasts",
  lunch: "Lunches",
  dinner: "Dinners",
  snack: "Snacks",
  dessert: "Desserts",
  shake: "Shakes",
  beverage: "Beverages",
};

/** Singular, for a chip that files ONE meal rather than a shelf holding many.
 *  "Breakfasts" on a picker would read as a quantity. */
export const CATEGORY_CHIP_LABELS: Record<MealCategory, string> = {
  emergency: "Emergency",
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
  shake: "Shake",
  beverage: "Beverage",
};

/** Picker order — the day, then the two kinds that aren't times of day. */
export const CATEGORY_PICKER_ORDER: MealCategory[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
  "shake",
  "beverage",
  "emergency",
];

/** Tag order on the beverage sheet — the two shakes first, since they are the
 *  reason the split exists. */
export const BEVERAGE_KINDS: BeverageKind[] = [
  "protein_shake",
  "weight_gain_shake",
  "smoothie",
  "energy_drink",
  "other",
];

export const BEVERAGE_KIND_LABELS: Record<BeverageKind, string> = {
  protein_shake: "Protein Shake",
  weight_gain_shake: "Weight Gain Shake",
  smoothie: "Smoothie",
  energy_drink: "Energy Drink",
  other: "Other",
};

/** "Protein Shake · Energy Drink" — the kinds as one caption, in tag order
 *  rather than selection order, so two cards never disagree about the same
 *  pair. */
export function beverageKindsLine(kinds: readonly BeverageKind[]): string {
  return BEVERAGE_KINDS.filter((k) => kinds.includes(k))
    .map((k) => BEVERAGE_KIND_LABELS[k])
    .join(" · ");
}

/**
 * The "Counts as a meal" switch's starting position, from what the drink is:
 * a weight-gain shake replaces a meal, everything else rides along. A DEFAULT
 * only — the switch is always the owner's to flip, and the answer stored on
 * the log is the switch's, never this function's.
 */
export function beverageCountsAsMealDefault(kinds: readonly BeverageKind[]): boolean {
  return kinds.includes("weight_gain_shake");
}

export type MealRole =
  | "pre_workout"
  | "post_workout"
  | "bridge"
  | "calorie_booster"
  | "emergency_catchup";

export const ROLE_LABELS: Record<MealRole, string> = {
  pre_workout: "Pre-Workout",
  post_workout: "Post-Workout",
  bridge: "Bridge",
  calorie_booster: "Calorie Booster",
  emergency_catchup: "Emergency Catch-Up",
};

/** Rail order — the order the builder offers them in and the order the set is
 *  stored and displayed in, so a meal's roles read the same everywhere. */
export const ROLE_ORDER: MealRole[] = [
  "pre_workout",
  "post_workout",
  "bridge",
  "calorie_booster",
  "emergency_catchup",
];

/**
 * A meal can do several jobs, so roles toggle freely — no exclusivity rule and
 * no floor. Unlike categories, the empty set is the ordinary case: most meals
 * are not being held for a particular moment, and forcing a role would make
 * the recommender's "looking for that specific job" question meaningless.
 *
 * The result is kept in `ROLE_ORDER` rather than tap order, so two meals with
 * the same roles always render them the same way round.
 */
export function toggleRole(
  current: readonly MealRole[],
  next: MealRole,
): MealRole[] {
  const set = new Set(current);
  if (!set.delete(next)) set.add(next);
  return ROLE_ORDER.filter((r) => set.has(r));
}

/** Display labels for the logging-slot enum. Lives here beside
 * CATEGORY_LABELS / ROLE_LABELS so every enum these screens render goes
 * through a labels map instead of leaking raw lowercase values into the UI. */
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
  beverage: "Beverage",
};

/** Logging slot when meals.default_meal_type is null (spec §5.1). */
export const CATEGORY_DEFAULT_MEAL_TYPE: Record<MealCategory, MealType> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack",
  dessert: "dessert",
  shake: "snack",
  emergency: "snack",
  beverage: "beverage",
};

export interface Meal {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  /** The PRIMARY category — the single answer the default logging slot needs.
   *  Where the meal is FOUND is `categories`, which always contains this. */
  category: MealCategory;
  /** Every category this meal is filed under; it appears on each one's shelf.
   *  Never empty (database trigger), and holds `emergency` only alone. */
  categories: MealCategory[];
  /** DEPRECATED — the legacy single-role column, kept in sync with the head of
   *  `roles` so nothing reading it breaks, but authoritative for nothing. Read
   *  `roles`; every question anyone asks is "is this role among them". */
  role: MealRole | null;
  /** Every job this meal can do. Empty is ordinary — most meals are not held
   *  for a particular moment. Order is `ROLE_ORDER`. */
  roles: MealRole[];
  default_meal_type: MealType | null;
  prep_minutes: number;
  taste_override: ConceptRating | null;
  /** Sold as one finished portion — a delivered meal rather than something you
   *  assemble. Shifts the calorie band and the Brian Approved bar down one
   *  step, because its size was chosen by whoever made it. */
  is_complete_portion: boolean;
  /** Starred in the library. Its own signal, not a derivative of the Brian
   *  score: "I reach for this" and "this scores well" are different claims. */
  is_favorite: boolean;
  /** Where the meal comes from. `out` meals are never in or out of stock —
   *  see `tracksAvailability`. */
  source_kind: "home" | "packaged" | "out";
  /** Venue or brand as you'd say it ("Thistle", "DoorDash · Chipotle").
   *  Null exactly when `source_kind` is `home` (DB check constraint). */
  source_name: string | null;
  /** The meal's own photograph. Null falls back to an ingredient's — see
   *  `mealFaceUrlFor`. */
  image_primary_url: string | null;
  notes: string | null;
  /** What the drink is, when this entry is one — pre-fills the log sheet's
   *  tags and the counts-as-meal default. Null for food. */
  beverage_kinds: BeverageKind[] | null;
  /** Set by hand from the meal page. A meal is archived when this is set OR
   *  when the retirement rule says so; clearing it hands the meal back to the
   *  automatic rule. */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MealItem {
  id: string;
  user_id: string;
  meal_id: string;
  saved_food_id: string;
  servings: number;
  display_order: number;
  small_pieces_ok: boolean;
  created_at: string;
}

export interface MealItemWithFood extends MealItem {
  savedFood: SavedFood;
}

export interface MealWithItems extends Meal {
  items: MealItemWithFood[];
}

/**
 * The slot a meal logs into by default (spec §5.1). Lives here, not in
 * `lib/supabase/mealLibrary.ts`: it is pure, its only dependency is
 * CATEGORY_DEFAULT_MEAL_TYPE in this file, and its callers are
 * presentational components that must not pull the Supabase client singleton
 * into their import graph for a two-line lookup. Single home — deliberately
 * NOT re-exported from the query module.
 */
export function defaultMealTypeFor(meal: Meal): MealType {
  return meal.default_meal_type ?? CATEGORY_DEFAULT_MEAL_TYPE[meal.category];
}

/** Computed from items — never stored (Concept Map hazard #1). */
export interface MealTotals {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  sugars: number;
  saturated_fat_g: number;
  sodium_mg: number;
  fiber_g: number;
}
