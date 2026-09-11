import { formatWorkoutItem, formatWorkoutHeadline, describeFormat } from "../workoutFormat";
import type { HeadlineShape } from "../workoutFormat";
import type { ExtractedWorkoutItem } from "../../types/capture";

const item = (o: Partial<ExtractedWorkoutItem> = {}): ExtractedWorkoutItem => ({
  exerciseIndex: 0,
  sets: null,
  reps: null,
  weight: null,
  duration: null,
  restSeconds: null,
  notes: null,
  ...o,
});

describe("formatWorkoutItem", () => {
  it("shows bare reps when the creator prescribed no sets", () => {
    // The circuit case: "8x Halos" is 8 reps, not 3 sets of 8.
    expect(formatWorkoutItem(item({ reps: "8" }))).toBe("8 reps");
  });

  it("shows sets by reps only when sets were actually prescribed", () => {
    expect(formatWorkoutItem(item({ sets: 3, reps: "8" }))).toBe("3 × 8 reps");
  });

  it("passes a per-side scheme through untouched", () => {
    expect(formatWorkoutItem(item({ reps: "8R/8L" }))).toBe("8R/8L");
  });

  it("shows duration when there are no reps", () => {
    expect(formatWorkoutItem(item({ duration: "30-45s" }))).toBe("30-45s");
  });

  it("combines weight, reps and rest", () => {
    expect(formatWorkoutItem(item({ sets: 3, reps: "8", weight: "24kg", restSeconds: 60 }))).toBe(
      "3 × 8 reps @ 24kg · rest 60s",
    );
  });

  it("says nothing rather than guessing when the creator prescribed nothing", () => {
    expect(formatWorkoutItem(item())).toBe("");
  });
});

describe("formatWorkoutHeadline", () => {
  const shape = (o: Partial<HeadlineShape>): HeadlineShape => ({
    format: null, formatMinutes: null, scoreType: null, ...o,
  });

  it("counts movements and states rounds as written when there is no format", () => {
    expect(formatWorkoutHeadline(4, "3-4")).toBe("4 movements · 3-4 rounds");
    expect(formatWorkoutHeadline(4, "3-4", shape({}))).toBe("4 movements · 3-4 rounds");
  });

  it("uses the singular for one round and one movement", () => {
    expect(formatWorkoutHeadline(4, "1")).toBe("4 movements · 1 round");
    expect(formatWorkoutHeadline(1, null)).toBe("1 movement");
  });

  it("says nothing extra for sets & reps", () => {
    expect(formatWorkoutHeadline(7, null, shape({ format: "sets_reps" }))).toBe("7 movements");
    expect(formatWorkoutHeadline(7, "3", shape({ format: "sets_reps" }))).toBe("7 movements");
  });

  it("rounds keeps the creator's rounds text", () => {
    expect(formatWorkoutHeadline(6, "6", shape({ format: "rounds" }))).toBe("6 movements · 6 rounds");
    expect(formatWorkoutHeadline(6, null, shape({ format: "rounds" }))).toBe("6 movements · Rounds");
  });

  it("time-defined formats carry their minutes", () => {
    expect(formatWorkoutHeadline(7, null, shape({ format: "amrap", formatMinutes: 15 }))).toBe("7 movements · AMRAP 15 min");
    expect(formatWorkoutHeadline(7, null, shape({ format: "amrap" }))).toBe("7 movements · AMRAP");
    expect(formatWorkoutHeadline(2, null, shape({ format: "emom", formatMinutes: 12 }))).toBe("2 movements · EMOM 12 min");
    expect(formatWorkoutHeadline(7, null, shape({ format: "for_time", formatMinutes: 20 }))).toBe("7 movements · For time · 20 min cap");
    expect(formatWorkoutHeadline(7, null, shape({ format: "for_time" }))).toBe("7 movements · For time");
    expect(formatWorkoutHeadline(4, null, shape({ format: "intervals", formatMinutes: 16 }))).toBe("4 movements · Intervals 16 min");
    expect(formatWorkoutHeadline(9, null, shape({ format: "chipper", formatMinutes: 25 }))).toBe("9 movements · Chipper · 25 min cap");
    expect(formatWorkoutHeadline(3, null, shape({ format: "ladder", formatMinutes: 25 }))).toBe("3 movements · Ladder");
  });

  it("describeFormat is the headline without the movement count", () => {
    expect(describeFormat("6", shape({ format: "rounds", scoreType: "load" }))).toBe("6 rounds · load");
    expect(describeFormat(null, shape({ format: "sets_reps" }))).toBeNull();
    expect(describeFormat(null, shape({}))).toBeNull();
  });

  it("does not say rounds twice, and appends a score even without a format", () => {
    expect(formatWorkoutHeadline(6, "6", shape({ format: "rounds", scoreType: "rounds_reps" }))).toBe("6 movements · 6 rounds");
    expect(formatWorkoutHeadline(5, "3", shape({ scoreType: "load" }))).toBe("5 movements · 3 rounds · load");
  });

  it("appends the score only when the format does not imply it and it is not none", () => {
    expect(formatWorkoutHeadline(6, "6", shape({ format: "rounds", scoreType: "load" }))).toBe("6 movements · 6 rounds · load");
    expect(formatWorkoutHeadline(7, null, shape({ format: "sets_reps", scoreType: "load" }))).toBe("7 movements · load");
    expect(formatWorkoutHeadline(2, null, shape({ format: "emom", formatMinutes: 12, scoreType: "calories" }))).toBe("2 movements · EMOM 12 min · calories");
    expect(formatWorkoutHeadline(7, null, shape({ format: "amrap", formatMinutes: 15, scoreType: "rounds_reps" }))).toBe("7 movements · AMRAP 15 min");
    expect(formatWorkoutHeadline(7, null, shape({ format: "for_time", scoreType: "time" }))).toBe("7 movements · For time");
    expect(formatWorkoutHeadline(6, "6", shape({ format: "rounds", scoreType: "none" }))).toBe("6 movements · 6 rounds");
    expect(formatWorkoutHeadline(4, null, shape({ format: "intervals", scoreType: "duration" }))).toBe("4 movements · Intervals · duration / hold");
  });
});
