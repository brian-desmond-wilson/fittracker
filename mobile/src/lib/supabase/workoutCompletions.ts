// The read behind the completion labels on a captured workout card.
// `lib/workoutCompletion.ts` owns the arithmetic; this owns the query.
import { supabase } from "../supabase";
import type { CompletionMap } from "../workoutCompletion";

/**
 * How many times each captured workout has been completed, and when last.
 *
 * Counted from tracked sessions, not from the recommender's usage ledger.
 * `served_captured_workout_id` is set exactly when a session IS one captured
 * workout served whole — adopted from its own screen, or handed over by the
 * composer as the whole answer to a day — so a completed row carrying one is a
 * performance of that workout and nothing else. A workout that only ever
 * appeared as one block inside a composed day writes a block row instead and
 * is deliberately not counted here: that day was not this workout. The ledger
 * would also only reach back as far as the block recommender does, which is
 * days, while these sessions go back as far as the training does.
 *
 * An empty map on failure rather than null, which is the opposite of what the
 * recommender's reads do and for the opposite reason: nothing steers on this.
 * These are two labels on a list that has to render regardless, and a card
 * with no history line is already a state the screen draws for every workout
 * you have never trained. Borrowing that state for a moment costs a person
 * nothing; refusing to draw the list costs them the screen.
 */
export async function fetchWorkoutCompletions(userId: string): Promise<CompletionMap> {
  const { data, error } = await supabase
    .from("generated_sessions")
    .select("served_captured_workout_id, session_date")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("served_captured_workout_id", "is", null);
  if (error) {
    console.error("fetchWorkoutCompletions failed:", error);
    return {};
  }

  const completions: CompletionMap = {};
  for (const row of (data ?? []) as {
    served_captured_workout_id: string | null;
    session_date: string;
  }[]) {
    const id = row.served_captured_workout_id;
    // The query excludes these; the guard stays because the column is
    // ON DELETE SET NULL, so a workout deleted mid-read leaves rows that
    // still count as training but no longer name anything to count them on.
    if (!id || !row.session_date) continue;
    const previous = completions[id];
    completions[id] = {
      count: (previous?.count ?? 0) + 1,
      // YYYY-MM-DD compares correctly as a string, so the latest date needs no
      // parsing — and parsing here would be a second place dates could drift.
      lastCompleted:
        previous && previous.lastCompleted > row.session_date
          ? previous.lastCompleted
          : row.session_date,
    };
  }
  return completions;
}
