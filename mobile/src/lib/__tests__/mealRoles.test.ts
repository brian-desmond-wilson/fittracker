import { ROLE_ORDER, toggleRole, type MealRole } from "../../types/meal-library";

describe("toggleRole", () => {
  it("adds and removes a role", () => {
    expect(toggleRole([], "bridge")).toEqual(["bridge"]);
    expect(toggleRole(["bridge"], "bridge")).toEqual([]);
  });

  // The whole point of the change: a shake that is genuinely the post-workout
  // meal AND the calorie booster had to pick one under the old single column.
  it("holds several roles at once", () => {
    expect(toggleRole(["post_workout"], "calorie_booster"))
      .toEqual(["post_workout", "calorie_booster"]);
  });

  // Unlike categories, which must never empty out — a meal filed nowhere is on
  // no shelf and the database refuses it. Role is optional and none is normal.
  it("lets the last role be turned off", () => {
    expect(toggleRole(["pre_workout"], "pre_workout")).toEqual([]);
  });

  it("keeps rail order regardless of the order they were tapped", () => {
    const tapped = toggleRole(toggleRole(["emergency_catchup"], "pre_workout"), "bridge");
    expect(tapped).toEqual(["pre_workout", "bridge", "emergency_catchup"]);
  });

  it("never duplicates a role already held", () => {
    const twice = toggleRole(toggleRole(["bridge"], "bridge"), "bridge");
    expect(twice).toEqual(["bridge"]);
  });

  it("covers every role in the union, so the rail can never omit one", () => {
    const all: MealRole[] = [
      "pre_workout", "post_workout", "bridge", "calorie_booster", "emergency_catchup",
    ];
    expect([...ROLE_ORDER].sort()).toEqual([...all].sort());
  });
});
