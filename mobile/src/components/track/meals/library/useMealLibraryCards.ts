// Everything the library knows about each meal, assembled once.
//
// The screen asks for cards and gets cards. All the deciding — what a meal
// costs from today's fridge, whether it can be made, how often you eat it,
// whether it has retired — happens in pure libs; this hook only fetches and
// wires them together, on one clock, so no two cards can disagree about the
// day or the stock they were computed against.
import { useCallback, useEffect, useMemo, useState } from "react";
import { computeBrianScore } from "@/src/lib/mealScore";
import { brianScoreInputFor } from "@/src/lib/mealScoreInput";
import { mealFaceUrl } from "@/src/lib/mealFace";
import { shouldRetire } from "@/src/lib/mealRetirement";
import { assessAssemblability, daysBetweenLocalDates } from "@/src/lib/stockState";
import { resolveInventoryMatches } from "@/src/lib/inventoryResolution";
import { getLocalDateString } from "@/src/lib/dates";
import {
  mealAvailability,
  mealNutrition,
  type MealCard,
  type MealSource,
} from "@/src/lib/mealLibraryView";
import {
  fetchMealLibrary,
  type MealLibraryData,
} from "@/src/lib/supabase/mealLibrary";
import { adHocCandidates, type AdHocCandidate } from "@/src/lib/adHocMeals";

export interface UseMealLibraryCards {
  cards: MealCard[];
  /** Repeatedly-logged entries the library has never held. */
  adHoc: AdHocCandidate[];
  /** The raw payload, for the detail and builder views that still want it. */
  data: MealLibraryData | null;
  loading: boolean;
  failed: boolean;
  reload: (opts?: { force?: boolean }) => Promise<void>;
}

export function useMealLibraryCards(): UseMealLibraryCards {
  const [data, setData] = useState<MealLibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async (opts?: { force?: boolean }) => {
    try {
      setFailed(false);
      const next = await fetchMealLibrary({ force: opts?.force });
      setData(next);
    } catch (e) {
      console.error("useMealLibraryCards:", e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const cards = useMemo<MealCard[]>(() => {
    if (!data) return [];
    // ONE clock for every card: sampling per meal could straddle local
    // midnight mid-list and band two meals against different "today"s.
    const today = getLocalDateString();

    return data.meals.map((meal) => {
      const items = meal.items.map((it) => ({
        savedFoodId: it.saved_food_id,
        name: it.savedFood.name,
        barcode: it.savedFood.barcode,
        conceptIds: data.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
      }));
      // Resolved ONCE and handed to both, so the price and the verdict are
      // computed against the same rows.
      const matches = resolveInventoryMatches(items, data.inventory);
      const assemblability =
        meal.items.length > 0
          ? assessAssemblability({ items, inventory: data.inventory })
          : undefined;

      const source: MealSource = {
        kind: meal.source_kind ?? "home",
        name: meal.source_name ?? null,
      };

      const nutrition = mealNutrition({
        meal,
        inventory: data.inventory,
        conceptIdsBySavedFoodId: data.conceptIdsBySavedFoodId,
        nutritionByInventoryId: data.nutritionByInventoryId,
        matches,
      });

      const lastLoggedDate = data.lastLoggedByMealId.get(meal.id) ?? null;

      return {
        meal,
        category: meal.category,
        source,
        isFavorite: meal.is_favorite ?? false,
        availability: mealAvailability({
          source,
          assemblability,
          hasItems: meal.items.length > 0,
        }),
        missing: assemblability?.missing ?? [],
        unlinked: assemblability?.unlinked ?? [],
        nutrition,
        score: computeBrianScore(
          brianScoreInputFor(meal, data.conceptIdsBySavedFoodId, data.conceptsById),
        ).score,
        prepMinutes: meal.prep_minutes,
        faceUrl: mealFaceUrl(
          meal.items.map((it) => ({
            displayOrder: it.display_order,
            imageUrl: it.savedFood.image_primary_url,
            calories: (it.savedFood.calories ?? 0) * it.servings,
          })),
        ),
        timesLogged: data.timesLoggedByMealId.get(meal.id) ?? 0,
        lastLoggedDate,
        // Only counts as a rescue when the meal can actually be made: a
        // "use it up" shelf that suggests meals you're missing an ingredient
        // for is telling you to go shopping to avoid waste.
        rescueDaysLeft:
          assemblability?.assemblable ? assemblability.expiringDaysLeft : null,
        isArchived: shouldRetire({
          isCompletePortion: meal.is_complete_portion ?? false,
          totalQuantity: assemblability?.assemblable ? 1 : 0,
          daysSinceLastLogged: lastLoggedDate
            ? daysBetweenLocalDates(lastLoggedDate, today)
            : null,
          daysSinceCreated: daysBetweenLocalDates(
            getLocalDateString(new Date(meal.created_at)),
            today,
          ),
        }),
      };
    });
  }, [data]);

  // Names already in the library are not candidates — promoting one would
  // create a duplicate of a meal you already have.
  const adHoc = useMemo<AdHocCandidate[]>(() => {
    if (!data) return [];
    return adHocCandidates(data.adHocLogs, {
      exclude: new Set(data.meals.map((m) => m.name.trim().toLowerCase())),
    });
  }, [data]);

  return { cards, adHoc, data, loading, failed, reload };
}
