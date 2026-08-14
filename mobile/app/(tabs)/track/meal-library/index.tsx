import React, { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { Check } from "lucide-react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MealLibraryScreen } from "@/src/components/track/meals/library/MealLibraryScreen";
import { BarcodeScannerModal } from "@/src/components/track/BarcodeScannerModal";
import { UndoToast, type UndoToastContent } from "@/src/components/ui";
import { getLocalDateString } from "@/src/lib/dates";
import { fetchMealLibrary, logMeal, undoMealLog, MealLoggedButDecrementFailed } from "@/src/lib/supabase/mealLibrary";
import { defaultMealTypeFor } from "@/src/types/meal-library";
import { supabase } from "@/src/lib/supabase";
import type { MealCard } from "@/src/lib/mealLibraryView";

/**
 * The Meal Library station off the Track hub — the catalog itself.
 *
 * A meal and the builder are sibling routes rather than sub-views of this page,
 * so the stack is Track › Meal Library › meal and the back chevron means what
 * it says on every page of it.
 */
export default function MealLibraryPage() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<UndoToastContent | null>(null);
  // Bumped whenever we come back from a sub-page, so the catalog re-reads what
  // changed there — a meal logged, edited, built or deleted all move the
  // shelves.
  const [refreshKey, setRefreshKey] = useState(0);
  const focusedBefore = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // The catalog loads itself on mount, so only a RETURN needs to re-read;
      // skipping the first focus keeps that from fetching the same rows twice.
      if (focusedBefore.current) setRefreshKey((k) => k + 1);
      focusedBefore.current = true;
    }, []),
  );

  // Always land on Track index — router.back() would walk linear history if
  // entered from outside the Track tab. Mirrors Fuel's exit.
  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/track");

  const openMeal = useCallback(
    (mealId: string) => router.push(`/(tabs)/track/meal-library/${mealId}`),
    [router],
  );

  /**
   * Undo the log a toast is still offering: delete the rows this write made and
   * put back only the units it actually took. The shelves then re-read, because
   * the refund changes what is available and what each meal scores.
   */
  const handleUndoLog = useCallback(
    async (mealId: string, loggedAt: string, consumedIds: string[]) => {
      setToast(null);
      try {
        await undoMealLog(mealId, loggedAt, consumedIds);
        setRefreshKey((k) => k + 1);
      } catch (e) {
        console.error("undo log from library:", e);
        Alert.alert("Couldn't undo that", "The meal is still on today.");
      }
    },
    [],
  );

  /**
   * Log straight from a card. Reuses `logMeal` — the same function the meal
   * page calls, with the same inventory decrement and the same two failure
   * branches — so a one-tap log from the shelf is not a second, thinner way
   * of writing the same row.
   *
   * A one-tap log on a small target needs an acknowledgement, and the same tap
   * that logs the wrong meal needs a way back, so the confirmation is a toast
   * carrying Undo rather than an alert demanding a dismissal.
   */
  const handleLog = useCallback(async (card: MealCard) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in to log meals");
        return;
      }
      const library = await fetchMealLibrary();
      const meal = library.meals.find((m) => m.id === card.meal.id);
      if (!meal) return;
      const result = await logMeal(user.id, meal, {
        date: getLocalDateString(new Date()),
        mealType: defaultMealTypeFor(meal),
        conceptIdsBySavedFoodId: library.conceptIdsBySavedFoodId,
        inventory: library.inventory,
      });
      setToast({
        title: "Logged",
        detail: `${meal.name} — added to today.`,
        undo: () => handleUndoLog(meal.id, result.loggedAt, result.consumedIds),
      });
    } catch (e) {
      if (e instanceof MealLoggedButDecrementFailed) {
        Alert.alert("Logged (inventory not updated)", "The meal was logged, but stock didn't change.");
        return;
      }
      console.error("log from library:", e);
      Alert.alert("Couldn't log that", e instanceof Error ? e.message : "Unknown error");
    }
  }, [handleUndoLog]);

  /**
   * The library's own reading of a barcode: not "add this food" but "which of
   * my meals use it". Resolved against the same concept links the
   * availability check uses, so the answer agrees with the shelves.
   */
  const handleScanned = useCallback(async (barcode: string) => {
    setScanning(false);
    try {
      const library = await fetchMealLibrary();
      const inv = library.inventory.find((r) => r.barcode === barcode);
      const conceptIds = new Set(inv?.conceptIds ?? []);
      const matches = library.meals.filter((m) =>
        m.items.some((it) => {
          if (it.savedFood.barcode === barcode) return true;
          const ids = library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [];
          return ids.some((c) => conceptIds.has(c));
        }),
      );
      if (matches.length === 0) {
        Alert.alert("No meals use that", "Nothing in your library lists this product.");
        return;
      }
      if (matches.length === 1) {
        openMeal(matches[0].id);
        return;
      }
      Alert.alert(
        `${matches.length} meals use that`,
        matches.map((m) => m.name).join("\n"),
      );
    } catch (e) {
      console.error("scan in library:", e);
      Alert.alert("Couldn't check that", "Try again.");
    }
  }, [openMeal]);

  return (
    <>
      <MealLibraryScreen
        onBack={close}
        onOpenMeal={(card) => openMeal(card.meal.id)}
        onNewMeal={() => router.push("/(tabs)/track/meal-library/new")}
        onLogMeal={handleLog}
        onScan={() => setScanning(true)}
        refreshKey={refreshKey}
      />

      {/* Four seconds rather than the inventory screen's default — this bar
          names a meal, so there is more to read before deciding. */}
      <UndoToast
        toast={toast}
        onDismissed={() => setToast(null)}
        icon={Check}
        durationMs={4000}
      />

      <BarcodeScannerModal
        visible={scanning}
        onClose={() => setScanning(false)}
        onBarcodeScanned={handleScanned}
      />
    </>
  );
}
