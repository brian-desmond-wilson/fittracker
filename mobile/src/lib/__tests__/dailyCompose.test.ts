import { composeFallback, validateAiSession } from "../dailyCompose";
import type { CandidatePools } from "../dailyCandidates";
import type { RankedCandidate, SectionPlan } from "../../types/daily";

const rc = (id: string, section: RankedCandidate["section"]): RankedCandidate => ({
  exerciseId: id, name: id, skillLevel: "Beginner", goalTypes: [], muscles: [],
  equipmentTypes: [], isCapture: true, lastPerformedDaysAgo: null,
  section, soreDowngrade: false, regressedFromId: null,
});

const pools: CandidatePools = {
  warmup: [rc("w1", "warmup"), rc("w2", "warmup")],
  main: [rc("m1", "main"), rc("m2", "main"), rc("m3", "main"), rc("m4", "main"), rc("m5", "main")],
  cooldown: [rc("c1", "cooldown")],
};

const budget: SectionPlan[] = [
  { section: "warmup", slots: 1, targetSets: 1, targetReps: "10", restSeconds: null },
  { section: "main", slots: 3, targetSets: 3, targetReps: "8-12", restSeconds: 120 },
  { section: "accessory", slots: 1, targetSets: 3, targetReps: "12-15", restSeconds: 90 },
  { section: "bfr", slots: 1, targetSets: 3, targetReps: "15-20", restSeconds: 45 },
  { section: "cooldown", slots: 1, targetSets: 1, targetReps: "30-60s", restSeconds: null },
];

describe("composeFallback", () => {
  it("fills each section's slots from its pool in rank order, no reuse", () => {
    const items = composeFallback(pools, budget);
    const bySection = (s: string) => items.filter((i) => i.section === s).map((i) => i.exerciseId);
    expect(bySection("warmup")).toEqual(["w1"]);
    expect(bySection("main")).toEqual(["m1", "m2", "m3"]);
    // accessory and bfr draw from the remaining main pool
    expect(bySection("accessory")).toEqual(["m4"]);
    expect(bySection("bfr")).toEqual(["m5"]);
    expect(bySection("cooldown")).toEqual(["c1"]);
    const ids = items.map((i) => i.exerciseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("takes what exists when a pool runs short", () => {
    const thin: CandidatePools = { warmup: [], main: [rc("m1", "main")], cooldown: [] };
    const items = composeFallback(thin, budget);
    expect(items.map((i) => i.exerciseId)).toEqual(["m1"]);
  });

  it("numbers items sequentially and carries the budget's targets", () => {
    const items = composeFallback(pools, budget);
    expect(items.map((i) => i.itemOrder)).toEqual(items.map((_, idx) => idx));
    const main = items.find((i) => i.section === "main")!;
    expect(main.targetSets).toBe(3);
    expect(main.targetReps).toBe("8-12");
    expect(main.restSeconds).toBe(120);
  });
});

describe("validateAiSession", () => {
  const allowed = new Set(["m1", "m2", "w1", "c1"]);

  it("keeps items whose ids were offered, drops invented ones", () => {
    const out = validateAiSession(
      {
        items: [
          { exerciseId: "m1", section: "main", sets: 3, reps: "10", restSeconds: 90, reason: "fresh" },
          { exerciseId: "made-up", section: "main", sets: 3, reps: "10", restSeconds: 90, reason: "x" },
        ],
        servedWorkoutId: null,
      },
      allowed, new Set(),
    );
    expect(out!.items.map((i) => i.exerciseId)).toEqual(["m1"]);
  });

  it("drops items with bogus sections and clamps insane set counts", () => {
    const out = validateAiSession(
      {
        items: [
          { exerciseId: "m1", section: "swimming", sets: 3, reps: "10", restSeconds: 90, reason: "x" },
          { exerciseId: "m2", section: "main", sets: 45, reps: "10", restSeconds: 90, reason: "x" },
        ],
        servedWorkoutId: null,
      },
      allowed, new Set(),
    );
    expect(out!.items).toHaveLength(1);
    expect(out!.items[0].targetSets).toBe(6);
  });

  it("accepts a served workout id only if it was offered", () => {
    const ok = validateAiSession({ items: [], servedWorkoutId: "cw-1" }, allowed, new Set(["cw-1"]));
    expect(ok!.servedCapturedWorkoutId).toBe("cw-1");
    const bad = validateAiSession({ items: [], servedWorkoutId: "cw-9" }, allowed, new Set(["cw-1"]));
    expect(bad).toBeNull();
  });

  it("returns null for garbage or an empty answer", () => {
    expect(validateAiSession(null, allowed, new Set())).toBeNull();
    expect(validateAiSession({ items: [], servedWorkoutId: null }, allowed, new Set())).toBeNull();
  });
});
