import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { FoodSubcategory } from "@/src/types/track";

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
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  pillSelected: {
    backgroundColor: "#E9D5FF",
    borderColor: "#C084FC",
  },
  pillText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  pillTextSelected: {
    color: "#7C3AED",
    fontWeight: "600",
  },
});
