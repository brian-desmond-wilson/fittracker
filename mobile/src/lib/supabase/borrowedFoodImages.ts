// mobile/src/lib/supabase/borrowedFoodImages.ts
// The loader behind `foodImageBorrow`: two small queries (concept links, and
// the inventory half's photographs) reduced to one map of saved-food id →
// picture. Every read path that shows a saved food goes through this, so a
// product photographed in Food Inventory appears wherever that product does.
import { supabase } from "../supabase";
import { buildBorrowedFoodImages, type BorrowLinkRow } from "../foodImageBorrow";

/** Matches `MEAL_LIBRARY_TTL_MS`'s reasoning: links and photographs change at
 *  human speed, and every screen that shows food would otherwise re-issue both
 *  queries on each mount. */
const TTL_MS = 60_000;

let cached: { data: Map<string, string>; at: number } | null = null;
let inFlight: Promise<Map<string, string>> | null = null;

/** Call after anything that changes links or inventory photographs. */
export function invalidateBorrowedFoodImages(): void {
  cached = null;
}

/**
 * The borrowable picture for every saved food, or an EMPTY map if the lookup
 * fails.
 *
 * Degrading to empty rather than throwing is deliberate: this is decoration on
 * top of a food list, and a failed decoration must not take the list down with
 * it. The caller's own food query has already succeeded by the time this runs.
 */
export async function getBorrowedFoodImages(): Promise<Map<string, string>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  if (inFlight) return inFlight;

  const run = (async () => {
    const [links, inventory] = await Promise.all([
      supabase.from("food_concept_links").select("concept_id, saved_food_id, food_inventory_id"),
      supabase.from("food_inventory").select("id, image_primary_url"),
    ]);
    if (links.error || inventory.error) throw links.error ?? inventory.error;
    return buildBorrowedFoodImages(
      (links.data ?? []) as BorrowLinkRow[],
      new Map(
        ((inventory.data ?? []) as Array<{ id: string; image_primary_url: string | null }>)
          .map((r) => [r.id, r.image_primary_url]),
      ),
    );
  })()
    .then((data) => {
      cached = { data, at: Date.now() };
      return data;
    })
    .catch((e) => {
      console.error("getBorrowedFoodImages:", e);
      return new Map<string, string>();
    })
    .finally(() => {
      if (inFlight === run) inFlight = null;
    });

  inFlight = run;
  return run;
}
