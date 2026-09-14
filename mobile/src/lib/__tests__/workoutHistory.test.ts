import { summarizeWorkoutHistory, durationText, SESSION_ROWS } from "../workoutHistory";
import type { WorkoutSessionRow } from "../workoutHistory";

const row = (date: string, o: Partial<WorkoutSessionRow> = {}): WorkoutSessionRow =>
  ({ generatedSessionId: `g-${date}`, sessionId: `s-${date}`, sessionDate: date, durationSeconds: null, score: null, ...o });

describe("summarizeWorkoutHistory (spec §4.4, §5.5)", () => {
  it("null when never done", () => {
    expect(summarizeWorkoutHistory([])).toBeNull();
  });

  it("one session: count 1, first and last the same day, one row", () => {
    expect(summarizeWorkoutHistory([row("2026-09-01")])).toEqual({
      count: 1, lastDate: "2026-09-01", firstDate: "2026-09-01",
      rows: [row("2026-09-01")],
    });
  });

  it("five sessions in any order: newest first, four rows, count 5", () => {
    const s = summarizeWorkoutHistory([
      row("2026-09-03"), row("2026-08-01"), row("2026-09-10"), row("2026-08-20"), row("2026-09-05"),
    ]);
    expect(s?.count).toBe(5);
    expect(s?.lastDate).toBe("2026-09-10");
    expect(s?.firstDate).toBe("2026-08-01");
    expect(s?.rows.map((r) => r.sessionDate)).toEqual(["2026-09-10", "2026-09-05", "2026-09-03", "2026-08-20"]);
    expect(s?.rows.length).toBe(SESSION_ROWS);
  });

  it("does not mutate its input", () => {
    const input = [row("2026-09-01"), row("2026-09-02")];
    summarizeWorkoutHistory(input);
    expect(input.map((r) => r.sessionDate)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("exactly SESSION_ROWS sessions: all returned, count matches", () => {
    const s = summarizeWorkoutHistory([
      row("2026-09-01"), row("2026-09-02"), row("2026-09-03"), row("2026-09-04"),
    ]);
    expect(s?.count).toBe(4);
    expect(s?.rows.length).toBe(4);
    expect(s?.rows.map((r) => r.sessionDate)).toEqual(["2026-09-04", "2026-09-03", "2026-09-02", "2026-09-01"]);
  });

  it("a row with sessionId null passes through unchanged in rows", () => {
    const s = summarizeWorkoutHistory([row("2026-09-01", { sessionId: null })]);
    expect(s?.rows).toEqual([
      { generatedSessionId: "g-2026-09-01", sessionId: null, sessionDate: "2026-09-01", durationSeconds: null, score: null },
    ]);
  });
});

describe("durationText", () => {
  it("whole minutes, rounded; null when unknown or zero", () => {
    expect(durationText(1080)).toBe("18 min");
    expect(durationText(1100)).toBe("18 min");
    expect(durationText(59)).toBe("1 min");
    expect(durationText(20)).toBe("1 min");
    expect(durationText(0)).toBeNull();
    expect(durationText(null)).toBeNull();
  });
});
