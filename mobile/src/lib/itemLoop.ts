// What one inventory item means to the rest of the loop.
//
// The item detail page used to be blind to this: it showed stock, categories
// and a nutrition panel, and never said the thing was food you could cook
// with. Every input here already existed — the concept graph, the
// assemblability check — but nothing had asked them about a single item.
//
// Pure by design: `src/lib/**` must not import from `src/components/**`, and
// keeping the walk out of the screen is what makes it testable at all (the
// Jest environment is node, so component tests are not available).
import { assessAssemblability, type AssemblabilityInventoryRow } from "./stockState";

export interface LoopMealInput {
  name: string;
  items: Array<{
    savedFoodId: string;
    name: string;
    barcode: string | null;
    conceptIds: string[];
  }>;
}

export interface LoopMeal {
  name: string;
  /** Names of the meal's items with nothing in stock to satisfy them. */
  missing: string[];
  ready: boolean;
}

/**
 * The meals this item participates in, each with its current makeability.
 *
 * Membership is by CONCEPT, not by inventory row: a meal wants "oatmeal", and
 * any oatmeal in the kitchen satisfies it. An item with no concept links
 * belongs to no meals — which is the honest answer, and the visible symptom of
 * the curation gap the AI matcher exists to close.
 *
 * Meals with no items are excluded rather than reported ready: an empty meal
 * is a stub, and calling it makeable would be a lie the Shopping station
 * already refuses to tell.
 */
export function mealsForItem(opts: {
  itemConceptIds: readonly string[];
  meals: readonly LoopMealInput[];
  inventory: AssemblabilityInventoryRow[];
}): LoopMeal[] {
  const { itemConceptIds, meals, inventory } = opts;
  if (itemConceptIds.length === 0) return [];
  const wanted = new Set(itemConceptIds);

  const out: LoopMeal[] = [];
  for (const meal of meals) {
    if (meal.items.length === 0) continue;
    const usesIt = meal.items.some((it) => it.conceptIds.some((c) => wanted.has(c)));
    if (!usesIt) continue;
    const { missing } = assessAssemblability({ items: meal.items, inventory });
    out.push({ name: meal.name, missing, ready: missing.length === 0 });
  }
  // Ready meals first — they are the ones you can act on right now — then by
  // how close the rest are, then by name so the order never wobbles between
  // renders on ties.
  return out.sort((a, b) =>
    a.missing.length !== b.missing.length
      ? a.missing.length - b.missing.length
      : a.name.localeCompare(b.name),
  );
}

/**
 * Calendar date this item runs out at the observed rate, or null when there is
 * no rate yet (a brand-new item, or one the estimator has never seen move).
 *
 * Deliberately not clamped to a display maximum: the caller decides whether
 * "runs out in 3 years" is worth showing. Returns a local YYYY-MM-DD so it
 * lines up with every other date in the app.
 */
export function runOutDate(
  todayLocalDate: string,
  daysUntilOut: number | null | undefined,
): string | null {
  if (daysUntilOut === null || daysUntilOut === undefined) return null;
  if (!Number.isFinite(daysUntilOut) || daysUntilOut < 0) return null;
  const [y, m, d] = todayLocalDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Math.round(daysUntilOut));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
