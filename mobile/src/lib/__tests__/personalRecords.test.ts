import { computeRecords, recordsBySession } from "../personalRecords";
import type { SetFact } from "../../types/records";

const fact = (over: Partial<SetFact> = {}): SetFact => ({
  exerciseId: "bench", exerciseName: "Bench Press", sessionId: "s1",
  date: "2026-01-01", weightLbs: 100, reps: 5, volumeLbs: 500, ...over,
});

describe("computeRecords", () => {
  // A first performance sets the baseline; it is not a record (user decision).
  it("does not call a first performance a record", () => {
    expect(computeRecords([fact()])).toEqual([]);
  });

  it("records a heavier top set against the previous best", () => {
    const records = computeRecords([
      fact({ date: "2026-01-01", weightLbs: 100, sessionId: "s1" }),
      fact({ date: "2026-01-08", weightLbs: 110, sessionId: "s2" }),
    ]);
    const weight = records.find((r) => r.kind === "weight");
    expect(weight).toMatchObject({ value: 110, previous: 100, date: "2026-01-08", sessionId: "s2" });
  });

  it("ignores a lighter session entirely", () => {
    const records = computeRecords([
      fact({ date: "2026-01-01", weightLbs: 110 }),
      fact({ date: "2026-01-08", weightLbs: 100, sessionId: "s2" }),
    ]);
    expect(records.filter((r) => r.sessionId === "s2")).toEqual([]);
  });

  it("catches an e1RM record even when the weight is not a record", () => {
    const records = computeRecords([
      fact({ date: "2026-01-01", weightLbs: 200, reps: 1 }),   // e1RM 200
      fact({ date: "2026-01-08", weightLbs: 180, reps: 5, sessionId: "s2" }), // e1RM 210
    ]);
    expect(records.find((r) => r.kind === "weight")).toBeUndefined();
    expect(records.find((r) => r.kind === "e1rm")).toMatchObject({ value: 210, previous: 200 });
  });

  it("records session volume per exercise", () => {
    const records = computeRecords([
      fact({ date: "2026-01-01", volumeLbs: 500 }),
      fact({ date: "2026-01-08", volumeLbs: 400, sessionId: "s2" }),
      fact({ date: "2026-01-08", volumeLbs: 400, sessionId: "s2" }),
    ]);
    expect(records.find((r) => r.kind === "sessionVolume")).toMatchObject({
      value: 800, previous: 500, sessionId: "s2",
    });
  });

  it("keeps exercises independent", () => {
    const records = computeRecords([
      fact({ exerciseId: "bench", weightLbs: 200, date: "2026-01-01" }),
      fact({ exerciseId: "row", exerciseName: "Row", weightLbs: 100, date: "2026-01-08", sessionId: "s2" }),
    ]);
    expect(records).toEqual([]); // row's first, bench unbeaten
  });

  it("ignores unloaded work — bodyweight sets have no weight record", () => {
    const records = computeRecords([
      fact({ weightLbs: 0, volumeLbs: 0, date: "2026-01-01" }),
      fact({ weightLbs: 0, volumeLbs: 0, date: "2026-01-08", sessionId: "s2" }),
    ]);
    expect(records.filter((r) => r.kind !== "sessionVolume")).toEqual([]);
  });
});

describe("recordsBySession", () => {
  it("counts records per session for the card badge", () => {
    const records = computeRecords([
      fact({ date: "2026-01-01", weightLbs: 100, volumeLbs: 500 }),
      fact({ date: "2026-01-08", weightLbs: 120, volumeLbs: 600, sessionId: "s2" }),
    ]);
    expect(recordsBySession(records).get("s2")).toBe(3); // weight, e1rm, sessionVolume
  });
});
