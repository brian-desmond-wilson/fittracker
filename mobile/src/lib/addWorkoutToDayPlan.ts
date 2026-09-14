// Which branch "Add to a day" takes, from the chosen day's state. Pure: the
// writer (supabase/addWorkoutToDay.ts) re-reads the day right before it
// writes and asks this again, so a stale sheet can never write the wrong
// shape. Sibling of addToTodayPlan.ts, for a whole workout on any day.
// Spec 2026-09-13 §4.10, §5.6.
export type DayKind = "none" | "pending" | "inProgress" | "completed" | "rested";

export interface DayState {
  kind: DayKind;
  /** The day's pending or live session is this very workout served whole. */
  servesThisWorkout: boolean;
}

export type AddToDayAction =
  | "adopt"          // nothing on the day: adopt it
  | "confirmReplace" // a planned or live session: ask, then adopt (the old one is marked skipped)
  | "confirmUnrest"  // a declared rest day: ask, then adopt (the rest row is removed)
  | "addSecond"      // the day is done: adopt as a second session, no ask
  | "disabled";      // already this workout, pending or live

export interface Confirm {
  title: string;
  body: string;
  go: string;
}

export interface AddToDayPlan {
  action: AddToDayAction;
  label: string;
  confirm: Confirm | null;
  /** The state kind the plan was made from — the executor's re-plan must
   *  match this too, not just the action, so a day that changed shape
   *  between two confirmReplace-shaped states (e.g. pending -> inProgress)
   *  is still caught. */
  kind: DayKind;
}

export const ADD_TO_DAY_LABEL = "Add to a day";

/** `dayLabel` is how the sheet names the day: "Today", "Tomorrow", "Tuesday", "14 Sep". */
export function planAddToDay(state: DayState, dayLabel: string): AddToDayPlan {
  if (state.servesThisWorkout && (state.kind === "pending" || state.kind === "inProgress")) {
    return { action: "disabled", label: `${dayLabel} is already this workout`, confirm: null, kind: state.kind };
  }
  switch (state.kind) {
    case "none":
      return { action: "adopt", label: ADD_TO_DAY_LABEL, confirm: null, kind: state.kind };
    case "pending":
      return {
        action: "confirmReplace", label: ADD_TO_DAY_LABEL, kind: state.kind,
        confirm: {
          title: `${dayLabel} already has a session planned.`,
          body: "It'll be set aside and this workout takes its place.",
          go: "Replace",
        },
      };
    case "inProgress":
      return {
        action: "confirmReplace", label: ADD_TO_DAY_LABEL, kind: state.kind,
        confirm: {
          title: `${dayLabel} already has a session planned.`,
          body: "You're partway through it — what you've logged is kept, and this workout takes the rest of the day.",
          go: "Replace",
        },
      };
    case "completed":
      return { action: "addSecond", label: ADD_TO_DAY_LABEL, confirm: null, kind: state.kind };
    case "rested":
      return {
        action: "confirmUnrest", label: ADD_TO_DAY_LABEL, kind: state.kind,
        confirm: {
          title: `${dayLabel} is a rest day.`,
          body: "Adding this makes it a training day.",
          go: "Add anyway",
        },
      };
  }
}

/** Structural subset of StoredSession that the status ladder needs. Kept
 *  local (not imported from ../../types/daily) so this file stays pure and
 *  Jest-testable without pulling in Supabase/RN. */
export interface DayStateSource {
  status: "suggested" | "accepted" | "completed" | "skipped" | "rested";
  workoutInstanceId: string | null;
  servedCapturedWorkoutId: string | null;
}

/** The status ladder, as a pure function of the day's stored session (or
 *  none). null -> none; rested -> rested (never "serves" the workout, even
 *  if a served id happens to match — a rest day has no session content);
 *  completed -> completed; accepted with a live instance -> inProgress;
 *  everything else (suggested, accepted-not-started, skipped) -> pending.
 *
 *  Trade-off: fetchTodaySessionStrict returns at most ONE session for the
 *  day (pending preferred over completed over rested), so a day that has
 *  both a completed and a pending session reads as pending here. The write
 *  is still correct either way — only a pending row gets skipped-and-
 *  replaced — it just means that day gets asked a Replace question a
 *  single-session day would not. */
export function dayStateOf(session: DayStateSource | null, workoutId: string): DayState {
  if (!session) return { kind: "none", servesThisWorkout: false };
  const servesThisWorkout = session.servedCapturedWorkoutId === workoutId;
  if (session.status === "rested") return { kind: "rested", servesThisWorkout: false };
  if (session.status === "completed") return { kind: "completed", servesThisWorkout };
  if (session.status === "accepted" && session.workoutInstanceId) return { kind: "inProgress", servesThisWorkout };
  return { kind: "pending", servesThisWorkout };
}

/** `date` is before `today`. Both YYYY-MM-DD, which compares correctly as
 *  a plain string. */
export function isPastDay(date: string, today: string): boolean {
  return date < today;
}
