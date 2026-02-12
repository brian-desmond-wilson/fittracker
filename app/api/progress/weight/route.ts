import { NextResponse } from "next/server";
import { requireMurphyAuth, MurphyAuthError } from "@/lib/supabase/murphy-auth";

interface WeightEntry {
  date: string;
  weight: number;
}

interface WeightProgressResponse {
  current: {
    weight: number;
    date: string;
    unit: string;
  } | null;
  history: WeightEntry[];
  stats: {
    startWeight: number;
    startDate: string;
    change: number;
    changePercent: number;
    trend: "increasing" | "decreasing" | "stable";
    avgWeeklyChange: number;
  } | null;
  goal: {
    target: number;
    remaining: number;
    estimatedDate: string | null;
  } | null;
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireMurphyAuth(request);
    const { searchParams } = new URL(request.url);

    const days = parseInt(searchParams.get("days") || "30", 10);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const startDateStr = startDate.toISOString().split("T")[0];

    // Get weight logs in date range
    const { data: weightLogs, error } = await supabase
      .from("weight_logs")
      .select("date, weight_lbs")
      .eq("user_id", userId)
      .gte("date", startDateStr)
      .order("date", { ascending: false });

    if (error) {
      console.error("Error fetching weight logs:", error);
      return NextResponse.json({ error: "Failed to fetch weight data" }, { status: 500 });
    }

    if (!weightLogs || weightLogs.length === 0) {
      return NextResponse.json({
        current: null,
        history: [],
        stats: null,
        goal: null,
      } as WeightProgressResponse);
    }

    const history: WeightEntry[] = weightLogs.map((log) => ({
      date: log.date,
      weight: log.weight_lbs,
    }));

    const current = {
      weight: weightLogs[0].weight_lbs,
      date: weightLogs[0].date,
      unit: "lbs",
    };

    // Get earliest weight for stats
    const { data: earliestWeight } = await supabase
      .from("weight_logs")
      .select("date, weight_lbs")
      .eq("user_id", userId)
      .order("date", { ascending: true })
      .limit(1)
      .single();

    // Get user's weight goal from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("weight_goal")
      .eq("id", userId)
      .single();

    // Calculate stats
    let stats: WeightProgressResponse["stats"] = null;
    if (earliestWeight && weightLogs.length > 1) {
      const startWeight = earliestWeight.weight_lbs;
      const currentWeight = current.weight;
      const change = currentWeight - startWeight;
      const changePercent = (change / startWeight) * 100;

      // Calculate weeks between dates
      const startDateObj = new Date(earliestWeight.date);
      const endDateObj = new Date(current.date);
      const weeksDiff = Math.max(1, (endDateObj.getTime() - startDateObj.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const avgWeeklyChange = change / weeksDiff;

      // Calculate trend from recent data
      let trend: "increasing" | "decreasing" | "stable" = "stable";
      if (history.length >= 4) {
        const recentAvg = (history[0].weight + history[1].weight) / 2;
        const olderAvg = (history[2].weight + history[3].weight) / 2;
        if (recentAvg > olderAvg * 1.005) trend = "increasing";
        else if (recentAvg < olderAvg * 0.995) trend = "decreasing";
      }

      stats = {
        startWeight,
        startDate: earliestWeight.date,
        change: Math.round(change * 10) / 10,
        changePercent: Math.round(changePercent * 10) / 10,
        trend,
        avgWeeklyChange: Math.round(avgWeeklyChange * 10) / 10,
      };
    }

    // Build goal info
    let goal: WeightProgressResponse["goal"] = null;
    if (profile?.weight_goal && stats) {
      const target = profile.weight_goal;
      const remaining = current.weight - target;

      // Estimate date based on weekly change rate
      let estimatedDate: string | null = null;
      if (stats.avgWeeklyChange !== 0 && Math.sign(remaining) !== Math.sign(stats.avgWeeklyChange)) {
        const weeksToGoal = Math.abs(remaining / stats.avgWeeklyChange);
        const estimatedDateObj = new Date();
        estimatedDateObj.setDate(estimatedDateObj.getDate() + weeksToGoal * 7);
        estimatedDate = estimatedDateObj.toISOString().split("T")[0];
      }

      goal = {
        target,
        remaining: Math.round(remaining * 10) / 10,
        estimatedDate,
      };
    }

    const response: WeightProgressResponse = {
      current,
      history,
      stats,
      goal,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof MurphyAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch weight progress:", error);
    return NextResponse.json({ error: "Failed to fetch weight data" }, { status: 500 });
  }
}
