// Rules-only block composition (the "you always get a session" fallback), the
// validator that constrains the AI's picks to what it was offered, and the
// reroll cycling. Fuel-plan doctrine, enforced client-side. Spec §5.
import type {
  BlockCandidate,
  BlockPick,
  BlockRole,
  BlockShortlists,
} from "../types/dailyBlocks";
import type { SessionSection } from "../types/daily";

export const BLOCK_ORDER: BlockRole[] = [
  "warmup", "mobility", "main", "conditioning", "cooldown",
];

/** How a block is named to the athlete. Lives here rather than in one screen
 *  because both the Today card and the catalog list label the same roles, and
 *  two copies would drift. */
export const BLOCK_TITLES: Record<BlockRole, string> = {
  warmup: "Warm-up",
  mobility: "Mobility",
  main: "Main workout",
  conditioning: "Conditioning",
  cooldown: "Cool-down",
};

/** §7: mobility is a new section; conditioning reuses the accessory slot. */
export const SECTION_FOR_BLOCK: Record<BlockRole, SessionSection> = {
  warmup: "warmup",
  mobility: "mobility",
  main: "main",
  conditioning: "accessory",
  cooldown: "cooldown",
};

/** The model may overrun the day slightly; past this it stopped adding. */
const OVERRUN_TOLERANCE = 1.1;

/**
 * What a stored block plan IS, for the screens that describe it.
 *
 * `trained` — there is a main workout, and the day is named after it.
 * `recovery` — mobility and cool-down only, because the check-in said so
 *   (spec §6). Recovery envelopes carry no warm-up at all.
 * `thin` — a training day whose catalog could field no main. Every training
 *   day gets a warm-up block, because a warm-up built-in always backstops that
 *   shortlist, so a warm-up beside a missing main is the catalog falling short
 *   of today's constraints and not the user being beaten up (spec §8).
 *
 * Null for a session with no block rows — a legacy composition or a workout
 * served whole, about which this vocabulary says nothing.
 *
 * One derivation, three screens: reading "no main" as recovery in each of them
 * separately is exactly how a 30-minute day came to be told it was sore.
 */
export type BlockDayShape = "trained" | "recovery" | "thin";

export function blockDayShape(
  blocks: readonly { block: BlockRole }[],
): BlockDayShape | null {
  if (blocks.length === 0) return null;
  if (blocks.some((b) => b.block === "main")) return "trained";
  return blocks.some((b) => b.block === "warmup") ? "thin" : "recovery";
}

function pickFrom(candidate: BlockCandidate, block: BlockRole, reason: string | null): BlockPick {
  return {
    block,
    workoutId: candidate.workoutId,
    builtinKey: candidate.builtinKey,
    // Carried onto the row, not resolved by join at read time: a session's
    // history has to survive the workout being deleted.
    name: candidate.name,
    minutes: candidate.minutes,
    roundsNote: candidate.roundsNote,
    reason,
  };
}

/**
 * The rules-only session: per block, in block order, the highest-ranked
 * candidate the budget still allows. It spends against the validator's ceiling
 * because of when it runs — this is the path taken when the model's answer was
 * rejected, often for overrunning, and handing the same day back with the
 * rationale stripped would make the rejection meaningless.
 *
 * It spends against that ceiling; it does not guarantee it. When nothing in a
 * block fits, conditioning drops out and every other block keeps its shortest
 * candidate and overruns — and below the 75-minute conditioning floor there is
 * nothing optional to drop, so the overrun can cascade: 45 minutes of envelope
 * maxima composes to 60. Deliberate. The durations are the creators', not ours
 * to shrink, and a complete session that runs long beats a mutilated one. The
 * Today tab flags a plan that overruns what the user said they had.
 */
export function composeBlockFallback(
  shortlists: BlockShortlists,
  minutesAvailable: number,
): BlockPick[] {
  // Unlike the validator, this path cannot refuse: a budget that isn't a
  // positive number (NaN included — it fails the comparison) bounds nothing,
  // and you still get a session.
  const ceiling = minutesAvailable > 0 ? minutesAvailable * OVERRUN_TOLERANCE : Infinity;

  const picks: BlockPick[] = [];
  let total = 0;
  for (const block of BLOCK_ORDER) {
    const list = shortlists[block];
    if (!list || list.length === 0) continue;
    // Rank decides; a candidate that doesn't fit is skipped, never re-ranked by
    // size. Nothing fits at all: conditioning is the optional block and drops
    // out, every other block keeps its shortest — a short warm-up is still a
    // warm-up, and a day without one isn't the session we promised.
    const fitted = list.find((c) => total + c.minutes <= ceiling);
    if (!fitted && block === "conditioning") continue;
    const chosen = fitted ?? list.reduce((a, b) => (b.minutes < a.minutes ? b : a));
    picks.push(pickFrom(chosen, block, null));
    total += chosen.minutes;
  }
  return picks;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/**
 * Null means "unusable answer" — the caller falls back to rules. Minutes and
 * round notes always come from the shortlist candidate, never from the model:
 * rules keep the numbers, the model picks and explains.
 *
 * Every departure from the contract is fatal, not skipped. Dropping one bad
 * entry and keeping the rest silently hands back a day missing a block, which
 * is worse than the complete day the rules fallback would have given — and an
 * entry the model invented is evidence the rest of the answer is invented too.
 * A repeated block is the one exception: it is redundant rather than wrong, so
 * the first mention stands and the rest of the answer survives.
 *
 * The rule is not free: rejecting an otherwise good answer over one malformed
 * sibling entry can replace a day that fit with a rules day that runs longer,
 * since the fallback overruns rather than drop a block. Still the right trade —
 * a long day is visible, a missing cool-down is not.
 */
export function validateBlockComposition(
  raw: unknown,
  shortlists: BlockShortlists,
  minutesAvailable: number,
): BlockPick[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const blocks = (raw as Record<string, unknown>).blocks;
  if (!Array.isArray(blocks)) return null;

  const picks = new Map<BlockRole, BlockPick>();
  for (const entry of blocks) {
    if (typeof entry !== "object" || entry === null) return null;
    const e = entry as Record<string, unknown>;
    const named = e.block;
    if (typeof named !== "string" || !BLOCK_ORDER.includes(named as BlockRole)) return null;
    const block = named as BlockRole;
    if (picks.has(block)) continue; // first mention wins
    // A block with no key was never in the day at all; a block whose key holds
    // an empty list was in the day with nothing to offer. Either way the model
    // is naming something it cannot have been given, and the `find` below has
    // no list to search.
    const list = shortlists[block];
    if (!list) return null;
    const id = str(e.id);
    if (!id) return null;
    const candidate = list.find((c) => c.workoutId === id || c.builtinKey === id);
    if (!candidate) return null; // an id we never offered — unusable
    picks.set(block, pickFrom(candidate, block, str(e.reason)));
  }

  if (picks.size === 0) return null;
  // Every block that was OFFERED comes back, conditioning aside — which is
  // exactly what the edge function's prompt asks for, and nothing until now
  // checked that it got it. Judged on the candidates a shortlist actually
  // holds, not on the key's presence: a thin catalog leaves `main: []`, and
  // there is no main to miss.
  //
  // Rejecting beats patching the missing block in. The rules fallback picks
  // for every offered block, so a rejected answer degrades to a complete day
  // rather than a day half composed by the model and half by us — the trade
  // this whole tier already makes.
  //
  // It is more than tidiness for the warm-up: the screens tell a recovery day
  // from a catalog too thin to field a main by whether a warm-up block exists,
  // so an answer that quietly dropped one would tell someone who said they
  // felt fine that they were beat up.
  for (const block of BLOCK_ORDER) {
    // The one optional block (spec §3.3): the model may drop it when the day
    // is better without it or the minutes don't allow it.
    if (block === "conditioning") continue;
    if ((shortlists[block]?.length ?? 0) > 0 && !picks.has(block)) return null;
  }

  // A non-finite budget makes every comparison false, so the overrun check
  // would silently pass anything. Refuse rather than validate against NaN —
  // the time envelopes already fall back to a short day upstream.
  if (!Number.isFinite(minutesAvailable) || minutesAvailable <= 0) return null;
  const total = [...picks.values()].reduce((s, p) => s + p.minutes, 0);
  if (total > minutesAvailable * OVERRUN_TOLERANCE) return null;

  return BLOCK_ORDER.filter((b) => picks.has(b)).map((b) => picks.get(b)!);
}

/** The next shortlist entry after the current pick, wrapping; null when the
 *  list has nowhere else to go. Reroll swaps ONE block (spec §6). */
export function nextCandidate(
  list: BlockCandidate[],
  currentId: string,
): BlockCandidate | null {
  if (list.length === 0) return null;
  const idx = list.findIndex((c) => c.workoutId === currentId || c.builtinKey === currentId);
  // The pick has left the shortlist — deleted, untagged, or this is a fresh
  // day's list. Anything in the list beats leaving the reroll button dead.
  if (idx === -1) return list[0];
  if (list.length < 2) return null;
  return list[(idx + 1) % list.length];
}
