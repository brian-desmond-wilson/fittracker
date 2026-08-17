// Split rotation and the re-entry ramp position. Pure; dates are YYYY-MM-DD
// strings so callers control the clock (one `today` sampled per compute —
// the app's no-two-clocks rule).
import type { SplitDay } from "../types/daily";

const ORDER: SplitDay[] = ["push", "pull", "legs"];

/** The next split day, keyed on the last COMPLETED day. Missing a calendar
 *  day shifts the sequence instead of breaking it — travel rule. */
export function nextSplitDay(lastCompleted: SplitDay | null): SplitDay {
  if (!lastCompleted) return "push";
  return ORDER[(ORDER.indexOf(lastCompleted) + 1) % ORDER.length];
}

const dayMs = 24 * 60 * 60 * 1000;
const toUtc = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};

/** 1-based week since the first-ever generated session. Weeks 1-2 are the
 *  volume-capped re-entry ramp (8 weeks detrained). */
export function rampWeek(firstSessionDate: string | null, today: string): number {
  if (!firstSessionDate) return 1;
  const days = Math.floor((toUtc(today) - toUtc(firstSessionDate)) / dayMs);
  return Math.max(1, Math.floor(days / 7) + 1);
}
