import { DEFAULT_GOAL, goalForWeek, goalInForce, PRE_HISTORY_WEEK_TARGET } from "../goalHistory";
import type { WeeklyGoal } from "../../types/goals";

const goal = (effectiveFrom: string, sessionsTarget: number): WeeklyGoal => ({
  id: `g-${effectiveFrom}`, effectiveFrom, sessionsTarget,
  volumeTargetLbs: null, regionTarget: null,
});

// Goals arrive newest-first from the query; the helpers must not care.
const history = [goal("2026-08-23", 6), goal("2026-06-07", 4), goal("2026-01-04", 3)];

describe("goalInForce", () => {
  it("takes the newest goal not in the future", () => {
    expect(goalInForce(history, "2026-08-24").sessionsTarget).toBe(6);
  });
  it("falls back to the default before any goal was set", () => {
    expect(goalInForce(history, "2025-12-01")).toEqual(DEFAULT_GOAL);
    expect(goalInForce([], "2026-08-24")).toEqual(DEFAULT_GOAL);
  });
  it("ignores goals dated after the day asked about", () => {
    expect(goalInForce(history, "2026-07-01").sessionsTarget).toBe(4);
  });
});

describe("goalForWeek", () => {
  // A week is governed by the goal in force on the Sunday it starts, so a
  // goal changed mid-week does not move that week's bar.
  it("judges a week by its Sunday, not by today", () => {
    expect(goalForWeek(history, "2026-08-26").sessionsTarget).toBe(6); // week of 08-23
    expect(goalForWeek(history, "2026-08-20").sessionsTarget).toBe(4); // week of 08-16
  });
});

describe("PRE_HISTORY_WEEK_TARGET", () => {
  // Kept separate from DEFAULT_GOAL.sessionsTarget: a streak earned before
  // the goals feature existed must not be silently rewritten by the ring's
  // default target.
  it("is lenient — a week happening at all was enough", () => {
    expect(PRE_HISTORY_WEEK_TARGET).toBe(1);
    expect(PRE_HISTORY_WEEK_TARGET).toBeLessThan(DEFAULT_GOAL.sessionsTarget);
  });
});
