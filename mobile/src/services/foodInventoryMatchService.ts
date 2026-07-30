import { supabase } from "@/src/lib/supabase";

export interface InventoryMatchSummary {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  quantity: number;
  unit: string | null;
  storage_type: "single-location" | "multi-location" | string;
}

/**
 * Look up an inventory item matching a barcode for the current user.
 * `quantity` is the PROJECTED total across location rows (locations are the
 * stock truth as of Phase 4) — the legacy column is a cache and is not read.
 * Returns null when there's no match (or no barcode to match against).
 *
 * Pre-Task-12 note: an item with zero location rows projects 0, so the pantry
 * toggle reads "out of stock" for it until the reconcile seeds its canonical
 * row. Deliberate — this is the same direction Task 5 took for the grid, and
 * the alternative is a legacy-cache fallback, which is the divergence this
 * phase exists to remove.
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
      .select("id, name, brand, barcode, unit, storage_type, locations:food_inventory_locations(quantity)")
      .eq("user_id", user.id)
      .eq("barcode", barcode)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Inventory lookup failed:", error);
      return null;
    }
    if (!data) return null;
    // `Omit<…, "quantity">` rather than the whole interface: the select above
    // deliberately does NOT fetch the legacy column, so a cast claiming it is
    // present would be a lie, and would let a future field added to
    // InventoryMatchSummary go missing from the select without tsc noticing.
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
 * findInventoryMatchByBarcode), the same rows this RPC prefers — but the gate
 * is still a separate, earlier read: stock can move between the two, and a 0
 * result also covers no-such-row / RLS-filtered. Where the two still differ
 * is one-directional and safe: before Task 12's reconcile, a zero-row item
 * projects 0 so the gate is simply off and this RPC is never called, leaving
 * its legacy-column branch unreachable from the barcode path. The gate can
 * only be more conservative than the RPC, never more optimistic. A false
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
