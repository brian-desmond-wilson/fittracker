// Reads for Track > Gym Sessions.
//
// The unit is the SESSION, not the workout: the app already models a workout
// split across two days as two sessions, and keying history on the workout
// would collapse a split one into a single misleading row.
//
// Everything logged in this app — a program workout, a recommended day, a
// captured workout started from the catalog — goes through the same instance
// chain, so one query covers all three.
import { supabase } from "../supabase";
import type { HistorySession, SessionSource } from "../../types/gymSessions";

const SPLIT_TITLES: Record<string, string> = {
  push: "Push day",
  pull: "Pull day",
  legs: "Leg day",
};

/** Supabase returns a nested one-to-one as an object and a reverse relation as
 *  an array, and the shape varies with the join — normalise before reading. */
const first = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

interface NameAndSource {
  name: string;
  source: SessionSource;
  capturedWorkoutId: string | null;
  capturedWorkoutHandle: string | null;
}

/** What this session should be called, and where it came from. */
function describe(instance: any): NameAndSource {
  const generated = first<any>(instance?.generated_session);
  const captured = first<any>(generated?.captured);
  if (generated?.served_captured_workout_id && captured) {
    return {
      name: captured.name,
      source: "catalog",
      capturedWorkoutId: generated.served_captured_workout_id,
      capturedWorkoutHandle: first<any>(captured.source)?.poster_handle ?? null,
    };
  }
  if (generated?.split_day) {
    return {
      name: SPLIT_TITLES[generated.split_day] ?? "Session",
      source: "recommended",
      capturedWorkoutId: null,
      capturedWorkoutHandle: null,
    };
  }
  const program = first<any>(instance?.program_workout);
  if (program?.name) {
    return {
      name: program.name,
      source: "program",
      capturedWorkoutId: null,
      capturedWorkoutHandle: null,
    };
  }
  return {
    name: "Workout",
    source: "unknown",
    capturedWorkoutId: null,
    capturedWorkoutHandle: null,
  };
}

const SELECT = `
  id, session_number, session_date, started_at, ended_at, duration_seconds,
  workout_instance:workout_instances(
    id,
    program_workout:program_workouts(name),
    generated_session:generated_sessions(
      split_day, source, served_captured_workout_id,
      captured:captured_workouts(
        id, name,
        source:captured_sources(poster_handle)
      )
    )
  ),
  exercises:exercise_instances(
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

function toSession(row: any, sessionCount: number): HistorySession {
  const instance = first<any>(row.workout_instance);
  const described = describe(instance);
  return {
    id: row.id,
    date: row.session_date,
    sessionNumber: row.session_number ?? 1,
    sessionCount,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds ?? null,
    ...described,
    exercises: (row.exercises ?? [])
      .slice()
      .sort((a: any, b: any) => (a.exercise_order ?? 0) - (b.exercise_order ?? 0))
      .map((ex: any) => {
        const exercise = first<any>(ex.exercise);
        return {
          id: ex.id,
          exerciseId: ex.exercise_id,
          name: exercise?.name ?? "Unknown movement",
          order: ex.exercise_order ?? 0,
          difficulty: ex.difficulty ?? null,
          primaryRegions: (exercise?.regions ?? [])
            .filter((r: any) => r.is_primary)
            .map((r: any) => first<any>(r.region)?.name)
            .filter(Boolean),
          sets: (ex.sets ?? [])
            .slice()
            .sort((a: any, b: any) => (a.set_number ?? 0) - (b.set_number ?? 0))
            .map((s: any) => ({
              setNumber: s.set_number ?? 0,
              reps: s.actual_reps ?? 0,
              weightLbs: Number(s.actual_weight_lbs ?? 0),
              volumeLbs: Number(s.volume_lbs ?? 0),
              isWarmup: !!s.is_warmup,
              difficulty: s.difficulty ?? null,
              startedAt: s.started_at ?? null,
              endedAt: s.ended_at ?? null,
              durationSeconds: s.duration_seconds ?? null,
              timingSource: s.timing_source ?? null,
            })),
        };
      }),
  };
}

/**
 * Sessions newest first.
 *
 * `limit` bounds the window rather than paginating: the split-session count is
 * derived from what came back, so a workout whose other half falls outside the
 * window would under-report. At a few hundred sessions that never bites; if it
 * ever does, the count belongs in a view.
 */
export async function fetchGymSessions(
  userId: string,
  limit = 200,
): Promise<HistorySession[]> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(SELECT)
    .eq("user_id", userId)
    .order("session_date", { ascending: false })
    .order("session_number", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("fetchGymSessions failed:", error.message, error.details ?? "");
    return [];
  }
  const rows = data ?? [];
  const perInstance = new Map<string, number>();
  for (const row of rows) {
    const id = first<any>((row as any).workout_instance)?.id;
    if (id) perInstance.set(id, (perInstance.get(id) ?? 0) + 1);
  }
  return rows
    .map((row: any) => {
      const instanceId = first<any>(row.workout_instance)?.id;
      return toSession(row, instanceId ? (perInstance.get(instanceId) ?? 1) : 1);
    })
    // A session with nothing logged in it is a false start, not history.
    .filter((s) => s.exercises.some((e) => e.sets.length > 0));
}

/** One session, with everything in it. */
export async function fetchWorkoutSession(
  sessionId: string,
): Promise<HistorySession | null> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(SELECT)
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("fetchWorkoutSession failed:", error.message);
    return null;
  }
  return toSession(data, 1);
}
