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

  it("no wildcard hazard: '2% Milk' does not match 'Whole Milk'", () => {
    expect(suggestConcepts("2% Milk", concepts)).toHaveLength(0);
  });

  it("documented residual: 'Nutter Butter' still suffix-matches Butter (human confirm filters it)", () => {
    expect(suggestConcepts("Nutter Butter", concepts)[0]).toMatchObject({ conceptId: "butter", rank: 2 });
  });
});
