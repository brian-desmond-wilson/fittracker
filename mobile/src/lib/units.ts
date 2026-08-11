// The ONE quantity display rule (critique C4 + A11). The DB's `unit` column
// is free text ("count", "servings", legacy oddities), and every surface
// previously interpolated it raw — "Qty: 2 count" / "Qty: 10 servings" on
// the same screen. Normalize once, format once, and every surface that
// shows a quantity consumes this instead of the raw column.
export type UnitKind = "count" | "servings" | "oz" | "g" | "lb" | "ml" | "l";

const KNOWN: Record<string, UnitKind> = {
  count: "count",
  servings: "servings",
  serving: "servings",
  oz: "oz",
  g: "g",
  lb: "lb",
  ml: "ml",
  l: "l",
};

/** Unknown, empty, and null all collapse to `count` — the honest default for
 *  "discrete things we track by the piece". */
export function normalizeUnit(raw: string | null | undefined): UnitKind {
  return KNOWN[(raw ?? "").trim().toLowerCase()] ?? "count";
}

export function formatQuantity(qty: number, rawUnit: string | null | undefined): string {
  if (qty === 0) return "Out of stock";
  const kind = normalizeUnit(rawUnit);
  switch (kind) {
    case "count":
      return `${qty} in stock`;
    case "servings":
      return `${qty} serving${qty === 1 ? "" : "s"}`;
    default:
      return `${qty} ${kind}`;
  }
}
