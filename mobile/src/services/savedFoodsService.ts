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
 * Delete a saved food
 */
export async function deleteSavedFood(id: string): Promise<void> {
  const { error } = await supabase.from("saved_foods").delete().eq("id", id);

  if (error) {
    console.error("Error deleting saved food:", error);
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

  const { data, error } = await supabase
    .from("saved_foods")
    .select("*")
    .eq("user_id", user.id)
    .ilike("name", `%${query}%`)
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
