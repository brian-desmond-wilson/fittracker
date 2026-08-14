import {
  formatTimeCap,
  formatWeight,
  getRepScheme,
  getScaledMovements,
} from "../wodDetailHelpers";
import type { WODWithDetails } from "@/src/types/crossfit";

/** A WOD carrying whatever the test needs, shaped loosely on purpose — these
 *  helpers take `any` movements and read a handful of fields off them. */
const wod = (over: Record<string, unknown> = {}): WODWithDetails =>
  ({
    id: "w1",
    name: "Fran",
    rep_scheme: "21-15-9",
    format: { name: "For Time" },
    movements: [],
    ...over,
  }) as unknown as WODWithDetails;

const movement = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  follows_wod_scheme: true,
  custom_rep_scheme: null,
  ...over,
});

describe("getRepScheme", () => {
  it("falls back to the WOD's scheme", () => {
    expect(getRepScheme(wod(), movement())).toBe("21-15-9");
  });

  it("uses a movement's own scheme when it opts out of the WOD's", () => {
    expect(
      getRepScheme(wod(), movement({ custom_rep_scheme: "10-10-10", follows_wod_scheme: false })),
    ).toBe("10-10-10");
  });

  it("ignores a custom scheme while the movement still follows the WOD", () => {
    expect(
      getRepScheme(wod(), movement({ custom_rep_scheme: "10-10-10", follows_wod_scheme: true })),
    ).toBe("21-15-9");
  });

  it("is empty rather than undefined with no WOD", () => {
    expect(getRepScheme(null, movement())).toBe("");
  });
});

describe("getScaledMovements", () => {
  const threeLevels = wod({
    movements: [
      movement({
        rx_reps: 21, l2_reps: 15, l1_reps: 9,
        rx_weight_men_lbs: 95, rx_weight_women_lbs: 65,
        l2_weight_men_lbs: 75, l2_weight_women_lbs: 55,
        l1_weight_men_lbs: 45, l1_weight_women_lbs: 35,
        rx_movement_variation: "Thruster",
        l2_movement_variation: "Front Squat",
        l1_movement_variation: "Air Squat",
      }),
    ],
  });

  it("reads the weights and reps of the level asked for", () => {
    expect(getScaledMovements(threeLevels, "Rx")[0]).toMatchObject({
      repsDisplay: "21 reps", weightDisplay: "95/65 lbs", variation: "Thruster",
    });
    expect(getScaledMovements(threeLevels, "L2")[0]).toMatchObject({
      repsDisplay: "15 reps", weightDisplay: "75/55 lbs", variation: "Front Squat",
    });
    expect(getScaledMovements(threeLevels, "L1")[0]).toMatchObject({
      repsDisplay: "9 reps", weightDisplay: "45/35 lbs", variation: "Air Squat",
    });
  });

  // Rx was the one level that appended "reps" to a dashed value, so the same
  // movement read "21-15-9 reps" at Rx and "21-15-9" at L2.
  it("treats a dashed value as a scheme at every level, Rx included", () => {
    const w = wod({
      movements: [movement({ rx_reps: "21-15-9", l2_reps: "15-12-9", l1_reps: "9-6-3" })],
    });
    expect(getScaledMovements(w, "Rx")[0].repsDisplay).toBe("21-15-9");
    expect(getScaledMovements(w, "L2")[0].repsDisplay).toBe("15-12-9");
    expect(getScaledMovements(w, "L1")[0].repsDisplay).toBe("9-6-3");
  });

  it("falls back to the WOD's rep scheme when a level has no reps of its own", () => {
    const w = wod({ movements: [movement({})] });
    expect(getScaledMovements(w, "Rx")[0].repsDisplay).toBe("21-15-9");
    expect(getScaledMovements(w, "L1")[0].repsDisplay).toBe("21-15-9");
  });

  it("marks a single-gender weight rather than implying both", () => {
    const menOnly = wod({ movements: [movement({ rx_weight_men_lbs: 95 })] });
    expect(getScaledMovements(menOnly, "Rx")[0].weightDisplay).toBe("95 lbs (M)");
    const womenOnly = wod({ movements: [movement({ rx_weight_women_lbs: 65 })] });
    expect(getScaledMovements(womenOnly, "Rx")[0].weightDisplay).toBe("65 lbs (W)");
  });

  it("leaves the weight blank for a bodyweight movement", () => {
    const w = wod({ movements: [movement({ rx_reps: 10 })] });
    expect(getScaledMovements(w, "Rx")[0].weightDisplay).toBe("");
  });

  it("says a distance per round for a distance movement in a for-time WOD", () => {
    const w = wod({
      rep_scheme: "5 rounds",
      format: { name: "Rounds For Time" },
      movements: [movement({ rx_distance_value: 400, rx_distance_unit: "m" })],
    });
    expect(getScaledMovements(w, "Rx")[0].repsDisplay).toContain("/ round @ 5 RFT");
  });

  it("keeps every field of the movement it was given", () => {
    const out = getScaledMovements(threeLevels, "Rx")[0];
    expect(out.id).toBe("m1");
  });

  it("has nothing to scale without a WOD", () => {
    expect(getScaledMovements(null, "Rx")).toEqual([]);
    expect(getScaledMovements(wod({ movements: null }), "Rx")).toEqual([]);
  });
});

describe("formatWeight", () => {
  it("writes a split weight once", () => {
    expect(formatWeight(95, 65)?.display).toBe("95/65 lb");
  });

  it("collapses an equal split to a single number", () => {
    expect(formatWeight(53, 53)?.display).toBe("53 lb");
  });

  it("says which gender a lone weight belongs to", () => {
    expect(formatWeight(95, null)?.display).toBe("95 lb (M)");
    expect(formatWeight(null, 65)?.display).toBe("65 lb (W)");
  });

  it("is null when there is no weight at all", () => {
    expect(formatWeight(null, null)).toBeNull();
    expect(formatWeight(undefined, undefined)).toBeNull();
  });
});

describe("formatTimeCap", () => {
  it("reads an AMRAP as its duration", () => {
    expect(formatTimeCap(20, "AMRAP")).toBe("20 min AMRAP");
  });

  it("reads any other capped WOD as a cap", () => {
    expect(formatTimeCap(12, "For Time")).toBe("12 min cap");
  });

  it("estimates an uncapped descending scheme", () => {
    expect(formatTimeCap(null, "For Time", "21-15-9")).toBe("15-25 min");
  });

  it("estimates an uncapped for-time WOD with no scheme to go on", () => {
    expect(formatTimeCap(null, "For Time")).toBe("10-20 min");
    expect(formatTimeCap(null, "Rounds For Time")).toBe("10-20 min");
  });

  it("admits it does not know for anything else", () => {
    expect(formatTimeCap(null, "EMOM")).toBe("Varies");
  });
});
