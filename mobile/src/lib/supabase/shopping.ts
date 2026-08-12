// All shopping_list I/O + engine-input assembly (Nutrition OS Phase 5).
// The screen renders what this returns; it never computes.
import { supabase } from "../supabase";
import {
  assessAssemblability,
  lowThresholdFor,
} from "../stockState";
import {
  estimateConsumption,
  expandDecrementEvents,
  netConsumeEvents,
  RATE_WINDOW_DAYS,
  type ConsumptionEstimate,
  type DecrementEvent,
  type InventoryTrailEvent,
} from "../consumptionRate";
import {
  computeShoppingSuggestions,
  type ShoppingSuggestion,
} from "../shoppingDemand";
import { fetchInventoryWithState } from "./inventory";
import { fetchMealLibrary } from "./mealLibrary";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import type { InventoryUsage, ShoppingListItem } from "@/src/types/track";
// `src/lib/**` must not import from `src/components/**` — see the rule at
// `lib/dates.ts:1-9` (this module's own home, and the one prior edge that
// rule closed). Import the definition directly rather than through the
// components-tree re-export `mealsHelpers.ts` carries for its own callers.
import { getLocalDateString } from "../dates";

export interface ShoppingData {
  listRows: ShoppingListItem[];
  suggestions: ShoppingSuggestion[];
  vendors: NutritionVendor[];
  ratesById: Map<string, ConsumptionEstimate>;
  /** For the purchased→restock offer: itemId → target location id. */
  restockTargetByItemId: Map<string, string>;
}

/** The trailing meal_logs window expanded to one DecrementEvent per claimed unit. */
export async function fetchDecrementEvents(): Promise<DecrementEvent[]> {
  const since = new Date();
  since.setDate(since.getDate() - (RATE_WINDOW_DAYS + 7)); // small slack for span
  const sinceLocal = getLocalDateString(since);
  // D4: two consumption signals, merged. Meal-log decrements only exist when
  // concept resolution succeeded — the linking gap kept Forecast dark for
  // months. The B1 "used one" verb writes inventory_events directly, giving
  // the estimator a link-independent second source. DISCARDS ARE EXCLUDED on
  // purpose: tossing spoiled food is depletion but not demand — a rate that
  // counted waste would tell Shopping to buy more of what the user throws
  // away.
  const [logs, events] = await Promise.all([
    supabase
      .from("meal_logs")
      .select("date, inventory_items")
      .eq("uses_inventory", true)
      .gte("date", sinceLocal),
    supabase
      .from("inventory_events")
      .select("food_inventory_id, kind, quantity, created_at")
      .in("kind", ["consume", "restore"])
      .gte("created_at", since.toISOString()),
  ]);
  if (logs.error) throw logs.error;
  if (events.error) throw events.error;
  const fromLogs = expandDecrementEvents(
    (logs.data ?? []) as Array<{ date: string; inventory_items: InventoryUsage[] | null }>,
  );
  // Expand to one row per unit, mirroring expandDecrementEvents' shape, then
  // let netConsumeEvents cancel each undone tap against its consume. Quantity
  // is check-constrained > 0 but clamp defensively anyway.
  const trail: InventoryTrailEvent[] = (events.data ?? []).flatMap(
    (e: { food_inventory_id: string; kind: string; quantity: number; created_at: string }) => {
      const at = new Date(e.created_at);
      const n = Math.max(0, Math.min(50, Math.round(e.quantity)));
      return Array.from({ length: n }, () => ({
        inventoryId: e.food_inventory_id,
        kind: e.kind === "restore" ? ("restore" as const) : ("consume" as const),
        dateLocal: getLocalDateString(at),
        at: at.getTime(),
      }));
    },
  );
  const fromEvents = netConsumeEvents(trail);
  return [...fromLogs, ...fromEvents];
}

/**
 * Task 8's entry point (the "~Nd left" line on `FoodInventoryScreen`) — one
 * round trip, rates only. Not folded into `fetchShoppingData` because that
 * caller also needs `totalsById` derived from a concurrently-fetched
 * `inventory`; this one lets a caller who already has its own totals skip
 * the rest of `fetchShoppingData`'s work entirely.
 */
export async function fetchConsumptionRates(
  todayLocalDate: string,
  totalsById: Map<string, number>,
): Promise<Map<string, ConsumptionEstimate>> {
  return estimateConsumption({ events: await fetchDecrementEvents(), totalsById, todayLocalDate });
}

export async function fetchShoppingData(todayLocalDate: string): Promise<ShoppingData> {
  const [listRes, inventory, library, vendorsRes, events] = await Promise.all([
    supabase.from("shopping_list").select("*").order("created_at"),
    fetchInventoryWithState(todayLocalDate),
    fetchMealLibrary(),
    supabase.from("nutrition_vendors").select("*").order("display_order"),
    fetchDecrementEvents(),
  ]);
  // `fetchInventoryWithState` and `fetchMealLibrary` throw on their own
  // errors before returning (see each module's own Promise.all), so only the
  // two raw-query results here carry a `.error` to check; `events` is
  // already resolved data, having thrown internally if its own query failed.
  const errors = [listRes.error, vendorsRes.error].filter((e) => e !== null);
  if (errors.length > 0) {
    errors.slice(1).forEach((e) => console.error("fetchShoppingData:", e));
    throw errors[0];
  }

  const listRows = (listRes.data ?? []) as ShoppingListItem[];

  // Scheduled-supply items are left out of the totals map, which is what
  // stops an estimate existing for them at all. Their history is real but
  // meaningless: a delivered menu rotates, so no single dish is ever seen
  // often enough to say anything about, and the answer to "when does this run
  // out" is a delivery date rather than a rate.
  const ratesById = estimateConsumption({
    events,
    totalsById: new Map(
      inventory
        .filter((it) => !it.is_scheduled_supply)
        .map((it) => [it.id, it.state.totalQuantity]),
    ),
    todayLocalDate,
  });

  // Meal gaps: sanctioned additional CALL SITE of assessAssemblability, not a
  // fourth definition (see eatNext.ts's canonical comment). Gate on
  // missing.length > 0, not !assemblable (item-less meals must not suggest).
  // Reads `.missing` and deliberately NOT `.unlinked`: an ingredient with no
  // barcode and no concept link was never checked against the kitchen, so
  // turning it into a suggestion asks you to buy food you may already own.
  // That is where the list's "unassigned" rows were coming from.
  const mealGaps = library.meals
    .map((meal) => ({
      mealName: meal.name,
      missing: assessAssemblability({
        items: meal.items.map((it) => ({
          savedFoodId: it.saved_food_id,
          name: it.savedFood.name,
          barcode: it.savedFood.barcode,
          conceptIds: library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
        })),
        inventory: library.inventory,
      }).missing,
    }))
    .filter((g) => g.missing.length > 0);

  const suggestions = computeShoppingSuggestions({
    items: inventory.map((it) => ({
      id: it.id,
      name: it.name,
      unit: it.unit,
      preferredVendorId: it.preferred_vendor_id,
      lowThreshold: lowThresholdFor(it),
      totalQuantity: it.state.totalQuantity,
      isOut: it.state.isOut,
      isLow: it.state.isLow,
      scheduledSupply: it.is_scheduled_supply,
    })),
    mealGaps,
    rates: ratesById,
    unpurchased: listRows
      .filter((r) => !r.is_purchased)
      .map((r) => ({ foodInventoryId: r.food_inventory_id, name: r.name })),
  });

  const restockTargetByItemId = new Map<string, string>();
  for (const it of inventory) {
    // `fetchInventoryWithState`'s locations select has no `.order()`
    // (inventory.ts:40), so "first location" is otherwise whichever row the
    // DB happens to return first — not stable across loads. Sort by id for a
    // deterministic pick (spec §8 sanctions "else its first location"; this
    // just defines "first").
    const sortedLocations = [...it.locations].sort((a, b) => a.id.localeCompare(b.id));
    const target =
      sortedLocations.find((l) => l.is_ready_to_consume) ?? sortedLocations[0];
    if (target) restockTargetByItemId.set(it.id, target.id);
  }

  return {
    listRows,
    suggestions,
    vendors: (vendorsRes.data ?? []) as NutritionVendor[],
    ratesById,
    restockTargetByItemId,
  };
}

// ── Mutations (throw for the alert idiom) ──────────────────────────────────

export async function addSuggestions(
  userId: string,
  suggestions: ShoppingSuggestion[],
): Promise<void> {
  if (suggestions.length === 0) return;
  const { error } = await supabase.from("shopping_list").insert(
    suggestions.map((s) => ({
      user_id: userId,
      food_inventory_id: s.foodInventoryId,
      name: s.name,
      quantity: s.quantity,
      unit: s.unit ?? "item",
      vendor_id: s.vendorId,
      priority: s.priority,
      notes: s.reasons.join(" · "),
    })),
  );
  if (error) throw error;
}

export async function updateListItem(
  id: string,
  patch: Partial<Pick<ShoppingListItem, "vendor_id" | "quantity" | "notes">>,
): Promise<void> {
  const { error } = await supabase.from("shopping_list").update(patch).eq("id", id);
  if (error) throw error;
}

export async function markPurchased(id: string): Promise<void> {
  const { error } = await supabase
    .from("shopping_list")
    .update({ is_purchased: true, purchased_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function unmarkPurchased(id: string): Promise<void> {
  const { error } = await supabase
    .from("shopping_list")
    .update({ is_purchased: false, purchased_at: null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteListItem(id: string): Promise<void> {
  const { error } = await supabase.from("shopping_list").delete().eq("id", id);
  if (error) throw error;
}

export async function clearPurchased(): Promise<void> {
  const { error } = await supabase.from("shopping_list").delete().eq("is_purchased", true);
  if (error) throw error;
}
