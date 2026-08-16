// Pure validation of the capture-post AI extraction. Runs BEFORE anything is
// shown or written: the model's output is a proposal, and only names/ids that
// exist in this app survive. Mirrors the fuel-plan doctrine — the model may
// only speak in the vocabulary it was handed.
import type {
  CaptureCategory,
  CaptureSkillLevel,
  ExtractedExercise,
  ExtractedPost,
  ExtractedWorkoutItem,
} from "../types/capture";

const CATEGORIES: CaptureCategory[] = [
  "strength", "conditioning", "mobility", "stretching", "warmup", "skill",
];
const LEVELS: CaptureSkillLevel[] = ["Beginner", "Intermediate", "Advanced"];

export interface ValidVocabulary {
  /** exercises.id values the model was shown as its library index. */
  libraryIds: Set<string>;
  /** muscle_regions.name values. */
  muscles: Set<string>;
  /** equipment.name values. */
  equipment: Set<string>;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const names = (v: unknown, valid: Set<string>): string[] =>
  Array.isArray(v) ? v.filter((n): n is string => typeof n === "string" && valid.has(n)) : [];

function sanitizeExercise(raw: unknown, vocab: ValidVocabulary): ExtractedExercise | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name);
  if (!name) return null;

  const category = CATEGORIES.includes(r.category as CaptureCategory)
    ? (r.category as CaptureCategory)
    : "strength";
  // Unknown level defaults DOWN, not to the middle: 8 weeks detrained, the
  // conservative guess is the safe one.
  const skillLevel = LEVELS.includes(r.skill_level as CaptureSkillLevel)
    ? (r.skill_level as CaptureSkillLevel)
    : "Beginner";

  const matchId = str(r.library_match_id);
  return {
    name,
    description: str(r.description),
    category,
    skillLevel,
    primaryMuscles: names(r.primary_muscles, vocab.muscles),
    secondaryMuscles: names(r.secondary_muscles, vocab.muscles),
    equipment: names(r.equipment, vocab.equipment),
    libraryMatchId: matchId && vocab.libraryIds.has(matchId) ? matchId : null,
  };
}

/** Null means "nothing usable" — the sheet shows a retry/manual path. */
export function sanitizeExtraction(raw: unknown, vocab: ValidVocabulary): ExtractedPost | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const exercises = (Array.isArray(r.exercises) ? r.exercises : [])
    .map((e) => sanitizeExercise(e, vocab))
    .filter((e): e is ExtractedExercise => e !== null);
  if (exercises.length === 0) return null;

  let workout: ExtractedPost["workout"] = null;
  if (r.post_type === "full_workout" && typeof r.workout === "object" && r.workout !== null) {
    const w = r.workout as Record<string, unknown>;
    const items: ExtractedWorkoutItem[] = (Array.isArray(w.items) ? w.items : [])
      .map((item): ExtractedWorkoutItem | null => {
        if (typeof item !== "object" || item === null) return null;
        const i = item as Record<string, unknown>;
        const idx = typeof i.exercise_index === "number" ? i.exercise_index : -1;
        if (idx < 0 || idx >= exercises.length) return null;
        return {
          exerciseIndex: idx,
          sets: typeof i.sets === "number" ? i.sets : null,
          reps: str(i.reps),
          restSeconds: typeof i.rest_seconds === "number" ? i.rest_seconds : null,
          notes: str(i.notes),
        };
      })
      .filter((i): i is ExtractedWorkoutItem => i !== null);
    if (items.length > 0) {
      workout = { name: str(w.name) ?? "Captured workout", items };
    }
  }

  return {
    postType: workout ? "full_workout" : "single_exercise",
    exercises,
    workout,
  };
}

/** Where a capture category lands in the EXISTING reference tables.
 *  goal_types: MetCon, Strength, Skill, Mobility, Stretching, Recovery, Cool-Down.
 *  movement_categories: Weightlifting, Gymnastics, Monostructural, Recovery. */
export function mapCategory(category: CaptureCategory): {
  goalType: string;
  movementCategory: string;
} {
  switch (category) {
    case "strength":     return { goalType: "Strength",   movementCategory: "Weightlifting" };
    case "conditioning": return { goalType: "MetCon",     movementCategory: "Monostructural" };
    case "mobility":     return { goalType: "Mobility",   movementCategory: "Recovery" };
    case "stretching":   return { goalType: "Stretching", movementCategory: "Recovery" };
    case "warmup":       return { goalType: "Mobility",   movementCategory: "Recovery" };
    case "skill":        return { goalType: "Skill",      movementCategory: "Gymnastics" };
  }
}
