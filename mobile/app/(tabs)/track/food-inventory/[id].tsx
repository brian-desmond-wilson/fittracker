import React, { useState, useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, View, Text, TouchableOpacity, StatusBar, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { ViewFoodDetailsScreen } from "@/src/components/track/ViewFoodDetailsScreen";
import { colors, icons, spacing } from "@/src/theme/tokens";
import { LoadingState } from "@/src/components/ui";
import {
  fetchInventoryWithState,
  type InventoryItemWithState,
} from "@/src/lib/supabase/inventory";
import { getLocalDateString } from "@/src/lib/dates";

export default function FoodItemDetailsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<InventoryItemWithState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItemDetails();
  }, [id]);

  const fetchItemDetails = async () => {
    try {
      setLoading(true);
      // One code path for every inventory read: fetch the whole list and pick
      // this item out of it. At current data volume (~25 rows) that costs
      // nothing, and it keeps the projection in exactly one place.
      const items = await fetchInventoryWithState(getLocalDateString());
      const found = items.find((it) => it.id === id);

      if (!found) {
        Alert.alert("Error", "Item not found");
        router.replace("/(tabs)/track/food-inventory");
        return;
      }

      setItem(found);
    } catch (error: any) {
      console.error("Error fetching item details:", error);
      Alert.alert("Error", "Failed to load item details");
      router.replace("/(tabs)/track/food-inventory");
    } finally {
      setLoading(false);
    }
  };

  if (loading || !item) {
    // Show loading state that matches the page structure
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.replace("/(tabs)/track/food-inventory")} style={styles.backButton}>
              <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>

          {/* Loading content area */}
          <LoadingState />
        </View>
      </>
    );
  }

  return (
    <ViewFoodDetailsScreen
      item={item}
      onClose={() => router.replace("/(tabs)/track/food-inventory")}
      onRefresh={fetchItemDetails}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  backText: {
    fontSize: 17,
    color: colors.text,
  },
});
