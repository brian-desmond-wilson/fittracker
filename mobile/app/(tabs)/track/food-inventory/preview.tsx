import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, StatusBar, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { ViewFoodDetailsScreen } from "@/src/components/track/ViewFoodDetailsScreen";
import { colors, icons, spacing } from "@/src/theme/tokens";
import { EmptyState } from "@/src/components/ui";
import type { InventoryItemWithState } from "@/src/lib/supabase/inventory";
import { projectItemStock } from "@/src/lib/stockState";
import { getLocalDateString } from "@/src/lib/dates";
import { ProductData } from "@/src/services/openFoodFactsApi";

export default function FoodProductPreviewPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { productData: productDataString, barcode } = useLocalSearchParams<{ productData: string; barcode: string }>();

  if (!productDataString || !barcode) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() =>
                // `replace` animates as a push, so it is wrong for Back.
                router.canGoBack() ? router.back() : router.replace("/(tabs)/track/food-inventory")
              }
              style={styles.backButton}
            >
              <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
          <EmptyState title="Missing product data" />
        </View>
      </>
    );
  }

  const productData: ProductData = JSON.parse(productDataString);

  // Convert ProductData to inventory-item format for preview
  const previewItemFields: Omit<InventoryItemWithState, "state"> = {
    id: "preview",
    user_id: "preview",
    quantity: 0,
    location: null,
    name: productData.name,
    brand: productData.brand,
    flavor: null,
    barcode: barcode,
    storage_type: "single-location",
    unit: "count",
    restock_threshold: 0,
    fridge_restock_threshold: null,
    total_restock_threshold: null,
    requires_refrigeration: false,
    calories: productData.calories,
    protein: productData.protein,
    carbs: productData.carbs,
    fats: productData.fats,
    sugars: productData.sugars,
    fiber_g: null,
    is_scheduled_supply: false,
    serving_size: productData.servingSize,
    image_primary_url: productData.imagePrimaryUrl,
    image_front_url: productData.imageFrontUrl,
    image_back_url: productData.imageBackUrl,
    image_side_url: null,
    expiration_date: null,
    notes: null,
    preferred_vendor_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_verified_at: null,
    locations: [],
    categories: [],
    subcategories: [],
  };

  // Run the real projection over zero locations rather than hand-writing an
  // ItemStockState literal that could drift from projectItemStock.
  const previewItem: InventoryItemWithState = {
    ...previewItemFields,
    state: projectItemStock({
      item: previewItemFields,
      locations: [],
      todayLocalDate: getLocalDateString(),
    }),
  };

  const handleAddToInventory = () => {
    // Navigate to the add page with barcode data
    router.push({
      pathname: "/(tabs)/track/food-inventory/add" as any,
      params: {
        productData: productDataString,
        barcode: barcode,
      },
    });
  };

  return (
    <ViewFoodDetailsScreen
      item={previewItem}
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/(tabs)/track/food-inventory")
      }
      isPreview={true}
      onAddToInventory={handleAddToInventory}
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
