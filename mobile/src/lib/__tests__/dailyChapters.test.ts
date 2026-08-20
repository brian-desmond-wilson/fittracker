import {
  buildChapterSteps,
  chapterBlocks,
  blockProgress,
  crossedBoundary,
} from "../dailyChapters";
import type { SessionSection } from "../../types/daily";
import type { BlockRole } from "../../types/dailyBlocks";

const block = (
  b: BlockRole,
  over: { builtinKey?: string | null; dismissed?: boolean; minutes?: number; name?: string } = {},
) => ({
  block: b,
  name: over.name ?? `${b} workout`,
  minutes: over.minutes ?? 10,
  builtinKey: over.builtinKey ?? null,
  workoutId: over.builtinKey ? null : `wo-${b}`,
  dismissed: over.dismissed ?? false,
});

// sections aligned to exerciseStates order, as the screen holds them
const sections = (...s: (SessionSection | null)[]) => s;

describe("buildChapterSteps", () => {
  it("walks blocks in performed order, exercises inside each", () => {
    const steps = buildChapterSteps(
      sections("main", "warmup", "main", "cooldown"),
      [block("warmup"), block("main"), block("cooldown")],
    );
    expect(steps).toEqual([
      { kind: "exercise", block: "warmup", exerciseIndex: 1 },
      { kind: "exercise", block: "main", exerciseIndex: 0 },
      { kind: "exercise", block: "main", exerciseIndex: 2 },
      { kind: "exercise", block: "cooldown", exerciseIndex: 3 },
    ]);
  });

  it("conditioning owns the accessory section", () => {
    const steps = buildChapterSteps(sections("accessory"), [block("conditioning")]);
    expect(steps).toEqual([{ kind: "exercise", block: "conditioning", exerciseIndex: 0 }]);
  });

  it("a block with no exercises becomes its built-in card", () => {
    const steps = buildChapterSteps(
      sections("main"),
      [block("main"), block("cooldown", { builtinKey: "builtin-cooldown-full" })],
    );
    expect(steps).toEqual([
      { kind: "exercise", block: "main", exerciseIndex: 0 },
      { kind: "builtin", block: "cooldown", builtinKey: "builtin-cooldown-full" },
    ]);
  });

  it("a dismissed built-in is not in the session at all", () => {
    const steps = buildChapterSteps(
      sections("main"),
      [
        block("main"),
        block("cooldown", { builtinKey: "builtin-cooldown-full", dismissed: true }),
      ],
    );
    expect(steps).toEqual([{ kind: "exercise", block: "main", exerciseIndex: 0 }]);
  });

  it("a block with neither exercises nor a built-in is skipped", () => {
    const steps = buildChapterSteps(
      sections("main"),
      [block("main"), { ...block("cooldown"), workoutId: null, builtinKey: null }],
    );
    expect(steps).toEqual([{ kind: "exercise", block: "main", exerciseIndex: 0 }]);
  });

  it("no blocks — a plain workout keeps its flat order and no chapters", () => {
    const steps = buildChapterSteps(sections(null, null, null), []);
    expect(steps).toEqual([
      { kind: "exercise", block: null, exerciseIndex: 0 },
      { kind: "exercise", block: null, exerciseIndex: 1 },
      { kind: "exercise", block: null, exerciseIndex: 2 },
    ]);
  });

  it("an exercise no block claims still gets logged — appended, unchaptered", () => {
    // `bfr` has no block; a section whose block row is missing lands here too.
    const steps = buildChapterSteps(
      sections("main", "bfr"),
      [block("main")],
    );
    expect(steps).toEqual([
      { kind: "exercise", block: "main", exerciseIndex: 0 },
      { kind: "exercise", block: null, exerciseIndex: 1 },
    ]);
  });

  it("every exercise appears exactly once", () => {
    const steps = buildChapterSteps(
      sections("warmup", "main", "main", "accessory", "cooldown", "bfr"),
      [block("warmup"), block("mobility", { builtinKey: "b-mo" }), block("main"),
        block("conditioning"), block("cooldown")],
    );
    const indices = steps
      .filter((s) => s.kind === "exercise")
      .map((s: any) => s.exerciseIndex as number)
      .sort((a: number, b: number) => a - b);
    expect(indices).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("chapterBlocks", () => {
  const blocks = [
    block("warmup", { minutes: 5 }),
    block("main", { minutes: 30 }),
    block("cooldown", { builtinKey: "b-cd", minutes: 7 }),
  ];
  const steps = buildChapterSteps(sections("warmup", "main", "main"), blocks);

  it("summarizes each block that has steps, in order", () => {
    expect(chapterBlocks(steps, blocks)).toEqual([
      { block: "warmup", name: "warmup workout", minutes: 5, builtinKey: null, firstStep: 0, stepCount: 1 },
      { block: "main", name: "main workout", minutes: 30, builtinKey: null, firstStep: 1, stepCount: 2 },
      { block: "cooldown", name: "cooldown workout", minutes: 7, builtinKey: "b-cd", firstStep: 3, stepCount: 1 },
    ]);
  });

  it("is empty when nothing is chaptered", () => {
    expect(chapterBlocks(buildChapterSteps(sections(null), []), [])).toEqual([]);
  });
});

describe("blockProgress", () => {
  const blocks = [block("warmup"), block("main")];
  const steps = buildChapterSteps(sections("warmup", "warmup", "main"), blocks);

  it("counts within the block, not the day", () => {
    expect(blockProgress(steps, 1)).toEqual({ block: "warmup", index: 1, count: 2 });
    expect(blockProgress(steps, 2)).toEqual({ block: "main", index: 0, count: 1 });
  });

  it("is null off the end and for unchaptered steps", () => {
    expect(blockProgress(steps, 99)).toBeNull();
    expect(blockProgress(buildChapterSteps(sections(null), []), 0)).toBeNull();
  });
});

describe("crossedBoundary", () => {
  const blocks = [block("warmup"), block("main")];
  const steps = buildChapterSteps(sections("warmup", "main"), blocks);

  it("names the block being entered when moving forward across a seam", () => {
    expect(crossedBoundary(steps, 0, 1)).toEqual({ from: "warmup", to: "main" });
  });

  it("says nothing when both steps are in the same block", () => {
    const long = buildChapterSteps(sections("main", "main"), [block("main")]);
    expect(crossedBoundary(long, 0, 1)).toBeNull();
  });

  it("says nothing going backwards — a chapter card is a forward event", () => {
    expect(crossedBoundary(steps, 1, 0)).toBeNull();
  });

  it("says nothing when either side is unchaptered", () => {
    const flat = buildChapterSteps(sections(null, null), []);
    expect(crossedBoundary(flat, 0, 1)).toBeNull();
  });
});
