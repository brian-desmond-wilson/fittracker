import { NextResponse } from "next/server";
import { requireMurphyAuth, MurphyAuthError } from "@/lib/supabase/murphy-auth";

interface ExerciseSummary {
  name: string;
  sets: number;
  topSet: string;
}

interface WorkoutSummary {
  id: string;
  date: string;
  name: string;
  dayNumber: number;
  status: string;
  duration: string | null;
  exerciseCount: number;
  totalSets: number;
  totalVolume: number;
  exercises: ExerciseSummary[];
}

interface WorkoutHistoryResponse {
  workouts: WorkoutSummary[];
  summary: {
    totalWorkouts: number;
    periodDays: number;
  };
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireMurphyAuth(request);
    const { searchParams } = new URL(request.url);

    const days = parseInt(searchParams.get("days") || "7", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const programInstanceId = searchParams.get("program_instance_id");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split("T")[0];

    let query = supabase
      .from("workout_instances")
      .select(`
        id,
        day_number,
        status,
        scheduled_date,
        started_at,
        completed_at,
        program_instance_id,
        program_workouts (name)
      `)
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", startDateStr)
      .order("completed_at", { ascending: false })
      .limit(limit);

    if (programInstanceId) {
      query = query.eq("program_instance_id", programInstanceId);
    }

    const { data: workouts, error } = await query;

    if (error) {
      console.error("Error fetching workout history:", error);
      return NextResponse.json({ error: "Failed to fetch workout history" }, { status: 500 });
    }

    const workoutSummaries: WorkoutSummary[] = [];

    for (const workout of workouts || []) {
      // Get exercise instances with sets
      const { data: exerciseInstances } = await supabase
        .from("exercise_instances")
        .select(`
          id,
          exercises (name)
        `)
        .eq("workout_instance_id", workout.id)
        .order("exercise_order", { ascending: true });

      const exercises: ExerciseSummary[] = [];
      let totalSets = 0;
      let totalVolume = 0;

      for (const ei of exerciseInstances || []) {
        const { data: sets } = await supabase
          .from("set_instances")
          .select("actual_weight_lbs, actual_reps")
          .eq("exercise_instance_id", ei.id)
          .eq("is_warmup", false)
          .not("actual_weight_lbs", "is", null);

        if (sets && sets.length > 0) {
          // Find top set (highest weight × reps product)
          let topSet = sets[0];
          let maxProduct = 0;
          
          for (const set of sets) {
            const product = (set.actual_weight_lbs || 0) * (set.actual_reps || 0);
            totalVolume += product;
            if (product > maxProduct) {
              maxProduct = product;
              topSet = set;
            }
          }

          const exerciseName = (ei.exercises as unknown as { name: string })?.name || "Unknown";
          exercises.push({
            name: exerciseName,
            sets: sets.length,
            topSet: `${topSet.actual_weight_lbs}x${topSet.actual_reps}`,
          });

          totalSets += sets.length;
        }
      }

      // Calculate duration
      let duration: string | null = null;
      if (workout.started_at && workout.completed_at) {
        const start = new Date(workout.started_at);
        const end = new Date(workout.completed_at);
        const diffMs = end.getTime() - start.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      }

      workoutSummaries.push({
        id: workout.id,
        date: workout.completed_at?.split("T")[0] || workout.scheduled_date,
        name: (workout.program_workouts as unknown as { name: string })?.name || "Workout",
        dayNumber: workout.day_number,
        status: workout.status,
        duration,
        exerciseCount: exercises.length,
        totalSets,
        totalVolume,
        exercises,
      });
    }

    const response: WorkoutHistoryResponse = {
      workouts: workoutSummaries,
      summary: {
        totalWorkouts: workoutSummaries.length,
        periodDays: days,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof MurphyAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch workout history:", error);
    return NextResponse.json({ error: "Failed to fetch workout history" }, { status: 500 });
  }
}
