// The words you have already used.
//
// Brand and flavor were free text, which is how one shop ends up recorded as
// "Kirkland", "Kirkland Signature" and "KIRKLAND" — three brands that never
// group, and a concept graph that cannot see they are the same maker. The
// pickers built on this make the existing spelling the default and typing a
// new one a deliberate act.
import { supabase } from "../supabase";

export interface BrandOption {
  name: string;
  /** How many inventory rows carry it — a one-off is usually a typo. */
  count: number;
}

export interface InventoryVocab {
  brands: BrandOption[];
  /** Lowercased brand -> the varieties recorded under it. */
  flavorsByBrand: Map<string, string[]>;
  /** Every variety seen, for items with no brand chosen yet. */
  allFlavors: string[];
}

export async function fetchInventoryVocab(): Promise<InventoryVocab> {
  const { data, error } = await supabase
    .from("food_inventory")
    .select("brand, flavor");
  if (error) throw error;

  const rows = (data ?? []) as Array<{ brand: string | null; flavor: string | null }>;

  const brandCounts = new Map<string, { name: string; count: number }>();
  const flavorsByBrand = new Map<string, Set<string>>();
  const allFlavors = new Set<string>();

  for (const row of rows) {
    const brand = (row.brand ?? "").trim();
    const flavor = (row.flavor ?? "").trim();

    if (brand.length > 0) {
      // Keyed case-insensitively so near-duplicates collapse into one option,
      // but the FIRST spelling seen is what gets offered — inventing a
      // canonical casing would be a different edit than the user asked for.
      const key = brand.toLowerCase();
      const existing = brandCounts.get(key);
      if (existing) existing.count += 1;
      else brandCounts.set(key, { name: brand, count: 1 });
    }

    if (flavor.length > 0) {
      allFlavors.add(flavor);
      const key = brand.toLowerCase();
      if (key.length > 0) {
        const set = flavorsByBrand.get(key) ?? new Set<string>();
        set.add(flavor);
        flavorsByBrand.set(key, set);
      }
    }
  }

  return {
    // Commonest first: the brand you use most is the one you are most likely
    // to be typing, and a count of 1 beside an option is a visible typo.
    brands: [...brandCounts.values()].sort((a, b) =>
      b.count !== a.count ? b.count - a.count : a.name.localeCompare(b.name),
    ),
    flavorsByBrand: new Map(
      [...flavorsByBrand].map(([k, v]) => [k, [...v].sort((a, b) => a.localeCompare(b))]),
    ),
    allFlavors: [...allFlavors].sort((a, b) => a.localeCompare(b)),
  };
}

