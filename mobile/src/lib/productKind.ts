/**
 * Generic products vs. packages.
 *
 * Under the product model a recipe ingredient points at a product, and that
 * product supplies the numbers. Most of them are packages — a thing with a
 * brand on it, a barcode, or stock on a shelf naming it. Some are stand-ins:
 * "Oatmeal (any)", "Peanut Butter", "White Bread". They exist so a recipe has
 * calories before you own anything that satisfies it, and they step aside the
 * moment real stock resolves through the shared ingredient type.
 *
 * WHY THIS EXISTS. Both kinds rendered their calories identically, so a pick
 * list showing "Instant Oatmeal · 160 cal" above "Oatmeal (any) · 160 cal"
 * made the same claim twice with different force behind it. The first number
 * is off a label. The second is a reference figure. Marking that difference is
 * cheaper — and far more honest — than hiding the generic's number, which
 * would score every recipe built on one at zero until the right brand happened
 * to be in the kitchen.
 *
 * THE PREDICATE IS DELIBERATELY NEGATIVE. There is no "is generic" column and
 * there should not be one: generic-ness is not a property the owner sets, it
 * is the absence of every marker of a package. A product acquires those
 * markers by being bought — the add flows stamp brand and barcode, and stock
 * names its product — so a stand-in becomes a package on its own, with no
 * migration and no curation chore.
 */

/** The two identity markers a package carries, as the pick list sees them. */
export interface ProductKindInput {
  id: string;
  brand: string | null;
  barcode: string | null;
}

/** Only the field that matters here; stock rows carry plenty more. */
export interface StockIdentityRow {
  /** Optional because rows predating the identity column read as unstamped. */
  savedFoodId?: string | null;
}

/**
 * Every product some stock row names — INCLUDING empty rows. A jar you have
 * run out of is still a jar you buy, and its calories still came off a label,
 * so running the cupboard down must not silently demote it to a stand-in.
 */
export function stockedProductIds(inventory: readonly StockIdentityRow[]): Set<string> {
  const out = new Set<string>();
  for (const row of inventory) if (row.savedFoodId) out.add(row.savedFoodId);
  return out;
}

/**
 * A product with no brand, no barcode and no package on record.
 *
 * Passing an empty set — the honest answer when stock has not loaded — makes
 * this over-report rather than under-report. That is the safer direction: a
 * tilde on a real package reads as caution, while a bare number on a stand-in
 * reads as a fact that isn't one.
 */
export function isGenericProduct(
  product: ProductKindInput,
  stocked: ReadonlySet<string>,
): boolean {
  const branded = (product.brand ?? "").trim() !== "";
  const scanned = (product.barcode ?? "").trim() !== "";
  return !branded && !scanned && !stocked.has(product.id);
}

/**
 * "160 cal" for a package, "~160 cal" for a stand-in. One function so the pick
 * list and the ingredient rows below it cannot disagree about the same food —
 * seeing "~160" while choosing and "160" once chosen would read as a bug.
 */
export function caloriesLabel(calories: number, generic: boolean): string {
  return `${generic ? "~" : ""}${calories} cal`;
}
