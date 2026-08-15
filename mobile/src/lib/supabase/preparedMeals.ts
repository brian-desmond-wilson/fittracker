// Writing a delivery. One call, one transaction.
//
// A delivered meal has to land in eight tables before the loop can see it —
// stock, location, two category maps, a saved food, two concepts, their
// links, a meal and its item. Doing that from the client would be around ten
// round trips per meal, any of which can fail on its own and leave a
// half-built meal that looks fine in the grid and breaks when logged. The
// function does the whole box or none of it.
import { supabase } from "../supabase";
import { mealsInDishes, pendingDishes } from "../preparedMealDelivery";
import type { DeliveryPayloadMeal, PendingDish } from "../preparedMealDelivery";

export interface DeliveryInput {
  vendorId: string;
  /** Local YYYY-MM-DD, the date printed on the box. */
  useBy: string;
  /** ISO instant the box arrives. Past or now writes the food immediately;
   *  future holds the whole delivery until then. */
  arrivesAt: string;
  meals: DeliveryPayloadMeal[];
}

export interface DeliveryResult {
  /** "delivered" — it is in the fridge now. "scheduled" — it is waiting. */
  status: "delivered" | "scheduled";
  /** Meals written, or meals that will be. The same number either way. */
  count: number;
}

/**
 * Save a delivery. Whether it lands now or waits is the DATABASE's decision,
 * not this client's: a phone whose clock runs a few minutes fast would
 * otherwise schedule a box its owner is holding.
 */
export async function savePreparedMealDelivery(input: DeliveryInput): Promise<DeliveryResult> {
  const { data, error } = await supabase.rpc("schedule_prepared_meal_delivery", {
    p_vendor_id: input.vendorId,
    p_use_by: input.useBy,
    p_arrives_at: input.arrivesAt,
    p_meals: input.meals,
  });
  if (error) throw error;
  const row = (data ?? {}) as { status?: string; count?: number | string };
  return {
    status: row.status === "scheduled" ? "scheduled" : "delivered",
    // PostgREST can hand an integer back as a string, so coerce rather than
    // trust it — the same care the previous single-integer return took.
    count: Number(row.count) || 0,
  };
}

/**
 * Write in every delivery whose arrival time has passed, and report how many
 * meals that added. Cheap and idempotent: with nothing due it is one indexed
 * read of the caller's own rows.
 *
 * Called from the inventory fetch rather than by a scheduler, because the app
 * has none. What that means for the user is honest and worth stating plainly:
 * a box arrives in the app the first time they look after it arrived in life.
 */
export async function materializeDueDeliveries(): Promise<number> {
  const { data, error } = await supabase.rpc("materialize_due_prepared_meal_deliveries");
  if (error) throw error;
  return Number(data) || 0;
}

/** A delivery that has not arrived yet, for the line that says so and the card
 *  that lists what is in it. */
export interface PendingDelivery {
  id: string;
  vendorId: string;
  vendorName: string | null;
  /** The vendor's brand mark. Null falls back to a monogram, and so does a URL
   *  that fails to load — see `VendorMark`. */
  vendorLogoUrl: string | null;
  /** ISO instant. */
  arrivesAt: string;
  useBy: string;
  /** MEALS, not dishes: two of one dish is two meals, which is what the
   *  person unpacking the box counts. */
  mealCount: number;
  /** What is in the box, in the order it was saved. The Deliveries card sorts
   *  these into menu order itself; the inventory line ignores them. Names and
   *  quantities only — the macros stay in the payload until something edits
   *  it, because nothing on a card prints them. */
  dishes: PendingDish[];
}

// The embedded vendor row comes back as an object or an array depending on how
// PostgREST reads the relationship; neither shape is worth trusting blind, and
// nor is the type of anything inside it.
const embeddedText = (embedded: unknown, field: string): string | null => {
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  const value = (row as Record<string, unknown> | null)?.[field];
  return typeof value === "string" ? value : null;
};

export async function fetchPendingDeliveries(): Promise<PendingDelivery[]> {
  const { data, error } = await supabase
    .from("pending_prepared_meal_deliveries")
    .select("id, vendor_id, arrives_at, use_by, meals, nutrition_vendors(name, logo_url)")
    .order("arrives_at");
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => {
    const dishes = pendingDishes(r.meals);
    return {
      id: r.id as string,
      vendorId: r.vendor_id as string,
      vendorName: embeddedText(r.nutrition_vendors, "name"),
      vendorLogoUrl: embeddedText(r.nutrition_vendors, "logo_url"),
      arrivesAt: r.arrives_at as string,
      useBy: r.use_by as string,
      mealCount: mealsInDishes(dishes),
      dishes,
    };
  });
}

/** One waiting box with its payload intact — everything the entry form needs
 *  to reopen it, macros included. Fetched on its own rather than carried on
 *  every `PendingDelivery`, because only the edit screen ever wants it. */
export interface PendingDeliveryDraft {
  id: string;
  vendorId: string;
  arrivesAt: string;
  useBy: string;
  meals: DeliveryPayloadMeal[];
}

/** Null when there is no such row — which most often means it arrived while
 *  the list was on screen and has already been written into inventory. */
export async function fetchPendingDelivery(id: string): Promise<PendingDeliveryDraft | null> {
  const { data, error } = await supabase
    .from("pending_prepared_meal_deliveries")
    .select("id, vendor_id, arrives_at, use_by, meals")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as any;
  return {
    id: r.id as string,
    vendorId: r.vendor_id as string,
    arrivesAt: r.arrives_at as string,
    useBy: r.use_by as string,
    meals: (Array.isArray(r.meals) ? r.meals : []) as DeliveryPayloadMeal[],
  };
}

/**
 * Change a box that has not landed. One `UPDATE` on the row, covered by the
 * table's owner policy — no RPC, because unlike saving a delivery there is
 * nothing here to make atomic: the payload is still one column and no
 * inventory has been written from it.
 *
 * Moving `arrives_at` into the past is allowed and needs no special handling.
 * The row simply becomes due, and the next inventory read materialises it —
 * the same clock every other delivery runs on.
 *
 * False when the row is gone: it arrived mid-edit and is inventory now, so the
 * edit has nothing to apply and must not be reported as saved.
 */
export async function updatePendingDelivery(input: DeliveryInput & { id: string }): Promise<boolean> {
  const { data, error } = await supabase
    .from("pending_prepared_meal_deliveries")
    .update({
      vendor_id: input.vendorId,
      arrives_at: input.arrivesAt,
      use_by: input.useBy,
      meals: input.meals,
    })
    .eq("id", input.id)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Call off a box that has not landed. Nothing was written, so nothing needs
 *  unwinding — the payload simply stops waiting. */
export async function cancelPendingDelivery(id: string): Promise<void> {
  const { error } = await supabase
    .from("pending_prepared_meal_deliveries")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
