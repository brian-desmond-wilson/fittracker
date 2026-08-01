import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Utensils,
  Droplets,
  Package,
  Scale,
  Ruler,
  Camera,
  Dumbbell,
  ShoppingCart,
} from "lucide-react-native";
import { TrackingCard } from "@/src/components/track/TrackingCard";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { TrackingCategoryConfig, TrackingCategory } from "@/src/types/track";

export default function Track() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Category configuration with prioritized ordering
  const trackingCategories: TrackingCategoryConfig[] = [
    // Nutrition & Food Section
    {
      id: "meals",
      title: "Meals & Snacks",
      icon: "Utensils",
      accent: "meals",
      section: "nutrition",
    },
    {
      id: "water",
      title: "Water",
      icon: "Droplets",
      accent: "water",
      section: "nutrition",
    },
    {
      id: "food-inventory",
      title: "Food Inventory",
      icon: "Package",
      accent: "inventory",
      section: "nutrition",
    },
    {
      id: "shopping",
      title: "Shopping List",
      icon: "ShoppingCart",
      accent: "shopping",
      section: "nutrition",
    },
    // Body & Measurements Section
    {
      id: "weight",
      title: "Weight",
      icon: "Scale",
      accent: "brand",
      section: "body",
    },
    {
      id: "measurements",
      title: "Measurements",
      icon: "Ruler",
      accent: "measurements",
      section: "body",
    },
    {
      id: "photos",
      title: "Progress Photos",
      icon: "Camera",
      accent: "photos",
      section: "body",
    },
    // Activity & Recovery Section
    {
      id: "workouts",
      title: "Workouts",
      icon: "Dumbbell",
      accent: "workouts",
      section: "activity",
    },
  ];

  const iconMap: Record<string, any> = {
    Utensils,
    Droplets,
    Package,
    Scale,
    Ruler,
    Camera,
    Dumbbell,
    ShoppingCart,
  };

  const handleCardPress = (categoryId: TrackingCategory) => {
    // Workouts are logged in the Training tab — send users there rather than
    // to a placeholder screen.
    if (categoryId === "workouts") {
      router.push("/(tabs)/training");
      return;
    }
    router.push(`/(tabs)/track/${categoryId}`);
  };

  const nutritionCategories = trackingCategories.filter((c) => c.section === "nutrition");
  const bodyCategories = trackingCategories.filter((c) => c.section === "body");
  const activityCategories = trackingCategories.filter((c) => c.section === "activity");

  const renderCategoryGrid = (categories: TrackingCategoryConfig[]) => {
    const rows: TrackingCategoryConfig[][] = [];
    for (let i = 0; i < categories.length; i += 2) {
      rows.push(categories.slice(i, i + 2));
    }

    return rows.map((row, rowIndex) => (
      <View key={rowIndex} style={styles.row}>
        {row.map((category) => (
          <TrackingCard
            key={category.id}
            title={category.title}
            icon={iconMap[category.icon]}
            accent={category.accent}
            onPress={() => handleCardPress(category.id)}
          />
        ))}
        {/* Add empty spacer if odd number in row */}
        {row.length === 1 && <View style={styles.cardSpacer} />}
      </View>
    ));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Track</Text>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Nutrition & Food Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NUTRITION & FOOD</Text>
          {renderCategoryGrid(nutritionCategories)}
        </View>

        {/* Body & Measurements Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BODY & MEASUREMENTS</Text>
          {renderCategoryGrid(bodyCategories)}
        </View>

        {/* Activity & Recovery Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACTIVITY & RECOVERY</Text>
          {renderCategoryGrid(activityCategories)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.titleRoot,
    color: colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.xxl,
  },
  section: {
    marginBottom: spacing.xxxl,
  },
  sectionTitle: {
    ...typography.section,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardSpacer: {
    flex: 1,
  },
});
