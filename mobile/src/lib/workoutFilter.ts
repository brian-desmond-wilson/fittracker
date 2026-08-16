// Searching captured workouts. Same doctrine as the exercise catalog: the
// whole set is one query's result, so the search runs here — instant, offline,
// testable.
//
// Movement names are searchable because that is how you actually look for a
// captured workout: you remember the halo, not the caption's title.
import type { CapturedWorkoutEntry } from "../types/capture";

export function filterWorkouts(
  entries: CapturedWorkoutEntry[],
  search: string,
): CapturedWorkoutEntry[] {
  const q = search.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((w) => {
    if (w.name.toLowerCase().includes(q)) return true;
    if (w.source?.posterHandle?.toLowerCase().includes(q)) return true;
    return w.items.some((i) => i.name.toLowerCase().includes(q));
  });
}
