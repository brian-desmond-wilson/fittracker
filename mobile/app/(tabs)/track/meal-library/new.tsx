import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { MealPage } from "@/src/components/track/meals/library/MealPage";
import { getSavedFoods } from "@/src/services/savedFoodsService";
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";
import type { SavedFood } from "@/src/types/track";

/**
 * The builder, as its own page under the library. A static segment, so it wins
 * over `[id]` — there is no meal called "new".
 */
export default function NewMealPage() {
  const router = useRouter();
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await getSavedFoods();
        if (!cancelled) setSavedFoods(all);
      } catch (error) {
        console.error("Error fetching saved foods:", error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/track/meal-library");

  return (
    <MealPage
      mealId={null}
      savedFoods={savedFoods}
      todayDate={getLocalDateString(new Date())}
      onClose={close}
      // Leaves the library's stack for the kitchen record behind an
      // ingredient; back returns here.
      onOpenProduct={(inventoryId) =>
        router.push(`/(tabs)/track/food-inventory/${inventoryId}`)}
    />
  );
}
