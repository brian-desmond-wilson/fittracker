// Which quick-log door offers which product.
//
// The Beverage door used to filter by history — a food counted as a drink only
// after being logged as one — which was circular: search is how you log a
// drink, and search showed nothing until you had. The label on the product
// (`saved_foods.beverage_kinds`) replaces that. Taxonomy, not memory.
//
// The split the labels draw:
//
//   food (kinds null)              → meal door only
//   pure beverage (any kinds)      → beverage door only. A Coke with lunch is
//                                    logged through the beverage door at
//                                    lunchtime; each door answers one question.
//   meal-replacement shake         → BOTH doors. A Huel is honestly both, and
//                                    "which door did I come through" must not
//                                    decide whether dinner happened.
//
// Only the quick-log doors read these. The meal BUILDER's ingredient picker is
// deliberately untouched: milk is a beverage at the glass and an ingredient in
// a recipe, and the label describes drinking it, not cooking with it.
import { beverageCountsAsMealDefault } from "../types/meal-library";
import type { BeverageKind } from "../types/track";

/** The label as fetched: absent on rows read before the column existed, and
 *  an empty array only if a client bug wrote one past the DB check. Both read
 *  as "food". */
type Labeled = { beverage_kinds?: BeverageKind[] | null };

const kindsOf = (f: Labeled): BeverageKind[] =>
  Array.isArray(f.beverage_kinds) ? f.beverage_kinds : [];

export function inBeverageDoor(f: Labeled): boolean {
  return kindsOf(f).length > 0;
}

export function inMealDoor(f: Labeled): boolean {
  const kinds = kindsOf(f);
  return kinds.length === 0 || kinds.includes("meal_replacement_shake");
}

/**
 * What a drink logs as when tapped from the beverage door.
 *
 * The form's tags win outright once the owner has touched them. Untouched,
 * the product's own label answers — its kinds, and the counts-as-meal default
 * those kinds imply, which is the whole point of labeling a Huel: tapping it
 * from recents fills the window without a second thought. With no tags on
 * either side, "other" satisfies the DB's at-least-one-kind rule and the
 * switch keeps whatever the form showed, since it was the only signal given.
 */
export function beverageLogFacts(opts: {
  formKinds: readonly BeverageKind[];
  formCountsAsMeal: boolean;
  foodKinds: readonly BeverageKind[] | null | undefined;
}): { kinds: BeverageKind[]; countsAsMeal: boolean } {
  if (opts.formKinds.length > 0) {
    return { kinds: [...opts.formKinds], countsAsMeal: opts.formCountsAsMeal };
  }
  const fromFood = opts.foodKinds ?? [];
  if (fromFood.length > 0) {
    return { kinds: [...fromFood], countsAsMeal: beverageCountsAsMealDefault(fromFood) };
  }
  return { kinds: ["other"], countsAsMeal: opts.formCountsAsMeal };
}
