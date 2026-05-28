export type TotalsByDate = Record<string, number>;

function getLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Current streak: consecutive days hitting the goal, counting today only
 * if today's goal has already been hit. If today hasn't been hit yet, the
 * streak walks back from yesterday so the user has until midnight to
 * preserve it.
 */
export function computeCurrentStreak(
  totalsByDate: TotalsByDate,
  goalOz: number,
): number {
  if (goalOz <= 0) return 0;
  const today = new Date();
  const todayKey = getLocalDate(today);
  const todayHit = (totalsByDate[todayKey] || 0) >= goalOz;

  let streak = 0;
  // If today is hit, start counting from today; otherwise start from yesterday.
  let cursor = todayHit ? 0 : 1;
  while (true) {
    const key = getLocalDate(addDays(today, -cursor));
    if ((totalsByDate[key] || 0) >= goalOz) {
      streak++;
      cursor++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Best streak: longest consecutive run of goal-hit days within the
 * provided totals. Days with no logs count as misses. Returns 0 if no
 * logs.
 */
export function computeBestStreak(
  totalsByDate: TotalsByDate,
  goalOz: number,
): number {
  if (goalOz <= 0) return 0;
  const dates = Object.keys(totalsByDate);
  if (dates.length === 0) return 0;

  dates.sort();
  const earliest = new Date(dates[0]);
  const today = new Date();
  let best = 0;
  let running = 0;
  for (let d = new Date(earliest); d <= today; d = addDays(d, 1)) {
    const key = getLocalDate(d);
    if ((totalsByDate[key] || 0) >= goalOz) {
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
 * (out of 7) that hit the goal.
 */
export function computeRollingStats(
  totalsByDate: TotalsByDate,
  goalOz: number,
): { avgOzPerDay: number; daysHit: number; daysInWindow: number } {
  const days = 7;
  const today = new Date();
  let sum = 0;
  let daysHit = 0;
  for (let i = 0; i < days; i++) {
    const key = getLocalDate(addDays(today, -i));
    const total = totalsByDate[key] || 0;
    sum += total;
    if (goalOz > 0 && total >= goalOz) daysHit++;
  }
  return {
    avgOzPerDay: sum / days,
    daysHit,
    daysInWindow: days,
  };
}

/**
 * Returns the last N daily totals (oldest -> newest, length N, padded
 * with zeros for missing days) for chart rendering.
 */
export function buildDailySeries(
  totalsByDate: TotalsByDate,
  days: number,
): { date: string; total: number }[] {
  const today = new Date();
  const result: { date: string; total: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = getLocalDate(d);
    result.push({ date: key, total: totalsByDate[key] || 0 });
  }
  return result;
}
