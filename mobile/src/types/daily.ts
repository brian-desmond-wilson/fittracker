// Types for Daily Training Phase 2 — the daily loop.
// Spec: docs/superpowers/specs/2026-08-16-daily-training-design.md §3, §5.
import type { StoredBlock } from "./dailyBlocks";

export type SplitDay = "push" | "pull" | "legs";
/** `mobility` is the block recommender's dynamic warm-up phase, sitting
 *  between the warm-up and the main work. */
export type SessionSection = "warmup" | "mobility" | "main" | "accessory" | "bfr" | "cooldown";
export type SkillStateLevel = "beginner" | "intermediate" | "advanced";

export interface GymProfile {
  id: string;
  name: string;
  location: string | null;
  preset: "full_gym" | "hotel_gym" | "bodyweight" | "custom";
  isActive: boolean;
  /** equipment.name values checked for this gym. */
  equipmentNames: string[];
}

export interface DailyCheckin {
  id: string;
  checkinDate: string; // YYYY-MM-DD
  energy: number; // 1-10
  minutesAvailable: number;
  /** muscle_regions.name → severity 1-3 */
  soreness: Record<string, number>;
}

/** One exercise as the rules tier sees it — assembled by daily.ts, consumed
 *  by the pure modules. */
export interface SessionCandidate {
  exerciseId: string;
  name: string;
  skillLevel: "Beginner" | "Intermediate" | "Advanced" | null;
  goalTypes: string[];
  muscles: { name: string; isPrimary: boolean }[];
  /** Raw equipment_types values — normalize before matching. */
  equipmentTypes: string[];
  isCapture: boolean;
  lastPerformedDaysAgo: number | null; // null = never
}

/** A candidate after filtering/ranking/progression, ready for composition. */
export interface RankedCandidate extends SessionCandidate {
  section: SessionSection; // warmup | main | cooldown pool (accessory/bfr derive from main)
  soreDowngrade: boolean;
  /** Set when progression resolution swapped in an easier movement. */
  regressedFromId: string | null;
  /**
   * True when nothing in the catalog says what this movement needs, so the
   * gym gate could not be applied to it. Most of the library is untagged, so
   * these stay in play — but they rank below verified fits and are labelled
   * as unverified for the model.
   */
  equipmentUnknown: boolean;
}

export interface SectionPlan {
  section: SessionSection;
  slots: number;
  targetSets: number;
  targetReps: string;
  restSeconds: number | null;
}

export interface SessionItem {
  exerciseId: string;
  section: SessionSection;
  itemOrder: number;
  targetSets: number | null;
  targetReps: string | null;
  restSeconds: number | null;
  reason: string | null;
}

/**
 * How long each section should take, in whole minutes. A section with no
 * items has no entry — the tab shows an estimate only where there is work.
 */
export type SectionMinutes = Partial<Record<SessionSection, number>>;

export interface ComposedSession {
  /** NULL for a workout served whole — an unstamped session does not advance
   *  the rotation (spec 2026-08-17-start-catalog-workout §5). */
  splitDay: SplitDay | null;
  rampWeek: number;
  source: "ai" | "rules_fallback" | "user_pick";
  servedCapturedWorkoutId: string | null;
  items: SessionItem[];
  sectionMinutes: SectionMinutes;
}

/** A stored generated_sessions row with items joined for display. */
export interface StoredSession extends ComposedSession {
  id: string;
  sessionDate: string;
  status: "suggested" | "accepted" | "completed" | "skipped";
  workoutInstanceId: string | null;
  gymProfileId: string | null;
  items: (SessionItem & { id: string; name: string; wasPerformed: boolean | null })[];
  /** Empty for pre-block sessions and workouts served whole. */
  blocks: StoredBlock[];
}
