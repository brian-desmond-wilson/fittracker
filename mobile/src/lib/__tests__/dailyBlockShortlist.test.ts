import { isRecoveryDay, workoutFocus, buildBlockShortlists } from "../dailyBlockShortlist";
import { blockEnvelopes } from "../dailyBlockBudget";
import { muscleCoverage } from "../dailyCoverage";
import type { TaggedWorkout, WorkoutMuscle } from "../../types/dailyBlocks";

const muscles = (pairs: [string, boolean][]): WorkoutMuscle[] =>
  pairs.map(([name, isPrimary]) => ({ name, isPrimary }));

const workout = (over: Partial<TaggedWorkout> & { workoutId: string }): TaggedWorkout => ({
  name: over.workoutId,
  rounds: null,
  lastPerformedDaysAgo: null,
  ...over,
  tags: {
    blockRoles: ["main"],
    muscles: muscles([["Chest", true]]),
    estMinutes: 40,
    intensity: "moderate",
    skillLevel: "Intermediate",
    classifiedAt: "2026-08-18T00:00:00Z",
    ...(over.tags ?? {}),
  },
});

const baseCtx = () => ({
  coverage: muscleCoverage([], "2026-08-18"),
  soreness: {} as Record<string, number>,
  envelopes: blockEnvelopes(60, false),
  recoveryDay: false,
  rampWeek: 3,
});

describe("isRecoveryDay", () => {
  it("three regions at 2+ trips it", () => {
    expect(isRecoveryDay({ energy: 7, soreness: { Chest: 2, Quads: 2, Lats: 2 } })).toBe(true);
  });
  it("one region at 3 with low energy trips it", () => {
    expect(isRecoveryDay({ energy: 3, soreness: { Quads: 3 } })).toBe(true);
  });
  it("one region at 3 with good energy does not", () => {
    expect(isRecoveryDay({ energy: 8, soreness: { Quads: 3 } })).toBe(false);
  });
});

describe("workoutFocus", () => {
  it("all-upper primaries → upper", () => {
    expect(workoutFocus(muscles([["Chest", true], ["Triceps", true]]))).toBe("upper");
  });
  it("mixed or core-only → full", () => {
    expect(workoutFocus(muscles([["Chest", true], ["Quads", true]]))).toBe("full");
    expect(workoutFocus(muscles([["Core", true]]))).toBe("full");
  });
  it("secondaries never set the focus", () => {
    expect(workoutFocus(muscles([["Chest", true], ["Quads", false]]))).toBe("upper");
  });
});

describe("buildBlockShortlists", () => {
  it("untagged workouts never appear", () => {
    const w = workout({ workoutId: "w1" });
    w.tags.classifiedAt = null;
    const { shortlists } = buildBlockShortlists([w], baseCtx());
    expect(shortlists.main).toHaveLength(0);
  });

  it("sore-dominated mains are excluded; done-3-days-ago is excluded", () => {
    const sore = workout({ workoutId: "sore" });
    const recent = workout({ workoutId: "recent", lastPerformedDaysAgo: 3 });
    const ok = workout({ workoutId: "ok", tags: { muscles: muscles([["Quads", true]]) } as any });
    const ctx = { ...baseCtx(), soreness: { Chest: 2 } };
    const { shortlists } = buildBlockShortlists([sore, recent, ok], ctx);
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["ok"]);
  });

  it("advanced workouts sit out ramp weeks 1-2", () => {
    const adv = workout({ workoutId: "adv", tags: { skillLevel: "Advanced" } as any });
    const { shortlists } = buildBlockShortlists([adv], { ...baseCtx(), rampWeek: 1 });
    expect(shortlists.main).toHaveLength(0);
    const later = buildBlockShortlists([adv], { ...baseCtx(), rampWeek: 3 });
    expect(later.shortlists.main).toHaveLength(1);
  });

  it("the ramp gate is never relaxed, even with nothing else on offer", () => {
    const adv = workout({ workoutId: "adv", tags: { skillLevel: "Advanced" } as any });
    const { shortlists, relaxedMain } = buildBlockShortlists([adv], { ...baseCtx(), rampWeek: 2 });
    expect(shortlists.main).toHaveLength(0);
    expect(relaxedMain).toBe(false);
  });

  it("neglected muscles outrank yesterday's muscles", () => {
    const chest = workout({ workoutId: "chest" });
    const legs = workout({ workoutId: "legs", tags: { muscles: muscles([["Quads", true]]) } as any });
    const cov = muscleCoverage([{
      capturedWorkoutId: "x", performedDate: "2026-08-17", block: "main",
      muscles: muscles([["Chest", true]]),
    }], "2026-08-18");
    const { shortlists } = buildBlockShortlists([chest, legs], { ...baseCtx(), coverage: cov });
    expect(shortlists.main![0].workoutId).toBe("legs");
  });

  it("equal scores break on name, not on catalog order", () => {
    const zeta = workout({ workoutId: "zeta" });
    const alpha = workout({ workoutId: "alpha" });
    const forward = buildBlockShortlists([zeta, alpha], baseCtx());
    const reverse = buildBlockShortlists([alpha, zeta], baseCtx());
    expect(forward.shortlists.main!.map((c) => c.workoutId)).toEqual(["alpha", "zeta"]);
    expect(reverse.shortlists.main!.map((c) => c.workoutId)).toEqual(["alpha", "zeta"]);
  });

  it("support blocks share the main's focus and end with a built-in", () => {
    const main = workout({ workoutId: "m" }); // upper focus
    const upperWu = workout({
      workoutId: "wu-upper",
      tags: { blockRoles: ["warmup"], muscles: muscles([["Shoulders", true]]), estMinutes: 8 } as any,
    });
    const lowerWu = workout({
      workoutId: "wu-lower",
      tags: { blockRoles: ["warmup"], muscles: muscles([["Quads", true]]), estMinutes: 8 } as any,
    });
    const { shortlists } = buildBlockShortlists([main, upperWu, lowerWu], baseCtx());
    const ids = shortlists.warmup!.map((c) => c.workoutId ?? c.builtinKey);
    expect(ids).toContain("wu-upper");
    expect(ids).not.toContain("wu-lower");
    expect(shortlists.warmup![shortlists.warmup!.length - 1].builtinKey).toBe("builtin-warmup-upper");
  });

  it("a split main shortlist takes the full-body built-in, not the top pick's flavour", () => {
    const upper = workout({ workoutId: "m-upper" });
    const lower = workout({ workoutId: "m-lower", tags: { muscles: muscles([["Quads", true]]) } as any });
    const { shortlists } = buildBlockShortlists([upper, lower], baseCtx());
    // The AI may take either main, so the appended cool-down must suit both.
    expect(new Set(shortlists.main!.map((c) => c.focus))).toEqual(new Set(["upper", "lower"]));
    expect(shortlists.cooldown![shortlists.cooldown!.length - 1].builtinKey)
      .toBe("builtin-cooldown-full");
  });

  it("with no main candidate, support work is not held to a focus", () => {
    const upperWu = workout({
      workoutId: "wu-upper",
      tags: { blockRoles: ["warmup"], muscles: muscles([["Shoulders", true]]), estMinutes: 8 } as any,
    });
    const lowerWu = workout({
      workoutId: "wu-lower",
      tags: { blockRoles: ["warmup"], muscles: muscles([["Quads", true]]), estMinutes: 8 } as any,
    });
    // No main-role workout in the catalog at all — nothing for a warm-up to clash with.
    const { shortlists } = buildBlockShortlists([upperWu, lowerWu], baseCtx());
    expect(shortlists.main).toEqual([]);
    expect(shortlists.warmup!.map((c) => c.workoutId ?? c.builtinKey))
      .toEqual(expect.arrayContaining(["wu-upper", "wu-lower"]));
  });

  it("soreness never gates a support block — stretching a sore muscle is the point", () => {
    const main = workout({ workoutId: "m" }); // upper focus, Chest
    const mob = workout({
      workoutId: "mob-shoulders",
      tags: { blockRoles: ["mobility"], muscles: muscles([["Shoulders", true]]), estMinutes: 8 } as any,
    });
    const ctx = { ...baseCtx(), soreness: { Shoulders: 3 } };
    const { shortlists } = buildBlockShortlists([main, mob], ctx);
    expect(shortlists.mobility!.map((c) => c.workoutId)).toContain("mob-shoulders");
  });

  it("no conditioning shortlist under 75 minutes, and no built-in for it above", () => {
    const sixty = buildBlockShortlists([workout({ workoutId: "m" })], baseCtx());
    expect(sixty.shortlists.conditioning).toBeUndefined();
    const ninety = buildBlockShortlists([workout({ workoutId: "m" })],
      { ...baseCtx(), envelopes: blockEnvelopes(90, false) });
    expect((ninety.shortlists.conditioning ?? []).every((c) => c.builtinKey === null)).toBe(true);
  });

  it("empty main pool relaxes recency first and flags it", () => {
    const recent = workout({ workoutId: "recent", lastPerformedDaysAgo: 2 });
    const { shortlists, relaxedMain } = buildBlockShortlists([recent], baseCtx());
    expect(relaxedMain).toBe(true);
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["recent"]);
  });

  it("relaxes when the strict pool exists but nothing in it fits the envelope", () => {
    // Strict-eligible but unfittable: 120 min, roundless, against a 30-45 main.
    const huge = workout({ workoutId: "huge", lastPerformedDaysAgo: 9, tags: { estMinutes: 120 } as any });
    const recent = workout({ workoutId: "recent", lastPerformedDaysAgo: 2 });
    const { shortlists, relaxedMain } = buildBlockShortlists([huge, recent], baseCtx());
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["recent"]);
    expect(relaxedMain).toBe(true);
  });

  it("an empty catalog is not a relaxed day, just an empty one", () => {
    const { shortlists, relaxedMain } = buildBlockShortlists([], baseCtx());
    expect(shortlists.main).toEqual([]);
    expect(relaxedMain).toBe(false);
    expect(shortlists.warmup!.map((c) => c.builtinKey)).toEqual(["builtin-warmup-full"]);
  });

  it("recovery day: mobility and cooldown only, full-body built-ins", () => {
    const { shortlists } = buildBlockShortlists([workout({ workoutId: "m" })], {
      ...baseCtx(),
      envelopes: blockEnvelopes(60, true),
      recoveryDay: true,
    });
    expect(shortlists.main).toBeUndefined();
    expect(shortlists.warmup).toBeUndefined();
    expect(shortlists.mobility![shortlists.mobility!.length - 1].builtinKey)
      .toBe("builtin-mobility-full");
  });

  it("the caller declares a recovery day; it is not inferred from the envelopes", () => {
    const { shortlists } = buildBlockShortlists([workout({ workoutId: "m" })], {
      ...baseCtx(),
      // Full weekday envelopes: main and conditioning are both on offer.
      envelopes: blockEnvelopes(90, false),
      recoveryDay: true,
    });
    expect(shortlists.main).toBeUndefined();
    expect(shortlists.warmup).toBeUndefined();
    expect(shortlists.conditioning).toBeUndefined();
    expect(shortlists.mobility).toBeDefined();
    expect(shortlists.cooldown).toBeDefined();
  });
});
