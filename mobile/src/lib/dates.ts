// mobile/src/lib/dates.ts
// Local-calendar date helpers. Canonical home: `src/lib/**` must not import
// from `src/components/**`, and `getLocalDateString` used to live in
// `components/track/meals/mealsHelpers.ts` while `lib/supabase/mealLibrary.ts`
// imported it — the app's only lib -> components edge. The definition moved
// here. `mealsHelpers` re-exports it so the existing call sites under
// `src/components/**` keep working unchanged — every caller OUTSIDE that tree
// (`src/lib`, `src/hooks`, the `app/` routes) imports from this module
// directly, so the re-export serves components and nothing else.
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
