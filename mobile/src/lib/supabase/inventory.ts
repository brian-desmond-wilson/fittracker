// mobile/src/lib/supabase/inventory.ts
// Data access for the inventory domain (Nutrition OS Phase 4). Replaces the
// three inline fetch+projection copies (FoodInventoryScreen and the two
// detail/edit routes). Every quantity the app displays comes from
// projectItemStock over location rows — the one truth.
import { supabase } from "../supabase";
import {
  projectItemStock,
  type ItemStockState,
} from "../stockState";
import type {
  FoodCategory,
  FoodInventoryItem,
  FoodInventoryLocation,
  FoodLocation,
  FoodSubcategory,
} from "@/src/types/track";

export interface InventoryItemWithState extends FoodInventoryItem {
  locations: FoodInventoryLocation[];
  categories: FoodCategory[];
  subcategories: FoodSubcategory[];
  state: ItemStockState;
  // Legacy projection names kept so existing render code needs minimal
  // change; always mirror state.* (delete once all readers use state).
  total_quantity: number;
  ready_quantity: number;
  storage_quantity: number;
}

export async function fetchInventoryWithState(
  todayLocalDate: string,
): Promise<InventoryItemWithState[]> {
  const [items, locations, categoryMaps, subcategoryMaps] = await Promise.all([
    supabase.from("food_inventory").select("*"),
    supabase.from("food_inventory_locations").select("*"),
    supabase.from("food_inventory_category_map").select("*, food_categories(*)"),
    supabase.from("food_inventory_subcategory_map").select("*, food_subcategories(*)"),
  ]);
  const errors = [items.error, locations.error, categoryMaps.error, subcategoryMaps.error]
    .filter((e) => e !== null);
  if (errors.length > 0) {
    errors.slice(1).forEach((e) => console.error("fetchInventoryWithState:", e));
    throw errors[0];
  }
  const locRows = (locations.data ?? []) as FoodInventoryLocation[];
  return ((items.data ?? []) as FoodInventoryItem[]).map((item) => {
    const itemLocations = locRows.filter((l) => l.food_inventory_id === item.id);
    const state = projectItemStock({
      item,
      locations: itemLocations,
      todayLocalDate,
    });
    return {
      ...item,
      locations: itemLocations,
      categories: ((categoryMaps.data ?? []) as Array<{ food_inventory_id: string; food_categories: FoodCategory | null }>)
        .filter((m) => m.food_inventory_id === item.id)
        .map((m) => m.food_categories)
        .filter((c): c is FoodCategory => !!c),
      subcategories: ((subcategoryMaps.data ?? []) as Array<{ food_inventory_id: string; food_subcategories: FoodSubcategory | null }>)
        .filter((m) => m.food_inventory_id === item.id)
        .map((m) => m.food_subcategories)
        .filter((c): c is FoodSubcategory => !!c),
      state,
      total_quantity: state.totalQuantity,
      ready_quantity: state.readyQuantity,
      storage_quantity: state.storageQuantity,
    };
  });
}

/** Atomic restock transfer; null fromLocationId = "from store". */
export async function transferInventoryUnits(
  itemId: string,
  fromLocationId: string | null,
  toLocationId: string,
  quantity: number,
): Promise<void> {
  const { error } = await supabase.rpc("transfer_inventory_units", {
    p_item_id: itemId,
    p_from_location_id: fromLocationId,
    p_to_location_id: toLocationId,
    p_quantity: quantity,
  });
  if (error) throw error;
}

/**
 * Replace an item's location rows and resync the legacy cache — the
 * invariant-keeping save used by EditFoodScreen for BOTH storage types
 * (single-location = exactly one row). Client-side sequence (delete →
 * insert → cache update), and it is NOT atomic: there is no transaction
 * around it, and — this is the part that matters — nothing re-checks the
 * invariant afterwards. The migration's assertion D lives inside a one-shot
 * `do $$` block that runs once at apply time; there is no CHECK, no
 * trigger, and no scheduled job behind it. A mid-sequence failure is
 * therefore permanent until the item is re-saved.
 *
 * What bounds the damage is the failure-path resync below: the cache is
 * driven to the true Σ locations on BOTH paths, so all three readers agree
 * the item is out of stock rather than the location rows and the legacy
 * column telling two different stories.
 */
export async function replaceItemLocations(
  userId: string,
  itemId: string,
  rows: Array<{ location: FoodLocation; quantity: number; is_ready_to_consume: boolean; notes?: string | null }>,
): Promise<void> {
  // Zero rows would satisfy the cache invariant (0 = 0) while breaking the
  // migration's other post-condition — §6.1(4), every item keeps >= 1
  // location row. This module owns that invariant, so it refuses here
  // instead of trusting each caller's own validation.
  if (rows.length === 0) throw new Error("replaceItemLocations: an item must keep at least one location row");

  const { error: delError } = await supabase
    .from("food_inventory_locations")
    .delete()
    .eq("food_inventory_id", itemId);
  if (delError) throw delError;

  const { error: insError } = await supabase.from("food_inventory_locations").insert(
    // Fields are listed rather than spread: `rows` elements are structurally
    // compatible with full FoodInventoryLocation rows, and a spread would
    // forward their `id`/`created_at`/`updated_at` into the insert — so a
    // "duplicate this item's locations" caller would insert with the source
    // rows' primary keys.
    rows.map((r) => ({
      food_inventory_id: itemId,
      user_id: userId,
      location: r.location,
      quantity: r.quantity,
      is_ready_to_consume: r.is_ready_to_consume,
      notes: r.notes ?? null,
    })),
  );

  // The delete has already committed, so Σ locations is 0 if the insert
  // failed and `total` if it succeeded — resync to whichever actually holds.
  // Writing `total` on the failure path would just swap one divergence for
  // another: the cache would claim stock no location row backs, which is
  // precisely what re-arms mealLibrary's `locations.length > 0 ? … : quantity`
  // fallback and the consume RPC's legacy branch. Zero is the honest answer.
  const total = insError ? 0 : rows.reduce((s, r) => s + r.quantity, 0);
  const { error: cacheError } = await supabase
    .from("food_inventory")
    .update({ quantity: total })
    .eq("id", itemId);

  // The insert error is the one the caller has to see; a failed best-effort
  // resync must not mask it.
  if (insError) {
    if (cacheError) {
      console.error("replaceItemLocations: cache resync after failed insert also failed:", cacheError);
    }
    throw insError;
  }
  if (cacheError) throw cacheError;
}
