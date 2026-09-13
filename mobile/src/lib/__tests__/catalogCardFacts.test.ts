import { catalogCardFacts } from "../catalogCardFacts";
import type { CatalogEntry } from "../../types/capture";

const base: CatalogEntry = {
  exerciseId: "e1",
  name: "Alternating Chest Fly",
  imageUrl: null,
  skillLevel: "Intermediate",
  equipmentTypes: ["Dumbbell", "Bench"],
  muscles: [
    { name: "Chest", isPrimary: true },
    { name: "Shoulders", isPrimary: false },
  ],
  goalTypes: [],
  category: "Weightlifting",
  tier: 2,
  scoringTypes: ["Load", "Reps"],
  sources: [{
    sourceId: "s1", platform: "instagram", sourceUrl: "https://x", posterHandle: "jlieb_fit",
    thumbnailUrl: null, capturedAt: "2026-09-01T00:00:00Z",
  }],
};

describe("catalogCardFacts", () => {
  it("splits primary from secondary muscles", () => {
    const f = catalogCardFacts(base);
    expect(f.primaryMuscle).toBe("Chest");
    expect(f.secondaryMuscles).toEqual(["Shoulders"]);
  });

  it("several primaries: first is the large icon, the rest join the secondaries", () => {
    const f = catalogCardFacts({ ...base, muscles: [
      { name: "Quads", isPrimary: true }, { name: "Glutes", isPrimary: true }, { name: "Core", isPrimary: false },
    ]});
    expect(f.primaryMuscle).toBe("Quads");
    expect(f.secondaryMuscles).toEqual(["Glutes", "Core"]);
  });

  it("no primary flagged: first muscle stands in as primary", () => {
    const f = catalogCardFacts({ ...base, muscles: [{ name: "Core", isPrimary: false }] });
    expect(f.primaryMuscle).toBe("Core");
    expect(f.secondaryMuscles).toEqual([]);
  });

  it("no muscles at all", () => {
    const f = catalogCardFacts({ ...base, muscles: [] });
    expect(f.primaryMuscle).toBeNull();
    expect(f.secondaryMuscles).toEqual([]);
  });

  it("badge: tier 1–3 → Tier n; tier 0 → Core; null → none", () => {
    expect(catalogCardFacts({ ...base, tier: 2 }).badge).toEqual({ kind: "tier", label: "Tier 2" });
    expect(catalogCardFacts({ ...base, tier: 0 }).badge).toEqual({ kind: "core", label: "Core" });
    expect(catalogCardFacts({ ...base, tier: null }).badge).toBeNull();
  });


  it("drops the 'not scored' placeholder from scoring types", () => {
    expect(catalogCardFacts({ ...base, scoringTypes: ["Not Scored / N/A"] }).scoringTypes).toEqual([]);
    expect(catalogCardFacts({ ...base, scoringTypes: ["Reps", "Not Scored / N/A", "Load"] }).scoringTypes).toEqual(["Reps", "Load"]);
  });

  it("passes skill, equipment and scoring through, minus placeholders", () => {
    const f = catalogCardFacts(base);
    expect(f.skillLevel).toBe("Intermediate");
    expect(f.equipment).toEqual(["Dumbbell", "Bench"]);
    expect(f.scoringTypes).toEqual(["Load", "Reps"]);
  });

  it("dedupes repeated muscle and equipment names", () => {
    const f = catalogCardFacts({ ...base,
      muscles: [{ name: "Chest", isPrimary: true }, { name: "Shoulders", isPrimary: false }, { name: "Shoulders", isPrimary: false }, { name: "Chest", isPrimary: false }],
      equipmentTypes: ["Dumbbell", "Dumbbell", "Bench"],
    });
    expect(f.primaryMuscle).toBe("Chest");
    expect(f.secondaryMuscles).toEqual(["Shoulders"]);
    expect(f.equipment).toEqual(["Dumbbell", "Bench"]);
  });
});
