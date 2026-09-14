// Reads a day the way addToToday.ts reads today, and executes an
// AddToDayPlan by adopting the workout for that date — the same write Start
// does, without the hand-off to the live screen. The morning draft leaves a
// user_pick session alone (composeDay), so a future date survives.
// Spec 2026-09-13 §4.10, §5.6.
import { adoptCapturedWorkout, fetchTodaySessionStrict } from "./daily";
import { planAddToDay } from "../addWorkoutToDayPlan";
import type { AddToDayPlan, DayState } from "../addWorkoutToDayPlan";

/** The chosen day's state. Throws on a query failure rather than reporting
 *  "none", so a day that could not be read is never written to. */
export async function readDayState(userId: string, workoutId: string, date: string): Promise<DayState> {
  const session = await fetchTodaySessionStrict(userId, date);
  if (!session) return { kind: "none", servesThisWorkout: false };
  const servesThisWorkout = session.servedCapturedWorkoutId === workoutId;
  if (session.status === "rested") return { kind: "rested", servesThisWorkout: false };
  if (session.status === "completed") return { kind: "completed", servesThisWorkout };
  if (session.status === "accepted" && session.workoutInstanceId) return { kind: "inProgress", servesThisWorkout };
  return { kind: "pending", servesThisWorkout };
}

export type AddToDayResult =
  | { ok: true; sessionId: string }
  | { ok: false; message: string };

export interface AddToDayInput {
  userId: string;
  workoutId: string;
  /** YYYY-MM-DD, the day being written. */
  date: string;
  dayLabel: string;
  /** The plan the user confirmed. A confirm* action here means they said go. */
  plan: AddToDayPlan;
}

/** Re-reads the day and re-plans; the fresh state must plan the same action
 *  the user confirmed, or the write is refused. */
export async function executeAddToDay(input: AddToDayInput): Promise<AddToDayResult> {
  try {
    const fresh = await readDayState(input.userId, input.workoutId, input.date);
    const plan = planAddToDay(fresh, input.dayLabel);
    if (plan.action !== input.plan.action) {
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
    if (!sessionId) return { ok: false, message: "Couldn't add it. Try again." };
    return { ok: true, sessionId };
  } catch (e) {
    console.error("executeAddToDay failed:", e);
    return { ok: false, message: "Couldn't add it. Try again." };
  }
}
