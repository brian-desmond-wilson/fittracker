import { tasteAskFor, type TasteAskConcept } from "../tasteAsk";

const concept = (id: string, ratingConfirmedAt: string | null = null): TasteAskConcept => ({
  id, name: id, ratingConfirmedAt,
});

describe("tasteAskFor", () => {
  it("asks about the one concept nobody has rated", () => {
    expect(tasteAskFor([concept("muesli")])?.id).toBe("muesli");
  });

  it("stays quiet when everything is already confirmed", () => {
    expect(tasteAskFor([concept("oats", "2026-08-01T00:00:00Z")])).toBeNull();
  });

  it("stays quiet for a meal with several unrated ingredients", () => {
    // A curation job, not a question worth interrupting a log with — and
    // picking one of them arbitrarily teaches the wrong thing about the rest.
    expect(tasteAskFor([concept("a"), concept("b")])).toBeNull();
  });

  it("still asks when the OTHERS are confirmed and exactly one is not", () => {
    expect(tasteAskFor([
      concept("oats", "2026-08-01T00:00:00Z"),
      concept("berries", "2026-08-01T00:00:00Z"),
      concept("new-thing"),
    ])?.id).toBe("new-thing");
  });

  it("stays quiet for a meal with no concepts at all", () => {
    expect(tasteAskFor([])).toBeNull();
  });
});
