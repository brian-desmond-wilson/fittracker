import {
  normalizeEquipmentName,
  buildCandidatePools,
  resolveProgressions,
} from "../dailyCandidates";
import type { SessionCandidate } from "../../types/daily";

const cand = (overrides: Partial<SessionCandidate> = {}): SessionCandidate => ({
  exerciseId: "ex-1",
  name: "Dumbbell Bench Press",
  skillLevel: "Intermediate",
  goalTypes: ["Strength"],
  muscles: [{ name: "Chest", isPrimary: true }, { name: "Triceps", isPrimary: false }],
  equipmentTypes: ["Dumbbell", "Bench"],
  isCapture: true,
  lastPerformedDaysAgo: null,
  ...overrides,
});

const GYM = new Set(["Dumbbell", "Bench", "Bodyweight", "Floor", "Wall", "Bands", "Mat"]);

describe("normalizeEquipmentName", () => {
  it("passes Title Case through and maps the legacy snake_case dialect", () => {
    expect(normalizeEquipmentName("Dumbbell")).toBe("Dumbbell");
    expect(normalizeEquipmentName("barbell")).toBe("Barbell");
    expect(normalizeEquipmentName("wall_ball")).toBe("Med Ball");
    expect(normalizeEquipmentName("medicine_ball")).toBe("Med Ball");
    expect(normalizeEquipmentName("assault_bike")).toBe("Bike");
    expect(normalizeEquipmentName("ski_erg")).toBe("Ski");
    expect(normalizeEquipmentName("bodyweight")).toBe("Bodyweight");
  });
});

describe("buildCandidatePools", () => {
  it("keeps a push exercise on push day and drops it on legs day", () => {
    const push = buildCandidatePools([cand()], { splitDay: "push", gymEquipment: GYM, soreness: {} });
    const legs = buildCandidatePools([cand()], { splitDay: "legs", gymEquipment: GYM, soreness: {} });
    expect(push.main.map((c) => c.exerciseId)).toEqual(["ex-1"]);
    expect(legs.main).toHaveLength(0);
  });

  it("drops candidates whose equipment the gym lacks", () => {
    const pools = buildCandidatePools(
      [cand({ equipmentTypes: ["Barbell"] })],
      { splitDay: "push", gymEquipment: GYM, soreness: {} },
    );
    expect(pools.main).toHaveLength(0);
  });

  it("treats empty equipment as bodyweight (always available)", () => {
    const pools = buildCandidatePools(
      [cand({ equipmentTypes: [] })],
      { splitDay: "push", gymEquipment: new Set(["Floor"]), soreness: {} },
    );
    expect(pools.main).toHaveLength(1);
  });

  it("excludes primaries sore at 2+, downgrades at 1", () => {
    const soreOut = buildCandidatePools([cand()], {
      splitDay: "push", gymEquipment: GYM, soreness: { Chest: 2 },
    });
    expect(soreOut.main).toHaveLength(0);
    const soreDown = buildCandidatePools([cand()], {
      splitDay: "push", gymEquipment: GYM, soreness: { Chest: 1 },
    });
    expect(soreDown.main[0].soreDowngrade).toBe(true);
  });

  it("routes Mobility to warmup and Stretching/Cool-Down to cooldown, un-gated by split", () => {
    const pools = buildCandidatePools(
      [
        cand({ exerciseId: "w", goalTypes: ["Mobility"], muscles: [{ name: "Quads", isPrimary: true }] }),
        cand({ exerciseId: "c", goalTypes: ["Stretching"], muscles: [{ name: "Quads", isPrimary: true }] }),
      ],
      { splitDay: "push", gymEquipment: GYM, soreness: {} },
    );
    expect(pools.warmup.map((c) => c.exerciseId)).toEqual(["w"]);
    expect(pools.cooldown.map((c) => c.exerciseId)).toEqual(["c"]);
  });

  it("ranks captures first, then least-recently-performed, sore-downgrades last", () => {
    const pools = buildCandidatePools(
      [
        cand({ exerciseId: "stock-never", isCapture: false, lastPerformedDaysAgo: null }),
        cand({ exerciseId: "cap-recent", isCapture: true, lastPerformedDaysAgo: 1 }),
        cand({ exerciseId: "cap-stale", isCapture: true, lastPerformedDaysAgo: 9 }),
        cand({ exerciseId: "cap-never", isCapture: true, lastPerformedDaysAgo: null }),
      ],
      { splitDay: "push", gymEquipment: GYM, soreness: {} },
    );
    expect(pools.main.map((c) => c.exerciseId)).toEqual([
      "cap-never", "cap-stale", "cap-recent", "stock-never",
    ]);
  });

  it("Full Body counts for every split day", () => {
    const pools = buildCandidatePools(
      [cand({ muscles: [{ name: "Full Body", isPrimary: true }] })],
      { splitDay: "legs", gymEquipment: GYM, soreness: {} },
    );
    expect(pools.main).toHaveLength(1);
  });
});

describe("resolveProgressions", () => {
  it("regresses an Advanced movement the user hasn't earned, when a link exists", () => {
    const advanced = { ...cand({ exerciseId: "hsw", name: "Handstand Walk", skillLevel: "Advanced" as const }), section: "main" as const, soreDowngrade: false, regressedFromId: null };
    const wallWalk = cand({ exerciseId: "ww", name: "Wall Walk", skillLevel: "Intermediate" });
    const out = resolveProgressions([advanced], {
      skillState: {},
      regressions: new Map([["hsw", "ww"]]),
      byExerciseId: new Map([["ww", wallWalk]]),
    });
    expect(out[0].exerciseId).toBe("ww");
    expect(out[0].regressedFromId).toBe("hsw");
  });

  it("keeps an Advanced movement the user has earned", () => {
    const advanced = { ...cand({ exerciseId: "hsw", skillLevel: "Advanced" as const }), section: "main" as const, soreDowngrade: false, regressedFromId: null };
    const out = resolveProgressions([advanced], {
      skillState: { hsw: "advanced" },
      regressions: new Map([["hsw", "ww"]]),
      byExerciseId: new Map(),
    });
    expect(out[0].exerciseId).toBe("hsw");
  });

  it("keeps an Advanced movement with no regression link (nothing to swap to)", () => {
    const advanced = { ...cand({ exerciseId: "hsw", skillLevel: "Advanced" as const }), section: "main" as const, soreDowngrade: false, regressedFromId: null };
    const out = resolveProgressions([advanced], {
      skillState: {}, regressions: new Map(), byExerciseId: new Map(),
    });
    expect(out[0].exerciseId).toBe("hsw");
  });
});
