import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { MealLibraryModal } from "@/src/components/track/meals/library/MealLibraryModal";
import { getSavedFoods } from "@/src/services/savedFoodsService";
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";
import type { SavedFood } from "@/src/types/track";

/**
 * The Meal Library as its own station off the Track hub, rather than a door
 * inside Fuel. It renders in `presentation="screen"` mode, so it is a page
 * pushed into the Track stack — sliding in from the side under a back chevron,
 * like Food Inventory and Fuel Schedule — not a sheet raised over one.
 *
 * `savedFoods` is fetched here for the same reason Fuel fetches it: the meal
 * builder's food picker needs the full list. A failure leaves the list empty —
 * the library itself still loads, and only the builder's picker is thinner —
 * so it is logged rather than raised as an alert over the library.
 */
export default function MealLibraryPage() {
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
    return () => {
      cancelled = true;
    };
  }, []);

  // Always land on Track index — router.back() would walk linear history if
  // entered from outside the Track tab. Mirrors Fuel's exit.
  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/track");

  // No wrapper view: in screen mode the library already renders its own
  // full-bleed page, and a second flex container would only add a layer.
  return (
    <MealLibraryModal
      presentation="screen"
      visible
      savedFoods={savedFoods}
      todayDate={getLocalDateString(new Date())}
      onClose={close}
      onLogged={() => {}}
    />
  );
}
