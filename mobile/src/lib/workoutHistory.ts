// The arithmetic behind Track > Workouts. Pure; the screen owns the pixels and
// supabase/workoutHistory.ts owns the reads.
import type {
  HistorySession,
  MuscleGroup,
  WeekSummary,
} from "../types/workoutHistory";

/**
 * muscle_regions names → the four groups, verbatim from the seeded table.
 *
 * Judgement calls worth stating: lower back and posterior chain sit in LOWER
 * rather than pull, because the movements that hit them (deadlifts, hinges,
 * good mornings) load the legs and hips first. Grip and traps sit in PULL,
 * because that is what loads them. Core and full body are their own group
 * rather than being distributed, since a session built on them is genuinely
 * neither push nor pull.
 */
const GROUP_BY_REGION: Record<string, MuscleGroup> = {
  Chest: "push",
  Shoulders: "push",
  Triceps: "push",

  Back: "pull",
  Lats: "pull",
  "Upper Back": "pull",
  Biceps: "pull",
  Forearms: "pull",
  "Forearms / Grip": "pull",
  "Neck / Traps": "pull",

  Quads: "lower",
  Hamstrings: "lower",
  Glutes: "lower",
  Calves: "lower",
  "Hip Abductors": "lower",
  "Hip Adductors": "lower",
  "Hip Flexors": "lower",
  "Lower Back": "lower",
  "Posterior Chain": "lower",

  Core: "full",
  Obliques: "full",
  "Full Body": "full",
};

/** Null for a region we have never heard of — better than guessing wrong. */
export function muscleGroupOf(region: string): MuscleGroup | null {
  return GROUP_BY_REGION[region] ?? null;
}

export const GROUP_LABELS: Record<MuscleGroup, string> = {
  push: "Upper push",
  pull: "Upper pull",
  lower: "Lower",
  full: "Full body",
  untagged: "Untagged",
};

/**
 * Which group a session leaned on, by counting working sets.
 *
 * Every set votes through its exercise's primary regions; a movement tagged
 * with two regions in different groups gives each a vote, so a session is
 * judged on the whole of what it worked. Warm-ups don't vote — they are
 * preparation, not the session's emphasis.
 *
 * A tie goes to "full": nothing led, so nothing should be claimed. Untagged
 * means we genuinely cannot say, which is a different statement from "full
 * body" and is drawn differently.
 */
export function sessionEmphasis(session: HistorySession): MuscleGroup {
  const votes: Record<string, number> = {};
  let tagged = 0;
  for (const exercise of session.exercises) {
    const working = exercise.sets.filter((s) => !s.isWarmup).length;
    if (working === 0) continue;
    for (const region of exercise.primaryRegions) {
      const group = muscleGroupOf(region);
      if (!group) continue;
      votes[group] = (votes[group] ?? 0) + working;
      tagged += working;
    }
  }
  if (tagged === 0) return "untagged";
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return "full";
  return ranked[0][0] as MuscleGroup;
}

/** Working sets only — warm-up volume flatters the number without earning it. */
export function sessionVolume(session: HistorySession): number {
  return session.exercises.reduce(
    (total, exercise) =>
      total +
      exercise.sets
        .filter((s) => !s.isWarmup)
        .reduce((sum, s) => sum + (s.volumeLbs ?? 0), 0),
    0,
  );
}

export function sessionMinutes(session: HistorySession): number | null {
  if (session.durationSeconds && session.durationSeconds > 0) {
    return Math.round(session.durationSeconds / 60);
  }
  if (session.startedAt && session.endedAt) {
    const ms = new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
    if (ms > 0) return Math.round(ms / 60000);
  }
  return null;
}

/**
 * Volume per minute — what separates a hard session from a long one.
 *
 * Null rather than zero when there is no load: a bodyweight or band session
 * did not do nothing, we just have no weight to multiply. Showing 0 lb/min
 * would be a claim; showing nothing is the truth.
 */
export function sessionPace(session: HistorySession): number | null {
  const minutes = sessionMinutes(session);
  const volume = sessionVolume(session);
  if (!minutes || volume <= 0) return null;
  return Math.round(volume / minutes);
}

const dayMs = 86_400_000;
const toUtc = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const dayDiff = (a: string, b: string): number =>
  Math.round((toUtc(a) - toUtc(b)) / dayMs);

/** This week meaning the last 7 days including today, not a calendar week —
 *  a Monday reset would show an empty page every Monday morning. */
export function weekSummary(sessions: HistorySession[], today: string): WeekSummary {
  const thisWeek = sessions.filter((s) => {
    const age = dayDiff(today, s.date);
    return age >= 0 && age < 7;
  });
  const lastWeek = sessions.filter((s) => {
    const age = dayDiff(today, s.date);
    return age >= 7 && age < 14;
  });
  return {
    sessions: thisWeek.length,
    volumeLbs: thisWeek.reduce((t, s) => t + sessionVolume(s), 0),
    minutes: thisWeek.reduce((t, s) => t + (sessionMinutes(s) ?? 0), 0),
    sessionsLastWeek: lastWeek.length,
  };
}

/**
 * Consecutive days trained, counting back from today.
 *
 * A streak survives today being empty — it is only 8pm, and killing the number
 * before the day is over punishes you for not having trained yet. It ends the
 * moment a whole day passes with nothing.
 */
export function currentStreak(sessions: HistorySession[], today: string): number {
  const days = new Set(sessions.map((s) => s.date));
  if (days.size === 0) return 0;
  const startOffset = days.has(today) ? 0 : 1;
  // Nothing today AND nothing yesterday means the streak is already broken.
  const anchor = new Date(toUtc(today) - startOffset * dayMs);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (!days.has(iso(anchor))) return 0;
  let streak = 0;
  const cursor = new Date(anchor);
  while (days.has(iso(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/**
 * Share of recent sessions by emphasis, as whole percentages that total 100.
 *
 * Untagged sessions are counted and shown rather than hidden: a bar that
 * silently drops half your training would overstate how balanced the rest is.
 */
export function balance(
  sessions: HistorySession[],
  days: number,
  today: string,
): { group: MuscleGroup; percent: number }[] {
  const recent = sessions.filter((s) => {
    const age = dayDiff(today, s.date);
    return age >= 0 && age < days;
  });
  if (recent.length === 0) return [];
  const counts = new Map<MuscleGroup, number>();
  for (const session of recent) {
    const group = sessionEmphasis(session);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const order: MuscleGroup[] = ["push", "pull", "lower", "full", "untagged"];
  const raw = order
    .filter((g) => counts.has(g))
    .map((group) => ({
      group,
      exact: ((counts.get(group) ?? 0) / recent.length) * 100,
    }));
  // Largest-remainder, so the bar always totals exactly 100 and no segment
  // rounds itself out of existence.
  const floored = raw.map((r) => ({ ...r, percent: Math.floor(r.exact) }));
  let short = 100 - floored.reduce((t, r) => t + r.percent, 0);
  const byRemainder = [...floored].sort(
    (a, b) => (b.exact - b.percent) - (a.exact - a.percent),
  );
  for (const row of byRemainder) {
    if (short <= 0) break;
    row.percent += 1;
    short -= 1;
  }
  return floored.map(({ group, percent }) => ({ group, percent }));
}

/** 32,400 → "32.4k". Volume is a scale, not an accounting figure. */
export function formatVolume(lbs: number): string {
  if (lbs <= 0) return "—";
  if (lbs < 1000) return `${Math.round(lbs)}`;
  return `${(lbs / 1000).toFixed(1)}k`;
}

/** "3h 10m", "45m" — minutes alone stop reading past about two hours. */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/** Sessions for one day, newest first — what the calendar shows when tapped. */
export function sessionsOn(sessions: HistorySession[], date: string): HistorySession[] {
  return sessions
    .filter((s) => s.date === date)
    .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

/** date → the emphasis its dot should take. Two sessions on a day are judged
 *  together, so the dot describes the day rather than whichever came first. */
export function emphasisByDate(sessions: HistorySession[]): Map<string, MuscleGroup> {
  const byDate = new Map<string, HistorySession[]>();
  for (const session of sessions) {
    byDate.set(session.date, [...(byDate.get(session.date) ?? []), session]);
  }
  const out = new Map<string, MuscleGroup>();
  for (const [date, daySessions] of byDate) {
    const merged: HistorySession = {
      ...daySessions[0],
      exercises: daySessions.flatMap((s) => s.exercises),
    };
    out.set(date, sessionEmphasis(merged));
  }
  return out;
}
