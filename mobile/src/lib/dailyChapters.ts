// The live session's chapter model: what the day looks like when you are
// performing it, rather than when you are reading it. A composed day is five
// blocks, and the logging screen walks them one chapter at a time — so this
// turns the flat exercise list plus the session's block rows into an ordered
// list of STEPS, some of which are built-in routines with nothing to log.
//
// Pure, and deliberately ignorant of components: the screen owns navigation
// and rendering, this owns the shape of the walk. Approved mockups
// "Live session — segmented flow" (2026-08-19) are the decision record.
import { BLOCK_ORDER, SECTION_FOR_BLOCK } from "./dailyBlockCompose";
import type { SessionSection } from "../types/daily";
import type { BlockRole } from "../types/dailyBlocks";

/**
 * One stop in the walk.
 *
 * `block` is null for an exercise no block claims — a `bfr` item, or one whose
 * block row is missing. Those are still logged; they simply have no chapter,
 * and the header falls back to the flat presentation for them.
 */
export type ChapterStep =
  | { kind: "exercise"; block: BlockRole | null; exerciseIndex: number }
  | { kind: "builtin"; block: BlockRole; builtinKey: string };

/** What a block row has to tell this module. A subset of StoredBlock, so the
 *  screen can pass its rows straight in. */
export interface ChapterBlockRow {
  block: BlockRole;
  name: string;
  minutes: number;
  builtinKey: string | null;
  workoutId: string | null;
  dismissed: boolean;
}

/** A block as the header, the interstitial and the overview need it. */
export interface ChapterBlockSummary {
  block: BlockRole;
  name: string;
  minutes: number;
  builtinKey: string | null;
  /** Where this block starts in the step list, and how long it runs. */
  firstStep: number;
  stepCount: number;
}

/**
 * The order the session is performed in.
 *
 * Blocks lead: every block that has work contributes its steps, in the order
 * the day is trained, and the exercises inside a block keep the order the
 * composer gave them. An exercise whose section no block claims is appended
 * afterwards rather than dropped — a session that hides a movement you are
 * meant to log is worse than one with an unchaptered tail.
 *
 * With no block rows at all — a program workout, a captured workout served
 * whole, a session composed before blocks existed — this is the flat list
 * unchanged, every step unchaptered. That is what keeps the old carousel
 * behaviour byte-identical for everything that is not a composed day.
 */
export function buildChapterSteps(
  sections: (SessionSection | null)[],
  blocks: ChapterBlockRow[],
): ChapterStep[] {
  const live = blocks.filter((b) => !b.dismissed);
  if (live.length === 0) {
    return sections.map((_, exerciseIndex) => ({
      kind: "exercise", block: null, exerciseIndex,
    }));
  }

  const steps: ChapterStep[] = [];
  const claimed = new Set<number>();
  const byRole = new Map(live.map((b) => [b.block, b]));

  for (const role of BLOCK_ORDER) {
    const row = byRole.get(role);
    if (!row) continue;
    const section = SECTION_FOR_BLOCK[role];
    const mine = sections
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => s === section && !claimed.has(i));
    if (mine.length > 0) {
      for (const { i } of mine) {
        claimed.add(i);
        steps.push({ kind: "exercise", block: role, exerciseIndex: i });
      }
      continue;
    }
    // No loggable work: a built-in routine is the block, and anything else is
    // a block whose workout is gone — nothing to perform, so nothing to show.
    if (row.builtinKey) {
      steps.push({ kind: "builtin", block: role, builtinKey: row.builtinKey });
    }
  }

  for (let i = 0; i < sections.length; i++) {
    if (!claimed.has(i)) steps.push({ kind: "exercise", block: null, exerciseIndex: i });
  }
  return steps;
}

/** The chapters, in step order — only blocks that actually contribute steps. */
export function chapterBlocks(
  steps: ChapterStep[],
  blocks: ChapterBlockRow[],
): ChapterBlockSummary[] {
  const byRole = new Map(blocks.map((b) => [b.block, b]));
  const out: ChapterBlockSummary[] = [];
  steps.forEach((step, i) => {
    if (step.block === null) return;
    const last = out[out.length - 1];
    if (last && last.block === step.block) {
      last.stepCount += 1;
      return;
    }
    const row = byRole.get(step.block);
    out.push({
      block: step.block,
      name: row?.name ?? step.block,
      minutes: row?.minutes ?? 0,
      builtinKey: row?.builtinKey ?? null,
      firstStep: i,
      stepCount: 1,
    });
  });
  return out;
}

/** Where you are inside your current chapter — "exercise 2 of 5", not
 *  "7 of 25". Null when the step belongs to no block. */
export function blockProgress(
  steps: ChapterStep[],
  stepIndex: number,
): { block: BlockRole; index: number; count: number } | null {
  const step = steps[stepIndex];
  if (!step || step.block === null) return null;
  const siblings: number[] = [];
  steps.forEach((s, i) => {
    if (s.block === step.block) siblings.push(i);
  });
  return {
    block: step.block,
    index: siblings.indexOf(stepIndex),
    count: siblings.length,
  };
}

/**
 * The seam between two chapters, when moving FORWARD across one.
 *
 * Forward only, deliberately: the chapter card marks finishing a block, and
 * swiping back to fix a set you mislogged is not an event to celebrate. Null
 * whenever either side is unchaptered, so a flat workout never sees one.
 */
export function crossedBoundary(
  steps: ChapterStep[],
  fromIndex: number,
  toIndex: number,
): { from: BlockRole; to: BlockRole } | null {
  if (toIndex <= fromIndex) return null;
  const from = steps[fromIndex]?.block ?? null;
  const to = steps[toIndex]?.block ?? null;
  if (from === null || to === null || from === to) return null;
  return { from, to };
}
