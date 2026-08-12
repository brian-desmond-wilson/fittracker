// When a delivered meal stops being part of your library (C1). Pure.
//
// The delivery flow creates a permanent one-item meal per dish. At roughly
// eight a week on a rotating menu, the library doubles about every month with
// dishes that may never come back — and every one of them dilutes the Meal
// Library screen, the recommender's candidate set and the "N meals" count.
//
// The fix is not deletion. A retired meal is real history: you ate it, its
// logs point at it, and it may well return next season. It is hidden from the
// places that are about deciding what to eat, and nowhere else.

export interface RetirementCandidate {
  /** True only for meals the delivery flow created. A meal you assembled is
   *  never retired automatically — you made it deliberately, and its
   *  ingredients being out of stock is an ordinary Tuesday. */
  isCompletePortion: boolean;
  /** Units of this dish currently in the kitchen. */
  totalQuantity: number;
  /** Days since the last time this meal was logged, or null if never. */
  daysSinceLastLogged: number | null;
  /** Days since the meal was created. Guards the window below against a
   *  delivery that arrives and is not eaten immediately. */
  daysSinceCreated: number;
}

/**
 * Three weeks with none in the kitchen and none eaten. Long enough to survive
 * a fortnight's holiday and a menu that rotates a favourite back in; short
 * enough that a month of deliveries does not bury the meals you actually
 * assembled.
 */
export const RETIRE_AFTER_DAYS = 21;

/**
 * Whether a meal should drop out of the deciding surfaces.
 *
 * Requires stock to be ZERO, not low: a dish still in the fridge is obviously
 * current whatever the dates say, and this must never hide something you can
 * eat right now.
 */
export function shouldRetire(c: RetirementCandidate): boolean {
  if (!c.isCompletePortion) return false;
  if (c.totalQuantity > 0) return false;
  // Never logged: fall back to age, so a dish entered once and never eaten
  // still ages out instead of sitting there forever.
  const idleDays = c.daysSinceLastLogged ?? c.daysSinceCreated;
  return idleDays >= RETIRE_AFTER_DAYS && c.daysSinceCreated >= RETIRE_AFTER_DAYS;
}
