// mobile/src/lib/__tests__/gymSessionDelete.test.ts
import { gymSessionDeletePlan } from "../gymSessionDelete";
import type { DeleteOp } from "../gymSessionDelete";

const op = (table: string, column: string, id: string): DeleteOp => ({ table, column, id });

describe("gymSessionDeletePlan (spec §5.2)", () => {
  it("daily served-whole: SET-NULL tables (usage, adjustments), then generated_sessions, then workout_instances — in that order", () => {
    expect(gymSessionDeletePlan({ workoutInstanceId: "wi1", generatedSessionId: "gs1" })).toEqual([
      op("captured_workout_usage", "session_id", "gs1"),
      op("session_adjustments", "session_id", "gs1"),
      op("generated_sessions", "id", "gs1"),
      op("workout_instances", "id", "wi1"),
    ]);
  });

  it("program / manual (no generated session): just the instance", () => {
    expect(gymSessionDeletePlan({ workoutInstanceId: "wi9", generatedSessionId: null })).toEqual([
      op("workout_instances", "id", "wi9"),
    ]);
  });

  it("no instance id (shouldn't happen): empty plan, nothing to delete", () => {
    expect(gymSessionDeletePlan({ workoutInstanceId: null, generatedSessionId: null })).toEqual([]);
    expect(gymSessionDeletePlan({ workoutInstanceId: null, generatedSessionId: "gsX" })).toEqual([
      op("captured_workout_usage", "session_id", "gsX"),
      op("session_adjustments", "session_id", "gsX"),
      op("generated_sessions", "id", "gsX"),
    ]);
  });
});
