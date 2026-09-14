import { planAddToDay, dayStateOf, isPastDay, ADD_TO_DAY_LABEL } from "../addWorkoutToDayPlan";
import type { DayState, DayStateSource } from "../addWorkoutToDayPlan";

const state = (o: Partial<DayState>): DayState => ({ kind: "none", servesThisWorkout: false, ...o });

describe("planAddToDay (spec §4.10, one case per branch)", () => {
  it("no session: adopt, no confirm", () => {
    expect(planAddToDay(state({}), "Tomorrow")).toEqual({ action: "adopt", label: ADD_TO_DAY_LABEL, confirm: null, kind: "none" });
  });

  it("pending session: confirm replace, naming the day", () => {
    const p = planAddToDay(state({ kind: "pending" }), "Tuesday");
    expect(p.action).toBe("confirmReplace");
    expect(p.kind).toBe("pending");
    expect(p.confirm).toEqual({
      title: "Tuesday already has a session planned.",
      body: "It'll be set aside and this workout takes its place.",
      go: "Replace",
    });
  });

  it("in progress today: confirm replace with the partway wording", () => {
    const p = planAddToDay(state({ kind: "inProgress" }), "Today");
    expect(p.action).toBe("confirmReplace");
    expect(p.kind).toBe("inProgress");
    expect(p.confirm?.body).toBe("You're partway through it — what you've logged is kept, and this workout takes the rest of the day.");
  });

  it("completed: a second session, no confirm", () => {
    expect(planAddToDay(state({ kind: "completed" }), "Today")).toEqual({ action: "addSecond", label: ADD_TO_DAY_LABEL, confirm: null, kind: "completed" });
  });

  it("rested: confirm un-rest", () => {
    const p = planAddToDay(state({ kind: "rested" }), "Sunday");
    expect(p.action).toBe("confirmUnrest");
    expect(p.kind).toBe("rested");
    expect(p.confirm).toEqual({
      title: "Sunday is a rest day.",
      body: "Adding this makes it a training day.",
      go: "Add anyway",
    });
  });

  it("the day's pending or live session is already this workout: disabled, with the day named", () => {
    expect(planAddToDay(state({ kind: "pending", servesThisWorkout: true }), "Today"))
      .toEqual({ action: "disabled", label: "Today is already this workout", confirm: null, kind: "pending" });
    const inProgress = planAddToDay(state({ kind: "inProgress", servesThisWorkout: true }), "Today");
    expect(inProgress.action).toBe("disabled");
    expect(inProgress.kind).toBe("inProgress");
  });

  it("a completed session of this workout does not disable — you can do it again", () => {
    const p = planAddToDay(state({ kind: "completed", servesThisWorkout: true }), "Today");
    expect(p.action).toBe("addSecond");
    expect(p.kind).toBe("completed");
  });
});

describe("dayStateOf (status ladder, pure)", () => {
  it("no session: none", () => {
    expect(dayStateOf(null, "w1")).toEqual({ kind: "none", servesThisWorkout: false });
  });

  it("rested: rested, servesThisWorkout forced false even if ids match", () => {
    const session: DayStateSource = { status: "rested", workoutInstanceId: null, servedCapturedWorkoutId: "w1" };
    expect(dayStateOf(session, "w1")).toEqual({ kind: "rested", servesThisWorkout: false });
  });

  it("completed, serving this workout", () => {
    const session: DayStateSource = { status: "completed", workoutInstanceId: null, servedCapturedWorkoutId: "w1" };
    expect(dayStateOf(session, "w1")).toEqual({ kind: "completed", servesThisWorkout: true });
  });

  it("accepted with a live instance, serving a different workout: inProgress", () => {
    const session: DayStateSource = { status: "accepted", workoutInstanceId: "i1", servedCapturedWorkoutId: "w2" };
    expect(dayStateOf(session, "w1")).toEqual({ kind: "inProgress", servesThisWorkout: false });
  });

  it("accepted with no instance yet: pending", () => {
    const session: DayStateSource = { status: "accepted", workoutInstanceId: null, servedCapturedWorkoutId: "w1" };
    expect(dayStateOf(session, "w1")).toEqual({ kind: "pending", servesThisWorkout: true });
  });

  it("suggested: pending", () => {
    const session: DayStateSource = { status: "suggested", workoutInstanceId: null, servedCapturedWorkoutId: null };
    expect(dayStateOf(session, "w1")).toEqual({ kind: "pending", servesThisWorkout: false });
  });

  it("skipped: pending", () => {
    const session: DayStateSource = { status: "skipped", workoutInstanceId: null, servedCapturedWorkoutId: null };
    expect(dayStateOf(session, "w1")).toEqual({ kind: "pending", servesThisWorkout: false });
  });
});

describe("isPastDay", () => {
  it("a date before today is past", () => {
    expect(isPastDay("2026-09-12", "2026-09-13")).toBe(true);
  });

  it("today itself is not past", () => {
    expect(isPastDay("2026-09-13", "2026-09-13")).toBe(false);
  });

  it("a future date is not past", () => {
    expect(isPastDay("2026-09-14", "2026-09-13")).toBe(false);
  });
});
