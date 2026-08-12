// Writing a delivery. One call, one transaction.
//
// A delivered meal has to land in eight tables before the loop can see it —
// stock, location, two category maps, a saved food, two concepts, their
// links, a meal and its item. Doing that from the client would be around ten
// round trips per meal, any of which can fail on its own and leave a
// half-built meal that looks fine in the grid and breaks when logged. The
// function does the whole box or none of it.
import { supabase } from "../supabase";
import type { DeliveryPayloadMeal } from "../preparedMealDelivery";

export interface DeliveryInput {
  vendorId: string;
  /** Local YYYY-MM-DD, the date printed on the box. */
  useBy: string;
  meals: DeliveryPayloadMeal[];
}

/** Returns how many meals were written. Throws for the alert idiom. */
export async function createPreparedMealDelivery(input: DeliveryInput): Promise<number> {
  const { data, error } = await supabase.rpc("create_prepared_meal_delivery", {
    p_vendor_id: input.vendorId,
    p_use_by: input.useBy,
    p_meals: input.meals,
  });
  if (error) throw error;
  // The function returns a bare integer; PostgREST can hand it back as a
  // string depending on configuration, so coerce rather than trust it.
  return Number(data) || 0;
}
