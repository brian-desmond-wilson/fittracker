/**
 * The completion reads against a scripted mock client (the frontDoor.test.ts
 * harness pattern): what the query asks for, and how the rows become the
 * card labels and the history block's rows. The arithmetic itself is pinned
 * in lib/__tests__/workoutCompletion.test.ts.
 */
import { fetchCompletedSessions, fetchWorkoutCompletions } from "../workoutCompletions";
import { fetchWorkoutHistory } from "../workoutHistory";
import { supabase } from "../../supabase";
import { fetchWorkoutScores } from "../sessionScores";

// ../supabase transitively imports expo-secure-store / react-native, which the
// pure-TS jest environment cannot load — replace it with a scripted stub.
jest.mock("../../supabase", () => ({ supabase: { from: jest.fn() } }));
jest.mock("../sessionScores", () => ({ fetchWorkoutScores: jest.fn() }));

type Result = { data: unknown; error: unknown };

/** Chainable, thenable stand-in for a PostgREST query builder. */
class FakeQuery implements PromiseLike<Result> {
  calls: { method: string; args: unknown[] }[] = [];
  constructor(public table: string, private result: Result) {}
  private chain(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }
  select(...a: unknown[]) { return this.chain("select", a); }
  eq(...a: unknown[]) { return this.chain("eq", a); }
  in(...a: unknown[]) { return this.chain("in", a); }
  not(...a: unknown[]) { return this.chain("not", a); }
  order(...a: unknown[]) { return this.chain("order", a); }
  then<T1, T2>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
  argsOf(method: string): unknown[][] {
    return this.calls.filter((c) => c.method === method).map((c) => c.args);
  }
}

const fromMock = supabase.from as jest.Mock;
const scoresMock = fetchWorkoutScores as jest.Mock;
let issued: FakeQuery[];

/** Queue the results the next from() calls will resolve to, in order. */
function script(steps: { table: string; data?: unknown; error?: unknown }[]) {
  issued = [];
  const queue = [...steps];
  fromMock.mockImplementation((table: string) => {
    const step = queue.shift();
    if (!step) throw new Error(`unscripted from('${table}')`);
    if (step.table !== table) throw new Error(`expected from('${step.table}'), got from('${table}')`);
    const q = new FakeQuery(table, { data: step.data ?? null, error: step.error ?? null });
    issued.push(q);
    return q;
  });
}

const USER = "user-1";

/** A generated_sessions row as PostgREST returns it with blocks embedded. */
const gen = (
  id: string,
  session_date: string,
  o: {
    served?: string | null;
    instance?: string | null;
    blocks?: { captured_workout_id: string | null; dismissed?: boolean }[];
  } = {},
) => ({
  id,
  session_date,
  workout_instance_id: o.instance ?? null,
  served_captured_workout_id: o.served ?? null,
  blocks: (o.blocks ?? []).map((b) => ({ captured_workout_id: b.captured_workout_id, dismissed: b.dismissed ?? false })),
});

let consoleError: jest.SpyInstance;
beforeEach(() => {
  fromMock.mockReset();
  scoresMock.mockReset();
  scoresMock.mockResolvedValue(new Map());
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe("fetchCompletedSessions", () => {
  it("asks only for the reader's completed sessions, blocks embedded", async () => {
    script([{ table: "generated_sessions", data: [] }]);
    await fetchCompletedSessions(USER);
    const q = issued[0];
    expect(q.argsOf("eq")).toEqual([["user_id", USER], ["status", "completed"]]);
    const select = String(q.argsOf("select")[0][0]);
    expect(select).toContain("served_captured_workout_id");
    expect(select).toContain("blocks:generated_session_blocks(captured_workout_id, dismissed)");
  });

  it("maps rows, defaulting missing embeds and flags", async () => {
    script([{
      table: "generated_sessions",
      data: [
        gen("g1", "2026-08-01", { served: "w1", instance: "i1" }),
        { id: "g2", session_date: "2026-08-02", blocks: [{ captured_workout_id: "w2" }] },
      ],
    }]);
    expect(await fetchCompletedSessions(USER)).toEqual([
      { id: "g1", sessionDate: "2026-08-01", workoutInstanceId: "i1", servedWorkoutId: "w1", blocks: [] },
      {
        id: "g2", sessionDate: "2026-08-02", workoutInstanceId: null, servedWorkoutId: null,
        blocks: [{ capturedWorkoutId: "w2", dismissed: false }],
      },
    ]);
  });

  it("is null on a failed read", async () => {
    script([{ table: "generated_sessions", error: { message: "boom" } }]);
    expect(await fetchCompletedSessions(USER)).toBeNull();
  });
});

describe("fetchWorkoutCompletions", () => {
  it("counts a workout done as one block of a composed day", async () => {
    script([{
      table: "generated_sessions",
      data: [gen("g1", "2026-08-01", { blocks: [{ captured_workout_id: null }, { captured_workout_id: "w1" }] })],
    }]);
    expect(await fetchWorkoutCompletions(USER)).toEqual({ w1: { count: 1, lastCompleted: "2026-08-01" } });
  });

  it("counts served whole + block in the same session once", async () => {
    script([{
      table: "generated_sessions",
      data: [gen("g1", "2026-08-01", { served: "w1", blocks: [{ captured_workout_id: "w1" }] })],
    }]);
    expect(await fetchWorkoutCompletions(USER)).toEqual({ w1: { count: 1, lastCompleted: "2026-08-01" } });
  });

  it("lastCompleted is the latest date across served-whole and block days", async () => {
    script([{
      table: "generated_sessions",
      data: [
        gen("g1", "2026-08-20", { served: "w1" }),
        gen("g2", "2026-08-25", { blocks: [{ captured_workout_id: "w1" }] }),
        gen("g3", "2026-08-10", { blocks: [{ captured_workout_id: "w1" }] }),
      ],
    }]);
    expect(await fetchWorkoutCompletions(USER)).toEqual({ w1: { count: 3, lastCompleted: "2026-08-25" } });
  });

  it("does not count a dismissed block", async () => {
    script([{
      table: "generated_sessions",
      data: [gen("g1", "2026-08-01", { blocks: [{ captured_workout_id: "w1", dismissed: true }] })],
    }]);
    expect(await fetchWorkoutCompletions(USER)).toEqual({});
  });

  it("reads only completed sessions, so a suggested or skipped day's blocks never count", async () => {
    script([{ table: "generated_sessions", data: [] }]);
    await fetchWorkoutCompletions(USER);
    expect(issued[0].argsOf("eq")).toContainEqual(["status", "completed"]);
  });

  it("is an empty map on a failed read", async () => {
    script([{ table: "generated_sessions", error: { message: "boom" } }]);
    expect(await fetchWorkoutCompletions(USER)).toEqual({});
  });
});

describe("fetchWorkoutHistory", () => {
  it("lists block-level days alongside served-whole days, one row per session", async () => {
    script([
      {
        table: "generated_sessions",
        data: [
          gen("g1", "2026-08-01", { served: "w1", instance: "i1" }),
          gen("g2", "2026-08-02", { blocks: [{ captured_workout_id: "w1" }], instance: "i2" }),
          // Served whole AND listed as a block: one row.
          gen("g3", "2026-08-03", { served: "w1", blocks: [{ captured_workout_id: "w1" }], instance: "i3" }),
          // Another workout's day, and a dismissed block of this one: neither.
          gen("g4", "2026-08-04", { blocks: [{ captured_workout_id: "w2" }], instance: "i4" }),
          gen("g5", "2026-08-05", { blocks: [{ captured_workout_id: "w1", dismissed: true }], instance: "i5" }),
        ],
      },
      {
        table: "workout_sessions",
        data: [
          { id: "s1", workout_instance_id: "i1", duration_seconds: 600, started_at: null, ended_at: null },
          { id: "s2", workout_instance_id: "i2", duration_seconds: 0, started_at: "2026-08-02T10:00:00Z", ended_at: "2026-08-02T10:20:00Z" },
        ],
      },
    ]);
    scoresMock.mockResolvedValue(new Map([["g2", { kind: "time", seconds: 300 }]]));

    const rows = await fetchWorkoutHistory(USER, "w1");
    expect(rows).toEqual([
      { generatedSessionId: "g1", sessionId: "s1", sessionDate: "2026-08-01", durationSeconds: 600, score: null },
      { generatedSessionId: "g2", sessionId: "s2", sessionDate: "2026-08-02", durationSeconds: 1200, score: { kind: "time", seconds: 300 } },
      { generatedSessionId: "g3", sessionId: null, sessionDate: "2026-08-03", durationSeconds: null, score: null },
    ]);
    // Only the matching sessions' instances are looked up.
    expect(issued[1].argsOf("in")).toEqual([["workout_instance_id", ["i1", "i2", "i3"]]]);
    expect(issued[0].argsOf("eq")).toContainEqual(["status", "completed"]);
  });

  it("is empty when the workout was never done, without a sessions read", async () => {
    script([{ table: "generated_sessions", data: [gen("g1", "2026-08-01", { blocks: [{ captured_workout_id: "w2" }] })] }]);
    expect(await fetchWorkoutHistory(USER, "w1")).toEqual([]);
    expect(issued).toHaveLength(1);
  });

  it("is empty on a failed read", async () => {
    script([{ table: "generated_sessions", error: { message: "boom" } }]);
    expect(await fetchWorkoutHistory(USER, "w1")).toEqual([]);
  });
});
