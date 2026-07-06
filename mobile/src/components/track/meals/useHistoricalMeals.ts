import { useState, useEffect, useCallback } from "react";
import { MealLog } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "./mealsHelpers";

// Last 365 days of meal logs, used for insights (streaks / charts / weekly
// summary / CSV export). Call `refreshHistory` after a write to refetch;
// plain date navigation should NOT trigger a refetch.
export function useHistoricalMeals() {
  const [historicalLogs, setHistoricalLogs] = useState<MealLog[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const fetchHistoricalLogs = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 365);
      const cutoffStr = getLocalDateString(cutoff);
      const { data, error } = await supabase
        .from("meal_logs")
        .select(
          "id, user_id, date, meal_type, name, calories, protein, carbs, fats, sugars, sodium_mg, fiber_g, logged_at, saved_food_id, meal_template_id, servings, uses_inventory, inventory_items"
        )
        .eq("user_id", user.id)
        .gte("date", cutoffStr);
      if (error) throw error;
      setHistoricalLogs((data ?? []) as MealLog[]);
    } catch (error) {
      console.error("Error fetching historical meals:", error);
    }
  }, []);

  useEffect(() => {
    fetchHistoricalLogs();
  }, [fetchHistoricalLogs, historyVersion]);

  const refreshHistory = useCallback(() => setHistoryVersion((v) => v + 1), []);

  return { historicalLogs, refreshHistory };
}
