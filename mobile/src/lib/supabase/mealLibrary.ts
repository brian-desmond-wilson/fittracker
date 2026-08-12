// mobile/src/lib/supabase/mealLibrary.ts
// Data access for Nutrition OS Phase 2 (house pattern: domain query module).
import { supabase } from "../supabase";
import { resolveInventoryMatches, type ResolutionInventoryRow } from "../inventoryResolution";
import { projectItemStock, type AssemblabilityInventoryRow } from "../stockState";
import { getLocalDateString } from "../dates";
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
  name: string;
  barcode: string | null;
  expiration_date: string | null;
  /** `is_ready_to_consume` is NOT dead payload despite nothing here reading
   *  the ready/storage split: `projectItemStock` takes a `StockQuantityRow`
   *  (`Pick<StockLocationRow, "quantity" | "is_ready_to_consume">`), so the
   *  field is required by the call below. Spec §9 prescribes selecting it too. */
  locations: Array<{ quantity: number; is_ready_to_consume: boolean }>;
}

export interface MealLibraryData {
  meals: MealWithItems[];
  conceptsById: Map<string, FoodConcept>;
  /** saved_food_id -> concept ids (a food can carry several links). */
  conceptIdsBySavedFoodId: Map<string, string[]>;
  /** Widened from `ResolutionInventoryRow[]` in Phase 4 Task 8 — additive
   *  (`AssemblabilityInventoryRow extends ResolutionInventoryRow`), so
   *  resolution-only consumers such as `logMeal` are unaffected. */
  inventory: AssemblabilityInventoryRow[];
  /** profiles.target_calories, for the Emergency header. Null if unset. */
  targetCalories: number | null;
  /** nutrition_constraints.max_prep_minutes — the budget the recommender
   *  filters on. Carried here so the library can SAY that a meal is over it
   *  (C7) instead of the meal silently never being suggested. */
  maxPrepMinutes: number;
}

/** Mirrors the column's own schema default, so a missing constraints row
 *  behaves exactly like an untouched one — same constant and reasoning as
 *  `useEatNext`'s. */
const DEFAULT_MAX_PREP_MINUTES = 5;

/**
 * D1. Seven independent call sites pull this — the Loop Hub, the Home card's
 * recommender, the Meals screen's recommender, the Meal Library modal, the
 * shopping engine, the item-detail page and the inventory screen — and on a
 * cold app open several fire within the same tick, each issuing the same seven
 * queries. Nothing shared them.
 *
 * TWO mechanisms, and the first is the one that matters:
 *
 *   • `inFlight` coalesces concurrent callers onto one round trip. This is
 *     the mount storm, and it is exact: there is no staleness window at all,
 *     because everyone waits on the same promise.
 *   • `cache` collapses a burst that arrives just after one settles, for a
 *     deliberately short window.
 *
 * The TTL is SMALL on purpose. A long one would need every write in the app
 * to remember to invalidate, and a missed call would show stale stock
 * indefinitely — the failure mode is silent and the write paths are spread
 * across screens. At five seconds a missed invalidation self-heals before
 * anyone reads the screen, so `invalidateMealLibrary` is an optimisation for
 * immediacy after a known write rather than a correctness requirement.
 */
const MEAL_LIBRARY_TTL_MS = 5_000;
let cached: { data: MealLibraryData; at: number } | null = null;
let inFlight: Promise<MealLibraryData> | null = null;

/** Drop the cache after a write that changes meals, links or stock. Cheap and
 *  safe to over-call; see the TTL note above for why missing one is survivable. */
export function invalidateMealLibrary(): void {
  cached = null;
}

export function fetchMealLibrary(opts?: { force?: boolean }): Promise<MealLibraryData> {
  if (opts?.force) {
    cached = null;
    inFlight = null;
  } else {
    if (cached && Date.now() - cached.at < MEAL_LIBRARY_TTL_MS) {
      return Promise.resolve(cached.data);
    }
    if (inFlight) return inFlight;
  }
  const run = fetchMealLibraryUncached()
    .then((data) => {
      cached = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      // Cleared whether it resolved or threw: a failed load must not pin every
      // future caller to the same rejected promise.
      if (inFlight === run) inFlight = null;
    });
  inFlight = run;
  return run;
}

async function fetchMealLibraryUncached(): Promise<MealLibraryData> {
  const [meals, items, concepts, links, inventory, profile, constraints] = await Promise.all([
    supabase.from("meals").select("*").order("name"),
    supabase
      .from("meal_items")
      .select("*, savedFood:saved_foods(*)")
      .order("display_order"),
    supabase.from("food_concepts").select("*"),
    supabase.from("food_concept_links").select("*"),
    supabase
      .from("food_inventory")
      // `quantity` (the legacy cache) is deliberately NOT selected: nothing
      // reads it, and an absent column means the removed fallback cannot be
      // re-added without also editing this query — one more step between a
      // future reader and re-arming the divergence Phase 4 closed.
      .select("id, name, barcode, expiration_date, locations:food_inventory_locations(quantity, is_ready_to_consume)"),
    // No .eq() filter: profiles is keyed by `id` (not user_id) and its RLS
    // select policy is `auth.uid() = id`, so this returns exactly the
    // caller's row — maybeSingle() cannot see a second one.
    supabase.from("profiles").select("target_calories").maybeSingle(),
    // Same single-row reasoning as profiles: `nutrition_constraints` is
    // unique on user_id and its RLS select policy is owner-only.
    supabase.from("nutrition_constraints").select("max_prep_minutes").maybeSingle(),
  ]);
  const errors = [meals.error, items.error, concepts.error, links.error, inventory.error, profile.error, constraints.error]
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
  // the totals below still work by accident (`*` coerces) but the Meal
  // Library plan's Task 12 builder (`MealBuilder`, `setServings`) does
  // `+ delta` (string concatenation) and `.toFixed()` (throws). NB: a
  // different plan's Task 12 — not this phase's migration apply.
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
  // ONE clock for the whole map: `getLocalDateString()` inside the callback
  // would sample a fresh `new Date()` per row and could straddle local
  // midnight mid-list, banding two items against different "today"s.
  const todayLocalDate = getLocalDateString();
  // Location rows are the ONLY quantity truth (spec §5.1). The legacy
  // `r.quantity` fallback this replaced is gone deliberately — it is the
  // divergence Phase 4 exists to close, and restoring it would re-arm it.
  // The reconcile seeded a location row for every item that had none, so a 0
  // projected here is a genuine out-of-stock, not a missing row.
  const resolutionInventory: AssemblabilityInventoryRow[] = invRows.map((r) => {
    const state = projectItemStock({
      // Synthetic item: only `expiration_date` participates in what this call
      // site reads (`totalQuantity`, `daysLeft`). The thresholds and
      // `storage_type` drive isLow/needsFridgeRestock, which nothing here
      // consumes — see the null-storage_type note in `projectItemStock`.
      item: {
        storage_type: null,
        restock_threshold: null,
        fridge_restock_threshold: null,
        total_restock_threshold: null,
        requires_refrigeration: null,
        expiration_date: r.expiration_date,
      },
      locations: r.locations,
      todayLocalDate,
    });
    return {
      id: r.id,
      name: r.name,
      barcode: r.barcode,
      totalQuantity: state.totalQuantity,
      daysLeft: state.daysLeft,
      conceptIds: conceptIdsByInventoryId.get(r.id) ?? [],
    };
  });

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
    maxPrepMinutes:
      (constraints.data as { max_prep_minutes: number } | null)
        ?.max_prep_minutes ?? DEFAULT_MAX_PREP_MINUTES,
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
  invalidateMealLibrary(); // D1: this write changes what a read would return
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
  invalidateMealLibrary(); // D1: this write changes what a read would return
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
  invalidateMealLibrary(); // D1: this write changes what a read would return
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
  invalidateMealLibrary(); // D1: this write changes what a read would return
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

  // D3. Record what the decrement ACTUALLY took, beside the claim written
  // above. `inventory_items` is intent — it is written before this RPC runs
  // and can name a unit that was never removed — and the consumption
  // estimator, reading those claims, inherits the error as phantom demand.
  // The truthful ids were already in hand and were being thrown away after
  // undo used them.
  //
  // Best-effort, and deliberately after the log rows are committed: failing
  // to annotate history must never fail the log itself, or roll one back.
  // Scoped by `logged_at`, the same key undo uses to identify this batch.
  const { error: stampError } = await supabase
    .from("meal_logs")
    .update({ consumed_inventory_ids: consumedIds })
    .eq("meal_id", meal.id)
    .eq("logged_at", loggedAt);
  if (stampError) console.error("logMeal: could not record confirmed decrements:", stampError);

  return { loggedAt, consumedIds };
}

export async function undoMealLog(
  mealId: string,
  loggedAt: string,
  consumedIds: string[],
): Promise<void> {
  invalidateMealLibrary(); // D1: this write changes what a read would return
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
  invalidateMealLibrary(); // D1: links change what every read means
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
  invalidateMealLibrary(); // D1: links change what every read means
  const { error } = await supabase.from("food_concept_links").delete().eq("id", linkId);
  if (error) throw error;
}
