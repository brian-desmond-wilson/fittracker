// mobile/src/lib/workoutFilterStore.ts
// Last-used filters and sort for the Workouts tab, per user. Spec §7.
// A preference must never stop the list rendering: every failure here is a
// logged fallback to the defaults.
import { createPrefsStore, strings, oneOf } from "./filterPrefsStore";
import type { WorkoutFilters, WorkoutSort } from "../types/workoutFilters";
import { EMPTY_FILTERS, DEFAULT_SORT, ALL_SORTS } from "../types/workoutFilters";
import { coerceWorkoutAxes } from "./workoutFilterLink";

export interface WorkoutPrefs {
  filters: WorkoutFilters;
  sort: WorkoutSort;
}

/** Coerce whatever was stored into a valid preference set. Exported for
 *  tests; the tab only calls load/save. The eight filterable axes go through
 *  coerceWorkoutAxes — the same validation the workoutFilter link applies —
 *  so an unknown muscle name (or any other axis value the model no longer
 *  recognizes) is dropped here too, not just on the link. */
export function sanitizePrefs(raw: unknown): WorkoutPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (r.filters && typeof r.filters === "object" ? r.filters : {}) as Record<string, unknown>;
  const filters: WorkoutFilters = {
    ...EMPTY_FILTERS,
    ...coerceWorkoutAxes(f),
    creators: strings(f.creators),
    history: oneOf(f.history, ["never", "done"] as const) ?? "any",
  };
  return { filters, sort: oneOf(r.sort, ALL_SORTS) ?? DEFAULT_SORT };
}

const store = createPrefsStore<WorkoutPrefs>({
  keyPrefix: "training.workouts.filters.v1",
  defaults: { filters: EMPTY_FILTERS, sort: DEFAULT_SORT },
  sanitize: sanitizePrefs,
});

export const prefsKey = store.key;
export const loadWorkoutPrefs = store.load;
export const saveWorkoutPrefs = store.save;
