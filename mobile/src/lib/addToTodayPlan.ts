// Which of the §4.9 branches "Add to today" takes, from today's state. Pure:
// the writer (supabase/addToToday.ts) re-reads the state right before it
// writes and asks this again, so a stale button can never write the wrong
// shape.
export type TodayKind = "none" | "pending" | "inProgress" | "completed" | "rested";

export interface TodayState {
  kind: TodayKind;
  /** The session the day shows (pickDaySession's choice); absent for "none". */
  sessionId?: string;
  /** The exercise is already an item of that session. */
  containsExercise: boolean;
  /** The session is a captured workout served whole: Today renders the
   *  served workout's items, not generated_session_items, so an appended
   *  item would be written but never shown. */
  servedWhole: boolean;
}

export type AddToTodayAction =
  | "append"        // pending session: one more main-block item
  | "appendLive"    // in-progress session: the item joins the remaining list
  | "create"        // no session yet: a user_pick session with just this item
  | "appendSecond"  // today completed: a second user_pick session
  | "confirmUnrest" // today rested: ask, un-rest, then create
  | "disabled";     // already in today's pending or live session, or that session is a served-whole workout

export interface AddToTodayPlan {
  action: AddToTodayAction;
  label: string;
}

export const ADD_TO_TODAY_LABEL = "Add to today";
export const IN_SESSION_LABEL = "In today's session";
export const SERVED_WHOLE_LABEL = "Today is a whole workout";
export const ADD_TO_TODAY_CAPTION = "Goes into today's session as a main-block movement";
export const ADD_TO_TODAY_ITEM_REASON = "Added from the exercise page";
export const ADDED_TOAST_TITLE = "Added to today";

export function planAddToToday(state: TodayState): AddToTodayPlan {
  if (state.containsExercise && (state.kind === "pending" || state.kind === "inProgress")) {
    return { action: "disabled", label: IN_SESSION_LABEL };
  }
  if (state.servedWhole && (state.kind === "pending" || state.kind === "inProgress")) {
    return { action: "disabled", label: SERVED_WHOLE_LABEL };
  }
  switch (state.kind) {
    case "pending": return { action: "append", label: ADD_TO_TODAY_LABEL };
    case "inProgress": return { action: "appendLive", label: ADD_TO_TODAY_LABEL };
    case "completed": return { action: "appendSecond", label: ADD_TO_TODAY_LABEL };
    case "rested": return { action: "confirmUnrest", label: ADD_TO_TODAY_LABEL };
    case "none": return { action: "create", label: ADD_TO_TODAY_LABEL };
  }
}
