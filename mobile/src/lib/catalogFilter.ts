// Client-side catalog filtering. The whole captured catalog is one query's
// result (tens to hundreds of rows), so filters run here — instantly, offline,
// and testable — instead of as server round-trips per pill tap.
import type { CatalogEntry, CatalogFilters } from "../types/capture";

export function filterCatalog(entries: CatalogEntry[], f: CatalogFilters): CatalogEntry[] {
  const q = f.search.trim().toLowerCase();
  return entries.filter((e) => {
    if (f.muscle && !e.muscles.some((m) => m.name === f.muscle)) return false;
    if (f.equipment && !e.equipmentTypes.includes(f.equipment)) return false;
    if (f.category && !e.goalTypes.includes(f.category)) return false;
    if (f.handle && !e.sources.some((s) => s.posterHandle === f.handle)) return false;
    if (q) {
      const inName = e.name.toLowerCase().includes(q);
      const inHandle = e.sources.some((s) => s.posterHandle?.toLowerCase().includes(q));
      if (!inName && !inHandle) return false;
    }
    return true;
  });
}

/** Distinct handles present in the catalog, for the handle filter pills. */
export function catalogHandles(entries: CatalogEntry[]): string[] {
  const set = new Set<string>();
  for (const e of entries) {
    for (const s of e.sources) if (s.posterHandle) set.add(s.posterHandle);
  }
  return [...set].sort();
}
