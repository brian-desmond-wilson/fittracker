// How often, and how recently, a captured workout has actually been trained.
//
// Pure, in the same doctrine as workoutFilters and exerciseFilters: the whole
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

/** One completed generated_session, as the completion reads see it: the
 *  workout it served whole (if any) and the block rows it ran. */
export interface CompletedSessionRecord {
  id: string;
  /** Local calendar date (YYYY-MM-DD). */
  sessionDate: string;
  /** `served_captured_workout_id`: the session WAS this workout, served whole. */
  servedWorkoutId: string | null;
  /** `generated_session_blocks` rows. A built-in block has a null workout id. */
  blocks: readonly { capturedWorkoutId: string | null; dismissed: boolean }[];
}

/**
 * Every captured workout a completed session counts as a performance of.
 *
 * Both sources count, once each: the workout served whole, and every block
 * row naming a workout. A day that served a workout whole AND lists it as a
 * block (the composer's serve-whole answer writes it both ways) is one
 * performance, not two — a Set, because a day is performed once however
 * many rows describe it. Same for a 2-hour day that ran the same workout in
 * two mains: still one day on which it was done.
 *
 * A dismissed block is not a performance. `dismissed` is NOT NULL, defaults
 * false, and flips only when the user waves the block off for the day; the
 * row stays for undo and history but the Today tab neither shows it as work
 * nor counts its minutes, and the gateway's recency view already reads
 * `NOT dismissed` as "actually ran". Nothing else on a block row says
 * whether it ran — `locked` is a compose-time pin, and there is no
 * block-level performed flag — so a live block in a completed session is
 * taken as performed. (The ledger in captured_workout_usage does not make
 * this distinction, which is one reason it is not the source here.)
 */
export function workoutsPerformedIn(session: CompletedSessionRecord): Set<string> {
  const ids = new Set<string>();
  if (session.servedWorkoutId) ids.add(session.servedWorkoutId);
  for (const block of session.blocks) {
    if (block.capturedWorkoutId && !block.dismissed) ids.add(block.capturedWorkoutId);
  }
  return ids;
}

/**
 * Fold completed sessions into the per-workout map the card labels read.
 *
 * `count` is the number of completed sessions the workout appeared in (see
 * workoutsPerformedIn for what "appeared" means); `lastCompleted` is the
 * latest of their dates, whichever way the workout got into that day.
 * Sessions may arrive in any order. A session with no date is skipped
 * rather than counted with nothing to date it: the column is NOT NULL, but
 * the client is untyped and a zero-length string would otherwise become
 * the "latest" date of nothing.
 */
export function tallyCompletions(sessions: readonly CompletedSessionRecord[]): CompletionMap {
  const completions: CompletionMap = {};
  for (const session of sessions) {
    if (!session.sessionDate) continue;
    for (const id of workoutsPerformedIn(session)) {
      const previous = completions[id];
      completions[id] = {
        count: (previous?.count ?? 0) + 1,
        // YYYY-MM-DD compares correctly as a string, so the latest date needs
        // no parsing — and parsing here would be a second place dates could
        // drift.
        lastCompleted:
          previous && previous.lastCompleted > session.sessionDate
            ? previous.lastCompleted
            : session.sessionDate,
      };
    }
  }
  return completions;
}

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
