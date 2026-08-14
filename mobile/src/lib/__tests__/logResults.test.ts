import { mergeLogResults } from "../logResults";
import type { MealWithItems } from "../../types/meal-library";
import type { SavedFood } from "../../types/track";

const food = (id: string, name: string): SavedFood =>
  ({ id, name, calories: 400 }) as unknown as SavedFood;

const meal = (id: string, name: string, foodIds: string[]): MealWithItems =>
  ({
    id,
    name,
    items: foodIds.map((fid, i) => ({ id: `${id}-${i}`, saved_food_id: fid })),
  }) as unknown as MealWithItems;

describe("mergeLogResults", () => {
  it("drops the food a one-item meal already is", () => {
    // The Thistle case: one dish, stored twice, shown twice — and the food row
    // was the one that never recorded which meal had been eaten.
    const merged = mergeLogResults({
      meals: [meal("m1", "Sweet Sorghum Salad", ["f1"])],
      foods: [food("f1", "Sweet Sorghum Salad")],
      limit: 4,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ kind: "meal" });
  });

  it("keeps an ingredient of a bigger meal as its own answer", () => {
    // Searching "peanut butter" and finding a PB&J does not mean you cannot
    // log the peanut butter by itself.
    const merged = mergeLogResults({
      meals: [meal("m1", "PB&J", ["f1", "f2"])],
      foods: [food("f1", "Peanut Butter")],
      limit: 4,
    });
    expect(merged.map((r) => r.kind)).toEqual(["meal", "food"]);
  });

  it("puts meals first, because they carry more of the answer", () => {
    const merged = mergeLogResults({
      meals: [meal("m1", "Chili", ["f9"])],
      foods: [food("f1", "Chili powder")],
      limit: 4,
    });
    expect(merged.map((r) => r.kind)).toEqual(["meal", "food"]);
  });

  it("caps meals at the limit and foods at twice it", () => {
    const merged = mergeLogResults({
      meals: [1, 2, 3, 4, 5].map((n) => meal(`m${n}`, `M${n}`, [`x${n}`])),
      foods: [1, 2, 3, 4, 5, 6, 7].map((n) => food(`f${n}`, `F${n}`)),
      limit: 2,
    });
    expect(merged.filter((r) => r.kind === "meal")).toHaveLength(2);
    expect(merged.filter((r) => r.kind === "food")).toHaveLength(4);
  });

  it("a meal beyond the limit does not silently suppress its food", () => {
    // The cover set is built from the meals actually SHOWN, so a dish cut off
    // by the cap cannot hide the food that would otherwise be offered.
    const merged = mergeLogResults({
      meals: [meal("m1", "A", ["f1"]), meal("m2", "B", ["f2"])],
      foods: [food("f2", "B")],
      limit: 1,
    });
    expect(merged.map((r) => r.kind)).toEqual(["meal", "food"]);
  });
});
