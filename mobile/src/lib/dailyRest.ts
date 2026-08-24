// What a tomorrow-draft assumes, and what counts as "yesterday was rest".
// Pure — the fetches live in supabase/daily.ts and composeDay.ts.
// Spec: docs/superpowers/specs/2026-08-24-rest-day-design.md.
import type { AssumedInputs } from "../types/daily";

/** The session lengths the setup sheet offers. Canonical home — the sheet
 *  imports these, and the assumed minutes snap to them so the morning
 *  prefill highlights a real pill. */
export const MINUTES_OPTIONS = [30, 45, 60, 90, 120, 150, 180];

/** Mid-scale, deliberately not the sheet's optimistic default of 7: a guess
 *  about tomorrow should claim less than the user claims about today. */
export const ASSUMED_ENERGY = 6;

/** An active-recovery day's time budget — mobility + cooldown fit in it. */
export const ACTIVE_RECOVERY_MINUTES = 15;

export function medianMinutes(recent: number[], fallback = 60): number {
  if (recent.length === 0) return fallback;
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function snapToMinutesOption(minutes: number): number {
  let best = MINUTES_OPTIONS[0];
  for (const option of MINUTES_OPTIONS) {
    // <= so a tie snaps up: guessing slightly long costs a shorter compose,
    // guessing short would clip the main block.
    if (Math.abs(option - minutes) <= Math.abs(best - minutes)) best = option;
  }
  return best;
}

/** Overnight, everything heals one step; what reaches 0 leaves the map. */
export function decayedSoreness(
  soreness: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [region, severity] of Object.entries(soreness)) {
    if (severity - 1 >= 1) out[region] = severity - 1;
  }
  return out;
}

export function assumedInputs(
  lastCheckin: { soreness: Record<string, number> } | null,
  recentMinutes: number[],
): AssumedInputs {
  return {
    energy: ASSUMED_ENERGY,
    minutesAvailable: snapToMinutesOption(medianMinutes(recentMinutes)),
    soreness: decayedSoreness(lastCheckin?.soreness ?? {}),
  };
}

/** One day's generated_sessions rows, as rest-detection needs them. */
export interface DayRestRow {
  status: string;
  blocks: { block: string }[];
}

/**
 * Was this day deliberate rest? A rested row says so outright; a completed
 * recovery-shaped session (blocks, but no main and no warmup — the same
 * shape blockDayShape calls "recovery") says it too. No rows says nothing:
 * an empty day is unknown, not rest.
 */
export function wasRestDay(rows: DayRestRow[]): boolean {
  return rows.some((r) => {
    if (r.status === "rested") return true;
    if (r.status !== "completed" || r.blocks.length === 0) return false;
    const roles = new Set(r.blocks.map((b) => b.block));
    return !roles.has("main") && !roles.has("warmup");
  });
}
