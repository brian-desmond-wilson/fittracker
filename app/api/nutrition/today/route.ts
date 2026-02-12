import { NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/supabase/admin";

interface MealItem {
  name: string;
  calories: number;
}

interface Meal {
  id: string;
  name: string;
  time: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  items: MealItem[];
}

interface NutritionTodayResponse {
  date: string;
  meals: Meal[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  remaining: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  percentComplete: {
    calories: number;
    protein: number;
  };
}

// Default targets (could be moved to user profile later)
const DEFAULT_TARGETS = {
  calories: 2400,
  protein: 180,
  carbs: 250,
  fat: 80,
};

export async function GET() {
  try {
    const { supabase, user } = await requireAdmin();

    const today = new Date().toISOString().split("T")[0];

    // Get user's nutrition targets from profile (if they exist)
    const { data: profile } = await supabase
      .from("profiles")
      .select("nutrition_targets")
      .eq("id", user.id)
      .single();

    const targets = profile?.nutrition_targets || DEFAULT_TARGETS;

    // Get today's meals
    const { data: mealLogs, error } = await supabase
      .from("meal_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today)
      .order("logged_at", { ascending: true });

    if (error) {
      console.error("Error fetching meals:", error);
      return NextResponse.json({ error: "Failed to fetch meals" }, { status: 500 });
    }

    const meals: Meal[] = [];
    const totals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };

    // Map meal_type to display name
    const mealTypeNames: Record<string, string> = {
      breakfast: "Breakfast",
      lunch: "Lunch",
      dinner: "Dinner",
      snack: "Snack",
      dessert: "Dessert",
    };

    for (const log of mealLogs || []) {
      const calories = log.calories || 0;
      const protein = log.protein || 0;
      const carbs = log.carbs || 0;
      const fat = log.fats || 0;

      totals.calories += calories;
      totals.protein += protein;
      totals.carbs += carbs;
      totals.fat += fat;

      // Parse time from logged_at
      const loggedAt = new Date(log.logged_at);
      const time = loggedAt.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      meals.push({
        id: log.id,
        name: mealTypeNames[log.meal_type] || log.meal_type,
        time,
        calories,
        protein,
        carbs,
        fat,
        items: [{ name: log.name, calories }],
      });
    }

    const remaining = {
      calories: Math.max(0, targets.calories - totals.calories),
      protein: Math.max(0, targets.protein - totals.protein),
      carbs: Math.max(0, targets.carbs - totals.carbs),
      fat: Math.max(0, targets.fat - totals.fat),
    };

    const response: NutritionTodayResponse = {
      date: today,
      meals,
      totals,
      targets,
      remaining,
      percentComplete: {
        calories: Math.round((totals.calories / targets.calories) * 100) / 100,
        protein: Math.round((totals.protein / targets.protein) * 100) / 100,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch today's nutrition:", error);
    return NextResponse.json({ error: "Failed to fetch nutrition data" }, { status: 500 });
  }
}
