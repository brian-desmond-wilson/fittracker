/**
 * What a typed query asks of the inventory.
 *
 * The rule that matters is not in this file but in how the screen uses it: a
 * search asks the WHOLE inventory, and the segment, the category tab and the
 * subcategory filter all stand aside while it does. Stacking the query on top
 * of them meant typing a name could only ever find what was already on screen,
 * so the one question a search exists to answer — "do I have this at all?" —
 * was the one it could not. The filters are ignored, not cleared; they come
 * back intact the moment the field empties.
 */

/** All words must appear, case-insensitively, in the name or the brand — so
 *  "thistle pasta" finds the Thistle Pasta Arrabiata. */
export function matchesInventoryQuery(
  item: { name: string; brand?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const hay = `${item.name} ${item.brand ?? ""}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
