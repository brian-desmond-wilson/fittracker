// Sweep E6: "use it up" — which meals consume an inventory item, resolved
// DETERMINISTICALLY through concept links (an LLM has no place here; the
// links are the ground truth the AI matcher already curated). Feeds the
// expiry review sheet so "expiring" comes with the obvious next move: cook
// the thing that uses it.
export interface UseItUpMeal {
  name: string;
  items: Array<{ conceptIds: string[] }>;
}

export function mealsUsingConcepts(
  itemConceptIds: readonly string[],
  meals: readonly UseItUpMeal[],
): string[] {
  if (itemConceptIds.length === 0) return [];
  const wanted = new Set(itemConceptIds);
  return meals
    .filter((m) => m.items.some((it) => it.conceptIds.some((c) => wanted.has(c))))
    .map((m) => m.name);
}
