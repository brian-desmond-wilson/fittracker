import { inBeverageDoor, inMealDoor, beverageLogFacts } from "../beverageDoors";

const food = (kinds: string[] | null) => ({ beverage_kinds: kinds as any });

describe("the two doors", () => {
  it("a food belongs in the meal door and not the beverage door", () => {
    expect(inMealDoor(food(null))).toBe(true);
    expect(inBeverageDoor(food(null))).toBe(false);
  });

  it("a pure beverage belongs behind the beverage door only", () => {
    for (const k of ["energy_drink", "smoothie", "protein_shake", "weight_gain_shake", "other"]) {
      expect(inBeverageDoor(food([k]))).toBe(true);
      expect(inMealDoor(food([k]))).toBe(false);
    }
  });

  it("a meal-replacement shake walks through both doors", () => {
    const huel = food(["meal_replacement_shake", "protein_shake"]);
    expect(inBeverageDoor(huel)).toBe(true);
    expect(inMealDoor(huel)).toBe(true);
  });

  it("treats an absent field the same as null — rows fetched before the column", () => {
    expect(inMealDoor({} as any)).toBe(true);
    expect(inBeverageDoor({} as any)).toBe(false);
  });

  it("an empty array reads as food — the DB forbids it, but a client bug must not", () => {
    expect(inBeverageDoor(food([]))).toBe(false);
    expect(inMealDoor(food([]))).toBe(true);
  });
});

describe("beverageLogFacts — what a quick-tapped drink logs as", () => {
  it("the form wins outright once the owner has picked tags", () => {
    expect(
      beverageLogFacts({
        formKinds: ["energy_drink"],
        formCountsAsMeal: true,
        foodKinds: ["meal_replacement_shake"],
      }),
    ).toEqual({ kinds: ["energy_drink"], countsAsMeal: true });
  });

  it("an untouched form defers to the product's own label", () => {
    // Tapping a Huel from recents: its kinds, and counts-as-meal ON from them.
    expect(
      beverageLogFacts({
        formKinds: [],
        formCountsAsMeal: false,
        foodKinds: ["meal_replacement_shake", "protein_shake"],
      }),
    ).toEqual({ kinds: ["meal_replacement_shake", "protein_shake"], countsAsMeal: true });
  });

  it("a labeled soda still defaults to riding along, not filling a window", () => {
    expect(
      beverageLogFacts({ formKinds: [], formCountsAsMeal: false, foodKinds: ["energy_drink"] }),
    ).toEqual({ kinds: ["energy_drink"], countsAsMeal: false });
  });

  it("no tags anywhere still logs — 'other', with the form's switch answer", () => {
    // The DB requires at least one kind, and the switch is the only signal
    // the owner gave, so it is kept rather than recomputed.
    expect(
      beverageLogFacts({ formKinds: [], formCountsAsMeal: true, foodKinds: null }),
    ).toEqual({ kinds: ["other"], countsAsMeal: true });
  });
});
