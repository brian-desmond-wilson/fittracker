// Rolling 7-day muscle coverage from the usage ledger — what got trained,
// how recently, and what has been neglected. Pure; the ledger rows and
// today's date arrive as data (one clock sample per compute).
// Spec §4 step 1.
import type { UsageRow } from "../types/dailyBlocks";

// muscle_regions.name values, verbatim (post-reorg seed) — the same
// vocabulary dailyCandidates.ts gates on. "Back" is excluded: superseded by
// the more granular "Upper Back"/"Lats" rows the same seed carries, and
// dailyCandidates.ts's DAY_MUSCLES never gates on it either. "Full Body" is
// excluded too — it's a cross-day catch-all (see ALWAYS_MUSCLES), not a
// single trainable muscle to track coverage against.
export const TRAINABLE_MUSCLES = [
  "Chest", "Shoulders", "Triceps",
  "Upper Back", "Lats", "Biceps", "Forearms / Grip", "Neck / Traps",
  "Quads", "Glutes", "Hamstrings", "Calves",
  "Hip Flexors", "Hip Abductors", "Hip Adductors",
  "Core", "Obliques", "Lower Back",
] as const;

export interface MuscleCoverage {
  /** name → decayed 7-day load. Absent = untouched this week. A ledger row
   *  denormalized with a non-trainable name ("Full Body", "Back") still
   *  accumulates here — this is keyed on whatever the row says, not on
   *  TRAINABLE_MUSCLES — but such a name can never appear in `neglected`. */
  load: Record<string, number>;
  /** Primary muscles hit exactly yesterday. */
  yesterday: Set<string>;
  /** TRAINABLE_MUSCLES sorted least-loaded first, ties broken alphabetically
   *  so an untrained muscle's fixed declaration-order slot can't bias every
   *  downstream pick toward the front of the list (e.g. upper body). */
  neglected: string[];
}

const dayMs = 24 * 60 * 60 * 1000;
const toUtc = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};

/** Whole days between two YYYY-MM-DD strings, UTC-anchored so timezone drift
 *  can't creep in. Also used by Task 9 to date a workout's last performance. */
export function daysBetween(earlier: string, later: string): number {
  return Math.floor((toUtc(later) - toUtc(earlier)) / dayMs);
}

export function muscleCoverage(usage: UsageRow[], today: string): MuscleCoverage {
  const load: Record<string, number> = {};
  const yesterday = new Set<string>();

  for (const row of usage) {
    const daysAgo = daysBetween(row.performedDate, today);
    // A malformed/empty performedDate makes daysBetween return NaN, which is
    // falsy in every comparison below — unguarded it would slip past both
    // bounds and accumulate NaN into `load`, which then sorts as MOST
    // neglected forever (mirrors the guard at consumptionRate.ts:184-190).
    // Today (daysAgo === 0) counts: the ledger is written on completion, so
    // the session currently being composed is never in it yet — a workout
    // already finished earlier today is training that happened.
    if (!Number.isFinite(daysAgo) || daysAgo < 0 || daysAgo > 7) continue;
    // Linear decay: today counts full, a week ago an eighth.
    const decay = (8 - daysAgo) / 8;
    // No dedupe needed: captured_workout_muscles has UNIQUE (workout, muscle
    // region), so one ledger row can't list the same muscle twice.
    for (const m of row.muscles) {
      load[m.name] = (load[m.name] ?? 0) + (m.isPrimary ? 1 : 0.5) * decay;
      if (daysAgo === 1 && m.isPrimary) yesterday.add(m.name);
    }
  }

  const neglected = [...TRAINABLE_MUSCLES].sort(
    (a, b) => (load[a] ?? 0) - (load[b] ?? 0) || a.localeCompare(b),
  );
  return { load, yesterday, neglected };
}
