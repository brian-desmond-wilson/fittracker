import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, StatusBar, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { ViewFoodDetailsScreen } from "@/src/components/track/ViewFoodDetailsScreen";
import { FoodInventoryItemWithCategories } from "@/src/types/track";
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
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ChevronLeft size={24} color="#FFFFFF" />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.errorContent}>
            <Text style={styles.errorText}>Missing product data</Text>
          </View>
        </View>
      </>
    );
  }

  const productData: ProductData = JSON.parse(productDataString);

  // Convert ProductData to FoodInventoryItemWithCategories format for preview
  const previewItem: FoodInventoryItemWithCategories = {
    id: "preview",
    user_id: "preview",
    name: productData.name,
    brand: productData.brand,
    flavor: null,
    barcode: barcode,
    storage_type: "single-location",
    location: null,
    quantity: 0,
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
    serving_size: productData.servingSize,
    image_primary_url: productData.imagePrimaryUrl,
    image_front_url: productData.imageFrontUrl,
    image_back_url: productData.imageBackUrl,
    image_side_url: null,
    expiration_date: null,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    locations: [],
    total_quantity: 0,
    ready_quantity: 0,
    storage_quantity: 0,
    categories: [],
    subcategories: [],
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
      onClose={() => router.back()}
      isPreview={true}
      onAddToInventory={handleAddToInventory}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0F1E",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: "#FFFFFF",
  },
  errorContent: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    color: "#6B7280",
  },
});
