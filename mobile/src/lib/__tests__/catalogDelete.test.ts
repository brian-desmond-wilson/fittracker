import { catalogDeleteMode, describeUsage } from "../catalogDelete";

const ME = "user-1";
const mode = (over: Partial<Parameters<typeof catalogDeleteMode>[0]> = {}) =>
  catalogDeleteMode({
    links: [{ was_created: true }],
    createdBy: ME,
    isOfficial: false,
    userId: ME,
    ...over,
  });

describe("catalogDeleteMode", () => {
  it("deletes an exercise this capture brought into being", () => {
    expect(mode()).toBe("delete");
  });

  // The whole point of the flag: an exercise that was already in the library
  // when the capture matched it is not the capture's to destroy.
  it("only unlinks an exercise that existed before the capture", () => {
    expect(mode({ links: [{ was_created: false }] })).toBe("unlink");
  });

  it("only unlinks when provenance never said either way", () => {
    expect(mode({ links: [{ was_created: null }] })).toBe("unlink");
    expect(mode({ links: [] })).toBe("unlink");
  });

  it("only unlinks somebody else's exercise", () => {
    expect(mode({ createdBy: "user-2" })).toBe("unlink");
    expect(mode({ createdBy: null })).toBe("unlink");
  });

  it("only unlinks an official library movement", () => {
    expect(mode({ isOfficial: true })).toBe("unlink");
  });

  it("deletes when one capture created it even if another merely linked it", () => {
    expect(mode({ links: [{ was_created: false }, { was_created: true }] })).toBe("delete");
  });
});

describe("describeUsage", () => {
  const counts = (over: Partial<Parameters<typeof describeUsage>[0]> = {}) => ({
    logged: 0, capturedWorkouts: 0, programWorkouts: 0, ...over,
  });

  it("says nothing when nothing stands on it", () => {
    expect(describeUsage(counts())).toBeNull();
  });

  it("names a single use, singular", () => {
    expect(describeUsage(counts({ capturedWorkouts: 1 })))
      .toBe("Still used in 1 captured workout.");
  });

  it("pluralizes", () => {
    expect(describeUsage(counts({ logged: 4 }))).toBe("Still used in 4 logged sets.");
  });

  it("joins two with and", () => {
    expect(describeUsage(counts({ logged: 2, capturedWorkouts: 1 })))
      .toBe("Still used in 2 logged sets and 1 captured workout.");
  });

  it("joins three with commas and a final and", () => {
    expect(describeUsage(counts({ logged: 1, capturedWorkouts: 2, programWorkouts: 3 })))
      .toBe("Still used in 1 logged set, 2 captured workouts and 3 program workouts.");
  });
});
