// How a captured workout is described back to the user.
//
// This exists because the first version rendered every item as "sets × reps".
// For a circuit — four movements at eight reps, repeated three to four times —
// that produced "3 × 8" per exercise, which is a different workout from the
// one the creator posted. The rule here: say only what was prescribed. No
// sets, no "×". Rounds belong to the workout, not to each exercise.
import type { ExtractedWorkoutItem } from "../types/capture";

/** Only the prescription fields — so this works on an extraction being
 *  reviewed and on a workout already saved, without either knowing about the
 *  other. */
export type Prescription = Pick<
  ExtractedWorkoutItem,
  "sets" | "reps" | "weight" | "duration" | "restSeconds"
>;

/** One exercise's prescription. Empty string when nothing was prescribed —
 *  the caller shows the exercise name alone rather than an invented number. */
export function formatWorkoutItem(item: Prescription): string {
  // Reps carry their own scheme ("8R/8L", "21-15-9"); only bare numbers get
  // the word "reps" appended.
  const effort = item.reps
    ? /^\d+$/.test(item.reps)
      ? `${item.reps} reps`
      : item.reps
    : item.duration ?? null;
  if (!effort) return "";

  let text = item.sets ? `${item.sets} × ${effort}` : effort;
  if (item.weight) text += ` @ ${item.weight}`;
  if (item.restSeconds) text += ` · rest ${item.restSeconds}s`;
  return text;
}

/** The workout's shape in one line: how many movements, how many times through. */
export function formatWorkoutHeadline(
  movementCount: number,
  rounds: string | null,
): string {
  const movements = `${movementCount} movement${movementCount === 1 ? "" : "s"}`;
  if (!rounds) return movements;
  return `${movements} · ${rounds} round${rounds === "1" ? "" : "s"}`;
}
