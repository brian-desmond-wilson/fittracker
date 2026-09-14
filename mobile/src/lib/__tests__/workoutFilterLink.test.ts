import { workoutFilterParam, parseWorkoutFilterParam, mergeWorkoutFilters, WORKOUT_FILTER_PARAM } from "../workoutFilterLink";
import { EMPTY_FILTERS } from "../../types/workoutFilters";

describe("workoutFilter param (spec §4.3, §6)", () => {
  it("round-trips every axis a chip can name", () => {
    expect(WORKOUT_FILTER_PARAM).toBe("workoutFilter");
    const link = {
      muscles: ["Core"], equipment: ["Kettlebell"], blockRoles: ["main" as const],
      formats: ["amrap" as const], scores: ["rounds_reps" as const],
      intensity: "high" as const, lengths: ["short" as const], skills: ["Intermediate" as const],
    };
    expect(parseWorkoutFilterParam(workoutFilterParam(link))).toEqual(link);
  });

  it("round-trips the untagged format", () => {
    expect(parseWorkoutFilterParam(JSON.stringify({ formats: ["untagged"] })))
      .toEqual({ formats: ["untagged"] });
  });

  it("ignores creators and history — the page never links those axes", () => {
    expect(parseWorkoutFilterParam(JSON.stringify({ creators: ["x"], history: "done" }))).toBeNull();
  });

  it("drops values the model cannot represent and returns null when nothing survives", () => {
    expect(parseWorkoutFilterParam(JSON.stringify({ muscles: ["Wings"], intensity: "extreme", formats: ["yoga"] }))).toBeNull();
    expect(parseWorkoutFilterParam(JSON.stringify({ muscles: ["Wings", "Quads"] }))).toEqual({ muscles: ["Quads"] });
  });

  it("null for junk", () => {
    expect(parseWorkoutFilterParam("")).toBeNull();
    expect(parseWorkoutFilterParam("{not json")).toBeNull();
    expect(parseWorkoutFilterParam(42)).toBeNull();
    expect(parseWorkoutFilterParam(JSON.stringify([1, 2]))).toBeNull();
  });

  it("merges onto saved filters without duplicates; intensity replaces", () => {
    const base = { ...EMPTY_FILTERS, muscles: ["Core"], intensity: "low" as const };
    const next = mergeWorkoutFilters(base, { muscles: ["Core", "Quads"], intensity: "high" });
    expect(next.muscles).toEqual(["Core", "Quads"]);
    expect(next.intensity).toBe("high");
    expect(next.history).toBe("any");
    expect(next).not.toBe(base);
    expect(base.muscles).toEqual(["Core"]);
  });
});
