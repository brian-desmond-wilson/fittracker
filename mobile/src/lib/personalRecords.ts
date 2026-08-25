// Personal records, computed from flattened set history.
//
// A record must beat a prior mark: the first time you perform a movement sets
// the baseline silently, so a new program does not paint every card with PRs.
// Three kinds per exercise — heaviest set, best estimated 1RM, and the biggest
// single session by volume — because they answer different questions and a
// session can set one without the others.
import { estimatedOneRepMax } from "./statsPeriod";
import type { PersonalRecord, RecordKind, SetFact } from "../types/records";

interface Best {
  weight: number;
  e1rm: number;
  sessionVolume: number;
}

/** One session's contribution to one exercise. */
interface SessionRollup {
  sessionId: string;
  date: string;
  exerciseId: string;
  exerciseName: string;
  weight: number;
  e1rm: number;
  volume: number;
}

function rollup(facts: SetFact[]): SessionRollup[] {
  const byKey = new Map<string, SessionRollup>();
  for (const f of facts) {
    const key = `${f.sessionId}|${f.exerciseId}`;
    const row = byKey.get(key) ?? {
      sessionId: f.sessionId, date: f.date, exerciseId: f.exerciseId,
      exerciseName: f.exerciseName, weight: 0, e1rm: 0, volume: 0,
    };
    row.weight = Math.max(row.weight, f.weightLbs);
    const e = estimatedOneRepMax([
      {
        setNumber: 1, reps: f.reps, weightLbs: f.weightLbs, volumeLbs: f.volumeLbs,
        isWarmup: false, difficulty: null, startedAt: null, endedAt: null,
        durationSeconds: null, timingSource: null,
      },
    ]);
    row.e1rm = Math.max(row.e1rm, e ?? 0);
    row.volume += f.volumeLbs;
    byKey.set(key, row);
  }
  // Chronological, so "previous best" means what it says.
  return [...byKey.values()].sort((a, b) =>
    a.date === b.date ? a.sessionId.localeCompare(b.sessionId) : a.date < b.date ? -1 : 1,
  );
}

/** Every record ever set, oldest first. */
export function computeRecords(facts: SetFact[]): PersonalRecord[] {
  const best = new Map<string, Best>();
  const records: PersonalRecord[] = [];
  for (const row of rollup(facts)) {
    const prior = best.get(row.exerciseId);
    const candidates: [RecordKind, number, number | undefined][] = [
      ["weight", row.weight, prior?.weight],
      ["e1rm", row.e1rm, prior?.e1rm],
      ["sessionVolume", row.volume, prior?.sessionVolume],
    ];
    for (const [kind, value, previous] of candidates) {
      // Unloaded work has no weight or 1RM to beat; a first has nothing to beat.
      if (value <= 0 || previous === undefined || value <= previous) continue;
      records.push({
        exerciseId: row.exerciseId, exerciseName: row.exerciseName, kind,
        value, date: row.date, sessionId: row.sessionId, previous,
      });
    }
    best.set(row.exerciseId, {
      weight: Math.max(prior?.weight ?? 0, row.weight),
      e1rm: Math.max(prior?.e1rm ?? 0, row.e1rm),
      sessionVolume: Math.max(prior?.sessionVolume ?? 0, row.volume),
    });
  }
  return records;
}

/** How many records each session set — the card badge's number. */
export function recordsBySession(records: PersonalRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.sessionId, (counts.get(r.sessionId) ?? 0) + 1);
  return counts;
}

/** The current best per exercise per kind, newest record first. */
export function currentRecords(records: PersonalRecord[]): PersonalRecord[] {
  const latest = new Map<string, PersonalRecord>();
  for (const r of records) latest.set(`${r.exerciseId}|${r.kind}`, r);
  return [...latest.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
