import {
  addLocalDays,
  deliverySummary,
  emptyDraft,
  namedDrafts,
  toDeliveryPayload,
  validateDelivery,
  type PreparedMealDraft,
} from "../preparedMealDelivery";

const draft = (over: Partial<PreparedMealDraft> = {}): PreparedMealDraft => ({
  ...emptyDraft(),
  name: "Ruby Rice Bowl",
  calories: "650",
  protein: "21",
  fiber: "13",
  ...over,
});

const ok = (drafts: PreparedMealDraft[]) =>
  validateDelivery({ vendorId: "v1", useBy: "2026-08-17", drafts });

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
      { name: "Ruby Rice Bowl", slot: "lunch", quantity: 1, calories: 650, protein: 21, fiber: 13 },
    ]);
  });
  it("keeps an untyped macro null rather than calling it zero", () => {
    const [meal] = toDeliveryPayload([draft({ fiber: "" })]);
    expect(meal.fiber).toBeNull();
  });
  it("omits the blank row", () => {
    expect(toDeliveryPayload([draft(), emptyDraft()])).toHaveLength(1);
  });
  it("carries the slot through", () => {
    const [meal] = toDeliveryPayload([draft({ slot: "breakfast" })]);
    expect(meal.slot).toBe("breakfast");
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
