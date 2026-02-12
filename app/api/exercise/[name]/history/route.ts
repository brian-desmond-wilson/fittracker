import { NextResponse } from "next/server";
import { requireAdmin, AdminAuthError } from "@/lib/supabase/admin";

interface SetDetail {
  setNumber: number;
  weight: number;
  reps: number;
  rpe: number | null;
}

interface HistoryEntry {
  date: string;
  workoutName: string;
  sets: SetDetail[];
  topSet: { weight: number; reps: number };
  totalVolume: number;
}

interface PRRecord {
  value: number;
  date: string;
  basedOn?: string;
  reps?: number;
  weight?: number;
}

interface ExerciseHistoryResponse {
  exercise: {
    id: string;
    name: string;
    muscleGroups: string[];
  } | null;
  history: HistoryEntry[];
  prs: {
    estimated1RM: PRRecord | null;
    maxWeight: PRRecord | null;
    maxReps: PRRecord | null;
    maxVolume: PRRecord | null;
  };
  trend: "increasing" | "decreasing" | "stable";
}

// Epley formula for estimated 1RM: weight × (1 + reps/30)
function calculate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { supabase, user } = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const { name: exerciseName } = await params;

    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const days = searchParams.get("days") ? parseInt(searchParams.get("days")!, 10) : null;

    // Decode URL-encoded exercise name and search
    const decodedName = decodeURIComponent(exerciseName).replace(/-/g, " ");

    // Find exercise by name (fuzzy match using ilike)
    const { data: exercises, error: exerciseError } = await supabase
      .from("exercises")
      .select("id, name, primary_muscle_group, secondary_muscle_groups")
      .ilike("name", `%${decodedName}%`)
      .limit(1);

    if (exerciseError) {
      console.error("Error finding exercise:", exerciseError);
      return NextResponse.json({ error: "Failed to find exercise" }, { status: 500 });
    }

    if (!exercises || exercises.length === 0) {
      return NextResponse.json({
        exercise: null,
        history: [],
        prs: { estimated1RM: null, maxWeight: null, maxReps: null, maxVolume: null },
        trend: "stable",
      } as ExerciseHistoryResponse);
    }

    const exercise = exercises[0];
    const muscleGroups = [
      exercise.primary_muscle_group,
      ...(exercise.secondary_muscle_groups || []),
    ].filter(Boolean);

    // Build query for exercise instances
    let query = supabase
      .from("exercise_instances")
      .select(`
        id,
        performed_date,
        workout_instances (
          scheduled_date,
          completed_at,
          program_workouts (name)
        )
      `)
      .eq("user_id", user.id)
      .eq("exercise_id", exercise.id)
      .eq("status", "completed")
      .order("performed_date", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (days) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      query = query.gte("performed_date", startDate.toISOString().split("T")[0]);
    }

    const { data: exerciseInstances, error: historyError } = await query;

    if (historyError) {
      console.error("Error fetching exercise history:", historyError);
      return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
    }

    const history: HistoryEntry[] = [];
    let maxWeight: PRRecord | null = null;
    let maxReps: PRRecord | null = null;
    let maxVolume: PRRecord | null = null;
    let max1RM: PRRecord | null = null;
    const estimated1RMs: number[] = [];

    for (const ei of exerciseInstances || []) {
      const workoutInstance = ei.workout_instances as unknown as {
        scheduled_date: string;
        completed_at: string;
        program_workouts: { name: string };
      };

      const date = ei.performed_date || workoutInstance?.scheduled_date || "";
      const workoutName = workoutInstance?.program_workouts?.name || "Workout";

      // Get working sets for this exercise instance
      const { data: sets } = await supabase
        .from("set_instances")
        .select("set_number, actual_weight_lbs, actual_reps, difficulty")
        .eq("exercise_instance_id", ei.id)
        .eq("is_warmup", false)
        .not("actual_weight_lbs", "is", null)
        .order("set_number", { ascending: true });

      if (!sets || sets.length === 0) continue;

      const setDetails: SetDetail[] = [];
      let topSet = { weight: 0, reps: 0 };
      let sessionVolume = 0;
      let sessionMax1RM = 0;

      for (const set of sets) {
        const weight = set.actual_weight_lbs || 0;
        const reps = set.actual_reps || 0;
        const volume = weight * reps;

        setDetails.push({
          setNumber: set.set_number,
          weight,
          reps,
          rpe: null, // RPE not tracked in current schema
        });

        sessionVolume += volume;

        // Track top set (by volume)
        if (volume > topSet.weight * topSet.reps) {
          topSet = { weight, reps };
        }

        // Calculate 1RM for this set
        const set1RM = calculate1RM(weight, reps);
        if (set1RM > sessionMax1RM) {
          sessionMax1RM = set1RM;
        }

        // Track PRs
        if (!maxWeight || weight > maxWeight.value) {
          maxWeight = { value: weight, reps, date };
        }
        if (!maxReps || (reps > (maxReps.reps || 0) && weight >= (maxReps.weight || 0))) {
          maxReps = { value: reps, weight, reps, date };
        }
      }

      estimated1RMs.push(sessionMax1RM);

      if (!maxVolume || sessionVolume > maxVolume.value) {
        maxVolume = { value: sessionVolume, date };
      }

      if (!max1RM || sessionMax1RM > max1RM.value) {
        max1RM = {
          value: sessionMax1RM,
          basedOn: `${topSet.weight}x${topSet.reps}`,
          date,
        };
      }

      history.push({
        date,
        workoutName,
        sets: setDetails,
        topSet,
        totalVolume: sessionVolume,
      });
    }

    // Calculate trend (compare recent 3 sessions vs previous 3)
    let trend: "increasing" | "decreasing" | "stable" = "stable";
    if (estimated1RMs.length >= 6) {
      const recent = estimated1RMs.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const previous = estimated1RMs.slice(3, 6).reduce((a, b) => a + b, 0) / 3;
      if (recent > previous * 1.02) trend = "increasing";
      else if (recent < previous * 0.98) trend = "decreasing";
    }

    const response: ExerciseHistoryResponse = {
      exercise: {
        id: exercise.id,
        name: exercise.name,
        muscleGroups,
      },
      history,
      prs: {
        estimated1RM: max1RM,
        maxWeight,
        maxReps,
        maxVolume,
      },
      trend,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch exercise history:", error);
    return NextResponse.json({ error: "Failed to fetch exercise history" }, { status: 500 });
  }
}
