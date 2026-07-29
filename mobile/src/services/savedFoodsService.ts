import { supabase } from "@/src/lib/supabase";
import { SavedFood, RecentFoodItem } from "@/src/types/track";

/**
 * Get all saved foods for the current user
 */
export async function getSavedFoods(): Promise<SavedFood[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("saved_foods")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching saved foods:", error);
    throw error;
  }

  return data || [];
}

/**
 * Get a saved food by barcode (local lookup - instant)
 */
export async function getSavedFoodByBarcode(
  barcode: string
): Promise<SavedFood | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("saved_foods")
    .select("*")
    .eq("user_id", user.id)
    .eq("barcode", barcode)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned - not found
      return null;
    }
    console.error("Error fetching saved food by barcode:", error);
    throw error;
  }

  return data;
}

/**
 * Get a saved food by ID
 */
export async function getSavedFoodById(id: string): Promise<SavedFood | null> {
  const { data, error } = await supabase
    .from("saved_foods")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    console.error("Error fetching saved food by id:", error);
    throw error;
  }

  return data;
}

/**
 * Create a new saved food
 */
export async function createSavedFood(
  food: Omit<SavedFood, "id" | "user_id" | "created_at" | "updated_at">
): Promise<SavedFood> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("saved_foods")
    .insert({
      ...food,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating saved food:", error);
    throw error;
  }

  return data;
}

/**
 * Update a saved food
 */
export async function updateSavedFood(
  id: string,
  updates: Partial<
    Omit<SavedFood, "id" | "user_id" | "created_at" | "updated_at">
  >
): Promise<SavedFood> {
  const { data, error } = await supabase
    .from("saved_foods")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating saved food:", error);
    throw error;
  }

  return data;
}

/**
 * Toggle favorite status for a saved food
 */
export async function toggleFavorite(id: string): Promise<SavedFood> {
  // First get current state
  const current = await getSavedFoodById(id);
  if (!current) {
    throw new Error("Saved food not found");
  }

  return updateSavedFood(id, { is_favorite: !current.is_favorite });
}

/**
 * Postgres foreign_key_violation. On a `saved_foods` delete the only FK that
 * can raise it is `meal_items_saved_food_id_fkey`, which is deliberately
 * `on delete restrict` (spec §5.2, migration 20260729100000:45): deleting a
 * food must never silently shrink a Meal Library meal and its calories.
 */
const FOREIGN_KEY_VIOLATION = "23503";

/** How many blocking meals to name before collapsing the rest into a count. */
const MAX_NAMED_MEALS = 3;

/**
 * Names of the Meal Library meals that use this saved food.
 *
 * Two queries rather than one PostgREST embed: `meal_items`' reference to
 * `meals` is a COMPOSITE FK on `(meal_id, user_id)`, which is not the
 * single-column shape the rest of this codebase embeds through, so an
 * `meals(name)` embed is not a safe assumption to bake into an error path
 * that only ever runs when something has already gone wrong.
 *
 * Never throws. A failure here (including `meal_items` not existing yet —
 * the Phase 2 migrations are unapplied) must not mask the actual, actionable
 * error, so it degrades to an empty list and a generic-but-human message.
 */
async function findBlockingMealNames(savedFoodId: string): Promise<string[]> {
  try {
    const { data: items, error: itemsError } = await supabase
      .from("meal_items")
      .select("meal_id")
      .eq("saved_food_id", savedFoodId);
    if (itemsError) throw itemsError;

    const mealIds = Array.from(
      new Set(((items ?? []) as Array<{ meal_id: string }>).map((i) => i.meal_id))
    );
    if (mealIds.length === 0) return [];

    const { data: meals, error: mealsError } = await supabase
      .from("meals")
      .select("name")
      .in("id", mealIds)
      .order("name");
    if (mealsError) throw mealsError;

    return ((meals ?? []) as Array<{ name: string }>).map((m) => m.name);
  } catch (e) {
    console.error("Error looking up meals blocking a saved food delete:", e);
    return [];
  }
}

/**
 * The RESTRICT message the user actually sees. Raw Postgres text here reads as
 * an app crash ("violates foreign key constraint meal_items_saved_food_id_fkey")
 * when the real situation is a routine, fixable one — so name the meals and say
 * what to do about them.
 */
function foodInUseByMealsError(names: string[]): Error {
  if (names.length === 0) {
    return new Error(
      "This food is used by a meal in your Meal Library. Remove it from that meal first, then delete the food."
    );
  }
  const shown = names
    .slice(0, MAX_NAMED_MEALS)
    .map((n) => `“${n}”`)
    .join(", ");
  const remaining = names.length - MAX_NAMED_MEALS;
  const list = remaining > 0 ? `${shown} and ${remaining} more` : shown;
  return names.length === 1
    ? new Error(
        `This food is used by the meal ${list}. Remove it from that meal first, then delete the food.`
      )
    : new Error(
        `This food is used by ${names.length} meals — ${list}. Remove it from those meals first, then delete the food.`
      );
}

/**
 * Delete a saved food
 */
export async function deleteSavedFood(id: string): Promise<void> {
  const { error } = await supabase.from("saved_foods").delete().eq("id", id);

  if (error) {
    console.error("Error deleting saved food:", error);
    if (error.code === FOREIGN_KEY_VIOLATION) {
      throw foodInUseByMealsError(await findBlockingMealNames(id));
    }
    throw error;
  }
}

/**
 * Get all favorites for the current user
 */
export async function getFavorites(): Promise<SavedFood[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("saved_foods")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_favorite", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching favorites:", error);
    throw error;
  }

  return data || [];
}

/**
 * Search saved foods by name
 */
export async function searchSavedFoods(query: string): Promise<SavedFood[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  // Match against both name and brand so a query like "Boost" hits
  // either "Boost Drink" (in name) or a food with brand "Boost".
  const escaped = query.replace(/[%_]/g, "\\$&");
  const { data, error } = await supabase
    .from("saved_foods")
    .select("*")
    .eq("user_id", user.id)
    .or(`name.ilike.%${escaped}%,brand.ilike.%${escaped}%`)
    .order("name", { ascending: true })
    .limit(20);

  if (error) {
    console.error("Error searching saved foods:", error);
    throw error;
  }

  return data || [];
}

/**
 * Get recent foods with usage frequency (last 30 days)
 * Returns top N most frequently logged foods
 */
export async function getRecentFoods(limit: number = 5): Promise<RecentFoodItem[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not authenticated");
  }

  // Calculate 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString();

  // Get meal logs with saved_food_id in the last 30 days
  const { data: mealLogs, error: mealError } = await supabase
    .from("meal_logs")
    .select("saved_food_id, logged_at")
    .eq("user_id", user.id)
    .not("saved_food_id", "is", null)
    .gte("logged_at", startDate);

  if (mealError) {
    console.error("Error fetching meal logs for recent foods:", mealError);
    throw mealError;
  }

  if (!mealLogs || mealLogs.length === 0) {
    return [];
  }

  // Count occurrences and get last logged date for each saved_food_id
  const foodCounts = new Map<string, { count: number; lastLogged: string }>();

  mealLogs.forEach((log) => {
    if (log.saved_food_id) {
      const existing = foodCounts.get(log.saved_food_id);
      if (existing) {
        existing.count++;
        if (log.logged_at > existing.lastLogged) {
          existing.lastLogged = log.logged_at;
        }
      } else {
        foodCounts.set(log.saved_food_id, {
          count: 1,
          lastLogged: log.logged_at,
        });
      }
    }
  });

  // Sort by count descending, then by last logged descending
  const sortedFoodIds = Array.from(foodCounts.entries())
    .sort((a, b) => {
      if (b[1].count !== a[1].count) {
        return b[1].count - a[1].count;
      }
      return b[1].lastLogged.localeCompare(a[1].lastLogged);
    })
    .slice(0, limit)
    .map(([id]) => id);

  if (sortedFoodIds.length === 0) {
    return [];
  }

  // Fetch the saved foods
  const { data: savedFoods, error: foodsError } = await supabase
    .from("saved_foods")
    .select("*")
    .in("id", sortedFoodIds);

  if (foodsError) {
    console.error("Error fetching saved foods for recent:", foodsError);
    throw foodsError;
  }

  if (!savedFoods) {
    return [];
  }

  // Build result maintaining the sorted order
  const result: RecentFoodItem[] = [];

  sortedFoodIds.forEach((id) => {
    const food = savedFoods.find((f) => f.id === id);
    const countData = foodCounts.get(id);

    if (food && countData) {
      result.push({
        savedFood: food,
        logCount: countData.count,
        lastLoggedAt: countData.lastLogged,
      });
    }
  });

  return result;
}
