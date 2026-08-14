import { getScoringTypeDescription, getWODCardDisplay } from "../wodDisplayHelpers";
import type { WODWithDetails } from "@/src/types/crossfit";

const wod = (over: Record<string, unknown> = {}): WODWithDetails =>
  ({
    id: "w1",
    name: "WOD",
    format: { name: "For Time" },
    rep_scheme: null,
    rep_scheme_type: null,
    time_cap_minutes: null,
    movements: [],
    ...over,
  }) as unknown as WODWithDetails;

const move = (name: string, over: Record<string, unknown> = {}) => ({
  id: name,
  exercise: { name, short_name: null as string | null },
  ...over,
});

describe("format line", () => {
  it("names the format on its own when there is nothing to add", () => {
    expect(getWODCardDisplay(wod()).formatLine).toBe("For Time");
  });

  it("adds the time cap", () => {
    expect(getWODCardDisplay(wod({ time_cap_minutes: 12 })).formatLine)
      .toBe("For Time • 12 min");
  });

  it("calls a descending scheme reps-for-time", () => {
    expect(
      getWODCardDisplay(wod({ rep_scheme_type: "descending", rep_scheme: "21-15-9", time_cap_minutes: 12 }))
        .formatLine,
    ).toBe("Reps For Time • 12 min");
  });

  it("counts the rounds out of a fixed-round scheme", () => {
    expect(
      getWODCardDisplay(wod({ rep_scheme_type: "fixed_rounds", rep_scheme: "5 rounds" })).formatLine,
    ).toBe("5 Rounds For Time");
  });

  it("says just 'Rounds' when the scheme hides the count", () => {
    expect(
      getWODCardDisplay(wod({ rep_scheme_type: "fixed_rounds", rep_scheme: "as written" })).formatLine,
    ).toBe("Rounds For Time");
  });

  it("reads the round count for a Rounds For Time WOD", () => {
    expect(
      getWODCardDisplay(wod({ format: { name: "Rounds For Time" }, rep_scheme: "5 rounds", time_cap_minutes: 20 }))
        .formatLine,
    ).toBe("5 Rounds For Time • 20 min");
  });

  it("leaves an AMRAP's format alone", () => {
    expect(getWODCardDisplay(wod({ format: { name: "AMRAP" }, time_cap_minutes: 20 })).formatLine)
      .toBe("AMRAP • 20 min");
  });
});

describe("structure line", () => {
  it("shows a descending scheme as reps", () => {
    expect(
      getWODCardDisplay(wod({ rep_scheme_type: "descending", rep_scheme: "21-18-15-12-9-6-3" }))
        .structureLine,
    ).toBe("21-18-15-12-9-6-3 reps");
  });

  it("counts the movements in a chipper", () => {
    expect(
      getWODCardDisplay(wod({
        rep_scheme_type: "chipper",
        rep_scheme: "chipper",
        movements: [move("A"), move("B")],
      })).structureLine,
    ).toBe("2 movements → Single pass");
  });

  it("shows a load scheme as written", () => {
    expect(
      getWODCardDisplay(wod({ rep_scheme_type: "descending_volume", rep_scheme: "10-8-6-4-2" }))
        .structureLine,
    ).toBe("10-8-6-4-2");
  });

  it("omits the line for fixed rounds, which the format line already covers", () => {
    expect(
      getWODCardDisplay(wod({ rep_scheme_type: "fixed_rounds", rep_scheme: "5 rounds" })).structureLine,
    ).toBeNull();
  });

  it("omits a custom scheme too long to fit", () => {
    expect(
      getWODCardDisplay(wod({ rep_scheme_type: "custom", rep_scheme: "x".repeat(41) })).structureLine,
    ).toBeNull();
    expect(
      getWODCardDisplay(wod({ rep_scheme_type: "custom", rep_scheme: "x".repeat(40) })).structureLine,
    ).toBe("x".repeat(40));
  });

  it("has nothing to say without a scheme", () => {
    expect(getWODCardDisplay(wod()).structureLine).toBeNull();
  });
});

describe("movement names", () => {
  const lineFor = (m: ReturnType<typeof move>) =>
    getWODCardDisplay(wod({ movements: [m] })).movementsLine;

  it("prefers the short name the gym actually uses", () => {
    expect(lineFor({ id: "x", exercise: { name: "Toes to Bar", short_name: "TTB" } })).toBe("TTB");
  });

  it("leaves a short name as it is", () => {
    expect(lineFor(move("Pull-up"))).toBe("Pull-up");
  });

  it("initialises a long two-word name", () => {
    expect(lineFor(move("Handstand Pushups Extended"))).toBe("HPE");
    expect(lineFor(move("Alternating Dumbbells"))).toBe("AD");
  });

  it("truncates a long single word rather than initialising it", () => {
    expect(lineFor(move("Supercalifragilistic"))).toBe("Supercalifra...");
  });

  it("says so rather than crashing when a movement has no exercise", () => {
    expect(lineFor({ id: "x", exercise: null } as never)).toBe("Unknown");
  });
});

describe("movement weights and distances", () => {
  const lineFor = (over: Record<string, unknown>, wodOver: Record<string, unknown> = {}) =>
    getWODCardDisplay(wod({ movements: [move("Handstand Pushups", over)], ...wodOver })).movementsLine;

  it("writes a split weight once", () => {
    expect(lineFor({ rx_weight_men_lbs: 20, rx_weight_women_lbs: 14 })).toBe("HP (20/14)");
  });

  it("collapses an equal split", () => {
    expect(lineFor({ rx_weight_men_lbs: 20, rx_weight_women_lbs: 20 })).toBe("HP (20)");
  });

  it("abbreviates the distance unit", () => {
    expect(lineFor({ rx_distance_value: 400, rx_distance_unit: "meters" })).toBe("HP 400 m");
    expect(lineFor({ rx_distance_value: 15, rx_distance_unit: "feet" })).toBe("HP 15 ft");
  });

  it("leaves an unknown unit alone rather than guessing", () => {
    expect(lineFor({ rx_distance_value: 3, rx_distance_unit: "laps" })).toBe("HP 3 laps");
  });

  it("reads the level it was asked for", () => {
    const w = wod({
      movements: [move("Handstand Pushups", { rx_weight_men_lbs: 20, l1_weight_men_lbs: 10 })],
    });
    expect(getWODCardDisplay(w, "Rx").movementsLine).toBe("HP (20)");
    expect(getWODCardDisplay(w, "L1").movementsLine).toBe("HP (10)");
  });

  it("prefixes reps for a fixed-round WOD but not a descending one", () => {
    expect(lineFor({ rx_reps: 5 }, { rep_scheme_type: "fixed_rounds" })).toBe("5 HP");
    expect(lineFor({ rx_reps: 5 }, { rep_scheme_type: "descending" })).toBe("HP");
  });
});

describe("movement summary", () => {
  it("joins up to three movements", () => {
    const w = wod({ movements: [move("Pull-up"), move("Push-up"), move("Squat")] });
    expect(getWODCardDisplay(w).movementsLine).toBe("Pull-up • Push-up • Squat");
  });

  it("counts the overflow past three", () => {
    const w = wod({ movements: [move("Pull-up"), move("Push-up"), move("Squat"), move("Burpee")] });
    expect(getWODCardDisplay(w).movementsLine).toBe("Pull-up • Push-up • Squat • +1 more");
  });

  it("reduces a long chipper to a count", () => {
    const w = wod({
      rep_scheme_type: "chipper",
      movements: [move("A"), move("B"), move("C"), move("D")],
    });
    expect(getWODCardDisplay(w).movementsLine).toBe("4 movements");
  });

  it("lists every movement separately, however many there are", () => {
    const w = wod({ movements: [move("Pull-up"), move("Push-up"), move("Squat"), move("Burpee")] });
    expect(getWODCardDisplay(w).movementsList).toEqual(["Pull-up", "Push-up", "Squat", "Burpee"]);
  });

  it("says a WOD has no movements rather than showing an empty line", () => {
    expect(getWODCardDisplay(wod()).movementsLine).toBe("No movements configured");
    expect(getWODCardDisplay(wod()).movementsList).toEqual(["No movements configured"]);
  });
});

describe("getScoringTypeDescription", () => {
  it("joins the score types a WOD records", () => {
    expect(
      getScoringTypeDescription(wod({ score_type_rounds: true, score_type_reps: true })),
    ).toContain("Rounds");
    expect(getScoringTypeDescription(wod({ score_type_time: true }))).toContain("Time");
  });
});
