// Where this meal is filed — one line, scrolling, never wrapping.
//
// A meal used to hold exactly one category, which decided both which shelf it
// stood on and which eating window would ever suggest it. A meal you would eat
// for lunch or dinner had to pick, and was invisible to the other window for
// good. Tapping here writes straight through: it is one tap, and it changes
// where the meal is found, so making it a trip to the Edit page would cost
// more than the edit is worth.
//
// A rail rather than a wrapping row: wrapping makes the card's height depend on
// how many categories a meal happens to hold, which moves everything below it.
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import {
  CATEGORY_CHIP_LABELS, CATEGORY_PICKER_ORDER, EXCLUSIVE_CATEGORY,
  type MealCategory,
} from "@/src/types/meal-library";

interface CategoryRailProps {
  selected: MealCategory[];
  /** The head of `selected` — marked, because it decides the logging slot. */
  primary: MealCategory;
  onToggle: (category: MealCategory) => void;
  busy?: boolean;
}

function CategoryRailInner({ selected, primary, onToggle, busy = false }: CategoryRailProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A horizontal scroller in a growing container stretches to whatever
      // height is spare; it should be exactly as tall as its chips.
      style={s.scroller}
      contentContainerStyle={s.row}
    >
      {CATEGORY_PICKER_ORDER.map((category) => {
        const on = selected.includes(category);
        const isPrimary = on && category === primary;
        return (
          <TouchableOpacity
            key={category}
            style={[s.chip, on && s.chipOn, busy && s.busy]}
            onPress={() => onToggle(category)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: busy }}
            accessibilityLabel={
              isPrimary
                ? `${CATEGORY_CHIP_LABELS[category]}, filed here and the default slot`
                : `${CATEGORY_CHIP_LABELS[category]}, ${on ? "filed here" : "not filed here"}`
            }
          >
            <Text style={[s.text, on && s.textOn]}>
              {CATEGORY_CHIP_LABELS[category]}
            </Text>
            {/* The primary is marked rather than given its own control: it is
                the head of the set, and the set is what you are picking. */}
            {isPrimary && <View style={s.primaryDot} />}
            {category === EXCLUSIVE_CATEGORY && !on && <View style={s.exclusiveEdge} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export const CategoryRail = React.memo(CategoryRailInner);

const s = StyleSheet.create({
  scroller: { flexGrow: 0 },
  row: { flexDirection: "row", gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  busy: { opacity: 0.5 },
  text: { ...typography.body, color: colors.textMuted },
  textOn: { color: colors.onBrand, fontWeight: "600" },
  primaryDot: {
    width: 5, height: 5, borderRadius: radii.pill,
    backgroundColor: colors.onBrand,
  },
  // Emergency Calories is held alone; the dashed edge says it belongs to a
  // different kind of choice before you find that out by tapping it.
  exclusiveEdge: {
    width: 5, height: 5, borderRadius: radii.pill,
    backgroundColor: tint(colors.danger, 0.6),
  },
});
