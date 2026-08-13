import { toggleCategory, type MealCategory } from "../../types/meal-library";

describe("toggleCategory", () => {
  it("adds and removes an ordinary category", () => {
    expect(toggleCategory(["lunch"], "dinner")).toEqual(["lunch", "dinner"]);
    expect(toggleCategory(["lunch", "dinner"], "dinner")).toEqual(["lunch"]);
  });

  it("never leaves a meal filed nowhere", () => {
    // A meal with no category appears on no shelf, and the database refuses
    // the set at commit — so the last chip cannot be turned off.
    expect(toggleCategory(["lunch"], "lunch")).toEqual(["lunch"]);
  });

  it("emergency calories is held alone", () => {
    // It is deliberately excluded from ordinary suggestions, so combining it
    // with a time of day has no defined meaning for the recommender.
    expect(toggleCategory(["breakfast", "snack"], "emergency")).toEqual(["emergency"]);
    expect(toggleCategory(["emergency"], "lunch")).toEqual(["lunch"]);
  });

  it("re-tapping emergency leaves it, rather than emptying the set", () => {
    expect(toggleCategory(["emergency"], "emergency")).toEqual(["emergency"]);
  });

  it("keeps the order chips were picked in, so the head stays primary", () => {
    const picked: MealCategory[] = ["breakfast"];
    expect(toggleCategory(toggleCategory(picked, "snack"), "dessert"))
      .toEqual(["breakfast", "snack", "dessert"]);
  });
});
