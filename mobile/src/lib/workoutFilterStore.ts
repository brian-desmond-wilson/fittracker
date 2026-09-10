// mobile/src/lib/workoutFilterStore.ts
// Last-used filters and sort for the Workouts tab, per user. Spec §7.
// A preference must never stop the list rendering: every failure here is a
// logged fallback to the defaults.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WorkoutFilters, WorkoutSort } from "../types/workoutFilters";
import {
  EMPTY_FILTERS, DEFAULT_SORT, ALL_SORTS, FILTERABLE_ROLES, ALL_INTENSITIES,
  ALL_SKILLS, LENGTH_BANDS,
} from "../types/workoutFilters";

export interface WorkoutPrefs {
  filters: WorkoutFilters;
  sort: WorkoutSort;
}

export const prefsKey = (userId: string) => `training.workouts.filters.v1:${userId}`;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;
const manyOf = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  strings(v).filter((x): x is T => (allowed as readonly string[]).includes(x));

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
    intensity: oneOf(f.intensity, ALL_INTENSITIES),
    lengths: manyOf(f.lengths, LENGTH_BANDS.map((b) => b.band)),
    skills: manyOf(f.skills, ALL_SKILLS),
    history: oneOf(f.history, ["never", "done"] as const) ?? "any",
  };
  return { filters, sort: oneOf(r.sort, ALL_SORTS) ?? DEFAULT_SORT };
}

export async function loadWorkoutPrefs(userId: string): Promise<WorkoutPrefs> {
  try {
    const raw = await AsyncStorage.getItem(prefsKey(userId));
    if (!raw) return { filters: EMPTY_FILTERS, sort: DEFAULT_SORT };
    return sanitizePrefs(JSON.parse(raw));
  } catch (e) {
    console.warn("loadWorkoutPrefs fell back to defaults:", e);
    return { filters: EMPTY_FILTERS, sort: DEFAULT_SORT };
  }
}

export async function saveWorkoutPrefs(userId: string, prefs: WorkoutPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
  } catch (e) {
    console.warn("saveWorkoutPrefs failed:", e);
  }
}
