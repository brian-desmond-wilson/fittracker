import { sortWorkouts } from "../workoutSort";
import type { CapturedWorkoutEntry } from "../../types/capture";
import type { CompletionMap } from "../workoutCompletion";

const w = (id: string, o: { name?: string; capturedAt?: string; minutes?: number | null } = {}): CapturedWorkoutEntry => ({
  workoutId: id,
  name: o.name ?? id,
  rounds: null, rawProtocol: null, description: null, notes: null,
  capturedAt: o.capturedAt ?? "2026-09-01T00:00:00Z",
  source: null, items: [],
  tags: { blockRoles: [], muscles: [], estMinutes: o.minutes === undefined ? null : o.minutes, intensity: null, skillLevel: null, format: null, scoreType: null, formatMinutes: null, classifiedAt: null },
  derivedEquipment: [], isBodyweight: false,
});
const ids = (list: CapturedWorkoutEntry[]) => list.map((x) => x.workoutId);
const today = "2026-09-10";

describe("sortWorkouts", () => {
  const a = w("a", { name: "Zeta", capturedAt: "2026-09-03T00:00:00Z", minutes: 30 });
  const b = w("b", { name: "alpha", capturedAt: "2026-09-01T00:00:00Z", minutes: null });
  const c = w("c", { name: "Mid", capturedAt: "2026-09-02T00:00:00Z", minutes: 10 });
  const list = [b, c, a];
  const done: CompletionMap = {
    a: { count: 1, lastCompleted: "2026-09-08" },
    c: { count: 5, lastCompleted: "2026-08-01" },
  };

  it("captured_desc / captured_asc", () => {
    expect(ids(sortWorkouts(list, "captured_desc", done, today))).toEqual(["a", "c", "b"]);
    expect(ids(sortWorkouts(list, "captured_asc", done, today))).toEqual(["b", "c", "a"]);
  });

  it("last_done: most recent first, never-done last (by newest capture)", () => {
    expect(ids(sortWorkouts(list, "last_done", done, today))).toEqual(["a", "c", "b"]);
  });

  it("stale: never-done first, then oldest completion", () => {
    expect(ids(sortWorkouts(list, "stale", done, today))).toEqual(["b", "c", "a"]);
  });

  it("most_done: count desc, never-done last", () => {
    expect(ids(sortWorkouts(list, "most_done", done, today))).toEqual(["c", "a", "b"]);
  });

  it("name: case-insensitive A–Z", () => {
    expect(ids(sortWorkouts(list, "name", done, today))).toEqual(["b", "c", "a"]);
  });

  it("shortest / longest: null minutes last either way", () => {
    expect(ids(sortWorkouts(list, "shortest", done, today))).toEqual(["c", "a", "b"]);
    expect(ids(sortWorkouts(list, "longest", done, today))).toEqual(["a", "c", "b"]);
  });

  it("orders by instant, not by string spelling", () => {
    const x = w("x", { capturedAt: "2026-09-01T10:00:00+00:00" });
    const y = w("y", { capturedAt: "2026-09-01T10:00:00.5Z" });
    expect(ids(sortWorkouts([x, y], "captured_desc", {}, today))).toEqual(["y", "x"]);
  });

  it("puts an unparseable capture stamp last in both directions", () => {
    const bad = w("bad", { capturedAt: "not a date" });
    expect(ids(sortWorkouts([bad, a, c], "captured_desc", {}, today))).toEqual(["a", "c", "bad"]);
    expect(ids(sortWorkouts([bad, a, c], "captured_asc", {}, today))).toEqual(["c", "a", "bad"]);
  });

  it("does not mutate the input", () => {
    const copy = [...list];
    sortWorkouts(list, "name", done, today);
    expect(list).toEqual(copy);
  });
});
