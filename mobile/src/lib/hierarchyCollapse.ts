// Spec §4.5: the current row plus up to four siblings, then "See all N".
// Ancestors and the current row are never collapsed; only the sibling list is.
export const SIBLING_LIMIT = 4;

export function collapseSiblings<T>(
  siblings: T[],
  expanded: boolean,
  limit: number = SIBLING_LIMIT,
): { shown: T[]; hidden: number } {
  if (expanded || siblings.length <= limit) return { shown: siblings, hidden: 0 };
  return { shown: siblings.slice(0, limit), hidden: siblings.length - limit };
}
