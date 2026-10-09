import {
  buildChapterSteps,
  chapterBlocks,
  blockProgress,
  crossedBoundary,
} from "../dailyChapters";
import type { ChapterExercise } from "../dailyChapters";
import type { SessionSection } from "../../types/daily";
import type { BlockRole } from "../../types/dailyBlocks";

const block = (
  b: BlockRole,
  over: {
    id?: string;
    position?: number;
    builtinKey?: string | null;
    dismissed?: boolean;
    minutes?: number;
    name?: string;
  } = {},
) => ({
  id: over.id ?? `row-${b}`,
  block: b,
  position: over.position ?? 0,
  name: over.name ?? `${b} workout`,
  minutes: over.minutes ?? 10,
  builtinKey: over.builtinKey ?? null,
  workoutId: over.builtinKey ? null : `wo-${b}`,
  dismissed: over.dismissed ?? false,
});

// sections aligned to exerciseStates order, as the screen holds them —
// legacy rows that name no block.
const sections = (...s: (SessionSection | null)[]): ChapterExercise[] =>
  s.map((section) => ({ section, blockId: null }));

const ex = (section: SessionSection, blockId: string | null): ChapterExercise =>
  ({ section, blockId });

describe("buildChapterSteps", () => {
  it("walks blocks in performed order, exercises inside each", () => {
    const steps = buildChapterSteps(
      sections("main", "warmup", "main", "cooldown"),
      [block("warmup"), block("main"), block("cooldown")],
    );
    expect(steps).toEqual([
      { kind: "exercise", block: "warmup", chapter: "row-warmup", exerciseIndex: 1 },
      { kind: "exercise", block: "main", chapter: "row-main", exerciseIndex: 0 },
      { kind: "exercise", block: "main", chapter: "row-main", exerciseIndex: 2 },
      { kind: "exercise", block: "cooldown", chapter: "row-cooldown", exerciseIndex: 3 },
    ]);
  });

  it("conditioning owns the accessory section", () => {
    const steps = buildChapterSteps(sections("accessory"), [block("conditioning")]);
    expect(steps).toEqual([
      { kind: "exercise", block: "conditioning", chapter: "row-conditioning", exerciseIndex: 0 },
    ]);
  });

  it("a block with no exercises becomes its built-in card", () => {
    const steps = buildChapterSteps(
      sections("main"),
      [block("main"), block("cooldown", { builtinKey: "builtin-cooldown-full" })],
    );
    expect(steps).toEqual([
      { kind: "exercise", block: "main", chapter: "row-main", exerciseIndex: 0 },
      { kind: "builtin", block: "cooldown", chapter: "row-cooldown", builtinKey: "builtin-cooldown-full" },
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
    expect(steps).toEqual([
      { kind: "exercise", block: "main", chapter: "row-main", exerciseIndex: 0 },
    ]);
  });

  it("a block with neither exercises nor a built-in is skipped", () => {
    const steps = buildChapterSteps(
      sections("main"),
      [block("main"), { ...block("cooldown"), workoutId: null, builtinKey: null }],
    );
    expect(steps).toEqual([
      { kind: "exercise", block: "main", chapter: "row-main", exerciseIndex: 0 },
    ]);
  });

  it("no blocks — a plain workout keeps its flat order and no chapters", () => {
    const steps = buildChapterSteps(sections(null, null, null), []);
    expect(steps).toEqual([
      { kind: "exercise", block: null, chapter: null, exerciseIndex: 0 },
      { kind: "exercise", block: null, chapter: null, exerciseIndex: 1 },
      { kind: "exercise", block: null, chapter: null, exerciseIndex: 2 },
    ]);
  });

  it("an exercise no block claims still gets logged — appended, unchaptered", () => {
    // `bfr` has no block; a section whose block row is missing lands here too.
    const steps = buildChapterSteps(
      sections("main", "bfr"),
      [block("main")],
    );
    expect(steps).toEqual([
      { kind: "exercise", block: "main", chapter: "row-main", exerciseIndex: 0 },
      { kind: "exercise", block: null, chapter: null, exerciseIndex: 1 },
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

  describe("a 2-hour day: repeated roles, ordered by block_position", () => {
    // 2026-10-09: warmup → Dumbbell Only → 20-Min AMRAP → Core Strength →
    // Bodyweight AMRAP → cooldown. Two mains, two conditioning blocks.
    const day = [
      block("warmup", { id: "wu", position: 0, builtinKey: "builtin-warmup-full" }),
      block("main", { id: "m1", position: 1, name: "Dumbbell Only Workout" }),
      block("main", { id: "m2", position: 2, name: "20-Min AMRAP" }),
      block("conditioning", { id: "c1", position: 3, name: "Core Strength Workout" }),
      block("conditioning", { id: "c2", position: 4, name: "Bodyweight AMRAP" }),
      block("cooldown", { id: "cd", position: 5, builtinKey: "builtin-cooldown-full" }),
    ];
    const exercises = [
      ex("main", "m1"), ex("main", "m1"),
      ex("main", "m2"),
      ex("accessory", "c1"), ex("accessory", "c1"),
      ex("accessory", "c2"),
    ];

    it("each block owns only the items that name it, in position order", () => {
      const steps = buildChapterSteps(exercises, day);
      expect(steps).toEqual([
        { kind: "builtin", block: "warmup", chapter: "wu", builtinKey: "builtin-warmup-full" },
        { kind: "exercise", block: "main", chapter: "m1", exerciseIndex: 0 },
        { kind: "exercise", block: "main", chapter: "m1", exerciseIndex: 1 },
        { kind: "exercise", block: "main", chapter: "m2", exerciseIndex: 2 },
        { kind: "exercise", block: "conditioning", chapter: "c1", exerciseIndex: 3 },
        { kind: "exercise", block: "conditioning", chapter: "c1", exerciseIndex: 4 },
        { kind: "exercise", block: "conditioning", chapter: "c2", exerciseIndex: 5 },
        { kind: "builtin", block: "cooldown", chapter: "cd", builtinKey: "builtin-cooldown-full" },
      ]);
    });

    it("position beats role order — rows arrive shuffled and still walk the day", () => {
      const shuffled = [day[4], day[2], day[5], day[0], day[3], day[1]];
      expect(buildChapterSteps(exercises, shuffled)).toEqual(buildChapterSteps(exercises, day));
    });

    it("the two mains are two chapters, back to back", () => {
      const steps = buildChapterSteps(exercises, day);
      const chapters = chapterBlocks(steps, day);
      expect(chapters.map((c) => [c.id, c.name, c.firstStep, c.stepCount])).toEqual([
        ["wu", "warmup workout", 0, 1],
        ["m1", "Dumbbell Only Workout", 1, 2],
        ["m2", "20-Min AMRAP", 3, 1],
        ["c1", "Core Strength Workout", 4, 2],
        ["c2", "Bodyweight AMRAP", 6, 1],
        ["cd", "cooldown workout", 7, 1],
      ]);
      expect(crossedBoundary(steps, 2, 3)).toEqual({ from: "m1", to: "m2" });
      expect(blockProgress(steps, 3)).toEqual({ block: "main", chapter: "m2", index: 0, count: 1 });
    });

    it("an unattributed item goes to the FIRST block of its role, never both", () => {
      const steps = buildChapterSteps([ex("main", null), ex("main", "m2")], day);
      expect(steps.filter((s) => s.kind === "exercise")).toEqual([
        { kind: "exercise", block: "main", chapter: "m1", exerciseIndex: 0 },
        { kind: "exercise", block: "main", chapter: "m2", exerciseIndex: 1 },
      ]);
    });
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
      { id: "row-warmup", block: "warmup", name: "warmup workout", minutes: 5, builtinKey: null, firstStep: 0, stepCount: 1 },
      { id: "row-main", block: "main", name: "main workout", minutes: 30, builtinKey: null, firstStep: 1, stepCount: 2 },
      { id: "row-cooldown", block: "cooldown", name: "cooldown workout", minutes: 7, builtinKey: "b-cd", firstStep: 3, stepCount: 1 },
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
    expect(blockProgress(steps, 1)).toEqual({ block: "warmup", chapter: "row-warmup", index: 1, count: 2 });
    expect(blockProgress(steps, 2)).toEqual({ block: "main", chapter: "row-main", index: 0, count: 1 });
  });

  it("is null off the end and for unchaptered steps", () => {
    expect(blockProgress(steps, 99)).toBeNull();
    expect(blockProgress(buildChapterSteps(sections(null), []), 0)).toBeNull();
  });
});

describe("crossedBoundary", () => {
  const blocks = [block("warmup"), block("main")];
  const steps = buildChapterSteps(sections("warmup", "main"), blocks);

  it("names the chapter being entered when stepping forward off the end of one", () => {
    expect(crossedBoundary(steps, 0, 1)).toEqual({ from: "row-warmup", to: "row-main" });
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

  it("says nothing when the move SKIPS steps — a jump is exploring, not finishing", () => {
    // warm-up ×2 → main: landing on main from the FIRST warm-up exercise
    // means the second was never reached, so nothing was completed.
    const long = buildChapterSteps(sections("warmup", "warmup", "main"), blocks);
    expect(crossedBoundary(long, 0, 2)).toBeNull();
    expect(crossedBoundary(long, 1, 2)).toEqual({ from: "row-warmup", to: "row-main" });
  });

  it("says nothing when jumping backwards over several steps", () => {
    const long = buildChapterSteps(sections("warmup", "warmup", "main"), blocks);
    expect(crossedBoundary(long, 2, 0)).toBeNull();
  });
});
