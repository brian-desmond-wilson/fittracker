// Replays one exercise's rating rows, in date order, through the pure state
// machine to a final skill state. A re-rate from the exercise page overwrites
// a historic row, and incrementing from the prior state would then drift;
// replaying from nothing cannot (spec §5, Skill note).
import { applyRating } from "./dailySkill";
import type { MovementRating } from "./dailySkill";
import type { SkillStateLevel } from "../types/daily";

export interface ReplayedSkillState {
  currentLevel: SkillStateLevel;
  consecutiveTooEasy: number;
  lastRating: MovementRating | null;
}

export function replayRatings(ratings: MovementRating[]): ReplayedSkillState {
  let state: { currentLevel: SkillStateLevel; consecutiveTooEasy: number } | null = null;
  let last: MovementRating | null = null;
  for (const r of ratings) {
    const next = applyRating(state, r);
    state = { currentLevel: next.currentLevel, consecutiveTooEasy: next.consecutiveTooEasy };
    last = r;
  }
  return {
    currentLevel: state?.currentLevel ?? "beginner",
    consecutiveTooEasy: state?.consecutiveTooEasy ?? 0,
    lastRating: last,
  };
}
