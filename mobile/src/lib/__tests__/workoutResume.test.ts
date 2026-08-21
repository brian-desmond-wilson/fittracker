import { assignInstancesToOccurrences } from "../workoutResume";

const row = (
  id: string,
  exerciseId: string,
  order: number | null,
): { id: string; exercise_id: string; exercise_order: number | null } => ({
  id,
  exercise_id: exerciseId,
  exercise_order: order,
});

describe("assignInstancesToOccurrences", () => {
  it("assigns each instance to its own template position", () => {
    const out = assignInstancesToOccurrences(
      ["squat", "bench", "row"],
      [row("i1", "squat", 1), row("i2", "bench", 2)],
    );
    expect(out.get(0)?.id).toBe("i1");
    expect(out.get(1)?.id).toBe("i2");
    expect(out.has(2)).toBe(false);
  });

  it("keeps two occurrences of the same exercise apart", () => {
    // The bug: keying by exercise id handed BOTH occurrences the first
    // instance, so logging the second overwrote the first's sets.
    const out = assignInstancesToOccurrences(
      ["stretch", "press", "stretch"],
      [row("i1", "stretch", 1), row("i2", "stretch", 3)],
    );
    expect(out.get(0)?.id).toBe("i1");
    expect(out.get(2)?.id).toBe("i2");
    expect(out.has(1)).toBe(false);
  });

  it("a lone instance of a repeated exercise claims only the position it was logged at", () => {
    const out = assignInstancesToOccurrences(
      ["stretch", "press", "stretch"],
      [row("i1", "stretch", 3)],
    );
    expect(out.has(0)).toBe(false);
    expect(out.get(2)?.id).toBe("i1");
  });

  it("falls back to the first free matching position when the stamped order disagrees", () => {
    // Drift guard: an instance whose recorded order points at a different
    // exercise (template edited, legacy row) still finds its movement.
    const out = assignInstancesToOccurrences(
      ["squat", "bench"],
      [row("i1", "bench", 1)],
    );
    expect(out.get(1)?.id).toBe("i1");
    expect(out.has(0)).toBe(false);
  });

  it("fills successive occurrences in row order when orders are missing", () => {
    const out = assignInstancesToOccurrences(
      ["stretch", "stretch"],
      [row("i1", "stretch", null), row("i2", "stretch", null)],
    );
    expect(out.get(0)?.id).toBe("i1");
    expect(out.get(1)?.id).toBe("i2");
  });

  it("never assigns two instances to one position", () => {
    const out = assignInstancesToOccurrences(
      ["squat"],
      [row("i1", "squat", 1), row("i2", "squat", 1)],
    );
    expect(out.get(0)?.id).toBe("i1");
    expect(out.size).toBe(1);
  });

  it("drops instances for exercises no longer in the template", () => {
    const out = assignInstancesToOccurrences(["squat"], [row("i1", "ghost", 1)]);
    expect(out.size).toBe(0);
  });
});
