// The read behind the completion labels on a captured workout card.
// `lib/workoutCompletion.ts` owns the arithmetic; this owns the query.
import { supabase } from "../supabase";
import { tallyCompletions } from "../workoutCompletion";
import type { CompletedSessionRecord, CompletionMap } from "../workoutCompletion";

/** A completed session with the one extra column the history block joins
 *  through to reach its Track row. */
export interface CompletedSessionRow extends CompletedSessionRecord {
  workoutInstanceId: string | null;
}

/**
 * Every completed session the reader has, with what each one performed.
 *
 * One query, shared by the card labels and the workout page's history block,
 * so the two can never disagree about what counts. Blocks come embedded:
 * filtering a parent by a column on the far side of an embed is the kind of
 * PostgREST shape that works until it doesn't, and a person's completed
 * sessions are bounded by the days they have trained, so the whole set is
 * read and the per-workout question is answered in memory.
 *
 * Only `status = 'completed'` rows. A suggested, accepted, skipped or rested
 * day performed nothing, whatever its block rows name.
 *
 * Null on a failed read, so each caller can fail closed its own way.
 */
export async function fetchCompletedSessions(userId: string): Promise<CompletedSessionRow[] | null> {
  const { data, error } = await supabase
    .from("generated_sessions")
    .select(`
      id, session_date, workout_instance_id, served_captured_workout_id,
      blocks:generated_session_blocks(captured_workout_id, dismissed)
    `)
    .eq("user_id", userId)
    .eq("status", "completed");
  if (error) {
    console.error("fetchCompletedSessions failed:", error.message, error.details ?? "");
    return null;
  }
  return ((data ?? []) as any[]).map((row): CompletedSessionRow => ({
    id: row.id,
    sessionDate: row.session_date,
    workoutInstanceId: row.workout_instance_id ?? null,
    // Both ids are ON DELETE SET NULL, so a workout deleted mid-read leaves
    // rows that still count as training but no longer name anything to
    // count them on; the arithmetic skips those.
    servedWorkoutId: row.served_captured_workout_id ?? null,
    blocks: (Array.isArray(row.blocks) ? row.blocks : []).map((b: any) => ({
      capturedWorkoutId: b.captured_workout_id ?? null,
      // NOT NULL with a false default; the guard is for the untyped client.
      dismissed: b.dismissed === true,
    })),
  }));
}

/**
 * How many times each captured workout has been completed, and when last.
 *
 * Counted from tracked sessions, not from the recommender's usage ledger.
 * A completed session counts as one performance of every captured workout
 * it ran: the one it served whole (`served_captured_workout_id` — adopted
 * from its own screen, or handed over by the composer as the whole answer
 * to a day) AND every workout a non-dismissed block row names. Since
 * multi-workout sessions became the norm, a workout done as one block of a
 * composed day is as done as one served whole, and the person who did it
 * expects the card to say so. A day that lists the same workout both ways
 * is still one day — see workoutsPerformedIn.
 *
 * Not the ledger (captured_workout_usage), though it records both kinds of
 * performance too: its write is best-effort (a completion still stands when
 * the ledger write fails), it has no rows for sessions completed before it
 * existed, it does not know a dismissed block from a live one, and its
 * unique key folds a day into one row per (workout, role). These sessions
 * go back as far as the training does.
 *
 * An empty map on failure rather than null, which is the opposite of what the
 * recommender's reads do and for the opposite reason: nothing steers on this.
 * These are two labels on a list that has to render regardless, and a card
 * with no history line is already a state the screen draws for every workout
 * you have never trained. Borrowing that state for a moment costs a person
 * nothing; refusing to draw the list costs them the screen.
 */
export async function fetchWorkoutCompletions(userId: string): Promise<CompletionMap> {
  const sessions = await fetchCompletedSessions(userId);
  if (sessions === null) {
    console.error("fetchWorkoutCompletions failed: completed sessions unavailable");
    return {};
  }
  return tallyCompletions(sessions);
}
