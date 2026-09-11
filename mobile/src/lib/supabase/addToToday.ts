// Executes an AddToTodayPlan. The session and item shapes are the ones
// captured-workout adoption writes (daily.ts adoptCapturedWorkout), minus
// the served workout: a user_pick session, unstamped, one main-block item
// with no targets and the page's reason. Spec §4.9, §5.
import { supabase } from "../supabase";
import { rampWeek } from "../dailySplit";
import { planAddToToday, ADD_TO_TODAY_ITEM_REASON } from "../addToTodayPlan";
import type { AddToTodayPlan, TodayState } from "../addToTodayPlan";
import { fetchTodaySessionStrict, fetchTodayCheckin, unrestToday } from "./daily";

/** Today's state as the plan wants it. Read immediately before writing (spec §7).
 *  The strict read throws on a query failure rather than reporting "none":
 *  the button's initial read catches and falls open to the plain label, and
 *  the tap-time re-read lands in executeAddToToday's catch, so a day that
 *  could not be read is never written to. */
export async function readTodayState(
  userId: string,
  exerciseId: string,
  date: string,
): Promise<TodayState> {
  const session = await fetchTodaySessionStrict(userId, date);
  if (!session) return { kind: "none", containsExercise: false };
  const containsExercise = session.items.some((i) => i.exerciseId === exerciseId);
  if (session.status === "rested") return { kind: "rested", sessionId: session.id, containsExercise: false };
  if (session.status === "completed") return { kind: "completed", sessionId: session.id, containsExercise };
  if (session.status === "accepted" && session.workoutInstanceId) {
    return { kind: "inProgress", sessionId: session.id, containsExercise };
  }
  // suggested, or accepted but not yet started
  return { kind: "pending", sessionId: session.id, containsExercise };
}

export type AddToTodayResult =
  | { ok: true; sessionId: string }
  | { ok: false; message: string };

const FAILED = "Couldn't add it. Today is unchanged — try again.";
const UNRESTED_BUT_NOT_CREATED =
  "The rest day was cleared but the session couldn't be created. Set it up from Today.";

async function appendItem(sessionId: string, exerciseId: string): Promise<void> {
  const { data: last, error: orderError } = await supabase
    .from("generated_session_items")
    .select("item_order")
    .eq("session_id", sessionId)
    .order("item_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) throw orderError;
  const { error } = await supabase.from("generated_session_items").insert({
    session_id: sessionId,
    exercise_id: exerciseId,
    item_order: (last?.item_order ?? -1) + 1,
    section: "main",
    target_sets: null,
    target_reps: null,
    rest_seconds: null,
    reason: ADD_TO_TODAY_ITEM_REASON,
  });
  if (error) throw error;
}

/** A user_pick session for the day holding just this item. Mirrors
 *  adoptCapturedWorkout's row, with no served workout. */
async function createUserPickSession(userId: string, exerciseId: string, date: string): Promise<string> {
  const [{ data: firstRow }, { data: gym }, checkin] = await Promise.all([
    supabase
      .from("generated_sessions")
      .select("session_date")
      .eq("user_id", userId)
      .order("session_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("gym_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
    fetchTodayCheckin(userId, date),
  ]);
  const { data: session, error: insError } = await supabase
    .from("generated_sessions")
    .insert({
      user_id: userId,
      session_date: date,
      gym_profile_id: gym?.id ?? null,
      checkin_id: checkin?.id ?? null,
      split_day: null,
      ramp_week: rampWeek(firstRow?.session_date ?? null, date),
      source: "user_pick",
      served_captured_workout_id: null,
      section_minutes: null,
      status: "suggested",
      inputs_snapshot: null,
    })
    .select("id")
    .single();
  if (insError) throw insError;
  try {
    await appendItem(session.id, exerciseId);
  } catch (e) {
    // An item-less user_pick session would sit on Today all day; take it back.
    const { error: undoError } = await supabase.from("generated_sessions").delete().eq("id", session.id);
    if (undoError) console.error("addToToday undo failed:", undoError);
    throw e;
  }
  return session.id;
}

export interface AddToTodayInput {
  userId: string;
  exerciseId: string;
  /** Sampled once by the caller — the app's no-two-clocks rule. */
  date: string;
  /** The plan the user confirmed. "confirmUnrest" here means they said Add. */
  plan: AddToTodayPlan;
}

/** Re-reads today and re-plans; the fresh state must plan the same action
 *  the user confirmed, or the write is refused. A confirmed un-rest still
 *  reads as rested (nothing has been written yet), so it plans confirmUnrest
 *  again and passes. */
export async function executeAddToToday(input: AddToTodayInput): Promise<AddToTodayResult> {
  try {
    const fresh = await readTodayState(input.userId, input.exerciseId, input.date);
    const plan = planAddToToday(fresh);
    if (plan.action !== input.plan.action) {
      return { ok: false, message: "Today changed since this page opened. Pull to refresh and try again." };
    }
    switch (plan.action) {
      case "append":
      case "appendLive": {
        await appendItem(fresh.sessionId!, input.exerciseId);
        return { ok: true, sessionId: fresh.sessionId! };
      }
      case "create":
      case "appendSecond": {
        const id = await createUserPickSession(input.userId, input.exerciseId, input.date);
        return { ok: true, sessionId: id };
      }
      case "confirmUnrest": {
        // unrestToday also drops tomorrow's untouched draft, which captured-
        // workout adoption's own un-rest keeps; accepted — the morning
        // recompose rebuilds it.
        const cleared = await unrestToday(input.userId, input.date);
        if (!cleared) throw new Error("unrest failed");
        // Past this point Today HAS changed (the rest is gone), so the generic
        // "Today is unchanged" message would be a lie if the create fails.
        try {
          const id = await createUserPickSession(input.userId, input.exerciseId, input.date);
          return { ok: true, sessionId: id };
        } catch (e) {
          const err = e as { code?: string; message?: string };
          console.error("executeAddToToday create after un-rest failed:", err?.code ?? "", err?.message ?? String(e));
          return { ok: false, message: UNRESTED_BUT_NOT_CREATED };
        }
      }
      case "disabled":
        return { ok: false, message: "Already in today's session." };
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error("executeAddToToday failed:", err?.code ?? "", err?.message ?? String(e));
    return { ok: false, message: FAILED };
  }
}
