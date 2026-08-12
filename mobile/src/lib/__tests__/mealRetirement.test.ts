import { shouldRetire, RETIRE_AFTER_DAYS, type RetirementCandidate } from "../mealRetirement";

const meal = (over: Partial<RetirementCandidate> = {}): RetirementCandidate => ({
  isCompletePortion: true,
  totalQuantity: 0,
  daysSinceLastLogged: 30,
  daysSinceCreated: 40,
  ...over,
});

describe("shouldRetire", () => {
  it("retires a delivered dish long gone from the kitchen and the diary", () => {
    expect(shouldRetire(meal())).toBe(true);
  });

  it("never retires a meal you assembled yourself", () => {
    // You made it deliberately, and its ingredients being out of stock is an
    // ordinary Tuesday.
    expect(shouldRetire(meal({ isCompletePortion: false }))).toBe(false);
  });

  it("never retires something still in the kitchen", () => {
    // Zero, not low: a dish in the fridge is current whatever the dates say.
    expect(shouldRetire(meal({ totalQuantity: 1 }))).toBe(false);
  });

  it("keeps a dish eaten inside the window", () => {
    expect(shouldRetire(meal({ daysSinceLastLogged: RETIRE_AFTER_DAYS - 1 }))).toBe(false);
  });

  it("retires exactly at the boundary", () => {
    expect(shouldRetire(meal({ daysSinceLastLogged: RETIRE_AFTER_DAYS }))).toBe(true);
  });

  it("ages out a dish that was never eaten at all", () => {
    expect(shouldRetire(meal({ daysSinceLastLogged: null, daysSinceCreated: 40 }))).toBe(true);
  });

  it("gives a brand-new never-eaten delivery its full window first", () => {
    // The delivery that arrived this morning and has not been touched yet.
    expect(shouldRetire(meal({ daysSinceLastLogged: null, daysSinceCreated: 1 }))).toBe(false);
  });

  it("does not retire a young meal even if its last log looks old", () => {
    // Defensive: a nonsense date pair must not retire something created days ago.
    expect(shouldRetire(meal({ daysSinceLastLogged: 90, daysSinceCreated: 3 }))).toBe(false);
  });
});
