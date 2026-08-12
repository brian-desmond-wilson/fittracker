import { useEffect, useState } from "react";
import { fetchMealLibrary } from "@/src/lib/supabase/mealLibrary";
import { assessAssemblability } from "@/src/lib/stockState";
import { isExpiringSoon } from "@/src/lib/expiryPolicy";
import { projectItemStock } from "@/src/lib/stockState";
import { getLocalDateString } from "@/src/lib/dates";
import { rescuePlan, type RescueSuggestion } from "@/src/lib/rescuePlan";

/**
 * E3. Assembles `rescuePlan`'s inputs from the meal library, which since D1 is
 * already in memory from the recommender on the same screen — so this costs no
 * round trip.
 *
 * `daysLeft` comes straight off the library's inventory projection rather than
 * being re-derived from dates here; `isExpiringSoon` is not reused because it
 * needs an `ItemStockState` and category names the library rows do not carry,
 * and re-deriving the window would be a second definition of "expiring".
 */
export function useRescuePlan() {
  const [rescues, setRescues] = useState<RescueSuggestion[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const library = await fetchMealLibrary();
        if (cancelled) return;
        const expiring = library.inventory
          .filter((r) => r.totalQuantity > 0 && r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= 7)
          .map((r) => ({
            name: r.name,
            conceptIds: r.conceptIds,
            daysLeft: r.daysLeft as number,
          }));
        if (expiring.length === 0) {
          setRescues([]);
          return;
        }
        const meals = library.meals.map((m) => {
          const items = m.items.map((it) => ({
            savedFoodId: it.saved_food_id,
            name: it.savedFood.name,
            barcode: it.savedFood.barcode,
            conceptIds: library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
          }));
          return {
            mealId: m.id,
            name: m.name,
            conceptIds: items.flatMap((it) => it.conceptIds),
            assemblable: assessAssemblability({ items, inventory: library.inventory }).assemblable,
          };
        });
        setRescues(rescuePlan({ meals, expiring }));
      } catch (e) {
        console.error("useRescuePlan:", e);
        if (!cancelled) setRescues([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { rescues };
}
