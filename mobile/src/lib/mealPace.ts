// Meal pace coaching: simple linear-elapsed model within the waking-hours
// window (shared with water), with prescriptive copy targeting the next
// scheduled meal time.

export type MacroPaceTarget = "calories" | "protein";

export type MealPaceStatus =
  | "before_window"
  | "after_window"
  | "goal_hit"
  | "on_pace"
  | "ahead"
  | "behind";

export interface MealPaceState {
  status: MealPaceStatus;
  // Amount the user is ahead/behind (rounded). Sign is implicit by status.
  delta?: number;
  // For "behind": how much to eat by `catchUpLabel` to be back on pace.
  catchUpAmount?: number;
  // Friendly label for the next meal (or "end of day"). e.g. "dinner (6 PM)"
  catchUpLabel?: string;
}

function timeToMinutes(hhmm: string): number {
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
 * Determine the next upcoming "milestone" time after `nowMin`. Returns
 * the earliest of breakfast/lunch/dinner that is strictly after `nowMin`
 * — or `windowEndMin` if all main meals have passed.
 */
function nextMilestone(
  nowMin: number,
  windowEndMin: number,
  mealTimes: { breakfast: string; lunch: string; dinner: string },
): { minutes: number; label: string } {
  const candidates: Array<{ minutes: number; label: string }> = [
    { minutes: timeToMinutes(mealTimes.breakfast), label: "breakfast" },
    { minutes: timeToMinutes(mealTimes.lunch), label: "lunch" },
    { minutes: timeToMinutes(mealTimes.dinner), label: "dinner" },
  ];
  const upcoming = candidates
    .filter((c) => c.minutes > nowMin && c.minutes <= windowEndMin)
    .sort((a, b) => a.minutes - b.minutes);
  if (upcoming.length > 0) {
    const next = upcoming[0];
    return {
      minutes: next.minutes,
      label: `${next.label} (${formatHourLabel(next.minutes)})`,
    };
  }
  return {
    minutes: windowEndMin,
    label: `end of day (${formatHourLabel(windowEndMin)})`,
  };
}

export interface ComputeMealPaceOpts {
  // currentValue: how much of the macro you've consumed so far
  currentValue: number;
  // goal for the macro (calories or protein grams)
  goal: number | null;
  // "HH:MM" or "HH:MM:SS" — waking-hours window
  windowStart: string;
  windowEnd: string;
  // Main meal target times (used for prescriptive catch-up label)
  mealTimes: { breakfast: string; lunch: string; dinner: string };
  // Macro we're computing pace for (drives tolerance values)
  macro: MacroPaceTarget;
  // Override (for tests). Defaults to now.
  now?: Date;
}

export function computeMealPace(opts: ComputeMealPaceOpts): MealPaceState {
  const {
    currentValue,
    goal,
    windowStart,
    windowEnd,
    mealTimes,
    macro,
  } = opts;
  const now = opts.now ?? new Date();

  if (goal == null || goal <= 0) {
    return { status: "on_pace" };
  }
  if (currentValue >= goal) return { status: "goal_hit" };

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = timeToMinutes(windowStart);
  const endMin = timeToMinutes(windowEnd);

  if (nowMin < startMin) return { status: "before_window" };
  if (nowMin > endMin) return { status: "after_window" };
  if (endMin <= startMin) return { status: "on_pace" };

  const windowLen = endMin - startMin;
  const elapsedRatio = (nowMin - startMin) / windowLen;
  const expected = goal * elapsedRatio;
  const delta = currentValue - expected; // + = ahead, - = behind

  // Tolerance: 5% of goal, with reasonable floors per macro.
  const floor = macro === "calories" ? 100 : 8; // 100 cal or 8 g protein
  const tolerance = Math.max(goal * 0.05, floor);

  if (Math.abs(delta) <= tolerance) return { status: "on_pace" };
  if (delta > 0) return { status: "ahead", delta: Math.round(delta) };

  // Behind: compute prescriptive catch-up amount aimed at the next meal.
  const next = nextMilestone(nowMin, endMin, mealTimes);
  const targetRatio = (next.minutes - startMin) / windowLen;
  const expectedAtTarget = goal * targetRatio;
  const catchUp = Math.max(0, Math.round(expectedAtTarget - currentValue));
  return {
    status: "behind",
    delta: Math.round(-delta),
    catchUpAmount: catchUp,
    catchUpLabel: next.label,
  };
}
