export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  height_cm: number | null;
  target_weight_kg: number | null;
  target_calories: number | null;
  created_at: string;
  updated_at: string;
}

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  workout_type: string | null;
  duration_minutes: number | null;
  calories_burned: number | null;
  notes: string | null;
  completed_at: string;
  created_at: string;
}

export interface Exercise {
  id: string;
  workout_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  weight_kg: number | null;
  notes: string | null;
  created_at: string;
}

export interface NutritionLog {
  id: string;
  user_id: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  food_name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  logged_at: string;
  created_at: string;
}

export interface WeightLog {
  id: string;
  user_id: string;
  weight_kg: number;
  notes: string | null;
  logged_at: string;
  created_at: string;
}

export interface WaterLog {
  id: string;
  user_id: string;
  amount_ml: number;
  logged_at: string;
  created_at: string;
}

export type WorkoutType =
  | "strength"
  | "cardio"
  | "flexibility"
  | "sports"
  | "other";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
