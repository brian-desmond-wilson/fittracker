import { mealsForItem, runOutDate, type LoopMealInput } from "../itemLoop";
import type { AssemblabilityInventoryRow } from "../stockState";

const inv = (
  id: string,
  conceptIds: string[],
  totalQuantity = 3,
): AssemblabilityInventoryRow => ({
  id, name: id, barcode: null, daysLeft: null, totalQuantity, conceptIds,
});

const mealItem = (savedFoodId: string, conceptIds: string[]) => ({
  savedFoodId, name: savedFoodId, barcode: null, conceptIds,
});

const meal = (name: string, items: LoopMealInput["items"]): LoopMealInput => ({ name, items });

describe("mealsForItem", () => {
  it("finds meals through the concept graph, not through inventory ids", () => {
    // The meal wants the OATS concept; the item satisfies it by carrying the
    // same concept, not by being the row the meal was authored against.
    const out = mealsForItem({
      itemConceptIds: ["oats"],
      meals: [meal("Overnight oats", [mealItem("sf-oats", ["oats"])])],
      inventory: [inv("inv-oats", ["oats"])],
    });
    expect(out).toEqual([{ name: "Overnight oats", missing: [], unlinked: [], ready: true }]);
  });

  it("an item with no concept links belongs to no meals", () => {
    expect(mealsForItem({
      itemConceptIds: [],
      meals: [meal("Overnight oats", [mealItem("sf-oats", ["oats"])])],
      inventory: [inv("inv-oats", ["oats"])],
    })).toEqual([]);
  });

  it("skips meals that do not use the item at all", () => {
    expect(mealsForItem({
      itemConceptIds: ["oats"],
      meals: [meal("Steak night", [mealItem("sf-steak", ["beef"])])],
      inventory: [inv("inv-oats", ["oats"])],
    })).toEqual([]);
  });

  it("reports what a meal is missing rather than hiding it", () => {
    const out = mealsForItem({
      itemConceptIds: ["oats"],
      meals: [meal("Oats + berries", [
        mealItem("sf-oats", ["oats"]),
        mealItem("sf-berries", ["berries"]),
      ])],
      inventory: [inv("inv-oats", ["oats"])],
    });
    expect(out).toEqual([{ name: "Oats + berries", missing: ["sf-berries"], unlinked: [], ready: false }]);
  });

  it("an unlinked ingredient blocks readiness without becoming a grocery", () => {
    // The regression the missing/unlinked split invited: with `ready` derived
    // from `missing.length === 0`, this meal — whose second ingredient nothing
    // could ever match — would have been promoted to "Ready".
    const out = mealsForItem({
      itemConceptIds: ["oats"],
      meals: [meal("Oats + mystery", [
        mealItem("sf-oats", ["oats"]),
        { savedFoodId: "sf-x", name: "sf-x", barcode: null, conceptIds: [] },
      ])],
      inventory: [inv("inv-oats", ["oats"])],
    });
    expect(out[0]).toEqual({
      name: "Oats + mystery", missing: [], unlinked: ["sf-x"], ready: false,
    });
  });

  it("sorts by total distance to the plate, counting both buckets", () => {
    const out = mealsForItem({
      itemConceptIds: ["oats"],
      meals: [
        meal("Two unlinked", [
          mealItem("sf-oats", ["oats"]),
          { savedFoodId: "a", name: "a", barcode: null, conceptIds: [] },
          { savedFoodId: "b", name: "b", barcode: null, conceptIds: [] },
        ]),
        meal("One missing", [
          mealItem("sf-oats", ["oats"]),
          mealItem("sf-berries", ["berries"]),
        ]),
      ],
      inventory: [inv("inv-oats", ["oats"])],
    });
    expect(out.map((m) => m.name)).toEqual(["One missing", "Two unlinked"]);
  });

  it("out-of-stock inventory cannot satisfy a meal item", () => {
    const out = mealsForItem({
      itemConceptIds: ["oats"],
      meals: [meal("Overnight oats", [mealItem("sf-oats", ["oats"])])],
      inventory: [inv("inv-oats", ["oats"], 0)],
    });
    expect(out[0]).toEqual({ name: "Overnight oats", missing: ["sf-oats"], unlinked: [], ready: false });
  });

  it("an item-less meal is a stub, not a ready meal", () => {
    expect(mealsForItem({
      itemConceptIds: ["oats"],
      meals: [meal("Empty draft", [])],
      inventory: [inv("inv-oats", ["oats"])],
    })).toEqual([]);
  });

  it("orders ready meals first, then by how close they are, then by name", () => {
    const out = mealsForItem({
      itemConceptIds: ["oats"],
      meals: [
        meal("Zulu bowl", [mealItem("sf-oats", ["oats"]), mealItem("a", ["x"]), mealItem("b", ["y"])]),
        meal("Alpha bowl", [mealItem("sf-oats", ["oats"]), mealItem("c", ["z"])]),
        meal("Zebra plain", [mealItem("sf-oats", ["oats"])]),
        meal("Apple plain", [mealItem("sf-oats", ["oats"])]),
      ],
      inventory: [inv("inv-oats", ["oats"])],
    });
    expect(out.map((m) => m.name)).toEqual([
      "Apple plain", "Zebra plain", "Alpha bowl", "Zulu bowl",
    ]);
  });

  it("a meal counts once even when the item satisfies several of its slots", () => {
    const out = mealsForItem({
      itemConceptIds: ["oats", "grain"],
      meals: [meal("Double oats", [
        mealItem("sf-oats", ["oats"]),
        mealItem("sf-grain", ["grain"]),
      ])],
      inventory: [inv("inv-oats", ["oats", "grain"])],
    });
    expect(out).toHaveLength(1);
  });
});

describe("runOutDate", () => {
  it("adds the projected days to today", () => {
    expect(runOutDate("2026-08-11", 14)).toBe("2026-08-25");
  });
  it("crosses month and year boundaries", () => {
    expect(runOutDate("2026-12-30", 3)).toBe("2027-01-02");
    expect(runOutDate("2026-01-30", 2)).toBe("2026-02-01");
  });
  it("rounds fractional days rather than truncating", () => {
    expect(runOutDate("2026-08-11", 2.6)).toBe("2026-08-14");
  });
  it("no rate means no date — never a guess", () => {
    expect(runOutDate("2026-08-11", null)).toBeNull();
    expect(runOutDate("2026-08-11", undefined)).toBeNull();
    expect(runOutDate("2026-08-11", Infinity)).toBeNull();
  });
  it("a negative projection is not a date in the past", () => {
    expect(runOutDate("2026-08-11", -3)).toBeNull();
  });
  it("today is a valid answer", () => {
    expect(runOutDate("2026-08-11", 0)).toBe("2026-08-11");
  });
});
