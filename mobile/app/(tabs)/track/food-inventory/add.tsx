import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, StatusBar, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { EditFoodScreen } from "@/src/components/track/EditFoodScreen";
import { FoodInventoryItemWithCategories } from "@/src/types/track";
import { ProductData } from "@/src/services/openFoodFactsApi";

export default function AddFoodItemPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { productData: productDataString, barcode } = useLocalSearchParams<{ productData?: string; barcode?: string }>();

  // For barcode scanned items, create a preview item with the data
  let barcodeData: ProductData | undefined;
  let barcodeValue: string | undefined;

  if (productDataString && barcode) {
    barcodeData = JSON.parse(productDataString);
    barcodeValue = barcode;
  }

  // Create a new empty item for adding
  const newItem: FoodInventoryItemWithCategories = {
    id: "new",
    user_id: "new",
    name: barcodeData?.name || "",
    brand: barcodeData?.brand || null,
    flavor: null,
    barcode: barcodeValue || null,
    storage_type: "single-location",
    location: null,
    quantity: 0,
    unit: "count",
    restock_threshold: 0,
    fridge_restock_threshold: null,
    total_restock_threshold: null,
    requires_refrigeration: false,
    calories: barcodeData?.calories || null,
    protein: barcodeData?.protein || null,
    carbs: barcodeData?.carbs || null,
    fats: barcodeData?.fats || null,
    sugars: barcodeData?.sugars || null,
    serving_size: barcodeData?.servingSize || null,
    image_primary_url: barcodeData?.imagePrimaryUrl || null,
    image_front_url: barcodeData?.imageFrontUrl || null,
    image_back_url: barcodeData?.imageBackUrl || null,
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

  const handleSave = (newItemId: string) => {
    // Navigate to the newly created item's detail page
    router.replace(`/(tabs)/track/food-inventory/${newItemId}`);
  };

  const handleClose = () => {
    router.back();
  };

  return (
    <EditFoodScreen
      item={newItem}
      onClose={handleClose}
      onSave={handleSave}
      isNew={true}
    />
  );
}
