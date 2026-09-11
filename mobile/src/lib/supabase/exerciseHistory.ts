// One scoped query for a reader's working sets of ONE exercise (spec
// decision 7): not the user-wide set fetch Track uses, not a view. The
// select mirrors gymSessions.ts so the session name resolves through the
// same presentation rule; `!inner` on the exercise embed keeps only the
// sessions that contain this exercise, and only this exercise's rows.
import { supabase } from "../supabase";
import { toSession } from "./gymSessions";
import { sessionTitle } from "../sessionPresentation";
import type { WorkingSet } from "../exerciseHistory";

const SCOPED_SELECT = `
  id, session_number, session_date, started_at, ended_at, duration_seconds,
  workout_instance:workout_instances(
    id,
    program_workout:program_workouts(name, estimated_duration_minutes),
    generated_session:generated_sessions(
      split_day, source, served_captured_workout_id,
      captured:captured_workouts(
        id, name, est_minutes,
        source:captured_sources(poster_handle)
      ),
      blocks:generated_session_blocks(
        block, minutes,
        captured:captured_workouts(name)
      )
    )
  ),
  exercises:exercise_instances!inner(
    id, exercise_id, exercise_order, difficulty,
    exercise:exercises(
      name,
      regions:exercise_muscle_regions(is_primary, region:muscle_regions(name))
    ),
    sets:set_instances(
      set_number, actual_reps, actual_weight_lbs, volume_lbs, is_warmup,
      difficulty, started_at, ended_at, duration_seconds, timing_source
    )
  )
`;

/** Every working set of `exerciseId` this user has logged, oldest first.
 *  Empty on error — the history block fails closed. */
export async function fetchExerciseWorkingSets(
  userId: string,
  exerciseId: string,
): Promise<WorkingSet[]> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(SCOPED_SELECT)
    .eq("user_id", userId)
    .eq("exercises.exercise_id", exerciseId)
    .order("session_date", { ascending: true })
    .order("session_number", { ascending: true });
  if (error) {
    console.error("fetchExerciseWorkingSets failed:", error.message, error.details ?? "");
    return [];
  }
  const out: WorkingSet[] = [];
  for (const row of data ?? []) {
    // The title falls back to what the sets say was trained; with only this
    // exercise's rows embedded that fallback is judged on this exercise
    // alone. Named sessions (program, captured, split) are unaffected.
    const session = toSession(row, 1);
    const name = sessionTitle(session);
    for (const ex of session.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of ex.sets) {
        if (s.isWarmup) continue;
        out.push({
          sessionId: session.id,
          sessionDate: session.date,
          sessionNumber: session.sessionNumber,
          sessionName: name,
          weightLbs: s.weightLbs,
          reps: s.reps,
        });
      }
    }
  }
  return out;
}
