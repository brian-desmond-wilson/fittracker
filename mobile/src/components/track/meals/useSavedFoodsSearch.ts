import { useState, useEffect } from "react";
import { SavedFood } from "@/src/types/track";
import { searchSavedFoods } from "@/src/services/savedFoodsService";

// Debounced search across the saved_foods library (matches name OR brand).
// Returns [] until the query is at least 2 chars.
export function useSavedFoodsSearch(searchQuery: string) {
  const [searchResults, setSearchResults] = useState<SavedFood[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const hits = await searchSavedFoods(q);
        setSearchResults(hits);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  return { searchResults, searching };
}
