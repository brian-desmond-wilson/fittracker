import { musclesOf } from "../exerciseMuscles";

describe("musclesOf (spec §5.1: primaries first, then secondaries, each in name order)", () => {
  it("orders primaries before secondaries and each group by name", () => {
    expect(musclesOf([
      { is_primary: false, muscle_region: { name: "Triceps" } },
      { is_primary: true, muscle_region: { name: "Shoulders" } },
      { is_primary: false, muscle_region: { name: "Core" } },
      { is_primary: true, muscle_region: { name: "Chest" } },
    ])).toEqual([
      { name: "Chest", isPrimary: true },
      { name: "Shoulders", isPrimary: true },
      { name: "Core", isPrimary: false },
      { name: "Triceps", isPrimary: false },
    ]);
  });

  it("drops rows whose region did not join and treats a null flag as secondary", () => {
    expect(musclesOf([
      { is_primary: null, muscle_region: { name: "Lats" } },
      { is_primary: true, muscle_region: null },
    ])).toEqual([{ name: "Lats", isPrimary: false }]);
  });

  it("is empty for null, undefined, or no rows", () => {
    expect(musclesOf(null)).toEqual([]);
    expect(musclesOf(undefined)).toEqual([]);
    expect(musclesOf([])).toEqual([]);
  });
});
