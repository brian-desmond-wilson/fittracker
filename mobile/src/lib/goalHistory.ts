// Which goal governs a given day or week. Pure; the fetch lives in
// supabase/weeklyGoals.ts.
//
// A goal change must never rewrite the past — every question here is asked
// about a date, and answered with the goal that was in force on that date.
import { toUtc } from "./gymSessions";
import type { WeeklyGoal } from "../types/goals";

const dayMs = 86_400_000;

/** What a user is measured against before they ever set a goal. */
export const DEFAULT_GOAL: WeeklyGoal = {
  id: "default",
  effectiveFrom: "1970-01-01",
  sessionsTarget: 5,
  volumeTargetLbs: null,
  regionTarget: null,
};

/** The newest goal effective on or before `date`. */
export function goalInForce(history: WeeklyGoal[], date: string): WeeklyGoal {
  const applicable = history
    .filter((g) => g.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? 0 : a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return applicable[0] ?? DEFAULT_GOAL;
}

/** The goal governing the calendar week containing `date`. */
export function goalForWeek(history: WeeklyGoal[], date: string): WeeklyGoal {
  const utc = toUtc(date);
  const sunday = new Date(utc - new Date(utc).getUTCDay() * dayMs)
    .toISOString()
    .slice(0, 10);
  return goalInForce(history, sunday);
}
