// mobile/src/lib/mealScoreInput.ts
// Builds `computeBrianScore`'s input for one library meal out of the two
// concept maps `fetchMealLibrary` returns. Pure, and deliberately TYPE-ONLY in
// its imports: ts-jest erases those, so this module pulls in no runtime
// dependency at all and stays reachable from the repo's `testEnvironment: node`
// Jest scope (which no file importing react-native or the supabase client can
// enter). Extracted from `useEatNext` so the mapping below — three silent
// behaviors and six field renames — is under test rather than merely inlined
// three times.
import type { FoodConcept } from "@/src/types/nutrition-preferences";
import type { MealWithItems } from "@/src/types/meal-library";
import type { BrianScoreInput } from "@/src/lib/mealScore";

/**
 * Three behaviors here are load-bearing and easy to lose:
 * - `?? []` — a saved food with no concept links has no entry in the map at
 *   all (`fetchMealLibrary` only inserts keys it saw a link row for), so the
 *   fallback is what keeps an unlinked food from throwing. `computeBrianScore`
 *   treats an empty `concepts` array as "taste unknown", which is correct.
 * - `.filter(…!!c)` — a link can point at a concept id absent from
 *   `conceptsById`; dropping it is deliberate, so a dangling link degrades one
 *   item's taste data instead of injecting `undefined` into the score.
 * - the renames — every field crossing into `BrianScoreInput` changes case
 *   (`small_pieces_ok` → `smallPiecesOk`, `requires_small_pieces` →
 *   `requiresSmallPieces`, `prep_intensive` → `prepIntensive`, plus
 *   `prep_minutes`/`taste_override` on the meal). TypeScript catches a
 *   MISSPELLED target but not a mis-SOURCED one (two booleans are
 *   interchangeable to the compiler), which is what the test pins.
 */
export function brianScoreInputFor(
  meal: MealWithItems,
  conceptIdsBySavedFoodId: Map<string, string[]>,
  conceptsById: Map<string, FoodConcept>,
): BrianScoreInput {
  return {
    prepMinutes: meal.prep_minutes,
    role: meal.role,
    tasteOverride: meal.taste_override,
    items: meal.items.map((it) => ({
      calories: it.savedFood.calories,
      protein: it.savedFood.protein,
      servings: it.servings,
      smallPiecesOk: it.small_pieces_ok,
      concepts: (conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [])
        .map((id) => conceptsById.get(id))
        .filter((c): c is FoodConcept => !!c)
        .map((c) => ({
          rating: c.rating,
          requiresSmallPieces: c.requires_small_pieces,
          prepIntensive: c.prep_intensive,
        })),
    })),
  };
}
