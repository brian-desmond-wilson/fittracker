import { planAddToDay, ADD_TO_DAY_LABEL } from "../addWorkoutToDayPlan";
import type { DayState } from "../addWorkoutToDayPlan";

const state = (o: Partial<DayState>): DayState => ({ kind: "none", servesThisWorkout: false, ...o });

describe("planAddToDay (spec §4.10, one case per branch)", () => {
  it("no session: adopt, no confirm", () => {
    expect(planAddToDay(state({}), "Tomorrow")).toEqual({ action: "adopt", label: ADD_TO_DAY_LABEL, confirm: null });
  });

  it("pending session: confirm replace, naming the day", () => {
    const p = planAddToDay(state({ kind: "pending" }), "Tuesday");
    expect(p.action).toBe("confirmReplace");
    expect(p.confirm).toEqual({
      title: "Tuesday already has a session planned.",
      body: "It'll be set aside and this workout takes its place.",
      go: "Replace",
    });
  });

  it("in progress today: confirm replace with the partway wording", () => {
    const p = planAddToDay(state({ kind: "inProgress" }), "Today");
    expect(p.action).toBe("confirmReplace");
    expect(p.confirm?.body).toBe("You're partway through it — what you've logged is kept, and this workout takes the rest of the day.");
  });

  it("completed: a second session, no confirm", () => {
    expect(planAddToDay(state({ kind: "completed" }), "Today")).toEqual({ action: "addSecond", label: ADD_TO_DAY_LABEL, confirm: null });
  });

  it("rested: confirm un-rest", () => {
    const p = planAddToDay(state({ kind: "rested" }), "Sunday");
    expect(p.action).toBe("confirmUnrest");
    expect(p.confirm).toEqual({
      title: "Sunday is a rest day.",
      body: "Adding this makes it a training day.",
      go: "Add anyway",
    });
  });

  it("the day's pending or live session is already this workout: disabled, with the day named", () => {
    expect(planAddToDay(state({ kind: "pending", servesThisWorkout: true }), "Today"))
      .toEqual({ action: "disabled", label: "Today is already this workout", confirm: null });
    expect(planAddToDay(state({ kind: "inProgress", servesThisWorkout: true }), "Today").action).toBe("disabled");
  });

  it("a completed session of this workout does not disable — you can do it again", () => {
    expect(planAddToDay(state({ kind: "completed", servesThisWorkout: true }), "Today").action).toBe("addSecond");
  });
});
