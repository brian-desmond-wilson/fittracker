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
}

export const ADD_TO_DAY_LABEL = "Add to a day";

/** `dayLabel` is how the sheet names the day: "Today", "Tomorrow", "Tuesday", "14 Sep". */
export function planAddToDay(state: DayState, dayLabel: string): AddToDayPlan {
  if (state.servesThisWorkout && (state.kind === "pending" || state.kind === "inProgress")) {
    return { action: "disabled", label: `${dayLabel} is already this workout`, confirm: null };
  }
  switch (state.kind) {
    case "none":
      return { action: "adopt", label: ADD_TO_DAY_LABEL, confirm: null };
    case "pending":
      return {
        action: "confirmReplace", label: ADD_TO_DAY_LABEL,
        confirm: {
          title: `${dayLabel} already has a session planned.`,
          body: "It'll be set aside and this workout takes its place.",
          go: "Replace",
        },
      };
    case "inProgress":
      return {
        action: "confirmReplace", label: ADD_TO_DAY_LABEL,
        confirm: {
          title: `${dayLabel} already has a session planned.`,
          body: "You're partway through it — what you've logged is kept, and this workout takes the rest of the day.",
          go: "Replace",
        },
      };
    case "completed":
      return { action: "addSecond", label: ADD_TO_DAY_LABEL, confirm: null };
    case "rested":
      return {
        action: "confirmUnrest", label: ADD_TO_DAY_LABEL,
        confirm: {
          title: `${dayLabel} is a rest day.`,
          body: "Adding this makes it a training day.",
          go: "Add anyway",
        },
      };
  }
}
