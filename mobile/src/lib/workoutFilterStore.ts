// mobile/src/lib/workoutFilterStore.ts
// Last-used filters and sort for the Workouts tab, per user. Spec §7.
// A preference must never stop the list rendering: every failure here is a
// logged fallback to the defaults.
import { createPrefsStore, strings, oneOf, manyOf } from "./filterPrefsStore";
import type { WorkoutFilters, WorkoutSort } from "../types/workoutFilters";
import {
  EMPTY_FILTERS, DEFAULT_SORT, ALL_SORTS, FILTERABLE_ROLES, ALL_INTENSITIES,
  ALL_SKILLS, LENGTH_BANDS,
} from "../types/workoutFilters";
import { ALL_FORMATS, ALL_SCORES } from "./workoutFormatVocab";

export interface WorkoutPrefs {
  filters: WorkoutFilters;
  sort: WorkoutSort;
}

/** Coerce whatever was stored into a valid preference set. Exported for
 *  tests; the tab only calls load/save. */
export function sanitizePrefs(raw: unknown): WorkoutPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (r.filters && typeof r.filters === "object" ? r.filters : {}) as Record<string, unknown>;
  const filters: WorkoutFilters = {
    creators: strings(f.creators),
    muscles: strings(f.muscles),
    equipment: strings(f.equipment),
    blockRoles: manyOf(f.blockRoles, FILTERABLE_ROLES),
    formats: manyOf(f.formats, [...ALL_FORMATS, "untagged"] as const),
    scores: manyOf(f.scores, ALL_SCORES),
    intensity: oneOf(f.intensity, ALL_INTENSITIES),
    lengths: manyOf(f.lengths, LENGTH_BANDS.map((b) => b.band)),
    skills: manyOf(f.skills, ALL_SKILLS),
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
