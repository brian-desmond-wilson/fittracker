import { summarizeWorkoutHistory, formatDuration, SESSION_ROWS } from "../workoutHistory";
import type { WorkoutSessionRow } from "../workoutHistory";

const row = (date: string, o: Partial<WorkoutSessionRow> = {}): WorkoutSessionRow =>
  ({ sessionId: `s-${date}`, sessionDate: date, durationSeconds: null, ...o });

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
});

describe("formatDuration", () => {
  it("whole minutes, rounded; null when unknown or zero", () => {
    expect(formatDuration(1080)).toBe("18 min");
    expect(formatDuration(1100)).toBe("18 min");
    expect(formatDuration(59)).toBe("1 min");
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(null)).toBeNull();
  });
});
