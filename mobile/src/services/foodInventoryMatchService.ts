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

/**
 * Decrement an inventory item's quantity (clamped at 0). v1 semantics:
 * one log consumes one inventory unit regardless of `servings` — units
 * represent discrete containers (a bag, a bottle), not strict mass.
 */
export async function consumeOneInventoryUnit(itemId: string): Promise<void> {
  try {
    const { data, error: readErr } = await supabase
      .from("food_inventory")
      .select("quantity")
      .eq("id", itemId)
      .single();
    if (readErr || !data) {
      console.error("consumeOneInventoryUnit read failed:", readErr);
      return;
    }
    const next = Math.max(0, (data.quantity ?? 0) - 1);
    const { error: updErr } = await supabase
      .from("food_inventory")
      .update({ quantity: next })
      .eq("id", itemId);
    if (updErr) {
      console.error("consumeOneInventoryUnit update failed:", updErr);
    }
  } catch (error) {
    console.error("consumeOneInventoryUnit error:", error);
  }
}

/**
 * Re-credit an inventory unit (used on Undo). Increments by 1.
 */
export async function refundOneInventoryUnit(itemId: string): Promise<void> {
  try {
    const { data, error: readErr } = await supabase
      .from("food_inventory")
      .select("quantity")
      .eq("id", itemId)
      .single();
    if (readErr || !data) {
      console.error("refundOneInventoryUnit read failed:", readErr);
      return;
    }
    const next = (data.quantity ?? 0) + 1;
    const { error: updErr } = await supabase
      .from("food_inventory")
      .update({ quantity: next })
      .eq("id", itemId);
    if (updErr) {
      console.error("refundOneInventoryUnit update failed:", updErr);
    }
  } catch (error) {
    console.error("refundOneInventoryUnit error:", error);
  }
}
