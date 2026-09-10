import { deriveWorkoutEquipment, EQUIPMENT_GRID, primaryEquipmentLabel } from "../workoutEquipment";
import type { CapturedWorkoutItemEntry } from "../../types/capture";

const item = (equipment?: string[]): CapturedWorkoutItemEntry => ({
  exerciseId: "e", name: "x", sets: null, reps: null, weight: null,
  duration: null, restSeconds: null, notes: null, equipment,
});

describe("deriveWorkoutEquipment", () => {
  it("needs a strict majority: 2 of 4 is not enough, 3 of 4 is", () => {
    const two = [item(["Kettlebell"]), item(["Kettlebell"]), item(["Dumbbell"]), item(["Barbell"])];
    expect(deriveWorkoutEquipment(two).derivedEquipment).toEqual([]);
    const three = [item(["Kettlebell"]), item(["Kettlebell"]), item(["Kettlebell"]), item(["Barbell"])];
    expect(deriveWorkoutEquipment(three).derivedEquipment).toEqual(["Kettlebell"]);
  });

  it("can name more than one implement when each clears the bar", () => {
    const items = [item(["Kettlebell", "Bench"]), item(["Kettlebell", "Bench"]), item(["Dumbbell"])];
    expect(deriveWorkoutEquipment(items).derivedEquipment).toEqual(["Kettlebell", "Bench"]);
  });

  it("ignores Floor and Wall as surfaces, not equipment", () => {
    const items = [item(["Bodyweight", "Floor"]), item(["Floor"]), item(["Wall"])];
    const out = deriveWorkoutEquipment(items);
    expect(out.derivedEquipment).toEqual([]);
    expect(out.isBodyweight).toBe(true);
  });

  it("counts a pull-up bar as equipment, so pull-ups are not bodyweight", () => {
    const items = [item(["Bar"]), item(["Bodyweight"])];
    const out = deriveWorkoutEquipment(items);
    expect(out.isBodyweight).toBe(false);
    expect(out.derivedEquipment).toEqual([]);
  });

  it("is bodyweight only when every movement is", () => {
    expect(deriveWorkoutEquipment([item(["Bodyweight"]), item([])]).isBodyweight).toBe(true);
    expect(deriveWorkoutEquipment([item(["Bodyweight"]), item(["Kettlebell"])]).isBodyweight).toBe(false);
  });

  it("never lists Bodyweight as derived equipment", () => {
    expect(deriveWorkoutEquipment([item(["Bodyweight"]), item(["Bodyweight"])]).derivedEquipment).toEqual([]);
  });

  it("leaves items without an equipment array out of the count", () => {
    const items = [item(undefined), item(undefined), item(["Kettlebell"])];
    expect(deriveWorkoutEquipment(items).derivedEquipment).toEqual(["Kettlebell"]);
  });

  it("derives nothing and is not bodyweight with no countable items", () => {
    expect(deriveWorkoutEquipment([])).toEqual({ derivedEquipment: [], isBodyweight: false });
    expect(deriveWorkoutEquipment([item(undefined)])).toEqual({ derivedEquipment: [], isBodyweight: false });
  });

  it("orders derived names by the grid order, unknown names last alphabetically", () => {
    const items = [item(["Zebra Machine", "Bench", "Kettlebell"]), item(["Zebra Machine", "Bench", "Kettlebell"])];
    expect(deriveWorkoutEquipment(items).derivedEquipment).toEqual(["Kettlebell", "Bench", "Zebra Machine"]);
  });
});

describe("primaryEquipmentLabel", () => {
  it("names the first derived implement, else Bodyweight, else null", () => {
    expect(primaryEquipmentLabel({ derivedEquipment: ["Dumbbell", "Bench"], isBodyweight: false })).toBe("Dumbbell");
    expect(primaryEquipmentLabel({ derivedEquipment: [], isBodyweight: true })).toBe("Bodyweight");
    expect(primaryEquipmentLabel({ derivedEquipment: [], isBodyweight: false })).toBeNull();
  });
  it("shows the friendly label for Bar", () => {
    expect(primaryEquipmentLabel({ derivedEquipment: ["Bar"], isBodyweight: false })).toBe("Pull-up bar");
  });
});

describe("EQUIPMENT_GRID", () => {
  it("starts with the four the mockup leads with and includes Bodyweight once", () => {
    expect(EQUIPMENT_GRID.slice(0, 4).map((e) => e.name)).toEqual(["Kettlebell", "Dumbbell", "Barbell", "Bodyweight"]);
    expect(EQUIPMENT_GRID.filter((e) => e.name === "Bodyweight")).toHaveLength(1);
  });
});
