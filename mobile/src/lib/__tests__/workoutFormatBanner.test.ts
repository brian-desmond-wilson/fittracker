import { formatBanner, describeFormat } from "../workoutFormat";
import type { HeadlineShape } from "../workoutFormat";

const shape = (o: Partial<HeadlineShape>): HeadlineShape => ({ format: null, formatMinutes: null, scoreType: null, ...o });

describe("formatBanner (spec §5.2: the hero badge and the list band say the same thing)", () => {
  it("AMRAP with and without minutes", () => {
    expect(formatBanner(null, shape({ format: "amrap", formatMinutes: 15 })))
      .toEqual({ badge: "AMRAP · 15 MIN", gloss: "As many rounds as possible in 15 minutes" });
    expect(formatBanner(null, shape({ format: "amrap" })))
      .toEqual({ badge: "AMRAP", gloss: "As many rounds as possible" });
  });

  it("EMOM with and without minutes", () => {
    expect(formatBanner(null, shape({ format: "emom", formatMinutes: 10 })))
      .toEqual({ badge: "EMOM · 10 MIN", gloss: "Every minute on the minute for 10 minutes" });
    expect(formatBanner(null, shape({ format: "emom" })))
      .toEqual({ badge: "EMOM", gloss: "Every minute on the minute" });
  });

  it("for time, with rounds and with a cap", () => {
    expect(formatBanner("3", shape({ format: "for_time" })))
      .toEqual({ badge: "3 ROUNDS · FOR TIME", gloss: "Repeat the whole list 3 times, as fast as you can" });
    expect(formatBanner(null, shape({ format: "for_time", formatMinutes: 20 })))
      .toEqual({ badge: "FOR TIME", gloss: "As fast as you can, 20 minute cap" });
    expect(formatBanner(null, shape({ format: "for_time" })))
      .toEqual({ badge: "FOR TIME", gloss: "As fast as you can" });
  });

  it("rounds keeps the creator's text and pluralises 1", () => {
    expect(formatBanner("3-4", shape({ format: "rounds" })))
      .toEqual({ badge: "3-4 ROUNDS", gloss: "Repeat the whole list 3-4 times" });
    expect(formatBanner("1", shape({ format: "rounds" })))
      .toEqual({ badge: "1 ROUND", gloss: "Repeat the whole list 1 time" });
    expect(formatBanner(null, shape({ format: "rounds" })))
      .toEqual({ badge: "ROUNDS", gloss: "Repeat the whole list" });
  });

  it("intervals, chipper, ladder", () => {
    expect(formatBanner(null, shape({ format: "intervals", formatMinutes: 30 })))
      .toEqual({ badge: "INTERVALS · 30 MIN", gloss: "Work and rest on the clock" });
    expect(formatBanner(null, shape({ format: "intervals" })))
      .toEqual({ badge: "INTERVALS", gloss: "Work and rest on the clock" });
    expect(formatBanner(null, shape({ format: "chipper" })))
      .toEqual({ badge: "CHIPPER", gloss: "Work through the list once, top to bottom" });
    expect(formatBanner(null, shape({ format: "ladder" })))
      .toEqual({ badge: "LADDER", gloss: "Reps climb (or fall) each round" });
  });

  it("sets & reps, with and without a repeat", () => {
    expect(formatBanner("3", shape({ format: "sets_reps" })))
      .toEqual({ badge: "SETS & REPS · 3 ROUNDS", gloss: "Sets and reps, rest as needed; repeat the list 3 times" });
    expect(formatBanner(null, shape({ format: "sets_reps" })))
      .toEqual({ badge: "SETS & REPS", gloss: "Sets and reps, rest as needed" });
  });

  it("untagged: rounds alone still frame the list; nothing at all is null", () => {
    expect(formatBanner("4", shape({})))
      .toEqual({ badge: "4 ROUNDS", gloss: "Repeat the whole list 4 times" });
    expect(formatBanner(null, shape({}))).toBeNull();
  });

  it("zero minutes reads as unstated", () => {
    expect(formatBanner(null, shape({ format: "amrap", formatMinutes: 0 })))
      .toEqual({ badge: "AMRAP", gloss: "As many rounds as possible" });
  });

  it("for time with rounds and a cap keeps both", () => {
    expect(formatBanner("3", shape({ format: "for_time", formatMinutes: 20 })))
      .toEqual({ badge: "3 ROUNDS · FOR TIME", gloss: "Repeat the whole list 3 times, as fast as you can, 20 minute cap" });
  });

  it("chipper keeps its cap", () => {
    expect(formatBanner(null, shape({ format: "chipper", formatMinutes: 20 })))
      .toEqual({ badge: "CHIPPER · 20 MIN CAP", gloss: "Work through the list once, top to bottom, 20 minute cap" });
  });

  it("one minute is singular in the gloss", () => {
    expect(formatBanner(null, shape({ format: "amrap", formatMinutes: 1 })))
      .toEqual({ badge: "AMRAP · 1 MIN", gloss: "As many rounds as possible in 1 minute" });
  });

  it("sets & reps ignores minutes", () => {
    expect(formatBanner(null, shape({ format: "sets_reps", formatMinutes: 20 })))
      .toEqual({ badge: "SETS & REPS", gloss: "Sets and reps, rest as needed" });
  });

  it("the badge agrees with the card on pluralisation", () => {
    const s = shape({ format: "rounds" });
    expect(formatBanner("1", s)!.badge).toBe(describeFormat("1", s)!.toUpperCase());
  });
});
