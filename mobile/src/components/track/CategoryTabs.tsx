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

interface CategoryTabsProps {
  categories: FoodCategory[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function CategoryTabs({
  categories,
  selectedCategoryId,
  onSelectCategory,
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
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  tabContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: "relative",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabTextActive: {
    fontWeight: "600",
    color: "#111827",
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#8B5CF6",
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});
