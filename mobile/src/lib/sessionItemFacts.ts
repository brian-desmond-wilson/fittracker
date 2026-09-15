// Shapes a stored Today-session item into a CatalogEntry so a session row can
// reuse catalogCardFacts — the same rich captured-exercise card the Catalog
// tab draws. Pure: no react-native, no Supabase.
import type { CatalogEntry } from "../types/capture";
import type { StoredSessionItem } from "../types/daily";

export function sessionItemToCatalogEntry(item: StoredSessionItem): CatalogEntry {
  return {
    exerciseId: item.exerciseId,
    name: item.name,
    imageUrl: item.imageUrl,
    skillLevel: item.skillLevel,
    equipmentTypes: item.equipmentTypes,
    muscles: item.muscles,
    tier: item.tier,
    scoringTypes: item.scoringTypes,
    // Unused by the card; a session item carries no provenance/goal/category.
    goalTypes: [],
    category: null,
    sources: [],
  };
}
