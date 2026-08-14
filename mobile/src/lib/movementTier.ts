// How deep a movement sits in the variation hierarchy.
//
// This mirrors the `get_movement_tier` SQL function exactly, and the SQL is
// simple enough to mirror without risk: it walks `parent_exercise_id` upward
// and returns how many steps it took. A movement with no parent is tier 0
// ("core"); each variation above it counts one more.
//
// It exists because the tier was being asked for one row at a time. Opening
// the Movements tab fired one RPC per movement — 43 round trips to draw 43
// badges — and the Exercises tab did the same for its own list. One query for
// the id-to-parent pairs answers the whole screen.
//
// The server function stays the definition of record and is still used where
// a single row is being looked at on its own.

export interface TierRow {
  id: string;
  parent_exercise_id: string | null;
}

/**
 * Tier for every row given, by id.
 *
 * A parent that isn't in the set stops the walk — the count is of steps
 * actually taken, which is why callers should pass the whole table rather
 * than a filtered slice. Memoised down the chain, so a deep hierarchy costs
 * one pass rather than one pass per row, and a cycle (which the database's
 * depth trigger should prevent) stops rather than hanging.
 */
export function computeTiers(rows: TierRow[]): Map<string, number> {
  const parentOf = new Map<string, string | null>();
  for (const row of rows) parentOf.set(row.id, row.parent_exercise_id);

  const tiers = new Map<string, number>();

  const tierOf = (id: string, seen: Set<string>): number => {
    const known = tiers.get(id);
    if (known !== undefined) return known;
    const parent = parentOf.get(id);
    // No parent, parent outside the set, or a cycle: the walk ends here.
    if (!parent || !parentOf.has(parent) || seen.has(parent)) {
      tiers.set(id, 0);
      return 0;
    }
    seen.add(id);
    const depth = tierOf(parent, seen) + 1;
    tiers.set(id, depth);
    return depth;
  };

  for (const row of rows) tierOf(row.id, new Set());
  return tiers;
}
