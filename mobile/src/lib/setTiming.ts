// When each set happened and how long it took.
//
// Live mode measures this from the timer. Backfill takes it from you, two ways:
// a duration, or explicit start and end times. Durations chain — a set with
// only a duration begins where the one before it ended — so a whole workout can
// be filled in without typing a single clock time.
//
// Pure. The screen owns the inputs, this owns the arithmetic.

/** What the user gave us for one set, before it is resolved to real times. */
export type SetTimeInput =
  | { kind: "duration"; seconds: number }
  | { kind: "span"; startMs: number; endMs: number }
  | { kind: "none" };

export interface ResolvedSetTime {
  startMs: number | null;
  endMs: number | null;
  durationSeconds: number | null;
}

const UNRESOLVED: ResolvedSetTime = {
  startMs: null,
  endMs: null,
  durationSeconds: null,
};

/**
 * Resolve a session's sets, in the order they were performed, against the
 * time the session started.
 *
 * A span is taken as given and moves the cursor to its end — entering one
 * real clock time re-anchors everything after it. A duration is laid down
 * from wherever the cursor is. A set with nothing leaves the cursor alone
 * rather than guessing, so one blank set in the middle doesn't shift every
 * set after it into fiction.
 */
export function resolveSetTimes(
  anchorMs: number,
  inputs: SetTimeInput[],
): ResolvedSetTime[] {
  let cursor = anchorMs;
  return inputs.map((input) => {
    if (input.kind === "span") {
      // Backwards spans are the user's typo to see, not ours to silently
      // reorder — clamp the duration at zero and keep the times they gave.
      const durationSeconds = Math.max(
        0,
        Math.round((input.endMs - input.startMs) / 1000),
      );
      cursor = Math.max(cursor, input.endMs);
      return { startMs: input.startMs, endMs: input.endMs, durationSeconds };
    }
    if (input.kind === "duration") {
      const seconds = Math.max(0, Math.round(input.seconds));
      const startMs = cursor;
      const endMs = cursor + seconds * 1000;
      cursor = endMs;
      return { startMs, endMs, durationSeconds: seconds };
    }
    return UNRESOLVED;
  });
}

/** mm:ss, or h:mm:ss once it runs past an hour. */
export function formatSetDuration(seconds: number | null): string {
  if (seconds === null) return "--";
  const s = Math.max(0, Math.round(seconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

/** The chip's label: the span when we know it, the duration when that's all
 *  there is, and an invitation when there's nothing yet. */
export function formatSetTimeChip(
  resolved: ResolvedSetTime,
  clock: (ms: number) => string,
): string {
  if (resolved.startMs !== null && resolved.endMs !== null) {
    return `${clock(resolved.startMs)} – ${clock(resolved.endMs)}`;
  }
  if (resolved.durationSeconds !== null) {
    return formatSetDuration(resolved.durationSeconds);
  }
  return "Set time";
}

/** Split a duration into the sheet's two fields. */
export function splitDuration(seconds: number | null): { mins: number; secs: number } {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return { mins: Math.floor(s / 60), secs: s % 60 };
}

/** One set's place in the session, for whole-session resolution. */
export interface SessionSetRef {
  exIdx: number;
  setIdx: number;
  input: SetTimeInput;
}

export interface ResolvedSession {
  resolvedByKey: Map<string, ResolvedSetTime>;
  /** Where a duration typed into this set would begin. */
  chainStartByKey: Map<string, number>;
  inputByKey: Map<string, SetTimeInput>;
}

export const setKey = (exIdx: number, setIdx: number): string => `${exIdx}:${setIdx}`;

/**
 * Resolve every set in a session at once, keyed by its position.
 *
 * The screen needs this to draw the chips and the save path needs it to write
 * the rows; computing it in one place keeps what you see and what is stored
 * from drifting apart.
 */
export function resolveSession(
  anchorMs: number,
  refs: SessionSetRef[],
): ResolvedSession {
  const resolved = resolveSetTimes(anchorMs, refs.map((r) => r.input));
  const resolvedByKey = new Map<string, ResolvedSetTime>();
  const chainStartByKey = new Map<string, number>();
  const inputByKey = new Map<string, SetTimeInput>();
  let cursor = anchorMs;
  refs.forEach((ref, i) => {
    const key = setKey(ref.exIdx, ref.setIdx);
    resolvedByKey.set(key, resolved[i]);
    chainStartByKey.set(key, cursor);
    inputByKey.set(key, ref.input);
    const end = resolved[i].endMs;
    if (end !== null) cursor = Math.max(cursor, end);
  });
  return { resolvedByKey, chainStartByKey, inputByKey };
}

/**
 * Move a span's start and carry its end along with it.
 *
 * Editing the start of a set means "it happened later than I said", not "it
 * lasted longer" — so the gap between the two is held and the end follows. A
 * span that was inverted collapses to zero rather than preserving nonsense.
 */
export function shiftSpanStart(
  startMs: number,
  endMs: number,
  nextStartMs: number,
): { startMs: number; endMs: number } {
  const held = Math.max(0, endMs - startMs);
  return { startMs: nextStartMs, endMs: nextStartMs + held };
}
