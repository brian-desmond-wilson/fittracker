import { replayRatings } from "../skillReplay";
import { applyRating } from "../dailySkill";
import type { MovementRating } from "../dailySkill";
import type { SkillStateLevel } from "../../types/daily";

/** The incremental path saveMovementRatings takes, one row at a time. */
function incremental(ratings: MovementRating[]) {
  let state: { currentLevel: SkillStateLevel; consecutiveTooEasy: number } | null = null;
  let last: MovementRating | null = null;
  for (const r of ratings) {
    const next = applyRating(state, r);
    state = { currentLevel: next.currentLevel, consecutiveTooEasy: next.consecutiveTooEasy };
    last = r;
  }
  return { currentLevel: state?.currentLevel ?? "beginner", consecutiveTooEasy: state?.consecutiveTooEasy ?? 0, lastRating: last };
}

describe("replayRatings", () => {
  it("no rows is a fresh beginner", () => {
    expect(replayRatings([])).toEqual({ currentLevel: "beginner", consecutiveTooEasy: 0, lastRating: null });
  });

  it("promotion path equals the incremental machine", () => {
    const path: MovementRating[] = ["right", "too_easy", "too_easy", "too_easy"];
    expect(replayRatings(path)).toEqual(incremental(path));
    expect(replayRatings(path)).toEqual({ currentLevel: "intermediate", consecutiveTooEasy: 1, lastRating: "too_easy" });
  });

  it("demotion path equals the incremental machine", () => {
    const path: MovementRating[] = ["too_easy", "too_easy", "too_easy", "too_easy", "too_hard"];
    expect(replayRatings(path)).toEqual(incremental(path));
    expect(replayRatings(path)).toEqual({ currentLevel: "intermediate", consecutiveTooEasy: 0, lastRating: "too_hard" });
  });

  it("an overwritten row changes the outcome — the reason to replay", () => {
    expect(replayRatings(["too_easy", "too_easy"]).currentLevel).toBe("intermediate");
    expect(replayRatings(["too_easy", "right"]).currentLevel).toBe("beginner");
  });
});
