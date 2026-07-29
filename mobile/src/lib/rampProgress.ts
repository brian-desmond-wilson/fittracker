// Lean-bulk ramp progression: weekly weight-trend assessment producing a
// suggest-confirm recommendation. Pure math, no I/O — Jest-tested.
// Policy constants are deliberately code, not schema (see Phase 1 spec §6).

export interface WeighIn {
  date: string; // local YYYY-MM-DD (house convention)
  weight_lbs: number;
}

export type RampRecommendation = "advance" | "hold" | "insufficient_data";

export interface RampAssessment {
  recommendation: RampRecommendation;
  reason: string;
  weeklyGainLbs: number | null; // most recent week-over-week gain
}

export const TARGET_WEEKLY_GAIN_MIN_LBS = 0.5;
export const TARGET_WEEKLY_GAIN_MAX_LBS = 0.75;
export const PLATEAU_GAIN_THRESHOLD_LBS = 0.25;
export const PLATEAU_WEEKS_TO_ADVANCE = 2;
export const MIN_WEIGHINS_PER_WEEK = 3;
const MIN_DAYS_AT_LEVEL = 7;

/** ISO week anchor for a local-date string: the Thursday of that ISO week,
 * formatted as "YYYY-MM-DD" (computed in UTC to avoid device-timezone drift
 * on date-only values). Two anchors are always an exact multiple of 7 days
 * apart, so lexicographic ("YYYY-MM-DD") sort stays chronological and the
 * gap between any two anchors is an exact week count — no week-number/
 * year-boundary arithmetic required. */
function isoWeekAnchor(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // ISO week: Thursday of the current week determines the year/week.
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function daysBetween(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000
  );
}

export interface AssessRampProgressOpts {
  weighIns: WeighIn[];
  levelStartedAt: string | null;
  today: string; // local YYYY-MM-DD
}

export function assessRampProgress(
  opts: AssessRampProgressOpts
): RampAssessment {
  const { weighIns, levelStartedAt, today } = opts;
  // Weekly averages for weeks with enough samples, anchored to each ISO
  // week's Thursday, in chronological order.
  const byAnchor = new Map<string, number[]>();
  for (const w of weighIns) {
    const anchor = isoWeekAnchor(w.date);
    const arr = byAnchor.get(anchor) ?? [];
    arr.push(w.weight_lbs);
    byAnchor.set(anchor, arr);
  }
  const weeks = [...byAnchor.entries()]
    .filter(([, values]) => values.length >= MIN_WEIGHINS_PER_WEEK)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([anchor, values]) => ({
      anchor,
      average: values.reduce((s, v) => s + v, 0) / values.length,
    }));

  // Need PLATEAU_WEEKS_TO_ADVANCE gains => that many + 1 qualifying weeks.
  if (weeks.length < PLATEAU_WEEKS_TO_ADVANCE + 1) {
    return {
      recommendation: "insufficient_data",
      reason: `Need ${PLATEAU_WEEKS_TO_ADVANCE + 1} weeks with at least ${MIN_WEIGHINS_PER_WEEK} weigh-ins each.`,
      weeklyGainLbs: null,
    };
  }

  // Normalize each gain by the number of calendar weeks actually spanned
  // between consecutive qualifying weeks, so a skipped/thin week doesn't
  // get counted as a single week's worth of change.
  const gains: number[] = [];
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1];
    const curr = weeks[i];
    const spanWeeks = daysBetween(prev.anchor, curr.anchor) / 7;
    gains.push((curr.average - prev.average) / spanWeeks);
  }
  const latestGain = gains[gains.length - 1];

  // Level-time gate; a null started_at (seeded state) waives it.
  if (
    levelStartedAt !== null &&
    daysBetween(levelStartedAt, today) < MIN_DAYS_AT_LEVEL
  ) {
    return {
      recommendation: "hold",
      reason: "Less than a week at the current level.",
      weeklyGainLbs: latestGain,
    };
  }

  const recentGains = gains.slice(-PLATEAU_WEEKS_TO_ADVANCE);
  const plateaued =
    recentGains.length >= PLATEAU_WEEKS_TO_ADVANCE &&
    recentGains.every((g) => g < PLATEAU_GAIN_THRESHOLD_LBS);

  if (plateaued) {
    // A stall and active weight loss both call for the same fix (raise
    // calories), but the copy should be honest about which one happened.
    const trend =
      latestGain < 0
        ? `Weight trending down over the last ${PLATEAU_WEEKS_TO_ADVANCE} weeks`
        : `Gained under ${PLATEAU_GAIN_THRESHOLD_LBS} lb/wk for ${PLATEAU_WEEKS_TO_ADVANCE} weeks`;
    return {
      recommendation: "advance",
      reason: `${trend} — time to raise calories.`,
      weeklyGainLbs: latestGain,
    };
  }

  const flavor =
    latestGain > TARGET_WEEKLY_GAIN_MAX_LBS
      ? "gaining faster than the target band"
      : latestGain >= TARGET_WEEKLY_GAIN_MIN_LBS
        ? "gaining within the target band"
        : "gaining slowly — watch for a plateau";
  return {
    recommendation: "hold",
    reason: `Currently ${flavor} (${latestGain.toFixed(2)} lb/wk).`,
    weeklyGainLbs: latestGain,
  };
}
