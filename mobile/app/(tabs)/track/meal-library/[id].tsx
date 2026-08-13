import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MealPage } from "@/src/components/track/meals/library/MealPage";
import { getSavedFoods } from "@/src/services/savedFoodsService";
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";
import type { SavedFood } from "@/src/types/track";

/**
 * One meal, pushed onto the Track stack under the library: Track › Meal
 * Library › this meal. Editing happens inside the page and backs out to the
 * meal; leaving the page backs out to the shelves, which re-read on focus.
 */
export default function MealDetailPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([]);

  // Only the builder behind Edit needs these, so the page renders without
  // waiting on them.
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

  // `replace` animates as a PUSH, so using it for Back would make going back
  // look like going forward. Pop when there is a stack to pop, and fall back
  // only for a cold deep link straight into this route.
  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/track/meal-library");

  return (
    <MealPage
      mealId={id ?? null}
      savedFoods={savedFoods}
      todayDate={getLocalDateString(new Date())}
      onClose={close}
    />
  );
}
