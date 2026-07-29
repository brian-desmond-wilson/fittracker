// mobile/src/lib/supabase/mealLibrary.ts
// Data access for Nutrition OS Phase 2 (house pattern: domain query module).
import { supabase } from "../supabase";
import { resolveInventoryMatches, type ResolutionInventoryRow } from "../inventoryResolution";
import type { FoodConcept } from "@/src/types/nutrition-preferences";
import type {
  Meal,
  MealItemWithFood,
  MealTotals,
  MealWithItems,
} from "@/src/types/meal-library";
import type { MealType, SavedFood } from "@/src/types/track";

// ── Fetch ──────────────────────────────────────────────────────────────────

export interface ConceptLinkRow {
  id: string;
  concept_id: string;
  saved_food_id: string | null;
  food_inventory_id: string | null;
  matched_by: "seed" | "auto_name_match" | "user";
}

interface InventoryRowRaw {
  id: string;
  barcode: string | null;
  quantity: number;
  locations: Array<{ quantity: number }>;
}

export interface MealLibraryData {
  meals: MealWithItems[];
  conceptsById: Map<string, FoodConcept>;
  /** saved_food_id -> concept ids (a food can carry several links). */
  conceptIdsBySavedFoodId: Map<string, string[]>;
  inventory: ResolutionInventoryRow[];
  /** profiles.target_calories, for the Emergency header. Null if unset. */
  targetCalories: number | null;
}

export async function fetchMealLibrary(): Promise<MealLibraryData> {
  const [meals, items, concepts, links, inventory, profile] = await Promise.all([
    supabase.from("meals").select("*").order("name"),
    supabase
      .from("meal_items")
      .select("*, savedFood:saved_foods(*)")
      .order("display_order"),
    supabase.from("food_concepts").select("*"),
    supabase.from("food_concept_links").select("*"),
    supabase
      .from("food_inventory")
      .select("id, barcode, quantity, locations:food_inventory_locations(quantity)"),
    // No .eq() filter: profiles is keyed by `id` (not user_id) and its RLS
    // select policy is `auth.uid() = id`, so this returns exactly the
    // caller's row — maybeSingle() cannot see a second one.
    supabase.from("profiles").select("target_calories").maybeSingle(),
  ]);
  const errors = [meals.error, items.error, concepts.error, links.error, inventory.error, profile.error]
    .filter((e) => e !== null);
  if (errors.length > 0) {
    errors.slice(1).forEach((e) => console.error("fetchMealLibrary:", e));
    throw errors[0];
  }

  const linkRows = (links.data ?? []) as ConceptLinkRow[];
  const conceptIdsBySavedFoodId = new Map<string, string[]>();
  const conceptIdsByInventoryId = new Map<string, string[]>();
  for (const l of linkRows) {
    if (l.saved_food_id) {
      const arr = conceptIdsBySavedFoodId.get(l.saved_food_id) ?? [];
      arr.push(l.concept_id);
      conceptIdsBySavedFoodId.set(l.saved_food_id, arr);
    }
    if (l.food_inventory_id) {
      const arr = conceptIdsByInventoryId.get(l.food_inventory_id) ?? [];
      arr.push(l.concept_id);
      conceptIdsByInventoryId.set(l.food_inventory_id, arr);
    }
  }

  // `meal_items.servings` is a `numeric` column, and PostgREST returns numeric
  // as a JSON *string* in some configurations (this is why the module this
  // replaced wrapped every read in `Number(...)`). Coerce ONCE here: this is
  // the only place in the app that constructs `MealItemWithFood` values, so
  // every downstream consumer gets the `number` the type promises. Without it
  // the totals below still work by accident (`*` coerces) but Task 12's
  // builder does `+ delta` (string concatenation) and `.toFixed()` (throws).
  const itemRows = ((items.data ?? []) as MealItemWithFood[]).map((it) => ({
    ...it,
    servings: Number(it.servings),
  }));
  const byMeal = new Map<string, MealItemWithFood[]>();
  for (const it of itemRows) {
    const arr = byMeal.get(it.meal_id) ?? [];
    arr.push(it);
    byMeal.set(it.meal_id, arr);
  }

  const invRows = (inventory.data ?? []) as unknown as InventoryRowRaw[];
  const resolutionInventory: ResolutionInventoryRow[] = invRows.map((r) => ({
    id: r.id,
    barcode: r.barcode,
    // Location rows are the live stock model; location-less rows fall back
    // to the legacy quantity column (mirrors the consume RPC's policy).
    totalQuantity:
      r.locations.length > 0
        ? r.locations.reduce((s, l) => s + l.quantity, 0)
        : r.quantity,
    conceptIds: conceptIdsByInventoryId.get(r.id) ?? [],
  }));

  return {
    meals: ((meals.data ?? []) as Meal[]).map((m) => ({
      ...m,
      items: byMeal.get(m.id) ?? [],
    })),
    conceptsById: new Map(
      ((concepts.data ?? []) as FoodConcept[]).map((c) => [c.id, c]),
    ),
    conceptIdsBySavedFoodId,
    inventory: resolutionInventory,
    targetCalories:
      (profile.data as { target_calories: number | null } | null)
        ?.target_calories ?? null,
  };
}

/** Calories already logged on a local date — for "~X cal remaining today". */
export async function fetchDayCalories(date: string): Promise<number> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("calories")
    .eq("date", date);
  if (error) throw error;
  return (data ?? []).reduce((s, r) => s + (r.calories ?? 0), 0);
}

// ── Totals (computed, never stored) ────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeMealTotals(items: MealItemWithFood[]): MealTotals {
  const zero: MealTotals = {
    calories: 0, protein: 0, carbs: 0, fats: 0, sugars: 0, sodium_mg: 0, fiber_g: 0,
  };
  const totals = items.reduce((acc, it) => {
    const f = it.savedFood;
    const s = it.servings;
    return {
      calories: acc.calories + s * (f.calories ?? 0),
      protein: acc.protein + s * (f.protein ?? 0),
      carbs: acc.carbs + s * (f.carbs ?? 0),
      fats: acc.fats + s * (f.fats ?? 0),
      sugars: acc.sugars + s * (f.sugars ?? 0),
      sodium_mg: acc.sodium_mg + s * (f.sodium_mg ?? 0),
      fiber_g: acc.fiber_g + s * (f.fiber_g ?? 0),
    };
  }, zero);
  // Round for the same reason computeBrianScore does (see mealScore.ts): the
  // underlying nutrition data is decimal, so summing servings × macros leaves
  // float epsilon (1234.5600000000002) that MealRow/MealDetail render
  // verbatim. These are two independent implementations of the same sum and
  // MUST agree on rounding — mealScore.ts rounds its totals to 2dp too, so a
  // meal's calories cannot read differently in the row and in the score card.
  return {
    calories: round2(totals.calories),
    protein: round2(totals.protein),
    carbs: round2(totals.carbs),
    fats: round2(totals.fats),
    sugars: round2(totals.sugars),
    sodium_mg: round2(totals.sodium_mg),
    fiber_g: round2(totals.fiber_g),
  };
}

// ── Mutations ──────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Postgres unique_violation. Here it can only be `meals.unique (user_id, slug)`. */
const UNIQUE_VIOLATION = "23505";

// slugify() collapses every run of non-alphanumerics to one "-", so names the
// user sees as DISTINCT can collide: "PB&J" and "PB J" both slugify to "pb-j".
// Surfacing the raw 23505 there ("duplicate key value violates unique
// constraint meals_user_id_slug_key") reads as an app bug, since the two
// displayed names differ. Renaming through updateMeal re-slugifies and hits
// the same wall, so both mutations map it.
function duplicateMealNameError(name: string): Error {
  return new Error(
    `You already have a meal filed under the same name as “${name.trim()}”. ` +
      `Names that differ only in punctuation or spacing count as the same meal — pick a different one.`,
  );
}

export interface MealItemInput {
  saved_food_id: string;
  servings: number;
  small_pieces_ok: boolean;
}

export interface MealInput {
  name: string;
  category: Meal["category"];
  role: Meal["role"];
  default_meal_type: Meal["default_meal_type"];
  prep_minutes: number;
  taste_override: Meal["taste_override"];
  notes: string | null;
  items: MealItemInput[];
}

export async function createMeal(userId: string, input: MealInput): Promise<void> {
  const slug = slugify(input.name);
  if (!slug) throw new Error("Name must contain at least one letter or number.");
  if (input.items.length === 0) throw new Error("A meal needs at least one item.");
  const { items, ...meal } = input;
  // Ordering is load-bearing: meal_items carries a composite FK
  // (meal_id, user_id) -> meals(id, user_id), so the parent row must be
  // committed with a MATCHING user_id before any item can reference it.
  const { data, error } = await supabase
    .from("meals")
    .insert({ ...meal, name: input.name.trim(), slug, user_id: userId })
    .select("id")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw duplicateMealNameError(input.name);
    throw error;
  }
  const { error: itemsError } = await supabase.from("meal_items").insert(
    items.map((it, idx) => ({
      user_id: userId,
      meal_id: data.id,
      saved_food_id: it.saved_food_id,
      servings: it.servings,
      small_pieces_ok: it.small_pieces_ok,
      display_order: idx,
    })),
  );
  if (itemsError) {
    // Compensating delete — NOT the same accepted risk as updateMeal's
    // non-atomic replace. The meals row is already committed, and Task 13
    // keeps the builder open on failure, so the user's natural retry re-runs
    // the insert above and collides with `unique (user_id, slug)`: they could
    // never save under that name again, and a phantom item-less meal would
    // sit in the library. Best-effort by design — if this delete also fails
    // we still surface the original error, which is the actionable one.
    await supabase.from("meals").delete().eq("id", data.id);
    throw itemsError;
  }
}

export async function updateMeal(
  userId: string,
  mealId: string,
  input: MealInput,
): Promise<void> {
  const slug = slugify(input.name);
  if (!slug) throw new Error("Name must contain at least one letter or number.");
  if (input.items.length === 0) throw new Error("A meal needs at least one item.");
  const { items, ...meal } = input;
  const { error } = await supabase
    .from("meals")
    .update({ ...meal, name: input.name.trim(), slug })
    .eq("id", mealId);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw duplicateMealNameError(input.name);
    throw error;
  }
  // Full replace: delete + reinsert. Two client writes, not atomic — a
  // failure between them leaves an item-less meal, which is visible in the
  // UI and recoverable by re-editing (unlike silent divergence). An RPC is
  // not warranted for a single-user editing flow (YAGNI, spec §4).
  const { error: delError } = await supabase
    .from("meal_items")
    .delete()
    .eq("meal_id", mealId);
  if (delError) throw delError;
  const { error: insError } = await supabase.from("meal_items").insert(
    items.map((it, idx) => ({
      user_id: userId,
      meal_id: mealId,
      saved_food_id: it.saved_food_id,
      servings: it.servings,
      small_pieces_ok: it.small_pieces_ok,
      display_order: idx,
    })),
  );
  if (insError) throw insError;
}

export async function deleteMeal(mealId: string): Promise<void> {
  const { error } = await supabase.from("meals").delete().eq("id", mealId);
  if (error) throw error;
}

// ── Logging (spec §8) ──────────────────────────────────────────────────────

/** The log rows committed; only the stock decrement failed. */
export class MealLoggedButDecrementFailed extends Error {
  loggedAt: string;
  constructor(loggedAt: string, detail: string) {
    super(`Meal logged, but inventory update failed: ${detail}`);
    this.loggedAt = loggedAt;
  }
}

export interface LogMealResult {
  loggedAt: string;
  /** Inventory ids actually decremented — kept for undo refunds. */
  consumedIds: string[];
}

export async function logMeal(
  userId: string,
  meal: MealWithItems,
  opts: {
    date: string; // local YYYY-MM-DD (the viewed day)
    mealType: MealType;
    conceptIdsBySavedFoodId: Map<string, string[]>;
    inventory: ResolutionInventoryRow[];
  },
): Promise<LogMealResult> {
  // An item-less meal must not log "successfully". `rows` would be [],
  // PostgREST accepts an empty insert without error, and the caller would show
  // a "Logged" toast plus a working Undo for zero rows written — a silent lie
  // that also hides the orphaned meal that produced it. The superseded meal
  // templates service (deleted in Task 13) guarded the same case, so dropping
  // the guard would be a regression. createMeal/updateMeal both reject empty
  // item lists, so reaching this means a partial write left a meal behind.
  if (meal.items.length === 0) throw new Error("This meal has no items.");

  const matches = resolveInventoryMatches(
    meal.items.map((it) => ({
      savedFoodId: it.saved_food_id,
      barcode: it.savedFood.barcode,
      conceptIds: opts.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
    })),
    opts.inventory,
  );

  const loggedAt = new Date().toISOString();
  // Two meal items can resolve to the SAME inventory row (two saved foods
  // sharing one concept, one in-stock product). The consume call below
  // de-duplicates, so only ONE unit comes off that container — therefore only
  // the FIRST item claiming a given inventory id may record uses_inventory /
  // inventory_items. If both rows claimed {id: X, quantity: 1} the log would
  // assert two units were taken when one was, and any refund driven off those
  // rows would over-credit stock.
  const claimedInventoryIds = new Set<string>();
  const rows = meal.items.map((it) => {
    const f = it.savedFood;
    const s = it.servings;
    const matchedId = matches.get(it.saved_food_id) ?? null;
    const inventoryId =
      matchedId !== null && !claimedInventoryIds.has(matchedId) ? matchedId : null;
    if (inventoryId !== null) claimedInventoryIds.add(inventoryId);
    return {
      user_id: userId,
      date: opts.date,
      meal_type: opts.mealType,
      name: f.name,
      calories: f.calories != null ? Math.round(f.calories * s) : null,
      protein: f.protein != null ? round2(f.protein * s) : null,
      carbs: f.carbs != null ? round2(f.carbs * s) : null,
      fats: f.fats != null ? round2(f.fats * s) : null,
      sugars: f.sugars != null ? round2(f.sugars * s) : null,
      sodium_mg: f.sodium_mg != null ? round2(f.sodium_mg * s) : null,
      fiber_g: f.fiber_g != null ? round2(f.fiber_g * s) : null,
      uses_inventory: inventoryId !== null,
      // NOTE: this records INTENT, not outcome. These rows are written before
      // the consume RPC runs below, so a row can claim {id, quantity: 1} for a
      // unit that was never taken (zero-stock rows are a no-op for consume).
      // No current code path treats it as truth — undo refunds the RPC's
      // truthful `consumedIds` instead — but a future "refund from the log
      // row" path would over-credit stock. Read `consumed > 0`, not this.
      inventory_items: inventoryId !== null ? [{ id: inventoryId, quantity: 1 }] : null,
      saved_food_id: it.saved_food_id,
      servings: s,
      meal_id: meal.id,
      logged_at: loggedAt,
    };
  });

  const { error } = await supabase.from("meal_logs").insert(rows);
  if (error) throw error;

  // Decrement AFTER the log commits: the meal was eaten either way, so a
  // stock-bookkeeping failure must never block or roll back the log. The
  // caller surfaces the error (alert idiom) without failing the log.
  // De-duplicate: two meal items can resolve to the SAME inventory row, and
  // the RPC decrements one unit per id passed. See the Task 4 amendment.
  const requestedIds = [...new Set(matches.values())];
  let consumedIds: string[] = [];
  if (requestedIds.length > 0) {
    const { data, error: rpcError } = await supabase.rpc("consume_inventory_units", {
      p_inventory_ids: requestedIds,
    });
    if (rpcError) {
      // Clean ONLY for an error the server actually returned: consume_inventory_units
      // is a single plpgsql call, so a raise aborts the whole body and nothing
      // was consumed. A NETWORK TIMEOUT lands here too and is genuinely
      // unrecoverable — the decrement may have committed server-side while the
      // client saw a failure, and we have no `consumedIds` to refund, so stock
      // is silently one unit low with no way to detect it from here.
      console.error("consume_inventory_units failed:", rpcError);
      throw new MealLoggedButDecrementFailed(loggedAt, rpcError.message);
    }
    // Keep ONLY the ids a unit was actually taken from. consume is a no-op on
    // a zero-stock row (consumed = 0), but refund has no matching guard — it
    // would CREATE a unit out of nothing on undo. See the Task 6 amendment.
    const results = (data ?? []) as Array<{ inventory_id: string; consumed: number }>;
    consumedIds = results.filter(r => r.consumed > 0).map(r => r.inventory_id);
  }
  return { loggedAt, consumedIds };
}

export async function undoMealLog(
  mealId: string,
  loggedAt: string,
  consumedIds: string[],
): Promise<void> {
  const { error } = await supabase
    .from("meal_logs")
    .delete()
    .eq("meal_id", mealId)
    .eq("logged_at", loggedAt);
  if (error) throw error;
  if (consumedIds.length > 0) {
    const { error: rpcError } = await supabase.rpc("refund_inventory_units", {
      p_inventory_ids: consumedIds,
    });
    if (rpcError) throw rpcError;
  }
}

// ── Food Matching (spec §9.2) ──────────────────────────────────────────────

export interface FoodMatchingData {
  savedFoods: SavedFood[];
  inventory: Array<{ id: string; name: string; brand: string | null }>;
  concepts: FoodConcept[];
  links: ConceptLinkRow[];
}

export async function fetchFoodMatching(): Promise<FoodMatchingData> {
  const [savedFoods, inventory, concepts, links] = await Promise.all([
    supabase.from("saved_foods").select("*").order("name"),
    supabase.from("food_inventory").select("id, name, brand").order("name"),
    supabase.from("food_concepts").select("*").order("name"),
    supabase.from("food_concept_links").select("*"),
  ]);
  const errors = [savedFoods.error, inventory.error, concepts.error, links.error]
    .filter((e) => e !== null);
  if (errors.length > 0) {
    errors.slice(1).forEach((e) => console.error("fetchFoodMatching:", e));
    throw errors[0];
  }
  return {
    savedFoods: (savedFoods.data ?? []) as SavedFood[],
    inventory: (inventory.data ?? []) as FoodMatchingData["inventory"],
    concepts: (concepts.data ?? []) as FoodConcept[],
    links: (links.data ?? []) as ConceptLinkRow[],
  };
}

export async function createUserLink(
  userId: string,
  conceptId: string,
  target: { savedFoodId: string } | { foodInventoryId: string },
): Promise<void> {
  const { error } = await supabase.from("food_concept_links").insert({
    user_id: userId,
    concept_id: conceptId,
    saved_food_id: "savedFoodId" in target ? target.savedFoodId : null,
    food_inventory_id: "foodInventoryId" in target ? target.foodInventoryId : null,
    matched_by: "user",
  });
  if (error) throw error;
}

export async function deleteLink(linkId: string): Promise<void> {
  const { error } = await supabase.from("food_concept_links").delete().eq("id", linkId);
  if (error) throw error;
}
