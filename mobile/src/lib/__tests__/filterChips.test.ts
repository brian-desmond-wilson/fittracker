import { toggleIn } from "../filterChips";

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
