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

/** The slots a delivered meal can be filed under. `dessert` is deliberately
 *  absent — nobody subscribes to a dessert delivery service, and a shorter
 *  control is a faster one. */
export const DELIVERY_SLOTS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

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
