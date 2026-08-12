import React from "react";
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from "react-native";
import { Star } from "lucide-react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { SavedFood, RecentFoodItem } from "@/src/types/track";
import { monogram } from "@/src/lib/vendorMonogram";

// Badge-fitted glyph size. `icons.sm` (16) would fill an 18pt badge edge to
// edge; the badge in turn cannot grow without dominating a 70pt thumbnail.
// Same class of held value as `MacroRing`'s ring-fitted label sizes.
const BADGE_GLYPH = 10;

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

  // B9. A case of water led the FOOD quick-add row while the app has a whole
  // Water station of its own, pushing a real food off the visible end.
  // Excluded on `=== 0` and never on falsiness: a saved food whose calories
  // were never recorded is `null`, which means unknown, not zero, and hiding
  // those would quietly shrink the row for the opposite reason.
  const carriesCalories = (food: SavedFood) => food.calories !== 0;

  // Add favorites first
  favorites.forEach((food) => {
    if (!seenIds.has(food.id) && carriesCalories(food)) {
      combinedFoods.push(food);
      seenIds.add(food.id);
    }
  });

  // Add recent foods (excluding any that are already in favorites)
  recentFoods.forEach(({ savedFood }) => {
    if (!seenIds.has(savedFood.id) && carriesCalories(savedFood)) {
      combinedFoods.push(savedFood);
      seenIds.add(savedFood.id);
    }
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Quick Add</Text>
        <View style={styles.loadingContainer}>
          {/* Inline region inside the screen's scroller, not a full list
              region — a bare spinner, per the standing loading rule. */}
          <ActivityIndicator color={colors.brand} />
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
          // A5. A generic fork glyph on three of four tiles told you nothing
          // and made the row look broken. The food's own initials at least
          // distinguish one tile from the next — the same fallback the vendor
          // tiles use when a logo fails to load.
          <View style={styles.imagePlaceholder}>
            <Text style={styles.monogram}>{monogram(item.name)}</Text>
          </View>
        )}
        {/* Favorite Star Badge */}
        {item.is_favorite && (
          <View style={styles.favoriteBadge}>
            <Star size={BADGE_GLYPH} color={colors.onBrand} fill={colors.onBrand} />
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
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.section,
    paddingHorizontal: spacing.screenGutter,
    marginBottom: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.screenGutter,
  },
  separator: {
    width: spacing.md,
  },
  loadingContainer: {
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.xl,
  },
  foodItem: {
    // A6. 90pt clipped "Instant Oatmeal, pre…" even across two lines. Wider
    // tiles rather than a third line: the row scrolls horizontally, so length
    // costs nothing but a little more swiping.
    width: 104,
    alignItems: "center",
  },
  monogram: { ...typography.titleBar, color: colors.textFaint },
  imageContainer: {
    width: 70,
    height: 70,
    borderRadius: radii.row,
    overflow: "hidden",
    marginBottom: spacing.sm,
    position: "relative",
  },
  foodImage: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.row,
    alignItems: "center",
    justifyContent: "center",
  },
  // A conditional state indicator overlaid on the thumbnail, NOT a control:
  // the long-press toggle belongs to the whole tile and this badge is not its
  // hit target. Amber matches the favourite star in `FoodPreviewModal`.
  favoriteBadge: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  foodName: {
    ...typography.caption,
    fontWeight: "500",
    color: colors.text,
    textAlign: "center",
    lineHeight: 16,
  },
  foodCalories: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
});
