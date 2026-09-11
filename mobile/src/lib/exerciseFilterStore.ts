// mobile/src/lib/exerciseFilterStore.ts
// Last-used filters and sort for the Exercises tab, per user. Its own key,
// so the Workouts and Exercises tabs never share a filter set. Spec §7.
import type { ExerciseFilters, ExerciseSort } from "../types/exerciseFilters";
import {
  EMPTY_EXERCISE_FILTERS, DEFAULT_EXERCISE_SORT, ALL_EXERCISE_SORTS, ALL_PICTURE_FILTERS,
} from "../types/exerciseFilters";
import { ALL_SKILLS } from "../types/skillLevel";
import { createPrefsStore } from "./filterPrefsStore";

export interface ExercisePrefs {
  filters: ExerciseFilters;
  sort: ExerciseSort;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
const manyOf = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  strings(v).filter((x): x is T => (allowed as readonly string[]).includes(x));

/** Coerce whatever was stored into a valid preference set. Free-text axes
 *  (a creator, a muscle, an equipment or goal-type name) are kept as-is: a
 *  value the catalog no longer has simply matches nothing and its chip
 *  stays removable. Closed enums are checked. */
export function sanitizeExercisePrefs(raw: unknown): ExercisePrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (r.filters && typeof r.filters === "object" ? r.filters : {}) as Record<string, unknown>;
  const filters: ExerciseFilters = {
    creators: strings(f.creators),
    muscles: strings(f.muscles),
    equipment: strings(f.equipment),
    goalTypes: strings(f.goalTypes),
    skills: manyOf(f.skills, ALL_SKILLS),
    picture: oneOf(f.picture, ALL_PICTURE_FILTERS) ?? "any",
  };
  return { filters, sort: oneOf(r.sort, ALL_EXERCISE_SORTS) ?? DEFAULT_EXERCISE_SORT };
}

const store = createPrefsStore<ExercisePrefs>({
  keyPrefix: "training.exercises.filters.v1",
  defaults: { filters: EMPTY_EXERCISE_FILTERS, sort: DEFAULT_EXERCISE_SORT },
  sanitize: sanitizeExercisePrefs,
});

export const exercisePrefsKey = store.key;
export const loadExercisePrefs = store.load;
export const saveExercisePrefs = store.save;
