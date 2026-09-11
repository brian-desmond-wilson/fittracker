const mockMemory = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockMemory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockMemory.set(k, v); }),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadWorkoutPrefs, saveWorkoutPrefs, prefsKey } from "../workoutFilterStore";
import { EMPTY_FILTERS, DEFAULT_SORT } from "../../types/workoutFilters";

beforeEach(() => mockMemory.clear());

describe("workoutFilterStore", () => {
  it("round-trips filters and sort per user", async () => {
    const filters = { ...EMPTY_FILTERS, equipment: ["Kettlebell"], intensity: "high" as const };
    await saveWorkoutPrefs("u1", { filters, sort: "stale" });
    expect(await loadWorkoutPrefs("u1")).toEqual({ filters, sort: "stale" });
    expect(await loadWorkoutPrefs("u2")).toEqual({ filters: EMPTY_FILTERS, sort: DEFAULT_SORT });
  });

  it("keys by user", () => {
    expect(prefsKey("u1")).toBe("training.workouts.filters.v1:u1");
  });

  it("falls back to defaults on malformed JSON", async () => {
    mockMemory.set(prefsKey("u1"), "{not json");
    expect(await loadWorkoutPrefs("u1")).toEqual({ filters: EMPTY_FILTERS, sort: DEFAULT_SORT });
  });

  it("drops unknown enum values but keeps the rest", async () => {
    mockMemory.set(prefsKey("u1"), JSON.stringify({
      filters: { ...EMPTY_FILTERS, intensity: "extreme", history: "sometimes", blockRoles: ["main", "nap"], lengths: ["short", "huge"], skills: ["Advanced", "God"] },
      sort: "random",
    }));
    expect(await loadWorkoutPrefs("u1")).toEqual({
      filters: { ...EMPTY_FILTERS, blockRoles: ["main"], lengths: ["short"], skills: ["Advanced"] },
      sort: DEFAULT_SORT,
    });
  });

  it("keeps free-text values it cannot validate (creators, muscles, equipment)", async () => {
    mockMemory.set(prefsKey("u1"), JSON.stringify({ filters: { ...EMPTY_FILTERS, creators: ["@gone"], muscles: ["Chest"], equipment: ["Sled"] }, sort: "name" }));
    expect((await loadWorkoutPrefs("u1")).filters.creators).toEqual(["@gone"]);
  });

  it("survives a storage failure on read and write", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    expect(await loadWorkoutPrefs("u1")).toEqual({ filters: EMPTY_FILTERS, sort: DEFAULT_SORT });
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    await expect(saveWorkoutPrefs("u1", { filters: EMPTY_FILTERS, sort: "name" })).resolves.toBeUndefined();
  });

  it("loads prefs saved before formats existed, and drops unknown format/score values", async () => {
    const stored = { ...EMPTY_FILTERS } as Record<string, unknown>;
    delete stored.formats; delete stored.scores;
    mockMemory.set(prefsKey("u1"), JSON.stringify({ filters: stored, sort: "name" }));
    expect((await loadWorkoutPrefs("u1")).filters).toEqual(EMPTY_FILTERS);
    mockMemory.set(prefsKey("u1"), JSON.stringify({
      filters: { ...EMPTY_FILTERS, formats: ["amrap", "untagged", "tabata"], scores: ["load", "vibes"] }, sort: "name",
    }));
    const { filters } = await loadWorkoutPrefs("u1");
    expect(filters.formats).toEqual(["amrap", "untagged"]);
    expect(filters.scores).toEqual(["load"]);
  });
});
