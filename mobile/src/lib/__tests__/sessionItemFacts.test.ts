import { sessionItemToCatalogEntry } from "../sessionItemFacts";
import { catalogCardFacts } from "../catalogCardFacts";
import type { StoredSessionItem } from "../../types/daily";

const full: StoredSessionItem = {
  id: "si1",
  exerciseId: "e1",
  name: "Alternating Chest Fly",
  section: "main",
  itemOrder: 0,
  targetSets: 3,
  targetReps: "8-12",
  restSeconds: 90,
  reason: "hits the day's push focus",
  wasPerformed: null,
  imageUrl: "https://img/e1.png",
  skillLevel: "Intermediate",
  tier: 2,
  muscles: [
    { name: "Chest", isPrimary: true },
    { name: "Shoulders", isPrimary: false },
  ],
  equipmentTypes: ["Dumbbell", "Bench"],
  scoringTypes: ["Load", "Reps"],
};

const lean: StoredSessionItem = {
  id: "si2",
  exerciseId: "e2",
  name: "Mystery Move",
  section: "main",
  itemOrder: 1,
  targetSets: null,
  targetReps: null,
  restSeconds: null,
  reason: null,
  wasPerformed: null,
  imageUrl: null,
  skillLevel: null,
  tier: null,
  muscles: [],
  equipmentTypes: [],
  scoringTypes: [],
};

describe("sessionItemToCatalogEntry", () => {
  it("passes the display facts through onto the CatalogEntry", () => {
    const entry = sessionItemToCatalogEntry(full);
    expect(entry.exerciseId).toBe("e1");
    expect(entry.name).toBe("Alternating Chest Fly");
    expect(entry.imageUrl).toBe("https://img/e1.png");
    expect(entry.skillLevel).toBe("Intermediate");
    expect(entry.tier).toBe(2);
    expect(entry.equipmentTypes).toEqual(["Dumbbell", "Bench"]);
    expect(entry.muscles).toEqual([
      { name: "Chest", isPrimary: true },
      { name: "Shoulders", isPrimary: false },
    ]);
    expect(entry.scoringTypes).toEqual(["Load", "Reps"]);
    expect(entry.sources).toEqual([]);
    expect(entry.goalTypes).toEqual([]);
    expect(entry.category).toBeNull();
  });

  it("a lean item yields a valid, empty CatalogEntry", () => {
    const entry = sessionItemToCatalogEntry(lean);
    expect(entry.imageUrl).toBeNull();
    expect(entry.skillLevel).toBeNull();
    expect(entry.tier).toBeNull();
    expect(entry.muscles).toEqual([]);
    expect(entry.equipmentTypes).toEqual([]);
    expect(entry.scoringTypes).toEqual([]);
    expect(entry.sources).toEqual([]);
  });

  it("the result drives catalogCardFacts unchanged", () => {
    const facts = catalogCardFacts(sessionItemToCatalogEntry(full));
    expect(facts.badge).toEqual({ kind: "tier", label: "Tier 2" });
    expect(facts.primaryMuscle).toBe("Chest");
    expect(facts.secondaryMuscles).toEqual(["Shoulders"]);
    expect(facts.skillLevel).toBe("Intermediate");
    expect(facts.equipment).toEqual(["Dumbbell", "Bench"]);
    expect(facts.scoringTypes).toEqual(["Load", "Reps"]);
  });
});
