import { capturedWorkoutToSessionItems, pickDaySession } from "../dailyAdopt";

describe("capturedWorkoutToSessionItems", () => {
  it("preserves the creator's order", () => {
    const items = capturedWorkoutToSessionItems([
      { exerciseId: "swing", sets: 3, reps: "20", restSeconds: 60 },
      { exerciseId: "halo", sets: 3, reps: "8", restSeconds: 60 },
      { exerciseId: "snatch", sets: 3, reps: "8R/8L", restSeconds: null },
    ]);
    expect(items.map((i) => i.exerciseId)).toEqual(["swing", "halo", "snatch"]);
    expect(items.map((i) => i.itemOrder)).toEqual([0, 1, 2]);
  });

  it("puts everything in main — we did not compose its sections", () => {
    const items = capturedWorkoutToSessionItems([
      { exerciseId: "a", sets: null, reps: null, restSeconds: null },
      { exerciseId: "b", sets: null, reps: null, restSeconds: null },
    ]);
    expect(items.every((i) => i.section === "main")).toBe(true);
  });

  it("carries NULL sets and rest across rather than defaulting them", () => {
    // A circuit prescribes rounds on the workout, not sets per exercise.
    // Inventing "3 sets" here would change the workout.
    const [item] = capturedWorkoutToSessionItems([
      { exerciseId: "a", sets: null, reps: "8", restSeconds: null },
    ]);
    expect(item.targetSets).toBeNull();
    expect(item.restSeconds).toBeNull();
  });

  it("keeps verbatim rep schemes intact", () => {
    const items = capturedWorkoutToSessionItems([
      { exerciseId: "a", sets: null, reps: "21-15-9", restSeconds: null },
      { exerciseId: "b", sets: null, reps: "AMRAP", restSeconds: null },
    ]);
    expect(items.map((i) => i.targetReps)).toEqual(["21-15-9", "AMRAP"]);
  });

  it("attributes no reason — nothing recommended these", () => {
    const [item] = capturedWorkoutToSessionItems([
      { exerciseId: "a", sets: 1, reps: "1", restSeconds: 1 },
    ]);
    expect(item.reason).toBeNull();
  });

  it("maps an empty workout to no items", () => {
    expect(capturedWorkoutToSessionItems([])).toEqual([]);
  });
});

describe("pickDaySession", () => {
  const row = (id: string, status: string, createdAt: string) => ({
    id,
    status,
    createdAt,
  });

  it("returns null for a day with nothing", () => {
    expect(pickDaySession([])).toBeNull();
  });

  it("prefers the pending session over a completed one", () => {
    const picked = pickDaySession([
      row("done", "completed", "2026-08-17T08:00:00Z"),
      row("live", "suggested", "2026-08-17T18:00:00Z"),
    ]);
    expect(picked?.id).toBe("live");
  });

  it("prefers pending even when the completed one is newer", () => {
    const picked = pickDaySession([
      row("live", "accepted", "2026-08-17T06:00:00Z"),
      row("done", "completed", "2026-08-17T20:00:00Z"),
    ]);
    expect(picked?.id).toBe("live");
  });

  it("falls back to the newest completed session", () => {
    const picked = pickDaySession([
      row("morning", "completed", "2026-08-17T08:00:00Z"),
      row("evening", "completed", "2026-08-17T19:00:00Z"),
    ]);
    expect(picked?.id).toBe("evening");
  });

  it("never shows a skipped session", () => {
    expect(pickDaySession([row("gone", "skipped", "2026-08-17T08:00:00Z")])).toBeNull();
    const picked = pickDaySession([
      row("gone", "skipped", "2026-08-17T18:00:00Z"),
      row("done", "completed", "2026-08-17T08:00:00Z"),
    ]);
    expect(picked?.id).toBe("done");
  });
});
