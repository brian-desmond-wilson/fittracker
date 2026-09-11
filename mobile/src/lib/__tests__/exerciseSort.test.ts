import { sortExercises } from "../exerciseSort";
import type { CatalogEntry } from "../../types/capture";

const e = (id: string, name: string, capturedAt: string): CatalogEntry => ({
  exerciseId: id, name, imageUrl: null, skillLevel: null, equipmentTypes: [], muscles: [], goalTypes: [],
  sources: [{ sourceId: `s-${id}`, platform: "instagram", sourceUrl: "https://x", posterHandle: null, thumbnailUrl: null, capturedAt }],
});
const ids = (list: CatalogEntry[]) => list.map((x) => x.exerciseId);

describe("sortExercises", () => {
  const a = e("a", "Zeta", "2026-09-03T00:00:00Z");
  const b = e("b", "alpha", "2026-09-01T00:00:00Z");
  const c = e("c", "Mid", "2026-09-02T00:00:00.000+00:00");
  const list = [b, c, a];

  it("captured_desc / captured_asc compare instants, not strings", () => {
    expect(ids(sortExercises(list, "captured_desc"))).toEqual(["a", "c", "b"]);
    expect(ids(sortExercises(list, "captured_asc"))).toEqual(["b", "c", "a"]);
  });

  it("name: case-insensitive, ties newest first", () => {
    const tie1 = e("t1", "Swing", "2026-09-01T00:00:00Z");
    const tie2 = e("t2", "swing", "2026-09-05T00:00:00Z");
    expect(ids(sortExercises([a, b, c, tie1, tie2], "name"))).toEqual(["b", "c", "t2", "t1", "a"]);
  });

  it("an unparseable stamp sorts last both ways", () => {
    const bad = e("bad", "Bad", "not a date");
    expect(ids(sortExercises([bad, a, b], "captured_desc"))).toEqual(["a", "b", "bad"]);
    expect(ids(sortExercises([bad, a, b], "captured_asc"))).toEqual(["b", "a", "bad"]);
  });

  it("sorts a copy", () => {
    const input = [b, a];
    sortExercises(input, "captured_desc");
    expect(ids(input)).toEqual(["b", "a"]);
  });

  it("orders by the newest of several sources, whatever their order", () => {
    const multi: CatalogEntry = {
      ...e("m", "Multi", "2026-08-01T00:00:00Z"),
      sources: [
        { sourceId: "s-old", platform: "instagram", sourceUrl: "https://x", posterHandle: null, thumbnailUrl: null, capturedAt: "2026-08-01T00:00:00Z" },
        { sourceId: "s-new", platform: "instagram", sourceUrl: "https://y", posterHandle: null, thumbnailUrl: null, capturedAt: "2026-09-04T00:00:00Z" },
      ],
    };
    expect(ids(sortExercises([a, multi, b], "captured_desc"))).toEqual(["m", "a", "b"]);
  });
});
