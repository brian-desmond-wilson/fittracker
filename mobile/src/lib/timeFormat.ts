// Turning times into the strings a person reads.
//
// Three different things were all called `formatTime` and hand-copied around
// the app — a clock time from an "HH:MM" column, a clock time from a
// timestamp, and a running duration in seconds. They are genuinely different
// conversions, so they get three names that say which input they take rather
// than one name that leaves you guessing at the call site.
//
// `timeFields.ts` is the sibling of this module: it owns the "HH:MM" strings
// themselves (parsing, ordering, round-tripping through a `Date`), while this
// one only renders them.

/** 12-hour clock with meridiem, e.g. "2:05 PM". */
const clock = (hours: number, minutes: number): string => {
  const ampm = hours >= 12 ? "PM" : "AM";
  const display = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${display}:${String(minutes).padStart(2, "0")} ${ampm}`;
};

/**
 * A stored time-of-day — "14:30", or the "14:30:00" Postgres `time` columns
 * hand back — as "2:30 PM".
 *
 * Unparseable input comes back untouched: a settings row that somehow holds
 * junk should show the junk, not "NaN:00 AM".
 */
export function formatClockTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  if (isNaN(h)) return hhmm;
  return clock(h, isNaN(m) ? 0 : m);
}

/**
 * The wall-clock time of an instant — a TIMESTAMPTZ column or a `Date` — in
 * the reader's own timezone, as "2:30 PM".
 */
export function formatInstantTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * An elapsed duration in seconds, as a stopwatch reads it: "5:03" under an
 * hour, "1:05:03" over one. Minutes stay unpadded at the front because that
 * is how a timer looks, and seconds always pad.
 *
 * Negative input clamps to zero — a countdown that overshoots should read
 * "0:00", never "-1:-3".
 */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/**
 * Whole seconds elapsed since a `Date.now()`-style timestamp, never negative.
 *
 * A start in the future clamps to zero rather than counting backwards — a
 * device clock adjustment can put "now" behind a timestamp already stored.
 */
export function elapsedSecondsSince(since: number): number {
  return Math.max(0, Math.floor((Date.now() - since) / 1000));
}
