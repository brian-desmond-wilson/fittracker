import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Utensils,
  Droplets,
  Package,
  Scale,
  Ruler,
  Camera,
  Dumbbell,
  Moon,
} from "lucide-react-native";
import { TrackingCard } from "@/src/components/track/TrackingCard";
import { WaterScreen } from "@/src/components/track/WaterScreen";
import { WeightScreen } from "@/src/components/track/WeightScreen";
import { SleepScreen } from "@/src/components/track/SleepScreen";
import { FoodInventoryScreen } from "@/src/components/track/FoodInventoryScreen";
import { MeasurementsScreen } from "@/src/components/track/MeasurementsScreen";
import { ProgressPhotosScreen } from "@/src/components/track/ProgressPhotosScreen";
import { MealsScreen } from "@/src/components/track/MealsScreen";
import { colors } from "@/src/lib/colors";
import { TrackingCategoryConfig, TrackingCategory } from "@/src/types/track";

export default function Track() {
  const [activeModal, setActiveModal] = useState<TrackingCategory | null>(null);

  // Category configuration with prioritized ordering
  const trackingCategories: TrackingCategoryConfig[] = [
    // Nutrition & Food Section
    {
      id: "meals",
      title: "Meals & Snacks",
      icon: "Utensils",
      iconColor: "#F97316",
      backgroundColor: "rgba(249, 115, 22, 0.15)",
      section: "nutrition",
    },
    {
      id: "water",
      title: "Water",
      icon: "Droplets",
      iconColor: "#3B82F6",
      backgroundColor: "rgba(59, 130, 246, 0.15)",
      section: "nutrition",
    },
    {
      id: "food-inventory",
      title: "Food Inventory",
      icon: "Package",
      iconColor: "#8B5CF6",
      backgroundColor: "rgba(139, 92, 246, 0.15)",
      section: "nutrition",
    },
    // Body & Measurements Section
    {
      id: "weight",
      title: "Weight",
      icon: "Scale",
      iconColor: "#22C55E",
      backgroundColor: "rgba(34, 197, 94, 0.15)",
      section: "body",
    },
    {
      id: "measurements",
      title: "Measurements",
      icon: "Ruler",
      iconColor: "#EC4899",
      backgroundColor: "rgba(236, 72, 153, 0.15)",
      section: "body",
    },
    {
      id: "photos",
      title: "Progress Photos",
      icon: "Camera",
      iconColor: "#F59E0B",
      backgroundColor: "rgba(245, 158, 11, 0.15)",
      section: "body",
    },
    // Activity & Recovery Section
    {
      id: "workouts",
      title: "Workouts",
      icon: "Dumbbell",
      iconColor: "#EF4444",
      backgroundColor: "rgba(239, 68, 68, 0.15)",
      section: "activity",
    },
    {
      id: "sleep",
      title: "Sleep",
      icon: "Moon",
      iconColor: "#6366F1",
      backgroundColor: "rgba(99, 102, 241, 0.15)",
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
    Moon,
  };

  const handleCardPress = (categoryId: TrackingCategory) => {
    setActiveModal(categoryId);
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
            iconColor={category.iconColor}
            backgroundColor={category.backgroundColor}
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
        contentContainerStyle={styles.scrollContent}
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

        {/* Bottom Spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Water Modal */}
      <Modal
        visible={activeModal === "water"}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setActiveModal(null)}
      >
        <WaterScreen onClose={() => setActiveModal(null)} />
      </Modal>

      {/* Weight Modal */}
      <Modal
        visible={activeModal === "weight"}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setActiveModal(null)}
      >
        <WeightScreen onClose={() => setActiveModal(null)} />
      </Modal>

      {/* Sleep Modal */}
      <Modal
        visible={activeModal === "sleep"}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setActiveModal(null)}
      >
        <SleepScreen onClose={() => setActiveModal(null)} />
      </Modal>

      {/* Food Inventory Modal */}
      <Modal
        visible={activeModal === "food-inventory"}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setActiveModal(null)}
      >
        <FoodInventoryScreen onClose={() => setActiveModal(null)} />
      </Modal>

      {/* Measurements Modal */}
      <Modal
        visible={activeModal === "measurements"}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setActiveModal(null)}
      >
        <MeasurementsScreen onClose={() => setActiveModal(null)} />
      </Modal>

      {/* Progress Photos Modal */}
      <Modal
        visible={activeModal === "photos"}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setActiveModal(null)}
      >
        <ProgressPhotosScreen onClose={() => setActiveModal(null)} />
      </Modal>

      {/* Meals Modal */}
      <Modal
        visible={activeModal === "meals"}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setActiveModal(null)}
      >
        <MealsScreen onClose={() => setActiveModal(null)} />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: colors.foreground,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedForeground,
    letterSpacing: 1,
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  cardSpacer: {
    flex: 1,
  },
});
