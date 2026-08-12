// Recording what Eat Next offered, so it can eventually be judged (D5).
//
// The recommender is recomputed on every surface and every focus, shown, and
// discarded. Nothing recorded what it proposed, so the only question that
// would actually improve it — are these suggestions any good? — cannot be
// asked, because the data to answer it was never written.
//
// This writes that data and nothing else. It changes no ranking today; it is
// the substrate an acceptance-rate read needs to exist at all.
import { supabase } from "../supabase";
import type { EatNextResult } from "../eatNext";

/**
 * Upsert one row per (day, context, meal, rank).
 *
 * NOT one row per render, which is the obvious wrong version: the engine
 * recomputes on every focus, every log and every tab switch, so a
 * render-grained log would produce thousands of rows a week describing how
 * often the screen was looked at rather than what was suggested. The daily
 * grain is what carries information — "on this day, in this situation, this
 * meal was offered".
 *
 * Fire-and-forget by contract. This is telemetry about a suggestion; it must
 * never delay a render or surface an error to someone trying to eat.
 */
export async function recordSuggestions(
  userId: string,
  result: EatNextResult,
  todayLocalDate: string,
): Promise<void> {
  if (result.recommendations.length === 0) return;
  const rows = result.recommendations.map((rec, rank) => ({
    user_id: userId,
    suggested_on: todayLocalDate,
    context: result.context,
    meal_id: rec.mealId,
    meal_name: rec.name,
    rank,
    // `?? null` rather than `?? false`: unknown stock is a third state, and
    // recording it as "not makeable" would poison exactly the analysis this
    // table exists to support.
    assemblable: rec.stock?.assemblable ?? null,
  }));
  const { error } = await supabase
    .from("eat_next_suggestions")
    .upsert(rows, {
      onConflict: "user_id,suggested_on,context,meal_id,rank",
      // The first offer of the day is the one worth keeping: re-recording it
      // on every recompute would overwrite `acted_at` and erase the fact that
      // it was taken.
      ignoreDuplicates: true,
    });
  if (error) console.error("recordSuggestions:", error);
}

/**
 * Mark today's suggestions for a meal as acted on.
 *
 * Called from the log paths. Deliberately updates EVERY matching row rather
 * than one: a meal can have been suggested in two contexts on the same day
 * (next_meal at noon, catch_up at six), and eating it accepts both.
 */
export async function markSuggestionActedOn(
  mealId: string,
  todayLocalDate: string,
): Promise<void> {
  const { error } = await supabase
    .from("eat_next_suggestions")
    .update({ acted_at: new Date().toISOString() })
    .eq("meal_id", mealId)
    .eq("suggested_on", todayLocalDate)
    .is("acted_at", null);
  if (error) console.error("markSuggestionActedOn:", error);
}
