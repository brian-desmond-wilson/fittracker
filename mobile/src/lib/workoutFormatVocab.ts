// mobile/src/lib/workoutFormatVocab.ts
// The Format and Score vocabularies: order, labels, and the two rules the
// screens share — which formats imply a score, and which are built on a
// number of minutes. Spec §4.
import type { WorkoutFormat, WorkoutScoreType } from "../types/dailyBlocks";

export const ALL_FORMATS: WorkoutFormat[] = [
  "sets_reps", "rounds", "amrap", "emom", "for_time", "intervals", "chipper", "ladder",
];

export const FORMAT_LABELS: Record<WorkoutFormat, string> = {
  sets_reps: "Sets & reps",
  rounds: "Rounds",
  amrap: "AMRAP",
  emom: "EMOM",
  for_time: "For time",
  intervals: "Intervals",
  chipper: "Chipper",
  ladder: "Ladder",
};

export const ALL_SCORES: WorkoutScoreType[] = [
  "reps", "rounds_reps", "load", "time", "distance", "calories",
  "duration", "quality", "height", "none",
];

export const SCORE_LABELS: Record<WorkoutScoreType, string> = {
  reps: "Reps",
  rounds_reps: "Rounds + reps",
  load: "Load",
  time: "Time",
  distance: "Distance",
  calories: "Calories",
  duration: "Duration / hold",
  quality: "Quality",
  height: "Height / range",
  none: "Not scored",
};

/** The score a format settles on its own. Null means "ask the caption". The
 *  card hides an implied score, and the editor pre-selects it. */
export const IMPLIED_SCORE: Record<WorkoutFormat, WorkoutScoreType | null> = {
  sets_reps: null,
  rounds: null,
  amrap: "rounds_reps",
  emom: null,
  for_time: "time",
  intervals: null,
  chipper: "time",
  ladder: "time",
};

/** What the minutes field means for each format that has one. Null = the
 *  format has no such number and the field stays hidden. */
const MINUTES_LABEL: Partial<Record<WorkoutFormat, string>> = {
  amrap: "AMRAP minutes",
  emom: "EMOM minutes",
  for_time: "Time cap (minutes)",
  intervals: "Total minutes",
  chipper: "Time cap (minutes)",
};

export function formatHasMinutes(format: WorkoutFormat | null): boolean {
  return format !== null && MINUTES_LABEL[format] !== undefined;
}

export function minutesLabelFor(format: WorkoutFormat | null): string | null {
  return format === null ? null : MINUTES_LABEL[format] ?? null;
}
