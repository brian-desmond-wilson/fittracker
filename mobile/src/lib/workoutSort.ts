// The eight orders of the Workouts tab. Pure; sorts a copy. Spec §5.2.
import type { CapturedWorkoutEntry } from "../types/capture";
import type { WorkoutSort } from "../types/workoutFilters";
import type { CompletionMap } from "./workoutCompletion";
import { sortByStaleness } from "./workoutCompletion";

type Cmp = (a: CapturedWorkoutEntry, b: CapturedWorkoutEntry) => number;

/** Compared as instants, not strings: Postgres trims trailing zeros from
 *  fractional seconds and may write "+00:00" or "Z", and two spellings of the
 *  same moment must not sort apart. An unparseable stamp is null and sorts
 *  last in either direction, like an untimed workout under shortest/longest:
 *  a data problem must never land at the top of the list. */
const capturedMs = (w: CapturedWorkoutEntry): number | null => {
  const ms = Date.parse(w.capturedAt);
  return Number.isNaN(ms) ? null : ms;
};
const byCaptured = (dir: 1 | -1): Cmp => (a, b) => {
  const ma = capturedMs(a);
  const mb = capturedMs(b);
  if (ma === null && mb === null) return 0;
  if (ma === null) return 1;
  if (mb === null) return -1;
  return (ma - mb) * dir;
};
const capturedDesc: Cmp = byCaptured(-1);
const capturedAsc: Cmp = byCaptured(1);
const name: Cmp = (a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || capturedDesc(a, b);

/** Nulls last in both directions: "shortest" must not open with the
 *  workouts nobody has timed. */
const byMinutes = (dir: 1 | -1): Cmp => (a, b) => {
  const ma = a.tags.estMinutes;
  const mb = b.tags.estMinutes;
  if (ma === null && mb === null) return capturedDesc(a, b);
  if (ma === null) return 1;
  if (mb === null) return -1;
  return (ma - mb) * dir || capturedDesc(a, b);
};

export function sortWorkouts(
  entries: CapturedWorkoutEntry[],
  sort: WorkoutSort,
  completions: CompletionMap,
  today: string,
): CapturedWorkoutEntry[] {
  const list = [...entries];
  switch (sort) {
    case "captured_desc": return list.sort(capturedDesc);
    case "captured_asc": return list.sort(capturedAsc);
    case "name": return list.sort(name);
    case "shortest": return list.sort(byMinutes(1));
    case "longest": return list.sort(byMinutes(-1));
    case "stale":
      // Stable, so pre-sorting newest-first fixes the never-done group's order.
      return sortByStaleness(list.sort(capturedDesc), (w) => w.workoutId, completions, today);
    case "last_done":
      return list.sort((a, b) => {
        const ca = completions[a.workoutId];
        const cb = completions[b.workoutId];
        if (!ca && !cb) return capturedDesc(a, b);
        if (!ca) return 1;
        if (!cb) return -1;
        return cb.lastCompleted.localeCompare(ca.lastCompleted) || capturedDesc(a, b);
      });
    case "most_done":
      return list.sort((a, b) => {
        const ca = completions[a.workoutId];
        const cb = completions[b.workoutId];
        if (!ca && !cb) return capturedDesc(a, b);
        if (!ca) return 1;
        if (!cb) return -1;
        return (cb.count - ca.count)
          || cb.lastCompleted.localeCompare(ca.lastCompleted)
          || capturedDesc(a, b);
      });
    default: {
      // A ninth order added to WorkoutSort must be handled here, not fall out
      // as undefined.
      const unhandled: never = sort;
      throw new Error(`unhandled sort ${String(unhandled)}`);
    }
  }
}
