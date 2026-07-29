import {
  computeBrianScore,
  RATING_POINTS,
  RAW_MAX,
  COMPONENT_MAX,
  type ScoreItemInput,
} from "../mealScore";

function item(over: Partial<ScoreItemInput> = {}): ScoreItemInput {
  return {
    calories: 300,
    protein: 20,
    servings: 1,
    smallPiecesOk: false,
    concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: false }],
    ...over,
  };
}

describe("taste", () => {
  it("calorie-weights item ratings (servings × calories)", () => {
    // 100cal love(30) vs 300cal neutral(15): (100*30 + 300*15) / 400 = 18.75
    const r = computeBrianScore({
      prepMinutes: 5,
      role: null,
      tasteOverride: null,
      items: [
        item({ calories: 100, concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: false }] }),
        item({ calories: 300, concepts: [{ rating: "neutral", requiresSmallPieces: false, prepIntensive: false }] }),
      ],
    });
    expect(r.taste).toBeCloseTo(18.75, 2);
    expect(r.tasteUnknown).toBe(false);
  });

  it("excludes unlinked items from the taste average", () => {
    const r = computeBrianScore({
      prepMinutes: 5,
      role: null,
      tasteOverride: null,
      items: [item({ concepts: [] }), item()],
    });
    expect(r.taste).toBe(RATING_POINTS.love); // only the linked item counts
  });

  it("flags tasteUnknown at neutral 15 when no item is linked", () => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [item({ concepts: [] })],
    });
    expect(r.taste).toBe(15);
    expect(r.tasteUnknown).toBe(true);
  });

  it("taste_override replaces the computation entirely", () => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: "love",
      items: [item({ concepts: [{ rating: "dislike", requiresSmallPieces: false, prepIntensive: false }] })],
    });
    expect(r.taste).toBe(30);
    expect(r.tasteUnknown).toBe(false);
  });

  it("falls back to unweighted average when linked items have no calories", () => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [
        item({ calories: null }),
        item({ calories: 0, concepts: [{ rating: "neutral", requiresSmallPieces: false, prepIntensive: false }] }),
      ],
    });
    expect(r.taste).toBeCloseTo((30 + 15) / 2, 2);
  });

  it("averages multiple concepts on one item", () => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [item({
        concepts: [
          { rating: "love", requiresSmallPieces: false, prepIntensive: false },
          { rating: "neutral", requiresSmallPieces: false, prepIntensive: false },
        ],
      })],
    });
    expect(r.taste).toBeCloseTo(22.5, 2);
  });
});

describe("convenience", () => {
  const items = [item()];
  it.each([
    [0, 25], [2, 25], [3, 20], [5, 20], [6, 12], [10, 12], [11, 5],
  ])("prep %i min → %i", (prep, want) => {
    const r = computeBrianScore({ prepMinutes: prep, role: null, tasteOverride: null, items });
    expect(r.convenience).toBe(want);
  });
  it("applies the prep_intensive penalty once", () => {
    const two = [
      item({ concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: true }] }),
      item({ concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: true }] }),
    ];
    const r = computeBrianScore({ prepMinutes: 2, role: null, tasteOverride: null, items: two });
    expect(r.convenience).toBe(22); // 25 - 3, not 25 - 6
  });
});

describe("protein / calories components and totals", () => {
  it("scales totals by servings", () => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [item({ calories: 290, protein: 26, servings: 1.5 })],
    });
    expect(r.totalCalories).toBeCloseTo(435, 1);
    expect(r.totalProtein).toBeCloseTo(39, 1);
    expect(r.protein).toBe(12); // >=30
  });
  it.each([
    [45, 15], [40, 15], [39, 12], [30, 12], [29, 8], [20, 8], [19, 4], [10, 4], [9, 0],
  ])("protein %i g → %i", (p, want) => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [item({ protein: p })],
    });
    expect(r.protein).toBe(want);
  });
  it.each([
    [600, 10], [500, 10], [499, 7], [400, 7], [399, 4], [300, 4], [299, 2],
  ])("non-bridge %i cal → %i", (cal, want) => {
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: null,
      items: [item({ calories: cal })],
    });
    expect(r.calories).toBe(want);
  });
  it.each([
    [250, 10], [400, 10], [300, 10], [249, 4], [401, 4], [690, 4],
  ])("bridge %i cal → %i", (cal, want) => {
    const r = computeBrianScore({
      prepMinutes: 5, role: "bridge", tasteOverride: null,
      items: [item({ calories: cal })],
    });
    expect(r.calories).toBe(want);
  });
});

describe("EoE", () => {
  const flagged = (ok: boolean) =>
    item({ smallPiecesOk: ok, concepts: [{ rating: "like", requiresSmallPieces: true, prepIntensive: false }] });
  it("−5 per unaddressed small-pieces item, floor 0", () => {
    expect(computeBrianScore({ prepMinutes: 5, role: null, tasteOverride: null, items: [flagged(false)] }).eoe).toBe(10);
    expect(
      computeBrianScore({
        prepMinutes: 5, role: null, tasteOverride: null,
        items: [flagged(false), flagged(false), flagged(false), flagged(false)],
      }).eoe,
    ).toBe(0);
  });
  it("small_pieces_ok waives the penalty", () => {
    expect(computeBrianScore({ prepMinutes: 5, role: null, tasteOverride: null, items: [flagged(true)] }).eoe).toBe(15);
  });
});

describe("flags, approval, renormalization", () => {
  it("containsNever disqualifies Approved regardless of score", () => {
    const r = computeBrianScore({
      prepMinutes: 2, role: null, tasteOverride: "love",
      items: [
        item({ calories: 600, protein: 40 }),
        item({ concepts: [{ rating: "never", requiresSmallPieces: false, prepIntensive: false }] }),
      ],
    });
    expect(r.containsNever).toBe(true);
    expect(r.approved).toBe(false);
  });

  it("Korean Beef Bowl seed profile scores as a core meal", () => {
    // ground beef 1.5×(290cal,26p love) + rice 1×(310,6 love) + sauce 1×(60,1 unlinked)
    const r = computeBrianScore({
      prepMinutes: 5, role: null, tasteOverride: "love",
      items: [
        item({ calories: 290, protein: 26, servings: 1.5 }),
        item({ calories: 310, protein: 6 }),
        item({ calories: 60, protein: 1, concepts: [] }),
      ],
    });
    // taste 30 + convenience 20 + protein 15 (46g) + eoe 15 + calories 10 (805) = 90 raw
    expect(r.raw).toBe(90);
    expect(r.score).toBe(Math.round((90 * 100) / 95)); // 95
    expect(r.approved).toBe(true);
  });

  it("PB&J honestly fails Approved on protein", () => {
    const r = computeBrianScore({
      prepMinutes: 3, role: null, tasteOverride: null,
      items: [
        item({ calories: 150, protein: 5 }),   // bread (love)
        item({ calories: 190, protein: 8, servings: 2 }), // PB (love)
        item({ calories: 50, protein: 0, concepts: [] }), // jelly
      ],
    });
    expect(r.totalProtein).toBeCloseTo(21, 1);
    expect(r.approved).toBe(false);
  });

  it("bridge role substitutes for the 500-cal admission bar", () => {
    const r = computeBrianScore({
      prepMinutes: 2, role: "bridge", tasteOverride: null,
      items: [item({ calories: 300, protein: 32 })],
    });
    expect(r.approved).toBe(true);
  });
});

describe("float-epsilon regressions", () => {
  it("an all-like meal with a weighted-average taste of exactly 22 is Approved", () => {
    // Confirmed real failure: weighted-average taste mathematically equals
    // 22 (all items rated "like"), but naive float division landed on
    // 21.999999999999996, silently failing `taste >= 22` and denying the
    // Brian Approved badge on an ordinary meal. Every other criterion here
    // passes, so this is a direct guard for defect 1 — taste rounding.
    const like = { rating: "like" as const, requiresSmallPieces: false, prepIntensive: false };
    const r = computeBrianScore({
      prepMinutes: 5,
      role: null,
      tasteOverride: null,
      items: [
        item({ calories: 474, protein: 40, servings: 0.5, smallPiecesOk: true, concepts: [like] }),
        item({ calories: 798, protein: 40, servings: 0.33, smallPiecesOk: true, concepts: [like] }),
      ],
    });
    expect(r.taste).toBe(22);
    expect(r.approved).toBe(true);
  });

  it("carries a non-integer weighted taste through raw and score without a tasteOverride", () => {
    // Every other raw/score assertion in this file uses tasteOverride: "love",
    // which only ever produces integer taste. This exercises the weighted-
    // average branch end to end so raw/score rounding is covered on a
    // genuinely non-integer path.
    const r = computeBrianScore({
      prepMinutes: 5,
      role: null,
      tasteOverride: null,
      items: [
        item({ calories: 200, protein: 10, servings: 1, concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: false }] }),
        item({ calories: 100, protein: 10, servings: 1, concepts: [{ rating: "dislike", requiresSmallPieces: false, prepIntensive: false }] }),
      ],
    });
    // taste = (200*30 + 100*8) / 300 = 22.666666666666668 -> rounded 22.6667
    expect(r.taste).toBeCloseTo(22.6667, 4);
    expect(r.convenience).toBe(20); // prep 5
    expect(r.protein).toBe(8); // total 20g
    expect(r.eoe).toBe(15);
    expect(r.calories).toBe(4); // total 300 cal
    expect(r.raw).toBe(69.7);
    expect(r.score).toBe(73); // round(69.7 * 100 / 95)
  });

  it("denies Approved on EoE alone when every other criterion passes", () => {
    const r = computeBrianScore({
      prepMinutes: 5,
      role: null,
      tasteOverride: null,
      items: [
        item({
          calories: 600,
          protein: 40,
          servings: 1,
          smallPiecesOk: false,
          concepts: [{ rating: "love", requiresSmallPieces: true, prepIntensive: false }],
        }),
      ],
    });
    expect(r.totalProtein).toBeGreaterThanOrEqual(30);
    expect(r.totalCalories).toBeGreaterThanOrEqual(500);
    expect(r.taste).toBeGreaterThanOrEqual(22);
    expect(r.eoe).toBe(10); // one unaddressed small-pieces item
    expect(r.approved).toBe(false);
  });

  it("pins current behavior for an empty item list (Task 13 map-miss fallback)", () => {
    const r = computeBrianScore({
      prepMinutes: 5,
      role: null,
      tasteOverride: null,
      items: [],
    });
    expect(r.totalCalories).toBe(0);
    expect(r.totalProtein).toBe(0);
    expect(r.containsNever).toBe(false);
    expect(r.taste).toBe(15);
    expect(r.tasteUnknown).toBe(true);
    expect(r.convenience).toBe(20);
    expect(r.protein).toBe(0);
    expect(r.eoe).toBe(15);
    expect(r.calories).toBe(2);
    expect(r.raw).toBe(52);
    expect(r.score).toBe(55); // round(52 * 100 / 95)
    expect(r.approved).toBe(false);
  });

  it("COMPONENT_MAX values sum to RAW_MAX", () => {
    const sum = Object.values(COMPONENT_MAX).reduce((a, b) => a + b, 0);
    expect(sum).toBe(RAW_MAX);
  });
});
