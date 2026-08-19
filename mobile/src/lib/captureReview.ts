// Pure validation of the capture-post AI extraction. Runs BEFORE anything is
// shown or written: the model's output is a proposal, and only names/ids that
// exist in this app survive. Mirrors the fuel-plan doctrine — the model may
// only speak in the vocabulary it was handed.
import { decodeCaption } from "./captionText";
import type {
  CaptureCategory,
  CaptureSkillLevel,
  ExtractedExercise,
  ExtractedPost,
  ExtractedWorkout,
  ExtractedWorkoutItem,
  WorkoutGap,
} from "../types/capture";
import type { GoalTypeName, MovementCategoryName } from "../types/crossfit";

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

/** A round count is a quantity ("3", "3-4", "AMRAP 20 min"), and it renders
 *  next to a movement count. Prose there would read as nonsense, so anything
 *  without a digit — or long enough to be a sentence — is dropped. */
const rounds = (v: unknown): string | null => {
  const s = str(v);
  if (!s || s.length > 24 || !/\d/.test(s)) return null;
  return s;
};

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
  // The model happily lists a muscle in both roles ("Shoulders" primary AND
  // secondary). Downstream, the pair becomes two junction inserts for one
  // (exercise, muscle) and the save dies on the unique index — so primary
  // wins and both lists dedupe here, where it's testable.
  const primaryMuscles = [...new Set(names(r.primary_muscles, vocab.muscles))];
  const primarySet = new Set(primaryMuscles);
  const secondaryMuscles = [...new Set(names(r.secondary_muscles, vocab.muscles))]
    .filter((m) => !primarySet.has(m));
  return {
    name,
    description: str(r.description),
    category,
    skillLevel,
    primaryMuscles,
    secondaryMuscles,
    equipment: [...new Set(names(r.equipment, vocab.equipment))],
    libraryMatchId: matchId && vocab.libraryIds.has(matchId) ? matchId : null,
  };
}

/** Null means "nothing usable" — the sheet shows a retry/manual path. */
export function sanitizeExtraction(raw: unknown, vocab: ValidVocabulary): ExtractedPost | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  // Dropping an invalid exercise shifts every index after it, and the
  // workout items below refer to the model's ORIGINAL indexes — so record
  // old→new for survivors and translate items through it. Without this, a
  // dropped exercise silently reattaches prescriptions to the wrong movement.
  const rawExercises = Array.isArray(r.exercises) ? r.exercises : [];
  const exercises: ExtractedExercise[] = [];
  const indexMap = new Map<number, number>();
  rawExercises.forEach((e, oldIdx) => {
    const cleaned = sanitizeExercise(e, vocab);
    if (cleaned) {
      indexMap.set(oldIdx, exercises.length);
      exercises.push(cleaned);
    }
  });
  if (exercises.length === 0) return null;

  let workout: ExtractedPost["workout"] = null;
  if (r.post_type === "full_workout" && typeof r.workout === "object" && r.workout !== null) {
    const w = r.workout as Record<string, unknown>;
    const items: ExtractedWorkoutItem[] = (Array.isArray(w.items) ? w.items : [])
      .map((item): ExtractedWorkoutItem | null => {
        if (typeof item !== "object" || item === null) return null;
        const i = item as Record<string, unknown>;
        const rawIdx = typeof i.exercise_index === "number" ? i.exercise_index : -1;
        // Translate the model's index into the survivors' numbering; an item
        // whose exercise was dropped (or never existed) goes with it.
        const idx = indexMap.get(rawIdx);
        if (idx === undefined) return null;
        return {
          exerciseIndex: idx,
          // Left NULL for circuits. A round count is NOT a set count, and
          // turning one into the other rewrites the creator's workout.
          sets: typeof i.sets === "number" ? i.sets : null,
          reps: str(i.reps),
          weight: str(i.weight),
          duration: str(i.duration),
          restSeconds: typeof i.rest_seconds === "number" ? i.rest_seconds : null,
          notes: str(i.notes),
        };
      })
      .filter((i): i is ExtractedWorkoutItem => i !== null);
    if (items.length > 0) {
      workout = {
        name: str(w.name) ?? "Captured workout",
        rounds: rounds(w.rounds),
        rawProtocol: str(w.raw_protocol),
        summary: str(w.summary),
        items,
      };
    }
  }

  // A post with several movements and no workout is the case that reads as a
  // half-finished import. Say which kind it is so the sheet can explain it and
  // offer the manual build; one exercise on its own is not a gap.
  let workoutGap: WorkoutGap | null = null;
  if (!workout && exercises.length > 1) {
    workoutGap = r.post_type === "full_workout" ? "unusable_prescription" : "no_prescription";
  }

  return {
    postType: workout ? "full_workout" : "single_exercise",
    exercises,
    workout,
    workoutGap,
  };
}

/** Instagram's embed hands back the caption wrapped in attribution:
 *  `mattycfox on September 4, 2023: "Single Kettlebell Upper Body 💪🔥…`.
 *  The creator's own headline is what a workout should be called, so strip the
 *  wrapper and take the first line. */
const EMBED_PREFIX = /^.{0,80}? on .{0,40}?\d{4}:\s*["“]?/;
// Emoji, separators and punctuation: a name ends at its last word. Written
// without unicode property escapes, which Hermes does not support — and the
// surrogate range is what actually catches an emoji outside the BMP.
const JUNK = "\\s\\u2000-\\u3300\\uD800-\\uDFFF\\uFE0F\\u200D|.,;:!?*\\-\"'";
const TRAILING_JUNK = new RegExp(`[${JUNK}]+$`);
const LEADING_JUNK = new RegExp(`^[${JUNK}]+`);

/** A starting name for a workout the user is building by hand, taken from the
 *  caption. Only a suggestion — the sheet puts it in an editable field. */
export function draftWorkoutName(caption: string | null | undefined): string {
  const decoded = decodeCaption(caption).replace(EMBED_PREFIX, "");
  const line = decoded.split("\n")[0] ?? "";
  const trimmed = line.replace(LEADING_JUNK, "").replace(TRAILING_JUNK, "");
  if (trimmed === "") return "Captured workout";
  if (trimmed.length <= 60) return trimmed;
  // Cut at a word boundary so a truncated name still reads as words.
  const cut = trimmed.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(TRAILING_JUNK, "");
}

/** The workout a user builds when the AI found only exercises: every movement
 *  in caption order, every target blank. Blank is the honest default — the
 *  caption never said, and the sheet is where the user fills it in. */
export function draftWorkoutFromExercises(
  post: Pick<ExtractedPost, "exercises">,
  name: string,
): ExtractedWorkout {
  return {
    name,
    rounds: null,
    // No raw protocol: there was no prescription in the post to quote.
    rawProtocol: null,
    summary: null,
    items: post.exercises.map((_, exerciseIndex) => ({
      exerciseIndex,
      sets: null,
      reps: null,
      weight: null,
      duration: null,
      restSeconds: null,
      notes: null,
    })),
  };
}

/** Where a capture category lands in the EXISTING reference tables.
 *  goal_types: MetCon, Strength, Skill, Mobility, Stretching, Recovery, Cool-Down.
 *  movement_categories: Weightlifting, Gymnastics, Monostructural, Recovery. */
export function mapCategory(category: CaptureCategory): {
  goalType: GoalTypeName;
  movementCategory: MovementCategoryName;
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
