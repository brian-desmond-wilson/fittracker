// mobile/src/lib/exerciseFilterLink.ts
// A muscle chip, an equipment tile or a creator handle on the exercise page
// opens the Exercises tab with that ONE value applied on top of the reader's
// saved filters (spec §4.4). The value rides the route as JSON in the
// `exerciseFilter` param; the tab consumes and clears it like `shareUrl`.
import type { ExerciseFilters } from "../types/exerciseFilters";
import { MUSCLE_GROUPS } from "./dailyCoverage";
import { strings } from "./filterPrefsStore";
import { ALL_SKILLS } from "../types/skillLevel";
import type { SkillLevel } from "../types/skillLevel";

export const EXERCISE_FILTER_PARAM = "exerciseFilter";

/** The axes a chip can name. */
export type ExerciseFilterLink = Partial<Pick<ExerciseFilters,
  "creators" | "muscles" | "equipment" | "goalTypes" | "skills" | "categories" | "tiers" | "scoringTypes">>;

const KNOWN_MUSCLES = new Set(MUSCLE_GROUPS.flatMap((g) => g.muscles));

function nums(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : [];
}

export function exerciseFilterParam(link: ExerciseFilterLink): string {
  return JSON.stringify(link);
}

/** Null means "open the tab with no extra filter" — junk, or a value the
 *  filter model cannot represent (spec §8). */
export function parseExerciseFilterParam(raw: unknown): ExerciseFilterLink | null {
  if (typeof raw !== "string" || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const r = parsed as Record<string, unknown>;
  const link: ExerciseFilterLink = {};
  const creators = strings(r.creators);
  const muscles = strings(r.muscles).filter((m) => KNOWN_MUSCLES.has(m));
  const equipment = strings(r.equipment);
  const goalTypes = strings(r.goalTypes);
  const skills = strings(r.skills).filter((s): s is SkillLevel => (ALL_SKILLS as string[]).includes(s));
  const categories = strings(r.categories);
  const scoringTypes = strings(r.scoringTypes);
  const tiers = nums(r.tiers).filter((n) => n >= 0 && n <= 3);
  if (creators.length > 0) link.creators = creators;
  if (muscles.length > 0) link.muscles = muscles;
  if (equipment.length > 0) link.equipment = equipment;
  if (goalTypes.length > 0) link.goalTypes = goalTypes;
  if (skills.length > 0) link.skills = skills;
  if (categories.length > 0) link.categories = categories;
  if (scoringTypes.length > 0) link.scoringTypes = scoringTypes;
  if (tiers.length > 0) link.tiers = tiers;
  return Object.keys(link).length > 0 ? link : null;
}

const union = <T>(a: T[], b: T[] | undefined): T[] =>
  b ? [...a, ...b.filter((v) => !a.includes(v))] : [...a];

/** Saved filters with the link's values added. Fresh arrays: the result lands in React state. */
export function mergeExerciseFilters(base: ExerciseFilters, link: ExerciseFilterLink): ExerciseFilters {
  return {
    ...base,
    creators: union(base.creators, link.creators),
    muscles: union(base.muscles, link.muscles),
    equipment: union(base.equipment, link.equipment),
    goalTypes: union(base.goalTypes, link.goalTypes),
    skills: union(base.skills, link.skills),
    categories: union(base.categories, link.categories),
    tiers: union(base.tiers, link.tiers),
    scoringTypes: union(base.scoringTypes, link.scoringTypes),
  };
}
