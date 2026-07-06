import { useState, useEffect, useCallback } from "react";
import { SavedFood, RecentFoodItem } from "@/src/types/track";
import { getRecentFoods, getFavorites } from "@/src/services/savedFoodsService";

// Recent foods (last 5) + favorites, fetched on mount. `refetch` is called by
// the screen after any write that could change them (logging, favoriting, etc.).
export function useRecentAndFavorites() {
  const [recentFoods, setRecentFoods] = useState<RecentFoodItem[]>([]);
  const [favorites, setFavorites] = useState<SavedFood[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const refetch = useCallback(async () => {
    try {
      setLoadingRecent(true);
      const [recentData, favoritesData] = await Promise.all([
        getRecentFoods(5),
        getFavorites(),
      ]);
      setRecentFoods(recentData);
      setFavorites(favoritesData);
    } catch (error) {
      console.error("Error fetching recent/favorites:", error);
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { recentFoods, favorites, loadingRecent, refetch };
}
