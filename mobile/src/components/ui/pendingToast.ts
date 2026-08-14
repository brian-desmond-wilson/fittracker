// mobile/src/components/ui/pendingToast.ts
//
// A toast raised by the screen you are LEAVING, shown by the screen you land
// on.
//
// The edit screen finishes a save and pops; an acknowledgement it renders
// itself would be gone before it faded in. Route params cannot carry it either
// — going back pops to a screen already in the stack, and an undo is a closure
// over a snapshot, not something that survives a URL. So the leaving screen
// leaves the message here and the arriving screen takes it on focus.
//
// Deliberately a single slot, and deliberately take-once: two acknowledgements
// in flight at the same time would mean two saves nobody watched, and a message
// that could be taken twice would reappear on every later focus of the same
// screen.
import type { UndoToastContent } from "./UndoToast";

/** Like `UndoToastContent`, but the undo may be a write that takes a moment —
 *  the screen that shows it awaits, then refreshes itself. */
export interface PendingToast extends Omit<UndoToastContent, "undo"> {
  undo?: () => Promise<void>;
}

let pending: PendingToast | null = null;

/** Leave a message for whatever screen comes next. Overwrites any message not
 *  yet collected: the newest action is the one worth acknowledging. */
export function handOffToast(toast: PendingToast): void {
  pending = toast;
}

/** Collect it, once. Null when there is nothing waiting, which is the common
 *  case — every focus of every screen that reads this. */
export function takeHandedOffToast(): PendingToast | null {
  const t = pending;
  pending = null;
  return t;
}
