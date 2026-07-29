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
 * Returns null when there's no match (or no barcode to match against).
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
      .select("id, name, brand, barcode, quantity, unit, storage_type")
      .eq("user_id", user.id)
      .eq("barcode", barcode)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Inventory lookup failed:", error);
      return null;
    }
    return (data as InventoryMatchSummary | null) ?? null;
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
 * that from their own pre-check: the barcode path gates on
 * food_inventory.quantity (see findInventoryMatchByBarcode) while the RPC
 * decides from food_inventory_locations, so the two can disagree. A false
 * return means "nothing moved" — do not compensate for it with a refund.
 * A 0 result is never an error (logging a meal must not fail on stock
 * bookkeeping), and it conflates no-stock / no-such-row / RLS-filtered.
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
