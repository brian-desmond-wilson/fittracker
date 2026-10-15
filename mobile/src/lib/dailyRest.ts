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

/** The documented fallback when a session's stored assumed inputs are
 *  missing or malformed: mid-scale energy, a full two-hour budget, no
 *  soreness. The morning confirm can always save a check-in from this. */
export function defaultAssumedInputs(): AssumedInputs {
  return { energy: ASSUMED_ENERGY, minutesAvailable: 120, soreness: {} };
}

/** Coerce a stored `inputs_snapshot.assumed` value into AssumedInputs.
 *  The coach once wrote prose here; a string (or any other non-AssumedInputs
 *  shape) must never reach the check-in save, where `energy: undefined` is
 *  stripped from the upsert and violates the NOT NULL constraint — the
 *  morning confirm then fails with a cryptic connection error. Absent reads
 *  as null so callers keep their "no draft" semantics; present-but-malformed
 *  falls back to the documented default. */
export function coerceAssumedInputs(value: unknown): AssumedInputs | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    return defaultAssumedInputs();
  }
  const v = value as Record<string, unknown>;
  const valid =
    typeof v.energy === "number" &&
    typeof v.minutesAvailable === "number" &&
    typeof v.soreness === "object" &&
    v.soreness !== null &&
    !Array.isArray(v.soreness);
  if (!valid) return defaultAssumedInputs();
  return {
    energy: v.energy as number,
    minutesAvailable: v.minutesAvailable as number,
    soreness: v.soreness as Record<string, number>,
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
