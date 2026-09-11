import { planAddToToday, ADD_TO_TODAY_LABEL, IN_SESSION_LABEL } from "../addToTodayPlan";
import type { TodayState } from "../addToTodayPlan";

const state = (o: Partial<TodayState>): TodayState => ({ kind: "none", containsExercise: false, ...o });

describe("planAddToToday (spec §4.9, one case per branch)", () => {
  it("pending session: append", () => {
    expect(planAddToToday(state({ kind: "pending", sessionId: "s1" })))
      .toEqual({ action: "append", label: ADD_TO_TODAY_LABEL });
  });

  it("session in progress: append to the live list", () => {
    expect(planAddToToday(state({ kind: "inProgress", sessionId: "s1" })))
      .toEqual({ action: "appendLive", label: ADD_TO_TODAY_LABEL });
  });

  it("no session yet: create a user_pick session", () => {
    expect(planAddToToday(state({ kind: "none" })))
      .toEqual({ action: "create", label: ADD_TO_TODAY_LABEL });
  });

  it("today completed: a second session", () => {
    expect(planAddToToday(state({ kind: "completed", sessionId: "s1" })))
      .toEqual({ action: "appendSecond", label: ADD_TO_TODAY_LABEL });
  });

  it("today rested: confirm un-rest first", () => {
    expect(planAddToToday(state({ kind: "rested", sessionId: "s1" })))
      .toEqual({ action: "confirmUnrest", label: ADD_TO_TODAY_LABEL });
  });

  it("already in today's pending or live session: disabled", () => {
    expect(planAddToToday(state({ kind: "pending", sessionId: "s1", containsExercise: true })))
      .toEqual({ action: "disabled", label: IN_SESSION_LABEL });
    expect(planAddToToday(state({ kind: "inProgress", sessionId: "s1", containsExercise: true })))
      .toEqual({ action: "disabled", label: IN_SESSION_LABEL });
  });

  it("presence in a COMPLETED session does not disable — a second session is fine", () => {
    expect(planAddToToday(state({ kind: "completed", sessionId: "s1", containsExercise: true })).action)
      .toBe("appendSecond");
  });
});
