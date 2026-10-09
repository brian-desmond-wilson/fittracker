// The live session's chapter model: what the day looks like when you are
// performing it, rather than when you are reading it. A composed day is a
// handful of blocks, and the logging screen walks them one chapter at a time
// — so this turns the flat exercise list plus the session's block rows into
// an ordered list of STEPS, some of which are built-in routines with nothing
// to log.
//
// A chapter is a block ROW, not a block role: a 2-hour day carries two mains
// back to back, and each is its own chapter with its own name, minutes and
// movements. Every step names the row it belongs to (`chapter`, the row id)
// as well as the role (`block`), which the screen still uses for colour and
// titles.
//
// Pure, and deliberately ignorant of components: the screen owns navigation
// and rendering, this owns the shape of the walk. Approved mockups
// "Live session — segmented flow" (2026-08-19) are the decision record.
import { SECTION_FOR_BLOCK, sortSessionBlocks } from "./dailyBlockCompose";
import type { SessionSection } from "../types/daily";
import type { BlockRole } from "../types/dailyBlocks";

/**
 * One stop in the walk.
 *
 * `block` and `chapter` are null for an exercise no block claims — a `bfr`
 * item, or one whose block row is missing. Those are still logged; they
 * simply have no chapter, and the header falls back to the flat presentation
 * for them.
 */
export type ChapterStep =
  | { kind: "exercise"; block: BlockRole | null; chapter: string | null; exerciseIndex: number }
  | { kind: "builtin"; block: BlockRole; chapter: string; builtinKey: string };

/** What a block row has to tell this module. A subset of StoredBlock, so the
 *  screen can pass its rows straight in. */
export interface ChapterBlockRow {
  id: string;
  block: BlockRole;
  /** `block_position`; see sortSessionBlocks. */
  position: number;
  name: string;
  minutes: number;
  builtinKey: string | null;
  workoutId: string | null;
  dismissed: boolean;
}

/** What an exercise row has to tell this module: the section it was stored
 *  under, and the block row it was exploded from when that is known. */
export interface ChapterExercise {
  section: SessionSection | null;
  blockId: string | null;
}

/** A block as the header, the interstitial and the overview need it. */
export interface ChapterBlockSummary {
  /** The block row id — the chapter's identity. */
  id: string;
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
 * composer gave them. An exercise that names its block row goes to that row;
 * one that names none goes to the first block whose role owns its section —
 * the only reading that existed before roles could repeat. An exercise no
 * block claims is appended afterwards rather than dropped — a session that
 * hides a movement you are meant to log is worse than one with an
 * unchaptered tail.
 *
 * With no block rows at all — a program workout, a captured workout served
 * whole, a session composed before blocks existed — this is the flat list
 * unchanged, every step unchaptered. That is what keeps the old carousel
 * behaviour byte-identical for everything that is not a composed day.
 */
export function buildChapterSteps(
  exercises: readonly ChapterExercise[],
  blocks: readonly ChapterBlockRow[],
): ChapterStep[] {
  const live = sortSessionBlocks(blocks.filter((b) => !b.dismissed));
  if (live.length === 0) {
    return exercises.map((_, exerciseIndex) => ({
      kind: "exercise", block: null, chapter: null, exerciseIndex,
    }));
  }

  const steps: ChapterStep[] = [];
  const claimed = new Set<number>();
  const seenRole = new Set<BlockRole>();

  for (const row of live) {
    const section = SECTION_FOR_BLOCK[row.block];
    const firstOfRole = !seenRole.has(row.block);
    seenRole.add(row.block);
    const mine = exercises
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) =>
        !claimed.has(i)
        && (e.blockId === row.id || (firstOfRole && !e.blockId && e.section === section)));
    if (mine.length > 0) {
      for (const { i } of mine) {
        claimed.add(i);
        steps.push({ kind: "exercise", block: row.block, chapter: row.id, exerciseIndex: i });
      }
      continue;
    }
    // No loggable work: a built-in routine is the block, and anything else is
    // a block whose workout is gone — nothing to perform, so nothing to show.
    if (row.builtinKey) {
      steps.push({ kind: "builtin", block: row.block, chapter: row.id, builtinKey: row.builtinKey });
    }
  }

  for (let i = 0; i < exercises.length; i++) {
    if (!claimed.has(i)) {
      steps.push({ kind: "exercise", block: null, chapter: null, exerciseIndex: i });
    }
  }
  return steps;
}

/** The chapters, in step order — only blocks that actually contribute steps. */
export function chapterBlocks(
  steps: readonly ChapterStep[],
  blocks: readonly ChapterBlockRow[],
): ChapterBlockSummary[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const out: ChapterBlockSummary[] = [];
  steps.forEach((step, i) => {
    if (step.chapter === null || step.block === null) return;
    const last = out[out.length - 1];
    if (last && last.id === step.chapter) {
      last.stepCount += 1;
      return;
    }
    const row = byId.get(step.chapter);
    out.push({
      id: step.chapter,
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
  steps: readonly ChapterStep[],
  stepIndex: number,
): { block: BlockRole; chapter: string; index: number; count: number } | null {
  const step = steps[stepIndex];
  if (!step || step.chapter === null || step.block === null) return null;
  const siblings: number[] = [];
  steps.forEach((s, i) => {
    if (s.chapter === step.chapter) siblings.push(i);
  });
  return {
    block: step.block,
    chapter: step.chapter,
    index: siblings.indexOf(stepIndex),
    count: siblings.length,
  };
}

/**
 * The seam between two chapters, when walking off the end of one into the
 * next — the moment a chapter card marks. Named by chapter (block row id):
 * walking from the first main into the second is a seam like any other.
 *
 * The NEXT step, and only that. Two exclusions, both learned the hard way:
 * backwards is not a finish (swiping back to fix a set you mislogged is not
 * an event to celebrate), and neither is a jump. Landing on the mobility
 * block from the overview means the warm-up steps in between were never
 * walked, so announcing the warm-up complete is a claim about work that was
 * skipped, not done. Exploring the session must stay free of ceremony.
 *
 * Null whenever either side is unchaptered, so a flat workout never sees one.
 */
export function crossedBoundary(
  steps: readonly ChapterStep[],
  fromIndex: number,
  toIndex: number,
): { from: string; to: string } | null {
  if (toIndex !== fromIndex + 1) return null;
  const from = steps[fromIndex]?.chapter ?? null;
  const to = steps[toIndex]?.chapter ?? null;
  if (from === null || to === null || from === to) return null;
  return { from, to };
}
