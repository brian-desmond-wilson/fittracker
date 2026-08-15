import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Utensils,
  BookOpen,
  Droplets,
  Package,
  Scale,
  Ruler,
  Camera,
  Dumbbell,
  ShoppingCart,
  Truck,
  RefreshCw,
  ChevronRight,
} from "lucide-react-native";
import { TrackingCard } from "@/src/components/track/TrackingCard";
import { Card } from "@/src/components/ui";
import { fetchPendingDeliveries } from "@/src/lib/supabase/preparedMeals";
import { formatArrivalShort } from "@/src/lib/dates";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { TrackingCategoryConfig, TrackingCategory } from "@/src/types/track";

export default function Track() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // The one live thing on this screen. A delivery is the only station whose
  // state is a DATE — you cannot infer "a box comes Sunday" from anything on
  // the hub, and by the time you have opened the page to check, the caption has
  // already done its job. Every other tile's state is a count you can read on
  // arrival, which is why none of them carries one.
  //
  // Strictly decoration: a failed fetch leaves the tile exactly as it was
  // before captions existed, never an error where a subtitle goes.
  const [nextDelivery, setNextDelivery] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const rows = await fetchPendingDeliveries();
          if (cancelled) return;
          // Future arrivals only. A box whose moment has passed is due, not
          // coming — it becomes inventory on the next read of the inventory or
          // the Deliveries page — and "Today 2:00 PM" on a tile at three
          // o'clock reads as a promise the app has already broken. The hub
          // deliberately does not materialise it itself: a tile caption is no
          // reason for this screen to start writing.
          const soonest = rows.find((r) => new Date(r.arrivesAt).getTime() > Date.now());
          setNextDelivery(
            soonest
              ? `${soonest.mealCount} ${soonest.mealCount === 1 ? "meal" : "meals"} · ${formatArrivalShort(soonest.arrivesAt)}`
              : null,
          );
        } catch (e) {
          console.error("next delivery caption fetch failed:", e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Category configuration with prioritized ordering
  const trackingCategories: TrackingCategoryConfig[] = [
    // Nutrition & Food Section — ordered along the loop the section describes,
    // starting at the supply end: what you still need to buy, what is on its
    // way, what you have, what you can make of it, when you eat it, and water.
    // Shopping List and Deliveries lead as the same half of the loop — food you
    // do not have yet, one lot ordered and one lot not.
    {
      id: "shopping",
      title: "Shopping List",
      icon: "ShoppingCart",
      accent: "shopping",
      section: "nutrition",
    },
    {
      id: "deliveries",
      title: "Deliveries",
      icon: "Truck",
      accent: "deliveries",
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
      id: "meal-library",
      title: "Meal Library",
      icon: "BookOpen",
      accent: "mealLibrary",
      section: "nutrition",
    },
    {
      id: "fuel",
      title: "Fuel Schedule",
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
    BookOpen,
    Droplets,
    Package,
    Scale,
    Ruler,
    Camera,
    Dumbbell,
    ShoppingCart,
    Truck,
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
            caption={category.id === "deliveries" ? nextDelivery : null}
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
          {/* STATIC BY DESIGN (spec §7): no fetch, no badge, no live data.
              Spec §2 lists "no live badge on the Track-hub entry" as an
              explicit non-goal — the loop's state is the hub screen's job, and
              this entry is only the door to it. That ruling is about THIS row
              and still holds; the screen is no longer fetch-free (the
              Deliveries tile carries a next-arrival caption), which is why it
              is worth saying that a fetch existing nearby is not an argument
              for adding one here. Deliberately NOT a `TrackingCategory` tile
              either: it is a full-width entry that pushes the route directly,
              so `trackingCategories`, `iconMap` and `handleCardPress` stay
              untouched. */}
          <Card
            variant="row"
            onPress={() => router.push("/(tabs)/track/loop")}
            style={styles.loopEntry}
          >
            <View style={styles.loopEntryLine}>
              <View style={styles.loopIcon}>
                <RefreshCw size={18} color={colors.brand} strokeWidth={icons.strokeWidth} />
              </View>
              <View style={styles.loopText}>
                <Text style={styles.loopTitle}>Nutrition Loop</Text>
                <Text style={styles.loopSub}>Inventory → Meals → Shopping → back ↺</Text>
              </View>
              <ChevronRight size={icons.md} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
            </View>
          </Card>
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
  // Mirrors `StationRow`'s line geometry (34pt tinted pill, 18pt glyph,
  // rowTitle + caption block, faint chevron) so the entry reads as the same
  // family as the rows it leads to.
  loopEntry: { marginBottom: spacing.lg },
  loopEntryLine: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  loopIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: tint(colors.brand),
    alignItems: "center",
    justifyContent: "center",
  },
  loopText: { flex: 1 },
  loopTitle: { ...typography.rowTitle, color: colors.text },
  loopSub: { ...typography.caption, marginTop: 1 },
});
