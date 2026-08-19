import {
  buildShelves,
  mealIngredients,
  filterLibrary,
  inSegment,
  categoryCountsFor,
  libraryCounts,
  libraryEmptyMessage,
  matchesLibraryQuery,
  mealAvailability,
  mealNutrition,
  sortLibrary,
  substitutionLine,
  tracksAvailability,
  USE_IT_UP_DAYS,
  type InventoryNutrition,
  type MealCard,
  type MealSource,
} from "../mealLibraryView";
import type { MealCategory, MealWithItems } from "../../types/meal-library";

// -- fixtures ---------------------------------------------------------------

const food = (over: Partial<{ id: string; name: string; barcode: string | null; calories: number | null; protein: number | null; fiber_g: number | null }> = {}) => ({
  id: over.id ?? "sf-pb",
  name: over.name ?? "Skippy Peanut Butter",
  barcode: over.barcode ?? null,
  calories: over.calories ?? 190,
  protein: over.protein ?? 7,
  carbs: 6,
  fats: 16,
  sugars: 3,
  saturated_fat_g: 5,
  sodium_mg: 140,
  fiber_g: over.fiber_g ?? 2,
});

const meal = (over: Partial<MealWithItems> = {}): MealWithItems =>
  ({
    id: "m-pbj",
    name: "PB&J Sandwich",
    category: "lunch",
    prep_minutes: 2,
    items: [
      { id: "i1", saved_food_id: "sf-pb", servings: 1, display_order: 0, savedFood: food() },
      {
        id: "i2",
        saved_food_id: "sf-bread",
        servings: 2,
        display_order: 1,
        savedFood: food({ id: "sf-bread", name: "Dave's Bread", calories: 110, protein: 5, fiber_g: 4 }),
      },
    ],
    ...over,
  }) as unknown as MealWithItems;

const invRow = (over: Partial<{ id: string; barcode: string | null; totalQuantity: number; conceptIds: string[]; daysLeft: number | null }> = {}) => ({
  id: over.id ?? "inv-pb",
  barcode: over.barcode ?? null,
  totalQuantity: over.totalQuantity ?? 1,
  conceptIds: over.conceptIds ?? ["c-pb"],
  daysLeft: over.daysLeft ?? null,
});

const nutrition = (over: Partial<InventoryNutrition> = {}): InventoryNutrition => ({
  id: over.id ?? "inv-pb",
  name: over.name ?? "Skippy Peanut Butter",
  calories: over.calories ?? 190,
  protein: over.protein ?? 7,
  carbs: 6,
  fats: 16,
  sugars: 3,
  saturated_fat_g: over.saturated_fat_g ?? 4,
  sodium_mg: 140,
  fiber_g: over.fiber_g ?? 2,
});

const conceptMap = new Map<string, string[]>([
  ["sf-pb", ["c-pb"]],
  ["sf-bread", ["c-bread"]],
]);

const card = (over: Partial<MealCard> = {}): MealCard => {
  const primary = over.category ?? "lunch";
  return ({
    meal: meal(),
    category: primary,
    // Defaults to just the primary, so a test that only sets `category` reads
    // the way it always did.
    categories: over.categories ?? [primary],
    source: { kind: "home", name: null },
    isFavorite: false,
    availability: "available",
    missing: [],
    unlinked: [],
    nutrition: { totals: { calories: 410, protein: 17, carbs: 0, sodium_mg: 0, fats: 0, sugars: 0, fiber_g: 10 }, substitutions: [], unresolvedCount: 0 },
    score: 80,
    prepMinutes: 2,
    faceUrl: null,
    timesLogged: 3,
    lastLoggedDate: "2026-08-01",
    rescueDaysLeft: null,
    isArchived: false,
    ...over,
  }) as MealCard;
};

// -- ingredients ------------------------------------------------------------

describe("mealIngredients", () => {
  const invRows = [
    { id: "inv-pb", name: "Skippy Peanut Butter", barcode: null, totalQuantity: 1, conceptIds: ["c-pb"], daysLeft: null },
    { id: "inv-bread", name: "Dave's Bread", barcode: null, totalQuantity: 1, conceptIds: ["c-bread"], daysLeft: 2 },
  ];

  it("says in stock, and says so louder when the row is about to turn", () => {
    const rows = mealIngredients({ items: meal().items, inventory: invRows, conceptIdsBySavedFoodId: conceptMap });
    expect(rows.map((r) => r.state.kind)).toEqual(["in_stock", "expiring"]);
    expect(rows[1].state.daysLeft).toBe(2);
    expect(rows[1].state.inventoryId).toBe("inv-bread");
  });

  it("separates what you need to buy from what we cannot check", () => {
    // Bread has a concept link and nothing in stock: go shopping. Peanut
    // butter here has neither barcode nor link, so failing says something
    // about our records, not the kitchen.
    const rows = mealIngredients({
      items: meal().items,
      inventory: [],
      conceptIdsBySavedFoodId: new Map([["sf-bread", ["c-bread"]]]),
    });
    expect(rows.map((r) => r.state.kind)).toEqual(["unlinked", "missing"]);
  });

  it("an already-expired row is a throw-out, not a rescue", () => {
    const rows = mealIngredients({
      items: meal().items,
      inventory: [invRows[0], { ...invRows[1], daysLeft: -2 }],
      conceptIdsBySavedFoodId: conceptMap,
    });
    expect(rows[1].state.kind).toBe("in_stock");
  });

  it("agrees with the meal-level verdict about what is missing", () => {
    const rows = mealIngredients({ items: meal().items, inventory: [invRows[0]], conceptIdsBySavedFoodId: conceptMap });
    const missing = rows.filter((r) => r.state.kind === "missing").map((r) => r.item.savedFood.name);
    expect(missing).toEqual(["Dave's Bread"]);
  });
});

// -- source -----------------------------------------------------------------

describe("tracksAvailability", () => {
  it("a meal you order was never in the fridge", () => {
    expect(tracksAvailability({ kind: "out", name: "Chipotle" })).toBe(false);
    expect(tracksAvailability({ kind: "home", name: null })).toBe(true);
    // A Thistle dish IS an inventory row, so it does track.
    expect(tracksAvailability({ kind: "packaged", name: "Thistle" })).toBe(true);
  });
});

// -- dynamic nutrition ------------------------------------------------------

describe("mealNutrition", () => {
  const inventory = [invRow(), invRow({ id: "inv-bread", conceptIds: ["c-bread"] })];
  const byId = new Map<string, InventoryNutrition>([
    ["inv-pb", nutrition()],
    ["inv-bread", nutrition({ id: "inv-bread", name: "Dave's Bread", calories: 110, protein: 5, fiber_g: 4 })],
  ]);

  it("prices the meal from what is in the fridge, scaled by servings", () => {
    const n = mealNutrition({ meal: meal(), inventory, conceptIdsBySavedFoodId: conceptMap, nutritionByInventoryId: byId });
    // 190 + 2×110
    expect(n.totals.calories).toBe(410);
    expect(n.totals.protein).toBe(17);
    expect(n.totals.fiber_g).toBe(10);
    expect(n.substitutions).toEqual([]);
    expect(n.unresolvedCount).toBe(0);
  });

  it("a different brand changes the meal, and says so", () => {
    const jif = new Map(byId);
    jif.set("inv-pb", nutrition({ name: "Jif Peanut Butter", calories: 230 }));
    const n = mealNutrition({ meal: meal(), inventory, conceptIdsBySavedFoodId: conceptMap, nutritionByInventoryId: jif });
    expect(n.totals.calories).toBe(450);
    expect(n.substitutions).toEqual([
      { itemName: "Skippy Peanut Butter", usualName: "Skippy Peanut Butter", actualName: "Jif Peanut Butter", calorieDelta: 40 },
    ]);
    expect(substitutionLine(n)).toBe("made with Jif Peanut Butter this week · +40 cal vs usual");
  });

  it("scales the substitution delta by servings", () => {
    const pricier = new Map(byId);
    pricier.set("inv-bread", nutrition({ id: "inv-bread", name: "Sourdough", calories: 150, protein: 5, fiber_g: 4 }));
    const n = mealNutrition({ meal: meal(), inventory, conceptIdsBySavedFoodId: conceptMap, nutritionByInventoryId: pricier });
    // (150−110) × 2 servings
    expect(n.substitutions[0].calorieDelta).toBe(80);
  });

  it("prices saturated fat and sodium from the stock too, not from the recipe", () => {
    // The stocked jar says 4g saturated fat and 140mg sodium; the as-built
    // saved food says 5g. Sodium used to fall back to the as-built figure for
    // EVERY meal, because food_inventory had no sodium column.
    const n = mealNutrition({ meal: meal(), inventory, conceptIdsBySavedFoodId: conceptMap, nutritionByInventoryId: byId });
    expect(n.totals.saturated_fat_g).toBe(12); // 4 + 2×4
    expect(n.totals.sodium_mg).toBe(420); // 140 + 2×140
  });

  it("keeps the as-built saturated fat when a slot resolves to nothing", () => {
    // Unknown is not zero: an inventory row with no figure must not deflate
    // the meal, so the product it was built with answers instead.
    const blank = new Map(byId);
    // Spread rather than the factory's `??`, which would read an explicit
    // null as "not overridden" and hand back the default.
    blank.set("inv-pb", { ...nutrition(), saturated_fat_g: null });
    const n = mealNutrition({ meal: meal(), inventory, conceptIdsBySavedFoodId: conceptMap, nutritionByInventoryId: blank });
    expect(n.totals.saturated_fat_g).toBe(13); // 5 as built + 2×4 from stock
  });

  it("the same product restocked is not a substitution", () => {
    const n = mealNutrition({ meal: meal(), inventory, conceptIdsBySavedFoodId: conceptMap, nutritionByInventoryId: byId });
    expect(n.substitutions).toHaveLength(0);
    expect(substitutionLine(n)).toBeNull();
  });

  it("a swap that changes nothing is not worth a line", () => {
    const sameCals = new Map(byId);
    sameCals.set("inv-pb", nutrition({ name: "Store Brand PB", calories: 190 }));
    const n = mealNutrition({ meal: meal(), inventory, conceptIdsBySavedFoodId: conceptMap, nutritionByInventoryId: sameCals });
    expect(n.substitutions).toHaveLength(0);
  });

  it("falls back to the as-built product when nothing resolves, and counts it", () => {
    const n = mealNutrition({ meal: meal(), inventory: [], conceptIdsBySavedFoodId: conceptMap, nutritionByInventoryId: new Map() });
    expect(n.totals.calories).toBe(410); // the numbers it was built with
    expect(n.unresolvedCount).toBe(2);
    expect(n.substitutions).toEqual([]);
  });

  it("a macro the stocked product doesn't record falls back per field", () => {
    // Unknown is not zero. `food_inventory` has no sodium column at all, so
    // every meal priced from stock takes this path for sodium — zeroing it
    // would quietly deflate the total.
    const sparse = new Map(byId);
    sparse.set("inv-pb", nutrition({ name: "Jif Peanut Butter", calories: 230, fiber_g: null, sodium_mg: null }));
    const n = mealNutrition({ meal: meal(), inventory, conceptIdsBySavedFoodId: conceptMap, nutritionByInventoryId: sparse });
    expect(n.totals.calories).toBe(450); // from the fridge
    expect(n.totals.fiber_g).toBe(10);   // 2 (as built) + 2×4
    expect(n.totals.sodium_mg).toBe(420); // 140 + 2×140, all as-built
  });

  it("out-of-stock rows do not price the meal", () => {
    const n = mealNutrition({
      meal: meal(),
      inventory: [invRow({ totalQuantity: 0 }), invRow({ id: "inv-bread", conceptIds: ["c-bread"], totalQuantity: 0 })],
      conceptIdsBySavedFoodId: conceptMap,
      nutritionByInventoryId: byId,
    });
    expect(n.unresolvedCount).toBe(2);
  });

  it("summarises several swaps in one line", () => {
    const both = new Map(byId);
    both.set("inv-pb", nutrition({ name: "Jif", calories: 230 }));
    both.set("inv-bread", nutrition({ id: "inv-bread", name: "Sourdough", calories: 150, protein: 5, fiber_g: 4 }));
    const n = mealNutrition({ meal: meal(), inventory, conceptIdsBySavedFoodId: conceptMap, nutritionByInventoryId: both });
    expect(substitutionLine(n)).toBe("made with Jif and 1 other this week · +120 cal vs usual");
  });

  it("reports a saving as a saving", () => {
    const lighter = new Map(byId);
    lighter.set("inv-pb", nutrition({ name: "PB2 Powder", calories: 60 }));
    const n = mealNutrition({ meal: meal(), inventory, conceptIdsBySavedFoodId: conceptMap, nutritionByInventoryId: lighter });
    expect(substitutionLine(n)).toContain("-130 cal vs usual");
  });
});

// -- availability -----------------------------------------------------------

describe("mealAvailability", () => {
  const assemblable = { assemblable: true, missing: [], unlinked: [], expiringItemName: null, expiringDaysLeft: null };
  const short = { assemblable: false, missing: ["Jelly"], unlinked: [], expiringItemName: null, expiringDaysLeft: null };

  it("is a three-state answer", () => {
    expect(mealAvailability({ source: { kind: "home", name: null }, assemblability: assemblable, hasItems: true })).toBe("available");
    expect(mealAvailability({ source: { kind: "home", name: null }, assemblability: short, hasItems: true })).toBe("unavailable");
    expect(mealAvailability({ source: { kind: "out", name: "Chipotle" }, assemblability: undefined, hasItems: false })).toBe("not_tracked");
  });

  it("an item-less meal cannot be assembled", () => {
    expect(mealAvailability({ source: { kind: "home", name: null }, assemblability: undefined, hasItems: false })).toBe("unavailable");
  });
});

// -- segments, search, sort -------------------------------------------------

describe("inSegment", () => {
  it("Available is a stock report — eaten-out meals live under All only", () => {
    expect(inSegment(card({ availability: "available" }), "available")).toBe(true);
    expect(inSegment(card({ availability: "not_tracked" }), "available")).toBe(false);
    expect(inSegment(card({ availability: "not_tracked" }), "all")).toBe(true);
    expect(inSegment(card({ availability: "unavailable" }), "available")).toBe(false);
  });

  it("archived meals appear only in Archive, whatever their stock says", () => {
    const archived = card({ isArchived: true, availability: "available" });
    expect(inSegment(archived, "available")).toBe(false);
    expect(inSegment(archived, "all")).toBe(false);
    expect(inSegment(archived, "archive")).toBe(true);
    expect(inSegment(card(), "archive")).toBe(false);
  });
});

describe("matchesLibraryQuery", () => {
  it("matches on all words, in any order, across name and source", () => {
    const c = card({ meal: meal({ name: "Pasta Trapanese" }), source: { kind: "packaged", name: "Thistle" } });
    expect(matchesLibraryQuery(c, "thistle pasta")).toBe(true);
    expect(matchesLibraryQuery(c, "PASTA")).toBe(true);
    expect(matchesLibraryQuery(c, "thistle burrito")).toBe(false);
    expect(matchesLibraryQuery(c, "  ")).toBe(true);
  });
});

describe("filterLibrary", () => {
  const cards = [
    card({ meal: meal({ id: "a", name: "Alpha" }), category: "breakfast", isFavorite: true }),
    card({ meal: meal({ id: "b", name: "Beta" }), category: "lunch", availability: "unavailable" }),
    card({ meal: meal({ id: "c", name: "Gamma" }), category: "breakfast", isArchived: true }),
  ];

  it("stacks segment, category and favorites when nothing is being searched for", () => {
    expect(filterLibrary({ cards, segment: "available", category: null, favoritesOnly: false, query: "" }).map((c) => c.meal.id)).toEqual(["a"]);
    expect(filterLibrary({ cards, segment: "all", category: "lunch", favoritesOnly: false, query: "" }).map((c) => c.meal.id)).toEqual(["b"]);
    expect(filterLibrary({ cards, segment: "all", category: null, favoritesOnly: true, query: "" }).map((c) => c.meal.id)).toEqual(["a"]);
    expect(filterLibrary({ cards, segment: "archive", category: null, favoritesOnly: false, query: "" }).map((c) => c.meal.id)).toEqual(["c"]);
  });

  it("searches the whole library, ignoring every filter", () => {
    // "Beta" is unavailable and in another category; "Gamma" is archived.
    // A search that respected the filters would find neither.
    const found = (query: string) =>
      filterLibrary({ cards, segment: "available", category: "breakfast", favoritesOnly: true, query })
        .map((c) => c.meal.id);
    expect(found("bet")).toEqual(["b"]);
    expect(found("gamma")).toEqual(["c"]);
    expect(found("a")).toEqual(["a", "b", "c"]);
  });

  it("a category filter matches any category the meal holds", () => {
    const both = card({
      meal: meal({ id: "d" } as Partial<MealWithItems>),
      category: "breakfast",
      categories: ["breakfast", "snack"],
    });
    const all = [...cards, both];
    const ids = (category: MealCategory) =>
      filterLibrary({ cards: all, segment: "all", category, favoritesOnly: false, query: "" })
        .map((c) => c.meal.id);
    expect(ids("breakfast")).toContain("d");
    expect(ids("snack")).toContain("d");
    expect(ids("dinner")).not.toContain("d");
  });

  it("restores the filters the moment the query goes back to blank", () => {
    expect(filterLibrary({ cards, segment: "available", category: null, favoritesOnly: false, query: "   " }).map((c) => c.meal.id)).toEqual(["a"]);
  });
});

describe("sortLibrary", () => {
  const a = card({ meal: meal({ id: "a", name: "Apple" }), score: 70, timesLogged: 10, lastLoggedDate: "2026-08-01" });
  const b = card({ meal: meal({ id: "b", name: "Banana" }), score: 90, timesLogged: 2, lastLoggedDate: "2026-08-10" });
  const c = card({ meal: meal({ id: "c", name: "Cherry" }), score: 90, timesLogged: 5, lastLoggedDate: null });

  it("sorts by score, ties broken by name", () => {
    expect(sortLibrary([a, c, b], "score").map((x) => x.meal.id)).toEqual(["b", "c", "a"]);
  });
  it("sorts by how often you eat it", () => {
    expect(sortLibrary([b, a, c], "most_eaten").map((x) => x.meal.id)).toEqual(["a", "c", "b"]);
  });
  it("never-eaten sorts last under Recently eaten — an absent date is not an old one", () => {
    expect(sortLibrary([a, b, c], "recent").map((x) => x.meal.id)).toEqual(["b", "a", "c"]);
  });
  it("does not mutate its input", () => {
    const input = [a, b, c];
    sortLibrary(input, "score");
    expect(input.map((x) => x.meal.id)).toEqual(["a", "b", "c"]);
  });
});

// -- counts -----------------------------------------------------------------

describe("categoryCountsFor", () => {
  // The tabs sit under the segment control and describe what it shows. Counted
  // library-wide, Archive read "All Meals 0" beside "Emergency Calories 1".
  const cards = [
    card({ categories: ["breakfast"], isArchived: false }),
    card({ categories: ["breakfast", "snack"], isArchived: false }),
    card({ categories: ["dinner"], isArchived: true }),
  ];

  it("counts only what the segment holds", () => {
    const all = categoryCountsFor(cards, "all");
    expect(all.get("breakfast")).toBe(2);
    expect(all.get("snack")).toBe(1);
    expect(all.get("dinner")).toBeUndefined();
  });

  it("counts the archive's own meals, not the live ones", () => {
    const archived = categoryCountsFor(cards, "archive");
    expect(archived.get("dinner")).toBe(1);
    expect(archived.get("breakfast")).toBeUndefined();
  });

  it("is empty when the segment is", () => {
    expect(categoryCountsFor([cards[0]], "archive").size).toBe(0);
  });

  it("counts a two-category meal under both, as the tabs promise", () => {
    expect(categoryCountsFor([cards[1]], "all").get("breakfast")).toBe(1);
    expect(categoryCountsFor([cards[1]], "all").get("snack")).toBe(1);
  });
});

describe("libraryCounts", () => {
  it("counts over the whole library, so the filters can say what they hide", () => {
    const counts = libraryCounts([
      card({ category: "breakfast" }),
      card({ category: "breakfast", availability: "unavailable" }),
      card({ category: "lunch", availability: "not_tracked" }),
      card({ category: "dinner", isArchived: true }),
    ]);
    expect(counts).toMatchObject({ available: 2, all: 3, archive: 1 });
    expect(counts.byCategory.get("breakfast")).toBe(2);
    expect(counts.byCategory.get("dinner")).toBeUndefined(); // archived, not counted
  });
});

// -- shelves ----------------------------------------------------------------

describe("libraryCounts with several categories", () => {
  it("counts a meal in every category it holds, so the tabs stop summing to the total", () => {
    const counts = libraryCounts([
      card({ meal: meal({ id: "a" } as Partial<MealWithItems>), category: "breakfast", categories: ["breakfast", "snack"] }),
      card({ meal: meal({ id: "b" } as Partial<MealWithItems>), category: "lunch", categories: ["lunch"] }),
    ]);
    expect(counts.all).toBe(2);
    expect(counts.byCategory.get("breakfast")).toBe(1);
    expect(counts.byCategory.get("snack")).toBe(1);
    expect(counts.byCategory.get("lunch")).toBe(1);
    // 3 category placements over 2 meals — deliberate, per the design.
    const placed = [...counts.byCategory.values()].reduce((a, b) => a + b, 0);
    expect(placed).toBe(3);
  });
});

describe("buildShelves", () => {
  const order: MealCategory[] = ["breakfast", "lunch", "dinner"];
  const labels = { breakfast: "Breakfasts", lunch: "Lunches", dinner: "Dinners", snack: "Snacks", shake: "Shakes", emergency: "Emergency" } as Record<MealCategory, string>;

  it("favorites, then what needs eating, then the categories", () => {
    const cards = [
      card({ meal: meal({ id: "fav", name: "Fav" }), category: "breakfast", isFavorite: true, score: 90 }),
      card({ meal: meal({ id: "exp", name: "Expiring" }), category: "lunch", rescueDaysLeft: 1 }),
      card({ meal: meal({ id: "plain", name: "Plain" }), category: "dinner" }),
    ];
    const shelves = buildShelves(cards, order, labels);
    expect(shelves.map((s) => s.key)).toEqual(["favorites", "use_it_up", "breakfast", "lunch", "dinner"]);
  });

  it("a meal filed under two categories stands on both shelves", () => {
    // The point of the whole change: a lunch-or-dinner meal is found in both
    // places and considered in both eating windows.
    const both = card({
      meal: meal({ id: "x", name: "Chili" }),
      category: "lunch",
      categories: ["lunch", "dinner"],
    });
    const shelves = buildShelves([both], order, labels);
    expect(shelves.map((s) => s.key)).toEqual(["lunch", "dinner"]);
    expect(shelves.every((s) => s.cards[0].meal.id === "x")).toBe(true);
  });

  it("a favorite that also rescues appears on both shelves", () => {
    // Hiding it from either would make that shelf lie about being complete.
    const both = card({ meal: meal({ id: "x" }), isFavorite: true, rescueDaysLeft: 0, category: "lunch" });
    const shelves = buildShelves([both], order, labels);
    expect(shelves.map((s) => s.key)).toEqual(["favorites", "use_it_up", "lunch"]);
    expect(shelves.every((s) => s.cards.length === 1)).toBe(true);
  });

  it("use-it-up is ordered by urgency, not by score", () => {
    const soon = card({ meal: meal({ id: "soon" }), rescueDaysLeft: 0, score: 50 });
    const later = card({ meal: meal({ id: "later" }), rescueDaysLeft: 3, score: 99 });
    const shelf = buildShelves([later, soon], order, labels).find((s) => s.kind === "use_it_up");
    expect(shelf?.cards.map((c) => c.meal.id)).toEqual(["soon", "later"]);
  });

  it("food that is not going off soon stays off the use-it-up shelf", () => {
    const far = card({ rescueDaysLeft: USE_IT_UP_DAYS + 1 });
    expect(buildShelves([far], order, labels).some((s) => s.kind === "use_it_up")).toBe(false);
  });

  it("empty shelves are omitted rather than rendered blank", () => {
    expect(buildShelves([], order, labels)).toEqual([]);
  });
});

// -- empty states -----------------------------------------------------------

describe("libraryEmptyMessage", () => {
  const counts = { available: 0, all: 17, archive: 3, byCategory: new Map() };

  it("an empty Available view says what it is hiding", () => {
    const m = libraryEmptyMessage({ segment: "available", counts, query: "", favoritesOnly: false, category: null });
    expect(m.body).toContain("All 17");
  });

  it("a search miss blames the search, not the library", () => {
    const m = libraryEmptyMessage({ segment: "available", counts, query: "wombat", favoritesOnly: false, category: null });
    expect(m.title).toContain("wombat");
  });

  it("a genuinely empty library invites the first meal", () => {
    const m = libraryEmptyMessage({
      segment: "available",
      counts: { available: 0, all: 0, archive: 0, byCategory: new Map() },
      query: "", favoritesOnly: false, category: null,
    });
    expect(m.title).toBe("No meals yet");
  });
});
