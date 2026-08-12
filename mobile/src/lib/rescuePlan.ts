// "What can I make before it turns" (E3). Pure, deterministic, no model call.
//
// The recommender already breaks TIES with an expiring ingredient, so a rescue
// surfaces only when a meal was going to be suggested anyway — the loop's
// central promise, eat it before you bin it, was left to coincidence.
//
// This asks the question directly and from the other end: start from the food
// that is about to spoil, and find the meals that use the most of it. That is
// a ranking over data the app already holds, so it is a pure function rather
// than a generator — deterministic, testable, and free.

export interface RescueMealInput {
  mealId: string;
  name: string;
  /** Concept ids the meal's ingredients carry. */
  conceptIds: string[];
  /** Whether every ingredient resolves to something in stock. */
  assemblable: boolean;
}

export interface ExpiringItemInput {
  name: string;
  conceptIds: string[];
  /** Days until it expires; 0 is today. Negative rows are already gone and
   *  must be filtered out by the caller — this ranks rescues, not autopsies. */
  daysLeft: number;
}

export interface RescueSuggestion {
  mealId: string;
  name: string;
  /** The expiring items this meal would use, soonest first. */
  rescues: string[];
  /** Days until the most urgent of them goes. */
  soonestDaysLeft: number;
  assemblable: boolean;
}

/**
 * Meals that would use food about to expire, best rescue first.
 *
 * Ranked by HOW MANY items it saves, then by how soon the most urgent of them
 * goes, then by name for a stable order. Count leads deliberately: one meal
 * clearing three expiring things beats three meals clearing one each, because
 * you only eat one of them.
 *
 * Un-makeable meals are included but sorted last within their tier. A meal
 * missing one ingredient that would rescue three is worth knowing about — it
 * is a shopping trip with a purpose — and hiding it would repeat the mistake
 * of only ever surfacing rescues that were already going to be suggested.
 */
export function rescuePlan(opts: {
  meals: readonly RescueMealInput[];
  expiring: readonly ExpiringItemInput[];
  /** How many to return. The surface has room for two or three, and a longer
   *  list stops reading as "do this" and starts reading as a report. */
  limit?: number;
}): RescueSuggestion[] {
  const { meals, expiring, limit = 3 } = opts;
  const live = expiring.filter((e) => e.daysLeft >= 0);
  if (live.length === 0) return [];

  const out: RescueSuggestion[] = [];
  for (const meal of meals) {
    const wanted = new Set(meal.conceptIds);
    const hits = live
      .filter((e) => e.conceptIds.some((c) => wanted.has(c)))
      .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
    if (hits.length === 0) continue;
    out.push({
      mealId: meal.mealId,
      name: meal.name,
      rescues: hits.map((h) => h.name),
      soonestDaysLeft: hits[0].daysLeft,
      assemblable: meal.assemblable,
    });
  }

  return out
    .sort(
      (a, b) =>
        b.rescues.length - a.rescues.length ||
        a.soonestDaysLeft - b.soonestDaysLeft ||
        (a.assemblable === b.assemblable ? 0 : a.assemblable ? -1 : 1) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
