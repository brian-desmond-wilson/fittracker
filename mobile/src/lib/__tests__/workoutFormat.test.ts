import { formatWorkoutItem, formatWorkoutHeadline } from "../workoutFormat";
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
  it("counts movements and states rounds as written", () => {
    expect(formatWorkoutHeadline(4, "3-4")).toBe("4 movements · 3-4 rounds");
  });

  it("uses the singular for one round", () => {
    expect(formatWorkoutHeadline(4, "1")).toBe("4 movements · 1 round");
  });

  it("omits rounds when none were prescribed", () => {
    expect(formatWorkoutHeadline(3, null)).toBe("3 movements");
  });

  it("uses the singular for one movement", () => {
    expect(formatWorkoutHeadline(1, null)).toBe("1 movement");
  });
});
