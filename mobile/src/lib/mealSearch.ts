// Matching a typed query against a meal name (B4). Pure, so the Meals screen
// and the Meal Library modal cannot disagree about what "matches" means.

/**
 * Case-insensitive, whitespace-tolerant, and ALL-WORDS rather than substring:
 * "oat bowl" finds "Protein Oatmeal Bowl", which a plain `includes` would
 * miss because the words are not adjacent. That is the common way to type a
 * half-remembered meal name, and the library is small enough that the looser
 * match costs nothing in precision.
 */
export function matchesQuery(name: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const haystack = name.toLowerCase();
  return words.every((w) => haystack.includes(w));
}
