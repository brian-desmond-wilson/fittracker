import {
  applyExerciseFilters, applyExerciseFiltersAndSearch, countActiveExerciseFilters,
  activeExerciseFilterChips, removeExerciseChip, clearExerciseAxis,
  mostRestrictiveExerciseAxis, exerciseCreatorCounts, catalogEquipmentNames, catalogGoalTypes,
} from "../exerciseFilters";
import { EMPTY_EXERCISE_FILTERS } from "../../types/exerciseFilters";
import type { ExerciseFilters } from "../../types/exerciseFilters";
import type { CatalogEntry, CaptureSource } from "../../types/capture";

const source = (handle: string, capturedAt = "2026-09-01T00:00:00Z"): CaptureSource => ({
  sourceId: `s-${handle}`, platform: "instagram", sourceUrl: "https://x",
  posterHandle: handle, thumbnailUrl: null, capturedAt,
});

const ex = (o: Partial<CatalogEntry> & { id?: string } = {}): CatalogEntry => {
  const { id, ...rest } = o;
  return {
    exerciseId: id ?? "e-1",
    name: "Kettlebell Swing",
    imageUrl: "https://img/1.png",
    skillLevel: "Intermediate",
    equipmentTypes: ["Kettlebell", "Floor"],
    muscles: [{ name: "Glutes", isPrimary: true }, { name: "Hamstrings", isPrimary: false }],
    goalTypes: ["Strength"],
    sources: [source("@a")],
    ...rest,
  };
};
const f = (o: Partial<ExerciseFilters>): ExerciseFilters => ({ ...EMPTY_EXERCISE_FILTERS, ...o });
const ids = (list: CatalogEntry[]) => list.map((e) => e.exerciseId);

describe("applyExerciseFilters", () => {
  it("passes everything when every axis is off", () => {
    expect(applyExerciseFilters([ex()], EMPTY_EXERCISE_FILTERS)).toHaveLength(1);
  });

  it("creator: any reviewed source's handle, exact", () => {
    const two = ex({ sources: [source("@a"), source("@b")] });
    expect(applyExerciseFilters([two], f({ creators: ["@b"] }))).toHaveLength(1);
    expect(applyExerciseFilters([two], f({ creators: ["@c"] }))).toHaveLength(0);
  });

  it("muscle: primary only", () => {
    expect(applyExerciseFilters([ex()], f({ muscles: ["Glutes"] }))).toHaveLength(1);
    expect(applyExerciseFilters([ex()], f({ muscles: ["Hamstrings"] }))).toHaveLength(0);
  });

  it("equipment: direct match on the exercise's own list", () => {
    expect(applyExerciseFilters([ex()], f({ equipment: ["Kettlebell"] }))).toHaveLength(1);
    expect(applyExerciseFilters([ex()], f({ equipment: ["Dumbbell"] }))).toHaveLength(0);
    expect(applyExerciseFilters([ex({ equipmentTypes: ["Bodyweight"] })], f({ equipment: ["Bodyweight"] }))).toHaveLength(1);
  });

  it("goal type", () => {
    expect(applyExerciseFilters([ex()], f({ goalTypes: ["Strength"] }))).toHaveLength(1);
    expect(applyExerciseFilters([ex()], f({ goalTypes: ["Mobility"] }))).toHaveLength(0);
  });

  it("skill: exact; an unrated exercise never matches", () => {
    expect(applyExerciseFilters([ex()], f({ skills: ["Intermediate"] }))).toHaveLength(1);
    expect(applyExerciseFilters([ex()], f({ skills: ["Beginner"] }))).toHaveLength(0);
    expect(applyExerciseFilters([ex({ skillLevel: null })], f({ skills: ["Intermediate"] }))).toHaveLength(0);
  });

  it("picture: has / missing on set, null and empty URLs", () => {
    const blank = ex({ id: "blank", imageUrl: null });
    const empty = ex({ id: "empty", imageUrl: "" });
    const blankish = ex({ id: "blankish", imageUrl: "   " });
    const all = [ex(), blank, empty, blankish];
    expect(ids(applyExerciseFilters(all, f({ picture: "has" })))).toEqual(["e-1"]);
    expect(ids(applyExerciseFilters(all, f({ picture: "missing" })))).toEqual(["blank", "empty", "blankish"]);
  });

  it("OR within an axis, AND across axes", () => {
    const a = ex({ id: "a", equipmentTypes: ["Kettlebell"] });
    const b = ex({ id: "b", equipmentTypes: ["Dumbbell"], goalTypes: ["Mobility"] });
    expect(ids(applyExerciseFilters([a, b], f({ equipment: ["Kettlebell", "Dumbbell"] })))).toEqual(["a", "b"]);
    expect(ids(applyExerciseFilters([a, b], f({ equipment: ["Kettlebell", "Dumbbell"], goalTypes: ["Mobility"] })))).toEqual(["b"]);
  });

  it("creator: a null handle or no sources never matches, and never throws", () => {
    const anon = ex({ id: "anon", sources: [{ ...source("@x"), posterHandle: null }] });
    const none = ex({ id: "none", sources: [] });
    expect(applyExerciseFilters([anon, none], f({ creators: ["@x"] }))).toEqual([]);
    expect(applyExerciseFilters([anon, none], EMPTY_EXERCISE_FILTERS)).toHaveLength(2);
  });
});

describe("applyExerciseFiltersAndSearch", () => {
  it("search on name or handle, after filters", () => {
    const a = ex({ id: "a", name: "Goblet Squat", sources: [source("@kb_guy")] });
    const b = ex({ id: "b", name: "Swing", sources: [source("@other")] });
    expect(ids(applyExerciseFiltersAndSearch([a, b], EMPTY_EXERCISE_FILTERS, "goblet"))).toEqual(["a"]);
    expect(ids(applyExerciseFiltersAndSearch([a, b], EMPTY_EXERCISE_FILTERS, "KB_GUY"))).toEqual(["a"]);
    expect(ids(applyExerciseFiltersAndSearch([a, b], f({ goalTypes: ["Mobility"] }), "swing"))).toEqual([]);
    expect(ids(applyExerciseFiltersAndSearch([a, b], EMPTY_EXERCISE_FILTERS, "  "))).toEqual(["a", "b"]);
  });

  it("search ignores null handles and still matches the name", () => {
    const anon = ex({ id: "anon", name: "Pistol Squat", sources: [{ ...source("@x"), posterHandle: null }] });
    expect(ids(applyExerciseFiltersAndSearch([anon], EMPTY_EXERCISE_FILTERS, "pistol"))).toEqual(["anon"]);
    expect(ids(applyExerciseFiltersAndSearch([anon], EMPTY_EXERCISE_FILTERS, "@x"))).toEqual([]);
  });
});

describe("chips", () => {
  it("counts one per value, one for a set picture", () => {
    expect(countActiveExerciseFilters(EMPTY_EXERCISE_FILTERS)).toBe(0);
    expect(countActiveExerciseFilters(f({ creators: ["@a"], equipment: ["Kettlebell", "Bar"], picture: "missing" }))).toBe(4);
  });

  it("lists chips in sheet order with equipment labels and picture wording", () => {
    const chips = activeExerciseFilterChips(f({
      picture: "missing", skills: ["Beginner"], goalTypes: ["Strength"], equipment: ["Bar"], muscles: ["Chest"], creators: ["@a"],
    }));
    expect(chips.map((c) => `${c.axis}:${c.label}`)).toEqual([
      "creators:@a", "muscles:Chest", "equipment:Pull-up bar", "goalTypes:Strength", "skills:Beginner", "picture:No picture",
    ]);
  });

  it("collapses a fully selected muscle group into one chip", () => {
    const core = ["Core", "Obliques", "Lower Back"];
    const chips = activeExerciseFilterChips(f({ muscles: [...core, "Chest"] }));
    expect(chips.map((c) => c.label)).toEqual(["Core group", "Chest"]);
    expect(chips[0].values).toEqual(core);
  });

  it("removeExerciseChip drops the chip's values; picture goes back to any", () => {
    const start = f({ muscles: ["Core", "Obliques", "Lower Back", "Chest"], picture: "has" });
    const [group, , pic] = activeExerciseFilterChips(start);
    expect(removeExerciseChip(start, group).muscles).toEqual(["Chest"]);
    expect(removeExerciseChip(start, pic).picture).toBe("any");
  });

  it("clearExerciseAxis switches one axis off with a fresh array", () => {
    const cleared = clearExerciseAxis(f({ equipment: ["Bar"], picture: "has" }), "equipment");
    expect(cleared.equipment).toEqual([]);
    expect(cleared.picture).toBe("has");
    expect(cleared.equipment).not.toBe(EMPTY_EXERCISE_FILTERS.equipment);
    expect(clearExerciseAxis(f({ picture: "has" }), "picture").picture).toBe("any");
  });
});

describe("mostRestrictiveExerciseAxis", () => {
  const a = ex({ id: "a", equipmentTypes: ["Kettlebell"], goalTypes: ["Strength"], skillLevel: "Beginner" });
  const b = ex({ id: "b", equipmentTypes: ["Dumbbell"], goalTypes: ["Strength"], skillLevel: "Beginner" });
  const c = ex({ id: "c", equipmentTypes: ["Dumbbell"], goalTypes: ["Mobility"], skillLevel: "Advanced" });

  it("names the axis whose clearing brings back the most", () => {
    // equipment=Kettlebell AND goalTypes=Mobility → nothing. Clearing equipment → c (1); clearing goalTypes → a (1). Tie → lower axis wins: goalTypes.
    const r = mostRestrictiveExerciseAxis([a, b, c], f({ equipment: ["Kettlebell"], goalTypes: ["Mobility"] }), "");
    expect(r).toEqual({ axis: "goalTypes", label: "Mobility", count: 1 });
  });

  it("prefers the larger rescue", () => {
    const r = mostRestrictiveExerciseAxis([a, b, c], f({ equipment: ["Dumbbell"], skills: ["Intermediate"] }), "");
    expect(r?.axis).toBe("skills");
    expect(r?.count).toBe(2);
  });

  it("is null when no single clearing helps", () => {
    expect(mostRestrictiveExerciseAxis([a, b, c], f({ equipment: ["Bar"], goalTypes: ["Skill"] }), "")).toBeNull();
  });

  it("respects the search", () => {
    expect(mostRestrictiveExerciseAxis([a, b, c], f({ equipment: ["Bar"] }), "zzz")).toBeNull();
  });
});

describe("catalog vocab", () => {
  it("exerciseCreatorCounts: most exercises first, then A–Z", () => {
    const list = [
      ex({ id: "1", sources: [source("@b")] }),
      ex({ id: "2", sources: [source("@a"), source("@b")] }),
      ex({ id: "3", sources: [source("@c")] }),
    ];
    expect(exerciseCreatorCounts(list)).toEqual([
      { handle: "@b", count: 2 }, { handle: "@a", count: 1 }, { handle: "@c", count: 1 },
    ]);
  });

  it("catalogEquipmentNames: grid order first, then A–Z, surfaces dropped", () => {
    const list = [
      ex({ id: "1", equipmentTypes: ["Floor", "Trap Bar", "Dumbbell"] }),
      ex({ id: "2", equipmentTypes: ["Kettlebell", "Wall", "Landmine"] }),
    ];
    expect(catalogEquipmentNames(list)).toEqual([
      { name: "Kettlebell", label: "Kettlebell" },
      { name: "Dumbbell", label: "Dumbbell" },
      { name: "Landmine", label: "Landmine" },
      { name: "Trap Bar", label: "Trap Bar" },
    ]);
  });

  it("catalogGoalTypes: distinct, A–Z", () => {
    const list = [ex({ id: "1", goalTypes: ["Strength", "MetCon"] }), ex({ id: "2", goalTypes: ["MetCon"] })];
    expect(catalogGoalTypes(list)).toEqual(["MetCon", "Strength"]);
  });
});
