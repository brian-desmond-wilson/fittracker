import {
  addLocalDays,
  addRecent,
  deliverySummary,
  dishSlug,
  draftsFromPayload,
  draftFromRecent,
  emptyDraft,
  mealsInDishes,
  namedDrafts,
  orderVendorsByUse,
  pendingDishes,
  recentCounts,
  removeRecent,
  sortDishesForMenu,
  dishesNeedingImages,
  filterRecentDishes,
  toDeliveryPayload,
  validateDelivery,
  withDishPhotos,
  withDraftFacts,
  DELIVERY_SLOTS,
  type PreparedMealDraft,
  type RecentDish,
} from "../preparedMealDelivery";

const draft = (over: Partial<PreparedMealDraft> = {}): PreparedMealDraft => ({
  ...emptyDraft(),
  name: "Ruby Rice Bowl",
  calories: "650",
  protein: "21",
  fiber: "13",
  carbs: "65",
  fats: "24",
  sugars: "9",
  saturatedFat: "4.5",
  sodium: "620",
  servingSize: "1 bowl",
  ...over,
});

const dish = (over: Partial<RecentDish> = {}): RecentDish => ({
  vendorId: "v1",
  slug: "almond-dream-smoothie",
  name: "Almond Dream Smoothie",
  slot: "breakfast",
  calories: 420,
  protein: 18,
  fiber: 7,
  carbs: 48,
  fats: 12,
  sugars: 20,
  saturatedFat: 2.5,
  sodium: 310,
  servingSize: "1 cup",
  imageUrl: null,
  lastDeliveredOn: "2026-08-06",
  ...over,
});

const ok = (
  drafts: PreparedMealDraft[],
  over: { arrivesOn?: string | null } = {},
) => validateDelivery({ vendorId: "v1", useBy: "2026-08-17", drafts, ...over });

describe("emptyDraft", () => {
  it("starts at one of the thing, in the commonest slot", () => {
    expect(emptyDraft()).toMatchObject({ name: "", quantity: "1", slot: "lunch" });
  });
  it("takes a slot when the caller knows it", () => {
    expect(emptyDraft("breakfast").slot).toBe("breakfast");
  });
  it("gives every row its own key", () => {
    expect(emptyDraft().key).not.toBe(emptyDraft().key);
  });
});

describe("namedDrafts", () => {
  it("drops the blank row waiting at the bottom of the list", () => {
    expect(namedDrafts([draft(), emptyDraft()])).toHaveLength(1);
  });
  it("treats whitespace as blank", () => {
    expect(namedDrafts([draft({ name: "   " })])).toEqual([]);
  });
});

describe("validateDelivery", () => {
  it("passes a well-formed box", () => {
    expect(ok([draft()])).toBeNull();
  });
  it("insists on a vendor", () => {
    expect(validateDelivery({ vendorId: null, useBy: "2026-08-17", drafts: [draft()] }))
      .toMatch(/who delivered/i);
  });
  it("insists on a use-by date", () => {
    expect(validateDelivery({ vendorId: "v1", useBy: null, drafts: [draft()] }))
      .toMatch(/use-by/i);
  });
  it("insists on at least one named meal", () => {
    expect(ok([emptyDraft()])).toMatch(/at least one meal/i);
  });
  it("rejects a fractional or zero quantity, naming the row", () => {
    expect(ok([draft({ quantity: "0" })])).toMatch(/Ruby Rice Bowl/);
    expect(ok([draft({ quantity: "1.5" })])).toMatch(/whole quantity/i);
  });
  it("rejects nonsense in a macro field, naming the field and the row", () => {
    expect(ok([draft({ protein: "lots" })])).toMatch(/Protein.*Ruby Rice Bowl/);
  });
  it("accepts blank macros — unknown is not an error", () => {
    expect(ok([draft({ calories: "", protein: "", fiber: "" })])).toBeNull();
  });
  it("accepts a decimal macro", () => {
    expect(ok([draft({ fiber: "13.5" })])).toBeNull();
  });
  it("refuses a box that arrives after its own use-by date", () => {
    expect(ok([draft()], { arrivesOn: "2026-08-18" })).toBe(
      "This box arrives after its use-by date. Check both dates.",
    );
  });

  it("accepts a box that arrives on its use-by date — tight, not wrong", () => {
    expect(ok([draft()], { arrivesOn: "2026-08-17" })).toBeNull();
  });

  it("accepts a box with no arrival date at all", () => {
    expect(ok([draft()], { arrivesOn: null })).toBeNull();
  });

  it("catches the same dish listed twice, whatever the casing", () => {
    expect(ok([draft(), draft({ name: "ruby rice BOWL" })])).toMatch(/listed twice/i);
  });
  it("does not count two blank rows as duplicates", () => {
    expect(ok([draft(), emptyDraft(), emptyDraft()])).toBeNull();
  });
});

describe("toDeliveryPayload", () => {
  it("trims the name and parses the numbers", () => {
    expect(toDeliveryPayload([draft({ name: "  Ruby Rice Bowl " })])).toEqual([
      {
        name: "Ruby Rice Bowl", slot: "lunch", quantity: 1,
        calories: 650, protein: 21, fiber: 13,
        carbs: 65, fats: 24, sugars: 9,
        saturated_fat: 4.5, sodium: 620, serving_size: "1 bowl",
        image_url: null,
      },
    ]);
  });
  it("keeps an untyped macro null rather than calling it zero", () => {
    const [meal] = toDeliveryPayload([draft({ fiber: "", saturatedFat: "", sodium: "" })]);
    expect(meal.fiber).toBeNull();
    expect(meal.saturated_fat).toBeNull();
    expect(meal.sodium).toBeNull();
  });

  it("names every field the way the database keys them", () => {
    // The payload goes straight into a plpgsql function that reads
    // `v_meal->>'saturated_fat'` and friends — a camelCase key here would be
    // read as a null by a function that cannot complain.
    const [meal] = toDeliveryPayload([draft()]);
    expect(Object.keys(meal)).toEqual(expect.arrayContaining([
      "carbs", "fats", "sugars", "saturated_fat", "sodium", "serving_size",
    ]));
  });

  it("carries the whole panel, the same one Edit Product asks for", () => {
    const [meal] = toDeliveryPayload([draft()]);
    expect(meal).toMatchObject({ carbs: 65, fats: 24, sugars: 9, serving_size: "1 bowl" });
  });

  it("sends a blank serving size as null, so the writer's default stands", () => {
    // An empty string would overwrite a serving the database already knows;
    // null leaves it alone and falls back to "1 meal" on a new row.
    const [meal] = toDeliveryPayload([draft({ servingSize: "   " })]);
    expect(meal.serving_size).toBeNull();
  });

  it("rejects nonsense in any of the newer macro fields", () => {
    expect(ok([draft({ carbs: "some" })])).toMatch(/Carbs.*Ruby Rice Bowl/);
    expect(ok([draft({ fats: "lots" })])).toMatch(/Fats.*Ruby Rice Bowl/);
    expect(ok([draft({ sugars: "sweet" })])).toMatch(/Sugars.*Ruby Rice Bowl/);
  });
  it("omits the blank row", () => {
    expect(toDeliveryPayload([draft(), emptyDraft()])).toHaveLength(1);
  });
  it("carries the slot through", () => {
    const [meal] = toDeliveryPayload([draft({ slot: "breakfast" })]);
    expect(meal.slot).toBe("breakfast");
  });
});

describe("DELIVERY_SLOTS", () => {
  it("offers every slot the app files a meal under, dessert included", () => {
    expect(DELIVERY_SLOTS).toEqual(["breakfast", "lunch", "dinner", "snack", "dessert"]);
  });
});

describe("dishSlug", () => {
  it("folds case and punctuation the way the database does", () => {
    expect(dishSlug("  Almond Dream Smoothie ")).toBe("almond-dream-smoothie");
    expect(dishSlug("PB & J Bowl")).toBe("pb-j-bowl");
  });
  it("trims the dashes a leading symbol would leave", () => {
    expect(dishSlug("*** Ruby Rice Bowl!")).toBe("ruby-rice-bowl");
  });
  it("is empty for a name with nothing in it", () => {
    expect(dishSlug("   ")).toBe("");
  });
});

describe("orderVendorsByUse", () => {
  const vendors = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const use = (vendorId: string, deliveryCount: number, lastDeliveredOn: string) =>
    ({ vendorId, deliveryCount, lastDeliveredOn });

  it("puts the most-delivered vendor first", () => {
    const ordered = orderVendorsByUse(vendors, [
      use("a", 2, "2026-08-01"),
      use("b", 9, "2026-08-01"),
    ]);
    expect(ordered.map((v) => v.id)).toEqual(["b", "a", "c"]);
  });
  it("breaks a tie on who delivered most recently", () => {
    const ordered = orderVendorsByUse(vendors, [
      use("a", 3, "2026-07-01"),
      use("b", 3, "2026-08-10"),
    ]);
    expect(ordered.map((v) => v.id)).toEqual(["b", "a", "c"]);
  });
  it("leaves never-used vendors behind the ranked ones, in their own order", () => {
    const ordered = orderVendorsByUse(vendors, [use("c", 1, "2026-08-01")]);
    expect(ordered.map((v) => v.id)).toEqual(["c", "a", "b"]);
  });
  it("changes nothing when there is no history at all", () => {
    expect(orderVendorsByUse(vendors, []).map((v) => v.id)).toEqual(["a", "b", "c"]);
  });
});

describe("filterRecentDishes", () => {
  const menu = [
    dish({ slug: "almond-dream-smoothie", name: "Almond Dream Smoothie" }),
    dish({ slug: "sweet-sorghum-salad", name: "Sweet Sorghum Salad with Pulled Chicken" }),
    dish({ slug: "pb-j-bowl", name: "PB & J Bowl" }),
  ];
  const names = (q: string) => filterRecentDishes(menu, q).map((d) => d.name);

  it("returns everything when nothing has been typed", () => {
    expect(filterRecentDishes(menu, "   ")).toHaveLength(3);
  });
  it("matches part of a name", () => {
    expect(names("smoo")).toEqual(["Almond Dream Smoothie"]);
  });
  it("ignores case", () => {
    expect(names("ALMOND")).toEqual(["Almond Dream Smoothie"]);
  });
  it("matches words in any order, which is how a dish is half remembered", () => {
    expect(names("chicken salad")).toEqual(["Sweet Sorghum Salad with Pulled Chicken"]);
  });
  it("sees through punctuation in the name", () => {
    expect(names("pbj")).toEqual(["PB & J Bowl"]);
  });
  it("requires every word, not just one", () => {
    expect(names("smoothie chicken")).toEqual([]);
  });
});

describe("draftFromRecent", () => {
  it("prefills the name, slot and macros", () => {
    expect(draftFromRecent(dish())).toMatchObject({
      name: "Almond Dream Smoothie",
      slot: "breakfast",
      quantity: "1",
      calories: "420",
      protein: "18",
      fiber: "7",
    });
  });
  it("leaves a macro blank where the history never knew it", () => {
    expect(draftFromRecent(dish({ fiber: null })).fiber).toBe("");
  });
  it("carries the photo from the last delivery", () => {
    expect(draftFromRecent(dish({ imageUrl: "https://cdn.example/a.jpg" })).imageUrl)
      .toBe("https://cdn.example/a.jpg");
    expect(draftFromRecent(dish()).imageUrl).toBeNull();
  });
});

describe("withDraftFacts", () => {
  const history = [
    dish({ imageUrl: "https://cdn.example/smoothie.jpg" }),
    dish({
      vendorId: "v2", slug: "almond-dream-smoothie",
      imageUrl: "https://cdn.example/impostor.jpg",
    }),
  ];

  it("fills a draft's photo from the same vendor's history", () => {
    const [d] = withDraftFacts(
      [draft({ name: "Almond Dream Smoothie" })], "v1", history,
    );
    expect(d.imageUrl).toBe("https://cdn.example/smoothie.jpg");
  });
  it("never borrows across vendors — same name, different food", () => {
    const [d] = withDraftFacts(
      [draft({ name: "Almond Dream Smoothie" })], "v3", history,
    );
    expect(d.imageUrl).toBeNull();
  });
  it("leaves a photo the draft already has alone", () => {
    const [d] = withDraftFacts(
      [draft({ name: "Almond Dream Smoothie", imageUrl: "https://cdn.example/mine.jpg" })],
      "v1", history,
    );
    expect(d.imageUrl).toBe("https://cdn.example/mine.jpg");
  });
  it("fills every blank macro from the same dish's last delivery", () => {
    // A repeat delivery is the same product. The panel it had is the panel it
    // has, and a box saved before a field existed must still end up with it.
    const [d] = withDraftFacts(
      [{ ...emptyDraft(), name: "Almond Dream Smoothie" }], "v1", history,
    );
    expect(d).toMatchObject({
      calories: "420", protein: "18", carbs: "48", fats: "12",
      fiber: "7", sugars: "20", saturatedFat: "2.5", sodium: "310",
      servingSize: "1 cup",
    });
  });

  it("never argues with a figure already typed", () => {
    const [d] = withDraftFacts(
      [{ ...emptyDraft(), name: "Almond Dream Smoothie", carbs: "51" }], "v1", history,
    );
    expect(d.carbs).toBe("51");
    expect(d.protein).toBe("18");
  });

  it("leaves blanks blank when history never knew the figure either", () => {
    const [d] = withDraftFacts(
      [{ ...emptyDraft(), name: "Almond Dream Smoothie" }],
      "v1",
      [dish({ sugars: null })],
    );
    expect(d.sugars).toBe("");
  });

  it("hands back the very same list when it changes nothing", () => {
    // The screen runs this on every history change; a fresh array each time
    // would re-render the whole meal list for no reason.
    const rows = [draft({ name: "Unknown Dish" })];
    expect(withDraftFacts(rows, "v1", history)).toBe(rows);
  });
});

describe("dishesNeedingImages", () => {
  it("lists named rows without a picture, and only those", () => {
    const rows = [
      draft({ name: "Pictured", imageUrl: "https://cdn.example/p.jpg" }),
      draft({ name: "Bare" }),
      emptyDraft(),
    ];
    expect(dishesNeedingImages(rows)).toEqual([{ key: rows[1].key, name: "Bare" }]);
  });
});

describe("recentCounts", () => {
  it("reads the stepper's number off the row's quantity", () => {
    expect(recentCounts([draft({ name: "Almond Dream Smoothie", quantity: "3" })]))
      .toEqual({ "almond-dream-smoothie": 3 });
  });
  it("ignores the blank row", () => {
    expect(recentCounts([emptyDraft()])).toEqual({});
  });
  it("counts a half-typed quantity as none rather than crashing", () => {
    expect(recentCounts([draft({ name: "Almond Dream Smoothie", quantity: "" })]))
      .toEqual({ "almond-dream-smoothie": 0 });
  });
});

describe("addRecent", () => {
  it("fills the blank row the screen starts with", () => {
    const next = addRecent([emptyDraft()], dish());
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: "Almond Dream Smoothie", quantity: "1" });
  });
  it("appends when every row is spoken for", () => {
    const next = addRecent([draft()], dish());
    expect(next.map((d) => d.name)).toEqual(["Ruby Rice Bowl", "Almond Dream Smoothie"]);
  });
  it("increments rather than adding the dish twice", () => {
    const once = addRecent([emptyDraft()], dish());
    const twice = addRecent(once, dish());
    expect(twice).toHaveLength(1);
    expect(twice[0].quantity).toBe("2");
  });
  it("adopts a row typed by hand that names the same dish", () => {
    const typed = [draft({ name: "almond dream SMOOTHIE", quantity: "1" })];
    const next = addRecent(typed, dish());
    expect(next).toHaveLength(1);
    expect(next[0].quantity).toBe("2");
  });
  it("counts up from a row whose quantity was left half-typed", () => {
    const next = addRecent([draft({ name: "Almond Dream Smoothie", quantity: "" })], dish());
    expect(next[0].quantity).toBe("1");
  });
  it("gives a bare row the dish's photo while incrementing it", () => {
    const withPhoto = dish({ imageUrl: "https://cdn.example/a.jpg" });
    const next = addRecent([draft({ name: "Almond Dream Smoothie" })], withPhoto);
    expect(next[0].imageUrl).toBe("https://cdn.example/a.jpg");
  });
  it("does not overwrite a photo the row already has", () => {
    const withPhoto = dish({ imageUrl: "https://cdn.example/a.jpg" });
    const rows = [draft({ name: "Almond Dream Smoothie", imageUrl: "https://cdn.example/mine.jpg" })];
    expect(addRecent(rows, withPhoto)[0].imageUrl).toBe("https://cdn.example/mine.jpg");
  });
});

describe("removeRecent", () => {
  it("walks the quantity back down", () => {
    const two = addRecent(addRecent([emptyDraft()], dish()), dish());
    expect(removeRecent(two, dish())[0].quantity).toBe("1");
  });
  it("takes the row away with the last one", () => {
    const one = addRecent([draft()], dish());
    const next = removeRecent(one, dish());
    expect(next.map((d) => d.name)).toEqual(["Ruby Rice Bowl"]);
  });
  it("never empties the list — there would be nothing to type into", () => {
    const only = addRecent([emptyDraft()], dish());
    const next = removeRecent(only, dish());
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe("");
  });
  it("does nothing for a dish that is not in the box", () => {
    const rows = [draft()];
    expect(removeRecent(rows, dish())).toEqual(rows);
  });
});

describe("addLocalDays", () => {
  it("walks the local calendar", () => {
    expect(addLocalDays("2026-08-12", 5)).toBe("2026-08-17");
  });
  it("rolls over a month end", () => {
    expect(addLocalDays("2026-08-30", 5)).toBe("2026-09-04");
  });
  it("rolls over a year end", () => {
    expect(addLocalDays("2026-12-30", 5)).toBe("2027-01-04");
  });
  it("handles a leap day", () => {
    expect(addLocalDays("2028-02-27", 3)).toBe("2028-03-01");
  });
  it("pads single-digit months and days", () => {
    expect(addLocalDays("2026-01-01", 1)).toBe("2026-01-02");
  });
});

describe("deliverySummary", () => {
  it("counts meals and their calories", () => {
    expect(deliverySummary([draft(), draft({ name: "Chunky Monkey Smoothie", calories: "490" })]))
      .toBe("2 meals · 1,140 kcal");
  });
  it("multiplies by quantity", () => {
    expect(deliverySummary([draft({ quantity: "2" })])).toBe("2 meals · 1,300 kcal");
  });
  it("says meal, singular, for one", () => {
    expect(deliverySummary([draft()])).toBe("1 meal · 650 kcal");
  });
  it("drops the calorie half when nothing has been typed", () => {
    expect(deliverySummary([draft({ calories: "" })])).toBe("1 meal");
  });
  it("is empty-safe", () => {
    expect(deliverySummary([])).toBe("0 meals");
  });
});

// ---------------------------------------------------------------------------
// A box that has not arrived, read back
// ---------------------------------------------------------------------------

describe("pendingDishes — the stored payload, as a list to show", () => {
  it("reads a dish off each element", () => {
    expect(pendingDishes([{ name: "Tahini-Java Smoothie", slot: "breakfast", quantity: 1 }]))
      .toEqual([
        { name: "Tahini-Java Smoothie", slot: "breakfast", quantity: 1, imageUrl: null },
      ]);
  });

  it("keeps the order the box was saved in — sorting is a display decision", () => {
    const dishes = pendingDishes([
      { name: "Waldorf Salad", slot: "lunch", quantity: 2 },
      { name: "Muesli", slot: "breakfast", quantity: 2 },
    ]);
    expect(dishes.map((d) => d.name)).toEqual(["Waldorf Salad", "Muesli"]);
  });

  it("drops the blank row the form always carries at the bottom", () => {
    expect(pendingDishes([
      { name: "Muesli", slot: "breakfast", quantity: 2 },
      { name: "   ", slot: "lunch", quantity: 1 },
    ])).toHaveLength(1);
  });

  it("trims the name, because the row was typed", () => {
    expect(pendingDishes([{ name: "  Muesli  ", slot: "lunch", quantity: 1 }])[0].name)
      .toBe("Muesli");
  });

  it("counts a missing or unusable quantity as one, exactly as the writer does", () => {
    // Matches `greatest(1, coalesce((m->>'quantity')::integer, 1))` in
    // 20260814180000 — a box must not say "7 meals" while it waits and "6"
    // once it lands.
    expect(pendingDishes([{ name: "A", slot: "lunch" }])[0].quantity).toBe(1);
    expect(pendingDishes([{ name: "B", slot: "lunch", quantity: 0 }])[0].quantity).toBe(1);
    expect(pendingDishes([{ name: "C", slot: "lunch", quantity: "3" }])[0].quantity).toBe(3);
    expect(pendingDishes([{ name: "D", slot: "lunch", quantity: "nonsense" }])[0].quantity).toBe(1);
  });

  it("files an unknown or missing slot under lunch, the app's own default", () => {
    expect(pendingDishes([{ name: "A", slot: "brunch", quantity: 1 }])[0].slot).toBe("lunch");
    expect(pendingDishes([{ name: "B", quantity: 1 }])[0].slot).toBe("lunch");
  });

  it("survives anything the column could hold", () => {
    // `meals` is jsonb with no shape constraint, and this renders a card.
    expect(pendingDishes(null)).toEqual([]);
    expect(pendingDishes(undefined)).toEqual([]);
    expect(pendingDishes("not an array")).toEqual([]);
    expect(pendingDishes([null, 7, "x"])).toEqual([]);
  });
});

describe("pendingDishes — the picture the box was saved with", () => {
  it("reads the dish's own photo out of the payload", () => {
    const [d] = pendingDishes([
      { name: "Muesli", slot: "breakfast", quantity: 1, image_url: "https://img/m.jpg" },
    ]);
    expect(d.imageUrl).toBe("https://img/m.jpg");
  });
  it("treats a blank or missing address as no photo", () => {
    expect(pendingDishes([{ name: "Muesli", image_url: "" }])[0].imageUrl).toBeNull();
    expect(pendingDishes([{ name: "Muesli", image_url: 7 }])[0].imageUrl).toBeNull();
  });
});

describe("mealsInDishes", () => {
  it("counts meals, not dishes — two of one dish is two meals", () => {
    expect(mealsInDishes([
      { name: "Muesli", slot: "breakfast", quantity: 2, imageUrl: null },
      { name: "Smoothie", slot: "breakfast", quantity: 1, imageUrl: null },
      { name: "Waldorf Salad", slot: "lunch", quantity: 2, imageUrl: null },
      { name: "Pesto Pasta", slot: "dinner", quantity: 2, imageUrl: null },
    ])).toBe(7);
  });

  it("is empty-safe", () => {
    expect(mealsInDishes([])).toBe(0);
  });
});

describe("sortDishesForMenu — the box reads as a menu, not an index", () => {
  const named = (name: string, slot: PreparedMealDraft["slot"]) => ({ name, slot, quantity: 1 });

  it("runs through the day: breakfast, lunch, dinner, snack, dessert", () => {
    const sorted = sortDishesForMenu([
      named("Brownie", "dessert"),
      named("Pesto Pasta", "dinner"),
      named("Trail Mix", "snack"),
      named("Muesli", "breakfast"),
      named("Waldorf Salad", "lunch"),
    ]);
    expect(sorted.map((d) => d.slot)).toEqual(["breakfast", "lunch", "dinner", "snack", "dessert"]);
  });

  it("leaves dishes sharing a slot in the order the box listed them", () => {
    // Not alphabetical: the owner typed them off the packing slip in an order,
    // and re-sorting within a slot loses information for no gain.
    const sorted = sortDishesForMenu([
      named("Tahini-Java Smoothie", "breakfast"),
      named("Waldorf Salad", "lunch"),
      named("Cocoa Crumble Muesli", "breakfast"),
    ]);
    expect(sorted.map((d) => d.name))
      .toEqual(["Tahini-Java Smoothie", "Cocoa Crumble Muesli", "Waldorf Salad"]);
  });

  it("does not disturb its argument", () => {
    const input = [named("Brownie", "dessert"), named("Muesli", "breakfast")];
    sortDishesForMenu(input);
    expect(input.map((d) => d.name)).toEqual(["Brownie", "Muesli"]);
  });

  it("is empty-safe", () => {
    expect(sortDishesForMenu([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A box that has not arrived, opened for editing
// ---------------------------------------------------------------------------

describe("draftsFromPayload — the saved box, back in the form that wrote it", () => {
  const saved = {
    name: "Ruby Rice Bowl",
    slot: "dinner" as const,
    quantity: 2,
    calories: 650,
    protein: 21,
    fiber: 13,
    carbs: 65,
    fats: 24,
    sugars: 9,
    saturated_fat: 4.5,
    sodium: 620,
    serving_size: "1 bowl",
    image_url: "https://cdn.example/ruby.jpg",
  };

  it("maps every field, including the three the database spells differently", () => {
    // The payload keys are the DATABASE's (`saturated_fat`, `sodium`,
    // `fiber`); the draft's are the form's. Getting this pair backwards is
    // silent — the row just opens with empty macro fields.
    const [d] = draftsFromPayload([saved]);
    expect(d.name).toBe("Ruby Rice Bowl");
    expect(d.slot).toBe("dinner");
    expect(d.quantity).toBe("2");
    expect(d.calories).toBe("650");
    expect(d.protein).toBe("21");
    expect(d.fiber).toBe("13");
    expect(d.saturatedFat).toBe("4.5");
    expect(d.sodium).toBe("620");
  });

  it("leaves a macro nobody typed blank, not zero", () => {
    const [d] = draftsFromPayload([{ ...saved, fiber: null, sodium: null }]);
    expect(d.fiber).toBe("");
    expect(d.sodium).toBe("");
  });

  it("gives every row its own key, so the list can be edited", () => {
    const drafts = draftsFromPayload([saved, { ...saved, name: "Pesto Pasta" }]);
    expect(drafts[0].key).not.toBe(drafts[1].key);
  });

  it("never hands back an empty list — a form with no row has nothing to type into", () => {
    expect(draftsFromPayload([])).toHaveLength(1);
    expect(draftsFromPayload([])[0].name).toBe("");
  });

  it("round-trips through toDeliveryPayload unchanged", () => {
    // The whole point: what an edit saves must be what it opened, minus the
    // edits. A drift here rewrites macros nobody touched.
    expect(toDeliveryPayload(draftsFromPayload([saved]))).toEqual([saved]);
  });

  it("survives a payload row missing everything but a name", () => {
    const [d] = draftsFromPayload([{ name: "Mystery Bowl" } as never]);
    expect(d.name).toBe("Mystery Bowl");
    expect(d.slot).toBe("lunch");
    expect(d.quantity).toBe("1");
    expect(d.calories).toBe("");
  });
});

describe("withDishPhotos — a box on the way borrows last delivery's photos", () => {
  const seen = (over: Partial<RecentDish> = {}): RecentDish => ({
    ...dish(),
    vendorId: "thistle",
    slug: "cocoa-berry-crumble-muesli",
    name: "Cocoa & Berry Crumble Muesli",
    imageUrl: "https://img/muesli.jpg",
    ...over,
  });
  const coming = (name: string, imageUrl: string | null = null) =>
    ({ name, slot: "breakfast" as const, quantity: 1, imageUrl });

  it("finds the photo through the name fold, not the spelling", () => {
    // The pending payload holds a typed name; the history holds the database's
    // slug of one. "&" and the capitals are exactly what the fold is for.
    const [d] = withDishPhotos([coming("Cocoa & Berry Crumble Muesli")], "thistle", [seen()]);
    expect(d.imageUrl).toBe("https://img/muesli.jpg");
  });

  it("matches a re-typed name that folds the same way", () => {
    const [d] = withDishPhotos([coming("cocoa  &  berry crumble MUESLI")], "thistle", [seen()]);
    expect(d.imageUrl).toBe("https://img/muesli.jpg");
  });

  it("will not borrow another vendor's photo of the same dish name", () => {
    // Two subscriptions both send a "Chicken Salad" and they are not the same
    // food. A wrong photo is worse than none: it is a claim about the box.
    const [d] = withDishPhotos(
      [coming("Chicken Salad")],
      "thistle",
      [seen({ vendorId: "sakara", slug: "chicken-salad", name: "Chicken Salad" })],
    );
    expect(d.imageUrl).toBeNull();
  });

  it("keeps the box's own photo rather than borrowing over it", () => {
    // A picture attached while entering the delivery is a statement about THAT
    // box, made after whatever history holds.
    const [d] = withDishPhotos(
      [coming("Cocoa & Berry Crumble Muesli", "https://img/this-box.jpg")],
      "thistle",
      [seen()],
    );
    expect(d.imageUrl).toBe("https://img/this-box.jpg");
  });

  it("shows a dish its own photo even when history has never seen it", () => {
    const [d] = withDishPhotos(
      [coming("Brand New Bowl", "https://img/new.jpg")], "thistle", [seen()],
    );
    expect(d.imageUrl).toBe("https://img/new.jpg");
  });

  it("gives null for a dish this vendor has never sent before", () => {
    const [d] = withDishPhotos([coming("Brand New Bowl")], "thistle", [seen()]);
    expect(d.imageUrl).toBeNull();
  });

  it("gives null when the remembered dish had no photo", () => {
    const [d] = withDishPhotos(
      [coming("Cocoa & Berry Crumble Muesli")],
      "thistle",
      [seen({ imageUrl: null })],
    );
    expect(d.imageUrl).toBeNull();
  });

  it("falls back to folding the name when the view handed back no slug", () => {
    const [d] = withDishPhotos(
      [coming("Cocoa & Berry Crumble Muesli")],
      "thistle",
      [seen({ slug: "" })],
    );
    expect(d.imageUrl).toBe("https://img/muesli.jpg");
  });

  it("keeps the dish itself untouched, and its order", () => {
    const dishes = [coming("Tahini-Java Smoothie"), coming("Cocoa & Berry Crumble Muesli")];
    const out = withDishPhotos(dishes, "thistle", [seen()]);
    expect(out.map((d) => d.name)).toEqual([
      "Tahini-Java Smoothie", "Cocoa & Berry Crumble Muesli",
    ]);
    expect(out[0]).toMatchObject({ name: "Tahini-Java Smoothie", slot: "breakfast", quantity: 1 });
  });

  it("is empty-safe on both sides", () => {
    expect(withDishPhotos([], "thistle", [seen()])).toEqual([]);
    expect(withDishPhotos([coming("Anything")], "thistle", [])[0].imageUrl).toBeNull();
  });
});
