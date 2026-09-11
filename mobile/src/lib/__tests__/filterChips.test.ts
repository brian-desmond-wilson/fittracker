import { toggleIn, muscleChips } from "../filterChips";

describe("toggleIn", () => {
  it("adds a value that is absent, at the end", () => {
    expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
  });
  it("removes a value that is present", () => {
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
  });
  it("never mutates its input", () => {
    const list = ["a"];
    toggleIn(list, "b");
    toggleIn(list, "a");
    expect(list).toEqual(["a"]);
  });
});

describe("muscleChips", () => {
  it("collapses a full group and leaves the rest as single chips", () => {
    const chips = muscleChips("m", ["Core", "Obliques", "Lower Back", "Chest"]);
    expect(chips.map((c) => c.label)).toEqual(["Core group", "Chest"]);
    expect(chips[0]).toEqual({ axis: "m", label: "Core group", values: ["Core", "Obliques", "Lower Back"] });
  });
  it("never collapses a one-region group", () => {
    expect(muscleChips("m", ["Full Body"]).map((c) => c.label)).toEqual(["Full Body"]);
  });
  it("is empty for no selection", () => {
    expect(muscleChips("m", [])).toEqual([]);
  });
  it("emits one chip for a repeated selection", () => {
    expect(muscleChips("m", ["Chest", "Chest"]).map((c) => c.label)).toEqual(["Chest"]);
  });
});
