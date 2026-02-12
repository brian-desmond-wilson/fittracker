import { NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/supabase/admin";

interface DailyBreakdown {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface NutritionSummaryResponse {
  period: {
    start: string;
    end: string;
    daysTracked: number;
  };
  averages: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  targets: {
    calories: number;
    protein: number;
  };
  compliance: {
    calories: number;
    protein: number;
  };
  trend: {
    calories: "increasing" | "decreasing" | "stable";
    protein: "increasing" | "decreasing" | "stable";
  };
  dailyBreakdown: DailyBreakdown[];
}

const DEFAULT_TARGETS = {
  calories: 2400,
  protein: 180,
};

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireAdmin();
    const { searchParams } = new URL(request.url);

    const days = parseInt(searchParams.get("days") || "7", 10);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get user's targets
    const { data: profile } = await supabase
      .from("profiles")
      .select("nutrition_targets")
      .eq("id", user.id)
      .single();

    const targets = profile?.nutrition_targets || DEFAULT_TARGETS;

    // Get daily aggregates using the view
    const { data: dailySummaries, error } = await supabase
      .from("daily_nutrition_summary")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", startDateStr)
      .lte("date", endDateStr)
      .order("date", { ascending: true });

    if (error) {
      // Fallback if view doesn't exist - aggregate manually
      const { data: mealLogs } = await supabase
        .from("meal_logs")
        .select("date, calories, protein, carbs, fats")
        .eq("user_id", user.id)
        .gte("date", startDateStr)
        .lte("date", endDateStr)
        .order("date", { ascending: true });

      // Group by date
      const byDate: Record<string, DailyBreakdown> = {};
      for (const log of mealLogs || []) {
        if (!byDate[log.date]) {
          byDate[log.date] = { date: log.date, calories: 0, protein: 0, carbs: 0, fat: 0 };
        }
        byDate[log.date].calories += log.calories || 0;
        byDate[log.date].protein += log.protein || 0;
        byDate[log.date].carbs += log.carbs || 0;
        byDate[log.date].fat += log.fats || 0;
      }

      const dailyBreakdown = Object.values(byDate);
      return buildResponse(dailyBreakdown, days, startDateStr, endDateStr, targets);
    }

    const dailyBreakdown: DailyBreakdown[] = (dailySummaries || []).map((d) => ({
      date: d.date,
      calories: d.total_calories || 0,
      protein: d.total_protein || 0,
      carbs: d.total_carbs || 0,
      fat: d.total_fats || 0,
    }));

    return buildResponse(dailyBreakdown, days, startDateStr, endDateStr, targets);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch nutrition summary:", error);
    return NextResponse.json({ error: "Failed to fetch nutrition summary" }, { status: 500 });
  }
}

function buildResponse(
  dailyBreakdown: DailyBreakdown[],
  days: number,
  startDateStr: string,
  endDateStr: string,
  targets: { calories: number; protein: number }
): Response {
  const daysTracked = dailyBreakdown.length;

  // Calculate averages
  const totals = dailyBreakdown.reduce(
    (acc, d) => ({
      calories: acc.calories + d.calories,
      protein: acc.protein + d.protein,
      carbs: acc.carbs + d.carbs,
      fat: acc.fat + d.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const averages = {
    calories: daysTracked ? Math.round(totals.calories / daysTracked) : 0,
    protein: daysTracked ? Math.round(totals.protein / daysTracked) : 0,
    carbs: daysTracked ? Math.round(totals.carbs / daysTracked) : 0,
    fat: daysTracked ? Math.round(totals.fat / daysTracked) : 0,
  };

  // Calculate compliance (days meeting target / total days)
  const calorieCompliantDays = dailyBreakdown.filter(
    (d) => d.calories >= targets.calories * 0.9
  ).length;
  const proteinCompliantDays = dailyBreakdown.filter(
    (d) => d.protein >= targets.protein * 0.9
  ).length;

  // Calculate trends (compare first half vs second half)
  let calorieTrend: "increasing" | "decreasing" | "stable" = "stable";
  let proteinTrend: "increasing" | "decreasing" | "stable" = "stable";

  if (dailyBreakdown.length >= 4) {
    const half = Math.floor(dailyBreakdown.length / 2);
    const firstHalf = dailyBreakdown.slice(0, half);
    const secondHalf = dailyBreakdown.slice(half);

    const firstCalAvg = firstHalf.reduce((a, d) => a + d.calories, 0) / half;
    const secondCalAvg = secondHalf.reduce((a, d) => a + d.calories, 0) / secondHalf.length;

    if (secondCalAvg > firstCalAvg * 1.05) calorieTrend = "increasing";
    else if (secondCalAvg < firstCalAvg * 0.95) calorieTrend = "decreasing";

    const firstProtAvg = firstHalf.reduce((a, d) => a + d.protein, 0) / half;
    const secondProtAvg = secondHalf.reduce((a, d) => a + d.protein, 0) / secondHalf.length;

    if (secondProtAvg > firstProtAvg * 1.05) proteinTrend = "increasing";
    else if (secondProtAvg < firstProtAvg * 0.95) proteinTrend = "decreasing";
  }

  const response: NutritionSummaryResponse = {
    period: {
      start: startDateStr,
      end: endDateStr,
      daysTracked,
    },
    averages,
    targets,
    compliance: {
      calories: daysTracked ? Math.round((calorieCompliantDays / daysTracked) * 100) / 100 : 0,
      protein: daysTracked ? Math.round((proteinCompliantDays / daysTracked) * 100) / 100 : 0,
    },
    trend: {
      calories: calorieTrend,
      protein: proteinTrend,
    },
    dailyBreakdown,
  };

  return NextResponse.json(response);
}
