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
  /**
   * The ONE place a quantity may be read from. The Phase 4 transition kept
   * `total_quantity`/`ready_quantity`/`storage_quantity` mirrors alongside
   * this so render code could migrate gradually; they are gone — every reader
   * now goes through `state`, and there is no second copy of these numbers on
   * the row to drift from it or to be assigned by hand. (`quantity`, inherited
   * from `FoodInventoryItem`, is the legacy DB cache column, not a projection:
   * do not read it as stock.)
   */
  state: ItemStockState;
}

export async function fetchInventoryWithState(
  todayLocalDate: string,
): Promise<InventoryItemWithState[]> {
  const [items, locations, categoryMaps, subcategoryMaps] = await Promise.all([
    // D1: deterministic order — the fetch previously returned rows in
    // whatever order the planner chose, so the grid (pre-sort) and every
    // precedence walk over locations could differ between refreshes.
    supabase.from("food_inventory").select("*").order("name"),
    supabase.from("food_inventory_locations").select("*").order("created_at"),
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
 * Replace an item's location rows and resync the legacy cache — atomically,
 * via the replace_item_locations RPC (Phase 5; scheduled by Phase 4's Task 4
 * amendment). One transaction: the partial-failure divergence the previous
 * client-side delete→insert→resync sequence could produce is now impossible,
 * and the locations-as-truth invariant has ongoing server-side enforcement.
 * The RPC refuses empty arrays (an item must keep >= 1 location row) and
 * validates every row before any write.
 */
export async function replaceItemLocations(
  itemId: string,
  rows: Array<{ location: FoodLocation; quantity: number; is_ready_to_consume: boolean; notes?: string | null }>,
): Promise<void> {
  const { error } = await supabase.rpc("replace_item_locations", {
    p_item_id: itemId,
    p_rows: rows.map((r) => ({
      location: r.location,
      quantity: r.quantity,
      is_ready_to_consume: r.is_ready_to_consume,
      notes: r.notes ?? null,
    })),
  });
  if (error) throw error;
}

/**
 * B1's one-tap verb: consume a single unit of one item, through the same
 * atomic RPC meal logging uses (ready-first location policy, legacy-cache
 * resync). Returns units actually consumed — 0 means "nothing was moved"
 * (already empty, unknown id, or not yours; the RPC deliberately conflates
 * these — see 20260729100100) and callers must not compensate for it.
 *
 * The event row is the loop's memory of the action (D4 feeds it to the
 * consumption-rate estimator, link-independent). It is written AFTER stock
 * moved; if the insert fails the verb still succeeded — stock is truth,
 * the trail is bookkeeping — so we log and carry on rather than throw.
 */
/** What a consume did, and where it took the unit from, so it can be undone. */
export interface ConsumeResult {
  consumed: number;
  /** Null for a location-less item, whose stock lives on the legacy column. */
  locationId: string | null;
}

export async function consumeOneUnit(itemId: string): Promise<ConsumeResult> {
  // The single-item RPC, not the plural one, because this one reports the
  // location it decremented — `restoreOneUnit` needs it. The plural function
  // stays untouched for meal logging and the barcode match service.
  const { data, error } = await supabase.rpc("consume_one_inventory_unit", {
    p_inventory_id: itemId,
  });
  if (error) throw error;
  touchVerified(itemId);
  const row = (data as Array<{ consumed: number; location_id: string | null }> | null)?.[0];
  const consumed = row?.consumed ?? 0;
  if (consumed > 0) {
    const { error: evErr } = await supabase.from("inventory_events").insert({
      food_inventory_id: itemId, kind: "consume", quantity: consumed,
    });
    if (evErr) console.error("consumeOneUnit: event insert failed:", evErr);
  }
  return { consumed, locationId: row?.location_id ?? null };
}

/**
 * The stepper's "+": one more unit arrived.
 *
 * Same arithmetic as an undo, opposite meaning. A restock is not consumption,
 * so it is recorded as its own kind and the rate estimator never sees it —
 * collapsing the two would make every grocery run cancel a real meal. Adds to
 * the ready-to-consume location when there is one, else the first by id, which
 * is the same tie-break the shopping restock target uses.
 */
export async function restockOneUnit(
  itemId: string,
  locations: ReadonlyArray<{ id: string; is_ready_to_consume: boolean }>,
): Promise<number> {
  const sorted = [...locations].sort((a, b) => a.id.localeCompare(b.id));
  const target = sorted.find((l) => l.is_ready_to_consume) ?? sorted[0];
  const { data, error } = await supabase.rpc("restore_inventory_unit", {
    p_inventory_id: itemId,
    p_location_id: target?.id ?? null,
  });
  if (error) throw error;
  touchVerified(itemId);
  const added = (data as number | null) ?? 0;
  if (added > 0) {
    const { error: evErr } = await supabase.from("inventory_events").insert({
      food_inventory_id: itemId, kind: "restock", quantity: added,
    });
    if (evErr) console.error("restockOneUnit: event insert failed:", evErr);
  }
  return added;
}

/**
 * Undo for `consumeOneUnit`: put the unit back where it came from.
 *
 * The trail is append-only, so this does NOT delete the consume event — it
 * writes a compensating `restore` event, exactly as the trail's own design
 * note prescribes. `expandDecrementEvents`' caller nets the pair out, so an
 * undone tap never teaches the rate estimator anything.
 */
export async function restoreOneUnit(
  itemId: string,
  locationId: string | null,
): Promise<number> {
  const { data, error } = await supabase.rpc("restore_inventory_unit", {
    p_inventory_id: itemId,
    p_location_id: locationId,
  });
  if (error) throw error;
  const restored = (data as number | null) ?? 0;
  if (restored > 0) {
    const { error: evErr } = await supabase.from("inventory_events").insert({
      food_inventory_id: itemId, kind: "restore", quantity: restored,
    });
    if (evErr) console.error("restoreOneUnit: event insert failed:", evErr);
  }
  return restored;
}

/**
 * B2's verb: discard an item's remaining stock (spoiled, disliked, gone).
 * Distinct from delete — the row and its history survive; only quantities go
 * to zero. `reason` lands on the event row and becomes waste analytics for
 * Shopping intelligence. Same 0-semantics and same trail-after-stock rule as
 * consumeOneUnit.
 */
export async function discardItem(itemId: string, reason?: string): Promise<number> {
  const { data, error } = await supabase.rpc("discard_inventory_units", {
    p_inventory_id: itemId,
  });
  if (error) throw error;
  touchVerified(itemId);
  const discarded = (data as number | null) ?? 0;
  if (discarded > 0) {
    const { error: evErr } = await supabase.from("inventory_events").insert({
      food_inventory_id: itemId, kind: "discard", quantity: discarded,
      reason: reason ?? null,
    });
    if (evErr) console.error("discardItem: event insert failed:", evErr);
  }
  return discarded;
}

/**
 * D6: acting on an item IS attesting it exists as recorded — consume, toss,
 * restock, and capture-apply all imply the user just looked at it. The
 * timestamp is the audit trail's freshness signal ("verified 3 weeks ago"),
 * so it's fire-and-forget: bookkeeping must never fail the verb.
 */
export function touchVerified(itemId: string): void {
  supabase
    .from("food_inventory")
    .update({ last_verified_at: new Date().toISOString() })
    .eq("id", itemId)
    .then(({ error }) => {
      if (error) console.error("touchVerified failed:", error);
    });
}
