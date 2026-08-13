import type { AccentKey } from "@/src/theme/tokens";

// Food Inventory Types
export type FoodLocation = "fridge" | "freezer" | "pantry" | "cabinet";
export type StorageType = "single-location" | "multi-location";

export interface FoodInventoryItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  unit: string;
  brand: string | null;
  flavor: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  /** Grams per serving. Feeds the Nutrition Facts panel — daily totals still
   *  come from `saved_foods` via meal logs, so this is a display figure. */
  fiber_g: number | null;
  serving_size: string | null;
  expiration_date: string | null; // YYYY-MM-DD
  location: FoodLocation | null;
  restock_threshold: number;
  barcode: string | null;
  image_primary_url: string | null;
  image_front_url: string | null;
  image_back_url: string | null;
  image_side_url: string | null;
  notes: string | null;
  preferred_vendor_id: string | null;
  storage_type: StorageType;
  requires_refrigeration: boolean;
  fridge_restock_threshold: number | null;
  total_restock_threshold: number | null;
  created_at: string;
  updated_at: string;
  /** D6 freshness signal: the last time a verb attested this row is real.
   *  Nullable for rows written before the column landed. */
  last_verified_at: string | null;
  /** True when stock arrives on a delivery cadence rather than being bought
   *  when it runs low — a Thistle meal, not a jar of peanut butter. Every
   *  restock signal is a false one for these, so the demand engine, the
   *  shopping list and the run-out estimate all stand down. */
  is_scheduled_supply: boolean;
}

export interface FoodInventoryLocation {
  id: string;
  food_inventory_id: string;
  user_id: string;
  location: FoodLocation;
  quantity: number;
  is_ready_to_consume: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// `FoodInventoryItemWithLocations` / `FoodInventoryItemWithCategories` used to
// live here. They mirrored the shape of a stock view that Phase 4 drops
// (20260730100000), carrying three denormalised quantity fields. The
// replacement is `InventoryItemWithState` in `lib/supabase/inventory.ts`: one
// `state: ItemStockState` projected from the location rows, which are the only
// quantity truth. Deleted once the last reader moved to `state.*`.

// Major food categories (12 main categories)
export interface FoodCategory {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  created_at: string;
}

// Subcategories for each major category
export interface FoodSubcategory {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  display_order: number;
  created_at: string;
}

export type ShoppingListPriority = 1 | 2 | 3; // 1=high, 2=medium, 3=low

export interface ShoppingListItem {
  id: string;
  user_id: string;
  food_inventory_id: string | null;
  vendor_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  priority: ShoppingListPriority;
  is_purchased: boolean;
  notes: string | null;
  created_at: string;
  purchased_at: string | null;
}

// Meal & Nutrition Types
export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "dessert";

export interface InventoryUsage {
  id: string;
  quantity: number;
}

export interface MealLog {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  meal_type: MealType;
  name: string;
  calories: number | null;
  protein: number | null; // grams
  carbs: number | null; // grams
  fats: number | null; // grams
  sugars: number | null; // grams
  sodium_mg: number | null; // milligrams
  fiber_g: number | null; // grams
  uses_inventory: boolean;
  inventory_items: InventoryUsage[] | null;
  saved_food_id: string | null; // Link to saved_foods table
  meal_id: string | null; // Link to meals (Meal Library provenance)
  servings: number; // Serving multiplier (e.g., 0.5, 1.0, 2.0)
  logged_at: string;
}

// Saved Foods (Personal Food Library) - for quick meal logging
export interface SavedFood {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
  serving_size: string | null;
  image_primary_url: string | null;
  image_front_url: string | null;
  image_back_url: string | null;
  is_favorite: boolean;
  user_corrected: boolean;
  auto_scaled: boolean;
  created_at: string;
  updated_at: string;
}

// Recent food item with usage frequency
export interface RecentFoodItem {
  savedFood: SavedFood;
  logCount: number;
  lastLoggedAt: string;
}

// Water Intake Types
export type WaterBeverageType = "water" | "coffee" | "tea" | "juice" | "other";

export interface WaterLog {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  amount_oz: number;
  logged_at: string; // Full timestamp
  beverage_type: WaterBeverageType;
}

// Weight Tracking Types
export type TimeOfDay = "morning" | "evening";

export interface WeightLog {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  weight_lbs: number;
  time_of_day: TimeOfDay | null;
  logged_at: string;
}

// Body Measurements Types
export interface BodyMeasurement {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  biceps_inches: number | null;
  chest_inches: number | null;
  waist_inches: number | null;
  hips_inches: number | null;
  thighs_inches: number | null;
  calves_inches: number | null;
  logged_at: string;
}

// Progress Photos Types
export type ViewType = "front" | "side" | "back";

export interface ProgressPhoto {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  photo_url: string;
  view_type: ViewType | null;
  notes: string | null;
  created_at: string;
}

// Workout Logging Types
export type WorkoutType = "bodybuilding" | "crossfit" | "cardio" | "other";

export interface Exercise {
  name: string;
  sets: number;
  reps: number;
  weight: number; // lbs
  notes?: string;
}

export interface WorkoutLog {
  id: string;
  user_id: string;
  schedule_event_id: string | null; // Links to schedule_events table
  date: string; // YYYY-MM-DD
  workout_type: WorkoutType;
  name: string;
  planned_start_time: string | null; // HH:MM:SS
  planned_end_time: string | null; // HH:MM:SS
  actual_start_time: string | null; // HH:MM:SS
  actual_end_time: string | null; // HH:MM:SS
  exercises: Exercise[];
  notes: string | null;
  logged_at: string;
}

// Tracking Category Configuration
export type TrackingCategory =
  // Each id doubles as the hub tile's route segment (`/(tabs)/track/<id>`),
  // so renaming a route means renaming its id here.
  | "fuel"
  | "meal-library"
  | "water"
  | "food-inventory"
  | "weight"
  | "measurements"
  | "photos"
  | "workouts"
  | "shopping";

export interface TrackingCategoryConfig {
  id: TrackingCategory;
  title: string;
  icon: string; // Lucide icon name
  /** Identity accent key — supplies both the tile's tint fill and its glyph color. */
  accent: AccentKey;
  section: "nutrition" | "body" | "activity";
}
