import { workoutCardFacts } from "../workoutCardFacts";
import type { CapturedWorkoutEntry, CapturedWorkoutItemEntry } from "../../types/capture";
import type { WorkoutTags } from "../../types/dailyBlocks";

const item = (equipment: string[] | undefined): CapturedWorkoutItemEntry => ({
  exerciseId: "x", name: "Move", sets: null, reps: null, weight: null,
  duration: null, restSeconds: null, notes: null, equipment,
});

const tags = (over: Partial<WorkoutTags> = {}): WorkoutTags => ({
  blockRoles: [], muscles: [], estMinutes: null, intensity: null, skillLevel: null,
  format: null, scoreType: null, formatMinutes: null, classifiedAt: "2026-09-01T00:00:00Z",
  ...over,
});

const base: CapturedWorkoutEntry = {
  workoutId: "w1", name: "Test WOD", rounds: null, rawProtocol: null,
  description: null, notes: null, capturedAt: "2026-09-01T00:00:00Z",
  source: {
    sourceId: "s1", platform: "instagram", sourceUrl: "https://x",
    posterHandle: "@coach", thumbnailUrl: null, captionText: null,
  },
  items: [], pendingItems: [], tags: tags(),
  derivedEquipment: [], isBodyweight: false,
};

describe("workoutCardFacts — equipment aggregation", () => {
  it("shows every distinct piece any movement needs, in grid order", () => {
    // The spec's example: 2 barbell+bench, 2 kettlebell, 1 roller → 4 icons.
    const f = workoutCardFacts({ ...base, items: [
      item(["Barbell", "Bench"]), item(["Barbell", "Bench"]),
      item(["Kettlebell"]), item(["Kettlebell"]), item(["Ab Roller"]),
    ]});
    expect(f.equipment).toEqual(["Kettlebell", "Barbell", "Bench", "Ab Roller"]);
  });

  it("drops support surfaces and the Bodyweight marker", () => {
    const f = workoutCardFacts({ ...base, items: [
      item(["Kettlebell", "Floor"]), item(["Wall", "Bodyweight"]),
    ]});
    expect(f.equipment).toEqual(["Kettlebell"]);
  });

  it("falls back to Bodyweight when there is no gear and every move is bodyweight", () => {
    const f = workoutCardFacts({ ...base, isBodyweight: true, items: [item([]), item([])] });
    expect(f.equipment).toEqual(["Bodyweight"]);
  });

  it("stays empty when gear is unknown (items without a join) rather than claiming bodyweight", () => {
    const f = workoutCardFacts({ ...base, isBodyweight: false, items: [item(undefined)] });
    expect(f.equipment).toEqual([]);
  });
});

describe("workoutCardFacts — muscles, format, roles", () => {
  it("splits primary from secondary muscles and dedupes", () => {
    const f = workoutCardFacts({ ...base, tags: tags({ muscles: [
      { name: "Core", isPrimary: true }, { name: "Shoulders", isPrimary: false },
      { name: "Shoulders", isPrimary: false },
    ]})});
    expect(f.primaryMuscle).toBe("Core");
    expect(f.secondaryMuscles).toEqual(["Shoulders"]);
  });

  it("no primary flagged: first muscle stands in", () => {
    const f = workoutCardFacts({ ...base, tags: tags({ muscles: [{ name: "Glutes", isPrimary: false }] }) });
    expect(f.primaryMuscle).toBe("Glutes");
    expect(f.secondaryMuscles).toEqual([]);
  });

  it("format tag carries minutes when the format has them", () => {
    expect(workoutCardFacts({ ...base, tags: tags({ format: "amrap", formatMinutes: 15 }) }).formatTag).toBe("AMRAP 15");
    expect(workoutCardFacts({ ...base, tags: tags({ format: "for_time", formatMinutes: null }) }).formatTag).toBe("For time");
  });

  it("sets-and-reps gets a tag; an unclassified workout does not", () => {
    expect(workoutCardFacts({ ...base, tags: tags({ format: "sets_reps" }) }).formatTag).toBe("Sets & reps");
    expect(workoutCardFacts({ ...base, tags: tags({ format: null }) }).formatTag).toBeNull();
  });

  it("orders roles by BLOCK_ORDER, not tag order", () => {
    const f = workoutCardFacts({ ...base, tags: tags({ blockRoles: ["conditioning", "warmup", "main"] }) });
    expect(f.roles).toEqual(["warmup", "main", "conditioning"]);
  });

  it("flags an unclassified workout as untagged", () => {
    expect(workoutCardFacts({ ...base, tags: tags({ classifiedAt: null }) }).untagged).toBe(true);
    expect(workoutCardFacts({ ...base, tags: tags({ classifiedAt: "2026-09-01" }) }).untagged).toBe(false);
  });

  it("reports the movement count", () => {
    expect(workoutCardFacts({ ...base, items: [item([]), item([]), item([])] }).movementCount).toBe(3);
  });
});
