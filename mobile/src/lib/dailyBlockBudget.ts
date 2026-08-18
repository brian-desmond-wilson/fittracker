// The block session's time arithmetic: what each block may cost, and how a
// catalog workout is trimmed or extended (by whole rounds) to fit. All
// deterministic — the AI picks candidates whose minutes are already decided.
// Spec §4 steps 4-5.
import type { BlockEnvelope, BlockRole } from "../types/dailyBlocks";

/** Under this many total minutes, support blocks compress (spec §8). */
const SHORT_DAY = 45;
/** Conditioning only exists when the budget clears this (spec §4). */
const CONDITIONING_FLOOR = 75;
/** A roundless workout may be capped down by at most this factor. */
const CAP_TOLERANCE = 1.25;

/**
 * What each block of today's session may cost, in the order the blocks are
 * performed (RAMP: raise, activate, work, condition, cool).
 *
 * These are independent ranges, NOT a partition of the day — every block
 * taking its max would overrun the budget, and on a very short day the floors
 * below overrun it outright. That is deliberate: the envelope says what a
 * block is allowed to be, and composition is what keeps the day's total
 * honest (spec §5 re-validates the sum to ±10%).
 *
 * Main is sized as the remainder rather than a fraction, because main is the
 * point of the day: everything else states its appetite first and main eats
 * what is left. Its floor of 10 and ceiling of 15 keep a nonsense-short
 * budget from asking for a main block of zero or negative minutes.
 */
export function blockEnvelopes(minutes: number, recoveryDay: boolean): BlockEnvelope[] {
  if (recoveryDay) {
    // Mobility and cool-down only, deliberately (spec §6). Split roughly 60/40
    // toward mobility — the stretching is the session, the cool-down closes it.
    // The 10- and 5-minute floors mean a recovery day is never shorter than 15
    // minutes even when the budget is, which is the right way round: a
    // ten-minute recovery day is not worth presenting as a session.
    const mobility = Math.max(10, Math.round(minutes * 0.6));
    const cooldown = Math.max(5, Math.min(minutes - mobility, Math.round(minutes * 0.4)));
    return [
      { block: "mobility", minMinutes: 5, maxMinutes: mobility },
      { block: "cooldown", minMinutes: 5, maxMinutes: cooldown },
    ];
  }

  const short = minutes < SHORT_DAY;
  const supportMin = short ? 3 : 5;
  const supportMax = short ? 5 : 10;
  const support = (block: BlockRole): BlockEnvelope =>
    ({ block, minMinutes: supportMin, maxMinutes: supportMax });

  const warmup = support("warmup");
  const mobility = support("mobility");
  const cooldown = support("cooldown");
  // Conditioning is the first thing a tight day gives up: below 75 minutes,
  // buying it would come straight out of the main workout.
  const conditioning: BlockEnvelope | null = minutes >= CONDITIONING_FLOOR
    ? { block: "conditioning", minMinutes: 10, maxMinutes: 20 }
    : null;

  // What main has to share the day with. Main's floor assumes the others all
  // run long, its ceiling assumes they all run short.
  const aroundMain = [warmup, mobility, cooldown, ...(conditioning ? [conditioning] : [])];
  const minTaken = aroundMain.reduce((s, e) => s + e.minMinutes, 0);
  const maxTaken = aroundMain.reduce((s, e) => s + e.maxMinutes, 0);
  const main: BlockEnvelope = {
    block: "main",
    minMinutes: Math.max(10, minutes - maxTaken),
    maxMinutes: Math.max(15, minutes - minTaken),
  };

  return [warmup, mobility, main, ...(conditioning ? [conditioning] : []), cooldown];
}

export interface FittedDuration {
  minutes: number;
  roundsNote: string | null;
}

/**
 * Top of a rounds prescription: "4" → 4, "3-4" → 4, "5 rounds for time" → 5.
 *
 * Only the LEADING number counts, because the column is the creator's own
 * words and holds more than counts: "AMRAP 20 min" is a documented value, and
 * reading the largest digit-run anywhere in the string would call that twenty
 * rounds and then confidently offer to trim fifteen of them. Anything not
 * opening with a count — and any single-round workout, which has no round to
 * give up — reads as roundless, so the caller falls back to capping.
 */
function topRounds(rounds: string | null): number | null {
  if (!rounds) return null;
  const match = rounds.trim().match(/^(\d+)\s*(?:[-–—]\s*(\d+))?/);
  if (!match) return null;
  const top = match[2] === undefined ? Number(match[1]) : Math.max(Number(match[1]), Number(match[2]));
  return top >= 2 ? top : null;
}

/**
 * Fit a workout's estimated duration to a block's envelope, by whole rounds
 * when the creator wrote rounds. Null = cannot fit; the workout leaves the
 * shortlist. Never invents more than double the written rounds.
 *
 * Whole rounds are the only honest way to shorten someone else's workout —
 * "do 3 of 4" is a thing you can actually perform, where "do 46 minutes of a
 * 60-minute workout" is not. So a workout that states rounds is trimmed by
 * rounds or dropped; only a roundless one is capped, and only modestly.
 *
 * The ceiling is hard and the floor is soft. Running over the envelope pushes
 * the day past the minutes the athlete said they had; running under it just
 * means a short block, which is a disappointment rather than a failure.
 */
export function fitToEnvelope(
  estMinutes: number | null,
  rounds: string | null,
  env: BlockEnvelope,
): FittedDuration | null {
  // The estimate is AI-assigned at capture, so it can arrive missing or
  // nonsensical. Nothing can be fitted to an unknown duration.
  if (estMinutes === null || !Number.isFinite(estMinutes) || estMinutes <= 0) return null;

  if (estMinutes <= env.maxMinutes && estMinutes >= env.minMinutes) {
    return { minutes: estMinutes, roundsNote: null };
  }

  const n = topRounds(rounds);

  if (estMinutes > env.maxMinutes) {
    if (n !== null) {
      const k = Math.max(1, Math.floor((n * env.maxMinutes) / estMinutes));
      if (k < n) {
        const minutes = Math.round((estMinutes * k) / n);
        if (minutes <= env.maxMinutes) {
          return { minutes, roundsNote: `Do ${k} of ${n} rounds` };
        }
      }
      // Even one round busts the block. Nothing left to cut.
      return null;
    }
    // Roundless: a modest overage caps; past tolerance it doesn't fit.
    if (estMinutes <= env.maxMinutes * CAP_TOLERANCE) {
      return { minutes: env.maxMinutes, roundsNote: `Cap at ${env.maxMinutes} min` };
    }
    return null;
  }

  // Under the floor. With rounds we can extend (at most doubling); without,
  // a short workout is simply a short block — allowed as-is.
  if (n !== null) {
    const k = Math.min(n * 2, Math.ceil((n * env.minMinutes) / estMinutes));
    if (k > n) {
      const minutes = Math.round((estMinutes * k) / n);
      if (minutes <= env.maxMinutes) {
        return { minutes, roundsNote: `Do ${k} rounds (written: ${n})` };
      }
    }
  }
  return { minutes: estMinutes, roundsNote: null };
}
