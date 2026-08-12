import {
  rescuePlan,
  type ExpiringItemInput,
  type RescueMealInput,
} from "../rescuePlan";

const meal = (over: Partial<RescueMealInput> = {}): RescueMealInput => ({
  mealId: "m1", name: "Meal", conceptIds: ["oats"], assemblable: true, ...over,
});
const expiring = (over: Partial<ExpiringItemInput> = {}): ExpiringItemInput => ({
  name: "Oats", conceptIds: ["oats"], daysLeft: 2, ...over,
});

describe("rescuePlan", () => {
  it("finds a meal that uses food about to go", () => {
    expect(rescuePlan({ meals: [meal()], expiring: [expiring()] })).toEqual([
      { mealId: "m1", name: "Meal", rescues: ["Oats"], soonestDaysLeft: 2, assemblable: true },
    ]);
  });

  it("says nothing when nothing is expiring", () => {
    expect(rescuePlan({ meals: [meal()], expiring: [] })).toEqual([]);
  });

  it("ignores meals that use none of it", () => {
    expect(rescuePlan({
      meals: [meal({ conceptIds: ["rice"] })],
      expiring: [expiring()],
    })).toEqual([]);
  });

  it("prefers the meal that saves MORE, not the most urgent one", () => {
    // You only eat one of them, so clearing three beats clearing one sooner.
    const got = rescuePlan({
      meals: [
        meal({ mealId: "one", name: "Saves one", conceptIds: ["kefir"] }),
        meal({ mealId: "three", name: "Saves three", conceptIds: ["oats", "berries", "milk"] }),
      ],
      expiring: [
        expiring({ name: "Kefir", conceptIds: ["kefir"], daysLeft: 0 }),
        expiring({ name: "Oats", conceptIds: ["oats"], daysLeft: 3 }),
        expiring({ name: "Berries", conceptIds: ["berries"], daysLeft: 3 }),
        expiring({ name: "Milk", conceptIds: ["milk"], daysLeft: 4 }),
      ],
    });
    expect(got[0].name).toBe("Saves three");
  });

  it("breaks a tie on how soon the most urgent item goes", () => {
    const got = rescuePlan({
      meals: [
        meal({ mealId: "later", name: "Later", conceptIds: ["a"] }),
        meal({ mealId: "sooner", name: "Sooner", conceptIds: ["b"] }),
      ],
      expiring: [
        expiring({ name: "A", conceptIds: ["a"], daysLeft: 5 }),
        expiring({ name: "B", conceptIds: ["b"], daysLeft: 1 }),
      ],
    });
    expect(got.map((r) => r.name)).toEqual(["Sooner", "Later"]);
  });

  it("lists what a meal rescues, soonest first", () => {
    const [r] = rescuePlan({
      meals: [meal({ conceptIds: ["a", "b"] })],
      expiring: [
        expiring({ name: "Later", conceptIds: ["a"], daysLeft: 4 }),
        expiring({ name: "Sooner", conceptIds: ["b"], daysLeft: 1 }),
      ],
    });
    expect(r.rescues).toEqual(["Sooner", "Later"]);
    expect(r.soonestDaysLeft).toBe(1);
  });

  it("keeps an un-makeable meal, ranked below a makeable equal", () => {
    // A meal missing one thing that rescues three is a shopping trip with a
    // purpose — worth knowing about, just not first.
    const got = rescuePlan({
      meals: [
        meal({ mealId: "short", name: "Short", conceptIds: ["a"], assemblable: false }),
        meal({ mealId: "ready", name: "Ready", conceptIds: ["a"], assemblable: true }),
      ],
      expiring: [expiring({ name: "A", conceptIds: ["a"], daysLeft: 2 })],
    });
    expect(got.map((r) => r.name)).toEqual(["Ready", "Short"]);
    expect(got).toHaveLength(2);
  });

  it("counts today as rescuable and already-expired as not", () => {
    expect(rescuePlan({
      meals: [meal({ conceptIds: ["today"] })],
      expiring: [expiring({ name: "Today", conceptIds: ["today"], daysLeft: 0 })],
    })).toHaveLength(1);
    expect(rescuePlan({
      meals: [meal({ conceptIds: ["gone"] })],
      expiring: [expiring({ name: "Gone", conceptIds: ["gone"], daysLeft: -1 })],
    })).toEqual([]);
  });

  it("caps the list so it reads as an instruction, not a report", () => {
    const meals = ["a", "b", "c", "d", "e"].map((k) =>
      meal({ mealId: k, name: k, conceptIds: [k] }),
    );
    const expiringAll = ["a", "b", "c", "d", "e"].map((k) =>
      expiring({ name: k, conceptIds: [k] }),
    );
    expect(rescuePlan({ meals, expiring: expiringAll })).toHaveLength(3);
    expect(rescuePlan({ meals, expiring: expiringAll, limit: 1 })).toHaveLength(1);
  });
});
