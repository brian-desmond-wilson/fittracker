const mockMemory = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockMemory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockMemory.set(k, v); }),
  },
}));

import { loadExercisePrefs, saveExercisePrefs, exercisePrefsKey, sanitizeExercisePrefs } from "../exerciseFilterStore";
import { prefsKey as workoutPrefsKey } from "../workoutFilterStore";
import { EMPTY_EXERCISE_FILTERS, DEFAULT_EXERCISE_SORT } from "../../types/exerciseFilters";

beforeEach(() => mockMemory.clear());

describe("exerciseFilterStore", () => {
  it("round-trips per user", async () => {
    const filters = { ...EMPTY_EXERCISE_FILTERS, equipment: ["Kettlebell"], picture: "missing" as const };
    await saveExercisePrefs("u1", { filters, sort: "name" });
    expect(await loadExercisePrefs("u1")).toEqual({ filters, sort: "name" });
    expect(await loadExercisePrefs("u2")).toEqual({ filters: EMPTY_EXERCISE_FILTERS, sort: DEFAULT_EXERCISE_SORT });
  });

  it("keys by user, and never shares a key with the Workouts tab", () => {
    expect(exercisePrefsKey("u1")).toBe("training.exercises.filters.v1:u1");
    expect(exercisePrefsKey("u1")).not.toBe(workoutPrefsKey("u1"));
  });

  it("drops unknown skill, picture and sort but keeps free-text values", () => {
    expect(sanitizeExercisePrefs({
      filters: { creators: ["@gone"], muscles: ["Chest", 7], equipment: ["Laser"], goalTypes: ["Strength"], skills: ["Advanced", "God"], picture: "blurry" },
      sort: "random",
    })).toEqual({
      filters: { creators: ["@gone"], muscles: ["Chest"], equipment: ["Laser"], goalTypes: ["Strength"], skills: ["Advanced"], categories: [], tiers: [], scoringTypes: [], picture: "any" },
      sort: DEFAULT_EXERCISE_SORT,
    });
  });

  it("falls back to defaults on garbage", async () => {
    mockMemory.set(exercisePrefsKey("u1"), "{not json");
    expect(await loadExercisePrefs("u1")).toEqual({ filters: EMPTY_EXERCISE_FILTERS, sort: DEFAULT_EXERCISE_SORT });
    expect(sanitizeExercisePrefs(null)).toEqual({ filters: EMPTY_EXERCISE_FILTERS, sort: DEFAULT_EXERCISE_SORT });
  });

  it("tolerates wrong-type containers", () => {
    const d = { filters: EMPTY_EXERCISE_FILTERS, sort: DEFAULT_EXERCISE_SORT };
    expect(sanitizeExercisePrefs("x")).toEqual(d);
    expect(sanitizeExercisePrefs(42)).toEqual(d);
    expect(sanitizeExercisePrefs([])).toEqual(d);
    expect(sanitizeExercisePrefs({ filters: { creators: "not-an-array", picture: 5 }, sort: 1 })).toEqual(d);
  });
});

describe("sanitize keeps the category, rank and scoring axes", () => {
  it("keeps category and scoring names and valid tiers, drops junk tiers", () => {
    const out = sanitizeExercisePrefs({ filters: { categories: ["Gymnastics"], tiers: [0, 2, 9, "x"], scoringTypes: ["Reps", "Load"] } });
    expect(out.filters.categories).toEqual(["Gymnastics"]);
    expect(out.filters.tiers).toEqual([0, 2]);
    expect(out.filters.scoringTypes).toEqual(["Reps", "Load"]);
  });
  it("defaults them to empty when absent", () => {
    const out = sanitizeExercisePrefs({});
    expect(out.filters.categories).toEqual([]);
    expect(out.filters.tiers).toEqual([]);
    expect(out.filters.scoringTypes).toEqual([]);
  });
});
