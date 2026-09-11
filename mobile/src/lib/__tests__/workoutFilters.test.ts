import {
  applyWorkoutFilters, countActiveFilters, activeFilterChips, removeChip,
  mostRestrictiveAxis, creatorCounts, clearAxis,
} from "../workoutFilters";
import { EMPTY_FILTERS } from "../../types/workoutFilters";
import type { WorkoutFilters } from "../../types/workoutFilters";
import type { CapturedWorkoutEntry } from "../../types/capture";
import type { CompletionMap } from "../workoutCompletion";

const workout = ({ id, ...o }: Partial<CapturedWorkoutEntry> & { id?: string } = {}): CapturedWorkoutEntry => ({
  workoutId: id ?? "w-1",
  name: "KB Upper",
  rounds: null, rawProtocol: null, description: null, notes: null,
  capturedAt: "2026-09-01T00:00:00Z",
  source: {
    sourceId: "s-1", platform: "instagram", sourceUrl: "https://x",
    posterHandle: "@onlinewod", thumbnailUrl: null, captionText: null,
  },
  items: [],
  tags: {
    blockRoles: ["main"], muscles: [{ name: "Chest", isPrimary: true }, { name: "Triceps", isPrimary: false }],
    estMinutes: 20, intensity: "moderate", skillLevel: "Intermediate",
    format: null, scoreType: null, formatMinutes: null, classifiedAt: "2026-09-01T00:00:00Z",
  },
  derivedEquipment: ["Kettlebell"],
  isBodyweight: false,
  ...o,
});
const f = (o: Partial<WorkoutFilters>): WorkoutFilters => ({ ...EMPTY_FILTERS, ...o });
const none: CompletionMap = {};

describe("applyWorkoutFilters", () => {
  it("passes everything when every axis is off", () => {
    expect(applyWorkoutFilters([workout()], EMPTY_FILTERS, none)).toHaveLength(1);
  });

  it("creator: exact handle; no source never matches", () => {
    expect(applyWorkoutFilters([workout()], f({ creators: ["@onlinewod"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([workout()], f({ creators: ["@other"] }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([workout({ source: null })], f({ creators: ["@onlinewod"] }), none)).toHaveLength(0);
  });

  it("muscle: primary only, and Full Body is not a wildcard", () => {
    expect(applyWorkoutFilters([workout()], f({ muscles: ["Chest"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([workout()], f({ muscles: ["Triceps"] }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([workout()], f({ muscles: ["Full Body"] }), none)).toHaveLength(0);
  });

  it("equipment: derived list, or Bodyweight flag", () => {
    expect(applyWorkoutFilters([workout()], f({ equipment: ["Kettlebell"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([workout()], f({ equipment: ["Bodyweight"] }), none)).toHaveLength(0);
    const bw = workout({ derivedEquipment: [], isBodyweight: true });
    expect(applyWorkoutFilters([bw], f({ equipment: ["Bodyweight"] }), none)).toHaveLength(1);
  });

  it("type: any selected role", () => {
    expect(applyWorkoutFilters([workout()], f({ blockRoles: ["warmup", "main"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([workout()], f({ blockRoles: ["cooldown"] }), none)).toHaveLength(0);
  });

  it("intensity, length, skill: unclassified never matches an active axis", () => {
    const untagged = workout({ tags: { blockRoles: [], muscles: [], estMinutes: null, intensity: null, skillLevel: null, format: null, scoreType: null, formatMinutes: null, classifiedAt: null } });
    expect(applyWorkoutFilters([untagged], f({ intensity: "moderate" }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([untagged], f({ lengths: ["short"] }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([untagged], f({ skills: ["Beginner"] }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([untagged], EMPTY_FILTERS, none)).toHaveLength(1);
  });

  it("length bands: 15 is short, 16 is medium, 30/31 split, 45 is long, 46 is xlong", () => {
    const at = (m: number) => workout({ tags: { ...workout().tags, estMinutes: m } });
    expect(applyWorkoutFilters([at(30)], f({ lengths: ["medium"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([at(31)], f({ lengths: ["medium"] }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([at(31)], f({ lengths: ["long"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([at(15)], f({ lengths: ["short"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([at(16)], f({ lengths: ["short"] }), none)).toHaveLength(0);
    expect(applyWorkoutFilters([at(16)], f({ lengths: ["medium"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([at(45)], f({ lengths: ["long"] }), none)).toHaveLength(1);
    expect(applyWorkoutFilters([at(46)], f({ lengths: ["xlong"] }), none)).toHaveLength(1);
  });

  it("history: never / done", () => {
    const done: CompletionMap = { "w-1": { count: 2, lastCompleted: "2026-09-01" } };
    expect(applyWorkoutFilters([workout()], f({ history: "never" }), done)).toHaveLength(0);
    expect(applyWorkoutFilters([workout()], f({ history: "done" }), done)).toHaveLength(1);
    expect(applyWorkoutFilters([workout()], f({ history: "never" }), none)).toHaveLength(1);
  });

  it("ANDs across axes and ORs within one", () => {
    const list = [workout({ id: "a" }), workout({ id: "b", derivedEquipment: ["Dumbbell"] })];
    expect(applyWorkoutFilters(list, f({ equipment: ["Kettlebell", "Dumbbell"] }), none)).toHaveLength(2);
    expect(applyWorkoutFilters(list, f({ equipment: ["Kettlebell"], intensity: "high" }), none)).toHaveLength(0);
  });

  it("format: selected formats, or Untagged for a null format", () => {
    const amrapW = workout({ id: "a", tags: { ...workout().tags, format: "amrap" } });
    const blankW = workout({ id: "b", tags: { ...workout().tags, format: null } });
    expect(applyWorkoutFilters([amrapW, blankW], f({ formats: ["amrap"] }), none)).toEqual([amrapW]);
    expect(applyWorkoutFilters([amrapW, blankW], f({ formats: ["untagged"] }), none)).toEqual([blankW]);
    expect(applyWorkoutFilters([amrapW, blankW], f({ formats: ["amrap", "untagged"] }), none)).toHaveLength(2);
    expect(applyWorkoutFilters([amrapW, blankW], f({ formats: ["emom"] }), none)).toHaveLength(0);
  });

  it("score: selected scores; null never matches", () => {
    const loadW = workout({ id: "a", tags: { ...workout().tags, scoreType: "load" } });
    const blankW = workout({ id: "b", tags: { ...workout().tags, scoreType: null } });
    expect(applyWorkoutFilters([loadW, blankW], f({ scores: ["load"] }), none)).toEqual([loadW]);
    expect(applyWorkoutFilters([loadW, blankW], f({ scores: ["time"] }), none)).toHaveLength(0);
  });
});

describe("countActiveFilters", () => {
  it("counts one per selected value, one per active single-choice axis", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters(f({ equipment: ["Kettlebell"], muscles: ["Chest", "Lats"], intensity: "low", history: "never" }))).toBe(5);
  });

  it("counts formats and scores", () => {
    expect(countActiveFilters(f({ formats: ["amrap", "untagged"], scores: ["load"] }))).toBe(3);
  });
});

describe("activeFilterChips / removeChip", () => {
  it("collapses a fully selected muscle group into one chip and removes it whole", () => {
    const filters = f({ muscles: ["Core", "Obliques", "Lower Back", "Chest"], equipment: ["Bar"] });
    const chips = activeFilterChips(filters);
    expect(chips.map((c) => c.label)).toEqual(["Core group", "Chest", "Pull-up bar"]);
    const after = removeChip(filters, chips[0]);
    expect(after.muscles).toEqual(["Chest"]);
    expect(after.equipment).toEqual(["Bar"]);
  });

  it("does not collapse a partially selected group", () => {
    const chips = activeFilterChips(f({ muscles: ["Core", "Obliques"] }));
    expect(chips.map((c) => c.label)).toEqual(["Core", "Obliques"]);
  });

  it("labels the single-choice axes and removes them to their off value", () => {
    const filters = f({ intensity: "high", history: "never", creators: ["@onlinewod"], blockRoles: ["main"], lengths: ["short"], skills: ["Advanced"] });
    const chips = activeFilterChips(filters);
    expect(chips.map((c) => c.label)).toEqual(["@onlinewod", "Main workout", "High", "≤ 15 min", "Advanced", "Never done"]);
    let out = filters;
    for (const c of chips) out = removeChip(out, c);
    expect(out).toEqual(EMPTY_FILTERS);
  });

  it("labels format and score chips with the vocabulary, Untagged included, and removes them", () => {
    const filters = f({ formats: ["amrap", "untagged"], scores: ["calories"] });
    const chips = activeFilterChips(filters);
    expect(chips.map((c) => c.label)).toEqual(["AMRAP", "Untagged", "Calories"]);
    let out = filters;
    for (const c of chips) out = removeChip(out, c);
    expect(out).toEqual(EMPTY_FILTERS);
  });
});

describe("mostRestrictiveAxis", () => {
  it("names the axis whose removal restores the most workouts, with its count", () => {
    const list = [
      workout({ id: "a", tags: { ...workout().tags, blockRoles: ["cooldown"] } }),
      workout({ id: "b", tags: { ...workout().tags, blockRoles: ["cooldown"] } }),
      workout({ id: "c", derivedEquipment: ["Dumbbell"], tags: { ...workout().tags, blockRoles: ["main"] } }),
    ];
    const filters = f({ equipment: ["Kettlebell"], blockRoles: ["main"] });
    expect(applyWorkoutFilters(list, filters, none)).toHaveLength(0);
    expect(mostRestrictiveAxis(list, filters, none, "")).toEqual({ axis: "blockRoles", label: "Main workout", count: 2 });
  });

  it("names every value on the axis it would clear, and prefers the later axis on a tie", () => {
    const list = [workout({ id: "a", derivedEquipment: ["Sled"], tags: { ...workout().tags, blockRoles: ["cooldown"] } })];
    const filters = f({ equipment: ["Kettlebell", "Dumbbell"], blockRoles: ["main"] });
    // Clearing either axis alone still leaves the other blocking: null.
    expect(mostRestrictiveAxis(list, filters, none, "")).toBeNull();
    const two = [
      workout({ id: "a", derivedEquipment: ["Sled"] }),
      workout({ id: "b", tags: { ...workout().tags, blockRoles: ["cooldown"] } }),
    ];
    // Each axis restores exactly one; the tie goes to blockRoles, the later axis.
    expect(mostRestrictiveAxis(two, filters, none, "")).toEqual({ axis: "blockRoles", label: "Main workout", count: 1 });
    const eq = f({ equipment: ["Kettlebell", "Dumbbell"] });
    expect(mostRestrictiveAxis([workout({ id: "x", derivedEquipment: ["Sled"] })], eq, none, "")?.label).toBe("Kettlebell + Dumbbell");
  });

  it("clearAxis switches one axis off with fresh arrays", () => {
    const filters = f({ equipment: ["Bar"], intensity: "low" });
    const out = clearAxis(filters, "equipment");
    expect(out).toEqual(f({ intensity: "low" }));
    expect(out.equipment).not.toBe(EMPTY_FILTERS.equipment);
    expect(clearAxis(filters, "intensity").intensity).toBeNull();
  });

  it("returns null when no single removal helps", () => {
    const list = [workout({ id: "a", derivedEquipment: ["Dumbbell"], tags: { ...workout().tags, blockRoles: ["cooldown"] } })];
    expect(mostRestrictiveAxis(list, f({ equipment: ["Kettlebell"], blockRoles: ["main"] }), none, "")).toBeNull();
  });

  it("respects the header search", () => {
    const list = [workout({ id: "a", name: "Zulu", tags: { ...workout().tags, blockRoles: ["cooldown"] } })];
    expect(mostRestrictiveAxis(list, f({ blockRoles: ["main"] }), none, "zzz")).toBeNull();
    expect(mostRestrictiveAxis(list, f({ blockRoles: ["main"] }), none, "zulu")?.count).toBe(1);
  });

  it("clears the format axis when that restores the most", () => {
    const list = [workout({ id: "a", tags: { ...workout().tags, format: "emom" } })];
    const filters = f({ formats: ["amrap"], equipment: ["Kettlebell"] });
    expect(mostRestrictiveAxis(list, filters, none, "")).toEqual({ axis: "formats", label: "AMRAP", count: 1 });
  });
});

describe("creatorCounts", () => {
  it("orders by count desc then handle, skipping missing handles", () => {
    const list = [
      workout({ id: "a" }), workout({ id: "b" }),
      workout({ id: "c", source: { ...workout().source!, posterHandle: "@abc" } }),
      workout({ id: "d", source: null }),
    ];
    expect(creatorCounts(list)).toEqual([{ handle: "@onlinewod", count: 2 }, { handle: "@abc", count: 1 }]);
  });
});
