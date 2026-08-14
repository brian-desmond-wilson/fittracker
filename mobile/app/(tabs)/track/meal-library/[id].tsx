import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MealPage } from "@/src/components/track/meals/library/MealPage";
import { getSavedFoods } from "@/src/services/savedFoodsService";
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";
import type { MealType, SavedFood } from "@/src/types/track";

/**
 * One meal, pushed onto the Track stack under the library: Track › Meal
 * Library › this meal. Editing happens inside the page and backs out to the
 * meal; leaving the page backs out to the shelves, which re-read on focus.
 */
export default function MealDetailPage() {
  const router = useRouter();
  // `slot` and `at` arrive from the quick-log sheet, which already asked when
  // and which part of the day — asking again would be the second half of the
  // confusion this page was pulled into.
  const { id, slot, at } = useLocalSearchParams<{ id: string; slot?: MealType; at?: string }>();
  const openedAt = at ? new Date(at) : undefined;
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
      // Leaves the library's stack for the kitchen record behind an
      // ingredient; back returns here.
      onOpenProduct={(inventoryId) =>
        router.push(`/(tabs)/track/food-inventory/${inventoryId}`)}
      initialMealType={slot}
      initialLoggedAt={openedAt && !Number.isNaN(openedAt.getTime()) ? openedAt : undefined}
    />
  );
}
