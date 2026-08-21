import {
  isRecoveryDay, effectiveRecovery, workoutFocus, buildBlockShortlists,
} from "../dailyBlockShortlist";
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
  // Day-one app behavior: unrated history floors at Intermediate (the hook
  // applies the floor), so the factory default mirrors that.
  userSkill: "Intermediate" as const,
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
    // Glutes, not the default Chest: otherwise soreness excludes this one too
    // and the recency window is never the reason it left.
    const recent = workout({
      workoutId: "recent", lastPerformedDaysAgo: 3,
      tags: { muscles: muscles([["Glutes", true]]) } as any,
    });
    const ok = workout({ workoutId: "ok", tags: { muscles: muscles([["Quads", true]]) } as any });
    const ctx = { ...baseCtx(), soreness: { Chest: 2 } };
    const { shortlists } = buildBlockShortlists([sore, recent, ok], ctx);
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["ok"]);
  });

  it("the repeat window is four days: three days ago is out, four is in", () => {
    const three = workout({ workoutId: "three", lastPerformedDaysAgo: 3 });
    const four = workout({ workoutId: "four", lastPerformedDaysAgo: 4 });
    const { shortlists, relaxedMain } = buildBlockShortlists([three, four], baseCtx());
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["four"]);
    expect(relaxedMain).toBe(false);
  });

  it("advanced workouts sit out ramp weeks 1-2", () => {
    // userSkill Advanced throughout, so only the ramp varies here — the
    // earned-ceiling gate has its own describe block below.
    const adv = workout({ workoutId: "adv", tags: { skillLevel: "Advanced" } as any });
    const { shortlists } = buildBlockShortlists(
      [adv], { ...baseCtx(), userSkill: "Advanced", rampWeek: 1 },
    );
    expect(shortlists.main).toHaveLength(0);
    const later = buildBlockShortlists(
      [adv], { ...baseCtx(), userSkill: "Advanced", rampWeek: 3 },
    );
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

  it("yesterday's muscles are penalised even when freshness ties", () => {
    const chest = workout({ workoutId: "chest" });
    const legs = workout({ workoutId: "legs", tags: { muscles: muscles([["Quads", true]]) } as any });
    // Chest: one primary yesterday = 7/8 load. Quads: a primary two days ago
    // (6/8) plus a secondary six days ago (1/8) = the same 7/8, with no claim
    // on yesterday. Freshness and recency both tie, so only the penalty can
    // decide — and the names are ordered so the tiebreak would flip the answer.
    const cov = muscleCoverage([
      { capturedWorkoutId: "a", performedDate: "2026-08-17", block: "main",
        muscles: muscles([["Chest", true]]) },
      { capturedWorkoutId: "b", performedDate: "2026-08-16", block: "main",
        muscles: muscles([["Quads", true]]) },
      { capturedWorkoutId: "c", performedDate: "2026-08-12", block: "main",
        muscles: muscles([["Quads", false]]) },
    ], "2026-08-18");
    expect(cov.load.Chest).toBe(cov.load.Quads);
    const { shortlists } = buildBlockShortlists([chest, legs], { ...baseCtx(), coverage: cov });
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["legs", "chest"]);
  });

  it("among equally fresh mains, the one done longer ago wins", () => {
    // Same muscles, so freshness ties; named so the alphabetical tiebreak
    // would give the opposite order if recency stopped counting toward score.
    const zulu = workout({ workoutId: "zulu", lastPerformedDaysAgo: 7 });
    const alpha = workout({ workoutId: "alpha", lastPerformedDaysAgo: 4 });
    const { shortlists } = buildBlockShortlists([zulu, alpha], baseCtx());
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["zulu", "alpha"]);
  });

  it("one untouched muscle beats three half-trained ones", () => {
    const narrow = workout({
      workoutId: "narrow", tags: { muscles: muscles([["Quads", true]]) } as any,
    });
    const broad = workout({
      workoutId: "broad",
      tags: {
        muscles: muscles([["Chest", true], ["Shoulders", true], ["Triceps", true]]),
      } as any,
    });
    // Each of broad's three primaries sits at half load; narrow's is untouched.
    // Freshness is the mean, so narrow wins — summing would hand it to broad.
    const cov = muscleCoverage([{
      capturedWorkoutId: "a", performedDate: "2026-08-14", block: "main",
      muscles: muscles([["Chest", true], ["Shoulders", true], ["Triceps", true]]),
    }], "2026-08-18");
    const { shortlists } = buildBlockShortlists([narrow, broad], { ...baseCtx(), coverage: cov });
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["narrow", "broad"]);
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

  it("shortlists are capped at five mains and three catalog support picks", () => {
    const mains = [1, 2, 3, 4, 5, 6].map((n) => workout({ workoutId: `m${n}` }));
    const warmups = [1, 2, 3, 4].map((n) => workout({
      workoutId: `wu${n}`,
      tags: { blockRoles: ["warmup"], muscles: muscles([["Core", true]]), estMinutes: 8 } as any,
    }));
    const { shortlists } = buildBlockShortlists([...mains, ...warmups], baseCtx());
    expect(shortlists.main).toHaveLength(5);
    expect(shortlists.warmup).toHaveLength(4); // three from the catalog, then the built-in
    expect(shortlists.warmup![3].builtinKey).toBe("builtin-warmup-upper");
  });

  it("a built-in is clamped to a short day's ceiling", () => {
    const { shortlists } = buildBlockShortlists([], {
      ...baseCtx(),
      envelopes: blockEnvelopes(30, false), // support compresses to 3-5 minutes
    });
    const builtin = shortlists.warmup![shortlists.warmup!.length - 1];
    expect(builtin.builtinKey).toBe("builtin-warmup-full");
    expect(builtin.minutes).toBe(5); // the routine ships at 7
  });

  it("conditioning gates on role, focus and soreness, and still gets no built-in", () => {
    const main = workout({ workoutId: "m" }); // Chest, so an upper day
    const cond = (workoutId: string, muscle: string) => workout({
      workoutId,
      tags: {
        blockRoles: ["conditioning"], muscles: muscles([[muscle, true]]), estMinutes: 15,
      } as any,
    });
    const { shortlists } = buildBlockShortlists(
      [main, cond("c-upper", "Lats"), cond("c-lower", "Quads"), cond("c-sore", "Triceps")],
      { ...baseCtx(), envelopes: blockEnvelopes(90, false), soreness: { Triceps: 2 } },
    );
    // c-lower clashes with the day's focus; c-sore is sore; "m" has no
    // conditioning role. Nothing left to append a built-in to it (spec §3.3).
    expect(shortlists.conditioning!.map((c) => c.workoutId)).toEqual(["c-upper"]);
    expect(shortlists.conditioning!.every((c) => c.builtinKey === null)).toBe(true);
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

  it("relaxes recency before soreness dominance (spec §8's order)", () => {
    const sore = workout({ workoutId: "sore" }); // never done, but Chest is sore
    const recent = workout({
      workoutId: "recent", lastPerformedDaysAgo: 1,
      tags: { muscles: muscles([["Quads", true]]) } as any,
    });
    const ctx = { ...baseCtx(), soreness: { Chest: 3 } };
    const { shortlists, relaxedMain } = buildBlockShortlists([sore, recent], ctx);
    // Relaxing soreness first would have offered "sore" instead.
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["recent"]);
    expect(relaxedMain).toBe(true);
  });

  it("an all-sore catalog still fields a main, on the last rung", () => {
    const sore = workout({ workoutId: "sore" });
    const alsoSore = workout({
      workoutId: "also-sore", tags: { muscles: muscles([["Quads", true]]) } as any,
    });
    const ctx = { ...baseCtx(), soreness: { Chest: 2, Quads: 3 } };
    const { shortlists, relaxedMain } = buildBlockShortlists([sore, alsoSore], ctx);
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["also-sore", "sore"]);
    expect(relaxedMain).toBe(true);
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

describe("effectiveRecovery", () => {
  const beatUp = { energy: 3, soreness: { Quads: 3 } };
  const fine = { energy: 8, soreness: {} };

  it("a recovery-worthy check-in without an override is a recovery day", () => {
    expect(effectiveRecovery({ ...beatUp, overrideRecovery: false })).toBe(true);
  });

  it("the override turns a recovery call into a training day", () => {
    expect(effectiveRecovery({ ...beatUp, overrideRecovery: true })).toBe(false);
  });

  it("an override on an ordinary day changes nothing", () => {
    expect(effectiveRecovery({ ...fine, overrideRecovery: true })).toBe(false);
    expect(effectiveRecovery({ ...fine, overrideRecovery: false })).toBe(false);
  });
});

describe("skill ceiling gate", () => {
  const advancedMain = () =>
    workout({ workoutId: "adv", tags: { skillLevel: "Advanced" } as any });

  it("excludes a workout tagged above the user's earned ceiling", () => {
    const { shortlists } = buildBlockShortlists(
      [advancedMain()],
      { ...baseCtx(), userSkill: "Intermediate" },
    );
    expect(shortlists.main).toHaveLength(0);
  });

  it("admits it once the ceiling is earned", () => {
    const { shortlists } = buildBlockShortlists(
      [advancedMain()],
      { ...baseCtx(), userSkill: "Advanced" },
    );
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["adv"]);
  });

  it("an untagged skill level is never gated", () => {
    const untagged = workout({ workoutId: "untagged", tags: { skillLevel: null } as any });
    const { shortlists } = buildBlockShortlists(
      [untagged],
      { ...baseCtx(), userSkill: "Beginner" },
    );
    expect(shortlists.main!.map((c) => c.workoutId)).toEqual(["untagged"]);
  });

  it("the ramp still excludes Advanced in weeks 1-2 even at a high ceiling", () => {
    const { shortlists } = buildBlockShortlists(
      [advancedMain()],
      { ...baseCtx(), userSkill: "Advanced", rampWeek: 1 },
    );
    expect(shortlists.main).toHaveLength(0);
  });

  it("the §8 relaxation ladder never relaxes the skill gate", () => {
    // The only main candidate is Advanced and recently done: recency would be
    // relaxed for it, but the skill gate must hold and the day fields no main.
    const adv = workout({
      workoutId: "adv", lastPerformedDaysAgo: 1,
      tags: { skillLevel: "Advanced" } as any,
    });
    const { shortlists, relaxedMain } = buildBlockShortlists(
      [adv],
      { ...baseCtx(), userSkill: "Intermediate" },
    );
    expect(shortlists.main).toHaveLength(0);
    expect(relaxedMain).toBe(false);
  });
});
