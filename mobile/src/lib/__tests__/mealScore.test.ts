import {
  computeBrianScore,
  RATING_POINTS,
  RAW_MAX,
  COMPONENT_MAX,
  SCORE_BAND_CORE_MIN,
  SCORE_BAND_MID_MIN,
  scoreBand,
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
      roles: [],
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
      roles: [],
      tasteOverride: null,
      items: [item({ concepts: [] }), item()],
    });
    expect(r.taste).toBe(RATING_POINTS.love); // only the linked item counts
  });

  it("flags tasteUnknown at neutral 15 when no item is linked", () => {
    const r = computeBrianScore({
      prepMinutes: 5, roles: [], tasteOverride: null,
      items: [item({ concepts: [] })],
    });
    expect(r.taste).toBe(15);
    expect(r.tasteUnknown).toBe(true);
  });

  it("taste_override replaces the computation entirely", () => {
    const r = computeBrianScore({
      prepMinutes: 5, roles: [], tasteOverride: "love",
      items: [item({ concepts: [{ rating: "dislike", requiresSmallPieces: false, prepIntensive: false }] })],
    });
    expect(r.taste).toBe(30);
    expect(r.tasteUnknown).toBe(false);
  });

  it("falls back to unweighted average when linked items have no calories", () => {
    const r = computeBrianScore({
      prepMinutes: 5, roles: [], tasteOverride: null,
      items: [
        item({ calories: null }),
        item({ calories: 0, concepts: [{ rating: "neutral", requiresSmallPieces: false, prepIntensive: false }] }),
      ],
    });
    expect(r.taste).toBeCloseTo((30 + 15) / 2, 2);
  });

  it("averages multiple concepts on one item", () => {
    const r = computeBrianScore({
      prepMinutes: 5, roles: [], tasteOverride: null,
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
    const r = computeBrianScore({ prepMinutes: prep, roles: [], tasteOverride: null, items });
    expect(r.convenience).toBe(want);
  });
  it("applies the prep_intensive penalty once", () => {
    const two = [
      item({ concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: true }] }),
      item({ concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: true }] }),
    ];
    const r = computeBrianScore({ prepMinutes: 2, roles: [], tasteOverride: null, items: two });
    expect(r.convenience).toBe(22); // 25 - 3, not 25 - 6
  });
});

describe("protein / calories components and totals", () => {
  it("scales totals by servings", () => {
    const r = computeBrianScore({
      prepMinutes: 5, roles: [], tasteOverride: null,
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
      prepMinutes: 5, roles: [], tasteOverride: null,
      items: [item({ protein: p })],
    });
    expect(r.protein).toBe(want);
  });
  it.each([
    [600, 10], [500, 10], [499, 7], [400, 7], [399, 4], [300, 4], [299, 2],
  ])("non-bridge %i cal → %i", (cal, want) => {
    const r = computeBrianScore({
      prepMinutes: 5, roles: [], tasteOverride: null,
      items: [item({ calories: cal })],
    });
    expect(r.calories).toBe(want);
  });
  it.each([
    [250, 10], [400, 10], [300, 10], [249, 4], [401, 4], [690, 4],
  ])("bridge %i cal → %i", (cal, want) => {
    const r = computeBrianScore({
      prepMinutes: 5, roles: ["bridge"], tasteOverride: null,
      items: [item({ calories: cal })],
    });
    expect(r.calories).toBe(want);
  });

  // Roles are a SET now. `bridge` relaxes the calorie band because a bridge is
  // meant to be small, and that stays true of a meal that is a bridge AND
  // something else — reading only the first role would put a 300-calorie
  // post-workout bridge back on the ordinary ladder and score it 4.
  it("bridge held alongside another role still relaxes the band", () => {
    const r = computeBrianScore({
      prepMinutes: 5, roles: ["post_workout", "bridge"], tasteOverride: null,
      items: [item({ calories: 300 })],
    });
    expect(r.calories).toBe(10);
  });

  it("a role set without bridge uses the ordinary ladder", () => {
    const r = computeBrianScore({
      prepMinutes: 5, roles: ["post_workout", "calorie_booster"], tasteOverride: null,
      items: [item({ calories: 300 })],
    });
    expect(r.calories).toBe(4);
  });
});

describe("EoE", () => {
  const flagged = (ok: boolean) =>
    item({ smallPiecesOk: ok, concepts: [{ rating: "like", requiresSmallPieces: true, prepIntensive: false }] });
  it("−5 per unaddressed small-pieces item, floor 0", () => {
    expect(computeBrianScore({ prepMinutes: 5, roles: [], tasteOverride: null, items: [flagged(false)] }).eoe).toBe(10);
    expect(
      computeBrianScore({
        prepMinutes: 5, roles: [], tasteOverride: null,
        items: [flagged(false), flagged(false), flagged(false), flagged(false)],
      }).eoe,
    ).toBe(0);
  });
  it("small_pieces_ok waives the penalty", () => {
    expect(computeBrianScore({ prepMinutes: 5, roles: [], tasteOverride: null, items: [flagged(true)] }).eoe).toBe(15);
  });
});

describe("flags, approval, renormalization", () => {
  it("containsNever disqualifies Approved regardless of score", () => {
    const r = computeBrianScore({
      prepMinutes: 2, roles: [], tasteOverride: "love",
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
      prepMinutes: 5, roles: [], tasteOverride: "love",
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
      prepMinutes: 3, roles: [], tasteOverride: null,
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
      prepMinutes: 2, roles: ["bridge"], tasteOverride: null,
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
      roles: [],
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
      roles: [],
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
      roles: [],
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
      roles: [],
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

  it("a maximal meal scores each component at its COMPONENT_MAX", () => {
    // Pins the DECLARATION to the BEHAVIOR. Only COMPONENT_MAX.eoe is wired
    // into mealScore.ts; taste/convenience/protein/calories maxima are still
    // inline literals in their band ladders, so COMPONENT_MAX otherwise runs
    // parallel to the real logic. The sum-to-RAW_MAX test above cannot catch
    // that drift — retune the convenience ladder top from 25 to 22 and the
    // sum is still 95, yet Task 11's breakdown bar renders "22/25".
    const r = computeBrianScore({
      prepMinutes: 0,
      roles: [],
      tasteOverride: null,
      items: [
        item({
          calories: 600,
          protein: 50,
          servings: 1,
          smallPiecesOk: true,
          concepts: [{ rating: "love", requiresSmallPieces: false, prepIntensive: false }],
        }),
      ],
    });
    expect(r.taste).toBe(COMPONENT_MAX.taste);
    expect(r.convenience).toBe(COMPONENT_MAX.convenience);
    expect(r.protein).toBe(COMPONENT_MAX.protein);
    expect(r.eoe).toBe(COMPONENT_MAX.eoe);
    expect(r.calories).toBe(COMPONENT_MAX.calories);
    expect(r.raw).toBe(RAW_MAX);
    expect(r.score).toBe(100);
  });
});

describe("score is derived from the rounded raw, not the exact sum", () => {
  it("raw 89.8 renormalizes to 95 (core band), not 94", () => {
    // The one behavior spec §6's literal `Math.round(raw × 100 / 95)` and the
    // implementation disagree on. Components sum to exactly 89.76, which
    // rounds to raw 89.8:
    //   implementation  round(89.8 × 100 / 95) = round(94.5263) = 95  ← core
    //   literal formula round(89.76 × 100 / 95) = round(94.4842) = 94  ← mid
    // The implementation is deliberate: Task 11 prints "{raw}/95 renormalized
    // to {score}/100" and 89.8 × 100 / 95 really is 94.5 → 95, so showing 94
    // beside 89.8 would read as an arithmetic error. This lands exactly on
    // the SCORE_BAND_CORE_MIN edge, so the chip color turns on it too.
    // (The pre-existing raw 69.7 / score 73 assertion yields 73 under BOTH
    // formulas, so it does not pin this.)
    const love = { rating: "love" as const, requiresSmallPieces: false, prepIntensive: false };
    const like = { rating: "like" as const, requiresSmallPieces: false, prepIntensive: false };
    const r = computeBrianScore({
      prepMinutes: 5, // convenience 20
      roles: [],
      tasteOverride: null,
      items: [
        item({ calories: 970, protein: 40, servings: 1, concepts: [love] }),
        item({ calories: 30, protein: 0, servings: 1, concepts: [like] }),
      ],
    });
    // taste = (970×30 + 30×22) / 1000 = 29.76
    expect(r.taste).toBe(29.76);
    expect(r.convenience).toBe(20);
    expect(r.protein).toBe(15); // 40 g
    expect(r.eoe).toBe(15);
    expect(r.calories).toBe(10); // 1000 cal
    // exact component sum is 89.76; raw is that rounded to 1dp
    expect(r.raw).toBe(89.8);
    expect(r.score).toBe(95);
    expect(r.score).toBeGreaterThanOrEqual(SCORE_BAND_CORE_MIN);
  });
});

describe("scoreBand", () => {
  // Spec §6's band boundaries are policy. The decision lives here rather than
  // in the chip's style function, which pulls in react-native and so can never
  // be imported under this suite's `testEnvironment: node` scope.
  it("puts SCORE_BAND_CORE_MIN in the core band", () => {
    expect(scoreBand(SCORE_BAND_CORE_MIN)).toBe("core");
    expect(scoreBand(95)).toBe("core");
    expect(scoreBand(100)).toBe("core");
  });

  it("puts one below SCORE_BAND_CORE_MIN in the mid band", () => {
    expect(scoreBand(SCORE_BAND_CORE_MIN - 1)).toBe("mid");
    expect(scoreBand(84)).toBe("mid");
  });

  it("puts SCORE_BAND_MID_MIN in the mid band", () => {
    expect(scoreBand(SCORE_BAND_MID_MIN)).toBe("mid");
    expect(scoreBand(71)).toBe("mid");
  });

  it("puts one below SCORE_BAND_MID_MIN in the low band", () => {
    expect(scoreBand(SCORE_BAND_MID_MIN - 1)).toBe("low");
    expect(scoreBand(69)).toBe("low");
    expect(scoreBand(0)).toBe("low");
  });

  it("separates the real library instead of lumping it into one band", () => {
    // A8's whole point. These are the scores actually in the library: before
    // the recalibration only the two 95s were green and everything else —
    // including three Brian Approved meals — wore the same amber chip.
    const observed = [95, 95, 93, 93, 88, 87, 80, 77, 77, 77];
    const bands = observed.map(scoreBand);
    expect(bands.filter((b) => b === "core")).toHaveLength(6);
    expect(bands.filter((b) => b === "mid")).toHaveLength(4);
    expect(bands).not.toContain("low");
  });
});

// C2. The calorie ladder is calibrated for meals you ASSEMBLE, where stopping
// at 440 kcal was a choice. A delivered meal's portion is not a choice, so the
// same number means "a whole breakfast" rather than "70% of a meal" — and the
// old ladder disqualified every prepared breakfast in the library for its size.
describe("complete portions", () => {
  const meal = (calories: number, completePortion: boolean, over = {}) =>
    computeBrianScore({
      prepMinutes: 0,
      roles: [],
      tasteOverride: "like",
      completePortion,
      items: [item({ calories, protein: 35, concepts: [] })],
      ...over,
    });

  it("gives a 440-kcal delivered meal full calorie points", () => {
    expect(meal(440, true).calories).toBe(COMPONENT_MAX.calories);
  });

  it("still docks the same 440 kcal when you assembled it yourself", () => {
    expect(meal(440, false).calories).toBe(7);
  });

  it("holds the line at the new band edge", () => {
    expect(meal(400, true).calories).toBe(COMPONENT_MAX.calories);
    expect(meal(399, true).calories).toBe(7);
  });

  it("does not excuse a genuinely small portion", () => {
    // Someone else choosing the size does not make a 250-kcal cup a meal.
    expect(meal(250, true).calories).toBe(4);
    expect(meal(150, true).calories).toBe(2);
  });

  it("shifts the whole ladder, leaving no cliff at the top band", () => {
    // Moving only the 10-point line would strand the 7 above it and drop a
    // 399-kcal delivered meal from 10 straight to 4.
    expect([440, 399, 250, 150].map((c) => meal(c, true).calories))
      .toEqual([10, 7, 4, 2]);
    expect([540, 440, 350, 250].map((c) => meal(c, false).calories))
      .toEqual([10, 7, 4, 2]);
  });

  it("lets a delivered meal earn Brian Approved on size", () => {
    // 440 kcal, 35g protein, zero prep, liked, no EoE penalty: every other
    // clause passes, so the calorie bar is the only thing under test.
    expect(meal(440, true).approved).toBe(true);
    expect(meal(440, false).approved).toBe(false);
  });

  it("changes nothing for a bridge, which has its own band", () => {
    const asBridge = (completePortion: boolean) =>
      computeBrianScore({
        prepMinutes: 0,
        roles: ["bridge"],
        tasteOverride: "like",
        completePortion,
        items: [item({ calories: 300, protein: 35, concepts: [] })],
      });
    expect(asBridge(true).calories).toBe(asBridge(false).calories);
  });

  it("defaults to the assembled ladder when the flag is absent", () => {
    const r = computeBrianScore({
      prepMinutes: 0,
      roles: [],
      tasteOverride: "like",
      items: [item({ calories: 440, protein: 35, concepts: [] })],
    });
    expect(r.calories).toBe(7);
  });
});
