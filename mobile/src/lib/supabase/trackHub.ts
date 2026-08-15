// mobile/src/lib/supabase/trackHub.ts
// The Track hub's tile captions — one quiet line per Nutrition & Food station.
//
// WHY THIS MODULE EXISTS AT ALL. The hub used to be fetch-free, and the
// Deliveries caption was the single exception, justified on the grounds that a
// delivery's state is a DATE you cannot infer from anywhere else. That rule has
// been retired deliberately: every station now reports where it stands, because
// the hub is the screen you pass through on the way to all six and a count you
// can only learn by opening a page is a count you learn too late.
//
// What did NOT change is that captions are decoration in the strict sense. Each
// one is computed independently and a failure yields `null` — the tile it
// belongs to simply loses its subtitle, no error text, no empty slot held open,
// and no other tile affected. Nothing here is the only route to a number.
//
// Every read is deliberately narrow: the columns a caption needs and no more.
// The station screens keep their own full fetches; this is a second, cheaper
// question ("how many?") asked of the same tables, not a replacement for them.
import { supabase } from "../supabase";
import { fetchPendingDeliveries } from "./preparedMeals";
import { formatArrivalShort, getLocalDateString } from "../dates";
import {
  assessAssemblability,
  daysBetweenLocalDates,
  projectItemStock,
  type AssemblabilityInventoryRow,
} from "../stockState";
import { shouldRetire } from "../mealRetirement";

export interface HubCaptions {
  shopping: string | null;
  deliveries: string | null;
  foodInventory: string | null;
  mealLibrary: string | null;
  fuel: string | null;
  water: string | null;
}

/** The no-captions state — what the hub renders before the first read lands,
 *  and the shape every failed read degrades toward. */
export const EMPTY_HUB_CAPTIONS: HubCaptions = {
  shopping: null,
  deliveries: null,
  foodInventory: null,
  mealLibrary: null,
  fuel: null,
  water: null,
};

/** Plural that reads as English: "1 meal", "7 meals". */
const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Runs a caption's own fetch, and swallows its failure into "no caption".
 *  Logged rather than silent: a caption that stops appearing should be
 *  diagnosable without reading this file. */
async function caption(
  label: string,
  compute: () => Promise<string | null>,
): Promise<string | null> {
  try {
    return await compute();
  } catch (e) {
    console.error(`track hub caption (${label}):`, e);
    return null;
  }
}

/** The profile row both the Fuel and Water captions read from — fetched once
 *  rather than twice, since they want different columns of the same row. */
interface HubProfile {
  target_calories: number | null;
  target_water_oz: number | null;
  water_workout_bonus_oz: number | null;
  water_only_counts: boolean | null;
}

async function fetchHubProfile(): Promise<HubProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("target_calories, target_water_oz, water_workout_bonus_oz, water_only_counts")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return (data ?? null) as HubProfile | null;
}

/** "6 to buy · 2 urgent" — priority 1 is the high band (`ShoppingListPriority`). */
async function shoppingCaption(): Promise<string | null> {
  const { data, error } = await supabase
    .from("shopping_list")
    .select("priority")
    .eq("is_purchased", false);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ priority: number | null }>;
  if (rows.length === 0) return "Nothing to buy";
  const urgent = rows.filter((r) => r.priority === 1).length;
  const base = `${rows.length.toLocaleString("en-US")} to buy`;
  return urgent > 0 ? `${base} · ${urgent} urgent` : base;
}

/** "7 meals · Sun 7:00 PM".
 *
 *  Future arrivals only, and this is load-bearing: a box whose moment has
 *  passed is due, not coming — it becomes inventory on the next read of the
 *  inventory or the Deliveries page — and "Today 2:00 PM" on a tile at three
 *  o'clock reads as a promise the app has already broken. The hub deliberately
 *  does not materialise it itself: a tile caption is no reason for this screen
 *  to start writing. */
async function deliveriesCaption(): Promise<string | null> {
  const rows = await fetchPendingDeliveries();
  const soonest = rows.find((r) => new Date(r.arrivesAt).getTime() > Date.now());
  if (!soonest) return null;
  return `${plural(soonest.mealCount, "meal")} · ${formatArrivalShort(soonest.arrivesAt)}`;
}

/** The one inventory row shape both food captions are built from. Location
 *  rows are the ONLY quantity truth (spec §5.1) — there is no `quantity`
 *  column in this select for the same reason the Meal Library's own read
 *  omits it. */
interface HubInventoryRow {
  id: string;
  name: string;
  barcode: string | null;
  expiration_date: string | null;
  storage_type: string | null;
  restock_threshold: number | null;
  fridge_restock_threshold: number | null;
  total_restock_threshold: number | null;
  requires_refrigeration: boolean | null;
  locations: Array<{ quantity: number; is_ready_to_consume: boolean }>;
}

const INVENTORY_SELECT =
  "id, name, barcode, expiration_date, storage_type, restock_threshold, " +
  "fridge_restock_threshold, total_restock_threshold, requires_refrigeration, " +
  "locations:food_inventory_locations(quantity, is_ready_to_consume)";

/**
 * Food Inventory and Meal Library together, because the library's half of the
 * answer — how many meals you could make right now — is a question about the
 * inventory, and reading those rows twice on one screen would be wasteful and
 * could disagree with itself across the two tiles.
 *
 * The stock arithmetic is NOT re-implemented here: `projectItemStock` and
 * `assessAssemblability` are the same functions the Food Inventory grid and the
 * Meal Library rows call, so a caption can only ever be a cheaper route to the
 * same verdict, never a second opinion about it. What this function owns is the
 * plumbing — the narrow selects that feed them.
 */
async function foodCaptions(
  todayLocalDate: string,
): Promise<{ foodInventory: string | null; mealLibrary: string | null }> {
  const [inventory, meals, items, links, mealLogs] = await Promise.all([
    supabase.from("food_inventory").select(INVENTORY_SELECT),
    // Everything `isArchived` is decided from, and nothing else — see the
    // retirement note below for why the count cannot be a bare row count.
    supabase.from("meals").select("id, archived_at, is_complete_portion, created_at"),
    supabase
      .from("meal_items")
      .select("meal_id, saved_food_id, savedFood:saved_foods(name, barcode)"),
    supabase.from("food_concept_links").select("saved_food_id, food_inventory_id, concept_id"),
    // Dates only: the retirement rule asks how long a meal has been idle, not
    // what it contained.
    supabase.from("meal_logs").select("meal_id, date").not("meal_id", "is", null),
  ]);
  const firstError = [inventory.error, meals.error, items.error, links.error, mealLogs.error]
    .find((e) => e !== null);
  if (firstError) throw firstError;

  const invRows = (inventory.data ?? []) as unknown as HubInventoryRow[];
  const stateById = new Map(
    invRows.map((r) => [
      r.id,
      projectItemStock({ item: r, locations: r.locations ?? [], todayLocalDate }),
    ]),
  );

  // "Available" is what you actually have, not how many rows the table holds:
  // an item at zero is a thing you have run out of, and counting it would make
  // the tile read fullest exactly when the kitchen is emptiest.
  const inStock = invRows.filter((r) => stateById.get(r.id)!.totalQuantity > 0);
  const low = inStock.filter((r) => stateById.get(r.id)!.isLow).length;
  const foodInventory =
    inStock.length === 0
      ? "Nothing in stock"
      : low > 0
        ? `${plural(inStock.length, "item")} available · ${low} low`
        : `${plural(inStock.length, "item")} available`;

  const linkRows = (links.data ?? []) as Array<{
    saved_food_id: string | null;
    food_inventory_id: string | null;
    concept_id: string;
  }>;
  const conceptIdsBySavedFoodId = new Map<string, string[]>();
  const conceptIdsByInventoryId = new Map<string, string[]>();
  for (const l of linkRows) {
    if (l.saved_food_id) {
      conceptIdsBySavedFoodId.set(l.saved_food_id, [
        ...(conceptIdsBySavedFoodId.get(l.saved_food_id) ?? []),
        l.concept_id,
      ]);
    }
    if (l.food_inventory_id) {
      conceptIdsByInventoryId.set(l.food_inventory_id, [
        ...(conceptIdsByInventoryId.get(l.food_inventory_id) ?? []),
        l.concept_id,
      ]);
    }
  }

  const resolutionInventory: AssemblabilityInventoryRow[] = invRows.map((r) => ({
    id: r.id,
    name: r.name,
    barcode: r.barcode,
    totalQuantity: stateById.get(r.id)!.totalQuantity,
    daysLeft: stateById.get(r.id)!.daysLeft,
    conceptIds: conceptIdsByInventoryId.get(r.id) ?? [],
  }));

  const itemRows = (items.data ?? []) as unknown as Array<{
    meal_id: string;
    saved_food_id: string;
    savedFood: { name: string; barcode: string | null } | null;
  }>;
  const itemsByMeal = new Map<
    string,
    Array<{ savedFoodId: string; name: string; barcode: string | null; conceptIds: string[] }>
  >();
  for (const it of itemRows) {
    itemsByMeal.set(it.meal_id, [
      ...(itemsByMeal.get(it.meal_id) ?? []),
      {
        savedFoodId: it.saved_food_id,
        name: it.savedFood?.name ?? "",
        barcode: it.savedFood?.barcode ?? null,
        conceptIds: conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
      },
    ]);
  }

  // Newest log per meal, for the idle half of the retirement rule.
  const lastLoggedByMeal = new Map<string, string>();
  for (const l of (mealLogs.data ?? []) as Array<{ meal_id: string; date: string }>) {
    const prev = lastLoggedByMeal.get(l.meal_id);
    if (!prev || l.date > prev) lastLoggedByMeal.set(l.meal_id, l.date);
  }

  const mealRows = (meals.data ?? []) as Array<{
    id: string;
    archived_at: string | null;
    is_complete_portion: boolean | null;
    created_at: string;
  }>;

  // A meal with no ingredients on file is not "assemblable from an empty
  // fridge" — there is simply nothing to check, and counting it would inflate
  // the number that claims you can cook tonight.
  // Memoised because both the retirement filter and the "in stock" count ask
  // the same question of the same meal, and the resolver walks the whole
  // inventory per call.
  const assemblableCache = new Map<string, boolean>();
  const canAssemble = (mealId: string): boolean => {
    const hit = assemblableCache.get(mealId);
    if (hit !== undefined) return hit;
    const mealItems = itemsByMeal.get(mealId);
    const verdict =
      !mealItems || mealItems.length === 0
        ? false
        : assessAssemblability({ items: mealItems, inventory: resolutionInventory }).assemblable;
    assemblableCache.set(mealId, verdict);
    return verdict;
  };

  // NOT a row count. The library hides archived meals — by hand via
  // `archived_at`, or by the idleness rule — so a bare count would claim meals
  // the page does not show, and the tile would be wrong the moment a vendor
  // dish aged out. Same inputs `useMealLibraryCards` feeds `shouldRetire`,
  // including its `assemblable ? 1 : 0` stand-in for stock on hand.
  const live = mealRows.filter((m) => {
    if (m.archived_at !== null) return false;
    const lastLogged = lastLoggedByMeal.get(m.id) ?? null;
    return !shouldRetire({
      isCompletePortion: m.is_complete_portion ?? false,
      totalQuantity: canAssemble(m.id) ? 1 : 0,
      daysSinceLastLogged: lastLogged
        ? daysBetweenLocalDates(lastLogged, todayLocalDate)
        : null,
      daysSinceCreated: daysBetweenLocalDates(
        getLocalDateString(new Date(m.created_at)),
        todayLocalDate,
      ),
    });
  });

  const assemblable = live.filter((m) => canAssemble(m.id)).length;
  const mealLibrary =
    live.length === 0
      ? "No meals yet"
      : assemblable > 0
        ? `${plural(live.length, "meal")} · ${assemblable} in stock`
        : plural(live.length, "meal");

  return { foodInventory, mealLibrary };
}

/** "1,850 of 2,300 cal", or just "1,850 cal" when no target is set — the
 *  caption never invents a goal the user has not chosen. */
async function fuelCaption(
  todayLocalDate: string,
  profile: HubProfile | null,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("calories")
    .eq("date", todayLocalDate);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ calories: number | null }>;
  if (rows.length === 0) return "Nothing logged today";
  const total = Math.round(rows.reduce((s, r) => s + (r.calories ?? 0), 0));
  const target = profile?.target_calories ?? null;
  return target
    ? `${total.toLocaleString("en-US")} of ${target.toLocaleString("en-US")} cal`
    : `${total.toLocaleString("en-US")} cal`;
}

/** "48 of 64 oz". Both halves follow the Water screen's own rules, so the tile
 *  and the page can never print different numbers for the same day:
 *  `water_only_counts` decides which logs are counted, and a workout logged
 *  today raises the goal by the user's bonus. */
async function waterCaption(
  todayLocalDate: string,
  profile: HubProfile | null,
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [logs, workouts] = await Promise.all([
    supabase
      .from("water_logs")
      .select("amount_oz, beverage_type")
      .eq("date", todayLocalDate),
    supabase
      .from("workout_instances")
      .select("scheduled_date")
      .eq("user_id", user.id)
      .eq("scheduled_date", todayLocalDate)
      .in("status", ["in_progress", "completed"]),
  ]);
  const firstError = [logs.error, workouts.error].find((e) => e !== null);
  if (firstError) throw firstError;

  const rows = (logs.data ?? []) as Array<{ amount_oz: number; beverage_type: string }>;
  const counted = profile?.water_only_counts
    ? rows.filter((r) => r.beverage_type === "water")
    : rows;
  const total = Math.round(counted.reduce((s, r) => s + r.amount_oz, 0));

  const base = profile?.target_water_oz ?? null;
  if (!base) return total === 0 ? "Nothing logged today" : `${total} oz today`;
  const bonus =
    (workouts.data ?? []).length > 0 ? profile?.water_workout_bonus_oz ?? 0 : 0;
  return `${total} of ${base + bonus} oz`;
}

/**
 * Every Nutrition & Food caption, in one pass.
 *
 * One clock for all of them: a `new Date()` sampled per caption could straddle
 * local midnight mid-batch and show one tile's "today" beside another's.
 */
export async function fetchHubCaptions(): Promise<HubCaptions> {
  const today = getLocalDateString();
  // Read before the captions that need it rather than inside two of them: one
  // row, one round trip, and Fuel and Water can never disagree about the
  // profile they were computed from.
  let profile: HubProfile | null = null;
  try {
    profile = await fetchHubProfile();
  } catch (e) {
    // Both captions that read it degrade to their goal-less form rather than
    // vanishing: "1,850 cal" still beats no line at all.
    console.error("track hub caption (profile):", e);
  }

  const [shopping, deliveries, food, fuel, water] = await Promise.all([
    caption("shopping", shoppingCaption),
    caption("deliveries", deliveriesCaption),
    (async () => {
      try {
        return await foodCaptions(today);
      } catch (e) {
        console.error("track hub caption (food):", e);
        return { foodInventory: null, mealLibrary: null };
      }
    })(),
    caption("fuel", () => fuelCaption(today, profile)),
    caption("water", () => waterCaption(today, profile)),
  ]);

  return {
    ...EMPTY_HUB_CAPTIONS,
    shopping,
    deliveries,
    foodInventory: food.foodInventory,
    mealLibrary: food.mealLibrary,
    fuel,
    water,
  };
}
