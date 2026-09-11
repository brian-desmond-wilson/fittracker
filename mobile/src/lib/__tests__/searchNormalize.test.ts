import { normaliseForSearch, searchMatches } from "../searchNormalize";

describe("normaliseForSearch", () => {
  it("lowercases", () => {
    expect(normaliseForSearch("Push")).toBe("push");
  });

  it("strips spaces, hyphens, and underscores", () => {
    expect(normaliseForSearch("Push Up")).toBe("pushup");
    expect(normaliseForSearch("Push-Up")).toBe("pushup");
    expect(normaliseForSearch("push_up")).toBe("pushup");
    expect(normaliseForSearch("Close-Grip Push-Up")).toBe("closegrippushup");
  });

  it("collapses runs of separators", () => {
    expect(normaliseForSearch("fit___dad")).toBe("fitdad");
    expect(normaliseForSearch("push   up")).toBe("pushup");
  });

  it("strips accents", () => {
    expect(normaliseForSearch("Jalapeño")).toBe("jalapeno");
    expect(normaliseForSearch("café")).toBe("cafe");
  });

  it("folds separator-only or empty input to an empty string", () => {
    expect(normaliseForSearch("")).toBe("");
    expect(normaliseForSearch("  - _ ")).toBe("");
  });
});

describe("searchMatches", () => {
  it("matches across separator differences, both directions", () => {
    expect(searchMatches("Push-Up", "push up")).toBe(true);
    expect(searchMatches("Push Up", "push-up")).toBe(true);
    expect(searchMatches("Push-Up", "pushup")).toBe(true);
  });

  it("matches a partial substring", () => {
    expect(searchMatches("Close-Grip Push-Up", "grip push")).toBe(true);
  });

  it("finds an underscored handle from spaced words", () => {
    expect(searchMatches("fit___dad", "fit dad")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(searchMatches("Push-Up", "squat")).toBe(false);
  });

  it("an empty query matches anything", () => {
    expect(searchMatches("Push-Up", "")).toBe(true);
  });
});
