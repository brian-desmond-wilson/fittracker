// mobile/src/types/exerciseFilters.ts
// The Exercises tab's filter and sort vocabulary.
// Spec: docs/superpowers/specs/2026-09-10-exercises-tab-filters-design.md §5
import type { SkillLevel } from "./skillLevel";

export type PictureFilter = "any" | "has" | "missing";

/** Every axis. An empty list or "any" means the axis is off. */
export interface ExerciseFilters {
  creators: string[];
  /** Matches PRIMARY muscles only. */
  muscles: string[];
  /** The exercise's own equipment names, direct match. */
  equipment: string[];
  goalTypes: string[];
  skills: SkillLevel[];
  picture: PictureFilter;
}

export type ExerciseSort = "captured_desc" | "captured_asc" | "name";

export const EMPTY_EXERCISE_FILTERS: ExerciseFilters = {
  creators: [], muscles: [], equipment: [], goalTypes: [], skills: [], picture: "any",
};

export const DEFAULT_EXERCISE_SORT: ExerciseSort = "captured_desc";
export const ALL_EXERCISE_SORTS: ExerciseSort[] = ["captured_desc", "captured_asc", "name"];
export const ALL_PICTURE_FILTERS: PictureFilter[] = ["any", "has", "missing"];

export const EXERCISE_SORT_LABELS: Record<ExerciseSort, string> = {
  captured_desc: "Newest captured",
  captured_asc: "Oldest captured",
  name: "Name A–Z",
};

/** One group: three orders do not need headings between them. */
export const EXERCISE_SORT_GROUPS: { title: string; sorts: ExerciseSort[] }[] = [
  { title: "Order", sorts: ["captured_desc", "captured_asc", "name"] },
];

export const PICTURE_LABELS: Record<Exclude<PictureFilter, "any">, string> = {
  has: "Has picture",
  missing: "No picture",
};
