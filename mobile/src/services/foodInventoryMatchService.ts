import { supabase } from "@/src/lib/supabase";
import { resolveInventoryMatches } from "@/src/lib/inventoryResolution";
import { fetchMealLibrary } from "@/src/lib/supabase/mealLibrary";
import type { SavedFood } from "@/src/types/track";

export interface InventoryMatchSummary {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  quantity: number;
  unit: string | null;
}

/**
 * Look up an inventory item matching a barcode for the current user.
 * `quantity` is the PROJECTED total across location rows (locations are the
 * stock truth as of Phase 4) — the legacy column is a cache and is not read.
 * Returns null when there's no match (or no barcode to match against).
 *
 * There is deliberately NO legacy-cache fallback here. Every item now holds
 * at least one location row — the Phase 4 reconcile seeded one for every
 * item that had none, and every write path since maintains that — so a
 * projected 0 means genuinely out of stock, and re-adding a fallback could
 * only re-arm the divergence this phase exists to remove. Do not add one.
 */
export async function findInventoryMatchByBarcode(
  barcode: string | null,
): Promise<InventoryMatchSummary | null> {
  if (!barcode) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("food_inventory")
      .select("id, name, brand, barcode, unit, locations:food_inventory_locations(quantity)")
      .eq("user_id", user.id)
      .eq("barcode", barcode)
      // Nothing stops two items sharing a barcode — food_inventory has only a
      // plain index on it (20250209_extend_food_inventory.sql:28), and the
      // edit screen does not dedupe. Without an ORDER BY the winner is
      // arbitrary AND unstable: the consume RPC's resync UPDATE rewrites the
      // tuple, which can move it in a heap scan. Oldest-first is at least
      // deterministic, and it matters more now that duplicates project
      // different totals.
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Inventory lookup failed:", error);
      return null;
    }
    if (!data) return null;
    // `Omit<…, "quantity">` because the select drops the legacy column. Buys:
    // the projection is load-bearing — delete `quantity:` below and it stops
    // compiling. Does not buy: a field added here but missing from the select
    // string still compiles (no cast can catch that — grep the migrations).
    const { locations, ...rest } = data as Omit<
      InventoryMatchSummary,
      "quantity"
    > & {
      locations: Array<{ quantity: number }>;
    };
    return {
      ...rest,
      quantity: locations.reduce((s, l) => s + l.quantity, 0),
    };
  } catch (error) {
    console.error("findInventoryMatchByBarcode error:", error);
    return null;
  }
}

/** Row shape returned by consume_inventory_units (one per requested id). */
interface ConsumeResultRow {
  inventory_id: string;
  consumed: number;
}

/** Row shape returned by refund_inventory_units (one per requested id). */
interface RefundResultRow {
  inventory_id: string;
  refunded: number;
}

/**
 * Decrement an inventory item's quantity. v1 semantics: one log consumes one
 * inventory unit regardless of `servings` — units represent discrete
 * containers (a bag, a bottle), not strict mass.
 *
 * Delegates to the atomic consume_inventory_units RPC (Phase 2): decrements
 * food_inventory_locations (ready-to-consume first) with a legacy-column
 * fallback, and resyncs the legacy total. Replaces the old non-atomic
 * read-modify-write that only touched food_inventory.quantity.
 *
 * Returns true only when a unit was actually taken. Callers MUST NOT infer
 * that from their own pre-check. The Phase 2 divergence is closed — the
 * barcode gate now projects Σ food_inventory_locations (see
 * findInventoryMatchByBarcode), the same rows this RPC prefers, and since the
 * Phase 4 reconcile every item holds at least one location row — so the RPC's
 * legacy-column fallback branch is unreachable in practice and the gate and
 * the RPC read the same truth. The gate is still a separate, EARLIER read,
 * though, and that is why the rule below stands: stock can move between the
 * two, and a 0 result also covers no-such-row / RLS-filtered. A false
 * return means "nothing moved" — do not compensate for it with a refund.
 * A 0 result is never an error (logging a meal must not fail on stock
 * bookkeeping).
 */
export async function consumeOneInventoryUnit(
  itemId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("consume_inventory_units", {
      p_inventory_ids: [itemId],
    });
    if (error) {
      console.error("consumeOneInventoryUnit RPC failed:", error);
      return false;
    }
    const rows = (data ?? []) as ConsumeResultRow[];
    return rows.some(
      (row) => row?.inventory_id === itemId && (row?.consumed ?? 0) > 0,
    );
  } catch (error) {
    console.error("consumeOneInventoryUnit error:", error);
    return false;
  }
}

/**
 * Re-credit an inventory unit (used on Undo). Delegates to the atomic
 * refund_inventory_units RPC, which mirrors consume: credits
 * food_inventory_locations (ready-to-consume first) with a legacy-column
 * fallback, and resyncs the legacy total.
 *
 * NOT symmetric with consume. Refund credits a unit unconditionally — it has
 * no `quantity > 0` guard in either branch, so refunding an item that was
 * never decremented invents a unit out of nothing. Callers must therefore
 * only refund ids that consumeOneInventoryUnit actually took, which is
 * precisely why consume returns a boolean.
 *
 * Returns true when a unit was credited.
 */
export async function refundOneInventoryUnit(
  itemId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("refund_inventory_units", {
      p_inventory_ids: [itemId],
    });
    if (error) {
      console.error("refundOneInventoryUnit RPC failed:", error);
      return false;
    }
    const rows = (data ?? []) as RefundResultRow[];
    return rows.some(
      (row) => row?.inventory_id === itemId && (row?.refunded ?? 0) > 0,
    );
  } catch (error) {
    console.error("refundOneInventoryUnit error:", error);
    return false;
  }
}

/**
 * Which inventory row a saved food resolves to — by barcode OR by concept link.
 *
 * `findInventoryMatchByBarcode` above answers a narrower question, and quick
 * logging used it: a food with no barcode matched nothing, so eating a
 * barcode-less dish that WAS in the fridge left the stock untouched. Meal
 * logging never had that hole, because it goes through `resolveInventoryMatches`
 * — barcode first, then the concept graph, in-stock rows only. This is that
 * same resolver, asked about one food, so the two paths can no longer disagree
 * about whether something was taken from the kitchen.
 *
 * Reads the library payload, which is cached and is what the meal path reads
 * too — a fresh round trip here would let the two answers drift apart.
 */
export async function findInventoryMatchForFood(
  food: Pick<SavedFood, "id" | "barcode">,
): Promise<InventoryMatchSummary | null> {
  try {
    const library = await fetchMealLibrary();
    const matches = resolveInventoryMatches(
      [{
        savedFoodId: food.id,
        barcode: food.barcode,
        conceptIds: library.conceptIdsBySavedFoodId.get(food.id) ?? [],
      }],
      library.inventory,
    );
    const matchedId = matches.get(food.id);
    if (!matchedId) return null;
    const row = library.inventory.find((r) => r.id === matchedId);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      brand: null,
      barcode: row.barcode,
      // The resolver only ever returns in-stock rows, so this is > 0 — but it
      // is the projection, not an assumption, for the same reason as above.
      quantity: row.totalQuantity,
      unit: null,
    };
  } catch (error) {
    console.error("findInventoryMatchForFood error:", error);
    return null;
  }
}
