import {
  bfrFinisherPick,
  blockDayShape,
  composeBlockFallback,
  validateBlockComposition,
  nextCandidate,
  mergeLockedPicks,
  plannedBlockMinutes,
  extractDayReason,
  BLOCK_ORDER,
  SECTION_FOR_BLOCK,
} from "../dailyBlockCompose";
import type { BlockCandidate, BlockRole, BlockShortlists } from "../../types/dailyBlocks";

const cand = (id: string, minutes = 10, builtin = false): BlockCandidate => ({
  workoutId: builtin ? null : id,
  builtinKey: builtin ? id : null,
  name: id, minutes, roundsNote: null, muscles: [], focus: "full", score: 1,
});

const shortlists: BlockShortlists = {
  warmup: [cand("wu1", 8), cand("builtin-warmup-full", 7, true)],
  mobility: [cand("mo1", 8)],
  main: [cand("m1", 40), cand("m2", 35)],
  cooldown: [cand("cd1", 6)],
};

describe("composeBlockFallback", () => {
  it("takes the top candidate of every offered block, in block order", () => {
    const picks = composeBlockFallback(shortlists, 120);
    expect(picks.map((p) => p.block)).toEqual(["warmup", "mobility", "main", "cooldown"]);
    expect(picks.find((p) => p.block === "main")!.workoutId).toBe("m1");
  });
  it("orders by the blocks, not by the order the shortlists were built", () => {
    const jumbled: BlockShortlists = {
      cooldown: [cand("cd1")], main: [cand("m1")], warmup: [cand("wu1")],
    };
    expect(composeBlockFallback(jumbled, 120).map((p) => p.block))
      .toEqual(["warmup", "main", "cooldown"]);
  });
  it("skips empty shortlists", () => {
    const picks = composeBlockFallback({ ...shortlists, conditioning: [], mobility: [] }, 120);
    expect(picks.map((p) => p.block)).toEqual(["warmup", "main", "cooldown"]);
  });
  it("carries the candidate's name, minutes and rounds note, and no reason", () => {
    const trimmed: BlockShortlists = {
      main: [{ ...cand("m1", 40), name: "Murph-ish", roundsNote: "Do 3 of 4 rounds" }],
    };
    expect(composeBlockFallback(trimmed, 60)[0]).toEqual({
      block: "main",
      workoutId: "m1",
      builtinKey: null,
      name: "Murph-ish",
      minutes: 40,
      roundsNote: "Do 3 of 4 rounds",
      // The rules tier picked this; it has no rationale to offer and does not
      // invent one.
      reason: null,
    });
  });
  it("carries a built-in by its key, with no workout id", () => {
    const picks = composeBlockFallback({ warmup: [cand("builtin-warmup-full", 7, true)] }, 60);
    expect(picks[0].builtinKey).toBe("builtin-warmup-full");
    expect(picks[0].workoutId).toBeNull();
  });

  it("skips a candidate that doesn't fit and takes the next one that does", () => {
    const picks = composeBlockFallback({ main: [cand("long", 50), cand("short", 20)] }, 20);
    expect(picks.map((p) => p.workoutId)).toEqual(["short"]);
  });

  it("counts a candidate that lands exactly on the ceiling as fitting", () => {
    const picks = composeBlockFallback({ main: [cand("exact", 22), cand("small", 5)] }, 20);
    expect(picks[0].workoutId).toBe("exact"); // 22 into 20 + 10%
  });

  it("spends the budget as it walks, so later blocks see what's left", () => {
    const picks = composeBlockFallback(
      { main: [cand("m", 40)], cooldown: [cand("cd-long", 10), cand("cd-short", 4)] },
      40,
    );
    expect(picks.map((p) => p.workoutId)).toEqual(["m", "cd-short"]);
  });

  it("falls to the shortest candidate rather than dropping a block", () => {
    const picks = composeBlockFallback(
      { main: [cand("long", 50), cand("mid", 40), cand("short", 30)] },
      20,
    );
    // A short main is still a main; nothing here fits 22 minutes.
    expect(picks.map((p) => p.workoutId)).toEqual(["short"]);
  });

  it("drops conditioning — and only conditioning — when nothing fits", () => {
    const picks = composeBlockFallback(
      { main: [cand("m", 40)], conditioning: [cand("c", 20)], cooldown: [cand("cd", 5)] },
      40,
    );
    expect(picks.map((p) => p.block)).toEqual(["main", "cooldown"]);
  });

  it("keeps a day of envelope maxima inside the ceiling", () => {
    // The 75-minute case: every envelope at its maximum sums to 100, which the
    // validator would reject. The fallback is the path taken when the model's
    // answer was rejected, so it must not hand the same overrun back.
    const maxima: BlockShortlists = {
      warmup: [cand("wu", 10)],
      mobility: [cand("mo", 10)],
      main: [cand("m", 50)],
      conditioning: [cand("c", 20)],
      cooldown: [cand("cd", 10)],
    };
    const picks = composeBlockFallback(maxima, 75);
    expect(picks.map((p) => p.block)).toEqual(["warmup", "mobility", "main", "cooldown"]);
    expect(picks.reduce((s, p) => s + p.minutes, 0)).toBe(80); // ≤ 82.5
  });

  it("more than one block can take its shortest candidate", () => {
    const picks = composeBlockFallback(
      {
        main: [cand("m-long", 40), cand("m-short", 35)],
        cooldown: [cand("cd-long", 9), cand("cd-short", 6)],
      },
      30,
    );
    // Once main busts the ceiling, every later block is over it too. The
    // escape has to keep working, not fire once.
    expect(picks.map((p) => p.workoutId)).toEqual(["m-short", "cd-short"]);
  });

  it("a short day runs long rather than losing a block, on purpose", () => {
    // blockEnvelopes(45) at its maxima. Below the 75-minute conditioning floor
    // there is no optional block to drop, so the overrun cascades — and that
    // is the accepted outcome: the durations are the creators', not ours to
    // shrink, and the Today tab is where an overrun gets flagged.
    const maxima: BlockShortlists = {
      warmup: [cand("wu", 10)],
      mobility: [cand("mo", 10)],
      main: [cand("m", 30)],
      cooldown: [cand("cd", 10)],
    };
    const picks = composeBlockFallback(maxima, 45);
    expect(picks.map((p) => p.block)).toEqual(["warmup", "mobility", "main", "cooldown"]);
    const total = picks.reduce((s, p) => s + p.minutes, 0);
    expect(total).toBe(60);
    expect(total).toBeGreaterThan(45 * 1.1);
  });

  it("an unusable budget bounds nothing — a session still comes back", () => {
    // This path cannot refuse the way the validator can.
    for (const budget of [NaN, 0, -30]) {
      const picks = composeBlockFallback(shortlists, budget);
      expect(picks.map((p) => p.workoutId)).toEqual(["wu1", "mo1", "m1", "cd1"]);
    }
  });
});

describe("validateBlockComposition", () => {
  const valid = {
    blocks: [
      { block: "warmup", id: "wu1", reason: "shoulders first" },
      { block: "mobility", id: "mo1", reason: "hips" },
      { block: "main", id: "m2", reason: "fresh muscles" },
      { block: "cooldown", id: "cd1", reason: "wind down" },
    ],
  };

  it("accepts a good answer, carrying candidate minutes", () => {
    const picks = validateBlockComposition(valid, shortlists, 60)!;
    expect(picks).toHaveLength(4);
    expect(picks.find((p) => p.block === "main")!.minutes).toBe(35);
    expect(picks.find((p) => p.block === "warmup")!.reason).toBe("shoulders first");
  });

  it("returns the picks in block order, whatever order the model listed them", () => {
    const shuffled = { blocks: [...valid.blocks].reverse() };
    expect(validateBlockComposition(shuffled, shortlists, 60)!.map((p) => p.block))
      .toEqual(["warmup", "mobility", "main", "cooldown"]);
  });

  it("carries the candidate's name and rounds note, never the model's", () => {
    const named: BlockShortlists = {
      main: [{ ...cand("m1", 40), name: "Real Name", roundsNote: "Cap at 40 min" }],
    };
    const picks = validateBlockComposition(
      { blocks: [{ block: "main", id: "m1", name: "Model's Name", minutes: 5, roundsNote: "whatever" }] },
      named,
      60,
    )!;
    expect(picks[0].name).toBe("Real Name");
    expect(picks[0].minutes).toBe(40);
    expect(picks[0].roundsNote).toBe("Cap at 40 min");
  });

  it("rejects an id the shortlist never offered", () => {
    const bad = { blocks: [{ ...valid.blocks[0], id: "stranger" }, ...valid.blocks.slice(1)] };
    expect(validateBlockComposition(bad, shortlists, 60)).toBeNull();
  });

  it("rejects a missing id", () => {
    const bad = { blocks: [{ block: "warmup", reason: "no id" }, ...valid.blocks.slice(1)] };
    expect(validateBlockComposition(bad, shortlists, 60)).toBeNull();
  });

  it("rejects a block that was never offered", () => {
    const bad = { blocks: [...valid.blocks, { block: "conditioning", id: "c1", reason: "extra" }] };
    expect(validateBlockComposition(bad, shortlists, 60)).toBeNull();
  });

  it("rejects a block offered with an empty shortlist", () => {
    const bad = { blocks: [...valid.blocks, { block: "conditioning", id: "c1", reason: "extra" }] };
    expect(validateBlockComposition(bad, { ...shortlists, conditioning: [] }, 60)).toBeNull();
  });

  it("rejects a block name we don't know", () => {
    const bad = { blocks: [...valid.blocks, { block: "cardio", id: "m1", reason: "invented" }] };
    expect(validateBlockComposition(bad, shortlists, 60)).toBeNull();
  });

  it("rejects one malformed entry in an otherwise good day", () => {
    // Skipping it would silently hand back a day missing its cool-down; the
    // rules fallback gives a complete one.
    const bad = { blocks: [...valid.blocks.slice(0, 3), null] };
    expect(validateBlockComposition(bad, shortlists, 60)).toBeNull();
  });

  it("rejects a missing main when main was offered", () => {
    const noMain = { blocks: valid.blocks.filter((b) => b.block !== "main") };
    expect(validateBlockComposition(noMain, shortlists, 60)).toBeNull();
  });

  it("rejects an answer that drops any other block it was offered", () => {
    const noWarmup = { blocks: valid.blocks.filter((b) => b.block !== "warmup") };
    expect(validateBlockComposition(noWarmup, shortlists, 60)).toBeNull();
    const noCooldown = { blocks: valid.blocks.filter((b) => b.block !== "cooldown") };
    expect(validateBlockComposition(noCooldown, shortlists, 60)).toBeNull();
  });

  it("rejects a dropped warm-up on a day with no main to pick", () => {
    // The omission that reads worst. The screens tell a recovery day from a
    // catalog too thin to field a main by whether there is a warm-up block, so
    // an answer that loses one turns "nothing fits your 30 minutes" into
    // "you're beat up" for someone who said they felt fine.
    const thin: BlockShortlists = {
      warmup: [cand("wu1", 8)], mobility: [cand("mo1", 8)],
      main: [], cooldown: [cand("cd1", 6)],
    };
    const answer = { blocks: [
      { block: "mobility", id: "mo1", reason: "hips" },
      { block: "cooldown", id: "cd1", reason: "stretch" },
    ]};
    expect(validateBlockComposition(answer, thin, 60)).toBeNull();
  });

  it("conditioning is the one block the model may drop", () => {
    const withConditioning: BlockShortlists = { ...shortlists, conditioning: [cand("c1", 12)] };
    expect(validateBlockComposition(valid, withConditioning, 60)).toHaveLength(4);
  });

  it("accepts a mainless answer when no main was offered (recovery day)", () => {
    const rec: BlockShortlists = { mobility: [cand("mo1", 30)], cooldown: [cand("cd1", 20)] };
    const answer = { blocks: [
      { block: "mobility", id: "mo1", reason: "easy day" },
      { block: "cooldown", id: "cd1", reason: "stretch" },
    ]};
    expect(validateBlockComposition(answer, rec, 60)).toHaveLength(2);
  });

  it("accepts a mainless answer when main was offered but empty", () => {
    // The thin-catalog case: the main key is present with nothing in it, so
    // there was no main to pick and its absence is not the model's fault.
    const thin: BlockShortlists = { main: [], mobility: [cand("mo1", 30)] };
    const answer = { blocks: [{ block: "mobility", id: "mo1", reason: "all we have" }] };
    expect(validateBlockComposition(answer, thin, 60)).toHaveLength(1);
  });

  it("rejects when the candidates' minutes bust the budget", () => {
    expect(validateBlockComposition(valid, shortlists, 40)).toBeNull(); // 57 min into 40
  });

  it("tolerates a 10% overrun and no more", () => {
    expect(validateBlockComposition(valid, shortlists, 52)).toHaveLength(4); // 57 into 57.2
    expect(validateBlockComposition(valid, shortlists, 51)).toBeNull(); // 57 into 56.1
  });

  it("a day landing exactly on the tolerance line is allowed", () => {
    const long: BlockShortlists = { main: [cand("m1", 66)] };
    const answer = { blocks: [{ block: "main", id: "m1", reason: "long one" }] };
    expect(validateBlockComposition(answer, long, 60)).toHaveLength(1);
  });

  it("rejects a budget that isn't a positive number", () => {
    // Every comparison against NaN is false, so an unguarded overrun check
    // would wave anything through.
    expect(validateBlockComposition(valid, shortlists, NaN)).toBeNull();
    expect(validateBlockComposition(valid, shortlists, 0)).toBeNull();
    // Refused on its own terms, not because the total happened to bust it:
    // no minutes means no session, whatever the day is claimed to cost.
    const free = { blocks: [{ block: "main", id: "m1", reason: "costs nothing" }] };
    expect(validateBlockComposition(free, { main: [cand("m1", 0)] }, 0)).toBeNull();
  });

  it("a duplicate block keeps the first mention", () => {
    const dup = { blocks: [...valid.blocks, { block: "main", id: "m1", reason: "again" }] };
    const picks = validateBlockComposition(dup, shortlists, 60)!;
    expect(picks.filter((p) => p.block === "main")).toHaveLength(1);
    expect(picks.find((p) => p.block === "main")!.workoutId).toBe("m2");
  });

  it("resolves a built-in pick by its key", () => {
    const withBuiltin = { blocks: [
      { block: "warmup", id: "builtin-warmup-full", reason: "no captures yet" },
      ...valid.blocks.slice(1),
    ]};
    const picks = validateBlockComposition(withBuiltin, shortlists, 60)!;
    expect(picks.find((p) => p.block === "warmup")!.builtinKey).toBe("builtin-warmup-full");
    expect(picks.find((p) => p.block === "warmup")!.workoutId).toBeNull();
  });

  it("an unusable reason is dropped, not fatal", () => {
    const noReason = { blocks: [{ ...valid.blocks[0], reason: "  " }, ...valid.blocks.slice(1)] };
    expect(validateBlockComposition(noReason, shortlists, 60)!
      .find((p) => p.block === "warmup")!.reason).toBeNull();
  });

  it("garbage is null", () => {
    expect(validateBlockComposition(null, shortlists, 60)).toBeNull();
    expect(validateBlockComposition({ blocks: "x" }, shortlists, 60)).toBeNull();
    expect(validateBlockComposition({ blocks: {} }, shortlists, 60)).toBeNull();
    expect(validateBlockComposition({ blocks: [] }, shortlists, 60)).toBeNull();
    // No main to miss here, so nothing else would catch an empty answer.
    expect(validateBlockComposition({ blocks: [] }, { mobility: [cand("mo1")] }, 60)).toBeNull();
  });
});

describe("nextCandidate", () => {
  it("cycles forward and wraps", () => {
    expect(nextCandidate(shortlists.main!, "m1")!.workoutId).toBe("m2");
    expect(nextCandidate(shortlists.main!, "m2")!.workoutId).toBe("m1");
  });
  it("cycles down the ranked list, not up it", () => {
    const three = [cand("a"), cand("b"), cand("c")];
    expect(nextCandidate(three, "a")!.workoutId).toBe("b");
    expect(nextCandidate(three, "b")!.workoutId).toBe("c");
    expect(nextCandidate(three, "c")!.workoutId).toBe("a");
  });
  it("cycles built-ins by their key", () => {
    // The built-in sits mid-list on purpose: matching it by key has to move to
    // its successor, not fall back to the top the way a stale id does.
    const mixed = [cand("wu1"), cand("builtin-warmup-full", 7, true), cand("wu2")];
    expect(nextCandidate(mixed, "builtin-warmup-full")!.workoutId).toBe("wu2");
    expect(nextCandidate(shortlists.warmup!, "builtin-warmup-full")!.workoutId).toBe("wu1");
  });
  it("single-candidate lists have nowhere to go", () => {
    expect(nextCandidate(shortlists.mobility!, "mo1")).toBeNull();
  });
  it("a pick that has left the shortlist rerolls to the top of it", () => {
    // The stored block outlived its shortlist — deleted, untagged, or a new
    // day's list. Anything valid beats leaving reroll dead.
    expect(nextCandidate(shortlists.mobility!, "gone")!.workoutId).toBe("mo1");
    expect(nextCandidate(shortlists.main!, "gone")!.workoutId).toBe("m1");
  });
  it("an empty list has nothing to offer", () => {
    expect(nextCandidate([], "m1")).toBeNull();
  });
});

describe("SECTION_FOR_BLOCK", () => {
  it("conditioning reuses the accessory section (spec §7)", () => {
    expect(SECTION_FOR_BLOCK.conditioning).toBe("accessory");
    expect(SECTION_FOR_BLOCK.mobility).toBe("mobility");
  });
  it("every other block keeps its own name", () => {
    expect(SECTION_FOR_BLOCK.warmup).toBe("warmup");
    expect(SECTION_FOR_BLOCK.main).toBe("main");
    expect(SECTION_FOR_BLOCK.cooldown).toBe("cooldown");
  });
  it("BLOCK_ORDER is the six phases in sequence — the finisher lands before the cool-down", () => {
    expect(BLOCK_ORDER).toEqual(["warmup", "mobility", "main", "conditioning", "bfr", "cooldown"]);
  });
});

describe("blockDayShape", () => {
  const rows = (...blocks: BlockRole[]) => blocks.map((block) => ({ block }));

  it("a main block makes it a trained day", () => {
    expect(blockDayShape(rows("warmup", "mobility", "main", "cooldown"))).toBe("trained");
  });
  it("mobility and cool-down alone is a recovery day", () => {
    expect(blockDayShape(rows("mobility", "cooldown"))).toBe("recovery");
  });
  it("a warm-up with no main is a catalog too thin to field one", () => {
    // The 30-minute day: main's envelope is 15-21 min and every capture
    // overruns it. Nothing about the check-in said recovery.
    expect(blockDayShape(rows("warmup", "mobility", "cooldown"))).toBe("thin");
    expect(blockDayShape(rows("warmup", "mobility", "conditioning", "cooldown"))).toBe("thin");
  });
  it("no block rows at all is not a block day", () => {
    expect(blockDayShape([])).toBeNull();
  });
});

describe("mergeLockedPicks", () => {
  const pick = (block: BlockRole, id: string, minutes = 10) => ({
    block, workoutId: id, builtinKey: null, name: id, minutes,
    roundsNote: null, reason: `picked ${id}`,
  });

  it("keeps AI picks and inserts fixed blocks at their slots, in block order", () => {
    const merged = mergeLockedPicks(
      [pick("warmup", "wu-new"), pick("cooldown", "cd-new")],
      [pick("main", "m-locked", 40)],
    );
    expect(merged.map((p) => p.block)).toEqual(["warmup", "main", "cooldown"]);
    expect(merged[1].workoutId).toBe("m-locked");
  });

  it("a fixed block beats an AI pick for the same slot", () => {
    const merged = mergeLockedPicks(
      [pick("main", "m-ai")],
      [pick("main", "m-locked")],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].workoutId).toBe("m-locked");
  });

  it("a fixed block keeps its stored name, minutes, note and reason verbatim", () => {
    const locked = {
      ...pick("mobility", "mo-locked", 7),
      roundsNote: "Do 2 of 3 rounds", reason: "you locked this",
    };
    const merged = mergeLockedPicks([pick("warmup", "wu")], [locked]);
    expect(merged.find((p) => p.block === "mobility")).toEqual(locked);
  });

  it("no fixed blocks: the AI picks come back ordered and untouched", () => {
    const merged = mergeLockedPicks(
      [pick("cooldown", "cd"), pick("warmup", "wu")],
      [],
    );
    expect(merged.map((p) => p.block)).toEqual(["warmup", "cooldown"]);
  });

  it("only fixed blocks: the day is exactly the fixed blocks", () => {
    const merged = mergeLockedPicks([], [pick("main", "m"), pick("warmup", "wu")]);
    expect(merged.map((p) => p.block)).toEqual(["warmup", "main"]);
  });
});

describe("plannedBlockMinutes", () => {
  it("sums the blocks", () => {
    expect(plannedBlockMinutes([{ minutes: 8 }, { minutes: 32 }])).toBe(40);
  });
  it("a dismissed block costs nothing", () => {
    expect(plannedBlockMinutes([
      { minutes: 8, dismissed: false },
      { minutes: 6, dismissed: true },
      { minutes: 32 },
    ])).toBe(40);
  });
  it("an empty plan is zero", () => {
    expect(plannedBlockMinutes([])).toBe(0);
  });
});

describe("extractDayReason", () => {
  it("takes a non-empty dayReason string, trimmed", () => {
    expect(extractDayReason({ dayReason: "  upper push, legs kept quiet  " }))
      .toBe("upper push, legs kept quiet");
  });
  it("anything else is null", () => {
    expect(extractDayReason({ dayReason: "   " })).toBeNull();
    expect(extractDayReason({ dayReason: 42 })).toBeNull();
    expect(extractDayReason({})).toBeNull();
    expect(extractDayReason(null)).toBeNull();
    expect(extractDayReason("upper day")).toBeNull();
  });
});

describe("bfrFinisherPick", () => {
  const ok = { bandsAvailable: true, minutes: 90, recoveryDay: false, mainFocus: "upper" as const };

  it("programs an upper finisher on an upper day", () => {
    const pick = bfrFinisherPick(ok);
    expect(pick?.block).toBe("bfr");
    expect(pick?.builtinKey).toBe("builtin-bfr-upper");
    expect(pick?.workoutId).toBeNull();
  });
  it("matches a lower day with the lower finisher", () => {
    expect(bfrFinisherPick({ ...ok, mainFocus: "lower" })?.builtinKey).toBe("builtin-bfr-lower");
  });
  it("a full-body day gets the upper finisher (arms recover fastest)", () => {
    expect(bfrFinisherPick({ ...ok, mainFocus: "full" })?.builtinKey).toBe("builtin-bfr-upper");
  });
  it("declines without bands", () => {
    expect(bfrFinisherPick({ ...ok, bandsAvailable: false })).toBeNull();
  });
  it("declines under 75 minutes — same floor as conditioning", () => {
    expect(bfrFinisherPick({ ...ok, minutes: 74 })).toBeNull();
  });
  it("declines on a recovery day", () => {
    expect(bfrFinisherPick({ ...ok, recoveryDay: true })).toBeNull();
  });
  it("declines with no main focus (thin day)", () => {
    expect(bfrFinisherPick({ ...ok, mainFocus: null })).toBeNull();
  });
});
