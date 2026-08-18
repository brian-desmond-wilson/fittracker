// Types for the block recommender — whole-workout daily composition.
// Spec: docs/superpowers/specs/2026-08-18-daily-session-recommender-design.md.

/**
 * The five blocks of a day, in the order they are performed.
 *
 * These are NOT interchangeable with SessionSection in ./daily. When a block's
 * work explodes into generated_session_items for logging, `conditioning` is
 * persisted as the existing `accessory` section — writing `section:
 * "conditioning"` violates that table's CHECK at runtime (spec §7). The
 * `bfr` section has no block at all; it belongs to the deferred exercise-level
 * phase.
 */
export type BlockRole = "warmup" | "mobility" | "main" | "conditioning" | "cooldown";
export type WorkoutIntensity = "low" | "moderate" | "high";
export type BodyFocus = "upper" | "lower" | "full";

export interface WorkoutMuscle {
  name: string; // muscle_regions.name, verbatim
  isPrimary: boolean;
}

/** AI-assigned at capture, user-editable. classifiedAt null = untagged —
 *  excluded from recommendation until tagged (spec §8). */
export interface WorkoutTags {
  blockRoles: BlockRole[];
  muscles: WorkoutMuscle[];
  estMinutes: number | null;
  intensity: WorkoutIntensity | null;
  skillLevel: "Beginner" | "Intermediate" | "Advanced" | null;
  classifiedAt: string | null;
}

/** A catalog workout as the rules tier sees it. */
export interface TaggedWorkout {
  workoutId: string;
  name: string;
  rounds: string | null; // creator's rounds prescription, e.g. "3-4"
  tags: WorkoutTags;
  lastPerformedDaysAgo: number | null; // from the usage ledger; null = never
}

/** One ledger row (captured_workout_usage). */
export interface UsageRow {
  /** Null once the workout is deleted — the training still happened, and the
   *  muscles below are the record of it. */
  capturedWorkoutId: string | null;
  performedDate: string; // YYYY-MM-DD
  block: BlockRole;
  muscles: WorkoutMuscle[];
}

/** A shipped fallback routine — static app data, not a database row. */
export interface BuiltinRoutine {
  key: string; // stable id, e.g. "builtin-warmup-upper"
  name: string;
  role: Extract<BlockRole, "warmup" | "mobility" | "cooldown">;
  focus: BodyFocus;
  minutes: number;
  movements: { name: string; prescription: string }[];
}

export interface BlockEnvelope {
  block: BlockRole;
  minMinutes: number;
  maxMinutes: number;
}

/** One shortlist entry: a catalog workout fitted to its block's envelope, or
 *  a built-in. Minutes and roundsNote are precomputed here — the AI only
 *  picks, it never moves numbers. */
export interface BlockCandidate {
  workoutId: string | null; // null = built-in
  builtinKey: string | null;
  name: string;
  minutes: number;
  roundsNote: string | null; // e.g. "Do 3 of 4 rounds"
  muscles: WorkoutMuscle[];
  focus: BodyFocus;
  /** Higher is better. Comparable only against other candidates for the same
   *  block — a warm-up's 8 and a main's 8 mean different things. */
  score: number;
}

/** Partial because not every day offers every block: conditioning drops out
 *  below a 75-minute budget, and a recovery day is mobility and cool-down
 *  alone. A missing key means "no block", not "no candidates found". */
export type BlockShortlists = Partial<Record<BlockRole, BlockCandidate[]>>;

export interface BlockPick {
  block: BlockRole;
  workoutId: string | null;
  builtinKey: string | null;
  minutes: number;
  roundsNote: string | null;
  reason: string | null;
}

/** A generated_session_blocks row, ready for display. */
export interface StoredBlock extends BlockPick {
  id: string;
  /** Stored on the row, captured at compose time — not resolved from a join,
   *  so the block still reads correctly after its workout is deleted. */
  name: string;
}
