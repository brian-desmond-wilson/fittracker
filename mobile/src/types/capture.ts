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
  sets: number | null;
  reps: string | null;
  restSeconds: number | null;
  notes: string | null;
}

/** capture-post { action: "extract" } result, after sanitizing. */
export interface ExtractedPost {
  postType: "single_exercise" | "full_workout";
  exercises: ExtractedExercise[];
  workout: { name: string; items: ExtractedWorkoutItem[] } | null;
}

/** A row in the Catalog tab: an exercise plus its capture provenance. */
export interface CatalogEntry {
  exerciseId: string;
  name: string;
  skillLevel: CaptureSkillLevel | null;
  equipmentTypes: string[];
  /** [{ name, isPrimary }] from exercise_muscle_regions join. */
  muscles: { name: string; isPrimary: boolean }[];
  /** goal_types names from exercise_goal_types join. */
  goalTypes: string[];
  sources: {
    sourceId: string;
    platform: CapturePlatform;
    sourceUrl: string;
    posterHandle: string | null;
    thumbnailUrl: string | null;
    capturedAt: string;
  }[];
}

export interface CatalogFilters {
  muscle: string | null;
  equipment: string | null;
  category: string | null; // goal_types name
  handle: string | null;
  search: string;
}
