import { collapseSiblings, SIBLING_LIMIT } from "../hierarchyCollapse";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

describe("collapseSiblings", () => {
  it("shows up to four siblings and counts the rest", () => {
    expect(SIBLING_LIMIT).toBe(4);
    expect(collapseSiblings(ids(10), false)).toEqual({ shown: ["s1", "s2", "s3", "s4"], hidden: 6 });
  });
  it("four or fewer never collapse", () => {
    expect(collapseSiblings(ids(4), false)).toEqual({ shown: ids(4), hidden: 0 });
    expect(collapseSiblings([], false)).toEqual({ shown: [], hidden: 0 });
  });
  it("expanded shows everything", () => {
    expect(collapseSiblings(ids(10), true)).toEqual({ shown: ids(10), hidden: 0 });
  });
});
