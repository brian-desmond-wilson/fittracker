import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { FoodSubcategory } from "@/src/types/track";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";

interface SubcategoryPillsProps {
  subcategories: FoodSubcategory[];
  selectedSubcategoryIds: string[];
  onToggleSubcategory: (subcategoryId: string) => void;
}

export function SubcategoryPills({
  subcategories,
  selectedSubcategoryIds,
  onToggleSubcategory,
}: SubcategoryPillsProps) {
  if (subcategories.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {subcategories.map((subcategory) => {
          const isSelected = selectedSubcategoryIds.includes(subcategory.id);

          return (
            <TouchableOpacity
              key={subcategory.id}
              style={[styles.pill, isSelected && styles.pillSelected]}
              onPress={() => onToggleSubcategory(subcategory.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                {subcategory.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenGutter,
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Selected filter is a control state — brand, not the inventory accent.
  pillSelected: {
    backgroundColor: tint(colors.brand),
    borderColor: colors.brand,
  },
  pillText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textMuted,
  },
  pillTextSelected: {
    color: colors.brand,
    fontWeight: "600",
  },
});
