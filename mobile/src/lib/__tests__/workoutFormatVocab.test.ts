import {
  ALL_FORMATS, FORMAT_LABELS, ALL_SCORES, SCORE_LABELS, IMPLIED_SCORE,
  formatHasMinutes, minutesLabelFor,
} from "../workoutFormatVocab";

describe("workoutFormatVocab", () => {
  it("labels every format and score exactly once", () => {
    expect(ALL_FORMATS).toHaveLength(8);
    expect(new Set(ALL_FORMATS).size).toBe(8);
    for (const f of ALL_FORMATS) expect(FORMAT_LABELS[f]).toBeTruthy();
    expect(ALL_SCORES).toHaveLength(10);
    for (const s of ALL_SCORES) expect(SCORE_LABELS[s]).toBeTruthy();
  });

  it("implies a score only where the spec says so", () => {
    expect(IMPLIED_SCORE.amrap).toBe("rounds_reps");
    expect(IMPLIED_SCORE.for_time).toBe("time");
    expect(IMPLIED_SCORE.chipper).toBe("time");
    expect(IMPLIED_SCORE.ladder).toBe("time");
    expect(IMPLIED_SCORE.sets_reps).toBeNull();
    expect(IMPLIED_SCORE.rounds).toBeNull();
    expect(IMPLIED_SCORE.emom).toBeNull();
    expect(IMPLIED_SCORE.intervals).toBeNull();
  });

  it("knows which formats carry minutes and what to call them", () => {
    expect(formatHasMinutes("amrap")).toBe(true);
    expect(formatHasMinutes("rounds")).toBe(false);
    expect(minutesLabelFor("amrap")).toBe("AMRAP minutes");
    expect(minutesLabelFor("emom")).toBe("EMOM minutes");
    expect(minutesLabelFor("for_time")).toBe("Time cap (minutes)");
    expect(minutesLabelFor("intervals")).toBe("Total minutes");
    expect(minutesLabelFor("ladder")).toBeNull();
    // Chipper diverges from the earlier list on purpose: it carries a cap.
    expect(formatHasMinutes("chipper")).toBe(true);
    expect(minutesLabelFor("chipper")).toBe("Time cap (minutes)");
    // The editor calls these with a draft whose format can be null.
    expect(formatHasMinutes(null)).toBe(false);
    expect(minutesLabelFor(null)).toBeNull();
  });
});
