import {
  borrowedImageUrl,
  buildBorrowedFoodImages,
  withBorrowedImage,
  type BorrowLinkRow,
} from "../foodImageBorrow";

const link = (
  concept_id: string,
  target: { saved_food_id: string } | { food_inventory_id: string },
): BorrowLinkRow => ({
  concept_id,
  saved_food_id: "saved_food_id" in target ? target.saved_food_id : null,
  food_inventory_id: "food_inventory_id" in target ? target.food_inventory_id : null,
});

describe("buildBorrowedFoodImages", () => {
  it("lends the picture of the one inventory item sharing a concept", () => {
    const map = buildBorrowedFoodImages(
      [link("pasta", { saved_food_id: "sf1" }), link("pasta", { food_inventory_id: "inv1" })],
      new Map([["inv1", "pasta.jpg"]]),
    );
    expect(map.get("sf1")).toBe("pasta.jpg");
  });

  it("lends nothing from a concept covering several pictured products", () => {
    // "Prepared Meal" — seven vendor dinners, no one of which is this food.
    const map = buildBorrowedFoodImages(
      [
        link("prepared", { saved_food_id: "sf1" }),
        link("prepared", { food_inventory_id: "inv1" }),
        link("prepared", { food_inventory_id: "inv2" }),
      ],
      new Map([
        ["inv1", "someone-elses.jpg"],
        ["inv2", "also-not-it.jpg"],
      ]),
    );
    expect(map.has("sf1")).toBe(false);
  });

  it("prefers the most specific concept when both apply", () => {
    const map = buildBorrowedFoodImages(
      [
        link("prepared", { saved_food_id: "sf1" }),
        link("prepared", { food_inventory_id: "inv1" }),
        link("prepared", { food_inventory_id: "inv2" }),
        link("pasta", { saved_food_id: "sf1" }),
        link("pasta", { food_inventory_id: "inv2" }),
      ],
      new Map([
        ["inv1", null],
        ["inv2", "pasta.jpg"],
      ]),
    );
    // Both concepts name exactly one PICTURED item, so specificity decides.
    expect(map.get("sf1")).toBe("pasta.jpg");
  });

  it("lends nothing when the linked inventory item has no picture", () => {
    const map = buildBorrowedFoodImages(
      [link("pasta", { saved_food_id: "sf1" }), link("pasta", { food_inventory_id: "inv1" })],
      new Map([["inv1", null]]),
    );
    expect(map.has("sf1")).toBe(false);
  });

  it("lends nothing to a food linked to no pictured inventory at all", () => {
    const map = buildBorrowedFoodImages([link("pasta", { saved_food_id: "sf1" })], new Map());
    expect(map.size).toBe(0);
  });

  it("is empty-safe", () => {
    expect(buildBorrowedFoodImages([], new Map()).size).toBe(0);
  });
});

describe("borrowedImageUrl", () => {
  const borrowed = new Map([["sf1", "borrowed.jpg"]]);

  it("never overrides a food's own picture", () => {
    expect(borrowedImageUrl({ id: "sf1", image_primary_url: "own.jpg" }, borrowed))
      .toBe("own.jpg");
  });

  it("fills a blank one", () => {
    expect(borrowedImageUrl({ id: "sf1", image_primary_url: null }, borrowed))
      .toBe("borrowed.jpg");
  });

  it("stays null when there is nothing to borrow", () => {
    expect(borrowedImageUrl({ id: "sf2", image_primary_url: null }, borrowed)).toBeNull();
  });
});

describe("withBorrowedImage", () => {
  const borrowed = new Map([["sf1", "borrowed.jpg"]]);

  it("keeps object identity when nothing changes", () => {
    const food = { id: "sf2", image_primary_url: null };
    expect(withBorrowedImage(food, borrowed)).toBe(food);
  });

  it("copies with the borrowed picture when one applies", () => {
    const food = { id: "sf1", image_primary_url: null, name: "Pasta" };
    expect(withBorrowedImage(food, borrowed))
      .toEqual({ id: "sf1", image_primary_url: "borrowed.jpg", name: "Pasta" });
  });
});
