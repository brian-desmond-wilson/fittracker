import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Star } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { SavedFood, RecentFoodItem } from "@/src/types/track";

interface RecentFoodChipsProps {
  recentFoods: RecentFoodItem[];
  favorites: SavedFood[];
  onChipPress: (food: SavedFood) => void;
  maxItems?: number;
}

export function RecentFoodChips({
  recentFoods,
  favorites,
  onChipPress,
  maxItems = 5,
}: RecentFoodChipsProps) {
  // Combine favorites first, then recent (excluding duplicates)
  const combinedFoods: SavedFood[] = [];
  const seenIds = new Set<string>();

  // Add favorites first
  favorites.forEach((food) => {
    if (!seenIds.has(food.id) && combinedFoods.length < maxItems) {
      combinedFoods.push(food);
      seenIds.add(food.id);
    }
  });

  // Add recent foods (excluding any that are already in favorites)
  recentFoods.forEach(({ savedFood }) => {
    if (!seenIds.has(savedFood.id) && combinedFoods.length < maxItems) {
      combinedFoods.push(savedFood);
      seenIds.add(savedFood.id);
    }
  });

  if (combinedFoods.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Quick add from recent:</Text>
      <View style={styles.chipsContainer}>
        {combinedFoods.map((food) => (
          <TouchableOpacity
            key={food.id}
            style={styles.chip}
            onPress={() => onChipPress(food)}
            activeOpacity={0.7}
          >
            {food.is_favorite && (
              <Star
                size={12}
                color="#F59E0B"
                fill="#F59E0B"
                style={styles.starIcon}
              />
            )}
            <Text style={styles.chipText} numberOfLines={1}>
              {food.name}
            </Text>
            {food.calories && (
              <Text style={styles.chipCalories}>{food.calories}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 8,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    maxWidth: "48%",
  },
  starIcon: {
    marginRight: -2,
  },
  chipText: {
    fontSize: 13,
    color: colors.foreground,
    fontWeight: "500",
    flexShrink: 1,
  },
  chipCalories: {
    fontSize: 11,
    color: colors.mutedForeground,
  },
});
