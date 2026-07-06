import { useState, useEffect } from "react";
import { supabase } from "@/src/lib/supabase";
import { MacroGoals } from "@/src/lib/mealMacros";

export interface MacroGoalsData {
  goals: MacroGoals;
  windowStart: string;
  windowEnd: string;
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
}

// Loads the user's macro targets + eating-window / meal times from their
// profile once on mount. All values are read-only to the caller.
export function useMacroGoals(): MacroGoalsData {
  const [goals, setGoals] = useState<MacroGoals>({
    calories: null,
    protein: null,
    carbs: null,
    sodium_mg: null,
    fats: null,
    sugars: null,
    fiber_g: null,
  });
  const [windowStart, setWindowStart] = useState("08:00");
  const [windowEnd, setWindowEnd] = useState("23:00");
  const [breakfastTime, setBreakfastTime] = useState("08:00");
  const [lunchTime, setLunchTime] = useState("12:00");
  const [dinnerTime, setDinnerTime] = useState("18:00");

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select(
            "target_calories, target_protein_g, target_carbs_g, target_sodium_mg, target_fats_g, target_sugars_g, target_fiber_g, water_window_start, water_window_end, breakfast_time, lunch_time, dinner_time"
          )
          .eq("id", user.id)
          .single();
        if (data) {
          setGoals({
            calories: data.target_calories ?? null,
            protein: data.target_protein_g ?? null,
            carbs: data.target_carbs_g ?? null,
            sodium_mg: data.target_sodium_mg ?? null,
            fats: data.target_fats_g ?? null,
            sugars: data.target_sugars_g ?? null,
            fiber_g: data.target_fiber_g ?? null,
          });
          if (data.water_window_start)
            setWindowStart(String(data.water_window_start).slice(0, 5));
          if (data.water_window_end)
            setWindowEnd(String(data.water_window_end).slice(0, 5));
          if (data.breakfast_time)
            setBreakfastTime(String(data.breakfast_time).slice(0, 5));
          if (data.lunch_time)
            setLunchTime(String(data.lunch_time).slice(0, 5));
          if (data.dinner_time)
            setDinnerTime(String(data.dinner_time).slice(0, 5));
        }
      } catch (error) {
        console.error("Error fetching macro goals:", error);
      }
    })();
  }, []);

  return { goals, windowStart, windowEnd, breakfastTime, lunchTime, dinnerTime };
}
