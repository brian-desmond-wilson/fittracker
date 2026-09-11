import { scoredByLabel, scoringRowsOf } from "../scoredBy";

describe("scoredByLabel", () => {
  it("joins names by display order with a middle dot", () => {
    expect(scoredByLabel([{ name: "Load", displayOrder: 2 }, { name: "Reps", displayOrder: 1 }])).toBe("Reps · Load");
  });
  it("one name stands alone; none is empty", () => {
    expect(scoredByLabel([{ name: "Time", displayOrder: 1 }])).toBe("Time");
    expect(scoredByLabel([])).toBe("");
  });
});

describe("scoringRowsOf", () => {
  it("reads the junction embed, tolerating object or array shapes and nulls", () => {
    expect(scoringRowsOf([
      { scoring_type: { name: "Reps", display_order: 1 } },
      { scoring_type: [{ name: "Load", display_order: 2 }] },
      { scoring_type: null },
    ])).toEqual([{ name: "Reps", displayOrder: 1 }, { name: "Load", displayOrder: 2 }]);
    expect(scoringRowsOf(undefined)).toEqual([]);
  });
});
