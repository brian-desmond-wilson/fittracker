import { Dimensions } from "react-native";
import { Exercise, ProgramWorkoutExercise } from "./types";

export const SCREEN_WIDTH = Dimensions.get("window").width;

// Local date string (YYYY-MM-DD) — avoids UTC timezone issues.
/** Re-exported from the date lib, which is where this lives now. */
export { getLocalDateString } from "@/src/lib/dates";

// Difficulty color scale: green (easy) → red (very hard).
export const DIFFICULTY_COLORS: Record<string, string> = {
  e: "#22c55e", // green
  em: "#a3e635", // lime-green
  m: "#facc15", // yellow
  mh: "#fb923c", // orange
  h: "#f87171", // light red
  vh: "#b91c1c", // dark red
};

export const getDifficultyColor = (difficulty: string | null): string => {
  if (!difficulty) return "#6b7280"; // gray default
  return DIFFICULTY_COLORS[difficulty] || "#6b7280";
};

export const DIFFICULTY_OPTIONS = ["e", "em", "m", "mh", "h", "vh"];

// Resolve the exercise from the nested Supabase relation (may be array or object).
export function getExercise(pwe: ProgramWorkoutExercise): Exercise {
  if (Array.isArray(pwe.exercises)) {
    return pwe.exercises[0] || { id: "", name: "Unknown", image_url: null };
  }
  return pwe.exercises;
}

// Generate an exercise image — lives with the other catalog image code now.
export { generateExerciseImage } from "@/src/lib/supabase/exerciseImages";
