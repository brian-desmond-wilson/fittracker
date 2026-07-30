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
