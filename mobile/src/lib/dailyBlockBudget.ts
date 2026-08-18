// The block session's time arithmetic: what each block may cost, and how a
// catalog workout is trimmed or extended (by whole rounds) to fit. All
// deterministic — the AI picks candidates whose minutes are already decided.
// Spec §4 steps 4-5.
import type { BlockEnvelope, BlockRole } from "../types/dailyBlocks";

/**
 * Under this many total minutes, support blocks compress (spec §8). A step,
 * not a curve, so it moves main backwards at the boundary: 44 minutes gives
 * main 29-35, 45 gives it 15-30. Smoothing it is a spec change.
 */
const SHORT_DAY = 45;
/** Conditioning exists only above this (spec §4), bought from main: 74
 *  minutes gives main 44-59, 75 gives it 25-50. */
const CONDITIONING_FLOOR = 75;
/** How far over its ceiling a roundless workout may be capped from. */
const CAP_TOLERANCE = 1.25;
/** How far under its floor a workout may be and still be worth the block. */
const FLOOR_TOLERANCE = 0.75;
/** Extension fires only below this fraction of the floor: a whole round is
 *  real work and has to buy a real gap, not a rounding error. */
const EXTEND_BELOW = 0.8;
/** What a broken budget falls back to. NaN is the dangerous input: NaN
 *  envelopes fail silently, since every comparison in `fitToEnvelope` is
 *  false against NaN and every candidate passes through unfitted. */
const FALLBACK_BUDGET = 20;

/**
 * What each block may cost, in the order the blocks are performed (RAMP).
 *
 * These are independent ranges, NOT a partition of the day — every block
 * taking its max would overrun the budget. The envelope says what a block is
 * allowed to be; composition keeps the total honest (spec §5 re-validates to
 * ±10%). Main is the remainder rather than a fraction, because main is the
 * point of the day: everything else states its appetite, main eats the rest.
 */
export function blockEnvelopes(minutes: number, recoveryDay: boolean): BlockEnvelope[] {
  // Rounded as well as guarded, so every envelope below is whole minutes.
  const budget = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : FALLBACK_BUDGET;

  if (recoveryDay) {
    // Mobility and cool-down only, deliberately (spec §6), split 60/40 toward
    // the stretching. The floors hold a recovery day to 15 minutes minimum.
    const mobility = Math.max(10, Math.round(budget * 0.6));
    const cooldown = Math.max(5, Math.min(budget - mobility, Math.round(budget * 0.4)));
    return [
      { block: "mobility", minMinutes: 5, maxMinutes: mobility },
      { block: "cooldown", minMinutes: 5, maxMinutes: cooldown },
    ];
  }

  const short = budget < SHORT_DAY;
  const supportMin = short ? 3 : 5;
  const supportMax = short ? 5 : 10;
  const support = (block: BlockRole): BlockEnvelope =>
    ({ block, minMinutes: supportMin, maxMinutes: supportMax });

  const warmup = support("warmup");
  const mobility = support("mobility");
  const cooldown = support("cooldown");
  const conditioning: BlockEnvelope | null = budget >= CONDITIONING_FLOOR
    ? { block: "conditioning", minMinutes: 10, maxMinutes: 20 }
    : null;

  // Main's floor assumes everything else runs long, its ceiling that they run
  // short. The 10 and 15 keep a tiny budget from asking for a negative main.
  const aroundMain = [warmup, mobility, cooldown, ...(conditioning ? [conditioning] : [])];
  const minTaken = aroundMain.reduce((s, e) => s + e.minMinutes, 0);
  const maxTaken = aroundMain.reduce((s, e) => s + e.maxMinutes, 0);
  const main: BlockEnvelope = {
    block: "main",
    minMinutes: Math.max(10, budget - maxTaken),
    maxMinutes: Math.max(15, budget - minTaken),
  };

  return [warmup, mobility, main, ...(conditioning ? [conditioning] : []), cooldown];
}

export interface FittedDuration {
  minutes: number;
  roundsNote: string | null;
}

/** A count followed by a time unit is a duration, not a round count. */
const TIME_UNIT = /^\s*x?\s*(minutes|minute|mins|min|seconds|second|secs|sec|hours|hour|hrs|hr|m|s|h)\b/i;

/**
 * Top of a rounds prescription: "3-4" → 4, "REPEAT 3-4x rounds" → 4.
 *
 * The column holds the creator's own words, so only the first count is read,
 * after a word or two of preamble. Taking the largest digit-run anywhere reads
 * "3 rounds of 12 reps" as twelve and "AMRAP 20 min" — a documented value — as
 * twenty rounds to offer to trim fifteen of. Anything else, a single round
 * included, reads as roundless and falls back to capping.
 */
function topRounds(rounds: string | null): number | null {
  if (!rounds) return null;
  const text = rounds.trim().replace(/^(?:[a-z]+\s+){1,2}/i, "");
  const match = text.match(/^(\d+)\s*(?:[-–—]\s*(\d+))?/);
  if (!match) return null;
  if (TIME_UNIT.test(text.slice(match[0].length))) return null;
  const top = match[2] === undefined
    ? Number(match[1])
    : Math.max(Number(match[1]), Number(match[2]));
  return top >= 2 ? top : null;
}

/**
 * Fit a CATALOG workout's estimated duration to a block's envelope, by whole
 * rounds when the creator wrote rounds, never more than doubling them. Null =
 * cannot fit, and the workout leaves the shortlist. Built-ins never come
 * through here; the shortlist builder appends them and clamps them itself.
 *
 * Whole rounds are the only honest way to shorten someone else's workout —
 * "do 3 of 4" is a thing you can perform, "do 46 minutes of a 60-minute
 * workout" is not. Both ends are bounded, but the ceiling binds harder: over
 * the envelope overruns the day, while under it is merely a short block until
 * it is too short to be this block's main event.
 */
export function fitToEnvelope(
  estMinutes: number | null,
  rounds: string | null,
  env: BlockEnvelope,
): FittedDuration | null {
  // AI-assigned at capture, so it can arrive missing or nonsensical. Minutes
  // are displayed and summed, so they come back whole.
  if (estMinutes === null || !Number.isFinite(estMinutes)) return null;
  const est = Math.round(estMinutes);
  if (est <= 0) return null;

  if (est <= env.maxMinutes && est >= env.minMinutes) {
    return { minutes: est, roundsNote: null };
  }

  const n = topRounds(rounds);

  if (est > env.maxMinutes) {
    if (n !== null) {
      const k = Math.max(1, Math.floor((n * env.maxMinutes) / est));
      if (k < n) {
        const minutes = Math.round((est * k) / n);
        if (minutes <= env.maxMinutes) return { minutes, roundsNote: `Do ${k} of ${n} rounds` };
      }
      // Even one round busts the block. Rounds never get the roundless cap, so
      // 46 over 4 rounds in a 30-45 block drops to 35 rather than shaving one.
      return null;
    }
    if (est <= env.maxMinutes * CAP_TOLERANCE) {
      return { minutes: env.maxMinutes, roundsNote: `Cap at ${env.maxMinutes} min` };
    }
    return null;
  }

  // Under the floor: extend by rounds when the shortfall is worth a round,
  // keep a nearly-long-enough workout as the short block it is, reject one too
  // short to carry the block. A trim landing here is kept — 70 over 2 rounds
  // in a 40-65 block is an honest 35-minute single round.
  if (n !== null && est < env.minMinutes * EXTEND_BELOW) {
    const k = Math.min(n * 2, Math.ceil((n * env.minMinutes) / est));
    if (k > n) {
      const minutes = Math.round((est * k) / n);
      if (minutes <= env.maxMinutes) {
        return { minutes, roundsNote: `Do ${k} rounds (written: ${n})` };
      }
    }
  }
  if (est < env.minMinutes * FLOOR_TOLERANCE) return null;
  return { minutes: est, roundsNote: null };
}
