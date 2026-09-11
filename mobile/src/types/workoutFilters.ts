// mobile/src/types/workoutFilters.ts
// The Workouts tab's filter and sort vocabulary.
// Spec: docs/superpowers/specs/2026-09-10-workouts-tab-filters-design.md §5
import type { BlockRole, WorkoutIntensity, WorkoutFormat, WorkoutScoreType } from "./dailyBlocks";
import type { SkillLevel } from "./skillLevel";

export type LengthBand = "short" | "medium" | "long" | "xlong";
export type { SkillLevel } from "./skillLevel";
export type HistoryFilter = "any" | "never" | "done";

/** "untagged" matches workouts whose format the classifier has not set. */
export type FormatFilter = WorkoutFormat | "untagged";

/** Every axis. An empty list, null, or "any" means the axis is off. */
export interface WorkoutFilters {
  creators: string[];
  muscles: string[];
  equipment: string[];
  blockRoles: BlockRole[];
  formats: FormatFilter[];
  scores: WorkoutScoreType[];
  intensity: WorkoutIntensity | null;
  lengths: LengthBand[];
  skills: SkillLevel[];
  history: HistoryFilter;
}

export type WorkoutSort =
  | "captured_desc" | "captured_asc"
  | "last_done" | "stale" | "most_done"
  | "name" | "shortest" | "longest";

export const EMPTY_FILTERS: WorkoutFilters = {
  creators: [], muscles: [], equipment: [], blockRoles: [],
  formats: [], scores: [],
  intensity: null, lengths: [], skills: [], history: "any",
};

export const DEFAULT_SORT: WorkoutSort = "captured_desc";

export const ALL_SORTS: WorkoutSort[] = [
  "captured_desc", "captured_asc", "last_done", "stale", "most_done",
  "name", "shortest", "longest",
];

/** Minutes → band, by ceiling: a value belongs to the first band whose max
 *  holds it (≤15, ≤30, ≤45, else 45+). Labels are the mockup's rounded pill
 *  copy; `max` is the exact boundary. */
export const LENGTH_BANDS: { band: LengthBand; label: string; max: number }[] = [
  { band: "short",  label: "≤ 15 min", max: 15 },
  { band: "medium", label: "15–30",    max: 30 },
  { band: "long",   label: "30–45",    max: 45 },
  { band: "xlong",  label: "45+",      max: Number.POSITIVE_INFINITY },
];

export const SORT_LABELS: Record<WorkoutSort, string> = {
  captured_desc: "Newest captured",
  captured_asc: "Oldest captured",
  last_done: "Last done",
  stale: "Not done in a while",
  most_done: "Most done",
  name: "Name A–Z",
  shortest: "Shortest",
  longest: "Longest",
};

/** Sort sheet groups, in display order (mockup A2). */
export const SORT_GROUPS: { title: string; sorts: WorkoutSort[] }[] = [
  { title: "Captured", sorts: ["captured_desc", "captured_asc"] },
  { title: "History", sorts: ["last_done", "stale", "most_done"] },
  { title: "Workout", sorts: ["name", "shortest", "longest"] },
];

export const SORT_SUBLABELS: Partial<Record<WorkoutSort, string>> = {
  last_done: "Most recently trained first",
  stale: "Never-done workouts rise to the top",
};

/** The five roles the filter offers. "bfr" is built-in-only and never a
 *  catalog workout's tag (see types/dailyBlocks.ts), so it is not offered. */
export const FILTERABLE_ROLES: BlockRole[] = ["warmup", "mobility", "main", "conditioning", "cooldown"];
export const ALL_INTENSITIES: WorkoutIntensity[] = ["low", "moderate", "high"];
export const INTENSITY_LABELS: Record<WorkoutIntensity, string> = { low: "Low", moderate: "Moderate", high: "High" };
export const HISTORY_LABELS: Record<Exclude<HistoryFilter, "any">, string> = { never: "Never done", done: "Done before" };
export { ALL_SKILLS } from "./skillLevel";
