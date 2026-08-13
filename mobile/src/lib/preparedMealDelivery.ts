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
}

export interface DeliveryPayloadMeal {
  name: string;
  slot: MealType;
  quantity: number;
  calories: number | null;
  protein: number | null;
  fiber: number | null;
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
  drafts: readonly PreparedMealDraft[];
}): string | null {
  if (!opts.vendorId) return "Pick who delivered this.";
  if (!opts.useBy) return "Set the use-by date printed on the box.";

  const named = namedDrafts(opts.drafts);
  if (named.length === 0) return "Add at least one meal.";

  for (const d of named) {
    const qty = toNumber(d.quantity);
    if (qty === null || !Number.isInteger(qty) || qty < 1) {
      return `“${d.name.trim()}” needs a whole quantity of 1 or more.`;
    }
    for (const [label, raw] of [
      ["Calories", d.calories], ["Protein", d.protein], ["Fiber", d.fiber],
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
  }));
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
  };
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
