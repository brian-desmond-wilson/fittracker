import { suggestConcepts, type MatchableConcept } from "../conceptMatch";

const C = (id: string, name: string): MatchableConcept => ({ id, name });
const concepts: MatchableConcept[] = [
  C("butter", "Butter"),
  C("pb", "Peanut Butter"),
  C("bananas", "Bananas"),
  C("rice", "Rice"),
  C("mwrice", "Microwave Rice"),
  C("milk", "Whole Milk"),
  C("cheese", "Cheese"),
  C("bread", "Bread"), // exactly MIN_SUFFIX_CONCEPT_LENGTH chars — boundary fixture
];

describe("suggestConcepts", () => {
  it("rank 0: exact match, case/whitespace-insensitive", () => {
    expect(suggestConcepts("  butter ", concepts)[0]).toMatchObject({ conceptId: "butter", rank: 0 });
  });

  it("rank 1: plural-modulo equality — 'Banana' matches 'Bananas'", () => {
    expect(suggestConcepts("Banana", concepts)[0]).toMatchObject({ conceptId: "bananas", rank: 1 });
  });

  it("rank 2: head-noun suffix — 'Kerrygold Butter' → Butter", () => {
    const got = suggestConcepts("Kerrygold Butter", concepts);
    expect(got[0]).toMatchObject({ conceptId: "butter", rank: 2 });
  });

  it("does NOT match a non-trailing word — 'Butter Lettuce' → no Butter", () => {
    expect(suggestConcepts("Butter Lettuce", concepts)).toHaveLength(0);
  });

  it("most-specific wins: 'Jif Peanut Butter' prefers Peanut Butter over Butter", () => {
    const got = suggestConcepts("Jif Peanut Butter", concepts);
    expect(got[0].conceptId).toBe("pb");
    expect(got.map((s) => s.conceptId)).toContain("butter"); // still offered, ranked lower
  });

  it("concepts under 5 chars never suffix-match — 'Fried Rice' → nothing", () => {
    expect(suggestConcepts("Fried Rice", concepts)).toHaveLength(0);
  });

  it("boundary: a 5-char concept DOES suffix-match — 'White Bread' → Bread", () => {
    // The seeded 'Bread' concept (spec §10.1) sits exactly on the inclusive
    // >= 5 boundary; an off-by-one here would silently kill its head-noun
    // matching. Pins the INCLUDED side of MIN_SUFFIX_CONCEPT_LENGTH.
    expect(suggestConcepts("White Bread", concepts)[0]).toEqual({ conceptId: "bread", rank: 2 });
  });

  it("no wildcard hazard: '2% Milk' does not match 'Whole Milk'", () => {
    expect(suggestConcepts("2% Milk", concepts)).toHaveLength(0);
  });

  it("documented residual: 'Nutter Butter' still suffix-matches Butter (human confirm filters it)", () => {
    expect(suggestConcepts("Nutter Butter", concepts)[0]).toMatchObject({ conceptId: "butter", rank: 2 });
  });

  it("ties on rank and name length break deterministically by conceptId", () => {
    // Equal rank + equal name length is only reachable when two concepts
    // normalize to the same name (e.g. a stray duplicate concept). Without the
    // conceptId tiebreak the order would fall back to input order, and the
    // one-tap link chip would shuffle between renders. Input order here is
    // reversed relative to the expected output, so a no-op tiebreak fails.
    const dupes: MatchableConcept[] = [C("z-butter", "butter"), C("a-butter", "Butter")];
    expect(suggestConcepts("Kerrygold Butter", dupes)).toEqual([
      { conceptId: "a-butter", rank: 2 },
      { conceptId: "z-butter", rank: 2 },
    ]);
  });
});
