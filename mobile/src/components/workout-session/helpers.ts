import { Dimensions } from "react-native";
import { supabase } from "@/src/lib/supabase";
import { Exercise, ProgramWorkoutExercise } from "./types";

export const SCREEN_WIDTH = Dimensions.get("window").width;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

// Local date string (YYYY-MM-DD) — avoids UTC timezone issues.
export function getLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

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

// Generate an exercise image via the generate-exercise-image Edge Function.
export async function generateExerciseImage(
  exerciseId: string,
  userId: string
): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/generate-exercise-image`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ exerciseId, userId }),
      }
    );

    const data = await response.json();
    console.log("Image generation response:", data);

    if (data.success && data.imageUrl) {
      return data.imageUrl;
    }
    console.error("Image generation failed:", data.error || data);
    return null;
  } catch (err) {
    console.error("Image generation error:", err);
    return null;
  }
}
