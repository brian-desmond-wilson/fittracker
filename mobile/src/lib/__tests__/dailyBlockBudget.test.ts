import { blockEnvelopes, fitToEnvelope } from "../dailyBlockBudget";
import type { BlockEnvelope } from "../../types/dailyBlocks";

const env = (block: BlockEnvelope["block"], min: number, max: number): BlockEnvelope =>
  ({ block, minMinutes: min, maxMinutes: max });

describe("blockEnvelopes", () => {
  it("60 minutes: four blocks, no conditioning, main gets the bulk", () => {
    const envs = blockEnvelopes(60, false);
    expect(envs.map((e) => e.block)).toEqual(["warmup", "mobility", "main", "cooldown"]);
    const main = envs.find((e) => e.block === "main")!;
    expect(main.maxMinutes).toBe(45); // 60 - 3×5 min support minimum
    expect(main.minMinutes).toBe(30); // 60 - 3×10 support maximum
  });

  it("90 minutes: conditioning appears, in RAMP order", () => {
    const envs = blockEnvelopes(90, false);
    expect(envs.map((e) => e.block))
      .toEqual(["warmup", "mobility", "main", "conditioning", "cooldown"]);
    expect(envs.find((e) => e.block === "conditioning")).toEqual(env("conditioning", 10, 20));
  });

  it("30 minutes: support compresses to 3-5", () => {
    const envs = blockEnvelopes(30, false);
    expect(envs.find((e) => e.block === "warmup")).toEqual(env("warmup", 3, 5));
    expect(envs.find((e) => e.block === "main")!.maxMinutes).toBe(21); // 30 - 3×3
  });

  it("recovery day: mobility and cooldown only", () => {
    const envs = blockEnvelopes(60, true);
    expect(envs.map((e) => e.block)).toEqual(["mobility", "cooldown"]);
    const total = envs.reduce((s, e) => s + e.maxMinutes, 0);
    expect(total).toBeLessThanOrEqual(60);
  });
});

describe("fitToEnvelope", () => {
  const mainEnv = env("main", 30, 45);

  it("null estimate never fits", () => {
    expect(fitToEnvelope(null, null, mainEnv)).toBeNull();
  });

  it("an in-envelope workout passes through untouched", () => {
    expect(fitToEnvelope(40, "4", mainEnv)).toEqual({ minutes: 40, roundsNote: null });
  });

  it("too long with rounds: trims whole rounds", () => {
    // 60 min over 4 rounds = 15/round; 45-min cap → 3 rounds = 45.
    expect(fitToEnvelope(60, "4", mainEnv)).toEqual({ minutes: 45, roundsNote: "Do 3 of 4 rounds" });
  });

  it("too long, roundless, within 25%: capped with a note", () => {
    expect(fitToEnvelope(50, null, mainEnv)).toEqual({ minutes: 45, roundsNote: "Cap at 45 min" });
  });

  it("too long, roundless, past 25%: rejected", () => {
    expect(fitToEnvelope(90, null, mainEnv)).toBeNull();
  });

  it("too short with rounds: extends rounds, at most doubling", () => {
    // 12 min over 2 rounds = 6/round; 30-min floor → 5 rounds, capped at 4 → 24.
    expect(fitToEnvelope(12, "2", mainEnv)).toEqual({ minutes: 24, roundsNote: "Do 4 rounds (written: 2)" });
  });

  it("a range of rounds reads its top end", () => {
    expect(fitToEnvelope(60, "3-4", mainEnv)).toEqual({ minutes: 45, roundsNote: "Do 3 of 4 rounds" });
  });

  it("slightly under min without rounds: allowed as-is", () => {
    expect(fitToEnvelope(25, null, mainEnv)).toEqual({ minutes: 25, roundsNote: null });
  });

  it("prose after the count does not become the count", () => {
    // "3 rounds of 12 reps" is three rounds, not twelve.
    expect(fitToEnvelope(60, "3 rounds of 12 reps", mainEnv))
      .toEqual({ minutes: 40, roundsNote: "Do 2 of 3 rounds" });
  });

  it("a rounds field that is not a round count reads as roundless", () => {
    // "AMRAP 20 min" is a documented value of the column; there are no rounds
    // to trim, so it takes the cap path and here busts tolerance.
    expect(fitToEnvelope(60, "AMRAP 20 min", mainEnv)).toBeNull();
  });

  it("one round is nothing to trim", () => {
    expect(fitToEnvelope(50, "1", mainEnv)).toEqual({ minutes: 45, roundsNote: "Cap at 45 min" });
  });

  it("a shortfall too small to be worth a round is left alone", () => {
    // 29 in a 30-45 block is a slightly short block, not a gap: buying a
    // fourth round to close one minute would cost a third more work.
    expect(fitToEnvelope(29, "3", mainEnv)).toEqual({ minutes: 29, roundsNote: null });
  });

  it("a nonsense estimate never fits", () => {
    expect(fitToEnvelope(NaN, "4", mainEnv)).toBeNull();
    expect(fitToEnvelope(0, "4", mainEnv)).toBeNull();
  });
});

describe("broken budgets", () => {
  it("a non-finite or non-positive budget falls back to a short day", () => {
    for (const bad of [NaN, 0, -30, Infinity]) {
      for (const recovery of [false, true]) {
        expect(blockEnvelopes(bad, recovery)).toEqual(blockEnvelopes(20, recovery));
      }
    }
  });

  it("no envelope ever carries NaN", () => {
    for (const e of blockEnvelopes(NaN, false)) {
      expect(Number.isFinite(e.minMinutes)).toBe(true);
      expect(Number.isFinite(e.maxMinutes)).toBe(true);
    }
  });
});

describe("envelope invariants", () => {
  it("every block's floor sits at or below its ceiling, at any budget", () => {
    for (const minutes of [0, 20, 30, 44, 45, 60, 74, 75, 90, 120, 240]) {
      for (const recovery of [false, true]) {
        for (const e of blockEnvelopes(minutes, recovery)) {
          expect(e.minMinutes).toBeLessThanOrEqual(e.maxMinutes);
        }
      }
    }
  });
});
