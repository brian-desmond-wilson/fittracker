// Reads a day the way addToToday.ts reads today, and executes an
// AddToDayPlan by adopting the workout for that date — the same write Start
// does, without the hand-off to the live screen. The morning draft leaves a
// user_pick session alone (composeDay), so a future date survives.
// Spec 2026-09-13 §4.10, §5.6.
import { adoptCapturedWorkout, fetchTodaySessionStrict } from "./daily";
import { dayStateOf, isPastDay, planAddToDay } from "../addWorkoutToDayPlan";
import type { AddToDayPlan, DayState } from "../addWorkoutToDayPlan";

/** The chosen day's state. Throws on a query failure rather than reporting
 *  "none", so a day that could not be read is never written to. */
export async function readDayState(userId: string, workoutId: string, date: string): Promise<DayState> {
  return dayStateOf(await fetchTodaySessionStrict(userId, date), workoutId);
}

export type AddToDayResult =
  | { ok: true; sessionId: string }
  | { ok: false; message: string };

export interface AddToDayInput {
  userId: string;
  workoutId: string;
  /** YYYY-MM-DD, the day being written. */
  date: string;
  /** YYYY-MM-DD, sampled once by the caller — the app's no-two-clocks rule. */
  today: string;
  dayLabel: string;
  /** The plan the user confirmed. A confirm* action here means they said go. */
  plan: AddToDayPlan;
}

const FAILED = "Couldn't add it. Check that day on Today and try again.";

/** Re-reads the day and re-plans; the fresh state must plan the same action
 *  AND the same state kind the user confirmed, or the write is refused —
 *  matching the action alone would let e.g. a pending day that turned
 *  in-progress under the user's thumb slip through, since both plan
 *  confirmReplace. */
export async function executeAddToDay(input: AddToDayInput): Promise<AddToDayResult> {
  if (isPastDay(input.date, input.today)) {
    return { ok: false, message: "That day has passed." };
  }
  try {
    const fresh = await readDayState(input.userId, input.workoutId, input.date);
    const plan = planAddToDay(fresh, input.dayLabel);
    if (plan.action !== input.plan.action || plan.kind !== input.plan.kind) {
      return { ok: false, message: "That day changed since this page opened. Try again." };
    }
    if (plan.action === "disabled") {
      return { ok: false, message: plan.label };
    }
    const sessionId = await adoptCapturedWorkout({
      userId: input.userId,
      capturedWorkoutId: input.workoutId,
      date: input.date,
    });
    // adoptCapturedWorkout stands the prior session down (and drops any
    // rest row) before inserting; its own undo only removes the new row on
    // a failed item insert. So a null result here does not mean the day is
    // untouched — say so honestly rather than claim nothing changed.
    if (!sessionId) return { ok: false, message: FAILED };
    return { ok: true, sessionId };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error("executeAddToDay failed:", err?.code ?? "", err?.message ?? String(e));
    return { ok: false, message: FAILED };
  }
}
