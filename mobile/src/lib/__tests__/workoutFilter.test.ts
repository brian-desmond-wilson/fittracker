import { filterWorkouts } from "../workoutFilter";
import type { CapturedWorkoutEntry } from "../../types/capture";

const workout = (o: Partial<CapturedWorkoutEntry> = {}): CapturedWorkoutEntry => ({
  workoutId: "w-1",
  name: "KB Chest & Triceps Series",
  rounds: "3-4",
  rawProtocol: null,
  capturedAt: "2026-08-16T00:00:00Z",
  source: {
    sourceId: "s-1",
    platform: "instagram",
    sourceUrl: "https://instagram.com/reel/abc",
    posterHandle: "@flolyfe",
    thumbnailUrl: null,
  },
  items: [
    {
      exerciseId: "e-1", name: "Kettlebell Halo", sets: null, reps: "8",
      weight: null, duration: null, restSeconds: null, notes: null,
    },
    {
      exerciseId: "e-2", name: "Tricep Push Up", sets: null, reps: "8",
      weight: null, duration: null, restSeconds: null, notes: null,
    },
  ],
  ...o,
});

describe("filterWorkouts", () => {
  it("passes everything through on an empty search", () => {
    expect(filterWorkouts([workout()], "")).toHaveLength(1);
    expect(filterWorkouts([workout()], "   ")).toHaveLength(1);
  });

  it("matches the workout name, case-insensitively", () => {
    expect(filterWorkouts([workout()], "TRICEPS")).toHaveLength(1);
  });

  it("matches the poster handle", () => {
    expect(filterWorkouts([workout()], "flolyfe")).toHaveLength(1);
  });

  it("matches a movement inside the workout", () => {
    // Searching a movement should surface the workouts that contain it —
    // otherwise a captured circuit is unfindable by what's in it.
    expect(filterWorkouts([workout()], "halo")).toHaveLength(1);
  });

  it("excludes what matches nothing", () => {
    expect(filterWorkouts([workout()], "deadlift")).toHaveLength(0);
  });

  it("tolerates a workout with no source and no movements", () => {
    const bare = workout({ workoutId: "w-2", source: null, items: [] });
    expect(filterWorkouts([bare], "anything")).toHaveLength(0);
    expect(filterWorkouts([bare], "")).toHaveLength(1);
  });
});
