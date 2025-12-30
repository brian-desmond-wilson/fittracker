import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from "react-native";
import { Star, Utensils } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { SavedFood, RecentFoodItem } from "@/src/types/track";

interface RecentFoodsRowProps {
  recentFoods: RecentFoodItem[];
  favorites: SavedFood[];
  onFoodPress: (food: SavedFood) => void;
  onFoodLongPress?: (food: SavedFood) => void;
  loading?: boolean;
}

export function RecentFoodsRow({
  recentFoods,
  favorites,
  onFoodPress,
  onFoodLongPress,
  loading,
}: RecentFoodsRowProps) {
  // Combine favorites first, then recent (excluding duplicates)
  const combinedFoods: SavedFood[] = [];
  const seenIds = new Set<string>();

  // Add favorites first
  favorites.forEach((food) => {
    if (!seenIds.has(food.id)) {
      combinedFoods.push(food);
      seenIds.add(food.id);
    }
  });

  // Add recent foods (excluding any that are already in favorites)
  recentFoods.forEach(({ savedFood }) => {
    if (!seenIds.has(savedFood.id)) {
      combinedFoods.push(savedFood);
      seenIds.add(savedFood.id);
    }
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Quick Add</Text>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (combinedFoods.length === 0) {
    return null; // Don't show section if no foods
  }

  const renderItem = ({ item }: { item: SavedFood }) => (
    <TouchableOpacity
      style={styles.foodItem}
      onPress={() => onFoodPress(item)}
      onLongPress={() => onFoodLongPress?.(item)}
      activeOpacity={0.7}
      delayLongPress={500}
    >
      {/* Image or Placeholder */}
      <View style={styles.imageContainer}>
        {item.image_primary_url ? (
          <Image
            source={{ uri: item.image_primary_url }}
            style={styles.foodImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Utensils size={20} color={colors.mutedForeground} />
          </View>
        )}
        {/* Favorite Star Badge */}
        {item.is_favorite && (
          <View style={styles.favoriteBadge}>
            <Star size={10} color="#FFFFFF" fill="#FFFFFF" />
          </View>
        )}
      </View>

      {/* Food Info */}
      <Text style={styles.foodName} numberOfLines={2}>
        {item.name}
      </Text>
      {item.calories && (
        <Text style={styles.foodCalories}>{item.calories} cal</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Quick Add</Text>
      <FlatList
        data={combinedFoods}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mutedForeground,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  separator: {
    width: 12,
  },
  loadingContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  foodItem: {
    width: 90,
    alignItems: "center",
  },
  imageContainer: {
    width: 70,
    height: 70,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
    position: "relative",
  },
  foodImage: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
  },
  foodName: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.foreground,
    textAlign: "center",
    lineHeight: 16,
  },
  foodCalories: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 2,
  },
});
