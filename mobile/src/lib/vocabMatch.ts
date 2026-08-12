// Matching rules for the brand and flavor pickers.
//
// Separate from `supabase/inventoryVocab` on purpose: that module imports the
// Supabase client, which cannot load in the node test environment, and these
// two rules are the part worth testing.

/**
 * Case- and position-insensitive filter. Substring rather than prefix because
 * "signature" should find "Kirkland Signature" — you rarely remember which
 * word a brand starts with.
 */
export function filterOptions<T>(
  options: readonly T[],
  query: string,
  label: (option: T) => string,
): T[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...options];
  return options.filter((o) => label(o).toLowerCase().includes(q));
}

/**
 * True when the typed text is not already one of the options, ignoring case.
 *
 * Case-insensitive because a case variant is precisely the duplicate the
 * picker exists to prevent: offering to add "kirkland signature" beside an
 * existing "Kirkland Signature" would create the split it is meant to stop.
 */
export function isNewValue(options: readonly string[], value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.length === 0) return false;
  return !options.some((o) => o.toLowerCase() === v);
}
