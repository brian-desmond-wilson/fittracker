import { NextResponse } from "next/server";
import { requireMurphyAuth, MurphyAuthError } from "@/lib/supabase/murphy-auth";

interface PRRecord {
  value: number;
  date: string;
  basedOn?: string;
  reps?: number;
  weight?: number;
}

interface ExercisePRs {
  exercise: string;
  exerciseId: string;
  records: {
    estimated1RM: PRRecord | null;
    maxWeight: PRRecord | null;
    maxReps: PRRecord | null;
    maxVolume: PRRecord | null;
  };
}

interface RecentPR {
  exercise: string;
  type: "estimated1RM" | "maxWeight" | "maxReps" | "maxVolume";
  value: number;
  date: string;
  improvement: string;
}

interface PRsResponse {
  prs: ExercisePRs[];
  recentPRs: RecentPR[];
}

// Epley formula: weight × (1 + reps/30)
function calculate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireMurphyAuth(request);
    const { searchParams } = new URL(request.url);

    const exerciseFilter = searchParams.get("exercise");
    const typeFilter = searchParams.get("type");

    // Get all completed exercise instances for user
    let exerciseQuery = supabase
      .from("exercise_instances")
      .select(`
        id,
        exercise_id,
        performed_date,
        exercises (id, name),
        workout_instances (scheduled_date)
      `)
      .eq("user_id", userId)
      .eq("status", "completed");

    const { data: exerciseInstances, error } = await exerciseQuery;

    if (error) {
      console.error("Error fetching exercise instances:", error);
      return NextResponse.json({ error: "Failed to fetch PRs" }, { status: 500 });
    }

    // Group by exercise
    const exercisePRMap: Map<string, {
      exerciseId: string;
      exerciseName: string;
      max1RM: PRRecord | null;
      maxWeight: PRRecord | null;
      maxReps: PRRecord | null;
      maxVolume: PRRecord | null;
    }> = new Map();

    const recentPRs: RecentPR[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const ei of exerciseInstances || []) {
      const exercise = ei.exercises as unknown as { id: string; name: string };
      const workout = ei.workout_instances as unknown as { scheduled_date: string };
      const date = ei.performed_date || workout?.scheduled_date || "";

      if (!exercise) continue;

      // Apply exercise filter if specified
      if (exerciseFilter) {
        const decodedFilter = decodeURIComponent(exerciseFilter).toLowerCase().replace(/-/g, " ");
        if (!exercise.name.toLowerCase().includes(decodedFilter)) continue;
      }

      // Get sets for this exercise instance
      const { data: sets } = await supabase
        .from("set_instances")
        .select("actual_weight_lbs, actual_reps")
        .eq("exercise_instance_id", ei.id)
        .eq("is_warmup", false)
        .not("actual_weight_lbs", "is", null);

      if (!sets || sets.length === 0) continue;

      // Initialize exercise PR tracking if needed
      if (!exercisePRMap.has(exercise.id)) {
        exercisePRMap.set(exercise.id, {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          max1RM: null,
          maxWeight: null,
          maxReps: null,
          maxVolume: null,
        });
      }

      const prData = exercisePRMap.get(exercise.id)!;
      let sessionVolume = 0;
      let sessionMax1RM = 0;
      let sessionMaxWeight = 0;
      let sessionMaxWeightReps = 0;

      for (const set of sets) {
        const weight = set.actual_weight_lbs || 0;
        const reps = set.actual_reps || 0;
        const volume = weight * reps;
        const set1RM = calculate1RM(weight, reps);

        sessionVolume += volume;

        if (set1RM > sessionMax1RM) {
          sessionMax1RM = set1RM;
        }

        if (weight > sessionMaxWeight) {
          sessionMaxWeight = weight;
          sessionMaxWeightReps = reps;
        }

        // Check for new PRs
        const dateObj = new Date(date);

        // 1RM PR
        if (!prData.max1RM || set1RM > prData.max1RM.value) {
          const oldValue = prData.max1RM?.value;
          prData.max1RM = {
            value: set1RM,
            basedOn: `${weight}x${reps}`,
            date,
          };
          if (oldValue && dateObj >= thirtyDaysAgo) {
            recentPRs.push({
              exercise: exercise.name,
              type: "estimated1RM",
              value: set1RM,
              date,
              improvement: `+${set1RM - oldValue} lbs`,
            });
          }
        }

        // Max weight PR
        if (!prData.maxWeight || weight > prData.maxWeight.value) {
          const oldValue = prData.maxWeight?.value;
          prData.maxWeight = {
            value: weight,
            reps,
            date,
          };
          if (oldValue && dateObj >= thirtyDaysAgo) {
            recentPRs.push({
              exercise: exercise.name,
              type: "maxWeight",
              value: weight,
              date,
              improvement: `+${weight - oldValue} lbs`,
            });
          }
        }

        // Max reps PR (at same or higher weight)
        if (!prData.maxReps || 
            (reps > (prData.maxReps.reps || 0) && weight >= (prData.maxReps.weight || 0))) {
          const oldValue = prData.maxReps?.reps;
          prData.maxReps = {
            value: reps,
            weight,
            reps,
            date,
          };
          if (oldValue && dateObj >= thirtyDaysAgo) {
            recentPRs.push({
              exercise: exercise.name,
              type: "maxReps",
              value: reps,
              date,
              improvement: `+${reps - oldValue} reps`,
            });
          }
        }
      }

      // Max volume PR (per session)
      if (!prData.maxVolume || sessionVolume > prData.maxVolume.value) {
        const oldValue = prData.maxVolume?.value;
        prData.maxVolume = {
          value: sessionVolume,
          date,
        };
        const dateObj = new Date(date);
        if (oldValue && dateObj >= thirtyDaysAgo) {
          recentPRs.push({
            exercise: exercise.name,
            type: "maxVolume",
            value: sessionVolume,
            date,
            improvement: `+${sessionVolume - oldValue} lbs total`,
          });
        }
      }
    }

    // Build response
    let prs: ExercisePRs[] = Array.from(exercisePRMap.values()).map((data) => ({
      exercise: data.exerciseName,
      exerciseId: data.exerciseId,
      records: {
        estimated1RM: data.max1RM,
        maxWeight: data.maxWeight,
        maxReps: data.maxReps,
        maxVolume: data.maxVolume,
      },
    }));

    // Apply type filter if specified
    if (typeFilter) {
      prs = prs.filter((p) => {
        switch (typeFilter) {
          case "1rm":
            return p.records.estimated1RM !== null;
          case "weight":
            return p.records.maxWeight !== null;
          case "reps":
            return p.records.maxReps !== null;
          case "volume":
            return p.records.maxVolume !== null;
          default:
            return true;
        }
      });
    }

    // Sort by 1RM descending
    prs.sort((a, b) => (b.records.estimated1RM?.value || 0) - (a.records.estimated1RM?.value || 0));

    // Sort recent PRs by date descending
    recentPRs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const response: PRsResponse = {
      prs: prs.slice(0, 20), // Limit to top 20 exercises
      recentPRs: recentPRs.slice(0, 10), // Limit to 10 most recent
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof MurphyAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch PRs:", error);
    return NextResponse.json({ error: "Failed to fetch PRs" }, { status: 500 });
  }
}
