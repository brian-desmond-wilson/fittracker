import React, { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, StatusBar, StyleSheet, ActivityIndicator, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Plus } from "lucide-react-native";
import { ViewFoodDetailsScreen } from "@/src/components/track/ViewFoodDetailsScreen";
import { FoodInventoryItemWithCategories } from "@/src/types/track";
import { ProductData } from "@/src/services/openFoodFactsApi";
import { AddEditFoodModal } from "@/src/components/track/AddEditFoodModal";

export default function FoodProductPreviewPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { productData: productDataString, barcode } = useLocalSearchParams<{ productData: string; barcode: string }>();
  const [showAddModal, setShowAddModal] = useState(false);

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
    setShowAddModal(true);
  };

  const handleModalSave = (newItemId: string) => {
    setShowAddModal(false);
    // Navigate to the newly created item's detail page
    router.replace(`/(tabs)/track/food-inventory/${newItemId}`);
  };

  const handleModalClose = () => {
    setShowAddModal(false);
  };

  return (
    <>
      <ViewFoodDetailsScreen
        item={previewItem}
        onClose={() => router.back()}
        isPreview={true}
        onAddToInventory={handleAddToInventory}
      />

      {/* Add to Inventory Modal */}
      <AddEditFoodModal
        visible={showAddModal}
        onClose={handleModalClose}
        onSave={handleModalSave}
        item={null}
        barcodeData={productData}
        barcode={barcode}
      />
    </>
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
