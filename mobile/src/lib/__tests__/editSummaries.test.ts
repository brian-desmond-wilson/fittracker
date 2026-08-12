import {
  storageSummary, nutritionSummary, expirySummary, relativeDays,
  photosSummary, basicSummary, notesSummary, changeCount, changeLabel,
} from "../editSummaries";

describe("storageSummary", () => {
  const base = {
    storageType: "single-location" as const,
    quantity: 5, unit: "count", location: "Freezer",
    locationCount: 1, restockThreshold: 2,
  };
  it("says how many, where, and when to restock", () => {
    expect(storageSummary(base)).toBe("5 in stock in the freezer · restock at 2");
  });
  it("counts places for a multi-location item rather than naming one", () => {
    expect(storageSummary({ ...base, storageType: "multi-location", locationCount: 2 }))
      .toBe("5 in stock in 2 places · restock at 2");
  });
  it("uses the singular for one place", () => {
    expect(storageSummary({ ...base, storageType: "multi-location", locationCount: 1, restockThreshold: 0 }))
      .toBe("5 in stock in 1 place");
  });
  it("drops the restock clause when no threshold is set", () => {
    expect(storageSummary({ ...base, restockThreshold: 0 })).toBe("5 in stock in the freezer");
  });
  it("drops the location clause when there is none", () => {
    expect(storageSummary({ ...base, location: null, restockThreshold: 0 })).toBe("5 in stock");
  });
  it("an out-of-stock item still reads honestly", () => {
    expect(storageSummary({ ...base, quantity: 0, restockThreshold: 0 }))
      .toBe("Out of stock in the freezer");
  });
});

describe("nutritionSummary", () => {
  it("leads with calories and names the serving", () => {
    expect(nutritionSummary({ calories: 310, servingSize: "1 bowl" }))
      .toBe("310 kcal per 1 bowl");
  });
  it("falls back to a generic serving when none is recorded", () => {
    expect(nutritionSummary({ calories: 310, servingSize: null }))
      .toBe("310 kcal per serving");
  });
  it("admits when there is nothing", () => {
    expect(nutritionSummary({ calories: null, servingSize: null })).toBe("Nothing recorded yet");
  });
  it("distinguishes a serving size with no figures behind it", () => {
    expect(nutritionSummary({ calories: null, servingSize: "1 bowl" })).toBe("Serving size only");
  });
});

describe("relativeDays", () => {
  it("handles both directions and today", () => {
    expect(relativeDays(0)).toBe("today");
    expect(relativeDays(3)).toBe("in 3 days");
    expect(relativeDays(-3)).toBe("3 days ago");
  });
  it("switches to weeks then months as the span grows", () => {
    expect(relativeDays(35)).toBe("in 5 weeks");
    expect(relativeDays(90)).toBe("in 3 months");
  });
  it("uses the singular for one day", () => {
    expect(relativeDays(1)).toBe("in 1 day");
  });
});

describe("expirySummary", () => {
  it("pairs the date with how far away it is", () => {
    expect(expirySummary("September 17, 2026", 35)).toBe("September 17, 2026 · in 5 weeks");
  });
  it("shows the date alone when the distance is unknown", () => {
    expect(expirySummary("September 17, 2026", null)).toBe("September 17, 2026");
  });
  it("says Not set rather than inventing a date", () => {
    expect(expirySummary(null, null)).toBe("Not set");
    expect(expirySummary(null, 5)).toBe("Not set");
  });
});

describe("photosSummary", () => {
  it("names which one matters when there are several", () => {
    expect(photosSummary(3)).toBe("3 images · the first is the main one");
  });
  it("says nothing extra for a single image", () => {
    expect(photosSummary(1)).toBe("1 image");
  });
  it("is honest about none", () => {
    expect(photosSummary(0)).toBe("None yet");
  });
});

describe("basicSummary", () => {
  it("joins brand and category path", () => {
    expect(basicSummary("Kirkland Signature", "Frozen › Breakfast Foods"))
      .toBe("Kirkland Signature · Frozen › Breakfast Foods");
  });
  it("drops whichever half is missing", () => {
    expect(basicSummary("Kirkland Signature", null)).toBe("Kirkland Signature");
    expect(basicSummary(null, "Frozen")).toBe("Frozen");
    expect(basicSummary("", "Frozen")).toBe("Frozen");
  });
  it("falls back when there is neither", () => {
    expect(basicSummary(null, null)).toBe("Name only");
  });
});

describe("notesSummary", () => {
  it("shows the note, truncated when long", () => {
    expect(notesSummary("Freezer burn easily")).toBe("Freezer burn easily");
    expect(notesSummary("x".repeat(60))).toBe(`${"x".repeat(42)}…`);
  });
  it("treats whitespace as empty", () => {
    expect(notesSummary("   ")).toBe("None");
    expect(notesSummary(null)).toBe("None");
  });
});

describe("changeCount — Save must know whether anything actually changed", () => {
  it("counts nothing when nothing moved", () => {
    expect(changeCount({ name: "a", qty: 1 }, { name: "a", qty: 1 })).toBe(0);
  });
  it("counts each changed field", () => {
    expect(changeCount({ name: "a", qty: 1 }, { name: "b", qty: 2 })).toBe(2);
  });
  it("ignores the order of array fields — reordering chips is not an edit", () => {
    expect(changeCount({ cats: ["a", "b"] }, { cats: ["b", "a"] })).toBe(0);
  });
  it("still catches a real array change", () => {
    expect(changeCount({ cats: ["a"] }, { cats: ["a", "b"] })).toBe(1);
    expect(changeCount({ cats: ["a", "b"] }, { cats: ["a"] })).toBe(1);
  });
  it("treats an emptied field as a change", () => {
    expect(changeCount({ brand: "Kirkland" }, { brand: "" })).toBe(1);
  });
});

describe("changeLabel", () => {
  it("reads as a state, not a count, when clean", () => {
    expect(changeLabel(0)).toBe("Saved");
  });
  it("pluralises", () => {
    expect(changeLabel(1)).toBe("1 change");
    expect(changeLabel(4)).toBe("4 changes");
  });
});
