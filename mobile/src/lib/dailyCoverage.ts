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
  /** name → decayed 7-day load. Absent = untouched this week. */
  load: Record<string, number>;
  /** Primary muscles hit exactly yesterday. */
  yesterday: Set<string>;
  /** TRAINABLE_MUSCLES sorted least-loaded first. */
  neglected: string[];
}

const dayMs = 24 * 60 * 60 * 1000;
const toUtc = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};

export function daysBetween(earlier: string, later: string): number {
  return Math.floor((toUtc(later) - toUtc(earlier)) / dayMs);
}

export function muscleCoverage(usage: UsageRow[], today: string): MuscleCoverage {
  const load: Record<string, number> = {};
  const yesterday = new Set<string>();

  for (const rowItem of usage) {
    const daysAgo = daysBetween(rowItem.performedDate, today);
    if (daysAgo < 1 || daysAgo > 7) continue;
    // Linear decay: yesterday counts 7/8, a week ago 1/8.
    const decay = (8 - daysAgo) / 8;
    for (const m of rowItem.muscles) {
      load[m.name] = (load[m.name] ?? 0) + (m.isPrimary ? 1 : 0.5) * decay;
      if (daysAgo === 1 && m.isPrimary) yesterday.add(m.name);
    }
  }

  const neglected = [...TRAINABLE_MUSCLES].sort(
    (a, b) => (load[a] ?? 0) - (load[b] ?? 0),
  );
  return { load, yesterday, neglected };
}
