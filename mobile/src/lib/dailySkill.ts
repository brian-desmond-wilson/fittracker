// The learn-as-you-go state machine (2026-08-16 spec §5.5): per-movement
// too-easy/right/too-hard ratings drive exercise_skill_state. Pure — the
// write path in supabase/daily.ts feeds it rows and persists what it returns.
//
// Promotion is deliberately slow (two consecutive too-easy) and demotion
// deliberately fast (one too-hard): eight weeks detrained, start conservative
// and back off the moment something is too much.
import type { SkillStateLevel } from "../types/daily";

export type MovementRating = "too_easy" | "right" | "too_hard";

export interface SkillRatingState {
  currentLevel: SkillStateLevel;
  consecutiveTooEasy: number;
  lastRating: MovementRating;
  /** True when this rating completed a too-easy streak: bump the level and
   *  surface the movement's progression link, when one exists. */
  promoted: boolean;
}

const ORDER: SkillStateLevel[] = ["beginner", "intermediate", "advanced"];

const shift = (level: SkillStateLevel, by: 1 | -1): SkillStateLevel =>
  ORDER[Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(level) + by))];

export function applyRating(
  prev: { currentLevel: SkillStateLevel; consecutiveTooEasy: number } | null,
  rating: MovementRating,
): SkillRatingState {
  const level = prev?.currentLevel ?? "beginner";
  const streak = prev?.consecutiveTooEasy ?? 0;

  if (rating === "too_easy") {
    const nextStreak = streak + 1;
    if (nextStreak >= 2) {
      return {
        currentLevel: shift(level, 1),
        consecutiveTooEasy: 0,
        lastRating: rating,
        promoted: true,
      };
    }
    return { currentLevel: level, consecutiveTooEasy: nextStreak, lastRating: rating, promoted: false };
  }
  if (rating === "too_hard") {
    return { currentLevel: shift(level, -1), consecutiveTooEasy: 0, lastRating: rating, promoted: false };
  }
  return { currentLevel: level, consecutiveTooEasy: 0, lastRating: rating, promoted: false };
}

/** The workout-shortlist gate's input: what the user has EARNED, summarized.
 *  Three movements at a level before the ceiling rises — one lucky rating on
 *  one movement must not unlock Advanced workouts wholesale. Replaces the
 *  ramp-week stand-in documented in dailyBlockShortlist.ts. */
export function userSkillCeiling(
  earned: SkillStateLevel[],
): "Beginner" | "Intermediate" | "Advanced" {
  const advanced = earned.filter((l) => l === "advanced").length;
  const atLeastIntermediate = earned.filter((l) => l !== "beginner").length;
  if (advanced >= 3) return "Advanced";
  if (atLeastIntermediate >= 3) return "Intermediate";
  return "Beginner";
}
