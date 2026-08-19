// How often, and how recently, a captured workout has actually been trained.
//
// Pure, in the same doctrine as workoutFilter and catalogFilter: the whole
// history is one query's result, so the date ladder, the staleness order and
// the never-done filter run here — instantly, offline, and testable without a
// database or a renderer. `supabase/workoutCompletions.ts` owns the read and
// the card owns the pixels.
import { daysBetween } from "./dailyCoverage";
import { parseLocalDate } from "./dates";

/** One workout's history.
 *
 *  A workout that has never been completed is ABSENT from the map rather than
 *  present with a count of zero. The query cannot produce a zero — a row only
 *  exists because a session finished — so admitting one here would invent a
 *  state nothing writes and every reader would have to test for twice. */
export interface WorkoutCompletion {
  /** Completed sessions of this workout, all time. Always at least 1. */
  count: number;
  /** Local calendar date (YYYY-MM-DD) of the most recent one. */
  lastCompleted: string;
}

/** captured_workouts.id → its history. Missing key means never completed. */
export type CompletionMap = Record<string, WorkoutCompletion>;

/**
 * Past this many days the count stops being drawn as current.
 *
 * A month is roughly where a workout stops being part of what you are doing
 * and becomes part of what you have done. Without this, a workout finished
 * once last spring and one finished fifteen times this month both read as the
 * same green, and the colour claims currency it has not got.
 */
export const STALE_AFTER_DAYS = 30;

/** Days since a workout was last completed. NaN on a malformed date — every
 *  caller here treats that as "we cannot say" rather than as zero, because
 *  zero is the loudest thing the card can claim. */
function daysSince(completion: WorkoutCompletion, today: string): number {
  return daysBetween(completion.lastCompleted, today);
}

export function isStale(completion: WorkoutCompletion, today: string): boolean {
  const days = daysSince(completion, today);
  return !Number.isNaN(days) && days > STALE_AFTER_DAYS;
}

/**
 * When a workout was last completed, written the way a person reads it.
 *
 * Words while the memory is still fresh, a plain date once it is not: a
 * weekday name is unambiguous only inside the last week, and past that
 * "Saturday" could be four days ago or eleven. The year appears only when it
 * changes the meaning.
 *
 * Null when the stored date is unparseable — the line is then dropped rather
 * than drawn around an "Invalid Date". A future date (clock skew between two
 * devices, or a session dated ahead) reads as Today: the workout is done, and
 * "in 1 day" is not a thing a history line can mean.
 */
export function formatLastCompleted(
  completion: WorkoutCompletion,
  today: string,
): string | null {
  const days = daysSince(completion, today);
  if (Number.isNaN(days)) return null;
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const when = parseLocalDate(completion.lastCompleted);
  if (days < 7) return when.toLocaleDateString(undefined, { weekday: "long" });
  const sameYear = when.getFullYear() === parseLocalDate(today).getFullYear();
  return when.toLocaleDateString(
    undefined,
    sameYear
      ? { month: "numeric", day: "numeric" }
      : { month: "numeric", day: "numeric", year: "2-digit" },
  );
}

/**
 * Longest-neglected first: never completed, then oldest last-completion.
 *
 * The point of the labels is to make the list answer "what have I been
 * avoiding", and a workout you have never done is the most avoided thing in
 * it. The sort is stable, so within the never-done group the list keeps
 * whatever order it arrived in — newest capture first, which is what someone
 * scanning brand-new workouts expects.
 *
 * A malformed date sorts as if completed today rather than as never done: it
 * is a data problem, and a data problem must not be promoted to the top of
 * the screen.
 */
export function sortByStaleness<T>(
  items: T[],
  idOf: (item: T) => string,
  completions: CompletionMap,
  today: string,
): T[] {
  const rank = (item: T): number => {
    const completion = completions[idOf(item)];
    if (!completion) return Number.POSITIVE_INFINITY;
    const days = daysSince(completion, today);
    return Number.isNaN(days) ? 0 : days;
  };
  return [...items].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    // Two never-done workouts are equally neglected; subtracting infinities
    // would hand the comparator a NaN and make the order arbitrary.
    return ra === rb ? 0 : rb - ra;
  });
}

/** Only the workouts you saved and never trained. */
export function filterNeverDone<T>(
  items: T[],
  idOf: (item: T) => string,
  completions: CompletionMap,
): T[] {
  return items.filter((item) => !completions[idOf(item)]);
}
