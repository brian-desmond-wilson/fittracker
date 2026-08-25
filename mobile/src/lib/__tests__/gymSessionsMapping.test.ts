// toSession is pure, but importing its module pulls in the real supabase
// client, which pulls in native modules jest can't transform. Stub it —
// nothing here calls the client.
jest.mock("../supabase", () => ({ supabase: {} }));

import { toSession } from "../supabase/gymSessions";

// PostgREST returns nested one-to-ones as objects OR single-element arrays
// depending on the join; the mapper's first() normalises both. Fixtures use
// the array form since it is the shape that has broken before.
const baseRow = {
  id: "s1",
  session_number: 1,
  session_date: "2026-08-24",
  started_at: "2026-08-24T16:24:00Z",
  ended_at: "2026-08-24T18:40:00Z",
  duration_seconds: 8160,
  workout_instance: [{ id: "wi1", program_workout: null, generated_session: null }],
  exercises: [],
};

describe("toSession estimates and naming sources", () => {
  it("takes estimated minutes from the program workout", () => {
    const row = {
      ...baseRow,
      workout_instance: [{
        id: "wi1",
        program_workout: [{ name: "Push Strength", estimated_duration_minutes: 120 }],
        generated_session: null,
      }],
    };
    const s = toSession(row, 1);
    expect(s.name).toBe("Push Strength");
    expect(s.estimatedMinutes).toBe(120);
    expect(s.mainBlockWorkoutName).toBeNull();
  });

  it("takes estimated minutes from a whole-served captured workout", () => {
    const row = {
      ...baseRow,
      workout_instance: [{
        id: "wi1",
        program_workout: null,
        generated_session: [{
          split_day: null,
          served_captured_workout_id: "cw1",
          captured: [{ id: "cw1", name: "KB Chest & Triceps", est_minutes: 40, source: null }],
          blocks: [],
        }],
      }],
    };
    const s = toSession(row, 1);
    expect(s.name).toBe("KB Chest & Triceps");
    expect(s.estimatedMinutes).toBe(40);
  });

  it("sums block minutes and finds the main block's workout name", () => {
    const row = {
      ...baseRow,
      workout_instance: [{
        id: "wi1",
        program_workout: null,
        generated_session: [{
          split_day: null,
          served_captured_workout_id: null,
          captured: null,
          blocks: [
            { block: "warmup", minutes: 10, captured: [{ name: "Band Circuit" }] },
            { block: "main", minutes: 45, captured: [{ name: "1000 Rep Challenge" }] },
            { block: "cooldown", minutes: 5, captured: null },
          ],
        }],
      }],
    };
    const s = toSession(row, 1);
    expect(s.name).toBeNull(); // block sessions have no template title
    expect(s.mainBlockWorkoutName).toBe("1000 Rep Challenge");
    expect(s.estimatedMinutes).toBe(60);
  });

  it("leaves everything null when nothing served the session", () => {
    const s = toSession(baseRow, 1);
    expect(s.name).toBeNull();
    expect(s.estimatedMinutes).toBeNull();
    expect(s.mainBlockWorkoutName).toBeNull();
  });
});
