import { NextResponse } from "next/server";
import { requireMurphyAuth, MurphyAuthError } from "@/lib/supabase/murphy-auth";

interface StatsSummaryResponse {
  period: string;
  periodStart: string;
  periodEnd: string;
  workouts: {
    completed: number;
    scheduled: number;
    consistency: number;
  };
  volume: {
    total: number;
    avgPerWorkout: number;
  };
  program: {
    name: string;
    status: string;
    cycle: number;
    currentDay: number;
    totalDays: number;
    percentComplete: number;
  } | null;
  streak: {
    current: number;
    longest: number;
  };
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireMurphyAuth(request);
    const { searchParams } = new URL(request.url);

    const period = searchParams.get("period") || "week";

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    let endDate = now;

    switch (period) {
      case "month":
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "program":
        // Will be set below based on active program
        startDate = new Date(now);
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case "all":
        startDate = new Date("2020-01-01");
        break;
      case "week":
      default:
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        break;
    }

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get active program
    const { data: programInstance } = await supabase
      .from("program_instances")
      .select(`
        id,
        status,
        current_cycle,
        started_at,
        program_templates (
          name,
          total_days
        )
      `)
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    // Adjust date range for program period
    if (period === "program" && programInstance?.started_at) {
      startDate = new Date(programInstance.started_at);
    }

    // Get completed workouts in period
    const { data: completedWorkouts, count: completedCount } = await supabase
      .from("workout_instances")
      .select("id, completed_at", { count: "exact" })
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", startDateStr)
      .lte("completed_at", endDateStr);

    // Get scheduled workouts in period (for consistency calculation)
    const { count: scheduledCount } = await supabase
      .from("workout_instances")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("scheduled_date", startDateStr)
      .lte("scheduled_date", endDateStr);

    // Calculate total volume
    let totalVolume = 0;
    for (const workout of completedWorkouts || []) {
      const { data: exerciseInstances } = await supabase
        .from("exercise_instances")
        .select("id")
        .eq("workout_instance_id", workout.id);

      for (const ei of exerciseInstances || []) {
        const { data: sets } = await supabase
          .from("set_instances")
          .select("actual_weight_lbs, actual_reps")
          .eq("exercise_instance_id", ei.id)
          .eq("is_warmup", false)
          .not("actual_weight_lbs", "is", null);

        for (const set of sets || []) {
          totalVolume += (set.actual_weight_lbs || 0) * (set.actual_reps || 0);
        }
      }
    }

    // Calculate workout streak
    const { data: allCompletedWorkouts } = await supabase
      .from("workout_instances")
      .select("completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false });

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate: Date | null = null;

    for (const workout of allCompletedWorkouts || []) {
      const workoutDate = new Date(workout.completed_at);
      workoutDate.setHours(0, 0, 0, 0);

      if (!lastDate) {
        // Check if most recent workout was today or yesterday
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today.getTime() - workoutDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 1) {
          currentStreak = 1;
          tempStreak = 1;
        }
      } else {
        const diffDays = Math.floor((lastDate.getTime() - workoutDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 2) {
          // Within 2 days counts as streak (allows rest days)
          tempStreak++;
          if (currentStreak > 0) {
            currentStreak = tempStreak;
          }
        } else {
          if (tempStreak > longestStreak) {
            longestStreak = tempStreak;
          }
          tempStreak = 1;
        }
      }
      lastDate = workoutDate;
    }
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }

    // Build program info
    let programInfo: StatsSummaryResponse["program"] = null;
    if (programInstance) {
      const template = programInstance.program_templates as unknown as {
        name: string;
        total_days: number;
      };

      const { count: programCompleted } = await supabase
        .from("workout_instances")
        .select("*", { count: "exact", head: true })
        .eq("program_instance_id", programInstance.id)
        .eq("status", "completed");

      const currentDay = (programCompleted || 0) + 1;
      const totalDays = template?.total_days || 1;

      programInfo = {
        name: template?.name || "Unknown",
        status: programInstance.status,
        cycle: programInstance.current_cycle,
        currentDay,
        totalDays,
        percentComplete: Math.round((currentDay / totalDays) * 100) / 100,
      };
    }

    const response: StatsSummaryResponse = {
      period,
      periodStart: startDateStr,
      periodEnd: endDateStr,
      workouts: {
        completed: completedCount || 0,
        scheduled: scheduledCount || 0,
        consistency: scheduledCount ? Math.round(((completedCount || 0) / scheduledCount) * 100) / 100 : 0,
      },
      volume: {
        total: totalVolume,
        avgPerWorkout: completedCount ? Math.round(totalVolume / completedCount) : 0,
      },
      program: programInfo,
      streak: {
        current: currentStreak,
        longest: longestStreak,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof MurphyAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch stats summary:", error);
    return NextResponse.json({ error: "Failed to fetch stats summary" }, { status: 500 });
  }
}
