// What a meal looks like (C5).
//
// Meal rows and Eat Next chips were text-only while every saved food they are
// built from carries product photos — so the Meal Library was a wall of
// identical cards, and the one part of the app that already had pictures was
// the one place they were not used.
//
// A meal has no image of its own and should not: it is an assembly, and its
// identity is its parts. So it borrows one. Pure, so the choice is testable
// and every surface makes the same one.

/** The subset of a meal item this reads — a structural subset of
 *  `MealItemWithFood`, narrowed so a fixture is two fields rather than a whole
 *  `SavedFood`. */
export interface FaceCandidate {
  displayOrder: number;
  imageUrl: string | null;
  calories: number | null;
}

/**
 * The image to show for a meal, or null when none of its items has one.
 *
 * Picks by CALORIES, not by display order: the biggest contributor is what the
 * meal actually looks like on a plate. "Chicken and rice" photographed as its
 * side of rice would be worse than no picture at all — a wrong image is read
 * as a fact, an absent one only as missing data.
 *
 * Display order breaks ties so the choice is stable between renders, which
 * matters more than it sounds: an unstable face would flicker as the list
 * re-renders and defeat the meal rows' memoisation.
 */
export function mealFaceUrl(items: readonly FaceCandidate[]): string | null {
  const withImages = items.filter((it) => it.imageUrl !== null && it.imageUrl !== "");
  if (withImages.length === 0) return null;
  const best = [...withImages].sort(
    (a, b) =>
      (b.calories ?? 0) - (a.calories ?? 0) ||
      a.displayOrder - b.displayOrder,
  )[0];
  return best.imageUrl;
}
