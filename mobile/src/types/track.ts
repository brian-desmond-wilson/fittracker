// Food Inventory Types
export type FoodLocation = "fridge" | "freezer" | "pantry" | "cabinet";
export type StorageType = "single-location" | "multi-location";

export interface FoodInventoryItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string | null;
  brand: string | null;
  flavor: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
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
  storage_type: StorageType;
  requires_refrigeration: boolean;
  fridge_restock_threshold: number | null;
  total_restock_threshold: number | null;
  created_at: string;
  updated_at: string;
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

export interface FoodInventoryItemWithLocations extends Omit<FoodInventoryItem, 'quantity' | 'location'> {
  locations: FoodInventoryLocation[];
  total_quantity: number;
  ready_quantity: number;
  storage_quantity: number;
}

export interface FoodCategory {
  id: string;
  user_id: string;
  name: string;
  icon: string | null; // Lucide icon name
  color: string | null; // Hex color
  is_default: boolean;
  created_at: string;
}

export type ShoppingListPriority = 1 | 2 | 3; // 1=high, 2=medium, 3=low

export interface ShoppingListItem {
  id: string;
  user_id: string;
  food_inventory_id: string | null;
  name: string;
  quantity: number;
  unit: string;
  category: string | null;
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
  uses_inventory: boolean;
  inventory_items: InventoryUsage[] | null;
  logged_at: string;
}

// Water Intake Types
export interface WaterLog {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  amount_oz: number;
  logged_at: string; // Full timestamp
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

// Sleep Tracking Types
export interface SleepLog {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD (date went to bed)
  bedtime: string; // Full timestamp
  wake_time: string; // Full timestamp
  hours_slept: number; // Calculated field
  quality_rating: number | null; // 1-5
  notes: string | null;
  logged_at: string;
}

// Tracking Category Configuration
export type TrackingCategory =
  | "meals"
  | "water"
  | "food-inventory"
  | "weight"
  | "measurements"
  | "photos"
  | "workouts"
  | "sleep";

export interface TrackingCategoryConfig {
  id: TrackingCategory;
  title: string;
  icon: string; // Lucide icon name
  iconColor: string;
  backgroundColor: string;
  section: "nutrition" | "body" | "activity";
}
