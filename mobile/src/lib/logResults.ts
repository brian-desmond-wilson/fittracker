// mobile/src/lib/logResults.ts
//
// The quick-log sheet's search results, as one list.
//
// A packaged dish exists twice in the data: as a meal, and as the saved food
// that is its only ingredient. Both matched the same search, and the sheet
// showed them under separate headings — "Meals" and "Foods" — which read as two
// ways to log the same thing. They were not the same: logging the FOOD writes a
// row that names no meal, so the library's "31× · last Tuesday" never moved and
// the recommender went on suggesting something eaten constantly.
//
// Pure and here rather than inline in the sheet, because which of two rows
// survives a collision is a rule worth a test.
import type { MealWithItems } from "../types/meal-library";
import type { SavedFood } from "../types/track";

export type LogResult =
  | { kind: "meal"; meal: MealWithItems }
  | { kind: "food"; food: SavedFood };

export function mergeLogResults(opts: {
  meals: MealWithItems[];
  foods: SavedFood[];
  /** How many meals to show, and twice that many foods. */
  limit: number;
}): LogResult[] {
  const meals = opts.meals.slice(0, opts.limit);

  // Only a ONE-item meal is the same thing as its ingredient. A three-item
  // meal that happens to contain the peanut butter you also searched for is a
  // different answer to the same question, and dropping the peanut butter
  // would hide a food you can legitimately log on its own.
  const covered = new Set(
    meals.filter((m) => m.items.length === 1).map((m) => m.items[0].saved_food_id),
  );

  const foods = opts.foods.filter((f) => !covered.has(f.id)).slice(0, opts.limit * 2);

  // Meals first: they carry the score, the stock check and the history, so
  // when both survive the meal is the better answer.
  return [
    ...meals.map((meal): LogResult => ({ kind: "meal", meal })),
    ...foods.map((food): LogResult => ({ kind: "food", food })),
  ];
}
