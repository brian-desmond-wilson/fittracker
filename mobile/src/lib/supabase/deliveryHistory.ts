// What has been delivered before, in one read.
//
// The view answers two questions at once — how much each vendor is used, and
// which dishes each vendor has sent — because the screen needs both at the
// same moment and the second is a filter over rows it already holds. Fetching
// per vendor on each tile tap would put a round trip between the tap and the
// list appearing, for data measured in kilobytes.
import { supabase } from "../supabase";
import type { RecentDish, VendorUse } from "../preparedMealDelivery";
import type { MealType } from "@/src/types/track";

export interface DeliveryHistory {
  /** Every dish previously delivered, newest first, across all vendors. */
  dishes: RecentDish[];
  /** One entry per vendor ever delivered from. */
  vendorUse: VendorUse[];
}

const SLOTS = new Set<string>(["breakfast", "lunch", "dinner", "snack", "dessert"]);

/** Numbers arrive from PostgREST as numbers or numeric strings depending on
 *  the column type; nulls must survive as nulls rather than becoming zero. */
const num = (raw: unknown): number | null => {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/**
 * The whole history. Returns empty on failure rather than throwing: recents
 * are an accelerator, and a delivery must still be enterable by hand when the
 * network is out.
 */
export async function fetchDeliveryHistory(): Promise<DeliveryHistory> {
  const { data, error } = await supabase
    .from("prepared_meal_delivery_history")
    .select("*")
    .order("last_delivered_on", { ascending: false });

  if (error) {
    console.error("delivery history fetch failed:", error);
    return { dishes: [], vendorUse: [] };
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const dishes: RecentDish[] = [];
  const vendorUse = new Map<string, VendorUse>();

  for (const row of rows) {
    const vendorId = row.vendor_id as string | null;
    const name = (row.name as string | null)?.trim();
    if (!vendorId || !name) continue;

    const slot = row.slot as string | null;
    dishes.push({
      vendorId,
      slug: (row.slug as string | null) ?? "",
      name,
      slot: slot && SLOTS.has(slot) ? (slot as MealType) : "lunch",
      calories: num(row.calories),
      protein: num(row.protein),
      fiber: num(row.fiber_g),
      carbs: num(row.carbs),
      fats: num(row.fats),
      sugars: num(row.sugars),
      servingSize: (row.serving_size as string | null) ?? null,
      saturatedFat: num(row.saturated_fat_g),
      sodium: num(row.sodium_mg),
      // The photo from the inventory row this dish last became. Lets a box that
      // has not arrived show what is in it; nothing else reads it yet.
      imageUrl: (row.image_primary_url as string | null) ?? null,
      lastDeliveredOn: (row.last_delivered_on as string | null) ?? "",
    });

    // The vendor totals repeat on every dish row — same numbers each time, so
    // the first sighting wins and the rest are skipped.
    if (!vendorUse.has(vendorId)) {
      vendorUse.set(vendorId, {
        vendorId,
        deliveryCount: num(row.vendor_delivery_count) ?? 0,
        lastDeliveredOn: (row.vendor_last_delivered_on as string | null) ?? "",
      });
    }
  }

  return { dishes, vendorUse: [...vendorUse.values()] };
}
