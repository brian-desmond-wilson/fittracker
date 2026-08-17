// Types for Daily Training Phase 1 — social capture.
// Spec: docs/superpowers/specs/2026-08-16-daily-training-design.md

export type CapturePlatform = "instagram" | "tiktok" | "other";

/** What the AI is allowed to call an exercise's role. Maps onto the existing
 *  goal_types / movement_categories reference tables in captureReview.ts. */
export type CaptureCategory =
  | "strength"
  | "conditioning"
  | "mobility"
  | "stretching"
  | "warmup"
  | "skill";

export type CaptureSkillLevel = "Beginner" | "Intermediate" | "Advanced";

/** capture-post { action: "resolve" } result. */
export interface ResolvedPost {
  platform: CapturePlatform;
  posterHandle: string | null;
  captionText: string | null;
  /** App-owned URL in the capture-thumbs bucket, already rehosted. */
  thumbnailUrl: string | null;
  /** True when the platform gave us nothing usable — the sheet must ask the
   *  user to paste the caption before extraction can run. */
  needsCaption: boolean;
}

/** One exercise as proposed by the AI, after sanitizing. */
export interface ExtractedExercise {
  name: string;
  description: string | null;
  category: CaptureCategory;
  skillLevel: CaptureSkillLevel;
  /** Names from the muscle_regions reference table, validated. */
  primaryMuscles: string[];
  secondaryMuscles: string[];
  /** Names from the equipment reference table, validated. */
  equipment: string[];
  /** Existing exercises.id when the AI matched a library entry, else null.
   *  Only ids present in the library index survive sanitizing. */
  libraryMatchId: string | null;
}

export interface ExtractedWorkoutItem {
  /** Index into ExtractedPost.exercises. */
  exerciseIndex: number;
  /** Per-exercise sets. NULL for circuits — the repetition lives in
   *  CapturedWorkout.rounds. Never inferred from a round count. */
  sets: number | null;
  /** Verbatim: "8", "8R/8L", "21-15-9", "AMRAP". */
  reps: string | null;
  /** Verbatim: "24kg", "bodyweight", "2x24kg". */
  weight: string | null;
  /** Verbatim: "30s", "30-45s", "hold to failure". */
  duration: string | null;
  restSeconds: number | null;
  notes: string | null;
}

/** The creator's programming for a whole post. */
export interface ExtractedWorkout {
  name: string;
  /** How many times through the whole list, as stated: "3-4". Null when the
   *  caption prescribes per-exercise sets instead of rounds. */
  rounds: string | null;
  /** The caption's prescription lines, verbatim — the lossless record behind
   *  the parsed items, shown when structure and reality disagree. */
  rawProtocol: string | null;
  /** One sentence saying what the workout IS — equipment, focus, creator —
   *  so a saved list reads as more than a column of names. Never a restatement
   *  of the movements; those are the items. */
  summary: string | null;
  items: ExtractedWorkoutItem[];
}

/** capture-post { action: "extract" } result, after sanitizing. */
export interface ExtractedPost {
  postType: "single_exercise" | "full_workout";
  exercises: ExtractedExercise[];
  workout: ExtractedWorkout | null;
}

/** A row in the Catalog tab: an exercise plus its capture provenance. */
/** The post an exercise was captured from — its provenance. */
export interface CaptureSource {
  sourceId: string;
  platform: CapturePlatform;
  sourceUrl: string;
  posterHandle: string | null;
  thumbnailUrl: string | null;
  capturedAt: string;
}

export interface CatalogEntry {
  exerciseId: string;
  name: string;
  skillLevel: CaptureSkillLevel | null;
  equipmentTypes: string[];
  /** [{ name, isPrimary }] from exercise_muscle_regions join. */
  muscles: { name: string; isPrimary: boolean }[];
  /** goal_types names from exercise_goal_types join. */
  goalTypes: string[];
  sources: CaptureSource[];
}

/** One movement inside a captured workout, as the creator prescribed it. */
export interface CapturedWorkoutItemEntry {
  exerciseId: string;
  name: string;
  sets: number | null;
  reps: string | null;
  weight: string | null;
  duration: string | null;
  restSeconds: number | null;
  notes: string | null;
}

/** A captured workout, ready to show. Phase 1 reads these; Phase 2 serves
 *  them whole. */
export interface CapturedWorkoutEntry {
  workoutId: string;
  name: string;
  rounds: string | null;
  rawProtocol: string | null;
  /** One sentence on what this workout is. Written at capture, editable after. */
  description: string | null;
  /** The owner's own note, not the creator's. Empty until they write one. */
  notes: string | null;
  capturedAt: string;
  source: {
    sourceId: string;
    platform: CapturePlatform;
    sourceUrl: string;
    posterHandle: string | null;
    thumbnailUrl: string | null;
    /** The post's caption, HTML-decoded — what the creator actually wrote. */
    captionText: string | null;
  } | null;
  items: CapturedWorkoutItemEntry[];
}

export interface CatalogFilters {
  muscle: string | null;
  equipment: string | null;
  category: string | null; // goal_types name
  handle: string | null;
  search: string;
}
