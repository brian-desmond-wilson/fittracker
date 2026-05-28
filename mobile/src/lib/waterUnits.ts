export type WaterUnit = "oz" | "L";

export const OZ_PER_LITER = 33.814;

export function ozToLiters(oz: number): number {
  return oz / OZ_PER_LITER;
}

export function litersToOz(L: number): number {
  return L * OZ_PER_LITER;
}

/**
 * Format an oz value for display in the user's preferred unit.
 * Used for current amounts (1 decimal oz, 2 decimal L).
 */
export function formatVolume(oz: number, unit: WaterUnit): string {
  if (unit === "oz") return `${oz.toFixed(1)} oz`;
  return `${ozToLiters(oz).toFixed(2)} L`;
}

/**
 * Format an oz value as a "goal" — integer oz, 2-decimal L.
 */
export function formatGoal(oz: number, unit: WaterUnit): string {
  if (unit === "oz") return `${Math.round(oz)} oz`;
  return `${ozToLiters(oz).toFixed(2)} L`;
}

/**
 * Format an oz value as an integer amount (no decimals on oz).
 * Useful for quick-add labels and "drink X" suggestions.
 */
export function formatAmount(oz: number, unit: WaterUnit): string {
  if (unit === "oz") return `${Math.round(oz)} oz`;
  // For sub-1L amounts in metric, show mL precision
  if (oz < OZ_PER_LITER) {
    const ml = Math.round((oz / OZ_PER_LITER) * 1000);
    return `${ml} mL`;
  }
  return `${ozToLiters(oz).toFixed(2)} L`;
}

export const BEVERAGE_TYPES = ["water", "coffee", "tea", "juice", "other"] as const;
export type BeverageType = (typeof BEVERAGE_TYPES)[number];

export function beverageLabel(type: BeverageType): string {
  switch (type) {
    case "water":
      return "Water";
    case "coffee":
      return "Coffee";
    case "tea":
      return "Tea";
    case "juice":
      return "Juice";
    case "other":
      return "Other";
  }
}

/**
 * Per-beverage tint color used in badges throughout the UI.
 */
export function beverageColor(type: BeverageType): string {
  switch (type) {
    case "water":
      return "#3B82F6"; // blue
    case "coffee":
      return "#92400E"; // brown
    case "tea":
      return "#15803D"; // green
    case "juice":
      return "#F59E0B"; // amber
    case "other":
      return "#6B7280"; // gray
  }
}
