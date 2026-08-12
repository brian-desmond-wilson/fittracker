import { useEffect, useState } from "react";
import { fetchMealLibrary } from "@/src/lib/supabase/mealLibrary";
import type { MealWithItems } from "@/src/types/meal-library";
import { matchesQuery } from "@/src/lib/mealSearch";

/**
 * B4. The Meals screen's search box queried `saved_foods` only, so half the
 * food in the app — every meal you had assembled — was invisible to it. You
 * could search for "oats" and be told nothing matched while a meal called
 * Protein Oatmeal Bowl sat two taps away.
 *
 * Reads the library through `fetchMealLibrary`, which since D1 serves this
 * from the cache the recommender on the same screen has already populated, so
 * searching costs no round trip. Filtering is local for the same reason: the
 * library is tens of rows, not thousands.
 */
export function useMealSearch(searchQuery: string) {
  const [mealResults, setMealResults] = useState<MealWithItems[]>([]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setMealResults([]);
      return;
    }
    let cancelled = false;
    // Same 250ms debounce as the saved-foods search, so the two halves of one
    // result card settle together rather than one flashing in ahead.
    const handle = setTimeout(async () => {
      try {
        const library = await fetchMealLibrary();
        if (cancelled) return;
        setMealResults(library.meals.filter((m) => matchesQuery(m.name, q)));
      } catch (e) {
        console.error("Meal search error:", e);
        if (!cancelled) setMealResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery]);

  return { mealResults };
}
