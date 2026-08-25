// Personal records are computed from set history, never stored: the moment a
// set is edited or deleted, a stored record would be a lie.

/** One logged working set, flattened — the only shape record math needs. */
export interface SetFact {
  exerciseId: string;
  exerciseName: string;
  sessionId: string;
  date: string;
  weightLbs: number;
  reps: number;
  volumeLbs: number;
}

export type RecordKind = "weight" | "e1rm" | "sessionVolume";

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  kind: RecordKind;
  value: number;
  date: string;
  sessionId: string;
  /** What this beat. A record always beats something — firsts are not records. */
  previous: number;
}
