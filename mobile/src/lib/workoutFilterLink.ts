// mobile/src/lib/workoutFilterLink.ts
// A stat cell, a role pill, a muscle chip or an equipment tile on the
// workout page opens the Workouts tab with that ONE value applied on top of
// the reader's saved filters (spec 2026-09-13 §4.3–4.7). The value rides
// the route as JSON in the `workoutFilter` param; the tab consumes and
// clears it like `shareUrl`. Mirror of exerciseFilterLink.ts.
import type { WorkoutFilters } from "../types/workoutFilters";
import { FILTERABLE_ROLES, ALL_INTENSITIES, ALL_SKILLS, LENGTH_BANDS } from "../types/workoutFilters";
import { ALL_FORMATS, ALL_SCORES } from "./workoutFormatVocab";
import { MUSCLE_GROUPS } from "./dailyCoverage";
import { strings, oneOf, manyOf } from "./filterPrefsStore";

export const WORKOUT_FILTER_PARAM = "workoutFilter";

/** The axes a chip can name. Creators and history are not linked from the page. */
export type WorkoutFilterLink = Partial<Pick<WorkoutFilters,
  "muscles" | "equipment" | "blockRoles" | "formats" | "scores" | "intensity" | "lengths" | "skills">>;

const KNOWN_MUSCLES = new Set(MUSCLE_GROUPS.flatMap((g) => g.muscles));

export function workoutFilterParam(link: WorkoutFilterLink): string {
  return JSON.stringify(link);
}

/** The per-axis coercion shared by the workoutFilter link and the prefs
 *  store: validate each of the eight filterable axes and hand back only the
 *  ones that survive — a non-empty array, or a non-null intensity. Muscles
 *  are additionally filtered to KNOWN_MUSCLES, so a name the app no longer
 *  recognizes (renamed or retired) is dropped rather than carried forward
 *  wherever this runs, including the prefs store. */
export function coerceWorkoutAxes(
  r: Record<string, unknown>,
): Partial<Pick<WorkoutFilters, "muscles" | "equipment" | "blockRoles" | "formats" | "scores" | "intensity" | "lengths" | "skills">> {
  const out: ReturnType<typeof coerceWorkoutAxes> = {};
  const muscles = strings(r.muscles).filter((m) => KNOWN_MUSCLES.has(m));
  const equipment = strings(r.equipment);
  const blockRoles = manyOf(r.blockRoles, FILTERABLE_ROLES);
  const formats = manyOf(r.formats, [...ALL_FORMATS, "untagged"] as const);
  const scores = manyOf(r.scores, ALL_SCORES);
  const intensity = oneOf(r.intensity, ALL_INTENSITIES);
  const lengths = manyOf(r.lengths, LENGTH_BANDS.map((b) => b.band));
  const skills = manyOf(r.skills, ALL_SKILLS);
  if (muscles.length > 0) out.muscles = muscles;
  if (equipment.length > 0) out.equipment = equipment;
  if (blockRoles.length > 0) out.blockRoles = blockRoles;
  if (formats.length > 0) out.formats = formats;
  if (scores.length > 0) out.scores = scores;
  if (intensity !== null) out.intensity = intensity;
  if (lengths.length > 0) out.lengths = lengths;
  if (skills.length > 0) out.skills = skills;
  return out;
}

/** Null means "open the tab with no extra filter" — junk, or values the
 *  filter model cannot represent. */
export function parseWorkoutFilterParam(raw: unknown): WorkoutFilterLink | null {
  if (typeof raw !== "string" || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const r = parsed as Record<string, unknown>;
  const link: WorkoutFilterLink = coerceWorkoutAxes(r);
  return Object.keys(link).length > 0 ? link : null;
}

const union = <T>(a: T[], b: T[] | undefined): T[] =>
  b ? [...a, ...b.filter((v) => !a.includes(v))] : [...a];

/** Saved filters with the link's values added. Fresh arrays: the result lands in React state. */
export function mergeWorkoutFilters(base: WorkoutFilters, link: WorkoutFilterLink): WorkoutFilters {
  return {
    ...base,
    muscles: union(base.muscles, link.muscles),
    equipment: union(base.equipment, link.equipment),
    blockRoles: union(base.blockRoles, link.blockRoles),
    formats: union(base.formats, link.formats),
    scores: union(base.scores, link.scores),
    intensity: link.intensity ?? base.intensity,
    lengths: union(base.lengths, link.lengths),
    skills: union(base.skills, link.skills),
  };
}
