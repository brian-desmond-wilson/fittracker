// mobile/src/types/meal-library.ts
// Row shapes for Nutrition OS Phase 2 (Meal Library). TS unions mirror the
// CHECK constraints in 20260729100000_meal_library_schema.sql — the practical
// enum contract (house convention).
import type { ConceptRating } from "./nutrition-preferences";
import type { MealType, SavedFood } from "./track";

export type MealCategory =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "shake"
  | "emergency";

/** Library display order: Emergency pinned first (spec §9.1). */
export const CATEGORY_SECTION_ORDER: MealCategory[] = [
  "emergency",
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "shake",
];

export const CATEGORY_LABELS: Record<MealCategory, string> = {
  emergency: "Emergency Calories",
  breakfast: "Breakfasts",
  lunch: "Lunches",
  dinner: "Dinners",
  snack: "Snacks",
  shake: "Shakes",
};

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

/** Display labels for the logging-slot enum. Lives here beside
 * CATEGORY_LABELS / ROLE_LABELS so every enum these screens render goes
 * through a labels map instead of leaking raw lowercase values into the UI. */
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
};

/** Logging slot when meals.default_meal_type is null (spec §5.1). */
export const CATEGORY_DEFAULT_MEAL_TYPE: Record<MealCategory, MealType> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack",
  shake: "snack",
  emergency: "snack",
};

export interface Meal {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  category: MealCategory;
  role: MealRole | null;
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
  notes: string | null;
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
  sodium_mg: number;
  fiber_g: number;
}
