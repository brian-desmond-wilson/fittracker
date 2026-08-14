// Food Inventory's category filter — the shared `TabBand` fed by the
// category rows the screen already holds.
import React, { useMemo } from "react";
import { FoodCategory } from "@/src/types/track";
import { TabBand } from "@/src/components/ui";

interface CategoryTabsProps {
  categories: FoodCategory[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  /** A8: per-category item counts keyed by category id. A count on the tab is
   *  the scroll affordance the clipped labels never gave — a tab reading
   *  "Produce 1" tells you it's worth (or not worth) the horizontal trip. */
  countsByCategoryId?: Map<string, number>;
}

export function CategoryTabs({
  categories,
  selectedCategoryId,
  onSelectCategory,
  countsByCategoryId,
}: CategoryTabsProps) {
  const items = useMemo(
    () =>
      categories.map((category) => ({
        key: category.id,
        label: category.name,
        count: countsByCategoryId?.get(category.id),
      })),
    [categories, countsByCategoryId],
  );

  return (
    <TabBand
      items={items}
      selectedKey={selectedCategoryId}
      onSelect={onSelectCategory}
      countNoun="items"
    />
  );
}
