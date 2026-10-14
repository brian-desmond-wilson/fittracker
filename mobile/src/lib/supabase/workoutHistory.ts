// The reader's completed sessions of ONE captured workout, for the workout
// page's history block. Counted the way fetchWorkoutCompletions counts — the
// same read, in fact: a completed generated_session that either served this
// workout whole (served_captured_workout_id) or ran it as a non-dismissed
// block of a composed day. Either way the day is a day this workout was
// done, and a day that lists it both ways is one row here, not two
// (workoutsPerformedIn owns that rule).
//
// Two reads rather than one nested filter: the Track session (the row the
// history opens, and the duration it shows) hangs off the same
// workout_instance the generated session does, and joining through it
// with a filter on the far side is the kind of PostgREST shape that works
// until it doesn't. Empty on error — the block fails closed to "not yet".
//
// Scores are one more read, joined by the generated session id; a failed
// scores read leaves every row unscored, which the block draws as days
// without bars.
import { supabase } from "../supabase";
import { fetchWorkoutScores } from "./sessionScores";
import { fetchCompletedSessions } from "./workoutCompletions";
import { workoutsPerformedIn } from "../workoutCompletion";
import type { WorkoutSessionRow } from "../workoutHistory";

export async function fetchWorkoutHistory(userId: string, workoutId: string): Promise<WorkoutSessionRow[]> {
  const sessions = await fetchCompletedSessions(userId);
  if (sessions === null) {
    console.error("fetchWorkoutHistory failed: completed sessions unavailable");
    return [];
  }
  const rows = sessions
    .filter((s) => workoutsPerformedIn(s).has(workoutId))
    .map((s) => ({ id: s.id, session_date: s.sessionDate, workout_instance_id: s.workoutInstanceId }));
  const instanceIds = rows.map((g) => g.workout_instance_id).filter((v): v is string => !!v);
  const scores = await fetchWorkoutScores(userId, workoutId);

  const byInstance = new Map<string, { id: string; durationSeconds: number | null }>();
  if (instanceIds.length > 0) {
    const { data: sessions, error: sError } = await supabase
      .from("workout_sessions")
      .select("id, workout_instance_id, duration_seconds, started_at, ended_at")
      .eq("user_id", userId)
      .in("workout_instance_id", instanceIds)
      .order("session_number", { ascending: true });
    if (sError) {
      // The days still count; only the tap-through and the minutes are lost.
      console.error("fetchWorkoutHistory sessions failed:", sError.message, sError.details ?? "");
    }
    for (const s of (sessions ?? []) as {
      id: string;
      workout_instance_id: string;
      duration_seconds: number | null;
      started_at: string | null;
      ended_at: string | null;
    }[]) {
      // Keep the first row per instance: session_number ascending means
      // session 1 is the row the history opens; a split workout's later
      // parts (done across days on the same instance) are not shown
      // separately.
      if (!byInstance.has(s.workout_instance_id)) {
        // duration_seconds defaults to 0; fall back to the wall-clock span
        // the same way Track's sessionMinutes does (gymSessions.ts).
        let durationSeconds = s.duration_seconds && s.duration_seconds > 0 ? s.duration_seconds : null;
        if (durationSeconds === null && s.started_at && s.ended_at) {
          const started = Date.parse(s.started_at);
          const ended = Date.parse(s.ended_at);
          if (!Number.isNaN(started) && !Number.isNaN(ended)) {
            const computed = Math.round((ended - started) / 1000);
            if (computed > 0) durationSeconds = computed;
          }
        }
        byInstance.set(s.workout_instance_id, { id: s.id, durationSeconds });
      }
    }
  }

  return rows
    // session_date is NOT NULL; the guard stays because the client is
    // untyped (see workoutCompletions.ts) and a bad read would otherwise
    // hand a row with no day to draw.
    .filter((g) => !!g.session_date)
    .map((g) => {
      const track = g.workout_instance_id ? byInstance.get(g.workout_instance_id) : undefined;
      return {
        generatedSessionId: g.id,
        sessionId: track?.id ?? null,
        sessionDate: g.session_date,
        durationSeconds: track?.durationSeconds ?? null,
        score: scores.get(g.id) ?? null,
      };
    });
}
