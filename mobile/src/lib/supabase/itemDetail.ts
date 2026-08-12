// Everything the item detail page needs beyond the item row itself.
//
// The page used to render only what `food_inventory` stores, which is why it
// knew less about an item than the list screen did. One round of fetches here
// hands it the three things it was missing: what the item is used for, how
// fast it goes, and whether it is already on the list.
//
// Decoration, all of it: every field is nullable and the screen renders
// without any of it. A failure here must never stop an item from opening.
import { supabase } from "../supabase";
import { fetchMealLibrary } from "./mealLibrary";
import { fetchConsumptionRates } from "./shopping";
import { mealsForItem, runOutDate, type LoopMeal } from "../itemLoop";
import type { ConsumptionEstimate } from "../consumptionRate";

export interface ItemDetailContext {
  /** Meals this item participates in, readiest first. Empty when unlinked. */
  meals: LoopMeal[];
  /** Null until the estimator has seen this item move. */
  rate: ConsumptionEstimate | null;
  /** Local YYYY-MM-DD, or null when there is no rate to project from. */
  runsOutOn: string | null;
  /** True when an unpurchased shopping-list row already points at this item. */
  onShoppingList: boolean;
  /** profiles.target_calories, for the "share of today" line. */
  targetCalories: number | null;
}

export async function fetchItemDetailContext(
  itemId: string,
  totalQuantity: number,
  todayLocalDate: string,
): Promise<ItemDetailContext> {
  const [library, rates, listRes] = await Promise.all([
    fetchMealLibrary(),
    fetchConsumptionRates(todayLocalDate, new Map([[itemId, totalQuantity]])),
    supabase
      .from("shopping_list")
      .select("id")
      .eq("food_inventory_id", itemId)
      .eq("is_purchased", false)
      .limit(1),
  ]);
  if (listRes.error) throw listRes.error;

  // Concept links come from the library's own inventory projection rather than
  // a second query, so this page and the meal library can never disagree about
  // what an item is.
  const conceptIds = library.inventory.find((r) => r.id === itemId)?.conceptIds ?? [];

  const meals = mealsForItem({
    itemConceptIds: conceptIds,
    meals: library.meals.map((m) => ({
      name: m.name,
      items: m.items.map((it) => ({
        savedFoodId: it.saved_food_id,
        name: it.savedFood.name,
        barcode: it.savedFood.barcode,
        conceptIds: library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
      })),
    })),
    inventory: library.inventory,
  });

  const rate = rates.get(itemId) ?? null;
  return {
    meals,
    rate,
    runsOutOn: runOutDate(todayLocalDate, rate?.daysUntilOut),
    onShoppingList: (listRes.data ?? []).length > 0,
    targetCalories: library.targetCalories,
  };
}
