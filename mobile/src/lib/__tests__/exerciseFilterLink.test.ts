// mobile/src/lib/__tests__/exerciseFilterLink.test.ts
import {
  exerciseFilterParam, parseExerciseFilterParam, mergeExerciseFilters, EXERCISE_FILTER_PARAM,
} from "../exerciseFilterLink";
import { EMPTY_EXERCISE_FILTERS } from "../../types/exerciseFilters";

describe("exerciseFilterParam / parseExerciseFilterParam", () => {
  it("round-trips a single value on each axis", () => {
    expect(EXERCISE_FILTER_PARAM).toBe("exerciseFilter");
    expect(parseExerciseFilterParam(exerciseFilterParam({ muscles: ["Glutes"] }))).toEqual({ muscles: ["Glutes"] });
    expect(parseExerciseFilterParam(exerciseFilterParam({ equipment: ["Kettlebell"] }))).toEqual({ equipment: ["Kettlebell"] });
    expect(parseExerciseFilterParam(exerciseFilterParam({ creators: ["@coach"] }))).toEqual({ creators: ["@coach"] });
  });

  it("drops a muscle the filter model does not know, and is null when nothing survives (spec §8)", () => {
    expect(parseExerciseFilterParam(exerciseFilterParam({ muscles: ["Left Pinky"] }))).toBeNull();
    expect(parseExerciseFilterParam(exerciseFilterParam({ muscles: ["Left Pinky", "Chest"] }))).toEqual({ muscles: ["Chest"] });
  });

  it("is null for junk", () => {
    expect(parseExerciseFilterParam(undefined)).toBeNull();
    expect(parseExerciseFilterParam("{not json")).toBeNull();
    expect(parseExerciseFilterParam(JSON.stringify({ picture: "has" }))).toBeNull();
    expect(parseExerciseFilterParam(JSON.stringify({ creators: [1, 2] }))).toBeNull();
  });
});

describe("mergeExerciseFilters", () => {
  it("adds the value on top of the saved filters without duplicates", () => {
    const saved = { ...EMPTY_EXERCISE_FILTERS, muscles: ["Chest"], equipment: ["Bar"], picture: "has" as const };
    const merged = mergeExerciseFilters(saved, { muscles: ["Glutes"], equipment: ["Bar"] });
    expect(merged.muscles).toEqual(["Chest", "Glutes"]);
    expect(merged.equipment).toEqual(["Bar"]);
    expect(merged.picture).toBe("has");
    expect(merged).not.toBe(saved);
  });
});
