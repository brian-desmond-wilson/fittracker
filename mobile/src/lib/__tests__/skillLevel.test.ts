import { skillFill } from "../skillLevel";

describe("skillFill", () => {
  it("Beginner lights one segment, brand tone", () => {
    expect(skillFill("Beginner")).toEqual({ filled: 1, tone: "brand" });
  });
  it("Intermediate lights two, warning tone", () => {
    expect(skillFill("Intermediate")).toEqual({ filled: 2, tone: "warning" });
  });
  it("Advanced lights all three, danger tone", () => {
    expect(skillFill("Advanced")).toEqual({ filled: 3, tone: "danger" });
  });
  it("anything else lights nothing", () => {
    expect(skillFill(null)).toEqual({ filled: 0, tone: null });
    expect(skillFill(undefined)).toEqual({ filled: 0, tone: null });
    expect(skillFill("Expert")).toEqual({ filled: 0, tone: null });
  });
});
