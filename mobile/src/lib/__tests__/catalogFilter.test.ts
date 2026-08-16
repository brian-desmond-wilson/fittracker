import { filterCatalog } from "../catalogFilter";
import type { CatalogEntry } from "../../types/capture";

const entry = (overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
  exerciseId: "ex-1",
  name: "Kettlebell RDL",
  skillLevel: "Intermediate",
  equipmentTypes: ["Kettlebell"],
  muscles: [
    { name: "Glutes", isPrimary: true },
    { name: "Hamstrings", isPrimary: false },
  ],
  goalTypes: ["Strength"],
  sources: [
    {
      sourceId: "s-1",
      platform: "instagram",
      sourceUrl: "https://instagram.com/p/abc",
      posterHandle: "@kbcoach",
      thumbnailUrl: null,
      capturedAt: "2026-08-16T00:00:00Z",
    },
  ],
  ...overrides,
});

const none = { muscle: null, equipment: null, category: null, handle: null, search: "" };

describe("filterCatalog", () => {
  it("passes everything through with no filters", () => {
    expect(filterCatalog([entry()], none)).toHaveLength(1);
  });

  it("filters by muscle (primary or secondary)", () => {
    const list = [entry(), entry({ exerciseId: "ex-2", muscles: [{ name: "Chest", isPrimary: true }] })];
    expect(filterCatalog(list, { ...none, muscle: "Hamstrings" }).map((e) => e.exerciseId)).toEqual(["ex-1"]);
  });

  it("filters by equipment", () => {
    const list = [entry(), entry({ exerciseId: "ex-2", equipmentTypes: ["Barbell"] })];
    expect(filterCatalog(list, { ...none, equipment: "Barbell" }).map((e) => e.exerciseId)).toEqual(["ex-2"]);
  });

  it("filters by category (goal type)", () => {
    const list = [entry(), entry({ exerciseId: "ex-2", goalTypes: ["Mobility"] })];
    expect(filterCatalog(list, { ...none, category: "Mobility" }).map((e) => e.exerciseId)).toEqual(["ex-2"]);
  });

  it("filters by poster handle", () => {
    const other = entry({ exerciseId: "ex-2" });
    other.sources = [{ ...other.sources[0], sourceId: "s-2", posterHandle: "@glutegal" }];
    expect(filterCatalog([entry(), other], { ...none, handle: "@glutegal" }).map((e) => e.exerciseId)).toEqual(["ex-2"]);
  });

  it("searches name and handle, case-insensitive", () => {
    const list = [entry(), entry({ exerciseId: "ex-2", name: "Goblet Squat" })];
    expect(filterCatalog(list, { ...none, search: "goblet" }).map((e) => e.exerciseId)).toEqual(["ex-2"]);
    expect(filterCatalog(list, { ...none, search: "KBCOACH" })).toHaveLength(2);
  });

  it("combines filters with AND", () => {
    const list = [
      entry(),
      entry({ exerciseId: "ex-2", equipmentTypes: ["Barbell"] }),
    ];
    expect(filterCatalog(list, { ...none, muscle: "Glutes", equipment: "Kettlebell" }).map((e) => e.exerciseId)).toEqual(["ex-1"]);
  });
});
