export type TotalsByDate = Record<string, number>;
export type GoalForDate = (dateKey: string) => number;

function getLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Current streak: consecutive days hitting the per-day effective goal,
 * counting today only if today's goal has already been hit. If today
 * hasn't been hit yet, the streak walks back from yesterday so the user
 * has until midnight to preserve it. Each day uses goalForDate(date).
 */
export function computeCurrentStreak(
  totalsByDate: TotalsByDate,
  goalForDate: GoalForDate,
): number {
  const today = new Date();
  const todayKey = getLocalDate(today);
  const todayGoal = goalForDate(todayKey);
  if (todayGoal <= 0) return 0;
  const todayHit = (totalsByDate[todayKey] || 0) >= todayGoal;

  let streak = 0;
  let cursor = todayHit ? 0 : 1;
  while (true) {
    const key = getLocalDate(addDays(today, -cursor));
    const dayGoal = goalForDate(key);
    if (dayGoal <= 0) break;
    if ((totalsByDate[key] || 0) >= dayGoal) {
      streak++;
      cursor++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Best streak: longest consecutive run of days that hit their own
 * per-day effective goal. Days with no logs count as misses. Returns 0
 * if no logs.
 */
export function computeBestStreak(
  totalsByDate: TotalsByDate,
  goalForDate: GoalForDate,
): number {
  const dates = Object.keys(totalsByDate);
  if (dates.length === 0) return 0;

  dates.sort();
  const earliest = new Date(dates[0]);
  const today = new Date();
  let best = 0;
  let running = 0;
  for (let d = new Date(earliest); d <= today; d = addDays(d, 1)) {
    const key = getLocalDate(d);
    const goal = goalForDate(key);
    if (goal > 0 && (totalsByDate[key] || 0) >= goal) {
      running++;
      if (running > best) best = running;
    } else {
      running = 0;
    }
  }
  return best;
}

/**
 * Rolling 7-day window ending today: average daily oz and number of days
 * (out of 7) that hit their own per-day effective goal.
 */
export function computeRollingStats(
  totalsByDate: TotalsByDate,
  goalForDate: GoalForDate,
): { avgOzPerDay: number; daysHit: number; daysInWindow: number } {
  const days = 7;
  const today = new Date();
  let sum = 0;
  let daysHit = 0;
  for (let i = 0; i < days; i++) {
    const key = getLocalDate(addDays(today, -i));
    const total = totalsByDate[key] || 0;
    const goal = goalForDate(key);
    sum += total;
    if (goal > 0 && total >= goal) daysHit++;
  }
  return {
    avgOzPerDay: sum / days,
    daysHit,
    daysInWindow: days,
  };
}

export type PaceStatus =
  | "before_window"
  | "after_window"
  | "goal_hit"
  | "on_pace"
  | "ahead"
  | "behind";

export interface PaceState {
  status: PaceStatus;
  ozBehind?: number;
  ozAhead?: number;
  catchUpOz?: number;
  catchUpTimeLabel?: string;
}

function timeToMinutes(hhmm: string): number {
  // Accept either "HH:MM" or "HH:MM:SS" (Postgres TIME)
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  return h * 60 + (m || 0);
}

function formatHourLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  if (m === 0) return `${display} ${ampm}`;
  return `${display}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Compute the user's current pace state vs goal.
 * - currentOz: water logged so far today
 * - goalOz: effective daily goal (including workout bonus if any)
 * - windowStart/windowEnd: waking-hours window, "HH:MM" (or HH:MM:SS)
 * - now (override for testing): defaults to actual current time
 *
 * Returns one of six states. For "behind", suggests how much to drink by
 * the next clock hour at least 30 minutes away (capped at windowEnd).
 */
export function computePace(opts: {
  currentOz: number;
  goalOz: number;
  windowStart: string;
  windowEnd: string;
  now?: Date;
}): PaceState {
  const { currentOz, goalOz, windowStart, windowEnd } = opts;
  const now = opts.now ?? new Date();

  if (goalOz > 0 && currentOz >= goalOz) return { status: "goal_hit" };

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = timeToMinutes(windowStart);
  const endMin = timeToMinutes(windowEnd);

  if (nowMin < startMin) return { status: "before_window" };
  if (nowMin > endMin) return { status: "after_window" };
  if (endMin <= startMin || goalOz <= 0) return { status: "on_pace" };

  const windowLen = endMin - startMin;
  const elapsedRatio = (nowMin - startMin) / windowLen;
  const expectedOz = goalOz * elapsedRatio;
  const delta = currentOz - expectedOz; // + = ahead, - = behind

  const tolerance = Math.max(goalOz * 0.05, 4); // 5% or 4 oz, whichever larger
  if (Math.abs(delta) <= tolerance) return { status: "on_pace" };
  if (delta > 0) return { status: "ahead", ozAhead: Math.round(delta) };

  // Behind: compute "drink X by Y" recommendation
  const targetMin = Math.min(
    Math.ceil((nowMin + 30) / 60) * 60,
    endMin,
  );
  const targetRatio = (targetMin - startMin) / windowLen;
  const expectedAtTarget = goalOz * targetRatio;
  const catchUpOz = Math.max(0, Math.round(expectedAtTarget - currentOz));
  return {
    status: "behind",
    ozBehind: Math.round(-delta),
    catchUpOz,
    catchUpTimeLabel: formatHourLabel(targetMin),
  };
}

export interface DailySeriesEntry {
  date: string;
  total: number;
  goal: number;
}

/**
 * Returns the last N daily totals (oldest -> newest, length N, padded
 * with zeros for missing days). Each entry includes the day's effective
 * goal so the chart can color/size bars per-day.
 */
export function buildDailySeries(
  totalsByDate: TotalsByDate,
  days: number,
  goalForDate: GoalForDate,
): DailySeriesEntry[] {
  const today = new Date();
  const result: DailySeriesEntry[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = getLocalDate(d);
    result.push({
      date: key,
      total: totalsByDate[key] || 0,
      goal: goalForDate(key),
    });
  }
  return result;
}
