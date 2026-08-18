// mobile/src/lib/supabase/mealLibrary.ts
// Data access for Nutrition OS Phase 2 (house pattern: domain query module).
import { supabase } from "../supabase";
import { resolveInventoryMatches, type ResolutionInventoryRow } from "../inventoryResolution";
import { projectItemStock, type AssemblabilityInventoryRow } from "../stockState";
import { buildBorrowedFoodImages, withBorrowedImage } from "../foodImageBorrow";
import { invalidateBorrowedFoodImages } from "./borrowedFoodImages";
import { getLocalDateString } from "../dates";
import type { InventoryNutrition } from "../mealLibraryView";
import { matchingLogIds, type AdHocLogRow } from "../adHocMeals";
import type { ConceptRating, FoodConcept } from "@/src/types/nutrition-preferences";
import type {
  Meal,
  MealCategory,
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
  /** Read for `buildBorrowedFoodImages` only — the eating half of the app has
   *  no photographs of its own, and this is where they live. */
  image_primary_url: string | null;
  /** `is_ready_to_consume` is NOT dead payload despite nothing here reading
   *  the ready/storage split: `projectItemStock` takes a `StockQuantityRow`
   *  (`Pick<StockLocationRow, "quantity" | "is_ready_to_consume">`), so the
   *  field is required by the call below. Spec §9 prescribes selecting it too. */
  locations: Array<{ quantity: number; is_ready_to_consume: boolean }>;
  /** This product's own nutrition, per serving — the input to dynamic
   *  meal pricing. Nullable throughout: plenty of inventory rows were added
   *  by hand and never got numbers. */
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  /** Both landed with the saturated-fat work; before that `food_inventory`
   *  recorded no sodium at all and meals priced from stock fell back to the
   *  as-built product for it. Still nullable — most rows predate the
   *  columns. */
  saturated_fat_g: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
}

export interface SourceSuggestion {
  name: string;
  /** True when it is one of your kept vendors rather than a name a meal
   *  happens to carry. Vendors are offered first. */
  isVendor: boolean;
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
  /** Every inventory row's own nutrition, for pricing meals from the fridge
   *  (`mealNutrition`). Keyed by inventory id — the same key
   *  `resolveInventoryMatches` returns. */
  nutritionByInventoryId: Map<string, InventoryNutrition>;
  /** meal id -> how many times it has ever been logged. */
  timesLoggedByMealId: Map<string, number>;
  /** Logs that name no meal — the raw material for `adHocCandidates`. */
  adHocLogs: AdHocLogRow[];
  /** Every place a meal could have come from: the vendors you keep, plus any
   *  source a meal already names. The edit page offers these rather than a
   *  bare text field, so "Thistle" typed twice is one source and not two. */
  sourceSuggestions: SourceSuggestion[];
  /** profiles.target_calories, for the Emergency header. Null if unset. */
  targetCalories: number | null;
  /** C1: meal id → the most recent local date it was logged on. Absent means
   *  never. Drives retirement, which is what stops a rotating delivery menu
   *  burying the meals you actually assembled. */
  lastLoggedByMealId: Map<string, string>;
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
  const [meals, mealCategories, vendors, items, concepts, links, inventory, profile, constraints, logs, adHocLogs] = await Promise.all([
    supabase.from("meals").select("*").order("name"),
    // A meal is filed under one or more categories and appears on every shelf
    // it holds. `meals.category` survives as the PRIMARY one — the single
    // answer the default logging slot needs — and is always among these.
    supabase.from("meal_categories").select("meal_id, category"),
    // The places food comes from. Read here rather than by the edit page, which
    // is already holding this whole payload — one round trip, and the
    // suggestions can never disagree with the meals they were derived from.
    supabase.from("nutrition_vendors").select("name, is_active, display_order").order("display_order"),
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
      // The macro columns are new here: they are what lets a meal be priced
      // from the product actually in the fridge rather than the one it was
      // built with (`mealNutrition`). `food_inventory` carries its own
      // nutrition — an inventory row IS a product — so no join is needed.
      .select("id, name, barcode, expiration_date, image_primary_url, calories, protein, carbs, fats, sugars, fiber_g, saturated_fat_g, sodium_mg, locations:food_inventory_locations(quantity, is_ready_to_consume)"),
    // No .eq() filter: profiles is keyed by `id` (not user_id) and its RLS
    // select policy is `auth.uid() = id`, so this returns exactly the
    // caller's row — maybeSingle() cannot see a second one.
    supabase.from("profiles").select("target_calories").maybeSingle(),
    // Same single-row reasoning as profiles: `nutrition_constraints` is
    // unique on user_id and its RLS select policy is owner-only.
    supabase.from("nutrition_constraints").select("max_prep_minutes").maybeSingle(),
    // C1. Only rows that name a meal — a free-typed log has nothing to date.
    // Every row, not a distinct date: the library counts HOW OFTEN as well as
    // how recently, and one meal logged twice in a day is twice eaten.
    supabase.from("meal_logs").select("meal_id, date").not("meal_id", "is", null),
    // The other half of "every meal you have ever eaten": logs that never
    // became meals. Repeat ones are offered for promotion (`adHocCandidates`).
    supabase
      .from("meal_logs")
      .select("name, date, calories, protein, carbs, fats, sugars, saturated_fat_g, sodium_mg, fiber_g, saved_food_id")
      .is("meal_id", null),
  ]);
  const errors = [meals.error, mealCategories.error, vendors.error, items.error, concepts.error, links.error, inventory.error, profile.error, constraints.error, logs.error, adHocLogs.error]
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
  const invRows = (inventory.data ?? []) as unknown as InventoryRowRaw[];
  // A vendor meal exists twice — as the thing you own and as the thing you eat
  // — and only the owned half carries a photograph. Resolved once here, at the
  // single place `MealItemWithFood` values are constructed, so every meal
  // surface (library rows, meal detail, Eat Next's borrowed face) shows the
  // picture without each of them re-deriving the link.
  const borrowedImages = buildBorrowedFoodImages(
    linkRows,
    new Map(invRows.map((r) => [r.id, r.image_primary_url])),
  );

  const itemRows = ((items.data ?? []) as MealItemWithFood[]).map((it) => ({
    ...it,
    servings: Number(it.servings),
    savedFood: withBorrowedImage(it.savedFood, borrowedImages),
  }));
  const byMeal = new Map<string, MealItemWithFood[]>();
  for (const it of itemRows) {
    const arr = byMeal.get(it.meal_id) ?? [];
    arr.push(it);
    byMeal.set(it.meal_id, arr);
  }

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

  // Built from the same rows, keyed the same way `resolveInventoryMatches`
  // returns — so a meal's price and its availability can never be computed
  // from different stock.
  const nutritionByInventoryId = new Map<string, InventoryNutrition>(
    invRows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        calories: r.calories,
        protein: r.protein,
        carbs: r.carbs,
        fats: r.fats,
        sugars: r.sugars,
        // Both are columns on food_inventory now, so a meal priced from
        // stock answers with the packet's own figures rather than falling
        // back to the product it was built with.
        saturated_fat_g: r.saturated_fat_g,
        sodium_mg: r.sodium_mg,
        fiber_g: r.fiber_g,
      },
    ]),
  );

  const logRows = (logs.data ?? []) as Array<{ meal_id: string; date: string }>;
  const timesLoggedByMealId = new Map<string, number>();
  for (const r of logRows) {
    timesLoggedByMealId.set(r.meal_id, (timesLoggedByMealId.get(r.meal_id) ?? 0) + 1);
  }

  const categoriesByMealId = new Map<string, MealCategory[]>();
  for (const r of (mealCategories.data ?? []) as Array<{ meal_id: string; category: MealCategory }>) {
    const arr = categoriesByMealId.get(r.meal_id) ?? [];
    arr.push(r.category);
    categoriesByMealId.set(r.meal_id, arr);
  }

  // Vendors first and in their own display order, then anything else a meal
  // already names — deduplicated case-insensitively, so "thistle" typed once
  // does not sit beside the vendor called "Thistle".
  const sourceSuggestions: SourceSuggestion[] = [];
  const seenSources = new Set<string>();
  for (const v of (vendors.data ?? []) as Array<{ name: string; is_active: boolean }>) {
    if (!v.is_active || seenSources.has(v.name.toLowerCase())) continue;
    seenSources.add(v.name.toLowerCase());
    sourceSuggestions.push({ name: v.name, isVendor: true });
  }
  for (const m of (meals.data ?? []) as Meal[]) {
    const nameOf = m.source_name?.trim();
    if (!nameOf || seenSources.has(nameOf.toLowerCase())) continue;
    seenSources.add(nameOf.toLowerCase());
    sourceSuggestions.push({ name: nameOf, isVendor: false });
  }

  return {
    meals: ((meals.data ?? []) as Meal[]).map((m) => ({
      ...m,
      // Falls back to the primary rather than to []: a meal with no join rows
      // would appear on no shelf and vanish from the library entirely, which
      // is a worse answer than the one category we already know it has.
      categories: categoriesByMealId.get(m.id) ?? [m.category],
      items: byMeal.get(m.id) ?? [],
    })),
    conceptsById: new Map(
      ((concepts.data ?? []) as FoodConcept[]).map((c) => [c.id, c]),
    ),
    conceptIdsBySavedFoodId,
    inventory: resolutionInventory,
    nutritionByInventoryId,
    timesLoggedByMealId,
    adHocLogs: (adHocLogs.data ?? []) as AdHocLogRow[],
    sourceSuggestions,
    // Max per meal. String comparison is sound and cheap here: these are
    // YYYY-MM-DD, which sorts lexicographically exactly as it sorts by date.
    lastLoggedByMealId: logRows
      .reduce((acc, r) => {
        const prev = acc.get(r.meal_id);
        if (!prev || r.date > prev) acc.set(r.meal_id, r.date);
        return acc;
      }, new Map<string, string>()),
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
    calories: 0, protein: 0, carbs: 0, fats: 0, sugars: 0,
    saturated_fat_g: 0, sodium_mg: 0, fiber_g: 0,
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
      saturated_fat_g: acc.saturated_fat_g + s * (f.saturated_fat_g ?? 0),
      sodium_mg: acc.sodium_mg + s * (f.sodium_mg ?? 0),
      fiber_g: acc.fiber_g + s * (f.fiber_g ?? 0),
    };
  }, zero);
  // Round for the same reason computeBrianScore does (see mealScore.ts): the
  // underlying nutrition data is decimal, so summing servings × macros leaves
  // float epsilon (1234.5600000000002) that the library rows and MealDetail render
  // verbatim. These are two independent implementations of the same sum and
  // MUST agree on rounding — mealScore.ts rounds its totals to 2dp too, so a
  // meal's calories cannot read differently in the row and in the score card.
  return {
    calories: round2(totals.calories),
    protein: round2(totals.protein),
    carbs: round2(totals.carbs),
    fats: round2(totals.fats),
    sugars: round2(totals.sugars),
    saturated_fat_g: round2(totals.saturated_fat_g),
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
  /** The primary category — what the default logging slot reads. */
  category: Meal["category"];
  /** Every category the meal is filed under. Absent means "just the primary",
   *  which is what the builder passes until the Edit page learns the set. */
  categories?: MealCategory[];
  role: Meal["role"];
  default_meal_type: Meal["default_meal_type"];
  prep_minutes: number;
  taste_override: Meal["taste_override"];
  /** Where the meal comes from, and what to call that place. The database
   *  refuses a name on a `home` meal and demands one on the other two. */
  source_kind: Meal["source_kind"];
  source_name: string | null;
  is_complete_portion: boolean;
  image_primary_url: string | null;
  notes: string | null;
  items: MealItemInput[];
}

/** Returns the new meal's id, so a caller can act on what it just made
 *  (E1 offers concept links for it). */
export async function createMeal(userId: string, input: MealInput): Promise<string> {
  invalidateMealLibrary(); // D1: this write changes what a read would return
  const slug = slugify(input.name);
  if (!slug) throw new Error("Name must contain at least one letter or number.");
  if (input.items.length === 0) throw new Error("A meal needs at least one item.");
  const { items, categories, ...meal } = input;
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
  // The shelves read the join table, so a meal without rows here would be
  // filed nowhere. Best-effort and after the items: the read falls back to the
  // primary category, so a failure costs a shelf placement, not the meal.
  const { error: catError } = await setMealCategories(
    data.id,
    normalizeCategories(input.category, categories),
  );
  if (catError) console.error("createMeal: could not file categories:", catError);
  return data.id;
}

/** The set to write, with the primary at its head — the order
 *  `set_meal_categories` reads to decide which one stays primary. */
function normalizeCategories(
  primary: MealCategory,
  categories: MealCategory[] | undefined,
): MealCategory[] {
  const set = categories && categories.length > 0 ? categories : [primary];
  return set.includes(primary) ? [primary, ...set.filter((c) => c !== primary)] : set;
}

/**
 * Replace a meal's categories, primary first.
 *
 * One RPC rather than a delete and an insert: the set is constrained both ways
 * — at least one, and `emergency` only alone — and from the client those two
 * calls are two transactions, the first of which commits an empty set. Returns
 * the error rather than throwing so a best-effort caller can log it.
 */
export async function setMealCategories(
  mealId: string,
  categories: MealCategory[],
): Promise<{ error: unknown }> {
  invalidateMealLibrary(); // D1: this write changes what a read would return
  const { error } = await supabase.rpc("set_meal_categories", {
    p_meal_id: mealId,
    p_categories: categories,
  });
  return { error };
}

/**
 * Retire a meal by hand, or hand it back to the automatic rule.
 *
 * Archiving was computed and only computed — complete portion, out of stock,
 * idle long enough — so a meal could neither be retired deliberately nor
 * brought back. Setting `archived_at` pins it; clearing it restores the
 * automatic verdict rather than forcing the meal to be current.
 */
export async function setMealArchived(mealId: string, archived: boolean): Promise<void> {
  invalidateMealLibrary(); // D1: this write changes what a read would return
  const { error } = await supabase
    .from("meals")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", mealId);
  if (error) throw error;
}

/**
 * Promote a repeatedly-logged ad-hoc entry into a real meal.
 *
 * A meal needs at least one ingredient, and a hand-typed log has none — so
 * when the logs don't already point at a saved food, one is created from the
 * numbers they agreed on. That food IS the meal's ingredient: the meal is
 * "the thing you keep typing", recorded once so it can be scored, favourited,
 * checked for stock and suggested like everything else.
 *
 * Category and source are the caller's decision, not a guess made here: the
 * screen asks, because "is this a lunch, and did you cook it or order it" is
 * exactly what the logs never recorded.
 */
export async function promoteAdHocMeal(
  userId: string,
  candidate: {
    name: string;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fats: number | null;
    sugars: number | null;
    sodium_mg: number | null;
    fiber_g: number | null;
    savedFoodId: string | null;
  },
  meta: {
    category: Meal["category"];
    source_kind: Meal["source_kind"];
    source_name: string | null;
  },
): Promise<string> {
  invalidateMealLibrary();
  let savedFoodId = candidate.savedFoodId;
  if (!savedFoodId) {
    const { data, error } = await supabase
      .from("saved_foods")
      .insert({
        user_id: userId,
        name: candidate.name.trim(),
        brand: null,
        barcode: null,
        calories: candidate.calories,
        protein: candidate.protein,
        carbs: candidate.carbs,
        fats: candidate.fats,
        sugars: candidate.sugars,
        sodium_mg: candidate.sodium_mg,
        fiber_g: candidate.fiber_g,
        is_favorite: false,
      })
      .select("id")
      .single();
    if (error) throw error;
    savedFoodId = data.id as string;
  }
  // Source travels with the input now that the edit page can set it, so it no
  // longer needs stamping in a second write after the meal exists.
  return createMeal(userId, {
    name: candidate.name.trim(),
    category: meta.category,
    role: null,
    default_meal_type: null,
    prep_minutes: 0,
    taste_override: null,
    source_kind: meta.source_kind,
    source_name: meta.source_name,
    is_complete_portion: false,
    image_primary_url: null,
    notes: null,
    items: [{ saved_food_id: savedFoodId, servings: 1, small_pieces_ok: false }],
  });
}

/**
 * Keep a spontaneously-logged thing for next time.
 *
 * The gym shake problem: something you buy on impulse is not an inventory
 * item, not a delivery, and was never a library meal — yet you will order it
 * again, and re-typing it each time leaves the library claiming you never eat
 * it. This is the log-time (and log-editing-time) door into the same promotion
 * machinery the library's own shelf uses; the only extra work is claiming
 * history.
 *
 * After the meal exists, every meal-less log wearing the same name — including
 * the one just written, and yesterday's — is linked to it, so "times eaten"
 * and "last eaten" are honest from the first day and the name stops haunting
 * the promotion shelf. The backfill is best-effort by design: the meal is the
 * deliverable, and a failed link leaves those logs exactly as promotable as
 * they were before.
 */
export async function saveLogAsMeal(
  userId: string,
  log: {
    name: string;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fats: number | null;
    sugars: number | null;
    sodium_mg: number | null;
    fiber_g: number | null;
    /** The product behind the log, when it came from one — the meal then
     *  references it instead of inventing a duplicate food. */
    saved_food_id: string | null;
  },
  meta: {
    category: Meal["category"];
    source_kind: Meal["source_kind"];
    source_name: string | null;
  },
): Promise<{ mealId: string; linkedLogs: number }> {
  const mealId = await promoteAdHocMeal(
    userId,
    { ...log, savedFoodId: log.saved_food_id },
    meta,
  );

  let linkedLogs = 0;
  try {
    // Ids come back filtered in code rather than by an ilike pattern: the fold
    // is the same one the promotion shelf groups by, and a name containing
    // `%` or `_` must not widen the match.
    const { data, error } = await supabase
      .from("meal_logs")
      .select("id, name")
      .is("meal_id", null);
    if (error) throw error;
    const ids = matchingLogIds(
      (data ?? []) as Array<{ id: string; name: string }>,
      log.name,
    );
    if (ids.length > 0) {
      const { error: linkError } = await supabase
        .from("meal_logs")
        .update({ meal_id: mealId })
        .in("id", ids);
      if (linkError) throw linkError;
      linkedLogs = ids.length;
    }
  } catch (e) {
    console.error("saveLogAsMeal: history backfill failed:", e);
  }

  // The linked logs change lastLoggedByMealId and timesLogged — drop the
  // cache promoteAdHocMeal already invalidated once more, after the writes.
  invalidateMealLibrary();
  return { mealId, linkedLogs };
}

/**
 * Star or unstar a meal.
 *
 * Its own call rather than a trip through `updateMeal`: that one replaces the
 * whole item list on every save, so using it to flip one boolean would delete
 * and reinsert every ingredient — two non-atomic writes, and a failed reinsert
 * would leave a favourite with no ingredients. This touches one column.
 */
export async function setMealFavorite(mealId: string, isFavorite: boolean): Promise<void> {
  invalidateMealLibrary(); // D1: this write changes what a read would return
  const { error } = await supabase
    .from("meals")
    .update({ is_favorite: isFavorite })
    .eq("id", mealId);
  if (error) throw error;
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
  const { items, categories, ...meal } = input;
  const { error } = await supabase
    .from("meals")
    .update({ ...meal, name: input.name.trim(), slug })
    .eq("id", mealId);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw duplicateMealNameError(input.name);
    throw error;
  }
  // Keeps the join table in step with the primary the update above wrote: an
  // edit that moves a meal from lunch to dinner must move its shelf too.
  const { error: catError } = await setMealCategories(
    mealId,
    normalizeCategories(input.category, categories),
  );
  if (catError) console.error("updateMeal: could not file categories:", catError);
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
    /**
     * How much of the meal was eaten. Scales the servings and macros written,
     * and NOTHING else: the stock decrement stays one unit per resolved row,
     * because half a smoothie still opens the whole container. Defaults to 1.
     */
    portion?: number;
    /**
     * When it was eaten. The quick-log sheet has always let you say so; the
     * meal page could not, so the two paths wrote different kinds of truth for
     * the same act. Defaults to now.
     */
    loggedAt?: Date;
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

  // `logged_at` is doing two jobs: it is when you ate, and it is the key undo
  // deletes this batch by. A time you PICKED has no seconds of its own, so two
  // logs of one meal at the same chosen minute would share a key and undo would
  // take both — the chosen minute is kept and the current seconds are borrowed
  // to tell them apart.
  const chosen = opts.loggedAt;
  const stamp = chosen ? new Date(chosen) : new Date();
  if (chosen) {
    const now = new Date();
    stamp.setSeconds(now.getSeconds(), now.getMilliseconds());
  }
  const loggedAt = stamp.toISOString();
  // Two meal items can resolve to the SAME inventory row (two saved foods
  // sharing one concept, one in-stock product). The consume call below
  // de-duplicates, so only ONE unit comes off that container — therefore only
  // the FIRST item claiming a given inventory id may record uses_inventory /
  // inventory_items. If both rows claimed {id: X, quantity: 1} the log would
  // assert two units were taken when one was, and any refund driven off those
  // rows would over-credit stock.
  const claimedInventoryIds = new Set<string>();
  const portion = opts.portion ?? 1;
  const rows = meal.items.map((it) => {
    const f = it.savedFood;
    const s = it.servings * portion;
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
  // A new link can be the one that lends a saved food its picture.
  invalidateBorrowedFoodImages();
  const { error } = await supabase.from("food_concept_links").insert({
    user_id: userId,
    concept_id: conceptId,
    saved_food_id: "savedFoodId" in target ? target.savedFoodId : null,
    food_inventory_id: "foodInventoryId" in target ? target.foodInventoryId : null,
    matched_by: "user",
  });
  if (error) throw error;
}

/**
 * C3/E2. Record the owner's actual opinion of a concept, and mark it as
 * theirs rather than ours. Both halves matter: without the timestamp the app
 * cannot tell an answer from the default it invented, and would keep asking.
 */
export async function confirmConceptRating(
  conceptId: string,
  rating: ConceptRating,
): Promise<void> {
  invalidateMealLibrary(); // taste feeds the score, which feeds every ranking
  const { error } = await supabase
    .from("food_concepts")
    .update({ rating, rating_confirmed_at: new Date().toISOString() })
    .eq("id", conceptId);
  if (error) throw error;
}

export async function deleteLink(linkId: string): Promise<void> {
  invalidateMealLibrary(); // D1: links change what every read means
  // Removing a link can take a borrowed picture away again.
  invalidateBorrowedFoodImages();
  const { error } = await supabase.from("food_concept_links").delete().eq("id", linkId);
  if (error) throw error;
}
