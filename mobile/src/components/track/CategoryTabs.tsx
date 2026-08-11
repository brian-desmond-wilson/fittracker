import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { FoodCategory } from "@/src/types/track";
import { colors, spacing } from "@/src/theme/tokens";

interface CategoryTabsProps {
  categories: FoodCategory[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  /** A8: per-category item counts keyed by category id. A count on the tab is
   *  the scroll affordance the clipped labels never gave — a tab reading
   *  "Produce 1" tells you it's worth (or not worth) the horizontal trip. */
  countsByCategoryId?: Map<string, number>;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function CategoryTabs({
  categories,
  selectedCategoryId,
  onSelectCategory,
  countsByCategoryId,
}: CategoryTabsProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  // Auto-scroll to selected tab when it changes
  useEffect(() => {
    if (selectedCategoryId && scrollViewRef.current) {
      const selectedIndex = categories.findIndex(cat => cat.id === selectedCategoryId);
      if (selectedIndex >= 0) {
        // Scroll the selected tab into view (approximate positioning)
        const scrollX = selectedIndex * 120 - SCREEN_WIDTH / 2 + 60;
        scrollViewRef.current.scrollTo({ x: Math.max(0, scrollX), animated: true });
      }
    }
  }, [selectedCategoryId, categories]);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {categories.map((category) => {
          const isSelected = category.id === selectedCategoryId;

          return (
            <TouchableOpacity
              key={category.id}
              style={styles.tabContainer}
              onPress={() => onSelectCategory(category.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
                {category.name}
                {countsByCategoryId?.has(category.id)
                  ? `  ${countsByCategoryId.get(category.id)}`
                  : ""}
              </Text>
              {isSelected && <View style={styles.indicator} />}
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  tabContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    position: "relative",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.textMuted,
  },
  tabTextActive: {
    fontWeight: "600",
    color: colors.text,
  },
  // Active tab underline is a control state, so it is brand — not the
  // inventory accent (spec §6).
  indicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.brand,
  },
});
