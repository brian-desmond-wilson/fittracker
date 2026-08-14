// What the Meal Library shows, and how it decides.
//
// The library used to be a picker: a flat list of meals with the numbers they
// were BUILT with. As a catalog it has to answer harder questions — can I eat
// this today, what would it actually cost me this week, when did I last have
// it, where did it come from — so this file is those answers, pure and
// testable, with the screen left to draw them.
//
// The deep change is nutrition. A meal's calories were fixed at build time,
// which is a lie the moment the peanut butter changes brand: the same PB&J is
// 480 cal with Skippy and 520 with Jif. Here every ingredient is priced from
// the inventory row CURRENTLY resolving it, so the numbers describe the meal
// you would actually make today — and when that differs from the product the
// meal was built with, the card says so rather than letting the figure drift
// silently between weeks.
import type { MealCategory, MealItemWithFood, MealWithItems } from "../types/meal-library";
import type { MacroTotals } from "./mealMacros";
import { EMPTY_TOTALS } from "./mealMacros";
import { resolveInventoryMatches } from "./inventoryResolution";
import type { MealAssemblability } from "./stockState";

// ---------------------------------------------------------------------------
// Source

export type MealSourceKind = "home" | "packaged" | "out";

export interface MealSource {
  kind: MealSourceKind;
  /** Venue or brand — "Thistle", "DoorDash · Chipotle". Null for home. */
  name: string | null;
}

/**
 * An `out` meal was never in the fridge, so availability is not a question it
 * can answer. Every availability rule below funnels through this.
 */
export function tracksAvailability(source: MealSource): boolean {
  return source.kind !== "out";
}

// ---------------------------------------------------------------------------
// Dynamic nutrition

/** The nutrition an inventory row carries, per serving of that product. */
export interface InventoryNutrition {
  id: string;
  name: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  saturated_fat_g: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
}

export interface Substitution {
  /** The ingredient slot, named as the meal names it. */
  itemName: string;
  /** What the meal was built with. */
  usualName: string;
  /** What is in the fridge instead. */
  actualName: string;
  /** Calories this swap adds (positive) or saves (negative), for the meal. */
  calorieDelta: number;
}

export interface MealNutrition {
  totals: MacroTotals;
  /** Ingredients priced from a DIFFERENT product than the meal was built
   *  with. Empty on the ordinary week. */
  substitutions: Substitution[];
  /** Ingredients priced from the as-built product because nothing in stock
   *  resolved them — the figure is a memory, not a measurement. */
  unresolvedCount: number;
}

const num = (v: number | null | undefined): number => Number(v ?? 0);

/**
 * Price a meal from what is actually in the fridge.
 *
 * Per ingredient: the inventory row resolving it wins; failing that, the saved
 * food the meal was built with. Servings scale whichever wins, so a meal
 * calling for two of something is still two of whatever answered.
 *
 * A substitution is reported only when the resolving row is a DIFFERENT
 * product from the built-with one — same product restocked is not news — and
 * only when it moves the calories, since a swap that changes nothing is not
 * worth a line of the reader's attention.
 */
export function mealNutrition(opts: {
  meal: MealWithItems;
  inventory: Array<{ id: string; barcode: string | null; totalQuantity: number; conceptIds: string[]; daysLeft?: number | null }>;
  conceptIdsBySavedFoodId: Map<string, string[]>;
  /** Macros of every inventory row, by row id. */
  nutritionByInventoryId: Map<string, InventoryNutrition>;
  /** Which inventory row each saved food resolves to. Passed in rather than
   *  recomputed so the card and the availability check can never disagree
   *  about what resolved to what. */
  matches?: Map<string, string>;
}): MealNutrition {
  const { meal, inventory, conceptIdsBySavedFoodId, nutritionByInventoryId } = opts;
  const matches =
    opts.matches ??
    resolveInventoryMatches(
      meal.items.map((it) => ({
        savedFoodId: it.saved_food_id,
        barcode: it.savedFood.barcode,
        conceptIds: conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
      })),
      inventory,
    );

  const totals: MacroTotals = { ...EMPTY_TOTALS };
  const substitutions: Substitution[] = [];
  let unresolvedCount = 0;

  for (const item of meal.items) {
    const servings = Number(item.servings ?? 1);
    const built = item.savedFood;
    const matchedId = matches.get(item.saved_food_id);
    const stocked = matchedId ? nutritionByInventoryId.get(matchedId) : undefined;

    // Per FIELD, not per product: an inventory row that records calories but
    // no fibre must not zero the meal's fibre. Unknown is not zero — the
    // as-built product's figure is the best estimate available, and using it
    // keeps the total honest instead of quietly deflating it. (Sodium used to
    // take this path for EVERY meal priced from stock, because
    // `food_inventory` had no sodium column; it has one now, along with
    // saturated fat, so a stocked product can answer for both.)
    type MacroField =
      | "calories" | "protein" | "carbs" | "fats" | "sugars"
      | "saturated_fat_g" | "sodium_mg" | "fiber_g";
    const pick = (key: MacroField) => {
      const fromStock = stocked?.[key];
      if (fromStock !== null && fromStock !== undefined) return Number(fromStock);
      const asBuilt = (built as Partial<Record<MacroField, number | null>>)[key];
      return num(asBuilt);
    };
    totals.calories += pick("calories") * servings;
    totals.protein += pick("protein") * servings;
    totals.carbs += pick("carbs") * servings;
    totals.fats += pick("fats") * servings;
    totals.sugars += pick("sugars") * servings;
    totals.saturated_fat_g += pick("saturated_fat_g") * servings;
    totals.sodium_mg += pick("sodium_mg") * servings;
    totals.fiber_g += pick("fiber_g") * servings;

    if (!stocked) {
      unresolvedCount += 1;
      continue;
    }
    // Same name = the same product restocked, which is not a substitution.
    if (stocked.name.trim().toLowerCase() === built.name.trim().toLowerCase()) continue;
    const delta = Math.round((num(stocked.calories) - num(built.calories)) * servings);
    if (delta === 0) continue;
    substitutions.push({
      itemName: built.name,
      usualName: built.name,
      actualName: stocked.name,
      calorieDelta: delta,
    });
  }

  // Round at the boundary, so the card and anything summing cards agree.
  totals.calories = Math.round(totals.calories);
  for (const k of ["protein", "carbs", "fats", "sugars", "saturated_fat_g", "fiber_g"] as const) {
    totals[k] = Math.round(totals[k] * 10) / 10;
  }
  totals.sodium_mg = Math.round(totals.sodium_mg);

  return { totals, substitutions, unresolvedCount };
}

/** The card's one-line confession about this week's ingredients. */
export function substitutionLine(n: MealNutrition): string | null {
  if (n.substitutions.length === 0) return null;
  const [first] = n.substitutions;
  const delta = n.substitutions.reduce((s, x) => s + x.calorieDelta, 0);
  const sign = delta > 0 ? `+${delta}` : `${delta}`;
  const rest = n.substitutions.length - 1;
  const who = rest > 0 ? `${first.actualName} and ${rest} other${rest === 1 ? "" : "s"}` : first.actualName;
  return `made with ${who} this week · ${sign} cal vs usual`;
}

// ---------------------------------------------------------------------------
// Ingredients, one row at a time

/**
 * What an ingredient row says about itself.
 *
 * `assessAssemblability` answers the meal's question — can I make this — and
 * reports the two failure buckets as flat lists of NAMES. A row has to say
 * which of them IT is, and a row that is fine still has something to say when
 * the thing resolving it is about to turn. Same predicates, per item, so a row
 * can never contradict the verdict above it.
 */
export type IngredientStateKind = "in_stock" | "expiring" | "missing" | "unlinked";

/** The columns a row needs to be resolved and dated. Structural rather than
 *  the imported `AssemblabilityInventoryRow`, so the same call works from the
 *  library's projection and from anything else carrying these fields. */
export interface IngredientInventoryRow {
  id: string;
  name: string;
  barcode: string | null;
  totalQuantity: number;
  conceptIds: string[];
  daysLeft: number | null;
}

export interface IngredientState {
  kind: IngredientStateKind;
  /** The inventory row currently resolving this ingredient, when one does. */
  inventoryId: string | null;
  /** Days until that row turns — only meaningful for `expiring`. */
  daysLeft: number | null;
}

export interface MealIngredient {
  item: MealItemWithFood;
  state: IngredientState;
}

/** Within how many days an ingredient is worth calling out on its own row.
 *  The rescue horizon the shelves use, not `EXPIRING_SOON_DAYS` (7): a row
 *  that says "7d left" on half a fridge is noise. */
export const INGREDIENT_EXPIRING_DAYS = 3;

export function mealIngredients(opts: {
  /** The meal's items — not the meal, so the builder can ask the same question
   *  of a list it is still assembling. */
  items: readonly MealItemWithFood[];
  inventory: IngredientInventoryRow[];
  conceptIdsBySavedFoodId: Map<string, string[]>;
}): MealIngredient[] {
  const resolverItems = opts.items.map((it) => ({
    savedFoodId: it.saved_food_id,
    barcode: it.savedFood.barcode,
    conceptIds: opts.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
  }));
  const matches = resolveInventoryMatches(resolverItems, opts.inventory);
  const byId = new Map(opts.inventory.map((r) => [r.id, r]));

  return opts.items.map((item, idx) => {
    const invId = matches.get(item.saved_food_id) ?? null;
    if (invId === null) {
      // Same test `assessAssemblability` uses: an ingredient with neither a
      // barcode nor a concept link could not have matched ANY row, so failing
      // says something about our records rather than about the kitchen. The
      // falsy barcode check mirrors the resolver's, which reads "" as none.
      const r = resolverItems[idx];
      const uncheckable = !r.barcode && r.conceptIds.length === 0;
      return { item, state: { kind: uncheckable ? "unlinked" : "missing", inventoryId: null, daysLeft: null } };
    }
    const daysLeft = byId.get(invId)?.daysLeft ?? null;
    // Bounded below at 0 exactly as the meal-level signal is: an already-
    // expired row is a throw-out, not a rescue, and cannot share the copy.
    const expiring = daysLeft !== null && daysLeft >= 0 && daysLeft <= INGREDIENT_EXPIRING_DAYS;
    return {
      item,
      state: { kind: expiring ? "expiring" : "in_stock", inventoryId: invId, daysLeft },
    };
  });
}

// ---------------------------------------------------------------------------
// The card

export type MealAvailability = "available" | "unavailable" | "not_tracked";

export interface MealCard {
  meal: MealWithItems;
  /** The primary category — the one the default logging slot reads. */
  category: MealCategory;
  /** Every category the meal is filed under. It appears on each one's shelf,
   *  and the recommender considers it in each one's window. */
  categories: MealCategory[];
  source: MealSource;
  isFavorite: boolean;
  availability: MealAvailability;
  /** Ingredients checked for and not found — real groceries. */
  missing: string[];
  /** Ingredients that cannot be checked at all (no barcode, no concept). */
  unlinked: string[];
  nutrition: MealNutrition;
  /** Brian score, 0–100. */
  score: number;
  prepMinutes: number;
  faceUrl: string | null;
  /** Times logged, ever, and the local date of the last one. */
  timesLogged: number;
  lastLoggedDate: string | null;
  /** Days until the soonest-expiring ingredient this meal would use up. */
  rescueDaysLeft: number | null;
  /** Retired: complete portion, out of stock, idle long enough. */
  isArchived: boolean;
}

/**
 * Availability, which is three states rather than two.
 *
 * `not_tracked` is the honest answer for a restaurant meal: not available,
 * not unavailable — the question does not apply. Collapsing it into either
 * would either hide the meal from a browse it belongs in or promise stock
 * that was never there.
 */
export function mealAvailability(opts: {
  source: MealSource;
  assemblability: MealAssemblability | undefined;
  hasItems: boolean;
}): MealAvailability {
  if (!tracksAvailability(opts.source)) return "not_tracked";
  // An item-less meal cannot be assembled from anything; `assessAssemblability`
  // reports the same, and a missing entry means the caller could not assess it.
  if (!opts.hasItems || !opts.assemblability) return "unavailable";
  return opts.assemblability.assemblable ? "available" : "unavailable";
}

// ---------------------------------------------------------------------------
// Segments, categories, search, sort

export type LibrarySegment = "available" | "all" | "archive";
export type LibrarySort = "score" | "most_eaten" | "recent" | "protein" | "name";

export const SORT_LABELS: Record<LibrarySort, string> = {
  score: "Best score",
  most_eaten: "Most eaten",
  recent: "Recently eaten",
  protein: "Most protein",
  name: "Name",
};

/**
 * The Available segment shows what you could eat right now — which includes
 * restaurant meals, because "I could order that" is a real answer to "what
 * can I eat", and excludes archived ones whatever their stock says.
 */
export function inSegment(card: MealCard, segment: LibrarySegment): boolean {
  if (segment === "archive") return card.isArchived;
  if (card.isArchived) return false;
  if (segment === "all") return true;
  return card.availability !== "unavailable";
}

/** All words must appear, case-insensitively, in the name or the source —
 *  so "thistle pasta" finds the Thistle Pasta Trapanese. */
export function matchesLibraryQuery(card: MealCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const hay = `${card.meal.name} ${card.source.name ?? ""}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/**
 * A search asks the whole library, and every filter stands aside while it does
 * — including the archive, which is still your library and is where a meal you
 * half-remember is most likely to have gone.
 *
 * Stacking the query on top of the filters was the obvious reading and the
 * wrong one: a search from the Available segment could only ever find the six
 * meals already on screen, so the one question you type a name to ask — "do I
 * have this at all?" — was the one it could not answer. The filters are not
 * cleared, only ignored; they come back intact the moment the field does.
 */
export function filterLibrary(opts: {
  cards: MealCard[];
  segment: LibrarySegment;
  category: MealCategory | null;
  favoritesOnly: boolean;
  query: string;
}): MealCard[] {
  if (opts.query.trim() !== "") {
    return opts.cards.filter((c) => matchesLibraryQuery(c, opts.query));
  }
  return opts.cards.filter((c) => {
    if (!inSegment(c, opts.segment)) return false;
    if (opts.category && !c.categories.includes(opts.category)) return false;
    if (opts.favoritesOnly && !c.isFavorite) return false;
    return true;
  });
}

export function sortLibrary(cards: MealCard[], sort: LibrarySort): MealCard[] {
  const byName = (a: MealCard, b: MealCard) => a.meal.name.localeCompare(b.meal.name);
  const copy = [...cards];
  switch (sort) {
    case "score":
      return copy.sort((a, b) => b.score - a.score || byName(a, b));
    case "most_eaten":
      return copy.sort((a, b) => b.timesLogged - a.timesLogged || byName(a, b));
    case "recent":
      // Never-eaten sorts last rather than first: an absent date is not a
      // very old one.
      return copy.sort((a, b) => {
        const at = a.lastLoggedDate ?? "";
        const bt = b.lastLoggedDate ?? "";
        if (at === bt) return byName(a, b);
        if (at === "") return 1;
        if (bt === "") return -1;
        return bt.localeCompare(at);
      });
    case "protein":
      return copy.sort((a, b) => b.nutrition.totals.protein - a.nutrition.totals.protein || byName(a, b));
    case "name":
      return copy.sort(byName);
  }
}

// ---------------------------------------------------------------------------
// Counts

export interface LibraryCounts {
  available: number;
  all: number;
  archive: number;
  byCategory: Map<MealCategory, number>;
}

/** Counts are over the whole library, never the current filter — their job is
 *  to tell you what the filter is HIDING. `byCategory` counts a meal once per
 *  category it holds, so its values sum to more than `all`. */
export function libraryCounts(cards: MealCard[]): LibraryCounts {
  const byCategory = new Map<MealCategory, number>();
  let available = 0;
  let all = 0;
  let archive = 0;
  for (const c of cards) {
    if (c.isArchived) {
      archive += 1;
      continue;
    }
    all += 1;
    if (c.availability !== "unavailable") available += 1;
    // Counted once per category it holds, so a breakfast-and-snack meal is in
    // both tallies and the tabs no longer sum to `all`. Deliberate: a tab
    // reads as "meals filed here", and a shelf that under-reports its own
    // contents is worse than arithmetic that doesn't close.
    for (const category of c.categories) {
      byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    }
  }
  return { available, all, archive, byCategory };
}

/**
 * Per-category counts for ONE segment.
 *
 * The tabs sit directly beneath the segment control and describe what it is
 * showing, so they have to count the same set it does. `libraryCounts`
 * tallies categories over the live library only, which under Archive put
 * "All Meals 0" on the same row as "Emergency Calories 1" — a live meal
 * counted into an empty archive.
 *
 * Same double-counting rule as `libraryCounts`: a meal filed under two
 * categories is in both tallies, so these do not sum to the segment total.
 */
export function categoryCountsFor(
  cards: MealCard[],
  segment: LibrarySegment,
): Map<MealCategory, number> {
  const counts = new Map<MealCategory, number>();
  for (const card of cards) {
    if (!inSegment(card, segment)) continue;
    for (const category of card.categories) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Shelves (the Available posture)

export type ShelfKind = "favorites" | "use_it_up" | "category";

export interface Shelf {
  kind: ShelfKind;
  key: string;
  title: string;
  cards: MealCard[];
}

/** Within how many days an ingredient counts as worth using up. */
export const USE_IT_UP_DAYS = 3;

/**
 * The browse view: favourites, then the food that needs eating, then the
 * categories.
 *
 * A meal may appear on more than one shelf — a favourite that also rescues
 * something expiring belongs to both, and hiding it from either would make
 * that shelf lie about being complete. Categories, by contrast, are its home:
 * every meal appears in exactly one.
 */
export function buildShelves(cards: MealCard[], categoryOrder: MealCategory[], labels: Record<MealCategory, string>): Shelf[] {
  const byScore = (a: MealCard, b: MealCard) => b.score - a.score || a.meal.name.localeCompare(b.meal.name);
  const shelves: Shelf[] = [];

  const favorites = cards.filter((c) => c.isFavorite).sort(byScore);
  if (favorites.length > 0) {
    shelves.push({ kind: "favorites", key: "favorites", title: "Favorites", cards: favorites });
  }

  const useItUp = cards
    .filter((c) => c.rescueDaysLeft !== null && c.rescueDaysLeft <= USE_IT_UP_DAYS)
    // Most urgent first here, not best score: the whole shelf is about time.
    .sort((a, b) => (a.rescueDaysLeft ?? 0) - (b.rescueDaysLeft ?? 0) || byScore(a, b));
  if (useItUp.length > 0) {
    shelves.push({ kind: "use_it_up", key: "use_it_up", title: "Use it up", cards: useItUp });
  }

  // A meal appears on the shelf of EVERY category it holds — the same way a
  // favourite that also rescues something expiring is on both shelves above.
  // Categories stopped being a meal's single home when they went plural.
  for (const category of categoryOrder) {
    const inCat = cards.filter((c) => c.categories.includes(category)).sort(byScore);
    if (inCat.length === 0) continue;
    shelves.push({ kind: "category", key: category, title: labels[category], cards: inCat });
  }
  return shelves;
}

// ---------------------------------------------------------------------------
// Empty states

/**
 * What to say when the filter has emptied the screen — never a bare "nothing
 * here", because Available-by-default can legitimately hide a full library and
 * that reads as a broken page.
 */
export function libraryEmptyMessage(opts: {
  segment: LibrarySegment;
  counts: LibraryCounts;
  query: string;
  favoritesOnly: boolean;
  category: MealCategory | null;
}): { title: string; body: string } {
  const { segment, counts, query } = opts;
  if (query.trim() !== "") {
    return { title: `Nothing matches "${query.trim()}"`, body: "Try fewer words, or add it as a new meal." };
  }
  if (opts.favoritesOnly) {
    return { title: "No favorites yet", body: "Tap the star on a meal to keep it here." };
  }
  if (segment === "archive") {
    return { title: "Nothing archived", body: "Meals retire here when they've been out of stock for a while." };
  }
  if (segment === "available") {
    return counts.all > 0
      ? {
          title: "Nothing's makeable right now",
          body: `All ${counts.all} of your meals are missing something. Switch to All to see them.`,
        }
      : { title: "No meals yet", body: "Add your first meal with the + button." };
  }
  if (opts.category) {
    return { title: "Nothing in this category", body: "Try another category, or add a meal here." };
  }
  return { title: "No meals yet", body: "Add your first meal with the + button." };
}
