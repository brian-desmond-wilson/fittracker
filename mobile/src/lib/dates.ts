// mobile/src/lib/dates.ts
// Local-calendar date helpers. Canonical home: `src/lib/**` must not import
// from `src/components/**`, and `getLocalDateString` used to live in
// `components/track/meals/mealsHelpers.ts` while `lib/supabase/mealLibrary.ts`
// imported it — the app's only lib -> components edge. The definition moved
// here. `mealsHelpers` re-exported it for a while so existing call sites kept
// working; that bridge is gone, because new files had started importing
// through it and two canonical paths for one function is how the copies
// started in the first place. Everything imports from this module.
//
// Related: `daysBetweenLocalDates` in `lib/stockState.ts` owns the whole-day
// arithmetic over the strings this produces.

/** Today's (or `date`'s) local calendar date as YYYY-MM-DD — never UTC. */
export const getLocalDateString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Parse a YYYY-MM-DD calendar date into a LOCAL `Date` at noon.
 *
 * `new Date("2026-08-15")` is parsed by the spec as UTC midnight, so
 * `.toLocaleDateString()` on it renders the PREVIOUS calendar day in every
 * negative UTC offset — the whole of the Americas. Anything that formats a
 * stored `DATE` column for display must go through here instead. Noon rather
 * than midnight for the same DST reason `daysBetweenLocalDates` gives: a
 * midnight anchor can land on either side of a clock change.
 */
export const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map((s) => parseInt(s, 10));
  return new Date(y, m - 1, d, 12);
};

/**
 * The instant a local calendar day begins, in epoch ms — for "did this
 * timestamp happen today" checks. NOT `parseLocalDate(...).getTime()`: that
 * anchor is deliberately NOON (see above), and using it as a day boundary
 * silently discards the whole morning — a 7am instruction read as
 * "yesterday's" is how the Today tab's adjust box once failed to recompose.
 */
export const localDayStartMs = (dateStr: string): number => {
  const [y, m, d] = dateStr.split("-").map((s) => parseInt(s, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
};

/**
 * A calendar day either side of `d`, as a new `Date`.
 *
 * `setDate` past the end of a month rolls the month and year, and it moves by
 * calendar days rather than by 24 hours — so a day that gains or loses an hour
 * to a clock change still counts as one day. Four copies of this lived beside
 * the four copies of `getLocalDateString`.
 */
export const addDays = (d: Date, days: number): Date => {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
};

/** How the app writes a day: "Aug 14, 2026". */
const DAY_LABEL: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

/**
 * A stored date, written the way a person reads it.
 *
 * Takes either shape and treats each correctly, because the app stores both
 * and screens were mixing them up: a bare `YYYY-MM-DD` from a `DATE` column is
 * a calendar day and must be parsed locally, while a full timestamp is an
 * instant and `new Date` already resolves it right.
 *
 * The bug this closes: `new Date("2026-08-14")` is UTC midnight, which is the
 * 13th everywhere west of Greenwich — so program start dates, progress-photo
 * days and program history all rendered one day early.
 */
export const formatDayLabel = (
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = DAY_LABEL,
): string => {
  if (!value) return "—";
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  const date = isBareDate ? parseLocalDate(value.trim()) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", options);
};

/**
 * A stored day as "Today", "Yesterday", or its date.
 *
 * Anchored on `today` so a caller can hand one instant to every row it is
 * labelling; without that, a list rendering across local midnight could say
 * "Today" on one row and "Yesterday" on the row beneath it for the same day.
 *
 * Accepts a timestamp too, taking the day off the front, because the history
 * lists that use this store some rows each way.
 */
export const formatRelativeDay = (
  value: string,
  today: Date = new Date(),
): string => {
  const day = value.split("T")[0];
  if (day === getLocalDateString(today)) return "Today";
  if (day === getLocalDateString(addDays(today, -1))) return "Yesterday";
  return formatDayLabel(day);
};

/**
 * An instant as a person would say it: "Today at 4:30 PM", "Tomorrow at
 * 9:00 AM", "Sat, Aug 16 at 9:00 AM".
 *
 * For arrivals — a delivery that has not happened yet — so it knows tomorrow,
 * which `formatRelativeDay` (built for history) has no use for. Anchored on
 * `now` so a screen labelling several can hand one instant to all of them and
 * not have a list disagree with itself across local midnight.
 */
export const formatArrival = (
  value: Date | string,
  now: Date = new Date(),
  opts: { midSentence?: boolean } = {},
): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = getLocalDateString(date);
  // `midSentence` lowercases "Today" and "Tomorrow" only — the words that are
  // ordinary nouns inside a sentence. Weekdays, months and AM/PM are proper
  // forms in any position, and lowercasing the whole string to fix the first
  // word is what turned "Sun, Aug 16 at 7:00 PM" into "sun, aug 16 at 7:00 pm".
  if (day === getLocalDateString(now)) return `${opts.midSentence ? "today" : "Today"} at ${time}`;
  if (day === getLocalDateString(addDays(now, 1))) {
    return `${opts.midSentence ? "tomorrow" : "Tomorrow"} at ${time}`;
  }
  const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${label} at ${time}`;
};

/**
 * The same arrival, as a caption: "Sun 7:00 PM", "Today 7:00 PM".
 *
 * `formatArrival` writes a sentence, which is right in a line of prose and
 * wrong under a tile title, where "Sun, Aug 16 at 7:00 PM" wraps to two lines.
 * This drops the "at" and the comma, and the month with them — for the next few
 * days a weekday names the day unambiguously.
 *
 * It only stays unambiguous for a week. Beyond six days out "Sat" reads as this
 * Saturday to everyone, so the month comes back rather than the caption lying.
 */
export const formatArrivalShort = (
  value: Date | string,
  now: Date = new Date(),
): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = getLocalDateString(date);
  if (day === getLocalDateString(now)) return `Today ${time}`;
  if (day === getLocalDateString(addDays(now, 1))) return `Tomorrow ${time}`;
  const withinTheWeek = day <= getLocalDateString(addDays(now, 6));
  const label = date.toLocaleDateString("en-US", {
    weekday: "short",
    ...(withinTheWeek ? {} : { month: "short", day: "numeric" }),
  });
  return `${label} ${time}`;
};
