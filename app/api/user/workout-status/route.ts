import { NextResponse } from "next/server";
import { requireMurphyAuth, MurphyAuthError } from "@/lib/supabase/murphy-auth";

interface ExerciseInfo {
  name: string;
  completedSets: number;
  totalSets: number;
}

interface WorkoutProgress {
  workoutInstanceId: string;
  day: number;
  name: string;
  cycle: number;
  week: number;
  startedAt: string | null;
  completedExercises: string[];
  remainingExercises: string[];
  totalSets: number;
  completedSets: number;
}

interface LastCompleted {
  day: number;
  name: string;
  completedAt: string;
}

interface ProgramInfo {
  id: string;
  name: string;
  cycle: number;
  status: string;
  totalDays: number;
  currentDay: number;
}

interface WorkoutStatusResponse {
  inProgress: WorkoutProgress | null;
  nextUp: { day: number; name: string; scheduledDate: string } | null;
  lastCompleted: LastCompleted | null;
  program: ProgramInfo | null;
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireMurphyAuth(request);

    // Get active program instance
    const { data: programInstance, error: programError } = await supabase
      .from("program_instances")
      .select(`
        id,
        status,
        current_day,
        current_week,
        workouts_completed,
        total_workouts,
        program_templates:program_id (
          id,
          title,
          duration_weeks,
          days_per_week
        )
      `)
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (programError && programError.code !== "PGRST116") {
      console.error("Error fetching program instance:", programError);
      return NextResponse.json({ error: "Failed to fetch program" }, { status: 500 });
    }

    if (!programInstance) {
      return NextResponse.json({
        inProgress: null,
        nextUp: null,
        lastCompleted: null,
        program: null,
      } as WorkoutStatusResponse);
    }

    const programTemplate = programInstance.program_templates as unknown as {
      id: string;
      title: string;
      duration_weeks: number;
      days_per_week: number;
    };
    const totalDays = (programTemplate?.duration_weeks || 0) * (programTemplate?.days_per_week || 0);

    // Get in-progress workout
    const { data: inProgressWorkout, error: inProgressError } = await supabase
      .from("workout_instances")
      .select(`
        id,
        day_number,
        week_number,
        started_at,
        program_workouts (
          name
        )
      `)
      .eq("program_instance_id", programInstance.id)
      .eq("status", "in_progress")
      .single();

    let inProgress: WorkoutProgress | null = null;

    if (inProgressWorkout && !inProgressError) {
      const workoutName = (inProgressWorkout.program_workouts as unknown as { name: string })?.name || "Workout";

      // Get exercise instances for this workout
      const { data: exerciseInstances } = await supabase
        .from("exercise_instances")
        .select(`
          id,
          status,
          exercises (name)
        `)
        .eq("workout_instance_id", inProgressWorkout.id)
        .order("exercise_order", { ascending: true });

      const completedExercises: string[] = [];
      const remainingExercises: string[] = [];
      let totalSets = 0;
      let completedSets = 0;

      if (exerciseInstances) {
        for (const ei of exerciseInstances) {
          const exerciseName = (ei.exercises as unknown as { name: string })?.name || "Unknown";
          
          if (ei.status === "completed") {
            completedExercises.push(exerciseName);
          } else {
            remainingExercises.push(exerciseName);
          }

          // Count sets
          const { count: setCount } = await supabase
            .from("set_instances")
            .select("*", { count: "exact", head: true })
            .eq("exercise_instance_id", ei.id);

          const { count: completedSetCount } = await supabase
            .from("set_instances")
            .select("*", { count: "exact", head: true })
            .eq("exercise_instance_id", ei.id)
            .not("actual_weight_lbs", "is", null);

          totalSets += setCount || 0;
          completedSets += completedSetCount || 0;
        }
      }

      inProgress = {
        workoutInstanceId: inProgressWorkout.id,
        day: inProgressWorkout.day_number,
        name: workoutName,
        cycle: programInstance.current_week || 1,
        week: inProgressWorkout.week_number,
        startedAt: inProgressWorkout.started_at,
        completedExercises,
        remainingExercises,
        totalSets,
        completedSets,
      };
    }

    // Get last completed workout
    const { data: lastCompletedWorkout } = await supabase
      .from("workout_instances")
      .select(`
        day_number,
        completed_at,
        program_workouts (name)
      `)
      .eq("program_instance_id", programInstance.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();

    let lastCompleted: LastCompleted | null = null;
    if (lastCompletedWorkout) {
      lastCompleted = {
        day: lastCompletedWorkout.day_number,
        name: (lastCompletedWorkout.program_workouts as unknown as { name: string })?.name || "Workout",
        completedAt: lastCompletedWorkout.completed_at,
      };
    }

    // Get next scheduled workout (if not in progress)
    let nextUp: { day: number; name: string; scheduledDate: string } | null = null;
    if (!inProgress) {
      const { data: nextWorkout } = await supabase
        .from("workout_instances")
        .select(`
          day_number,
          scheduled_date,
          program_workouts (name)
        `)
        .eq("program_instance_id", programInstance.id)
        .eq("status", "pending")
        .order("scheduled_date", { ascending: true })
        .limit(1)
        .single();

      if (nextWorkout) {
        nextUp = {
          day: nextWorkout.day_number,
          name: (nextWorkout.program_workouts as unknown as { name: string })?.name || "Workout",
          scheduledDate: nextWorkout.scheduled_date,
        };
      }
    }

    // Calculate current day in program
    const { count: completedWorkouts } = await supabase
      .from("workout_instances")
      .select("*", { count: "exact", head: true })
      .eq("program_instance_id", programInstance.id)
      .eq("status", "completed");

    const response: WorkoutStatusResponse = {
      inProgress,
      nextUp,
      lastCompleted,
      program: {
        id: programInstance.id,
        name: programTemplate?.title || "Unknown Program",
        cycle: programInstance.current_week || 1,
        status: programInstance.status,
        totalDays,
        currentDay: programInstance.current_day || (programInstance.workouts_completed || 0) + 1,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof MurphyAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to fetch workout status:", error);
    return NextResponse.json({ error: "Failed to fetch workout status" }, { status: 500 });
  }
}
