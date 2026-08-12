// Nutrition OS Phase 1 domain types. Unions mirror the DB CHECK constraints
// (the practical contract, per house convention — see track.ts, crossfit.ts).

export type ConceptRating = "love" | "like" | "neutral" | "dislike" | "never";

export const CONCEPT_RATINGS: ConceptRating[] = [
  "never",
  "dislike",
  "neutral",
  "like",
  "love",
];

export interface FoodConcept {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  rating: ConceptRating;
  requires_small_pieces: boolean;
  prep_intensive: boolean;
  form_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ConceptMatchSource = "seed" | "auto_name_match" | "user";

export interface FoodConceptLink {
  id: string;
  user_id: string;
  concept_id: string;
  saved_food_id: string | null;
  food_inventory_id: string | null;
  matched_by: ConceptMatchSource;
  created_at: string;
}

export interface NutritionVendor {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  app_url: string | null;
  /** Brand mark for the picker tiles; null falls back to a monogram. */
  logo_url: string | null;
  display_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type SpiceTolerance = "none" | "mild" | "medium" | "hot";

export interface NutritionConstraints {
  id: string;
  user_id: string;
  has_eoe: boolean;
  avoids_eating_with_hands: boolean;
  prefers_bowls: boolean;
  spice_tolerance: SpiceTolerance;
  max_prep_minutes: number;
  prefers_small_frequent_meals: boolean;
  max_leftover_hours: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalorieRampLevel {
  id: string;
  user_id: string;
  level: number;
  name: string;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number | null;
  target_fats_g: number | null;
  is_active: boolean;
  started_at: string | null; // local YYYY-MM-DD
  created_at: string;
  updated_at: string;
}
