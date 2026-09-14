// The reader's completed sessions of ONE captured workout, for the workout
// page's history block. Counted the way fetchWorkoutCompletions counts: a
// completed generated_session whose served_captured_workout_id is this
// workout — a day that WAS this workout, served whole. A day where it was
// one block inside a composed session is deliberately not this workout.
//
// Two reads rather than one nested filter: the Track session (the row the
// history opens, and the duration it shows) hangs off the same
// workout_instance the generated session does, and joining through it
// with a filter on the far side is the kind of PostgREST shape that works
// until it doesn't. Empty on error — the block fails closed to "not yet".
import { supabase } from "../supabase";
import type { WorkoutSessionRow } from "../workoutHistory";

export async function fetchWorkoutHistory(userId: string, workoutId: string): Promise<WorkoutSessionRow[]> {
  const { data: gens, error } = await supabase
    .from("generated_sessions")
    .select("id, session_date, workout_instance_id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .eq("served_captured_workout_id", workoutId);
  if (error) {
    console.error("fetchWorkoutHistory failed:", error.message, error.details ?? "");
    return [];
  }
  const rows = (gens ?? []) as { id: string; session_date: string; workout_instance_id: string | null }[];
  const instanceIds = rows.map((g) => g.workout_instance_id).filter((v): v is string => !!v);

  const byInstance = new Map<string, { id: string; durationSeconds: number | null }>();
  if (instanceIds.length > 0) {
    const { data: sessions, error: sError } = await supabase
      .from("workout_sessions")
      .select("id, workout_instance_id, duration_seconds")
      .eq("user_id", userId)
      .in("workout_instance_id", instanceIds);
    if (sError) {
      // The days still count; only the tap-through and the minutes are lost.
      console.error("fetchWorkoutHistory sessions failed:", sError.message, sError.details ?? "");
    }
    for (const s of (sessions ?? []) as { id: string; workout_instance_id: string; duration_seconds: number | null }[]) {
      // Keep the first row per instance; a second session on one instance is
      // a re-run and the earliest is the one the day was completed on.
      if (!byInstance.has(s.workout_instance_id)) {
        byInstance.set(s.workout_instance_id, { id: s.id, durationSeconds: s.duration_seconds ?? null });
      }
    }
  }

  return rows
    .filter((g) => !!g.session_date)
    .map((g) => {
      const track = g.workout_instance_id ? byInstance.get(g.workout_instance_id) : undefined;
      return {
        sessionId: track?.id ?? null,
        sessionDate: g.session_date,
        durationSeconds: track?.durationSeconds ?? null,
      };
    });
}
