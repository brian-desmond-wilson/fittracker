import { sanitizeExtraction, mapCategory } from "../captureReview";

const VALID = {
  libraryIds: new Set(["ex-1", "ex-2"]),
  muscles: new Set(["Chest", "Triceps", "Glutes"]),
  equipment: new Set(["Barbell", "Kettlebell", "Bands"]),
};

const rawExercise = (overrides: Record<string, unknown> = {}) => ({
  name: "Kettlebell RDL",
  description: "Hinge with kettlebell",
  category: "strength",
  skill_level: "Intermediate",
  primary_muscles: ["Glutes"],
  secondary_muscles: ["Triceps"],
  equipment: ["Kettlebell"],
  library_match_id: null,
  ...overrides,
});

describe("sanitizeExtraction", () => {
  it("accepts a well-formed single exercise", () => {
    const out = sanitizeExtraction(
      { post_type: "single_exercise", exercises: [rawExercise()], workout: null },
      VALID,
    );
    expect(out).not.toBeNull();
    expect(out!.postType).toBe("single_exercise");
    expect(out!.exercises).toHaveLength(1);
    expect(out!.exercises[0].name).toBe("Kettlebell RDL");
    expect(out!.exercises[0].primaryMuscles).toEqual(["Glutes"]);
  });

  it("drops a library match id that is not in the library index", () => {
    const out = sanitizeExtraction(
      {
        post_type: "single_exercise",
        exercises: [rawExercise({ library_match_id: "ex-999" })],
        workout: null,
      },
      VALID,
    );
    expect(out!.exercises[0].libraryMatchId).toBeNull();
  });

  it("keeps a library match id that is in the index", () => {
    const out = sanitizeExtraction(
      {
        post_type: "single_exercise",
        exercises: [rawExercise({ library_match_id: "ex-2" })],
        workout: null,
      },
      VALID,
    );
    expect(out!.exercises[0].libraryMatchId).toBe("ex-2");
  });

  it("drops unknown muscle and equipment names, keeps known ones", () => {
    const out = sanitizeExtraction(
      {
        post_type: "single_exercise",
        exercises: [
          rawExercise({
            primary_muscles: ["Glutes", "Face"],
            equipment: ["Kettlebell", "Anvil"],
          }),
        ],
        workout: null,
      },
      VALID,
    );
    expect(out!.exercises[0].primaryMuscles).toEqual(["Glutes"]);
    expect(out!.exercises[0].equipment).toEqual(["Kettlebell"]);
  });

  it("defaults an unrecognized category to strength and unknown level to Beginner", () => {
    const out = sanitizeExtraction(
      {
        post_type: "single_exercise",
        exercises: [rawExercise({ category: "yoga-flow", skill_level: "elite" })],
        workout: null,
      },
      VALID,
    );
    expect(out!.exercises[0].category).toBe("strength");
    expect(out!.exercises[0].skillLevel).toBe("Beginner");
  });

  it("returns null when there are no usable exercises", () => {
    expect(
      sanitizeExtraction({ post_type: "single_exercise", exercises: [], workout: null }, VALID),
    ).toBeNull();
    expect(
      sanitizeExtraction(
        { post_type: "single_exercise", exercises: [rawExercise({ name: "  " })], workout: null },
        VALID,
      ),
    ).toBeNull();
  });

  it("a muscle listed as both primary and secondary stays primary only, and lists dedupe", () => {
    const out = sanitizeExtraction(
      {
        post_type: "single_exercise",
        exercises: [
          rawExercise({
            primary_muscles: ["Glutes", "Glutes", "Chest"],
            secondary_muscles: ["Glutes", "Triceps", "Triceps"],
          }),
        ],
        workout: null,
      },
      VALID,
    );
    expect(out!.exercises[0].primaryMuscles).toEqual(["Glutes", "Chest"]);
    expect(out!.exercises[0].secondaryMuscles).toEqual(["Triceps"]);
  });

  it("remaps workout item indexes when an invalid exercise is dropped", () => {
    const out = sanitizeExtraction(
      {
        post_type: "full_workout",
        exercises: [
          rawExercise({ name: "Goblet Squat" }),
          rawExercise({ name: "   " }), // dropped by the sanitizer
          rawExercise({ name: "Kettlebell Halo" }),
        ],
        workout: {
          name: "Circuit",
          items: [
            { exercise_index: 0, sets: 3, reps: "10", rest_seconds: 60, notes: null },
            { exercise_index: 1, sets: 3, reps: "12", rest_seconds: 60, notes: null },
            { exercise_index: 2, sets: 3, reps: "8", rest_seconds: 90, notes: null },
          ],
        },
      },
      VALID,
    );
    // Two survivors; the dropped exercise's item goes with it, and the Halo's
    // prescription must still point at the Halo — not at the dropped slot.
    expect(out!.exercises.map((e) => e.name)).toEqual(["Goblet Squat", "Kettlebell Halo"]);
    expect(out!.workout!.items).toHaveLength(2);
    expect(out!.workout!.items[0].exerciseIndex).toBe(0);
    expect(out!.workout!.items[1].exerciseIndex).toBe(1);
    expect(out!.workout!.items[1].reps).toBe("8");
  });

  it("keeps a full workout whose item indexes are valid, drops out-of-range items", () => {
    const out = sanitizeExtraction(
      {
        post_type: "full_workout",
        exercises: [rawExercise(), rawExercise({ name: "Goblet Squat" })],
        workout: {
          name: "Leg Day",
          items: [
            { exercise_index: 0, sets: 3, reps: "8-12", rest_seconds: 90, notes: null },
            { exercise_index: 5, sets: 3, reps: "10", rest_seconds: 60, notes: null },
          ],
        },
      },
      VALID,
    );
    expect(out!.postType).toBe("full_workout");
    expect(out!.workout!.items).toHaveLength(1);
    expect(out!.workout!.items[0].exerciseIndex).toBe(0);
  });

  it("keeps rounds and the verbatim protocol on a circuit", () => {
    const out = sanitizeExtraction(
      {
        post_type: "full_workout",
        exercises: [rawExercise({ name: "Kettlebell Halo" })],
        workout: {
          name: "Kettlebell Chest & Triceps Series",
          rounds: "3-4",
          raw_protocol: "- 8x Halos\nREPEAT 3-4x rounds",
          items: [{ exercise_index: 0, sets: null, reps: "8", rest_seconds: null, notes: null }],
        },
      },
      VALID,
    );
    expect(out!.workout!.rounds).toBe("3-4");
    expect(out!.workout!.rawProtocol).toBe("- 8x Halos\nREPEAT 3-4x rounds");
    // The creator never prescribed per-exercise sets; we must not invent any.
    expect(out!.workout!.items[0].sets).toBeNull();
    expect(out!.workout!.items[0].reps).toBe("8");
  });

  it("keeps weight and duration verbatim", () => {
    const out = sanitizeExtraction(
      {
        post_type: "full_workout",
        exercises: [rawExercise()],
        workout: {
          name: "Carry Day",
          items: [
            {
              exercise_index: 0,
              sets: 3,
              reps: null,
              weight: "2x24kg",
              duration: "30-45s",
              rest_seconds: 60,
              notes: null,
            },
          ],
        },
      },
      VALID,
    );
    expect(out!.workout!.items[0].weight).toBe("2x24kg");
    expect(out!.workout!.items[0].duration).toBe("30-45s");
  });

  it("keeps a rounds value that states a quantity, drops prose", () => {
    const rounds = (v: unknown) =>
      sanitizeExtraction(
        {
          post_type: "full_workout",
          exercises: [rawExercise()],
          workout: { name: "W", rounds: v, items: [{ exercise_index: 0, reps: "8" }] },
        },
        VALID,
      )!.workout!.rounds;

    expect(rounds("3-4")).toBe("3-4");
    expect(rounds("5")).toBe("5");
    expect(rounds("AMRAP 20 min")).toBe("AMRAP 20 min");
    // A round count is a quantity. Prose here would render as nonsense next to
    // the movement count, so it is dropped rather than displayed.
    expect(rounds("as many as you can stomach")).toBeNull();
    expect(rounds("")).toBeNull();
  });

  it("demotes full_workout to single_exercise when the workout block is missing", () => {
    const out = sanitizeExtraction(
      { post_type: "full_workout", exercises: [rawExercise()], workout: null },
      VALID,
    );
    expect(out!.postType).toBe("single_exercise");
    expect(out!.workout).toBeNull();
  });
});

describe("mapCategory", () => {
  it("maps each capture category onto existing reference-table names", () => {
    expect(mapCategory("strength")).toEqual({ goalType: "Strength", movementCategory: "Weightlifting" });
    expect(mapCategory("conditioning")).toEqual({ goalType: "MetCon", movementCategory: "Monostructural" });
    expect(mapCategory("mobility")).toEqual({ goalType: "Mobility", movementCategory: "Recovery" });
    expect(mapCategory("stretching")).toEqual({ goalType: "Stretching", movementCategory: "Recovery" });
    expect(mapCategory("warmup")).toEqual({ goalType: "Mobility", movementCategory: "Recovery" });
    expect(mapCategory("skill")).toEqual({ goalType: "Skill", movementCategory: "Gymnastics" });
  });
});
