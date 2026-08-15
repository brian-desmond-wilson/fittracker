// The draft side of a delivery, before any of it is written.
//
// A Thistle box is eight meals that arrive together, share a use-by date and
// a vendor, and differ only in a name, a slot and three numbers off the lid.
// Modelling that as eight independent trips through the full item form is
// what made entering them untenable; this module holds the shape the entry
// screen edits and the payload the write function sends, so both can be
// tested without a database or a React tree.
//
// Numbers are strings here on purpose: these are text inputs mid-typing,
// where "" and "6" and "6." are all legitimate states. They become numbers
// exactly once, in `toDeliveryPayload`.
import type { MealType } from "@/src/types/track";

/** The slots a delivered meal can be filed under — every slot the app has.
 *  `dessert` was left out on the theory that nobody subscribes to a dessert
 *  service; boxes arrive with a brownie in them anyway, and filing one as a
 *  snack loses the distinction the rest of the app draws. */
export const DELIVERY_SLOTS: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];

export interface PreparedMealDraft {
  /** Local-only key for the list; never written. */
  key: string;
  name: string;
  slot: MealType;
  quantity: string;
  calories: string;
  protein: string;
  fiber: string;
  /** Grams, as printed on the lid. */
  saturatedFat: string;
  /** Milligrams — the one figure on a delivery row that is not grams. */
  sodium: string;
  /** The dish's picture, already at a URL the app owns — history, an upload,
   *  or a picked search result. Not a text input: this one is null or done. */
  imageUrl: string | null;
}

export interface DeliveryPayloadMeal {
  name: string;
  slot: MealType;
  quantity: number;
  calories: number | null;
  protein: number | null;
  fiber: number | null;
  saturated_fat: number | null;
  sodium: number | null;
  /** `v_meal->>'image_url'` in the writer — lands on the inventory row and
   *  the saved food as their primary picture. */
  image_url: string | null;
}

let draftSeq = 0;

/** A blank row. Quantity starts at 1 because a delivery of nothing is not a
 *  thing, and slot at lunch because that is the commonest case. */
export function emptyDraft(slot: MealType = "lunch"): PreparedMealDraft {
  draftSeq += 1;
  return {
    key: `draft-${draftSeq}`,
    name: "",
    slot,
    quantity: "1",
    calories: "",
    protein: "",
    fiber: "",
    saturatedFat: "",
    sodium: "",
    imageUrl: null,
  };
}

/** Rows that carry a name. A blank row is not an error — it is the empty row
 *  at the bottom of the list waiting to be filled — so it is dropped rather
 *  than complained about. */
export function namedDrafts(drafts: readonly PreparedMealDraft[]): PreparedMealDraft[] {
  return drafts.filter((d) => d.name.trim() !== "");
}

const toNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * The first thing wrong with this delivery, in the words the screen shows,
 * or null when it is ready to save. One message at a time: the form is a
 * single scrolling list and a wall of errors would obscure which row to fix.
 */
export function validateDelivery(opts: {
  vendorId: string | null;
  useBy: string | null;
  /** Local YYYY-MM-DD of the arrival. Optional so callers that predate
   *  scheduling still typecheck; absent skips the ordering check. */
  arrivesOn?: string | null;
  drafts: readonly PreparedMealDraft[];
}): string | null {
  if (!opts.vendorId) return "Pick who delivered this.";
  if (!opts.useBy) return "Set the use-by date printed on the box.";
  // Food that expires before it turns up is a typo, always — most often a
  // use-by left at today's default while the arrival was moved out a week.
  // Same-day is fine: a box that arrives and must be eaten today is a real
  // and unhappy thing, not a mistake.
  if (opts.arrivesOn && opts.arrivesOn > opts.useBy) {
    return "This box arrives after its use-by date. Check both dates.";
  }

  const named = namedDrafts(opts.drafts);
  if (named.length === 0) return "Add at least one meal.";

  for (const d of named) {
    const qty = toNumber(d.quantity);
    if (qty === null || !Number.isInteger(qty) || qty < 1) {
      return `“${d.name.trim()}” needs a whole quantity of 1 or more.`;
    }
    for (const [label, raw] of [
      ["Calories", d.calories], ["Protein", d.protein], ["Fiber", d.fiber],
      ["Saturated fat", d.saturatedFat], ["Sodium", d.sodium],
    ] as const) {
      if (raw.trim() !== "" && toNumber(raw) === null) {
        return `${label} on “${d.name.trim()}” must be a number of 0 or more.`;
      }
    }
  }

  // Two rows for the same dish in one box would produce two inventory rows
  // with an identical name and date — indistinguishable in the grid, and a
  // coin flip for which one a meal log decrements. Merging them silently
  // would be worse: the owner meant something by typing it twice.
  const seen = new Set<string>();
  for (const d of named) {
    const folded = d.name.trim().toLowerCase();
    if (seen.has(folded)) return `“${d.name.trim()}” is listed twice — combine them into one row.`;
    seen.add(folded);
  }

  return null;
}

/** The array the write function hands to the database. Blank numbers stay
 *  null: a meal whose fiber you did not type has unknown fiber, not zero. */
export function toDeliveryPayload(
  drafts: readonly PreparedMealDraft[],
): DeliveryPayloadMeal[] {
  return namedDrafts(drafts).map((d) => ({
    name: d.name.trim(),
    slot: d.slot,
    quantity: toNumber(d.quantity) ?? 1,
    calories: toNumber(d.calories),
    protein: toNumber(d.protein),
    fiber: toNumber(d.fiber),
    saturated_fat: toNumber(d.saturatedFat),
    sodium: toNumber(d.sodium),
    image_url: d.imageUrl,
  }));
}

// ---------------------------------------------------------------------------
// A box that has not arrived yet
// ---------------------------------------------------------------------------
//
// Between saving a delivery and its arrival, the whole box lives as one jsonb
// column. These read that column back — for the card that lists what is coming,
// and for the form that reopens it.
//
// `meals` is jsonb with no shape constraint, so everything here treats its
// contents as untrusted: the column holds whatever some earlier version of the
// app wrote, and the result renders a screen.

/** One dish inside a box on the way. The three things the card prints. */
export interface PendingDish {
  name: string;
  slot: MealType;
  quantity: number;
}

const SLOT_SET = new Set<string>(DELIVERY_SLOTS);

/** A stored quantity, read the way the writer reads it. Must match
 *  `greatest(1, coalesce((m->>'quantity')::integer, 1))` in 20260814180000, or
 *  a box says "7 meals" while it waits and "6" once it lands. */
const storedQuantity = (raw: unknown): number => {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

/**
 * The dishes in a stored payload, in the order the box was saved in.
 *
 * Blank rows are dropped for the same reason `namedDrafts` drops them: the
 * form always carries one empty row at the bottom, and it gets written.
 */
export function pendingDishes(raw: unknown): PendingDish[] {
  if (!Array.isArray(raw)) return [];
  const dishes: PendingDish[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (name === "") continue;
    const slot = typeof row.slot === "string" && SLOT_SET.has(row.slot)
      ? (row.slot as MealType)
      : "lunch";
    dishes.push({ name, slot, quantity: storedQuantity(row.quantity) });
  }
  return dishes;
}

/** MEALS, not dishes: two of one dish is two meals, which is what the person
 *  unpacking the box counts. */
export function mealsInDishes(dishes: readonly PendingDish[]): number {
  return dishes.reduce((sum, d) => sum + d.quantity, 0);
}

/** A dish with whatever picture the app can find of it. */
export interface PendingDishWithPhoto extends PendingDish {
  imageUrl: string | null;
}

/**
 * Give each dish in a waiting box the photo from the last time that dish was
 * delivered.
 *
 * A pending delivery is a payload, not stock: it carries names and numbers and
 * has never had a picture. But a subscription rotates a fixed menu, so most of
 * what is coming has been here before and left an inventory row behind with a
 * photo on it — the delivery history view surfaces the newest one per dish.
 * Nothing is copied or written; the card simply borrows the URL.
 *
 * Matched on the same name fold the database uses, and scoped to ONE VENDOR.
 * Two subscriptions both send a "Chicken Salad" and they are not the same food:
 * a wrong photo is worse than no photo, because a photo is a claim about what
 * is in the box.
 */
export function withDishPhotos(
  dishes: readonly PendingDish[],
  vendorId: string,
  history: readonly RecentDish[],
): PendingDishWithPhoto[] {
  const photos = new Map<string, string>();
  for (const seen of history) {
    if (seen.vendorId !== vendorId || !seen.imageUrl) continue;
    // The view's own slug when it has one, the client's fold when it does not —
    // the same precedence `addRecent` uses.
    const slug = seen.slug || dishSlug(seen.name);
    if (slug === "" || photos.has(slug)) continue;
    photos.set(slug, seen.imageUrl);
  }
  return dishes.map((d) => ({ ...d, imageUrl: photos.get(dishSlug(d.name)) ?? null }));
}

/**
 * Through the day — breakfast, lunch, dinner, snack, dessert — rather than by
 * name, so a box reads as a menu for the week, which is how its owner thinks
 * about it.
 *
 * Stable within a slot: the dishes were typed off a packing slip in an order,
 * and re-sorting inside a slot discards that for nothing. `DELIVERY_SLOTS` is
 * already in day order, so it is the ranking rather than a second copy of it.
 */
export function sortDishesForMenu<T extends { slot: MealType }>(dishes: readonly T[]): T[] {
  return dishes
    .map((dish, index) => ({ dish, index }))
    .sort((a, b) => {
      const rank = DELIVERY_SLOTS.indexOf(a.dish.slot) - DELIVERY_SLOTS.indexOf(b.dish.slot);
      return rank !== 0 ? rank : a.index - b.index;
    })
    .map((entry) => entry.dish);
}

/**
 * A saved payload, back in the form that wrote it.
 *
 * The inverse of `toDeliveryPayload`, and the pair has to stay exact: what an
 * edit saves is what it opened, minus the edits, so any drift here silently
 * rewrites macros nobody touched. Note the three keys that change spelling —
 * `saturated_fat`/`sodium`/`fiber` are the DATABASE's names, and getting the
 * mapping backwards fails quietly, as a row that opens with empty fields.
 */
export function draftsFromPayload(
  meals: readonly DeliveryPayloadMeal[],
): PreparedMealDraft[] {
  const num = (n: number | null | undefined) => (n == null ? "" : String(n));
  const drafts = meals
    .filter((m) => (m?.name ?? "").trim() !== "")
    .map((m) => ({
      ...emptyDraft(m.slot && SLOT_SET.has(m.slot) ? m.slot : "lunch"),
      name: m.name.trim(),
      quantity: String(storedQuantity(m.quantity)),
      calories: num(m.calories),
      protein: num(m.protein),
      fiber: num(m.fiber),
      saturatedFat: num(m.saturated_fat),
      sodium: num(m.sodium),
      imageUrl: typeof m.image_url === "string" && m.image_url !== "" ? m.image_url : null,
    }));
  // Never an empty list, for the reason the screen's own remove button holds
  // the same invariant: a form with no row has nothing to type into.
  return drafts.length > 0 ? drafts : [emptyDraft()];
}

// ---------------------------------------------------------------------------
// What the last delivery knew
// ---------------------------------------------------------------------------
//
// A subscription rotates a fixed menu, so most of a box is dishes that have
// arrived before. These turn that history into two affordances: vendors
// ordered by how much they are actually used, and a list of repeat dishes
// with a stepper each.
//
// A stepper is not a second kind of meal. It creates and edits an ordinary
// draft row, so validation and the save payload never learn it exists.

/** The name fold the database uses (`prepared_meal_slug`): lowered, every run
 *  of non-alphanumerics collapsed to one dash, dashes trimmed. Both sides must
 *  agree on when two spellings are the same dish. */
export function dishSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A dish this vendor has delivered before, with its macros as most recently
 *  printed. Nulls are real: a dish whose fiber was never typed still has
 *  unknown fiber. */
export interface RecentDish {
  vendorId: string;
  slug: string;
  name: string;
  slot: MealType;
  calories: number | null;
  protein: number | null;
  fiber: number | null;
  saturatedFat: number | null;
  sodium: number | null;
  /** The photo carried by the inventory row this dish last became. Null is the
   *  ordinary case for a dish nobody has photographed. */
  imageUrl: string | null;
  /** Local YYYY-MM-DD of the last delivery that contained it. */
  lastDeliveredOn: string;
}

/** How much a vendor is used, for ordering the tiles. */
export interface VendorUse {
  vendorId: string;
  deliveryCount: number;
  lastDeliveredOn: string;
}

/**
 * Vendors most-used first, ties broken by whoever delivered most recently.
 * Vendors never ordered from keep their configured order behind the ranked
 * ones — an unused vendor has no claim on the first tile, but it has not
 * earned last place either.
 */
export function orderVendorsByUse<T extends { id: string }>(
  vendors: readonly T[],
  use: readonly VendorUse[],
): T[] {
  const byId = new Map(use.map((u) => [u.vendorId, u]));
  return vendors
    .map((v, index) => ({ v, index, use: byId.get(v.id) }))
    .sort((a, b) => {
      if (!a.use && !b.use) return a.index - b.index;
      if (!a.use) return 1;
      if (!b.use) return -1;
      if (a.use.deliveryCount !== b.use.deliveryCount) {
        return b.use.deliveryCount - a.use.deliveryCount;
      }
      if (a.use.lastDeliveredOn !== b.use.lastDeliveredOn) {
        return a.use.lastDeliveredOn < b.use.lastDeliveredOn ? 1 : -1;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.v);
}

/** A row prefilled from a dish that has come before. Blank where the history
 *  is blank — a macro nobody ever typed is not zero. */
export function draftFromRecent(dish: RecentDish): PreparedMealDraft {
  const num = (n: number | null) => (n == null ? "" : String(n));
  return {
    ...emptyDraft(dish.slot),
    name: dish.name,
    quantity: "1",
    calories: num(dish.calories),
    protein: num(dish.protein),
    fiber: num(dish.fiber),
    saturatedFat: num(dish.saturatedFat),
    sodium: num(dish.sodium),
    // The photo from the last time this dish was delivered. Free recognition:
    // a repeat order never needs the search.
    imageUrl: dish.imageUrl,
  };
}

/**
 * The dishes a fresh menu scan should search the web for: named, but with no
 * picture from history. Keyed back by draft key so the screen can file each
 * result set against the row it belongs to.
 */
export function dishesNeedingImages(
  drafts: readonly PreparedMealDraft[],
): Array<{ key: string; name: string }> {
  return namedDrafts(drafts)
    .filter((d) => d.imageUrl == null)
    .map((d) => ({ key: d.key, name: d.name.trim() }));
}

/**
 * Drafts with history's photo filled in wherever a draft has none — what a
 * menu scan runs right after replacing the rows, so a repeat dish shows its
 * picture before any search is needed.
 *
 * Same one-vendor scoping as `withDishPhotos`, and for the same reason: two
 * subscriptions can both sell a "Chicken Salad", and a wrong photo is worse
 * than none because a photo is a claim about what is in the box.
 */
export function withDraftPhotos(
  drafts: readonly PreparedMealDraft[],
  vendorId: string,
  history: readonly RecentDish[],
): PreparedMealDraft[] {
  const photos = new Map<string, string>();
  for (const seen of history) {
    if (seen.vendorId !== vendorId || !seen.imageUrl) continue;
    const slug = seen.slug || dishSlug(seen.name);
    if (slug === "" || photos.has(slug)) continue;
    photos.set(slug, seen.imageUrl);
  }
  return drafts.map((d) =>
    d.imageUrl == null
      ? { ...d, imageUrl: photos.get(dishSlug(d.name)) ?? null }
      : d,
  );
}

/**
 * How many of each dish the drafts currently hold, keyed by folded name — the
 * number each stepper shows. Reading it off the rows rather than tracking it
 * separately is what keeps a stepper honest when its row's Qty field is edited
 * by hand.
 */
export function recentCounts(drafts: readonly PreparedMealDraft[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of drafts) {
    const slug = dishSlug(d.name);
    if (slug === "") continue;
    counts[slug] = (counts[slug] ?? 0) + (toNumber(d.quantity) ?? 0);
  }
  return counts;
}

/**
 * One more of this dish. An existing row for it — however it was created —
 * gains a unit; otherwise the dish fills the first blank row, or is appended
 * when there is none.
 *
 * Filling the blank row matters on the first tap of a fresh screen, which
 * always has exactly one empty row waiting. Appending instead would leave it
 * stranded above the meal just added.
 */
export function addRecent(
  drafts: readonly PreparedMealDraft[],
  dish: RecentDish,
): PreparedMealDraft[] {
  const slug = dish.slug || dishSlug(dish.name);
  const existing = drafts.find((d) => dishSlug(d.name) === slug);
  if (existing) {
    return drafts.map((d) =>
      d.key === existing.key
        ? { ...d, quantity: String(Math.max(0, toNumber(d.quantity) ?? 0) + 1) }
        : d,
    );
  }
  const blank = drafts.find((d) => d.name.trim() === "");
  const fresh = draftFromRecent(dish);
  if (blank) {
    return drafts.map((d) => (d.key === blank.key ? { ...fresh, key: d.key } : d));
  }
  return [...drafts, fresh];
}

/**
 * One fewer. The last one takes the row with it, because a row for a dish you
 * decided against is a row you would have to delete by hand.
 *
 * Never returns an empty list: an empty list has nothing to type into, and the
 * screen's own remove button holds the same invariant.
 */
export function removeRecent(
  drafts: readonly PreparedMealDraft[],
  dish: RecentDish,
): PreparedMealDraft[] {
  const slug = dish.slug || dishSlug(dish.name);
  const existing = drafts.find((d) => dishSlug(d.name) === slug);
  if (!existing) return [...drafts];

  const quantity = toNumber(existing.quantity) ?? 0;
  if (quantity > 1) {
    return drafts.map((d) =>
      d.key === existing.key ? { ...d, quantity: String(quantity - 1) } : d,
    );
  }
  const next = drafts.filter((d) => d.key !== existing.key);
  return next.length > 0 ? next : [emptyDraft()];
}

/** Local YYYY-MM-DD `days` after `todayLocalDate`. Same local-calendar walk
 *  `runOutDate` uses, so a use-by date lands on the day the box says rather
 *  than one either side of it. */
export function addLocalDays(todayLocalDate: string, days: number): string {
  const [y, m, d] = todayLocalDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Prepared food keeps about five days — the same figure the shelf-life hint
 *  quotes for the Deli & Prepared Foods category. Only a starting guess; the
 *  date printed on the box wins and the screen lets it be changed. */
export const TYPICAL_PREPARED_MEAL_DAYS = 5;

/** "8 meals · 3,240 kcal" — what the save button is about to write. */
export function deliverySummary(drafts: readonly PreparedMealDraft[]): string {
  const named = namedDrafts(drafts);
  const meals = named.reduce((sum, d) => sum + (toNumber(d.quantity) ?? 1), 0);
  const calories = named.reduce(
    (sum, d) => sum + (toNumber(d.calories) ?? 0) * (toNumber(d.quantity) ?? 1),
    0,
  );
  const mealText = `${meals} ${meals === 1 ? "meal" : "meals"}`;
  return calories > 0
    ? `${mealText} · ${Math.round(calories).toLocaleString()} kcal`
    : mealText;
}
