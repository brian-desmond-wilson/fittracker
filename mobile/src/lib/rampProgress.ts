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

/** ISO-week key ("2026-W30") for a local-date string, computed in UTC to
 * avoid device-timezone drift on date-only values. */
function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // ISO week: Thursday of the current week determines the year/week.
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function daysBetween(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000
  );
}

export function assessRampProgress(
  weighIns: WeighIn[],
  levelStartedAt: string | null,
  today: string
): RampAssessment {
  // Weekly averages for weeks with enough samples, in chronological order.
  const byWeek = new Map<string, number[]>();
  for (const w of weighIns) {
    const key = isoWeekKey(w.date);
    const arr = byWeek.get(key) ?? [];
    arr.push(w.weight_lbs);
    byWeek.set(key, arr);
  }
  const weeks = [...byWeek.entries()]
    .filter(([, values]) => values.length >= MIN_WEIGHINS_PER_WEEK)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(
      ([, values]) => values.reduce((s, v) => s + v, 0) / values.length
    );

  // Need PLATEAU_WEEKS_TO_ADVANCE gains => that many + 1 qualifying weeks.
  if (weeks.length < PLATEAU_WEEKS_TO_ADVANCE + 1) {
    return {
      recommendation: "insufficient_data",
      reason: `Need ${PLATEAU_WEEKS_TO_ADVANCE + 1} weeks with at least ${MIN_WEIGHINS_PER_WEEK} weigh-ins each.`,
      weeklyGainLbs: null,
    };
  }

  const gains: number[] = [];
  for (let i = 1; i < weeks.length; i++) gains.push(weeks[i] - weeks[i - 1]);
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
    return {
      recommendation: "advance",
      reason: `Gained under ${PLATEAU_GAIN_THRESHOLD_LBS} lb/wk for ${PLATEAU_WEEKS_TO_ADVANCE} weeks — time to raise calories.`,
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
