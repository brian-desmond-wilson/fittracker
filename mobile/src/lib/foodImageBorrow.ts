// One product, one picture — across both halves of the app.
//
// The same real-world thing exists twice in this database: as a `food_inventory`
// row (what you own) and as a `saved_foods` row (what you eat), joined only by a
// shared `food_concepts` link. Photographs land on the inventory half — that is
// where the camera and the barcode scanner write — so a Thistle meal that is
// pictured in Food Inventory was blank everywhere the eating half of the app
// showed it: Quick Add tiles, the Meal Library, Eat Next.
//
// So the eating half borrows the picture. Pure, so the rule is testable and
// every surface resolves the same image for the same food.

/** A `food_concept_links` row, narrowed to the three columns this reads. */
export interface BorrowLinkRow {
  concept_id: string;
  saved_food_id: string | null;
  food_inventory_id: string | null;
}

/**
 * Which picture each saved food may borrow, keyed by saved-food id.
 *
 * Only concepts naming **exactly one pictured inventory item** lend anything.
 * That restriction is the whole design: concepts come in two sizes here, and
 * only one of them identifies a product. "Pasta Trapanese With Sautéed
 * Mushrooms" links one saved food to one inventory row — the same object, so
 * its photograph is a fact about that food. "Prepared Meal" links seven
 * unrelated inventory rows, and borrowing from it would put a stranger's dinner
 * on the card. A wrong picture is read as a fact; a missing one only as missing
 * data, which is why an ambiguous concept lends nothing rather than guessing.
 *
 * When more than one concept qualifies, the most specific wins — fewest linked
 * inventory items, then concept id — so the choice is stable between renders
 * and identical on every surface.
 *
 * The map is unconditional: it says what a food COULD borrow, not what it
 * should show. Callers apply it only where the food has no picture of its own
 * (`borrowedImageUrl`), so a real photograph is never overridden.
 */
export function buildBorrowedFoodImages(
  links: readonly BorrowLinkRow[],
  /** Inventory id → its `image_primary_url` (null/absent = unpictured). */
  inventoryImageById: ReadonlyMap<string, string | null>,
): Map<string, string> {
  const picturedByConcept = new Map<string, string[]>();
  const inventoryCountByConcept = new Map<string, number>();
  const savedFoodsByConcept = new Map<string, string[]>();

  for (const l of links) {
    if (l.food_inventory_id) {
      inventoryCountByConcept.set(
        l.concept_id,
        (inventoryCountByConcept.get(l.concept_id) ?? 0) + 1,
      );
      const url = inventoryImageById.get(l.food_inventory_id);
      if (url) {
        const arr = picturedByConcept.get(l.concept_id) ?? [];
        arr.push(url);
        picturedByConcept.set(l.concept_id, arr);
      }
    }
    if (l.saved_food_id) {
      const arr = savedFoodsByConcept.get(l.concept_id) ?? [];
      arr.push(l.saved_food_id);
      savedFoodsByConcept.set(l.concept_id, arr);
    }
  }

  // Concepts that identify exactly one pictured product, most specific first.
  const lending = [...picturedByConcept.entries()]
    .filter(([, urls]) => urls.length === 1)
    .sort(
      ([aId], [bId]) =>
        (inventoryCountByConcept.get(aId) ?? 0) - (inventoryCountByConcept.get(bId) ?? 0) ||
        aId.localeCompare(bId),
    );

  const borrowed = new Map<string, string>();
  for (const [conceptId, urls] of lending) {
    for (const savedFoodId of savedFoodsByConcept.get(conceptId) ?? []) {
      // First writer wins, and `lending` is sorted most-specific-first.
      if (!borrowed.has(savedFoodId)) borrowed.set(savedFoodId, urls[0]);
    }
  }
  return borrowed;
}

/**
 * The picture to show for a saved food: its own, or the one it may borrow.
 *
 * Returns the food's own `image_primary_url` untouched whenever it has one —
 * borrowing is a fallback for the blank case, never an override.
 */
export function borrowedImageUrl(
  food: { id: string; image_primary_url: string | null },
  borrowed: ReadonlyMap<string, string>,
): string | null {
  if (food.image_primary_url) return food.image_primary_url;
  return borrowed.get(food.id) ?? null;
}

/** `food` with its picture resolved, or the same object when nothing changes —
 *  preserving identity so memoised rows do not re-render for no reason. */
export function withBorrowedImage<T extends { id: string; image_primary_url: string | null }>(
  food: T,
  borrowed: ReadonlyMap<string, string>,
): T {
  const url = borrowedImageUrl(food, borrowed);
  return url === food.image_primary_url ? food : { ...food, image_primary_url: url };
}
